/*
 * IO Blobs — a thin rewrite of the .io arena as coloured blobs.
 *
 * Upstream is a Socket.IO Node server that owns ships, auto-fired bullets
 * and a 60 Hz tick, plus a webpack client that paints SVG ships. The GifOS
 * runtime inlines <script src> and drops type="module", so that stack
 * cannot come along; neither can the game server. What is kept is the
 * arena (MAP_SIZE 3000) and the .io loop: you are a body in an open field,
 * you steer, you grow. Ships and bullets stay behind — this copy is
 * blob-eat-blob. Size is the state that used to be hit-points.
 *
 * Classic IIFE. No fetch, no sockets, no eval.
 */
(function (root) {
  'use strict';

  var MAP = 3000;                 // upstream MAP_SIZE
  var START_R = 20;               // upstream PLAYER_RADIUS
  var START_SPEED = 280;          // slower than upstream's 400 — blobs drift
  var FOOD_R = 5.5;
  var FOOD_N = 90;
  var EAT_RATIO = 1.12;           // must be this much bigger to swallow
  var WORLD_SEED = 0x10B10B5;
  var RESPAWN_MS = 2200;
  var BOT_N = 5;
  var GRID = 80;

  var canvas, ctx;
  var food = [];
  var bots = [];
  var particles = [];
  var messages = [];
  var me = null;
  var cam = { x: 0, y: 0 };
  var keys = {};
  var pointer = { x: 0, y: 0, has: false };
  var touchMove = { id: null, x: 0, y: 0 };
  var touchOn = false;
  var lastTs = 0;
  var killedBy = null;
  var killedByName = '';
  var flash = 0;
  var botsOn = true;
  var roster = [];
  var foodTaken = {};
  var ateKey = {};
  var audioCtx = null;
  var running = false;

  function now() { return Date.now(); }

  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function massOf(r) { return r * r; }
  function rOf(m) { return Math.sqrt(Math.max(4, m)); }

  function clampMap(ent) {
    var lim = MAP - ent.r;
    if (ent.x < ent.r) ent.x = ent.r;
    if (ent.y < ent.r) ent.y = ent.r;
    if (ent.x > lim) ent.x = lim;
    if (ent.y > lim) ent.y = lim;
  }

  function speedOf(r) {
    return START_SPEED * Math.pow(START_R / Math.max(START_R, r), 0.42);
  }

  function hueFor(id) {
    if (root.Net) return root.Net.tintFor(id);
    var h = 0;
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return (h % 360) / 360;
  }

  function hsvFill(h, s, v) {
    var i6 = Math.floor(h * 6) % 6, f = h * 6 - Math.floor(h * 6);
    var p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    var m = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i6];
    return 'rgb(' + ((m[0] * 255) | 0) + ',' + ((m[1] * 255) | 0) + ',' + ((m[2] * 255) | 0) + ')';
  }

  function canEat(bigR, smallR, dist) {
    if (bigR < smallR * EAT_RATIO) return false;
    return dist + smallR * 0.35 < bigR;
  }

  function seedFood() {
    var rng = mulberry(WORLD_SEED);
    food = [];
    var i;
    for (i = 0; i < FOOD_N; i++) {
      food.push({
        id: i,
        x: 40 + rng() * (MAP - 80),
        y: 40 + rng() * (MAP - 80),
        r: FOOD_R * (0.7 + rng() * 0.6),
        hue: rng(),
        taken: false,
      });
    }
  }

  function pickSpawn() {
    var rng = Math.random;
    var tries = 18, best = { x: MAP * 0.5, y: MAP * 0.5 }, bestD = -1, i;
    for (i = 0; i < tries; i++) {
      var p = { x: MAP * (0.18 + rng() * 0.64), y: MAP * (0.18 + rng() * 0.64) };
      var d = 1e9, id;
      if (me && me.alive) d = Math.min(d, Math.hypot(p.x - me.x, p.y - me.y));
      if (root.Net) {
        var others = root.Net.others();
        for (id in others) {
          var o = others[id];
          if (!o.alive) continue;
          d = Math.min(d, Math.hypot(p.x - o.x, p.y - o.y) - (o.r || 0));
        }
      }
      for (id = 0; id < bots.length; id++) {
        d = Math.min(d, Math.hypot(p.x - bots[id].x, p.y - bots[id].y) - bots[id].r);
      }
      if (d > bestD) { bestD = d; best = p; }
    }
    return best;
  }

  function makeMe(name, hue) {
    var s = pickSpawn();
    me = {
      x: s.x, y: s.y, r: START_R, mass: massOf(START_R),
      score: 0, alive: true, spawn: 1, k: 0, d: 0,
      name: name || 'Player', hue: hue || 0.48,
      vx: 0, vy: 0,
    };
  }

  function spawnBots() {
    bots = [];
    var rng = mulberry(WORLD_SEED ^ 0x9e3779b9);
    var names = ['Wanderer', 'Nibbler', 'Drift', 'Pip', 'Mote'];
    var i;
    for (i = 0; i < BOT_N; i++) {
      var r = 12 + rng() * 22;
      bots.push({
        x: 80 + rng() * (MAP - 160),
        y: 80 + rng() * (MAP - 160),
        r: r, mass: massOf(r),
        hue: rng(),
        dir: rng() * Math.PI * 2,
        wait: 0.4 + rng() * 1.6,
        name: names[i % names.length],
        alive: true,
      });
    }
    botsOn = true;
  }

  function retireBots() {
    if (!botsOn && !bots.length) return;
    botsOn = false;
    bots = [];
    note('The wanderers scatter — other people are here.');
  }

  /* ------------------------------------------------------------------ */
  /* audio                                                              */
  /* ------------------------------------------------------------------ */

  function beep(freq, dur, vol, type) {
    try {
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var o = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.value = vol || 0.04;
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

  /* ------------------------------------------------------------------ */
  /* eat / die                                                          */
  /* ------------------------------------------------------------------ */

  function grow(addMass) {
    if (!me || !me.alive) return;
    me.mass += addMass;
    me.r = rOf(me.mass);
    me.score = Math.max(me.score, Math.round(me.mass - massOf(START_R)));
    syncSelf(false);
  }

  function swallow(x, y, r, hue) {
    puff(x, y, hue, 10 + Math.min(18, r / 2));
    beep(520 + Math.min(400, r * 4), 0.08, 0.045, 'sine');
  }

  function eatenBy(fromId, fromName) {
    if (!me || !me.alive) return;
    killedBy = fromId || null;
    killedByName = fromName || '';
    die();
  }

  function die() {
    if (!me || !me.alive) return;
    me.alive = false;
    me.d++;
    me.deadAt = now();
    note((killedByName || 'Something') + ' swallowed you.');
    beep(110, 0.32, 0.07, 'triangle');
    puff(me.x, me.y, me.hue, 22);
    flash = 1;
    syncSelf(true);
    setTimeout(respawn, RESPAWN_MS);
  }

  function respawn() {
    if (!me) return;
    var s = pickSpawn();
    me.x = s.x; me.y = s.y;
    me.r = START_R; me.mass = massOf(START_R);
    me.alive = true;
    me.spawn++;
    killedBy = null;
    killedByName = '';
    flash = 0;
    syncSelf(true);
  }

  function puff(x, y, hue, n) {
    var i;
    for (i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 90;
      particles.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.28 + Math.random() * 0.28, hue: hue, r: 2 + Math.random() * 2.4,
      });
    }
  }

  function note(text) {
    messages.unshift({ text: text, t: now() });
    if (messages.length > 5) messages.pop();
  }

  function syncSelf(force) {
    if (!root.Net || !me) return;
    root.Net.setSelf({
      r: me.r, score: me.score, alive: me.alive, spawn: me.spawn, deaths: me.d,
      killedBy: me.alive ? null : killedBy,
    });
    if (force) root.Net.publish(true);
  }

  /* ------------------------------------------------------------------ */
  /* input                                                              */
  /* ------------------------------------------------------------------ */

  function bindInput() {
    addEventListener('keydown', function (e) {
      keys[e.code] = true;
      if (e.code === 'Tab') e.preventDefault();
    });
    addEventListener('keyup', function (e) {
      keys[e.code] = false;
    });
    addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      pointer.has = true;
      pointer.x = e.clientX; pointer.y = e.clientY;
    });
    canvas.addEventListener('pointerdown', function (e) {
      unlockAudio();
      if (e.pointerType === 'touch') return;
      pointer.has = true;
      pointer.x = e.clientX; pointer.y = e.clientY;
    });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    addEventListener('touchstart', revealTouch, { passive: true });
    bindTouch();
  }

  function revealTouch() {
    if (touchOn) return;
    touchOn = true;
    document.body.classList.add('touch');
    var wrap = document.getElementById('touch');
    if (wrap) wrap.hidden = false;
    removeEventListener('touchstart', revealTouch);
  }

  function capture(node, id) { try { node.setPointerCapture(id); } catch (e) {} }

  function bindTouch() {
    var moveEl = document.getElementById('t-move');
    var knob = moveEl && moveEl.querySelector('.t-knob');

    function stick(e, pad) {
      var r = pad.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = e.clientX - cx, dy = e.clientY - cy;
      var max = r.width * 0.42, m = Math.hypot(dx, dy) || 1;
      var k = Math.min(1, m / max);
      return { x: (dx / m) * k, y: (dy / m) * k };
    }

    if (moveEl) {
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
  }

  function moveVector() {
    var x = 0, y = 0;
    if (keys.KeyA || keys.ArrowLeft) x -= 1;
    if (keys.KeyD || keys.ArrowRight) x += 1;
    if (keys.KeyW || keys.ArrowUp) y -= 1;
    if (keys.KeyS || keys.ArrowDown) y += 1;
    if (touchOn && (touchMove.id !== null || touchMove.x || touchMove.y)) {
      x += touchMove.x; y += touchMove.y;
    } else if (!x && !y && pointer.has && me && !touchOn) {
      var dpr = root.devicePixelRatio || 1;
      var w = canvas.width / dpr, h = canvas.height / dpr;
      var zoom = camZoom();
      var wx = cam.x + (pointer.x - w / 2) / zoom;
      var wy = cam.y + (pointer.y - h / 2) / zoom;
      var dx = wx - me.x, dy = wy - me.y;
      var dist = Math.hypot(dx, dy);
      if (dist > 8) {
        var k = Math.min(1, dist / (me.r * 4 + 40));
        x = (dx / dist) * k;
        y = (dy / dist) * k;
      }
    }
    var m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x: x, y: y };
  }

  function camZoom() {
    if (!me) return 1;
    return Math.max(0.28, Math.min(1.15, 22 / Math.max(me.r, 16)));
  }

  /* ------------------------------------------------------------------ */
  /* update                                                             */
  /* ------------------------------------------------------------------ */

  function update(dt) {
    if (!me) return;
    var i, f;

    if (me.alive) {
      var mv = moveVector();
      var sp = speedOf(me.r);
      me.x += mv.x * sp * dt;
      me.y += mv.y * sp * dt;
      clampMap(me);

      for (i = 0; i < food.length; i++) {
        f = food[i];
        if (f.taken || foodTaken[f.id]) continue;
        if (Math.hypot(me.x - f.x, me.y - f.y) < me.r - f.r * 0.2) {
          f.taken = true;
          grow(massOf(f.r) * 1.6);
          swallow(f.x, f.y, f.r, f.hue);
          if (root.Net) root.Net.noteFood(f.id);
        }
      }

      if (root.Net) {
        var others = root.Net.others();
        var id;
        for (id in others) {
          var o = others[id];
          if (!o.alive) continue;
          var pose = root.Net.poseOf(o);
          var dist = Math.hypot(me.x - pose.x, me.y - pose.y);
          if (canEat(me.r, pose.r, dist)) {
            var ek = o.id + ':' + o.spawn;
            if (!ateKey[ek]) {
              ateKey[ek] = 1;
              grow(massOf(pose.r) * 0.7);
              swallow(pose.x, pose.y, pose.r, o.hue);
              note('You swallowed ' + (o.name || 'someone') + '.');
              root.Net.claimEat(o.id, o.spawn);
            }
            o.alive = false;
          } else if (canEat(pose.r, me.r, dist)) {
            eatenBy(o.id, o.name || 'Player');
            break;
          }
        }
      }

      if (botsOn && me.alive) {
        for (i = bots.length - 1; i >= 0; i--) {
          var b = bots[i];
          var bd = Math.hypot(me.x - b.x, me.y - b.y);
          if (canEat(me.r, b.r, bd)) {
            grow(massOf(b.r) * 0.7);
            swallow(b.x, b.y, b.r, b.hue);
            note('You swallowed ' + b.name + '.');
            me.k++;
            bots.splice(i, 1);
          } else if (canEat(b.r, me.r, bd)) {
            eatenBy(null, b.name);
            break;
          }
        }
      }
    }

    cam.x += (me.x - cam.x) * Math.min(1, dt * 8);
    cam.y += (me.y - cam.y) * Math.min(1, dt * 8);

    if (botsOn) {
      for (i = 0; i < bots.length; i++) updateBot(bots[i], dt);
    }

    for (i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      p.vx *= 0.9; p.vy *= 0.9;
      if (p.life <= 0) particles.splice(i, 1);
    }
    if (flash > 0) flash = Math.max(0, flash - dt * 2.4);

    if (root.Net) {
      if (root.Net.count() > 1) retireBots();
      root.__IOBLOBS_POSE__ = function () {
        return { x: me.x, y: me.y, r: me.r, score: me.score };
      };
      syncSelf(false);
      root.Net.tick();
    }
  }

  function updateBot(bot, dt) {
    bot.wait -= dt;
    if (bot.wait <= 0) {
      bot.dir = Math.random() * Math.PI * 2;
      bot.wait = 0.8 + Math.random() * 2.2;
    }
    var nearest = null, nd = 180 + bot.r * 4, i;
    for (i = 0; i < food.length; i++) {
      var f = food[i];
      if (f.taken || foodTaken[f.id]) continue;
      var d = Math.hypot(bot.x - f.x, bot.y - f.y);
      if (d < nd) { nd = d; nearest = f; }
    }
    if (nearest) bot.dir = Math.atan2(nearest.y - bot.y, nearest.x - bot.x);
    var sp = speedOf(bot.r) * 0.72;
    bot.x += Math.cos(bot.dir) * sp * dt;
    bot.y += Math.sin(bot.dir) * sp * dt;
    clampMap(bot);
    if (nearest && Math.hypot(bot.x - nearest.x, bot.y - nearest.y) < bot.r) {
      nearest.taken = true;
      bot.mass += massOf(nearest.r) * 1.4;
      bot.r = rOf(bot.mass);
    }
  }

  /* ------------------------------------------------------------------ */
  /* draw                                                               */
  /* ------------------------------------------------------------------ */

  function draw() {
    var dpr = root.devicePixelRatio || 1;
    var w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var zoom = camZoom();
    var gx = MAP / 2 - cam.x;
    var gy = MAP / 2 - cam.y;
    var grad = ctx.createRadialGradient(
      w / 2 + gx * zoom, h / 2 + gy * zoom, MAP * 0.08 * zoom,
      w / 2 + gx * zoom, h / 2 + gy * zoom, MAP * 0.55 * zoom
    );
    grad.addColorStop(0, '#10181c');
    grad.addColorStop(1, '#2a3438');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-cam.x, -cam.y);

    var view = Math.max(w, h) / zoom;
    var x0 = Math.max(0, cam.x - view);
    var y0 = Math.max(0, cam.y - view);
    var x1 = Math.min(MAP, cam.x + view);
    var y1 = Math.min(MAP, cam.y + view);

    ctx.strokeStyle = 'rgba(180, 220, 210, .07)';
    ctx.lineWidth = 1 / zoom;
    var gx0 = Math.floor(x0 / GRID) * GRID, gy0 = Math.floor(y0 / GRID) * GRID, x, y;
    ctx.beginPath();
    for (x = gx0; x <= x1; x += GRID) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (y = gy0; y <= y1; y += GRID) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0, 0, 0, .85)';
    ctx.lineWidth = 3 / zoom;
    ctx.strokeRect(0, 0, MAP, MAP);

    var i;
    for (i = 0; i < food.length; i++) {
      var f = food[i];
      if (f.taken || foodTaken[f.id]) continue;
      if (f.x < x0 - 10 || f.x > x1 + 10 || f.y < y0 - 10 || f.y > y1 + 10) continue;
      ctx.fillStyle = hsvFill(f.hue, 0.55, 0.95);
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
    }

    for (i = 0; i < bots.length; i++) drawBlob(bots[i].x, bots[i].y, bots[i].r, bots[i].hue, bots[i].name, 0, true, false);

    if (root.Net) {
      var others = root.Net.others();
      var id;
      for (id in others) {
        var o = others[id];
        var pose = root.Net.poseOf(o);
        drawBlob(pose.x, pose.y, pose.r, o.hue, o.name, o.score, o.alive, false);
      }
    }

    if (me) drawBlob(me.x, me.y, me.r, me.hue, me.name, me.score, me.alive, true);

    for (i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.max(0, p.life * 3);
      ctx.fillStyle = hsvFill(p.hue, 0.45, 1);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    if (flash > 0) {
      ctx.fillStyle = 'rgba(180, 40, 50,' + (flash * 0.32) + ')';
      ctx.fillRect(0, 0, w, h);
    }

    drawHud(w, h);
  }

  function drawBlob(x, y, r, hue, name, score, alive, isMe) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(r * 0.08, r * 0.18, r * 0.95, r * 0.72, 0, 0, Math.PI * 2); ctx.fill();
    if (!alive) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#3a4448';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    var g = ctx.createRadialGradient(-r * 0.32, -r * 0.32, r * 0.08, 0, 0, r);
    var body = hsvFill(hue, isMe ? 0.42 : 0.58, isMe ? 0.98 : 0.9);
    var rim = hsvFill(hue, 0.65, 0.42);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.18, body);
    g.addColorStop(1, rim);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.22)';
    ctx.lineWidth = Math.max(1, r * 0.04);
    ctx.stroke();
    ctx.restore();

    var fs = Math.max(11, Math.min(22, r * 0.42));
    ctx.font = '600 ' + fs + 'px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(8,12,14,.7)';
    ctx.fillText(name || 'Player', x, y - r - fs * 0.35 + 1);
    ctx.fillStyle = isMe ? '#d8fff4' : '#e8f4f0';
    ctx.fillText(name || 'Player', x, y - r - fs * 0.35);
    if (r > 18 && score) {
      ctx.font = '500 ' + Math.max(10, fs * 0.72) + 'px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(232,244,240,.8)';
      ctx.fillText(String(score | 0), x, y + 4);
    }
  }

  function drawHud(w, h) {
    if (!me) return;
    ctx.fillStyle = 'rgba(232,244,240,.88)';
    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(String(me.score | 0), 16, 26);
    ctx.textAlign = 'right';
    var n = root.Net && root.Net.live() ? root.Net.count() : 1;
    ctx.fillText(n <= 1 ? 'alone in the arena' : n + ' in the arena', w - 16, 26);

    ctx.textAlign = 'left';
    ctx.font = '500 12px ui-sans-serif, system-ui, sans-serif';
    var t = now(), i;
    for (i = 0; i < messages.length; i++) {
      var age = t - messages[i].t;
      if (age > 4500) continue;
      ctx.globalAlpha = age > 3500 ? (4500 - age) / 1000 : 1;
      ctx.fillStyle = '#e8f4f0';
      ctx.fillText(messages[i].text, 16, h - 18 - i * 18);
      ctx.globalAlpha = 1;
    }

    if (!me.alive) {
      ctx.fillStyle = 'rgba(8,12,14,.42)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#e8f4f0';
      ctx.textAlign = 'center';
      ctx.font = '700 28px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('Swallowed', w / 2, h / 2 - 8);
      ctx.font = '500 14px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = '#a8c8c0';
      ctx.fillText('Back in a moment', w / 2, h / 2 + 18);
    }
  }

  function paintBoard() {
    var el = document.getElementById('board');
    var body = document.getElementById('board-rows');
    if (!el || !body) return;
    var list = roster.length ? roster.slice() : [{ name: me && me.name || 'Player', score: me && me.score || 0, alive: !me || me.alive, me: true }];
    if (me) {
      var ri;
      for (ri = 0; ri < list.length; ri++) if (list[ri].me) {
        list[ri] = { name: list[ri].name, score: Math.max(list[ri].score || 0, me.score), alive: me.alive, me: true };
      }
    }
    if (botsOn) {
      var bi;
      for (bi = 0; bi < bots.length; bi++) {
        list.push({ name: bots[bi].name, score: Math.round(bots[bi].mass - massOf(START_R)), alive: true, me: false });
      }
      list.sort(function (a, b) { return (b.score - a.score) || a.name.localeCompare(b.name); });
    }
    var html = '', i, shown = list.slice(0, 6);
    for (i = 0; i < shown.length; i++) {
      var r = shown[i];
      html += '<tr class="' + (r.me ? 'me' : '') + (r.alive === false ? ' dead' : '') + '">' +
        '<td class="n">' + escapeHtml(r.name || 'Player') + (r.me ? '  (you)' : '') + '</td>' +
        '<td class="s">' + (r.score || 0) + '</td></tr>';
    }
    body.innerHTML = html;
    el.hidden = false;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  /* ------------------------------------------------------------------ */
  /* loop / boot                                                        */
  /* ------------------------------------------------------------------ */

  function resize() {
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    canvas.width = Math.max(1, (root.innerWidth * dpr) | 0);
    canvas.height = Math.max(1, (root.innerHeight * dpr) | 0);
    canvas.style.width = root.innerWidth + 'px';
    canvas.style.height = root.innerHeight + 'px';
  }

  function frame(ts) {
    var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function boot() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    resize();
    addEventListener('resize', resize);
    seedFood();

    var hue = 0.48;
    var name = 'Player';
    if (root.Net) hue = root.Net.tintFor('local');

    function go() {
      if (root.Net && root.Net.me()) {
        var id = root.Net.me();
        name = id.name || 'Player';
        hue = root.Net.tintFor(id.id || 'local');
      }
      makeMe(name, hue);
      cam.x = me.x; cam.y = me.y;
      if (root.Net && root.Net.count() > 1) { botsOn = false; bots = []; }
      else spawnBots();

      root.__IOBLOBS_POSE__ = function () {
        return { x: me.x, y: me.y, r: me.r, score: me.score };
      };

      if (root.Net) {
        root.Net.onEat(function (fromId, fromName) { eatenBy(fromId, fromName); });
        root.Net.onKill(function (victim) { note('You swallowed ' + victim + '.'); beep(880, 0.12, 0.05, 'sine'); });
        root.Net.onRoster(function (r) { roster = r; paintBoard(); });
        root.Net.onFood(function (taken) { foodTaken = taken || {}; });
        syncSelf(true);
      }
      bindInput();
      paintBoard();
      running = true;
      requestAnimationFrame(frame);
    }

    if (root.Net && root.Net.init) {
      root.Net.init().then(go, function () { go(); });
    } else {
      go();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
