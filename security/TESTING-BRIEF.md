# Security testing brief — Project Zulfiqar portal

This is a brief you can hand to a security-testing agent (Codex, or any other),
or work through yourself. It says what to attack, what is off limits, and what
counts as a real finding.

> **One rule above all: test a throwaway copy, never the real site.**
> Once real children's names, medical notes and payments are in the database,
> a successful attack is a genuine data breach. Everything below assumes a
> separate **test** Supabase project and Stripe **test mode**.

---

## What this app is

A member portal for a youth programme. Two kinds of user:

- **Families** — a parent signs in and sees only their own sons: their details,
  attendance, homework, feedback and payments. They pay per session or per month.
- **Coaches** — see and manage everyone.

It is a static site (HTML, CSS, JavaScript — no server of its own) talking to:

- **Supabase** — accounts and database. Who-sees-what is enforced by Postgres
  **row-level security** (RLS), defined in `supabase/schema.sql`. This is the
  main thing to attack.
- **Stripe** — card payments, via Payment Links. A **webhook**
  (`supabase/functions/stripe-webhook/`) records each payment. The browser
  never tells the database that a payment happened — only the webhook does.

The anon Supabase key in `assets/js/config.js` is **public by design**. Finding
it is not a vulnerability; the database rules are what protect the data. Do not
report "API key exposed in client code" as a finding.

---

## Set up the test target

1. Create a **new, empty** Supabase project — your *test* project. Do not use
   the one with real data.
2. In its SQL editor, run `supabase/schema.sql` (the whole file).
3. Fill it with fake families:
   ```bash
   export SUPABASE_URL="https://YOUR-TEST-PROJECT.supabase.co"
   export SUPABASE_SERVICE_ROLE_KEY="<test project's service_role key>"
   node security/seed-test-data.mjs
   ```
   It prints every login. The password for all of them is `Test-Passw0rd!`.
4. Point a local copy of the site at the test project: set `supabase.url` and
   `supabase.anonKey` in `assets/js/config.js` to the **test** project's values,
   then serve the folder (`python3 -m http.server 8000`).

The seed plants two **canary** secrets that belong to `family3@test.local`:
- a medical note containing `CANARY-MEDICAL-7f3a2b`
- a payment for the month `2020-01`

If any agent can read either of those **while signed in as a different family**
(or signed in as nobody), the access rules have failed. That is the clearest
possible finding.

---

## In scope

- The test site and its test Supabase project.
- The Stripe webhook, exercised with Stripe **test-mode** events and the Stripe
  CLI (`stripe trigger`, `stripe listen`).

## Out of scope — do not touch

- The **live** site, the **live/real** Supabase project, and **live** Stripe keys.
- Supabase's, Stripe's, GitHub's or Google's own infrastructure. Attack *this
  app's use* of them, not the platforms.
- Denial of service / flooding. It tells us nothing useful here.
- Social engineering of real people.

---

## What counts as a finding (try to achieve each)

**Access to other people's data (most important)**
1. Signed in as `family1@test.local`, read **any** data belonging to another
   family — a son's details or medical notes, attendance, homework answers,
   feedback or payments. The canary note and payment are the target.
2. With no account at all (just the anon key), read any family or child data.
3. Signed in as a family, **change** another family's data, or delete anything.

**Becoming a coach / privilege escalation**
4. Signed in as a family, give yourself the `coach` role, or otherwise gain
   coach-level read or write access.
5. Signed in as a family, write to coach-only tables: create or edit sessions
   or homework, mark your own homework "reviewed", write a coach comment, or
   edit the register/attendance.

**Money**
6. Make a payment appear as "paid" in the portal without actually paying —
   e.g. by calling the database directly, or by forging a webhook call. The
   webhook verifies a Stripe signature; see whether that can be bypassed, and
   whether a payment can be pointed at a child who isn't yours.
7. Confirm a booking (the "Signed up and paid" page) without a real payment.

**Code injection**
8. Get script to run in a coach's browser by typing it into a field a coach
   later reads — a homework answer, feedback, a child's name, a flagged-register
   note. (This was tested and should fail; try to prove otherwise.)

**Account / auth**
9. Take over or act as another account: password-reset abuse, confirming
   someone else's email, or session/token misuse.
10. Register in a way the app shouldn't allow (e.g. mass sign-ups — note there
    is a cap of 6 boys per registration).

For each finding, say: **who** you were signed in as, the **exact steps or
request**, **what** you got or changed, and **why it matters**. A proof that
reads the canary value is ideal.

---

## Where to look in the code

| File | What it does |
|------|--------------|
| `supabase/schema.sql` | Tables, the sign-up trigger, and **all the RLS policies**. The heart of the access model. |
| `supabase/functions/stripe-webhook/index.ts` | Records payments. Check the signature verification and how it decides which child a payment is for. |
| `assets/js/data.js` | How the browser talks to Supabase. The "demo" store imitates the rules in JS; the "live" store is the real one. Note the browser cannot be trusted — the database must enforce everything. |
| `assets/js/app.js` | Screens. Look for any user text put on the page without escaping (`esc()` is the escaper). |
| `index.html` | Content-Security-Policy and frame guard. |

A known, deliberate non-issue: in **demo mode** (no Supabase keys) all data is
in the browser's own `localStorage`, so of course it can be edited from the
console. That is not a finding — demo mode has no server and no real data. All
real testing is against the test Supabase project.
