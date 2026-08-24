/*
 * Backdooms — analog stick + look drag + FIRE.
 * Writes into Backdooms.keys() the same way a keyboard would.
 */
(function (root) {
  'use strict';

  var active = false;
  var el = {};
  var move = { id: null };
  var look = { id: null, lx: 0, ly: 0 };
  var DEAD = 0.16;

  function capture(node, id) { try { node.setPointerCapture(id); } catch (e) {} }

  function init() {
    el.wrap = document.getElementById('touch');
    el.move = document.getElementById('t-move');
    el.knob = el.move.querySelector('.t-knob');
    el.look = document.getElementById('t-look');
    el.fire = document.getElementById('t-fire');
    addEventListener('touchstart', function reveal() {
      arm();
      removeEventListener('touchstart', reveal);
    }, { passive: true });
    bindStick();
    bindLook();
    bindFire();
    return { arm: arm, isTouch: function () { return active; } };
  }

  function arm() {
    if (active) return;
    active = true;
    document.body.classList.add('phone');
    el.wrap.hidden = false;
  }

  function bindStick() {
    el.move.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      move.id = ev.pointerId;
      capture(el.move, ev.pointerId);
      stick(ev);
    });
    el.move.addEventListener('pointermove', function (ev) {
      if (ev.pointerId !== move.id) return;
      ev.preventDefault();
      stick(ev);
    });
    function up(ev) {
      if (ev.pointerId !== move.id) return;
      move.id = null;
      var k = root.Backdooms.keys();
      k._jx = 0; k._jy = 0;
      el.knob.style.transform = 'translate(-50%,-50%)';
    }
    el.move.addEventListener('pointerup', up);
    el.move.addEventListener('pointercancel', up);
  }

  function stick(ev) {
    var r = el.move.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var dx = ev.clientX - cx, dy = ev.clientY - cy;
    var max = r.width * 0.38;
    var d = Math.hypot(dx, dy) || 1;
    if (d > max) { dx *= max / d; dy *= max / d; }
    el.knob.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
    var jx = dx / max, jy = dy / max;
    var k = root.Backdooms.keys();
    k._jx = Math.abs(jx) < DEAD ? 0 : jx;
    k._jy = Math.abs(jy) < DEAD ? 0 : jy;
  }

  function bindLook() {
    el.look.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      look.id = ev.pointerId;
      look.lx = ev.clientX; look.ly = ev.clientY;
      capture(el.look, ev.pointerId);
    });
    el.look.addEventListener('pointermove', function (ev) {
      if (ev.pointerId !== look.id) return;
      ev.preventDefault();
      var dx = ev.clientX - look.lx;
      look.lx = ev.clientX; look.ly = ev.clientY;
      root.Backdooms.look(dx * 4);
    });
    function up(ev) {
      if (ev.pointerId !== look.id) return;
      look.id = null;
    }
    el.look.addEventListener('pointerup', up);
    el.look.addEventListener('pointercancel', up);
  }

  function bindFire() {
    function fire(ev) {
      ev.preventDefault();
      root.Backdooms.shoot();
    }
    el.fire.addEventListener('pointerdown', fire);
  }

  root.Touch = { init: init, arm: arm };
})(window);
