/* ============================================================================
   PROJECT ZULFIQAR — scenery
   ----------------------------------------------------------------------------
   Draws layered landscapes as SVG, seeded so the same seed always gives the
   same scene. Several kinds of place:

     mountains  ridgelines, valley mist and a pine treeline      (the default)
     desert     rolling dunes under a wide sky
     lake       hills mirrored in still water

   ZScenery.svg(seed, mood, { scene, layers, fit, viewBox })  → SVG string
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

  /* ---- scene builders -------------------------------------------------- */
  /* Terrain as a stack of ridgelines. A preset (cfg) tunes the land shape and
     colour; the natural scenes below are all variations on this, some with
     water, snow, a river or reeds added. */

  function terrain(rand, m, id, cfg) {
    cfg = cfg || {};
    var count = cfg.layers || 5;
    var haze = cfg.haze ? mix(m.haze, cfg.haze[0], cfg.haze[1]) : m.haze;
    var near = cfg.near ? mix(m.near, cfg.near[0], cfg.near[1]) : m.near;
    var s = "", prev = null, all = [];
    for (var L = 0; L < count; L++) {
      var t = count > 1 ? L / (count - 1) : 1;
      var base = H * ((cfg.base || 0.52) + t * (cfg.spread == null ? 0.3 : cfg.spread));
      var amp = H * ((cfg.amp == null ? 0.34 : cfg.amp) - t * (cfg.ampFall == null ? 0.2 : cfg.ampFall));
      var rough = (cfg.rough == null ? 0.64 : cfg.rough) - t * (cfg.roughFall == null ? 0.14 : cfg.roughFall);
      var pts = ridge(rand, base, amp, rough);
      var col = mix(haze, near, Math.pow(t, 0.75));
      // snowy caps on the far, high peaks
      if (cfg.snow && t < 0.5) col = mix(col, "#eef3f6", (0.5 - t) * 0.9);
      if (prev && cfg.mist !== false) {
        var top = Math.min.apply(null, pts.map(function (p) { return p[1]; }));
        s += '<rect x="0" y="' + fx(top - 70) + '" width="' + W + '" height="170" fill="url(#' + id + 'mist)"/>';
      }
      var op = L === 0 ? 0.5 : L === 1 ? 0.82 : 1;
      s += '<path d="' + fillPath(pts) + '" fill="' + col + '"' + (op < 1 ? ' fill-opacity="' + op + '"' : "") + "/>";
      if (cfg.pines && L >= count - (cfg.pines === "dense" ? 3 : 2)) {
        var sz = L === count - 1 ? 46 : 24, dn = (L === count - 1 ? 0.9 : 1.6) * (cfg.pines === "dense" ? 1.7 : 1);
        s += '<path d="' + pines(rand, pts, sz, dn) + '" fill="' + col + '"/>';
      }
      all.push({ pts: pts, col: col });
      prev = pts;
    }
    return { markup: s, layers: all, near: near, haze: haze };
  }

  // Reflect a built terrain into still water at waterY, with a light line.
  function withWater(rand, m, id, built, waterY, tint) {
    var water = tint ? mix(m.near, tint[0], tint[1]) : mix(m.near, m.haze, 0.3);
    var s = '<g>' + built.markup + "</g>" +
      '<g transform="translate(0,' + fx(2 * waterY) + ') scale(1,-1)" opacity=".45"><g>' + built.markup + "</g></g>";
    s += '<rect x="0" y="' + fx(waterY) + '" width="' + W + '" height="' + fx(H - waterY) + '" fill="' + water + '" fill-opacity=".55"/>';
    s += '<rect x="0" y="' + fx(waterY - 2) + '" width="' + W + '" height="4" fill="' + (m.sun || "#cfe0e6") + '" opacity=".4"/>';
    return s;
  }

  // Presets for each natural place.
  var PRESETS = {
    mountains: { rough: 0.64, roughFall: 0.14, pines: true, layers: 5 },
    alpine:    { rough: 0.82, roughFall: 0.12, base: 0.44, spread: 0.34, amp: 0.46, ampFall: 0.26, snow: true, pines: true, layers: 5, haze: ["#9fb3c4", 0.3] },
    foothills: { rough: 0.5, roughFall: 0.14, base: 0.56, amp: 0.26, ampFall: 0.16, pines: true, layers: 6 },
    forest:    { rough: 0.5, roughFall: 0.12, base: 0.5, amp: 0.3, pines: "dense", layers: 6, haze: ["#3f6b4e", 0.28], near: ["#0c160f", 0.4] },
    hills:     { rough: 0.34, roughFall: 0.1, base: 0.58, amp: 0.2, ampFall: 0.1, layers: 5, haze: ["#86a06a", 0.3], near: ["#12180e", 0.3] },
    meadow:    { rough: 0.3, roughFall: 0.1, base: 0.66, amp: 0.14, ampFall: 0.07, layers: 4, haze: ["#9bad73", 0.28], near: ["#141a0f", 0.3] },
    desert:    { rough: 0.42, roughFall: 0.1, base: 0.55, amp: 0.16, ampFall: 0.08, layers: 5, haze: ["#d9a878", 0.4], near: ["#2a1d12", 0.2] },
  };

  function sceneMountains(rand, m, id, opts) { return terrain(rand, m, id, Object.assign({}, PRESETS.mountains, { layers: opts.layers || 5 })).markup; }
  function sceneAlpine(rand, m, id) { return terrain(rand, m, id, PRESETS.alpine).markup; }
  function sceneFoothills(rand, m, id) { return terrain(rand, m, id, PRESETS.foothills).markup; }
  function sceneForest(rand, m, id) { return terrain(rand, m, id, PRESETS.forest).markup; }
  function sceneHills(rand, m, id) { return terrain(rand, m, id, PRESETS.hills).markup; }
  function sceneMeadow(rand, m, id) { return terrain(rand, m, id, PRESETS.meadow).markup; }
  function sceneDesert(rand, m, id) { return terrain(rand, m, id, PRESETS.desert).markup; }
  function sceneLake(rand, m, id) {
    var waterY = H * 0.68;
    var built = terrain(rand, m, id, { rough: 0.5, roughFall: 0.14, base: 0.4, amp: 0.3, pines: true, layers: 4 });
    return withWater(rand, m, id, built, waterY);
  }

  function sceneCoast(rand, m, id) {
    var seaY = H * 0.6;
    // a low headland on one side, otherwise open sea to the horizon
    var side = rand() < 0.5;
    var built = terrain(rand, m, id, { base: 0.42, amp: 0.22, ampFall: 0.12, rough: 0.5, pines: side ? "dense" : true, layers: 3, mist: false });
    var s = withWater(rand, m, id, built, seaY, ["#20506a", 0.5]);
    // a few shimmer lines on the water
    for (var i = 0; i < 5; i++) {
      var y = seaY + 20 + i * ((H - seaY) / 6), w = W * (0.3 + rand() * 0.4), x = rand() * (W - w);
      s += '<rect x="' + fx(x) + '" y="' + fx(y) + '" width="' + fx(w) + '" height="2" fill="' + (m.sun || "#cfe0e6") + '" opacity="' + (0.18 - i * 0.02).toFixed(2) + '"/>';
    }
    return s;
  }

  function sceneRiver(rand, m, id) {
    var built = terrain(rand, m, id, { rough: 0.6, roughFall: 0.14, base: 0.46, amp: 0.34, pines: true, layers: 5 });
    var s = built.markup;
    // a river widening from the horizon toward the viewer, catching the light
    var hx = W * (0.4 + rand() * 0.2), hy = H * 0.6;
    var water = mix(m.near, m.haze, 0.4), lit = m.sun || "#cfe0e6";
    s += '<path d="M' + fx(hx - 6) + "," + fx(hy) + " L" + fx(hx + 6) + "," + fx(hy) +
      " C" + fx(hx + 60) + "," + fx(H * 0.8) + " " + fx(W * 0.72) + "," + fx(H * 0.9) + " " + fx(W * 0.85) + "," + fx(H) +
      " L" + fx(W * 0.2) + "," + fx(H) +
      " C" + fx(W * 0.4) + "," + fx(H * 0.88) + " " + fx(hx - 55) + "," + fx(H * 0.8) + " " + fx(hx - 6) + "," + fx(hy) + ' Z" fill="' + water + '" fill-opacity=".7"/>';
    s += '<path d="M' + fx(hx) + "," + fx(hy) + " C" + fx(hx + 30) + "," + fx(H * 0.82) + " " + fx(W * 0.55) + "," + fx(H * 0.9) + " " + fx(W * 0.52) + "," + fx(H) +
      '" fill="none" stroke="' + lit + '" stroke-width="3" opacity=".35"/>';
    return s;
  }

  function sceneMarsh(rand, m, id) {
    var waterY = H * 0.74;
    var built = terrain(rand, m, id, { rough: 0.4, roughFall: 0.12, base: 0.5, amp: 0.18, ampFall: 0.1, layers: 4, haze: ["#7f9166", 0.3], near: ["#11160d", 0.3] });
    var s = withWater(rand, m, id, built, waterY, ["#2a3a30", 0.5]);
    // reeds in small clumps along the near bank
    var col = mix(built.near, "#000000", 0.15), x = 20 + rand() * 40;
    while (x < W) {
      var blades = 3 + (rand() * 4 | 0), by = H - 20 - rand() * 40;
      for (var k = 0; k < blades; k++) {
        var h = 34 + rand() * 60, bx = x + (k - blades / 2) * 6, lean = (rand() - 0.5) * 10;
        s += '<path d="M' + fx(bx) + "," + fx(by) + " Q" + fx(bx + lean) + "," + fx(by - h * 0.55) + " " + fx(bx + lean * 1.8) + "," + fx(by - h) + '" fill="none" stroke="' + col + '" stroke-width="1.6" stroke-linecap="round"/>';
      }
      x += 70 + rand() * 150;
    }
    return s;
  }

  var SCENES = {
    mountains: sceneMountains, alpine: sceneAlpine, foothills: sceneFoothills,
    forest: sceneForest, hills: sceneHills, meadow: sceneMeadow,
    desert: sceneDesert, lake: sceneLake,
    coast: sceneCoast, river: sceneRiver, marsh: sceneMarsh,
  };

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
