/*
 * Q1K3 — extra bodies over a meeting.
 *
 * Upstream has no networking. The only channel GifOS gives an app is a
 * replicated collection. Two rules shape this:
 *
 *   1. A subscriber re-downloads the WHOLE collection on every change, so
 *      publish is slow (6 Hz) with interpolation, not a datagram stream.
 *   2. NOBODY WRITES TO ANYBODY ELSE'S ROW. Each player owns one record in
 *      `players`. Hits ride on the shooter's row; the target applies them.
 *
 * This is extra bodies in the same halls, not competitive netcode.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 6;
  var STALE_MS = 9000;
  var HIT_RING = 24;
  var CLAIM_TTL = 12000;

  var api = null;
  var me = { id: null, name: 'Player' };
  var others = {};
  var seq = 0;
  var pendingHits = [];
  var appliedClaims = {};
  var lastPublished = 0;
  var onHit = null;
  var onKill = null;
  var onRoster = null;
  var self = { hp: 100, k: 0, d: 0, alive: true, spawn: 0, lastKilledBy: null, killAck: {} };

  function db(n) { return api.db(n); }
  function now() { return Date.now(); }
  function r1(n) { return Math.round(n * 10) / 10; }
  function r2(n) { return Math.round(n * 100) / 100; }

  function tintFor(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h % 3;
  }

  function init() {
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve(null);
    return api.me().then(function (id) {
      me.id = id && id.id ? id.id : 'local';
      me.name = (id && id.name) || 'Player';
      var settled = false;
      return new Promise(function (resolve) {
        var done = function (list) { if (!settled) { settled = true; resolve(list || []); } };
        setTimeout(function () { done([]); }, 2500);
        db('players').subscribe(function (list) {
          ingest(list || []);
          done(list || []);
        });
      });
    }).catch(function () { return null; });
  }

  function ingest(list) {
    var t = now(), seen = {};
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id) continue;
      if (p.id === me.id) {
        if (p.k > self.k) self.k = p.k;
        continue;
      }
      seen[p.id] = 1;
      drainClaims(p);
      var cur = others[p.id];
      var moved = !cur || cur.x !== p.x || cur.y !== p.y || cur.z !== p.z || cur.stamp !== p.t;
      others[p.id] = {
        id: p.id, name: p.name || 'Player',
        x: p.x, y: p.y, z: p.z, yaw: p.yaw || 0, pitch: p.pitch || 0,
        mv: !!p.mv, alive: p.alive !== false, hp: p.hp == null ? 100 : p.hp,
        k: p.k || 0, d: p.d || 0, spawn: p.sp || 0,
        stamp: p.t, seen: moved ? t : cur.seen, t: t, kind: tintFor(p.id),
        prev: cur ? { x: cur.x, y: cur.y, z: cur.z, yaw: cur.yaw, t: cur.t } : null
      };
      if (p.lastKilledBy && p.lastKilledBy.by === me.id) {
        var ak = p.id + ':' + p.lastKilledBy.at;
        if (!self.killAck[ak]) {
          self.killAck[ak] = 1; self.k++;
          if (onKill) onKill(p.name || 'Player');
          publish(true);
        }
      }
    }
    for (var id in others) {
      if (!seen[id] || now() - others[id].seen > STALE_MS) delete others[id];
    }
    if (onRoster) onRoster(roster());
  }

  function drainClaims(p) {
    if (!p.hits || !p.hits.length || !onHit) return;
    for (var i = 0; i < p.hits.length; i++) {
      var h = p.hits[i];
      if (!h || h.to !== me.id) continue;
      var key = p.id + ':' + h.n;
      if (appliedClaims[key]) continue;
      appliedClaims[key] = now();
      if (h.sp != null && h.sp !== self.spawn) continue;
      if (!self.alive) continue;
      onHit(h.d || 0, p.id, p.name || 'Player');
    }
    var cutoff = now() - CLAIM_TTL;
    for (var k in appliedClaims) if (appliedClaims[k] < cutoff) delete appliedClaims[k];
  }

  function claimHit(targetId, dmg, targetSpawn) {
    if (!api || !me.id) return;
    pendingHits.push({ to: targetId, d: Math.round(dmg), n: ++seq, sp: targetSpawn });
    if (pendingHits.length > HIT_RING) pendingHits.shift();
    publish(true);
  }

  function setSelf(s) {
    if (s.hp != null) self.hp = s.hp;
    if (s.alive != null) self.alive = s.alive;
    if (s.spawn != null) self.spawn = s.spawn;
    if (s.deaths != null) self.d = s.deaths;
    if (s.killedBy) self.lastKilledBy = { by: s.killedBy, at: s.spawn };
  }

  function pose() {
    var p = typeof game_entity_player !== 'undefined' ? game_entity_player : null;
    if (!p) return null;
    return {
      x: p.p.x, y: p.p.y, z: p.p.z,
      yaw: p._yaw, pitch: p._pitch,
      mv: !!(p.a && (p.a.x || p.a.z)),
      hp: p._health, alive: !p._dead
    };
  }

  function publish(force) {
    if (!api || !me.id) return;
    var t = now();
    if (!force && t - lastPublished < 1000 / PUBLISH_HZ) return;
    var po = pose();
    if (!po) return;
    lastPublished = t;
    db('players').put({
      id: me.id, name: me.name,
      x: r1(po.x), y: r1(po.y), z: r1(po.z),
      yaw: r2(po.yaw), pitch: r2(po.pitch),
      mv: po.mv ? 1 : 0,
      alive: po.alive, hp: Math.round(po.hp),
      k: self.k, d: self.d, sp: self.spawn,
      lastKilledBy: self.lastKilledBy,
      hits: pendingHits.slice(),
      t: t
    }).catch(function () {});
  }

  function poseOf(o) {
    if (!o.prev) return { x: o.x, y: o.y, z: o.z, yaw: o.yaw };
    var span = Math.max(60, o.t - o.prev.t);
    var a = Math.min(1, Math.max(0, (now() - (1000 / PUBLISH_HZ) - o.prev.t) / span));
    var dyaw = ((o.yaw - o.prev.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return {
      x: o.prev.x + (o.x - o.prev.x) * a,
      y: o.prev.y + (o.y - o.prev.y) * a,
      z: o.prev.z + (o.z - o.prev.z) * a,
      yaw: o.prev.yaw + dyaw * a
    };
  }

  function tick() {
    if (!api || !me.id) return;
    var p = typeof game_entity_player !== 'undefined' ? game_entity_player : null;
    if (p) {
      self.hp = p._health;
      self.alive = !p._dead;
    }
    publish(false);
  }

  function roster() {
    var p = typeof game_entity_player !== 'undefined' ? game_entity_player : null;
    var list = [{
      id: me.id, name: me.name, me: true,
      k: self.k, d: self.d,
      alive: p ? !p._dead : self.alive
    }];
    for (var id in others) {
      var o = others[id];
      list.push({ id: o.id, name: o.name, me: false, k: o.k, d: o.d, alive: o.alive });
    }
    list.sort(function (a, b) { return (b.k - a.k) || a.name.localeCompare(b.name); });
    return list;
  }

  function countOthers() {
    var n = 0;
    for (var k in others) n++;
    return n;
  }

  root.Net = {
    init: init,
    tick: tick,
    publish: publish,
    setSelf: setSelf,
    claimHit: claimHit,
    poseOf: poseOf,
    roster: roster,
    others: function () { return others; },
    me: function () { return me; },
    count: function () { return countOthers() + (me.id ? 1 : 0); },
    live: function () { return !!api && !!me.id; },
    onHit: function (fn) { onHit = fn; },
    onKill: function (fn) { onKill = fn; },
    onRoster: function (fn) { onRoster = fn; }
  };
})(window);
