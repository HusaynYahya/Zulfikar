/* ============================================================================
   PROJECT ZULFIQAR — portal settings
   ----------------------------------------------------------------------------
   Everything you are likely to change lives here: programme details, prices,
   and the two sets of keys that switch the portal from DEMO to LIVE.

   • Leave `supabase.url` empty  → DEMO MODE. Data is stored only in this
     browser so you can click around and try every feature safely.
   • Fill in `supabase.url` + `supabase.anonKey` → LIVE. Real accounts, real
     data, shared across every device. See zulfiqar/README.md for setup.
   ============================================================================ */
window.ZULFIQAR = {

  /* ---- backend ------------------------------------------------------- */
  supabase: {
    url: "https://kfakrrmuujleeyvalhqm.supabase.co",
    anonKey: "sb_publishable_d4sp294oCRy3a_XAuqxmIQ_cm-ySyXJ",  // publishable key — safe to be public
  },

  /* ---- payments ------------------------------------------------------ */
  /* Create two Payment Links in Stripe (Dashboard → Payment Links) for the
     amounts below and paste their URLs here. The portal adds the boy's ID
     and the month to each link so the webhook knows who paid for what.    */
  stripe: {
    sessionLink: "",  // £10 — one session,  e.g. "https://buy.stripe.com/xxxx"
    monthLink:   "",  // £50 — one month,    e.g. "https://buy.stripe.com/yyyy"
  },

  /* ---- programme ----------------------------------------------------- */
  programme: {
    name: "Project Zulfiqar",
    arabic: "ذوالفقار",
    tagline: "Physical, Spiritual and Intellectual holistic growth for our youth.",
    ages: "Year 7 – Year 10 (Boys)",
    yearGroups: [7, 8, 9, 10],
    // Weekly schedule. day: 0 = Sunday … 6 = Saturday. Times are 24-hour.
    schedule: [
      { day: 1, start: "19:00", end: "21:30" },  // Monday
      { day: 3, start: "19:00", end: "21:30" },  // Wednesday
    ],
    locations: ["Harefield", "Zahra Centre"],
    prices: { sessionPence: 1000, monthPence: 5000 },
    values: ["Integrity", "Respect", "Discipline", "Brotherhood"],
    // Starting point for each new session plan. Coaches can change it per session.
    defaultTimetable: [
      { time: "19:00", activity: "Arrive, salaam and warm-up" },
      { time: "19:20", activity: "Main activity" },
      { time: "20:15", activity: "Break and water" },
      { time: "20:25", activity: "Circle: reflection and discussion" },
      { time: "21:15", activity: "Du'a and close" },
      { time: "21:30", activity: "Collection" },
    ],
    defaultBring: ["Water bottle", "Trainers and sports kit", "Notebook and pen", "A light snack"],
    contactEmail: "",  // shown on the sign-in page if set
  },

  /* ---- the four pillars ---------------------------------------------- */
  /* Used to tag session recaps and homework. Keys must not change once you
     have live data; labels and blurbs can.                                */
  pillars: [
    { key: "physical",     label: "Physical",     blurb: "Strength, conditioning and grappling." },
    { key: "spiritual",    label: "Spiritual",    blurb: "Qur'an, du'a and character." },
    { key: "intellectual", label: "Intellectual", blurb: "Reading, history and discussion." },
    { key: "outdoors",     label: "Outdoors",     blurb: "Hikes, camps and teamwork." },
  ],
};
