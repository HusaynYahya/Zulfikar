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

  var POSES = [
    { a: F([80,142],[80,112],[79,93],[99,118],[97,130],[70,GROUND],[90,GROUND]),
      b: F([160,142],[160,112],[161,93],[141,118],[143,130],[150,GROUND],[170,GROUND]) },
    { a: F([92,142],[97,112],[101,94],[121,103],[117,116],[80,GROUND],[99,178]),
      b: F([148,142],[143,112],[139,94],[119,103],[123,116],[160,GROUND],[141,178]) },
    { a: F([101,150],[109,123],[117,106],[129,120],[127,129],[88,GROUND],[107,178]),
      b: F([150,140],[146,110],[142,93],[125,112],[129,123],[162,GROUND],[144,178]) },
    { a: F([112,160],[123,139],[135,124],[147,150],[145,156],[96,GROUND],[119,176]),
      b: F([158,139],[152,109],[146,92],[133,128],[139,120],[150,GROUND],[169,GROUND]) },
    { a: F([120,162],[129,145],[139,132],[151,157],[149,150],[100,GROUND],[123,173]),
      b: F([168,151],[156,127],[146,118],[135,151],[141,141],[193,178],[183,GROUND]) },
    { a: F([108,163],[113,140],[119,123],[133,151],[129,139],[101,GROUND],[117,GROUND]),
      b: F([150,163],[145,140],[139,123],[127,151],[133,139],[159,GROUND],[143,GROUND]) },
    { a: F([92,142],[97,112],[101,94],[121,103],[117,116],[80,GROUND],[99,178]),
      b: F([148,142],[143,112],[139,94],[119,103],[123,116],[160,GROUND],[141,178]) },
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
