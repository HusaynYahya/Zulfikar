/* ============================================================================
   PROJECT ZULFIQAR — a boy's flower bed
   ----------------------------------------------------------------------------
   Drawn on each boy's card. It starts as bare soil; every session he attends
   adds to it: grass first, then plants that come up, grow and flower, until
   by FULL sessions the bed is packed. Seeded by the boy's id, so each boy's
   bed is his own and looks the same every time it is drawn.

   ZGarden.svg(seed, sessions)  → SVG string
   ============================================================================ */
(function () {
  "use strict";

  var FULL = 30;                 // sessions until the bed is at its fullest
  var W = 600, H = 96, SOIL = 66;
  var PLANTS = 64, TUFTS = 110, CARPET = 90;
  var PETALS = [
    ["#e98aa6", "#f7c6d4"], ["#f2b84b", "#fbe3a6"], ["#b78be0", "#e2cff5"], ["#f6f1e8", "#ffffff"],
    ["#e8664f", "#f7b3a5"], ["#7fa7e8", "#c9dbf7"], ["#f39fbd", "#fde0ea"], ["#ffd36b", "#fff1c2"],
  ];

  function rng(seed) {
    var h = 2166136261;
    for (var i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    return function () {
      h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
      return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
  }
  function f(n) { return n.toFixed(1); }
  function clamp(x) { return Math.max(0, Math.min(1, x)); }

  // the top edge of the soil: a gentle mound
  function soilY(x) { return SOIL - 6 * Math.sin(Math.PI * x / W) - 1.5 * Math.sin(x / 37); }

  function flower(x, y, s, open, pal, rot) {
    var petals = "", r = 6.5 * s * (0.35 + 0.65 * open), n = 5;
    for (var k = 0; k < n; k++) {
      var a = rot + k * 2 * Math.PI / n;
      petals += '<ellipse cx="' + f(x + Math.cos(a) * r * 0.9) + '" cy="' + f(y + Math.sin(a) * r * 0.9) + '" rx="' + f(r * 0.75) + '" ry="' + f(r * 0.48) +
        '" transform="rotate(' + f(a * 180 / Math.PI) + " " + f(x + Math.cos(a) * r * 0.9) + " " + f(y + Math.sin(a) * r * 0.9) + ')" fill="' + pal[0] + '"/>';
    }
    return petals +
      '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r * 0.55) + '" fill="' + pal[1] + '" opacity=".55"/>' +
      '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(r * 0.32) + '" fill="#e0a43a"/>';
  }

  function svg(seed, sessions) {
    var rand = rng(String(seed || "garden"));
    var n = Math.max(0, sessions || 0), p = clamp(n / FULL);
    var s = '<svg class="garden" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">';
    s += '<defs><linearGradient id="gSoil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2c26" stop-opacity=".9"/><stop offset="1" stop-color="#1a1717" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="gEdge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a5a3e"/><stop offset="1" stop-color="#4a3424"/></linearGradient></defs>';

    // the bed: soil heaped inside a low timber edge
    var top = "M0," + H;
    for (var x = 0; x <= W; x += 12) top += " L" + f(x) + "," + f(soilY(x));
    s += '<path d="' + top + " L" + W + "," + H + ' Z" fill="url(#gSoil)"/>';
    for (var i = 0; i < 26; i++) {   // pebbles and crumbs in the soil
      var px = 20 + rand() * (W - 40), py = soilY(px) + 6 + rand() * (H - soilY(px) - 12);
      s += '<ellipse cx="' + f(px) + '" cy="' + f(py) + '" rx="' + f(1.2 + rand() * 2.4) + '" ry="' + f(0.8 + rand() * 1.4) + '" fill="#7c614b" opacity="' + (0.35 + rand() * 0.4).toFixed(2) + '"/>';
    }

    // everything that grows, at fixed places, each with the session it arrives at
    var items = [];
    for (i = 0; i < TUFTS; i++) {
      var tx = 14 + rand() * (W - 28);
      items.push({ kind: "tuft", x: tx, depth: rand(), at: 1 + rand() * FULL * 0.45, lean: (rand() - 0.5) * 6, h: 5 + rand() * 6 });
    }
    var order = [];
    for (i = 0; i < PLANTS; i++) order.push(i);
    for (i = order.length - 1; i > 0; i--) { var j = (rand() * (i + 1)) | 0, t = order[i]; order[i] = order[j]; order[j] = t; }
    for (i = 0; i < PLANTS; i++) {
      var x2 = 18 + (i + rand() * 0.8) * (W - 36) / PLANTS;
      items.push({ kind: "plant", x: x2, depth: rand(), at: 1 + order[i] / PLANTS * (FULL - 5), tall: 0.75 + rand() * 0.55,
        pal: PETALS[(rand() * PETALS.length) | 0], heads: rand() < 0.35 ? 2 : 1, lean: (rand() - 0.5) * 10, rot: rand() * 6.3, bush: rand() < 0.26 });
    }
    // a carpet of little flowers over the front of the bed, the last thing to fill in
    for (i = 0; i < CARPET; i++) {
      items.push({ kind: "carpet", x: 12 + rand() * (W - 24), depth: 0.55 + rand() * 0.45, at: FULL * 0.35 + rand() * FULL * 0.6,
        pal: PETALS[(rand() * PETALS.length) | 0], rot: rand() * 6.3, r: 0.8 + rand() * 0.6 });
    }
    items.sort(function (a, b) { return a.depth - b.depth; });   // back to front

    items.forEach(function (it) {
      var age = n - it.at + 1;          // sessions since it came up
      if (age <= 0) return;
      var base = soilY(it.x) + 2 + it.depth * (H - soilY(it.x) - 8), sc = 0.8 + it.depth * 0.35;
      if (it.kind === "carpet") {   // a low leafy cushion with tiny flowers
        var c = clamp(age / 3), cr = 7 * it.r * c * sc;
        s += '<ellipse cx="' + f(it.x) + '" cy="' + f(base - cr * 0.3) + '" rx="' + f(cr * 1.4) + '" ry="' + f(cr * 0.6) + '" fill="' + (it.depth > 0.75 ? "#6aa046" : "#578a3b") + '"/>';
        if (age >= 2) s += flower(it.x + cr * 0.3, base - cr * 0.55, 0.38 * sc * it.r, clamp((age - 2) / 2), it.pal, it.rot);
        return;
      }
      if (it.kind === "tuft") {
        var g = clamp(age / 3), hh = it.h * g * sc, col = it.depth > 0.5 ? "#6f9a4a" : "#5a8240";
        s += '<path d="M' + f(it.x - 3) + "," + f(base) + " Q" + f(it.x - 2 + it.lean * 0.3) + "," + f(base - hh * 0.6) + " " + f(it.x - 3 + it.lean) + "," + f(base - hh) +
          " M" + f(it.x) + "," + f(base) + " Q" + f(it.x + it.lean * 0.2) + "," + f(base - hh * 0.7) + " " + f(it.x + it.lean * 0.6) + "," + f(base - hh * 1.25) +
          " M" + f(it.x + 3) + "," + f(base) + " Q" + f(it.x + 2) + "," + f(base - hh * 0.6) + " " + f(it.x + 4 + it.lean * 0.5) + "," + f(base - hh * 0.9) +
          '" fill="none" stroke="' + col + '" stroke-width="1.4" stroke-linecap="round"/>';
        return;
      }
      // a plant: sprout, then stem and leaves, then bud, then flower
      var grow = clamp(age / 4), stemH = (10 + 28 * it.tall) * grow * sc, topX = it.x + it.lean * grow, topY = base - stemH;
      var green = it.depth > 0.5 ? "#5f8f3e" : "#4c7634";
      if (it.bush) {   // a low leafy clump that fills out
        var br = (6 + 12 * it.tall) * grow * sc;
        s += '<ellipse cx="' + f(it.x) + '" cy="' + f(base - br * 0.55) + '" rx="' + f(br * 1.25) + '" ry="' + f(br * 0.8) + '" fill="' + green + '"/>' +
          '<ellipse cx="' + f(it.x - br * 0.4) + '" cy="' + f(base - br * 0.8) + '" rx="' + f(br * 0.7) + '" ry="' + f(br * 0.5) + '" fill="#6fa64a" opacity=".8"/>';
        if (age >= 3) for (var b = 0; b < 4; b++) {
          var bx = it.x + Math.cos(it.rot + b * 1.7) * br * 0.9, by = base - br * 0.6 + Math.sin(it.rot + b * 1.7) * br * 0.45;
          s += flower(bx, by, 0.45 * sc, clamp((age - 3) / 3), it.pal, it.rot + b);
        }
        return;
      }
      s += '<path d="M' + f(it.x) + "," + f(base) + " Q" + f(it.x + it.lean * 0.2) + "," + f(base - stemH * 0.55) + " " + f(topX) + "," + f(topY) +
        '" fill="none" stroke="' + green + '" stroke-width="' + f(1.6 * sc) + '" stroke-linecap="round"/>';
      var lf = 7 * grow * sc;   // a pair of leaves
      s += '<ellipse cx="' + f(it.x - lf * 0.7) + '" cy="' + f(base - stemH * 0.32) + '" rx="' + f(lf) + '" ry="' + f(lf * 0.38) + '" transform="rotate(-28 ' + f(it.x - lf * 0.7) + " " + f(base - stemH * 0.32) + ')" fill="' + green + '"/>' +
        '<ellipse cx="' + f(it.x + lf * 0.7) + '" cy="' + f(base - stemH * 0.5) + '" rx="' + f(lf * 0.9) + '" ry="' + f(lf * 0.34) + '" transform="rotate(24 ' + f(it.x + lf * 0.7) + " " + f(base - stemH * 0.5) + ')" fill="#6fa64a"/>';
      if (age >= 2) {
        var open = clamp((age - 2) / 3);
        if (open === 0) s += '<ellipse cx="' + f(topX) + '" cy="' + f(topY) + '" rx="' + f(2.4 * sc) + '" ry="' + f(3.4 * sc) + '" fill="' + it.pal[0] + '"/>';   // bud
        else {
          s += flower(topX, topY, sc * it.tall, open, it.pal, it.rot);
          if (it.heads === 2 && age >= 4) {
            var sx = topX + 9 * sc, sy = topY + stemH * 0.3;
            s += '<path d="M' + f(topX - (topX - it.x) * 0.4) + "," + f(base - stemH * 0.55) + " Q" + f(sx - 3) + "," + f(sy + 6) + " " + f(sx) + "," + f(sy) + '" fill="none" stroke="' + green + '" stroke-width="' + f(1.2 * sc) + '"/>';
            s += flower(sx, sy, sc * 0.7, clamp((age - 4) / 3), it.pal, it.rot + 1);
          }
        }
      }
    });

    // when it's full, a couple of butterflies
    if (n >= FULL) {
      [[0.27, 18], [0.71, 12]].forEach(function (bf, k) {
        var bx = W * bf[0], by = bf[1], c = k ? "#f2b84b" : "#e98aa6";
        s += '<g transform="translate(' + f(bx) + " " + by + ')"><ellipse cx="-4" cy="-2" rx="5" ry="3.4" fill="' + c + '" transform="rotate(-25 -4 -2)"/>' +
          '<ellipse cx="4" cy="-2" rx="5" ry="3.4" fill="' + c + '" transform="rotate(25 4 -2)"/>' +
          '<ellipse cx="-3" cy="3" rx="3" ry="2.2" fill="' + c + '" opacity=".8"/><ellipse cx="3" cy="3" rx="3" ry="2.2" fill="' + c + '" opacity=".8"/>' +
          '<rect x="-.7" y="-4" width="1.4" height="9" rx=".7" fill="#3a2a20"/></g>';
      });
    }
    return s + "</svg>";
  }

  window.ZGarden = { svg: svg, FULL: FULL };
})();
