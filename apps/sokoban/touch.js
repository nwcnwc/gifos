/*
 * Sokoban — swipe + a d-pad.
 *
 * The pad writes the same SKGame.move() the keyboard does. Revealed on the
 * first real touchstart. A laptop with a touchscreen must not get the overlay
 * until a finger actually lands.
 */
(function (root) {
  'use strict';

  var active = false;
  var swipe = null;
  var holdTimer = 0;
  var holdDx = 0;
  var holdDy = 0;

  function press(dx, dy) {
    if (root.SKGame && root.SKGame.move) root.SKGame.move(dx, dy);
  }

  function stopHold() {
    if (holdTimer) { clearInterval(holdTimer); holdTimer = 0; }
    holdDx = 0;
    holdDy = 0;
    var on = document.querySelectorAll('#pad button.on');
    for (var i = 0; i < on.length; i++) on[i].classList.remove('on');
  }

  function startHold(dx, dy, node) {
    stopHold();
    holdDx = dx;
    holdDy = dy;
    if (node) node.classList.add('on');
    press(dx, dy);
    holdTimer = setInterval(function () { press(holdDx, holdDy); }, 140);
  }

  function init() {
    var wrap = document.getElementById('pad');
    var board = document.getElementById('board');
    if (!wrap || !board) return;

    var reveal = function () {
      if (active) return;
      active = true;
      document.body.classList.add('touch');
      wrap.hidden = false;
      removeEventListener('touchstart', reveal);
    };
    addEventListener('touchstart', reveal, { passive: true });

    var btns = wrap.querySelectorAll('[data-dx]');
    for (var i = 0; i < btns.length; i++) bind(btns[i]);
    wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    board.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType === 'touch' || ev.pointerType === 'pen') reveal();
      swipe = { x: ev.clientX, y: ev.clientY, id: ev.pointerId, moved: 0, axis: '' };
      try { board.setPointerCapture(ev.pointerId); } catch (e) {}
    });
    board.addEventListener('pointermove', function (ev) {
      if (!swipe || swipe.id !== ev.pointerId) return;
      var dx = ev.clientX - swipe.x, dy = ev.clientY - swipe.y;
      if (!swipe.axis) {
        if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
        swipe.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      }
      var step = 36;
      if (swipe.axis === 'x') {
        while (dx - swipe.moved >= step) { press(1, 0); swipe.moved += step; }
        while (dx - swipe.moved <= -step) { press(-1, 0); swipe.moved -= step; }
      } else {
        while (dy - swipe.moved >= step) { press(0, 1); swipe.moved += step; }
        while (dy - swipe.moved <= -step) { press(0, -1); swipe.moved -= step; }
      }
    });
    board.addEventListener('pointerup', function () { swipe = null; });
    board.addEventListener('pointercancel', function () { swipe = null; });
  }

  function bind(node) {
    var dx = parseInt(node.getAttribute('data-dx'), 10) || 0;
    var dy = parseInt(node.getAttribute('data-dy'), 10) || 0;
    var down = function (e) {
      e.preventDefault();
      try { node.setPointerCapture(e.pointerId); } catch (err) {}
      startHold(dx, dy, node);
    };
    var up = function (e) {
      e.preventDefault();
      stopHold();
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('lostpointercapture', function () { stopHold(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
