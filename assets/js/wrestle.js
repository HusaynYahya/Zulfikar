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

  // A realistically-proportioned figure: small head on a neck, shaped torso
  // with shoulders and hips, tapered limbs, hands and feet. Drawn as an ink
  // layer under a skin layer so the whole body keeps one clean outline.
  function figure(f, face, skin, ink, hair, lw) {
    // shoulders and hips sit to each side of the neck / pelvis
    var tp = unit(f.p, f.n);              // torso up-direction
    var sx = -tp[1], sy = tp[0];          // across the shoulders
    var LSh = [f.n[0] + sx * 9, f.n[1] + sy * 9], RSh = [f.n[0] - sx * 9, f.n[1] - sy * 9];
    var LHp = [f.p[0] + sx * 6, f.p[1] + sy * 6], RHp = [f.p[0] - sx * 6, f.p[1] - sy * 6];
    var hr = 6.6, neckTop = [f.h[0] + (f.n[0] - f.h[0]) * 0.4, f.h[1] + (f.n[1] - f.h[1]) * 0.4];

    var le = elbow(LSh, f.lh, 1), re = elbow(RSh, f.rh, -1);
    var lk = elbow(LHp, f.lf, face), rk = elbow(RHp, f.rf, -face);
    var lToe = [f.lf[0] + unit(lk, f.lf)[0] * 7 + face * 2, f.lf[1] + 1];
    var rToe = [f.rf[0] + unit(rk, f.rf)[0] * 7 + face * 2, f.rf[1] + 1];

    var parts = [
      quad(LSh, RSh, 4, 4),                 // shoulder line (fills the gap)
      [[LSh[0],LSh[1]],[RSh[0],RSh[1]],[RHp[0],RHp[1]],[LHp[0],LHp[1]]], // torso
      quad(neckTop, f.n, 6, 10),            // neck
      quad(LSh, le, 7, 5.2), quad(le, f.lh, 5.2, 3.6),   // left arm
      quad(RSh, re, 7, 5.2), quad(re, f.rh, 5.2, 3.6),   // right arm
      quad(LHp, lk, 10, 7), quad(lk, f.lf, 7, 5),        // left leg
      quad(RHp, rk, 10, 7), quad(rk, f.rf, 7, 5),        // right leg
      quad(f.lf, lToe, 5.5, 4.5), quad(f.rf, rToe, 5.5, 4.5), // feet
    ];
    var ol = "", fl = "";
    parts.forEach(function (pp) {
      ol += '<path d="' + poly(pp) + '" fill="' + ink + '" stroke="' + ink + '" stroke-width="' + (lw * 2) + '" stroke-linejoin="round" stroke-linecap="round"/>';
      fl += '<path d="' + poly(pp) + '" fill="' + skin + '"/>';
    });
    // hands and the head, as circles joined into the same silhouette
    [f.lh, f.rh].forEach(function (hnd) {
      ol += '<circle cx="' + hnd[0].toFixed(1) + '" cy="' + hnd[1].toFixed(1) + '" r="' + (3.2 + lw) + '" fill="' + ink + '"/>';
      fl += '<circle cx="' + hnd[0].toFixed(1) + '" cy="' + hnd[1].toFixed(1) + '" r="3.2" fill="' + skin + '"/>';
    });
    ol += '<circle cx="' + f.h[0].toFixed(1) + '" cy="' + f.h[1].toFixed(1) + '" r="' + (hr + lw) + '" fill="' + ink + '"/>';
    fl += '<circle cx="' + f.h[0].toFixed(1) + '" cy="' + f.h[1].toFixed(1) + '" r="' + hr + '" fill="' + skin + '"/>';
    // hair swept back, away from the facing direction
    var bx = f.h[0] - face * 2;
    fl += '<path d="M' + (f.h[0] - hr * 0.95) + "," + (f.h[1] - 0.5) +
      " Q" + bx + "," + (f.h[1] - hr * 2) + " " + (f.h[0] + hr * 0.95) + "," + (f.h[1] - 1.5) +
      " Q" + (f.h[0] - face * hr * 0.3) + "," + (f.h[1] - hr * 0.7) + " " + (bx - face * hr) + "," + (f.h[1] - hr * 0.2) +
      ' Z" fill="' + hair + '"/>';
    // face: a brow and an eye line toward the opponent
    var ex = f.h[0] + face * 2;
    fl += seg([ex - face * 0.5, f.h[1] - 1], [ex + face * 3, f.h[1] - 0.2], 1.1, ink);
    fl += seg([ex, f.h[1] + 1.8], [ex + face * 2.6, f.h[1] + 1.8], 1.2, ink);
    return "<g>" + ol + fl + "</g>";
  }

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
      figure(B, -1, "#9fa9bb", "#12151d", "#12151d", 3) +
      figure(A, 1, "#f2ead6", "#1b2029", "#2a2f3a", 3);
  }

  function init(svg) {
    svg.setAttribute("viewBox", "0 0 " + VW + " " + VH);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    frame(svg, 0);
  }

  window.ZWrestle = { frame: frame, init: init };
})();
