/*
 * InvaderZ — extra cannons over a meeting.
 *
 * Upstream has no networking. The only channel GifOS gives an app is a
 * replicated collection. Two rules shape this:
 *
 *   1. A subscriber re-downloads the WHOLE collection on every change, so
 *      publish is slow (8 Hz) with interpolation, not a datagram stream.
 *   2. NOBODY WRITES TO ANYBODY ELSE'S ROW. Each cannon owns one record in
 *      `players`. The host alone writes `world` (the swarm) — guests see it
 *      because the collection is read-only, and they never put() it.
 *
 * Host simulates the invaders. Everyone else renders that snapshot and
 * claims a hit on their own row when their shot meets a body. The host
 * applies the claim.
 *
 * Invite is OS chrome. This file never draws a share button.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 8;
  var WORLD_HZ = 8;
  var STALE_MS = 9000;
  var CLAIM_RING = 8;
  var CLAIM_TTL = 12000;

  var api = null;
  var me = { id: null, name: 'Cannon' };
  var others = {};
  var owner = true;
  var seq = 0;
  var claims = [];
  var lastPublished = 0;
  var lastWorld = 0;
  var onRoster = null;
  var honored = {};

  function db(n) { return api.db(n); }
  function now() { return Date.now(); }
  function r1(n) { return Math.round(n * 10) / 10; }

  function tintFor(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    var hue = h % 360;
    return 'hsl(' + hue + ', 70%, 32%)';
  }

  function init() {
    api = root.gifos;
    if (!api || !api.db) return Promise.resolve({ owner: true, others: 0 });
    var infoP = api.info ? api.info().then(function (i) {
      owner = !!(i && i.owner);
      return owner;
    }).catch(function () { owner = true; return true; }) : Promise.resolve(true);

    return infoP.then(function () {
      return api.me();
    }).then(function (id) {
      me.id = id && id.id ? id.id : 'local';
      me.name = (id && id.name) || 'Cannon';
      var settled = false;
      return new Promise(function (resolve) {
        var done = function () {
          if (settled) return;
          settled = true;
          resolve({ owner: owner, others: countOthers() });
        };
        setTimeout(done, 2500);
        db('players').subscribe(function (list) {
          ingestPlayers(list || []);
          done();
        });
        db('world').subscribe(function (list) {
          ingestWorld(list || []);
        });
      });
    }).catch(function () {
      return { owner: true, others: 0 };
    });
  }

  function ingestPlayers(list) {
    var t = now(), seen = {};
    var pending = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id) continue;
      if (p.id === me.id) continue;
      seen[p.id] = 1;
      if (p.claims && p.claims.length) {
        for (var c = 0; c < p.claims.length; c++) {
          pending.push({ from: p.id, i: p.claims[c].i, n: p.claims[c].n });
        }
      }
      var cur = others[p.id];
      var moved = !cur || cur.x !== p.x || cur.stamp !== p.t;
      others[p.id] = {
        id: p.id, name: p.name || 'Cannon',
        x: p.x, y: p.y, shooting: !!p.sh,
        bx: p.bx, by: p.by,
        kills: p.kills | 0,
        stamp: p.t, seen: moved ? t : cur.seen, t: t,
        color: tintFor(p.id),
        prev: cur ? { x: cur.x, y: cur.y, bx: cur.bx, by: cur.by, t: cur.t } : null
      };
    }
    for (var id in others) {
      if (!seen[id] || now() - others[id].seen > STALE_MS) delete others[id];
    }
    if (owner) honorClaims(pending);
    if (onRoster) onRoster(roster());
  }

  function honorClaims(pending) {
    var G = root.InvaderZ;
    if (!G || !G.sim) return;
    for (var i = 0; i < pending.length; i++) {
      var cl = pending[i];
      var key = cl.from + ':' + cl.n;
      if (honored[key]) continue;
      honored[key] = now();
      G.honor(cl.i);
    }
    var cutoff = now() - CLAIM_TTL;
    for (var k in honored) if (honored[k] < cutoff) delete honored[k];
  }

  function ingestWorld(list) {
    var rec = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === 'world') rec = list[i];
    }
    var G = root.InvaderZ;
    if (!G || owner) return;
    if (!rec) return;
    G.importWorld(rec);
  }

  function poseOf(o) {
    if (!o.prev) return { x: o.x, y: o.y, bx: o.bx, by: o.by };
    var span = Math.max(60, o.t - o.prev.t);
    var a = Math.min(1, Math.max(0, (now() - (1000 / PUBLISH_HZ) - o.prev.t) / span));
    var x = o.prev.x + (o.x - o.prev.x) * a;
    var y = o.y;
    var bx = o.bx, by = o.by;
    if (o.shooting && o.prev.bx != null && o.bx != null) {
      bx = o.prev.bx + (o.bx - o.prev.bx) * a;
      by = o.prev.by + (o.by - o.prev.by) * a;
    }
    return { x: x, y: y, bx: bx, by: by };
  }

  function claim(idx) {
    if (!api || !me.id || idx < 0) return;
    claims.push({ i: idx, n: ++seq });
    if (claims.length > CLAIM_RING) claims.shift();
    publish(true);
  }

  function publish(force) {
    if (!api || !me.id) return;
    if (!player) return;
    var t = now();
    if (!force && t - lastPublished < 1000 / PUBLISH_HZ) return;
    lastPublished = t;
    var G = root.InvaderZ;
    db('players').put({
      id: me.id, name: me.name,
      x: r1(player.x), y: r1(player.y),
      sh: player.isShooting ? 1 : 0,
      bx: player.isShooting ? r1(player.bullet.x) : null,
      by: player.isShooting ? r1(player.bullet.y) : null,
      kills: G ? G.kills : 0,
      claims: claims.slice(),
      t: t
    }).catch(function () {});
  }

  function publishWorld(force) {
    if (!api || !me.id || !owner) return;
    var G = root.InvaderZ;
    if (!G) return;
    var t = now();
    if (!force && t - lastWorld < 1000 / WORLD_HZ) return;
    lastWorld = t;
    var snap = G.exportWorld();
    snap.id = 'world';
    snap.by = me.id;
    snap.t = t;
    db('world').put(snap).catch(function () {});
  }

  function tick() {
    if (!api || !me.id) return;
    publish(false);
    if (owner) publishWorld(false);
  }

  function drawCannons(ctx) {
    var G = root.InvaderZ;
    if (!G) return;
    var s = 4;
    for (var id in others) {
      var o = others[id];
      var p = poseOf(o);
      var shape = (player && player.shape) || [0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1];
      G.drawShape(ctx, shape, p.x, p.y == null ? (h / 4 - 4) : p.y, s, o.color);
      if (o.shooting && p.bx != null && p.by != null) {
        ctx.fillStyle = o.color;
        ctx.fillRect(p.bx * s, p.by * s, 3, 3);
      }
      ctx.save();
      ctx.font = '8px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = o.color;
      ctx.fillText(o.name, (p.x + 2) * s, (p.y == null ? (h / 4 - 4) : p.y) * s - 2);
      ctx.restore();
    }
  }

  function roster() {
    var G = root.InvaderZ;
    var list = [{
      id: me.id, name: me.name, me: true,
      kills: G ? G.kills : 0
    }];
    for (var id in others) {
      var o = others[id];
      list.push({ id: o.id, name: o.name, me: false, kills: o.kills });
    }
    list.sort(function (a, b) { return (b.kills - a.kills) || a.name.localeCompare(b.name); });
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
    publishWorld: publishWorld,
    claim: claim,
    roster: roster,
    others: function () { return others; },
    me: function () { return me; },
    owner: function () { return owner; },
    count: function () { return countOthers() + (me.id ? 1 : 0); },
    live: function () { return !!api && !!me.id; },
    drawCannons: drawCannons,
    onRoster: function (fn) { onRoster = fn; }
  };
})(window);
