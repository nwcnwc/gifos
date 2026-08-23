/*
 * Falling Blocks — swipe + a d-pad.
 *
 * Upstream is keys only. The pad writes the same keyPress() the keyboard
 * does, so the vendored well never learns it is being played by a thumb.
 * Revealed on the first real touchstart. A laptop with a touchscreen must
 * not get the overlay until a finger actually lands.
 */
(function (root) {
  'use strict';

  var active = false;
  var swipe = null;
  var holdTimer = 0;
  var holdAct = '';

  function press(act) {
    if (typeof keyPress !== 'function') return;
    if (act === 'left' || act === 'right' || act === 'down' || act === 'rotate' || act === 'drop') {
      keyPress(act);
    }
  }

  function stopHold() {
    if (holdTimer) { clearInterval(holdTimer); holdTimer = 0; }
    holdAct = '';
    var on = document.querySelectorAll('#pad button.on');
    for (var i = 0; i < on.length; i++) on[i].classList.remove('on');
  }

  function startHold(act, node) {
    stopHold();
    holdAct = act;
    if (node) node.classList.add('on');
    press(act);
    if (act === 'rotate' || act === 'drop') return;
    holdTimer = setInterval(function () { press(act); }, 110);
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

    var btns = wrap.querySelectorAll('[data-act]');
    for (var i = 0; i < btns.length; i++) bind(btns[i]);
    wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    board.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType === 'touch' || ev.pointerType === 'pen') reveal();
      swipe = { x: ev.clientX, y: ev.clientY, id: ev.pointerId, moved: 0 };
      try { board.setPointerCapture(ev.pointerId); } catch (e) {}
    });
    board.addEventListener('pointermove', function (ev) {
      if (!swipe || swipe.id !== ev.pointerId) return;
      var dx = ev.clientX - swipe.x;
      var step = 36;
      while (dx - swipe.moved >= step) { press('right'); swipe.moved += step; }
      while (dx - swipe.moved <= -step) { press('left'); swipe.moved -= step; }
    });
    board.addEventListener('pointerup', function (ev) {
      if (!swipe || swipe.id !== ev.pointerId) return;
      var dx = ev.clientX - swipe.x, dy = ev.clientY - swipe.y;
      var moved = swipe.moved;
      swipe = null;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24 && !moved) {
        press('rotate');
        return;
      }
      if (Math.abs(dy) > Math.abs(dx) && !moved) {
        if (dy > 80) press('drop');
        else if (dy > 24) press('down');
        else if (dy < -24) press('rotate');
      }
    });
    board.addEventListener('pointercancel', function () { swipe = null; });
  }

  function bind(node) {
    var act = node.getAttribute('data-act');
    var down = function (e) {
      e.preventDefault();
      try { node.setPointerCapture(e.pointerId); } catch (err) {}
      startHold(act, node);
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
