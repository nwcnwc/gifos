// Touch drawing pad. Strokes are {c,w,p} with interleaved 0–999 coords.
// Finger or mouse. Quadratic smoothing + coalesced points so a finger
// does not look like a polygon. Completed strokes bake to a layer so
// the live stroke stays cheap. Nothing is fetched.
(function (root) {
  'use strict';

  function fillPaper(ctx, w, h) {
    ctx.fillStyle = '#fffdf6';
    ctx.fillRect(0, 0, w, h);
  }

  function paintOne(ctx, s, sx, sy, lwScale) {
    var p = s && s.p;
    if (!p || p.length < 2) return;
    var n = p.length;
    var w = Math.max(1.2, (s.w || 5) * lwScale);
    ctx.strokeStyle = s.c || '#111111';
    ctx.fillStyle = s.c || '#111111';
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (n < 4) {
      ctx.beginPath();
      ctx.arc(p[0] * sx, p[1] * sy, w / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(p[0] * sx, p[1] * sy);
    var i, x, y, nx, ny;
    for (i = 2; i + 3 < n; i += 2) {
      x = p[i] * sx;
      y = p[i + 1] * sy;
      nx = p[i + 2] * sx;
      ny = p[i + 3] * sy;
      ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
    }
    ctx.lineTo(p[n - 2] * sx, p[n - 1] * sy);
    ctx.stroke();
  }

  function paintStrokes(ctx, strokes, w, h) {
    if (!ctx) return;
    ctx.save();
    fillPaper(ctx, w, h);
    var sx = w / 999, sy = h / 999, lw = w / 400;
    var i;
    for (i = 0; i < (strokes || []).length; i++) paintOne(ctx, strokes[i], sx, sy, lw);
    ctx.restore();
  }

  function DrawPad(canvas) {
    var self = this;
    this.canvas = canvas;
    this.strokes = [];
    this.redoStack = [];
    this.color = '#111111';
    this.width = 7;
    this._cur = null;
    this._last = null;
    this.enabled = true;
    this._bound = [];
    this._layer = document.createElement('canvas');
    this._raf = 0;
    this._dirty = false;
    canvas.style.touchAction = 'none';
    canvas.style.msTouchAction = 'none';

    function on(el, type, fn, opts) {
      el.addEventListener(type, fn, opts || false);
      self._bound.push([el, type, fn, opts]);
    }
    function pt(t, r) {
      var x = (t.clientX - r.left) / (r.width || 1);
      var y = (t.clientY - r.top) / (r.height || 1);
      if (x < 0) x = 0; if (x > 1) x = 1;
      if (y < 0) y = 0; if (y > 1) y = 1;
      return { x: Math.round(x * 999), y: Math.round(y * 999) };
    }
    function pushPt(p) {
      if (!self._cur) return;
      var last = self._last;
      if (last) {
        var dx = p.x - last.x, dy = p.y - last.y;
        if (dx * dx + dy * dy < 4) return;
      }
      self._cur.p.push(p.x, p.y);
      self._last = p;
      self._dirty = true;
    }
    function start(ev) {
      if (!self.enabled) return;
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      ev.preventDefault();
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
      var r = canvas.getBoundingClientRect();
      var p = pt(ev, r);
      self._cur = { c: self.color, w: self.width, p: [p.x, p.y] };
      self._last = p;
      self.redoStack = [];
      self._dirty = true;
      self.redraw();
    }
    function move(ev) {
      if (!self._cur) return;
      ev.preventDefault();
      var r = canvas.getBoundingClientRect();
      var list = ev.getCoalescedEvents ? ev.getCoalescedEvents() : null;
      var i;
      if (list && list.length) {
        for (i = 0; i < list.length; i++) pushPt(pt(list[i], r));
      } else {
        pushPt(pt(ev, r));
      }
      if (self._dirty && !self._raf) {
        self._raf = requestAnimationFrame(function () {
          self._raf = 0;
          self.redrawLive();
        });
      }
    }
    function end(ev) {
      if (!self._cur) return;
      if (ev) ev.preventDefault();
      var r = canvas.getBoundingClientRect();
      var p = ev ? pt(ev.changedTouches && ev.changedTouches[0] ? ev.changedTouches[0] : ev, r) : self._last;
      if (p) {
        self._cur.p.push(p.x, p.y);
      }
      if (self._cur.p.length >= 2) self.strokes.push(self._cur);
      self._cur = null;
      self._last = null;
      self.bake();
      self.redraw();
    }
    on(canvas, 'pointerdown', start, { passive: false });
    on(canvas, 'pointermove', move, { passive: false });
    on(canvas, 'pointerup', end, { passive: false });
    on(canvas, 'pointercancel', end, { passive: false });
    on(canvas, 'lostpointercapture', function () { if (self._cur) end(null); });
    this.resize();
  }

  DrawPad.prototype.bake = function () {
    var layer = this._layer;
    var canvas = this.canvas;
    if (layer.width !== canvas.width || layer.height !== canvas.height) {
      layer.width = canvas.width;
      layer.height = canvas.height;
    }
    var ctx = layer.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var w = canvas.clientWidth || 360, h = canvas.clientHeight || w;
    fillPaper(ctx, w, h);
    var sx = w / 999, sy = h / 999, lw = w / 400, i;
    for (i = 0; i < this.strokes.length; i++) paintOne(ctx, this.strokes[i], sx, sy, lw);
  };

  DrawPad.prototype.redrawLive = function () {
    if (!this._cur) { this.redraw(); return; }
    var canvas = this.canvas;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this._layer, 0, 0);
    var dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var w = canvas.clientWidth || 360, h = canvas.clientHeight || w;
    paintOne(ctx, this._cur, w / 999, h / 999, w / 400);
    this._dirty = false;
  };

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
    this.bake();
    this.redraw();
  };

  DrawPad.prototype.redraw = function () {
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    this.bake();
    var canvas = this.canvas;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(this._layer, 0, 0);
    if (this._cur) {
      var dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var w = canvas.clientWidth || 360, h = canvas.clientHeight || w;
      paintOne(ctx, this._cur, w / 999, h / 999, w / 400);
    }
    this._dirty = false;
  };

  DrawPad.prototype.clear = function () {
    this.strokes = [];
    this.redoStack = [];
    this._cur = null;
    this.redraw();
  };

  DrawPad.prototype.undo = function () {
    if (this._cur) { this._cur = null; this._last = null; this.redraw(); return; }
    if (!this.strokes.length) return;
    this.redoStack.push(this.strokes.pop());
    this.redraw();
  };

  DrawPad.prototype.redo = function () {
    if (!this.redoStack.length) return;
    this.strokes.push(this.redoStack.pop());
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
    this.redoStack = [];
    this._cur = null;
    this.enabled = enabled !== false;
    this.redraw();
  };

  DrawPad.prototype.destroy = function () {
    var i, b;
    if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    for (i = 0; i < this._bound.length; i++) {
      b = this._bound[i];
      b[0].removeEventListener(b[1], b[2], b[3] || false);
    }
    this._bound = [];
  };

  root.DrawPad = DrawPad;
  root.paintStrokes = paintStrokes;
})(typeof window !== 'undefined' ? window : this);
