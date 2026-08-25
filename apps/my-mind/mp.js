/* Optional meeting: the same map, on everyone else's screen.
 * Each person writes THEIR own row. The live host (lowest id) is the
 * map that is shown. Invite is OS chrome — this file only says to press it. */
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

  function mapJson() {
    try { return root.MyMind && root.MyMind.getJSON ? root.MyMind.getJSON() : null; } catch (e) { return null; }
  }

  function snapshot() {
    return { id: me.id, name: me.name, at: now(), map: mapJson() };
  }

  function publish() {
    if (!on || !room || !me.id) return;
    var s = snapshot();
    try { lastSent = JSON.stringify(s.map); } catch (e) { lastSent = ''; }
    room.put(s).catch(function () {});
  }

  function statusOf(players) {
    var others = players.filter(function (p) { return p.id !== me.id; });
    if (!others.length) {
      return 'Press Invite (top bar) so a friend can watch this map.';
    }
    if (guest) {
      var h = hostOf(players);
      var who = h && h.id !== me.id ? (h.name || 'a friend') : 'a friend';
      return 'Watching ' + who + "'s map. Edits they make land here.";
    }
    return (others.length === 1 ? 'A friend is watching.' : others.length + ' friends are watching.') +
      ' The same map, on their screen.';
  }

  function applyHost(players) {
    var h = hostOf(players);
    if (!h) return;
    guest = h.id !== me.id;
    var el = typeof document !== 'undefined' ? document.getElementById('meet') : null;
    if (el) el.textContent = statusOf(players);
    if (!guest || !h.map || !root.MyMind || !root.MyMind.loadJSON) return;
    var next;
    try { next = JSON.stringify(h.map); } catch (e) { return; }
    var cur;
    try { cur = JSON.stringify(mapJson()); } catch (e) { cur = ''; }
    if (next === cur || next === lastSent) return;
    if (root.MMSave && root.MMSave.applying) root.MMSave.applying(true);
    try { root.MyMind.loadJSON(h.map); } catch (e) {}
    if (root.MMSave && root.MMSave.applying) root.MMSave.applying(false);
    if (root.MMSave && root.MMSave.paintEmpty) root.MMSave.paintEmpty();
  }

  function start() {
    if (on) return;
    if (!root.gifos || !root.gifos.db) return;
    try { room = root.gifos.db('room'); } catch (e) { return; }
    if (!room || !room.subscribe) return;
    on = true;
    if (root.gifos.me) {
      root.gifos.me().then(function (m) {
        if (m && m.id) { me.id = m.id; me.name = m.name || 'You'; }
        publish();
      }).catch(function () {});
    }
    room.subscribe(function (rows) {
      applyHost(live(rows));
    });
    hbTimer = setInterval(publish, HB_MS);
  }

  root.MMMp = {
    start: start,
    noteChange: function () { if (on) publish(); },
    _hostOf: hostOf,
    _live: live,
    _statusOf: statusOf
  };
})(typeof window !== 'undefined' ? window : this);
