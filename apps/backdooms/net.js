/*
 * Extra bodies — each player writes ONLY their own row.
 * Invite is OS chrome.
 */
(function (root) {
  'use strict';

  var db = null, me = { id: 'solo', name: 'you' };
  var lastPub = 0;
  var roster = [];

  function init() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve();
    db = gifos.db('players');
    return gifos.me().then(function (who) {
      if (who && who.id) me = who;
      db.subscribe(onAll);
      publish(true);
    }).catch(function () {});
  }

  function onAll(rows) {
    var now = Date.now(), list = [], i, r;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      if (!r || !r.id) continue;
      if (now - (r.t || 0) > 8000) continue;
      if (r.id === me.id) continue;
      list.push({ x: r.x, y: r.y, a: r.a, h: r.hp, name: r.name });
    }
    roster = rows;
    if (root.Backdooms && root.Backdooms.setRemotes) root.Backdooms.setRemotes(list);
    var n = 1 + list.length;
    var tally = document.getElementById('tally');
    var room = document.getElementById('gate-room');
    if (tally) {
      tally.hidden = n < 2;
      tally.textContent = n + ' in the halls';
    }
    if (room) {
      room.textContent = n < 2
        ? 'Press Invite in the bar above to send the link.'
        : n + ' in the halls. Extra people appear as pale figures.';
    }
  }

  function publish(force) {
    if (!db) return;
    var now = Date.now();
    if (!force && now - lastPub < 80) return;
    lastPub = now;
    var s = root.Backdooms.state();
    db.put({
      id: me.id, name: me.name || 'you',
      x: s.x, y: s.y, a: s.a, hp: s.hp, score: s.score, t: now
    }).catch(function () {});
  }

  function tick() { publish(false); }

  function paintHud() {
    var s = root.Backdooms.state();
    var ammo = document.getElementById('ammo-label');
    var score = document.getElementById('score-label');
    var best = document.getElementById('best-label');
    if (ammo) ammo.textContent = 'AMMO ' + s.ammo;
    if (score) score.textContent = 'SCORE ' + s.score;
    if (best && root.Boot) best.textContent = root.Boot.best ? ('BEST ' + root.Boot.best) : '';
  }

  root.Net = { init: init, tick: function () { tick(); paintHud(); }, publish: publish };
})(window);
