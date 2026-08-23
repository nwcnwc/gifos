/*
 * SkiFree — touch ski and phone tilt.
 *
 * Upstream aimed the skier with Hammer.js pan/tap on the canvas and double-
 * tap for a boost. Same idea, no library: a finger on the piste writes the
 * same mouse target the engine already follows, so the vendored Skier never
 * learns it is being flown by a thumb.
 *
 * Tilt (gamma / beta) writes that same mouse target. GifOS brokers the
 * sensor when the manifest declares motion; outside GifOS we listen
 * ourselves. A finger on the canvas always wins over tilt.
 *
 * BOOST is revealed on the first real touchstart. A laptop with a
 * touchscreen must not get the button until a finger actually lands.
 */
(function (root) {
  'use strict';

  var active = false;
  var canvas = null;
  var game = null;
  var player = null;
  var lastTap = 0;
  var padId = null;
  var tilting = false;
  var tiltOff = null;
  var fingerDown = false;

  function isTouch() { return active; }

  function phoneish() {
    try {
      if (window.matchMedia && (
        matchMedia('(pointer: coarse)').matches ||
        matchMedia('(max-width: 520px)').matches
      )) return true;
    } catch (e) {}
    return false;
  }

  function capture(node, id) { try { node.setPointerCapture(id); } catch (e) {} }

  function setHint(text) {
    var hint = document.getElementById('hint');
    if (hint) hint.textContent = text;
  }

  function reveal() {
    if (active) return;
    active = true;
    document.body.classList.add('touch');
    var wrap = document.getElementById('touch');
    if (wrap) wrap.hidden = false;
    setHint('Drag or tilt · double-tap or BOOST to go faster');
    removeEventListener('touchstart', reveal);
  }

  function point(ev) {
    if (!game || !canvas) return;
    var r = canvas.getBoundingClientRect();
    game.setMouseX(ev.clientX - r.left);
    game.setMouseY(ev.clientY - r.top);
  }

  function skiToward(ev) {
    if (!player || (root.Ski && root.Ski.isOver && root.Ski.isOver())) return;
    point(ev);
    player.resetDirection();
    player.startMovingIfPossible();
  }

  function applyTilt(gamma, beta) {
    if (!game || !canvas || !player) return;
    if (root.Ski && root.Ski.isOver && root.Ski.isOver()) return;
    if (player.hasBeenHit || player.isBeingEaten) return;
    if (fingerDown) return;
    if (gamma == null || beta == null) return;
    // Chrome fires a dummy (0,0) the moment we listen. A phone at rest sits
    // around beta 50–70, gamma ~0. Arm only on a real lean.
    if (!tilting) {
      if (Math.abs(gamma) < 8) return;
      tilting = true;
      if (phoneish()) reveal();
    }
    var r = canvas.getBoundingClientRect();
    var w = r.width || 1, h = r.height || 1;
    var nx = Math.max(-1, Math.min(1, gamma / 28));
    var mx = w * 0.5 + nx * w * 0.48;
    var my = h * 0.5 + 70;
    game.setMouseX(mx);
    game.setMouseY(my);
    player.resetDirection();
    player.startMovingIfPossible();
  }

  function onOrient(ev) {
    applyTilt(ev.gamma, ev.beta);
  }

  function enableTilt() {
    if (tiltOff) return;
    function attachRaw() {
      addEventListener('deviceorientation', onOrient);
      tiltOff = function () { removeEventListener('deviceorientation', onOrient); };
    }
    if (root.gifos && typeof root.gifos.motion === 'function') {
      try {
        tiltOff = root.gifos.motion(onOrient);
        if (typeof tiltOff !== 'function') tiltOff = function () {};
        return;
      } catch (e) { /* fall through */ }
    }
    var DO = root.DeviceOrientationEvent;
    if (DO && typeof DO.requestPermission === 'function') {
      try {
        DO.requestPermission().then(function (s) {
          if (s === 'granted') attachRaw();
        }).catch(function () {});
      } catch (e) { attachRaw(); }
    } else if (DO) {
      attachRaw();
    }
  }

  function bindCanvas() {
    canvas.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType === 'touch') reveal();
      enableTilt();
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      padId = ev.pointerId;
      fingerDown = true;
      capture(canvas, ev.pointerId);
      if (root.Ski && root.Ski.isOver && root.Ski.isOver()) {
        if (root.Ski.resetGame) root.Ski.resetGame();
        ev.preventDefault();
        return;
      }
      var t = Date.now();
      if (t - lastTap < 280 && player) player.speedBoost();
      lastTap = t;
      skiToward(ev);
      ev.preventDefault();
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (ev.pointerId !== padId) {
        if (ev.pointerType === 'mouse') {
          point(ev);
          if (player && !player.hasBeenHit) player.resetDirection();
        }
        return;
      }
      skiToward(ev);
      ev.preventDefault();
    });
    function end(ev) {
      if (ev.pointerId !== padId) return;
      padId = null;
      fingerDown = false;
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    canvas.addEventListener('click', function (ev) {
      if (root.Ski && root.Ski.isOver && root.Ski.isOver()) {
        if (root.Ski.resetGame) root.Ski.resetGame();
        ev.preventDefault();
      }
    });
  }

  function bindBoost() {
    var el = document.getElementById('t-boost');
    if (!el) return;
    var held = null;
    el.addEventListener('pointerdown', function (ev) {
      held = ev.pointerId;
      el.classList.add('on');
      capture(el, ev.pointerId);
      if (player && !(root.Ski && root.Ski.isOver && root.Ski.isOver())) player.speedBoost();
      ev.preventDefault();
      ev.stopPropagation();
    });
    function up(ev) {
      if (ev.pointerId !== held) return;
      held = null;
      el.classList.remove('on');
    }
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function init(c, g, p) {
    canvas = c;
    game = g;
    player = p;
    if (phoneish()) {
      document.body.classList.add('phone');
      setHint('Drag or tilt to ski');
    }
    addEventListener('touchstart', reveal, { passive: true });
    if (canvas) bindCanvas();
    bindBoost();
    document.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
    // Desktop with a real gyro (a tablet in a dock) can tilt without a finger.
    enableTilt();
    return { isTouch: isTouch };
  }

  root.Touch = { init: init, isTouch: isTouch };
})(window);
