/*
 * Tanks — netplay. Upstream's room IS a Node process with sockets.
 * That process stays behind. Each player owns exactly one row.
 * The shooter claims a hit; the target applies it to itself.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 8;
  var STALE_MS = 9000;
  var HIT_RING = 8;
  var SHOT_RING = 6;
  var CLAIM_TTL = 12000;

  var api = null;
  var me = { id: null, name: 'Player' };
  var others = {};
  var seq = 0;
  var shotSeq = 0;
  var pendingHits = [];
  var pendingShots = [];
  var appliedClaims = {};
  var seenShots = {};
  var onHit = null;
  var onKill = null;
  var onRoster = null;
  var onShot = null;
  var lastPublished = 0;
  var self = { lives: 3, k: 0, d: 0, alive: true, spawn: 0, lastKilledBy: null, killAck: {} };
  var started = false;

  function db(n) { return api.db(n); }
  function now() { return Date.now(); }
  function r2(n) { return Math.round(n * 100) / 100; }
  function tintFor(id) {
    var h = 0, i;
    for (i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return (h % 360) / 360;
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
    var t = now(), seen = {}, i, p, cur, moved, id;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (!p || !p.id) continue;
      if (p.id === me.id) { if (p.k > self.k) self.k = p.k; continue; }
      seen[p.id] = 1;
      drainClaims(p);
      drainShots(p);
      cur = others[p.id];
      moved = !cur || cur.x !== p.x || cur.y !== p.y || cur.stamp !== p.t;
      others[p.id] = {
        id: p.id, name: p.name || 'Player',
        x: p.x, y: p.y, rot: p.rot || 0, tur: p.tur || 0,
        alive: p.alive !== false,
        lives: p.lives == null ? 3 : p.lives,
        k: p.k || 0, d: p.d || 0, spawn: p.sp || 0,
        stamp: p.t, seen: moved ? t : cur.seen, t: t, hue: tintFor(p.id),
        prev: cur ? { x: cur.x, y: cur.y, rot: cur.rot, tur: cur.tur, t: cur.t } : null
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
    for (id in others) {
      if (!seen[id] || now() - others[id].seen > STALE_MS) delete others[id];
    }
    if (onRoster) onRoster(roster());
  }

  function drainClaims(p) {
    if (!p.hits || !p.hits.length || !onHit) return;
    var i, h, key, cutoff;
    for (i = 0; i < p.hits.length; i++) {
      h = p.hits[i];
      if (!h || h.to !== me.id) continue;
      key = p.id + ':' + h.n;
      if (appliedClaims[key]) continue;
      appliedClaims[key] = now();
      if (h.sp != null && h.sp !== self.spawn) continue;
      if (!self.alive) continue;
      onHit(h.d || 1, p.id, p.name || 'Player');
    }
    cutoff = now() - CLAIM_TTL;
    for (key in appliedClaims) if (appliedClaims[key] < cutoff) delete appliedClaims[key];
  }

  function drainShots(p) {
    if (!p.shots || !p.shots.length || !onShot) return;
    var i, s, key;
    for (i = 0; i < p.shots.length; i++) {
      s = p.shots[i];
      if (!s) continue;
      key = p.id + ':' + s.n;
      if (seenShots[key]) continue;
      seenShots[key] = now();
      onShot({ x: s.x, y: s.y, a: s.a, by: p.id });
    }
  }

  function claimHit(toId, dmg) {
    seq++;
    pendingHits.push({ n: seq, to: toId, d: dmg || 1, sp: (others[toId] && others[toId].spawn) || 0 });
    if (pendingHits.length > HIT_RING) pendingHits.shift();
    publish(true);
  }

  function claimShot(x, y, a) {
    shotSeq++;
    pendingShots.push({ n: shotSeq, x: r2(x), y: r2(y), a: r2(a) });
    if (pendingShots.length > SHOT_RING) pendingShots.shift();
    publish(true);
  }

  function tookHit(dmg, byId, byName) {
    if (!self.alive) return;
    self.lives -= dmg;
    if (self.lives <= 0) {
      self.lives = 0;
      self.alive = false;
      self.d++;
      self.lastKilledBy = { by: byId, at: now() };
    }
    publish(true);
  }

  function respawn(x, y) {
    self.alive = true;
    self.lives = 3;
    self.spawn++;
    self.lastKilledBy = null;
    publish(true);
  }

  function publish(force) {
    if (!started || !api || !me.id) return;
    var t = now();
    if (!force && t - lastPublished < 1000 / PUBLISH_HZ) return;
    lastPublished = t;
    var row = {
      id: me.id, name: me.name,
      x: r2(self.x), y: r2(self.y), rot: r2(self.rot), tur: r2(self.tur),
      alive: self.alive, lives: self.lives, k: self.k, d: self.d,
      sp: self.spawn, t: t,
      hits: pendingHits.slice(), shots: pendingShots.slice(),
      lastKilledBy: self.lastKilledBy
    };
    db('players').put(row).catch(function () {});
  }

  function tick(x, y, rot, tur) {
    self.x = x; self.y = y; self.rot = rot; self.tur = tur;
    started = true;
    publish(false);
  }

  function interpolate(p, t) {
    if (!p.prev) return p;
    var dt = Math.max(16, (p.t || t) - (p.prev.t || t));
    var u = Math.min(1, (t - p.seen) / dt);
    return {
      x: p.prev.x + (p.x - p.prev.x) * u,
      y: p.prev.y + (p.y - p.prev.y) * u,
      rot: p.prev.rot + (p.rot - p.prev.rot) * u,
      tur: p.prev.tur + (p.tur - p.prev.tur) * u
    };
  }

  function roster() {
    var out = [{ id: me.id, name: me.name, k: self.k, d: self.d, lives: self.lives, alive: self.alive, me: true }];
    var id;
    for (id in others) {
      out.push({ id: id, name: others[id].name, k: others[id].k, d: others[id].d, lives: others[id].lives, alive: others[id].alive, me: false });
    }
    return out;
  }

  function otherCount() {
    var n = 0, id;
    for (id in others) n++;
    return n;
  }

  root.TanksNet = {
    init: init,
    tick: tick,
    claimHit: claimHit,
    claimShot: claimShot,
    tookHit: tookHit,
    respawn: respawn,
    interpolate: interpolate,
    others: function () { return others; },
    me: function () { return me; },
    self: function () { return self; },
    roster: roster,
    otherCount: otherCount,
    onHit: function (fn) { onHit = fn; },
    onKill: function (fn) { onKill = fn; },
    onRoster: function (fn) { onRoster = fn; },
    onShot: function (fn) { onShot = fn; }
  };
})(window);
