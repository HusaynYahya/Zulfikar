/* ============================================================================
   PROJECT ZULFIQAR — scroll-driven wrestling, code-drawn version (option B)
   ----------------------------------------------------------------------------
   Two figures grapple through a short sequence as the page scrolls, drawn as
   ink line-art (an illustrated, anime-ish look). The motion is deliberately
   stepped — a stop-motion / claymation feel — by quantising the progress
   between keyframe poses, and the linework "boils" (wobbles a touch) each
   frame the way hand-drawn animation does.

   ZWrestle.frame(svgEl, t)   t in [0,1] → draws the matching moment
   ============================================================================ */
(function () {
  "use strict";

  var VW = 240, VH = 200;

  // Wrestling: the two circle in stance — real stepping footwork, hands
  // fighting, the pair turning in depth — then A (white) changes level,
  // shoots a double leg, lifts B (navy), flips him over onto his back and
  // follows him down, before helping him up. Circling is generated; the
  // takedown is keyframed. B can be rotated as a whole (`r`, degrees) around
  // his pelvis, so the flip turns the body rather than squashing it, and a
  // hand can hold onto a point on the other figure (`ref`).
  var GY = 182, CIRCLE_END = 0.38;

  function ss(k) { return k * k * (3 - 2 * k); }
  function mix(a, b, k) { return a + (b - a) * k; }

  // A crouched wrestling stance for a figure standing about x, on ground gy.
  // feet = [far foot, near foot] positions; fight = hand-fighting phase.
  function stance(x, gy, face, feet, fight, bob) {
    var p = [x, gy - 35 + bob];
    var n = [p[0] + face * 14, p[1] - 28];
    var h = [n[0] + face * 5, n[1] - 11];
    var lh = [n[0] + face * (17 + 4 * Math.sin(fight)), n[1] + 7 + 3 * Math.cos(fight)];
    var rh = [n[0] + face * (11 + 4 * Math.sin(fight + 2.1)), n[1] + 14 + 2 * Math.cos(fight * 1.3)];
    return { p: p, n: n, h: h, lh: lh, rh: rh, lf: feet[0], rf: feet[1], r: 0 };
  }

  // u in [0,1] across the circling: the pair orbit their middle point, A
  // swinging toward the viewer and back, both stepping as they go.
  function circling(u) {
    var th = 0.85 * Math.sin(Math.PI * u) * (1 - 0.35 * u);   // orbit angle
    var R = 40 - 12 * u * u;
    function at(q) {   // centre x, ground y and depth of each wrestler at time q
      var t2 = 0.85 * Math.sin(Math.PI * q) * (1 - 0.35 * q), R = 40 - 12 * q * q;
      return { ax: 120 - R * Math.cos(t2), ay: GY + 12 * Math.sin(t2), as: 1 + 0.12 * Math.sin(t2),
               bx: 120 + R * Math.cos(t2), by: GY - 12 * Math.sin(t2), bs: 1 - 0.12 * Math.sin(t2) };
    }
    var N = 8, w = 1 / N;
    // each foot only moves in its own step windows, lifting as it goes
    function foot(which, isA, j) {
      var plant = 0, lift = 0;
      for (var k = 0; k < N; k++) {
        if ((k + j + (isA ? 0 : 1)) % 2) continue;
        var s0 = k * w, s1 = s0 + w;
        var target = Math.min(1, s1 + w * 0.6);
        if (u >= s1) plant = target;
        else if (u > s0) { var f = ss((u - s0) / w); plant = mix(plant, target, f); lift = Math.sin(Math.PI * f) * 4.5; break; }
      }
      var c = at(plant), x = isA ? c.ax : c.bx, gy = isA ? c.ay : c.by, face = isA ? 1 : -1;
      var off = which ? -face * 13 : face * 9;     // near foot back, far foot forward
      return [x + off, gy - lift];
    }
    var c = at(u);
    var stepBob = -1.5 * Math.abs(Math.sin(Math.PI * u * N));
    var A = stance(c.ax, c.ay, 1, [foot(0, true, 0), foot(1, true, 1)], u * 19, stepBob);
    var B = stance(c.bx, c.by, -1, [foot(0, false, 0), foot(1, false, 1)], u * 17 + 1.3, -1.5 * Math.abs(Math.sin(Math.PI * u * N + 1.2)));
    A.s = c.as; A.gy = c.ay; B.s = c.bs; B.gy = c.by;
    return { a: A, b: B, front: th > 0 ? "a" : "b" };
  }

  function K(p, n, h, lh, rh, lf, rf, r) { return { p: p, n: n, h: h, lh: lh, rh: rh, lf: lf, rf: rf, r: r || 0 }; }
  // a hand holding onto a point between two joints of the other figure
  function ref(from, to, k, dx, dy) { return { ref: [from, to, k, dx || 0, dy || 0] }; }

  var start = circling(1);
  // B's joints for the lift and flip are written upright about his pelvis and
  // turned by r. Upright, B faces left: his front is -x.
  var KEYS = [
    { t: 0.00, a: start.a, b: start.b },
    // A sets his feet and changes level, eyes on B's hips
    { t: 0.09, a: K([98,160],[120,146],[127,136],[134,150],[128,158],[118,182],[82,182]),
               b: K([148,151],[136,124],[131,112],[ref("n","p",0.2,-2,-4)],[124,135],[136,182],[160,182]) },
    // penetration step: near knee to the mat, head tight to B's side, arms round his thighs
    { t: 0.19, a: K([121,162],[146,143],[154,134],ref("p","lf",0.55,-4,0),ref("p","rf",0.5,-6,2),[150,182],[110,182]),
               b: K([152,148],[156,116],[156,103],ref("n","p",0.35,4,0),ref("n","p",0.55,6,2),[140,182],[166,182]) },
    // A drives up off the knee, B's hips coming onto his shoulder
    { t: 0.32, a: K([116,150],[126,119],[133,108],ref("p","lf",0.45),ref("p","rf",0.45,2,2),[100,182],[131,182]),
               b: K([140,111],[140,79],[138,67],[128,88],[124,96],[161,140],[155,143],40) },
    // the flip: B's legs swing high over A as he turns him
    { t: 0.48, a: K([118,148],[128,118],[134,107],ref("p","lf",0.4),ref("p","rf",0.4,2,2),[103,182],[137,182]),
               b: K([148,98],[148,66],[146,54],[134,74],[130,82],[138,132],[144,134],105) },
    // B lands flat on his back; A follows him down
    { t: 0.64, a: K([124,160],[152,152],[163,147],[176,176],[160,170],[104,182],[110,182]),
               b: K([150,171],[150,139],[149,127],[138,152],[162,150],[136,196],[144,202],92) },
    // a breath on the mat
    { t: 0.76, a: K([124,159],[152,151],[163,146],[176,176],[160,170],[104,182],[110,182]),
               b: K([150,171],[150,139],[149,127],[136,150],[164,150],[134,196],[142,202],92) },
    // A stands and offers a hand; B sits up and takes it
    { t: 1.00, a: K([104,146],[106,114],[108,101],[118,130],[131,138],[96,182],[114,182]),
               b: K([154,174],[146,145],[143,132],ref("rh","rh",0,1,1),[162,166],[124,181],[130,180],0) },
  ];

  function lerpP(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; }
  // Catmull-Rom through four keyframe values: smooth, continuous motion
  function cr(p0, p1, p2, p3, u) {
    var u2 = u * u, u3 = u2 * u;
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
  }
  var JOINTS = ["p", "n", "h", "lh", "rh", "lf", "rf"];

  // Turn B's upright joints by r degrees about his pelvis.
  function placed(f) {
    if (!f.r) return f;
    var a = f.r * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), o = f.p, out = { r: f.r };
    JOINTS.forEach(function (j) {
      var v = f[j];
      function turn(q) { var dx = q[0] - o[0], dy = q[1] - o[1]; return [o[0] + dx * c - dy * s, o[1] + dx * s + dy * c]; }
      if (v && v.mix) {   // a hold: turn only the free-hand end of it
        out[j] = { mix: v.mix.map(function (m) { return isRef(m) ? m : turn(m); }), u: v.u };
      } else out[j] = turn(v);
    });
    return out;
  }
  function isRef(v) { return v && !Array.isArray(v) ? true : (Array.isArray(v) && v.length === 1 && v[0].ref) ? true : false; }
  function refOf(v) { return Array.isArray(v) ? v[0].ref : v.ref; }
  function resolve(v, other) {
    var r = refOf(v), a = other[r[0]], b = other[r[1]];
    return [a[0] + (b[0] - a[0]) * r[2] + r[3], a[1] + (b[1] - a[1]) * r[2] + r[4]];
  }

  function pose(t) {
    if (t <= CIRCLE_END) return circling(t / CIRCLE_END);
    var q = (t - CIRCLE_END) / (1 - CIRCLE_END), i = 0;
    while (i < KEYS.length - 2 && q > KEYS[i + 1].t) i++;
    var k0 = KEYS[Math.max(0, i - 1)], k1 = KEYS[i], k2 = KEYS[i + 1], k3 = KEYS[Math.min(KEYS.length - 1, i + 2)];
    var u = Math.max(0, Math.min(1, (q - k1.t) / (k2.t - k1.t)));
    var out = {};
    ["a", "b"].forEach(function (w) {
      var f = { r: cr(k0[w].r || 0, k1[w].r || 0, k2[w].r || 0, k3[w].r || 0, u) };
      JOINTS.forEach(function (j) {
        var vs = [k0[w][j], k1[w][j], k2[w][j], k3[w][j]];
        if (vs.some(isRef)) { f[j] = { mix: [k1[w][j], k2[w][j]], u: ss(u) }; return; }
        f[j] = [cr(vs[0][0], vs[1][0], vs[2][0], vs[3][0], u), cr(vs[0][1], vs[1][1], vs[2][1], vs[3][1], u)];
      });
      out[w] = f;
    });
    // B's joints are turned first, then any hands holding onto the other body
    // are placed; each hold blends with a free hand across a transition.
    out.b = placed(out.b);
    function settle(f, other) {
      JOINTS.forEach(function (j) {
        var v = f[j];
        if (!v || !v.mix) return;
        var a = isRef(v.mix[0]) ? resolve(v.mix[0], other) : v.mix[0];
        var b = isRef(v.mix[1]) ? resolve(v.mix[1], other) : v.mix[1];
        f[j] = lerpP(a, b, v.u);
      });
    }
    settle(out.a, out.b); settle(out.b, out.a);
    out.a.s = out.b.s = 1; out.a.gy = out.b.gy = GY;
    out.front = "a";
    return out;
  }

  // Per-frame "boil": a seeded wobble so the lines feel hand-drawn.
  function mulberry(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Two-bone IK: where the elbow or knee sits for a limb of fixed upper and
  // lower length reaching from a to b, bent toward the side `pref` points.
  function joint(a, b, L1, L2, pref) {
    var dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
    d = Math.min(d, L1 + L2 - 0.01);
    var along = (L1 * L1 - L2 * L2 + d * d) / (2 * d), hgt = Math.sqrt(Math.max(0, L1 * L1 - along * along));
    var ux = dx / (Math.hypot(dx, dy) || 1), uy = dy / (Math.hypot(dx, dy) || 1), px = -uy, py = ux;
    if (px * pref[0] + py * pref[1] < 0) { px = -px; py = -py; }
    return [a[0] + ux * along + px * hgt, a[1] + uy * along + py * hgt];
  }
  function seg(a, b, w, col, extra) {
    return '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) +
      '" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round"' + (extra || "") + "/>";
  }

  function unit(a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dx / L, dy / L]; }
  // A tapered body part: a quad from a (width wa) to b (width wb).
  function quad(a, b, wa, wb) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    return [[a[0] + nx * wa / 2, a[1] + ny * wa / 2], [b[0] + nx * wb / 2, b[1] + ny * wb / 2],
      [b[0] - nx * wb / 2, b[1] - ny * wb / 2], [a[0] - nx * wa / 2, a[1] - ny * wa / 2]];
  }
  function poly(pts) { return "M" + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" L") + " Z"; }

  // A realistically-proportioned figure in a jiu-jitsu gi: skin for head,
  // neck, hands and feet; the gi jacket and trousers in cloth with the far
  // arm and leg a shade darker; lapels, a belt and a knot. Drawn as an ink
  // layer under a colour layer so the whole body keeps one clean outline.
  function figure(f, face, c) {
    var lw = 2.1;
    var tp = unit(f.p, f.n), sx = -tp[1], sy = tp[0];
    var LSh = [f.n[0] + sx * 9, f.n[1] + sy * 9], RSh = [f.n[0] - sx * 9, f.n[1] - sy * 9];
    var LHp = [f.p[0] + sx * 6.5, f.p[1] + sy * 6.5], RHp = [f.p[0] - sx * 6.5, f.p[1] - sy * 6.5];
    var hr = 6.4, neckTop = [f.h[0] + (f.n[0] - f.h[0]) * 0.45, f.h[1] + (f.n[1] - f.h[1]) * 0.45];
    // the body's own front and down, so joints bend correctly however it's turned
    var up = unit(f.p, f.n), front = [-up[1] * face, up[0] * face], down = [-up[0], -up[1]];
    var elbowWay = [down[0] - front[0] * 0.5, down[1] - front[1] * 0.5];
    var le = joint(LSh, f.lh, 15, 14, elbowWay), re = joint(RSh, f.rh, 15, 14, elbowWay);
    var kneeWay = [front[0] + up[0] * 0.6, front[1] + up[1] * 0.6];   // forward, and up when sitting
    var lk = joint(LHp, f.lf, 20, 19, kneeWay), rk = joint(RHp, f.rf, 20, 19, kneeWay);
    // sleeves and trouser legs stop short of the wrist / ankle so skin shows
    function toward(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; }
    var lCuff = toward(le, f.lh, 0.72), rCuff = toward(re, f.rh, 0.72);
    var lHem = toward(lk, f.lf, 0.8), rHem = toward(rk, f.rf, 0.8);
    var lToe = [f.lf[0] + unit(lk, f.lf)[0] * 6 + face * 3, f.lf[1] + 1.2];
    var rToe = [f.rf[0] + unit(rk, f.rf)[0] * 6 + face * 3, f.rf[1] + 1.2];
    // the waist sits a little above the hips; the jacket skirt flares past them
    var waist = toward(f.p, f.n, 0.18);
    var LW = [waist[0] + sx * 8, waist[1] + sy * 8], RW = [waist[0] - sx * 8, waist[1] - sy * 8];

    // [polygon, fill]
    var parts = [
      [quad(LHp, lk, 10.5, 8), c.shade], [quad(lk, lHem, 8, 7.4), c.shade],         // far leg (trousers)
      [quad(lHem, f.lf, 4.6, 4), c.skin], [quad(f.lf, lToe, 4.6, 3.6), c.skin],     // far ankle + foot
      [quad(LSh, le, 7.6, 6.4), c.shade], [quad(le, lCuff, 6.4, 6), c.shade],       // far arm (sleeve)
      [quad(lCuff, f.lh, 3.6, 3), c.skin],                                          // far forearm
      [quad(neckTop, f.n, 5.4, 7), c.skin],                                         // neck
      [[LSh, RSh, RW, LW], c.gi],                                                   // jacket body
      [[LW, RW, [RHp[0] - sx * 1.5, RHp[1] - sy * 1.5 + 3], [LHp[0] + sx * 1.5, LHp[1] + sy * 1.5 + 3]], c.gi], // jacket skirt
      [quad(RHp, rk, 10.5, 8), c.gi], [quad(rk, rHem, 8, 7.4), c.gi],              // near leg
      [quad(rHem, f.rf, 4.6, 4), c.skin], [quad(f.rf, rToe, 4.6, 3.6), c.skin],
      [quad(RSh, re, 7.6, 6.4), c.gi], [quad(re, rCuff, 6.4, 6), c.gi],            // near arm
      [quad(rCuff, f.rh, 3.6, 3), c.skin],
    ];
    var ol = "", fl = "";
    parts.forEach(function (pp) {
      var d = poly(pp[0]);
      ol += '<path d="' + d + '" fill="' + c.ink + '" stroke="' + c.ink + '" stroke-width="' + (lw * 2) + '" stroke-linejoin="round"/>';
      fl += '<path d="' + d + '" fill="' + pp[1] + '"/>';
    });
    // hands
    [f.lh, f.rh].forEach(function (hnd, i) {
      ol += '<ellipse cx="' + hnd[0].toFixed(1) + '" cy="' + hnd[1].toFixed(1) + '" rx="' + (2.9 + lw) + '" ry="' + (3.3 + lw) + '" fill="' + c.ink + '"/>';
      fl += '<ellipse cx="' + hnd[0].toFixed(1) + '" cy="' + hnd[1].toFixed(1) + '" rx="2.9" ry="3.3" fill="' + c.skin + '"/>';
    });
    // head: slightly long oval with a jaw toward the face
    var jaw = [f.h[0] + face * 3.2, f.h[1] + hr * 0.8];
    ol += '<ellipse cx="' + f.h[0].toFixed(1) + '" cy="' + f.h[1].toFixed(1) + '" rx="' + (hr * 0.9 + lw) + '" ry="' + (hr * 1.08 + lw) + '" fill="' + c.ink + '"/>';
    ol += '<path d="' + poly(quad([f.h[0], f.h[1] + 1], jaw, 7, 3.4)) + '" fill="' + c.ink + '" stroke="' + c.ink + '" stroke-width="' + (lw * 2) + '" stroke-linejoin="round"/>';
    fl += '<ellipse cx="' + f.h[0].toFixed(1) + '" cy="' + f.h[1].toFixed(1) + '" rx="' + (hr * 0.9) + '" ry="' + (hr * 1.08) + '" fill="' + c.skin + '"/>';
    fl += '<path d="' + poly(quad([f.h[0], f.h[1] + 1], jaw, 7, 3.4)) + '" fill="' + c.skin + '"/>';
    // details: lapels crossing to the belt, the belt and its knot, cloth folds
    var det = "";
    det += seg(LSh, toward(LW, RW, 0.62), 1.3, c.ink) + seg(RSh, toward(LW, RW, 0.38), 1.3, c.ink);
    det += seg(LSh, toward(LSh, toward(LW, RW, 0.62), 0.55), 3.2, c.lapel) + seg(RSh, toward(RSh, toward(LW, RW, 0.38), 0.55), 3.2, c.lapel);
    det += '<path d="' + poly(quad(LW, RW, 3.6, 3.6)) + '" fill="' + c.belt + '" stroke="' + c.ink + '" stroke-width="1.1"/>';
    var knot = toward(LW, RW, 0.5);
    det += seg(knot, [knot[0] + face * 1.5, knot[1] + 6.5], 2.2, c.belt) + seg(knot, [knot[0] - face * 2, knot[1] + 6], 2.2, c.belt);
    det += seg(toward(re, rCuff, 0.3), toward(re, rCuff, 0.75), 0.9, c.fold) + seg(toward(rk, rHem, 0.25), toward(rk, rHem, 0.7), 0.9, c.fold);
    // hair, ear, and a brow / eye toward the opponent
    var bx = f.h[0] - face * 2;
    det += '<path d="M' + (f.h[0] - hr * 0.9) + "," + (f.h[1] + 0.5) +
      " Q" + bx + "," + (f.h[1] - hr * 2.1) + " " + (f.h[0] + hr * 0.95) + "," + (f.h[1] - 2.2) +
      " Q" + (f.h[0] + face * 1) + "," + (f.h[1] - hr * 0.55) + " " + (f.h[0] - face * hr * 0.2) + "," + (f.h[1] - hr * 0.35) +
      " L" + (bx - face * hr * 0.75) + "," + (f.h[1] + 1.8) + ' Z" fill="' + c.hair + '"/>';
    det += '<ellipse cx="' + (f.h[0] - face * 1.4).toFixed(1) + '" cy="' + (f.h[1] + 0.8).toFixed(1) + '" rx="1.2" ry="1.7" fill="' + c.shadowSkin + '"/>';
    var ex = f.h[0] + face * 3;
    det += seg([ex - face * 0.6, f.h[1] - 1.4], [ex + face * 2.6, f.h[1] - 0.9], 1.1, c.hair);
    det += seg([ex, f.h[1] + 0.6], [ex + face * 1.8, f.h[1] + 0.6], 1.1, c.ink);
    return "<g>" + ol + fl + det + "</g>";
  }

  var STYLE_A = { gi: "#f3efe6", shade: "#cfc8ba", lapel: "#e4ded1", fold: "#b9b1a2", belt: "#2f5fa8",
    skin: "#d8a77f", shadowSkin: "#b8875f", hair: "#1c1a18", ink: "#151820" };
  var STYLE_B = { gi: "#2b3a5c", shade: "#1f2a44", lapel: "#3a4b72", fold: "#16203a", belt: "#eeeae0",
    skin: "#a8724f", shadowSkin: "#875636", hair: "#0f0e0d", ink: "#0b0d13" };

  // A figure drawn at its depth scale, with a contact shadow that fades as
  // the body leaves the ground.
  function place(f, face, style) {
    var low = Math.max(f.lf[1], f.rf[1], f.p[1] + 8), lift = Math.max(0, f.gy - low);
    var sh = '<ellipse cx="' + f.p[0].toFixed(1) + '" cy="' + (f.gy + 6).toFixed(1) + '" rx="' + (30 * f.s - lift * 0.15).toFixed(1) +
      '" ry="' + (5 * f.s).toFixed(1) + '" fill="rgba(0,0,0,' + Math.max(0.08, 0.24 - lift * 0.003).toFixed(2) + ')"/>';
    var body = figure(f, face, style);
    if (f.s !== 1) {
      var cx = f.p[0], cy = f.gy;
      body = '<g transform="translate(' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ') scale(' + f.s.toFixed(3) + ') translate(' + (-cx).toFixed(1) + ' ' + (-cy).toFixed(1) + ')">' + body + "</g>";
    }
    return { shadow: sh, body: body };
  }

  function frame(svg, t) {
    if (!svg) return;
    t = Math.max(0, Math.min(1, t));
    var P = pose(t);
    var A = place(P.a, 1, STYLE_A), B = place(P.b, -1, STYLE_B);
    svg.innerHTML = A.shadow + B.shadow + (P.front === "a" ? B.body + A.body : A.body + B.body);
  }

  function init(svg) {
    svg.setAttribute("viewBox", "0 0 " + VW + " " + VH);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    frame(svg, 0);
  }

  window.ZWrestle = { frame: frame, init: init };
})();
