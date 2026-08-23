/*
 * IO Blobs — netplay transport.
 *
 * Upstream's room IS a Socket.IO server on Node (src/server/server.js): it
 * owns every ship, every bullet, the tick, the collisions. That server, the
 * webpack bundle, and every socket path stay behind. The room here is a
 * GifOS meeting; the only channel an app has is the replicated collection —
 * gifos.db('players').subscribe(...) — hosted by the host's browser. Two
 * properties shape every decision below:
 *
 *   1. A subscriber re-downloads the WHOLE collection on every change, so
 *      traffic is O(players²). The answer is a LOW publish rate with
 *      client-side interpolation, not a high one, and rows kept mean
 *      (coordinates rounded).
 *   2. There is no datagram path and no server tick. So this cannot be, and
 *      does not pretend to be, competitive-grade netcode.
 *
 * NOBODY WRITES TO ANYBODY ELSE'S ROW. Each player owns exactly one record
 * and only ever reads the others — fps-simple's rule (and anyroad's before
 * it). Pose and size ride on that row. That decides how eating flows:
 *
 *   - The EATER decides it swallowed someone, locally, against the bodies it
 *     can see. Claims ride on the eater's own row as a short ring of recent
 *     eats. Food ids it swallowed ride there too, so the pellets vanish for
 *     everyone.
 *   - The TARGET decides what that costs it. It applies the swallow to
 *     itself, decides its own death, and publishes its own size. A client
 *     that ignored incoming eats would be cheating, and it would be cheating
 *     in a game you reach by sending someone a link — the threat model is
 *     friends, so the honest design is the simple one, said plainly in the
 *     README.
 *
 * A claim is deduped on (eater id, sequence), because a row is re-delivered
 * on every unrelated change and a swallow must land exactly once.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 6;
  var STALE_MS = 9000;
  var EAT_RING = 8;
  var FOOD_RING = 24;
  var CLAIM_TTL = 12000;

  var api = null;
  var me = { id: null, name: 'Player' };
  var others = {};
  var seq = 0;
  var pendingEats = [];
  var pendingFood = [];
  var appliedClaims = {};
  var appliedTotal = 0;
  var onEat = null;
  var onKill = null;
  var onRoster = null;
  var onFood = null;
  var lastPublished = 0;
  var self = { r: 20, score: 0, k: 0, d: 0, alive: true, spawn: 0, lastKilledBy: null, killAck: {} };
  var started = false;

  function db(n) { return api.db(n); }
  function now() { return Date.now(); }

  function tintFor(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return (h % 360) / 360;
  }

  var r2 = function (n) { return Math.round(n * 100) / 100; };

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
    var t = now(), seen = {}, allFood = {};
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id) continue;
      if (p.ate && p.ate.length) {
        for (var f = 0; f < p.ate.length; f++) allFood[p.ate[f]] = 1;
      }
      if (p.id === me.id) { reconcileSelf(p); continue; }
      seen[p.id] = 1;
      drainEats(p);
      var cur = others[p.id];
      var moved = !cur || cur.x !== p.x || cur.y !== p.y || cur.r !== p.r || cur.stamp !== p.t;
      others[p.id] = {
        id: p.id, name: p.name || 'Player',
        x: p.x, y: p.y, r: p.r == null ? 20 : p.r,
        score: p.score || 0, alive: p.alive !== false,
        k: p.k || 0, d: p.d || 0, spawn: p.sp || 0,
        stamp: p.t, seen: moved ? t : cur.seen, t: t, hue: tintFor(p.id),
        prev: cur ? { x: cur.x, y: cur.y, r: cur.r, t: cur.t } : null,
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
    if (onFood) onFood(allFood);
    if (onRoster) onRoster(roster());
  }

  function reconcileSelf(p) {
    if (p && p.k > self.k) self.k = p.k;
  }

  function drainEats(p) {
    if (!p.eats || !p.eats.length || !onEat) return;
    for (var i = 0; i < p.eats.length; i++) {
      var h = p.eats[i];
      if (!h || h.to !== me.id) continue;
      var key = p.id + ':' + h.n;
      if (appliedClaims[key]) continue;
      appliedClaims[key] = now();
      appliedTotal++;
      if (h.sp != null && h.sp !== self.spawn) continue;
      if (!self.alive) continue;
      onEat(p.id, p.name || 'Player', p.r);
    }
    var cutoff = now() - CLAIM_TTL;
    for (var k in appliedClaims) if (appliedClaims[k] < cutoff) delete appliedClaims[k];
  }

  function claimEat(targetId, targetSpawn) {
    if (!api || !me.id) return;
    pendingEats.push({ to: targetId, n: ++seq, sp: targetSpawn });
    if (pendingEats.length > EAT_RING) pendingEats.shift();
    publish(true);
  }

  function noteFood(id) {
    pendingFood.push(id);
    if (pendingFood.length > FOOD_RING) pendingFood.shift();
    publish(true);
  }

  function setSelf(s) {
    self.r = s.r; self.score = s.score; self.alive = s.alive; self.spawn = s.spawn;
    if (s.deaths != null) self.d = s.deaths;
    if (s.killedBy) self.lastKilledBy = { by: s.killedBy, at: s.spawn };
    else if (s.alive) self.lastKilledBy = null;
  }

  function publish(force) {
    if (!api || !me.id || !root.__IOBLOBS_POSE__) return;
    var t = now();
    if (!force && t - lastPublished < 1000 / PUBLISH_HZ) return;
    lastPublished = t;
    var p = root.__IOBLOBS_POSE__();
    if (!p) return;
    db('players').put({
      id: me.id, name: me.name,
      x: r2(p.x), y: r2(p.y), r: r2(p.r),
      score: self.score | 0, alive: !!self.alive, sp: self.spawn,
      k: self.k, d: self.d,
      lastKilledBy: self.lastKilledBy,
      eats: pendingEats.slice(),
      ate: pendingFood.slice(),
      t: t,
    }).catch(function () { /* a dropped frame of presence is not an error */ });
    started = true;
  }

  function tick() {
    if (!api || !me.id) return;
    publish(false);
  }

  function poseOf(o) {
    if (!o.prev) return { x: o.x, y: o.y, r: o.r };
    var span = Math.max(60, o.t - o.prev.t);
    var a = Math.min(1, Math.max(0, (now() - (1000 / PUBLISH_HZ) - o.prev.t) / span));
    return {
      x: o.prev.x + (o.x - o.prev.x) * a,
      y: o.prev.y + (o.y - o.prev.y) * a,
      r: o.prev.r + (o.r - o.prev.r) * a,
    };
  }

  function roster() {
    var list = [{ id: me.id, name: me.name, score: self.score, k: self.k, d: self.d, r: self.r, alive: self.alive, me: true }];
    for (var id in others) {
      list.push({
        id: id, name: others[id].name, score: others[id].score,
        k: others[id].k, d: others[id].d, r: others[id].r,
        alive: others[id].alive, me: false,
      });
    }
    list.sort(function (a, b) { return (b.score - a.score) || (b.r - a.r) || a.name.localeCompare(b.name); });
    return list;
  }

  function hsv(h, s, v) {
    if (s == null) s = 0.55;
    if (v == null) v = 0.92;
    var i6 = Math.floor(h * 6), f = h * 6 - i6;
    var p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    var m = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i6 % 6];
    return 'rgb(' + ((m[0] * 255) | 0) + ',' + ((m[1] * 255) | 0) + ',' + ((m[2] * 255) | 0) + ')';
  }

  root.Net = {
    init: init,
    tick: tick,
    publish: publish,
    setSelf: setSelf,
    claimEat: claimEat,
    noteFood: noteFood,
    poseOf: poseOf,
    roster: roster,
    others: function () { return others; },
    me: function () { return me; },
    count: function () { var n = 0; for (var k in others) n++; return n + 1; },
    live: function () { return !!api && !!me.id; },
    tintFor: tintFor,
    hsv: hsv,
    appliedTotal: function () { return appliedTotal; },
    onEat: function (fn) { onEat = fn; },
    onKill: function (fn) { onKill = fn; },
    onRoster: function (fn) { onRoster = fn; },
    onFood: function (fn) { onFood = fn; },
  };
})(window);
