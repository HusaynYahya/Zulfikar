# Project ذوالفقار — member portal

The portal for families of boys on **Project Zulfiqar** (Year 7 – Year 10,
Monday & Wednesday, Harefield / Zahra Centre). It is plain HTML, CSS and JavaScript,
with no build step, so it can be hosted free on GitHub Pages.

## What it does

| | Families | Coaches |
|---|---|---|
| **Sign up** | A parent registers with their details, one or more sons (year group, date of birth, medical needs, photo consent) and agrees to the programme values | Sees the full roster, with medical flags, emergency contacts and parent details. Can export it as CSV |
| **Payments** | £10 per session or £50 per month, paid by card through Stripe. Each boy's balance for the month and full payment history are shown | Records cash and bank payments, and can see who owes what each month |
| **Session plans** | Sees each upcoming evening's theme, its timetable and a what-to-bring checklist (ticks are remembered on their device) | Plans each session ahead: theme, timetable and kit list. The defaults are in `config.js` |
| **Coming or not** | Says whether each son is coming to the next sessions, with a reason if not | Sees who's coming, who isn't (and why) and who hasn't replied. Saying "coming" pre-ticks the register |
| **Booking confirmation** | Gets a formal confirmation for each evening (signed up, paid, a reference number) that can be printed or saved as a PDF | Can open any boy's confirmation |
| **Register check** | After each session, confirms the register is right, or flags a mistake with a note. Anything waiting is shown at the top of Home | Sees who has confirmed, who hasn't, and every flag. Can fix the register and mark the flag resolved with a reply |
| **Session recaps** | Reads what happened each evening: pillars covered, key takeaways, whether each son attended, and any homework set | Writes the recap, takes the register and publishes it |
| **Feedback** | Gives a star rating and comments on a session (or general feedback), with an option to hide their name | Sees all feedback, average ratings and a breakdown per session |
| **Homework** | Each boy reads the task, writes an answer and hands it in, then sees the coach's comment | Sets work linked to a session, sees who has handed it in and who hasn't, and writes reviews |

The layout works on phones, where navigation moves to a bottom tab bar.

**How balances work.** Each attended session in a published recap counts as
£10. A monthly pass covers everything in that month. Session payments are
subtracted from the total. Coaches take the register when they write the recap.

---

## Try it now (demo mode)

Until you add keys, the portal runs in **demo mode**. Everything works, but data
is kept only in your own browser and pre-filled with sample boys, sessions and
homework.

```bash
python3 -m http.server 8000      # from the repository root
# open http://localhost:8000/
```

On the sign-in screen, press **As a family** or **As a coach**. The demo
password for both sample accounts is `demo1234`. **Reset demo data** in the top
banner starts again.

---

## Going live

Live mode needs two free services: **Supabase** (accounts and database) and
**Stripe** (card payments). Setup takes about 30 minutes. Every setting you'll
change is in [`assets/js/config.js`](assets/js/config.js).

### 1. Supabase: accounts and data

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste in all of
   [`supabase/schema.sql`](supabase/schema.sql) and press **Run**. This creates
   the tables and the rules that keep each family's data private.
3. Open **Project Settings → API**. Copy the **Project URL** and the
   **anon public** key into `config.js`:
   ```js
   supabase: {
     url: "https://abcdefghijkl.supabase.co",
     anonKey: "eyJhbGciOi…",
   },
   ```
   The anon key is designed to be public. The database rules decide what each
   person can see.
   If you ran `schema.sql` before session plans and attendance checks
   existed, also run
   [`supabase/updates/001-session-plans-and-attendance.sql`](supabase/updates/001-session-plans-and-attendance.sql)
   once.
   If you see "permission denied for table ..." after connecting, run
   [`supabase/updates/002-grants.sql`](supabase/updates/002-grants.sql) once.
4. Under **Authentication → URL Configuration**, set **Site URL** to the
   portal's address, e.g. `https://husaynyahya.github.io/Zulfikar/`.
5. **Make yourself a coach.** Register through the portal like a parent would.
   Then run this in the SQL Editor:
   ```sql
   update public.profiles set role = 'coach' where email = 'you@example.com';
   ```
   Sign out and back in to get the coach screens. Nobody can make themselves a
   coach from the portal.

### 2. Stripe: card payments

1. In the Stripe Dashboard, create two **Payment Links**:
   - "Project Zulfiqar — session", **£10**
   - "Project Zulfiqar — monthly", **£50**

   For each one, under **After payment**, choose *Don't show confirmation page →
   redirect* and enter `https://husaynyahya.github.io/Zulfikar/#/payments?paid=1`.
2. Paste both links into `config.js`:
   ```js
   stripe: {
     sessionLink: "https://buy.stripe.com/…",
     monthLink:   "https://buy.stripe.com/…",
   },
   ```
3. Deploy the webhook that records payments. It needs the
   [Supabase CLI](https://supabase.com/docs/guides/cli):
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase functions deploy stripe-webhook --no-verify-jwt
   supabase secrets set STRIPE_SECRET_KEY=sk_live_… STRIPE_WEBHOOK_SECRET=whsec_…
   ```
4. In Stripe, go to **Developers → Webhooks → Add endpoint**:
   - URL: `https://<your-project-ref>.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`,
     `checkout.session.async_payment_succeeded` and `charge.refunded`

   Copy the endpoint's signing secret (`whsec_…`) into the secret from step 3.

When a parent presses **Pay**, the portal opens the Payment Link tagged with
their son and the month. Stripe tells the webhook when the payment succeeds, and
the payment appears in both portals. The webhook tells monthly payments from
session payments by amount: £50 or more counts as monthly. If you change the
monthly price, set `MONTH_PENCE`.

If you leave the Stripe links empty, the Payments page asks families to pay
coaches in person. Coaches can still record those payments.

### Prices, times and places

Change them in `programme` in `config.js`: prices, schedule, locations, year
groups and values. The four pillars are under `pillars`. Their labels can
change, but keep the `key`s the same once you have real data.

---

## Publishing (GitHub Pages)

In this repository on GitHub, go to **Settings → Pages**. Set the source to the
`main` branch, folder `/ (root)`. The portal will be at
`https://husaynyahya.github.io/Zulfikar/`. Any static host also works, such as
Netlify, Cloudflare Pages or your own domain.

## After changing a file

`index.html` loads the stylesheet and scripts with a version tag
(`portal.css?v=19`, `app.js?v=19` and so on). When you change any of those
files, raise the number on every line, e.g. to `?v=20`. Browsers then fetch
the new files straight away instead of showing a cached copy for up to 10
minutes.

## Files

```
├── index.html                         the single page
├── assets/
│   ├── css/portal.css                 styles; glass and colour settings are at the top
│   ├── js/config.js                   ← your settings
│   ├── js/data.js                     storage: Supabase (live) or localStorage (demo)
│   ├── js/app.js                      screens for families and coaches
│   ├── js/scenery.js                  draws the landscapes (mountains, shrine, desert, lake)
│   └── img/
│       ├── logo.webp, logo-small.png  the logo with its background removed
│       ├── logo-original.png          the logo as supplied
│       ├── favicon.png, apple-touch-icon.png
│       └── flyer.webp                 the programme poster
└── supabase/
    ├── schema.sql                     tables, sign-up trigger, access rules
    ├── updates/                       changes to run on an existing database
    └── functions/stripe-webhook/      records Stripe payments
```

## Security testing

The `security/` folder has everything for a security review:

- `TESTING-BRIEF.md` — what to attack, what's off limits, and what counts as a
  finding. Hand this to a testing agent (Codex or similar), or follow it yourself.
- `seed-test-data.mjs` — fills a **test** Supabase project with fake families,
  so nobody tests against real children's data.
- `FINDINGS.md` — the checks already run on the portal, and the fixes made.

**Always test a throwaway copy, never the live site with real families in it.**

## Privacy notes

- Medical notes, dates of birth and phone numbers are visible only to that
  family and to coaches. The database enforces this, not the browser.
- "Hide my name from the coaches" hides the name on screen. The feedback is
  still linked to the family's account in the database.
- Families can never record payments or mark their own homework as reviewed.
  If a family edits an answer after it has been reviewed, it goes back to the
  coach for review.
