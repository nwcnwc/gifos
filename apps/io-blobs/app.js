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
  var START_SPEED = 320;
  var FOOD_R = 6.2;
  var FOOD_N = 560;
  var FOOD_RESPAWN = 5200;
  var EAT_RATIO = 1.14;           // must be this much bigger to swallow
  var WORLD_SEED = 0x10B10B5;
  var RESPAWN_MS = 2000;
  var BOT_N = 8;
  var GRID = 56;
  var VIRUS_N = 11;
  var VIRUS_R = 40;
  var BOOST_COST = 90;            // mass spent per burst
  var BOOST_CD = 0.42;

  var canvas, ctx;
  var food = [];
  var viruses = [];
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
  var clock = 0;
  var killedBy = null;
  var killedByName = '';
  var flash = 0;
  var shake = 0;
  var botsOn = true;
  var roster = [];
  var foodTaken = {};
  var ateKey = {};
  var audioCtx = null;
  var running = false;
  var boosting = false;
  var boostCd = 0;
  var boardOn = true;
  var best = 0;
  var prefsDb = null;
  var lastBoard = 0;
  var hintUntil = 0;

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
  function scoreOf(m) { return Math.max(0, Math.round(m - massOf(START_R))); }

  function clampMap(ent) {
    var lim = MAP - ent.r;
    if (ent.x < ent.r) ent.x = ent.r;
    if (ent.y < ent.r) ent.y = ent.r;
    if (ent.x > lim) ent.x = lim;
    if (ent.y > lim) ent.y = lim;
  }

  function speedOf(r) {
    return START_SPEED * Math.pow(START_R / Math.max(START_R, r), 0.44);
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
    return dist + smallR * 0.32 < bigR;
  }

  function foodLive(f) {
    if (foodTaken[f.id]) return false;
    if (f.takenUntil && now() < f.takenUntil) return false;
    return true;
  }

  function takeFood(f) {
    f.takenUntil = now() + FOOD_RESPAWN;
    if (root.Net) root.Net.noteFood(f.id);
  }

  function seedFood() {
    var rng = mulberry(WORLD_SEED);
    food = [];
    var i;
    for (i = 0; i < FOOD_N; i++) {
      food.push({
        id: i,
        x: 36 + rng() * (MAP - 72),
        y: 36 + rng() * (MAP - 72),
        r: FOOD_R * (0.72 + rng() * 0.55),
        hue: rng(),
        takenUntil: 0,
      });
    }
  }

  function seedViruses() {
    var rng = mulberry(WORLD_SEED ^ 0x51ed);
    viruses = [];
    var i, j, ok, x, y;
    for (i = 0; i < VIRUS_N; i++) {
      ok = false;
      for (j = 0; j < 18 && !ok; j++) {
        x = 180 + rng() * (MAP - 360);
        y = 180 + rng() * (MAP - 360);
        ok = true;
      }
      viruses.push({ x: x, y: y, r: VIRUS_R * (0.9 + rng() * 0.25), phase: rng() * Math.PI * 2 });
    }
  }

  function pickSpawn() {
    var rng = Math.random;
    var tries = 40, bestP = { x: MAP * 0.5, y: MAP * 0.5 }, bestD = -1, i;
    for (i = 0; i < tries; i++) {
      var p = { x: MAP * (0.16 + rng() * 0.68), y: MAP * (0.16 + rng() * 0.68) };
      var d = 1e9, id;
      if (me && me.alive) {
        d = Math.min(d, Math.hypot(p.x - me.x, p.y - me.y));
        if (d < 640) d *= 0.15;
      }
      if (root.Net) {
        var others = root.Net.others();
        for (id in others) {
          var o = others[id];
          if (!o.alive) continue;
          d = Math.min(d, Math.hypot(p.x - o.x, p.y - o.y) - (o.r || 0));
        }
      }
      for (id = 0; id < bots.length; id++) {
        if (!bots[id].alive) continue;
        d = Math.min(d, Math.hypot(p.x - bots[id].x, p.y - bots[id].y) - bots[id].r);
      }
      for (id = 0; id < viruses.length; id++) {
        d = Math.min(d, Math.hypot(p.x - viruses[id].x, p.y - viruses[id].y) - viruses[id].r);
      }
      if (d > bestD) { bestD = d; bestP = p; }
    }
    return bestP;
  }

  function makeMe(name, hue) {
    var s = pickSpawn();
    me = {
      x: s.x, y: s.y, r: START_R, mass: massOf(START_R),
      score: 0, alive: true, spawn: 1, k: 0, d: 0,
      name: name || 'Player', hue: hue || 0.48,
      vx: 0, vy: 0, squash: 0, facing: 0,
    };
  }

  function spawnBots() {
    bots = [];
    var rng = mulberry(WORLD_SEED ^ 0x9e3779b9);
    var names = ['Nibbler', 'Drift', 'Pip', 'Mote', 'Dot', 'Pebble', 'Speck', 'Lump'];
    var i;
    for (i = 0; i < BOT_N; i++) {
      var kind = i === BOT_N - 1 ? 2 : (i < 2 ? 1 : 0);
      var r = kind === 2 ? 22 + rng() * 3 : kind === 1 ? 18 + rng() * 3 : 15 + rng() * 4;
      var s = pickSpawn();
      bots.push({
        x: s.x,
        y: s.y,
        r: r, mass: massOf(r),
        hue: rng(),
        dir: rng() * Math.PI * 2,
        wait: 0.3 + rng() * 1.2,
        name: names[i % names.length],
        alive: true,
        vx: 0, vy: 0,
        deadAt: 0,
        kind: kind,
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

  function markScore() {
    if (!me) return;
    me.score = scoreOf(me.mass);
    if (me.score > best) {
      best = me.score;
      if (prefsDb) prefsDb.put({ id: 'best', n: best }).catch(function () {});
    }
  }

  function grow(addMass) {
    if (!me || !me.alive) return;
    me.mass += addMass;
    me.r = rOf(me.mass);
    me.squash = Math.min(1, me.squash + 0.35);
    markScore();
    syncSelf(false);
  }

  function swallow(x, y, r, hue) {
    puff(x, y, hue, 12 + Math.min(22, r / 2));
    beep(480 + Math.min(520, r * 5), 0.09, 0.05, 'sine');
    shake = Math.min(1, shake + Math.min(0.28, r / 80));
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
    me.vx = 0; me.vy = 0;
    note((killedByName || 'Something') + ' swallowed you.');
    beep(110, 0.34, 0.08, 'triangle');
    puff(me.x, me.y, me.hue, 28);
    flash = 1;
    shake = 0.7;
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
    me.vx = 0; me.vy = 0;
    me.squash = 0;
    killedBy = null;
    killedByName = '';
    flash = 0;
    markScore();
    syncSelf(true);
  }

  function puff(x, y, hue, n) {
    var i;
    for (i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = 24 + Math.random() * 110;
      particles.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.3 + Math.random() * 0.32, hue: hue, r: 2 + Math.random() * 2.8,
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

  function doBoost() {
    if (!me || !me.alive) return;
    if (boostCd > 0) return;
    if (me.mass < massOf(START_R) + BOOST_COST + 20) return;
    var fx = Math.cos(me.facing), fy = Math.sin(me.facing);
    me.vx += fx * 340;
    me.vy += fy * 340;
    me.mass -= BOOST_COST;
    me.r = rOf(me.mass);
    me.squash = 0.7;
    boostCd = BOOST_CD;
    markScore();
    puff(me.x - fx * me.r, me.y - fy * me.r, me.hue, 8);
    beep(240, 0.07, 0.04, 'square');
    syncSelf(false);
  }

  function popOnThorn(ent, v) {
    var lost = ent.mass * 0.42;
    ent.mass = Math.max(massOf(START_R), ent.mass - lost);
    ent.r = rOf(ent.mass);
    var a = Math.atan2(ent.y - v.y, ent.x - v.x);
    ent.vx = (ent.vx || 0) + Math.cos(a) * 220;
    ent.vy = (ent.vy || 0) + Math.sin(a) * 220;
    puff(ent.x, ent.y, 0.32, 18);
    if (ent === me) {
      me.squash = 0.8;
      shake = 0.45;
      beep(90, 0.18, 0.06, 'sawtooth');
      note('A spike popped you.');
      markScore();
    }
  }

  /* ------------------------------------------------------------------ */
  /* input                                                              */
  /* ------------------------------------------------------------------ */

  function bindInput() {
    function hideHint() {
      var el = document.getElementById('hint');
      if (el) el.style.opacity = '0';
      hintUntil = 0;
    }
    setTimeout(hideHint, 5200);
    addEventListener('keydown', function (e) {
      hideHint();
      keys[e.code] = true;
      if (e.code === 'Tab') {
        e.preventDefault();
        if (!e.repeat) {
          boardOn = !boardOn;
          var el = document.getElementById('board');
          if (el) el.hidden = !boardOn;
        }
      }
      if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        e.preventDefault();
        if (!e.repeat) { unlockAudio(); doBoost(); }
      }
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
    var wrap = document.getElementById('touch');
    var moveEl = document.getElementById('t-move');
    var knob = moveEl && moveEl.querySelector('.t-knob');
    var boostEl = document.getElementById('t-boost');

    function placeStick(clientX, clientY) {
      if (!moveEl) return;
      var r = moveEl.offsetWidth / 2;
      moveEl.style.left = (clientX - r) + 'px';
      moveEl.style.top = (clientY - r) + 'px';
      moveEl.style.bottom = 'auto';
      moveEl.style.right = 'auto';
    }

    function stickFrom(e, ox, oy, max) {
      var dx = e.clientX - ox, dy = e.clientY - oy;
      var m = Math.hypot(dx, dy) || 1;
      var k = Math.min(1, m / max);
      return { x: (dx / m) * k, y: (dy / m) * k };
    }

    if (wrap) {
      wrap.addEventListener('pointerdown', function (e) {
        unlockAudio();
        if (e.pointerType === 'mouse') return;
        if (boostEl && (e.target === boostEl || (boostEl.contains && boostEl.contains(e.target)))) return;
        if (touchMove.id !== null) return;
        touchMove.id = e.pointerId;
        touchMove.ox = e.clientX; touchMove.oy = e.clientY;
        capture(wrap, e.pointerId);
        placeStick(e.clientX, e.clientY);
        touchMove.x = 0; touchMove.y = 0;
        if (knob) knob.style.transform = '';
        e.preventDefault();
      });
      wrap.addEventListener('pointermove', function (e) {
        if (e.pointerId !== touchMove.id) return;
        var s = stickFrom(e, touchMove.ox, touchMove.oy, 64);
        touchMove.x = s.x; touchMove.y = s.y;
        if (knob) knob.style.transform = 'translate(' + (s.x * 28) + 'px,' + (s.y * 28) + 'px)';
        e.preventDefault();
      });
      var endMove = function (e) {
        if (e.pointerId !== touchMove.id) return;
        touchMove.id = null; touchMove.x = 0; touchMove.y = 0;
        if (knob) knob.style.transform = '';
      };
      wrap.addEventListener('pointerup', endMove);
      wrap.addEventListener('pointercancel', endMove);
    }

    if (boostEl) {
      var hold = function (e) {
        e.preventDefault();
        e.stopPropagation();
        unlockAudio();
        boosting = true;
        boostEl.classList.add('held');
        doBoost();
      };
      var release = function () {
        boosting = false;
        boostEl.classList.remove('held');
      };
      boostEl.addEventListener('pointerdown', hold);
      boostEl.addEventListener('pointerup', release);
      boostEl.addEventListener('pointercancel', release);
      boostEl.addEventListener('pointerleave', release);
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
      if (dist > 10) {
        var k = Math.min(1, dist / (me.r * 5 + 48));
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
    var z = 30 / Math.max(me.r, 18);
    var cssW = canvas ? canvas.width / (root.devicePixelRatio || 1) : 800;
    if (cssW < 520) z *= 0.7;
    return Math.max(0.32, Math.min(cssW < 520 ? 1.05 : 1.32, z));
  }

  /* ------------------------------------------------------------------ */
  /* update                                                             */
  /* ------------------------------------------------------------------ */

  function update(dt) {
    if (!me) return;
    var i, f, v;

    clock += dt;
    if (boostCd > 0) boostCd = Math.max(0, boostCd - dt);
    if (boosting && boostCd <= 0) doBoost();

    if (me.alive) {
      var mv = moveVector();
      var sp = speedOf(me.r);
      var ax = 7.5;
      me.vx += (mv.x * sp - me.vx) * Math.min(1, dt * ax);
      me.vy += (mv.y * sp - me.vy) * Math.min(1, dt * ax);
      me.x += me.vx * dt;
      me.y += me.vy * dt;
      clampMap(me);
      if (mv.x || mv.y) me.facing = Math.atan2(me.vy, me.vx);
      if (me.r > 52) {
        me.mass *= 1 - 0.012 * dt * ((me.r - 52) / 80);
        me.r = rOf(me.mass);
      }
      markScore();

      for (i = 0; i < food.length; i++) {
        f = food[i];
        if (!foodLive(f)) continue;
        if (Math.hypot(me.x - f.x, me.y - f.y) < me.r - f.r * 0.15) {
          takeFood(f);
          grow(massOf(f.r) * 1.85);
          swallow(f.x, f.y, f.r, f.hue);
        }
      }

      for (i = 0; i < viruses.length; i++) {
        v = viruses[i];
        var vd = Math.hypot(me.x - v.x, me.y - v.y);
        if (vd < me.r + v.r * 0.55) {
          if (me.r > v.r * 1.05) {
            popOnThorn(me, v);
          } else if (vd < me.r + v.r * 0.82) {
            var pa = Math.atan2(me.y - v.y, me.x - v.x);
            var push = (me.r + v.r * 0.82) - vd;
            me.x += Math.cos(pa) * push;
            me.y += Math.sin(pa) * push;
          }
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
              grow(massOf(pose.r) * 0.72);
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
          if (!b.alive) continue;
          var bd = Math.hypot(me.x - b.x, me.y - b.y);
          if (canEat(me.r, b.r, bd)) {
            grow(massOf(b.r) * 0.72);
            swallow(b.x, b.y, b.r, b.hue);
            note('You swallowed ' + b.name + '.');
            me.k++;
            b.alive = false;
            b.deadAt = now();
          } else if (canEat(b.r, me.r, bd)) {
            eatenBy(null, b.name);
            break;
          }
        }
      }
    }

    var look = 0.12;
    cam.x += (me.x + me.vx * look - cam.x) * Math.min(1, dt * 7);
    cam.y += (me.y + me.vy * look - cam.y) * Math.min(1, dt * 7);
    var dprC = root.devicePixelRatio || 1;
    var vw = (canvas.width / dprC) / camZoom() * 0.42;
    var vh = (canvas.height / dprC) / camZoom() * 0.42;
    if (cam.x < vw) cam.x = vw;
    if (cam.y < vh) cam.y = vh;
    if (cam.x > MAP - vw) cam.x = MAP - vw;
    if (cam.y > MAP - vh) cam.y = MAP - vh;

    if (botsOn) {
      for (i = 0; i < bots.length; i++) updateBot(bots[i], dt);
    }

    for (i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      p.vx *= 0.88; p.vy *= 0.88;
      if (p.life <= 0) particles.splice(i, 1);
    }
    if (flash > 0) flash = Math.max(0, flash - dt * 2.2);
    if (shake > 0) shake = Math.max(0, shake - dt * 3.4);
    if (me.squash > 0) me.squash = Math.max(0, me.squash - dt * 2.6);

    if (root.Net) {
      if (root.Net.count() > 1) retireBots();
      root.__IOBLOBS_POSE__ = function () {
        return { x: me.x, y: me.y, r: me.r, score: me.score };
      };
      syncSelf(false);
      root.Net.tick();
    }

    if (now() - lastBoard > 220) {
      lastBoard = now();
      paintBoard();
    }
  }

  function updateBot(bot, dt) {
    if (!bot.alive) {
      if (now() - bot.deadAt > 2600) {
        var s = pickSpawn();
        var r = bot.kind === 2 ? 22 : bot.kind === 1 ? 18 : 16;
        bot.x = s.x; bot.y = s.y; bot.r = r; bot.mass = massOf(r);
        bot.alive = true; bot.vx = 0; bot.vy = 0; bot.wait = 0.2;
      }
      return;
    }
    bot.wait -= dt;
    var tx = 0, ty = 0, aim = false;
    var i, d, threat = null, prey = null, td = 240 + bot.r * 3, pd = 200 + bot.r * 2;
    if (me && me.alive) {
      d = Math.hypot(bot.x - me.x, bot.y - me.y);
      if (canEat(me.r, bot.r, d) || (me.r > bot.r * 1.05 && d < td)) {
        threat = me; td = d;
      } else if (canEat(bot.r, me.r, d) || (bot.r > me.r * 1.08 && d < pd)) {
        prey = me; pd = d;
      }
    }
    for (i = 0; i < bots.length; i++) {
      var o = bots[i];
      if (o === bot || !o.alive) continue;
      d = Math.hypot(bot.x - o.x, bot.y - o.y);
      if (o.r > bot.r * 1.1 && d < td) { threat = o; td = d; }
      else if (bot.r > o.r * EAT_RATIO && d < pd) { prey = o; pd = d; }
    }
    if (threat) {
      tx = bot.x - threat.x; ty = bot.y - threat.y; aim = true;
    } else if (prey) {
      tx = prey.x - bot.x; ty = prey.y - bot.y; aim = true;
    } else {
      var nearest = null, nd = 220 + bot.r * 3;
      for (i = 0; i < food.length; i++) {
        var f = food[i];
        if (!foodLive(f)) continue;
        d = Math.hypot(bot.x - f.x, bot.y - f.y);
        if (d < nd) { nd = d; nearest = f; }
      }
      if (nearest) { tx = nearest.x - bot.x; ty = nearest.y - bot.y; aim = true; }
    }
    if (aim) bot.dir = Math.atan2(ty, tx);
    else if (bot.wait <= 0) {
      bot.dir = Math.random() * Math.PI * 2;
      bot.wait = 0.7 + Math.random() * 1.8;
    }
    var sp = speedOf(bot.r) * (threat ? 0.78 : 0.48);
    bot.vx += (Math.cos(bot.dir) * sp - (bot.vx || 0)) * Math.min(1, dt * 5);
    bot.vy += (Math.sin(bot.dir) * sp - (bot.vy || 0)) * Math.min(1, dt * 5);
    bot.x += bot.vx * dt;
    bot.y += bot.vy * dt;
    clampMap(bot);

    bot.bite = (bot.bite || 0) - dt;
    for (i = 0; i < food.length; i++) {
      var ff = food[i];
      if (!foodLive(ff)) continue;
      if (bot.bite <= 0 && Math.hypot(bot.x - ff.x, bot.y - ff.y) < bot.r * 0.85) {
        ff.takenUntil = now() + FOOD_RESPAWN;
        bot.mass += massOf(ff.r) * 1.15;
        bot.r = rOf(bot.mass);
        bot.bite = 0.28;
      }
    }
    for (i = 0; i < viruses.length; i++) {
      var vv = viruses[i];
      d = Math.hypot(bot.x - vv.x, bot.y - vv.y);
      if (d < bot.r + vv.r * 0.5 && bot.r > vv.r * 1.05) popOnThorn(bot, vv);
    }
    for (i = 0; i < bots.length; i++) {
      var other = bots[i];
      if (other === bot || !other.alive) continue;
      d = Math.hypot(bot.x - other.x, bot.y - other.y);
      if (bot.r > other.r * 1.28 && canEat(bot.r, other.r, d)) {
        bot.mass += other.mass * 0.55;
        bot.r = rOf(bot.mass);
        puff(other.x, other.y, other.hue, 10);
        other.alive = false;
        other.deadAt = now();
      }
    }
    if (bot.r > 38) {
      bot.mass *= 1 - 0.04 * dt * ((bot.r - 38) / 18);
      bot.r = rOf(bot.mass);
    }
    if (bot.r > 50) { bot.mass = massOf(50); bot.r = 50; }
  }

  /* ------------------------------------------------------------------ */
  /* draw                                                               */
  /* ------------------------------------------------------------------ */

  function draw() {
    var dpr = root.devicePixelRatio || 1;
    var w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var zoom = camZoom();
    var jx = 0, jy = 0;
    if (shake > 0) {
      jx = (Math.random() - 0.5) * 14 * shake;
      jy = (Math.random() - 0.5) * 14 * shake;
    }

    ctx.fillStyle = '#12181c';
    ctx.fillRect(0, 0, w, h);

    var gx = MAP / 2 - cam.x;
    var gy = MAP / 2 - cam.y;
    var grad = ctx.createRadialGradient(
      w / 2 + gx * zoom, h / 2 + gy * zoom, MAP * 0.06 * zoom,
      w / 2 + gx * zoom, h / 2 + gy * zoom, MAP * 0.62 * zoom
    );
    grad.addColorStop(0, '#141c22');
    grad.addColorStop(1, '#2c363c');

    ctx.save();
    ctx.translate(w / 2 + jx, h / 2 + jy);
    ctx.scale(zoom, zoom);
    ctx.translate(-cam.x, -cam.y);

    ctx.fillStyle = grad;
    ctx.fillRect(-400, -400, MAP + 800, MAP + 800);
    ctx.fillStyle = '#0b1012';
    ctx.fillRect(-800, -800, MAP + 1600, 800);
    ctx.fillRect(-800, MAP, MAP + 1600, 800);
    ctx.fillRect(-800, 0, 800, MAP);
    ctx.fillRect(MAP, 0, 800, MAP);

    var view = Math.max(w, h) / zoom;
    var x0 = Math.max(0, cam.x - view);
    var y0 = Math.max(0, cam.y - view);
    var x1 = Math.min(MAP, cam.x + view);
    var y1 = Math.min(MAP, cam.y + view);

    ctx.strokeStyle = 'rgba(180, 220, 210, .08)';
    ctx.lineWidth = 1 / zoom;
    var gx0 = Math.floor(x0 / GRID) * GRID, gy0 = Math.floor(y0 / GRID) * GRID, x, y;
    ctx.beginPath();
    for (x = gx0; x <= x1; x += GRID) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
    for (y = gy0; y <= y1; y += GRID) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(20, 8, 8, .9)';
    ctx.lineWidth = 10 / zoom;
    ctx.strokeRect(0, 0, MAP, MAP);
    ctx.strokeStyle = 'rgba(90, 40, 40, .55)';
    ctx.lineWidth = 3 / zoom;
    ctx.strokeRect(0, 0, MAP, MAP);

    var i;
    for (i = 0; i < food.length; i++) {
      var f = food[i];
      if (!foodLive(f)) continue;
      if (f.x < x0 - 12 || f.x > x1 + 12 || f.y < y0 - 12 || f.y > y1 + 12) continue;
      var pr = f.r * (1 + 0.1 * Math.sin(clock * 3.2 + f.id));
      ctx.fillStyle = hsvFill(f.hue, 0.58, 1);
      ctx.globalAlpha = 0.28;
      ctx.beginPath(); ctx.arc(f.x, f.y, pr * 1.85, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(f.x, f.y, pr, 0, Math.PI * 2); ctx.fill();
    }

    for (i = 0; i < viruses.length; i++) {
      var vv = viruses[i];
      if (vv.x < x0 - 60 || vv.x > x1 + 60 || vv.y < y0 - 60 || vv.y > y1 + 60) continue;
      drawThorn(vv.x, vv.y, vv.r, vv.phase + clock * 0.4);
    }

    for (i = 0; i < bots.length; i++) {
      if (!bots[i].alive) continue;
      drawBlob(bots[i].x, bots[i].y, bots[i].r, bots[i].hue, bots[i].name, scoreOf(bots[i].mass), true, false, bots[i].dir || 0, 0);
    }

    if (root.Net) {
      var others = root.Net.others();
      var id;
      for (id in others) {
        var o = others[id];
        var pose = root.Net.poseOf(o);
        drawBlob(pose.x, pose.y, pose.r, o.hue, o.name, o.score, o.alive, false, 0, 0);
      }
    }

    if (me) {
      drawBlob(me.x, me.y, me.r, me.hue, me.name, me.score, me.alive, true, me.facing, me.squash);
    }

    for (i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.max(0, p.life * 3);
      ctx.fillStyle = hsvFill(p.hue, 0.5, 1);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    if (flash > 0) {
      ctx.fillStyle = 'rgba(180, 40, 50,' + (flash * 0.32) + ')';
      ctx.fillRect(0, 0, w, h);
    }

    drawHud(w, h);
    drawMini(w, h);
  }

  function drawThorn(x, y, r, phase) {
    var n = 28, i, a, rr;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    for (i = 0; i <= n; i++) {
      a = (i / n) * Math.PI * 2 + phase * 0.15;
      rr = r * (i % 2 ? 1.28 : 0.78);
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    var g = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r * 1.2);
    g.addColorStop(0, '#c8ff6a');
    g.addColorStop(0.55, '#4cbe3a');
    g.addColorStop(1, '#1a5a22');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(10, 30, 12, .45)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
  }

  function drawBlob(x, y, r, hue, name, score, alive, isMe, facing, squash) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath(); ctx.ellipse(r * 0.08, r * 0.2, r * 0.95, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    if (!alive) {
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#3a4448';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    var n = Math.max(18, Math.min(36, (r / 1.6) | 0));
    var phase = clock * 2.2 + hue * 12;
    var wob = 0.028 + Math.min(0.04, r / 900);
    var stretch = 1 + Math.min(0.07, (isMe ? Math.hypot(me.vx, me.vy) : 0) / 900) + (squash || 0) * 0.08;
    ctx.rotate(facing || 0);
    ctx.scale(stretch, 1 / stretch);
    ctx.beginPath();
    var i, a, wr, px, py;
    for (i = 0; i <= n; i++) {
      a = i / n * Math.PI * 2;
      wr = 1 + wob * Math.sin(a * 3 + phase) + wob * 0.35 * Math.sin(a * 5 - phase * 1.3);
      px = Math.cos(a) * r * wr;
      py = Math.sin(a) * r * wr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    var g = ctx.createRadialGradient(-r * 0.32, -r * 0.32, r * 0.06, 0, 0, r);
    var body = hsvFill(hue, isMe ? 0.46 : 0.6, isMe ? 0.98 : 0.92);
    var rim = hsvFill(hue, 0.7, 0.4);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.2, body);
    g.addColorStop(1, rim);
    ctx.fillStyle = g;
    ctx.fill();
    if (isMe) {
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = Math.max(1.2, r * 0.045);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,.22)';
      ctx.lineWidth = Math.max(1, r * 0.04);
      ctx.stroke();
    }
    ctx.restore();

    var fs = Math.max(11, Math.min(22, r * 0.42));
    ctx.font = '600 ' + fs + 'px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(8,12,14,.7)';
    ctx.fillText(name || 'Player', x, y - r - fs * 0.35 + 1);
    ctx.fillStyle = isMe ? '#d8fff4' : '#e8f4f0';
    ctx.fillText(name || 'Player', x, y - r - fs * 0.35);
    if (r > 28 && score) {
      ctx.font = '500 ' + Math.max(10, fs * 0.7) + 'px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(232,244,240,.82)';
      ctx.fillText(String(score | 0), x, y + 4);
    }
  }

  function drawHud(w, h) {
    if (!me) return;
    var pad = 16;
    var chipH = 48, chipW = 120;
    var chipY = h - pad - chipH;
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(8,12,14,.72)';
    if (ctx.roundRect) {
      ctx.beginPath(); ctx.roundRect(pad - 8, chipY, chipW, chipH, 8); ctx.fill();
    } else {
      ctx.fillRect(pad - 8, chipY, chipW, chipH);
    }
    ctx.font = '700 22px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = '#e8f4f0';
    ctx.fillText(String(me.score | 0), pad, chipY + 26);
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(200,232,224,.6)';
    ctx.fillText(best ? ('best  ' + best) : 'score', pad, chipY + 40);

    ctx.font = '500 12px ui-sans-serif, system-ui, sans-serif';
    var t = now(), i, y = chipY - 10;
    for (i = 0; i < messages.length; i++) {
      var age = t - messages[i].t;
      if (age > 4200) continue;
      ctx.globalAlpha = age > 3200 ? (4200 - age) / 1000 : 1;
      ctx.fillStyle = '#e8f4f0';
      ctx.fillText(messages[i].text, pad, y - i * 16);
      ctx.globalAlpha = 1;
    }

    if (!me.alive) {
      ctx.fillStyle = 'rgba(8,12,14,.5)';
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e8f4f0';
      ctx.font = '700 30px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('Swallowed', w / 2, h / 2 - 18);
      ctx.font = '500 15px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = '#b8d8d0';
      ctx.fillText(killedByName ? ('by ' + killedByName) : 'Back in a moment', w / 2, h / 2 + 10);
      ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = '#8ab0a8';
      ctx.fillText('score  ' + (me.score | 0) + (best ? ('   best  ' + best) : ''), w / 2, h / 2 + 34);
    }
  }

  function drawMini(w, h) {
    if (w < 520) return;
    var s = Math.min(118, Math.max(88, w * 0.09));
    var x = w - s - 14, y = h - s - 14;
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = 'rgba(8,14,16,.62)';
    ctx.strokeStyle = 'rgba(180,255,230,.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, s, s, 8); else ctx.rect(x, y, s, s);
    ctx.fill(); ctx.stroke();
    var k = s / MAP, i;
    ctx.fillStyle = '#5ad4a4';
    for (i = 0; i < viruses.length; i++) {
      ctx.beginPath();
      ctx.arc(x + viruses[i].x * k, y + viruses[i].y * k, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
    if (botsOn) {
      for (i = 0; i < bots.length; i++) {
        if (!bots[i].alive) continue;
        ctx.fillStyle = hsvFill(bots[i].hue, 0.55, 0.9);
        ctx.beginPath();
        ctx.arc(x + bots[i].x * k, y + bots[i].y * k, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (root.Net) {
      var others = root.Net.others(), id;
      for (id in others) {
        if (!others[id].alive) continue;
        var pose = root.Net.poseOf(others[id]);
        ctx.fillStyle = hsvFill(others[id].hue, 0.55, 0.95);
        ctx.beginPath(); ctx.arc(x + pose.x * k, y + pose.y * k, 2.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (me) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x + me.x * k, y + me.y * k, 3.1, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = hsvFill(me.hue, 0.5, 1);
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
    ctx.restore();
  }

  function paintBoard() {
    var el = document.getElementById('board');
    var body = document.getElementById('board-rows');
    if (!el || !body) return;
    var list = roster.length ? roster.slice() : [{ name: me && me.name || 'Player', score: me && me.score || 0, alive: !me || me.alive, me: true }];
    if (me) {
      var ri;
      for (ri = 0; ri < list.length; ri++) if (list[ri].me) {
        list[ri] = { name: list[ri].name, score: me.score, alive: me.alive, me: true };
      }
    }
    if (botsOn) {
      var bi;
      for (bi = 0; bi < bots.length; bi++) {
        if (!bots[bi].alive) continue;
        list.push({ name: bots[bi].name, score: scoreOf(bots[bi].mass), alive: true, me: false });
      }
      list.sort(function (a, b) { return (b.score - a.score) || a.name.localeCompare(b.name); });
    }
    var html = '', i, shown = list.slice(0, 6);
    var meIn = false;
    for (i = 0; i < shown.length; i++) if (shown[i].me) meIn = true;
    if (!meIn && me) shown[shown.length - 1] = { name: me.name, score: me.score, alive: me.alive, me: true };
    for (i = 0; i < shown.length; i++) {
      var r = shown[i];
      html += '<tr class="' + (r.me ? 'me' : '') + (r.alive === false ? ' dead' : '') + '">' +
        '<td class="n">' + escapeHtml(r.name || 'Player') + (r.me ? '  (you)' : '') + '</td>' +
        '<td class="s">' + (r.score || 0) + '</td></tr>';
    }
    body.innerHTML = html;
    el.hidden = !boardOn;
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
    seedViruses();
    hintUntil = now() + 4200;

    var hue = 0.48;
    var name = 'Player';
    if (root.Net) hue = root.Net.tintFor('local');

    function go() {
      if (root.Net && root.Net.me()) {
        var id = root.Net.me();
        name = id.name || 'Player';
        hue = root.Net.tintFor(id.id || 'local');
      }
      try {
        if (root.gifos && root.gifos.db) prefsDb = root.gifos.db('prefs');
      } catch (e) { prefsDb = null; }
      var ready = Promise.resolve();
      if (prefsDb) {
        ready = Promise.resolve(prefsDb.get('best')).then(function (row) {
          if (row && row.n > best) best = row.n | 0;
        }).catch(function () {});
      }
      Promise.resolve(ready).then(function () {
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
        if (root.innerWidth < 520) {
          var hintEl = document.getElementById('hint');
          if (hintEl) hintEl.style.display = 'none';
        }
        paintBoard();
        running = true;
        requestAnimationFrame(frame);
      });
    }

    if (root.Net && root.Net.init) {
      root.Net.init().then(go, function () { go(); });
    } else {
      go();
    }
  }

  root.IOBlobs = {
    coverShot: function () {
      if (!me) return;
      me.x = 1500; me.y = 1500; me.r = 78; me.mass = massOf(78);
      me.score = scoreOf(me.mass); me.alive = true; me.name = me.name || 'You';
      me.facing = -0.35; me.vx = 80; me.vy = -20; me.squash = 0.4;
      cam.x = 1520; cam.y = 1490;
      botsOn = true;
      if (!bots.length) spawnBots();
      bots[0].x = 1648; bots[0].y = 1464; bots[0].r = 28; bots[0].mass = massOf(28);
      bots[0].alive = true; bots[0].name = 'Pip'; bots[0].hue = 0.95;
      if (bots[1]) {
        bots[1].x = 1780; bots[1].y = 1320; bots[1].r = 46; bots[1].mass = massOf(46);
        bots[1].alive = true; bots[1].name = 'Nibbler';
      }
      if (bots[2]) {
        bots[2].x = 1288; bots[2].y = 1688; bots[2].r = 34; bots[2].mass = massOf(34);
        bots[2].alive = true; bots[2].name = 'Drift';
      }
      if (viruses[0]) { viruses[0].x = 1320; viruses[0].y = 1320; }
      var i, f;
      for (i = 0; i < food.length; i++) {
        f = food[i];
        if (Math.hypot(f.x - 1500, f.y - 1500) < 420) f.takenUntil = 0;
      }
      paintBoard();
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
