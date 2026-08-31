/*
 * Breakout — drag the paddle, and hold-to-move arrows on a phone.
 *
 * Original ontouchmove mapped one finger's pageX onto paddle.place(). Same
 * idea, every phone: the pointer writes the same paddle the keyboard does,
 * so the vendored game never learns it is being steered by a thumb.
 *
 * Revealed at boot on a phone (coarse pointer, or a narrow touch screen).
 * A laptop with a touchscreen must not get the overlay until a finger
 * actually lands.
 */
(function (root) {
  'use strict';

  var active = false;
  var dragging = false;
  var canvas = null;
  var court = null;
  var getPaddle = null;
  var onTap = null;

  function phoneish() {
    var pts = (root.navigator && root.navigator.maxTouchPoints) || 0;
    var coarse = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
    var narrow = Math.min(root.innerWidth || 0, root.innerHeight || 0) <= 520;
    return (pts > 0 && coarse) || (pts > 0 && narrow);
  }

  function canvasPos(ev) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) * (canvas.width / r.width),
      y: (ev.clientY - r.top) * (canvas.height / r.height)
    };
  }

  function placeAt(ev) {
    var paddle = getPaddle && getPaddle();
    if (!paddle || !canvas) return;
    var pos = canvasPos(ev);
    paddle.place(pos.x - paddle.w / 2);
  }

  function init(opts) {
    opts = opts || {};
    canvas = opts.canvas || document.getElementById('canvas');
    court = opts.court || document.getElementById('court');
    getPaddle = opts.getPaddle;
    onTap = opts.onTap;
    var wrap = document.getElementById('pads');

    var reveal = function () {
      if (active) return;
      active = true;
      document.body.classList.add('touch');
      if (wrap) wrap.hidden = false;
      var inst = document.getElementById('instructions');
      if (inst) inst.className = 'touch';
    };
    if (phoneish()) reveal();
    else addEventListener('touchstart', reveal, { passive: true });

    if (wrap) {
      var btns = wrap.querySelectorAll('[data-dir]');
      for (var i = 0; i < btns.length; i++) bindPad(btns[i]);
      wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }

    var surface = court || canvas;
    if (surface) {
      surface.addEventListener('pointerdown', function (ev) {
        if (ev.target && ev.target.closest && ev.target.closest('#levels')) return;
        dragging = true;
        try { surface.setPointerCapture(ev.pointerId); } catch (err) {}
        placeAt(ev);
        if (onTap) onTap();
        ev.preventDefault();
      }, { passive: false });
      surface.addEventListener('pointermove', function (ev) {
        if (!dragging) return;
        placeAt(ev);
        ev.preventDefault();
      }, { passive: false });
      var end = function (ev) {
        dragging = false;
        try { surface.releasePointerCapture(ev.pointerId); } catch (err) {}
      };
      surface.addEventListener('pointerup', end);
      surface.addEventListener('pointercancel', end);
      surface.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }

    return { isTouch: function () { return active; } };
  }

  function bindPad(node) {
    var dir = node.getAttribute('data-dir');
    var set = function (on) {
      var paddle = getPaddle && getPaddle();
      if (!paddle) return;
      if (on) node.classList.add('on');
      else node.classList.remove('on');
      if (dir === 'left') {
        if (on) paddle.moveLeft(); else paddle.stopMovingLeft();
      } else {
        if (on) paddle.moveRight(); else paddle.stopMovingRight();
      }
    };
    node.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      try { node.setPointerCapture(e.pointerId); } catch (err) {}
      if (onTap) onTap();
      set(true);
    });
    var up = function (e) { e.preventDefault(); set(false); };
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('lostpointercapture', function () { set(false); });
  }

  root.Touch = { init: init, phoneish: phoneish };
})(window);
