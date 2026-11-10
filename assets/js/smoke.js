/* ============================================================================
   PROJECT ZULFIQAR — steam from the sword
   ----------------------------------------------------------------------------
   Thin steam rises off the whole sword in the logo (both blades, the guard
   and the hilt), and a wind blowing right to left carries it out across the
   mountains. Drawn on a canvas just above the scenery and behind the page,
   so text stays crisp.

   ZSmoke.start(imgEl)   starts the steam from that logo; returns stop()
   ============================================================================ */
(function () {
  "use strict";

  // How much steam: puffs per second (desktop, phone).
  var RATE = [11, 6];

  // The sword, traced as lines over the logo, in fractions of its width/height.
  var SWORD = [
    [[0.532, 0.018], [0.494, 0.083], [0.493, 0.175], [0.497, 0.30], [0.499, 0.36]],   // pommel, grip and the blade above the name
    [[0.358, 0.235], [0.632, 0.235]],                                                 // guard
    [[0.505, 0.60], [0.501, 0.682], [0.483, 0.774], [0.451, 0.866], [0.44, 0.959], [0.413, 0.998]],   // the blade below the name
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

  function start(logo) {
    if (running) running();
    if (!logo || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return function () {};

    var canvas = document.createElement("canvas");
    canvas.className = "smoke"; canvas.setAttribute("aria-hidden", "true");
    var scene = document.getElementById("scene");
    if (scene) scene.after(canvas); else document.body.prepend(canvas);
    var ctx = canvas.getContext("2d"), puff = puffSprite();
    var W = 0, H = 0, dpr = 1, small = false;
    function size() {
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      W = innerWidth; H = innerHeight; small = W < 700;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size(); addEventListener("resize", size);

    var parts = [], last = performance.now(), carry = 0, raf = 0, clock = 0;
    var MAX = small ? 60 : 110;

    function emit(b) {
      var pt = swordPoint(), scale = b.width / 220;
      parts.push({
        x: b.left + pt[0] * b.width + (Math.random() - .5) * 3, y: b.top + pt[1] * b.height,
        age: 0, life: 7 + Math.random() * 4,
        vx: (Math.random() - .6) * 6, vy: -(16 + Math.random() * 14) * scale,
        r0: (3 + Math.random() * 3) * scale, grow: (34 + Math.random() * 30) * (small ? .65 : 1),
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
      var gust = 1 + .35 * Math.sin(clock * .23) + .2 * Math.sin(clock * .61);   // the wind rises and falls
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.age += dt;
        var k = p.age / p.life;
        if (k >= 1 || p.x < -300) { parts.splice(i, 1); continue; }
        // steam rises first, then the wind carries it out over the hills
        var wind = Math.min(1, p.age / 2);
        p.vx += (-50 * gust * wind - p.vx * .2) * dt;   // the wind blows right to left
        p.vy += ((18 + 10 * Math.sin(p.seed)) * wind - p.vy * .5 * wind) * dt;
        p.x += (p.vx + Math.sin(clock * .9 + p.seed) * 8 * wind) * dt;
        p.y += (p.vy + Math.cos(clock * .7 + p.seed * 1.7) * 5 * wind) * dt;
        p.rot += dt * .05;

        // a soft puff that swells and thins away
        var r = p.r0 + p.grow * Math.pow(k, .7);
        var steam = p.a * Math.min(1, k / .05) * Math.pow(1 - k, 1.6);
        if (steam > .003) {
          ctx.globalAlpha = steam;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1.6, 1);
          ctx.drawImage(puff, -r, -r, r * 2, r * 2);
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
