/*
 * HexGL — visible thumb pad.
 *
 * Upstream's TouchController is an invisible left-half stick plus a
 * right-half accelerate, and four fingers reload the page. That is not
 * a phone game. This pad writes analog steer into shipControls.touchController
 * (the same Vec2 the original reads) and GO/BRAKE into key.forward / backward,
 * so the vendored ship never learns it is being flown by a thumb.
 *
 * Shown only after a real touchstart, or immediately on a coarse/narrow
 * screen. A laptop with a touchscreen must not get the overlay until a
 * finger actually lands.
 */
(function (root) {
  'use strict';

  var active = false;
  var pad = { id: null };
  var steer = 0;
  var controls = null;

  function phoneish() {
    var pts = (root.navigator && root.navigator.maxTouchPoints) || 0;
    var coarse = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
    var narrow = Math.min(root.innerWidth || 0, root.innerHeight || 0) <= 520;
    return (pts > 0 && coarse) || (pts > 0 && narrow);
  }

  function capture(node, id) { try { node.setPointerCapture(id); } catch (e) {} }

  function setSteer(v) {
    steer = v;
    var knob = document.querySelector('#t-steer .t-knob');
    if (knob) knob.style.transform = 'translate(' + (v * 28) + 'px, 0)';
    apply();
  }

  function apply() {
    if (!controls) return;
    if (!controls.touchController) {
      controls.touchController = { stickVector: { x: 0, y: 0 } };
    }
    controls.touchController.stickVector.x = steer * 100;
  }

  function bindPad() {
    var el = document.getElementById('t-steer');
    if (!el) return;
    el.addEventListener('pointerdown', function (ev) {
      if (pad.id != null) return;
      pad.id = ev.pointerId;
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
      if (Math.abs(v) < 0.08) v = 0;
      setSteer(v);
    }
  }

  function bindHold(id, setter) {
    var el = document.getElementById(id);
    if (!el) return;
    var held = null;
    el.addEventListener('pointerdown', function (ev) {
      if (held != null) return;
      held = ev.pointerId;
      el.classList.add('on');
      setter(true);
      capture(el, ev.pointerId);
      ev.preventDefault();
    });
    function end(ev) {
      if (ev.pointerId !== held) return;
      held = null;
      el.classList.remove('on');
      setter(false);
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  function reveal() {
    if (active) return;
    active = true;
    document.body.classList.add('touch');
    var wrap = document.getElementById('touch');
    if (wrap) wrap.hidden = false;
    removeEventListener('touchstart', reveal);
  }

  function attach(shipControls) {
    controls = shipControls;
    apply();
  }

  function init() {
    addEventListener('touchstart', reveal, { passive: true });
    if (phoneish()) reveal();
    bindPad();
    bindHold('t-go', function (on) {
      if (controls) controls.key.forward = on;
    });
    bindHold('t-brake', function (on) {
      if (controls) controls.key.backward = on;
    });
    var wrap = document.getElementById('touch');
    if (wrap) wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    return { isTouch: function () { return active; }, attach: attach };
  }

  root.Touch = { init: init, attach: attach, isTouch: function () { return active; } };
})(window);
