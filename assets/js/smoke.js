/* ============================================================================
   PROJECT ZULFIQAR — steam from the sword
   ----------------------------------------------------------------------------
   Thin steam rises off the whole sword in the logo (both blades, the guard
   and the hilt) and some of it gathers into small cartoon clouds. The wind
   blows left to right, and more cartoon clouds drift in from the left edge
   across the mountains. Drawn on a canvas just above the scenery and behind
   the page, so text stays crisp.

   ZSmoke.start(imgEl)   starts the steam from that logo; returns stop()
   ============================================================================ */
(function () {
  "use strict";

  // How much steam: puffs per second (desktop, phone), and how many of them
  // become a cartoon cloud (1 in CLOUD_EVERY).
  var RATE = [11, 6], CLOUD_EVERY = 5;

  // The sword, traced as lines over the logo, in fractions of its width/height.
  var SWORD = [
    [[0.445, 0.03], [0.475, 0.40], [0.50, 0.72]],                 // left blade
    [[0.515, 0.02], [0.555, 0.20], [0.56, 0.40], [0.51, 0.72]],   // right blade
    [[0.30, 0.765], [0.70, 0.765]],                               // guard
    [[0.50, 0.78], [0.50, 0.97]],                                 // hilt
  ];
  var SEGS = [], TOTAL = 0;
  SWORD.forEach(function (line) {
    for (var i = 1; i < line.length; i++) {
      var a = line[i - 1], b = line[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      SEGS.push({ a: a, b: b, len: len }); TOTAL += len;
    }
  });
  // A random point on the sword, weighted by length so every part steams evenly.
  function swordPoint() {
    var d = Math.random() * TOTAL;
    for (var i = 0; i < SEGS.length; i++) {
      var s = SEGS[i];
      if (d <= s.len) { var t = d / s.len; return [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t]; }
      d -= s.len;
    }
    return SEGS[0].a;
  }

  var running = null;

  // One soft puff, drawn once and stamped many times.
  function puffSprite() {
    var c = document.createElement("canvas"); c.width = c.height = 128;
    var g = c.getContext("2d"), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(240,232,220,1)");
    r.addColorStop(0.45, "rgba(232,224,214,.55)");
    r.addColorStop(1, "rgba(225,218,210,0)");
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    return c;
  }

  // A cartoon cloud: a flat bank of round lumps on a level base, with a soft
  // shadow along the bottom and an ink outline, in a few shapes.
  function cloudSprite(lumps) {
    var c = document.createElement("canvas"); c.width = 256; c.height = 150;
    var g = c.getContext("2d"), base = 112;
    function shape() {
      g.beginPath();
      lumps.forEach(function (l) { g.moveTo(l[0] + l[2], base - l[1]); g.arc(l[0], base - l[1], l[2], 0, Math.PI * 2); });
      g.rect(lumps[0][0], base - 26, lumps[lumps.length - 1][0] - lumps[0][0], 26);
    }
    g.save(); shape(); g.lineWidth = 7; g.strokeStyle = "rgba(38,44,64,.55)"; g.stroke(); g.restore();   // outline
    g.save(); shape(); g.fillStyle = "#f6f1e8"; g.fill(); g.clip();
    var sh = g.createLinearGradient(0, base - 40, 0, base);                                             // belly shadow
    sh.addColorStop(0, "rgba(176,170,196,0)"); sh.addColorStop(1, "rgba(176,170,196,.85)");
    g.fillStyle = sh; g.fillRect(0, base - 40, 256, 40);
    g.fillStyle = "rgba(255,255,255,.75)";                                                               // a highlight
    g.beginPath(); g.ellipse(lumps[1][0] - 6, base - lumps[1][1] - lumps[1][2] * .45, lumps[1][2] * .45, lumps[1][2] * .22, -.3, 0, Math.PI * 2); g.fill();
    g.restore();
    return c;
  }
  var CLOUD_SHAPES = [
    [[46, 24, 24], [92, 44, 36], [146, 40, 32], [194, 24, 26], [214, 18, 18]],
    [[40, 20, 20], [80, 40, 30], [128, 56, 40], [178, 34, 30], [214, 20, 20]],
    [[50, 22, 22], [104, 38, 34], [160, 30, 28], [204, 18, 18]],
  ];

  function start(logo) {
    if (running) running();
    if (!logo || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return function () {};

    var canvas = document.createElement("canvas");
    canvas.className = "smoke"; canvas.setAttribute("aria-hidden", "true");
    var scene = document.getElementById("scene");
    if (scene) scene.after(canvas); else document.body.prepend(canvas);
    var ctx = canvas.getContext("2d"), puff = puffSprite(), clouds = CLOUD_SHAPES.map(cloudSprite);
    var W = 0, H = 0, dpr = 1, small = false;
    function size() {
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      W = innerWidth; H = innerHeight; small = W < 700;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size(); addEventListener("resize", size);

    var parts = [], last = performance.now(), carry = 0, raf = 0, clock = 0, count = 0;
    // clouds drifting in from the left, across the mountains
    var drift = [], nextDrift = 0;
    function addDrift(x) {
      var w = (small ? 64 : 96) + Math.random() * (small ? 40 : 70);
      drift.push({ x: x, y: H * (small ? .4 + Math.random() * .12 : .13 + Math.random() * .2),   // clear of the headline w: w, speed: 14 + Math.random() * 14 + w * .05,
        sprite: clouds[(Math.random() * clouds.length) | 0], flip: Math.random() < .5, seed: Math.random() * 100, age: 0 });
    }
    var MAX = small ? 60 : 110;

    function emit(b) {
      var pt = swordPoint(), scale = b.width / 220, cloud = ++count % CLOUD_EVERY === 0;
      parts.push({
        x: b.left + pt[0] * b.width + (Math.random() - .5) * 3, y: b.top + pt[1] * b.height,
        age: 0, life: cloud ? 17 + Math.random() * 6 : 7 + Math.random() * 4, cloud: cloud,
        sprite: clouds[(Math.random() * clouds.length) | 0], flip: Math.random() < .5,
        vx: (Math.random() - .4) * 6, vy: -(16 + Math.random() * 14) * scale,
        r0: (3 + Math.random() * 3) * scale, grow: (cloud ? 70 : 34 + Math.random() * 30) * (small ? .65 : 1),
        seed: Math.random() * 100, a: .07 + Math.random() * .05, rot: Math.random() * 6.28,
      });
    }

    function step(now) {
      raf = requestAnimationFrame(step);
      var dt = Math.min(.05, (now - last) / 1000); last = now; clock += dt;
      if (!document.body.contains(logo)) { stop(); return; }

      var b = logo.getBoundingClientRect();
      if (b.bottom > 0 && b.top < H && b.width > 0) {
        carry += dt * RATE[small ? 1 : 0];
        while (carry >= 1 && parts.length < MAX) { emit(b); carry -= 1; }
        if (carry > 1) carry = 1;
      }

      ctx.clearRect(0, 0, W, H);
      if (!drift.length && !nextDrift) { for (var n = 0; n < (small ? 2 : 3); n++) addDrift(Math.random() * W * .8); nextDrift = clock + 4; }
      if (clock >= nextDrift && drift.length < (small ? 4 : 6)) { addDrift(-180); nextDrift = clock + 7 + Math.random() * 6; }
      for (var j = drift.length - 1; j >= 0; j--) {
        var c = drift[j];
        c.age += dt; c.x += c.speed * dt;
        if (c.x - c.w > W) { drift.splice(j, 1); continue; }
        var ch = c.w * 150 / 256;
        ctx.globalAlpha = .7 * Math.min(1, c.age / 2);
        ctx.save(); ctx.translate(c.x, c.y + Math.sin(clock * .5 + c.seed) * 3);
        if (c.flip) ctx.scale(-1, 1);
        ctx.drawImage(c.sprite, -c.w / 2, -ch / 2, c.w, ch);
        ctx.restore();
      }
      var gust = 1 + .35 * Math.sin(clock * .23) + .2 * Math.sin(clock * .61);   // the wind rises and falls
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.age += dt;
        var k = p.age / p.life;
        if (k >= 1 || p.x > W + 300) { parts.splice(i, 1); continue; }
        // steam rises first, then the wind carries it out over the hills
        var wind = Math.min(1, p.age / 2);
        p.vx += ((p.cloud ? 38 : 50) * gust * wind - p.vx * .2) * dt;
        p.vy += ((p.cloud ? 4 : 18 + 10 * Math.sin(p.seed)) * wind - p.vy * .5 * wind) * dt;
        p.x += (p.vx + Math.sin(clock * .9 + p.seed) * 8 * wind) * dt;
        p.y += (p.vy + Math.cos(clock * .7 + p.seed * 1.7) * 5 * wind) * dt;
        p.rot += dt * .05;

        // the steam: a soft puff, gone by the time a cloud has formed
        var r = p.r0 + p.grow * Math.pow(Math.min(1, k * (p.cloud ? 2.2 : 1)), .7);
        var steam = p.a * Math.min(1, k / .05) * (p.cloud ? Math.max(0, 1 - k / .4) : Math.pow(1 - k, 1.6));
        if (steam > .003) {
          ctx.globalAlpha = steam;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1.6, 1);
          ctx.drawImage(puff, -r, -r, r * 2, r * 2);
          ctx.restore();
        }
        // the cloud: firms up out of the steam, sails on, then thins away
        if (p.cloud && k > .22) {
          var form = Math.min(1, (k - .22) / .2), fade = Math.min(1, (1 - k) / .25);
          var w = (small ? 70 : 110) * (.7 + .3 * form) * (.85 + (p.seed % 1) * .4), h = w * 150 / 256;
          ctx.globalAlpha = .82 * form * fade;
          ctx.save(); ctx.translate(p.x, p.y + Math.sin(clock * .8 + p.seed) * 2);
          if (p.flip) ctx.scale(-1, 1);
          ctx.drawImage(p.sprite, -w / 2, -h * .62, w, h);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    }

    function stop() {
      cancelAnimationFrame(raf);
      removeEventListener("resize", size);
      canvas.remove();
      if (running === stop) running = null;
    }
    running = stop;
    raf = requestAnimationFrame(step);
    return stop;
  }

  window.ZSmoke = { start: start };
})();
