/* ============================================================================
   PROJECT ZULFIQAR — weather
   ----------------------------------------------------------------------------
   Each visit gets a random weather, drawn over the mountain scenery and
   behind the page: sunny, cloudy, windy, rainy, stormy, foggy or snowy. It
   stays the same while the visitor moves between pages, and changes on the
   next visit. Add ?weather=stormy (or any other kind) to the address to see a
   particular one.

   ZWeather.start()   starts (or keeps) the weather
   ZWeather.stop()    removes it
   ZWeather.kind      the weather showing
   ============================================================================ */
(function () {
  "use strict";

  // w is how often each kind comes up, relative to the others. The wind
  // blows right to left, like the steam from the sword.
  var KINDS = {
    sunny:  { w: 20, tint: "rgba(255,186,120,.07)", sun: true, motes: 40, clouds: { n: 2, dark: 0, speed: 6, scale: .7, a: .7 } },
    cloudy: { w: 20, tint: "rgba(110,118,145,.10)", clouds: { n: 8, dark: .15, speed: 10, scale: 1, a: .85 } },
    windy:  { w: 15, tint: "rgba(120,130,150,.06)", streaks: 24, leaves: 24, clouds: { n: 6, dark: .1, speed: 60, scale: .9, a: .8 } },
    rainy:  { w: 15, tint: "rgba(28,38,60,.24)", rain: 240, tilt: .16, fog: .1, clouds: { n: 9, dark: .5, speed: 14, scale: 1.1, a: .9 } },
    stormy: { w: 10, tint: "rgba(6,10,22,.40)", rain: 460, tilt: .32, lightning: true, clouds: { n: 10, dark: .85, speed: 26, scale: 1.2, a: .95 } },
    foggy:  { w: 10, tint: "rgba(170,176,192,.12)", fog: .36, clouds: { n: 3, dark: .2, speed: 6, scale: 1, a: .6 } },
    snowy:  { w: 10, tint: "rgba(190,200,225,.10)", snow: 200, clouds: { n: 7, dark: .25, speed: 8, scale: 1, a: .85 } },
  };
  var KEY = "zulfiqar-weather";

  function choose() {
    var asked = (location.search.match(/[?&]weather=(\w+)/) || [])[1];
    if (asked && KINDS[asked]) return asked;
    try { var kept = sessionStorage.getItem(KEY); if (kept && KINDS[kept]) return kept; } catch (e) {}
    var names = Object.keys(KINDS), total = names.reduce(function (s, k) { return s + KINDS[k].w; }, 0);
    var roll = Math.random() * total, kind = names[0];
    for (var i = 0; i < names.length; i++) { roll -= KINDS[names[i]].w; if (roll <= 0) { kind = names[i]; break; } }
    try { sessionStorage.setItem(KEY, kind); } catch (e) {}
    return kind;
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  // A soft cloud: an irregular heap of puffs with a flat-ish base, lit from
  // above and shaded below, then blurred so no single puff shows.
  // dark runs from 0 (white fair-weather cloud) to 1 (storm cloud).
  function rgb(hex) { var x = parseInt(hex.slice(1), 16); return [x >> 16, (x >> 8) & 255, x & 255]; }
  function mix(a, b, k) { return a.map(function (v, i) { return Math.round(v + (b[i] - v) * k); }); }
  function cloudSprite(dark) {
    var c = document.createElement("canvas"); c.width = 440; c.height = 220;
    var g = c.getContext("2d");
    var lit = mix(rgb("#f4f1f6"), rgb("#5c6271"), dark), shade = mix(rgb("#aeaac0"), rgb("#242935"), dark);
    var puffs = [], cx = 220, base = 150;
    for (var i = 0; i < 26; i++) {
      var u = rand(-1, 1), spread = 1 - u * u;                 // taller and fuller in the middle
      puffs.push({ x: cx + u * 165, y: base - spread * rand(10, 70) - rand(0, 12), r: rand(18, 34) + spread * rand(12, 30) });
    }
    puffs.sort(function (a, b) { return b.y - a.y; });
    function blob(p, dy, col, alpha) {
      var gr = g.createRadialGradient(p.x, p.y + dy, 0, p.x, p.y + dy, p.r);
      var c0 = "rgba(" + col.join(",") + ",";
      gr.addColorStop(0, c0 + alpha + ")"); gr.addColorStop(.55, c0 + (alpha * .75) + ")"); gr.addColorStop(1, c0 + "0)");
      g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y + dy, p.r, 0, Math.PI * 2); g.fill();
    }
    if ("filter" in g) g.filter = "blur(5px)";
    puffs.forEach(function (p) { blob(p, 12, shade, .85); });   // the shaded underside
    puffs.forEach(function (p) { blob({ x: p.x, y: p.y, r: p.r * .85 }, -4, lit, .8); });   // the lit tops
    return c;
  }
  function fogSprite() {
    var c = document.createElement("canvas"); c.width = 512; c.height = 128;
    var g = c.getContext("2d");
    g.save(); g.scale(4, 1);
    var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(220,224,234,1)"); gr.addColorStop(1, "rgba(220,224,234,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.restore();
    return c;
  }

  var canvas = null, raf = 0, stopFn = null;

  function start() {
    if (canvas) return;
    var kind = choose(), K = KINDS[kind];
    ZWeather.kind = kind;
    canvas = document.createElement("canvas");
    canvas.className = "weather"; canvas.setAttribute("aria-hidden", "true");
    var scene = document.getElementById("scene");
    if (scene) scene.after(canvas); else document.body.prepend(canvas);
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, small = false;
    function size() {
      var dpr = Math.min(1.5, window.devicePixelRatio || 1);
      W = innerWidth; H = innerHeight; small = W < 700;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size(); addEventListener("resize", size);
    var less = function (n) { return Math.round((n || 0) * (small ? .5 : 1)); };

    // ---- the pieces of weather -----------------------------------------
    var clouds = [], cs = K.clouds, sprites = [cloudSprite(cs.dark), cloudSprite(cs.dark), cloudSprite(Math.min(1, cs.dark + .1))];
    function newCloud(x) {
      var s = cs.scale * rand(.6, 1.1) * (small ? .6 : 1);
      return { x: x, y: H * rand(.02, .32), s: s, w: 440 * s, h: 220 * s, v: cs.speed * rand(.7, 1.3) * (0.7 + s * .4),
        sprite: sprites[(Math.random() * sprites.length) | 0] };
    }
    for (var i = 0; i < less(cs.n) + (small ? 1 : 0); i++) clouds.push(newCloud(rand(-200, W)));

    var drops = [], splashes = [];
    for (i = 0; i < less(K.rain); i++) drops.push({ x: rand(0, W * 1.3), y: rand(-H, H), len: rand(12, 24), v: rand(900, 1300), ground: rand(.62, 1) });

    var flakes = [];
    for (i = 0; i < less(K.snow); i++) flakes.push({ x: rand(0, W), y: rand(0, H), r: rand(1, 3.2), v: rand(18, 55), ph: rand(0, 6.28) });

    var streaks = [];
    function newStreak(x) { return { x: x, y: H * rand(.05, .9), len: rand(80, 220), v: rand(500, 900), amp: rand(3, 10), ph: rand(0, 6.28) }; }
    for (i = 0; i < less(K.streaks); i++) streaks.push(newStreak(rand(0, W * 2)));

    var leaves = [], LEAF = ["#c9773a", "#a85b2a", "#d9a441", "#7d8f3a"];
    function newLeaf(x) { return { x: x, y: H * rand(.1, .9), v: rand(160, 320), s: rand(4, 7), rot: rand(0, 6.28), vr: rand(-6, 6), ph: rand(0, 6.28), c: LEAF[(Math.random() * LEAF.length) | 0] }; }
    for (i = 0; i < less(K.leaves); i++) leaves.push(newLeaf(rand(0, W * 1.5)));

    var fog = [], fogImg = K.fog ? fogSprite() : null;
    for (i = 0; i < (K.fog ? 7 : 0); i++) fog.push({ x: rand(-400, W), y: H * rand(.45, .9), w: rand(500, 900), h: rand(90, 170), v: rand(6, 16) });

    var motes = [];
    for (i = 0; i < less(K.motes); i++) motes.push({ x: rand(0, W), y: rand(0, H), r: rand(.8, 2), v: rand(4, 12), ph: rand(0, 6.28) });

    var bolt = null, flash = 0, nextBolt = rand(2, 5);
    function makeBolt() {
      var x = W * rand(.15, .85), y = H * .06, end = H * rand(.5, .72), main = [[x, y]], branches = [];
      while (y < end) {
        x += rand(-22, 22); y += rand(16, 30); main.push([x, y]);
        if (Math.random() < .18) {   // a fork
          var bx = x, by = y, br = [[bx, by]], dir = Math.random() < .5 ? -1 : 1;
          for (var j = 0; j < 5 + (Math.random() * 4 | 0); j++) { bx += dir * rand(6, 20); by += rand(10, 22); br.push([bx, by]); }
          branches.push(br);
        }
      }
      return { lines: [main].concat(branches), age: 0 };
    }

    // ---- drawing ------------------------------------------------------
    var last = performance.now(), clock = 0;
    function line(pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]); ctx.stroke(); }

    function draw(dt) {
      clock += dt;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = K.tint; ctx.fillRect(0, 0, W, H);

      if (K.sun) {   // the sun, top left, with slowly turning rays
        var sx = W * .16, sy = H * .15, R = Math.max(W, H) * .5;
        var gl = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
        gl.addColorStop(0, "rgba(255,226,170,.55)"); gl.addColorStop(.12, "rgba(255,206,140,.22)"); gl.addColorStop(1, "rgba(255,190,120,0)");
        ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.translate(sx, sy); ctx.rotate(clock * .02);
        for (var r = 0; r < 12; r++) {
          ctx.rotate(Math.PI / 6);
          ctx.fillStyle = "rgba(255,220,160," + (.035 + .02 * Math.sin(clock * .7 + r)) + ")";
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R, -R * .06); ctx.lineTo(R, R * .06); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
        ctx.fillStyle = "rgba(255,240,210,.95)"; ctx.shadowColor = "rgba(255,210,140,.9)"; ctx.shadowBlur = 40;
        ctx.beginPath(); ctx.arc(sx, sy, small ? 20 : 30, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        motes.forEach(function (m) {
          m.y -= m.v * dt; m.x += Math.sin(clock * .4 + m.ph) * 6 * dt; if (m.y < -5) { m.y = H + 5; m.x = rand(0, W); }
          ctx.globalAlpha = .25 + .2 * Math.sin(clock * 1.3 + m.ph);
          ctx.fillStyle = "#ffe6b8"; ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
      }

      // clouds drift right to left and come round again
      clouds.forEach(function (c, n) {
        c.x -= c.v * dt;
        if (c.x + c.w < 0) clouds[n] = c = newCloud(W + rand(20, 260));
        ctx.globalAlpha = cs.a;
        ctx.drawImage(c.sprite, c.x, c.y + Math.sin(clock * .2 + n) * 3, c.w, c.h);
      });
      ctx.globalAlpha = 1;

      if (fog.length) {
        fog.forEach(function (f) {
          f.x -= f.v * dt; if (f.x + f.w < 0) { f.x = W + rand(0, 200); f.y = H * rand(.45, .9); }
          ctx.globalAlpha = K.fog * (.7 + .3 * Math.sin(clock * .15 + f.y));
          ctx.drawImage(fogImg, f.x, f.y - f.h / 2, f.w, f.h);
        });
        ctx.globalAlpha = 1;
      }

      if (drops.length) {   // rain, slanting with the wind, with a little splash where it lands
        var tilt = K.tilt || .15;
        ctx.strokeStyle = "rgba(200,212,235,.38)"; ctx.lineWidth = 1.1; ctx.beginPath();
        drops.forEach(function (d) {
          d.y += d.v * dt; d.x -= d.v * tilt * dt;
          if (d.y > H * d.ground) {
            if (splashes.length < 80 && Math.random() < .35) splashes.push({ x: d.x, y: d.y, age: 0 });
            d.y = rand(-60, -10); d.x = rand(0, W * 1.3);
          }
          ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.len * tilt, d.y - d.len);
        });
        ctx.stroke();
        ctx.lineWidth = 1;
        for (var s = splashes.length - 1; s >= 0; s--) {
          var sp = splashes[s]; sp.age += dt;
          if (sp.age > .3) { splashes.splice(s, 1); continue; }
          ctx.strokeStyle = "rgba(210,220,240," + (.4 * (1 - sp.age / .3)) + ")";
          ctx.beginPath(); ctx.ellipse(sp.x, sp.y, 1 + sp.age * 22, .5 + sp.age * 6, 0, 0, Math.PI * 2); ctx.stroke();
        }
      }

      if (K.lightning) {
        nextBolt -= dt;
        if (nextBolt <= 0) { bolt = makeBolt(); flash = 1; nextBolt = rand(4, 10); }
        if (bolt) {
          bolt.age += dt;
          var on = bolt.age < .14 || (bolt.age > .2 && bolt.age < .42);   // it flickers twice
          if (on) {
            ctx.save(); ctx.strokeStyle = "rgba(236,242,255,.95)"; ctx.lineWidth = small ? 1.6 : 2.4;
            ctx.shadowColor = "rgba(170,195,255,1)"; ctx.shadowBlur = 18; ctx.lineJoin = "round";
            bolt.lines.forEach(function (pts, b) { ctx.lineWidth = b ? 1.2 : (small ? 1.6 : 2.4); line(pts); });
            ctx.restore();
          }
          if (bolt.age > .5) bolt = null;
        }
        if (flash > 0) {
          var f = bolt && bolt.age > .2 && bolt.age < .26 ? .8 : flash;
          ctx.fillStyle = "rgba(210,222,255," + (.32 * f) + ")"; ctx.fillRect(0, 0, W, H);
          flash = Math.max(0, flash - dt * 3);
        }
      }

      if (streaks.length) {   // gusts: thin lines racing across
        ctx.lineWidth = 1.2;
        streaks.forEach(function (w, n) {
          w.x -= w.v * dt; if (w.x + w.len < 0) streaks[n] = w = newStreak(W + rand(0, W));
          ctx.strokeStyle = "rgba(236,238,248,.16)"; ctx.beginPath();
          for (var j = 0; j <= 14; j++) {
            var px = w.x + j * w.len / 14, py = w.y + Math.sin(w.ph + clock * 3 + j * .45) * w.amp;
            if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          }
          ctx.stroke();
        });
        leaves.forEach(function (l, n) {
          l.x -= l.v * dt; l.y += (Math.sin(clock * 2 + l.ph) * 40 + 12) * dt; l.rot += l.vr * dt;
          if (l.x < -20 || l.y > H + 20) leaves[n] = l = newLeaf(W + rand(10, 300));
          ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.rot); ctx.fillStyle = l.c; ctx.globalAlpha = .85;
          ctx.beginPath(); ctx.ellipse(0, 0, l.s, l.s * .45, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        });
      }

      if (flakes.length) {
        ctx.fillStyle = "rgba(246,248,255,.85)"; ctx.beginPath();
        flakes.forEach(function (fl) {
          fl.y += fl.v * dt; fl.x += (Math.sin(clock * .8 + fl.ph) * 16 - 10) * dt;
          if (fl.y > H + 5) { fl.y = -5; fl.x = rand(0, W * 1.1); }
          ctx.moveTo(fl.x + fl.r, fl.y); ctx.arc(fl.x, fl.y, fl.r, 0, Math.PI * 2);
        });
        ctx.fill();
      }
    }

    function step(now) {
      raf = requestAnimationFrame(step);
      var dt = Math.min(.05, (now - last) / 1000); last = now;
      draw(dt);
    }
    var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) draw(0); else raf = requestAnimationFrame(step);   // a still picture for reduced motion

    stopFn = function () { cancelAnimationFrame(raf); removeEventListener("resize", size); };
  }

  function stop() {
    if (!canvas) return;
    stopFn(); canvas.remove(); canvas = null;
  }

  var ZWeather = window.ZWeather = { start: start, stop: stop, kind: null, kinds: Object.keys(KINDS) };
})();
