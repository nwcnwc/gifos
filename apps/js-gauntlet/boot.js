/*
 * Gauntlet — GifOS shell. Save in gifos.db, then start the original runner.
 */
(function (root) {
  'use strict';

  var api = root.gifos || null;
  var save = {};
  var timer = null;

  function flush() {
    var d = api && api.db && api.db('prefs');
    if (!d) return;
    d.put({ id: 'save', data: save }).catch(function () {});
  }

  function wrap(obj) {
    return new Proxy(obj, {
      set: function (t, k, v) {
        t[k] = v;
        clearTimeout(timer);
        timer = setTimeout(flush, 500);
        return true;
      }
    });
  }

  function pick(name) {
    var g = root.game;
    var T = root.GAUNTLET_TYPES;
    if (!g || !T || !T[name]) return;
    if (root.GauntletNet && !root.GauntletNet.isOwner()) {
      var free = root.GauntletNet.freeType();
      if (free && free !== name) return; // taken — wait for auto-join
    }
    if (g.current === 'menu' || g.current === 'booting') g.start(T[name]);
  }

  function wireImgs() {
    var A = root.GAUNTLET_ASSETS || {};
    function set(id, path) {
      var el = document.getElementById(id);
      if (el && A[path]) el.src = A[path];
    }
    // splash.jpg / logo.jpg copy the arcade wordmark — do not ship them.
    var i, keys = document.querySelectorAll('img.key'), pots = document.querySelectorAll('img.potion');
    for (i = 0; i < keys.length; i++) if (A['images/key.png']) keys[i].src = A['images/key.png'];
    for (i = 0; i < pots.length; i++) if (A['images/potion.png']) pots[i].src = A['images/potion.png'];
  }

  function wasd(ev, down) {
    var g = root.game, p = g && g.player;
    if (!p || !g.is || !g.is('playing')) return;
    var c = ev.keyCode;
    if (c === 65) { p.moveLeft(down); ev.preventDefault(); }
    else if (c === 68) { p.moveRight(down); ev.preventDefault(); }
    else if (c === 87) { p.moveUp(down); ev.preventDefault(); }
    else if (c === 83) { p.moveDown(down); ev.preventDefault(); }
  }

  function fit() {
    var canvas = document.getElementById('canvas');
    var splash = document.getElementById('title-card');
    if (!canvas) return;
    var touch = document.body.classList.contains('touch');
    var pad = touch ? Math.min(200, Math.max(156, root.innerHeight * 0.22)) : 0;
    var board = touch ? 84 : 0;
    var w = root.innerWidth;
    var h = Math.max(160, root.innerHeight - pad - board);
    var side = Math.min(w, h);
    canvas.style.width = Math.round(side) + 'px';
    canvas.style.height = Math.round(side) + 'px';
    if (splash) {
      splash.style.width = Math.round(side) + 'px';
      splash.style.height = Math.round(side) + 'px';
    }
    document.body.style.paddingBottom = pad ? pad + 'px' : '';
  }

  function boot() {
    wireImgs();
    Game.storage = function () { return wrap(save); };
    Game.run(Gauntlet);

    var nodes = document.querySelectorAll('#scoreboard .player[data-class]');
    for (var i = 0; i < nodes.length; i++) {
      (function (node) {
        node.addEventListener('click', function () { pick(node.getAttribute('data-class')); });
      })(nodes[i]);
    }
    document.addEventListener('keydown', function (ev) { wasd(ev, true); });
    document.addEventListener('keyup', function (ev) { wasd(ev, false); });
    fit();
    root.addEventListener('resize', fit);
    if (root.visualViewport) root.visualViewport.addEventListener('resize', fit);

    if (api && api.onBack) {
      api.onBack(function () {
        var g = root.game;
        if (g && g.is && g.is('help') && g.resume) { g.resume(); return true; }
        if (g && g.is && (g.is('playing') || g.is('won') || g.is('lost')) && g.quit) {
          g.quit();
          return true;
        }
        return false;
      });
    }
  }

  root.GauntletFit = fit;

  function start() {
    var d = api && api.db && api.db('prefs');
    if (!d) { boot(); return; }
    d.get('save').then(function (row) {
      if (row && row.data) save = row.data;
      boot();
    }).catch(function () { boot(); });
  }

  start();
})(window);
