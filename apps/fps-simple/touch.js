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
  var move = { id: null, x: 0, y: 0 };
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
    banPointerLock();
    return { isTouch: isTouch, tick: tick };
  }

  /* ---- a thumb and a pointer lock cannot share a screen ------------------ */
  // THE DEAD STICK, measured on a Moto g24: during play every pointer event
  // reached the pad — right target, capture intact — and every one carried
  // clientX/clientY frozen at the same impossible point (0,-31), 688 px and
  // ten radii from a pad the thumb was demonstrably on. Chrome had granted
  // POINTER LOCK to the canvas, on a phone: boot asks for it on Play (the
  // right call on a desktop), and upstream's Input re-asks on every mousedown
  // — which a bare tap on the canvas synthesises. While the lock is held,
  // Chrome keeps delivering touch-derived pointer events to the right element
  // but freezes their client coordinates, and an absolute-position stick has
  // nothing left to steer by. The buttons kept working through it because a
  // button reads no coordinates, and the pause menu revived the stick because
  // pausing calls document.exitPointerLock() — which is exactly how it was
  // reported: "the joystick works when I have the Pause menu pulled up".
  //
  // So once a real finger has proven this is a touch screen, the lock is
  // banned: requests are swallowed at the one door every caller uses
  // (input.requestPointerLock — boot's Play handler, the pause menu's Resume,
  // and upstream's own mousedown all go through it), and a lock that slipped
  // in anyway — granted before the first touchstart, or by a future caller
  // with its own path — is exited the moment it appears. A mouse-only machine
  // never sets `active` and keeps pointer lock exactly as upstream intends.
  function banPointerLock() {
    var orig = input.requestPointerLock ? input.requestPointerLock.bind(input) : null;
    input.requestPointerLock = function () {
      if (active) return;            // a thumb needs no lock, and the lock kills the thumb
      if (orig) orig();
    };
    var shed = function () {
      if (!active || !document.pointerLockElement) return;
      try { document.exitPointerLock(); } catch (e) {}
    };
    document.addEventListener('pointerlockchange', shed);
    // The reveal itself is the other moment this can first become true: the
    // lock may predate the first touch (Play was tapped, lock granted, THEN
    // the HUD revealed on that same gesture's touchstart).
    addEventListener('touchstart', shed, { passive: true });
  }

  /* ---- the left stick --------------------------------------------------- */
  function bindStick() {
    el.move.addEventListener('pointerdown', function (e) {
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
    };
    el.move.addEventListener('pointerup', end);
    el.move.addEventListener('pointercancel', end);
  }

  // THE PAD IS MEASURED EVERY SAMPLE, AND A SAMPLE THAT CANNOT BE A THUMB IS
  // DROPPED. Both halves are the same bug, measured on a Moto g24: the stick
  // walked north-west and only north-west, whichever way the thumb was dragged.
  //
  // The deflection is an ABSOLUTE position — where the finger is, against where
  // the pad is — so it is only ever as good as the agreement between those two
  // numbers, and the app spends its first second pulling them apart. Play asks
  // for fullscreen and locks the screen to landscape on the same gesture that
  // starts the game (boot.js goFullscreenLandscape), so the pad travels through
  // four layouts — top 581 -> 705 -> 195 -> 251 — while a thumb is already down
  // on it. A centre cached at pointerdown is stale by hundreds of pixels within
  // one frame of the press, and stale by far more than the pad is wide, so the
  // error swamps the thumb's own 68 px of throw and the vector stops depending
  // on the thumb at all. Reading the element per sample costs one rect on a
  // control that is one element, and cannot go stale.
  //
  // The second half is worse and is a browser bug: across that same transition
  // Chrome delivers pointermoves for the touch that is ALREADY DOWN with client,
  // page AND screen all exactly (0,0) — a position it does not have — before
  // following up with pointercancel. Measured, verbatim, off the phone:
  //
  //   pointerdown  client=[86.3, 649.7]  screen=[86.3, 781.7]   <- the real thumb
  //   pointermove  client=[0, -32]       screen=[0, 0]          <- no position
  //   pointermove  client=[0, 0]         screen=[0, 0]
  //   pointercancel
  //
  // Read as a thumb, the viewport's origin is up and to the left of a pad
  // anchored bottom-left, so every one of those samples resolves to the same
  // full-throw vector, (-0.13, -0.99): north-west, at a sprint, until the
  // player lifts. The finger is not at the top-left pixel of the phone — it is
  // 650 px away from a control 137 px across, which is nine pad-radii and not a
  // hand. Three radii is already well outside anything a thumb does to this pad
  // (the suite's own hardest over-drag, out to the sprint threshold, is 2.2),
  // so beyond that we keep the last deflection and wait for a sample that says
  // where the thumb really is. Holding is deliberate: a hiccup should cost the
  // player a moment of stiffness, never a direction they did not ask for.
  var MAX_RADII = 3;
  function track(e) {
    var r = el.move.getBoundingClientRect();
    var rad = r.width / 2;
    if (!rad) return;                            // hidden — no geometry to steer by
    var dx = e.clientX - (r.left + rad), dy = e.clientY - (r.top + rad);
    var len = Math.hypot(dx, dy) || 1;
    if (len > rad * MAX_RADII) return;
    var clamped = Math.min(len, rad) / rad;
    move.x = (dx / len) * clamped;
    move.y = (dy / len) * clamped;
    el.knob.style.transform = 'translate(' + (move.x * rad * 0.62).toFixed(1) + 'px,' +
                              (move.y * rad * 0.62).toFixed(1) + 'px)';
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
