/*
 * Asteroids — thumb buttons.
 *
 * Original ipad.js only appeared on iPad and mapped THRUST / LEFT / RIGHT /
 * FIRE divs onto KEY_STATUS by element id. Same idea, every phone: the
 * buttons write the same KEY_STATUS the keyboard does, so the vendored
 * ship never learns it is being flown by a thumb.
 *
 * Revealed at boot on a phone (coarse pointer, or a narrow touch screen).
 * A laptop with a touchscreen must not get the overlay until a finger
 * actually lands. Revealing the pad does not start the game — FIRE does,
 * or a tap on the field.
 */
(function (root) {
  'use strict';

  var active = false;
  var held = {};

  function phoneish() {
    var pts = (root.navigator && root.navigator.maxTouchPoints) || 0;
    var coarse = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
    var narrow = Math.min(root.innerWidth || 0, root.innerHeight || 0) <= 520;
    return (pts > 0 && coarse) || (pts > 0 && narrow);
  }

  function init() {
    var wrap = document.getElementById('touch');
    if (!wrap) return { isTouch: function () { return active; } };

    var reveal = function () {
      if (active) return;
      active = true;
      document.body.classList.add('touch');
      wrap.hidden = false;
      if (root.AsteroidsGame) root.AsteroidsGame.touchy = true;
      if (root.SFX) root.SFX.unlock();
      removeEventListener('touchstart', reveal);
    };
    if (phoneish()) reveal();
    else addEventListener('touchstart', reveal, { passive: true });

    var btns = wrap.querySelectorAll('[data-key]');
    for (var i = 0; i < btns.length; i++) bind(btns[i]);

    wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    return { isTouch: function () { return active; } };
  }

  function bind(node) {
    var key = node.getAttribute('data-key');
    var set = function (on) {
      held[key] = on;
      if (root.KEY_STATUS) root.KEY_STATUS[key] = on;
      if (on) node.classList.add('on');
      else node.classList.remove('on');
    };
    var down = function (e) {
      e.preventDefault();
      try { node.setPointerCapture(e.pointerId); } catch (err) {}
      set(true);
      if (key === 'space' && root.AsteroidsGame && root.AsteroidsGame.FSM.state === 'waiting') {
        root.gameStart = true;
      }
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
