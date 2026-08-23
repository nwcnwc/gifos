/*
 * Underrun — extra soldiers over a meeting.
 *
 * Upstream has no networking. The only channel GifOS gives an app is a
 * replicated collection. Two rules shape this:
 *
 *   1. A subscriber re-downloads the WHOLE collection on every change, so
 *      publish is slow (8 Hz) with interpolation, not a datagram stream.
 *   2. NOBODY WRITES TO ANYBODY ELSE'S ROW. Each soldier owns one record in
 *      `players`. Pose, a short ring of shots, and the computers they rebooted
 *      ride on that row. A shot you see on their row is spawned locally and
 *      simulated here. A computer they claim is rebooted locally.
 *
 * Enemies stay local — there are too many spiders to snapshot cheaply. Extra
 * soldiers still help: their plasma hits YOUR spiders, and a computer they
 * walk into comes back on your floor too.
 *
 * Invite is OS chrome. This file never draws a share button.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 8;
  var STALE_MS = 9000;
  var SHOT_RING = 8;
  var CLAIM_TTL = 20000;

  var api = null;
  var me = { id: null, name: 'Soldier' };
  var others = {};
  var seq = 0;
  var shots = [];
  var cpuClaims = [];
  var seenShots = {};
  var seenCpu = {};
  var honoring = false;
  var lastPublished = 0;
  var onRoster = null;
  var onLevel = null;
  var kills = 0;

  function db(n) { return api.db(n); }
  function now() { return Date.now(); }
  function r1(n) { return Math.round(n * 10) / 10; }

  function init() {
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve({ others: 0 });
    return api.me().then(function (id) {
      me.id = id && id.id ? id.id : 'local';
      me.name = (id && id.name) || 'Soldier';
      var settled = false;
      return new Promise(function (resolve) {
        var done = function () {
          if (settled) return;
          settled = true;
          resolve({ others: countOthers() });
        };
        setTimeout(done, 2500);
        db('players').subscribe(function (list) {
          ingest(list || []);
          done();
        });
      });
    }).catch(function () {
      return { others: 0 };
    });
  }

  function ingest(list) {
    var t = now(), seen = {};
    var bestLv = 0;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id) continue;
      if (p.lv > bestLv) bestLv = p.lv | 0;
      if (p.id === me.id) continue;
      seen[p.id] = 1;
      drainShots(p);
      drainCpu(p);
      var cur = others[p.id];
      var moved = !cur || cur.x !== p.x || cur.z !== p.z || cur.stamp !== p.t;
      others[p.id] = {
        id: p.id, name: p.name || 'Soldier',
        x: p.x, z: p.z, s: p.s | 0, h: p.h | 0, lv: p.lv | 0,
        kills: p.kills | 0,
        stamp: p.t, seen: moved ? t : cur.seen, t: t,
        prev: cur ? { x: cur.x, z: cur.z, t: cur.t } : null
      };
    }
    for (var id in others) {
      if (!seen[id] || now() - others[id].seen > STALE_MS) delete others[id];
    }
    if (onLevel && bestLv > 0) onLevel(bestLv);
    if (onRoster) onRoster(roster());
  }

  function drainShots(p) {
    if (!p.shots || !p.shots.length) return;
    for (var i = 0; i < p.shots.length; i++) {
      var sh = p.shots[i];
      if (!sh) continue;
      var key = p.id + ':' + sh.n;
      if (seenShots[key]) continue;
      seenShots[key] = now();
      root._underrunRemotePlasma = true;
      new entity_plasma_t(sh.x, 0, sh.z, 0, 26, sh.a);
      root._underrunRemotePlasma = false;
    }
    var cutoff = now() - CLAIM_TTL;
    for (var k in seenShots) if (seenShots[k] < cutoff) delete seenShots[k];
  }

  function drainCpu(p) {
    if (!p.cpus || !p.cpus.length) return;
    for (var i = 0; i < p.cpus.length; i++) {
      var cl = p.cpus[i];
      if (!cl) continue;
      var key = (cl.x | 0) + ',' + (cl.z | 0);
      if (seenCpu[key]) continue;
      seenCpu[key] = now();
      honorCpu(cl.x, cl.z);
    }
  }

  function honorCpu(x, z) {
    if (typeof entity_cpu_t === 'undefined' || !entities) return;
    honoring = true;
    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      if (!(e instanceof entity_cpu_t) || e.h != 5) continue;
      if (Math.abs(e.x - x) < 6 && Math.abs(e.z - z) < 6) {
        e._check(entity_player);
        break;
      }
    }
    honoring = false;
  }

  function poseOf(o) {
    if (!o.prev) return { x: o.x, z: o.z };
    var span = Math.max(60, o.t - o.prev.t);
    var a = Math.min(1, Math.max(0, (now() - (1000 / PUBLISH_HZ) - o.prev.t) / span));
    return {
      x: o.prev.x + (o.x - o.prev.x) * a,
      z: o.prev.z + (o.z - o.prev.z) * a
    };
  }

  function shot(angle, x, z) {
    if (!api || !me.id) return;
    shots.push({ n: ++seq, a: r1(angle), x: r1(x), z: r1(z) });
    if (shots.length > SHOT_RING) shots.shift();
    publish(true);
  }

  function claimCpu(x, z) {
    if (!api || !me.id || honoring) return;
    var key = (x | 0) + ',' + (z | 0);
    if (seenCpu[key]) return;
    seenCpu[key] = now();
    cpuClaims.push({ x: r1(x), z: r1(z) });
    if (cpuClaims.length > 12) cpuClaims.shift();
    publish(true);
  }

  function addKill() { kills++; }

  function publish(force) {
    if (!api || !me.id || !entity_player) return;
    var t = now();
    if (!force && t - lastPublished < 1000 / PUBLISH_HZ) return;
    lastPublished = t;
    db('players').put({
      id: me.id, name: me.name,
      x: r1(entity_player.x), z: r1(entity_player.z),
      s: entity_player.s | 0,
      h: entity_player._dead ? 0 : (entity_player.h | 0),
      lv: current_level | 0,
      kills: kills,
      shots: shots.slice(),
      cpus: cpuClaims.slice(),
      t: t
    }).catch(function () {});
  }

  function tick() {
    if (!api || !me.id) return;
    publish(false);
  }

  function draw() {
    if (typeof push_sprite !== 'function') return;
    var lv = current_level | 0;
    for (var id in others) {
      var o = others[id];
      if (o.lv && o.lv !== lv) continue;
      if (o.h <= 0) continue;
      var p = poseOf(o);
      push_sprite(p.x - 1, 0, p.z, o.s || 18);
      push_light(p.x, 4, p.z + 6, 1, 0.5, 0, 0.04);
    }
  }

  function nearest(x, z) {
    var best = entity_player, bd = 1e9;
    if (entity_player && !entity_player._dead) {
      var dx = x - entity_player.x, dz = z - entity_player.z;
      bd = dx * dx + dz * dz;
    }
    var lv = current_level | 0;
    for (var id in others) {
      var o = others[id];
      if (o.lv && o.lv !== lv) continue;
      if (o.h <= 0) continue;
      var p = poseOf(o);
      var dx2 = x - p.x, dz2 = z - p.z, d = dx2 * dx2 + dz2 * dz2;
      if (d < bd) { bd = d; best = { x: p.x, z: p.z }; }
    }
    return best;
  }

  function roster() {
    var list = [{
      id: me.id, name: me.name, me: true,
      h: entity_player && !entity_player._dead ? (entity_player.h | 0) : 0,
      lv: current_level | 0, kills: kills
    }];
    for (var id in others) {
      var o = others[id];
      list.push({ id: o.id, name: o.name, me: false, h: o.h, lv: o.lv, kills: o.kills });
    }
    list.sort(function (a, b) {
      return (b.lv - a.lv) || (b.kills - a.kills) || a.name.localeCompare(b.name);
    });
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
    shot: shot,
    claimCpu: claimCpu,
    addKill: addKill,
    draw: draw,
    nearest: nearest,
    poseOf: poseOf,
    roster: roster,
    others: function () { return others; },
    me: function () { return me; },
    count: function () { return countOthers() + (me.id ? 1 : 0); },
    live: function () { return !!api && !!me.id; },
    onRoster: function (fn) { onRoster = fn; },
    onLevel: function (fn) { onLevel = fn; }
  };
})(window);
