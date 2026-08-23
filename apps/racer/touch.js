/*
 * Racer — touch controls.
 *
 * Upstream is keyboard only. Its own README says mobile is unplayable. On a
 * phone that is the app being broken, not a footnote, so this adds a thumb
 * layout without forking the loop:
 *
 *   left  — a steer pad. Horizontal axis, -1..1, written into Racer.setSteer
 *           so a thumb is analog (a key is still a snap left/right).
 *   right — GO (hold to accelerate) and a smaller BRAKE.
 *
 * Shown only after a real touchstart. A laptop with a touchscreen reports
 * ontouchstart and must not get a phone HUD laid over its keyboard game.
 */
(function (root) {
  'use strict';

  var active = false;
  var pad = { id: null, cx: 0, cy: 0 };
  var goId = null, brakeId = null;

  function isTouch() { return active; }

  function capture(node, id) { try { node.setPointerCapture(id); } catch (e) {} }

  function reveal() {
    if (active) return;
    active = true;
    document.body.classList.add('touch');
    var wrap = document.getElementById('touch');
    if (wrap) wrap.hidden = false;
    removeEventListener('touchstart', reveal);
  }

  function setSteer(v) {
    if (root.Racer) root.Racer.setSteer(v);
    var knob = document.querySelector('#t-steer .t-knob');
    if (knob) knob.style.transform = 'translate(' + (v * 28) + 'px, 0)';
  }

  function bindPad() {
    var el = document.getElementById('t-steer');
    if (!el) return;

    el.addEventListener('pointerdown', function (ev) {
      if (pad.id != null) return;
      pad.id = ev.pointerId;
      var r = el.getBoundingClientRect();
      pad.cx = r.left + r.width / 2;
      pad.cy = r.top + r.height / 2;
      capture(el, ev.pointerId);
      move(ev);
      ev.preventDefault();
    });
    el.addEventListener('pointermove', function (ev) {
      if (ev.pointerId !== pad.id) return;
      move(ev);
      ev.preventDefault();
    });
    function end(ev) {
      if (ev.pointerId !== pad.id) return;
      pad.id = null;
      setSteer(0);
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    function move(ev) {
      var r = el.getBoundingClientRect();
      var dx = ev.clientX - (r.left + r.width / 2);
      var max = r.width * 0.42;
      var v = Math.max(-1, Math.min(1, dx / max));
      if (Math.abs(v) < 0.12) v = 0;
      setSteer(v);
    }
  }

  function bindHold(id, setter, cls) {
    var el = document.getElementById(id);
    if (!el) return;
    var held = null;
    el.addEventListener('pointerdown', function (ev) {
      if (held != null) return;
      held = ev.pointerId;
      el.classList.add(cls || 'on');
      setter(true);
      capture(el, ev.pointerId);
      ev.preventDefault();
    });
    function end(ev) {
      if (ev.pointerId !== held) return;
      held = null;
      el.classList.remove(cls || 'on');
      setter(false);
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('pointerleave', function (ev) {
      if (ev.pointerId === held) end(ev);
    });
  }

  function init() {
    addEventListener('touchstart', reveal, { passive: true });
    bindPad();
    bindHold('t-go', function (on) { if (root.Racer) root.Racer.setFaster(on); });
    bindHold('t-brake', function (on) { if (root.Racer) root.Racer.setSlower(on); });
    return { isTouch: isTouch };
  }

  root.Touch = { init: init, isTouch: isTouch };
})(window);
