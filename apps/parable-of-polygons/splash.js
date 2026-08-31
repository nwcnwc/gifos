/*
 * Intro / outro swinging polygons. Port of play/intro/intro.js and
 * play/outro/outro.js — the hanging crowd that leans toward the mouse —
 * without the 90 KB banner PNGs. Title is HTML on top of the canvas.
 */
(function (root) {
  'use strict';

  function Splash(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.happy = !!opts.happy;
    this.mouse = { x: canvas.width / 2, y: 0 };
    this.swingers = [];
    this.inSight = true;
    var self = this;
    canvas.addEventListener('pointermove', function (ev) {
      var r = canvas.getBoundingClientRect();
      var sx = canvas.width / (r.width || 1);
      var sy = canvas.height / (r.height || 1);
      self.mouse.x = (ev.clientX - r.left) * sx;
      self.mouse.y = (ev.clientY - r.top) * sy;
    });
    if (typeof IntersectionObserver === 'function') {
      var io = new IntersectionObserver(function (es) {
        self.inSight = es[0] && es[0].isIntersecting;
      }, { threshold: 0.02 });
      io.observe(canvas);
    }
    this.seed();
    var tick = function () {
      root.requestAnimationFrame(tick);
      self.draw();
    };
    tick();
  }

  Splash.prototype.seed = function () {
    var W = this.canvas.width, H = this.canvas.height;
    var cx = W / 2;
    var list = [];
    var pent = false;
    for (var i = 0; i < W; i += 50) {
      var tt = (i - cx) / cx;
      var num = i > cx ? Math.ceil(tt * tt * 4) : Math.ceil(tt * tt * 7);
      for (var j = 0; j < num + 1; j++) {
        var x = i + Math.random() * 20 - 10;
        var t = (x - cx) / cx;
        var y = H * 0.42 - 170 * t * t;
        y += i > cx ? j * 50 + Math.random() * 20 - 10
                    : j * 30 + Math.random() * 20 - 10;
        if (x > cx - 140 && x < cx + 140) continue;
        var s = {
          x: x, y: y, swing: x * 0.1,
          base: Math.random() * 0.2 - 0.1,
          color: x > cx ? 0 : 1
        };
        if (this.happy) s.color = Math.random() < 0.5 ? 0 : 1;
        if (this.happy && !pent && s.x > W * 0.78 && j >= num) {
          pent = true;
          s.color = 2;
        }
        if (!isNaN(s.y)) list.push(s);
      }
    }
    list.push({ x: cx - 30, y: H * 0.4, swing: (cx - 30) * 0.1, base: 0, color: 1 });
    list.push({ x: cx + 30, y: H * 0.4, swing: (cx + 30) * 0.1, base: 0, color: 0 });
    list.sort(function (a, b) { return a.y - b.y; });
    this.swingers = list;
  };

  Splash.prototype.draw = function () {
    if (!this.inSight) return;
    var ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    var imgs = root.Town && root.Town.images;
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < this.swingers.length; i++) {
      var s = this.swingers[i];
      var dx = this.mouse.x - s.x;
      var dy = this.mouse.y - s.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      s.swing += 0.05;
      if (dist < 280) s.swing += 0.3 * (280 - dist) / 280;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.translate(0, 20);
      ctx.rotate(s.base + Math.sin(s.swing) * Math.PI * 0.05);
      ctx.translate(0, -20);
      var img = null;
      if (imgs) {
        if (s.color === 2) img = imgs.yayPentagon;
        else if (this.happy) img = s.color ? imgs.yayTriangle : imgs.yaySquare;
        else img = s.color ? imgs.mehTriangle : imgs.mehSquare;
      }
      if (img && img.width) ctx.drawImage(img, -30, -30, 60, 60);
      else {
        ctx.fillStyle = s.color === 0 ? '#567dff' : (s.color === 2 ? '#7d56ff' : '#f5c318');
        ctx.strokeStyle = '#3d2b1f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        if (s.color === 1) {
          ctx.moveTo(0, -22); ctx.lineTo(20, 18); ctx.lineTo(-20, 18);
        } else {
          ctx.rect(-18, -18, 36, 36);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  root.Splash = Splash;
})(window);
