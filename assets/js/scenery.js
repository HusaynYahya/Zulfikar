/* ============================================================================
   PROJECT ZULFIQAR — mountain scenery
   ----------------------------------------------------------------------------
   Draws layered mountain landscapes as SVG: ridgelines made by midpoint
   displacement, fading into the sky with distance, with mist, a pine tree line
   and (at night) stars. The same seed always gives the same scene, so each
   page and each session recap keeps its own landscape.

   ZScenery.svg(seed, mood, { layers, fit, viewBox })  → SVG markup string
   moods: "dusk", "dawn", "day", "night", "ember"
   ============================================================================ */
(function () {
  "use strict";

  var W = 1600, H = 900;

  var MOODS = {
    // sky stops top→horizon, sun colour, distant haze, nearest ridge, stars?
    dusk:  { sky: ["#141a2e", "#3b3a5a", "#9a6a6e", "#e3a47a"], sun: "#ffd7a1", sunY: 0.56, haze: "#b98a86", near: "#0d111b", stars: 0.35 },
    ember: { sky: ["#10131f", "#2e2533", "#8a4a3a", "#e98a4a"], sun: "#ffc27a", sunY: 0.6,  haze: "#a8634c", near: "#0b0d14", stars: 0.2 },
    dawn:  { sky: ["#1f2a44", "#56658a", "#b9a6b0", "#efc9a8"], sun: "#fff0d6", sunY: 0.58, haze: "#a7a3b6", near: "#121827", stars: 0 },
    day:   { sky: ["#2d4a6b", "#55789a", "#8fb0c4", "#c9d8dc"], sun: null,      sunY: 0,    haze: "#8aa3b4", near: "#16222f", stars: 0 },
    night: { sky: ["#05070d", "#0b1324", "#172440", "#26365a"], sun: "#e9e6da", sunY: 0.22, haze: "#33456a", near: "#06090f", stars: 1, moon: true },
  };

  function rng(seed) {
    var h = 1779033703 ^ String(seed).length;
    for (var i = 0; i < String(seed).length; i++) {
      h = Math.imul(h ^ String(seed).charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
  }

  function hex(c) { return [1, 3, 5].map(function (i) { return parseInt(c.slice(i, i + 2), 16); }); }
  function mix(a, b, t) {
    var x = hex(a), y = hex(b);
    return "#" + x.map(function (v, i) { return Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0"); }).join("");
  }

  /* Midpoint displacement: a natural-looking ridge of 2^n + 1 heights. */
  function ridge(rand, base, amp, rough) {
    var n = 7, len = (1 << n) + 1, ys = new Array(len);
    ys[0] = base + (rand() - 0.5) * amp;
    ys[len - 1] = base + (rand() - 0.5) * amp;
    for (var step = len - 1, a = amp; step > 1; step >>= 1, a *= rough) {
      for (var i = step >> 1; i < len; i += step) {
        ys[i] = (ys[i - (step >> 1)] + ys[i + (step >> 1)]) / 2 + (rand() - 0.5) * a;
      }
    }
    return ys.map(function (y, i) { return [(i / (len - 1)) * W, y]; });
  }

  function pathOf(pts) {
    return "M0," + H + " L" + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" L") + " L" + W + "," + H + " Z";
  }

  function yAt(pts, x) {
    var i = Math.min(pts.length - 2, Math.floor((x / W) * (pts.length - 1)));
    var t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
    return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
  }

  /* A row of pines standing on a ridge. */
  function pines(rand, pts, size, density) {
    var out = "", x = rand() * 20;
    while (x < W) {
      var h = size * (0.55 + rand() * 0.9), w = h * (0.28 + rand() * 0.08), y = yAt(pts, x) + 3;
      out += "M" + x.toFixed(1) + "," + (y - h).toFixed(1);
      // three tiers, slightly ragged
      for (var k = 1; k <= 3; k++) {
        var ty = y - h + (h * k) / 3.2, tw = (w * k) / 3 + rand() * 2;
        out += " L" + (x + tw).toFixed(1) + "," + ty.toFixed(1) + " L" + (x + tw * 0.45).toFixed(1) + "," + (ty - 1).toFixed(1);
      }
      out += " L" + (x + w * 0.5).toFixed(1) + "," + y.toFixed(1) + " L" + (x - w * 0.5).toFixed(1) + "," + y.toFixed(1);
      for (var j = 3; j >= 1; j--) {
        var uy = y - h + (h * j) / 3.2, uw = (w * j) / 3 + rand() * 2;
        out += " L" + (x - uw * 0.45).toFixed(1) + "," + (uy - 1).toFixed(1) + " L" + (x - uw).toFixed(1) + "," + uy.toFixed(1);
      }
      out += " Z ";
      x += (6 + rand() * 26) / density;
    }
    return out;
  }

  function svg(seed, moodName, opts) {
    opts = opts || {};
    var m = MOODS[moodName] || MOODS.dusk;
    var rand = rng(seed + ":" + moodName);
    var id = "s" + Math.floor(rand() * 1e9).toString(36);
    var layers = opts.layers || 5;

    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (opts.viewBox || "0 0 " + W + " " + H) + '" preserveAspectRatio="' + (opts.fit || "xMidYMax slice") + '" aria-hidden="true" focusable="false">';
    s += "<defs>";
    s += '<linearGradient id="' + id + 'sky" x1="0" y1="0" x2="0" y2="1">' + m.sky.map(function (c, i) {
      return '<stop offset="' + (i / (m.sky.length - 1)) * 0.68 + '" stop-color="' + c + '"/>';
    }).join("") + "</linearGradient>";
    if (m.sun) {
      s += '<radialGradient id="' + id + 'glow"><stop offset="0" stop-color="' + m.sun + '" stop-opacity=".75"/><stop offset=".25" stop-color="' + m.sun + '" stop-opacity=".22"/><stop offset="1" stop-color="' + m.sun + '" stop-opacity="0"/></radialGradient>';
    }
    s += '<linearGradient id="' + id + 'mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + m.haze + '" stop-opacity="0"/><stop offset=".6" stop-color="' + m.haze + '" stop-opacity=".38"/><stop offset="1" stop-color="' + m.haze + '" stop-opacity="0"/></linearGradient>';
    s += "</defs>";
    s += '<rect width="' + W + '" height="' + H + '" fill="url(#' + id + 'sky)"/>';

    if (m.stars) {
      var stars = "";
      for (var i = 0; i < 220 * m.stars; i++) {
        var sy = Math.pow(rand(), 1.8) * H * 0.5;
        stars += '<circle cx="' + (rand() * W).toFixed(1) + '" cy="' + sy.toFixed(1) + '" r="' + (rand() < 0.08 ? 1.5 : 0.8).toFixed(1) +
          '" opacity="' + (0.25 + rand() * 0.6).toFixed(2) + '"/>';
      }
      s += '<g fill="#fff">' + stars + "</g>";
    }

    if (m.sun) {
      var sx = W * (0.25 + rand() * 0.5), sy2 = H * m.sunY;
      s += '<circle cx="' + sx.toFixed(0) + '" cy="' + sy2.toFixed(0) + '" r="' + (m.moon ? 260 : 520) + '" fill="url(#' + id + 'glow)"/>';
      s += '<circle cx="' + sx.toFixed(0) + '" cy="' + sy2.toFixed(0) + '" r="' + (m.moon ? 26 : 38) + '" fill="' + m.sun + '" opacity="' + (m.moon ? 0.9 : 0.95) + '"/>';
    }

    var prev = null;
    for (var L = 0; L < layers; L++) {
      var t = L / (layers - 1);
      var base = H * (0.52 + t * 0.3);
      var amp = H * (0.34 - t * 0.2);
      // distant ranges are craggy, near hills roll
      var pts = ridge(rand, base, amp, 0.64 - t * 0.16);
      var col = mix(m.haze, m.near, Math.pow(t, 0.75));
      if (prev) {
        // mist pooling in the valley in front of the previous ridge
        var top = Math.min.apply(null, pts.map(function (p) { return p[1]; }));
        s += '<rect x="0" y="' + (top - 70).toFixed(0) + '" width="' + W + '" height="170" fill="url(#' + id + 'mist)"/>';
      }
      // the furthest ranges dissolve into the sky
      var op = L === 0 ? 0.5 : L === 1 ? 0.82 : 1;
      s += '<path d="' + pathOf(pts) + '" fill="' + col + '"' + (op < 1 ? ' fill-opacity="' + op + '"' : "") + "/>";
      if (L >= layers - 2) s += '<path d="' + pines(rand, pts, L === layers - 1 ? 46 : 22, L === layers - 1 ? 0.9 : 1.6) + '" fill="' + col + '"/>';
      prev = pts;
    }
    return s + "</svg>";
  }

  window.ZScenery = { svg: svg, moods: Object.keys(MOODS) };
})();
