(function (root) {
  'use strict';
  var active = false;
  var held = { left: false, right: false, up: false, down: false, fire: false };
  var padPtr = null;

  function phoneish() {
    var pts = (root.navigator && root.navigator.maxTouchPoints) || 0;
    var coarse = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
    var narrow = Math.min(root.innerWidth || 0, root.innerHeight || 0) <= 520;
    return (pts > 0 && coarse) || (pts > 0 && narrow) || coarse;
  }

  function apply() {
    var p = root.player;
    if (p) {
      p.movingLeft = !!held.left;
      p.movingRight = !!held.right;
      p.movingUp = !!held.up;
      p.movingDown = !!held.down;
      p.firing = !!held.fire;
    }
    if (held.fire && root.engine && root.engine.isTitle && root.engine.isTitle()) root.engine.start();
  }

  function setFire(on, node) {
    held.fire = on;
    if (node) {
      if (on) node.classList.add('on'); else node.classList.remove('on');
    }
    apply();
  }

  function dirsFromPad(clientX, clientY, pad) {
    var r = pad.getBoundingClientRect();
    var x = clientX - r.left - r.width / 2;
    var y = clientY - r.top - r.height / 2;
    var m = Math.hypot(x, y);
    var dead = Math.min(r.width, r.height) * 0.16;
    held.left = held.right = held.up = held.down = false;
    if (m >= dead) {
      var ax = Math.abs(x), ay = Math.abs(y);
      if (ax > dead * 0.6) { if (x < 0) held.left = true; else held.right = true; }
      if (ay > dead * 0.6) { if (y < 0) held.up = true; else held.down = true; }
    }
    var knob = document.getElementById('d-knob');
    if (knob) {
      var nx = Math.max(-1, Math.min(1, x / (r.width / 2)));
      var ny = Math.max(-1, Math.min(1, y / (r.height / 2)));
      if (m < dead) { nx = 0; ny = 0; }
      knob.style.transform = 'translate(' + (nx * 28) + 'px,' + (ny * 28) + 'px)';
    }
    ['up', 'down', 'left', 'right'].forEach(function (d) {
      var b = pad.querySelector('[data-dir="' + d + '"]');
      if (b) { if (held[d]) b.classList.add('on'); else b.classList.remove('on'); }
    });
    apply();
  }

  function clearPad(pad) {
    held.left = held.right = held.up = held.down = false;
    padPtr = null;
    var knob = document.getElementById('d-knob');
    if (knob) knob.style.transform = 'translate(0,0)';
    if (pad) {
      var btns = pad.querySelectorAll('[data-dir]');
      for (var i = 0; i < btns.length; i++) btns[i].classList.remove('on');
    }
    apply();
  }

  function bindPad(pad) {
    pad.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      reveal();
      padPtr = e.pointerId;
      try { pad.setPointerCapture(e.pointerId); } catch (err) {}
      dirsFromPad(e.clientX, e.clientY, pad);
    });
    pad.addEventListener('pointermove', function (e) {
      if (padPtr !== e.pointerId) return;
      e.preventDefault();
      dirsFromPad(e.clientX, e.clientY, pad);
    });
    function up(e) {
      if (padPtr !== null && e.pointerId !== padPtr && e.type !== 'lostpointercapture') return;
      e.preventDefault();
      clearPad(pad);
    }
    pad.addEventListener('pointerup', up);
    pad.addEventListener('pointercancel', up);
    pad.addEventListener('lostpointercapture', function () { clearPad(pad); });
  }

  function bindFire(node) {
    var down = function (e) {
      e.preventDefault();
      reveal();
      try { node.setPointerCapture(e.pointerId); } catch (err) {}
      setFire(true, node);
    };
    var up = function (e) { e.preventDefault(); setFire(false, node); };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('lostpointercapture', function () { setFire(false, node); });
  }

  function reveal() {
    if (active) return;
    active = true;
    document.body.classList.add('touch');
    var wrap = document.getElementById('touch');
    if (wrap) wrap.hidden = false;
  }

  function init() {
    var wrap = document.getElementById('touch');
    if (!wrap) return;
    if (phoneish()) reveal();
    else addEventListener('touchstart', reveal, { passive: true });
    var pad = document.getElementById('dpad');
    var fire = document.getElementById('t-fire');
    if (pad) bindPad(pad);
    if (fire) bindFire(fire);
    wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
