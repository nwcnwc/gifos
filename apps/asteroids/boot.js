/*
 * Asteroids — GifOS shell.
 *
 * Starts the vendored game, wires the extra-ship net, keeps a high score
 * in gifos.db, and paints the scoreboard. Invite is OS chrome — this file
 * never draws an Invite button.
 */
(function (root) {
  'use strict';

  var G = null;
  var prefs = { mute: true, high: 0 };
  var scoreEl = document.getElementById('score');
  var scoreRows = document.getElementById('score-rows');
  var tally = document.getElementById('tally');
  var ffEl = document.getElementById('ff');

  function loadPrefs() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve();
    return root.gifos.db('prefs').get('prefs').then(function (row) {
      if (row) {
        if (row.mute != null) prefs.mute = !!row.mute;
        if (row.high) prefs.high = row.high | 0;
      }
    }).catch(function () {});
  }

  function savePrefs() {
    if (!root.gifos || !root.gifos.db) return;
    root.gifos.db('prefs').put({
      id: 'prefs', mute: prefs.mute, high: prefs.high
    }).catch(function () {});
  }

  function paintRoster(list) {
    if (G && list && list.length > 1) {
      G.roomy = true;
      if (ffEl && G.isHost) ffEl.hidden = false;
    }
    if (!list || list.length < 2) {
      scoreEl.hidden = true;
      tally.hidden = true;
      return;
    }
    tally.hidden = false;
    tally.textContent = list.length + ' ships';
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      html += '<tr class="' + (p.me ? 'me' : '') + (p.alive ? '' : ' dead') + '">' +
        '<td>' + escape(p.name) + (p.me ? ' (you)' : '') + '</td>' +
        '<td>' + (p.score | 0) + '</td>' +
        '<td>' + Math.max(0, (p.lives | 0) + (p.alive ? 1 : 0)) + '</td></tr>';
    }
    scoreRows.innerHTML = html;
  }

  function escape(s) {
    return String(s || '').replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function showBoard(on) {
    if (!scoreRows.innerHTML) return;
    scoreEl.hidden = !on;
  }

  function boot() {
    var canvas = document.getElementById('canvas');
    G = root.AsteroidsGame;
    G.touchy = false;
    G.highScore = prefs.high;
    G.mount(canvas);
    window.addEventListener('resize', function () { G.fit(); });

    root.SFX.muted = prefs.mute;

    root.Touch.init();

    G.hooks.afterFrame = function () {
      var playing = G.FSM && G.FSM.state !== 'waiting' && G.FSM.state !== 'boot';
      document.body.classList.toggle('playing', !!playing);
      if (root.Net && root.Net.live()) {
        root.Net.tick();
        root.Net.drawRemoteShots(G.context);
        root.Net.drawNames(G.context);
      }
      showBoard(G.showScores);
      if (root.SFX && root.SFX.muted !== prefs.mute) {
        prefs.mute = root.SFX.muted;
        savePrefs();
      }
      if (G.score > prefs.high) {
        prefs.high = G.score;
        G.highScore = prefs.high;
        savePrefs();
      }
    };
    G.hooks.onFire = function () {
      if (root.Net) root.Net.publish(true);
    };
    G.hooks.onDied = function () {};
    G.hooks.claimRock = function (rid) {
      if (root.Net) root.Net.claimRock(rid);
    };
    G.hooks.claimAlien = function () {
      if (root.Net) root.Net.claimAlien();
    };
    G.hooks.onFF = function (on) {
      if (ffEl) ffEl.textContent = on ? 'Friendly fire on' : 'Friendly fire off';
      if (root.Net) root.Net.publishWorld(true);
    };
    G.hooks.onStart = function () {
      if (root.Net && root.Net.owner()) root.Net.publishWorld(true);
    };
    G.hooks.onRockScore = function () {};

    tally.addEventListener('click', function () {
      G.showScores = !G.showScores;
      showBoard(G.showScores);
    });
    if (ffEl) {
      ffEl.addEventListener('click', function () {
        if (!G.isHost) return;
        G.friendlyFire = !G.friendlyFire;
        ffEl.textContent = G.friendlyFire ? 'Friendly fire on' : 'Friendly fire off';
        if (root.Net) root.Net.publishWorld(true);
      });
    }

    canvas.addEventListener('pointerdown', function () {
      if (root.SFX) root.SFX.unlock();
      if (G.FSM && G.FSM.state === 'waiting') root.gameStart = true;
    });

    var roomP = root.Net ? root.Net.init() : Promise.resolve({ owner: true, others: 0 });
    roomP.then(function (room) {
      room = room || { owner: true, others: 0 };
      G.isHost = !!room.owner;
      G.localId = (root.Net && root.Net.me() && root.Net.me().id) || 'me';
      G.roomy = !!(root.Net && root.Net.live()) && (room.others > 0 || !room.owner);
      if (G.roomy) {
        G.hudNote = G.isHost ? 'F toggles friendly fire' : 'Host flies the rocks';
        if (ffEl) {
          ffEl.hidden = false;
          ffEl.textContent = G.friendlyFire ? 'Friendly fire on' : 'Friendly fire off';
        }
      } else {
        G.hudNote = '';
      }
      if (root.Net) {
        root.Net.onRoster(paintRoster);
        root.Net.onFF(function (on) {
          if (ffEl) {
            ffEl.hidden = false;
            ffEl.textContent = on ? 'Friendly fire on' : 'Friendly fire off';
          }
        });
        paintRoster(root.Net.roster());
      }
      G.start();
    }).catch(function () { G.start(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      loadPrefs().then(boot);
    });
  } else {
    loadPrefs().then(boot);
  }
})(window);
