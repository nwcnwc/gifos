/*
 * Dual-thumb slider. Upstream doubleslider.js was hard-coded to 400px
 * and used background PNG faces; this one sizes from the element and
 * paints the sad/happy/sad bands in CSS so it fits a phone.
 */
(function (root) {
  'use strict';

  function DualSlider(el, opts) {
    opts = opts || {};
    var self = this;
    this.el = el;
    this.values = opts.values ? opts.values.slice() : [0.33, 1];
    this.lockRight = !!opts.lockRight;
    this.onChange = opts.onChange || function () {};
    this.onLetGo = opts.onLetGo || function () {};
    this.colors = opts.colors || ['#555', '#aaa', '#555'];
    this.drag = -1;

    el.className = (el.className ? el.className + ' ' : '') + 'dslide';
    el.innerHTML = '';
    this.bands = [];
    for (var i = 0; i < 3; i++) {
      var b = document.createElement('div');
      b.className = 'dslide-band';
      b.style.background = this.colors[i];
      el.appendChild(b);
      this.bands.push(b);
    }
    this.thumbs = [];
    for (var t = 0; t < 2; t++) {
      var th = document.createElement('button');
      th.type = 'button';
      th.className = 'dslide-thumb';
      th.setAttribute('aria-label', t === 0 ? 'lower threshold' : 'upper threshold');
      el.appendChild(th);
      this.thumbs.push(th);
      (function (idx) {
        th.addEventListener('pointerdown', function (ev) {
          if (self.lockRight && idx === 1) return;
          self.drag = idx;
          try { th.setPointerCapture(ev.pointerId); } catch (e) {}
          ev.preventDefault();
        });
      })(t);
    }
    if (this.lockRight) this.thumbs[1].classList.add('locked');

    function posOf(ev) {
      var r = el.getBoundingClientRect();
      var x = (ev.clientX - r.left) / r.width;
      if (x < 0) x = 0;
      if (x > 1) x = 1;
      return x;
    }
    el.addEventListener('pointermove', function (ev) {
      if (self.drag < 0) return;
      var v = posOf(ev);
      if (self.drag === 0) {
        if (v > self.values[1]) v = self.values[1];
      } else {
        if (v < self.values[0]) v = self.values[0];
      }
      self.values[self.drag] = v;
      self.paint();
      self.onChange(self.values[0], self.values[1]);
    });
    function up() {
      if (self.drag < 0) return;
      self.drag = -1;
      self.onLetGo(self.values[0], self.values[1]);
    }
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);

    this.paint();
    this.onChange(this.values[0], this.values[1]);
  }

  DualSlider.prototype.set = function (a, b) {
    if (a != null) this.values[0] = a;
    if (b != null) this.values[1] = b;
    this.paint();
  };

  DualSlider.prototype.paint = function () {
    var a = this.values[0] * 100, b = this.values[1] * 100;
    this.bands[0].style.width = a + '%';
    this.bands[1].style.left = a + '%';
    this.bands[1].style.width = (b - a) + '%';
    this.bands[2].style.left = b + '%';
    this.bands[2].style.width = (100 - b) + '%';
    this.thumbs[0].style.left = a + '%';
    this.thumbs[1].style.left = b + '%';
  };

  root.DualSlider = DualSlider;
})(window);
