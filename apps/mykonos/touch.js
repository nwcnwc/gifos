/* Left stick walks. Right-side drag orbits. Shown only after a real
 * touchstart so a laptop with a touchscreen keeps the keyboard. */
(function (root) {
  'use strict';

  var LOOK = 0.55;
  var active = false;
  var el = {};
  var move = { id: null, x: 0, y: 0 };
  var look = { id: null, lx: 0, ly: 0, d0: 0 };

  function capture(node, id) { try { node.setPointerCapture(id); } catch (e) {} }

  function init() {
    el.wrap = document.getElementById('touch');
    el.move = document.getElementById('t-move');
    el.knob = el.move.querySelector('.t-knob');
    el.look = document.getElementById('t-look');

    var reveal = function () {
      if (active) return;
      active = true;
      document.body.classList.add('touch');
      el.wrap.hidden = false;
      var h = document.getElementById('hint');
      if (h) h.textContent = 'left thumb walks · right thumb looks around';
      removeEventListener('touchstart', reveal);
    };
    addEventListener('touchstart', reveal, { passive: true });

    bindStick();
    bindLook();
    return { isTouch: function () { return active; } };
  }

  function bindStick() {
    var box = function () { return el.move.getBoundingClientRect(); };
    var set = function (cx, cy) {
      var b = box(), rad = b.width * 0.5;
      var dx = cx - (b.left + rad), dy = cy - (b.top + rad);
      var len = Math.hypot(dx, dy) || 1;
      var k = Math.min(1, len / (rad * 0.85));
      move.x = (dx / len) * k;
      move.y = (dy / len) * k;
      el.knob.style.transform = 'translate(' + (move.x * rad * 0.45) + 'px,' + (move.y * rad * 0.45) + 'px)';
      root.Myk.setAnalog(move.x, move.y);
    };
    var end = function () {
      move.id = null; move.x = 0; move.y = 0;
      el.knob.style.transform = '';
      root.Myk.setAnalog(0, 0);
    };
    el.move.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      move.id = e.pointerId; capture(el.move, e.pointerId); set(e.clientX, e.clientY); e.preventDefault();
    });
    el.move.addEventListener('pointermove', function (e) {
      if (e.pointerId !== move.id) return;
      set(e.clientX, e.clientY); e.preventDefault();
    });
    el.move.addEventListener('pointerup', function (e) { if (e.pointerId === move.id) end(); });
    el.move.addEventListener('pointercancel', function (e) { if (e.pointerId === move.id) end(); });
  }

  function dist2(a, b) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function bindLook() {
    var pins = {};
    el.look.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse') return;
      pins[e.pointerId] = { clientX: e.clientX, clientY: e.clientY };
      if (!look.id) {
        look.id = e.pointerId; look.lx = e.clientX; look.ly = e.clientY;
      }
      var ids = Object.keys(pins);
      if (ids.length === 2) look.d0 = dist2(pins[ids[0]], pins[ids[1]]);
      capture(el.look, e.pointerId); e.preventDefault();
    });
    el.look.addEventListener('pointermove', function (e) {
      if (!pins[e.pointerId]) return;
      pins[e.pointerId] = { clientX: e.clientX, clientY: e.clientY };
      var ids = Object.keys(pins);
      if (ids.length >= 2) {
        var d = dist2(pins[ids[0]], pins[ids[1]]);
        if (look.d0 > 8) root.Myk.zoomBy(d / look.d0);
        look.d0 = d;
        e.preventDefault();
        return;
      }
      if (e.pointerId !== look.id) return;
      root.Myk.orbit((e.clientX - look.lx) * LOOK, (e.clientY - look.ly) * LOOK);
      look.lx = e.clientX; look.ly = e.clientY;
      e.preventDefault();
    });
    function up(e) {
      delete pins[e.pointerId];
      if (e.pointerId === look.id) look.id = null;
      var ids = Object.keys(pins);
      if (ids.length === 1) {
        look.id = +ids[0];
        look.lx = pins[ids[0]].clientX;
        look.ly = pins[ids[0]].clientY;
      }
    }
    el.look.addEventListener('pointerup', up);
    el.look.addEventListener('pointercancel', up);
  }

  root.MykTouch = { init: init };
})(window);
