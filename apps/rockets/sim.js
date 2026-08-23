/*
 * Rockets — pure sky. Rockets catch stars. No canvas, no db.
 *
 * Upstream (lauthieb/rocket-universe) is a 550×550 Node tick with ONE star
 * and 4-way keyboard accel, owned by Express + socket.io. This file keeps
 * the rule (a rocket overlapping a star collects it, score goes up) and
 * nothing of that stack. Tests in build.mjs drive this object.
 *
 * Classic IIFE. Attaches window.Rockets (or globalThis in Node).
 */
(function (root) {
  'use strict';

  var W = 1200;
  var H = 800;
  var ROCKET_R = 22;
  var STAR_R = 18;
  var STAR_N = 26;
  var ROUND_MS = 60000;
  var STEER = 12;
  var MAX_SPEED = 360;
  var DRAG = 8;
  var KIND_STAR = 0;
  var KIND_GOLD = 1;
  var KIND_COMET = 2;
  var POINTS = [1, 3, 5];

  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function hueFor(id) {
    var h = 0, s = String(id || ''), i;
    for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return (h % 360) / 360;
  }

  function pointsOf(k) { return POINTS[k] || 1; }

  function starKind(rng) {
    var r = rng();
    if (r < 0.10) return KIND_COMET;
    if (r < 0.30) return KIND_GOLD;
    return KIND_STAR;
  }

  function makeStar(id, x, y, k) {
    return { id: id, x: x, y: y, k: k, by: null };
  }

  function placeStar(rng, existing) {
    var tries = 28, i, j, x, y, ok, s, dx, dy;
    x = W * 0.5; y = H * 0.5;
    for (i = 0; i < tries; i++) {
      x = 48 + rng() * (W - 96);
      y = 48 + rng() * (H - 96);
      ok = true;
      for (j = 0; j < existing.length; j++) {
        s = existing[j];
        if (s.by) continue;
        dx = s.x - x; dy = s.y - y;
        if (dx * dx + dy * dy < 48 * 48) { ok = false; break; }
      }
      if (ok) return { x: x, y: y };
    }
    return { x: x, y: y };
  }

  function liveStars(sky) {
    var n = 0, i;
    if (!sky || !sky.stars) return 0;
    for (i = 0; i < sky.stars.length; i++) if (!sky.stars[i].by) n++;
    return n;
  }

  function freshSky(seed, now) {
    seed = (seed >>> 0) || 1;
    var rng = mulberry(seed);
    var stars = [];
    var seq = 0;
    var i, p;
    now = now || 0;
    for (i = 0; i < STAR_N; i++) {
      p = placeStar(rng, stars);
      stars.push(makeStar(++seq, p.x, p.y, starKind(rng)));
    }
    return {
      seed: seed,
      seq: seq,
      stars: stars,
      round: 1,
      startedAt: now,
      endsAt: now + ROUND_MS,
      phase: 'run',
      bump: true,
      awards: [],
      bumps: [],
      bumpN: 0,
      overAt: 0
    };
  }

  function spawnStar(sky, opts) {
    opts = opts || {};
    if (!sky) return sky;
    if (!opts.host) return sky;
    var rng = mulberry((sky.seed + (sky.seq + 1) * 0x9e3779b9) >>> 0);
    var p = placeStar(rng, sky.stars || []);
    sky.seq = (sky.seq || 0) + 1;
    if (!sky.stars) sky.stars = [];
    sky.stars.push(makeStar(sky.seq, p.x, p.y, starKind(rng)));
    return sky;
  }

  function refillStars(sky, isHost) {
    if (!sky) return sky;
    if (!isHost) return sky;
    if (!sky.stars) sky.stars = [];
    while (liveStars(sky) < STAR_N) spawnStar(sky, { host: true });
    return sky;
  }

  /* Comets drift around their spawn. Seeded from id so every client
     draws the same path without extra sky bytes. t<=0 keeps tests still. */
  function starPos(s, now, origin) {
    if (!s) return s;
    if (s.k !== KIND_COMET) return s;
    now = now || 0;
    origin = origin || 0;
    var t = (now - origin) / 1000;
    if (!(t > 0)) return s;
    var a = (s.id || 1) * 1.618;
    return {
      id: s.id, x: s.x + Math.cos(t * 0.62 + a) * 46,
      y: s.y + Math.sin(t * 0.48 + a) * 30,
      k: s.k, by: s.by
    };
  }

  function hitsStar(rocket, star, now, origin) {
    if (!rocket || !star || star.by) return false;
    var p = starPos(star, now, origin);
    var dx = rocket.x - p.x, dy = rocket.y - p.y;
    var r = ROCKET_R + STAR_R * (star.k === KIND_GOLD ? 1.05 : 0.82);
    return dx * dx + dy * dy <= r * r;
  }

  function tryCollect(sky, rocket, now) {
    if (!sky || !rocket || !sky.stars) {
      return { collected: false, points: 0, starId: null };
    }
    var origin = sky.startedAt || 0;
    now = now || 0;
    var i, s, pts;
    for (i = 0; i < sky.stars.length; i++) {
      s = sky.stars[i];
      if (hitsStar(rocket, s, now, origin)) {
        s.by = rocket.id;
        pts = pointsOf(s.k);
        rocket.score = (rocket.score || 0) + pts;
        return { collected: true, points: pts, starId: s.id, kind: s.k };
      }
    }
    return { collected: false, points: 0, starId: null };
  }

  function applyClaims(sky, claims) {
    var awarded = {};
    if (!sky || !sky.stars || !claims || !claims.length) {
      return { sky: sky, awarded: awarded };
    }
    var list = claims.slice().sort(function (a, b) {
      var ta = a && a.t != null ? a.t : 0;
      var tb = b && b.t != null ? b.t : 0;
      if (ta !== tb) return ta - tb;
      return String(a.playerId).localeCompare(String(b.playerId));
    });
    var taken = {}, i, j, c, s, pts;
    for (j = 0; j < sky.stars.length; j++) {
      if (sky.stars[j].by) taken[sky.stars[j].id] = sky.stars[j].by;
    }
    for (i = 0; i < list.length; i++) {
      c = list[i];
      if (!c || c.starId == null || taken[c.starId]) continue;
      s = null;
      for (j = 0; j < sky.stars.length; j++) {
        if (sky.stars[j].id === c.starId) { s = sky.stars[j]; break; }
      }
      if (!s || s.by) continue;
      s.by = c.playerId;
      taken[c.starId] = c.playerId;
      pts = pointsOf(s.k);
      awarded[c.playerId] = (awarded[c.playerId] || 0) + pts;
    }
    return { sky: sky, awarded: awarded };
  }

  function spawnRocket(id, x, y) {
    if (x == null) x = W * 0.5;
    if (y == null) y = H * 0.5;
    return {
      id: id,
      x: x, y: y,
      vx: 0, vy: 0,
      angle: -Math.PI / 2,
      score: 0,
      combo: 0
    };
  }

  function spawnPos(id) {
    var h = 0, s = String(id || 'x'), i;
    for (i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
    var rng = mulberry(h || 1);
    return { x: W * 0.28 + rng() * W * 0.44, y: H * 0.28 + rng() * H * 0.44 };
  }

  function clampRocket(r) {
    var m = ROCKET_R;
    if (r.x < m) { r.x = m; r.vx = Math.abs(r.vx) * 0.35; }
    if (r.y < m) { r.y = m; r.vy = Math.abs(r.vy) * 0.35; }
    if (r.x > W - m) { r.x = W - m; r.vx = -Math.abs(r.vx) * 0.35; }
    if (r.y > H - m) { r.y = H - m; r.vy = -Math.abs(r.vy) * 0.35; }
  }

  /* Stick is target velocity, not thrust. Release coasts to a stop.
     This is the .io-snack feel the original 4-way accel never had. */
  function integrate(rocket, input, dt) {
    dt = Math.max(0, Math.min(0.05, dt || 0));
    var ix = (input && input.x) || 0;
    var iy = (input && input.y) || 0;
    var m = Math.hypot(ix, iy);
    if (m > 1) { ix /= m; iy /= m; m = 1; }
    var tx = ix * MAX_SPEED, ty = iy * MAX_SPEED;
    var k = 1 - Math.exp(-STEER * dt);
    rocket.vx += (tx - rocket.vx) * k;
    rocket.vy += (ty - rocket.vy) * k;
    rocket.x += rocket.vx * dt;
    rocket.y += rocket.vy * dt;
    var sp = Math.hypot(rocket.vx, rocket.vy);
    if (m > 0.08) rocket.angle = Math.atan2(iy, ix);
    else if (sp > 18) rocket.angle = Math.atan2(rocket.vy, rocket.vx);
    clampRocket(rocket);
    return rocket;
  }

  function resolveBumps(rockets, isHost) {
    var events = [];
    if (!isHost || !rockets || rockets.length < 2) return events;
    var i, j, a, b, dx, dy, dist, nx, ny, overlap, va, vb, imp;
    for (i = 0; i < rockets.length; i++) {
      for (j = i + 1; j < rockets.length; j++) {
        a = rockets[i]; b = rockets[j];
        dx = b.x - a.x; dy = b.y - a.y;
        dist = Math.hypot(dx, dy);
        if (dist < 0.001) { dx = 1; dy = 0; dist = 1; }
        if (dist >= ROCKET_R * 2) continue;
        nx = dx / dist; ny = dy / dist;
        overlap = ROCKET_R * 2 - dist;
        a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5;
        va = a.vx * nx + a.vy * ny;
        vb = b.vx * nx + b.vy * ny;
        imp = vb - va;
        a.vx += nx * imp; a.vy += ny * imp;
        b.vx -= nx * imp; b.vy -= ny * imp;
        clampRocket(a); clampRocket(b);
        events.push({
          a: a.id, b: b.id,
          ax: a.x, ay: a.y, bx: b.x, by: b.y,
          avx: a.vx, avy: a.vy, bvx: b.vx, bvy: b.vy
        });
      }
    }
    return events;
  }

  function pruneTaken(sky) {
    if (!sky || !sky.stars) return sky;
    var live = [], i;
    for (i = 0; i < sky.stars.length; i++) if (!sky.stars[i].by) live.push(sky.stars[i]);
    sky.stars = live;
    return sky;
  }

  function nextRound(sky, now, isHost) {
    if (!sky || !isHost) return sky;
    now = now || 0;
    sky.round = (sky.round || 1) + 1;
    sky.startedAt = now;
    sky.endsAt = now + ROUND_MS;
    sky.phase = 'run';
    sky.overAt = 0;
    sky.stars = [];
    sky.awards = [];
    sky.bumps = [];
    sky.seq = sky.round * 1000;
    refillStars(sky, true);
    return sky;
  }

  function tickRound(sky, now, isHost) {
    if (!sky) return sky;
    now = now || 0;
    if (sky.phase === 'run' && now >= sky.endsAt) {
      sky.phase = 'over';
      sky.overAt = now;
    }
    if (isHost && sky.phase === 'over' && now - (sky.overAt || sky.endsAt) > 4000) {
      nextRound(sky, now, true);
    }
    return sky;
  }

  root.Rockets = {
    W: W, H: H, ROCKET_R: ROCKET_R, STAR_R: STAR_R, STAR_N: STAR_N,
    ROUND_MS: ROUND_MS, POINTS: POINTS, STEER: STEER, MAX_SPEED: MAX_SPEED,
    KIND_STAR: KIND_STAR, KIND_GOLD: KIND_GOLD, KIND_COMET: KIND_COMET,
    mulberry: mulberry, hueFor: hueFor, pointsOf: pointsOf, starPos: starPos,
    freshSky: freshSky, spawnStar: spawnStar, refillStars: refillStars,
    hitsStar: hitsStar, tryCollect: tryCollect, applyClaims: applyClaims,
    spawnRocket: spawnRocket, spawnPos: spawnPos, integrate: integrate,
    resolveBumps: resolveBumps, pruneTaken: pruneTaken,
    nextRound: nextRound, tickRound: tickRound, liveStars: liveStars
  };
})(typeof window !== 'undefined' ? window : globalThis);
