/*
 * Hextris — thumb buttons.
 *
 * Upstream already rotates on a tap of the left or right half. Same idea,
 * visible: LEFT / RIGHT / FAST sit under the thumbs and write the same
 * rotate / rush the keyboard does, so the vendored hex never learns it
 * is being flown by a finger.
 *
 * Revealed at boot on a phone (coarse pointer, or a narrow touch screen).
 * A laptop with a touchscreen must not get the overlay until a finger
 * actually lands.
 */
(function (root) {
  'use strict';

  var active = false;
  var held = {};

  function phoneish() {
    return root.HT && HT.phoneish ? HT.phoneish() : false;
  }

  function init() {
    var wrap = document.getElementById('touch');
    if (!wrap) return { isTouch: function () { return active; } };

    var reveal = function () {
      if (active) return;
      active = true;
      document.body.classList.add('touch');
      wrap.hidden = false;
      removeEventListener('touchstart', reveal);
    };
    if (phoneish()) reveal();
    else addEventListener('touchstart', reveal, { passive: true });

    var btns = wrap.querySelectorAll('[data-act]');
    for (var i = 0; i < btns.length; i++) bind(btns[i]);

    wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    return { isTouch: function () { return active; } };
  }

  function act(name, on) {
    if (!root.MainHex) return;
    if (name === 'left') {
      if (on) MainHex.rotate(1);
    } else if (name === 'right') {
      if (on) MainHex.rotate(-1);
    } else if (name === 'fast') {
      if (typeof holdRush === 'function') holdRush(!!on);
    }
  }

  function bind(node) {
    var name = node.getAttribute('data-act');
    var set = function (on) {
      held[name] = on;
      if (on) node.classList.add('on');
      else node.classList.remove('on');
      act(name, on);
    };
    var down = function (e) {
      e.preventDefault();
      e.stopPropagation();
      try { node.setPointerCapture(e.pointerId); } catch (err) {}
      set(true);
    };
    var up = function (e) {
      e.preventDefault();
      set(false);
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('lostpointercapture', function () { set(false); });
  }

  root.Touch = { init: init };
})(window);
