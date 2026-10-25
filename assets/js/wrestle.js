/* ============================================================================
   PROJECT ZULFIQAR — scroll-driven wrestling
   ----------------------------------------------------------------------------
   Two wrestlers, drawn as ivory line art, start apart in stance, take turns
   stepping in, reach, fight for hands, tie up and lock as the page scrolls.

   The frames are built from the drawings in tools/wrestle/raw by
   tools/wrestle/build.py, which writes them to assets/img/wrestle/ along with
   frames.json: the size of the stage, each image layer, and where each layer
   sits in each beat. To change the drawings, replace the raw images and run
   the build again; nothing here needs to change.

   ZWrestle.init(svgEl)       loads the frames into the svg
   ZWrestle.frame(svgEl, t)   t in [0,1] → shows the matching beat
   ============================================================================ */
(function () {
  "use strict";

  var DIR = "assets/img/wrestle/";
  var LAST_AT = 0.86;      // scroll progress at which the final hold is reached
  var loading = null;

  function load() {
    if (!loading) {
      loading = fetch(DIR + "frames.json", { cache: "no-cache" })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .catch(function (e) { console.warn("Wrestling frames could not load:", e); return null; });
    }
    return loading;
  }

  // Beat for progress t: evenly spaced, holding the last one at the end.
  function beatAt(t, n) {
    t = Math.max(0, Math.min(1, t));
    return Math.min(n - 1, Math.floor((t / LAST_AT) * (n - 1) + 0.5));
  }

  function build(svg, d) {
    var NS = "http://www.w3.org/2000/svg";
    svg.setAttribute("viewBox", "0 0 " + d.w + " " + d.h);
    svg.setAttribute("preserveAspectRatio", "xMidYMax meet");
    svg.innerHTML = "";
    d.beats.forEach(function (beat) {
      var g = document.createElementNS(NS, "g");
      g.setAttribute("class", "wr-beat");
      beat.forEach(function (l) {
        var L = d.layers[l.id];
        var img = document.createElementNS(NS, "image");
        img.setAttribute("href", DIR + L.src);
        img.setAttribute("x", l.x);
        img.setAttribute("y", l.y);
        img.setAttribute("width", (L.w * l.s).toFixed(1));
        img.setAttribute("height", (L.h * l.s).toFixed(1));
        g.appendChild(img);
      });
      svg.appendChild(g);
    });
    svg._wrBeats = svg.querySelectorAll(".wr-beat");
    svg._wrOn = -1;
  }

  function show(svg, t) {
    var beats = svg._wrBeats;
    if (!beats || !beats.length) return;
    var k = beatAt(t, beats.length);
    if (k === svg._wrOn) return;
    if (svg._wrOn >= 0) beats[svg._wrOn].classList.remove("is-on");
    beats[k].classList.add("is-on");
    svg._wrOn = k;
  }

  function init(svg) {
    if (!svg) return;
    svg._wrT = 0;
    load().then(function (d) {
      if (!d || !document.body.contains(svg)) return;
      build(svg, d);
      show(svg, svg._wrT);
    });
  }

  function frame(svg, t) {
    if (!svg) return;
    svg._wrT = t;
    show(svg, t);
  }

  load();   // start fetching as soon as the script runs
  window.ZWrestle = { init: init, frame: frame };
})();
