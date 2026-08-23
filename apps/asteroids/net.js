/*
 * Asteroids — extra ships over a meeting.
 *
 * Upstream has no networking. The only channel GifOS gives an app is a
 * replicated collection. Two rules shape this:
 *
 *   1. A subscriber re-downloads the WHOLE collection on every change, so
 *      publish is slow (8 Hz) with interpolation, not a datagram stream.
 *   2. NOBODY WRITES TO ANYBODY ELSE'S ROW. Each pilot owns one record in
 *      `players`. The host alone writes `world` (the rocks) — guests see it
 *      because the collection is read-only, and they never put() it.
 *
 * Host simulates the rocks (and the saucer). Everyone else renders that
 * snapshot, extrapolates with the published velocity, and claims a hit on
 * their own row when their shot meets a rock. The host applies the claim.
 * Friendly fire is the same idea as FPS Simple: the shooter publishes the
 * shot, the target decides whether it died.
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
  var world = null;
  var seq = 0;
  var claims = [];
  var hits = [];
  var applied = {};
  var lastPublished = 0;
  var lastWorld = 0;
  var onRoster = null;
  var onFF = null;
  var selfScore = 0;
  var selfLives = 2;
  var selfAlive = false;

  function db(n) { return api.db(n); }
  function now() { return Date.now(); }
  function r1(n) { return Math.round(n * 10) / 10; }
  function r2(n) { return Math.round(n * 100) / 100; }

  function tintFor(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    var hue = (h % 360);
    return 'hsl(' + hue + ', 70%, 72%)';
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
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id) continue;
      if (p.id === me.id) continue;
      seen[p.id] = 1;
      drainHits(p);
      var cur = others[p.id];
      var moved = !cur || cur.x !== p.x || cur.y !== p.y || cur.stamp !== p.t;
      others[p.id] = {
        id: p.id, name: p.name || 'Pilot',
        x: p.x, y: p.y, rot: p.rot || 0, vx: p.vx || 0, vy: p.vy || 0,
        thrust: !!p.th, alive: p.alive !== false,
        score: p.score || 0, lives: p.lives == null ? 0 : p.lives,
        shots: p.shots || [],
        stamp: p.t, seen: moved ? t : cur.seen, t: t,
        color: tintFor(p.id),
        prev: cur ? { x: cur.x, y: cur.y, rot: cur.rot, t: cur.t } : null
      };
    }
    for (var id in others) {
      if (!seen[id] || now() - others[id].seen > STALE_MS) delete others[id];
    }
    if (onRoster) onRoster(roster());
    pushGhosts();
  }

  function drainHits(p) {
    if (!p.hits || !p.hits.length) return;
    var G = root.AsteroidsGame;
    for (var i = 0; i < p.hits.length; i++) {
      var h = p.hits[i];
      if (!h || h.to !== me.id) continue;
      var key = p.id + ':' + h.n;
      if (applied[key]) continue;
      applied[key] = now();
      if (!G || !G.ship || !G.ship.visible) continue;
      if (!G.friendlyFire) continue;
      G.ship.collision({ name: 'enemybullet', x: G.ship.x, y: G.ship.y });
    }
    var cutoff = now() - CLAIM_TTL;
    for (var k in applied) if (applied[k] < cutoff) delete applied[k];
  }

  function ingestWorld(list) {
    var rec = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === 'world') rec = list[i];
    }
    world = rec;
    var G = root.AsteroidsGame;
    if (!G) return;
    if (rec && rec.ff != null) {
      var was = G.friendlyFire;
      G.friendlyFire = !!rec.ff;
      if (was !== G.friendlyFire && onFF) onFF(G.friendlyFire);
    }
    if (owner) return;
    if (!rec) return;
    if (rec.rocks) G.importRocks(rec.rocks);
    G.importAlien(rec.alien || null);
    if (rec.wave != null) G.totalAsteroids = rec.wave;
    if (rec.state === 'run' && (G.FSM.state === 'waiting' || G.FSM.state === 'boot')) {
      G.FSM.state = 'start';
    }
  }

  var pendingApply = [];

  var _ingestPlayers = ingestPlayers;
  ingestPlayers = function (list) {
    pendingApply = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id || p.id === me.id) continue;
      if (p.claims && p.claims.length) {
        for (var c = 0; c < p.claims.length; c++) {
          pendingApply.push({ from: p.id, rock: p.claims[c].r, n: p.claims[c].n, alien: !!p.claims[c].a });
        }
      }
    }
    _ingestPlayers(list);
    if (owner) honorClaims();
  };

  var honored = {};
  function honorClaims() {
    var G = root.AsteroidsGame;
    if (!G) return;
    for (var i = 0; i < pendingApply.length; i++) {
      var c = pendingApply[i];
      var key = c.from + ':' + c.n;
      if (honored[key]) continue;
      honored[key] = now();
      if (c.alien) {
        if (G.bigAlien && G.bigAlien.visible) {
          G.score += 0; // credit is theirs, on their row
          G.bigAlien.visible = false;
          G.bigAlien.newPosition();
          G.explosionAt(G.bigAlien.x, G.bigAlien.y);
          if (root.SFX) root.SFX.explosion();
        }
        continue;
      }
      for (var s = 0; s < G.sprites.length; s++) {
        var rock = G.sprites[s];
        if (rock.name !== 'asteroid' || !rock.visible || rock.rid !== c.rock) continue;
        // Pretend a bullet belonging to the claimant hit it, so fragments spawn.
        var fake = { name: 'enemybullet', x: rock.x, y: rock.y, ownerId: c.from, collision: function () {} };
        rock.collision(fake);
        break;
      }
    }
    var cutoff = now() - CLAIM_TTL;
    for (var k in honored) if (honored[k] < cutoff) delete honored[k];
  }

  function poseOf(o) {
    if (!o.prev) return { x: o.x, y: o.y, rot: o.rot };
    var span = Math.max(60, o.t - o.prev.t);
    var a = Math.min(1, Math.max(0, (now() - (1000 / PUBLISH_HZ) - o.prev.t) / span));
    var G = root.AsteroidsGame;
    var W = G ? G.canvasWidth : 800, H = G ? G.canvasHeight : 600;
    var dx = o.x - o.prev.x, dy = o.y - o.prev.y;
    if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
    if (dy > H / 2) dy -= H; if (dy < -H / 2) dy += H;
    var dr = ((o.rot - o.prev.rot + 540) % 360) - 180;
    var x = o.prev.x + dx * a, y = o.prev.y + dy * a;
    if (x < 0) x += W; if (x > W) x -= W;
    if (y < 0) y += H; if (y > H) y -= H;
    return { x: x, y: y, rot: (o.prev.rot + dr * a + 360) % 360 };
  }

  function pushGhosts() {
    var G = root.AsteroidsGame;
    if (!G) return;
    var g = [];
    for (var id in others) {
      var o = others[id];
      var p = poseOf(o);
      g.push({
        id: o.id, name: o.name, color: o.color,
        x: p.x, y: p.y, rot: p.rot, thrust: o.thrust, alive: o.alive
      });
    }
    G.ghosts = g;
  }

  function setSelf(s) {
    if (s.score != null) selfScore = s.score;
    if (s.lives != null) selfLives = s.lives;
    if (s.alive != null) selfAlive = s.alive;
  }

  function claimRock(rid) {
    if (!api || !me.id) return;
    claims.push({ r: rid, n: ++seq });
    if (claims.length > CLAIM_RING) claims.shift();
    publish(true);
  }

  function claimAlien() {
    if (!api || !me.id) return;
    claims.push({ a: 1, n: ++seq });
    if (claims.length > CLAIM_RING) claims.shift();
    publish(true);
  }

  function claimHit(targetId) {
    if (!api || !me.id) return;
    hits.push({ to: targetId, n: ++seq });
    if (hits.length > CLAIM_RING) hits.shift();
    publish(true);
  }

  function publish(force) {
    if (!api || !me.id) return;
    var G = root.AsteroidsGame;
    if (!G || !G.ship) return;
    var t = now();
    if (!force && t - lastPublished < 1000 / PUBLISH_HZ) return;
    lastPublished = t;
    var sh = G.ship;
    db('players').put({
      id: me.id, name: me.name,
      x: r1(sh.x), y: r1(sh.y), rot: r1(sh.rot),
      vx: r2(sh.vel.x), vy: r2(sh.vel.y),
      th: !!(sh.children.exhaust && sh.children.exhaust.visible),
      alive: !!sh.visible, lives: G.lives, score: Math.floor(G.score),
      shots: G.localShots(),
      claims: claims.slice(),
      hits: hits.slice(),
      t: t
    }).catch(function () {});
  }

  function publishWorld(force) {
    if (!api || !me.id || !owner) return;
    var G = root.AsteroidsGame;
    if (!G) return;
    var t = now();
    if (!force && t - lastWorld < 1000 / WORLD_HZ) return;
    lastWorld = t;
    db('world').put({
      id: 'world',
      by: me.id,
      rocks: G.exportRocks(),
      alien: G.exportAlien(),
      wave: G.totalAsteroids,
      state: G.FSM.state,
      ff: !!G.friendlyFire,
      t: t
    }).catch(function () {});
  }

  function tick() {
    if (!api || !me.id) return;
    publish(false);
    if (owner) publishWorld(false);
    pushGhosts();
    collideRemoteShots();
  }

  function collideRemoteShots() {
    var G = root.AsteroidsGame;
    if (!G || !G.ship || !G.ship.visible) return;
    if (!G.friendlyFire) return;
    for (var id in others) {
      var o = others[id];
      var shots = o.shots || [];
      for (var i = 0; i < shots.length; i++) {
        var b = shots[i];
        var dx = b[0] - G.ship.x, dy = b[1] - G.ship.y;
        if (dx * dx + dy * dy < 14 * 14) {
          G.ship.collision({ name: 'enemybullet', x: b[0], y: b[1] });
          return;
        }
      }
    }
  }

  function drawRemoteShots(ctx) {
    for (var id in others) {
      var o = others[id];
      var shots = o.shots || [];
      ctx.save();
      ctx.strokeStyle = o.color;
      ctx.lineWidth = 2;
      for (var i = 0; i < shots.length; i++) {
        var b = shots[i];
        ctx.beginPath();
        ctx.moveTo(b[0] - 1, b[1] - 1);
        ctx.lineTo(b[0] + 1, b[1] + 1);
        ctx.moveTo(b[0] + 1, b[1] - 1);
        ctx.lineTo(b[0] - 1, b[1] + 1);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawNames(ctx) {
    var G = root.AsteroidsGame;
    if (!G) return;
    ctx.save();
    ctx.font = '12px "Courier New", Courier, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (var id in others) {
      var o = others[id];
      if (!o.alive) continue;
      var p = poseOf(o);
      ctx.fillStyle = o.color;
      ctx.fillText(o.name, p.x, p.y - 18);
    }
    ctx.restore();
  }

  function roster() {
    var G = root.AsteroidsGame;
    var list = [{
      id: me.id, name: me.name, me: true,
      score: G ? Math.floor(G.score) : selfScore,
      lives: G ? G.lives : selfLives,
      alive: G && G.ship ? G.ship.visible : selfAlive
    }];
    for (var id in others) {
      var o = others[id];
      list.push({ id: o.id, name: o.name, me: false, score: o.score, lives: o.lives, alive: o.alive });
    }
    list.sort(function (a, b) { return (b.score - a.score) || a.name.localeCompare(b.name); });
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
    setSelf: setSelf,
    claimRock: claimRock,
    claimAlien: claimAlien,
    claimHit: claimHit,
    poseOf: poseOf,
    roster: roster,
    others: function () { return others; },
    me: function () { return me; },
    owner: function () { return owner; },
    count: function () { return countOthers() + (me.id ? 1 : 0); },
    live: function () { return !!api && !!me.id; },
    drawRemoteShots: drawRemoteShots,
    drawNames: drawNames,
    onRoster: function (fn) { onRoster = fn; },
    onFF: function (fn) { onFF = fn; }
  };
})(window);
