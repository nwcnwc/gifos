/* Phone: swipe turns the page; pinch zooms. Mouse is left to the scroller
 * and to click-to-point. */
(function (root) {
  'use strict';

  function bind(stage, viewer, hooks) {
    var startX = 0, startY = 0, startT = 0, tracking = false;
    var pinch0 = 0, scale0 = 1, pinching = false;
    var pointers = {};

    function count() {
      var n = 0;
      for (var k in pointers) if (pointers[k]) n++;
      return n;
    }
    function pair() {
      var a = null, b = null;
      for (var k in pointers) {
        if (!pointers[k]) continue;
        if (!a) a = pointers[k];
        else if (!b) b = pointers[k];
      }
      return (a && b) ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    }

    stage.addEventListener('pointerdown', function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (count() >= 2) {
        pinching = true;
        tracking = false;
        pinch0 = pair();
        scale0 = viewer.scale || 1;
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      startX = e.clientX;
      startY = e.clientY;
      startT = Date.now();
      tracking = true;
    });

    stage.addEventListener('pointermove', function (e) {
      if (pointers[e.pointerId]) pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (pinching && count() >= 2 && pinch0 > 8) {
        var d = pair();
        var factor = d / pinch0;
        viewer.fit = 'fixed';
        viewer.scale = Math.max(0.25, Math.min(4, scale0 * factor));
        if (hooks && hooks.onPinch) hooks.onPinch();
        return;
      }
      if (!tracking) return;
    });

    function end(e) {
      var had = !!pointers[e.pointerId];
      delete pointers[e.pointerId];
      if (pinching) {
        if (count() < 2) {
          pinching = false;
          if (hooks && hooks.onZoom) hooks.onZoom();
        }
        tracking = false;
        return;
      }
      if (!tracking || !had) return;
      tracking = false;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      var dt = Date.now() - startT;
      if (dt > 700) return;
      if (Math.abs(dx) < 60) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) return;
      if (hooks && hooks.onSwipe) hooks.onSwipe(dx < 0 ? 1 : -1);
    }

    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    stage.addEventListener('lostpointercapture', end);
  }

  root.PdfTouch = { bind: bind };
})(typeof window !== 'undefined' ? window : this);
