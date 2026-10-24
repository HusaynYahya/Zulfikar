/* ============================================================================
   PROJECT ZULFIQAR — data layer
   ----------------------------------------------------------------------------
   One small interface, two back-ends:

     LiveStore  → Supabase (real accounts; access rules enforced by the
                  database — see supabase/schema.sql)
     DemoStore  → this browser's localStorage, pre-filled with sample data,
                  with the same access rules imitated in JavaScript

   app.js only ever talks to window.ZData, so it never needs to know which
   one is running.

   Tables: profiles, students, sessions, attendance, homework, submissions,
           feedback, payments, rsvps (coming or not, before a session),
           attendance_reviews (parent confirms or flags the register after)
   ============================================================================ */
(function () {
  "use strict";

  var CFG = window.ZULFIQAR || {};
  var LIVE = !!(CFG.supabase && CFG.supabase.url && CFG.supabase.anonKey);

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
  function nowISO() { return new Date().toISOString(); }
  function isoDate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  /* Sort helper shared by both stores: opts.order = column, opts.desc = bool */
  function sortRows(rows, opts) {
    if (!opts || !opts.order) return rows;
    var k = opts.order, dir = opts.desc ? -1 : 1;
    return rows.slice().sort(function (a, b) {
      return a[k] < b[k] ? -dir : a[k] > b[k] ? dir : 0;
    });
  }

  /* ======================================================================
     LIVE — Supabase
     ====================================================================== */
  function LiveStore() {
    var sb = null;
    var me = null;  // { user, profile }

    async function loadMe() {
      var res = await sb.auth.getSession();
      var session = res.data && res.data.session;
      if (!session) { me = null; return null; }
      var p = await sb.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      if (p.error) throw p.error;
      me = { user: { id: session.user.id, email: session.user.email }, profile: p.data };
      return me;
    }
    function check(res) {
      if (res.error) throw new Error(res.error.message);
      return res.data;
    }

    return {
      mode: "live",
      async init() {
        var mod = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
        sb = mod.createClient(CFG.supabase.url, CFG.supabase.anonKey);
        // Arriving from a "reset password" email: send them to set a new one.
        sb.auth.onAuthStateChange(function (event) {
          if (event === "PASSWORD_RECOVERY") location.hash = "#/account?recover=1";
        });
        await loadMe();
      },
      me: function () { return me; },

      async signUp(form) {
        var res = await sb.auth.signUp({
          email: form.email,
          password: form.password,
          options: {
            // Read by the handle_new_user() trigger, which creates the profile
            // and the boys' records — it works even before the email is confirmed.
            data: { parent_name: form.parent_name, phone: form.phone, boys: form.boys },
            emailRedirectTo: location.origin + location.pathname,
          },
        });
        if (res.error) throw new Error(res.error.message);
        if (!res.data.session) return { needsConfirmation: true };
        await loadMe();
        return { needsConfirmation: false };
      },
      async signIn(email, password) {
        var res = await sb.auth.signInWithPassword({ email: email, password: password });
        if (res.error) throw new Error(res.error.message);
        return loadMe();
      },
      async signOut() { await sb.auth.signOut(); me = null; },
      async resetPassword(email) {
        var res = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + "#/account" });
        if (res.error) throw new Error(res.error.message);
      },
      async updatePassword(password) {
        var res = await sb.auth.updateUser({ password: password });
        if (res.error) throw new Error(res.error.message);
      },
      refreshMe: loadMe,

      async list(table, opts) {
        opts = opts || {};
        var q = sb.from(table).select("*");
        Object.keys(opts.eq || {}).forEach(function (k) { q = q.eq(k, opts.eq[k]); });
        if (opts.order) q = q.order(opts.order, { ascending: !opts.desc });
        return check(await q);
      },
      async insert(table, row) {
        return check(await sb.from(table).insert(row).select().single());
      },
      async update(table, id, patch) {
        return check(await sb.from(table).update(patch).eq("id", id).select().single());
      },
      async upsert(table, row, onConflict) {
        return check(await sb.from(table).upsert(row, { onConflict: onConflict }).select().single());
      },
      async upsertMany(table, rows, onConflict) {
        if (!rows.length) return [];
        return check(await sb.from(table).upsert(rows, { onConflict: onConflict }).select());
      },
      async remove(table, id) {
        check(await sb.from(table).delete().eq("id", id));
      },
    };
  }

  /* ======================================================================
     DEMO — localStorage
     ====================================================================== */
  function DemoStore() {
    var KEY = "zulfiqar-demo-v1";
    var db = null;

    function save() {
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* private mode: keep in memory */ }
    }
    function load() {
      try { db = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { db = null; }
      if (!db || !db.tables) { db = seed(); save(); }
      // demo data saved by an older version may lack newer tables
      ["rsvps", "attendance_reviews"].forEach(function (t) { db.tables[t] = db.tables[t] || []; });
      db.tables.sessions.forEach(function (s) {
        if (s.register_taken === undefined) s.register_taken = s.date < isoDate(new Date());
        s.timetable = s.timetable || [];
        s.bring = s.bring || [];
      });
    }
    function current() {
      var u = db.users.find(function (x) { return x.id === db.sessionUser; });
      if (!u) return null;
      var p = db.tables.profiles.find(function (x) { return x.id === u.id; });
      return { user: { id: u.id, email: u.email }, profile: p };
    }

    /* Imitates the row-level security policies in supabase/schema.sql */
    function visible(table, row, me) {
      if (!me) return false;
      var uid = me.user.id;
      if (me.profile.role === "coach") return true;
      var mine = db.tables.students.filter(function (s) { return s.family_id === uid; })
        .map(function (s) { return s.id; });
      switch (table) {
        case "profiles":    return row.id === uid;
        case "students":    return row.family_id === uid;
        case "sessions":    return row.published;
        case "homework":    return true;
        case "attendance":
        case "submissions": return mine.indexOf(row.student_id) !== -1;
        case "feedback":
        case "payments":
        case "rsvps":
        case "attendance_reviews": return row.family_id === uid;
        default:            return false;
      }
    }

    return {
      mode: "demo",
      async init() { load(); },
      me: current,
      async refreshMe() { return current(); },

      async signUp(form) {
        var email = String(form.email).toLowerCase();
        if (db.users.some(function (u) { return u.email === email; })) throw new Error("An account with that email already exists.");
        var id = uuid();
        db.users.push({ id: id, email: email, password: form.password });
        db.tables.profiles.push({ id: id, email: email, parent_name: form.parent_name, phone: form.phone, role: "family", created_at: nowISO() });
        (form.boys || []).forEach(function (b) {
          db.tables.students.push(Object.assign({ id: uuid(), family_id: id, created_at: nowISO() }, b));
        });
        db.sessionUser = id;
        save();
        return { needsConfirmation: false };
      },
      async signIn(email, password) {
        var u = db.users.find(function (x) { return x.email === String(email).toLowerCase(); });
        if (!u || u.password !== password) throw new Error("Invalid login credentials");
        db.sessionUser = u.id; save();
        return current();
      },
      async signOut() { db.sessionUser = null; save(); },
      async resetPassword() { /* nothing is emailed in demo mode */ },
      async updatePassword(password) {
        var u = db.users.find(function (x) { return x.id === db.sessionUser; });
        if (u) { u.password = password; save(); }
      },

      async list(table, opts) {
        opts = opts || {};
        var me = current();
        var rows = (db.tables[table] || []).filter(function (r) {
          if (!visible(table, r, me)) return false;
          return Object.keys(opts.eq || {}).every(function (k) { return r[k] === opts.eq[k]; });
        });
        return JSON.parse(JSON.stringify(sortRows(rows, opts)));
      },
      async insert(table, row) {
        var r = Object.assign({ id: uuid(), created_at: nowISO() }, row);
        db.tables[table].push(r); save();
        return Object.assign({}, r);
      },
      async update(table, id, patch) {
        var r = db.tables[table].find(function (x) { return x.id === id; });
        if (!r) throw new Error("Not found");
        Object.assign(r, patch); save();
        return Object.assign({}, r);
      },
      async upsert(table, row, onConflict) {
        var keys = onConflict.split(",");
        var r = db.tables[table].find(function (x) {
          return keys.every(function (k) { return x[k] === row[k]; });
        });
        if (r) { Object.assign(r, row); save(); return Object.assign({}, r); }
        return this.insert(table, row);
      },
      async upsertMany(table, rows, onConflict) {
        var out = [];
        for (var i = 0; i < rows.length; i++) out.push(await this.upsert(table, rows[i], onConflict));
        return out;
      },
      async remove(table, id) {
        db.tables[table] = db.tables[table].filter(function (x) { return x.id !== id; });
        save();
      },

      /* Demo-only extras */
      async loginAs(role) {
        db.sessionUser = role === "coach" ? "demo-coach" : "demo-family"; save();
        return current();
      },
      reset: function () { db = seed(); save(); },
    };
  }

  /* ---- demo sample data ------------------------------------------------ */
  function seed() {
    var famId = "demo-family", coachId = "demo-coach";
    var ali = "demo-boy-ali", mahdi = "demo-boy-mahdi";

    // The last six programme evenings before today, newest first.
    var days = (CFG.programme && CFG.programme.schedule || []).map(function (s) { return s.day; });
    var dates = [];
    var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - 1);
    while (dates.length < 6) {
      if (days.indexOf(d.getDay()) !== -1) dates.push(isoDate(d));
      d.setDate(d.getDate() - 1);
    }
    var due = new Date(); due.setDate(due.getDate() + 5);
    var joined = new Date(); joined.setDate(joined.getDate() - 60);
    var past = new Date(); past.setDate(past.getDate() - 3);

    var sessions = [
      { title: "Takedowns & the meaning of Sabr", location: "Harefield", pillars: ["physical", "spiritual"],
        recap: "We warmed up with animal-flow drills, then drilled the double-leg takedown in pairs — focus on level change and keeping the head up. In the circle afterwards we spoke about sabr (patience): how a wrestler who rushes gets countered, and how the same is true in life.",
        takeaways: ["Level change before you shoot", "Sabr is active, not passive", "Hydrate before Monday sessions"] },
      { title: "Book circle: the life of Malik al-Ashtar", location: "Zahra Centre", pillars: ["intellectual", "spiritual"],
        recap: "We read extracts from Imam Ali's letter to Malik al-Ashtar and discussed what it says about leadership and fairness. Each group picked one line and presented what it would look like at school.",
        takeaways: ["A leader serves the people he leads", "Fairness even with people you dislike"] },
      { title: "Hike prep & map reading", location: "Harefield", pillars: ["outdoors", "intellectual"],
        recap: "Compass bearings, contour lines and kit lists for the upcoming hike. Teams planned a 6 km route and checked each other's work.",
        takeaways: ["Red to the shed: align the needle", "Pack layers, not cotton"] },
      { title: "Conditioning circuit & Du'a Kumayl reflection", location: "Zahra Centre", pillars: ["physical", "spiritual"],
        recap: "A 30-minute bodyweight circuit in teams, then we sat together and reflected on a few lines of Du'a Kumayl and why we ask for forgiveness.",
        takeaways: ["Consistency beats intensity", "Thursday night: Du'a Kumayl with family"] },
    ].map(function (s, i) {
      return Object.assign({
        id: "demo-session-" + i, date: dates[i], published: true, register_taken: true,
        timetable: CFG.programme.defaultTimetable || [], bring: CFG.programme.defaultBring || [],
        created_by: coachId, created_at: nowISO(),
      }, s);
    });

    var attendance = [];
    sessions.forEach(function (s, i) {
      attendance.push({ id: uuid(), session_id: s.id, student_id: ali, present: true });
      attendance.push({ id: uuid(), session_id: s.id, student_id: mahdi, present: i !== 2 });
    });

    var month = isoDate(new Date()).slice(0, 7);
    // the next scheduled evening, for a sample reply
    var nextDates = [];
    var n = new Date(); n.setHours(12, 0, 0, 0);
    while (!nextDates.length) {
      if (days.indexOf(n.getDay()) !== -1) nextDates.push(isoDate(n));
      n.setDate(n.getDate() + 1);
    }
    // a planned session for the next evening: theme, timetable and kit list
    sessions.unshift({
      id: "demo-session-next", date: nextDates[0], published: true, register_taken: false,
      title: "Grip strength & the story of Khaybar", location: "Harefield", pillars: ["physical", "spiritual"],
      recap: "", takeaways: [], created_by: coachId, created_at: nowISO(),
      timetable: [
        { time: "19:00", activity: "Arrive, salaam and mobility warm-up" },
        { time: "19:20", activity: "Grip and pulling circuit in pairs" },
        { time: "20:10", activity: "Break and water" },
        { time: "20:20", activity: "Story circle: the gate of Khaybar" },
        { time: "21:10", activity: "Du'a and close" },
        { time: "21:30", activity: "Collection" },
      ],
      bring: ["Water bottle", "Trainers and sports kit", "Towel", "Notebook and pen"],
    });
    return {
      users: [
        { id: famId, email: "parent@demo.local", password: "demo1234" },
        { id: coachId, email: "coach@demo.local", password: "demo1234" },
      ],
      sessionUser: null,
      tables: {
        profiles: [
          { id: famId, email: "parent@demo.local", parent_name: "Sample Parent", phone: "07700 900000", role: "family", created_at: nowISO() },
          { id: coachId, email: "coach@demo.local", parent_name: "Coach", phone: "", role: "coach", created_at: nowISO() },
        ],
        students: [
          { id: ali, family_id: famId, first_name: "Ali", last_name: "Sample", year_group: 8, date_of_birth: "2013-03-14", school: "", medical_notes: "Mild asthma — inhaler in bag", emergency_name: "Sample Parent", emergency_phone: "07700 900000", photo_consent: true, created_at: joined.toISOString() },
          { id: mahdi, family_id: famId, first_name: "Mahdi", last_name: "Sample", year_group: 7, date_of_birth: "2014-09-02", school: "", medical_notes: "", emergency_name: "Sample Parent", emergency_phone: "07700 900000", photo_consent: true, created_at: joined.toISOString() },
        ],
        sessions: sessions,
        attendance: attendance,
        homework: [
          { id: "demo-hw-0", session_id: "demo-session-0", pillar: "spiritual", title: "One act of sabr",
            instructions: "This week, notice one moment where you chose patience instead of reacting. Write 3–5 sentences: what happened, what you felt, and what you did.",
            due_date: isoDate(due), created_at: nowISO() },
          { id: "demo-hw-1", session_id: "demo-session-1", pillar: "intellectual", title: "Your line from the letter",
            instructions: "Pick one sentence from the letter to Malik al-Ashtar. Explain it in your own words and give one example of living it at school.",
            due_date: isoDate(past), created_at: nowISO() },
        ],
        submissions: [
          { id: uuid(), homework_id: "demo-hw-1", student_id: ali, answer: "\"Do not be like a beast of prey\" — it means don't take advantage of people who are weaker. At school I stopped a group from laughing at a Year 7.", status: "reviewed", coach_comment: "Excellent example, Ali. That is exactly the spirit of the letter.", submitted_at: nowISO(), reviewed_at: nowISO() },
        ],
        feedback: [
          { id: uuid(), family_id: famId, student_id: ali, session_id: "demo-session-0", rating: 5, enjoyed: "The takedown drills!", improve: "More time for sparring.", anonymous: false, created_at: nowISO() },
        ],
        // Ali's register is confirmed for the older sessions; Mahdi's parent
        // has flagged the hike prep evening, where he was marked absent.
        attendance_reviews: [
          { id: uuid(), family_id: famId, session_id: "demo-session-3", student_id: ali, status: "confirmed", seen_present: true, note: null, coach_note: null, reviewed_at: nowISO() },
          { id: uuid(), family_id: famId, session_id: "demo-session-2", student_id: ali, status: "confirmed", seen_present: true, note: null, coach_note: null, reviewed_at: nowISO() },
          { id: uuid(), family_id: famId, session_id: "demo-session-2", student_id: mahdi, status: "disputed", seen_present: false, note: "He was there — he arrived late, about 7:20.", coach_note: null, reviewed_at: nowISO() },
        ],
        rsvps: [
          { id: uuid(), family_id: famId, student_id: ali, date: nextDates[0], going: true, reason: null, updated_at: nowISO() },
        ],
        payments: [
          { id: uuid(), family_id: famId, student_id: ali, kind: "month", period: month, amount_pence: 5000, method: "stripe", status: "paid", created_at: nowISO() },
          { id: uuid(), family_id: famId, student_id: mahdi, kind: "session", period: month, amount_pence: 1000, method: "cash", status: "paid", created_at: nowISO() },
        ],
      },
    };
  }

  window.ZData = LIVE ? LiveStore() : DemoStore();
})();
