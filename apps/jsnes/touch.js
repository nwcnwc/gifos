/*
 * jsnes — thumb pad.
 *
 * A plus-shaped d-pad (slide for diagonals), B then A on the right the
 * way a NES pad is, Select/Start in the gutter. Revealed on a phone, or
 * after a finger lands. Writes a mask into Emu — the engine never learns
 * it is being driven by a thumb.
 */
(function (root) {
  'use strict';

  var active = false;
  var mask = 0;
  var dpadHeld = 0;
  var faceHeld = 0;

  function phoneish() {
    var pts = (root.navigator && root.navigator.maxTouchPoints) || 0;
    var coarse = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
    var narrow = Math.min(root.innerWidth || 0, root.innerHeight || 0) <= 560;
    return (pts > 0 && coarse) || (pts > 0 && narrow);
  }

  function push() {
    mask = dpadHeld | faceHeld;
    if (root.Emu) root.Emu.setTouchMask(mask);
  }

  function bitsFromPad(x, y, el) {
    var r = el.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var dx = x - cx, dy = y - cy;
    var dead = Math.min(r.width, r.height) * 0.12;
    var out = 0;
    if (dx * dx + dy * dy < dead * dead) return 0;
    var ax = Math.abs(dx), ay = Math.abs(dy);
    var B = root.Emu && root.Emu.BTN;
    var L = B ? (1 << B.BUTTON_LEFT) : 64;
    var R = B ? (1 << B.BUTTON_RIGHT) : 128;
    var U = B ? (1 << B.BUTTON_UP) : 16;
    var D = B ? (1 << B.BUTTON_DOWN) : 32;
    if (ax > dead) out |= dx < 0 ? L : R;
    if (ay > dead) out |= dy < 0 ? U : D;
    return out;
  }

  function init() {
    var wrap = document.getElementById('touch');
    if (!wrap) return;

    var reveal = function () {
      if (active) return;
      active = true;
      document.body.classList.add('touch');
      wrap.hidden = false;
      if (root.Emu) root.Emu.fit();
      if (root.Emu) root.Emu.unlockAudio();
      removeEventListener('touchstart', reveal);
    };
    if (phoneish()) reveal();
    else addEventListener('touchstart', reveal, { passive: true });

    var dpad = document.getElementById('dpad');
    var dpadSet = function (e) {
      dpadHeld = bitsFromPad(e.clientX, e.clientY, dpad);
      if (dpadHeld) dpad.classList.add('on'); else dpad.classList.remove('on');
      push();
    };
    var dpadClear = function () {
      dpadHeld = 0;
      dpad.classList.remove('on');
      push();
    };
    dpad.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try { dpad.setPointerCapture(e.pointerId); } catch (err) {}
      dpadSet(e);
    });
    dpad.addEventListener('pointermove', function (e) {
      if (e.buttons) dpadSet(e);
    });
    dpad.addEventListener('pointerup', dpadClear);
    dpad.addEventListener('pointercancel', dpadClear);
    dpad.addEventListener('lostpointercapture', dpadClear);

    var faces = wrap.querySelectorAll('[data-bit]');
    for (var i = 0; i < faces.length; i++) bindFace(faces[i]);

    wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function bindFace(node) {
    var b = 1 << (node.getAttribute('data-bit') | 0);
    var set = function (on) {
      if (on) { faceHeld |= b; node.classList.add('on'); }
      else { faceHeld &= ~b; node.classList.remove('on'); }
      push();
    };
    var down = function (e) {
      e.preventDefault();
      try { node.setPointerCapture(e.pointerId); } catch (err) {}
      set(true);
    };
    var up = function (e) { e.preventDefault(); set(false); };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('lostpointercapture', function () { set(false); });
  }

  root.Touch = { init: init, isTouch: function () { return active; } };
})(window);
