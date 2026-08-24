(function (root) {
  'use strict';
  var api = root.gifos || null;
  var save = {};
  var timer = null;
  var best = 0;

  function flush() {
    var d = api && api.db && api.db('prefs');
    if (d) d.put({ id: 'save', data: save, best: best }).catch(function () {});
  }
  function wrap(obj) {
    return new Proxy(obj, {
      set: function (t, k, v) {
        t[k] = v;
        clearTimeout(timer);
        timer = setTimeout(flush, 400);
        return true;
      }
    });
  }

  window.FPSMeter = function () { return { tickStart: function () {}, tick: function () {} }; };

  function wire() {
    var A = root.DELTA_ASSETS || {};
    var boot = document.getElementById('booting');
    if (boot && A['images/booting.gif']) boot.src = A['images/booting.gif'];
    var lives = document.querySelectorAll('#scoreboard .lives img');
    for (var i = 0; i < lives.length; i++) {
      if (A['images/life.png']) lives[i].src = A['images/life.png'];
    }
  }

  function watchScore() {
    var el = document.getElementById('best');
    setInterval(function () {
      var p = root.player;
      if (!p || typeof p.score !== 'number') return;
      if (p.score > best) { best = p.score; save.best = best; flush(); }
      if (el && best) el.textContent = 'best ' + String(best).padStart(5, '0');
    }, 400);
  }

  function go() {
    wire();
    Game.storage = function () { return wrap(save); };
    Delta();
    watchScore();
    var canvas = document.getElementById('canvas');
    if (canvas) {
      canvas.addEventListener('pointerdown', function () {
        if (root.engine && root.engine.isTitle && root.engine.isTitle()) root.engine.start();
      });
    }
  }

  function start() {
    var d = api && api.db && api.db('prefs');
    if (!d) { go(); return; }
    d.get('save').then(function (row) {
      if (row && row.data) save = row.data;
      if (row && row.best) best = row.best;
      else if (save.best) best = save.best;
      go();
    }).catch(function () { go(); });
  }
  start();
})(window);
