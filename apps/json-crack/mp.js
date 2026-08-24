/* Optional meeting: the same document, on everyone else's screen.
 * Each person writes THEIR own row. The live host (lowest id) is the
 * document that is shown. Nobody writes anybody else's row.
 * Invite is OS chrome — this file only says to press it. */
(function (root) {
  'use strict';

  var STALE_MS = 9000;
  var HB_MS = 3000;
  var room = null;
  var me = { id: null, name: 'You' };
  var on = false;
  var hbTimer = 0;
  var seenAt = {};
  var guest = false;
  var lastSent = '';

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

  function hostOf(players) {
    if (!players.length) return null;
    var h = players[0];
    for (var i = 1; i < players.length; i++) {
      if (players[i].id < h.id) h = players[i];
    }
    return h;
  }

  function snapshot() {
    var text = root.JsonCrackApp ? root.JsonCrackApp.getText() : '';
    return { id: me.id, name: me.name, at: now(), text: text };
  }

  function publish() {
    if (!on || !room || !me.id) return;
    var s = snapshot();
    lastSent = s.text;
    room.put(s).catch(function () {});
  }

  function statusOf(players) {
    var others = players.filter(function (p) { return p.id !== me.id; });
    if (!others.length) {
      return 'Press Invite (top bar) to show this document in a meeting. Nothing is uploaded on its own.';
    }
    if (guest) {
      var h = hostOf(players);
      var who = h && h.id !== me.id ? (h.name || 'a friend') : 'a friend';
      return 'Showing ' + who + "'s document. Edit it — you both see the graph.';
    }
    return (others.length === 1 ? 'A friend is here.' : others.length + ' friends are here.') +
      ' Either of you can type; the graph follows.';
  }

  function applyHost(players) {
    var h = hostOf(players);
    if (!h) return;
    guest = h.id !== me.id;
    var el = document.getElementById('meet');
    if (el) el.textContent = statusOf(players);
    if (guest && h.text != null && root.JsonCrackApp && h.text !== root.JsonCrackApp.getText()) {
      root.JsonCrackApp.setText(h.text);
    }
  }

  function start() {
    if (!root.gifos || !root.gifos.db) return;
    try { room = root.gifos.db('room'); } catch (e) { return; }
    if (!room || !room.subscribe) return;
    on = true;
    root.gifos.me().then(function (m) {
      if (m && m.id) { me.id = m.id; me.name = m.name || 'You'; }
      publish();
    }).catch(function () {});
    room.subscribe(function (rows) {
      applyHost(live(rows));
    });
    hbTimer = setInterval(publish, HB_MS);
  }

  root.JsonCrackMp = {
    noteChange: function () { if (on) publish(); }
  };

  start();
})(typeof window !== 'undefined' ? window : this);
