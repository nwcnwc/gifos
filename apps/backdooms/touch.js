/*
 * Backdooms — thumbs.
 *
 * ONE full-screen layer decides what a touch is by WHERE IT STARTED: the left
 * side is a floating move stick, everything else is look-and-tap-to-fire, and
 * FIRE sits on top of both. That routing is the fix for two faults a phone
 * review found in the previous build, and both were structural rather than
 * tuning:
 *
 *   THE LEFT 40% OF THE SCREEN WAS DEAD. The look surface started at 40% and
 *   the stick was a fixed 120px pad in the corner, so a drag anywhere else on
 *   the left half did nothing at all — and when something bit you from the
 *   left, the thumb that could have turned you was already holding the stick.
 *
 *   THE STICK WAS A PAD YOU HAD TO FIND. It sat at a fixed spot 84px off the
 *   bottom; a touch at (55, 805) — where a left thumb actually lands on a tall
 *   phone — moved the knob zero pixels. A floating stick appears UNDER your
 *   thumb wherever you put it, so you never look down.
 *
 * FIRE also repeats while held. One shot per 3000 ms press is not a shotgun,
 * it is a typing test, and you are being eaten while you take it.
 */
(function (root) {
  'use strict';

  var active = false;
  var el = {};
  var move = { id: null, ox: 0, oy: 0 };
  var look = { id: null, lx: 0, ly: 0, sx: 0, sy: 0, moved: false };
  var fireHeld = null;
  var DEAD = 0.16;
  var TAP = 12;
  var REACH = 46;          /* how far the knob travels, in CSS px */
  var REPEAT = 380;        /* hold-to-fire, about one pump cycle */

  function capture(node, id) { try { node.setPointerCapture(id); } catch (e) {} }

  function keys() {
    return root.Backdooms && root.Backdooms.keys ? root.Backdooms.keys() : { _jx: 0, _jy: 0 };
  }

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
    bindSurface();
    bindFire();
    return { arm: arm, isTouch: function () { return active; } };
  }

  function arm() {
    if (active) return;
    active = true;
    document.body.classList.add('phone');
    el.wrap.hidden = false;
  }

  /* The left band is the stick's, but never more than a thumb's worth of a
     wide landscape screen — on an 844px-wide phone half the screen is a lot of
     dead look area. */
  function stickZone() {
    return Math.min(innerWidth * 0.46, 300);
  }

  function bindSurface() {
    el.look.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      if (ev.clientX < stickZone() && move.id === null) {
        move.id = ev.pointerId;
        move.ox = ev.clientX; move.oy = ev.clientY;
        placeStick(ev.clientX, ev.clientY);
        el.move.style.opacity = '1';
        capture(el.look, ev.pointerId);
        stick(ev);
        return;
      }
      if (look.id !== null) return;
      look.id = ev.pointerId;
      look.lx = ev.clientX; look.ly = ev.clientY;
      look.sx = ev.clientX; look.sy = ev.clientY;
      look.moved = false;
      capture(el.look, ev.pointerId);
    });

    el.look.addEventListener('pointermove', function (ev) {
      if (ev.pointerId === move.id) { ev.preventDefault(); stick(ev); return; }
      if (ev.pointerId !== look.id) return;
      ev.preventDefault();
      var dx = ev.clientX - look.lx;
      look.lx = ev.clientX; look.ly = ev.clientY;
      if (Math.hypot(ev.clientX - look.sx, ev.clientY - look.sy) > TAP) look.moved = true;
      root.Backdooms.look(dx * 4);
    });

    function up(ev) {
      if (ev.pointerId === move.id) {
        move.id = null;
        var k = keys();
        k._jx = 0; k._jy = 0;
        el.knob.style.transform = 'translate(-50%,-50%)';
        el.move.style.opacity = '';
        return;
      }
      if (ev.pointerId !== look.id) return;
      var wasTap = !look.moved && Math.hypot(ev.clientX - look.sx, ev.clientY - look.sy) <= TAP;
      look.id = null;
      if (wasTap && ev.type === 'pointerup') root.Backdooms.shoot();
    }
    el.look.addEventListener('pointerup', up);
    el.look.addEventListener('pointercancel', up);
  }

  function placeStick(x, y) {
    var r = el.move.getBoundingClientRect();
    var half = (r.width || 120) / 2;
    x = Math.max(half + 6, Math.min(innerWidth - half - 6, x));
    y = Math.max(half + 6, Math.min(innerHeight - half - 6, y));
    el.move.style.left = (x - half) + 'px';
    el.move.style.top = (y - half) + 'px';
    el.move.style.right = 'auto';
    el.move.style.bottom = 'auto';
  }

  function stick(ev) {
    var dx = ev.clientX - move.ox, dy = ev.clientY - move.oy;
    var d = Math.hypot(dx, dy) || 1;
    if (d > REACH) { dx *= REACH / d; dy *= REACH / d; }
    el.knob.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
    var jx = dx / REACH, jy = dy / REACH;
    var k = keys();
    k._jx = Math.abs(jx) < DEAD ? 0 : jx;
    k._jy = Math.abs(jy) < DEAD ? 0 : jy;
  }

  function bindFire() {
    function down(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      root.Backdooms.shoot();
      if (fireHeld) clearInterval(fireHeld);
      fireHeld = setInterval(function () { root.Backdooms.shoot(); }, REPEAT);
      capture(el.fire, ev.pointerId);
    }
    function up() {
      if (fireHeld) clearInterval(fireHeld);
      fireHeld = null;
    }
    el.fire.addEventListener('pointerdown', down);
    el.fire.addEventListener('pointerup', up);
    el.fire.addEventListener('pointercancel', up);
    el.fire.addEventListener('pointerleave', up);
  }

  root.Touch = { init: init, arm: arm };
})(window);
