/* ============================================================================
   PROJECT ZULFIQAR — scroll-driven wrestling
   ----------------------------------------------------------------------------
   Two figures grapple through a short sequence as the page scrolls. The motion
   is deliberately stepped — a stop-motion / claymation feel — by quantising the
   progress between keyframe poses.

   ZWrestle.frame(svgEl, t)   t in [0,1] → draws the matching moment
   ============================================================================ */
(function () {
  "use strict";

  var VW = 240, VH = 200, GROUND = 182;

  // Each pose gives seven points per figure, in the 240×200 stage.
  // A is on the left and faces right; B is on the right and faces left.
  // p=pelvis, n=neck, h=head, l/r hands, lf/rf feet.
  function F(p, n, h, lh, rh, lf, rf) { return { p: p, n: n, h: h, lh: lh, rh: rh, lf: lf, rf: rf }; }

  var POSES = [
    // 0 — circling, hands up
    { a: F([80,142],[80,112],[79,94],[99,118],[97,130],[70,GROUND],[90,GROUND]),
      b: F([160,142],[160,112],[161,94],[141,118],[143,130],[150,GROUND],[170,GROUND]) },
    // 1 — collar-and-elbow tie-up
    { a: F([92,142],[97,112],[101,95],[121,103],[117,116],[80,GROUND],[99,178]),
      b: F([148,142],[143,112],[139,95],[119,103],[123,116],[160,GROUND],[141,178]) },
    // 2 — A changes levels, head inside
    { a: F([101,150],[109,123],[117,107],[129,120],[127,129],[88,GROUND],[107,178]),
      b: F([150,140],[146,110],[142,94],[125,112],[129,123],[162,GROUND],[144,178]) },
    // 3 — A shoots the double-leg
    { a: F([112,160],[123,139],[135,125],[147,150],[145,156],[96,GROUND],[119,176]),
      b: F([158,139],[152,109],[146,93],[133,128],[139,120],[150,GROUND],[169,GROUND]) },
    // 4 — B sprawls, A drives
    { a: F([120,162],[129,145],[139,133],[151,157],[149,150],[100,GROUND],[123,173]),
      b: F([168,151],[156,127],[146,119],[135,151],[141,141],[193,178],[183,GROUND]) },
    // 5 — scramble on the knees
    { a: F([108,163],[113,140],[119,124],[133,151],[129,139],[101,GROUND],[117,GROUND]),
      b: F([150,163],[145,140],[139,124],[127,151],[133,139],[159,GROUND],[143,GROUND]) },
    // 6 — back to the tie-up (loops to 0)
    { a: F([92,142],[97,112],[101,95],[121,103],[117,116],[80,GROUND],[99,178]),
      b: F([148,142],[143,112],[139,95],[119,103],[123,116],[160,GROUND],[141,178]) },
  ];

  function lerpP(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; }
  function lerpF(a, b, k) {
    return F(lerpP(a.p, b.p, k), lerpP(a.n, b.n, k), lerpP(a.h, b.h, k),
      lerpP(a.lh, b.lh, k), lerpP(a.rh, b.rh, k), lerpP(a.lf, b.lf, k), lerpP(a.rf, b.rf, k));
  }

  function limb(a, b, w1, w2, bend, col) {
    var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    var nx = -dy / len, ny = dx / len, k = bend * 0.2 * len;
    var j = [(a[0] + b[0]) / 2 + nx * k, (a[1] + b[1]) / 2 + ny * k];
    return line(a, j, w1, col) + line(j, b, w2, col);
  }
  function line(a, b, w, col) {
    return '<line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) +
      '" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round"/>';
  }
  function figure(f, col, bend) {
    return (
      '<g>' +
        line(f.n, f.p, 13, col) +                         // torso
        line(f.h, f.n, 8, col) +                          // neck
        '<circle cx="' + f.h[0].toFixed(1) + '" cy="' + f.h[1].toFixed(1) + '" r="10" fill="' + col + '"/>' +
        limb(f.n, f.lh, 9, 7, bend, col) +                // arms
        limb(f.n, f.rh, 9, 7, -bend, col) +
        limb(f.p, f.lf, 11, 8, bend, col) +               // legs
        limb(f.p, f.rf, 11, 8, -bend, col) +
      "</g>"
    );
  }

  function frame(svg, t) {
    if (!svg) return;
    t = Math.max(0, Math.min(1, t));
    var span = POSES.length - 1;
    var f = t * span, i = Math.min(span - 1, Math.floor(f));
    // quantise the blend so the motion steps like stop-motion
    var k = Math.round((f - i) * 4) / 4;
    var A = lerpF(POSES[i].a, POSES[i + 1].a, k);
    var B = lerpF(POSES[i].b, POSES[i + 1].b, k);
    svg.innerHTML =
      '<ellipse cx="120" cy="' + (GROUND + 6) + '" rx="78" ry="9" fill="rgba(0,0,0,.28)"/>' +
      figure(B, "rgba(20,24,34,.92)", 0.8) +
      figure(A, "#e6ae55", 0.8);
  }

  function init(svg) {
    svg.setAttribute("viewBox", "0 0 " + VW + " " + VH);
    svg.setAttribute("preserveAspectRatio", "xMidYMax meet");
    frame(svg, 0);
  }

  window.ZWrestle = { frame: frame, init: init };
})();
