/* ============================================================================
   PROJECT ZULFIQAR — scenery
   ----------------------------------------------------------------------------
   Draws layered landscapes as SVG, seeded so the same seed always gives the
   same scene. Several kinds of place:

     mountains  ridgelines, valley mist and a pine treeline      (the default)
     shrine     a golden-domed shrine with minarets, over a city
     desert     rolling dunes under a wide sky
     lake       hills mirrored in still water

   The shrine scene honours the holy shrines of the Ahl al-Bayt — a grand gilded
   dome and minarets catching the light above a quiet skyline. Pass
   { domes: 2 } for a twin-shrine skyline (as at Karbala).

   ZScenery.svg(seed, mood, { scene, layers, fit, viewBox, domes })  → SVG string
   moods: "dusk", "dawn", "day", "night", "ember"
   ============================================================================ */
(function () {
  "use strict";

  var W = 1600, H = 900;

  var MOODS = {
    // sky stops top→horizon, sun colour, distant haze, nearest ground, stars?
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
  function fx(n) { return n.toFixed(1); }

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
  function fillPath(pts, floor) {
    return "M0," + (floor || H) + " L" + pts.map(function (p) { return fx(p[0]) + "," + fx(p[1]); }).join(" L") + " L" + W + "," + (floor || H) + " Z";
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
      out += "M" + fx(x) + "," + fx(y - h);
      for (var k = 1; k <= 3; k++) {
        var ty = y - h + (h * k) / 3.2, tw = (w * k) / 3 + rand() * 2;
        out += " L" + fx(x + tw) + "," + fx(ty) + " L" + fx(x + tw * 0.45) + "," + fx(ty - 1);
      }
      out += " L" + fx(x + w * 0.5) + "," + fx(y) + " L" + fx(x - w * 0.5) + "," + fx(y);
      for (var j = 3; j >= 1; j--) {
        var uy = y - h + (h * j) / 3.2, uw = (w * j) / 3 + rand() * 2;
        out += " L" + fx(x - uw * 0.45) + "," + fx(uy - 1) + " L" + fx(x - uw) + "," + fx(uy);
      }
      out += " Z ";
      x += (6 + rand() * 26) / density;
    }
    return out;
  }

  /* ---- architecture (the shrine scene) --------------------------------- */

  /* An onion dome on its drum, with ribs and a finial. cx = centre, by = base
     line (springing), r = dome radius. Returns a path-group string. */
  function dome(cx, by, r, gold, rib, lit) {
    var dh = r * 1.5;                 // dome height above the springing line
    var top = by - dh, neck = by - r * 0.1;
    // onion profile: bulge out past r, then draw to a point
    var o = r * 1.18;
    var d =
      "M" + fx(cx - r) + "," + fx(by) +
      " C" + fx(cx - o) + "," + fx(by - r * 0.5) + " " + fx(cx - o) + "," + fx(by - r * 1.0) + " " + fx(cx - r * 0.42) + "," + fx(by - r * 1.3) +
      " C" + fx(cx - r * 0.18) + "," + fx(by - r * 1.42) + " " + fx(cx) + "," + fx(top) + " " + fx(cx) + "," + fx(top) +
      " C" + fx(cx) + "," + fx(top) + " " + fx(cx + r * 0.18) + "," + fx(by - r * 1.42) + " " + fx(cx + r * 0.42) + "," + fx(by - r * 1.3) +
      " C" + fx(cx + o) + "," + fx(by - r * 1.0) + " " + fx(cx + o) + "," + fx(by - r * 0.5) + " " + fx(cx + r) + "," + fx(by) + " Z";
    var g = '<path d="' + d + '" fill="' + gold + '"/>';
    // a vertical seam of shadow/highlight so the dome reads as round
    g += '<path d="M' + fx(cx) + "," + fx(top) + " C" + fx(cx + r * 0.1) + "," + fx(by - r) + " " + fx(cx + o * 0.6) + "," + fx(by - r * 0.5) + " " + fx(cx + r * 0.5) + "," + fx(by) +
      '" fill="none" stroke="' + lit + '" stroke-width="' + fx(r * 0.12) + '" stroke-linecap="round" opacity=".5"/>';
    g += '<path d="M' + fx(cx) + "," + fx(top) + " C" + fx(cx - r * 0.1) + "," + fx(by - r) + " " + fx(cx - o * 0.55) + "," + fx(by - r * 0.5) + " " + fx(cx - r * 0.55) + "," + fx(by) +
      '" fill="none" stroke="' + rib + '" stroke-width="' + fx(r * 0.1) + '" stroke-linecap="round" opacity=".45"/>';
    // drum under the dome
    g += '<rect x="' + fx(cx - r * 0.92) + '" y="' + fx(by) + '" width="' + fx(r * 1.84) + '" height="' + fx(r * 0.9) + '" fill="' + rib + '"/>';
    g += '<rect x="' + fx(cx - r * 0.92) + '" y="' + fx(by) + '" width="' + fx(r * 1.84) + '" height="' + fx(r * 0.22) + '" fill="' + gold + '" opacity=".7"/>';
    // finial: little ball and spike
    g += '<circle cx="' + fx(cx) + '" cy="' + fx(top - r * 0.12) + '" r="' + fx(r * 0.1) + '" fill="' + gold + '"/>';
    g += '<line x1="' + fx(cx) + '" y1="' + fx(top - r * 0.2) + '" x2="' + fx(cx) + '" y2="' + fx(top - r * 0.46) + '" stroke="' + gold + '" stroke-width="' + fx(r * 0.045) + '"/>';
    g += '<circle cx="' + fx(cx) + '" cy="' + fx(top - r * 0.5) + '" r="' + fx(r * 0.05) + '" fill="' + gold + '"/>';
    return g;
  }

  /* A minaret: tapering shaft, a gallery band, upper shaft and a gold cap. */
  function minaret(cx, by, h, w, stone, gold, lit) {
    var gy = by - h * 0.62;           // gallery height
    var topY = by - h;
    var g = "";
    // lower shaft (slightly tapered)
    g += '<path d="M' + fx(cx - w / 2) + "," + fx(by) + " L" + fx(cx - w * 0.4) + "," + fx(gy) + " L" + fx(cx + w * 0.4) + "," + fx(gy) + " L" + fx(cx + w / 2) + "," + fx(by) + ' Z" fill="' + stone + '"/>';
    g += '<rect x="' + fx(cx - w * 0.18) + '" y="' + fx(gy) + '" width="' + fx(w * 0.36) + '" height="' + fx(by - gy) + '" fill="' + lit + '" opacity=".18"/>';
    // gallery / balcony
    g += '<rect x="' + fx(cx - w * 0.6) + '" y="' + fx(gy - h * 0.06) + '" width="' + fx(w * 1.2) + '" height="' + fx(h * 0.09) + '" rx="' + fx(w * 0.1) + '" fill="' + gold + '"/>';
    // upper shaft
    g += '<rect x="' + fx(cx - w * 0.32) + '" y="' + fx(topY + h * 0.12) + '" width="' + fx(w * 0.64) + '" height="' + fx(gy - h * 0.06 - (topY + h * 0.12)) + '" fill="' + stone + '"/>';
    // small gold cap dome + finial
    g += dome(cx, topY + h * 0.12, w * 0.34, gold, mix(gold, "#000000", 0.35), lit).replace(/<rect[^>]*\/>/g, ""); // cap without a drum
    return g;
  }

  /* A quiet skyline: flat rooftops, the odd small dome and minaret spike. */
  function cityline(rand, baseY, col, gold) {
    var g = "", x = -20;
    while (x < W + 20) {
      var w = 24 + rand() * 70, h = 16 + rand() * 60, y = baseY - h;
      g += '<rect x="' + fx(x) + '" y="' + fx(y) + '" width="' + fx(w) + '" height="' + fx(baseY - y + 2) + '" fill="' + col + '"/>';
      var roll = rand();
      if (roll > 0.82) {               // a small dome on top
        g += '<path d="M' + fx(x) + "," + fx(y) + " C" + fx(x) + "," + fx(y - w * 0.5) + " " + fx(x + w) + "," + fx(y - w * 0.5) + " " + fx(x + w) + "," + fx(y) + ' Z" fill="' + col + '"/>';
        if (roll > 0.93) g += '<circle cx="' + fx(x + w / 2) + '" cy="' + fx(y - w * 0.52) + '" r="3" fill="' + gold + '" opacity=".8"/>';
      } else if (roll > 0.7) {         // a thin minaret spike
        g += '<rect x="' + fx(x + w / 2 - 3) + '" y="' + fx(y - h * 0.7) + '" width="6" height="' + fx(h * 0.7) + '" fill="' + col + '"/>';
        g += '<circle cx="' + fx(x + w / 2) + '" cy="' + fx(y - h * 0.7) + '" r="4" fill="' + gold + '" opacity=".75"/>';
      }
      x += w + rand() * 10;
    }
    return g;
  }

  /* ---- scene builders -------------------------------------------------- */

  function layersBackdrop(rand, m, id, count, topBias) {
    var s = "", prev = null;
    for (var L = 0; L < count; L++) {
      var t = L / (count - 1);
      var base = H * ((topBias || 0.52) + t * 0.3);
      var amp = H * (0.34 - t * 0.2);
      var pts = ridge(rand, base, amp, 0.64 - t * 0.16);
      var col = mix(m.haze, m.near, Math.pow(t, 0.75));
      if (prev) {
        var top = Math.min.apply(null, pts.map(function (p) { return p[1]; }));
        s += '<rect x="0" y="' + fx(top - 70) + '" width="' + W + '" height="170" fill="url(#' + id + 'mist)"/>';
      }
      var op = L === 0 ? 0.5 : L === 1 ? 0.82 : 1;
      s += '<path d="' + fillPath(pts) + '" fill="' + col + '"' + (op < 1 ? ' fill-opacity="' + op + '"' : "") + "/>";
      if (L >= count - 2) s += '<path d="' + pines(rand, pts, L === count - 1 ? 46 : 22, L === count - 1 ? 0.9 : 1.6) + '" fill="' + col + '"/>';
      prev = pts;
    }
    return s;
  }

  function sceneMountains(rand, m, id, opts) {
    return layersBackdrop(rand, m, id, opts.layers || 5);
  }

  function sceneShrine(rand, m, id, opts) {
    var s = "";
    // soft distant hills, kept low and hazy
    var hills = ridge(rand, H * 0.62, H * 0.14, 0.6);
    s += '<path d="' + fillPath(hills) + '" fill="' + mix(m.haze, m.near, 0.35) + '" fill-opacity=".6"/>';
    var horizon = H * 0.72;
    // the town, in silhouette
    s += '<g>' + cityline(rand, horizon, mix(m.near, "#000000", 0.1), m.sun || "#e9c27a") + "</g>";
    // gilding that catches the evening light
    var gold = "url(#" + id + "gold)", stone = mix(m.near, m.haze, 0.5), lit = m.sun || "#ffe9c0";
    var domes = opts.domes || 1;
    if (domes >= 2) {
      // twin shrines, as the sanctuaries of Imam Husayn and al-Abbas stand facing
      s += '<g>' + minaret(W * 0.26, horizon, 240, 26, stone, gold, lit) + minaret(W * 0.44, horizon, 240, 26, stone, gold, lit) + dome(W * 0.35, horizon - 150, 78, gold, mix(m.near, m.haze, 0.6), lit) + "</g>";
      s += '<g>' + minaret(W * 0.58, horizon, 230, 25, stone, gold, lit) + minaret(W * 0.74, horizon, 230, 25, stone, gold, lit) + dome(W * 0.66, horizon - 140, 74, gold, mix(m.near, m.haze, 0.6), lit) + "</g>";
    } else {
      // a grand shrine: one great gilded dome between two tall minarets,
      // over a pointed portal (iwan) — as at Najaf and Karbala
      var cx = W * (0.42 + rand() * 0.16);
      var drum = mix(m.near, m.haze, 0.55);
      // the sanctuary block the dome sits on
      s += '<rect x="' + fx(cx - 150) + '" y="' + fx(horizon - 120) + '" width="300" height="120" fill="' + stone + '"/>';
      s += minaret(cx - 205, horizon, 265, 30, stone, gold, lit);
      s += minaret(cx + 205, horizon, 265, 30, stone, gold, lit);
      // a tall pointed portal recessed in the façade
      s += '<path d="M' + fx(cx - 52) + "," + fx(horizon) + " L" + fx(cx - 52) + "," + fx(horizon - 70) + " Q" + fx(cx) + "," + fx(horizon - 142) + " " + fx(cx + 52) + "," + fx(horizon - 70) + " L" + fx(cx + 52) + "," + fx(horizon) + ' Z" fill="' + mix(m.near, "#000000", 0.3) + '"/>';
      s += '<path d="M' + fx(cx - 52) + "," + fx(horizon - 70) + " Q" + fx(cx) + "," + fx(horizon - 142) + " " + fx(cx + 52) + "," + fx(horizon - 70) + '" fill="none" stroke="' + gold + '" stroke-width="5" opacity=".8"/>';
      s += dome(cx, horizon - 120, 104, gold, drum, lit);
    }
    // a faint reflected glow on the ground before the shrine
    s += '<rect x="0" y="' + fx(horizon) + '" width="' + W + '" height="' + fx(H - horizon) + '" fill="' + mix(m.near, "#000000", 0.2) + '"/>';
    return s;
  }

  function sceneDesert(rand, m, id) {
    var s = "", prev = null;
    for (var L = 0; L < 5; L++) {
      var t = L / 4;
      var base = H * (0.55 + t * 0.32);
      // smooth, rolling dunes: low roughness
      var pts = ridge(rand, base, H * (0.16 - t * 0.08), 0.42);
      var col = mix(mix(m.haze, "#d9a878", 0.4), m.near, Math.pow(t, 0.8));
      if (prev) {
        var top = Math.min.apply(null, pts.map(function (p) { return p[1]; }));
        s += '<rect x="0" y="' + fx(top - 60) + '" width="' + W + '" height="150" fill="url(#' + id + 'mist)"/>';
      }
      s += '<path d="' + fillPath(pts) + '" fill="' + col + '"' + (L === 0 ? ' fill-opacity=".6"' : "") + "/>";
      prev = pts;
    }
    return s;
  }

  function sceneLake(rand, m, id, opts) {
    var waterY = H * 0.68;
    var s = layersBackdrop(rand, m, id, opts.layers || 4, 0.4);
    // mirror the lower half into still water
    s = '<g>' + s + "</g>" +
      '<g transform="translate(0,' + fx(2 * waterY) + ') scale(1,-1)" opacity=".5"><g>' + s + "</g></g>";
    // water plane and a line of light where the sky meets it
    s += '<rect x="0" y="' + fx(waterY) + '" width="' + W + '" height="' + fx(H - waterY) + '" fill="' + mix(m.near, m.haze, 0.3) + '" fill-opacity=".55"/>';
    s += '<rect x="0" y="' + fx(waterY - 2) + '" width="' + W + '" height="4" fill="' + (m.sun || "#cfe0e6") + '" opacity=".4"/>';
    return s;
  }

  var SCENES = { mountains: sceneMountains, shrine: sceneShrine, desert: sceneDesert, lake: sceneLake };

  function svg(seed, moodName, opts) {
    opts = opts || {};
    var m = MOODS[moodName] || MOODS.dusk;
    var rand = rng(seed + ":" + moodName + ":" + (opts.scene || "mountains"));
    var id = "s" + Math.floor(rand() * 1e9).toString(36);

    var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + (opts.viewBox || "0 0 " + W + " " + H) + '" preserveAspectRatio="' + (opts.fit || "xMidYMax slice") + '" aria-hidden="true" focusable="false">';
    s += "<defs>";
    s += '<linearGradient id="' + id + 'sky" x1="0" y1="0" x2="0" y2="1">' + m.sky.map(function (c, i) {
      return '<stop offset="' + (i / (m.sky.length - 1)) * 0.68 + '" stop-color="' + c + '"/>';
    }).join("") + "</linearGradient>";
    if (m.sun) {
      s += '<radialGradient id="' + id + 'glow"><stop offset="0" stop-color="' + m.sun + '" stop-opacity=".75"/><stop offset=".25" stop-color="' + m.sun + '" stop-opacity=".22"/><stop offset="1" stop-color="' + m.sun + '" stop-opacity="0"/></radialGradient>';
    }
    s += '<linearGradient id="' + id + 'mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + m.haze + '" stop-opacity="0"/><stop offset=".6" stop-color="' + m.haze + '" stop-opacity=".38"/><stop offset="1" stop-color="' + m.haze + '" stop-opacity="0"/></linearGradient>';
    // gilding for the shrine, warmed by the mood's light
    var g1 = mix("#f7d58a", m.sun || "#f7d58a", 0.3), g2 = mix("#9c6a2a", m.near, 0.3);
    s += '<linearGradient id="' + id + 'gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + mix(g1, "#ffffff", 0.3) + '"/><stop offset=".45" stop-color="' + g1 + '"/><stop offset="1" stop-color="' + g2 + '"/></linearGradient>';
    s += "</defs>";
    s += '<rect width="' + W + '" height="' + H + '" fill="url(#' + id + 'sky)"/>';

    if (m.stars) {
      var stars = "";
      for (var i = 0; i < 220 * m.stars; i++) {
        var sy = Math.pow(rand(), 1.8) * H * 0.5;
        stars += '<circle cx="' + fx(rand() * W) + '" cy="' + fx(sy) + '" r="' + (rand() < 0.08 ? 1.5 : 0.8) + '" opacity="' + (0.25 + rand() * 0.6).toFixed(2) + '"/>';
      }
      s += '<g fill="#fff">' + stars + "</g>";
    }
    if (m.sun) {
      var sx = W * (0.25 + rand() * 0.5), sy2 = H * m.sunY;
      s += '<circle cx="' + sx.toFixed(0) + '" cy="' + sy2.toFixed(0) + '" r="' + (m.moon ? 260 : 520) + '" fill="url(#' + id + 'glow)"/>';
      s += '<circle cx="' + sx.toFixed(0) + '" cy="' + sy2.toFixed(0) + '" r="' + (m.moon ? 26 : 38) + '" fill="' + m.sun + '" opacity="' + (m.moon ? 0.9 : 0.95) + '"/>';
    }

    s += (SCENES[opts.scene] || sceneMountains)(rand, m, id, opts);
    return s + "</svg>";
  }

  window.ZScenery = { svg: svg, moods: Object.keys(MOODS), scenes: Object.keys(SCENES) };
})();
