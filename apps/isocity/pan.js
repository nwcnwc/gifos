// Phone pan: a drag moves the map; a tap places a tile.
// Mouse is still click-and-drag paint, like the original. Touch listeners
// here run in capture and stop the vendor's preventDefault-on-every-touch,
// which had locked the city still on a phone.
(function (root) {
  'use strict';

  var SLOP = 16;
  var fg = null;
  var area = null;
  var mode = null;
  var t0 = null;

  function pt(e) {
    var t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (t) return { x: t.clientX, y: t.clientY };
    return { x: e.clientX, y: e.clientY };
  }

  function onStart(e) {
    if (!e.touches) return;
    e.stopPropagation();
    e.preventDefault();
    var p = pt(e);
    t0 = { x: p.x, y: p.y, sl: area.scrollLeft, st: area.scrollTop };
    mode = e.touches.length > 1 ? 'pan' : null;
  }

  function onMove(e) {
    if (!e.touches) return;
    e.stopPropagation();
    e.preventDefault();
    if (!t0 || !area) return;
    var p = pt(e);
    var dx = p.x - t0.x, dy = p.y - t0.y;
    if (e.touches.length > 1) mode = 'pan';
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
    if (was === 'pan' || !start || !fg) return;
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

  function boot() {
    fg = document.getElementById('fg');
    area = document.getElementById('area');
    if (!fg || !area) return;
    fg.addEventListener('touchstart', onStart, { capture: true, passive: false });
    fg.addEventListener('touchmove', onMove, { capture: true, passive: false });
    fg.addEventListener('touchend', onEnd, { capture: true, passive: false });
    fg.addEventListener('touchcancel', onEnd, { capture: true, passive: false });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
