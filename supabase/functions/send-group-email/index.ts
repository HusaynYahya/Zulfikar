// Sends a coach's group email (BCC to parents) from the programme's Gmail.
// Secrets (Supabase dashboard → Edge Functions → Secrets):
//   GMAIL_USER          the Gmail address to send from
//   GMAIL_APP_PASSWORD  a Google "app password" for that account
// Only a signed-in coach can call it, and only parent emails already in the
// portal can be recipients.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import nodemailer from "npm:nodemailer@6.9.14";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const user = Deno.env.get("GMAIL_USER"), pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!user || !pass) return json({ error: "not_configured", message: "Email sending isn't set up yet." }, 503);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return json({ error: "Please sign in again." }, 401);
  const { data: me } = await sb.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (me?.role !== "coach") return json({ error: "Only coaches can send group emails." }, 403);

  let input: { to?: string[]; subject?: string; body?: string };
  try { input = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const subject = String(input.subject ?? "").trim().slice(0, 200);
  const body = String(input.body ?? "").trim().slice(0, 10000);
  if (!subject || !body) return json({ error: "Add a subject and a message." }, 400);

  // only addresses of families registered in the portal
  const { data: rows, error } = await sb.from("profiles").select("email").eq("role", "family");
  if (error) return json({ error: error.message }, 500);
  const known = new Set((rows ?? []).map((r) => String(r.email).toLowerCase()));
  const to = [...new Set((input.to ?? []).map((e) => String(e).trim().toLowerCase()))].filter((e) => known.has(e));
  if (!to.length) return json({ error: "None of those addresses are registered families." }, 400);
  if (to.length > 100) return json({ error: "Too many recipients at once." }, 400);

  const tx = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
  try {
    await tx.sendMail({ from: `"Project Dhulfiqar" <${user}>`, to: user, bcc: to, subject, text: body });
  } catch (e) {
    return json({ error: "Gmail refused the email: " + (e instanceof Error ? e.message : String(e)) }, 502);
  }
  return json({ sent: to.length });
});
