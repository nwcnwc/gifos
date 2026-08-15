/*
 * FPS Simple — touch controls.
 *
 * Upstream has NO touch input at all: keyboard, pointer-locked mouse, gamepad.
 * On a phone it renders perfectly and you cannot move or aim. Since most people
 * open GifOS on a phone, that is not a footnote, it is the app being broken.
 *
 * This adds a real thumb layout WITHOUT forking upstream, by writing into the
 * two channels its Input class already exposes to a gamepad:
 *
 *   input.stick.moveX / moveY   the left stick — already folded into moveVector()
 *   input._rawLook.x / .y       accumulated look delta, scaled by sensitivity
 *                               in beginFrame() exactly like mouse movement
 *   input._pendingDown / Up     the key/button edge queues, keyed by code
 *
 * So a thumb on glass arrives as the same numbers a gamepad or a mouse would
 * produce, and nothing downstream — movement, weapons, the HUD — needs to know
 * the difference. Even sprint is free: upstream sprints when the stick is pushed
 * past 0.92, so pushing the pad to its edge sprints, with no button for it.
 *
 * ONE DELIBERATE ASYMMETRY. Movement is a STICK (rate: hold a direction, keep
 * walking) but look is a DRAG (delta: move your thumb, the view moves that far
 * and stops). That is how every phone shooter worth playing does it, and it is
 * why look writes _rawLook rather than stick.lookX — the stick channel is a
 * turn RATE, which feels like stirring soup when your thumb is on glass.
 *
 * Shown only after a real touchstart. A laptop with a touchscreen reports
 * ontouchstart and must not get a phone HUD laid over its game.
 */
(function (root) {
  'use strict';

  var LOOK_GAIN = 1.7;        // drag pixels -> look, on top of config.sensitivity
  var TAP_MS = 220;           // a touch shorter and stiller than this is a shot
  var TAP_SLOP = 14;          // px

  var input = null, ui = null;
  var el = {};
  var active = false;
  var move = { id: null, cx: 0, cy: 0, r: 1, x: 0, y: 0 };
  var look = { id: null, lx: 0, ly: 0, t0: 0, moved: 0 };
  var firing = false, fireUntil = 0;

  function isTouch() { return active; }

  // Capture keeps a thumb that slides off the control still talking to it. It is
  // an optimisation, not a requirement: a pointerId the browser will not accept
  // (a synthetic event, a pointer already released) throws InvalidPointerId, and
  // losing the capture must never cost the player the input itself.
  function capture(node, id) { try { node.setPointerCapture(id); } catch (e) {} }

  function init(engineInput, uiSystem) {
    input = engineInput;
    ui = uiSystem;
    el.wrap = document.getElementById('touch');
    el.move = document.getElementById('t-move');
    el.knob = el.move.querySelector('.t-knob');
    el.look = document.getElementById('t-look');
    el.pause = document.getElementById('t-pause');

    // Reveal on the first real finger, once.
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
    bindButtons();
    wrapGamepadPoll();
    return { isTouch: isTouch, tick: tick };
  }

  /* ---- the left stick --------------------------------------------------- */
  function bindStick() {
    el.move.addEventListener('pointerdown', function (e) {
      if (move.id !== null) return;
      move.id = e.pointerId;
      var r = el.move.getBoundingClientRect();
      move.cx = r.left + r.width / 2;
      move.cy = r.top + r.height / 2;
      move.r = r.width / 2;
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
    };
    el.move.addEventListener('pointerup', end);
    el.move.addEventListener('pointercancel', end);
  }

  function track(e) {
    var dx = e.clientX - move.cx, dy = e.clientY - move.cy;
    var len = Math.hypot(dx, dy) || 1;
    var clamped = Math.min(len, move.r) / move.r;
    move.x = (dx / len) * clamped;
    move.y = (dy / len) * clamped;
    el.knob.style.transform = 'translate(' + (move.x * move.r * 0.62).toFixed(1) + 'px,' +
                              (move.y * move.r * 0.62).toFixed(1) + 'px)';
  }

  /* ---- drag to look, tap to shoot -------------------------------------- */
  function bindLook() {
    el.look.addEventListener('pointerdown', function (e) {
      if (look.id !== null) return;
      look.id = e.pointerId; look.lx = e.clientX; look.ly = e.clientY;
      look.t0 = Date.now(); look.moved = 0;
      capture(el.look, e.pointerId);
      e.preventDefault();
    });
    el.look.addEventListener('pointermove', function (e) {
      if (e.pointerId !== look.id || !input) return;
      var dx = e.clientX - look.lx, dy = e.clientY - look.ly;
      look.lx = e.clientX; look.ly = e.clientY;
      look.moved += Math.abs(dx) + Math.abs(dy);
      // Straight into the same accumulator a locked mouse writes to.
      input._rawLook.x += dx * LOOK_GAIN;
      input._rawLook.y += dy * LOOK_GAIN;
      e.preventDefault();
    });
    var end = function (e) {
      if (e.pointerId !== look.id) return;
      var quick = Date.now() - look.t0 < TAP_MS && look.moved < TAP_SLOP;
      look.id = null;
      if (quick) fireUntil = Date.now() + 90; // a tap is one shot
    };
    el.look.addEventListener('pointerup', end);
    el.look.addEventListener('pointercancel', end);
  }

  /* ---- action buttons --------------------------------------------------- */
  function bindButtons() {
    var btns = document.querySelectorAll('#t-buttons .t-btn');
    for (var i = 0; i < btns.length; i++) (function (b) {
      var code = b.getAttribute('data-code');
      b.addEventListener('pointerdown', function (e) {
        if (!input) return;
        input._pendingDown.add(code);
        b.classList.add('on');
        capture(b, e.pointerId);
        e.preventDefault();
      });
      var up = function (e) {
        if (!input) return;
        input._pendingUp.add(code);
        b.classList.remove('on');
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    })(btns[i]);

    el.pause.addEventListener('click', function () { if (ui) ui.menu.toggle(); });
  }

  /* ---- merge into the gamepad channel ----------------------------------- */
  // _pollGamepad runs every beginFrame and ZEROES the sticks when no pad is
  // present, so touch has to be applied after it rather than before.
  function wrapGamepadPoll() {
    var orig = input._pollGamepad.bind(input);
    input._pollGamepad = function () {
      orig();
      if (!active) return;
      if (move.id !== null) {
        input.stick.moveX = move.x;
        input.stick.moveY = move.y; // gamepad convention: forward is negative
      }
    };
  }

  /** Called once per frame from boot, to hold the trigger down for a tap. */
  function tick() {
    if (!active || !input) return;
    var want = fireUntil > Date.now();
    if (want && !firing) { input._pendingDown.add('Mouse0'); firing = true; }
    else if (!want && firing) { input._pendingUp.add('Mouse0'); firing = false; }
  }

  root.Touch = { init: init };
})(window);
