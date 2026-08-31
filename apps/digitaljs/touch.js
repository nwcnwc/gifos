/*
 * Pan / pinch / wheel the bench. Buttons on the schematic keep their own
 * clicks; we only drag the empty paper.
 */
(function (root) {
  'use strict';

  var pan = { x: 16, y: 16, s: 1 };
  var drag = null;
  var pinch = null;
  var paperEl = null;
  var benchEl = null;

  function apply() {
    if (!paperEl) return;
    paperEl.style.transform = 'translate(' + pan.x + 'px,' + pan.y + 'px) scale(' + pan.s + ')';
  }

  function clampScale(s) {
    if (s < 0.25) return 0.25;
    if (s > 3) return 3;
    return s;
  }

  function zoomAt(cx, cy, next) {
    next = clampScale(next);
    var wx = (cx - pan.x) / pan.s;
    var wy = (cy - pan.y) / pan.s;
    pan.s = next;
    pan.x = cx - wx * pan.s;
    pan.y = cy - wy * pan.s;
    apply();
  }

  function localPoint(e) {
    var r = benchEl.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function isInteractive(t) {
    if (!t || !t.closest) return false;
    if (t.closest('.btnface, input, select, button, a, .ui-dialog')) return true;
    return false;
  }

  function onDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (isInteractive(e.target)) return;
    if (e.isPrimary === false) {
      if (drag) {
        pinch = {
          id1: drag.id, x1: drag.x, y1: drag.y,
          id2: e.pointerId, x2: e.clientX, y2: e.clientY,
          dist: 0, s0: pan.s, mx: 0, my: 0
        };
        var dx = pinch.x2 - pinch.x1, dy = pinch.y2 - pinch.y1;
        pinch.dist = Math.hypot(dx, dy) || 1;
        var r = benchEl.getBoundingClientRect();
        pinch.mx = (pinch.x1 + pinch.x2) / 2 - r.left;
        pinch.my = (pinch.y1 + pinch.y2) / 2 - r.top;
        drag = null;
      }
      return;
    }
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y };
    try { benchEl.setPointerCapture(e.pointerId); } catch (err) {}
  }

  function onMove(e) {
    if (pinch) {
      if (e.pointerId === pinch.id1) { pinch.x1 = e.clientX; pinch.y1 = e.clientY; }
      else if (e.pointerId === pinch.id2) { pinch.x2 = e.clientX; pinch.y2 = e.clientY; }
      else return;
      var d = Math.hypot(pinch.x2 - pinch.x1, pinch.y2 - pinch.y1) || 1;
      zoomAt(pinch.mx, pinch.my, pinch.s0 * (d / pinch.dist));
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    pan.x = drag.ox + (e.clientX - drag.x);
    pan.y = drag.oy + (e.clientY - drag.y);
    apply();
  }

  function onUp(e) {
    if (pinch && (e.pointerId === pinch.id1 || e.pointerId === pinch.id2)) pinch = null;
    if (drag && e.pointerId === drag.id) drag = null;
  }

  function onWheel(e) {
    e.preventDefault();
    var p = localPoint(e);
    var next = pan.s * (e.deltaY < 0 ? 1.12 : 1 / 1.12);
    zoomAt(p.x, p.y, next);
  }

  function fit() {
    if (!paperEl || !benchEl) return;
    var svg = paperEl.querySelector('svg');
    var g = paperEl.querySelector('.joint-viewport') || (svg && svg.querySelector('g'));
    var bw = benchEl.clientWidth || 640;
    var bh = benchEl.clientHeight || 400;
    var w = 800, h = 480, ox = 0, oy = 0;
    if (g && g.getBBox) {
      try {
        var b = g.getBBox();
        if (b && b.width) { w = b.width; h = b.height; ox = b.x; oy = b.y; }
      } catch (e) {}
    }
    var s = Math.min((bw - 48) / Math.max(w, 1), (bh - 48) / Math.max(h, 1));
    pan.s = clampScale(Math.max(0.4, Math.min(1.6, s)));
    pan.x = (bw - w * pan.s) / 2 - ox * pan.s;
    pan.y = (bh - h * pan.s) / 2 - oy * pan.s;
    apply();
  }

  function init() {
    paperEl = document.getElementById('paper');
    benchEl = document.getElementById('bench');
    if (!benchEl) return;
    benchEl.addEventListener('pointerdown', onDown);
    benchEl.addEventListener('pointermove', onMove);
    benchEl.addEventListener('pointerup', onUp);
    benchEl.addEventListener('pointercancel', onUp);
    benchEl.addEventListener('wheel', onWheel, { passive: false });
    apply();
  }

  root.DjsTouch = {
    init: init,
    fit: fit,
    zoomIn: function () { zoomAt((benchEl.clientWidth || 640) / 2, (benchEl.clientHeight || 400) / 2, pan.s * 1.2); },
    zoomOut: function () { zoomAt((benchEl.clientWidth || 640) / 2, (benchEl.clientHeight || 400) / 2, pan.s / 1.2); },
    reset: function () { pan.x = 16; pan.y = 16; pan.s = 1; apply(); }
  };
})(typeof window !== 'undefined' ? window : this);
