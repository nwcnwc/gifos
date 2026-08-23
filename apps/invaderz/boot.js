/*
 * InvaderZ — GifOS shell.
 *
 * Starts the vendored game, wires the extra-cannon net, keeps a best
 * generation in gifos.db, and paints the scoreboard. Invite is OS chrome —
 * this file never draws an Invite button.
 */
(function (root) {
  'use strict';

  var G = null;
  var prefs = { high: 0 };
  var scoreEl = document.getElementById('score');
  var scoreRows = document.getElementById('score-rows');
  var tally = document.getElementById('tally');

  function loadPrefs() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve();
    return root.gifos.db('prefs').get('prefs').then(function (row) {
      if (row && row.high) prefs.high = row.high | 0;
    }).catch(function () {});
  }

  function savePrefs() {
    if (!root.gifos || !root.gifos.db) return;
    root.gifos.db('prefs').put({
      id: 'prefs', high: prefs.high
    }).catch(function () {});
  }

  function paintRoster(list) {
    if (G && list && list.length > 1) G.roomy = true;
    if (!list || list.length < 2) {
      scoreEl.hidden = true;
      tally.hidden = true;
      return;
    }
    tally.hidden = false;
    tally.textContent = list.length + ' cannons';
    var html = '';
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      html += '<tr class="' + (p.me ? 'me' : '') + '">' +
        '<td>' + escape(p.name) + (p.me ? ' (you)' : '') + '</td>' +
        '<td>' + (p.kills | 0) + '</td></tr>';
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
    G = root.InvaderZ;
    G.high = prefs.high;
    G.mount(canvas);

    root.Touch.init();

    G.hooks.afterFrame = function () {
      showBoard(G.showScores);
    };
    G.hooks.onKill = function (idx) {
      if (root.Net) root.Net.claim(idx);
    };
    G.hooks.onStart = function () {
      if (root.Net && root.Net.owner()) root.Net.publishWorld(true);
    };
    G.hooks.onHigh = function (n) {
      if (n > prefs.high) {
        prefs.high = n;
        savePrefs();
      }
    };

    tally.addEventListener('click', function () {
      G.showScores = !G.showScores;
      showBoard(G.showScores);
    });

    var roomP = root.Net ? root.Net.init() : Promise.resolve({ owner: true, others: 0 });
    roomP.then(function (room) {
      room = room || { owner: true, others: 0 };
      G.sim = !!room.owner;
      G.roomy = !!(root.Net && root.Net.live()) && (room.others > 0 || !room.owner);
      if (root.Net) {
        root.Net.onRoster(paintRoster);
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
