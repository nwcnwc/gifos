// Freehand board. Classic canvas, no modules. Brush behaviour follows
// LHRUN/paint-board (MIT) without Fabric.js or a CDN.
(function (root) {
  'use strict';

  var KINDS = ['basic', 'rainbow', 'stars', 'crayon', 'pixels', 'stripe', 'web', 'mesh', 'dots', 'wave', 'thorn', 'erase'];
  var LABELS = {
    basic: 'Basic', rainbow: 'Rainbow', stars: 'Stars', crayon: 'Crayon',
    pixels: 'Pixels', stripe: 'Stripe', web: 'Web', mesh: 'Mesh',
    dots: 'Dots', wave: 'Wave', thorn: 'Thorn', erase: 'Eraser'
  };
  var PALETTE = ['#000000', '#65CC8A', '#FF6363', '#3A59D1', '#F4C430', '#FF8C42', '#9B59B6', '#ffffff', '#FF69B4', '#1abc9c'];
  var PAPER = '#fffef8';
  var MAX_PTS = 800;

  var canvas = document.getElementById('paper');
  var ctx = canvas.getContext('2d');
  var committed = document.createElement('canvas');
  var cctx = committed.getContext('2d');
  var W = 0, H = 0, dpr = 1;

  var strokes = [];
  var redo = [];
  var kind = 'basic';
  var color = PALETTE[0];
  var colors = [PALETTE[0], PALETTE[1], PALETTE[2], PALETTE[3]];
  var width = 10;
  var drawing = false;
  var cur = null;
  var lastPt = null;

  function $(id) { return document.getElementById(id); }
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) | 0;
      return (s >>> 0) / 4294967296;
    };
  }
  function scaledW(w) {
    return Math.max(1, (w || 10) * (Math.min(W, H) / 640));
  }
  function toXY(ev) {
    var r = canvas.getBoundingClientRect();
    var t = ev;
    if (ev.touches && ev.touches[0]) t = ev.touches[0];
    else if (ev.changedTouches && ev.changedTouches[0]) t = ev.changedTouches[0];
    var x = (t.clientX - r.left) / (r.width || 1);
    var y = (t.clientY - r.top) / (r.height || 1);
    if (x < 0) x = 0; if (x > 1) x = 1;
    if (y < 0) y = 0; if (y > 1) y = 1;
    return { x: Math.round(x * 999), y: Math.round(y * 999) };
  }
  function ptsOf(stroke) {
    var p = stroke.p || [], out = [], i, sx = W / 999, sy = H / 999;
    for (i = 0; i + 1 < p.length; i += 2) out.push({ x: p[i] * sx, y: p[i + 1] * sy });
    return out;
  }
  function colorOf(stroke) { return stroke.c || '#000000'; }
  function paletteOf(stroke) {
    var cs = stroke.cs;
    if (cs && cs.length) return cs;
    return [colorOf(stroke), '#65CC8A', '#FF6363', '#3A59D1'];
  }

  function starPath(g, x, y, r) {
    var i, a, rr;
    g.beginPath();
    for (i = 0; i < 10; i++) {
      rr = (i % 2 === 0) ? r : r * 0.45;
      a = -Math.PI / 2 + i * Math.PI / 5;
      if (i) g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
  }
  function polyline(g, pts) {
    var i;
    if (pts.length < 1) return;
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  }
  function dist(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function drawStroke(g, stroke) {
    var pts = ptsOf(stroke);
    if (!pts.length) return;
    var k = stroke.k || 'basic';
    var w = scaledW(stroke.w);
    var col = colorOf(stroke);
    var pal = paletteOf(stroke);
    var rnd = rng(stroke.seed || 1);
    var i, j, a, b, d, ang, midx, midy, step, size, n, px, py, dx, dy, nx, ny, flip, hue;
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';

    if (k === 'erase') {
      g.globalCompositeOperation = 'destination-out';
      g.strokeStyle = '#000';
      g.lineWidth = w * 2.2;
      polyline(g, pts);
      g.stroke();
      g.restore();
      return;
    }

    if (k === 'basic') {
      g.strokeStyle = col;
      g.lineWidth = w;
      polyline(g, pts);
      g.stroke();
    } else if (k === 'rainbow') {
      hue = (stroke.seed || 0) % 360;
      g.lineWidth = w;
      for (i = 1; i < pts.length; i++) {
        g.strokeStyle = 'hsl(' + ((hue + i) % 360) + ',90%,50%)';
        g.beginPath();
        g.moveTo(pts[i - 1].x, pts[i - 1].y);
        g.lineTo(pts[i].x, pts[i].y);
        g.stroke();
      }
    } else if (k === 'stars') {
      step = Math.max(10, w * 1.6);
      d = 0;
      for (i = 1; i < pts.length; i++) {
        d += dist(pts[i - 1], pts[i]);
        if (d < step) continue;
        d = 0;
        size = w * (0.8 + rnd() * 1.4);
        g.globalAlpha = 0.45 + rnd() * 0.5;
        g.fillStyle = pal[(rnd() * pal.length) | 0];
        starPath(g, pts[i].x + (rnd() - 0.5) * w, pts[i].y + (rnd() - 0.5) * w, size);
        g.fill();
      }
    } else if (k === 'crayon') {
      g.globalAlpha = 0.28;
      g.strokeStyle = col;
      for (n = 0; n < 5; n++) {
        g.lineWidth = w * (0.55 + rnd() * 0.7);
        g.beginPath();
        g.moveTo(pts[0].x + (rnd() - 0.5) * w, pts[0].y + (rnd() - 0.5) * w);
        for (i = 1; i < pts.length; i++) {
          g.lineTo(pts[i].x + (rnd() - 0.5) * w * 0.6, pts[i].y + (rnd() - 0.5) * w * 0.6);
        }
        g.stroke();
      }
    } else if (k === 'pixels') {
      size = Math.max(2, w / 3);
      step = size;
      for (i = 0; i < pts.length; i++) {
        for (px = -w; px < w; px += step) {
          for (py = -w; py < w; py += step) {
            if (rnd() > 0.5) {
              g.fillStyle = pal[(rnd() * pal.length) | 0];
              g.fillRect(pts[i].x + px, pts[i].y + py, step, step);
            }
          }
        }
      }
    } else if (k === 'stripe') {
      n = Math.max(2, pal.length);
      for (j = 0; j < n; j++) {
        g.strokeStyle = pal[j];
        g.lineWidth = Math.max(1, w / n);
        g.beginPath();
        for (i = 0; i < pts.length; i++) {
          a = pts[i];
          b = pts[i + 1] || a;
          dx = b.x - a.x; dy = b.y - a.y;
          d = Math.sqrt(dx * dx + dy * dy) || 1;
          nx = -dy / d; ny = dx / d;
          var ox = nx * (j - (n - 1) / 2) * (w / n);
          var oy = ny * (j - (n - 1) / 2) * (w / n);
          if (i === 0) g.moveTo(a.x + ox, a.y + oy);
          else g.lineTo(a.x + ox, a.y + oy);
        }
        g.stroke();
      }
    } else if (k === 'web') {
      g.strokeStyle = col;
      g.lineWidth = Math.max(1, w / 3);
      polyline(g, pts);
      g.stroke();
      g.lineWidth = Math.max(1, w / 9);
      g.globalAlpha = 0.55;
      for (i = 4; i < pts.length; i += 5) {
        for (j = 1; j <= 3 && i - j * 5 >= 0; j++) {
          g.beginPath();
          g.moveTo(pts[i].x, pts[i].y);
          g.lineTo(pts[i - j * 5].x, pts[i - j * 5].y);
          g.stroke();
        }
      }
    } else if (k === 'mesh') {
      g.strokeStyle = col;
      g.lineWidth = Math.max(1, w / 3);
      polyline(g, pts);
      g.stroke();
      g.lineWidth = Math.max(0.6, w / 9);
      g.globalAlpha = 0.45;
      var limit = 90 * (Math.min(W, H) / 640);
      for (i = 1; i < pts.length; i++) {
        for (j = 0; j < i; j += 2) {
          dx = pts[i].x - pts[j].x; dy = pts[i].y - pts[j].y;
          if (dx * dx + dy * dy < limit * limit) {
            g.beginPath();
            g.moveTo(pts[i].x + dx * 0.1, pts[i].y + dy * 0.1);
            g.lineTo(pts[j].x - dx * 0.1, pts[j].y - dy * 0.1);
            g.stroke();
          }
        }
      }
    } else if (k === 'dots') {
      var prev = null, cluster, rad = Math.max(2, w * 0.45);
      g.fillStyle = col;
      g.strokeStyle = col;
      g.lineWidth = Math.max(1, w / 5);
      for (i = 0; i < pts.length; i++) {
        cluster = [];
        for (n = 0; n < 3; n++) {
          cluster.push({
            x: pts[i].x + (rnd() - 0.5) * w * 2.4,
            y: pts[i].y + (rnd() - 0.5) * w * 2.4
          });
        }
        for (n = 0; n < cluster.length; n++) {
          g.beginPath();
          g.arc(cluster[n].x, cluster[n].y, rad, 0, Math.PI * 2);
          g.fill();
          if (prev && prev[n]) {
            g.beginPath();
            g.moveTo(prev[n].x, prev[n].y);
            g.lineTo(cluster[n].x, cluster[n].y);
            g.stroke();
          }
        }
        prev = cluster;
      }
    } else if (k === 'wave') {
      g.strokeStyle = col;
      g.lineWidth = Math.max(1.5, w / 3);
      flip = 1;
      for (i = 1; i < pts.length; i++) {
        a = pts[i - 1]; b = pts[i];
        d = dist(a, b);
        if (d < 2) continue;
        midx = (a.x + b.x) / 2; midy = (a.y + b.y) / 2;
        ang = Math.atan2(b.y - a.y, b.x - a.x);
        g.beginPath();
        g.arc(midx, midy, d / 2, ang + (flip < 0 ? Math.PI : 0), ang + (flip < 0 ? Math.PI : 0) + Math.PI);
        g.stroke();
        flip = -flip;
      }
    } else if (k === 'thorn') {
      for (i = 1; i < pts.length; i++) {
        a = pts[i - 1]; b = pts[i];
        d = dist(a, b);
        ang = Math.atan2(b.y - a.y, b.x - a.x);
        g.save();
        g.translate(b.x, b.y);
        g.rotate(ang);
        g.globalAlpha = 0.25 + rnd() * 0.7;
        g.fillStyle = col;
        g.beginPath();
        g.ellipse(0, 0, d * 5 + 3, Math.max(1.2, w / 6), 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    } else {
      g.strokeStyle = col;
      g.lineWidth = w;
      polyline(g, pts);
      g.stroke();
    }
    g.restore();
  }

  function blit() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(committed, 0, 0);
    if (cur) drawStroke(ctx, cur);
  }
  function rebuild() {
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.clearRect(0, 0, committed.width, committed.height);
    var i;
    for (i = 0; i < strokes.length; i++) drawStroke(cctx, strokes[i]);
    blit();
  }
  function resize() {
    var stage = $('stage');
    var cssW = Math.max(1, stage.clientWidth - 20);
    var cssH = Math.max(1, stage.clientHeight - 20);
    dpr = window.devicePixelRatio || 1;
    W = Math.round(cssW * dpr);
    H = Math.round(cssH * dpr);
    canvas.width = W; canvas.height = H;
    committed.width = W; committed.height = H;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    rebuild();
  }

  function changed() {
    if (root.PaintBoard.onChanged) root.PaintBoard.onChanged(strokes.slice());
  }

  function start(ev) {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    ev.preventDefault();
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
    var p = toXY(ev);
    drawing = true;
    redo = [];
    cur = {
      k: kind,
      c: color,
      cs: colors.slice(),
      w: kind === 'erase' ? Math.max(width, 14) : width,
      p: [p.x, p.y],
      seed: ((Math.random() * 0xffffffff) | 0) >>> 0
    };
    lastPt = p;
    blit();
  }
  function move(ev) {
    if (!drawing || !cur) return;
    ev.preventDefault();
    var p = toXY(ev);
    var dx = p.x - lastPt.x, dy = p.y - lastPt.y;
    if (dx * dx + dy * dy < 9) return;
    if (cur.p.length >= MAX_PTS) return;
    cur.p.push(p.x, p.y);
    lastPt = p;
    blit();
  }
  function end(ev) {
    if (!drawing || !cur) return;
    if (ev) ev.preventDefault();
    var p = ev ? toXY(ev) : lastPt;
    if (p && cur.p.length < MAX_PTS) cur.p.push(p.x, p.y);
    if (cur.p.length >= 2) {
      strokes.push(cur);
      drawStroke(cctx, cur);
      if (root.PaintBoard.onStroke) root.PaintBoard.onStroke(cur);
      changed();
    }
    cur = null;
    lastPt = null;
    drawing = false;
    blit();
  }

  function setKind(k) {
    if (KINDS.indexOf(k) < 0) return;
    kind = k;
    var btns = document.querySelectorAll('#brushes button');
    var i;
    for (i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i].getAttribute('data-kind') === k);
  }
  function setColor(c) {
    color = c;
    var i, found = false;
    for (i = 0; i < colors.length; i++) if (colors[i] === c) { found = true; break; }
    if (!found) {
      colors = [c].concat(colors.slice(0, 3));
    } else {
      var next = [c];
      for (i = 0; i < colors.length && next.length < 4; i++) {
        if (colors[i] !== c) next.push(colors[i]);
      }
      colors = next;
    }
    var btns = document.querySelectorAll('#swatches button');
    for (i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i].getAttribute('data-color') === c);
  }

  function paintChrome() {
    var host = $('brushes'), i, b;
    host.innerHTML = '';
    for (i = 0; i < KINDS.length; i++) {
      b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-kind', KINDS[i]);
      b.textContent = LABELS[KINDS[i]];
      if (KINDS[i] === kind) b.className = 'on';
      b.addEventListener('click', (function (k) {
        return function () { setKind(k); };
      })(KINDS[i]));
      host.appendChild(b);
    }
    host = $('swatches');
    host.innerHTML = '';
    for (i = 0; i < PALETTE.length; i++) {
      b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-color', PALETTE[i]);
      b.style.background = PALETTE[i];
      if (PALETTE[i] === color) b.className = 'on';
      b.addEventListener('click', (function (c) {
        return function () { setColor(c); };
      })(PALETTE[i]));
      host.appendChild(b);
    }
  }

  function pack() { return strokes.slice(); }
  function replace(next) {
    strokes = (next || []).slice();
    redo = [];
    rebuild();
  }
  function empty() {
    strokes = [];
    redo = [];
    cur = null;
    rebuild();
    changed();
  }
  function undo() {
    if (root.PaintBoard.mp) return;
    if (!strokes.length) return;
    redo.push(strokes.pop());
    rebuild();
    changed();
  }
  function redoOne() {
    if (root.PaintBoard.mp) return;
    if (!redo.length) return;
    var s = redo.pop();
    strokes.push(s);
    drawStroke(cctx, s);
    blit();
    changed();
  }
  function exportPng() {
    var out = document.createElement('canvas');
    out.width = W; out.height = H;
    var g = out.getContext('2d');
    g.fillStyle = PAPER;
    g.fillRect(0, 0, W, H);
    g.drawImage(committed, 0, 0);
    out.toBlob(function (blob) {
      if (!blob) return;
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'paint-board.png';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    }, 'image/png');
  }

  paintChrome();
  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  $('width').addEventListener('input', function () { width = +$('width').value || 10; });
  $('undoBtn').addEventListener('click', function (e) { e.preventDefault(); undo(); });
  $('redoBtn').addEventListener('click', function (e) { e.preventDefault(); redoOne(); });
  $('saveBtn').addEventListener('click', function (e) { e.preventDefault(); exportPng(); });
  window.addEventListener('resize', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  resize();

  root.PaintBoard = {
    KINDS: KINDS,
    pack: pack,
    replace: replace,
    empty: empty,
    undo: undo,
    exportPng: exportPng,
    mp: false,
    onChanged: null,
    onStroke: null
  };
})(window);
