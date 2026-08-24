// Tanks — canvas arena. Their game server stays behind.
(function () {
  'use strict';
  var W = 720, H = 480;
  var SPEED = 130, TURN = 2.6, BSPEED = 320, RATE = 380, BLIFE = 1.1;
  var TR = 16, BR = 3, MAX_LIVES = 3, RESPAWN = 2200;
  var WALLS = [
    { x: 180, y: 140, w: 40, h: 200 },
    { x: 500, y: 140, w: 40, h: 200 },
    { x: 300, y: 220, w: 120, h: 40 }
  ];
  var SPAWNS = [{ x: 60, y: 60 }, { x: 660, y: 60 }, { x: 60, y: 420 }, { x: 660, y: 420 }, { x: 360, y: 60 }, { x: 360, y: 420 }];

  var canvas = document.getElementById('view');
  var ctx = canvas.getContext('2d');
  var keys = {};
  var pointer = { x: W / 2, y: H / 2, down: false };
  var me = { x: 60, y: 60, rot: 0, tur: 0, lives: 3, alive: true, spawn: 0, k: 0, d: 0, hue: 0.12 };
  var bullets = [];
  var particles = [];
  var drones = [];
  var lastShot = 0, lastTs = 0, deadUntil = 0;
  var netOn = false;
  var touchOn = false;
  var moveStick = { x: 0, y: 0 };
  var aimStick = { x: 0, y: 0, fire: false };
  var scoresOpen = false;
  var roster = [];

  function now() { return Date.now(); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hsl(h, s, l) { return 'hsl(' + Math.round(h * 360) + ',' + s + '%,' + l + '%)'; }
  function hitWall(x, y, r) {
    if (x - r < 0 || y - r < 0 || x + r > W || y + r > H) return true;
    var i, w;
    for (i = 0; i < WALLS.length; i++) {
      w = WALLS[i];
      if (x + r > w.x && x - r < w.x + w.w && y + r > w.y && y - r < w.y + w.h) return true;
    }
    return false;
  }
  function spawnAt(n) {
    var s = SPAWNS[n % SPAWNS.length];
    return { x: s.x, y: s.y };
  }

  function fire(from, a, remote) {
    if (!from.alive) return;
    bullets.push({
      x: from.x + Math.cos(a) * (TR + 8),
      y: from.y + Math.sin(a) * (TR + 8),
      a: a, life: BLIFE, by: from.id || 'me', remote: !!remote
    });
  }

  function boom(x, y, n, col) {
    var i;
    for (i = 0; i < n; i++) {
      particles.push({
        x: x, y: y,
        vx: (Math.random() - 0.5) * 180,
        vy: (Math.random() - 0.5) * 180,
        life: 0.4 + Math.random() * 0.3,
        col: col || '#fc3'
      });
    }
  }

  function resetMe(i) {
    var s = spawnAt(i || 0);
    me.x = s.x; me.y = s.y; me.rot = 0; me.tur = 0;
    me.lives = MAX_LIVES; me.alive = true; me.spawn++;
    deadUntil = 0;
    if (netOn && window.TanksNet) TanksNet.respawn(me.x, me.y);
  }

  function hurt(dmg, byId, byName) {
    if (!me.alive) return;
    me.lives -= dmg;
    boom(me.x, me.y, 6, '#f64');
    if (netOn) TanksNet.tookHit(dmg, byId, byName);
    if (me.lives <= 0) {
      me.lives = 0; me.alive = false; me.d++;
      boom(me.x, me.y, 18, '#fa4');
      deadUntil = now() + RESPAWN;
    }
    hearts();
  }

  function hearts() {
    document.getElementById('hearts').textContent = me.alive ? Array(me.lives + 1).join('♥') : '—';
    document.getElementById('tally').textContent = me.k + ' / ' + me.d;
  }

  function startDrones() {
    drones = [
      { x: 600, y: 400, rot: 0, tur: 0, lives: 3, alive: true, id: 'drone-a', cd: 0, hue: 0.0 },
      { x: 360, y: 80, rot: Math.PI, tur: Math.PI, lives: 3, alive: true, id: 'drone-b', cd: 0, hue: 0.55 }
    ];
  }

  function stepDrone(d, dt) {
    if (!d.alive) return;
    var ang = Math.atan2(me.y - d.y, me.x - d.x);
    d.tur = ang;
    var want = ang;
    var spin = Math.atan2(Math.sin(want - d.rot), Math.cos(want - d.rot));
    d.rot += clamp(spin, -TURN * dt, TURN * dt);
    var nx = d.x + Math.cos(d.rot) * SPEED * 0.45 * dt;
    var ny = d.y + Math.sin(d.rot) * SPEED * 0.45 * dt;
    if (!hitWall(nx, ny, TR)) { d.x = nx; d.y = ny; }
    d.cd -= dt;
    if (d.cd <= 0 && me.alive) {
      d.cd = 1.1 + Math.random() * 0.5;
      fire(d, d.tur, false);
    }
  }

  function step(dt) {
    var t = now();
    if (!me.alive && t >= deadUntil && deadUntil) resetMe(Math.floor(Math.random() * SPAWNS.length));

    var mx = 0, my = 0;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    if (keys.KeyW || keys.ArrowUp) my -= 1;
    if (keys.KeyS || keys.ArrowDown) my += 1;
    if (touchOn) { mx += moveStick.x; my += moveStick.y; }

    if (me.alive) {
      if (mx || my) {
        var wish = Math.atan2(my, mx);
        var spin = Math.atan2(Math.sin(wish - me.rot), Math.cos(wish - me.rot));
        me.rot += clamp(spin, -TURN * dt, TURN * dt);
        var sp = SPEED * Math.min(1, Math.hypot(mx, my));
        var nx = me.x + Math.cos(me.rot) * sp * dt;
        var ny = me.y + Math.sin(me.rot) * sp * dt;
        if (!hitWall(nx, me.y, TR)) me.x = nx;
        if (!hitWall(me.x, ny, TR)) me.y = ny;
      }
      if (touchOn && (aimStick.x || aimStick.y)) me.tur = Math.atan2(aimStick.y, aimStick.x);
      else me.tur = Math.atan2(pointer.y - me.y, pointer.x - me.x);
      var shooting = pointer.down || keys.Space || aimStick.fire;
      if (shooting && t - lastShot >= RATE) {
        lastShot = t;
        fire(me, me.tur, false);
        if (netOn) TanksNet.claimShot(me.x, me.y, me.tur);
      }
    }

    if (!netOn || TanksNet.otherCount() === 0) {
      /* The room emptied out (or never filled): the practice drones are the
         game again. They were discarded when a friend arrived, and nothing
         used to bring them back — one visit left the yard empty until a full
         relaunch. */
      if (!drones.length) startDrones();
      var i;
      for (i = 0; i < drones.length; i++) stepDrone(drones[i], dt);
    } else {
      drones = [];
    }

    var b, j, others, id, o, interp, dx, dy;
    for (j = bullets.length - 1; j >= 0; j--) {
      b = bullets[j];
      b.x += Math.cos(b.a) * BSPEED * dt;
      b.y += Math.sin(b.a) * BSPEED * dt;
      b.life -= dt;
      if (b.life <= 0 || hitWall(b.x, b.y, BR)) { bullets.splice(j, 1); continue; }
      if (b.by !== 'me' && b.by !== (netOn && TanksNet.me().id) && me.alive) {
        if (Math.hypot(b.x - me.x, b.y - me.y) < TR) {
          bullets.splice(j, 1);
          if (!b.remote) hurt(1, b.by, 'Tank');
          continue;
        }
      }
      if ((b.by === 'me' || (netOn && b.by === TanksNet.me().id))) {
        for (i = 0; i < drones.length; i++) {
          if (!drones[i].alive) continue;
          if (Math.hypot(b.x - drones[i].x, b.y - drones[i].y) < TR) {
            bullets.splice(j, 1);
            drones[i].lives--;
            boom(drones[i].x, drones[i].y, 8, '#fc3');
            if (drones[i].lives <= 0) {
              drones[i].alive = false;
              me.k++;
              hearts();
              setTimeout(function (d) {
                return function () {
                  var s = spawnAt(Math.floor(Math.random() * SPAWNS.length));
                  d.x = s.x; d.y = s.y; d.lives = 3; d.alive = true;
                };
              }(drones[i]), 1800);
            }
            b = null;
            break;
          }
        }
        if (!b) continue;
        if (netOn) {
          others = TanksNet.others();
          for (id in others) {
            o = others[id];
            if (!o.alive) continue;
            interp = TanksNet.interpolate(o, t);
            dx = b.x - interp.x; dy = b.y - interp.y;
            if (dx * dx + dy * dy < TR * TR) {
              bullets.splice(j, 1);
              TanksNet.claimHit(id, 1);
              boom(interp.x, interp.y, 8, '#fc3');
              break;
            }
          }
        }
      }
    }
    for (j = particles.length - 1; j >= 0; j--) {
      particles[j].x += particles[j].vx * dt;
      particles[j].y += particles[j].vy * dt;
      particles[j].life -= dt;
      if (particles[j].life <= 0) particles.splice(j, 1);
    }
    if (netOn) TanksNet.tick(me.x, me.y, me.rot, me.tur);
  }

  function drawTank(x, y, rot, tur, hue, alive) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = alive ? hsl(hue, 70, 42) : '#444';
    ctx.fillRect(-18, -12, 36, 24);
    ctx.fillStyle = alive ? hsl(hue, 70, 28) : '#333';
    ctx.fillRect(-20, -14, 8, 8);
    ctx.fillRect(-20, 6, 8, 8);
    ctx.fillRect(10, -14, 8, 8);
    ctx.fillRect(10, 6, 8, 8);
    ctx.restore();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tur);
    ctx.fillStyle = alive ? hsl(hue, 80, 55) : '#555';
    ctx.fillRect(0, -3, 26, 6);
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function draw() {
    var t = now();
    ctx.fillStyle = '#2a2618';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#3a3424';
    ctx.lineWidth = 1;
    var g;
    for (g = 0; g < W; g += 40) { ctx.beginPath(); ctx.moveTo(g, 0); ctx.lineTo(g, H); ctx.stroke(); }
    for (g = 0; g < H; g += 40) { ctx.beginPath(); ctx.moveTo(0, g); ctx.lineTo(W, g); ctx.stroke(); }
    var i, w, b, o, id, interp, others;
    ctx.fillStyle = '#5a4a30';
    for (i = 0; i < WALLS.length; i++) {
      w = WALLS[i];
      ctx.fillRect(w.x, w.y, w.w, w.h);
    }
    for (i = 0; i < drones.length; i++) {
      if (drones[i].alive || true) drawTank(drones[i].x, drones[i].y, drones[i].rot, drones[i].tur, drones[i].hue, drones[i].alive);
    }
    if (netOn) {
      others = TanksNet.others();
      for (id in others) {
        o = others[id];
        interp = TanksNet.interpolate(o, t);
        drawTank(interp.x, interp.y, interp.rot, interp.tur, o.hue, o.alive);
        ctx.fillStyle = '#f0e6d0';
        ctx.font = '11px sans-serif';
        ctx.fillText(o.name || 'Tank', interp.x - 16, interp.y - 22);
      }
    }
    drawTank(me.x, me.y, me.rot, me.tur, me.hue, me.alive);
    ctx.fillStyle = '#fc3';
    for (i = 0; i < bullets.length; i++) {
      b = bullets[i];
      ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
    }
    for (i = 0; i < particles.length; i++) {
      ctx.globalAlpha = Math.max(0, particles[i].life * 2);
      ctx.fillStyle = particles[i].col;
      ctx.fillRect(particles[i].x, particles[i].y, 3, 3);
      ctx.globalAlpha = 1;
    }
  }

  function loop(ts) {
    var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts;
    step(dt);
    draw();
    requestAnimationFrame(loop);
  }

  document.addEventListener('keydown', function (e) {
    keys[e.code] = true;
    if (e.code === 'Tab') { e.preventDefault(); toggleScores(); }
    if (e.code === 'Space') e.preventDefault();
  });
  document.addEventListener('keyup', function (e) { keys[e.code] = false; });
  canvas.addEventListener('mousemove', function (e) {
    var r = canvas.getBoundingClientRect();
    pointer.x = (e.clientX - r.left) * (W / r.width);
    pointer.y = (e.clientY - r.top) * (H / r.height);
  });
  canvas.addEventListener('mousedown', function () { pointer.down = true; });
  window.addEventListener('mouseup', function () { pointer.down = false; });

  function bindStick(el, dest, fireOnHold) {
    var active = null;
    function read(ev) {
      var t = ev.changedTouches ? ev.changedTouches[0] : ev;
      var r = el.getBoundingClientRect();
      var x = (t.clientX - r.left) / r.width * 2 - 1;
      var y = (t.clientY - r.top) / r.height * 2 - 1;
      var m = Math.hypot(x, y) || 1;
      if (m > 1) { x /= m; y /= m; }
      dest.x = x; dest.y = y;
      if (fireOnHold) dest.fire = true;
      var knob = el.querySelector('i');
      if (knob) {
        knob.style.left = (33 + x * 28) + 'px';
        knob.style.top = (33 + y * 28) + 'px';
      }
    }
    function end() {
      dest.x = 0; dest.y = 0; if (fireOnHold) dest.fire = false;
      var knob = el.querySelector('i');
      if (knob) { knob.style.left = '33px'; knob.style.top = '33px'; }
      active = null;
    }
    el.addEventListener('touchstart', function (e) { e.preventDefault(); touchOn = true; document.body.classList.add('touch'); active = 1; read(e); }, { passive: false });
    el.addEventListener('touchmove', function (e) { e.preventDefault(); if (active) read(e); }, { passive: false });
    el.addEventListener('touchend', function (e) { e.preventDefault(); end(); }, { passive: false });
  }
  bindStick(document.getElementById('movePad'), moveStick, false);
  bindStick(document.getElementById('aimPad'), aimStick, true);
  document.getElementById('fireBtn').addEventListener('touchstart', function (e) {
    e.preventDefault(); aimStick.fire = true; touchOn = true; document.body.classList.add('touch');
  }, { passive: false });
  document.getElementById('fireBtn').addEventListener('touchend', function () { aimStick.fire = false; });

  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
    touchOn = true; document.body.classList.add('touch');
  }

  function toggleScores() {
    scoresOpen = !scoresOpen;
    document.getElementById('scores').hidden = !scoresOpen;
    renderScores();
  }
  document.getElementById('tally').onclick = toggleScores;
  function renderScores() {
    var list = roster.slice();
    if (!list.length) list = [{ name: 'You', k: me.k, d: me.d, me: true }];
    list.sort(function (a, b) { return (b.k || 0) - (a.k || 0); });
    document.getElementById('scoreList').innerHTML = list.map(function (p) {
      return '<li><span>' + (p.me ? 'You' : (p.name || 'Tank')) + '</span><span>' + (p.k || 0) + ' / ' + (p.d || 0) + '</span></li>';
    }).join('');
  }

  if (window.gifos && gifos.onBack) {
    gifos.onBack(function () {
      if (scoresOpen) { toggleScores(); return true; }
      return false;
    });
  }

  startDrones();
  hearts();
  if (window.TanksNet) {
    TanksNet.onHit(function (d, id, name) { hurt(d, id, name); });
    TanksNet.onKill(function () { me.k++; hearts(); });
    TanksNet.onRoster(function (r) { roster = r; if (scoresOpen) renderScores(); });
    TanksNet.onShot(function (s) {
      fire({ x: s.x, y: s.y, alive: true, id: s.by }, s.a, true);
    });
    TanksNet.init().then(function (list) {
      if (list) {
        netOn = true;
        me.hue = 0.12;
        document.getElementById('hint').textContent = 'Invite in the bar — the yard is the room';
      }
    });
  }
  requestAnimationFrame(loop);
})();
