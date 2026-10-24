/* ============================================================================
   PROJECT ZULFIQAR — scroll-driven wrestling
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

  var VW = 240, VH = 200, GROUND = 182;

  // Seven points per figure, in the 240×200 stage. A is on the left and faces
  // right; B is on the right and faces left. p=pelvis n=neck h=head l/r hands,
  // lf/rf feet.
  function F(p, n, h, lh, rh, lf, rf) { return { p: p, n: n, h: h, lh: lh, rh: rh, lf: lf, rf: rf }; }

  // A karate exchange after the choreography of The Karate Kid — ready stance,
  // guard, a blocked strike, the one-legged crane stance, the leaping crane
  // kick, and the finish. A (left) is the hero who throws the crane kick.
  // A Brazilian jiu-jitsu flow: standing grips, a guard pull, closed guard,
  // then an armbar from the guard and the tap. A (gold) works from the back
  // and finishes; B (slate) is kept on their knees — the classic submission.
  var POSES = [
    // 0 — standing collar-and-sleeve grips
    { a: F([100,146],[101,114],[102,94],[117,106],[112,118],[90,182],[108,182]),
      b: F([140,146],[139,114],[138,94],[123,106],[128,118],[152,182],[134,182]) },
    // 1 — A pulls guard, sitting to the mat; B is drawn onto a knee
    { a: F([104,170],[99,156],[96,149],[118,150],[109,161],[128,154],[120,163]),
      b: F([142,168],[139,144],[137,130],[124,152],[131,148],[150,180],[140,178]) },
    // 2 — closed guard: A on their back, legs framing B who postures up
    { a: F([108,172],[101,161],[97,155],[122,152],[112,162],[134,152],[127,162]),
      b: F([144,170],[141,146],[139,132],[126,154],[133,150],[152,181],[142,179]) },
    // 3 — armbar set-up: A isolates B's arm, hips angling, a leg climbing high
    { a: F([112,172],[106,163],[102,157],[126,150],[118,160],[138,146],[124,166]),
      b: F([146,170],[140,148],[135,135],[122,156],[150,152],[154,181],[144,179]) },
    // 4 — A swings the top leg over B's head, hips turning under
    { a: F([114,173],[108,165],[104,160],[124,152],[116,162],[140,138],[126,166]),
      b: F([146,172],[139,152],[133,140],[120,158],[148,156],[154,181],[144,179]) },
    // 5 — the armbar: legs clamped over B, the arm pulled straight, B bent in
    { a: F([116,174],[110,167],[106,162],[122,156],[116,163],[138,140],[128,150]),
      b: F([148,172],[140,154],[133,143],[120,160],[150,158],[156,181],[146,179]) },
    // 6 — the tap: B's free hand slaps the mat
    { a: F([116,174],[110,167],[106,162],[122,156],[116,163],[138,140],[128,150]),
      b: F([148,172],[140,154],[133,143],[120,160],[156,177],[156,181],[146,179]) },
  ];

  function lerpP(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; }
  function lerpF(a, b, k) {
    return F(lerpP(a.p, b.p, k), lerpP(a.n, b.n, k), lerpP(a.h, b.h, k),
      lerpP(a.lh, b.lh, k), lerpP(a.rh, b.rh, k), lerpP(a.lf, b.lf, k), lerpP(a.rf, b.rf, k));
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

  function elbow(a, b, bend) {
    var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    return [(a[0] + b[0]) / 2 - dy / len * bend * 0.2 * len, (a[1] + b[1]) / 2 + dx / len * bend * 0.2 * len];
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
    var le = elbow(LSh, f.lh, 1), re = elbow(RSh, f.rh, -1);
    var lk = elbow(LHp, f.lf, face), rk = elbow(RHp, f.rf, -face);
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

  function frame(svg, t) {
    if (!svg) return;
    t = Math.max(0, Math.min(1, t));
    var span = POSES.length - 1;
    var f = t * span, i = Math.min(span - 1, Math.floor(f));
    var k = f - i;
    k = k * k * (3 - 2 * k);                     // smoothstep → lifelike easing
    var A = lerpF(POSES[i].a, POSES[i + 1].a, k);
    var B = lerpF(POSES[i].b, POSES[i + 1].b, k);

    svg.innerHTML =
      '<ellipse cx="120" cy="' + (GROUND + 7) + '" rx="80" ry="8" fill="rgba(0,0,0,.26)"/>' +
      figure(B, -1, STYLE_B) +
      figure(A, 1, STYLE_A);
  }

  function init(svg) {
    svg.setAttribute("viewBox", "0 0 " + VW + " " + VH);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    frame(svg, 0);
  }

  window.ZWrestle = { frame: frame, init: init };
})();
