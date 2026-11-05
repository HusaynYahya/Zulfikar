/* ============================================================================
   PROJECT ZULFIQAR — scroll-driven wrestling, line-art version (option A)
   ----------------------------------------------------------------------------
   Two wrestlers, drawn as ivory outlines, start apart side-on in stance, take
   turns stepping in, reach, fight for hands, take a collar-and-elbow tie and
   pull in until their foreheads touch — as one continuous motion.

   Nothing here is a picture or a video frame. Each man is a skeleton (pelvis,
   two-part spine, neck and head, shoulders, elbows, wrists, hips, knees,
   ankles) carrying vector body parts sized from the stance drawing: the limbs
   and torso as measured contours, the head, hands and shoes traced from it
   (assets/js/rigdata.js, made by tools/wrestle/rig/trace.py). The scroll
   position sets a time τ; the choreography below turns τ into joint targets;
   two-bone IK places knees and elbows; and the figures are drawn afresh for
   every screen refresh. So the motion is exact at any scroll position.

   How the outlines stay seamless: each body region (far leg, far arm, body,
   near leg, near arm) is drawn as a thick outline and then its inside is
   erased, which leaves one clean silhouette round the region however its
   parts overlap. Lines show only where a nearer region crosses a farther one,
   as in the drawings. The dark fill is drawn underneath on its own layer.

   Units are the drawings' pixels (1536 × 1024 frames). Each man is posed in
   his own frame facing right; the man on the right is mirrored into place.

   ZLineArt.init(canvas)       sets the canvas up
   ZLineArt.frame(canvas, t)   t in [0,1] → poses the men for that scroll
   ============================================================================ */
(function () {
  "use strict";

  var PIECES = window.ZRigPieces || {};
  var VIEW = { x: -10, y: 28, w: 1556, h: 912 };    // the stage, in drawing units
  var MIRROR = 1536;                                 // the right-hand man: x → 1536 − x
  var LW = 4.4;                                      // drawn line width
  var INK = "#efe6d2", FILL = "#0d1119", FILL_ALPHA = 0.68;
  var LAST_AT = 0.86;                                // scroll progress at which the lock is reached
  var GLIDE = 0.16;                                  // share of the gap to the scroll position closed per 60th of a second

  // bone lengths, from the stance drawing
  var L = { lo: 156, hi: 156, ua: 172, fa: 200, th: 215, sh: 197 };
  var ANKLE_Y = 812, FAR_UP = 32;                    // flat-foot ankle height; the far foot sits a little up the floor
  var LIFT = 18;                                     // how high a stepping foot rises

  // half-widths along each bone: [s, left of travel, right of travel]
  // (left of travel = front for legs and arms, back for the torso)
  var PROF = {
    torso: [[-0.25, 12, 10], [-0.15, 58, 34], [-0.05, 81, 50], [0.05, 89, 56], [0.15, 93, 58], [0.25, 94, 60], [0.35, 98, 62], [0.45, 101, 64], [0.55, 104, 68], [0.65, 105, 70], [0.75, 104, 68], [0.85, 98, 60], [0.95, 85, 44], [1.03, 62, 26], [1.1, 34, 14]],
    thigh: [[-0.06, 56, 58], [0.25, 61, 57], [0.55, 55, 47], [0.82, 44, 36], [1.0, 35, 31]],
    shin:  [[0.0, 33, 35], [0.18, 31, 45], [0.42, 29, 42], [0.72, 24, 30], [0.93, 20, 21], [1.02, 19, 19]],
    upperA: [[-0.04, 33, 33], [0.35, 29, 29], [0.7, 25, 25], [1.0, 21, 21]],
    sleeve: [[-0.08, 39, 41], [0.42, 35, 35]],
    upperB: [[-0.04, 32, 30], [0.28, 31, 29], [0.62, 26, 24], [1.0, 21, 21]],
    fore:  [[0.0, 21, 22], [0.28, 24, 24], [0.74, 17, 17], [1.02, 14, 14]],
  };

  // a leg or an arm as one shape through the middle joint, so the knee and elbow bend smoothly
  function joinProf(p1, p2, r) {
    return p1.map(function (q) { return [q[0] * r, q[1], q[2]]; })
      .concat(p2.filter(function (q) { return q[0] > 0.02; }).map(function (q) { return [r + q[0] * (1 - r), q[1], q[2]]; }));
  }
  var RL = L.th / (L.th + L.sh), RA = L.ua / (L.ua + L.fa);
  PROF.leg = joinProf(PROF.thigh, PROF.shin, RL);
  PROF.armA = joinProf(PROF.upperA, PROF.fore, RA);
  PROF.armB = joinProf(PROF.upperB, PROF.fore, RA);

  // ---- small maths ------------------------------------------------------------
  function rad(d) { return d * Math.PI / 180; }
  function deg(r) { return r * 180 / Math.PI; }
  function V(x, y) { return [x, y]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k]; }
  function len(a) { return Math.hypot(a[0], a[1]); }
  function unit(a) { var l = len(a) || 1; return [a[0] / l, a[1] / l]; }
  function lerp(a, b, k) { return typeof a === "number" ? a + (b - a) * k : [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; }
  function dir(a) { return [Math.cos(rad(a)), Math.sin(rad(a))]; }
  function angOf(v) { return deg(Math.atan2(v[1], v[0])); }
  function left(u) { return [u[1], -u[0]]; }                  // left of travel, screen coordinates
  function rot(v, a) { var c = Math.cos(rad(a)), s = Math.sin(rad(a)); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function seg(t, a, b) { return clamp((t - a) / (b - a), 0, 1); }
  function ease(t, a, b) { var k = seg(t, a, b); return k * k * k * (k * (6 * k - 15) + 10); }   // smootherstep

  // Two-bone IK: the middle joint for a limb of lengths l1, l2 from r reaching
  // for t, bent towards the side `pref` points to.
  function ik(r, t, l1, l2, pref) {
    var d = sub(t, r), dl = clamp(len(d), Math.abs(l1 - l2) + 1, l1 + l2 - 0.5);
    var u = unit(d), a = (l1 * l1 - l2 * l2 + dl * dl) / (2 * dl), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    var n = left(u);
    if (n[0] * pref[0] + n[1] * pref[1] < 0) n = mul(n, -1);
    return { mid: add(add(r, mul(u, a)), mul(n, h)), end: add(r, mul(u, dl)) };
  }

  // A smooth curve through keys at given times (Hermite with finite-difference
  // tangents): passes through every key with no stop at any of them.
  function track(keys) {
    return function (t) {
      if (t <= keys[0][0]) return keys[0][1];
      var n = keys.length;
      if (t >= keys[n - 1][0]) return keys[n - 1][1];
      var i = 0;
      while (t > keys[i + 1][0]) i++;
      var k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n - 1, i + 2)];
      var h = k2[0] - k1[0], u = (t - k1[0]) / h;
      var h00 = 2 * u * u * u - 3 * u * u + 1, h10 = u * u * u - 2 * u * u + u, h01 = -2 * u * u * u + 3 * u * u, h11 = u * u * u - u * u;
      function tan(a, b, c, ta, tc) { return i === 0 && a === b ? 0 : (c - a) / (tc - ta) * h; }
      function one(j) {
        var p0 = j < 0 ? k0[1] : k0[1][j], p1 = j < 0 ? k1[1] : k1[1][j], p2 = j < 0 ? k2[1] : k2[1][j], p3 = j < 0 ? k3[1] : k3[1][j];
        var m1 = k0 === k1 ? 0 : (p2 - p0) / (k2[0] - k0[0]) * h;
        var m2 = k3 === k2 ? 0 : (p3 - p1) / (k3[0] - k1[0]) * h;
        return h00 * p1 + h10 * m1 + h01 * p2 + h11 * m2;
      }
      return typeof k1[1] === "number" ? one(-1) : [one(0), one(1)];
    };
  }

  // ---- the choreography ---------------------------------------------------------
  // τ runs 0 → 1 over the scroll. Each man is described in his own frame,
  // facing right; the man on the right ("b") is mirrored. Times for b are
  // offset a touch so the two don't move in lockstep.
  var STEP = 70;
  var STEPS = {   // [foot, start, end, distance]: lead foot first, rear foot follows (a shuffle step)
    a: [["n", 0.02, 0.12, STEP], ["f", 0.10, 0.20, STEP], ["n", 0.23, 0.33, STEP], ["f", 0.31, 0.41, STEP],
        ["n", 0.70, 0.80, 72], ["f", 0.84, 0.94, -24]],
    b: [["n", 0.08, 0.18, STEP], ["f", 0.16, 0.26, STEP], ["n", 0.29, 0.39, STEP], ["f", 0.37, 0.47, STEP],
        ["n", 0.72, 0.82, 72], ["f", 0.86, 0.96, -24]],
  };
  var START = { n: 340, f: 88 };      // ankle x of the front (near) and back (far) foot at the start

  var BODY = {   // τ → spine angles (lower, upper), head angle, pelvis height and set-back
    lo:   track([[0, -50.2], [0.46, -50.2], [0.58, -49], [0.68, -48], [0.80, -47], [0.92, -45.5], [1, -45]]),
    hi:   track([[0, -50.2], [0.46, -50.2], [0.58, -46], [0.68, -45], [0.80, -43], [0.92, -40], [1, -39]]),
    head: track([[0, -72.5], [0.46, -72.5], [0.58, -69], [0.68, -66], [0.80, -58], [0.92, -46], [1, -42]]),
    py:   track([[0, 455], [0.5, 455], [0.66, 460], [0.80, 470], [0.92, 480], [1, 482]]),
    pdx:  track([[0, -35], [0.5, -35], [0.66, -20], [0.80, 0], [0.92, 12], [1, 16]]),
  };
  var GUARD = { n: V(162, 157), f: V(158, 73) };   // wrists relative to the shoulder, in the stance drawing

  function steps(who, foot, t) {
    var x = START[foot], lift = 0, bob = 0;
    STEPS[who].forEach(function (s) {
      if (s[0] !== foot) return;
      var p = seg(t, s[1], s[2]);
      x += s[3] * ease(t, s[1], s[2]);
      if (p > 0 && p < 1) { lift = Math.sin(Math.PI * p) * LIFT * (s[3] < 0 ? 0.4 : 1); bob = Math.sin(Math.PI * p); }
    });
    return { x: x, lift: lift, bob: bob };
  }

  // The body (everything but the arms) for one man at time t, in his own frame.
  function body(who, t) {
    var o = who === "b" ? 0.025 : 0;                 // b reacts a beat later
    var tb = clamp(t - o, 0, 1);
    var fn = steps(who, "n", t), ff = steps(who, "f", t);
    var P = V((fn.x + ff.x) / 2 + BODY.pdx(tb), BODY.py(tb) + 3 * (fn.bob + ff.bob));
    var aLo = BODY.lo(tb), aHi = BODY.hi(tb);
    var C = add(P, mul(dir(aLo), L.lo)), N = add(C, mul(dir(aHi), L.hi));
    var u = dir(aHi), n = left(u);
    var S = add(add(N, mul(u, -62)), mul(n, 59));        // shoulder joint, from the stance drawing
    var Sf = add(add(S, mul(u, 8)), mul(n, -14));        // far shoulder: a little forward
    var An = V(fn.x, ANKLE_Y - fn.lift), Af = V(ff.x, ANKLE_Y - FAR_UP - ff.lift);
    var kn = ik(P, An, L.th, L.sh, V(1, -0.2)), kf = ik(add(P, V(-4, -4)), Af, L.th, L.sh, V(1, -0.2));
    return {
      who: who, t: tb, P: P, C: C, N: N, S: S, Sf: Sf, aLo: aLo, aHi: aHi, head: BODY.head(tb),
      leg: { n: { H: P, K: kn.mid, A: kn.end, toe: -2.2 + fn.lift * 0.35 }, f: { H: add(P, V(-4, -4)), K: kf.mid, A: kf.end, toe: -2.2 + ff.lift * 0.35 } },
    };
  }

  // A point fixed to the torso (given in the stance drawing's frame) where it
  // is now: turns with the upper spine.
  function onTorso(b, off) { return add(b.S, rot(off, b.aHi + 50.2)); }
  // the back of the neck, from the traced head, for the other man's hand
  function neckBack(b) { return add(b.N, rot(V(40, -46), b.head)); }

  // where each man's two wrists are heading at time t (in his own frame)
  function wristTargets(me, other, t) {
    var tt = me.t;
    var fight = 6 * Math.sin(tt * 70) * (ease(tt, 0.02, 0.1) - ease(tt, 0.5, 0.6));   // small guard circles while stepping in
    var gN = add(onTorso(me, GUARD.n), V(fight, 0.6 * fight));
    var gF = add(onTorso(me, GUARD.f), V(-0.7 * fight, fight));
    // the other man's points, brought into this man's frame
    var oNeck = flip(neckBack(other));
    // far arm: reach for his head, back to guard, then onto the back of his neck
    var reach = add(me.Sf, rot(V(300, -40), me.aHi + 50.2));
    var wF = lerp(gF, reach, ease(tt, 0.48, 0.58) - ease(tt, 0.62, 0.70));
    var toNeck = unit(sub(oNeck, me.Sf));
    wF = lerp(wF, sub(oNeck, mul(toNeck, 34)), ease(tt, 0.74, 0.88));
    // near arm: meet his hand in the middle and hand-fight, then take his elbow
    var mid = V(MIRROR / 2 - 14, 404);
    var hf = ease(tt, 0.60, 0.68);
    var wobble = V(10 * Math.sin(tt * 90), 7 * Math.cos(tt * 75)).map(function (v) { return v * (hf - ease(tt, 0.76, 0.84)); });
    var wN = lerp(gN, add(mid, wobble), hf);
    wN = lerp(wN, V(MIRROR / 2 - 34, 424), ease(tt, 0.76, 0.9));
    return { n: wN, f: wF };
  }
  function flip(p) { return V(MIRROR - p[0], p[1]); }

  function arms(me, w) {
    function one(S, W) {
      var s = ik(S, W, L.ua, L.fa, V(-0.35, 1));
      return { S: S, E: s.mid, W: s.end };
    }
    return { n: one(me.S, w.n), f: one(me.Sf, w.f) };
  }

  // Scroll → choreography time: the step-in takes the first 38% of the scroll,
  // the reach, hand fight, tie and lock the rest (they get the room).
  function warp(t) { return t < 0.38 ? t * 0.47 / 0.38 : 0.47 + (t - 0.38) * 0.53 / 0.62; }

  function pose(t) {
    t = warp(t);
    var a = body("a", t), b = body("b", t);
    a.arm = arms(a, wristTargets(a, b, t));
    b.arm = arms(b, wristTargets(b, a, t));
    var tt = a.t;
    a.grip = b.grip = ease(tt, 0.74, 0.88);
    return { a: a, b: b };
  }

  // ---- shapes -------------------------------------------------------------------
  // the outline of a limb along a polyline of joints, from a width profile
  function limb(pts, prof) {
    var lens = [], total = 0;
    for (var i = 1; i < pts.length; i++) { var l = len(sub(pts[i], pts[i - 1])); lens.push(l); total += l; }
    function at(s) {                  // point and direction at fraction s along the polyline (extends past both ends)
      var d = s * total, i = 0;
      while (i < lens.length - 1 && d > lens[i]) { d -= lens[i]; i++; }
      var u = unit(sub(pts[i + 1], pts[i]));
      // blend the direction across a joint so the sides bend smoothly
      if (lens.length > 1) {
        var near = 34;
        if (i > 0 && d < near) u = unit(lerp(unit(sub(pts[i], pts[i - 1])), u, 0.5 + 0.5 * d / near));
        if (i < lens.length - 1 && lens[i] - d < near) u = unit(lerp(unit(sub(pts[i + 2], pts[i + 1])), u, 0.5 + 0.5 * (lens[i] - d) / near));
      }
      return { p: add(pts[i], mul(unit(sub(pts[i + 1], pts[i])), d)), u: u };
    }
    // sample densely (every ~8 units) so a bend in the polyline curves the sides smoothly
    var dense = [], s0 = prof[0][0], s1 = prof[prof.length - 1][0], n = Math.max(2, Math.ceil((s1 - s0) * total / 8));
    for (var k = 0; k <= n; k++) { var s = s0 + (s1 - s0) * k / n, w = interp(prof, s); dense.push([s, w[0], w[1]]); }
    var L1 = [], R1 = [];
    dense.forEach(function (q) { var f = at(q[0]), nn = left(f.u); L1.push(add(f.p, mul(nn, q[1]))); R1.push(add(f.p, mul(nn, -q[2]))); });
    // rounded ends
    function cap(q, sign) {
      var f = at(q[0]), n = left(f.u), r = (q[1] + q[2]) / 2, c = add(f.p, mul(n, (q[1] - q[2]) / 2)), out = [];
      for (var k = 1; k < 6; k++) {
        var a = Math.PI * k / 6;
        out.push(add(c, add(mul(n, sign * r * Math.cos(a)), mul(f.u, sign * r * Math.sin(a)))));
      }
      return out;
    }
    var end = cap(prof[prof.length - 1], 1), start = cap(prof[0], -1);
    return L1.concat(end, R1.reverse(), start);
  }
  // a band across a limb at fraction s along its polyline (hems, sock tops)
  function band(pts, prof, s, bow) {
    var segs = [], total = 0;
    for (var i = 1; i < pts.length; i++) { var l = len(sub(pts[i], pts[i - 1])); segs.push(l); total += l; }
    var d = s * total, j = 0;
    while (j < segs.length - 1 && d > segs[j]) { d -= segs[j]; j++; }
    var u = unit(sub(pts[j + 1], pts[j])), p = add(pts[j], mul(u, d)), n = left(u), w = interp(prof, s);
    var a = add(p, mul(n, w[0] - 1)), b = add(p, mul(n, -(w[1] - 1)));
    return [a, add(lerp(a, b, 0.5), mul(u, bow || 0)), b];
  }
  function interp(prof, s) {
    if (s <= prof[0][0]) return [prof[0][1], prof[0][2]];
    for (var i = 1; i < prof.length; i++) if (s <= prof[i][0]) {
      if (prof[i][0] === prof[i - 1][0]) return [prof[i][1], prof[i][2]];
      var k = (s - prof[i - 1][0]) / (prof[i][0] - prof[i - 1][0]);
      return [lerp(prof[i - 1][1], prof[i][1], k), lerp(prof[i - 1][2], prof[i][2], k)];
    }
    var q = prof[prof.length - 1]; return [q[1], q[2]];
  }
  // a traced piece placed at a pivot, turned by `ang` (degrees, the drawing's own angle)
  function piece(name, pivot, ang) {
    var pc = PIECES[name];
    if (!pc) return null;
    function place(q) { return add(pivot, rot(q, ang)); }
    return { outline: pc.outline.map(place), details: pc.details.map(function (d) { return d.map(place); }) };
  }

  // ---- one man's drawing groups, back to front -----------------------------------
  function groups(m) {
    var A = m.who === "a";
    var g = {};
    function legParts(l, near) {
      var parts = [{ o: limb([l.H, l.K, l.A], PROF.leg) }];
      var shoe = piece("shoe", l.A, l.toe);
      if (shoe) parts.push({ o: shoe.outline });
      var leg = [l.H, l.K, l.A];
      var det = [band(leg, PROF.leg, RL + 0.93 * (1 - RL), 2)];
      det.push(band(leg, PROF.leg, (near ? 0.44 : 0.46) * RL, 6));
      if (near) det.push(band(leg, PROF.leg, 0.40 * RL, 6));
      return { parts: parts, details: det, patch: near ? { c: l.H, r: 44 } : null };
    }
    g.farLeg = legParts(m.leg.f, false);
    g.nearLeg = legParts(m.leg.n, true);
    function armParts(a, near) {
      var up = A ? PROF.upperA : PROF.upperB;
      var parts = [{ o: limb([a.S, a.E, a.W], A ? PROF.armA : PROF.armB) }];
      var det = [];
      if (A) { parts.push({ o: limb([a.S, a.E], PROF.sleeve) }); det.push(band([a.S, a.E], PROF.upperA, 0.42, 4)); }
      var hand = null;
      var fa = angOf(sub(a.W, a.E));
      if (near) {
        hand = piece("handLow", a.W, fa);
        if (hand) { parts.push({ o: hand.outline }); det = det.concat(hand.details); }
      }
      return { parts: parts, details: det, patch: near ? { c: a.S, r: 22 } : null, wristAng: fa };
    }
    g.farArm = armParts(m.arm.f, false);
    g.nearArm = armParts(m.arm.n, true);
    var hf = piece("handUp", m.arm.f.W, angOf(sub(m.arm.f.W, m.arm.f.E)) + 14 * (1 - m.grip) + 30 * m.grip);
    g.farHand = hf ? { parts: [{ o: hf.outline }], details: hf.details } : { parts: [], details: [] };
    // the body: torso along the spine, the head and neck on top
    var torso = limb([m.P, m.C, m.N], PROF.torso);
    var head = piece("head", m.N, m.head);
    var bparts = [{ o: torso }];
    var bdet = [];
    if (head) { bparts.push({ o: head.outline }); bdet = bdet.concat(head.details); }
    bdet.push(band([m.P, m.C, m.N], PROF.torso, 0.15, -4));                     // shirt hem / waistband
    if (A) {
      bdet.push([add(m.N, rot(V(-30, -8), m.aHi + 50.2)), add(m.N, rot(V(-14, 16), m.aHi + 50.2)), add(m.N, rot(V(4, 30), m.aHi + 50.2))]);   // crew neck
    } else {
      bdet.push([add(m.N, rot(V(-44, -2), m.aHi + 50.2)), add(m.N, rot(V(-22, 40), m.aHi + 50.2)), add(m.N, rot(V(-2, 56), m.aHi + 50.2))]);  // vest neckline
      bdet.push([add(m.N, rot(V(-66, 4), m.aHi + 50.2)), add(m.N, rot(V(-86, 44), m.aHi + 50.2)), add(m.N, rot(V(-74, 84), m.aHi + 50.2))]); // vest armhole
    }
    g.body = { parts: bparts, details: bdet };
    return g;
  }

  // ---- drawing ------------------------------------------------------------------
  function smoothPath(ctx, pts, closed) {
    var n = pts.length;
    if (n < 2) return;
    if (!closed) {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < n - 1; i++) {
        var m = lerp(pts[i], pts[i + 1], 0.5);
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
      }
      ctx.lineTo(pts[n - 1][0], pts[n - 1][1]);
      return;
    }
    var s = lerp(pts[n - 1], pts[0], 0.5);
    ctx.moveTo(s[0], s[1]);
    for (var j = 0; j < n; j++) {
      var p = pts[j], q = pts[(j + 1) % n], mm = lerp(p, q, 0.5);
      ctx.quadraticCurveTo(p[0], p[1], mm[0], mm[1]);
    }
    ctx.closePath();
  }

  function mapPts(pts, mirror) { return mirror ? pts.map(flip) : pts; }

  function render(st, t) {
    var cv = st.cv, W = cv.width, H = cv.height;
    if (!W || !H) return;
    var lc = st.line.getContext("2d"), fc = st.fill.getContext("2d"), ctx = st.ctx;
    var k = Math.min(W / VIEW.w, H / VIEW.h), ox = (W - VIEW.w * k) / 2 - VIEW.x * k, oy = H - VIEW.h * k - VIEW.y * k;
    [lc, fc].forEach(function (c) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H); c.setTransform(k, 0, 0, k, ox, oy); });
    var p = pose(t), ga = groups(p.a), gb = groups(p.b);
    var order = [["farLeg"], ["farArm"], ["body"], ["nearLeg"], ["nearArm"], ["farHand"]];
    lc.lineJoin = lc.lineCap = "round";
    lc.strokeStyle = INK; fc.fillStyle = FILL;
    order.forEach(function (o) {
      [[gb[o[0]], true], [ga[o[0]], false]].forEach(function (pair) {
        var gr = pair[0], mir = pair[1];
        if (!gr || !gr.parts.length) return;
        // outline, then erase inside: one silhouette for the region
        lc.lineWidth = LW * 2;
        lc.beginPath();
        gr.parts.forEach(function (pt) { smoothPath(lc, mapPts(pt.o, mir), true); });
        lc.stroke();
        lc.globalCompositeOperation = "destination-out";
        lc.beginPath();
        gr.parts.forEach(function (pt) { smoothPath(lc, mapPts(pt.o, mir), true); });
        lc.fill("nonzero");
        if (gr.patch) {        // hide the closing line where a limb joins the body
          var c = mir ? flip(gr.patch.c) : gr.patch.c;
          lc.beginPath(); lc.arc(c[0], c[1], gr.patch.r, 0, Math.PI * 2); lc.fill();
        }
        lc.globalCompositeOperation = "source-over";
        lc.lineWidth = LW;
        lc.beginPath();
        gr.details.forEach(function (d) { smoothPath(lc, mapPts(d, mir), false); });
        lc.stroke();
        // the fill
        fc.beginPath();
        gr.parts.forEach(function (pt) { smoothPath(fc, mapPts(pt.o, mir), true); });
        fc.fill("nonzero");
      });
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = FILL_ALPHA; ctx.drawImage(st.fill, 0, 0);
    ctx.globalAlpha = 1; ctx.drawImage(st.line, 0, 0);
  }

  // ---- canvas, sizing and the glide towards the scroll position ---------------------
  function size(st) {
    var r = st.cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
    if (st.cv.width !== W || st.cv.height !== H) {
      st.cv.width = W; st.cv.height = H;
      st.line.width = st.fill.width = W; st.line.height = st.fill.height = H;
    }
    st.drawn = null;
  }
  function kick(st) { if (!st.raf) st.raf = requestAnimationFrame(function (now) { step(st, now); }); }
  function step(st, now) {
    st.raf = 0;
    if (!document.body.contains(st.cv)) { window.removeEventListener("resize", st.onResize); return; }
    var dt = st.last ? Math.min(100, now - st.last) : 16.7;
    st.last = now;
    if (st.cur == null) st.cur = st.target;
    var gap = st.target - st.cur;
    st.cur = Math.abs(gap) < 0.0004 ? st.target : st.cur + gap * (1 - Math.pow(1 - GLIDE, dt / 16.7));
    if (st.cv.offsetParent !== null && st.drawn !== st.cur) { render(st, st.cur); st.drawn = st.cur; }
    if (st.cur !== st.target) kick(st); else st.last = 0;
  }

  function init(cv) {
    if (!cv || !cv.getContext) return;
    var st = { cv: cv, ctx: cv.getContext("2d"), line: document.createElement("canvas"), fill: document.createElement("canvas"),
               target: 0, cur: null, drawn: null };
    cv._wr = st;
    st.onResize = function () { size(st); kick(st); };
    window.addEventListener("resize", st.onResize);
    size(st);
    kick(st);
  }
  function frame(cv, t) {
    var st = cv && cv._wr;
    if (!st) return;
    if (!st.cv.width || st.cv.width < 2) size(st);
    st.target = clamp(t / LAST_AT, 0, 1);
    if (st.cv.offsetParent !== null && st.cv.getBoundingClientRect().width * Math.min(2, window.devicePixelRatio || 1) - st.cv.width > 2) size(st);
    kick(st);
  }

  // for tools/wrestle/rig/check.html: pose and draw at a given τ
  window.ZLineArt = { init: init, frame: frame, _pose: pose, _render: function (cv, t) { var st = cv._wr; render(st, t); } };
})();
