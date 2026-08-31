/* 2D closed profile on the XY plane. */
(function (root) {
  'use strict';

  function SketchPad(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.points = [];
    this.closed = false;
    this.radius = 6;
    this.dragging = -1;
    this.onChange = null;
    this._bind();
    this.resize();
  }

  SketchPad.prototype.set = function (points, closed, radius) {
    this.points = (points || []).map(function (p) { return [+p[0], +p[1]]; });
    this.closed = !!closed && this.points.length >= 3;
    if (radius != null) this.radius = +radius;
    this.draw();
  };

  SketchPad.prototype.doc = function () {
    return {
      points: this.points.map(function (p) { return [p[0], p[1]]; }),
      closed: this.closed,
      radius: this.radius
    };
  };

  SketchPad.prototype.bounds = function () {
    var pts = this.points, pad = 8;
    if (!pts.length) return { x: -pad, y: -pad, w: 50, h: 50 };
    var minx = pts[0][0], miny = pts[0][1], maxx = minx, maxy = miny;
    for (var i = 1; i < pts.length; i++) {
      if (pts[i][0] < minx) minx = pts[i][0];
      if (pts[i][1] < miny) miny = pts[i][1];
      if (pts[i][0] > maxx) maxx = pts[i][0];
      if (pts[i][1] > maxy) maxy = pts[i][1];
    }
    return { x: minx - pad, y: miny - pad, w: Math.max(20, maxx - minx + pad * 2), h: Math.max(20, maxy - miny + pad * 2) };
  };

  SketchPad.prototype.toWorld = function (clientX, clientY) {
    var r = this.canvas.getBoundingClientRect();
    var b = this.bounds();
    var x = (clientX - r.left) / r.width;
    var y = (clientY - r.top) / r.height;
    return [b.x + x * b.w, b.y + (1 - y) * b.h];
  };

  SketchPad.prototype.hit = function (wx, wy) {
    var r = this.canvas.getBoundingClientRect();
    var b = this.bounds();
    var thresh = (8 / r.width) * b.w;
    var best = -1, bd = thresh * thresh;
    for (var i = 0; i < this.points.length; i++) {
      var dx = this.points[i][0] - wx, dy = this.points[i][1] - wy;
      var d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };

  SketchPad.prototype._bind = function () {
    var self = this, el = this.canvas;
    el.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      el.setPointerCapture(ev.pointerId);
      var w = self.toWorld(ev.clientX, ev.clientY);
      var h = self.hit(w[0], w[1]);
      if (h >= 0) { self.dragging = h; return; }
      if (self.closed) return;
      self.points.push([Math.round(w[0] * 2) / 2, Math.round(w[1] * 2) / 2]);
      self.draw();
      if (self.onChange) self.onChange('add');
    });
    el.addEventListener('pointermove', function (ev) {
      if (self.dragging < 0) return;
      var w = self.toWorld(ev.clientX, ev.clientY);
      self.points[self.dragging] = [Math.round(w[0] * 2) / 2, Math.round(w[1] * 2) / 2];
      self.draw();
    });
    function up() {
      if (self.dragging >= 0) {
        self.dragging = -1;
        if (self.onChange) self.onChange('move');
      }
    }
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    window.addEventListener('resize', function () { self.resize(); });
  };

  SketchPad.prototype.undo = function () {
    if (!this.points.length) return false;
    if (this.closed) { this.closed = false; this.draw(); if (this.onChange) this.onChange('open'); return true; }
    this.points.pop();
    this.draw();
    if (this.onChange) this.onChange('undo');
    return true;
  };

  SketchPad.prototype.close = function () {
    if (this.points.length < 3) return false;
    this.closed = true;
    this.draw();
    if (this.onChange) this.onChange('close');
    return true;
  };

  SketchPad.prototype.clear = function () {
    this.points = [];
    this.closed = false;
    this.draw();
    if (this.onChange) this.onChange('clear');
  };

  SketchPad.prototype.resize = function () {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.max(1, this.canvas.clientWidth * dpr);
    var h = Math.max(1, this.canvas.clientHeight * dpr);
    this.canvas.width = w; this.canvas.height = h;
    this.draw();
  };

  SketchPad.prototype.draw = function () {
    var ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0a0d13';
    ctx.fillRect(0, 0, w, h);
    var b = this.bounds();
    function sx(x) { return (x - b.x) / b.w * w; }
    function sy(y) { return (1 - (y - b.y) / b.h) * h; }
    ctx.strokeStyle = '#1c2533';
    ctx.lineWidth = 1;
    var step = 5, x0 = Math.floor(b.x / step) * step, y0 = Math.floor(b.y / step) * step;
    ctx.beginPath();
    for (var gx = x0; gx <= b.x + b.w; gx += step) { ctx.moveTo(sx(gx), 0); ctx.lineTo(sx(gx), h); }
    for (var gy = y0; gy <= b.y + b.h; gy += step) { ctx.moveTo(0, sy(gy)); ctx.lineTo(w, sy(gy)); }
    ctx.stroke();
    ctx.strokeStyle = '#38a8d6';
    ctx.lineWidth = 2;
    if (this.points.length) {
      ctx.beginPath();
      ctx.moveTo(sx(this.points[0][0]), sy(this.points[0][1]));
      for (var i = 1; i < this.points.length; i++) ctx.lineTo(sx(this.points[i][0]), sy(this.points[i][1]));
      if (this.closed) ctx.closePath();
      ctx.stroke();
      if (this.closed) {
        ctx.fillStyle = 'rgba(56,168,214,0.12)';
        ctx.fill();
      }
    }
    for (var j = 0; j < this.points.length; j++) {
      ctx.beginPath();
      ctx.arc(sx(this.points[j][0]), sy(this.points[j][1]), j === 0 ? 6 : 5, 0, Math.PI * 2);
      ctx.fillStyle = j === 0 ? '#7dcc88' : '#e8eef6';
      ctx.fill();
    }
  };

  root.SketchPad = SketchPad;

  root.SAMPLE_PLATE = {
    points: [[0, 0], [40, 0], [40, 24], [0, 24]],
    closed: true,
    radius: 6,
    height: 12
  };
})(window);
