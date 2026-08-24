/*
 * Tiny Platformer — thumb buttons.
 * LEFT / RIGHT / JUMP write the same player.left / player.right / player.jump
 * flags the keyboard does, so the vendored loop never learns it is a thumb.
 */
(function (root) {
  'use strict';

  var active = false;

  function phoneish() {
    var pts = (root.navigator && root.navigator.maxTouchPoints) || 0;
    var coarse = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
    var narrow = (root.innerWidth || 0) <= 520;
    return coarse || (pts > 0 && narrow) || narrow;
  }

  function apply(key, on) {
    var p = root.Tiny && root.Tiny.player && root.Tiny.player();
    if (!p) return;
    if (key === 'left') p.left = on;
    else if (key === 'right') p.right = on;
    else if (key === 'jump') p.jump = on;
  }

  function bind(node) {
    var key = node.getAttribute('data-key');
    if (key === 'restart') {
      var go = function (e) {
        e.preventDefault();
        if (root.Tiny && root.Tiny.restart) root.Tiny.restart();
      };
      node.addEventListener('pointerdown', go);
      return;
    }
    var set = function (on) {
      apply(key, on);
      if (on) node.classList.add('on');
      else node.classList.remove('on');
    };
    var down = function (e) {
      e.preventDefault();
      try { node.setPointerCapture(e.pointerId); } catch (err) {}
      set(true);
    };
    var up = function (e) {
      e.preventDefault();
      set(false);
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('pointerleave', up);
    node.addEventListener('lostpointercapture', function () { set(false); });
  }

  function reveal() {
    if (active) return;
    active = true;
    document.body.classList.add('touch');
    var wrap = document.getElementById('touch');
    if (wrap) wrap.hidden = false;
    if (root.Tiny && root.Tiny.fit) root.Tiny.fit();
  }

  function init() {
    var wrap = document.getElementById('touch');
    if (!wrap) return;
    if (phoneish()) reveal();
    else addEventListener('touchstart', reveal, { passive: true });
    var btns = wrap.querySelectorAll('[data-key]');
    for (var i = 0; i < btns.length; i++) bind(btns[i]);
    wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
