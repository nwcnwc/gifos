/*
 * Chrome Dino — thumb JUMP / DUCK.
 *
 * Original chrome://dino is tap-to-jump on a phone and has no duck button;
 * pterodactyls then require a keyboard. These two buttons write the same
 * keydown/keyup the runner already handles, so the vendored dino never
 * learns it is being flown by a thumb.
 *
 * Revealed on a phone, or after a finger lands. Tap on the desert still
 * jumps (the original full-screen controller).
 */
(function (root) {
  'use strict';

  var active = false;

  function phoneish() {
    var pts = (root.navigator && root.navigator.maxTouchPoints) || 0;
    var coarse = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
    var narrow = Math.min(root.innerWidth || 0, root.innerHeight || 0) <= 520;
    return (pts > 0 && coarse) || (pts > 0 && narrow);
  }

  function act(name, on) {
    var D = root.Dino;
    if (!D) return;
    if (name === 'jump') { if (on) D.jumpDown(); else D.jumpUp(); }
    else if (name === 'duck') { if (on) D.duckDown(); else D.duckUp(); }
  }

  function bind(node) {
    var name = node.getAttribute('data-act');
    var set = function (on) {
      act(name, on);
      if (on) node.classList.add('on');
      else node.classList.remove('on');
    };
    var down = function (e) {
      e.preventDefault();
      e.stopPropagation();
      try { node.setPointerCapture(e.pointerId); } catch (err) {}
      set(true);
    };
    var up = function (e) {
      e.preventDefault();
      e.stopPropagation();
      set(false);
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('lostpointercapture', function () { set(false); });
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
    var btns = wrap.querySelectorAll('[data-act]');
    for (var i = 0; i < btns.length; i++) bind(btns[i]);
    wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  root.Touch = { init: init };
})(window);
