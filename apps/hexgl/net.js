/*
 * HexGL — ghost race over a meeting.
 *
 * Upstream has no networking. Each pilot owns one row in `players` and
 * only ever writes that row: pose, lap, finish, best. A subscriber
 * re-downloads the whole collection on every change, so publish is 8 Hz
 * with interpolation, not a datagram stream. Nobody collides with
 * anybody else — extra ships are ghosts on the same track. Invite is OS chrome.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 8;
  var STALE_MS = 9000;

  var api = null;
  var me = { id: null, name: 'Pilot' };
  var others = {};
  var lastPublished = 0;
  var onRoster = null;
  var owner = true;

  function db(n) {
    try { return api && api.db ? api.db(n) : null; } catch (e) { return null; }
  }
  function r1(n) { return Math.round(n * 10) / 10; }
  function r2(n) { return Math.round(n * 100) / 100; }
  function r3(n) { return Math.round(n * 1000) / 1000; }

  function tintFor(id) {
    var h = 0;
    id = String(id || '');
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return (h % 360);
  }

  function init() {
    api = root.gifos;
    if (!api || !api.db || !api.me) {
      owner = true;
      return Promise.resolve({ owner: true, others: 0 });
    }
    var infoP = api.info ? api.info().then(function (i) {
      owner = !!(i && i.owner);
      return owner;
    }).catch(function () { owner = true; return true; }) : Promise.resolve(true);

    return infoP.then(function () { return api.me(); }).then(function (id) {
      me.id = id && id.id ? id.id : 'local';
      me.name = (id && id.name) || 'Pilot';
      var settled = false;
      return new Promise(function (resolve) {
        var done = function () {
          if (settled) return;
          settled = true;
          resolve({ owner: owner, others: countOthers() });
        };
        setTimeout(done, 2200);
        var p = db('players');
        if (p) p.subscribe(function (list) {
          ingest(list || []);
          done();
        });
        else done();
      });
    }).catch(function () {
      return { owner: true, others: 0 };
    });
  }

  function ingest(list) {
    var t = Date.now(), seen = {};
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id || p.id === me.id) continue;
      seen[p.id] = 1;
      var cur = others[p.id];
      var moved = !cur || cur.x !== p.x || cur.z !== p.z || cur.stamp !== p.t;
      others[p.id] = {
        id: p.id, name: p.name || 'Pilot',
        x: p.x, y: p.y, z: p.z,
        qx: p.qx, qy: p.qy, qz: p.qz, qw: p.qw,
        lap: p.lap || 0, fin: p.fin || 0, best: p.best || 0,
        stamp: p.t, seen: moved ? t : cur.seen, t: t,
        hue: tintFor(p.id),
        prev: cur ? { x: cur.x, y: cur.y, z: cur.z, qx: cur.qx, qy: cur.qy, qz: cur.qz, qw: cur.qw, t: cur.t } : null
      };
    }
    for (var id in others) {
      if (!seen[id] || Date.now() - others[id].seen > STALE_MS) delete others[id];
    }
    if (onRoster) onRoster(roster());
  }

  function poseOf(o) {
    if (!o.prev) return o;
    var span = Math.max(60, o.t - o.prev.t);
    var a = Math.min(1, Math.max(0, (Date.now() - (1000 / PUBLISH_HZ) - o.prev.t) / span));
    return {
      x: o.prev.x + (o.x - o.prev.x) * a,
      y: o.prev.y + (o.y - o.prev.y) * a,
      z: o.prev.z + (o.z - o.prev.z) * a,
      qx: o.prev.qx + (o.qx - o.prev.qx) * a,
      qy: o.prev.qy + (o.qy - o.prev.qy) * a,
      qz: o.prev.qz + (o.qz - o.prev.qz) * a,
      qw: o.prev.qw + (o.qw - o.prev.qw) * a
    };
  }

  function publish(st, force) {
    var p = db('players');
    if (!p || !me.id || !st) return;
    var now = Date.now();
    if (!force && now - lastPublished < 1000 / PUBLISH_HZ) return;
    lastPublished = now;
    p.put({
      id: me.id, name: me.name,
      x: r1(st.x), y: r1(st.y), z: r1(st.z),
      qx: r3(st.qx), qy: r3(st.qy), qz: r3(st.qz), qw: r3(st.qw),
      lap: st.lap | 0, fin: st.fin | 0, best: st.best | 0,
      t: now
    }).catch(function () {});
  }

  function roster() {
    var list = [];
    for (var id in others) {
      var o = others[id];
      list.push({
        id: o.id, name: o.name, me: false,
        best: o.best, fin: o.fin, lap: o.lap, hue: o.hue
      });
    }
    return list;
  }

  function ghosts() {
    var g = [];
    for (var id in others) {
      var o = others[id];
      var p = poseOf(o);
      g.push({
        id: o.id, name: o.name, hue: o.hue,
        x: p.x, y: p.y, z: p.z,
        qx: p.qx, qy: p.qy, qz: p.qz, qw: p.qw
      });
    }
    return g;
  }

  function countOthers() {
    var n = 0;
    for (var k in others) n++;
    return n;
  }

  root.Net = {
    init: init,
    publish: publish,
    roster: roster,
    ghosts: ghosts,
    me: function () { return me; },
    owner: function () { return owner; },
    live: function () { return !!api && !!me.id; },
    count: function () { return countOthers() + (me.id ? 1 : 0); },
    onRoster: function (fn) { onRoster = fn; }
  };
})(window);
