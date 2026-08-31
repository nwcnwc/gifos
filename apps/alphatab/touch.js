/* Phone: the score still scrolls. Play is a thumb-sized control in #player.
 * A two-finger pinch on the viewport zooms. */
(function (root) {
  'use strict';

  function bind(viewport, hooks) {
    var pointers = {};
    var pinch0 = 0, zoom0 = 1, pinching = false;

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

    viewport.addEventListener('pointerdown', function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (count() >= 2) {
        pinching = true;
        pinch0 = pair();
        zoom0 = (hooks && hooks.zoom) ? hooks.zoom() : 1;
      }
    });
    viewport.addEventListener('pointermove', function (e) {
      if (pointers[e.pointerId]) pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (pinching && count() >= 2 && pinch0 > 8 && hooks && hooks.onPinch) {
        hooks.onPinch(zoom0 * (pair() / pinch0));
      }
    });
    function end(e) {
      delete pointers[e.pointerId];
      if (count() < 2) pinching = false;
    }
    viewport.addEventListener('pointerup', end);
    viewport.addEventListener('pointercancel', end);
  }

  function isPhone() {
    return window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
  }

  root.AtTouch = { bind: bind, isPhone: isPhone };
})(typeof window !== 'undefined' ? window : this);
