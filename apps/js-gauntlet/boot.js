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
    if (g.current === 'menu' || g.current === 'booting') g.start(T[name]);
  }

  function wireImgs() {
    var A = root.GAUNTLET_ASSETS || {};
    function set(id, path) {
      var el = document.getElementById(id);
      if (el && A[path]) el.src = A[path];
    }
    set('booting', 'images/booting.gif');
    set('splash', 'images/splash.jpg');
    set('logo', 'images/logo.jpg');
    var i, keys = document.querySelectorAll('img.key'), pots = document.querySelectorAll('img.potion');
    for (i = 0; i < keys.length; i++) if (A['images/key.png']) keys[i].src = A['images/key.png'];
    for (i = 0; i < pots.length; i++) if (A['images/potion.png']) pots[i].src = A['images/potion.png'];
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
  }

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
