/* ============================================================================
   PROJECT ZULFIQAR — weather
   ----------------------------------------------------------------------------
   Each visit gets a random weather, drawn over the mountain scenery and
   behind the page: sunny, cloudy, windy, rainy, stormy, foggy, snowy, a
   starry night, sunset, a rainbow after rain, or a sandstorm. It
   carries over as the visitor moves between pages, and if they stay on one
   page for a while it slowly changes into another. Add ?weather=stormy (or
   any other kind) to the address to hold a particular one.

   ZWeather.start()   starts the weather, or on a new page restarts the wait
   ZWeather.stop()    removes it
   ZWeather.kind      the weather showing
   ============================================================================ */
(function () {
  "use strict";

  // w is how often each kind comes up, relative to the others. The wind
  // blows right to left, like the steam from the sword.
  var KINDS = {
    sunny:     { w: 1, tint: "rgba(255,186,120,.07)", sun: true, motes: 40, clouds: { n: 2, dark: 0, speed: 6, scale: .7, a: .7 } },
    cloudy:    { w: 1, tint: "rgba(110,118,145,.10)", clouds: { n: 8, dark: .15, speed: 10, scale: 1, a: .85 } },
    windy:     { w: 1, tint: "rgba(120,130,150,.06)", streaks: 24, leaves: 24, clouds: { n: 6, dark: .1, speed: 60, scale: .9, a: .8 } },
    rainy:     { w: 1, tint: "rgba(28,38,60,.24)", rain: 240, tilt: .16, fog: .1, clouds: { n: 9, dark: .5, speed: 14, scale: 1.1, a: .9 } },
    stormy:    { w: 1, tint: "rgba(6,10,22,.40)", rain: 460, tilt: .32, lightning: true, clouds: { n: 10, dark: .85, speed: 26, scale: 1.2, a: .95 } },
    foggy:     { w: 1, tint: "rgba(170,176,192,.12)", fog: .36, clouds: { n: 3, dark: .2, speed: 6, scale: 1, a: .6 } },
    snowy:     { w: 1, tint: "rgba(190,200,225,.10)", snow: 200, clouds: { n: 7, dark: .25, speed: 8, scale: 1, a: .85 } },
    night:     { w: 1, tint: "rgba(4,7,20,.50)", night: true, stars: 170, clouds: { n: 2, dark: .7, speed: 5, scale: .9, a: .45 } },
    sunset:    { w: 1, tint: "rgba(255,110,50,.10)", sunset: true, birds: 7, clouds: { n: 4, dark: .05, speed: 7, scale: .8, a: .55 } },
    rainbow:   { w: 1, tint: "rgba(150,170,200,.06)", rainbow: true, rain: 40, tilt: .1, clouds: { n: 4, dark: .3, speed: 9, scale: 1, a: .7 } },
    sandstorm: { w: 1, tint: "rgba(190,130,70,.34)", dust: 320, fog: .22, clouds: { n: 0, dark: .4, speed: 40, scale: 1, a: .5 } },
  };
  var KEY = "zulfiqar-weather";

  function pinned() {   // ?weather=stormy holds one kind and never changes it
    var asked = (location.search.match(/[?&]weather=(\w+)/) || [])[1];
    return asked && KINDS[asked] ? asked : null;
  }
  function pick(not) {     // a weighted random kind, other than `not`
    var names = Object.keys(KINDS).filter(function (k) { return k !== not; });
    var total = names.reduce(function (s, k) { return s + KINDS[k].w; }, 0), roll = Math.random() * total;
    for (var i = 0; i < names.length; i++) { roll -= KINDS[names[i]].w; if (roll <= 0) return names[i]; }
    return names[0];
  }
  function remember(kind) { try { sessionStorage.setItem(KEY, kind); } catch (e) {} }
  function choose() {
    var kept = null;
    try { kept = sessionStorage.getItem(KEY); } catch (e) {}
    var kind = pinned() || (kept && KINDS[kept] ? kept : pick());
    remember(kind);
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

  // Stay on one page long enough and the weather slowly turns into another:
  // after CHANGE_AFTER seconds (a random time in that range) it cross-fades
  // over FADE seconds. Moving to another page restarts the wait.
  var CHANGE_AFTER = [45, 75], FADE = 12;
  var canvas = null, raf = 0, stopFn = null, onPage = null;

  function start() {
    if (canvas) { onPage(); return; }
    var first = choose();
    ZWeather.kind = first;
    canvas = document.createElement("canvas");
    canvas.className = "weather"; canvas.setAttribute("aria-hidden", "true");
    var scene = document.getElementById("scene");
    if (scene) scene.after(canvas); else document.body.prepend(canvas);
    var main = canvas.getContext("2d");
    // two offscreen canvases, used only while one weather fades into the next
    var off = [document.createElement("canvas"), document.createElement("canvas")].map(function (c) { return c.getContext("2d"); });
    var W = 0, H = 0, small = false, dpr = 1;
    function size() {
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      W = innerWidth; H = innerHeight; small = W < 700;
      [main].concat(off).forEach(function (c) {
        c.canvas.width = Math.round(W * dpr); c.canvas.height = Math.round(H * dpr);
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
      });
    }
    size(); addEventListener("resize", size);
    var less = function (n) { return Math.round((n || 0) * (small ? .5 : 1)); };

    // ---- one weather: its clouds, rain, snow... and how to draw them ------
    function layer(kind) {
    var K = KINDS[kind], ctx = main;
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

    var stars = [];
    for (i = 0; i < less(K.stars); i++) stars.push({ x: rand(0, W), y: H * Math.pow(rand(0, 1), 1.6) * .6, r: rand(.5, 1.7), ph: rand(0, 6.28), sp: rand(.8, 2.4) });
    var shooting = null, nextShoot = rand(3, 7);

    var birds = [];
    function newBird(x) { return { x: x, y: H * rand(.18, .42), v: rand(28, 46), s: rand(5, 9) * (small ? .7 : 1), ph: rand(0, 6.28) }; }
    for (i = 0; i < (K.birds || 0); i++) birds.push(newBird(rand(0, W)));

    var dust = [];
    function newDust(x) { return { x: x, y: rand(0, H), len: rand(6, 26), v: rand(380, 760), a: rand(.15, .45), ph: rand(0, 6.28) }; }
    for (i = 0; i < less(K.dust); i++) dust.push(newDust(rand(0, W)));

    var bolt = null, flash = 0, nextBolt = rand(2, 5);
    function makeBolt(target) {
      var x = target ? target[0] + rand(-120, 120) : W * rand(.15, .85), y = H * .06, end = target ? target[1] : H * rand(.5, .72), main = [[x, y]], branches = [];
      while (y < end) {
        var steps = Math.max(1, (end - y) / 23);
        x += target ? (target[0] - x) / steps + rand(-14, 14) : rand(-22, 22);
        y = Math.min(end, y + rand(16, 30)); main.push([x, y]);
        if (Math.random() < .18) {   // a fork
          var bx = x, by = y, br = [[bx, by]], dir = Math.random() < .5 ? -1 : 1;
          for (var j = 0; j < 5 + (Math.random() * 4 | 0); j++) { bx += dir * rand(6, 20); by += rand(10, 22); br.push([bx, by]); }
          branches.push(br);
        }
      }
      if (target) main.push([target[0], target[1]]);
      return { lines: [main].concat(branches), age: 0 };
    }

    // In a storm, a man stands on a crag and raises the Zulfiqar; the
    // lightning comes down onto the blade.
    var RAISE = .9, HOLD = .7, LOWER = 1.1;   // seconds
    var raise = 0, held = 0, struck = 0;
    function man() {
      var u = small ? .7 : 1, fx = W - (small ? 46 : 70), top = H * (small ? .56 : .5);   // the right-hand edge, clear of the page
      return { u: u, x: fx, y: top };
    }
    // the raised sword's tip, for aiming the bolt
    function swordTip(m, k) {
      var a = armAngle(k), sh = [m.x + 13 * m.u, m.y - 42 * m.u], arm = 17 * m.u, len = 40 * m.u;
      return [sh[0] + Math.cos(a) * (arm + len), sh[1] + Math.sin(a) * (arm + len)];
    }
    function armAngle(k) { return (0.55 + (-Math.PI / 2 - 0.55) * k); }   // down at his side → straight up
    function drawMan(k, glow) {
      var m = man(), u = m.u, x = m.x, y = m.y, c = "#07090f";
      ctx.save();
      // the crag he stands on, running down off the screen
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.moveTo(x - 120 * u, H); ctx.lineTo(x - 60 * u, y + 40 * u); ctx.lineTo(x - 26 * u, y + 8 * u); ctx.lineTo(x - 10 * u, y + 2 * u);
      ctx.lineTo(x + 14 * u, y); ctx.lineTo(x + 36 * u, y + 14 * u); ctx.lineTo(x + 60 * u, y + 40 * u); ctx.lineTo(x + 120 * u, H); ctx.closePath(); ctx.fill();
      // legs apart, a long cloak, shoulders, head
      ctx.beginPath(); ctx.moveTo(x - 9 * u, y + 1); ctx.lineTo(x - 3 * u, y - 24 * u); ctx.lineTo(x + 4 * u, y - 24 * u); ctx.lineTo(x + 11 * u, y + 1); ctx.lineTo(x + 6 * u, y + 1);
      ctx.lineTo(x + .5 * u, y - 14 * u); ctx.lineTo(x - 4 * u, y + 1); ctx.closePath(); ctx.fill();
      var flap = Math.sin(performance.now() / 260) * 3 * u;   // the cloak in the wind
      ctx.beginPath(); ctx.moveTo(x - 7 * u, y - 46 * u); ctx.quadraticCurveTo(x - 20 * u + flap, y - 26 * u, x - 22 * u + flap, y - 6 * u);
      ctx.lineTo(x - 6 * u, y - 14 * u); ctx.lineTo(x + 9 * u, y - 24 * u); ctx.lineTo(x + 9 * u, y - 44 * u); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 1.5 * u, y - 53 * u, 5.5 * u, 6.5 * u, 0, 0, Math.PI * 2); ctx.fill();
      // his face always glows, brighter as the sword goes up and brightest at the strike
      var lit = Math.min(1, .55 + glow * .45 + k * .1);   // always lit, brightest at the strike
      if (lit > .02) {
        var hx = x + 3.5 * u, hy = y - 54 * u;
        var halo = ctx.createRadialGradient(hx, hy, 0, hx, hy, 22 * u);
        halo.addColorStop(0, "rgba(205,220,255," + (.55 * lit) + ")"); halo.addColorStop(1, "rgba(205,220,255,0)");
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(hx, hy, 22 * u, 0, Math.PI * 2); ctx.fill();
        var face = ctx.createLinearGradient(hx - 6 * u, hy, hx + 5 * u, hy - 3 * u);   // lit from the raised blade, above and in front
        face.addColorStop(0, "rgba(220,230,255,0)"); face.addColorStop(1, "rgba(235,242,255," + (.95 * lit) + ")");
        ctx.fillStyle = face; ctx.beginPath(); ctx.ellipse(x + 1.5 * u, y - 53 * u, 5.5 * u, 6.5 * u, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c;                                                          // a dark brow, so it reads as a face
        ctx.fillRect(hx - 1 * u, hy - 3.5 * u, 4.5 * u, 1.2 * u);
      }
      // the arm and the Zulfiqar, raised by k (0 down, 1 straight up)
      var a = armAngle(k), sh = [m.x + 13 * u, m.y - 42 * u], arm = 17 * u, len = 40 * u;
      var hand = [sh[0] + Math.cos(a) * arm, sh[1] + Math.sin(a) * arm];
      ctx.strokeStyle = c; ctx.lineWidth = 4 * u; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(sh[0], sh[1]); ctx.lineTo(hand[0], hand[1]); ctx.stroke();
      ctx.translate(hand[0], hand[1]); ctx.rotate(a + Math.PI / 2);
      if (glow > 0) { ctx.shadowColor = "rgba(190,210,255," + glow + ")"; ctx.shadowBlur = 24 * glow; }
      ctx.fillStyle = glow > 0 ? "rgba(" + Math.round(7 + 220 * glow) + "," + Math.round(9 + 225 * glow) + "," + Math.round(15 + 240 * glow) + ",1)" : c;
      ctx.fillRect(-7 * u, -1.5 * u, 14 * u, 3 * u);   // the guard
      ctx.beginPath();                                 // a straight blade that splits into two points
      ctx.moveTo(-2.4 * u, -1.5 * u); ctx.lineTo(-2.4 * u, -len * .72); ctx.lineTo(-4.2 * u, -len); ctx.lineTo(-.6 * u, -len * .8);
      ctx.lineTo(0, -len * .84); ctx.lineTo(.6 * u, -len * .8); ctx.lineTo(4.2 * u, -len); ctx.lineTo(2.4 * u, -len * .72); ctx.lineTo(2.4 * u, -1.5 * u); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // ---- drawing ------------------------------------------------------
    var clock = 0;
    function line(pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]); ctx.stroke(); }

    function draw(dt, into) {
      ctx = into; clock += dt;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = K.tint; ctx.fillRect(0, 0, W, H);

      if (K.night) {   // a clear night: twinkling stars, a moon, now and then a shooting star
        stars.forEach(function (st) {
          ctx.globalAlpha = .35 + .55 * (.5 + .5 * Math.sin(clock * st.sp + st.ph));
          ctx.fillStyle = "#f4f2ff"; ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
        var mx = W * .2, my = H * .17, mr = small ? 18 : 26;
        var mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 7);
        mg.addColorStop(0, "rgba(230,236,255,.35)"); mg.addColorStop(1, "rgba(230,236,255,0)");
        ctx.fillStyle = mg; ctx.fillRect(mx - mr * 7, my - mr * 7, mr * 14, mr * 14);
        ctx.fillStyle = "#eef0f8"; ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(170,178,200,.35)";   // a few soft craters
        [[-.3, -.2, .22], [.25, .15, .16], [-.05, .35, .12]].forEach(function (c) { ctx.beginPath(); ctx.arc(mx + c[0] * mr, my + c[1] * mr, c[2] * mr, 0, Math.PI * 2); ctx.fill(); });
        nextShoot -= dt;
        if (nextShoot <= 0 && !shooting) { shooting = { x: W * rand(.3, 1), y: H * rand(.05, .3), age: 0 }; nextShoot = rand(5, 11); }
        if (shooting) {
          shooting.age += dt; var sk = shooting.age / .9;
          if (sk >= 1) shooting = null;
          else {
            var hx = shooting.x - sk * 260, hy = shooting.y + sk * 120;
            var tr = ctx.createLinearGradient(hx, hy, hx + 90, hy - 42);
            tr.addColorStop(0, "rgba(255,255,255," + (1 - sk) + ")"); tr.addColorStop(1, "rgba(255,255,255,0)");
            ctx.strokeStyle = tr; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + 90, hy - 42); ctx.stroke();
          }
        }
      }

      if (K.sunset) {   // a low sun on the horizon, a warm sky, birds heading home
        var ux = W * .72, uy = H * .6, UR = Math.max(W, H) * .75;
        var sg = ctx.createRadialGradient(ux, uy, 0, ux, uy, UR);
        sg.addColorStop(0, "rgba(255,190,110,.6)"); sg.addColorStop(.15, "rgba(255,140,80,.3)"); sg.addColorStop(.5, "rgba(220,90,90,.12)"); sg.addColorStop(1, "rgba(120,60,110,0)");
        ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "rgba(255,214,150,.95)"; ctx.shadowColor = "rgba(255,150,80,1)"; ctx.shadowBlur = 50;
        ctx.beginPath(); ctx.arc(ux, uy, small ? 28 : 44, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(30,22,30,.75)"; ctx.lineWidth = 1.6; ctx.lineCap = "round";
        birds.forEach(function (bd, n) {
          bd.x -= bd.v * dt; if (bd.x < -20) birds[n] = bd = newBird(W + rand(10, 200));
          var flapY = Math.sin(clock * 6 + bd.ph) * bd.s * .45;
          ctx.beginPath(); ctx.moveTo(bd.x - bd.s, bd.y - flapY); ctx.quadraticCurveTo(bd.x - bd.s * .4, bd.y - bd.s * .2, bd.x, bd.y);
          ctx.quadraticCurveTo(bd.x + bd.s * .4, bd.y - bd.s * .2, bd.x + bd.s, bd.y - flapY); ctx.stroke();
        });
      }

      if (K.rainbow) {   // the sun back out after rain, and a rainbow across the valley
        var rx = W * .55, ry = H * .95, rr = Math.max(W * .55, H * .6), bands = ["#ff5b5b", "#ff9f43", "#ffe066", "#6fdc8c", "#5cb8ff", "#7a7cff", "#b07cff"];
        ctx.save(); ctx.globalAlpha = .2; ctx.lineWidth = small ? 7 : 11;
        bands.forEach(function (c, n) { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(rx, ry, rr - n * ctx.lineWidth, Math.PI, 2 * Math.PI); ctx.stroke(); });
        ctx.restore();
        var bx2 = W * .12, by2 = H * .16;
        var bg2 = ctx.createRadialGradient(bx2, by2, 0, bx2, by2, Math.max(W, H) * .45);
        bg2.addColorStop(0, "rgba(255,236,190,.4)"); bg2.addColorStop(1, "rgba(255,236,190,0)");
        ctx.fillStyle = bg2; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "rgba(255,244,215,.9)"; ctx.beginPath(); ctx.arc(bx2, by2, small ? 16 : 24, 0, Math.PI * 2); ctx.fill();
      }

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
        if (nextBolt < RAISE) raise = Math.min(1, raise + dt / RAISE);
        else if (held > 0) held -= dt;
        else raise = Math.max(0, raise - dt / LOWER);
        var lift = raise * raise * (3 - 2 * raise);
        if (nextBolt <= 0) { bolt = makeBolt(swordTip(man(), 1)); flash = 1; nextBolt = rand(4, 9); held = HOLD; raise = 1; struck = 1; }
        struck = Math.max(0, struck - dt * 1.6);
        drawMan(lift, struck);
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

      if (dust.length) {   // a sandstorm: grains racing right to left
        ctx.lineWidth = 1.2;
        dust.forEach(function (g, n) {
          g.x -= g.v * dt; g.y += Math.sin(clock * 3 + g.ph) * 20 * dt;
          if (g.x + g.len < 0) dust[n] = g = newDust(W + rand(0, 80));
          ctx.strokeStyle = "rgba(236,196,140," + g.a + ")";
          ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x + g.len, g.y - g.len * .08); ctx.stroke();
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

    return { kind: kind, draw: draw };
    }

    // ---- the running weather, and the slow change to the next ------------
    var still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var cur = layer(first), next = null, fading = 0, now = 0, changeAt = 0, last = performance.now();
    function smooth(k) { return k * k * (3 - 2 * k); }
    onPage = function () { if (!next) changeAt = now + rand(CHANGE_AFTER[0], CHANGE_AFTER[1]); };
    onPage();

    function frame(dt) {
      now += dt;
      if (!next && !still && !pinned() && now >= changeAt) { next = layer(pick(cur.kind)); fading = 0; }
      if (!next) { cur.draw(dt, main); return; }
      fading += dt;
      var k = smooth(Math.min(1, fading / FADE));
      cur.draw(dt, off[0]); next.draw(dt, off[1]);
      main.setTransform(1, 0, 0, 1, 0, 0);
      main.clearRect(0, 0, main.canvas.width, main.canvas.height);
      main.globalAlpha = 1 - k; main.drawImage(off[0].canvas, 0, 0);
      main.globalAlpha = k; main.drawImage(off[1].canvas, 0, 0);
      main.globalAlpha = 1; main.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (fading >= FADE) {
        cur = next; next = null;
        ZWeather.kind = cur.kind; remember(cur.kind);
        onPage();
      }
    }
    function step(t) {
      raf = requestAnimationFrame(step);
      var dt = Math.min(.05, (t - last) / 1000); last = t;
      frame(dt);
    }
    if (still) frame(0); else raf = requestAnimationFrame(step);   // a still picture for reduced motion

    stopFn = function () { cancelAnimationFrame(raf); removeEventListener("resize", size); };
  }

  function stop() {
    if (!canvas) return;
    stopFn(); canvas.remove(); canvas = null;
  }

  var ZWeather = window.ZWeather = { start: start, stop: stop, kind: null, kinds: Object.keys(KINDS) };
})();
