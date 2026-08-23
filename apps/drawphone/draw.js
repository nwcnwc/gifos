// Touch drawing pad. Strokes are {c,w,p} with interleaved 0–999 coords.
// Finger or mouse. Nothing is fetched.
(function (root) {
  'use strict';

  function paintStrokes(ctx, strokes, w, h) {
    if (!ctx) return;
    ctx.save();
    ctx.fillStyle = '#fffdf6';
    ctx.fillRect(0, 0, w, h);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    var i, s, p, k, n, sx, sy;
    sx = w / 999;
    sy = h / 999;
    for (i = 0; i < (strokes || []).length; i++) {
      s = strokes[i];
      p = s && s.p;
      if (!p || p.length < 2) continue;
      ctx.strokeStyle = s.c || '#111111';
      ctx.lineWidth = Math.max(1, (s.w || 4) * (w / 400));
      ctx.beginPath();
      ctx.moveTo(p[0] * sx, p[1] * sy);
      n = p.length;
      for (k = 2; k + 1 < n; k += 2) ctx.lineTo(p[k] * sx, p[k + 1] * sy);
      ctx.stroke();
    }
    ctx.restore();
  }

  function DrawPad(canvas) {
    var self = this;
    this.canvas = canvas;
    this.strokes = [];
    this.color = '#111111';
    this.width = 4;
    this._cur = null;
    this._last = null;
    this.enabled = true;
    this._bound = [];

    function on(el, type, fn, opts) {
      el.addEventListener(type, fn, opts || false);
      self._bound.push([el, type, fn, opts]);
    }
    function pt(ev) {
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
    function start(ev) {
      if (!self.enabled) return;
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      ev.preventDefault();
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
      var p = pt(ev);
      self._cur = { c: self.color, w: self.width, p: [p.x, p.y] };
      self._last = p;
      self.redraw();
    }
    function move(ev) {
      if (!self._cur) return;
      ev.preventDefault();
      var p = pt(ev);
      var dx = p.x - self._last.x, dy = p.y - self._last.y;
      if (dx * dx + dy * dy < 9) return;
      self._cur.p.push(p.x, p.y);
      self._last = p;
      self.redraw();
    }
    function end(ev) {
      if (!self._cur) return;
      if (ev) ev.preventDefault();
      var p = ev ? pt(ev) : self._last;
      if (p) self._cur.p.push(p.x, p.y);
      if (self._cur.p.length >= 2) self.strokes.push(self._cur);
      self._cur = null;
      self._last = null;
      self.redraw();
    }
    on(canvas, 'pointerdown', start);
    on(canvas, 'pointermove', move);
    on(canvas, 'pointerup', end);
    on(canvas, 'pointercancel', end);
    on(canvas, 'pointerleave', function (ev) { if (self._cur) end(ev); });
    this.resize();
  }

  DrawPad.prototype.resize = function () {
    var canvas = this.canvas;
    var cssW = canvas.clientWidth || 360;
    var cssH = canvas.clientHeight || cssW;
    var dpr = window.devicePixelRatio || 1;
    var w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    this.redraw();
  };

  DrawPad.prototype.redraw = function () {
    var canvas = this.canvas;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var w = canvas.clientWidth || 360, h = canvas.clientHeight || w;
    var all = this.strokes.slice();
    if (this._cur) all.push(this._cur);
    paintStrokes(ctx, all, w, h);
  };

  DrawPad.prototype.clear = function () {
    this.strokes = [];
    this._cur = null;
    this.redraw();
  };

  DrawPad.prototype.undo = function () {
    this.strokes.pop();
    this._cur = null;
    this.redraw();
  };

  DrawPad.prototype.blank = function () {
    return this.strokes.length === 0 && !this._cur;
  };

  DrawPad.prototype.getStrokes = function () {
    return this.strokes.slice();
  };

  DrawPad.prototype.load = function (strokes, enabled) {
    this.strokes = (strokes || []).slice();
    this._cur = null;
    this.enabled = enabled !== false;
    this.redraw();
  };

  DrawPad.prototype.destroy = function () {
    var i, b;
    for (i = 0; i < this._bound.length; i++) {
      b = this._bound[i];
      b[0].removeEventListener(b[1], b[2], b[3] || false);
    }
    this._bound = [];
  };

  root.DrawPad = DrawPad;
  root.paintStrokes = paintStrokes;
})(typeof window !== 'undefined' ? window : this);
