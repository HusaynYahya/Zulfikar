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

  // Build a figure as outline layer + fill layer, so the whole body keeps a
  // clean ink edge (the illustrated look).
  function figure(f, face, skin, ink, hair, lw) {
    var le = elbow(f.n, f.lh, 1), re = elbow(f.n, f.rh, -1);
    var lk = elbow(f.p, f.lf, face), rk = elbow(f.p, f.rf, -face);
    // [a, b, bodyWidth]
    var bones = [
      [f.n, f.p, 15], [f.h, f.n, 8],
      [f.n, le, 9], [le, f.lh, 7], [f.n, re, 9], [re, f.rh, 7],
      [f.p, lk, 12], [lk, f.lf, 9], [f.p, rk, 12], [rk, f.rf, 9],
    ];
    var hr = 11;
    var ol = "", fl = "";
    bones.forEach(function (bo) {
      ol += seg(bo[0], bo[1], bo[2] + lw * 2, ink);
      fl += seg(bo[0], bo[1], bo[2], skin);
    });
    // head: ink ring, skin fill
    ol += '<circle cx="' + f.h[0].toFixed(1) + '" cy="' + f.h[1].toFixed(1) + '" r="' + (hr + lw) + '" fill="' + ink + '"/>';
    fl += '<circle cx="' + f.h[0].toFixed(1) + '" cy="' + f.h[1].toFixed(1) + '" r="' + hr + '" fill="' + skin + '"/>';
    // hair: a cap swept to the back (away from facing), with a couple of tufts
    var bx = f.h[0] - face * 3;
    fl += '<path d="M' + (f.h[0] - hr) + "," + (f.h[1] - 1) +
      " Q" + (bx) + "," + (f.h[1] - hr * 2.1) + " " + (f.h[0] + hr) + "," + (f.h[1] - 2) +
      " Q" + (f.h[0] + face * 2) + "," + (f.h[1] - hr * 0.8) + " " + (bx - face * hr * 0.8) + "," + (f.h[1] - hr * 0.5) +
      ' Z" fill="' + hair + '"/>';
    // face: a determined brow + eye line, toward the opponent
    var ex = f.h[0] + face * 3.4;
    fl += seg([ex - face * 1, f.h[1] - 1.5], [ex + face * 4, f.h[1] - 0.5], 1.4, ink);
    fl += seg([ex, f.h[1] + 2.6], [ex + face * 3.4, f.h[1] + 2.6], 1.6, ink);
    return '<g>' + ol + fl + "</g>";
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
