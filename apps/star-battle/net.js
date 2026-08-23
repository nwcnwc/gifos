/*
 * Star Battle — extra ships over a meeting.
 *
 * Upstream has no networking. The only channel GifOS gives an app is a
 * replicated collection. Two rules shape this:
 *
 *   1. A subscriber re-downloads the WHOLE collection on every change, so
 *      publish is slow (8 Hz) with interpolation, not a datagram stream.
 *   2. NOBODY WRITES TO ANYBODY ELSE'S ROW. Each ship owns one record in
 *      `players`. The host alone writes `world` (the wave) — guests see it
 *      because the collection is read-only, and they never put() it.
 *
 * Host simulates enemies, rocks, friends, fuel, and enemy fire. Everyone
 * else renders that snapshot and claims a hit on their own row when their
 * shot meets a body. The host applies the claim. Fuel is each ship's own.
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
  var me = { id: null, name: 'Pilot' };
  var others = {};
  var owner = true;
  var seq = 0;
  var claims = [];
  var lastPublished = 0;
  var lastWorld = 0;
  var onRoster = null;
  var honored = {};
  var playing = false;
  var worldRec = null;

  function db(n) { return api.db(n); }
  function now() { return Date.now(); }
  function r1(n) { return Math.round(n * 10) / 10; }

  function tintFor(id) {
    var h = 0;
    id = String(id || '');
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h % 360;
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
      me.name = (id && id.name) || 'Pilot';
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
      var moved = !cur || cur.x !== p.x || cur.y !== p.y || cur.stamp !== p.t;
      others[p.id] = {
        id: p.id, name: p.name || 'Pilot',
        x: p.x, y: p.y,
        bullets: p.bullets || [],
        score: p.score | 0, fuel: p.fuel | 0,
        playing: !!p.playing, alive: p.alive !== 0,
        stamp: p.t, seen: moved ? t : cur.seen, t: t,
        hue: tintFor(p.id),
        prev: cur ? { x: cur.x, y: cur.y, t: cur.t } : null
      };
    }
    for (var id in others) {
      if (!seen[id] || now() - others[id].seen > STALE_MS) delete others[id];
    }
    if (owner) honorClaims(pending);
    if (onRoster) onRoster(roster());
  }

  function honorClaims(pending) {
    if (!owner) return;
    var play = currentPlay();
    if (!play) return;
    for (var i = 0; i < pending.length; i++) {
      var cl = pending[i];
      var key = cl.from + ':' + cl.n;
      if (honored[key]) continue;
      honored[key] = now();
      hurtEid(play, cl.i);
    }
    var cutoff = now() - CLAIM_TTL;
    for (var k in honored) if (honored[k] < cutoff) delete honored[k];
  }

  function hurtEid(play, eid) {
    if (eid == null) return;
    function scan(arr) {
      if (!arr) return false;
      for (var i = 0; i < arr.length; i++) {
        if (arr[i]._eid === eid && arr[i].run) {
          arr[i].reduceLife();
          return true;
        }
      }
      return false;
    }
    if (scan(play.enemys && play.enemys.arr)) return;
    if (scan(play.friends && play.friends.arr)) return;
    if (scan(play.fuels && play.fuels.arr)) return;
  }

  function ingestWorld(list) {
    var rec = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === 'world') rec = list[i];
    }
    worldRec = rec;
    if (owner) return;
    var play = currentPlay();
    if (!play || !rec) return;
    importWorld(play, rec);
  }

  function currentPlay() {
    var g = root.__starGame;
    if (!g || !g.scenes || !g.scenes.play) return null;
    if (g.scene !== g.scenes.play) return null;
    return g.scenes.play;
  }

  function packArr(arr, extra) {
    var out = [];
    if (!arr) return out;
    for (var i = 0; i < arr.length; i++) {
      var el = arr[i];
      if (!el || !el.run) continue;
      var row = { id: el._eid | 0, x: r1(el.x), y: r1(el.y), life: el.life | 0 };
      if (extra) extra(el, row);
      out.push(row);
    }
    return out;
  }

  function exportWorld(play) {
    var enemies = [];
    if (play.enemys && play.enemys.arr) {
      for (var i = 0; i < play.enemys.arr.length; i++) {
        var el = play.enemys.arr[i];
        if (!el || !el.run) continue;
        enemies.push({
          id: el._eid | 0, x: r1(el.x), y: r1(el.y),
          life: el.life | 0,
          k: (el instanceof Meteorite) ? 'm' : 'e'
        });
      }
    }
    return {
      e: enemies,
      f: packArr(play.friends && play.friends.arr),
      u: packArr(play.fuels && play.fuels.arr),
      b: packArr(play.enemyBullets),
      t: now()
    };
  }

  function merge(arr, snaps, make) {
    var by = {};
    var i;
    for (i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i]._eid != null) by[arr[i]._eid] = arr[i];
    }
    var next = [];
    var seen = {};
    for (i = 0; i < snaps.length; i++) {
      var s = snaps[i];
      if (!s) continue;
      var el = by[s.id];
      if (!el) {
        el = make(s);
        if (!el) continue;
        el._eid = s.id;
        el._remote = true;
      }
      el._tx = s.x;
      el._ty = s.y;
      if (el.x == null || !el._remote) el.x = s.x;
      if (el.y == null || !el._remote) el.y = s.y;
      if (s.life != null) el.life = s.life;
      el.run = true;
      el._remote = true;
      seen[s.id] = 1;
      next.push(el);
    }
    arr.length = 0;
    for (i = 0; i < next.length; i++) arr.push(next[i]);
  }

  function importWorld(play, rec) {
    if (!rec || owner) return;
    function mk(kind) {
      return function (s) {
        var Ctor = kind === 'm' ? Meteorite
          : kind === 'f' ? Friend
          : kind === 'u' ? Fuel
          : kind === 'b' ? Bullet
          : Enemy;
        var o = new Ctor(play);
        o.setup(kind === 'b' ? 'enemyBullet' : undefined);
        o.x = s.x; o.y = s.y;
        if (s.life != null) o.life = s.life;
        o._remote = true;
        o._eid = s.id;
        return o;
      };
    }
    var eSnaps = rec.e || [];
    var eMake = function (s) {
      return mk(s.k === 'm' ? 'm' : 'e')(s);
    };
    if (play.enemys) merge(play.enemys.arr, eSnaps, eMake);
    if (play.friends) merge(play.friends.arr, rec.f || [], mk('f'));
    if (play.fuels) merge(play.fuels.arr, rec.u || [], mk('u'));
    if (play.enemyBullets) merge(play.enemyBullets, rec.b || [], mk('b'));
  }

  function claim(eid) {
    if (!api || !me.id || eid == null) return;
    claims.push({ i: eid, n: ++seq });
    if (claims.length > CLAIM_RING) claims.shift();
    publish(true);
  }

  function myBullets(play) {
    var out = [];
    if (!play || !play.playerBullets) return out;
    for (var i = 0; i < play.playerBullets.length; i++) {
      var b = play.playerBullets[i];
      if (!b || !b.run) continue;
      out.push([r1(b.x), r1(b.y)]);
      if (out.length >= 6) break;
    }
    return out;
  }

  function publish(force) {
    if (!api || !me.id) return;
    var t = now();
    if (!force && t - lastPublished < 1000 / PUBLISH_HZ) return;
    lastPublished = t;
    var play = currentPlay();
    var player = play && play.player;
    var data = (play && play.game && play.game.data) || {};
    var rec = {
      id: me.id, name: me.name,
      x: player ? r1(player.x) : 0,
      y: player ? r1(player.y) : 0,
      bullets: myBullets(play),
      score: data.score | 0,
      fuel: data.fuel | 0,
      playing: playing ? 1 : 0,
      alive: player && player.run ? 1 : 0,
      claims: claims.slice(),
      t: t
    };
    try { db('players').put(rec).catch(function () {}); } catch (e) {}
  }

  function publishWorld(force) {
    if (!api || !me.id || !owner) return;
    var play = currentPlay();
    if (!play) return;
    var t = now();
    if (!force && t - lastWorld < 1000 / WORLD_HZ) return;
    lastWorld = t;
    var snap = exportWorld(play);
    snap.id = 'world';
    snap.by = me.id;
    snap.t = t;
    try { db('world').put(snap).catch(function () {}); } catch (e) {}
  }

  function tick() {
    if (!api || !me.id) return;
    publish(false);
    if (owner && playing) publishWorld(false);
  }

  function poseOf(o) {
    if (!o) return null;
    if (!o.prev) return { x: o.x, y: o.y };
    var span = Math.max(60, o.t - o.prev.t);
    var a = Math.min(1, Math.max(0, (now() - (1000 / PUBLISH_HZ) - o.prev.t) / span));
    return {
      x: o.prev.x + (o.x - o.prev.x) * a,
      y: o.prev.y + (o.y - o.prev.y) * a
    };
  }

  function drawShips(ctx, play) {
    if (!ctx) return;
    var img = (typeof res !== 'undefined' && res.imageBy) ? res.imageBy('player') : null;
    var bimg = (typeof res !== 'undefined' && res.imageBy) ? res.imageBy('playerBullet') : null;
    var w = (typeof config !== 'undefined' && config.player && config.player.w) || 70;
    var h = (typeof config !== 'undefined' && config.player && config.player.h) || 70;
    var bw = (typeof config !== 'undefined' && config.playerBullet && config.playerBullet.w) || 20;
    var bh = (typeof config !== 'undefined' && config.playerBullet && config.playerBullet.h) || 10;
    for (var id in others) {
      var o = others[id];
      if (!o.playing || o.alive === false) continue;
      var p = poseOf(o);
      if (!p) continue;
      ctx.save();
      ctx.fillStyle = 'hsla(' + o.hue + ', 70%, 55%, 0.35)';
      ctx.beginPath();
      ctx.ellipse(p.x + w / 2, p.y + h * 0.72, w * 0.42, h * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      if (o.hue) ctx.filter = 'hue-rotate(' + o.hue + 'deg)';
      if (img) {
        var fw = img.width / 4, fh = img.height;
        ctx.drawImage(img, 0, 0, fw, fh, p.x, p.y, w, h);
      } else {
        ctx.fillStyle = 'hsl(' + o.hue + ', 70%, 55%)';
        ctx.fillRect(p.x, p.y, w, h);
      }
      ctx.restore();
      if (o.bullets && bimg) {
        for (var i = 0; i < o.bullets.length; i++) {
          var b = o.bullets[i];
          if (!b) continue;
          ctx.save();
          if (o.hue) ctx.filter = 'hue-rotate(' + o.hue + 'deg)';
          ctx.drawImage(bimg, b[0], b[1], bw, bh);
          ctx.restore();
        }
      }
      ctx.save();
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      var label = String(o.name || '').slice(0, 14);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(5,6,10,.85)';
      ctx.strokeText(label, p.x + w / 2, p.y - 2);
      ctx.fillStyle = 'hsl(' + o.hue + ', 70%, 78%)';
      ctx.fillText(label, p.x + w / 2, p.y - 2);
      ctx.restore();
    }
  }

  function roster() {
    var play = currentPlay();
    var data = (play && play.game && play.game.data) || {};
    var list = [{
      id: me.id, name: me.name, me: true,
      score: data.score | 0, fuel: data.fuel | 0,
      alive: !!(play && play.player && play.player.run)
    }];
    for (var id in others) {
      var o = others[id];
      list.push({
        id: o.id, name: o.name, me: false,
        score: o.score, fuel: o.fuel, alive: o.alive !== false
      });
    }
    list.sort(function (a, b) {
      return (b.score - a.score) || a.name.localeCompare(b.name);
    });
    return list;
  }

  function countOthers() {
    var n = 0;
    for (var k in others) n++;
    return n;
  }

  function setPlaying(on) {
    playing = !!on;
    publish(true);
    if (playing && owner) publishWorld(true);
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
    drawShips: drawShips,
    poseOf: poseOf,
    setPlaying: setPlaying,
    playing: function () { return playing; },
    hasWorld: function () { return !!worldRec; },
    othersPlaying: function () {
      var n = 0;
      for (var id in others) {
        if (others[id].playing && others[id].alive !== false) n++;
      }
      return n;
    },
    importWorld: function (play) { if (worldRec && !owner) importWorld(play, worldRec); },
    onRoster: function (fn) { onRoster = fn; }
  };
})(window);
