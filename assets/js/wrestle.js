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
  var POSES = [
    // 0 — ready / bow
    { a: F([80,146],[80,114],[80,95],[92,132],[90,144],[72,GROUND],[88,GROUND]),
      b: F([160,146],[160,114],[160,95],[148,132],[150,144],[152,GROUND],[168,GROUND]) },
    // 1 — fighting stance, guard up
    { a: F([86,146],[88,114],[90,95],[106,110],[99,120],[74,GROUND],[98,178]),
      b: F([154,146],[152,114],[150,95],[134,110],[141,120],[166,GROUND],[142,178]) },
    // 2 — B strikes, A blocks
    { a: F([90,146],[92,114],[94,96],[113,103],[105,116],[78,GROUND],[100,178]),
      b: F([150,146],[146,116],[142,98],[119,107],[150,120],[168,GROUND],[146,176]) },
    // 3 — the crane stance: balanced on one leg, arms spread like wings
    { a: F([86,138],[86,102],[86,82],[64,90],[112,88],[110,116],[84,GROUND]),
      b: F([156,146],[154,114],[152,96],[140,118],[146,124],[168,GROUND],[150,178]) },
    // 4 — the crane kick: airborne, leg driving forward, arms drawn back
    { a: F([104,120],[99,96],[97,78],[84,94],[88,104],[134,108],[94,138]),
      b: F([158,146],[156,116],[153,100],[142,120],[148,126],[170,GROUND],[152,178]) },
    // 5 — the strike lands, B is driven back
    { a: F([112,150],[112,120],[112,101],[100,112],[126,116],[100,GROUND],[126,176]),
      b: F([168,148],[163,120],[156,106],[178,126],[150,118],[184,GROUND],[170,176]) },
    // 6 — the finish, back to guard (loops to 1)
    { a: F([100,146],[102,114],[104,95],[120,110],[113,120],[88,GROUND],[110,178]),
      b: F([156,146],[154,114],[152,95],[138,110],[145,120],[168,GROUND],[146,178]) },
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
    var step = Math.round((f - i) * 4);          // quantise → stop-motion steps
    var k = step / 4;
    var A = lerpF(POSES[i].a, POSES[i + 1].a, k);
    var B = lerpF(POSES[i].b, POSES[i + 1].b, k);

    // boil: jitter every vertex a little, reseeded each displayed frame
    var rnd = mulberry(i * 97 + step * 13 + 7);
    function boil(fig) {
      var out = {};
      ["p","n","h","lh","rh","lf","rf"].forEach(function (key) {
        out[key] = [fig[key][0] + (rnd() - 0.5) * 2.4, fig[key][1] + (rnd() - 0.5) * 2.4];
      });
      return out;
    }
    A = boil(A); B = boil(B);

    svg.innerHTML =
      '<ellipse cx="120" cy="' + (GROUND + 7) + '" rx="80" ry="8" fill="rgba(0,0,0,.26)"/>' +
      figure(B, -1, "#9fa9bb", "#12151d", "#12151d", 3) +
      figure(A, 1, "#f2ead6", "#1b2029", "#2a2f3a", 3);
  }

  function init(svg) {
    svg.setAttribute("viewBox", "0 0 " + VW + " " + VH);
    svg.setAttribute("preserveAspectRatio", "xMidYMax meet");
    frame(svg, 0);
  }

  window.ZWrestle = { frame: frame, init: init };
})();
