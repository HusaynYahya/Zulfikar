#!/usr/bin/env node
/* ============================================================================
   Fill a TEST Supabase project with fake families, so security testers have
   something realistic to attack without touching any real child's details.

   NEVER run this against the live project. It needs the service-role key,
   which bypasses every access rule.

   Usage:
     export SUPABASE_URL="https://YOUR-TEST-PROJECT.supabase.co"
     export SUPABASE_SERVICE_ROLE_KEY="the service_role key from the TEST project"
     node security/seed-test-data.mjs

   It creates:
     • 8 families, each with 1–3 boys (made-up names and medical notes)
     • one coach:  coach@test.local
     • a password for everyone:  Test-Passw0rd!
     • some sessions, homework, feedback and payments
   Every login and its role is printed at the end.

   A "canary" value is planted in one family's medical notes and one payment.
   If a tester can read those while signed in as a DIFFERENT family, that is a
   real finding — the access rules have failed.
   ============================================================================ */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = "Test-Passw0rd!";

if (!URL || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (use the TEST project, never live).");
  process.exit(1);
}
if (/localhost|127\.0\.0\.1/.test(URL) === false && !/supabase\.co$/.test(new globalThis.URL(URL).host)) {
  console.error("That doesn't look like a Supabase URL — stopping to be safe.");
  process.exit(1);
}

const db = createClient(URL, KEY, { auth: { persistSession: false } });

const FAMILIES = [
  { parent: "Fatima Khan",     phone: "07700 900001", boys: [["Hasan", "Khan", 7], ["Husayn", "Khan", 9]] },
  { parent: "Omar Siddiqui",   phone: "07700 900002", boys: [["Yusuf", "Siddiqui", 8]] },
  { parent: "Mariam Patel",    phone: "07700 900003", boys: [["Ibrahim", "Patel", 10], ["Ismail", "Patel", 7], ["Idris", "Patel", 8]] },
  { parent: "Zainab Ahmed",    phone: "07700 900004", boys: [["Musa", "Ahmed", 9]] },
  { parent: "Bilal Rahman",    phone: "07700 900005", boys: [["Dawud", "Rahman", 7], ["Sulayman", "Rahman", 10]] },
  { parent: "Aisha Malik",     phone: "07700 900006", boys: [["Zakariya", "Malik", 8]] },
  { parent: "Yahya Hussain",   phone: "07700 900007", boys: [["Harun", "Hussain", 9], ["Ayyub", "Hussain", 7]] },
  { parent: "Khadija Iqbal",   phone: "07700 900008", boys: [["Ilyas", "Iqbal", 10]] },
];
const MEDICAL = ["", "Mild asthma — inhaler in bag", "", "Nut allergy — carries an EpiPen", "", "", "Eczema", ""];

// The secrets a tester tries to steal from another family.
const CANARY_MEDICAL = "CANARY-MEDICAL-7f3a2b — only this family and a coach should ever see this";
const CANARY_PERIOD = "2020-01"; // an odd month, easy to spot in a payment they shouldn't see

async function createUser(email, meta) {
  const { data, error } = await db.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true, user_metadata: meta,
  });
  if (error && !/already been registered/i.test(error.message)) throw error;
  if (data?.user) return data.user.id;
  // already there: find them
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
  return list.users.find((u) => u.email === email).id;
}

async function main() {
  console.log("Seeding test data into", URL, "\n");
  const logins = [];

  const coachId = await createUser("coach@test.local", { parent_name: "Test Coach" });
  await db.from("profiles").update({ role: "coach" }).eq("id", coachId);
  logins.push(["coach@test.local", "coach"]);

  const students = [];
  for (let i = 0; i < FAMILIES.length; i++) {
    const fam = FAMILIES[i];
    const email = `family${i + 1}@test.local`;
    const boys = fam.boys.map(([first_name, last_name, year_group], j) => ({
      first_name, last_name, year_group,
      medical_notes: i === 2 && j === 0 ? CANARY_MEDICAL : MEDICAL[(i + j) % MEDICAL.length],
      emergency_name: fam.parent, emergency_phone: fam.phone, photo_consent: (i + j) % 2 === 0,
    }));
    const id = await createUser(email, { parent_name: fam.parent, phone: fam.phone, boys });
    logins.push([email, `family (${fam.parent})`]);
    // the trigger created the boys; read them back for later rows
    const { data: rows } = await db.from("students").select("id, first_name").eq("family_id", id);
    rows.forEach((r) => students.push({ ...r, family_id: id }));
  }

  // a few sessions over the last fortnight
  const sessionRows = [];
  for (let k = 0; k < 4; k++) {
    const d = new Date(); d.setDate(d.getDate() - (k * 3 + 2));
    sessionRows.push({
      date: d.toISOString().slice(0, 10), location: k % 2 ? "Zahra Centre" : "Harefield",
      title: ["Grappling & sabr", "Book circle", "Hike prep", "Conditioning"][k],
      pillars: [["physical"], ["intellectual"], ["outdoors"], ["physical", "spiritual"]][k],
      recap: "Test recap text.", takeaways: ["One", "Two"], register_taken: true, published: true, created_by: coachId,
    });
  }
  const { data: sessions } = await db.from("sessions").insert(sessionRows).select();

  await db.from("attendance").insert(
    sessions.flatMap((s) => students.map((st) => ({ session_id: s.id, student_id: st.id, present: Math.random() > 0.2 })))
  );

  const { data: hw } = await db.from("homework").insert({
    session_id: sessions[0].id, pillar: "spiritual", title: "One act of sabr", instructions: "Write a few sentences.",
  }).select().single();
  await db.from("submissions").insert(
    students.slice(0, 5).map((st) => ({ homework_id: hw.id, student_id: st.id, answer: "Test answer from " + st.first_name }))
  );

  // payments: everyone a session, plus the canary payment on family 3's first boy
  await db.from("payments").insert(
    students.map((st, n) => ({
      family_id: st.family_id, student_id: st.id, kind: "session",
      period: n === 5 ? CANARY_PERIOD : new Date().toISOString().slice(0, 7),
      amount_pence: 1000, method: "cash", status: "paid",
    }))
  );

  await db.from("feedback").insert(students.slice(0, 4).map((st) => ({
    family_id: st.family_id, student_id: st.id, session_id: sessions[0].id,
    rating: 4 + (Math.random() > 0.5 ? 1 : 0), enjoyed: "The drills", improve: "More sparring", anonymous: false,
  })));

  console.log("Done.\n");
  console.log("Everyone's password:", PASSWORD, "\n");
  console.log("Logins:");
  logins.forEach(([e, r]) => console.log("  " + e.padEnd(24) + r));
  console.log("\nCanary values a tester should NOT be able to read as another family:");
  console.log("  medical note :", CANARY_MEDICAL);
  console.log("  payment month:", CANARY_PERIOD, "(family3's first boy)");
  console.log("\nTo wipe this test data, delete and recreate the test Supabase project,");
  console.log("or clear the auth users and tables in the dashboard.");
}

main().catch((e) => { console.error("\nFailed:", e.message || e); process.exit(1); });
