/*
 * Q1K3 — touch look / move.
 *
 * Upstream is keyboard and a pointer-locked mouse. On a phone it renders
 * and you cannot aim. This writes into the same keys[] / mouse_x / mouse_y
 * the original input.js already feeds the player, so the vendored game
 * never learns it is being flown by a thumb.
 *
 * Move is a stick (rate, analog 0–1 — keys[] is used as a number, not a
 * boolean, so a half-tilt walks slower). Look is a drag (delta) — a stick
 * channel for look feels like stirring soup on glass.
 *
 * Shown after a real touchstart, or armed by boot on a coarse pointer so
 * a Playwright tap-to-start still gets a HUD.
 */
(function (root) {
  'use strict';

  var LOOK_GAIN = 5.6;
  var TAP_MS = 220;
  var TAP_SLOP = 14;
  var MAX_RADII = 3;
  var DEAD = 0.16;

  var active = false;
  var el = {};
  var move = { id: null, x: 0, y: 0 };
  var look = { id: null, lx: 0, ly: 0, t0: 0, moved: 0 };
  var fireHeld = false, jumpHeld = false;

  function capture(node, id) { try { node.setPointerCapture(id); } catch (e) {} }

  function init() {
    el.wrap = document.getElementById('touch');
    el.move = document.getElementById('t-move');
    el.knob = el.move.querySelector('.t-knob');
    el.look = document.getElementById('t-look');
    el.fire = document.getElementById('t-fire');
    el.jump = document.getElementById('t-jump');
    el.gun = document.getElementById('t-gun');

    var reveal = function () {
      arm();
      removeEventListener('touchstart', reveal);
    };
    addEventListener('touchstart', reveal, { passive: true });

    wrapPointerLock();
    bindStick();
    bindLook();
    bindButtons();
    return { isTouch: function () { return active; }, tick: tick, arm: arm };
  }

  function arm() {
    if (active) return;
    active = true;
    document.body.classList.add('touch');
    el.wrap.hidden = false;
    shedLock();
  }

  function shedLock() {
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) {}
  }

  function wrapPointerLock() {
    var c = document.getElementById('c');
    if (!c || !c.requestPointerLock) return;
    var orig = c.requestPointerLock.bind(c);
    c.requestPointerLock = function () {
      if (active) return;
      return orig();
    };
    document.addEventListener('pointerlockchange', function () {
      if (active) shedLock();
    });
  }

  function bindStick() {
    el.move.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      if (move.id !== null) return;
      move.id = e.pointerId;
      capture(el.move, e.pointerId);
      track(e);
      e.preventDefault();
    });
    el.move.addEventListener('pointermove', function (e) {
      if (e.pointerId !== move.id) return;
      track(e);
      e.preventDefault();
    });
    var end = function (e) {
      if (e.pointerId !== move.id) return;
      move.id = null; move.x = 0; move.y = 0;
      el.knob.style.transform = '';
      applyMove();
    };
    el.move.addEventListener('pointerup', end);
    el.move.addEventListener('pointercancel', end);
  }

  function track(e) {
    var r = el.move.getBoundingClientRect();
    var rad = r.width / 2;
    if (!rad) return;
    var dx = e.clientX - (r.left + rad), dy = e.clientY - (r.top + rad);
    var len = Math.hypot(dx, dy) || 1;
    if (len > rad * MAX_RADII) return;
    var clamped = Math.min(len, rad) / rad;
    move.x = (dx / len) * clamped;
    move.y = (dy / len) * clamped;
    el.knob.style.transform = 'translate(' + (move.x * rad * 0.62).toFixed(1) + 'px,' +
                              (move.y * rad * 0.62).toFixed(1) + 'px)';
    applyMove();
  }

  function applyMove() {
    if (typeof keys === 'undefined') return;
    var x = Math.abs(move.x) < DEAD ? 0 : move.x;
    var y = Math.abs(move.y) < DEAD ? 0 : move.y;
    keys[key_right] = x > 0 ? x : 0;
    keys[key_left] = x < 0 ? -x : 0;
    keys[key_up] = y < 0 ? -y : 0;
    keys[key_down] = y > 0 ? y : 0;
  }

  function bindLook() {
    el.look.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      if (look.id !== null) return;
      look.id = e.pointerId; look.lx = e.clientX; look.ly = e.clientY;
      look.t0 = Date.now(); look.moved = 0;
      capture(el.look, e.pointerId);
      e.preventDefault();
    });
    el.look.addEventListener('pointermove', function (e) {
      if (e.pointerId !== look.id) return;
      var dx = e.clientX - look.lx, dy = e.clientY - look.ly;
      look.lx = e.clientX; look.ly = e.clientY;
      look.moved += Math.abs(dx) + Math.abs(dy);
      mouse_x += dx * LOOK_GAIN;
      mouse_y += dy * LOOK_GAIN;
      e.preventDefault();
    });
    var end = function (e) {
      if (e.pointerId !== look.id) return;
      var quick = Date.now() - look.t0 < TAP_MS && look.moved < TAP_SLOP;
      look.id = null;
      if (quick) {
        fireHeld = true;
        if (typeof keys !== 'undefined') keys[key_action] = 1;
        setTimeout(function () {
          fireHeld = false;
          if (typeof keys !== 'undefined') keys[key_action] = 0;
        }, 90);
      }
    };
    el.look.addEventListener('pointerup', end);
    el.look.addEventListener('pointercancel', end);
  }

  function hold(node, onDown, onUp) {
    node.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      capture(node, e.pointerId);
      node.classList.add('on');
      onDown();
      e.preventDefault();
    });
    var up = function () {
      node.classList.remove('on');
      onUp();
    };
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
  }

  function bindButtons() {
    hold(el.fire, function () {
      fireHeld = true;
      if (typeof keys !== 'undefined') keys[key_action] = 1;
    }, function () {
      fireHeld = false;
      if (typeof keys !== 'undefined') keys[key_action] = 0;
    });
    hold(el.jump, function () {
      jumpHeld = true;
      if (typeof keys !== 'undefined') keys[key_jump] = 1;
    }, function () {
      jumpHeld = false;
      if (typeof keys !== 'undefined') keys[key_jump] = 0;
    });
    el.gun.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      if (typeof keys !== 'undefined') keys[key_next] = 1;
      el.gun.classList.add('on');
      e.preventDefault();
    });
    el.gun.addEventListener('pointerup', function () { el.gun.classList.remove('on'); });
    el.gun.addEventListener('pointercancel', function () { el.gun.classList.remove('on'); });
    el.wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function tick() {
    if (!active) return;
    applyMove();
    if (typeof keys === 'undefined') return;
    if (fireHeld) keys[key_action] = 1;
    if (jumpHeld) keys[key_jump] = 1;
  }

  root.Touch = { init: init, tick: tick, arm: arm, isTouch: function () { return active; } };
})(window);
