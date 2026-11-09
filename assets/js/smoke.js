/* ============================================================================
   PROJECT ZULFIQAR — smoke from the sword
   ----------------------------------------------------------------------------
   Soft wisps rise from the tip of the sword in the logo, then a wind takes
   them and carries them out across the mountains like low cloud. Drawn on a
   faint canvas in front of the page that lets clicks through.

   ZSmoke.start(imgEl)   starts the smoke from that logo; returns stop()
   ============================================================================ */
(function () {
  "use strict";

  var TIP = { x: 0.475, y: 0.15 };   // the blade tips, as a fraction of the logo
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
    document.body.appendChild(canvas);   // in front, so it visibly leaves the blade; clicks pass through
    var ctx = canvas.getContext("2d"), sprite = puffSprite();
    var W = 0, H = 0, dpr = 1, small = false;
    function size() {
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      W = innerWidth; H = innerHeight; small = W < 700;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size(); addEventListener("resize", size);

    var parts = [], last = performance.now(), carry = 0, raf = 0, clock = 0;
    var MAX = small ? 70 : 140, RATE = small ? 9 : 16;   // puffs alive, puffs per second

    function emit(x, y, scale) {
      var life = 9 + Math.random() * 6;
      parts.push({ x: x + (Math.random() - .5) * 4 * scale, y: y, age: 0, life: life,
        vx: (Math.random() - .3) * 8, vy: -(22 + Math.random() * 18) * scale,
        r0: (4 + Math.random() * 4) * scale, grow: (60 + Math.random() * 70) * (small ? .6 : 1),
        seed: Math.random() * 100, a: .08 + Math.random() * .07, rot: Math.random() * 6.28 });
    }

    function step(now) {
      raf = requestAnimationFrame(step);
      var dt = Math.min(.05, (now - last) / 1000); last = now; clock += dt;
      if (!document.body.contains(logo)) { stop(); return; }

      // emit from the sword while the logo is on screen
      var b = logo.getBoundingClientRect();
      if (b.bottom > 0 && b.top < H && b.width > 0) {
        var tx = b.left + b.width * TIP.x, ty = b.top + b.height * TIP.y, scale = b.width / 200;
        carry += dt * RATE;
        while (carry >= 1 && parts.length < MAX) { emit(tx, ty, scale); carry -= 1; }
        if (carry > 1) carry = 1;
      }

      ctx.clearRect(0, 0, W, H);
      var gust = 1 + .35 * Math.sin(clock * .23) + .2 * Math.sin(clock * .61);   // the wind rises and falls
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.age += dt;
        var k = p.age / p.life;
        if (k >= 1 || p.x > W + 300) { parts.splice(i, 1); continue; }
        // rise first, then the wind takes over and lays the smoke down over the hills
        var wind = Math.min(1, p.age / 2.2);
        p.vx += (55 * gust * wind - p.vx * .18) * dt;
        p.vy += ((24 + 12 * Math.sin(p.seed)) * wind - p.vy * .45 * wind) * dt;
        p.x += (p.vx + Math.sin(clock * .9 + p.seed) * 10 * wind) * dt;
        p.y += (p.vy + Math.cos(clock * .7 + p.seed * 1.7) * 6 * wind) * dt;
        p.rot += dt * .05;
        var r = p.r0 + p.grow * Math.pow(k, .7);
        var alpha = p.a * Math.min(1, k / .04) * Math.pow(1 - k, 1.6);
        if (alpha < .003) continue;
        ctx.globalAlpha = alpha;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1.6, 1);   // puffs stretch along the wind
        ctx.drawImage(sprite, -r, -r, r * 2, r * 2);
        ctx.restore();
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
