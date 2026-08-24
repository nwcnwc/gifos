(function (root) {
  'use strict';
  var active = false, held = {};

  function phoneish() {
    var pts = (root.navigator && root.navigator.maxTouchPoints) || 0;
    var coarse = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
    var narrow = Math.min(root.innerWidth || 0, root.innerHeight || 0) <= 520;
    return (pts > 0 && coarse) || (pts > 0 && narrow);
  }

  function apply() {
    var p = root.player;
    if (!p) return;
    p.movingLeft = !!held.left;
    p.movingRight = !!held.right;
    p.movingUp = !!held.up;
    p.movingDown = !!held.down;
    p.firing = !!held.fire;
    if (held.fire && root.engine && root.engine.isTitle && root.engine.isTitle()) root.engine.start();
  }

  function bind(node) {
    var dir = node.getAttribute('data-dir');
    var set = function (on) {
      held[dir] = on;
      if (on) node.classList.add('on'); else node.classList.remove('on');
      apply();
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
    var btns = wrap.querySelectorAll('[data-dir]');
    for (var i = 0; i < btns.length; i++) bind(btns[i]);
    wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
