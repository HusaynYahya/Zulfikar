/* ============================================================================
   PROJECT ZULFIQAR — portal app
   ----------------------------------------------------------------------------
   A small hash-routed single-page app. Two experiences share one shell:

     Families  #/home  #/sessions  #/homework  #/feedback  #/payments  #/account
     Coaches   #/home  #/sessions  #/homework  #/feedback  #/members   #/account

   All reads and writes go through window.ZData (data.js). Wording about the
   programme comes from window.ZULFIQAR (config.js).
   ============================================================================ */
(function () {
  "use strict";

  // Refuse to run inside another site's frame, so nobody can overlay the
  // portal and trick a coach into clicking (GitHub Pages can't send the header).
  if (window.top !== window.self) {
    document.body.innerHTML = '<p style="padding:2rem;font-family:sans-serif">Please <a href="' + location.href + '" target="_top">open the portal directly</a>.</p>';
    return;
  }

  var CFG = window.ZULFIQAR || {};
  var P = CFG.programme || {};
  var D = window.ZData;
  var $main = document.getElementById("main");

  var state = { me: null, activeBoy: null, lastPath: null };
  var actions = {};  // data-action handlers for the current screen

  /* ======================================================================
     Helpers
     ====================================================================== */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function money(pence) {
    var p = Number(pence) || 0;
    return "£" + (p % 100 ? (p / 100).toFixed(2) : String(p / 100));
  }
  function pad(n) { return String(n).padStart(2, "0"); }
  function isoDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function todayISO() { return isoDate(new Date()); }
  function thisMonth() { return todayISO().slice(0, 7); }
  function addMonths(month, n) {
    var d = new Date(+month.slice(0, 4), +month.slice(5, 7) - 1 + n, 1);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1);
  }
  function parseDate(iso) {
    var p = String(iso).slice(0, 10).split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function fmtDate(iso, long) {
    if (!iso) return "";
    return parseDate(iso).toLocaleDateString("en-GB", long
      ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
      : { weekday: "short", day: "numeric", month: "short" });
  }
  function fmtStamp(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }
  function monthLabel(month) {
    return new Date(+month.slice(0, 4), +month.slice(5, 7) - 1, 1)
      .toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }
  function time12(hhmm) {
    var h = +hhmm.slice(0, 2), m = hhmm.slice(3, 5);
    return ((h % 12) || 12) + ":" + m + " " + (h < 12 ? "am" : "pm");
  }
  function fullName(s) { return s ? (s.first_name + " " + (s.last_name || "")).trim() : "—"; }
  function byId(rows) { var m = {}; rows.forEach(function (r) { m[r.id] = r; }); return m; }
  function sum(rows, k) { return rows.reduce(function (a, r) { return a + (Number(r[k]) || 0); }, 0); }
  function firstWord(s) { return String(s || "").trim().split(/\s+/)[0] || ""; }
  function joinNames(names) {
    return names.length < 2 ? names.join("") : names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  }

  var toastTimer;
  function toast(msg, isError) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.className = "toast is-on" + (isError ? " is-error" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "toast"; }, 3800);
  }

  function parseHash() {
    var raw = location.hash.replace(/^#\/?/, "");
    var q = raw.indexOf("?");
    var path = (q === -1 ? raw : raw.slice(0, q)) || "home";
    var params = {};
    if (q !== -1) new URLSearchParams(raw.slice(q + 1)).forEach(function (v, k) { params[k] = v; });
    return { path: path, params: params };
  }
  function go(hash) {
    if (location.hash === hash) render(); else location.hash = hash;
  }

  /* Collect a form's named fields. Checkboxes with data-multi become arrays. */
  function fields(form) {
    var o = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled) return;
      if (el.type === "checkbox") {
        if (el.hasAttribute("data-multi")) {
          o[el.name] = o[el.name] || [];
          if (el.checked) o[el.name].push(el.value);
        } else o[el.name] = el.checked;
      } else if (el.type === "radio") {
        if (el.checked) o[el.name] = el.value;
      } else o[el.name] = el.value.trim();
    });
    return o;
  }

  /* Submit handler with busy state and inline error reporting. */
  function onSubmit(form, fn) {
    if (!form) return;
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var status = form.querySelector(".form-status");
      var btn = form.querySelector("[type=submit]");
      if (btn) btn.disabled = true;
      if (status) { status.textContent = ""; status.className = "form-status"; }
      try {
        await fn(fields(form), form);
      } catch (err) {
        console.error(err);
        if (status) { status.textContent = err.message || String(err); status.className = "form-status is-error"; }
        else toast(err.message || String(err), true);
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el || !actions[el.getAttribute("data-action")]) return;
    e.preventDefault();
    Promise.resolve(actions[el.getAttribute("data-action")](el)).catch(function (err) {
      console.error(err);
      toast(err.message || String(err), true);
    });
  });

  /* Load several tables at once, each in its natural order. */
  var ORDER = {
    sessions: { order: "date", desc: true },
    homework: { order: "created_at", desc: true },
    submissions: { order: "submitted_at", desc: true },
    feedback: { order: "created_at", desc: true },
    payments: { order: "created_at", desc: true },
    rsvps: { order: "date" },
    attendance_reviews: { order: "reviewed_at", desc: true },
    students: { order: "first_name" },
  };
  async function load(tables) {
    var lists = await Promise.all(tables.map(function (t) { return D.list(t, ORDER[t]); }));
    var out = {};
    tables.forEach(function (t, i) { out[t] = lists[i]; });
    return out;
  }

  /* ======================================================================
     Icons & emblem
     ====================================================================== */
  var ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    book: '<path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1z"/><path d="M12 6v14"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c.8-3.5 3.5-5.5 7-5.5s6.2 2 7 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.5 0 4.3 1.5 5 4"/>',
    logout: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
    physical: '<path d="M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12"/>',
    spiritual: '<path d="M12 3c-3 3-6 4-6 8h12c0-4-3-5-6-8z"/><path d="M5 11v9h14v-9M10 20v-4a2 2 0 0 1 4 0v4M3 20h18"/>',
    intellectual: '<path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1z"/><path d="M12 6v14"/>',
    outdoors: '<path d="M2 20l7-11 4 6 3-4 6 9z"/>',
    pin: '<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    coins: '<ellipse cx="9" cy="7" rx="6" ry="2.5"/><path d="M3 7v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V7"/><path d="M9 16.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4c0-1.4-2.7-2.5-6-2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (ICONS[name] || "") + "</svg>";
  }

  /* ---- scenery --------------------------------------------------------- */
  // Twelve natural places, each drawn in code. Pages and recaps draw from them
  // in rotation, so the portal keeps changing scene without repeating itself.
  var ALL_SCENES = window.ZScenery ? ZScenery.scenes.slice()
    : ["mountains", "alpine", "foothills", "forest", "hills", "meadow", "desert", "lake", "coast", "river", "marsh"];

  // Each page keeps its own place and time of day.
  var SCENES = {
    landing:  { scene: "mountains", mood: "dusk" },
    home:     { scene: "lake",      mood: "dawn" },
    sessions: { scene: "foothills", mood: "ember" },
    homework: { scene: "forest",    mood: "night" },
    feedback: { scene: "meadow",    mood: "dusk" },
    payments: { scene: "coast",     mood: "day" },
    members:  { scene: "hills",     mood: "day" },
    account:  { scene: "river",     mood: "night" },
  };
  function setScene(key) {
    var host = document.getElementById("scene");
    var def = SCENES[key] || SCENES.home;
    var tag = def.scene + ":" + def.mood;
    if (!window.ZScenery || !host || host.getAttribute("data-scene") === tag) return;
    host.setAttribute("data-scene", tag);
    var layer = document.createElement("div");
    layer.className = "scene__layer";
    layer.innerHTML = ZScenery.svg("zulfiqar-" + key, def.mood, { scene: def.scene });
    host.appendChild(layer);
    requestAnimationFrame(function () { requestAnimationFrame(function () { layer.classList.add("is-on"); }); });
    Array.prototype.slice.call(host.children, 0, -1).forEach(function (old) {
      setTimeout(function () { old.remove(); }, 900);
    });
  }

  function hashOf(seed) {
    var h = 0;
    for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return h;
  }
  // A session's place and the small landscapes rotate through all the scenes,
  // keyed on the id so each one keeps the same place every time.
  function artScene(seed) { return ALL_SCENES[hashOf(seed) % ALL_SCENES.length]; }
  function sceneFor(session) { return artScene(session.id); }
  /* A small landscape of its own for each session recap. */
  function recapArt(session) { return artFor(session.id, null, sceneFor(session)); }
  function artFor(seed, mood, scene) {
    if (!window.ZScenery) return "";
    var moods = ["ember", "dusk", "night", "dawn", "dusk", "ember"];
    var h = hashOf(seed);
    scene = scene || artScene(seed);
    // the flatter, low-horizon scenes show more sky above them
    var box = (scene === "desert" || scene === "meadow" || scene === "marsh") ? "0 330 1600 570" : "0 280 1600 620";
    return '<div class="art">' + ZScenery.svg(seed, mood || moods[h % moods.length], { scene: scene, layers: 4, fit: "xMidYMid slice", viewBox: box }) + "</div>";
  }

  function pillarMeta(key) {
    return (CFG.pillars || []).find(function (p) { return p.key === key; }) || { key: key, label: key };
  }
  function pillarChips(keys) {
    return (keys || []).map(function (k) {
      return '<span class="chip">' + icon(k) + esc(pillarMeta(k).label) + "</span>";
    }).join(" ");
  }
  function starsStatic(n) {
    var s = "";
    for (var i = 1; i <= 5; i++) s += i <= n ? "★" : '<span class="off">★</span>';
    return '<span class="stars-static" aria-label="' + n + ' out of 5">' + s + "</span>";
  }
  function methodLabel(m) { return m === "stripe" ? "Card" : m === "cash" ? "Cash" : "Bank transfer"; }
  function badge(text, kind) { return '<span class="badge badge--' + kind + '">' + esc(text) + "</span>"; }

  /* ======================================================================
     Programme logic
     ====================================================================== */

  /* How a boy stands for a month: monthly pass, or £/session for each evening
     he attended (counted from published session recaps). */
  function payStatus(studentId, month, data) {
    var inMonth = {};
    data.sessions.forEach(function (s) {
      if (s.published && String(s.date).slice(0, 7) === month) inMonth[s.id] = true;
    });
    var attended = data.attendance.filter(function (a) {
      return a.student_id === studentId && a.present && inMonth[a.session_id];
    }).length;
    var pays = data.payments.filter(function (p) {
      return p.student_id === studentId && p.period === month && p.status === "paid";
    });
    var monthPaid = pays.some(function (p) { return p.kind === "month"; });
    var sessionPaid = sum(pays.filter(function (p) { return p.kind === "session"; }), "amount_pence");
    var due = attended * P.prices.sessionPence;
    return {
      attended: attended,
      monthPaid: monthPaid,
      owed: monthPaid ? 0 : Math.max(0, due - sessionPaid),
      credit: monthPaid ? 0 : Math.max(0, sessionPaid - due),
    };
  }
  function payBadge(st) {
    if (st.monthPaid) return badge("Monthly pass", "ok");
    if (st.owed) return badge(money(st.owed) + " due", "bad");
    if (st.credit) return badge(money(st.credit) + " credit", "ok");
    return badge("Up to date", "mute");
  }

  function hwStatus(hw, sub) {
    if (sub) return sub.status === "reviewed" ? { label: "Reviewed", kind: "ok" } : { label: "Handed in", kind: "mute" };
    if (hw.due_date && hw.due_date < todayISO()) return { label: "Overdue", kind: "bad" };
    return { label: "To do", kind: "warn" };
  }

  /* ======================================================================
     Session plans, replies, register checks and booking confirmations
     ----------------------------------------------------------------------
     A session row can exist before the evening as a plan (theme = title,
     timetable, what to bring). Parents reply whether each son is coming
     (rsvps). Once the coach has taken the register, parents confirm it or
     flag a mistake (attendance_reviews), and coaches resolve flags.
     ====================================================================== */

  /* The next n scheduled evenings that haven't finished yet. */
  function upcomingDates(n) {
    var now = new Date(), out = [];
    var slots = (P.schedule || []).slice().sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    for (var i = 0; i < 60 && out.length < n; i++) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      slots.forEach(function (s) {
        if (out.length >= n || s.day !== d.getDay()) return;
        var end = new Date(d); end.setHours(+s.end.slice(0, 2), +s.end.slice(3, 5));
        if (end > now) out.push({ date: isoDate(d), slot: s, today: i === 0 });
      });
    }
    return out;
  }
  function planFor(date, sessions) {
    return sessions.find(function (s) { return s.date === date; }) || null;
  }
  function whenLabel(u) {
    return u.today ? "Tonight" : fmtDate(u.date, true).replace(/ \d{4}$/, "");
  }
  /* Past sessions: the register has been taken, or the day has gone. */
  function isPast(s) {
    return s.register_taken || s.date < todayISO();
  }
  function registeredOn(b) { return String(b.created_at || "").slice(0, 10) || "0000-00-00"; }

  /* "19:00 Warm-up" lines ⇄ [{ time, activity }] */
  function parseTimetable(text) {
    return String(text || "").split("\n").map(function (line) {
      line = line.trim();
      if (!line) return null;
      var m = line.match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)?\s*[-–—:]?\s*(.*)$/i);
      if (!m) return { time: "", activity: line };
      var h = +m[1], ampm = (m[3] || "").toLowerCase();
      // Sessions run in the evening, so "7.30" means 7:30 pm unless "am" is written.
      if (ampm === "pm" || (!ampm && h < 12 && eveningProgramme())) h = h % 12 + 12;
      if (ampm === "am" && h === 12) h = 0;
      return { time: pad(h) + ":" + m[2], activity: m[4] };
    }).filter(Boolean);
  }
  function eveningProgramme() {
    return (P.schedule || []).every(function (s) { return +s.start.slice(0, 2) >= 12; });
  }
  function timetableText(rows) {
    return (rows || []).map(function (r) { return (r.time ? r.time + " " : "") + r.activity; }).join("\n");
  }
  function timetableHtml(rows) {
    if (!rows || !rows.length) return "";
    return '<ol class="timetable">' + rows.map(function (r) {
      return '<li><span class="timetable__time">' + (r.time ? esc(time12(r.time)) : "") + "</span><span>" + esc(r.activity) + "</span></li>";
    }).join("") + "</ol>";
  }

  /* What to bring, with ticks remembered on this device only. */
  function bringHtml(plan, date) {
    var items = plan && plan.bring && plan.bring.length ? plan.bring : (P.defaultBring || []);
    if (!items.length) return "";
    var ticked = [];
    try { ticked = JSON.parse(localStorage.getItem("zf-bring:" + date) || "[]"); } catch (e) { /* storage blocked */ }
    return '<ul class="bring">' + items.map(function (item) {
      return '<li><label class="check"><input type="checkbox" data-bring="' + esc(date) + '" value="' + esc(item) + '"' +
        (ticked.indexOf(item) !== -1 ? " checked" : "") + "> " + esc(item) + "</label></li>";
    }).join("") + "</ul>";
  }
  document.addEventListener("change", function (e) {
    var box = e.target.closest && e.target.closest("[data-bring]");
    if (!box) return;
    var date = box.getAttribute("data-bring");
    var all = document.querySelectorAll('[data-bring="' + date + '"]:checked');
    try { localStorage.setItem("zf-bring:" + date, JSON.stringify(Array.prototype.map.call(all, function (c) { return c.value; }))); } catch (err) { /* storage blocked */ }
  });

  /* Is this boy's place on this date paid for? */
  function coverage(boy, date, d) {
    var month = date.slice(0, 7);
    var st = payStatus(boy.id, month, d);
    if (st.monthPaid) return { paid: true, text: "Paid: monthly pass for " + monthLabel(month) };
    if (st.credit >= P.prices.sessionPence) return { paid: true, text: "Paid: this session is covered by a payment already made" };
    return {
      paid: false,
      text: money(P.prices.sessionPence) + " for this session not paid yet" + (st.owed ? " (" + money(st.owed) + " also outstanding)" : ""),
    };
  }
  function rsvpOf(boy, date, d) {
    return d.rsvps.find(function (r) { return r.student_id === boy.id && r.date === date; }) || null;
  }
  function bookingRef(boy, date) {
    return "ZF-" + date.replace(/-/g, "").slice(2) + "-" + String(boy.id).replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase();
  }

  /* One boy's reply for an upcoming evening. Once answered it collapses to a
     clear state with a "Change" link; the two choices only show when needed. */
  function replyRow(boy, date, d) {
    var r = rsvpOf(boy, date, d), cov = coverage(boy, date, d);
    var answered = !!r, going = r && r.going, confirmed = going && cov.paid;
    var key = ' data-boy="' + esc(boy.id) + '" data-date="' + esc(date) + '"';

    var options =
      '<div class="rsvp-options' + (answered ? " is-collapsed" : "") + '"' + key + ">" +
        '<button class="btn btn--sm' + (going ? " btn--primary is-on" : "") + '" type="button" data-action="rsvp-yes"' + key + ' data-covered="' + cov.paid + '">Yes, he\'s coming</button>' +
        '<button class="btn btn--sm' + (answered && !going ? " is-on" : "") + '" type="button" data-action="rsvp-no"' + key + ">Can't make it</button>" +
      "</div>";

    var stateLabel = !answered ? badge("Not answered yet", "warn")
      : going ? '<span class="rsvp-state rsvp-state--yes">' + icon("check") + "Coming</span>"
              : '<span class="rsvp-state rsvp-state--no">Not coming</span>';

    return (
      '<div class="reply">' +
        '<div class="row row--between"><div class="row"><strong>' + esc(boy.first_name) + "</strong>" + stateLabel +
          (confirmed ? badge("Booking confirmed", "ok") : "") + "</div>" +
          (answered ? '<button class="linklike small" type="button" data-action="rsvp-change"' + key + ">Change</button>" : "") +
        "</div>" +
        options +
        (answered && !going && r.reason ? '<p class="small muted" style="margin:.5rem 0 0">' + esc(r.reason) + "</p>" : "") +
        '<form class="form inline-form rsvp-form"' + key + ' hidden>' +
          '<label class="field"><span>Reason (helps the coaches plan)</span><input type="text" name="reason" value="' + esc(r && r.reason) + '"></label>' +
          '<div><button class="btn btn--primary btn--sm" type="submit">Save</button></div><p class="form-status" aria-live="polite"></p>' +
        "</form>" +
        (going
          ? '<p class="small" style="margin:.6rem 0 0">' + (cov.paid
              ? '<span class="soft">' + esc(cov.text) + "</span>"
              : "<strong>" + esc(cov.text) + '</strong> · <a href="#/payments?boy=' + esc(boy.id) + '">Pay now</a>') +
            ' · <a href="#/confirmation?boy=' + esc(boy.id) + "&date=" + esc(date) + '">' + (confirmed ? "Booking confirmation" : "Booking status") + "</a></p>"
          : "") +
      "</div>"
    );
  }

  function upcomingCard(u, d, boys, label) {
    var plan = planFor(u.date, d.sessions);
    var tt = plan && plan.timetable && plan.timetable.length ? plan.timetable : null;
    return (
      '<article class="card card--art">' + artFor("next-" + u.date, "dusk", plan ? sceneFor(plan) : artScene("next-" + u.date)) +
        '<p class="label">' + esc(label || "Next session") + "</p>" +
        '<div class="next-up__when">' + esc(whenLabel(u)) + "</div>" +
        (plan && plan.title ? '<p class="theme">' + esc(plan.title) + "</p>" : "") +
        '<div class="next-up__meta">' +
          "<span>" + icon("clock") + esc(time12(u.slot.start)) + " to " + esc(time12(u.slot.end)) + "</span>" +
          "<span>" + icon("pin") + esc(plan ? plan.location : (P.locations || []).join(" or ")) + "</span>" +
        "</div>" +
        '<div class="plan-grid">' +
          "<div>" + '<p class="label">Timetable</p>' +
            (tt ? timetableHtml(tt) : '<p class="small muted">The coaches will post the plan for this evening soon.</p>') + "</div>" +
          "<div>" + '<p class="label">What to bring</p>' + bringHtml(plan, u.date) + "</div>" +
        "</div>" +
        (boys.length ? '<hr class="divider"><p class="label">Is he coming?</p><div class="stack stack--tight">' +
          boys.map(function (b) { return replyRow(b, u.date, d); }).join("") + "</div>" : "") +
      "</article>"
    );
  }

  /* Where a boy's register check stands for one past session. */
  function reviewOf(s, b, d) {
    var a = d.attendance.find(function (x) { return x.session_id === s.id && x.student_id === b.id; });
    var present = !!(a && a.present);
    var r = d.attendance_reviews.find(function (x) { return x.session_id === s.id && x.student_id === b.id; }) || null;
    var state = !r ? "todo" : r.status === "resolved" ? "resolved" : r.seen_present !== present ? "changed" : r.status;
    return { present: present, review: r, state: state };
  }
  function needsReview(s, b) {
    return s.published && s.register_taken && s.date <= todayISO() && registeredOn(b) <= s.date;
  }
  function pendingReviews(d, boys) {
    var out = [];
    d.sessions.forEach(function (s) {
      boys.forEach(function (b) {
        if (!needsReview(s, b)) return;
        var rv = reviewOf(s, b, d);
        if (rv.state === "todo" || rv.state === "changed") out.push({ session: s, boy: b, rv: rv });
      });
    });
    return out;
  }
  var REVIEW_BADGE = {
    todo: ["Please confirm", "warn"], changed: ["Register updated, please check again", "warn"],
    confirmed: ["Confirmed", "ok"], disputed: ["Flagged, waiting for the coach", "bad"], resolved: ["Sorted by the coach", "ok"],
  };
  function reviewRow(s, b, rv, showSession) {
    var bd = REVIEW_BADGE[rv.state];
    var ask = rv.state === "todo" || rv.state === "changed";
    return (
      '<div class="reply">' +
        '<div class="row row--between"><div>' +
          (showSession ? '<div class="small muted">' + esc(fmtDate(s.date) + " · " + s.title) + "</div>" : "") +
          "<strong>" + esc(b.first_name) + "</strong> " +
          '<span class="soft">' + (rv.present ? "was marked present" : "was marked absent") + "</span> " + badge(bd[0], bd[1]) +
        "</div>" +
        (ask ? '<div class="row">' +
          '<button class="btn btn--primary btn--sm" type="button" data-action="review-ok" data-session="' + esc(s.id) + '" data-boy="' + esc(b.id) + '" data-present="' + rv.present + '">That\'s right</button>' +
          '<button class="btn btn--sm" type="button" data-action="review-bad" data-session="' + esc(s.id) + '" data-boy="' + esc(b.id) + '">Something\'s wrong</button>' +
        "</div>" : rv.state === "confirmed"
          ? '<button class="linklike small" type="button" data-action="review-bad" data-session="' + esc(s.id) + '" data-boy="' + esc(b.id) + '">Not right?</button>' : "") +
        "</div>" +
        (rv.review && rv.review.note && rv.state !== "confirmed" ? '<div class="quote small">' + esc(rv.review.note) + "</div>" : "") +
        (rv.state === "resolved" && rv.review.coach_note ? '<div class="quote quote--coach small">Coach: ' + esc(rv.review.coach_note) + "</div>" : "") +
        '<form class="form inline-form review-form" data-session="' + esc(s.id) + '" data-boy="' + esc(b.id) + '" data-present="' + rv.present + '" hidden>' +
          '<label class="field"><span>What\'s wrong? The coach will see this.</span><textarea name="note" rows="2" required></textarea></label>' +
          '<div><button class="btn btn--primary btn--sm" type="submit">Send to the coach</button></div><p class="form-status" aria-live="polite"></p>' +
        "</form>" +
      "</div>"
    );
  }

  /* Wire up the reply and review buttons and forms on a family screen. */
  function bindFamilyAttendance() {
    var uid = state.me.user.id;
    function reveal(sel) {
      var form = $main.querySelector(sel);
      if (!form) return;
      form.hidden = !form.hidden;
      if (!form.hidden) { var f = form.querySelector("input,textarea"); if (f) f.focus(); }
    }
    actions["rsvp-yes"] = async function (el) {
      var boyId = el.getAttribute("data-boy");
      await D.upsert("rsvps", { family_id: uid, student_id: boyId, date: el.getAttribute("data-date"),
        going: true, reason: null, updated_at: new Date().toISOString() }, "student_id,date");
      // Attendance confirmed — now make sure it's paid for.
      if (el.getAttribute("data-covered") === "true") {
        toast("Confirmed — he's all set.");
        render();
      } else {
        toast("Confirmed. Now choose how to pay.");
        go("#/payments?boy=" + encodeURIComponent(boyId));
      }
    };
    actions["rsvp-no"] = function (el) {
      // make sure the choices are visible, then open the reason box
      var opts = $main.querySelector('.rsvp-options[data-boy="' + el.getAttribute("data-boy") + '"][data-date="' + el.getAttribute("data-date") + '"]');
      if (opts) opts.classList.remove("is-collapsed");
      reveal('.rsvp-form[data-boy="' + el.getAttribute("data-boy") + '"][data-date="' + el.getAttribute("data-date") + '"]');
    };
    actions["rsvp-change"] = function (el) {
      var opts = $main.querySelector('.rsvp-options[data-boy="' + el.getAttribute("data-boy") + '"][data-date="' + el.getAttribute("data-date") + '"]');
      if (opts) opts.classList.toggle("is-collapsed");
    };
    actions["review-ok"] = async function (el) {
      await D.upsert("attendance_reviews", { family_id: uid, session_id: el.getAttribute("data-session"), student_id: el.getAttribute("data-boy"),
        status: "confirmed", seen_present: el.getAttribute("data-present") === "true", note: null }, "session_id,student_id");
      toast("Confirmed. Thank you.");
      render();
    };
    actions["review-bad"] = function (el) {
      reveal('.review-form[data-session="' + el.getAttribute("data-session") + '"][data-boy="' + el.getAttribute("data-boy") + '"]');
    };
    $main.querySelectorAll(".rsvp-form").forEach(function (form) {
      onSubmit(form, async function (f) {
        await D.upsert("rsvps", { family_id: uid, student_id: form.getAttribute("data-boy"), date: form.getAttribute("data-date"),
          going: false, reason: f.reason || null, updated_at: new Date().toISOString() }, "student_id,date");
        toast("Thanks for letting us know.");
        render();
      });
    });
    $main.querySelectorAll(".review-form").forEach(function (form) {
      onSubmit(form, async function (f) {
        if (!f.note) throw new Error("Tell the coach what's wrong.");
        await D.upsert("attendance_reviews", { family_id: uid, session_id: form.getAttribute("data-session"), student_id: form.getAttribute("data-boy"),
          status: "disputed", seen_present: form.getAttribute("data-present") === "true", note: f.note }, "session_id,student_id");
        toast("Sent to the coach.");
        render();
      });
    });
  }

  /* Coach view of replies for one evening. */
  function replySummary(date, d, boys) {
    var coming = [], notComing = [], none = [];
    boys.forEach(function (b) {
      var r = rsvpOf(b, date, d);
      if (!r) none.push(b); else if (r.going) coming.push(b); else notComing.push({ b: b, r: r });
    });
    return (
      '<div class="row">' + badge(coming.length + " coming", "ok") + badge(notComing.length + " not coming", "mute") + badge(none.length + " no reply", none.length ? "warn" : "mute") + "</div>" +
      (boys.length ? '<details class="disclose" style="margin-top:.5rem"><summary>Who\'s coming</summary><div class="small">' +
        (coming.length ? "<p><strong>Coming:</strong> " + esc(coming.map(fullName).join(", ")) + "</p>" : "") +
        (notComing.length ? "<p><strong>Not coming:</strong> " + notComing.map(function (x) {
          return esc(fullName(x.b)) + (x.r.reason ? ' <span class="muted">(' + esc(x.r.reason) + ")</span>" : "");
        }).join(", ") + "</p>" : "") +
        (none.length ? '<p style="margin:0"><strong>No reply:</strong> ' + esc(none.map(fullName).join(", ")) + "</p>" : "") +
      "</div></details>" : "")
    );
  }

  /* Coach view of parents' register checks for one past session. */
  function checkSummary(s, d, boys, open) {
    var counts = { confirmed: 0, waiting: 0, disputed: 0, resolved: 0 }, flagged = [], waiting = [];
    boys.forEach(function (b) {
      if (registeredOn(b) > s.date) return;
      var rv = reviewOf(s, b, d);
      if (rv.state === "todo" || rv.state === "changed") { counts.waiting++; waiting.push(b); }
      else counts[rv.state]++;
      if (rv.state === "disputed") flagged.push({ b: b, rv: rv });
    });
    return (
      '<div class="row" style="margin-top:.6rem"><span class="small muted">Parents\' check:</span>' +
        badge(counts.confirmed + " confirmed", "ok") + badge(counts.waiting + " waiting", counts.waiting ? "warn" : "mute") +
        (counts.disputed ? badge(counts.disputed + " flagged", "bad") : "") + (counts.resolved ? badge(counts.resolved + " resolved", "mute") : "") + "</div>" +
      (flagged.length || waiting.length ? '<details class="disclose" style="margin-top:.5rem"' + (open ? " open" : "") + "><summary>Details</summary><div class=\"stack stack--tight\">" +
        flagged.map(function (x) {
          return (
            '<form class="form inline-form resolve-form" data-id="' + esc(x.rv.review.id) + '">' +
              "<div><strong>" + esc(fullName(x.b)) + '</strong> <span class="soft small">marked ' + (x.rv.present ? "present" : "absent") + "</span> " + badge("Flagged", "bad") + "</div>" +
              '<div class="quote small">' + esc(x.rv.review.note) + "</div>" +
              '<label class="field"><span>Reply to the family (optional)</span><input type="text" name="coach_note"></label>' +
              '<div class="row"><a class="btn btn--sm" href="#/sessions?edit=' + esc(s.id) + '">Fix the register</a>' +
                '<button class="btn btn--primary btn--sm" type="submit">Mark resolved</button></div>' +
              '<p class="form-status" aria-live="polite"></p>' +
            "</form>"
          );
        }).join("") +
        (waiting.length ? '<p class="small muted" style="margin:0">Waiting on: ' + esc(waiting.map(fullName).join(", ")) + "</p>" : "") +
      "</div></details>" : "")
    );
  }
  function bindResolveForms(back) {
    $main.querySelectorAll(".resolve-form").forEach(function (form) {
      onSubmit(form, async function (f) {
        await D.update("attendance_reviews", form.getAttribute("data-id"), { status: "resolved", coach_note: f.coach_note || null });
        toast("Marked resolved.");
        go(back);
      });
    });
  }

  /* ======================================================================
     Shell: banner, top bar, footer
     ====================================================================== */
  var FAMILY_NAV = [
    { path: "home", label: "Home", icon: "home" },
    { path: "sessions", label: "Sessions", icon: "calendar" },
    { path: "homework", label: "Homework", icon: "book" },
    { path: "feedback", label: "Feedback", icon: "chat" },
    { path: "payments", label: "Payments", icon: "card" },
    { path: "account", label: "Account", icon: "user" },
  ];
  var COACH_NAV = [
    { path: "home", label: "Dashboard", icon: "home" },
    { path: "sessions", label: "Sessions", icon: "calendar" },
    { path: "homework", label: "Homework", icon: "book" },
    { path: "feedback", label: "Feedback", icon: "chat" },
    { path: "members", label: "Members", icon: "users" },
    { path: "account", label: "Account", icon: "user" },
  ];

  function renderChrome(path) {
    var me = state.me;
    var role = me && me.profile && me.profile.role;
    var nav = role === "coach" ? COACH_NAV : role ? FAMILY_NAV : [];
    document.body.classList.toggle("has-nav", nav.length > 0);

    document.getElementById("banner").innerHTML = D.mode === "demo"
      ? '<div class="demo-banner">Demo mode — data is saved only in this browser. ' +
        '<button type="button" data-action="demo-reset">Reset demo data</button></div>'
      : "";

    var html =
      '<div class="topbar__inner">' +
        '<a class="brand" href="#/home" aria-label="' + esc(P.name) + ' home">' +
          '<img class="brand__logo" src="assets/img/logo-small.png" alt="" width="44" height="44">' +
          '<span class="brand__word">Project<span class="arabic" lang="ar">' + esc(P.arabic) + "</span></span></a>";
    if (nav.length) {
      html += '<nav class="nav" aria-label="Main">' + nav.map(function (n) {
        return '<a href="#/' + n.path + '"' + (n.path === path ? ' aria-current="page"' : "") + ">" +
          icon(n.icon) + "<span>" + n.label + "</span></a>";
      }).join("") + "</nav>" +
        '<div class="who"><span class="who__name">' + esc(role === "coach" ? "Coach" : me.profile.parent_name || me.user.email) + "</span>" +
        '<button class="btn btn--ghost btn--sm" type="button" data-action="sign-out" aria-label="Sign out">' + icon("logout") + "</button></div>";
    }
    document.getElementById("topbar").innerHTML = html + "</div>";

    document.getElementById("topbar").hidden = !nav.length;
    document.getElementById("foot").hidden = !nav.length;
    document.getElementById("foot").innerHTML =
      '<div class="values-line">' + esc((P.values || []).join(" · ")) + "</div>";
  }

  actions["sign-out"] = async function () {
    await D.signOut();
    state.activeBoy = null;
    go("#/");
  };
  actions["demo-reset"] = function () {
    if (!confirm("Reset all demo data? Anything you added will be cleared.")) return;
    D.reset(); state.activeBoy = null;
    go("#/");
    toast("Demo data reset.");
  };

  /* ======================================================================
     Router
     ====================================================================== */
  var FAMILY_VIEWS, COACH_VIEWS;

  async function render() {
    actions = { "sign-out": actions["sign-out"], "demo-reset": actions["demo-reset"] };
    var r = parseHash();
    state.me = D.me();
    renderChrome(r.path);
    var where = (state.me ? "in:" : "out:") + r.path;
    if (where !== state.lastPath) window.scrollTo(0, 0);
    setScene(state.me ? r.path : "landing");
    state.lastPath = where;

    if (!state.me) return viewLanding(r);
    if (!state.me.profile) {
      $main.innerHTML = '<div class="card"><h1>Almost there</h1><p>Your account exists but its profile is missing. Please contact the coaches.</p></div>';
      return;
    }
    var views = state.me.profile.role === "coach" ? COACH_VIEWS : FAMILY_VIEWS;
    var view = views[r.path] || views.home;
    $main.innerHTML = '<div class="loading">Loading…</div>';
    try {
      await view(r.params);
    } catch (err) {
      console.error(err);
      $main.innerHTML = '<div class="card"><h1>Something went wrong</h1><p class="soft">' + esc(err.message || err) +
        '</p><button class="btn" type="button" data-action="retry">Try again</button></div>';
      actions.retry = render;
    }
  }

  /* ======================================================================
     Landing: sign in / register
     ====================================================================== */
  function boyBlock(i) {
    var years = (P.yearGroups || []).map(function (y) { return '<option value="' + y + '">Year ' + y + "</option>"; }).join("");
    return (
      '<fieldset class="boy-block" data-boy>' +
        "<legend>Boy " + (i + 1) + "</legend>" +
        (i > 0 ? '<button type="button" class="btn btn--ghost btn--sm remove-boy" data-action="remove-boy">Remove</button>' : "") +
        '<div class="cols-2">' +
          '<label class="field"><span>First name <span class="req">*</span></span><input type="text" name="first_name" required autocomplete="off"></label>' +
          '<label class="field"><span>Last name <span class="req">*</span></span><input type="text" name="last_name" required autocomplete="off"></label>' +
        "</div>" +
        '<div class="cols-2">' +
          '<label class="field"><span>School year <span class="req">*</span></span><select name="year_group" required><option value="">Choose…</option>' + years + "</select></label>" +
          '<label class="field"><span>Date of birth</span><input type="date" name="date_of_birth"></label>' +
        "</div>" +
        '<label class="field"><span>School</span><input type="text" name="school"></label>' +
        '<label class="field"><span>Medical needs or allergies</span><textarea name="medical_notes" rows="2" placeholder="e.g. asthma — inhaler in bag. Leave blank if none."></textarea></label>' +
        '<label class="check"><input type="checkbox" name="photo_consent"> I consent to photos of my son being used in programme updates.</label>' +
      "</fieldset>"
    );
  }

  function viewLanding(r) {
    var tab = r.path === "register" ? "register" : r.path === "forgot" ? "forgot" : "signin";
    var auth;
    if (tab === "register") {
      auth =
        "<h2>Register your son</h2>" +
        '<p class="small muted">A parent or guardian creates the account. You can add brothers too.</p>' +
        '<form class="form" id="register-form" novalidate>' +
          "<fieldset><legend>Parent / guardian</legend>" +
            '<label class="field"><span>Full name <span class="req">*</span></span><input type="text" name="parent_name" required autocomplete="name"></label>' +
            '<div class="cols-2">' +
              '<label class="field"><span>Email <span class="req">*</span></span><input type="email" name="email" required autocomplete="email"></label>' +
              '<label class="field"><span>Mobile <span class="req">*</span></span><input type="tel" name="phone" required autocomplete="tel"></label>' +
            "</div>" +
            '<label class="field"><span>Emergency contact (if not you)</span><input type="text" name="emergency_name" placeholder="Name"></label>' +
            '<label class="field"><span>Emergency contact number</span><input type="tel" name="emergency_phone"></label>' +
          "</fieldset>" +
          '<div id="boys">' + boyBlock(0) + "</div>" +
          '<button type="button" class="btn btn--sm" data-action="add-boy">' + icon("plus") + "Add a brother</button>" +
          "<fieldset><legend>Account</legend>" +
            '<label class="field"><span>Password <span class="req">*</span></span><input type="password" name="password" required minlength="8" autocomplete="new-password"><small>At least 8 characters.</small></label>' +
            '<label class="check"><input type="checkbox" name="agree_values" required> My son agrees to uphold the programme values: ' + esc((P.values || []).join(", ")) + ".</label>" +
            '<label class="check"><input type="checkbox" name="agree_medical" required> I confirm the details above are correct and consent to first aid being given if needed.</label>' +
          "</fieldset>" +
          '<button class="btn btn--primary btn--block" type="submit">Create account</button>' +
          '<p class="form-status" aria-live="polite"></p>' +
          '<p class="small muted" style="text-align:center">Already registered? <a href="#/">Sign in</a></p>' +
        "</form>";
    } else if (tab === "forgot") {
      auth =
        "<h2>Reset your password</h2>" +
        '<form class="form" id="forgot-form">' +
          '<label class="field"><span>Email</span><input type="email" name="email" required autocomplete="email"></label>' +
          '<button class="btn btn--primary btn--block" type="submit">Send reset link</button>' +
          '<p class="form-status" aria-live="polite"></p>' +
          '<p class="small muted" style="text-align:center"><a href="#/">Back to sign in</a></p>' +
        "</form>";
    } else {
      auth =
        "<h2>Sign in</h2>" +
        '<form class="form" id="signin-form">' +
          '<label class="field"><span>Email</span><input type="email" name="email" required autocomplete="email"></label>' +
          '<label class="field"><span>Password</span><input type="password" name="password" required autocomplete="current-password"></label>' +
          '<button class="btn btn--primary btn--block" type="submit">Sign in</button>' +
          '<p class="form-status" aria-live="polite"></p>' +
          '<div class="row row--between small"><a href="#/forgot">Forgot password?</a><a href="#/register">New here? Register</a></div>' +
        "</form>" +
        (D.mode === "demo"
          ? '<hr class="divider"><p class="label">Or have a look around first</p>' +
            '<div class="grid" style="grid-template-columns:1fr 1fr">' +
              '<button class="btn" type="button" data-action="demo-as" data-role="family">As a family</button>' +
              '<button class="btn" type="button" data-action="demo-as" data-role="coach">As a coach</button>' +
            "</div>"
          : "") +
        (P.contactEmail ? '<p class="small muted" style="margin-top:1rem">Questions? <a href="mailto:' + esc(P.contactEmail) + '">' + esc(P.contactEmail) + "</a></p>" : "");
    }

    $main.innerHTML =
      '<div class="login">' +
        '<section class="card card--strong auth-card" aria-label="Account">' + auth + "</section>" +
        '<section class="login-brand">' +
          '<h1><img class="login-brand__logo" src="assets/img/logo.webp" width="720" height="721" alt="' + esc(P.name) + '"></h1>' +
          '<p class="kaizen" lang="ja" title="Kaizen: continual improvement">改善</p>' +
          '<p class="kaizen__word">Kaizen</p>' +
        "</section>" +
      "</div>";

    actions["demo-as"] = async function (el) {
      await D.loginAs(el.getAttribute("data-role"));
      go("#/home");
    };
    actions["add-boy"] = function () {
      var wrap = document.getElementById("boys");
      wrap.insertAdjacentHTML("beforeend", boyBlock(wrap.children.length));
    };
    actions["remove-boy"] = function (el) {
      el.closest("[data-boy]").remove();
      Array.prototype.forEach.call(document.querySelectorAll("#boys legend"), function (lg, i) { lg.textContent = "Boy " + (i + 1); });
    };

    onSubmit(document.getElementById("signin-form"), async function (f) {
      await D.signIn(f.email, f.password);
      go("#/home");
    });

    onSubmit(document.getElementById("forgot-form"), async function (f, form) {
      await D.resetPassword(f.email);
      var s = form.querySelector(".form-status");
      s.textContent = D.mode === "demo" ? "Demo mode doesn't send emails — the demo password is demo1234." : "If that email is registered, a reset link is on its way.";
      s.className = "form-status is-ok";
    });

    onSubmit(document.getElementById("register-form"), async function (f, form) {
      if (!form.checkValidity()) {
        var bad = form.querySelector(":invalid");
        if (bad) bad.focus();
        throw new Error(bad && bad.type === "checkbox" ? "Please tick the agreements to continue." : "Please fill in the highlighted fields.");
      }
      if (f.password.length < 8) throw new Error("Password must be at least 8 characters.");
      var boys = Array.prototype.map.call(form.querySelectorAll("[data-boy]"), function (block) {
        var get = function (n) { var el = block.querySelector('[name="' + n + '"]'); return el.type === "checkbox" ? el.checked : el.value.trim(); };
        return {
          first_name: get("first_name"), last_name: get("last_name"),
          year_group: Number(get("year_group")), date_of_birth: get("date_of_birth") || null,
          school: get("school"), medical_notes: get("medical_notes"),
          emergency_name: f.emergency_name || f.parent_name, emergency_phone: f.emergency_phone || f.phone,
          photo_consent: get("photo_consent"),
        };
      });
      var res = await D.signUp({ email: f.email, password: f.password, parent_name: f.parent_name, phone: f.phone, boys: boys });
      if (res.needsConfirmation) {
        $main.innerHTML = '<div class="card" style="max-width:520px;margin:2rem auto;text-align:center">' +
          '<img src="assets/img/logo.webp" alt="" width="160" height="160" style="margin:0 auto .5rem;width:160px;height:auto">' +
          "<h1>Check your email</h1><p class=\"soft\">We've sent a confirmation link to <strong>" + esc(f.email) +
          "</strong>. Click it to finish setting up your account, then sign in.</p></div>";
        return;
      }
      toast("Welcome to " + P.name + "!");
      go("#/home");
    });
  }

  /* ======================================================================
     FAMILY screens
     ====================================================================== */
  function boySwitcher(boys) {
    if (!boys.length) return "";
    if (!boys.some(function (b) { return b.id === state.activeBoy; })) state.activeBoy = boys[0].id;
    if (boys.length < 2) return "";
    actions["pick-boy"] = function (el) { state.activeBoy = el.getAttribute("data-id"); render(); };
    return '<div class="tabs" role="group" aria-label="Choose which son">' + boys.map(function (b) {
      return '<button type="button" data-action="pick-boy" data-id="' + esc(b.id) + '" aria-pressed="' + (b.id === state.activeBoy) + '">' + esc(b.first_name) + "</button>";
    }).join("") + "</div>";
  }
  function noBoys() {
    return '<div class="empty">No boys on this account yet. <a href="#/account">Add one in Account</a>.</div>';
  }

  async function familyHome() {
    var d = await load(["students", "sessions", "attendance", "homework", "submissions", "payments", "rsvps", "attendance_reviews"]);
    var boys = d.students, month = thisMonth();
    var latest = d.sessions.filter(function (s) { return s.published && isPast(s) && s.recap; })[0];
    var next = upcomingDates(1)[0];
    var pending = pendingReviews(d, boys);

    var boyCards = boys.map(function (b) {
      var st = payStatus(b.id, month, d);
      var todo = d.homework.filter(function (h) {
        return !d.submissions.some(function (s) { return s.homework_id === h.id && s.student_id === b.id; });
      }).length;
      return (
        '<div class="card">' +
          '<div class="row row--between"><h3 style="margin:0">' + esc(fullName(b)) + '</h3><span class="muted small">Year ' + esc(b.year_group) + "</span></div>" +
          '<hr class="divider">' +
          '<div class="grid" style="gap:.6rem;grid-template-columns:repeat(3,1fr)">' +
            '<div><div class="stat__num">' + st.attended + '</div><div class="stat__label">Sessions in ' + esc(monthLabel(month).split(" ")[0]) + "</div></div>" +
            '<div><div class="stat__num">' + todo + '</div><div class="stat__label">Homework to do</div></div>' +
            '<div><div style="margin:.55rem 0 .35rem">' + payBadge(st) + '</div><div class="stat__label">Payments</div></div>' +
          "</div>" +
        "</div>"
      );
    }).join("");

    var dueSoon = d.homework.filter(function (h) {
      return boys.some(function (b) {
        return !d.submissions.some(function (s) { return s.homework_id === h.id && s.student_id === b.id; });
      });
    }).slice(0, 4);

    $main.innerHTML =
      '<div class="page-head"><div><h1>Salaam, ' +
        esc(boys.length ? joinNames(boys.map(function (b) { return b.first_name; })) : firstWord(state.me.profile.parent_name)) +
      '</h1><p class="sub">Here\'s what\'s coming up and what you\'ve got left to do.</p></div></div>' +
      (pending.length
        ? '<div class="card card--accent" style="margin-bottom:1rem"><h2>Please check the register</h2>' +
            '<p class="soft small">The coaches took the register at these sessions. Confirm it\'s right, or tell us if something\'s wrong. It\'s what we charge from.</p>' +
            '<div class="stack stack--tight">' + pending.slice(0, 6).map(function (x) { return reviewRow(x.session, x.boy, x.rv, true); }).join("") + "</div>" +
            (pending.length > 6 ? '<p class="small" style="margin:.8rem 0 0"><a href="#/sessions">See all ' + pending.length + "</a></p>" : "") +
          "</div>"
        : "") +
      (next ? upcomingCard(next, d, boys) : "") +
      (latest
        ? '<a class="card card--art card--link" href="#/sessions" style="margin-top:1rem">' + recapArt(latest) +
            '<p class="label">Latest recap, ' + esc(fmtDate(latest.date)) + "</p>" +
            "<h3>" + esc(latest.title) + "</h3>" +
            '<p class="soft small" style="margin:.3rem 0 .6rem">' + esc(String(latest.recap || "").slice(0, 200)) + (String(latest.recap || "").length > 200 ? "…" : "") + "</p>" +
            pillarChips(latest.pillars) + "</a>"
        : "") +
      '<h2 class="section-title">Your boys</h2>' +
      (boys.length ? '<div class="grid grid-2">' + boyCards + "</div>" : noBoys()) +
      '<h2 class="section-title">Homework</h2>' +
      (dueSoon.length
        ? '<div class="grid grid-2">' + dueSoon.map(function (h) {
            return '<a class="card card--link" href="#/homework"><div class="row row--between"><h3 style="margin:0">' + esc(h.title) + "</h3>" +
              (h.due_date ? '<span class="small muted">Due ' + esc(fmtDate(h.due_date)) + "</span>" : "") + "</div>" +
              '<div style="margin-top:.5rem">' + pillarChips(h.pillar ? [h.pillar] : []) + "</div></a>";
          }).join("") + "</div>"
        : '<div class="empty">All homework handed in. Well done!</div>');
    bindFamilyAttendance();
  }

  async function familySessions() {
    var d = await load(["students", "sessions", "attendance", "homework", "payments", "rsvps", "attendance_reviews"]);
    var boys = d.students;
    var coming = upcomingDates(2);
    var pending = pendingReviews(d, boys);
    var past = d.sessions.filter(function (s) { return s.published && isPast(s); });

    var recaps = past.map(function (s) {
      var hw = d.homework.filter(function (h) { return h.session_id === s.id; });
      var checks = boys.filter(function (b) { return needsReview(s, b); }).map(function (b) { return reviewRow(s, b, reviewOf(s, b, d)); }).join("");
      return (
        '<article class="card card--art">' + recapArt(s) +
          '<div class="card__meta"><span>' + esc(fmtDate(s.date, true)) + "</span><span>" + esc(s.location) + "</span></div>" +
          "<h2>" + esc(s.title) + "</h2>" +
          '<div style="margin-bottom:.7rem">' + pillarChips(s.pillars) + "</div>" +
          (s.recap ? '<p class="recap__body">' + esc(s.recap) + "</p>" : '<p class="muted small">The coaches haven\'t written this one up yet.</p>') +
          ((s.takeaways || []).length ? '<p class="label" style="margin-top:1rem">Worth remembering</p><ul class="takeaways">' +
            s.takeaways.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" : "") +
          (hw.length ? '<p class="small" style="margin-top:.8rem">Homework set: ' + hw.map(function (h) { return '<a href="#/homework">' + esc(h.title) + "</a>"; }).join(", ") + "</p>" : "") +
          (checks ? '<hr class="divider"><p class="label">Register</p><div class="stack stack--tight">' + checks + "</div>" : "") +
          '<div class="row" style="margin-top:1rem"><a class="btn btn--sm" href="#/feedback?session=' + esc(s.id) + '">' + icon("chat") + "Give feedback</a></div>" +
        "</article>"
      );
    }).join("");

    $main.innerHTML =
      '<div class="page-head"><div><h1>Sessions</h1><p class="sub">What\'s coming up, and what we got up to.</p></div></div>' +
      (pending.length
        ? '<div class="card card--accent" style="margin-bottom:1rem"><h2>Please check the register</h2>' +
            '<p class="soft small">Confirm each one is right, or tell us what\'s wrong.</p>' +
            '<div class="stack stack--tight">' + pending.map(function (x) { return reviewRow(x.session, x.boy, x.rv, true); }).join("") + "</div></div>"
        : "") +
      '<h2 class="section-title" style="margin-top:0">Coming up</h2>' +
      '<div class="stack">' + coming.map(function (u, i) { return upcomingCard(u, d, boys, i ? "After that" : "Next session"); }).join("") + "</div>" +
      '<h2 class="section-title">Past sessions</h2>' +
      (recaps ? '<div class="stack">' + recaps + "</div>" : '<div class="empty">No sessions yet. Check back after the first one.</div>');
    bindFamilyAttendance();
  }

  /* A formal confirmation that a boy is signed up for an evening and it's paid. */
  async function viewConfirmation(params) {
    var d = await load(["students", "profiles", "sessions", "attendance", "payments", "rsvps"]);
    var boy = d.students.find(function (b) { return b.id === params.boy; }) || d.students[0];
    var u = upcomingDates(8).find(function (x) { return x.date === params.date; }) || upcomingDates(1)[0];
    if (!boy || !u) { $main.innerHTML = '<div class="empty">Nothing to confirm yet.</div>'; return; }
    var date = u.date;
    var plan = planFor(date, d.sessions);
    var parent = d.profiles.find(function (p) { return p.id === boy.family_id; }) || state.me.profile;
    var r = rsvpOf(boy, date, d), cov = coverage(boy, date, d);
    var signedUp = !!(r && r.going), ok = signedUp && cov.paid;
    var row = function (k, v) { return "<div><dt>" + esc(k) + "</dt><dd>" + v + "</dd></div>"; };

    $main.innerHTML =
      '<div class="confirmation card card--strong">' +
        '<div class="confirmation__head">' +
          '<img src="assets/img/logo-small.png" alt="" width="72" height="72">' +
          '<div><p class="label">Booking confirmation</p><h1>' + (ok ? "Signed up and paid" : "Not confirmed yet") + "</h1></div>" +
          (ok ? badge("Confirmed", "ok") : badge("Action needed", "warn")) +
        "</div>" +
        '<dl class="confirmation__grid">' +
          row("Name", esc(fullName(boy)) + ", Year " + esc(boy.year_group)) +
          row("Parent or guardian", esc(parent.parent_name || parent.email || "")) +
          row("Session", esc(plan && plan.title ? plan.title : P.name + " session")) +
          row("Date", esc(fmtDate(date, true))) +
          row("Time", esc(time12(u.slot.start) + " to " + time12(u.slot.end))) +
          row("Place", esc(plan ? plan.location : (P.locations || []).join(" or "))) +
          row("Attending", signedUp ? "Yes, confirmed by " + esc(firstWord(parent.parent_name) || "parent") + " on " + esc(fmtStamp(r.updated_at)) : esc(r ? "No, not coming" : "Not confirmed yet")) +
          row("Payment", esc(cov.text)) +
          row("Reference", "<strong>" + esc(bookingRef(boy, date)) + "</strong>") +
          row("Member since", esc(fmtDate(registeredOn(boy), true))) +
        "</dl>" +
        (ok
          ? '<p class="confirmation__note">This confirms that ' + esc(boy.first_name) + " is signed up for this session and it has been paid for. Show this page if asked.</p>"
          : '<p class="confirmation__note">To confirm this booking: ' +
              [!signedUp ? 'tell us he\'s coming on the <a href="#/sessions">Sessions</a> page' : "", !cov.paid ? 'pay on the <a href="#/payments">Payments</a> page' : ""].filter(Boolean).join(", and ") + ".</p>") +
        '<div class="row no-print"><button class="btn btn--primary" type="button" data-action="print">Print or save as PDF</button>' +
          '<a class="btn btn--ghost" href="#/sessions">Back to sessions</a></div>' +
      "</div>";
    actions.print = function () { window.print(); };
  }

  async function familyHomework() {
    var d = await load(["students", "sessions", "homework", "submissions"]);
    var boys = d.students;
    var switcher = boySwitcher(boys);
    var boy = boys.find(function (b) { return b.id === state.activeBoy; });
    var sessions = byId(d.sessions);

    var list = !boy ? noBoys() : d.homework.length ? d.homework.map(function (h) {
      var sub = d.submissions.find(function (s) { return s.homework_id === h.id && s.student_id === boy.id; });
      var st = hwStatus(h, sub);
      var form =
        '<form class="form hw-form" data-hw="' + esc(h.id) + '">' +
          '<label class="field"><span>' + (sub ? "Your answer" : "Write your answer") + '</span><textarea name="answer" required rows="5">' + esc(sub ? sub.answer : "") + "</textarea></label>" +
          '<div class="row"><button class="btn btn--primary btn--sm" type="submit">' + icon("check") + (sub ? "Update answer" : "Hand in") + "</button>" +
          (sub && sub.status === "reviewed" ? '<span class="small muted">Updating sends it back to the coach for review.</span>' : "") + "</div>" +
          '<p class="form-status" aria-live="polite"></p>' +
        "</form>";
      return (
        '<article class="card">' +
          '<div class="row row--between"><h2 style="margin:0">' + esc(h.title) + "</h2>" + badge(st.label, st.kind) + "</div>" +
          '<div class="card__meta" style="margin-top:.4rem">' +
            (h.due_date ? "<span>Due " + esc(fmtDate(h.due_date, true)) + "</span>" : "") +
            (h.session_id && sessions[h.session_id] ? "<span>From: " + esc(sessions[h.session_id].title) + "</span>" : "") +
          "</div>" +
          (h.pillar ? '<div style="margin-bottom:.6rem">' + pillarChips([h.pillar]) + "</div>" : "") +
          '<p class="recap__body">' + esc(h.instructions) + "</p>" +
          (sub && sub.status === "reviewed"
            ? '<p class="label" style="margin-top:1rem">Your answer</p><div class="quote">' + esc(sub.answer) + "</div>" +
              (sub.coach_comment ? '<p class="label" style="margin-top:1rem">From the coach</p><div class="quote quote--coach">' + esc(sub.coach_comment) + "</div>" : "") +
              '<details class="disclose"><summary>Edit my answer</summary><div>' + form + "</div></details>"
            : '<hr class="divider">' + form) +
        "</article>"
      );
    }).join("") : '<div class="empty">No homework has been set yet.</div>';

    $main.innerHTML =
      '<div class="page-head"><div><h1>Homework' + (boy && boys.length > 1 ? " for " + esc(boy.first_name) : "") + '</h1><p class="sub">Write your answer, hand it in, and the coaches will get back to you.</p></div>' + switcher + "</div>" +
      '<div class="stack">' + list + "</div>";

    Array.prototype.forEach.call($main.querySelectorAll(".hw-form"), function (form) {
      onSubmit(form, async function (f) {
        if (!f.answer) throw new Error("Write something before handing in.");
        await D.upsert("submissions", {
          homework_id: form.getAttribute("data-hw"), student_id: boy.id, answer: f.answer,
          status: "submitted", coach_comment: null, reviewed_at: null, submitted_at: new Date().toISOString(),
        }, "homework_id,student_id");
        toast("Handed in — nice work, " + boy.first_name + "!");
        render();
      });
    });
  }

  async function familyFeedback(params) {
    var d = await load(["students", "sessions", "feedback"]);
    var boys = d.students;
    var sessions = byId(d.sessions);
    var switcher = boySwitcher(boys);

    var sessionOpts = '<option value="">General feedback (not about one session)</option>' +
      d.sessions.slice(0, 12).map(function (s) {
        return '<option value="' + esc(s.id) + '"' + (params.session === s.id ? " selected" : "") + ">" + esc(fmtDate(s.date) + " — " + s.title) + "</option>";
      }).join("");
    var starInputs = "";
    for (var i = 5; i >= 1; i--) {
      starInputs += '<input type="radio" id="star' + i + '" name="rating" value="' + i + '"><label for="star' + i + '" title="' + i + ' star' + (i > 1 ? "s" : "") + '">★</label>';
    }

    var history = d.feedback.map(function (f) {
      var boy = boys.find(function (b) { return b.id === f.student_id; });
      return (
        '<div class="card">' +
          '<div class="row row--between">' + starsStatic(f.rating) + '<span class="small muted">' + esc(fmtStamp(f.created_at)) + "</span></div>" +
          '<div class="card__meta" style="margin-top:.3rem"><span>' + esc(f.session_id && sessions[f.session_id] ? sessions[f.session_id].title : "General") + "</span>" +
            (boy ? "<span>From " + esc(boy.first_name) + "</span>" : "") + (f.anonymous ? "<span>Name hidden</span>" : "") + "</div>" +
          (f.enjoyed ? '<p class="small"><strong>Enjoyed:</strong> ' + esc(f.enjoyed) + "</p>" : "") +
          (f.improve ? '<p class="small" style="margin:0"><strong>Could be better:</strong> ' + esc(f.improve) + "</p>" : "") +
        "</div>"
      );
    }).join("");

    $main.innerHTML =
      '<div class="page-head"><div><h1>Feedback</h1><p class="sub">Tell us what worked and what didn\'t. We read every one.</p></div>' + switcher + "</div>" +
      '<div class="grid grid-2" style="align-items:start">' +
        '<form class="card card--accent form" id="feedback-form">' +
          "<h2>How was it" + (state.activeBoy && boys.length ? ", " + esc((boys.find(function (b) { return b.id === state.activeBoy; }) || {}).first_name) : "") + "?</h2>" +
          '<label class="field"><span>Which session?</span><select name="session_id">' + sessionOpts + "</select></label>" +
          '<div class="field"><span>Rating <span class="req">*</span></span><div class="stars">' + starInputs + "</div></div>" +
          '<label class="field"><span>What did you enjoy?</span><textarea name="enjoyed" rows="3"></textarea></label>' +
          '<label class="field"><span>What could be better?</span><textarea name="improve" rows="3"></textarea></label>' +
          '<label class="check"><input type="checkbox" name="anonymous"> Hide my name from the coaches</label>' +
          '<button class="btn btn--primary" type="submit">Send feedback</button>' +
          '<p class="form-status" aria-live="polite"></p>' +
        "</form>" +
        '<div><h2>Sent</h2><div class="stack">' + (history || '<div class="empty">Nothing sent yet.</div>') + "</div></div>" +
      "</div>";

    onSubmit(document.getElementById("feedback-form"), async function (f) {
      if (!f.rating) throw new Error("Pick a star rating.");
      await D.insert("feedback", {
        family_id: state.me.user.id, student_id: state.activeBoy || null, session_id: f.session_id || null,
        rating: Number(f.rating), enjoyed: f.enjoyed, improve: f.improve, anonymous: f.anonymous,
      });
      toast("Thank you — your feedback has been sent.");
      go("#/feedback");
    });
  }

  async function familyPayments(params) {
    if (params.paid) toast("Thank you! Your payment can take a minute to appear here.");
    var d = await load(["students", "sessions", "attendance", "payments"]);
    var boys = d.students, month = thisMonth();
    var focusBoy = params.boy;
    var linksReady = D.mode === "demo" || (CFG.stripe && (CFG.stripe.sessionLink || CFG.stripe.monthLink));
    var monthOpts = [0, 1].map(function (n) {
      var m = addMonths(month, n);
      return '<option value="' + m + '">' + esc(monthLabel(m)) + "</option>";
    }).join("");

    var cards = boys.map(function (b) {
      var st = payStatus(b.id, month, d);
      return (
        '<div class="card' + (b.id === focusBoy ? " card--accent pay-focus" : "") + '" id="pay-' + esc(b.id) + '">' +
          '<div class="row row--between"><h3 style="margin:0">' + esc(fullName(b)) + "</h3>" + payBadge(st) + "</div>" +
          '<p class="small muted" style="margin:.4rem 0 .9rem">' + esc(monthLabel(month)) + ": attended " + st.attended + " session" + (st.attended === 1 ? "" : "s") +
            (st.monthPaid ? " — covered by the monthly pass." : st.attended * P.prices.sessionPence > P.prices.monthPence ? " — a monthly pass would have been cheaper." : ".") + "</p>" +
          (linksReady
            ? '<div class="pay-actions">' +
                '<button class="btn" type="button" data-action="pay" data-kind="session" data-boy="' + esc(b.id) + '">Pay as you go · ' + money(P.prices.sessionPence) + "/session</button>" +
                '<div class="row"><select aria-label="Month for the monthly pass" data-month-for="' + esc(b.id) + '">' + monthOpts + "</select>" +
                '<button class="btn btn--primary" type="button" data-action="pay" data-kind="month" data-boy="' + esc(b.id) + '">Monthly pass · ' + money(P.prices.monthPence) + "</button></div>" +
              "</div>"
            : '<p class="small soft" style="margin:0">Online payment isn\'t switched on yet — please pay the coaches in person.</p>') +
        "</div>"
      );
    }).join("");

    var boyNames = byId(boys);
    var rows = d.payments.map(function (p) {
      return "<tr><td>" + esc(fmtStamp(p.created_at)) + "</td><td>" + esc(boyNames[p.student_id] ? boyNames[p.student_id].first_name : "—") + "</td><td>" +
        esc(p.kind === "month" ? "Monthly pass · " + monthLabel(p.period) : "Session · " + monthLabel(p.period)) + "</td><td>" +
        money(p.amount_pence) + (p.status === "refunded" ? " " + badge("Refunded", "mute") : "") + "</td><td>" + esc(methodLabel(p.method)) + "</td></tr>";
    }).join("");

    $main.innerHTML =
      '<div class="page-head"><div><h1>Payments</h1><p class="sub">' + money(P.prices.sessionPence) + " a session, or " + money(P.prices.monthPence) + ' for the whole month.</p></div></div>' +
      (boys.length ? '<div class="grid grid-2">' + cards + "</div>" : noBoys()) +
      '<h2 class="section-title">History</h2>' +
      (rows ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Boy</th><th>For</th><th>Amount</th><th>Method</th></tr></thead><tbody>' + rows + "</tbody></table></div>"
            : '<div class="empty">No payments yet.</div>');

    actions.pay = async function (el) {
      var kind = el.getAttribute("data-kind"), boyId = el.getAttribute("data-boy");
      var sel = $main.querySelector('[data-month-for="' + boyId + '"]');
      var period = kind === "month" && sel ? sel.value : month;
      var amount = kind === "month" ? P.prices.monthPence : P.prices.sessionPence;

      if (D.mode === "demo") {
        if (!confirm("Demo mode: pretend to pay " + money(amount) + " by card?")) return;
        await D.insert("payments", { family_id: state.me.user.id, student_id: boyId, kind: kind, period: period, amount_pence: amount, method: "stripe", status: "paid" });
        toast("Demo payment recorded.");
        return render();
      }
      var link = kind === "month" ? CFG.stripe.monthLink : CFG.stripe.sessionLink;
      if (!link) throw new Error("That payment option isn't switched on yet — please pay the coaches in person.");
      var url = new URL(link);
      url.searchParams.set("client_reference_id", boyId + "_" + period);
      url.searchParams.set("prefilled_email", state.me.user.email);
      location.href = url.toString();
    };
  }

  /* ---- account (shared by families and coaches) ------------------------ */
  function boyEditForm(b) {
    var years = (P.yearGroups || []).map(function (y) { return '<option value="' + y + '"' + (Number(b.year_group) === y ? " selected" : "") + ">Year " + y + "</option>"; }).join("");
    return (
      '<form class="form boy-form" data-id="' + esc(b.id || "") + '">' +
        '<div class="cols-2">' +
          '<label class="field"><span>First name</span><input type="text" name="first_name" required value="' + esc(b.first_name) + '"></label>' +
          '<label class="field"><span>Last name</span><input type="text" name="last_name" required value="' + esc(b.last_name) + '"></label>' +
        "</div>" +
        '<div class="cols-2">' +
          '<label class="field"><span>School year</span><select name="year_group" required><option value="">Choose…</option>' + years + "</select></label>" +
          '<label class="field"><span>Date of birth</span><input type="date" name="date_of_birth" value="' + esc(b.date_of_birth || "") + '"></label>' +
        "</div>" +
        '<label class="field"><span>School</span><input type="text" name="school" value="' + esc(b.school) + '"></label>' +
        '<label class="field"><span>Medical needs or allergies</span><textarea name="medical_notes" rows="2">' + esc(b.medical_notes) + "</textarea></label>" +
        '<div class="cols-2">' +
          '<label class="field"><span>Emergency contact</span><input type="text" name="emergency_name" value="' + esc(b.emergency_name) + '"></label>' +
          '<label class="field"><span>Emergency number</span><input type="tel" name="emergency_phone" value="' + esc(b.emergency_phone) + '"></label>' +
        "</div>" +
        '<label class="check"><input type="checkbox" name="photo_consent"' + (b.photo_consent ? " checked" : "") + "> Photo consent</label>" +
        '<div class="row"><button class="btn btn--primary btn--sm" type="submit">' + (b.id ? "Save changes" : "Add boy") + "</button></div>" +
        '<p class="form-status" aria-live="polite"></p>' +
      "</form>"
    );
  }
  function boyRow(f) {
    return {
      first_name: f.first_name, last_name: f.last_name, year_group: Number(f.year_group),
      date_of_birth: f.date_of_birth || null, school: f.school, medical_notes: f.medical_notes,
      emergency_name: f.emergency_name, emergency_phone: f.emergency_phone, photo_consent: f.photo_consent,
    };
  }

  async function viewAccount(params) {
    var isCoach = state.me.profile.role === "coach";
    var boys = isCoach ? [] : await D.list("students", { eq: { family_id: state.me.user.id }, order: "first_name" });
    var p = state.me.profile;

    $main.innerHTML =
      '<div class="page-head"><div><h1>Account</h1><p class="sub">Signed in as ' + esc(state.me.user.email) + "</p></div></div>" +
      (params.recover ? '<div class="card card--accent" style="margin-bottom:1rem">Choose a new password below to finish resetting it.</div>' : "") +
      '<div class="grid grid-2" style="align-items:start">' +
        '<div class="stack">' +
          '<form class="card form" id="profile-form"><h2>' + (isCoach ? "Your details" : "Parent / guardian") + "</h2>" +
            '<label class="field"><span>Name</span><input type="text" name="parent_name" required value="' + esc(p.parent_name) + '"></label>' +
            '<label class="field"><span>Mobile</span><input type="tel" name="phone" value="' + esc(p.phone) + '"></label>' +
            '<div><button class="btn btn--primary btn--sm" type="submit">Save</button></div>' +
            '<p class="form-status" aria-live="polite"></p></form>' +
          '<form class="card form" id="password-form"><h2>Password</h2>' +
            '<label class="field"><span>New password</span><input type="password" name="password" required minlength="8" autocomplete="new-password"></label>' +
            '<div><button class="btn btn--sm" type="submit">Change password</button></div>' +
            '<p class="form-status" aria-live="polite"></p></form>' +
        "</div>" +
        (isCoach ? '<div class="card"><h2>Coach tools</h2><p class="soft">Write recaps in <a href="#/sessions">Sessions</a>, set and mark work in <a href="#/homework">Homework</a>, and keep the register and payments in <a href="#/members">Members</a>.</p></div>' :
        '<div class="stack"><h2>Your boys</h2>' +
          boys.map(function (b) {
            return '<div class="card"><details class="disclose"><summary><strong>' + esc(fullName(b)) + "</strong> · Year " + esc(b.year_group) + "</summary><div>" + boyEditForm(b) + "</div></details></div>";
          }).join("") +
          '<div class="card card--accent"><details class="disclose"' + (boys.length ? "" : " open") + "><summary><strong>Add a boy</strong></summary><div>" +
            boyEditForm({ emergency_name: p.parent_name, emergency_phone: p.phone }) + "</div></details></div>" +
        "</div>") +
      "</div>";

    onSubmit(document.getElementById("profile-form"), async function (f, form) {
      await D.update("profiles", state.me.user.id, { parent_name: f.parent_name, phone: f.phone });
      await D.refreshMe();
      state.me = D.me();
      renderChrome("account");
      var s = form.querySelector(".form-status"); s.textContent = "Saved."; s.className = "form-status is-ok";
    });
    onSubmit(document.getElementById("password-form"), async function (f, form) {
      if (f.password.length < 8) throw new Error("Use at least 8 characters.");
      await D.updatePassword(f.password);
      form.reset();
      var s = form.querySelector(".form-status"); s.textContent = "Password changed."; s.className = "form-status is-ok";
    });
    Array.prototype.forEach.call($main.querySelectorAll(".boy-form"), function (form) {
      onSubmit(form, async function (f) {
        if (!f.first_name || !f.last_name || !f.year_group) throw new Error("Name and school year are required.");
        var id = form.getAttribute("data-id");
        if (id) await D.update("students", id, boyRow(f));
        else await D.insert("students", Object.assign({ family_id: state.me.user.id }, boyRow(f)));
        toast(id ? "Saved." : f.first_name + " has been added.");
        render();
      });
    });
  }

  /* ======================================================================
     COACH screens
     ====================================================================== */
  async function coachHome() {
    var d = await load(["students", "sessions", "attendance", "homework", "submissions", "feedback", "payments", "rsvps", "attendance_reviews"]);
    var month = thisMonth();
    var next = upcomingDates(1)[0];
    var nextPlan = next ? planFor(next.date, d.sessions) : null;
    var flagged = d.attendance_reviews.filter(function (r) { return r.status === "disputed"; });
    var owing = d.students.map(function (b) { return payStatus(b.id, month, d); }).filter(function (s) { return s.owed > 0; });
    var toReview = d.submissions.filter(function (s) { return s.status === "submitted"; });
    var cutoff = new Date(Date.now() - 30 * 864e5).toISOString();
    var recentFb = d.feedback.filter(function (f) { return f.created_at >= cutoff; });
    var avg = recentFb.length ? (sum(recentFb, "rating") / recentFb.length).toFixed(1) : "—";
    var students = byId(d.students), hw = byId(d.homework), sessions = byId(d.sessions);
    var drafts = d.sessions.filter(function (s) { return !s.published; });

    $main.innerHTML =
      '<div class="page-head"><div><h1>Dashboard</h1><p class="sub">The state of things at a glance.</p></div>' +
        '<div class="row"><a class="btn btn--primary" href="#/sessions?new=1">' + icon("plus") + "Session recap</a>" +
        '<a class="btn" href="#/homework?new=1">' + icon("plus") + "Set homework</a></div></div>" +
      '<div class="grid grid-4">' +
        '<div class="card stat"><div class="stat__num">' + d.students.length + '</div><div class="stat__label">Boys registered</div></div>' +
        '<a class="card stat" href="#/members" style="text-decoration:none;color:inherit"><div class="stat__num">' + money(sum(owing, "owed")) + '</div><div class="stat__label">Owed · ' + owing.length + " boy" + (owing.length === 1 ? "" : "s") + "</div></a>" +
        '<a class="card stat" href="#/homework" style="text-decoration:none;color:inherit"><div class="stat__num">' + toReview.length + '</div><div class="stat__label">Answers to review</div></a>' +
        '<a class="card stat" href="#/feedback" style="text-decoration:none;color:inherit"><div class="stat__num">' + avg + '</div><div class="stat__label">Avg rating · 30 days</div></a>' +
      "</div>" +
      '<div class="grid grid-2" style="margin-top:1rem;align-items:start">' +
        '<div class="stack">' + (next
          ? '<div class="card card--art">' + artFor("next-" + next.date, "dusk", nextPlan ? sceneFor(nextPlan) : artScene("next-" + next.date)) +
              '<p class="label">Next session</p><div class="next-up__when">' + esc(whenLabel(next)) + "</div>" +
              (nextPlan && nextPlan.title ? '<p class="theme">' + esc(nextPlan.title) + "</p>" : '<p class="small muted">No plan yet.</p>') +
              replySummary(next.date, d, sortBoys(d.students)) +
              '<div class="row" style="margin-top:.8rem">' + (nextPlan
                ? '<a class="btn btn--sm" href="#/sessions?edit=' + esc(nextPlan.id) + '">Edit the plan</a>'
                : '<a class="btn btn--primary btn--sm" href="#/sessions?new=1&date=' + esc(next.date) + '">Plan this session</a>') + "</div>" +
            "</div>"
          : "") +
          (drafts.length ? '<div class="card"><h2>Unpublished recaps</h2>' + drafts.map(function (s) {
            return '<p class="small" style="margin:.2rem 0"><a href="#/sessions?edit=' + esc(s.id) + '">' + esc(fmtDate(s.date) + " — " + s.title) + "</a></p>";
          }).join("") + "</div>" : "") +
          '<div class="card"><h2>Needs your attention</h2>' + (flagged.length || toReview.length
            ? flagged.map(function (r) {
                var s = sessions[r.session_id];
                return '<p class="small" style="margin:.2rem 0">' + badge("Register flagged", "bad") + ' <a href="#/sessions?open=' + esc(r.session_id) + '">' +
                  esc(fullName(students[r.student_id])) + "</a> — " + esc(s ? fmtDate(s.date) : "") + "</p>";
              }).join("") +
              toReview.slice(0, 6).map(function (s) {
                return '<p class="small" style="margin:.2rem 0">' + badge("Homework", "mute") + ' <a href="#/homework?open=' + esc(s.homework_id) + '">' + esc(fullName(students[s.student_id])) + "</a> — " + esc(hw[s.homework_id] ? hw[s.homework_id].title : "") + "</p>";
              }).join("")
            : '<p class="muted small">All caught up.</p>') + "</div>" +
        "</div>" +
        '<div class="card"><h2>Latest feedback</h2>' + (d.feedback.length ? d.feedback.slice(0, 4).map(function (f) {
          return '<div style="margin-bottom:.8rem">' + starsStatic(f.rating) + ' <span class="small muted">' +
            esc((f.anonymous ? "Name hidden" : fullName(students[f.student_id])) + " · " + (f.session_id && sessions[f.session_id] ? sessions[f.session_id].title : "General")) + "</span>" +
            (f.enjoyed ? '<p class="small" style="margin:.2rem 0 0">' + esc(f.enjoyed) + "</p>" : "") +
            (f.improve ? '<p class="small soft" style="margin:.1rem 0 0">Better: ' + esc(f.improve) + "</p>" : "") + "</div>";
        }).join("") : '<p class="muted small">No feedback yet.</p>') + "</div>" +
      "</div>";
  }

  function sortBoys(boys) {
    return boys.slice().sort(function (a, b) {
      return a.year_group - b.year_group || fullName(a).localeCompare(fullName(b));
    });
  }

  async function coachSessions(params) {
    var d = await load(["students", "sessions", "attendance", "rsvps", "attendance_reviews"]);
    var editing = params.edit ? d.sessions.find(function (s) { return s.id === params.edit; }) : null;
    var showEditor = params.new || editing;
    var boys = sortBoys(d.students);
    var s = editing || {
      date: params.date || todayISO(), location: (P.locations || [])[0], pillars: [], takeaways: [], published: true,
      timetable: P.defaultTimetable || [], bring: P.defaultBring || [],
    };
    s.register_taken = editing ? !!editing.register_taken : s.date <= todayISO();
    // Tick from the register if there is one; for a new session, from who said they're coming.
    var present = {};
    if (editing) d.attendance.forEach(function (a) { if (a.session_id === editing.id && a.present) present[a.student_id] = true; });
    else if (s.register_taken) boys.forEach(function (b) { var r = rsvpOf(b, s.date, d); if (r && r.going) present[b.id] = true; });
    var next = upcomingDates(1)[0];
    var nextPlan = next ? planFor(next.date, d.sessions) : null;
    var planHref = nextPlan ? "#/sessions?edit=" + nextPlan.id : next ? "#/sessions?new=1&date=" + next.date : "#/sessions?new=1";

    var editor = !showEditor ? "" :
      '<form class="card card--accent form" id="session-form" style="margin-bottom:1.5rem">' +
        "<h2>" + (editing ? "Edit session" : s.date > todayISO() ? "Plan a session" : "New session") + "</h2>" +
        '<div class="cols-2">' +
          '<label class="field"><span>Date</span><input type="date" name="date" required value="' + esc(s.date) + '"></label>' +
          '<label class="field"><span>Location</span><select name="location">' + (P.locations || []).map(function (l) {
            return "<option" + (l === s.location ? " selected" : "") + ">" + esc(l) + "</option>";
          }).join("") + "</select></label>" +
        "</div>" +
        '<label class="field"><span>Theme</span><input type="text" name="title" required value="' + esc(s.title) + '" placeholder="e.g. Takedowns & the meaning of sabr"></label>' +
        '<div class="field"><span>Pillars</span><div class="checks">' + (CFG.pillars || []).map(function (p) {
          return '<label class="check"><input type="checkbox" name="pillars" data-multi value="' + esc(p.key) + '"' + (s.pillars.indexOf(p.key) !== -1 ? " checked" : "") + "> " + esc(p.label) + "</label>";
        }).join("") + "</div></div>" +
        "<fieldset><legend>Plan</legend>" +
          '<div class="cols-2">' +
            '<label class="field"><span>Timetable</span><textarea name="timetable" rows="7" placeholder="19:00 Arrive and warm-up">' + esc(timetableText(s.timetable)) + "</textarea><small>One line each: a time, then what happens.</small></label>" +
            '<label class="field"><span>What to bring</span><textarea name="bring" rows="7" placeholder="Water bottle">' + esc((s.bring || []).join("\n")) + "</textarea><small>One item per line.</small></label>" +
          "</div>" +
        "</fieldset>" +
        '<label class="field"><span>What we did (the recap, after the session)</span><textarea name="recap" rows="6" placeholder="A few sentences parents and boys can read afterwards.">' + esc(s.recap) + "</textarea></label>" +
        '<label class="field"><span>Key takeaways</span><textarea name="takeaways" rows="3" placeholder="One per line">' + esc((s.takeaways || []).join("\n")) + "</textarea></label>" +
        "<fieldset><legend>Register</legend>" +
          (boys.length ? '<div class="row"><button type="button" class="btn btn--sm" data-action="tick-all">Tick all</button><button type="button" class="btn btn--ghost btn--sm" data-action="tick-none">Clear</button></div>' +
            '<div class="checks">' + boys.map(function (b) {
              var r = rsvpOf(b, s.date, d);
              return '<label class="check"><input type="checkbox" name="present" data-multi value="' + esc(b.id) + '"' + (present[b.id] ? " checked" : "") + "> " + esc(fullName(b)) +
                ' <span class="muted small">Y' + esc(b.year_group) + (r ? (r.going ? " · said coming" : " · said not coming" + (r.reason ? ": " + esc(r.reason) : "")) : "") + "</span></label>";
            }).join("") + "</div>"
            : '<p class="muted small">No boys registered yet.</p>') +
          '<label class="check"><input type="checkbox" name="register_taken"' + (s.register_taken ? " checked" : "") + "> I've taken the register. Parents will be asked to confirm it, and attendance is charged from it.</label>" +
        "</fieldset>" +
        '<label class="check"><input type="checkbox" name="published"' + (s.published ? " checked" : "") + "> Show to families (hidden sessions are only visible to coaches)</label>" +
        '<div class="row"><button class="btn btn--primary" type="submit">Save</button><a class="btn btn--ghost" href="#/sessions">Cancel</a></div>' +
        '<p class="form-status" aria-live="polite"></p>' +
      "</form>";

    function sessionCard(x) {
      var past = isPast(x);
      var count = d.attendance.filter(function (a) { return a.session_id === x.id && a.present; }).length;
      return (
        '<article class="card">' +
          '<div class="row row--between"><div class="card__meta" style="margin:0"><span>' + esc(fmtDate(x.date, true)) + "</span><span>" + esc(x.location) + "</span>" +
            (x.register_taken ? "<span>" + count + " attended</span>" : "") + "</div>" +
            (x.published ? badge(past ? "Published" : "Shown to families", "ok") : badge("Hidden", "warn")) + "</div>" +
          '<h3 style="margin:.5rem 0">' + esc(x.title) + "</h3>" + pillarChips(x.pillars) +
          (past
            ? (x.recap || (x.takeaways || []).length ? '<details class="disclose" style="margin-top:.6rem"><summary>Recap</summary><div><p class="recap__body small">' + esc(x.recap) + "</p>" +
                ((x.takeaways || []).length ? '<ul class="takeaways small">' + x.takeaways.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" : "") + "</div></details>"
                : '<p class="small muted" style="margin:.6rem 0 0">No recap written yet.</p>') +
              (x.register_taken ? checkSummary(x, d, boys, params.open === x.id) : '<p class="small" style="margin:.6rem 0 0">' + badge("Register not taken", "warn") + "</p>")
            : ((x.timetable || []).length ? '<details class="disclose" style="margin-top:.6rem"><summary>Timetable and kit list</summary><div class="plan-grid">' +
                "<div>" + timetableHtml(x.timetable) + "</div><div><ul class=\"takeaways small\">" + (x.bring || []).map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></div></div></details>" : "") +
              '<div style="margin-top:.6rem">' + replySummary(x.date, d, boys) + "</div>") +
          '<div class="row" style="margin-top:.8rem"><a class="btn btn--sm" href="#/sessions?edit=' + esc(x.id) + '">' + (past ? "Edit recap and register" : "Edit plan") + "</a>" +
            '<button class="btn btn--sm btn--danger" type="button" data-action="delete-session" data-id="' + esc(x.id) + '">Delete</button></div>' +
        "</article>"
      );
    }
    var upcoming = d.sessions.filter(function (x) { return !isPast(x); }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var past = d.sessions.filter(isPast);

    $main.innerHTML =
      '<div class="page-head"><div><h1>Sessions</h1><p class="sub">Plan each evening, then write it up and take the register.</p></div>' +
        (showEditor ? "" : '<div class="row"><a class="btn btn--primary" href="' + planHref + '">' + icon("plus") + "Plan next session</a>" +
          '<a class="btn" href="#/sessions?new=1">' + icon("plus") + "Tonight's register</a></div>") + "</div>" +
      editor +
      (upcoming.length ? '<h2 class="section-title" style="margin-top:0">Coming up</h2><div class="stack">' + upcoming.map(sessionCard).join("") + "</div>" : "") +
      '<h2 class="section-title">Past sessions</h2>' +
      (past.length ? '<div class="stack">' + past.map(sessionCard).join("") + "</div>" : '<div class="empty">No sessions yet.</div>');
    bindResolveForms("#/sessions");

    actions["tick-all"] = function () { $main.querySelectorAll('[name="present"]').forEach(function (c) { c.checked = true; }); };
    actions["tick-none"] = function () { $main.querySelectorAll('[name="present"]').forEach(function (c) { c.checked = false; }); };
    actions["delete-session"] = async function (el) {
      if (!confirm("Delete this session and its register? This can't be undone.")) return;
      await D.remove("sessions", el.getAttribute("data-id"));
      toast("Session deleted.");
      render();
    };

    onSubmit(document.getElementById("session-form"), async function (f) {
      var ticked = f.present || [];
      var row = {
        date: f.date, location: f.location, title: f.title, pillars: f.pillars || [], recap: f.recap,
        takeaways: f.takeaways.split("\n").map(function (t) { return t.trim(); }).filter(Boolean),
        timetable: parseTimetable(f.timetable),
        bring: f.bring.split("\n").map(function (t) { return t.trim(); }).filter(Boolean),
        register_taken: f.register_taken || ticked.length > 0,
        published: f.published,
      };
      var saved = editing ? await D.update("sessions", editing.id, row)
                          : await D.insert("sessions", Object.assign({ created_by: state.me.user.id }, row));
      if (!row.register_taken) {
        toast(row.published ? "Plan saved. Families can see it." : "Plan saved.");
        return go("#/sessions");
      }
      // Write a row for everyone ticked, and for anyone who already had one (so un-ticking sticks).
      var had = {};
      d.attendance.forEach(function (a) { if (a.session_id === saved.id) had[a.student_id] = true; });
      var rows = boys.filter(function (b) { return ticked.indexOf(b.id) !== -1 || had[b.id]; }).map(function (b) {
        return { session_id: saved.id, student_id: b.id, present: ticked.indexOf(b.id) !== -1 };
      });
      await D.upsertMany("attendance", rows, "session_id,student_id");
      toast("Saved. Parents will be asked to confirm the register.");
      go("#/sessions");
    });
  }

  async function coachHomework(params) {
    var d = await load(["students", "sessions", "homework", "submissions"]);
    var editing = params.edit ? d.homework.find(function (h) { return h.id === params.edit; }) : null;
    var showEditor = params.new || editing;
    var students = byId(d.students);
    var h = editing || { pillar: "", due_date: "", session_id: d.sessions[0] ? d.sessions[0].id : "" };

    var editor = !showEditor ? "" :
      '<form class="card card--accent form" id="hw-form" style="margin-bottom:1.5rem">' +
        "<h2>" + (editing ? "Edit homework" : "Set homework") + "</h2>" +
        '<label class="field"><span>Title</span><input type="text" name="title" required value="' + esc(h.title) + '"></label>' +
        '<div class="cols-2">' +
          '<label class="field"><span>Pillar</span><select name="pillar"><option value="">—</option>' + (CFG.pillars || []).map(function (p) {
            return '<option value="' + esc(p.key) + '"' + (h.pillar === p.key ? " selected" : "") + ">" + esc(p.label) + "</option>";
          }).join("") + "</select></label>" +
          '<label class="field"><span>Due date</span><input type="date" name="due_date" value="' + esc(h.due_date || "") + '"></label>' +
        "</div>" +
        '<label class="field"><span>Linked session</span><select name="session_id"><option value="">None</option>' + d.sessions.slice(0, 20).map(function (s) {
          return '<option value="' + esc(s.id) + '"' + (h.session_id === s.id ? " selected" : "") + ">" + esc(fmtDate(s.date) + " — " + s.title) + "</option>";
        }).join("") + "</select></label>" +
        '<label class="field"><span>Instructions</span><textarea name="instructions" required rows="5">' + esc(h.instructions) + "</textarea></label>" +
        '<div class="row"><button class="btn btn--primary" type="submit">Save</button><a class="btn btn--ghost" href="#/homework">Cancel</a></div>' +
        '<p class="form-status" aria-live="polite"></p>' +
      "</form>";

    var list = d.homework.map(function (hw) {
      var subs = d.submissions.filter(function (s) { return s.homework_id === hw.id; });
      var pending = subs.filter(function (s) { return s.status === "submitted"; }).length;
      var missing = d.students.filter(function (b) { return !subs.some(function (s) { return s.student_id === b.id; }); });
      return (
        '<article class="card">' +
          '<div class="row row--between"><h2 style="margin:0">' + esc(hw.title) + "</h2>" +
            '<div class="row">' + badge(subs.length + "/" + d.students.length + " handed in", "mute") + (pending ? badge(pending + " to review", "warn") : "") + "</div></div>" +
          '<div class="card__meta" style="margin-top:.4rem">' + (hw.due_date ? "<span>Due " + esc(fmtDate(hw.due_date)) + "</span>" : "") + (hw.pillar ? "<span>" + esc(pillarMeta(hw.pillar).label) + "</span>" : "") + "</div>" +
          '<p class="recap__body small">' + esc(hw.instructions) + "</p>" +
          '<details class="disclose"' + (params.open === hw.id ? " open" : "") + "><summary>Answers (" + subs.length + ")</summary><div class=\"stack\">" +
            subs.map(function (s) {
              return (
                '<form class="form review-form" data-id="' + esc(s.id) + '" style="border-top:1px solid var(--hair);padding-top:.8rem">' +
                  '<div class="row row--between"><strong>' + esc(fullName(students[s.student_id])) + ' <span class="muted small">Y' + esc(students[s.student_id] ? students[s.student_id].year_group : "") + "</span></strong>" +
                    badge(s.status === "reviewed" ? "Reviewed" : "To review", s.status === "reviewed" ? "ok" : "warn") + "</div>" +
                  '<div class="quote">' + esc(s.answer) + "</div>" +
                  '<label class="field"><span>Your comment</span><textarea name="coach_comment" rows="2">' + esc(s.coach_comment) + "</textarea></label>" +
                  '<div><button class="btn btn--sm btn--primary" type="submit">' + icon("check") + "Save review</button></div>" +
                  '<p class="form-status" aria-live="polite"></p>' +
                "</form>"
              );
            }).join("") +
            (missing.length ? '<p class="small muted">Not handed in: ' + esc(missing.map(function (b) { return b.first_name + " " + (b.last_name || "").charAt(0); }).join(", ")) + "</p>" : "") +
          "</div></details>" +
          '<div class="row" style="margin-top:.7rem"><a class="btn btn--sm" href="#/homework?edit=' + esc(hw.id) + '">Edit</a>' +
            '<button class="btn btn--sm btn--danger" type="button" data-action="delete-hw" data-id="' + esc(hw.id) + '">Delete</button></div>' +
        "</article>"
      );
    }).join("");

    $main.innerHTML =
      '<div class="page-head"><div><h1>Homework</h1><p class="sub">Set work and mark what comes back.</p></div>' +
        (showEditor ? "" : '<a class="btn btn--primary" href="#/homework?new=1">' + icon("plus") + "Set homework</a>") + "</div>" +
      editor + '<div class="stack">' + (list || '<div class="empty">No homework set yet.</div>') + "</div>";

    actions["delete-hw"] = async function (el) {
      if (!confirm("Delete this homework and all answers to it?")) return;
      await D.remove("homework", el.getAttribute("data-id"));
      toast("Homework deleted.");
      render();
    };

    onSubmit(document.getElementById("hw-form"), async function (f) {
      var row = { title: f.title, pillar: f.pillar || null, due_date: f.due_date || null, session_id: f.session_id || null, instructions: f.instructions };
      if (editing) await D.update("homework", editing.id, row); else await D.insert("homework", row);
      toast(editing ? "Homework updated." : "Homework set — families can see it now.");
      go("#/homework");
    });
    Array.prototype.forEach.call($main.querySelectorAll(".review-form"), function (form) {
      onSubmit(form, async function (f) {
        await D.update("submissions", form.getAttribute("data-id"), { coach_comment: f.coach_comment, status: "reviewed", reviewed_at: new Date().toISOString() });
        toast("Review saved.");
        go("#/homework?open=" + encodeURIComponent((d.submissions.find(function (s) { return s.id === form.getAttribute("data-id"); }) || {}).homework_id || ""));
      });
    });
  }

  async function coachFeedback(params) {
    var d = await load(["students", "sessions", "feedback"]);
    var students = byId(d.students), sessions = byId(d.sessions);
    var filter = params.session || "";
    var rows = filter ? d.feedback.filter(function (f) { return (f.session_id || "general") === filter; }) : d.feedback;
    var avg = d.feedback.length ? (sum(d.feedback, "rating") / d.feedback.length).toFixed(1) : "—";

    var perSession = d.sessions.map(function (s) {
      var fb = d.feedback.filter(function (f) { return f.session_id === s.id; });
      return fb.length ? { s: s, n: fb.length, avg: sum(fb, "rating") / fb.length } : null;
    }).filter(Boolean);

    $main.innerHTML =
      '<div class="page-head"><div><h1>Feedback</h1><p class="sub">What families and boys are saying.</p></div>' +
        '<label class="field" style="min-width:240px"><span>Show</span><select id="fb-filter"><option value="">All feedback</option><option value="general"' + (filter === "general" ? " selected" : "") + ">General</option>" +
        d.sessions.map(function (s) { return '<option value="' + esc(s.id) + '"' + (filter === s.id ? " selected" : "") + ">" + esc(fmtDate(s.date) + " — " + s.title) + "</option>"; }).join("") +
        "</select></label></div>" +
      '<div class="grid grid-2" style="align-items:start">' +
        '<div class="stack">' +
          '<div class="card stat"><div class="stat__num">' + avg + '</div><div class="stat__label">Average rating · ' + d.feedback.length + " responses</div></div>" +
          (perSession.length ? '<div class="table-wrap"><table><thead><tr><th>Session</th><th>Rating</th><th>Responses</th></tr></thead><tbody>' +
            perSession.map(function (x) { return "<tr><td>" + esc(fmtDate(x.s.date) + " — " + x.s.title) + "</td><td>" + x.avg.toFixed(1) + "</td><td>" + x.n + "</td></tr>"; }).join("") +
            "</tbody></table></div>" : "") +
        "</div>" +
        '<div class="stack">' + (rows.length ? rows.map(function (f) {
          return (
            '<div class="card">' +
              '<div class="row row--between">' + starsStatic(f.rating) + '<span class="small muted">' + esc(fmtStamp(f.created_at)) + "</span></div>" +
              '<div class="card__meta" style="margin-top:.3rem"><span>' + esc(f.anonymous ? "Name hidden" : fullName(students[f.student_id])) + "</span><span>" +
                esc(f.session_id && sessions[f.session_id] ? sessions[f.session_id].title : "General") + "</span></div>" +
              (f.enjoyed ? '<p class="small"><strong>Enjoyed:</strong> ' + esc(f.enjoyed) + "</p>" : "") +
              (f.improve ? '<p class="small" style="margin:0"><strong>Could be better:</strong> ' + esc(f.improve) + "</p>" : "") +
            "</div>"
          );
        }).join("") : '<div class="empty">No feedback here yet.</div>') + "</div>" +
      "</div>";

    document.getElementById("fb-filter").addEventListener("change", function (e) {
      go(e.target.value ? "#/feedback?session=" + encodeURIComponent(e.target.value) : "#/feedback");
    });
  }

  async function coachMembers(params) {
    var d = await load(["students", "profiles", "sessions", "attendance", "payments"]);
    var month = /^\d{4}-\d{2}$/.test(params.month || "") ? params.month : thisMonth();
    var parents = byId(d.profiles);
    var boys = sortBoys(d.students);
    var students = byId(d.students);
    var monthPays = d.payments.filter(function (p) { return p.period === month; });

    var rows = boys.map(function (b) {
      var st = payStatus(b.id, month, d);
      var par = parents[b.family_id] || {};
      return (
        "<tr>" +
          "<td><strong>" + esc(fullName(b)) + "</strong>" + (b.medical_notes ? " " + badge("Medical", "warn") : "") +
            '<details class="disclose small"><summary>Details</summary><div>' +
              (b.date_of_birth ? "Born " + esc(fmtDate(b.date_of_birth, true)) + "<br>" : "") +
              (b.school ? "School: " + esc(b.school) + "<br>" : "") +
              (b.medical_notes ? "<strong>Medical:</strong> " + esc(b.medical_notes) + "<br>" : "") +
              "Emergency: " + esc(b.emergency_name || "—") + " " + esc(b.emergency_phone || "") + "<br>" +
              "Photo consent: " + (b.photo_consent ? "yes" : "<strong>no</strong>") +
            "</div></details></td>" +
          "<td>" + esc(b.year_group) + "</td>" +
          "<td>" + esc(par.parent_name || "—") + '<br><span class="small muted">' + esc(par.phone || "") + "<br>" + esc(par.email || "") + "</span></td>" +
          "<td>" + st.attended + "</td>" +
          "<td>" + payBadge(st) + "</td>" +
          '<td><button class="btn btn--sm" type="button" data-action="record-for" data-id="' + esc(b.id) + '">Record payment</button></td>' +
        "</tr>"
      );
    }).join("");

    var ledger = monthPays.map(function (p) {
      return "<tr><td>" + esc(fmtStamp(p.created_at)) + "</td><td>" + esc(fullName(students[p.student_id])) + "</td><td>" + esc(p.kind === "month" ? "Monthly pass" : "Session") + "</td><td>" +
        money(p.amount_pence) + "</td><td>" + esc(methodLabel(p.method)) + '</td><td><button class="btn btn--ghost btn--sm" type="button" data-action="delete-payment" data-id="' + esc(p.id) + '">Remove</button></td></tr>';
    }).join("");

    $main.innerHTML =
      '<div class="page-head"><div><h1>Members</h1><p class="sub">' + d.students.length + " boys registered</p></div>" +
        '<div class="row"><label class="field"><span>Month</span><input type="month" id="month-pick" value="' + month + '"></label>' +
        '<button class="btn" type="button" data-action="export" style="align-self:flex-end">' + icon("download") + "Export CSV</button></div></div>" +
      (rows ? '<div class="table-wrap"><table><thead><tr><th>Boy</th><th>Year</th><th>Parent</th><th>Attended</th><th>' + esc(monthLabel(month)) + "</th><th></th></tr></thead><tbody>" + rows + "</tbody></table></div>"
            : '<div class="empty">Nobody has registered yet. Share the portal link with families.</div>') +
      '<div class="grid grid-2" style="margin-top:1.5rem;align-items:start">' +
        '<form class="card card--accent form" id="pay-form"><h2>Record a cash or bank payment</h2>' +
          '<label class="field"><span>Boy</span><select name="student_id" required><option value="">Choose…</option>' +
            boys.map(function (b) { return '<option value="' + esc(b.id) + '">' + esc(fullName(b)) + " (Y" + esc(b.year_group) + ")</option>"; }).join("") + "</select></label>" +
          '<div class="cols-2">' +
            '<label class="field"><span>For</span><select name="kind"><option value="session">Session(s)</option><option value="month">Monthly pass</option></select></label>' +
            '<label class="field"><span>Month</span><input type="month" name="period" required value="' + month + '"></label>' +
          "</div>" +
          '<div class="cols-2">' +
            '<label class="field"><span>Amount (£)</span><input type="number" name="amount" min="1" step="0.01" required value="' + P.prices.sessionPence / 100 + '"></label>' +
            '<label class="field"><span>Method</span><select name="method"><option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="stripe">Card</option></select></label>' +
          "</div>" +
          '<div><button class="btn btn--primary" type="submit">Record payment</button></div>' +
          '<p class="form-status" aria-live="polite"></p></form>' +
        '<div><h2>Payments for ' + esc(monthLabel(month)) + "</h2>" +
          (ledger ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Boy</th><th>For</th><th>Amount</th><th>Method</th><th></th></tr></thead><tbody>' + ledger + "</tbody></table></div>"
                  : '<div class="empty">No payments recorded for this month.</div>') + "</div>" +
      "</div>";

    var payForm = document.getElementById("pay-form");
    payForm.elements.kind.addEventListener("change", function (e) {
      payForm.elements.amount.value = (e.target.value === "month" ? P.prices.monthPence : P.prices.sessionPence) / 100;
    });
    document.getElementById("month-pick").addEventListener("change", function (e) {
      if (e.target.value) go("#/members?month=" + e.target.value);
    });

    actions["record-for"] = function (el) {
      payForm.elements.student_id.value = el.getAttribute("data-id");
      payForm.scrollIntoView({ behavior: "smooth", block: "center" });
      payForm.elements.kind.focus();
    };
    actions["delete-payment"] = async function (el) {
      if (!confirm("Remove this payment record?")) return;
      await D.remove("payments", el.getAttribute("data-id"));
      toast("Payment removed.");
      render();
    };
    actions.export = function () {
      var head = ["First name", "Last name", "Year", "Date of birth", "School", "Medical", "Emergency contact", "Emergency phone", "Photo consent", "Parent", "Parent phone", "Parent email", "Attended " + month, "Owed " + month];
      var lines = [head].concat(boys.map(function (b) {
        var par = parents[b.family_id] || {}, st = payStatus(b.id, month, d);
        return [b.first_name, b.last_name, b.year_group, b.date_of_birth, b.school, b.medical_notes, b.emergency_name, b.emergency_phone,
          b.photo_consent ? "yes" : "no", par.parent_name, par.phone, par.email, st.attended, (st.owed / 100).toFixed(2)];
      })).map(function (r) {
        return r.map(function (v) {
          var s = String(v == null ? "" : v);
          if (/^[=+\-@]/.test(s)) s = "'" + s;  // stop spreadsheets running it as a formula
          return '"' + s.replace(/"/g, '""') + '"';
        }).join(",");
      }).join("\r\n");
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([lines], { type: "text/csv" }));
      a.download = "zulfiqar-members-" + month + ".csv";
      document.body.appendChild(a); a.click(); a.remove();
    };

    onSubmit(payForm, async function (f) {
      var b = students[f.student_id];
      if (!b) throw new Error("Choose a boy.");
      var pence = Math.round(parseFloat(f.amount) * 100);
      if (!(pence > 0)) throw new Error("Enter an amount.");
      await D.insert("payments", { family_id: b.family_id, student_id: b.id, kind: f.kind, period: f.period, amount_pence: pence, method: f.method, status: "paid" });
      toast(money(pence) + " recorded for " + b.first_name + ".");
      go("#/members?month=" + f.period);
    });
  }

  FAMILY_VIEWS = {
    home: familyHome, sessions: familySessions, homework: familyHomework, confirmation: viewConfirmation,
    feedback: familyFeedback, payments: familyPayments, account: viewAccount,
  };
  COACH_VIEWS = {
    home: coachHome, sessions: coachSessions, homework: coachHomework,
    feedback: coachFeedback, members: coachMembers, account: viewAccount, confirmation: viewConfirmation,
  };

  /* ======================================================================
     Start
     ====================================================================== */
  window.addEventListener("hashchange", render);
  D.init().then(render).catch(function (err) {
    console.error(err);
    $main.innerHTML = '<div class="card"><h1>Can\'t connect</h1><p class="soft">The portal couldn\'t reach its database. Check your connection and the keys in <code>config.js</code>.</p><p class="small muted">' + esc(err.message || err) + "</p></div>";
  });
})();
