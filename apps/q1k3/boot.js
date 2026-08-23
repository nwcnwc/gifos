/*
 * Q1K3 — GifOS shell.
 *
 * Starts the vendored game after a real gesture (pointer lock and Web
 * Audio both need one), keeps mouse speed in gifos.db, paints the
 * scoreboard, and wraps the loop so extra bodies stay in the halls.
 * Invite is OS chrome — this file never draws an Invite button.
 */
(function (root) {
  'use strict';

  var prefs = { speed: 10, invert: false };
  var starting = false;
  var deaths = 0, spawn = 0, killedBy = null;
  var showBoard = false;
  var COARSE = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
  var IS_TOUCH = (navigator.maxTouchPoints || 0) > 0 && COARSE;

  var gate = document.getElementById('gate');
  var go = document.getElementById('gate-go');
  var roomEl = document.getElementById('gate-room');
  var scoreEl = document.getElementById('score');
  var scoreRows = document.getElementById('score-rows');
  var tally = document.getElementById('tally');
  var speedEl = document.getElementById('m');
  var invertEl = document.getElementById('mi');

  function loadPrefs() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve();
    return root.gifos.db('prefs').get('prefs').then(function (row) {
      if (!row) return;
      if (row.speed != null) prefs.speed = row.speed;
      if (row.invert != null) prefs.invert = !!row.invert;
    }).catch(function () {});
  }

  function savePrefs() {
    if (!root.gifos || !root.gifos.db) return;
    root.gifos.db('prefs').put({
      id: 'prefs', speed: prefs.speed, invert: prefs.invert
    }).catch(function () {});
  }

  function applyPrefs() {
    if (speedEl) speedEl.value = prefs.speed;
    if (invertEl) invertEl.checked = prefs.invert;
  }

  function escape(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function paintRoster(list) {
    if (!list || list.length < 2) {
      scoreEl.hidden = true;
      tally.hidden = true;
      return;
    }
    tally.hidden = false;
    tally.textContent = list.length + ' in the halls';
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      html += '<tr class="' + (p.me ? 'me' : '') + (p.alive ? '' : ' dead') + '">' +
        '<td>' + escape(p.name) + (p.me ? ' (you)' : '') + '</td>' +
        '<td>' + (p.k | 0) + '</td>' +
        '<td>' + (p.d | 0) + '</td></tr>';
    }
    scoreRows.innerHTML = html;
    scoreEl.hidden = !showBoard;
  }

  function wrapGame() {
    var origInit = game_init;
    game_init = function (idx) {
      origInit(idx);
      if (root.Remote) root.Remote.onReset();
    };

    var origRun = game_run;
    game_run = function (t) {
      if (root.Touch && root.Touch.tick) root.Touch.tick();
      if (root.Remote) root.Remote.sync();
      origRun(t);
      if (root.Net) root.Net.tick();
    };

    var origKill = entity_player_t.prototype._kill;
    entity_player_t.prototype._kill = function () {
      deaths++;
      spawn++;
      if (root.Net) {
        root.Net.setSelf({
          hp: 0, alive: false, spawn: spawn, deaths: deaths,
          killedBy: killedBy
        });
        root.Net.publish(true);
      }
      origKill.call(this);
      killedBy = null;
    };
  }

  function goFullscreen() {
    var el = document.getElementById('g') || document.documentElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req) return;
    try {
      var p = req.call(el);
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  function startPlaying(ev) {
    if (starting || go.disabled) return;
    starting = true;
    go.disabled = true;
    go.textContent = 'Starting…';
    prefs.speed = speedEl ? (speedEl.value | 0) : prefs.speed;
    prefs.invert = invertEl ? !!invertEl.checked : prefs.invert;
    savePrefs();

    var g = document.getElementById('g');
    var c = document.getElementById('c');
    if (!IS_TOUCH && c && c.requestPointerLock) {
      try { c.requestPointerLock(); } catch (e) {}
    }
    if (IS_TOUCH) goFullscreen();

    wrapGame();

    if (typeof g.onclick === 'function') {
      g.onclick();
    }

    gate.classList.add('gone');
    setTimeout(function () { gate.style.display = 'none'; }, 400);

    if (root.Net) {
      root.Net.onHit(function (dmg, fromId) {
        killedBy = fromId;
        if (game_entity_player && !game_entity_player._dead) {
          game_entity_player._receive_damage({ p: game_entity_player.p }, dmg);
        }
      });
      root.Net.onKill(function (name) {
        if (typeof game_show_message === 'function') game_show_message('YOU FRAGGED ' + name);
      });
      root.Net.setSelf({ hp: 100, alive: true, spawn: spawn, deaths: deaths });
    }
  }

  function boot() {
    applyPrefs();
    if (speedEl) speedEl.addEventListener('change', function () {
      prefs.speed = speedEl.value | 0; savePrefs();
    });
    if (invertEl) invertEl.addEventListener('change', function () {
      prefs.invert = !!invertEl.checked; savePrefs();
    });

    root.Touch.init();

    document.addEventListener('keydown', function (e) {
      if (e.code === 'Tab') {
        e.preventDefault();
        showBoard = true;
        paintRoster(root.Net ? root.Net.roster() : null);
      }
    });
    document.addEventListener('keyup', function (e) {
      if (e.code === 'Tab') {
        showBoard = false;
        if (scoreEl) scoreEl.hidden = true;
      }
    });
    if (tally) tally.addEventListener('click', function () {
      showBoard = !showBoard;
      paintRoster(root.Net ? root.Net.roster() : null);
    });

    document.getElementById('c').addEventListener('contextmenu', function (e) { e.preventDefault(); });

    document.addEventListener('pointerlockerror', function () {
      if (IS_TOUCH) return;
      if (document.getElementById('no-pointer')) return;
      var n = document.createElement('div');
      n.id = 'no-pointer';
      n.textContent = 'This window cannot lock the pointer, so the view will not turn with the mouse.';
      document.body.appendChild(n);
    });

    var roomP = root.Net ? root.Net.init() : Promise.resolve(null);
    var loadP = root.q1k3_ready || Promise.resolve();

    Promise.all([roomP, loadP]).then(function (res) {
      var list = res[0];
      var others = 0;
      if (list && list.length) {
        var my = root.Net && root.Net.me() && root.Net.me().id;
        for (var i = 0; i < list.length; i++) {
          if (list[i] && list[i].id && list[i].id !== my) others++;
        }
      }
      if (others > 0 && roomEl) {
        roomEl.innerHTML = '<b>' + (others + 1) + '</b> already in the halls';
      }
      if (root.Net) {
        root.Net.onRoster(paintRoster);
        paintRoster(root.Net.roster());
      }
      go.disabled = false;
      go.textContent = 'Click to start';
    }).catch(function (err) {
      go.disabled = false;
      go.textContent = 'Click to start';
      if (roomEl) roomEl.textContent = (err && err.message) || 'Ready';
    });

    go.addEventListener('click', startPlaying);
    go.addEventListener('pointerup', startPlaying);
    root.addEventListener('keydown', function (ev) {
      if (starting || go.disabled) return;
      if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
      if (gate && gate.classList.contains('gone')) return;
      ev.preventDefault();
      startPlaying(ev);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      loadPrefs().then(boot);
    });
  } else {
    loadPrefs().then(boot);
  }
})(window);
