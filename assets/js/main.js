/* ==========================================================================
   Theme toggle, news expander, active-section nav, and the neural background.
   ========================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Theme ---------- */
  var toggle = document.querySelector(".theme-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
      if (bg) bg.refresh();
    });
  }

  /* ---------- News expander ---------- */
  var moreBtn = document.querySelector('[data-toggle="news"]');
  var newsList = document.querySelector(".news");
  if (moreBtn && newsList) {
    moreBtn.setAttribute("aria-expanded", "false");
    moreBtn.addEventListener("click", function () {
      var open = newsList.classList.toggle("is-open");
      moreBtn.setAttribute("aria-expanded", String(open));
      moreBtn.firstChild.textContent = open ? "Show less " : "Show all news ";
    });
  }

  /* ---------- Active section in the nav ---------- */
  var links = Array.prototype.slice.call(document.querySelectorAll(".nav a"));
  if ("IntersectionObserver" in window && links.length) {
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && byId[en.target.id]) {
          links.forEach(function (a) { a.classList.remove("is-active"); });
          byId[en.target.id].classList.add("is-active");
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(byId).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }

  /* ---------- Neural background: carbon (left) ⇄ silicon (right) ----------
     Left side: organic neurons joined by curved axons.
     Right side: nodes snap to a grid and edges become right-angled traces.
     Spikes travel along edges and sometimes trigger the next neuron. */
  var bg = (function () {
    var canvas = document.getElementById("neural-bg");
    if (!canvas || !canvas.getContext) return null;
    var ctx = canvas.getContext("2d");
    var layer = document.createElement("canvas");
    var lctx = layer.getContext("2d");
    var W = 0, H = 0, DPR = 1;
    var nodes = [], edges = [], pulses = [];
    var colA, colB, alphaEdge, alphaNode;
    var raf = null, lastSpawn = 0;

    function hexToRgb(h) {
      h = h.trim().replace("#", "");
      if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
      var n = parseInt(h, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
    function rgba(c, a) { return "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + a + ")"; }
    function smooth(e0, e1, x) { var t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

    // Small seeded RNG so the network looks the same on every visit
    var seed = 20260808;
    function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }

    function readColors() {
      var cs = getComputedStyle(root);
      colA = hexToRgb(cs.getPropertyValue("--carbon") || "#ff9e7a");
      colB = hexToRgb(cs.getPropertyValue("--silicon") || "#5ee0ff");
      var light = root.getAttribute("data-theme") === "light";
      alphaEdge = light ? 0.13 : 0.16;
      alphaNode = light ? 0.35 : 0.42;
    }

    function build() {
      seed = 20260808;
      nodes = []; edges = []; pulses = [];
      var count = Math.min(120, Math.max(40, Math.round((W * H) / 16000)));
      var grid = 46;
      for (var i = 0; i < count; i++) {
        var x = rand() * W, y = rand() * H;
        var t = x / W;
        var b = smooth(0.42, 0.82, t); // 0 = biological, 1 = silicon
        var gx = Math.round(x / grid) * grid, gy = Math.round(y / grid) * grid;
        nodes.push({ x: x + (gx - x) * b, y: y + (gy - y) * b, t: t, b: b, flash: 0, links: [] });
      }
      // connect each node to its nearest neighbours
      var maxD = Math.max(150, Math.min(W, H) / 4.2);
      for (var a = 0; a < nodes.length; a++) {
        var near = [];
        for (var c = 0; c < nodes.length; c++) {
          if (c === a) continue;
          var dx = nodes[c].x - nodes[a].x, dy = nodes[c].y - nodes[a].y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < maxD && d > 8) near.push([d, c]);
        }
        near.sort(function (p, q) { return p[0] - q[0]; });
        var k = 2 + (rand() < 0.4 ? 1 : 0);
        for (var j = 0; j < Math.min(k, near.length); j++) {
          var other = near[j][1];
          if (a < other || nodes[other].links.indexOf(a) === -1) addEdge(a, other);
        }
      }
    }

    function addEdge(i, j) {
      var A = nodes[i], B = nodes[j];
      if (A.links.indexOf(j) !== -1) return;
      var blend = (A.b + B.b) / 2;
      var pts = [], N = 18;
      // curved control point (organic) and an L-shaped corner (circuit trace)
      var mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      var nx = -(B.y - A.y), ny = B.x - A.x, len = Math.sqrt(nx * nx + ny * ny) || 1;
      var bend = (rand() - 0.5) * 0.6 * len;
      var cx = mx + (nx / len) * bend, cy = my + (ny / len) * bend;
      var horizontalFirst = rand() < 0.5;
      for (var s = 0; s <= N; s++) {
        var u = s / N;
        var qx = (1 - u) * (1 - u) * A.x + 2 * (1 - u) * u * cx + u * u * B.x;
        var qy = (1 - u) * (1 - u) * A.y + 2 * (1 - u) * u * cy + u * u * B.y;
        var lx, ly;
        if (horizontalFirst) {
          if (u < 0.5) { lx = A.x + (B.x - A.x) * (u * 2); ly = A.y; } else { lx = B.x; ly = A.y + (B.y - A.y) * ((u - 0.5) * 2); }
        } else {
          if (u < 0.5) { lx = A.x; ly = A.y + (B.y - A.y) * (u * 2); } else { lx = A.x + (B.x - A.x) * ((u - 0.5) * 2); ly = B.y; }
        }
        pts.push([qx + (lx - qx) * blend, qy + (ly - qy) * blend]);
      }
      var e = { a: i, b: j, pts: pts, blend: blend };
      edges.push(e);
      A.links.push(j); B.links.push(i);
      e.id = edges.length - 1;
    }

    function colorAt(t) { return mix(colA, colB, smooth(0.2, 0.85, t)); }

    function drawLayer() {
      layer.width = W * DPR; layer.height = H * DPR;
      lctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      lctx.clearRect(0, 0, W, H);
      lctx.lineCap = "round"; lctx.lineJoin = "round";
      edges.forEach(function (e) {
        var A = nodes[e.a], B = nodes[e.b];
        var g = lctx.createLinearGradient(A.x, A.y, B.x, B.y);
        g.addColorStop(0, rgba(colorAt(A.t), alphaEdge));
        g.addColorStop(1, rgba(colorAt(B.t), alphaEdge));
        lctx.strokeStyle = g;
        lctx.lineWidth = 1 + (1 - e.blend) * 0.3;
        lctx.beginPath();
        lctx.moveTo(e.pts[0][0], e.pts[0][1]);
        for (var s = 1; s < e.pts.length; s++) lctx.lineTo(e.pts[s][0], e.pts[s][1]);
        lctx.stroke();
      });
      nodes.forEach(function (n) { drawNode(lctx, n, alphaNode, 0); });
    }

    function drawNode(c, n, alpha, extra) {
      var col = colorAt(n.t);
      var r = 2.2 + extra;
      c.fillStyle = rgba(col, alpha);
      if (n.b > 0.55) {
        var s = r * 1.7;
        c.fillRect(n.x - s / 2, n.y - s / 2, s, s); // chip pad
      } else {
        c.beginPath(); c.arc(n.x, n.y, r, 0, Math.PI * 2); c.fill(); // soma
      }
    }

    function spawn(fromNode) {
      var ni = fromNode !== undefined ? fromNode : (rand() * nodes.length) | 0;
      var n = nodes[ni];
      if (!n || !n.links.length) return;
      var to = n.links[(Math.random() * n.links.length) | 0];
      var edge = null;
      for (var i = 0; i < edges.length; i++) {
        var e = edges[i];
        if ((e.a === ni && e.b === to) || (e.b === ni && e.a === to)) { edge = e; break; }
      }
      if (!edge) return;
      pulses.push({ e: edge, forward: edge.a === ni, p: 0, speed: 0.008 + Math.random() * 0.008, to: to });
    }

    function pointOn(e, p) {
      var pts = e.pts, f = p * (pts.length - 1), i = Math.floor(f), r = f - i;
      if (i >= pts.length - 1) return pts[pts.length - 1];
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r];
    }

    function frame(ts) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(layer, 0, 0);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      if (ts - lastSpawn > 520 && pulses.length < 14) { spawn(); lastSpawn = ts; }

      ctx.globalCompositeOperation = "lighter";
      for (var i = pulses.length - 1; i >= 0; i--) {
        var pu = pulses[i];
        pu.p += pu.speed;
        var head = pu.forward ? pu.p : 1 - pu.p;
        var tailP = pu.forward ? Math.max(0, pu.p - 0.18) : Math.min(1, 1 - pu.p + 0.18);
        var h = pointOn(pu.e, Math.min(1, Math.max(0, head)));
        var tp = pointOn(pu.e, tailP);
        var col = colorAt(h[0] / W);
        var grad = ctx.createLinearGradient(tp[0], tp[1], h[0], h[1]);
        grad.addColorStop(0, rgba(col, 0));
        grad.addColorStop(1, rgba(col, 0.7));
        ctx.strokeStyle = grad; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(tp[0], tp[1]); ctx.lineTo(h[0], h[1]); ctx.stroke();
        ctx.fillStyle = rgba(col, 0.85);
        ctx.shadowColor = rgba(col, 0.9); ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(h[0], h[1], 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        if (pu.p >= 1) {
          pulses.splice(i, 1);
          var target = nodes[pu.to];
          target.flash = 1;
          if (Math.random() < 0.55 && pulses.length < 18) spawn(pu.to); // the spike propagates
        }
      }
      ctx.globalCompositeOperation = "source-over";

      nodes.forEach(function (n) {
        if (n.flash > 0.02) {
          var col = colorAt(n.t);
          ctx.fillStyle = rgba(col, 0.25 * n.flash);
          ctx.beginPath(); ctx.arc(n.x, n.y, 4 + 10 * (1 - n.flash), 0, Math.PI * 2); ctx.fill();
          drawNode(ctx, n, 0.9 * n.flash, 1.2 * n.flash);
          n.flash *= 0.94;
        }
      });

      raf = requestAnimationFrame(frame);
    }

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * DPR; canvas.height = H * DPR;
      build(); drawLayer();
      if (reduceMotion) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(layer, 0, 0); }
    }

    function start() { if (!raf && !reduceMotion) raf = requestAnimationFrame(frame); }
    function stop() { if (raf) cancelAnimationFrame(raf); raf = null; }

    readColors(); resize(); start();

    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        // ignore height-only changes from mobile URL bars
        if (Math.abs(window.innerWidth - W) > 2 || Math.abs(window.innerHeight - H) > 120) resize();
      }, 150);
    });
    document.addEventListener("visibilitychange", function () { document.hidden ? stop() : start(); });

    return { refresh: function () { readColors(); drawLayer(); if (reduceMotion) resize(); } };
  })();
})();
