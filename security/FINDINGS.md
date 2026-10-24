# Security review — what was tested and fixed

A first pass done on the portal itself, before handing it to outside testers.
Each check was run against a real Postgres database (for the access rules) or a
real browser (for code injection), not just read by eye.

## Access rules (Postgres row-level security)

Loaded `supabase/schema.sql` into a throwaway Postgres database with three
users — two families and a coach — and tried, signed in as one family, to reach
or change the other's data. Every one of these was **blocked** by the database:

- Reading another family's children, medical notes, homework answers, payments
  or feedback → returns nothing.
- Reading a session recap that hasn't been published, or any data with no
  account at all → returns nothing.
- Changing another family's child, or moving a child into another family → refused.
- Making yourself a coach, or changing your own email/role → refused (families
  may only edit their name and phone).
- Creating sessions or homework, editing the register, marking your own homework
  "reviewed", or writing a coach's comment → refused.
- Recording a payment, or leaving feedback in another family's name → refused.
- Editing a homework answer after a coach reviewed it → allowed, but it resets
  to "waiting for review" and the coach's comment is preserved (can't fake a
  review).
- Resolving your own flagged-attendance query, or writing the coach's reply to
  it → refused (only a coach can).

## Code injection (cross-site scripting)

In a real browser, put a script payload into **every** free-text field in the
database — names, recaps, homework answers, feedback, notes, timetable items,
what-to-bring items, reasons — then opened every family and coach screen,
including inside expanded panels and the plan editor. **Nothing executed.** A
deliberately-injected payload was used as a control to confirm the test could
detect a hit — it did. All user text is escaped before it reaches the page.

## Changes made as a result

- **Content-Security-Policy** added (`index.html`): the browser will only run
  this site's own scripts plus the Supabase library. Even if an injection were
  ever found, the browser would refuse to run it.
- **Frame guard**: the portal refuses to load inside another site's `<iframe>`,
  so it can't be hidden under a fake page to trick a coach into clicking
  (clickjacking). GitHub Pages can't send the usual header for this, so it's
  done in script.
- **Registration cap**: the sign-up trigger rejects more than 6 boys in one
  registration, to blunt bulk junk sign-ups.
- **Refunds**: the Stripe webhook now also listens for `charge.refunded` and
  marks the matching payment refunded, so a refunded payment can't keep showing
  as paid.

## Still worth an outside tester's time

These need the real third-party services, which can't be exercised from the
build environment:

- **The Stripe webhook** — signature verification and whether a payment can be
  pointed at someone else's child. Needs Stripe test mode and the Stripe CLI.
- **Supabase Auth** — password reset, email confirmation and sign-up abuse.
- A second, independent look at the **RLS policies** with real Supabase tokens.

`TESTING-BRIEF.md` scopes all of this for an outside agent, and
`seed-test-data.mjs` builds the test target.
