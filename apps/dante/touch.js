/*
 * Dante — a LEVER button for a thumb.
 *
 * Upstream already walks and looks from the canvas (left half walks,
 * right half looks in first person, a tap pulls a lever). That is why
 * it won mobile. This only adds a visible LEVER control, writing the
 * same KeyE the keyboard already feeds, so the vendored game never
 * learns it is being flown by a thumb.
 *
 * Shown only after a real touchstart. A laptop with a touchscreen must
 * not get a phone HUD laid over its game.
 */
(function (root) {
  'use strict';

  var active = false;

  function fireKey(down) {
    var type = down ? 'keydown' : 'keyup';
    var ev = new KeyboardEvent(type, { code: 'KeyE', key: 'e', bubbles: true });
    root.dispatchEvent(ev);
  }

  function init() {
    var wrap = document.getElementById('touch');
    var btn = document.getElementById('t-act');
    if (!wrap || !btn) return { isTouch: function () { return active; } };

    var reveal = function () {
      if (active) return;
      active = true;
      document.body.classList.add('touch');
      wrap.hidden = false;
      removeEventListener('touchstart', reveal);
    };
    addEventListener('touchstart', reveal, { passive: true });

    var down = function (e) {
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch (err) {}
      btn.classList.add('on');
      fireKey(true);
    };
    var up = function (e) {
      e.preventDefault();
      btn.classList.remove('on');
      fireKey(false);
    };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', function () {
      btn.classList.remove('on');
      fireKey(false);
    });
    wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    return { isTouch: function () { return active; } };
  }

  root.Touch = { init: init };
})(window);
