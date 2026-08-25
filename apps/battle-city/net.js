/*
 * Eagle Defense — two devices, no game server.
 *
 * The only channel is the replicated collection. Each player owns exactly one
 * row in `players` and only ever writes that row. The host owns the single
 * `world` row and is the authority for the stage, the AI, the bricks and the
 * eagle. Guests publish pose + fire; the host reads those and simulates.
 *
 * A subscriber re-downloads the whole collection on every change, so we keep
 * the rate low (~8 Hz) and force a publish on fire. Staleness is "last time
 * WE saw this row CHANGE", not the sender's clock (anyroad's rule).
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 8;
  var STALE_MS = 8000;

  var api = null;
  var me = { id: null, name: 'Player' };
  var owner = true;
  var others = {};
  var world = null;
  var lastPublished = 0;
  var fireN = 0;
  var onWorld = null;
  var onRoster = null;

  function db(n) { return api.db(n); }
  function now() { return Date.now(); }
  var r1 = function (n) { return Math.round(n * 10) / 10; };

  function init() {
    api = root.gifos;
    if (!api || !api.db) {
      me.id = 'local';
      owner = true;
      return Promise.resolve({ me: me, owner: true, others: [] });
    }
    var infoP = api.info ? api.info().catch(function () { return { owner: true }; }) : Promise.resolve({ owner: true });
    var meP = api.me().catch(function () { return { id: 'local', name: 'Player' }; });
    return Promise.all([infoP, meP]).then(function (pair) {
      owner = !!(pair[0] && pair[0].owner);
      me.id = (pair[1] && pair[1].id) || 'local';
      me.name = (pair[1] && pair[1].name) || 'Player';
      var settled = false;
      return new Promise(function (resolve) {
        var done = function () {
          if (settled) return;
          settled = true;
          resolve({ me: me, owner: owner, others: roster() });
        };
        setTimeout(done, 2200);
        db('players').subscribe(function (list) {
          ingestPlayers(list || []);
          done();
        });
        db('world').subscribe(function (list) {
          var rec = null;
          for (var i = 0; i < (list || []).length; i++) if (list[i] && list[i].id === 'world') rec = list[i];
          world = rec;
          if (onWorld && rec) onWorld(rec);
        });
      });
    }).catch(function () {
      me.id = 'local';
      owner = true;
      return { me: me, owner: true, others: [] };
    });
  }

  function ingestPlayers(list) {
    var t = now(), seen = {};
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id) continue;
      if (p.id === me.id) continue;
      seen[p.id] = 1;
      var cur = others[p.id];
      var moved = !cur || cur.x !== p.x || cur.y !== p.y || cur.fireN !== p.fireN || cur.stamp !== p.t;
      others[p.id] = {
        id: p.id, name: p.name || 'Player',
        x: p.x, y: p.y, dir: p.dir || 'up',
        keys: p.keys || {}, fireN: p.fireN || 0, fireDir: p.fireDir,
        stamp: p.t, seen: moved ? t : cur.seen, t: t
      };
    }
    for (var id in others) {
      if (!seen[id] || now() - others[id].seen > STALE_MS) delete others[id];
    }
    if (onRoster) onRoster(roster());
  }

  function publish(pose, force) {
    if (!api || !me.id || me.id === 'local') return;
    var t = now();
    if (!force && t - lastPublished < 1000 / PUBLISH_HZ) return;
    lastPublished = t;
    var row = {
      id: me.id, name: me.name, t: t,
      x: r1(pose.x), y: r1(pose.y), dir: pose.dir,
      keys: pose.keys || {},
      fireN: pose.fireN || fireN,
      fireDir: pose.fireDir || pose.dir
    };
    db('players').put(row).catch(function () {});
  }

  function bumpFire() { return ++fireN; }

  function putWorld(snap) {
    if (!api || !owner || !me.id) return;
    snap.id = 'world';
    snap.hostId = me.id;
    snap.t = now();
    db('world').put(snap).catch(function () {});
  }

  function savePrefs(rec) {
    if (!api || !api.db) return;
    rec.id = 'hi';
    db('prefs').put(rec).catch(function () {});
  }
  function loadPrefs() {
    if (!api || !api.db) return Promise.resolve(null);
    return db('prefs').get('hi').catch(function () { return null; });
  }

  function roster() {
    var list = [{ id: me.id, name: me.name, me: true }];
    for (var id in others) list.push({ id: id, name: others[id].name, me: false });
    return list;
  }

  function otherList() {
    var out = [];
    for (var id in others) out.push(others[id]);
    return out;
  }

  root.BCNet = {
    init: init,
    publish: publish,
    bumpFire: bumpFire,
    fireN: function () { return fireN; },
    putWorld: putWorld,
    savePrefs: savePrefs,
    loadPrefs: loadPrefs,
    onWorld: function (cb) { onWorld = cb; },
    onRoster: function (cb) { onRoster = cb; },
    roster: roster,
    others: otherList,
    me: function () { return me; },
    isOwner: function () { return owner; },
    count: function () { var n = 1; for (var k in others) n++; return n; },
    world: function () { return world; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
