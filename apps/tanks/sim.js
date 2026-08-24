/* Tanks physics. No DOM. app.js paints; tests play this. */
(function (root) {
  'use strict';
  var W = 720, H = 480;
  var SPEED = 130, TURN = 2.6, BSPEED = 320, RATE = 380, BLIFE = 1.1;
  var TR = 16, BR = 3, MAX_LIVES = 3, RESPAWN = 2200, SHIELD = 1400;
  var WALLS = [
    { x: 180, y: 130, w: 36, h: 220 },
    { x: 504, y: 130, w: 36, h: 220 },
    { x: 300, y: 222, w: 120, h: 36 },
    { x: 70, y: 232, w: 64, h: 22 },
    { x: 586, y: 232, w: 64, h: 22 },
    { x: 328, y: 64, w: 64, h: 22 },
    { x: 328, y: 394, w: 64, h: 22 }
  ];
  var SPAWNS = [
    { x: 60, y: 60 }, { x: 660, y: 60 }, { x: 60, y: 420 },
    { x: 660, y: 420 }, { x: 360, y: 48 }, { x: 360, y: 432 }
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function spawnAt(n) {
    var s = SPAWNS[((n % SPAWNS.length) + SPAWNS.length) % SPAWNS.length];
    return { x: s.x, y: s.y };
  }
  function hitWall(x, y, r) {
    if (x - r < 0 || y - r < 0 || x + r > W || y + r > H) return true;
    var i, w;
    for (i = 0; i < WALLS.length; i++) {
      w = WALLS[i];
      if (x + r > w.x && x - r < w.x + w.w && y + r > w.y && y - r < w.y + w.h) return true;
    }
    return false;
  }
  function overlapTank(x, y, r, bodies, skip) {
    var i, b;
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      if (!b || b === skip || b.alive === false) continue;
      if (Math.hypot(x - b.x, y - b.y) < r + TR - 2) return b;
    }
    return null;
  }
  function tryMove(body, nx, ny, others) {
    var ox = body.x, oy = body.y;
    if (!hitWall(nx, oy, TR) && !overlapTank(nx, oy, TR, others, body)) body.x = nx;
    if (!hitWall(body.x, ny, TR) && !overlapTank(body.x, ny, TR, others, body)) body.y = ny;
    return body.x !== ox || body.y !== oy;
  }

  function fire(from, a, remote) {
    if (!from || !from.alive) return null;
    return {
      x: from.x + Math.cos(a) * (TR + 8),
      y: from.y + Math.sin(a) * (TR + 8),
      a: a, life: BLIFE, by: from.id || 'me', remote: !!remote
    };
  }

  function boom(g, x, y, n, col) {
    var i;
    for (i = 0; i < n; i++) {
      g.particles.push({
        x: x, y: y,
        vx: (g.rand() - 0.5) * 180,
        vy: (g.rand() - 0.5) * 180,
        life: 0.4 + g.rand() * 0.3,
        col: col || '#fc3'
      });
    }
  }

  function resetTank(g, tank, i) {
    var s = spawnAt(i == null ? 0 : i);
    tank.x = s.x; tank.y = s.y; tank.rot = 0; tank.tur = 0;
    tank.lives = MAX_LIVES; tank.alive = true; tank.spawn = (tank.spawn || 0) + 1;
    tank.shieldUntil = g.now + SHIELD;
    tank.dist = 0;
  }

  function startDrones(g) {
    g.drones = [
      { x: 600, y: 400, rot: 0, tur: 0, lives: 3, alive: true, id: 'drone-a', cd: 0.4, hue: 0.0, spawn: 0, dist: 0, shieldUntil: 0 },
      { x: 360, y: 80, rot: Math.PI, tur: Math.PI, lives: 3, alive: true, id: 'drone-b', cd: 0.9, hue: 0.55, spawn: 0, dist: 0, shieldUntil: 0 }
    ];
  }

  function create(opts) {
    opts = opts || {};
    var seed = opts.seed == null ? 1 : opts.seed;
    var g = {
      now: 0,
      lastShot: -9999,
      deadUntil: 0,
      bullets: [],
      particles: [],
      drones: [],
      shake: 0,
      flash: 0,
      rand: function () {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      }
    };
    g.me = {
      x: 60, y: 60, rot: 0, tur: 0, lives: MAX_LIVES, alive: true,
      spawn: 0, k: 0, d: 0, hue: 0.12, id: opts.id || 'me', dist: 0, shieldUntil: 0
    };
    resetTank(g, g.me, 0);
    startDrones(g);
    return g;
  }

  function shielded(t, now) { return t.shieldUntil && now < t.shieldUntil; }

  function hurt(g, tank, dmg) {
    if (!tank.alive) return false;
    if (tank === g.me && shielded(tank, g.now)) return false;
    tank.lives -= dmg;
    boom(g, tank.x, tank.y, 6, '#f64');
    g.shake = Math.max(g.shake, 6);
    if (tank.lives <= 0) {
      tank.lives = 0; tank.alive = false;
      boom(g, tank.x, tank.y, 18, '#fa4');
      g.shake = 12;
      return true;
    }
    return false;
  }

  function stepDrone(g, d, dt, bodies) {
    if (!d.alive) return;
    var me = g.me;
    var ang = Math.atan2(me.y - d.y, me.x - d.x);
    d.tur = ang;
    var want = ang + Math.sin(g.now / 700 + d.x) * 0.5;
    var spin = Math.atan2(Math.sin(want - d.rot), Math.cos(want - d.rot));
    d.rot += clamp(spin, -TURN * dt, TURN * dt);
    var nx = d.x + Math.cos(d.rot) * SPEED * 0.45 * dt;
    var ny = d.y + Math.sin(d.rot) * SPEED * 0.45 * dt;
    tryMove(d, nx, ny, bodies);
    d.cd -= dt;
    if (d.cd <= 0 && me.alive && !shielded(me, g.now)) {
      d.cd = 1.05 + g.rand() * 0.55;
      var b = fire(d, d.tur, false);
      if (b) g.bullets.push(b);
    }
  }

  function drive(body, mx, my, dt, bodies) {
    if (!(mx || my) || !body.alive) return;
    var wish = Math.atan2(my, mx);
    var spin = Math.atan2(Math.sin(wish - body.rot), Math.cos(wish - body.rot));
    body.rot += clamp(spin, -TURN * dt, TURN * dt);
    var sp = SPEED * Math.min(1, Math.hypot(mx, my));
    var nx = body.x + Math.cos(body.rot) * sp * dt;
    var ny = body.y + Math.sin(body.rot) * sp * dt;
    if (tryMove(body, nx, ny, bodies)) body.dist = (body.dist || 0) + sp * dt;
  }

  function step(g, dt, input, net) {
    input = input || {};
    net = net || {};
    var keys = input.keys || {};
    var moveStick = input.moveStick || { x: 0, y: 0 };
    var aimStick = input.aimStick || { x: 0, y: 0, fire: false };
    var pointer = input.pointer || { x: g.me.x + 40, y: g.me.y, down: false };
    var touchOn = !!input.touchOn;
    if (input.now != null) g.now = input.now;
    else g.now += dt * 1000;
    if (g.shake) g.shake = Math.max(0, g.shake - dt * 28);
    if (g.flash) g.flash = Math.max(0, g.flash - dt);

    if (!g.me.alive && g.deadUntil && g.now >= g.deadUntil) {
      resetTank(g, g.me, Math.floor(g.rand() * SPAWNS.length));
      g.deadUntil = 0;
      if (net.on && net.respawn) net.respawn(g.me.x, g.me.y);
    }

    var mx = 0, my = 0;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    if (keys.KeyW || keys.ArrowUp) my -= 1;
    if (keys.KeyS || keys.ArrowDown) my += 1;
    if (touchOn) { mx += moveStick.x || 0; my += moveStick.y || 0; }

    var others = [];
    var i, id, o, interp;
    if (net.on && net.others) {
      o = net.others();
      for (id in o) {
        interp = net.interpolate ? net.interpolate(o[id], g.now) : o[id];
        others.push({ x: interp.x, y: interp.y, alive: o[id].alive !== false, id: id });
      }
    }
    var bodies = [g.me].concat(g.drones).concat(others);

    if (g.me.alive) {
      drive(g.me, mx, my, dt, bodies);
      if (touchOn && (aimStick.x || aimStick.y)) g.me.tur = Math.atan2(aimStick.y, aimStick.x);
      else g.me.tur = Math.atan2(pointer.y - g.me.y, pointer.x - g.me.x);
      var shooting = pointer.down || keys.Space || aimStick.fire || input.fire;
      if (shooting && g.now - g.lastShot >= RATE) {
        g.lastShot = g.now;
        var shot = fire(g.me, g.me.tur, false);
        if (shot) {
          g.bullets.push(shot);
          g.flash = 0.08;
          if (net.on && net.claimShot) net.claimShot(g.me.x, g.me.y, g.me.tur);
        }
      }
    }

    var practice = !net.on || !net.otherCount || net.otherCount() === 0;
    if (practice) {
      if (!g.drones.length) startDrones(g);
      for (i = 0; i < g.drones.length; i++) stepDrone(g, g.drones[i], dt, bodies);
    } else {
      g.drones = [];
    }

    var b, j, dx, dy, meId = (net.meId) || g.me.id || 'me';
    for (j = g.bullets.length - 1; j >= 0; j--) {
      b = g.bullets[j];
      b.x += Math.cos(b.a) * BSPEED * dt;
      b.y += Math.sin(b.a) * BSPEED * dt;
      b.life -= dt;
      if (b.life <= 0 || hitWall(b.x, b.y, BR)) { g.bullets.splice(j, 1); continue; }
      if (b.by !== 'me' && b.by !== meId && g.me.alive) {
        if (Math.hypot(b.x - g.me.x, b.y - g.me.y) < TR) {
          g.bullets.splice(j, 1);
          if (!b.remote && !shielded(g.me, g.now)) {
            if (hurt(g, g.me, 1)) {
              g.me.d++;
              g.deadUntil = g.now + RESPAWN;
            }
            if (net.tookHit) net.tookHit(1, b.by, 'Tank');
          }
          continue;
        }
      }
      if (b.by === 'me' || b.by === meId) {
        var hit = false;
        for (i = 0; i < g.drones.length; i++) {
          if (!g.drones[i].alive) continue;
          if (Math.hypot(b.x - g.drones[i].x, b.y - g.drones[i].y) < TR) {
            g.bullets.splice(j, 1);
            if (hurt(g, g.drones[i], 1)) {
              g.me.k++;
              g.drones[i]._respawnAt = g.now + 1800;
            }
            hit = true;
            break;
          }
        }
        if (hit) continue;
        if (net.on && net.others) {
          o = net.others();
          for (id in o) {
            if (!o[id].alive) continue;
            interp = net.interpolate ? net.interpolate(o[id], g.now) : o[id];
            dx = b.x - interp.x; dy = b.y - interp.y;
            if (dx * dx + dy * dy < TR * TR) {
              g.bullets.splice(j, 1);
              if (net.claimHit) net.claimHit(id, 1);
              boom(g, interp.x, interp.y, 8, '#fc3');
              break;
            }
          }
        }
      }
    }
    for (i = 0; i < g.drones.length; i++) {
      if (!g.drones[i].alive && g.drones[i]._respawnAt && g.now >= g.drones[i]._respawnAt) {
        resetTank(g, g.drones[i], Math.floor(g.rand() * SPAWNS.length));
        g.drones[i]._respawnAt = 0;
      }
    }
    for (j = g.particles.length - 1; j >= 0; j--) {
      g.particles[j].x += g.particles[j].vx * dt;
      g.particles[j].y += g.particles[j].vy * dt;
      g.particles[j].life -= dt;
      if (g.particles[j].life <= 0) g.particles.splice(j, 1);
    }
    if (net.on && net.tick) net.tick(g.me.x, g.me.y, g.me.rot, g.me.tur);
    return g;
  }

  root.TanksSim = {
    W: W, H: H, WALLS: WALLS, SPAWNS: SPAWNS,
    SPEED: SPEED, TURN: TURN, BSPEED: BSPEED, RATE: RATE, BLIFE: BLIFE,
    TR: TR, BR: BR, MAX_LIVES: MAX_LIVES, RESPAWN: RESPAWN, SHIELD: SHIELD,
    clamp: clamp, hitWall: hitWall, overlapTank: overlapTank, spawnAt: spawnAt,
    fire: fire, create: create, step: step, hurt: hurt, resetTank: resetTank,
    startDrones: startDrones, shielded: shielded
  };
})(typeof window !== 'undefined' ? window : globalThis);
