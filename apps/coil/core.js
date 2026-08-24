/**
 * Coil rules, without a canvas. Hakim's game draws the trail and the orbs;
 * enclosure, energy and score live here so a vm can PLAY a run, and so the
 * live game does not have to read every pixel of the frame to see a loop.
 */
(function (root) {
  'use strict';

  var ENEMY_NORMAL = 1;
  var ENEMY_BOMB = 2;
  var ENEMY_NORMAL_MOVER = 3;
  var ENEMY_BOMB_MOVER = 4;
  var SCORE_PER_ENEMY = 30;
  var ENERGY_PER_ENEMY_DEATH = -30;
  var ENERGY_PER_ENEMY_ENCLOSED = 1;
  var ENERGY_PER_BOMB_ENCLOSED = -30;
  var TRAIL_LENGTH = 45;
  var MULTIPLIER_STEP = 0.2;
  var MULTIPLIER_LIMIT = 4;
  var ENEMY_COUNT = 2;

  function lerp(a, b, t) { return a + (b - a) * t; }

  function pointInPoly(pts, x, y) {
    if (!pts || pts.length < 3) return false;
    var inside = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i].x, yi = pts[i].y;
      var xj = pts[j].x, yj = pts[j].y;
      var denom = (yj - yi) || 1e-12;
      var hit = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / denom + xi);
      if (hit) inside = !inside;
    }
    return inside;
  }

  function findLineIntersection(p1, p2, p3, p4) {
    if (!p1 || !p2 || !p3 || !p4) return null;
    var s1x = p2.x - p1.x, s1y = p2.y - p1.y;
    var s2x = p4.x - p3.x, s2y = p4.y - p3.y;
    var denom = (-s2x * s1y + s1x * s2y);
    if (!denom) return null;
    var s = (-s1y * (p1.x - p3.x) + s1x * (p1.y - p3.y)) / denom;
    var t = (s2x * (p1.y - p3.y) - s2y * (p1.x - p3.x)) / denom;
    if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
      return { x: p1.x + t * s1x, y: p1.y + t * s1y };
    }
    return null;
  }

  function findLoops(trail) {
    var candidates = [];
    var i, j, p1, p2, p3, p4, hit;
    for (i = 0; i < trail.length - 1; i++) {
      p1 = trail[i];
      p2 = trail[i + 1];
      for (j = 0; j < trail.length - 1; j++) {
        if (Math.abs(i - j) <= 1) continue;
        p3 = trail[j];
        p4 = trail[j + 1];
        hit = findLineIntersection(p1, p2, p3, p4);
        if (hit) candidates.push([Math.min(i, j), Math.max(i, j), hit]);
      }
    }
    var loops = [];
    while (candidates.length) {
      var cand = candidates.pop();
      var dup = false;
      for (i = 0; i < loops.length; i++) {
        if (loops[i][0] === cand[0] && loops[i][1] === cand[1]) { dup = true; break; }
      }
      if (!dup) loops.push(cand);
    }
    return loops.map(function (ix) {
      var pts = trail.slice(ix[0], ix[1]);
      pts[0] = ix[2];
      pts.push(ix[2]);
      return pts;
    });
  }

  function resetMultiplier(m) {
    m.major = 1;
    m.minor = 0;
  }

  function bumpMultiplier(m) {
    m.minor += m.step;
    while (m.minor >= 1) {
      if (m.major < m.max) m.major++;
      m.minor = 1 - m.minor;
    }
  }

  function create(opts) {
    opts = opts || {};
    var w = opts.w || 900, h = opts.h || 510;
    var rng = opts.rng || Math.random;
    var g = {
      w: w, h: h, rng: rng,
      playing: false,
      score: 0,
      energy: 100,
      difficulty: 1,
      frame: 0,
      fps: 60,
      duration: 0,
      player: { x: w / 2, y: h / 2 },
      pointer: { x: w / 2, y: h / 2 },
      trail: [],
      trailLen: TRAIL_LENGTH,
      enemies: [],
      events: [],
      multiplier: { major: 1, minor: 0, step: MULTIPLIER_STEP, max: MULTIPLIER_LIMIT },
      over: false
    };
    var n = g.trailLen;
    while (n--) g.trail.push({ x: g.player.x, y: g.player.y });
    return g;
  }

  function start(g) {
    g.playing = true;
    g.over = false;
    g.score = 0;
    g.energy = 100;
    g.difficulty = 1;
    g.frame = 0;
    g.duration = 0;
    g.enemies = [];
    g.events = [];
    resetMultiplier(g.multiplier);
    g.player.x = g.pointer.x;
    g.player.y = g.pointer.y;
    g.trail = [];
    var n = g.trailLen;
    while (n--) g.trail.push({ x: g.player.x, y: g.player.y });
  }

  function setPointer(g, x, y) {
    g.pointer.x = x;
    g.pointer.y = y;
  }

  function addEnemy(g, x, y, type) {
    var e = {
      x: x, y: y,
      type: type || ENEMY_NORMAL,
      time: 0,
      alive: true,
      vx: 0, vy: 0
    };
    g.enemies.push(e);
    return e;
  }

  function adjustScore(g, offset) {
    if (!g.playing) return 0;
    var gained = offset * g.multiplier.major;
    g.score += gained * (g.fps / 60);
    return gained;
  }

  function adjustEnergy(g, offset) {
    g.energy = Math.min(Math.max(g.energy + offset, 0), 100);
    if (g.energy === 0) {
      g.playing = false;
      g.over = true;
    }
  }

  function enclose(g) {
    var loops = findLoops(g.trail);
    if (!loops.length) return { killed: 0, bombs: 0 };
    var casualties = [];
    var bombs = 0;
    for (var i = g.enemies.length - 1; i >= 0; i--) {
      var e = g.enemies[i];
      var hit = false;
      for (var p = 0; p < loops.length && !hit; p++) {
        if (pointInPoly(loops[p], e.x, e.y)) hit = true;
      }
      if (!hit) continue;
      var isBomb = e.type === ENEMY_BOMB || e.type === ENEMY_BOMB_MOVER;
      if (isBomb) {
        adjustEnergy(g, ENERGY_PER_BOMB_ENCLOSED);
        resetMultiplier(g.multiplier);
        bombs++;
        g.events.push({ kind: 'bomb', x: e.x, y: e.y });
      } else {
        adjustEnergy(g, ENERGY_PER_ENEMY_ENCLOSED);
        bumpMultiplier(g.multiplier);
        adjustScore(g, SCORE_PER_ENEMY);
        casualties.push(e);
        g.events.push({ kind: 'catch', x: e.x, y: e.y });
      }
      g.enemies.splice(i, 1);
    }
    if (casualties.length > 1) {
      adjustScore(g, casualties.length * SCORE_PER_ENEMY);
    }
    return { killed: casualties.length, bombs: bombs, loops: loops.length };
  }

  function spawn(g) {
    var padding = 60;
    var want = Math.floor(ENEMY_COUNT + g.difficulty) - g.enemies.length;
    var bombs = 0, i;
    for (i = 0; i < g.enemies.length; i++) {
      if (g.enemies[i].type === ENEMY_BOMB || g.enemies[i].type === ENEMY_BOMB_MOVER) bombs++;
    }
    var canBomb = g.enemies.length ? (bombs / g.enemies.length < 0.4) : true;
    while (want-- > 0 && g.rng() > 0.85) {
      var type = ENEMY_NORMAL;
      if (canBomb && g.rng() > 0.5) type = ENEMY_BOMB;
      addEnemy(
        g,
        padding + Math.round(g.rng() * (g.w - padding - padding)),
        padding + Math.round(g.rng() * (g.h - padding - padding)),
        type
      );
    }
  }

  function ageEnemies(g, timeFactor) {
    for (var i = g.enemies.length - 1; i >= 0; i--) {
      var e = g.enemies[i];
      e.time = Math.min(e.time + (0.2 * timeFactor), 100);
      if (e.type === ENEMY_BOMB_MOVER || e.type === ENEMY_NORMAL_MOVER) {
        e.x += e.vx;
        e.y += e.vy;
        if (e.x < 0 || e.x > g.w) e.vx = -e.vx;
        if (e.y < 0 || e.y > g.h) e.vy = -e.vy;
      }
      if (e.alive && e.time === 100) {
        if (e.type === ENEMY_BOMB || e.type === ENEMY_BOMB_MOVER) {
          e.alive = false;
          g.enemies.splice(i, 1);
        } else {
          adjustEnergy(g, ENERGY_PER_ENEMY_DEATH);
          resetMultiplier(g.multiplier);
          g.events.push({ kind: 'burst', x: e.x, y: e.y });
          g.enemies.splice(i, 1);
        }
      }
    }
  }

  function tick(g, dt) {
    if (!g.playing) return g;
    var timeFactor = (dt || 16) / (1000 / 60);
    g.player.x = lerp(g.player.x, g.pointer.x, 0.4);
    g.player.y = lerp(g.player.y, g.pointer.y, 0.4);
    g.trail.push({ x: g.player.x, y: g.player.y });
    while (g.trail.length > g.trailLen) g.trail.shift();
    g.difficulty += 0.002 * Math.max(timeFactor, 1);
    adjustScore(g, 1);
    g.frame++;
    g.duration += dt || 16;
    spawn(g);
    enclose(g);
    ageEnemies(g, timeFactor);
    if (g.energy === 0) {
      g.playing = false;
      g.over = true;
    }
    return g;
  }

  root.CoilCore = {
    create: create,
    start: start,
    tick: tick,
    setPointer: setPointer,
    addEnemy: addEnemy,
    enclose: enclose,
    pointInPoly: pointInPoly,
    findLineIntersection: findLineIntersection,
    findLoops: findLoops,
    ENEMY_NORMAL: ENEMY_NORMAL,
    ENEMY_BOMB: ENEMY_BOMB,
    ENEMY_NORMAL_MOVER: ENEMY_NORMAL_MOVER,
    ENEMY_BOMB_MOVER: ENEMY_BOMB_MOVER,
    SCORE_PER_ENEMY: SCORE_PER_ENEMY,
    ENERGY_PER_ENEMY_DEATH: ENERGY_PER_ENEMY_DEATH,
    ENERGY_PER_BOMB_ENCLOSED: ENERGY_PER_BOMB_ENCLOSED,
    TRAIL_LENGTH: TRAIL_LENGTH
  };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
