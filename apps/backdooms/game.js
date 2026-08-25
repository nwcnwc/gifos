/*
 * Backdooms — the simulation, as a classic script.
 * Logic descends from Kuber Mehta's THE-BACKDOOMS.html (MIT). The view is
 * render.js, the pictures are art.js, the GifOS shell is boot.js.
 *
 * One original frame is one step() at 16 ms, and draw() is optional, so a unit
 * test can play the whole loop with no canvas and no browser.
 *
 * Three things changed from upstream, and each one is here because the new
 * renderer made the old behaviour visible:
 *
 *   THE LEVEL. Upstream's world is `noise < 0.05 ? wall : floor` over a grid
 *   with two forced corridor lines — which is not a maze, it is an open plain
 *   with about fifteen pillars scattered across it. That is invisible when
 *   every surface is one flat colour, and glaring the moment walls have a
 *   baseboard: you almost never SEE a wall, so the texture never pays. It is
 *   now a lattice of one-wide halls with rooms, pillar halls, partitioned
 *   rooms and solid mass between them — the Backrooms' own floor plan, still
 *   infinite, still a pure function of (i, j, seed), and connected by
 *   construction because the lattice is never blocked.
 *
 *   COLLISION. `f(~~nx, ~~ny)` truncates toward zero, so at negative
 *   coordinates it tests the wrong cell and you walk through the wall — and
 *   it tested the player as a POINT, so you could push your eye inside a wall
 *   and see the level from within. Math.floor, a radius, and per-axis
 *   resolution so you slide along a wall instead of sticking to it.
 *
 *   THE GUN. It was a hitscan cone that fired through walls. It is a shotgun
 *   now: one true pellet down the crosshair and six spread, damage falling off
 *   with range, and every pellet checked against the level first. Shooting a
 *   thing through two rooms of solid mass was funny exactly once.
 */
(function (root) {
  'use strict';

  var M = Math.cos, N = Math.sin, P = Math.hypot, T = Math.atan2;
  var x, y, a, hp, ammo, score, seed, seedI;
  var enemies, keys, running, paused, raf, ready;
  var mflash, flashId, kick, pain, pumpT, bob, hurtT;
  var lookGain = 0.0022;
  var remotes = [], remotePhase = {};
  var lastT = 0, STEP = 16;
  var HALL = 7, R = 0.26;

  /* ---- the level ------------------------------------------------------- */

  function mod(n, m) { return ((n % m) + m) % m; }

  /* An integer hash, not sin(x)*43758 — cell() is called tens of thousands of
     times a frame by the raycaster now, and a transcendental per call is a
     frame budget spent on nothing. */
  function h2(i, j) {
    var n = (Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ seedI) >>> 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function cell(i, j) {
    i = i | 0; j = j | 0;
    /* the room you wake in is always clear */
    if (i > -1 && i < 9 && j > -1 && j < 9) return '0';
    var hi = mod(i, HALL), hj = mod(j, HALL);
    if (hi === 0 || hj === 0) return '0';            /* the hallway lattice */
    var r = h2(Math.floor(i / HALL), Math.floor(j / HALL));
    if (r < 0.40) return '0';                         /* an open room */
    if (r < 0.56) return (hi % 2 === 0 && hj % 2 === 0) ? '1' : '0';  /* pillars */
    if (r < 0.70) return hi === 3 ? '1' : '0';        /* a partition */
    return '1';                                       /* solid mass */
  }

  /* Where the fluorescents are. Halls always get a line of them — a corridor
     with no lights is a corridor you cannot read the length of. */
  function light(i, j) {
    i = i | 0; j = j | 0;
    if (i > -1 && i < 9 && j > -1 && j < 9) return mod(i, 3) === 1 && mod(j, 3) === 1;
    var hi = mod(i, HALL), hj = mod(j, HALL);
    if (hi === 0 || hj === 0) return mod(i + j, 3) === 0;
    return mod(i, 3) === 1 && mod(j, 3) === 1;
  }

  function solid(px, py) { return cell(Math.floor(px), Math.floor(py)) === '1'; }

  /* ---- run state -------------------------------------------------------- */

  function reset(opts) {
    opts = opts || {};
    seed = opts.seed != null ? opts.seed : Math.random() * 100;
    seedI = (seed * 4096) | 0;
    x = 4; y = 4; a = 0; hp = 100; ammo = 25; score = 0;
    mflash = 0; flashId = 0; kick = 0; pain = 0; pumpT = -1; bob = 0; hurtT = 0;
    enemies = [
      { x: 6.5, y: 4, h: 100, phase: 0, hurt: 0, dying: null, cool: 0 },
      { x: 4, y: 6.5, h: 100, phase: 3, hurt: 0, dying: null, cool: 0 }
    ];
    keys = keys || {};
    keys._jx = 0; keys._jy = 0;
    running = true; paused = false; lastT = 0;
  }

  function angDiff(from, to) {
    var r = to - from;
    if (r > Math.PI) r -= 2 * Math.PI;
    if (r < -Math.PI) r += 2 * Math.PI;
    return r;
  }

  /* ---- the shotgun ------------------------------------------------------ */

  /* March the level between here and there. Cheap, and it is the difference
     between a gun and a wish. */
  function losClear(ox, oy) {
    var dx = ox - x, dy = oy - y, d = P(dx, dy);
    if (d < 0.35) return true;
    var n = Math.ceil(d / 0.22), i;
    dx /= n; dy /= n;
    var cx = x, cy = y;
    for (i = 0; i < n; i++) {
      cx += dx; cy += dy;
      if (solid(cx, cy)) return false;
    }
    return true;
  }

  /* Everything shootable, with its bearing and how wide it looks from here. */
  function targets() {
    var out = [], i, o, d;
    for (i = 0; i < enemies.length; i++) {
      o = enemies[i];
      if (o.dying != null) continue;
      d = P(o.x - x, o.y - y);
      if (d > 11 || !losClear(o.x, o.y)) continue;
      out.push({ o: o, d: d, rel: angDiff(a, T(o.y - y, o.x - x)), id: null });
    }
    for (i = 0; i < remotes.length; i++) {
      o = remotes[i];
      if (!o || !o.id) continue;
      d = P(o.x - x, o.y - y);
      if (d > 11 || !losClear(o.x, o.y)) continue;
      out.push({ o: o, d: d, rel: angDiff(a, T(o.y - y, o.x - x)), id: o.id });
    }
    return out;
  }

  function shoot() {
    if (!running || paused || ammo <= 0) return { hits: [] };
    ammo--;
    mflash = 1;
    flashId = (flashId + 1) % 3;
    kick = 1;
    pumpT = 0;
    var tg = targets(), hits = [], k, i, best, bestD, off, dmg;
    var PELLETS = 7;
    for (k = 0; k < PELLETS; k++) {
      /* pellet 0 goes exactly where the crosshair is — a shotgun that can
         miss a thing you are standing on top of is not a shotgun */
      off = k === 0 ? 0 : (Math.random() - 0.5) * 0.30;
      best = null; bestD = 1e9;
      for (i = 0; i < tg.length; i++) {
        var t = tg[i];
        /* something already on its way down does not stop the rest of the
           volley — the pellets behind it carry on into whatever was standing
           in its shadow */
        if (t.spent) continue;
        /* how wide a body looks at that range */
        var half = Math.atan2(0.44, Math.max(0.30, t.d));
        if (Math.abs(t.rel - off) < half && t.d < bestD) { best = t; bestD = t.d; }
      }
      if (!best) continue;
      dmg = (k === 0 ? 21 : 16) * (best.d > 6 ? Math.max(0.35, 1 - (best.d - 6) / 8) : 1);
      var o = best.o;
      o.h = Math.max(0, (o.h == null ? 100 : o.h) - dmg);
      o.hurt = 1;
      if (best.id) {
        if (hits.indexOf(best.id) < 0) hits.push(best.id);
        if (o.h <= 0) best.spent = 1;
      } else if (o.h <= 0 && o.dying == null) {
        o.dying = 0;
        best.spent = 1;
        score++;
      }
    }
    if (root.Net && root.Net.onShot) root.Net.onShot(hits);
    return { hits: hits };
  }

  function hurt(n) {
    if (!running || paused) return;
    hp -= n | 0;
    pain = 1;
  }

  function look(dx) {
    if (!running || paused) return;
    a += dx * lookGain;
    if (a > Math.PI) a -= 2 * Math.PI;
    if (a < -Math.PI) a += 2 * Math.PI;
  }

  function setLookSpeed(v) { lookGain = 0.0004 + (v | 0) * 0.00022; }

  function setRemotes(list) {
    remotes = list || [];
    var seen = {}, i;
    for (i = 0; i < remotes.length; i++) {
      var r = remotes[i];
      if (!r || !r.id) continue;
      seen[r.id] = 1;
      var p = remotePhase[r.id];
      if (!p) p = remotePhase[r.id] = { ph: 0, x: r.x, y: r.y };
      var moved = P(r.x - p.x, r.y - p.y);
      p.ph += moved * 2.6;
      p.x = r.x; p.y = r.y;
      r.phase = p.ph;
    }
    for (var id in remotePhase) if (!seen[id]) delete remotePhase[id];
  }

  /* ---- movement --------------------------------------------------------- */

  /* Per axis, with a body radius, so a wall stops you at arm's length and you
     slide along it instead of catching on the corner. */
  function tryMove(nx, ny) {
    var dx = nx - x, dy = ny - y;
    if (dx !== 0 && !solid(nx + (dx > 0 ? R : -R), y)) x = nx;
    if (dy !== 0 && !solid(x, ny + (dy > 0 ? R : -R))) y = ny;
  }

  function applyInput(frames) {
    var k = keys || {};
    var moving = false, m = 0.1 * frames, nx, ny, mx = 0, my = 0;
    if (k.ArrowLeft) a -= 0.06 * frames;
    if (k.ArrowRight) a += 0.06 * frames;
    if (k.ArrowUp || k.w) { mx += M(a); my += N(a); }
    if (k.ArrowDown || k.s) { mx -= M(a); my -= N(a); }
    if (k.a) { mx += M(a - Math.PI / 2); my += N(a - Math.PI / 2); }
    if (k.d) { mx += M(a + Math.PI / 2); my += N(a + Math.PI / 2); }
    if (k._jx || k._jy) {
      mx += M(a) * -k._jy + M(a + Math.PI / 2) * k._jx;
      my += N(a) * -k._jy + N(a + Math.PI / 2) * k._jx;
    }
    var mag = P(mx, my);
    if (mag > 0.001) {
      if (mag > 1) { mx /= mag; my /= mag; }   /* diagonals are not faster */
      nx = x + mx * m; ny = y + my * m;
      tryMove(nx, ny);
      moving = true;
      bob += 0.26 * frames * Math.min(1, mag);
    }
    return moving;
  }

  /* ---- the things ------------------------------------------------------- */

  function spawnNear(frames) {
    /* Prefer to put them BEHIND you or out to the side. A thing that blinks
       into existence in the middle of the corridor you are looking at reads as
       a bug; one you turn around and find reads as the Backrooms. */
    var t, dist, X, Y, tries;
    for (tries = 0; tries < 8; tries++) {
      t = a + Math.PI + (Math.random() - 0.5) * 3.4;
      dist = 3.2 + Math.random() * 4.5;
      X = x + M(t) * dist; Y = y + N(t) * dist;
      if (cell(Math.floor(X), Math.floor(Y)) === '0') {
        enemies.push({ x: X, y: Y, h: 100, phase: Math.random() * 8, hurt: 0, dying: null, cool: 0 });
        return;
      }
    }
  }

  function tickEnemies(moving, frames, dt) {
    var i, o, dx, dy, di, nx, ny, local, n, f;
    for (f = 0; f < frames; f++) {
      if (moving) {
        local = 0;
        for (i = 0; i < enemies.length; i++) {
          if (enemies[i].dying == null && P(enemies[i].x - x, enemies[i].y - y) < 6) local++;
        }
        if (local < 5 && Math.random() < 0.02) {
          n = 1 + (Math.random() * 3 | 0);
          for (i = 0; i < n; i++) spawnNear();
        }
      }
      if (Math.random() < 0.005 && ammo < 25) ammo++;
    }
    for (i = 0; i < enemies.length; i++) {
      o = enemies[i];
      o.hurt = Math.max(0, o.hurt - 0.09 * frames);
      if (o.dying != null) { o.dying += dt / 420; continue; }
      dx = x - o.x; dy = y - o.y; di = P(dx, dy);
      if (di > 0.2) {
        var sp = (0.0015 + 0.003 / di) * frames;
        nx = o.x + dx / di * sp;
        ny = o.y + dy / di * sp;
        if (!solid(nx, o.y)) o.x = nx;
        if (!solid(o.x, ny)) o.y = ny;
        o.phase += sp * 46;
      }
      o.cool -= dt;
      if (di < 0.72 && o.cool <= 0) {
        o.cool = 620;
        hp -= 7;
        pain = 1;
      }
    }
    /* Let go of the ones you walked away from. Upstream never did, so a long
       run accumulated a mob it was still stepping every frame — invisible when
       nothing is drawn per enemy, expensive now that each one is a sprite. */
    enemies = enemies.filter(function (e) {
      if (e.dying != null) return e.dying < 1;
      return P(e.x - x, e.y - y) < 26;
    });
  }

  /* ---- the loop --------------------------------------------------------- */

  function step(dt) {
    if (!running || paused) return;
    if (dt == null) dt = STEP;
    if (dt > 50) dt = 50;
    var frames = dt / STEP;
    kick = Math.max(0, kick - 0.09 * frames);
    mflash = Math.max(0, mflash - 0.30 * frames);
    pain = Math.max(0, pain - 0.055 * frames);
    if (pumpT >= 0) { pumpT += dt; if (pumpT > 460) pumpT = -1; }
    var moving = applyInput(frames);
    tickEnemies(moving, frames, dt);
    if (hp <= 0) {
      hp = 0;
      running = false;
      if (root.Backdooms.onDead) root.Backdooms.onDead(score);
    }
  }

  /* What the renderer needs, and nothing it does not. */
  function view() {
    var list = [], i, o;
    for (i = 0; i < enemies.length; i++) {
      o = enemies[i];
      list.push({ x: o.x, y: o.y, phase: o.phase, hurt: o.hurt, dying: o.dying, pale: false });
    }
    for (i = 0; i < remotes.length; i++) {
      o = remotes[i];
      if (!o) continue;
      list.push({ x: o.x, y: o.y, phase: o.phase || 0, hurt: 0, dying: null, pale: true });
    }
    /* The pump kicks the muzzle up and drops it back — the recoil you SEE is
       most of what a shotgun feels like. */
    var pump = 0;
    if (pumpT >= 0) {
      var pt = pumpT / 460;
      pump = pt < 0.45 ? pt / 0.45 : (1 - pt) / 0.55;
      if (pump < 0) pump = 0;
    }
    return {
      x: x, y: y, a: a,
      pitch: -kick * 0.055 + N(bob * 2) * 0.006,
      bob: bob, kick: kick, pump: pump,
      flash: mflash, flashId: flashId, pain: pain,
      sprites: list, cell: cell, light: light
    };
  }

  function draw() {
    if (!ready) return;
    root.Render.frame(view());
  }

  function frame(now) {
    if (!running) return;
    if (!paused) {
      if (!lastT) lastT = now || 0;
      var dt = (now && lastT) ? (now - lastT) : STEP;
      lastT = now || (lastT + STEP);
      step(dt);
    } else {
      lastT = now || lastT;
    }
    draw();
    if (!running) { draw(); return; }
    raf = requestAnimationFrame(frame);
    if (root.Net && root.Net.tick) root.Net.tick();
  }

  function start(opts) {
    opts = opts || {};
    reset(opts);
    if (!opts.headless && root.Render && !ready) ready = root.Render.init();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastT = 0;
    if (opts.headless) return;
    frame(0);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function setPaused(v) { paused = !!v; lastT = 0; }

  function state() {
    var live = 0, i;
    for (i = 0; i < (enemies || []).length; i++) if (enemies[i].dying == null) live++;
    return {
      x: x, y: y, a: a, hp: hp, ammo: ammo, score: score, seed: seed,
      alive: !!running, paused: !!paused, enemies: live
    };
  }

  root.Backdooms = {
    start: start,
    stop: stop,
    step: step,
    draw: draw,
    view: view,
    shoot: shoot,
    look: look,
    hurt: hurt,
    setLookSpeed: setLookSpeed,
    setRemotes: setRemotes,
    setPaused: setPaused,
    cell: cell,
    light: light,
    keys: function () { if (!keys) keys = {}; return keys; },
    state: state,
    onDead: null
  };
})(window);
