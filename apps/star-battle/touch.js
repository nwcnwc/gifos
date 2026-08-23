/*
 * Star Battle — thumb stick + fire.
 *
 * Upstream is WASD + Space. On a phone it renders and you cannot fly.
 * Left pad writes the same hotkeys the keyboard does (W A S D), right
 * pad is FIRE (Space). The vendored Player never learns it is being
 * flown by a thumb.
 *
 * Revealed on the first real touchstart. A laptop with a touchscreen
 * must not get the overlay until a finger actually lands.
 */
(function (root) {
  'use strict';

  var DEAD = 0.22;
  var active = false;
  var move = { id: null, x: 0, y: 0 };
  var held = { W: false, A: false, S: false, D: false };
  var fireTimer = null;

  function capture(node, id) { try { node.setPointerCapture(id); } catch (e) {} }

  function send(key, down) {
    var code = key === ' ' ? 'Space' : 'Key' + String(key).toUpperCase();
    try {
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {
        key: key, code: code, bubbles: true, cancelable: true
      }));
    } catch (e) {}
  }

  function setHeld(code, on) {
    if (held[code] === on) return;
    held[code] = on;
    send(code === 'W' ? 'w' : code === 'A' ? 'a' : code === 'S' ? 's' : 'd', on);
  }

  function applyStick() {
    var portrait = !!(root.Boot && Boot.portrait && Boot.portrait());
    if (portrait) {
      /* game is rotated −90°: screen-up is game-right (toward the wave) */
      setHeld('D', move.y < -DEAD);
      setHeld('A', move.y > DEAD);
      setHeld('W', move.x < -DEAD);
      setHeld('S', move.x > DEAD);
    } else {
      setHeld('W', move.y < -DEAD);
      setHeld('S', move.y > DEAD);
      setHeld('A', move.x < -DEAD);
      setHeld('D', move.x > DEAD);
    }
  }

  function startFire() {
    send(' ', true);
    if (fireTimer) clearInterval(fireTimer);
    fireTimer = setInterval(function () {
      send(' ', false);
      send(' ', true);
    }, 90);
  }
  function stopFire() {
    if (fireTimer) { clearInterval(fireTimer); fireTimer = null; }
    send(' ', false);
  }

  function stickFrom(node, e) {
    var r = node.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var dx = e.clientX - cx, dy = e.clientY - cy;
    var max = Math.max(24, r.width * 0.42);
    var mag = Math.sqrt(dx * dx + dy * dy) || 1;
    var k = Math.min(1, mag / max);
    return { x: (dx / mag) * k, y: (dy / mag) * k };
  }

  function setKnob(node, x, y) {
    var knob = node.querySelector('.t-knob');
    if (!knob) return;
    knob.style.transform = 'translate(' + (x * 38) + 'px,' + (y * 38) + 'px)';
  }

  function bindStick(node) {
    node.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      e.stopPropagation();
      capture(node, e.pointerId);
      move.id = e.pointerId;
      var s = stickFrom(node, e);
      move.x = s.x; move.y = s.y;
      setKnob(node, s.x, s.y);
      applyStick();
    });
    node.addEventListener('pointermove', function (e) {
      if (move.id !== e.pointerId) return;
      e.preventDefault();
      var s = stickFrom(node, e);
      move.x = s.x; move.y = s.y;
      setKnob(node, s.x, s.y);
      applyStick();
    });
    function up(e) {
      if (move.id !== e.pointerId) return;
      move.id = null; move.x = 0; move.y = 0;
      setKnob(node, 0, 0);
      applyStick();
    }
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
  }

  function bindFire(node) {
    var down = function (e) {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      try { node.setPointerCapture(e.pointerId); } catch (err) {}
      node.classList.add('on');
      startFire();
    };
    var up = function (e) {
      e.preventDefault();
      node.classList.remove('on');
      stopFire();
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('lostpointercapture', function () {
      node.classList.remove('on');
      stopFire();
    });
  }

  function bindPause(node) {
    node.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      e.preventDefault();
      send('p', true);
    });
    node.addEventListener('pointerup', function (e) {
      e.preventDefault();
      send('p', false);
    });
  }

  var wrapEl = null;
  function reveal() {
    if (active || !wrapEl) return;
    active = true;
    document.body.classList.add('touch');
    wrapEl.hidden = false;
    removeEventListener('touchstart', reveal);
  }

  function init() {
    var wrap = document.getElementById('touch');
    wrapEl = wrap;
    if (!wrap) return { isTouch: function () { return active; } };

    addEventListener('touchstart', reveal, { passive: true });
    if (window.matchMedia && matchMedia('(pointer: coarse)').matches) reveal();

    var stick = document.getElementById('t-move');
    if (stick) bindStick(stick);
    var fire = wrap.querySelector('[data-key]');
    if (fire) bindFire(fire);
    var pause = wrap.querySelector('[data-act="pause"]');
    if (pause) bindPause(pause);
    wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    return { isTouch: function () { return active; } };
  }

  root.Touch = { init: init, isTouch: function () { return active; }, reveal: reveal };
})(window);
