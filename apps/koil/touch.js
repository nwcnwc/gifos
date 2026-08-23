/*
 * Koil — touch look / move.
 *
 * Upstream has a TODO for mobile controls and never shipped them. Left stick
 * walks (forward/back + strafe), right-side drag turns the view, Throw is a
 * button. Look is a drag (delta), not a turn rate: a stick channel for look
 * feels like stirring soup on glass.
 *
 * Shown only after a real touchstart, so a laptop with a touchscreen keeps
 * the keyboard.
 */
(function (root) {
  'use strict';

  var LOOK_GAIN = 0.0045;
  var active = false;
  var el = {};
  var move = { id: null, x: 0, y: 0 };
  var look = { id: null, lx: 0, ly: 0 };

  function capture(node, id) { try { node.setPointerCapture(id); } catch (e) {} }

  function init() {
    el.wrap = document.getElementById('touch');
    el.move = document.getElementById('t-move');
    el.knob = el.move.querySelector('.t-knob');
    el.look = document.getElementById('t-look');
    el.throw = document.getElementById('t-throw');

    var reveal = function () {
      if (active) return;
      active = true;
      document.body.classList.add('touch');
      el.wrap.hidden = false;
      removeEventListener('touchstart', reveal);
    };
    addEventListener('touchstart', reveal, { passive: true });

    bindStick();
    bindLook();
    bindThrow();
    return { isTouch: function () { return active; } };
  }

  function bindStick() {
    var r = function () { return el.move.getBoundingClientRect(); };
    var set = function (cx, cy) {
      var b = r(), rad = b.width * 0.5;
      var dx = cx - (b.left + rad), dy = cy - (b.top + rad);
      var len = Math.hypot(dx, dy) || 1;
      var k = Math.min(1, len / (rad * 0.85));
      move.x = (dx / len) * k;
      move.y = (dy / len) * k;
      el.knob.style.transform = 'translate(' + (move.x * rad * 0.45) + 'px,' + (move.y * rad * 0.45) + 'px)';
      root.Koil.setAnalog(move.x, move.y);
    };
    var end = function () {
      move.id = null; move.x = 0; move.y = 0;
      el.knob.style.transform = '';
      root.Koil.setAnalog(0, 0);
    };
    el.move.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      move.id = e.pointerId; capture(el.move, e.pointerId); set(e.clientX, e.clientY); e.preventDefault();
    });
    el.move.addEventListener('pointermove', function (e) {
      if (e.pointerId !== move.id) return;
      set(e.clientX, e.clientY); e.preventDefault();
    });
    el.move.addEventListener('pointerup', function (e) { if (e.pointerId === move.id) end(); });
    el.move.addEventListener('pointercancel', function (e) { if (e.pointerId === move.id) end(); });
  }

  function bindLook() {
    el.look.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      look.id = e.pointerId; look.lx = e.clientX; look.ly = e.clientY;
      capture(el.look, e.pointerId); e.preventDefault();
    });
    el.look.addEventListener('pointermove', function (e) {
      if (e.pointerId !== look.id) return;
      var dx = e.clientX - look.lx;
      look.lx = e.clientX; look.ly = e.clientY;
      root.Koil.addLook(dx * LOOK_GAIN);
      e.preventDefault();
    });
    var end = function (e) { if (e.pointerId === look.id) look.id = null; };
    el.look.addEventListener('pointerup', end);
    el.look.addEventListener('pointercancel', end);
  }

  function bindThrow() {
    var fire = function (e) {
      e.preventDefault();
      el.throw.classList.add('on');
      root.Koil.throwNow();
      setTimeout(function () { el.throw.classList.remove('on'); }, 120);
    };
    el.throw.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      fire(e);
    });
  }

  root.Touch = { init: init };
})(window);
