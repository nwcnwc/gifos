/*
 * Backdooms — the original raycaster, as a classic script.
 * Logic from Kuber Mehta's THE-BACKDOOMS.html (MIT). GifOS shell is boot.js.
 *
 * One original frame is one step() at 16 ms. draw() is optional so a unit
 * test can play the loop without a canvas.
 */
(function (root) {
  'use strict';

  var M = Math.cos, N = Math.sin, P = Math.hypot, T = Math.atan2;
  var canvas, ctx, W = 320, H = 240;
  var x, y, a, hp, ammo, recoil, flash, seed, score;
  var enemies, keys, running, paused, raf;
  var lookGain = 0.0022;
  var remotes = [];
  var lastT = 0;
  var buzzT = 0;
  var STEP = 16;

  function cell(i, j) {
    if (Math.abs(i - 4) < 4 && Math.abs(j - 4) < 4) return '0';
    if (((i + 1000) % 7) === 3 || ((j + 1000) % 7) === 3) return '0';
    var n = N(i * 12.9898 + j * 78.233 + seed) * 43758.5453;
    n -= n | 0;
    return n < 0.05 ? '1' : '0';
  }

  function reset(opts) {
    opts = opts || {};
    seed = opts.seed != null ? opts.seed : Math.random() * 100;
    x = 4; y = 4; a = 0; hp = 100; ammo = 25; recoil = 0; flash = 0; score = 0;
    enemies = [{ x: 6.5, y: 4, h: 100 }, { x: 4, y: 6.5, h: 100 }];
    keys = keys || {};
    keys._jx = 0; keys._jy = 0;
    running = true;
    paused = false;
    lastT = 0;
    buzzT = 0;
  }

  function angDiff(from, to) {
    var r = to - from;
    if (r > Math.PI) r -= 2 * Math.PI;
    if (r < -Math.PI) r += 2 * Math.PI;
    return r;
  }

  function inCone(ox, oy, maxD, maxR) {
    var d = P(ox - x, oy - y);
    var r = angDiff(a, T(oy - y, ox - x));
    return d < maxD && Math.abs(r) < maxR;
  }

  function shoot() {
    if (!running || paused || ammo <= 0) return { hits: [] };
    ammo--;
    flash = 2;
    recoil = 0.2;
    var i, o, hits = [];
    for (i = 0; i < enemies.length; i++) {
      o = enemies[i];
      if (inCone(o.x, o.y, 5, 0.3)) {
        o.h -= 50;
        if (o.h <= 0) score++;
      }
    }
    for (i = 0; i < remotes.length; i++) {
      o = remotes[i];
      if (o && o.id && inCone(o.x, o.y, 5, 0.3)) {
        hits.push(o.id);
        score++;
        o.h = Math.max(0, (o.h != null ? o.h : 100) - 50);
      }
    }
    if (root.Net && root.Net.onShot) root.Net.onShot(hits);
    return { hits: hits };
  }

  function hurt(n) {
    if (!running || paused) return;
    hp -= n | 0;
    flash = 2;
  }

  function look(dx) {
    if (!running || paused) return;
    a += dx * lookGain;
  }

  function setLookSpeed(v) {
    lookGain = 0.0004 + (v | 0) * 0.00022;
  }

  function setRemotes(list) {
    remotes = list || [];
  }

  function tryMove(nx, ny) {
    if (cell(nx | 0, ny | 0) !== '1') { x = nx; y = ny; }
  }

  function tickEnemies(moving, frames) {
    var i, o, dx, dy, di, nx, ny, t, Rdist, X, Y, local, n, f;
    frames = frames || 1;
    for (f = 0; f < frames; f++) {
      if (moving) {
        local = 0;
        for (i = 0; i < enemies.length; i++) {
          if (P(enemies[i].x - x, enemies[i].y - y) < 5) local++;
        }
        if (local < 5 && Math.random() < 0.02) {
          n = 1 + (Math.random() * 3 | 0);
          for (i = 0; i < n; i++) {
            t = Math.random() * 6.283;
            Rdist = 1 + Math.random() * 2;
            X = x + M(t) * Rdist;
            Y = y + N(t) * Rdist;
            if (cell(X | 0, Y | 0) === '0') enemies.push({ x: X, y: Y, h: 100 });
          }
        }
      }
      if (Math.random() < 0.005 && ammo < 25) ammo++;
      for (i = 0; i < enemies.length; i++) {
        o = enemies[i];
        dx = x - o.x; dy = y - o.y; di = P(dx, dy);
        if (di > 0.2) {
          nx = o.x + dx / di * (0.0015 + 0.003 / di);
          ny = o.y + dy / di * (0.0015 + 0.003 / di);
          if (cell(nx | 0, ny | 0) !== '1') { o.x = nx; o.y = ny; }
        }
        if (di < 0.5) {
          hp--;
          flash = 2;
        }
      }
    }
  }

  function applyInput(frames) {
    var k = keys || {};
    var moving = false, m = 0.1 * frames, nx, ny;
    if (k.ArrowLeft) a -= 0.1 * frames;
    if (k.ArrowRight) a += 0.1 * frames;
    if (k.ArrowUp || k.w) {
      nx = x + M(a) * m; ny = y + N(a) * m; tryMove(nx, ny); moving = true;
    }
    if (k.ArrowDown || k.s) {
      nx = x - M(a) * m; ny = y - N(a) * m; tryMove(nx, ny); moving = true;
    }
    if (k.a) {
      nx = x + M(a - Math.PI / 2) * m; ny = y + N(a - Math.PI / 2) * m; tryMove(nx, ny); moving = true;
    }
    if (k.d) {
      nx = x + M(a + Math.PI / 2) * m; ny = y + N(a + Math.PI / 2) * m; tryMove(nx, ny); moving = true;
    }
    if (k._jx || k._jy) {
      nx = x + (M(a) * -k._jy + M(a + Math.PI / 2) * k._jx) * m;
      ny = y + (N(a) * -k._jy + N(a + Math.PI / 2) * k._jx) * m;
      tryMove(nx, ny); moving = true;
    }
    return moving;
  }

  function step(dt) {
    if (!running || paused) return;
    if (dt == null) dt = STEP;
    if (dt > 50) dt = 50;
    var frames = dt / STEP;
    recoil = Math.max(0, recoil - 0.02 * frames);
    flash = Math.max(0, flash - frames);
    buzzT += dt;
    enemies = enemies.filter(function (o) { return o.h > 0; });
    var moving = applyInput(frames);
    tickEnemies(moving, frames);
    if (hp <= 0) {
      hp = 0;
      running = false;
      if (root.Backdooms.onDead) root.Backdooms.onDead(score);
    }
  }

  function rgb(r, g, b) {
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }

  function drawGuy(o, colBody, colEye) {
    var d = P(o.x - x, o.y - y), r = angDiff(a, T(o.y - y, o.x - x)), sz, px;
    if (Math.abs(r) >= 1.2) return;
    sz = 80 / Math.max(0.2, d);
    px = 160 + r * 160;
    if (px < 0 || px >= 320 || d > (drawGuy._z[px | 0] || 20) * 1.1) return;
    ctx.fillStyle = colBody;
    ctx.fillRect(px - sz / 2, 120 - sz / 2 + recoil * 20, sz, sz * 1.5);
    ctx.fillStyle = colEye;
    ctx.fillRect(px - sz / 4, 120 - sz / 2 + recoil * 20, sz / 8, sz / 4);
    ctx.fillRect(px + sz / 8, 120 - sz / 2 + recoil * 20, sz / 8, sz / 4);
    if (o.h != null) {
      ctx.fillStyle = '#900';
      ctx.fillRect(px - sz / 2, 120 - sz / 2 - 4 + recoil * 20, sz, 2);
      ctx.fillStyle = '#0f0';
      ctx.fillRect(px - sz / 2, 120 - sz / 2 - 4 + recoil * 20, sz * (Math.max(0, o.h) / 100), 2);
    }
  }

  function draw() {
    if (!ctx) return;
    var i, r, rx, ry, s, c, d, h2, g, z = [], wallTop, wallBot, buzz, cg, fg;
    ctx.fillStyle = '#1a1408';
    ctx.fillRect(0, 0, W, H);
    buzz = 0.88 + 0.12 * (0.5 + 0.5 * N(buzzT * 0.012));
    z = [];
    for (i = 0; i < 320; i++) {
      r = a + Math.atan((i - 160) / 160);
      rx = x; ry = y; s = N(r); c = M(r); d = 0;
      while (d < 20 && cell(rx | 0, ry | 0) !== '1') {
        rx += c * 0.1; ry += s * 0.1; d += 0.1;
      }
      d *= M(r - a);
      z[i] = d;
      h2 = Math.min(240, 240 / Math.max(0.05, d));
      wallTop = 120 - h2 / 2 + recoil * 20;
      wallBot = wallTop + h2;
      cg = Math.min(230, 50 + 170 / Math.max(0.25, d)) * buzz;
      ctx.fillStyle = rgb(cg, cg * 0.88, cg * 0.38);
      ctx.fillRect(i, 0, 1, Math.max(0, wallTop));
      fg = Math.min(190, 36 + 130 / Math.max(0.25, d)) * buzz;
      ctx.fillStyle = rgb(fg, fg * 0.72, fg * 0.22);
      ctx.fillRect(i, Math.min(H, wallBot), 1, H);
      g = Math.min(255, 200 / Math.max(0.05, d)) * buzz;
      ctx.fillStyle = rgb(g, g * 0.88, g * 0.35);
      ctx.fillRect(i, wallTop, 1, h2);
    }
    drawGuy._z = z;
    for (i = 0; i < enemies.length; i++) {
      drawGuy(enemies[i], enemies[i].h > 50 ? '#400' : '#800', '#f00');
    }
    for (i = 0; i < remotes.length; i++) {
      drawGuy(remotes[i], '#245', '#8cf');
    }
    ctx.fillStyle = '#444';
    ctx.fillRect(140, 180 + recoil * 20, 40, 60);
    if (flash > 0) {
      ctx.fillStyle = '#FFA500';
      ctx.fillRect(140, 160 + recoil * 20, 40, 20);
      ctx.fillStyle = 'rgba(255,160,40,' + Math.min(0.35, flash * 0.18) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = '#f00';
    ctx.fillRect(10, 10, Math.max(0, hp), 10);
    ctx.fillStyle = '#ff0';
    ctx.fillRect(10, 25, Math.max(0, ammo) * 4, 5);
    ctx.fillStyle = '#fff';
    ctx.font = '7px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('HP', 10, 8);
    ctx.fillText('AMMO ' + (ammo | 0), 10, 38);
    ctx.textAlign = 'right';
    ctx.fillText('SCORE ' + score, 310, 18);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillRect(159, 118, 2, 4);
    ctx.fillRect(158, 119, 4, 2);
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
    if (!running) return;
    raf = requestAnimationFrame(frame);
    if (root.Net && root.Net.tick) root.Net.tick();
  }

  function start(opts) {
    opts = opts || {};
    canvas = (root.document && root.document.getElementById) ? root.document.getElementById('c') : null;
    ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    reset(opts);
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

  function setPaused(v) {
    paused = !!v;
    lastT = 0;
  }

  function state() {
    return {
      x: x, y: y, a: a, hp: hp, ammo: ammo, score: score, seed: seed,
      alive: !!running, paused: !!paused, enemies: (enemies || []).length
    };
  }

  root.Backdooms = {
    start: start,
    stop: stop,
    step: step,
    draw: draw,
    shoot: shoot,
    look: look,
    hurt: hurt,
    setLookSpeed: setLookSpeed,
    setRemotes: setRemotes,
    setPaused: setPaused,
    cell: cell,
    keys: function () { if (!keys) keys = {}; return keys; },
    state: state,
    onDead: null
  };
})(window);
