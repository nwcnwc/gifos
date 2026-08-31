/* Phone: swipe turns the page. Mouse is left to the scroller and to click-to-point. */
(function (root) {
  'use strict';

  function bind(stage, viewer, hooks) {
    var startX = 0, startY = 0, startT = 0, tracking = false;
    var pointers = {};

    function count() {
      var n = 0;
      for (var k in pointers) if (pointers[k]) n++;
      return n;
    }

    stage.addEventListener('pointerdown', function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (count() >= 2) {
        tracking = false;
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
    });

    function end(e) {
      var had = !!pointers[e.pointerId];
      delete pointers[e.pointerId];
      if (count() >= 1) {
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

  root.EpubTouch = { bind: bind };
})(typeof window !== 'undefined' ? window : this);
