/*
 * Pac-Man — GifOS shell.
 *
 * Upstream is a canvas engine that listens for window keydown (arrows / space).
 * This file sizes the cabinet, reveals a d-pad on a real finger, saves the
 * high score in gifos.db, and publishes a cabinet roster when Invite is used.
 * Invite is OS chrome — this app never draws a share button.
 */
(function (root) {
  'use strict';

  var api = typeof gifos !== 'undefined' ? gifos : null;
  var saveDb = null, playersDb = null;
  try {
    if (api && api.db) {
      saveDb = api.db('save');
      playersDb = api.db('players');
    }
  } catch (e) {}

  var hiEl = document.getElementById('hi');
  var rosterEl = document.getElementById('roster');
  var hi = 0;
  var me = { id: 'local', name: 'You' };
  var others = {};
  var started = false;
  var lastPub = 0;
  var WASD = { KeyW: 38, KeyA: 37, KeyS: 40, KeyD: 39 };

  function sendKey(code) {
    if (root.Pacman) root.Pacman._key = code;
    root.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true }));
    if (root.Pacman) root.Pacman._key = 0;
  }

  function scoreNow() {
    return (root.Pacman && root.Pacman.score) ? (root.Pacman.score() | 0) : 0;
  }
  function lifeNow() {
    return (root.Pacman && root.Pacman.life) ? (root.Pacman.life() | 0) : 0;
  }

  function setHi(n) {
    hi = n | 0;
    hiEl.textContent = 'HI ' + hi;
  }

  function persist(n) {
    if (!saveDb || n <= hi) return;
    setHi(n);
    saveDb.put({ id: 'hi', score: n }).catch(function () {});
  }

  function roster() {
    var list = [{ id: me.id, name: me.name, mine: true, score: scoreNow(), life: lifeNow() }];
    Object.keys(others).forEach(function (id) {
      var p = others[id];
      list.push({ id: p.id, name: p.name || 'Player', mine: false, score: p.score || 0, life: p.life || 0 });
    });
    list.sort(function (a, b) { return b.score - a.score; });
    return list;
  }

  function paintRoster() {
    var list = roster();
    if (list.length < 2) {
      rosterEl.hidden = true;
      return;
    }
    rosterEl.hidden = false;
    rosterEl.innerHTML = list.map(function (p) {
      return '<div class="row' + (p.mine ? ' me' : '') + '"><span>' +
        (p.name || 'Player').replace(/[<>&]/g, '') +
        '</span><span>' + p.score + ' · ' + p.life + ' lives</span></div>';
    }).join('');
  }

  function publish() {
    if (!started || !playersDb || !me.id || me.id === 'local') return;
    var now = Date.now();
    if (now - lastPub < 400) return;
    lastPub = now;
    playersDb.put({
      id: me.id, name: me.name,
      score: scoreNow(), life: lifeNow(), t: now
    }).catch(function () {});
  }

  document.addEventListener('keydown', function (e) {
    var code = WASD[e.code];
    if (code) {
      sendKey(code);
      e.preventDefault();
    }
  });

  (function pad() {
    var wrap = document.getElementById('touch');
    var touchOn = false;
    function reveal() {
      if (touchOn) return;
      touchOn = true;
      document.body.classList.add('touch');
      wrap.hidden = false;
      document.removeEventListener('touchstart', reveal);
    }
    document.addEventListener('touchstart', reveal, { passive: true });

    var btns = wrap.querySelectorAll('[data-key]');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        var code = parseInt(btn.getAttribute('data-key'), 10);
        var down = function (e) {
          e.preventDefault();
          try { btn.setPointerCapture(e.pointerId); } catch (err) {}
          btn.classList.add('on');
          sendKey(code);
        };
        var up = function (e) {
          e.preventDefault();
          btn.classList.remove('on');
        };
        btn.addEventListener('pointerdown', down);
        btn.addEventListener('pointerup', up);
        btn.addEventListener('pointercancel', up);
      })(btns[i]);
    }
  })();

  function tick() {
    var s = scoreNow();
    persist(s);
    publish();
    paintRoster();
    root.requestAnimationFrame(tick);
  }

  function bootNet() {
    if (!api || !api.db || !playersDb) return;
    api.me().then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      if (me.id === 'local') return;
      started = true;
      playersDb.subscribe(function (list) {
        var seen = {};
        (list || []).forEach(function (p) {
          if (!p || !p.id || p.id === me.id) return;
          seen[p.id] = 1;
          others[p.id] = p;
        });
        Object.keys(others).forEach(function (id) { if (!seen[id]) delete others[id]; });
        paintRoster();
      });
      publish();
    }).catch(function () {});
  }

  function load() {
    if (!saveDb) { tick(); bootNet(); return; }
    saveDb.get('hi').then(function (row) {
      if (row && row.score) setHi(row.score | 0);
    }).catch(function () {}).then(function () {
      tick();
      bootNet();
    });
  }

  if (api && api.onBack) {
    api.onBack(function () { sendKey(32); return true; });
  }

  load();
})(window);
