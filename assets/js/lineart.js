/* ============================================================================
   PROJECT ZULFIQAR — scroll-driven wrestling, line-art version (option A)
   ----------------------------------------------------------------------------
   Two wrestlers, drawn as ivory line art, start apart in stance, step in,
   reach, fight for hands, tie up and lock as the page scrolls — as one
   continuous motion.

   The motion is a frame sequence in assets/img/wrestle/seq/ (seq.json lists
   it), made by tools/wrestle/video.py from a video generated through the
   nine drawings. Each frame is two parts: the lines (one file per frame) and
   the dark fill inside the bodies (small, packed into a few sheets). Scroll
   position picks the frame; the shown frame eases towards it, so a jump of
   the mouse wheel glides instead of skipping. Frames load coarse-to-fine:
   every 16th first, then the gaps, so the motion is there straight away and
   sharpens as the rest arrive.

   If the sequence is missing, it falls back to the eleven drawn beats in
   frames.json (tools/wrestle/build.py).

   ZLineArt.init(canvas)       loads the frames for that canvas
   ZLineArt.frame(canvas, t)   t in [0,1] → shows the matching moment
   ============================================================================ */
(function () {
  "use strict";

  var DIR = "assets/img/wrestle/";
  var LAST_AT = 0.86;      // scroll progress at which the final hold is reached
  var GLIDE = 0.2;         // share of the gap to the scroll position closed each 60th of a second
  var IN_FLIGHT = 6;       // images loading at once

  function getJSON(url) {
    return fetch(url, { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(function () { return null; });
  }
  var seqReady = getJSON(DIR + "seq/seq.json");

  function img(src, onload) {
    var im = new Image();
    im.decoding = "async";
    im.onload = function () { im._ok = true; if (onload) onload(); };
    im.src = src;
    return im;
  }

  // ---- the frame sequence ---------------------------------------------------
  function setupSeq(st, d) {
    var cv = st.cv, n = d.frames.length;
    cv.width = d.w; cv.height = d.h;
    st.n = n; st.d = d;
    st.lines = new Array(n);
    st.fills = d.fill.sheets.map(function (s) { return img(DIR + "seq/" + s, redraw); });
    // coarse-to-fine load order: 0, 16, 32 … then 8, 24 … then 4, 12 … then the rest
    var order = [], seen = {};
    [16, 8, 4, 2, 1].forEach(function (step) {
      for (var i = 0; i < n; i += step) if (!seen[i]) { seen[i] = 1; order.push(i); }
    });
    if (!seen[n - 1]) order.splice(1, 0, n - 1);
    else { order.splice(order.indexOf(n - 1), 1); order.splice(1, 0, n - 1); }   // the final pose early
    var next = 0;
    function pump() {
      while (next < order.length && st.loading < IN_FLIGHT) {
        var i = order[next++];
        st.loading++;
        st.lines[i] = img(DIR + "seq/" + d.frames[i], function () { st.loading--; redraw(); pump(); });
        st.lines[i].onerror = function () { st.loading--; pump(); };
      }
    }
    st.loading = 0;
    pump();
    function redraw() { st.drawn = -1; kick(st); }
  }

  function nearestLoaded(st, k) {
    for (var off = 0; off < st.n; off++) {
      var a = st.lines[k - off], b = st.lines[k + off];
      if (a && a._ok) return k - off;
      if (b && b._ok) return k + off;
    }
    return -1;
  }

  function drawSeq(st, k) {
    var i = nearestLoaded(st, k);
    if (i < 0 || i === st.drawn) return;
    var ctx = st.ctx, cv = st.cv, f = st.d.fill;
    ctx.clearRect(0, 0, cv.width, cv.height);
    var sheet = st.fills[Math.floor(i / f.per)], j = i % f.per;
    if (sheet && sheet._ok) {
      var sx = (j % f.cols) * f.w, sy = Math.floor(j / f.cols) * f.h;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(sheet, sx, sy, f.w, f.h, 0, 0, cv.width, cv.height);
    }
    ctx.drawImage(st.lines[i], 0, 0, cv.width, cv.height);
    st.drawn = i;
  }

  // ---- fallback: the eleven drawn beats ---------------------------------------
  function setupBeats(st, d) {
    st.cv.width = d.w; st.cv.height = d.h;
    st.n = d.beats.length; st.beats = d;
    st.imgs = {};
    Object.keys(d.layers).forEach(function (id) {
      st.imgs[id] = img(DIR + d.layers[id].src, function () { st.drawn = -1; kick(st); });
    });
  }
  function drawBeat(st, k) {
    if (k === st.drawn) return;
    var d = st.beats, ctx = st.ctx;
    var beat = d.beats[k];
    if (!beat.every(function (l) { return st.imgs[l.id]._ok; })) return;
    ctx.clearRect(0, 0, st.cv.width, st.cv.height);
    beat.forEach(function (l) {
      var L = d.layers[l.id];
      ctx.drawImage(st.imgs[l.id], l.x, l.y, L.w * l.s, L.h * l.s);
    });
    st.drawn = k;
  }

  // ---- the glide towards the scroll position ---------------------------------
  function kick(st) {
    if (!st.raf) st.raf = requestAnimationFrame(function (now) { step(st, now); });
  }
  function step(st, now) {
    st.raf = 0;
    if (!st.n) return;
    var dt = st.last ? Math.min(100, now - st.last) : 16.7;
    st.last = now;
    if (st.cur == null) st.cur = st.target;
    var gap = st.target - st.cur;
    st.cur = Math.abs(gap) < 0.02 ? st.target : st.cur + gap * (1 - Math.pow(1 - GLIDE, dt / 16.7));
    var k = Math.max(0, Math.min(st.n - 1, Math.round(st.cur)));
    if (st.beats) drawBeat(st, k); else drawSeq(st, k);
    if (st.cur !== st.target) kick(st);
    else st.last = 0;
  }

  function init(cv) {
    if (!cv || !cv.getContext) return;
    var st = { cv: cv, ctx: cv.getContext("2d"), t: 0, target: 0, cur: null, drawn: -1, n: 0 };
    cv._wr = st;
    seqReady.then(function (d) {
      if (!document.body.contains(cv)) return null;
      if (d && d.frames && d.frames.length) { setupSeq(st, d); return null; }
      return getJSON(DIR + "frames.json").then(function (b) { if (b) setupBeats(st, b); });
    }).then(function () {
      if (!st.n) return;
      st.target = targetOf(st, st.t);
      st.cur = null;
      kick(st);
    });
  }

  function targetOf(st, t) {
    t = Math.max(0, Math.min(1, t / LAST_AT));
    return st.beats ? Math.min(st.n - 1, Math.floor(t * (st.n - 1) + 0.5)) : t * (st.n - 1);
  }

  function frame(cv, t) {
    var st = cv && cv._wr;
    if (!st) return;
    st.t = t;
    if (!st.n) return;
    st.target = targetOf(st, t);
    kick(st);
  }

  window.ZLineArt = { init: init, frame: frame };
})();
