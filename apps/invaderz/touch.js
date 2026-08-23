/*
 * InvaderZ — thumb buttons.
 *
 * Original main.js always drew LEFT / FIRE / RIGHT under the canvas. Same
 * idea, every phone: the buttons write the same isMovingLeft / isMovingRight
 * / shoot() the keyboard does, so the vendored Player never learns it is
 * being flown by a thumb.
 *
 * Revealed on the first real touchstart. A laptop with a touchscreen must
 * not get the overlay until a finger actually lands.
 */
(function (root) {
  'use strict';

  var active = false;

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
    addEventListener('touchstart', reveal, { passive: true });

    var btns = wrap.querySelectorAll('[data-key]');
    for (var i = 0; i < btns.length; i++) bind(btns[i]);

    wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    return { isTouch: function () { return active; } };
  }

  function bind(node) {
    var key = node.getAttribute('data-key');
    var set = function (on) {
      if (on) node.classList.add('on');
      else node.classList.remove('on');
      if (!player) return;
      if (key === 'left') player.isMovingLeft = on;
      else if (key === 'right') player.isMovingRight = on;
    };
    var down = function (e) {
      e.preventDefault();
      try { node.setPointerCapture(e.pointerId); } catch (err) {}
      if (key === 'space') {
        var G = root.InvaderZ;
        if (G && G.over) G.restart();
        else if (player) player.shoot();
        node.classList.add('on');
        return;
      }
      set(true);
    };
    var up = function (e) {
      e.preventDefault();
      if (key === 'space') {
        node.classList.remove('on');
        return;
      }
      set(false);
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('lostpointercapture', function () {
      if (key === 'space') node.classList.remove('on');
      else set(false);
    });
  }

  root.Touch = { init: init };
})(window);
