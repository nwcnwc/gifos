/*
 * Underrun — twin-stick for a phone.
 *
 * Upstream is WASD + mouse. On a phone it renders and you cannot move or aim.
 * Left pad is walk, right pad is aim and fires while the stick is held out.
 *
 * Shown only after a real touchstart, and only once the corridor is up. A
 * laptop with a touchscreen must not get a phone HUD over WASD.
 */
(function (root) {
  'use strict';

  var DEAD = 0.18;
  var FIRE_AT = 0.32;

  var el = {};
  var finger = false;
  var shown = false;
  var playing = false;
  var move = { id: null, x: 0, y: 0 };
  var aim = { id: null, x: 0, y: 0, on: 0 };

  function capture(node, id) { try { node.setPointerCapture(id); } catch (e) {} }

  function stickFrom(node, e) {
    var r = node.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var dx = e.clientX - cx, dy = e.clientY - cy;
    var max = Math.max(24, r.width * 0.42);
    var mag = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = dx / mag, ny = dy / mag, k = Math.min(1, mag / max);
    return { x: nx * k, y: ny * k, k: k };
  }

  function setKnob(node, x, y) {
    var knob = node.querySelector('.t-knob');
    if (!knob) return;
    knob.style.transform = 'translate(' + (x * 38) + 'px,' + (y * 38) + 'px)';
  }

  function show(on) {
    shown = !!on;
    if (el.wrap) el.wrap.hidden = !shown;
    if (shown) document.body.classList.add('touch');
  }

  function bindStick(node, which) {
    node.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      e.stopPropagation();
      capture(node, e.pointerId);
      var s = stickFrom(node, e);
      if (which === 'move') {
        move.id = e.pointerId; move.x = s.x; move.y = s.y;
      } else {
        aim.id = e.pointerId; aim.x = s.x; aim.y = s.y; aim.on = s.k > FIRE_AT ? 1 : 0;
      }
      setKnob(node, s.x, s.y);
    });
    node.addEventListener('pointermove', function (e) {
      var hold = which === 'move' ? move : aim;
      if (hold.id !== e.pointerId) return;
      e.preventDefault();
      var s = stickFrom(node, e);
      hold.x = s.x; hold.y = s.y;
      if (which === 'aim') hold.on = s.k > FIRE_AT ? 1 : 0;
      setKnob(node, s.x, s.y);
    });
    function up(e) {
      var hold = which === 'move' ? move : aim;
      if (hold.id !== e.pointerId) return;
      hold.id = null; hold.x = 0; hold.y = 0; hold.on = 0;
      setKnob(node, 0, 0);
    }
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
  }

  function init() {
    el.wrap = document.getElementById('touch');
    el.move = document.getElementById('t-move');
    el.aim = document.getElementById('t-aim');
    if (el.move) bindStick(el.move, 'move');
    if (el.aim) bindStick(el.aim, 'aim');
    addEventListener('touchstart', function () {
      finger = true;
      if (playing) show(true);
    }, { passive: true });
  }

  function setPlay(on) {
    playing = !!on;
    if (playing && finger) show(true);
    else {
      show(false);
      move.id = null; move.x = 0; move.y = 0;
      aim.id = null; aim.x = 0; aim.y = 0; aim.on = 0;
      if (el.move) setKnob(el.move, 0, 0);
      if (el.aim) setKnob(el.aim, 0, 0);
    }
  }

  function axis(v) { return Math.abs(v) < DEAD ? 0 : v; }

  root.Touch = {
    init: init,
    setPlay: setPlay,
    active: function () { return shown; },
    move: function () { return { x: axis(move.x), y: axis(move.y) }; },
    aim: function () { return { x: aim.x, y: aim.y, on: aim.on }; },
    firing: function () { return !!aim.on; }
  };
})(window);
