/* D-pad for the world map and the ship. World already accepts taps and swipes. */
(function (root) {
  'use strict';

  var held = { up: false, down: false, left: false, right: false };
  var keys = { up: 38, down: 40, left: 37, right: 39 };

  function fire(which, down) {
    var E = root.Engine;
    if (!E) return;
    var ev = { which: which, keyCode: which, preventDefault: function () {} };
    if (down) {
      if (E.activeModule && E.activeModule.keyDown) E.activeModule.keyDown(ev);
      else if (E.keyDown) E.keyDown(ev);
    } else if (E.activeModule && E.activeModule.keyUp) {
      E.activeModule.keyUp(ev);
    }
  }

  function showPad(on) {
    var pad = document.getElementById('adr-pad');
    if (!pad) return;
    pad.hidden = !on;
    document.body.classList.toggle('adr-pad-on', !!on);
  }

  function sync() {
    var E = root.Engine;
    var world = E && E.activeModule === root.World;
    var space = E && E.activeModule === root.Space;
    var narrow = window.matchMedia && window.matchMedia('(max-width: 720px)').matches;
    var touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    showPad((world || space) && (touch || narrow));
  }

  function bind() {
    var pad = document.getElementById('adr-pad');
    if (!pad) return;
    pad.addEventListener('pointerdown', function (e) {
      var btn = e.target.closest('[data-dir]');
      if (!btn) return;
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch (err) {}
      var dir = btn.getAttribute('data-dir');
      if (held[dir]) return;
      held[dir] = true;
      fire(keys[dir], true);
    });
    function up(e) {
      var btn = e.target.closest ? e.target.closest('[data-dir]') : null;
      var dir = btn && btn.getAttribute('data-dir');
      if (!dir || !held[dir]) return;
      held[dir] = false;
      fire(keys[dir], false);
    }
    pad.addEventListener('pointerup', up);
    pad.addEventListener('pointercancel', up);
    pad.addEventListener('lostpointercapture', up);
  }

  root.Touch = {
    init: function () {
      bind();
      sync();
      window.addEventListener('resize', sync);
    },
    sync: sync
  };
})(window);
