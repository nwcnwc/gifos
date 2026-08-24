/*
 * Dungeon — D-pad + FIRE + POTION. Writes the same Player.move* / fire / nuke
 * the keyboard does.
 */
(function (root) {
  'use strict';

  var active = false;
  var held = {};

  function phoneish() {
    var pts = (root.navigator && root.navigator.maxTouchPoints) || 0;
    var coarse = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
    var narrow = (root.innerWidth || 0) <= 720;
    return coarse || (pts > 0 && narrow) || narrow;
  }

  function me() {
    var g = root.game;
    return g && g.player;
  }

  function apply() {
    var p = me();
    if (!p || !p.moveLeft) return;
    p.moveLeft(!!held.left);
    p.moveRight(!!held.right);
    p.moveUp(!!held.up);
    p.moveDown(!!held.down);
    p.fire(!!held.fire);
  }

  function bind(node) {
    var dir = node.getAttribute('data-dir');
    var set = function (on) {
      if (dir === 'potion') {
        if (on && me() && me().nuke) me().nuke();
        if (root.GauntletNet) {
          held.potion = !!on;
          root.GauntletNet.noteInput(held);
          held.potion = false;
        }
        return;
      }
      held[dir] = on;
      if (on) node.classList.add('on');
      else node.classList.remove('on');
      apply();
      if (root.GauntletNet) root.GauntletNet.noteInput(held);
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
    if (root.GauntletFit) root.GauntletFit();
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
