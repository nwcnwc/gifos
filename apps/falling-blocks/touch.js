/*
 * Falling Blocks — swipe + a full-width pad.
 *
 * Upstream is keys only. The pad writes the same keyPress() the keyboard
 * does, through FB.inputDown / inputUp, so DAS/ARR is one path. Revealed
 * on the first real touchstart. A laptop with a touchscreen must not get
 * the overlay until a finger actually lands.
 */
(function (root) {
  'use strict';

  var active = false;
  var swipe = null;

  function press(act) {
    if (root.FB && root.FB.inputDown) root.FB.inputDown(act);
    else if (typeof keyPress === 'function') keyPress(act);
  }
  function release(act) {
    if (root.FB && root.FB.inputUp) root.FB.inputUp(act);
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
      var cell = Math.max(22, board.getBoundingClientRect().width / 10);
      while (dx - swipe.moved >= cell) { press('right'); release('right'); swipe.moved += cell; }
      while (dx - swipe.moved <= -cell) { press('left'); release('left'); swipe.moved -= cell; }
    });
    board.addEventListener('pointerup', function (ev) {
      if (!swipe || swipe.id !== ev.pointerId) return;
      var dx = ev.clientX - swipe.x, dy = ev.clientY - swipe.y;
      var moved = swipe.moved;
      swipe = null;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24 && !moved) {
        press('rotate');
        release('rotate');
        return;
      }
      if (Math.abs(dy) > Math.abs(dx) && !moved) {
        if (dy > 80) { press('drop'); release('drop'); }
        else if (dy > 24) { press('down'); release('down'); }
        else if (dy < -24) { press('rotate'); release('rotate'); }
      }
    });
    board.addEventListener('pointercancel', function () { swipe = null; });
  }

  function bind(node) {
    var act = node.getAttribute('data-act');
    var down = function (e) {
      e.preventDefault();
      try { node.setPointerCapture(e.pointerId); } catch (err) {}
      node.classList.add('on');
      press(act);
    };
    var up = function (e) {
      e.preventDefault();
      node.classList.remove('on');
      release(act);
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('lostpointercapture', function () {
      node.classList.remove('on');
      release(act);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
