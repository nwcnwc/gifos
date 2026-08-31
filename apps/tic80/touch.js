/*
 * TIC-80 — thumb pad.
 *
 * A plus-shaped d-pad (slide for diagonals), B then A, Esc/Run in the
 * gutter. Revealed on a phone, or after a finger lands. Dispatches the
 * same keys the desktop layout uses — the engine never learns it is
 * being driven by a thumb.
 */
(function (root) {
  'use strict';

  var active = false;
  var held = {};

  var KEYS = {
    ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
    ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
    ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
    ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
    z: { key: 'z', code: 'KeyZ', keyCode: 90 },
    x: { key: 'x', code: 'KeyX', keyCode: 88 },
    Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
    Enter: { key: 'Enter', code: 'Enter', keyCode: 13 }
  };

  function phoneish() {
    var pts = (root.navigator && root.navigator.maxTouchPoints) || 0;
    var coarse = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
    var narrow = Math.min(root.innerWidth || 0, root.innerHeight || 0) <= 560;
    return (pts > 0 && coarse) || (pts > 0 && narrow);
  }

  function fire(name, down) {
    var spec = KEYS[name];
    if (!spec) return;
    var type = down ? 'keydown' : 'keyup';
    var ev = new KeyboardEvent(type, {
      key: spec.key, code: spec.code, keyCode: spec.keyCode, which: spec.keyCode,
      bubbles: true, cancelable: true
    });
    try { Object.defineProperty(ev, 'keyCode', { get: function () { return spec.keyCode; } }); } catch (e) {}
    (document.getElementById('canvas') || window).dispatchEvent(ev);
    window.dispatchEvent(ev);
  }

  function setKey(name, down) {
    if (down) {
      if (held[name]) return;
      held[name] = 1;
      fire(name, true);
    } else {
      if (!held[name]) return;
      delete held[name];
      fire(name, false);
    }
  }

  function bitsFromPad(x, y, el) {
    var r = el.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var dx = x - cx, dy = y - cy;
    var dead = Math.min(r.width, r.height) * 0.12;
    var out = { u: 0, d: 0, l: 0, r: 0 };
    if (dx * dx + dy * dy < dead * dead) return out;
    var ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax > dead) { if (dx < 0) out.l = 1; else out.r = 1; }
    if (ay > dead) { if (dy < 0) out.u = 1; else out.d = 1; }
    return out;
  }

  function applyPad(bits) {
    setKey('ArrowUp', !!bits.u);
    setKey('ArrowDown', !!bits.d);
    setKey('ArrowLeft', !!bits.l);
    setKey('ArrowRight', !!bits.r);
  }

  function init() {
    var wrap = document.getElementById('touch');
    if (!wrap) return;

    var reveal = function () {
      if (active) return;
      active = true;
      document.body.classList.add('touch');
      wrap.hidden = false;
    };
    if (phoneish()) reveal();
    addEventListener('touchstart', reveal, { passive: true });

    var dpad = document.getElementById('dpad');
    var dpadId = 0;
    function onPad(ev) {
      ev.preventDefault();
      var t = ev.touches && ev.touches[0];
      if (!t || ev.type === 'touchend' || ev.type === 'touchcancel') {
        applyPad({ u: 0, d: 0, l: 0, r: 0 });
        dpadId = 0;
        return;
      }
      applyPad(bitsFromPad(t.clientX, t.clientY, dpad));
    }
    ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(function (n) {
      dpad.addEventListener(n, onPad, { passive: false });
    });

    wrap.querySelectorAll('[data-key]').forEach(function (btn) {
      var name = btn.getAttribute('data-key');
      var down = function (ev) { ev.preventDefault(); btn.classList.add('on'); setKey(name, true); };
      var up = function (ev) { ev.preventDefault(); btn.classList.remove('on'); setKey(name, false); };
      btn.addEventListener('touchstart', down, { passive: false });
      btn.addEventListener('touchend', up, { passive: false });
      btn.addEventListener('touchcancel', up, { passive: false });
      btn.addEventListener('mousedown', down);
      btn.addEventListener('mouseup', up);
      btn.addEventListener('mouseleave', up);
    });
  }

  root.TicTouch = { init: init, setKey: setKey };
})(window);
