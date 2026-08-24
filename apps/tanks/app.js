// Tanks — canvas arena. Their game server stays behind.
(function () {
  'use strict';
  var S = window.TanksSim;
  var W = S.W, H = S.H, WALLS = S.WALLS, TR = S.TR;
  var canvas = document.getElementById('view');
  var ctx = canvas.getContext('2d');
  var keys = {};
  var pointer = { x: W / 2, y: H / 2, down: false };
  var touchOn = false;
  var moveStick = { x: 0, y: 0 };
  var aimStick = { x: 0, y: 0, fire: false };
  var scoresOpen = false;
  var roster = [];
  var netOn = false;
  var lastTs = 0;
  var career = { k: 0, d: 0 };
  var g = S.create({ seed: 0x7A1 });

  function hsl(h, s, l) { return 'hsl(' + Math.round(h * 360) + ',' + s + '%,' + l + '%)'; }
  function now() { return Date.now(); }

  function hearts() {
    var me = g.me;
    document.getElementById('hearts').textContent = me.alive ? Array(me.lives + 1).join('♥') : '—';
    document.getElementById('tally').textContent = me.k + ' / ' + me.d;
  }

  function flushCareer() {
    var api = window.gifos;
    if (!api || !api.db) return;
    api.db('prefs').put({ id: 'career', k: career.k, d: career.d }).catch(function () {});
  }

  function hint() {
    var el = document.getElementById('hint');
    if (!el) return;
    if (netOn && window.TanksNet && TanksNet.otherCount() > 0) {
      el.textContent = TanksNet.otherCount() + ' in the yard';
    } else {
      el.textContent = 'Invite in the bar — the yard is the room';
    }
  }

  function applyRemoteHit(d, id, name) {
    if (!g.me.alive) return;
    if (S.shielded(g.me, g.now)) return;
    if (S.hurt(g, g.me, d)) {
      g.me.d++;
      g.deadUntil = g.now + S.RESPAWN;
    }
    if (netOn) TanksNet.tookHit(d, id, name);
    hearts();
  }

  function netHooks() {
    if (!netOn || !window.TanksNet) return { on: false };
    return {
      on: true,
      otherCount: function () { return TanksNet.otherCount(); },
      others: function () { return TanksNet.others(); },
      interpolate: function (o, t) { return TanksNet.interpolate(o, t); },
      meId: TanksNet.me().id,
      claimHit: function (id, dmg) { TanksNet.claimHit(id, dmg); },
      claimShot: function (x, y, a) { TanksNet.claimShot(x, y, a); },
      tick: function (x, y, rot, tur) { TanksNet.tick(x, y, rot, tur); },
      respawn: function (x, y) { TanksNet.respawn(x, y); },
      tookHit: function (d, id, name) { TanksNet.tookHit(d, id, name); }
    };
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawTank(x, y, rot, tur, hue, alive, dist, shield) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(2, 6, 20, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(rot);
    var body = alive ? hsl(hue, 62, 40) : '#3a3a3a';
    var dark = alive ? hsl(hue, 62, 22) : '#2a2a2a';
    var light = alive ? hsl(hue, 55, 52) : '#555';
    var tread = alive ? hsl(hue, 30, 18) : '#222';
    ctx.fillStyle = tread;
    roundRect(-22, -16, 44, 8, 2); ctx.fill();
    roundRect(-22, 8, 44, 8, 2); ctx.fill();
    ctx.fillStyle = alive ? hsl(hue, 20, 12) : '#111';
    var segs = 6, i, off = ((dist || 0) / 6) % 6;
    for (i = 0; i < segs; i++) {
      var sx = -18 + ((i * 7 + off) % 42);
      ctx.fillRect(sx, -15, 3, 6);
      ctx.fillRect(sx, 9, 3, 6);
    }
    ctx.fillStyle = body;
    roundRect(-18, -11, 36, 22, 4); ctx.fill();
    ctx.fillStyle = dark;
    roundRect(-10, -7, 22, 14, 3); ctx.fill();
    ctx.fillStyle = light;
    ctx.fillRect(10, -3, 8, 6);
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tur);
    ctx.fillStyle = alive ? hsl(hue, 70, 32) : '#333';
    ctx.fillRect(4, -3.5, 24, 7);
    ctx.fillStyle = alive ? hsl(hue, 80, 55) : '#555';
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = alive ? hsl(hue, 50, 25) : '#444';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    if (alive && shield) {
      ctx.strokeStyle = 'rgba(180,220,255,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, TR + 6, 0, Math.PI * 2); ctx.stroke();
    }
  }

  function hpBar(x, y, lives, hue) {
    var i;
    for (i = 0; i < S.MAX_LIVES; i++) {
      ctx.fillStyle = i < lives ? hsl(hue, 80, 55) : 'rgba(0,0,0,0.35)';
      ctx.fillRect(x - 14 + i * 10, y - 26, 8, 4);
    }
  }

  function drawWall(w) {
    var x, y, brick = 12;
    ctx.fillStyle = '#4a3a28';
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = '#6a5640';
    for (y = w.y; y < w.y + w.h; y += brick) {
      for (x = w.x + ((Math.floor((y - w.y) / brick) % 2) * 6); x < w.x + w.w; x += brick) {
        ctx.fillRect(x + 1, y + 1, brick - 2, brick - 2);
      }
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeRect(w.x + 0.5, w.y + 0.5, w.w - 1, w.h - 1);
  }

  function draw() {
    var t = g.now;
    var shx = (g.shake ? (Math.random() - 0.5) * g.shake : 0);
    var shy = (g.shake ? (Math.random() - 0.5) * g.shake : 0);
    ctx.setTransform(1, 0, 0, 1, shx, shy);
    ctx.fillStyle = '#2a2618';
    ctx.fillRect(-8, -8, W + 16, H + 16);
    var gx, gy;
    for (gy = 0; gy < H; gy += 40) {
      for (gx = 0; gx < W; gx += 40) {
        ctx.fillStyle = ((gx + gy) / 40) % 2 ? '#2e2a1c' : '#262218';
        ctx.fillRect(gx, gy, 40, 40);
      }
    }
    ctx.fillStyle = 'rgba(90, 70, 40, 0.18)';
    for (gx = 30; gx < W; gx += 90) ctx.fillRect(gx, 20, 50, 14);
    var i, w, b, o, id, interp, others;
    for (i = 0; i < WALLS.length; i++) drawWall(WALLS[i]);

    for (i = 0; i < g.drones.length; i++) {
      o = g.drones[i];
      drawTank(o.x, o.y, o.rot, o.tur, o.hue, o.alive, o.dist, S.shielded(o, t));
      if (o.alive) hpBar(o.x, o.y, o.lives, o.hue);
    }
    if (netOn) {
      others = TanksNet.others();
      for (id in others) {
        o = others[id];
        interp = TanksNet.interpolate(o, t);
        drawTank(interp.x, interp.y, interp.rot, interp.tur, o.hue, o.alive, 0, false);
        if (o.alive) hpBar(interp.x, interp.y, o.lives, o.hue);
        ctx.fillStyle = '#f0e6d0';
        ctx.font = '11px system-ui,sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(o.name || 'Tank', interp.x, interp.y - 30);
        ctx.textAlign = 'left';
      }
    }
    drawTank(g.me.x, g.me.y, g.me.rot, g.me.tur, g.me.hue, g.me.alive, g.me.dist, S.shielded(g.me, t));
    if (g.me.alive) hpBar(g.me.x, g.me.y, g.me.lives, g.me.hue);
    if (g.flash) {
      ctx.save();
      ctx.translate(g.me.x, g.me.y);
      ctx.rotate(g.me.tur);
      ctx.fillStyle = 'rgba(255,230,140,' + Math.min(1, g.flash * 10) + ')';
      ctx.fillRect(26, -4, 10, 8);
      ctx.restore();
    }

    for (i = 0; i < g.bullets.length; i++) {
      b = g.bullets[i];
      ctx.fillStyle = '#ffe680';
      ctx.beginPath(); ctx.arc(b.x, b.y, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,200,80,0.35)';
      ctx.beginPath(); ctx.arc(b.x - Math.cos(b.a) * 8, b.y - Math.sin(b.a) * 8, 2, 0, Math.PI * 2); ctx.fill();
    }
    for (i = 0; i < g.particles.length; i++) {
      ctx.globalAlpha = Math.max(0, g.particles[i].life * 2);
      ctx.fillStyle = g.particles[i].col;
      ctx.fillRect(g.particles[i].x, g.particles[i].y, 3, 3);
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  var lastK = 0, lastD = 0;
  function loop(ts) {
    var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts;
    var beforeK = g.me.k, beforeD = g.me.d, beforeAlive = g.me.alive;
    S.step(g, dt, {
      now: now(),
      keys: keys,
      moveStick: moveStick,
      aimStick: aimStick,
      pointer: pointer,
      touchOn: touchOn
    }, netHooks());
    if (g.me.k > beforeK) { career.k += g.me.k - beforeK; flushCareer(); }
    if (g.me.d > beforeD) { career.d += g.me.d - beforeD; flushCareer(); }
    if (g.me.k !== lastK || g.me.d !== lastD || g.me.alive !== beforeAlive) {
      lastK = g.me.k; lastD = g.me.d; hearts(); hint();
    }
    draw();
    requestAnimationFrame(loop);
  }

  document.addEventListener('keydown', function (e) {
    keys[e.code] = true;
    if (e.code === 'Tab') { e.preventDefault(); toggleScores(); }
    if (e.code === 'Space') e.preventDefault();
  });
  document.addEventListener('keyup', function (e) { keys[e.code] = false; });
  canvas.addEventListener('pointermove', function (e) {
    if (touchOn) return;
    var r = canvas.getBoundingClientRect();
    pointer.x = (e.clientX - r.left) * (W / r.width);
    pointer.y = (e.clientY - r.top) * (H / r.height);
  });
  canvas.addEventListener('pointerdown', function (e) {
    if (touchOn) return;
    pointer.down = true;
    var r = canvas.getBoundingClientRect();
    pointer.x = (e.clientX - r.left) * (W / r.width);
    pointer.y = (e.clientY - r.top) * (H / r.height);
  });
  window.addEventListener('pointerup', function () { pointer.down = false; });

  function bindStick(el, dest, fireOnHold) {
    var pid = null;
    function read(ev) {
      var r = el.getBoundingClientRect();
      var x = (ev.clientX - r.left) / r.width * 2 - 1;
      var y = (ev.clientY - r.top) / r.height * 2 - 1;
      var m = Math.hypot(x, y) || 1;
      if (m > 1) { x /= m; y /= m; }
      dest.x = x; dest.y = y;
      if (fireOnHold) dest.fire = true;
      var knob = el.querySelector('i');
      if (knob) {
        knob.style.transform = 'translate(' + (x * 28) + 'px,' + (y * 28) + 'px)';
      }
    }
    function end() {
      dest.x = 0; dest.y = 0; if (fireOnHold) dest.fire = false;
      var knob = el.querySelector('i');
      if (knob) knob.style.transform = 'translate(0,0)';
      pid = null;
    }
    el.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      touchOn = true; document.body.classList.add('touch');
      pid = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      read(e);
    });
    el.addEventListener('pointermove', function (e) {
      if (pid !== e.pointerId) return;
      e.preventDefault();
      read(e);
    });
    el.addEventListener('pointerup', function (e) { e.preventDefault(); end(); });
    el.addEventListener('pointercancel', function () { end(); });
    el.addEventListener('lostpointercapture', function () { end(); });
  }
  bindStick(document.getElementById('movePad'), moveStick, false);
  bindStick(document.getElementById('aimPad'), aimStick, true);
  var fireBtn = document.getElementById('fireBtn');
  fireBtn.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    aimStick.fire = true; touchOn = true; document.body.classList.add('touch');
    try { fireBtn.setPointerCapture(e.pointerId); } catch (err) {}
  });
  fireBtn.addEventListener('pointerup', function () { aimStick.fire = false; });
  fireBtn.addEventListener('pointercancel', function () { aimStick.fire = false; });
  fireBtn.addEventListener('lostpointercapture', function () { aimStick.fire = false; });

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
    if (!list.length) list = [{ name: 'You', k: g.me.k, d: g.me.d, me: true }];
    list.sort(function (a, b) { return (b.k || 0) - (a.k || 0); });
    document.getElementById('scoreList').innerHTML = list.map(function (p) {
      return '<li><span>' + (p.me ? 'You' : (p.name || 'Tank')) + '</span><span>' + (p.k || 0) + ' / ' + (p.d || 0) + '</span></li>';
    }).join('') +
      '<li class="career"><span>Career (this file)</span><span>' + career.k + ' / ' + career.d + '</span></li>';
  }

  if (window.gifos && gifos.onBack) {
    gifos.onBack(function () {
      if (scoresOpen) { toggleScores(); return true; }
      return false;
    });
  }

  hearts();
  hint();
  if (window.TanksNet) {
    TanksNet.onHit(function (d, id, name) { applyRemoteHit(d, id, name); });
    TanksNet.onKill(function () { g.me.k++; hearts(); });
    TanksNet.onRoster(function (r) { roster = r; hint(); if (scoresOpen) renderScores(); });
    TanksNet.onShot(function (s) {
      var b = S.fire({ x: s.x, y: s.y, alive: true, id: s.by }, s.a, true);
      if (b) g.bullets.push(b);
    });
    TanksNet.init().then(function (list) {
      if (list) {
        netOn = true;
        if (TanksNet.me() && TanksNet.me().id) {
          var h = 0, id = TanksNet.me().id, i;
          for (i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
          g.me.hue = (h % 360) / 360;
          g.me.id = id;
        }
        hint();
      }
    });
  }
  if (window.gifos && gifos.db) {
    gifos.db('prefs').get('career').then(function (row) {
      if (row) { career.k = row.k || 0; career.d = row.d || 0; }
    }).catch(function () {});
  }
  window.__tanksG = g;
  requestAnimationFrame(loop);
})();
