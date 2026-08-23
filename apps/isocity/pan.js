// Phone pan + pinch-zoom. A drag moves the map; a tap places a tile;
// two fingers (or Ctrl/⌘ + wheel on a computer) scale the view.
// Mouse is still click-and-drag paint, like the original.
(function (root) {
  'use strict';

  var SLOP = 16;
  var fg = null, bg = null, area = null, stage = null;
  var mode = null;
  var t0 = null;
  var scale = 1;
  var pinch0 = null;

  function pt(e) {
    var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (t) return { x: t.clientX, y: t.clientY };
    return { x: e.clientX, y: e.clientY };
  }
  function canvasW() { return (fg && fg.width) || 910; }
  function canvasH() { return (fg && fg.height) || 666; }
  function minScale() {
    if (!area) return 0.2;
    var aw = Math.max(1, area.clientWidth);
    var ah = Math.max(1, area.clientHeight);
    return Math.min(aw / canvasW(), ah / canvasH(), 1);
  }
  function maxScale() { return Math.max(2.6, minScale() * 5); }
  function clampScale(s) {
    var lo = minScale(), hi = maxScale();
    if (s < lo) s = lo;
    if (s > hi) s = hi;
    return s;
  }
  function applySize() {
    if (!fg || !bg || !stage) return;
    var w = Math.round(canvasW() * scale);
    var h = Math.round(canvasH() * scale);
    fg.style.width = bg.style.width = w + 'px';
    fg.style.height = bg.style.height = h + 'px';
    stage.style.width = w + 'px';
    stage.style.height = h + 'px';
  }
  function zoomTo(next, cx, cy) {
    if (!area || !stage) return;
    next = clampScale(next);
    var rect = area.getBoundingClientRect();
    var ax = (cx - rect.left) + area.scrollLeft;
    var ay = (cy - rect.top) + area.scrollTop;
    var fracX = ax / Math.max(1, stage.offsetWidth);
    var fracY = ay / Math.max(1, stage.offsetHeight);
    scale = next;
    applySize();
    area.scrollLeft = fracX * stage.offsetWidth - (cx - rect.left);
    area.scrollTop = fracY * stage.offsetHeight - (cy - rect.top);
  }
  function fit(center) {
    scale = minScale();
    applySize();
    if (center && area && stage) {
      area.scrollLeft = Math.max(0, (stage.offsetWidth - area.clientWidth) / 2);
      area.scrollTop = Math.max(0, (stage.offsetHeight - area.clientHeight) / 2);
    }
  }
  function dist(e) {
    if (!e.touches || e.touches.length < 2) return 0;
    var a = e.touches[0], b = e.touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }
  function mid(e) {
    var a = e.touches[0], b = e.touches[1];
    return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
  }

  function onStart(e) {
    if (!e.touches) return;
    e.stopPropagation();
    e.preventDefault();
    if (e.touches.length >= 2) {
      mode = 'pinch';
      var m = mid(e);
      pinch0 = { d: dist(e), s: scale, x: m.x, y: m.y };
      t0 = null;
      return;
    }
    var p = pt(e);
    t0 = { x: p.x, y: p.y, sl: area.scrollLeft, st: area.scrollTop };
    mode = null;
    pinch0 = null;
  }

  function onMove(e) {
    if (!e.touches) return;
    e.stopPropagation();
    e.preventDefault();
    if (e.touches.length >= 2) {
      if (!pinch0 || mode !== 'pinch') {
        mode = 'pinch';
        var m = mid(e);
        pinch0 = { d: dist(e), s: scale, x: m.x, y: m.y };
      }
      var m2 = mid(e);
      var d = dist(e);
      if (pinch0.d > 8) zoomTo(pinch0.s * (d / pinch0.d), m2.x, m2.y);
      return;
    }
    if (mode === 'pinch') return;
    if (!t0 || !area) return;
    var p = pt(e);
    var dx = p.x - t0.x, dy = p.y - t0.y;
    if (!mode && Math.hypot(dx, dy) > SLOP) mode = 'pan';
    if (mode === 'pan') {
      area.scrollLeft = t0.sl - dx;
      area.scrollTop = t0.st - dy;
    }
  }

  function onEnd(e) {
    if (!e.changedTouches) return;
    e.stopPropagation();
    e.preventDefault();
    var was = mode;
    var start = t0;
    mode = null;
    t0 = null;
    pinch0 = null;
    if (was === 'pan' || was === 'pinch' || !start || !fg) return;
    var t = e.changedTouches[0];
    if (!t) return;
    if (Math.hypot(t.clientX - start.x, t.clientY - start.y) > SLOP) return;
    var opts = {
      bubbles: true,
      cancelable: true,
      view: root,
      clientX: t.clientX,
      clientY: t.clientY,
      button: 0
    };
    fg.dispatchEvent(new MouseEvent('mousedown', opts));
    fg.dispatchEvent(new MouseEvent('mouseup', opts));
  }

  function onWheel(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    var factor = e.deltaY > 0 ? 0.9 : 1.11;
    zoomTo(scale * factor, e.clientX, e.clientY);
  }

  function boot() {
    fg = document.getElementById('fg');
    bg = document.getElementById('bg');
    area = document.getElementById('area');
    stage = document.getElementById('stage');
    if (!fg || !area) return;
    fg.addEventListener('touchstart', onStart, { capture: true, passive: false });
    fg.addEventListener('touchmove', onMove, { capture: true, passive: false });
    fg.addEventListener('touchend', onEnd, { capture: true, passive: false });
    fg.addEventListener('touchcancel', onEnd, { capture: true, passive: false });
    area.addEventListener('wheel', onWheel, { passive: false });
    fit(true);
  }

  root.IsoCity = root.IsoCity || {};
  root.IsoCity.fitView = function () { fit(true); };
  root.IsoCity.layoutView = function () {
    scale = clampScale(scale);
    applySize();
  };
  root.IsoCity.viewScale = function () { return scale; };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
