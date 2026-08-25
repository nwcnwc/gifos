/*
 * Aim and Shoot — ONE ARENA.
 *
 * The port used to hand each guest their own private wave and call the room a
 * scoreboard: you could see a friend's generation number and nothing else.
 * An invite is a door into the same yard, so there is now exactly one fight.
 *
 * Authority, borrowed whole from Battle City: the app OWNER simulates. Bots,
 * bullets, physics, breeding and death all happen in one tab. Guests publish
 * INPUT — sticks, aim point, trigger — into `players`, and render the owner's
 * `world` snapshot. Nothing is simulated twice, so nothing can disagree.
 *
 * The arena belongs to the host too: a guest adopts the host's field
 * dimensions rather than its own screen's, or two people would be shooting
 * at different rooms. Everything a guest draws is letterboxed inside the
 * hazard band; the gap is striped, never floor.
 *
 * Humans are a TEAM. Their bullets pass through each other (the rule lives in
 * boot.js with the other prototype patches), bots shoot at all of them, and
 * one death is a respawn, not the end — the run only ends when the whole team
 * is down at once.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 12;      /* input rows and world snapshots */
  var STALE_MS = 7000;      /* a row that stopped changing is a player gone */
  var DOWN_MS = 3000;       /* how long a downed human stays down */
  var WAIT_MS = 4000;       /* no world row by now: the host is not co-op */
  var MAX_SHOWN_BULLETS = 48;
  var BULLET_SPEED = 1.2;   /* Bullet.js, per ms */

  var api = null;
  var me = { id: 'local', name: 'Player' };
  var owner = true;         /* am I the app owner, i.e. the simulator? */
  var joined = false;       /* did we get an identity at all? */
  var inputs = {};          /* id -> latest published input row (host side) */
  var mates = {};           /* id -> Player instance the host drives */
  var down = {};            /* id -> when they went down */
  var ghosts = {};          /* key -> interpolated render body (guest side) */
  var ghostBullets = [];
  var world = null;         /* latest snapshot (guest side) */
  var worldAt = 0;
  var bornAt = 0;
  var lastIn = 0, lastOut = 0;
  var lastFire = false;
  var solo = true;          /* nobody else here: behave exactly like upstream */
  var onRoster = null;
  var wipeSeq = 0;
  var rosterStamp = 0;

  function db(n) { return api.db(n); }
  function now() { return Date.now(); }
  function r1(n) { return Math.round(n * 10) / 10; }
  function rnd(lo, hi) { return lo + Math.random() * (hi - lo); }

  /* ---- identity ---------------------------------------------------------- */

  function init() {
    api = root.gifos;
    bornAt = now();
    if (!api || !api.db || !api.me) return Promise.resolve(false);
    var infoP = api.info ? api.info().catch(function () { return { owner: true }; })
                         : Promise.resolve({ owner: true });
    return Promise.all([infoP, api.me().catch(function () { return null; })]).then(function (pair) {
      owner = !!(pair[0] && pair[0].owner);
      me.id = (pair[1] && pair[1].id) || 'local';
      me.name = (pair[1] && pair[1].name) || 'Player';
      if (me.id === 'local') return false;
      joined = true;
      db('players').subscribe(function (list) { ingestInput(list || []); });
      db('world').subscribe(function (list) {
        for (var i = 0; i < (list || []).length; i++) {
          if (list[i] && list[i].id === 'world') { world = list[i]; worldAt = now(); }
        }
      });
      return true;
    }).catch(function () { return false; });
  }

  /* ---- the room ---------------------------------------------------------- */

  function ingestInput(list) {
    var t = now(), seen = {}, i, p, cur;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (!p || !p.id || p.id === me.id || p.id === 'world') continue;
      seen[p.id] = 1;
      cur = inputs[p.id];
      inputs[p.id] = {
        id: p.id, name: p.name || 'Player',
        mv: p.mv || {}, mx: p.mx || 0, my: p.my || 0,
        lx: p.lx, ly: p.ly, fire: !!p.fire,
        stamp: p.t, seen: (!cur || cur.stamp !== p.t) ? t : cur.seen
      };
    }
    for (i in inputs) {
      if (!seen[i] || t - inputs[i].seen > STALE_MS) { delete inputs[i]; dropMate(i); }
    }
    solo = !anyone();
    if (onRoster) onRoster(roster());
  }

  function anyone() { for (var k in inputs) return true; return false; }

  /* Only the app owner ever LOOKS like a host to itself; a guest that has not
     heard a world row within WAIT_MS is alone in practice and plays its own
     arena rather than staring at an empty field. */
  function guest() { return joined && !owner && (world != null || now() - bornAt < WAIT_MS); }
  function hosting() { return joined && owner && !solo; }
  function active() { return guest() || hosting(); }

  function roster() {
    var out = [], id, i, row;
    if (guest() && world && world.ps) {
      for (i = 0; i < world.ps.length; i++) {
        row = world.ps[i];
        if (!row || row.ai) continue;
        out.push({ id: row.k, name: row.k === me.id ? me.name : (row.n || 'Player'),
                   me: row.k === me.id, down: !!row.d });
      }
      return out;
    }
    out.push({ id: me.id, name: me.name, me: true, down: !!down[me.id] });
    for (id in inputs) out.push({ id: id, name: inputs[id].name, me: false, down: !!down[id] });
    return out;
  }

  /* ---- host: drive the humans who are not at this keyboard --------------- */

  function mateFor(id, name) {
    if (mates[id]) return mates[id];
    var p = new Player(rnd(80, root.AAS.w - 80), rnd(80, root.AAS.h - 80), 0, [20, 20, 20], false);
    p.mate = true;
    p.netId = id;
    p.netName = name || 'Player';
    mates[id] = p;
    root.AAS.addBody(p);
    return p;
  }

  function dropMate(id) {
    if (!mates[id]) return;
    root.AAS.dropBody(mates[id]);
    delete mates[id];
    delete down[id];
  }

  function bodyFor(id) { return id === me.id ? root.AAS.player : mates[id]; }

  /* Called by the host each frame BEFORE physics: post everyone's input into
     the body that carries it, and bring the downed back. */
  function beforeHost() {
    if (!joined || !owner) return;
    var id, p, inp;
    for (id in inputs) {
      inp = inputs[id];
      p = mateFor(id, inp.name);
      p.netName = inp.name;
      if (p.isDead) continue;
      p.isMoving.left = !!(inp.mv && inp.mv.l);
      p.isMoving.up = !!(inp.mv && inp.mv.u);
      p.isMoving.right = !!(inp.mv && inp.mv.r);
      p.isMoving.down = !!(inp.mv && inp.mv.d);
      if (inp.mx || inp.my) {
        p.speed.x += inp.mx * p.velocity * 1.4;
        p.speed.y += inp.my * p.velocity * 1.4;
      }
      if (typeof inp.lx === 'number') p.lookAt(inp.lx, inp.ly);
      p.isShooting = !!inp.fire;
    }
    for (id in mates) if (mates[id].isDead && !down[id]) onDown(id);
    reviveTheDown();
  }

  function reviveTheDown() {
    var t = now(), id;
    for (id in down) {
      if (t - down[id] < DOWN_MS) continue;
      var p = bodyFor(id);
      delete down[id];
      if (!p) continue;
      p.isDead = false;
      p.iAnim = 0;
      p.health = 10;
      p.coolDown = p.coolDownInit;
      p.speed.x = p.speed.y = 0;
      p.pos.x = rnd(80, root.AAS.w - 80);
      p.pos.y = rnd(80, root.AAS.h - 80);
    }
  }

  /* A human hit zero. In a room, that is a three second trip to the floor —
     the wave carries on without them. Alone, it is upstream's game over.
     Returns true when co-op took responsibility for the death. */
  function onDown(id) {
    if (!hosting()) return false;
    id = id || me.id;
    /* Already on the floor. Deciding again every frame is not harmless: the
       first cut re-ran the wipe on a timer and pushed every revive clock
       forward with it, so a wiped team lay there for good. */
    if (down[id]) return true;
    down[id] = now();
    if (teamStanding()) return true;
    /* That was the last one standing. The run resets to generation 1 and the
       whole team gets up together — the room does not close. */
    wipeSeq = now();
    root.AAS.wipe();
    for (var k in down) down[k] = wipeSeq;
    return true;
  }

  function teamStanding() {
    var live = root.AAS.player && !root.AAS.player.isDead, id;
    for (id in mates) if (!mates[id].isDead) live = true;
    return live;
  }

  /* ---- host: publish the arena ------------------------------------------- */

  function afterHost() {
    if (!hosting()) return;
    var t = now();
    if (t - lastOut < 1000 / PUBLISH_HZ) return;
    lastOut = t;
    var A = root.AAS, ps = [], bs = [], i, p, b;
    var list = A.bodies();
    for (i = 0; i < list.length; i++) {
      p = list[i];
      ps.push({
        k: p.ai ? ('b' + i) : (p === A.player ? me.id : p.netId),
        n: p.ai ? '' : (p === A.player ? me.name : p.netName),
        x: r1(p.pos.x), y: r1(p.pos.y), a: Math.round(p.angle * 100) / 100,
        hp: r1(p.health), cd: r1(p.coolDown),
        d: p.isDead ? 1 : 0, ai: p.ai ? 1 : 0, c: p.color
      });
    }
    var bl = A.bulletList();
    for (i = 0; i < bl.length && bs.length < MAX_SHOWN_BULLETS; i++) {
      b = bl[i];
      bs.push({ x: r1(b.pos.x), y: r1(b.pos.y), a: Math.round(b.angle * 100) / 100,
                c: (b.owner && b.owner.color) || [0, 0, 0] });
    }
    db('world').put({
      id: 'world', hostId: me.id, t: t,
      w: A.w, h: A.h, gen: A.generation, wipe: wipeSeq,
      ps: ps, bs: bs
    }).catch(function () {});
  }

  /* ---- guest: publish input, render the snapshot ------------------------- */

  function sendInput(force) {
    if (!joined || owner) return;
    var t = now(), p = root.AAS.player;
    if (!p) return;
    if (!force && t - lastIn < 1000 / PUBLISH_HZ) return;
    lastIn = t;
    db('players').put({
      id: me.id, name: me.name, t: t,
      mv: { l: !!p.isMoving.left, u: !!p.isMoving.up, r: !!p.isMoving.right, d: !!p.isMoving.down },
      mx: r1((root.AAS.pad && root.AAS.pad.mx) || 0), my: r1((root.AAS.pad && root.AAS.pad.my) || 0),
      lx: r1(p.looking.x), ly: r1(p.looking.y),
      fire: !!p.isShooting
    }).catch(function () {});
  }

  function ghostFor(key, row) {
    var g = ghosts[key];
    if (!g) {
      g = ghosts[key] = { body: new Player(row.x, row.y, row.a, row.c, !!row.ai),
                          fx: row.x, fy: row.y, tx: row.x, ty: row.y, t0: now(), t1: now() + 80 };
      g.body.mate = !row.ai;
    }
    return g;
  }

  /* One snapshot in, a whole frame out: the bodies lerp between the last two
     snapshots and the bullets dead-reckon at Bullet.js's own speed, so 12 Hz
     of network reads as 60 Hz of arena. */
  function guestFrame() {
    sendInput(!!root.AAS.player && root.AAS.player.isShooting !== lastFire);
    lastFire = !!(root.AAS.player && root.AAS.player.isShooting);
    if (!world || !world.ps) return false;

    root.AAS.adoptArena(world.w, world.h);
    if (world.wipe && world.wipe !== wipeSeq) { wipeSeq = world.wipe; ghosts = {}; }

    var t = now(), seen = {}, i, row, g, u, bodies = [];
    for (i = 0; i < world.ps.length; i++) {
      row = world.ps[i];
      if (!row || !row.k) continue;
      seen[row.k] = 1;
      g = ghostFor(row.k, row);
      if (g.stamp !== world.t) {
        g.fx = g.body.pos.x; g.fy = g.body.pos.y;
        g.tx = row.x; g.ty = row.y;
        g.t0 = t; g.t1 = t + Math.max(60, 1000 / PUBLISH_HZ);
        g.stamp = world.t;
      }
      u = Math.max(0, Math.min(1, (t - g.t0) / (g.t1 - g.t0)));
      g.body.pos.x = g.fx + (g.tx - g.fx) * u;
      g.body.pos.y = g.fy + (g.ty - g.fy) * u;
      g.body.angle = row.a;
      g.body.health = row.hp;
      g.body.coolDown = row.cd;
      g.body.color = row.c || g.body.color;
      g.body.ai = !!row.ai;
      g.body.mate = !row.ai && row.k !== me.id;
      g.body.you = row.k === me.id;
      if (row.d && !g.body.isDead) { g.body.isDead = true; g.body.iAnim = 0; }
      if (!row.d) { g.body.isDead = false; g.body.iAnim = 0; }
      g.body.netName = row.n || '';
      if (row.k === me.id) {
        /* Keep the input carrier standing where the host says I am, or the
           thumb-stick would aim from a position nobody shares. */
        root.AAS.player.pos.x = g.body.pos.x;
        root.AAS.player.pos.y = g.body.pos.y;
      }
      bodies.push(g.body);
    }
    for (i in ghosts) if (!seen[i]) delete ghosts[i];

    var age = t - worldAt;
    ghostBullets.length = 0;
    for (i = 0; i < (world.bs || []).length; i++) {
      row = world.bs[i];
      ghostBullets.push({
        pos: { x: row.x + Math.cos(row.a) * BULLET_SPEED * age, y: row.y + Math.sin(row.a) * BULLET_SPEED * age },
        angle: row.a, size: 5, owner: { color: row.c || [0, 0, 0] },
        show: Bullet.prototype.show
      });
    }
    root.AAS.showRemote(bodies, ghostBullets, world.gen | 0);
    if (onRoster && world.t !== rosterStamp) { rosterStamp = world.t; onRoster(roster()); }
    return true;
  }

  function quiet() {
    return guest() && world != null && now() - worldAt > 6000;
  }

  root.AASCoop = {
    init: init,
    guest: guest,
    hosting: hosting,
    active: active,
    beforeHost: beforeHost,
    afterHost: afterHost,
    guestFrame: guestFrame,
    quiet: quiet,
    onDown: onDown,
    down: function (id) { return !!down[id || me.id]; },
    roster: roster,
    me: function () { return me; },
    onRoster: function (fn) { onRoster = fn; },
    /* the host marks a body down when IT dies, not only the local player */
    mark: function (p) {
      if (!hosting() || !p || p.ai) return false;
      return onDown(p === root.AAS.player ? me.id : p.netId);
    }
  };
})(window);
