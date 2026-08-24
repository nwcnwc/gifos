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
        if (k === 'best' && typeof v === 'number' && v > best) best = v;
        clearTimeout(timer);
        timer = setTimeout(flush, 400);
        return true;
      }
    });
  }

  function paintBest() {
    var el = document.getElementById('best');
    if (el && best) el.textContent = 'BEST ' + String(Math.floor(best)).padStart(5, '0');
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
    paintBest();
    setInterval(function () {
      var p = root.player;
      if (!p || typeof p.score !== 'number') return;
      if (p.score > best) {
        best = p.score;
        save.best = best;
        flush();
        paintBest();
      }
    }, 400);
  }

  function go() {
    wire();
    var wantMute = !!save.mute;
    Game.storage = function () { return wrap(save); };
    Delta();
    if (root.engine && root.engine.storage) root.engine.storage.mute = wantMute;
    if (typeof AudioFX !== 'undefined') AudioFX.mute = wantMute;
    var soundEl = document.getElementById('sound');
    if (soundEl) {
      soundEl.className = wantMute ? 'off' : 'on';
      soundEl.style.display = '';
      soundEl.setAttribute('title', wantMute ? 'unmute' : 'mute');
      soundEl.addEventListener('click', function () {
        save.mute = !!(root.engine && root.engine.storage && root.engine.storage.mute);
        soundEl.setAttribute('title', save.mute ? 'unmute' : 'mute');
        flush();
      });
    }
    watchScore();
    var canvas = document.getElementById('canvas');
    if (canvas) {
      canvas.addEventListener('pointerdown', function () {
        if (root.engine && root.engine.isTitle && root.engine.isTitle()) root.engine.start();
      });
    }
    if (api && api.onBack) {
      api.onBack(function () {
        if (root.engine && root.engine.isPlaying && (root.engine.isPlaying() || root.engine.isPreparing())) {
          root.engine.quit();
          return true;
        }
        return false;
      });
    }
  }

  function start() {
    var d = api && api.db && api.db('prefs');
    if (!d) { go(); return; }
    d.get('save').then(function (row) {
      if (row && row.data) save = row.data;
      if (row && typeof row.best === 'number') best = row.best;
      else if (typeof save.best === 'number') best = save.best;
      go();
    }).catch(function () { go(); });
  }
  start();
})(window);
