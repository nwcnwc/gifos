/*
 * Invite shares the bench. Each person writes THEIR own row in `room`.
 * Highest rev wins; ties go to the lowest id. Nobody writes anyone else's row.
 */
(function (root) {
  'use strict';

  var STALE_MS = 12000, HB_MS = 2500;
  var api = null, room = null, saveDb = null;
  var me = { id: null, name: 'You' };
  var on = false;
  var rev = 1;
  var usedRev = 0;
  var usedHash = '';
  var lastList = [];
  var seenAt = {};
  var lastPub = 0;
  var applying = false;

  function now() { return Date.now(); }
  function $id(id) { return document.getElementById(id); }

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

  function adopted(list) {
    var players = live(list);
    if (!players.length) return null;
    var maxR = 0;
    players.forEach(function (p) { if ((p.rev || 1) > maxR) maxR = p.rev || 1; });
    var cand = players.filter(function (p) { return (p.rev || 1) === maxR && p.json; });
    if (!cand.length) return null;
    cand.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    return cand[0];
  }

  function snapshot() {
    var app = root.DjsApp;
    var json = app ? app.currentJson() : null;
    return {
      id: me.id,
      name: me.name,
      rev: rev,
      at: now(),
      json: json,
      io: app ? app.currentIo() : {},
      running: app ? !!app.isRunning() : false,
      sample: app ? app.currentSample() : 'counter'
    };
  }

  function publish(force) {
    if (!on || !room || !me.id || applying) return;
    var t = now();
    if (!force && t - lastPub < 120) return;
    lastPub = t;
    room.put(snapshot()).catch(function () {});
  }

  function persistPrivate() {
    if (!saveDb || applying) return;
    var app = root.DjsApp;
    if (!app) return;
    saveDb.put({
      id: 'last',
      json: app.currentJson(),
      io: app.currentIo(),
      running: !!app.isRunning(),
      sample: app.currentSample()
    }).catch(function () {});
  }

  function applyWorld(ad) {
    if (!ad || !ad.json || !root.DjsApp) return;
    if (ad.id === me.id) return;
    var h = JSON.stringify(ad.json) + '|' + JSON.stringify(ad.io || {}) + '|' + (ad.running ? 1 : 0);
    if (ad.rev === usedRev && h === usedHash) return;
    applying = true;
    usedRev = ad.rev;
    usedHash = h;
    rev = ad.rev;
    try {
      root.DjsApp.loadFromNet(ad);
    } finally {
      applying = false;
    }
  }

  function renderMeet(list) {
    var el = $id('meet');
    if (!el) return;
    var players = live(list);
    var others = players.filter(function (p) { return p.id !== me.id; });
    if (!others.length) {
      el.textContent = 'Press Invite in the bar above to share this bench. A friend who opens the link sees the same circuit.';
      return;
    }
    var names = others.map(function (p) { return p.name || 'Friend'; });
    el.textContent = (names.length === 1 ? names[0] + ' is on this bench.' : names.length + ' friends on this bench.') +
      ' Anyone can flip a pin; Play is shared.';
  }

  function onRoom(list) {
    lastList = list || [];
    if (!on) return;
    var ad = adopted(lastList);
    if (ad) applyWorld(ad);
    renderMeet(lastList);
  }

  function bump() {
    rev += 1;
    publish(true);
    persistPrivate();
  }

  function init() {
    api = root.gifos;
    if (api && api.db) {
      try { saveDb = api.db('save'); } catch (e) {}
      try { room = api.db('room'); } catch (e) {}
    }
    var ready = Promise.resolve();
    if (api && api.me) {
      ready = api.me().then(function (id) {
        me.id = (id && id.id) || 'local';
        me.name = (id && id.name) || 'You';
      }).catch(function () { me.id = 'local'; });
    } else {
      me.id = 'local';
    }
    return ready.then(function () {
      var loaded = Promise.resolve(null);
      if (saveDb && saveDb.get) {
        loaded = saveDb.get('last').catch(function () { return null; });
      }
      return loaded;
    }).then(function (row) {
      if (room && room.subscribe) {
        on = true;
        room.subscribe(onRoom);
        setInterval(function () { publish(false); }, HB_MS);
      }
      return row;
    });
  }

  root.DjsNet = {
    init: init,
    me: function () { return me; },
    applying: function () { return applying; },
    noteChange: function () { persistPrivate(); publish(false); },
    noteCircuit: function () { bump(); },
    persistPrivate: persistPrivate
  };
})(typeof window !== 'undefined' ? window : this);
