// ============================================================================
// PROJECT ZULFIQAR — Stripe webhook (Supabase Edge Function)
// ----------------------------------------------------------------------------
// Stripe calls this after every completed Payment Link checkout. It records
// the payment against the right boy and month so it shows in the portal,
// and marks it refunded if it is later fully refunded in Stripe.
//
// The portal opens each Payment Link with
//     ?client_reference_id=<student uuid>_<YYYY-MM>
// so this function knows who paid and for which month. Whether it was a
// session or a monthly payment is read from the amount.
//
// Deploy:   supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets:  supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_...
//           (optional) MONTH_PENCE=5000
// ============================================================================
import Stripe from "npm:stripe@16.12.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const crypto = Stripe.createSubtleCryptoProvider();
const monthPence = Number(Deno.env.get("MONTH_PENCE") ?? 5000);

// Service role: bypasses row-level security. Supabase injects both variables.
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await req.text(), signature, Deno.env.get("STRIPE_WEBHOOK_SECRET")!, undefined, crypto,
    );
  } catch (err) {
    return new Response(`Bad signature: ${(err as Error).message}`, { status: 400 });
  }

  // A refund in Stripe marks the matching payment as refunded in the portal.
  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    if (!charge.refunded || typeof charge.payment_intent !== "string") return new Response("partial or unknown refund");
    const sessions = await stripe.checkout.sessions.list({ payment_intent: charge.payment_intent, limit: 1 });
    const checkout = sessions.data[0];
    if (!checkout) return new Response("no checkout for this charge");
    const { error } = await db.from("payments").update({ status: "refunded" }).eq("stripe_session_id", checkout.id);
    if (error) {
      console.error(error);
      return new Response("db error", { status: 500 }); // Stripe will retry
    }
    return new Response("refunded");
  }

  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return new Response("ignored");
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") return new Response("not paid yet");

  const [studentId, period] = (session.client_reference_id ?? "").split("_");
  if (!studentId || !/^\d{4}-\d{2}$/.test(period ?? "")) {
    // Paid through the link without going via the portal — record it by hand.
    console.warn("Checkout without a portal reference", session.id);
    return new Response("no reference");
  }

  const { data: student, error } = await db.from("students").select("id, family_id").eq("id", studentId).maybeSingle();
  if (error || !student) {
    console.error("Unknown student", studentId, error);
    return new Response("unknown student");
  }

  const amount = session.amount_total ?? 0;
  const { error: insertError } = await db.from("payments").upsert({
    family_id: student.family_id,
    student_id: student.id,
    kind: amount >= monthPence ? "month" : "session",
    period,
    amount_pence: amount,
    method: "stripe",
    status: "paid",
    stripe_session_id: session.id,
  }, { onConflict: "stripe_session_id" });

  if (insertError) {
    console.error(insertError);
    return new Response("db error", { status: 500 }); // Stripe will retry
  }
  return new Response("ok");
});
