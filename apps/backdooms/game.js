/*
 * Backdooms — the original raycaster, as a classic script.
 * Logic from Kuber Mehta's THE-BACKDOOMS.html (MIT). GifOS shell is boot.js.
 */
(function (root) {
  'use strict';

  var M = Math.cos, N = Math.sin, P = Math.hypot, T = Math.atan2;
  var canvas, ctx, W = 320, H = 240;
  var x, y, a, hp, ammo, recoil, flash, seed, score;
  var enemies, keys, running, raf;
  var lookGain = 0.0022;
  var remotes = [];

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
    enemies = [{ x: 5, y: 4, h: 100 }, { x: 4, y: 5, h: 100 }];
    keys = {};
    running = true;
  }

  function shoot() {
    if (!running || ammo <= 0) return;
    ammo--;
    flash = 2;
    recoil = 0.2;
    var i, o, d, r;
    for (i = 0; i < enemies.length; i++) {
      o = enemies[i];
      d = P(o.x - x, o.y - y);
      r = T(o.y - y, o.x - x) - a;
      if (r > Math.PI) r -= 2 * Math.PI;
      if (r < -Math.PI) r += 2 * Math.PI;
      if (d < 5 && Math.abs(r) < 0.3) {
        o.h -= 50;
        if (o.h <= 0) score++;
      }
    }
    if (root.Net && root.Net.onShot) root.Net.onShot();
  }

  function look(dx) {
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

  function tickEnemies(moving) {
    var i, o, dx, dy, di, nx, ny, t, Rdist, X, Y, local;
    if (moving) {
      local = 0;
      for (i = 0; i < enemies.length; i++) {
        if (P(enemies[i].x - x, enemies[i].y - y) < 5) local++;
      }
      if (local < 5 && Math.random() < 0.02) {
        t = Math.random() * 6.283;
        Rdist = 1 + Math.random() * 2;
        X = x + M(t) * Rdist;
        Y = y + N(t) * Rdist;
        if (cell(X | 0, Y | 0) === '0') enemies.push({ x: X, y: Y, h: 100 });
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

  function drawGuy(o, colBody, colEye) {
    var d = P(o.x - x, o.y - y), r = T(o.y - y, o.x - x) - a, sz, px;
    if (r > Math.PI) r -= 2 * Math.PI;
    if (r < -Math.PI) r += 2 * Math.PI;
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
      ctx.fillRect(px - sz / 2, 120 - sz / 2 - 4 + recoil * 20, sz * (o.h / 100), 2);
    }
  }

  function frame() {
    if (!running) return;
    recoil = Math.max(0, recoil - 0.02);
    flash = Math.max(0, flash - 1);
    enemies = enemies.filter(function (o) { return o.h > 0; });
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    if (keys.ArrowLeft) a -= 0.1;
    if (keys.ArrowRight) a += 0.1;
    var moving = false, m = 0.1, nx, ny;
    if (keys.ArrowUp || keys.w) {
      nx = x + M(a) * m; ny = y + N(a) * m; tryMove(nx, ny); moving = true;
    }
    if (keys.ArrowDown || keys.s) {
      nx = x - M(a) * m; ny = y - N(a) * m; tryMove(nx, ny); moving = true;
    }
    if (keys.a) {
      nx = x + M(a - Math.PI / 2) * m; ny = y + N(a - Math.PI / 2) * m; tryMove(nx, ny); moving = true;
    }
    if (keys.d) {
      nx = x + M(a + Math.PI / 2) * m; ny = y + N(a + Math.PI / 2) * m; tryMove(nx, ny); moving = true;
    }
    if (keys._jx || keys._jy) {
      nx = x + (M(a) * -keys._jy + M(a + Math.PI / 2) * keys._jx) * m;
      ny = y + (N(a) * -keys._jy + N(a + Math.PI / 2) * keys._jx) * m;
      tryMove(nx, ny); moving = true;
    }
    tickEnemies(moving);

    var i, r, rx, ry, s, c, d, h2, g, z = [];
    for (i = 0; i < 320; i++) {
      r = a + Math.atan((i - 160) / 160);
      rx = x; ry = y; s = N(r); c = M(r); d = 0;
      while (d < 20 && cell(rx | 0, ry | 0) !== '1') {
        rx += c * 0.1; ry += s * 0.1; d += 0.1;
      }
      d *= M(r - a);
      z[i] = d;
      h2 = Math.min(240, 240 / Math.max(0.05, d));
      g = Math.min(255, 200 / Math.max(0.05, d)) | 0;
      ctx.fillStyle = 'rgb(' + g + ',' + Math.floor(g * 0.88) + ',' + Math.floor(g * 0.35) + ')';
      ctx.fillRect(i, 120 - h2 / 2 + recoil * 20, 1, h2);
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
    if (flash) {
      ctx.fillStyle = '#FFA500';
      ctx.fillRect(140, 160 + recoil * 20, 40, 20);
    }
    ctx.fillStyle = '#f00';
    ctx.fillRect(10, 10, Math.max(0, hp), 10);
    ctx.fillStyle = '#ff0';
    ctx.fillRect(10, 25, ammo * 4, 5);
    if (hp <= 0) {
      running = false;
      if (root.Backdooms.onDead) root.Backdooms.onDead(score);
      return;
    }
    raf = requestAnimationFrame(frame);
    if (root.Net && root.Net.tick) root.Net.tick();
  }

  function start(opts) {
    canvas = document.getElementById('c');
    ctx = canvas.getContext('2d');
    reset(opts);
    if (raf) cancelAnimationFrame(raf);
    frame();
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
  }

  function state() {
    return { x: x, y: y, a: a, hp: hp, ammo: ammo, score: score, seed: seed, alive: running };
  }

  root.Backdooms = {
    start: start,
    stop: stop,
    shoot: shoot,
    look: look,
    setLookSpeed: setLookSpeed,
    setRemotes: setRemotes,
    keys: function () { return keys; },
    state: state,
    onDead: null
  };
})(window);
