/*
 * Rockets — fly, catch stars, score. Classic IIFE. No fetch, no sockets.
 *
 * Solo is you against a minute of sky. A friend who opens the invite lands
 * in the same field; the host writes the starfield, everyone writes only
 * their own rocket. Invite is OS chrome — this file never draws that button.
 */
(function (root) {
  'use strict';

  var R = root.Rockets;
  var canvas, ctx;
  var me = null;
  var sky = null;
  var cam = { x: R.W * 0.5, y: R.H * 0.5 };
  var keys = {};
  var touchMove = { id: null, x: 0, y: 0 };
  var touchOn = false;
  var lastTs = 0;
  var particles = [];
  var pops = [];
  var twinkles = [];
  var flash = 0;
  var thrusting = false;
  var playing = false;
  var best = 0;
  var counted = {};
  var pendingHide = {};
  var lastComboAt = 0;
  var combo = 0;
  var roster = [];
  var audioCtx = null;
  var bgStars = [];
  var lastRound = 1;
  var savedOver = false;

  function $(id) { return document.getElementById(id); }
  function now() { return Date.now(); }

  function hsv(h, s, v) {
    var i6 = Math.floor(h * 6) % 6, f = h * 6 - Math.floor(h * 6);
    var p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    var m = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i6];
    return 'rgb(' + ((m[0] * 255) | 0) + ',' + ((m[1] * 255) | 0) + ',' + ((m[2] * 255) | 0) + ')';
  }

  function beep(freq, dur, vol, type) {
    try {
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var o = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.value = vol || 0.05;
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + dur);
    } catch (e) {}
  }

  function unlockAudio() {
    if (audioCtx) return;
    try {
      audioCtx = new (root.AudioContext || root.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { audioCtx = null; }
  }

  function seedBg() {
    var rng = R.mulberry(0x5A1A5A);
    var i;
    bgStars = [];
    for (i = 0; i < 90; i++) {
      bgStars.push({
        x: rng() * R.W, y: rng() * R.H,
        r: 0.6 + rng() * 1.6, a: 0.25 + rng() * 0.55, p: rng() * Math.PI * 2
      });
    }
    twinkles = [];
    for (i = 0; i < 18; i++) {
      twinkles.push({ x: rng() * R.W, y: rng() * R.H, p: rng() * 1000 });
    }
  }

  /* ------------------------------------------------------------------ */
  /* input                                                              */
  /* ------------------------------------------------------------------ */

  function bindInput() {
    addEventListener('keydown', function (e) {
      keys[e.code] = true;
      if (e.code === 'Space' || e.code.indexOf('Arrow') === 0) e.preventDefault();
    });
    addEventListener('keyup', function (e) { keys[e.code] = false; });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    addEventListener('touchstart', revealTouch, { passive: true });
    bindTouch();
  }

  function revealTouch() {
    if (touchOn) return;
    touchOn = true;
    document.body.classList.add('touch');
    var wrap = $('touch');
    if (wrap) wrap.hidden = false;
    removeEventListener('touchstart', revealTouch);
  }

  function capture(node, id) { try { node.setPointerCapture(id); } catch (e) {} }

  function bindTouch() {
    var moveEl = $('t-move');
    var knob = moveEl && moveEl.querySelector('.t-knob');
    function stick(e, pad) {
      var r = pad.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = e.clientX - cx, dy = e.clientY - cy;
      var max = r.width * 0.42, m = Math.hypot(dx, dy) || 1;
      var k = Math.min(1, m / max);
      return { x: (dx / m) * k, y: (dy / m) * k };
    }
    if (!moveEl) return;
    moveEl.addEventListener('pointerdown', function (e) {
      unlockAudio();
      if (e.pointerType === 'mouse') return;
      if (touchMove.id !== null) return;
      touchMove.id = e.pointerId;
      capture(moveEl, e.pointerId);
      var s = stick(e, moveEl);
      touchMove.x = s.x; touchMove.y = s.y;
      if (knob) knob.style.transform = 'translate(' + (s.x * 36) + 'px,' + (s.y * 36) + 'px)';
      e.preventDefault();
    });
    moveEl.addEventListener('pointermove', function (e) {
      if (e.pointerId !== touchMove.id) return;
      var s = stick(e, moveEl);
      touchMove.x = s.x; touchMove.y = s.y;
      if (knob) knob.style.transform = 'translate(' + (s.x * 36) + 'px,' + (s.y * 36) + 'px)';
      e.preventDefault();
    });
    var endMove = function (e) {
      if (e.pointerId !== touchMove.id) return;
      touchMove.id = null; touchMove.x = 0; touchMove.y = 0;
      if (knob) knob.style.transform = '';
    };
    moveEl.addEventListener('pointerup', endMove);
    moveEl.addEventListener('pointercancel', endMove);
  }

  function moveVector() {
    var x = 0, y = 0;
    if (keys.KeyA || keys.ArrowLeft) x -= 1;
    if (keys.KeyD || keys.ArrowRight) x += 1;
    if (keys.KeyW || keys.ArrowUp) y -= 1;
    if (keys.KeyS || keys.ArrowDown) y += 1;
    if (touchOn && (touchMove.id !== null || touchMove.x || touchMove.y)) {
      x += touchMove.x; y += touchMove.y;
    }
    var m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    thrusting = m > 0.08;
    return { x: x, y: y };
  }

  /* ------------------------------------------------------------------ */
  /* collect / score                                                    */
  /* ------------------------------------------------------------------ */

  function puff(x, y, hue, n, speed) {
    var i, a, s;
    for (i = 0; i < n; i++) {
      a = Math.random() * Math.PI * 2;
      s = (speed || 70) * (0.4 + Math.random());
      particles.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.28 + Math.random() * 0.32, hue: hue,
        r: 1.6 + Math.random() * 2.4
      });
    }
  }

  function pop(x, y, text) {
    pops.push({ x: x, y: y, text: text, life: 0.8 });
  }

  function award(pts, starId, x, y) {
    if (starId != null && counted[starId]) return;
    if (starId != null) counted[starId] = 1;
    if (!playing || (sky && sky.phase === 'over')) return;
    var t = now();
    if (t - lastComboAt < 1600) combo += 1;
    else combo = 1;
    lastComboAt = t;
    var bonus = combo >= 3 ? Math.min(combo - 2, 4) : 0;
    var gain = (pts || 1) + bonus;
    me.score += gain;
    if (root.Net) root.Net.setScore(me.score);
    puff(x, y, 0.12, 14 + Math.min(10, gain * 2), 110);
    pop(x, y - 18, '+' + gain + (combo >= 3 ? '  combo' : ''));
    flash = 0.18;
    beep(520 + Math.min(400, gain * 80), 0.09, 0.05, 'sine');
    if (combo >= 3) beep(880, 0.07, 0.03, 'triangle');
  }

  function collectLocal() {
    if (!me || !sky || sky.phase !== 'run') return;
    var i, s, hid;
    for (i = 0; i < sky.stars.length; i++) {
      s = sky.stars[i];
      if (s.by || pendingHide[s.id] || counted[s.id]) continue;
      if (!R.hitsStar(me, s)) continue;
      pendingHide[s.id] = now();
      if (root.Net && root.Net.live()) {
        root.Net.claimStar(s.id);
      } else {
        var res = R.tryCollect(sky, me);
        if (res.collected) {
          me.score -= res.points;
          award(res.points, res.starId, s.x, s.y);
          R.pruneTaken(sky);
          R.refillStars(sky, true);
        }
      }
      break;
    }
    for (hid in pendingHide) {
      if (now() - pendingHide[hid] > 900 && !counted[hid]) delete pendingHide[hid];
    }
  }

  function findStar(id) {
    if (!sky || !sky.stars) return null;
    var i;
    for (i = 0; i < sky.stars.length; i++) if (sky.stars[i].id === id) return sky.stars[i];
    return null;
  }

  function localBump() {
    if (!me || !root.Net) return;
    var others = root.Net.others();
    var id, o, p, dx, dy, dist, nx, ny, overlap, va, vb, imp;
    for (id in others) {
      o = others[id];
      p = root.Net.poseOf(o);
      dx = p.x - me.x; dy = p.y - me.y;
      dist = Math.hypot(dx, dy);
      if (dist < 0.001) continue;
      if (dist >= R.ROCKET_R * 2) continue;
      nx = dx / dist; ny = dy / dist;
      overlap = R.ROCKET_R * 2 - dist;
      me.x -= nx * overlap * 0.5;
      me.y -= ny * overlap * 0.5;
      va = me.vx * nx + me.vy * ny;
      me.vx -= nx * va * 1.6;
      me.vy -= ny * va * 1.6;
    }
  }

  /* ------------------------------------------------------------------ */
  /* draw                                                               */
  /* ------------------------------------------------------------------ */

  function resize() {
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    canvas.width = Math.max(1, (root.innerWidth * dpr) | 0);
    canvas.height = Math.max(1, (root.innerHeight * dpr) | 0);
    canvas.style.width = root.innerWidth + 'px';
    canvas.style.height = root.innerHeight + 'px';
  }

  function camZoom(w, h) {
    return Math.min(w / 640, h / 480, 1.35);
  }

  function drawStarShape(ctx, r, points) {
    var i, a, rad;
    ctx.beginPath();
    for (i = 0; i < points * 2; i++) {
      a = -Math.PI / 2 + i * Math.PI / points;
      rad = (i % 2 === 0) ? r : r * 0.42;
      if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
      else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
  }

  function drawCollectible(s, t) {
    if (s.by || pendingHide[s.id]) return;
    var pulse = 1 + Math.sin(t * 0.005 + s.id) * 0.1;
    var r = R.STAR_R * pulse;
    var col = s.k === R.KIND_COMET ? '#7ee0ff' : s.k === R.KIND_GOLD ? '#ffd24a' : '#ffe08a';
    var glow = s.k === R.KIND_COMET ? 'rgba(90, 210, 255, .28)' : 'rgba(255, 200, 80, .22)';
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(t * 0.0007 * (s.k === R.KIND_COMET ? 2.2 : 1));
    var g = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 2.6);
    g.addColorStop(0, glow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = col;
    drawStarShape(ctx, r, s.k === R.KIND_COMET ? 4 : 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.beginPath(); ctx.arc(-r * 0.22, -r * 0.22, r * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawRocket(r, hue, isMe, th) {
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.angle);
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath();
    ctx.ellipse(2, 8, 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    if (th) {
      var flick = 10 + Math.random() * 10;
      ctx.fillStyle = 'rgba(255, 170, 60, .9)';
      ctx.beginPath();
      ctx.moveTo(-12, -5); ctx.lineTo(-12 - flick, 0); ctx.lineTo(-12, 5);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255, 240, 180, .95)';
      ctx.beginPath();
      ctx.moveTo(-12, -2.5); ctx.lineTo(-12 - flick * 0.6, 0); ctx.lineTo(-12, 2.5);
      ctx.closePath(); ctx.fill();
    }
    var body = hsv(hue, isMe ? 0.55 : 0.62, isMe ? 0.98 : 0.9);
    var rim = hsv(hue, 0.7, 0.42);
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.moveTo(-10, -11); ctx.lineTo(-4, -4); ctx.lineTo(-10, -2); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-10, 11); ctx.lineTo(-4, 4); ctx.lineTo(-10, 2); ctx.closePath(); ctx.fill();
    var grd = ctx.createLinearGradient(-12, 0, 18, 0);
    grd.addColorStop(0, rim);
    grd.addColorStop(0.45, body);
    grd.addColorStop(1, '#fff6e8');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-12, 9);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-12, -9);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(160, 230, 255, .9)';
    ctx.beginPath(); ctx.ellipse(6, 0, 4.2, 3.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath(); ctx.ellipse(5, -1, 1.6, 1.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(8,8,16,.65)';
    ctx.fillText(r.name || 'Rocket', r.x, r.y - 28);
    ctx.fillStyle = isMe ? '#ffe7c2' : '#f0e6d4';
    ctx.fillText(r.name || 'Rocket', r.x, r.y - 29);
  }

  function draw() {
    var dpr = root.devicePixelRatio || 1;
    var w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var t = now();
    var zoom = camZoom(w, h);

    var g = ctx.createRadialGradient(w * 0.5, h * 0.42, 20, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    g.addColorStop(0, '#14102c');
    g.addColorStop(0.55, '#08081a');
    g.addColorStop(1, '#04040c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-cam.x, -cam.y);

    var i;
    for (i = 0; i < bgStars.length; i++) {
      var b = bgStars[i];
      var tw = 0.55 + 0.45 * Math.sin(t * 0.002 + b.p);
      ctx.globalAlpha = b.a * tw;
      ctx.fillStyle = '#f4efe6';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(255, 210, 150, .12)';
    ctx.lineWidth = 2 / zoom;
    ctx.strokeRect(0, 0, R.W, R.H);

    if (sky && sky.stars) {
      for (i = 0; i < sky.stars.length; i++) drawCollectible(sky.stars[i], t);
    }

    if (root.Net) {
      var others = root.Net.others();
      var id;
      for (id in others) {
        var o = others[id];
        var pose = root.Net.poseOf(o);
        drawRocket({ x: pose.x, y: pose.y, angle: pose.angle, name: o.name }, o.hue, false, o.thrusting);
      }
    }

    if (me) drawRocket({ x: me.x, y: me.y, angle: me.angle, name: me.name }, me.hue, true, thrusting);

    for (i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      ctx.globalAlpha = Math.max(0, p.life * 3);
      ctx.fillStyle = hsv(p.hue, 0.45, 1);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.font = '700 16px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (i = 0; i < pops.length; i++) {
      var q = pops[i];
      ctx.globalAlpha = Math.max(0, q.life / 0.8);
      ctx.fillStyle = '#ffe7c2';
      ctx.fillText(q.text, q.x, q.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    if (flash > 0) {
      ctx.fillStyle = 'rgba(255, 210, 120,' + (flash * 0.35) + ')';
      ctx.fillRect(0, 0, w, h);
    }

    if (thrusting && me) {
      puff(me.x - Math.cos(me.angle) * 14, me.y - Math.sin(me.angle) * 14, 0.08, 1, 40);
    }
  }

  function paintBoard() {
    var el = $('board');
    var body = $('board-rows');
    if (!el || !body) return;
    var list = roster.length ? roster.slice() : [{ name: me && me.name || 'You', score: me && me.score || 0, me: true }];
    if (me) {
      var ri;
      for (ri = 0; ri < list.length; ri++) if (list[ri].me) {
        list[ri] = { name: list[ri].name, score: me.score, me: true };
      }
    }
    var html = '', i, shown = list.slice(0, 6);
    for (i = 0; i < shown.length; i++) {
      var r = shown[i];
      html += '<tr class="' + (r.me ? 'me' : '') + '">' +
        '<td class="n">' + escapeHtml(r.name || 'Rocket') + (r.me ? '  (you)' : '') + '</td>' +
        '<td class="s">' + (r.score || 0) + '</td></tr>';
    }
    body.innerHTML = html;
    el.hidden = list.length < 2;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function fmtClock(ms) {
    ms = Math.max(0, ms);
    var s = Math.ceil(ms / 1000);
    var m = (s / 60) | 0;
    s = s % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function paintHud() {
    if (!me) return;
    $('score').textContent = String(me.score | 0);
    var left = sky ? Math.max(0, (sky.endsAt || 0) - now()) : R.ROUND_MS;
    if (sky && sky.phase === 'over') left = 0;
    $('clock').textContent = fmtClock(left);
    $('best').textContent = best ? ('best ' + best) : '';
  }

  function showOver() {
    var card = $('over');
    if (!card) return;
    card.hidden = false;
    $('overScore').textContent = String(me.score | 0);
    var isBest = me.score > 0 && me.score >= best;
    $('overKicker').textContent = isBest && me.score > 0 ? 'New best' : 'Round over';
    $('overBest').textContent = best ? ('Best  ' + best) : '';
    var html = '', i, list = roster.length ? roster.slice() : [{ name: me.name, score: me.score, me: true }];
    for (i = 0; i < list.length && i < 6; i++) {
      html += '<div class="' + (list[i].me ? 'me' : '') + '"><span>' +
        escapeHtml(list[i].name) + '</span><span>' + (list[i].score || 0) + '</span></div>';
    }
    $('overBoard').innerHTML = html;
    if (me.score > best) {
      best = me.score;
      saveBest();
    }
  }

  function hideOver() {
    var card = $('over');
    if (card) card.hidden = true;
    savedOver = false;
  }

  /* ------------------------------------------------------------------ */
  /* loop                                                               */
  /* ------------------------------------------------------------------ */

  function update(dt) {
    if (!playing || !me) return;
    var i;

    if (sky) {
      if (sky.round !== lastRound) {
        lastRound = sky.round;
        me.score = 0;
        combo = 0;
        counted = {};
        pendingHide = {};
        savedOver = false;
        hideOver();
        if (root.Net) { root.Net.setScore(0); root.Net.setRound(lastRound); }
        var p = R.spawnPos(me.id);
        me.x = p.x; me.y = p.y; me.vx = 0; me.vy = 0;
      }
      if (root.Net && root.Net.owner()) {
        R.tickRound(sky, now(), true);
        if (root.Net) root.Net.adoptSky(sky);
      }
    }

    if (!sky || sky.phase !== 'over') {
      var mv = moveVector();
      R.integrate(me, mv, dt);
      localBump();
      collectLocal();
    } else {
      thrusting = false;
      if (!savedOver) { savedOver = true; showOver(); }
    }

    if (root.Net && root.Net.owner() && sky && sky.phase === 'run' && sky.bump !== false) {
      var bodies = [{ id: me.id, x: me.x, y: me.y, vx: me.vx, vy: me.vy }];
      var others = root.Net.others(), id, o, pose;
      for (id in others) {
        o = others[id];
        pose = root.Net.poseOf(o);
        bodies.push({ id: o.id, x: pose.x, y: pose.y, vx: o.vx, vy: o.vy });
      }
      var ev = R.resolveBumps(bodies, true);
      if (ev.length) {
        for (i = 0; i < ev.length; i++) {
          if (ev[i].a === me.id) { me.x = ev[i].ax; me.y = ev[i].ay; me.vx = ev[i].avx; me.vy = ev[i].avy; }
          if (ev[i].b === me.id) { me.x = ev[i].bx; me.y = ev[i].by; me.vx = ev[i].bvx; me.vy = ev[i].bvy; }
        }
        root.Net.noteBumps(ev);
      }
    }

    cam.x += (me.x - cam.x) * Math.min(1, dt * 6);
    cam.y += (me.y - cam.y) * Math.min(1, dt * 6);

    for (i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      p.vx *= 0.9; p.vy *= 0.9;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (i = pops.length - 1; i >= 0; i--) {
      pops[i].y -= 28 * dt;
      pops[i].life -= dt;
      if (pops[i].life <= 0) pops.splice(i, 1);
    }
    if (flash > 0) flash = Math.max(0, flash - dt * 2.2);

    if (root.Net) {
      root.__ROCKETS_POSE__ = function () {
        return { x: me.x, y: me.y, vx: me.vx, vy: me.vy, angle: me.angle, thrusting: thrusting };
      };
      root.Net.setScore(me.score);
      root.Net.tick();
    }
    paintHud();
    paintBoard();
  }

  function frame(ts) {
    var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------ */
  /* persistence                                                        */
  /* ------------------------------------------------------------------ */

  function saveBest() {
    try {
      if (root.gifos && gifos.db) {
        gifos.db('prefs').put({ id: 'prefs', best: best }).catch(function () {});
      }
    } catch (e) {}
  }

  function loadBest() {
    try {
      if (!root.gifos || !gifos.db) return Promise.resolve(0);
      return gifos.db('prefs').getAll().then(function (rows) {
        var i, b = 0;
        for (i = 0; i < (rows || []).length; i++) {
          if (rows[i] && rows[i].id === 'prefs' && rows[i].best > b) b = rows[i].best | 0;
        }
        return b;
      }).catch(function () { return 0; });
    } catch (e) { return Promise.resolve(0); }
  }

  /* ------------------------------------------------------------------ */
  /* boot                                                               */
  /* ------------------------------------------------------------------ */

  function startPlay() {
    if (playing) return;
    unlockAudio();
    playing = true;
    document.body.classList.add('play');
    $('gate').hidden = true;
    if (!sky) {
      var canHost = !root.Net || !root.Net.live() || root.Net.owner();
      if (canHost) {
        sky = R.freshSky((Math.random() * 0xffffffff) >>> 0, now());
        if (root.Net) root.Net.adoptSky(sky);
        if (root.Net && root.Net.owner()) root.Net.publishSky(true);
      }
    }
    lastRound = sky.round || 1;
    if (root.Net) root.Net.setRound(lastRound);
    root.__ROCKETS_POSE__ = function () {
      return { x: me.x, y: me.y, vx: me.vx, vy: me.vy, angle: me.angle, thrusting: thrusting };
    };
    if (root.Net) root.Net.publish(true);
    beep(440, 0.08, 0.04, 'triangle');
  }

  function boot() {
    canvas = $('game');
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    resize();
    addEventListener('resize', resize);
    seedBg();
    bindInput();

    var hue = 0.08;
    var name = 'You';
    var pos = R.spawnPos('local');

    function go(netInfo) {
      if (root.Net && root.Net.me() && root.Net.me().id) {
        var id = root.Net.me();
        name = id.name || 'You';
        hue = root.Net.tintFor(id.id || 'local');
        pos = R.spawnPos(id.id || 'local');
      }
      me = R.spawnRocket(root.Net && root.Net.me() ? root.Net.me().id : 'local', pos.x, pos.y);
      me.name = name;
      me.hue = hue;
      cam.x = me.x; cam.y = me.y;

      if (root.Net) {
        root.Net.onRoster(function (r) { roster = r; paintBoard(); });
        root.Net.onSky(function (s) {
          if (!root.Net.owner()) sky = s;
        });
        root.Net.onAward(function (pts, starId) {
          var st = findStar(starId);
          award(pts, starId, st ? st.x : me.x, st ? st.y : me.y);
        });
        root.Net.onBump(function (b) {
          if (!me) return;
          if (b.x != null) me.x = b.x;
          if (b.y != null) me.y = b.y;
          if (b.vx != null) me.vx = b.vx;
          if (b.vy != null) me.vy = b.vy;
        });
        if (root.Net.owner()) {
          if (!sky) sky = R.freshSky((Math.random() * 0xffffffff) >>> 0, now());
          root.Net.adoptSky(sky);
          root.Net.publishSky(true);
        } else {
          sky = root.Net.sky();
        }
        if (root.Net.count() > 1) {
          var note = $('mpNote');
          if (note) note.hidden = false;
        }
      } else {
        sky = R.freshSky((Math.random() * 0xffffffff) >>> 0, now());
      }

      loadBest().then(function (b) { best = b | 0; paintHud(); });

      if (root.gifos && gifos.onBack) {
        gifos.onBack(function () {
          if (!$('over').hidden) { hideOver(); return true; }
          if (!$('gate').hidden) return false;
          return false;
        });
      }

      paintHud();
      requestAnimationFrame(frame);
    }

    $('play').addEventListener('click', function () {
      startPlay();
    });

    if (root.Net && root.Net.init) {
      root.Net.init().then(go, function () { go(); });
    } else {
      go();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
