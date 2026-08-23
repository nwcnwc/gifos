/*
 * SkiFree — touch ski.
 *
 * Upstream aimed the skier with Hammer.js pan/tap on the canvas and double-
 * tap for a boost. Same idea, no library: a finger on the piste writes the
 * same mouse target the engine already follows, so the vendored Skier never
 * learns it is being flown by a thumb.
 *
 * Revealed on the first real touchstart. A laptop with a touchscreen must
 * not get the boost button until a finger actually lands.
 */
(function (root) {
  'use strict';

  var active = false;
  var canvas = null;
  var game = null;
  var player = null;
  var lastTap = 0;
  var padId = null;

  function isTouch() { return active; }

  function capture(node, id) { try { node.setPointerCapture(id); } catch (e) {} }

  function reveal() {
    if (active) return;
    active = true;
    document.body.classList.add('touch');
    var wrap = document.getElementById('touch');
    if (wrap) wrap.hidden = false;
    var hint = document.getElementById('hint');
    if (hint) hint.textContent = 'Drag to ski · double-tap or BOOST to go faster';
    removeEventListener('touchstart', reveal);
  }

  function point(ev) {
    if (!game || !canvas) return;
    var r = canvas.getBoundingClientRect();
    game.setMouseX(ev.clientX - r.left);
    game.setMouseY(ev.clientY - r.top);
  }

  function skiToward(ev) {
    if (!player || (root.Ski && root.Ski.isOver && root.Ski.isOver())) return;
    point(ev);
    player.resetDirection();
    player.startMovingIfPossible();
  }

  function bindCanvas() {
    canvas.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType === 'touch') reveal();
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      padId = ev.pointerId;
      capture(canvas, ev.pointerId);
      if (root.Ski && root.Ski.isOver && root.Ski.isOver()) {
        if (root.Ski.resetGame) root.Ski.resetGame();
        ev.preventDefault();
        return;
      }
      var t = Date.now();
      if (t - lastTap < 280 && player) player.speedBoost();
      lastTap = t;
      skiToward(ev);
      ev.preventDefault();
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (ev.pointerId !== padId) {
        if (ev.pointerType === 'mouse') {
          point(ev);
          if (player && !player.hasBeenHit) player.resetDirection();
        }
        return;
      }
      skiToward(ev);
      ev.preventDefault();
    });
    function end(ev) {
      if (ev.pointerId !== padId) return;
      padId = null;
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    canvas.addEventListener('click', function (ev) {
      if (root.Ski && root.Ski.isOver && root.Ski.isOver()) {
        if (root.Ski.resetGame) root.Ski.resetGame();
        ev.preventDefault();
      }
    });
  }

  function bindBoost() {
    var el = document.getElementById('t-boost');
    if (!el) return;
    var held = null;
    el.addEventListener('pointerdown', function (ev) {
      held = ev.pointerId;
      el.classList.add('on');
      capture(el, ev.pointerId);
      if (player && !(root.Ski && root.Ski.isOver && root.Ski.isOver())) player.speedBoost();
      ev.preventDefault();
      ev.stopPropagation();
    });
    function up(ev) {
      if (ev.pointerId !== held) return;
      held = null;
      el.classList.remove('on');
    }
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function init(c, g, p) {
    canvas = c;
    game = g;
    player = p;
    addEventListener('touchstart', reveal, { passive: true });
    if (canvas) bindCanvas();
    bindBoost();
    document.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
    return { isTouch: isTouch };
  }

  root.Touch = { init: init, isTouch: isTouch };
})(window);
