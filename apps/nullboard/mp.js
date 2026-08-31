/* Optional meeting: the same board on everyone else's screen.
 * Each person writes THEIR own row. Newest `at` is the board that is shown.
 * Invite is OS chrome — this file only says to press it. */
(function (root) {
  'use strict';

  var STALE_MS = 12000;
  var room = null;
  var me = { id: null, name: 'You' };
  var on = false;
  var guest = false;
  var applying = false;
  var lastSent = '';
  var lastAt = 0;
  var pubTimer = 0;
  var seenAt = {};

  var now = function () { return Date.now(); };

  function live(list, t) {
    t = t || now();
    var out = [];
    (list || []).forEach(function (p) {
      if (!p || !p.id) return;
      var changed = !seenAt[p.id] || seenAt[p.id].stamp !== p.at;
      if (changed) seenAt[p.id] = { stamp: p.at, seen: t };
      if (t - seenAt[p.id].seen > STALE_MS) return;
      out.push(p);
    });
    return out;
  }

  function boardJson() {
    try { return root.NB && root.NB.board ? JSON.parse(JSON.stringify(root.NB.board)) : null; } catch (e) { return null; }
  }

  function snapshot() {
    return { id: me.id, name: me.name, at: now(), board: boardJson() };
  }

  function publish() {
    if (!on || !room || !me.id || applying) return;
    var s = snapshot();
    if (!s.board) return;
    var packed;
    try { packed = JSON.stringify(s.board); } catch (e) { return; }
    lastSent = packed;
    lastAt = s.at;
    room.put(s).catch(function () {});
  }

  function noteChange() {
    if (!on) return;
    if (pubTimer) clearTimeout(pubTimer);
    pubTimer = setTimeout(function () { pubTimer = 0; publish(); }, 280);
  }

  function newest(players) {
    var best = null;
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (!p || !p.board) continue;
      if (!best || (p.at | 0) > (best.at | 0)) best = p;
    }
    return best;
  }

  function statusOf(players) {
    var others = players.filter(function (p) { return p.id !== me.id; });
    var el = typeof document !== 'undefined' ? document.getElementById('meet') : null;
    if (!el) return;
    if (!others.length) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    var names = others.map(function (p) { return p.name || 'a friend'; });
    if (names.length === 1) el.textContent = names[0] + ' is on this board.';
    else el.textContent = names.join(', ') + ' are on this board.';
  }

  function applyRemote(row) {
    if (!row || !row.board || !root.NB) return;
    if (row.id === me.id) return;
    if ((row.at | 0) <= lastAt) return;
    var next;
    try { next = JSON.stringify(row.board); } catch (e) { return; }
    if (next === lastSent) return;
    var cur;
    try { cur = JSON.stringify(boardJson()); } catch (e) { cur = ''; }
    if (next === cur) {
      lastAt = row.at | 0;
      return;
    }
    applying = true;
    lastAt = row.at | 0;
    lastSent = next;
    try {
      if (typeof $ !== 'undefined') $('.board .edit').each(function () {
        if (this === document.activeElement) this.blur();
      });
      root.NB.board = row.board;
      if (root.NB.storage && root.NB.storage.setActiveBoard) {
        try { root.NB.storage.saveBoard(row.board); } catch (e) {}
        root.NB.board = row.board;
      }
      if (typeof root.showBoard === 'function') root.showBoard(true);
    } catch (e) {}
    applying = false;
  }

  function onList(rows) {
    var players = live(rows);
    statusOf(players);
    var n = newest(players);
    if (n) applyRemote(n);
  }

  function start() {
    if (on) return;
    if (!root.gifos || !root.gifos.db) return;
    try { room = root.gifos.db('room'); } catch (e) { return; }
    if (!room || !room.subscribe) return;
    on = true;
    var who = root.gifos.me ? root.gifos.me() : Promise.resolve({ id: 'local', name: 'You' });
    var info = root.gifos.info ? root.gifos.info() : Promise.resolve({ owner: true });
    Promise.all([who, info]).then(function (pair) {
      var id = pair[0], inf = pair[1];
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      guest = !!(inf && inf.owner === false);
      room.subscribe(onList);
      publish();
    }).catch(function () {});
  }

  root.NBMp = {
    start: start,
    noteChange: noteChange,
    applying: function () { return applying; },
    _newest: newest,
    _live: live
  };
})(typeof window !== 'undefined' ? window : this);
