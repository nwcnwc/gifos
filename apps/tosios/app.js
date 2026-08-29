/*
 * TOSIOS — a faithful thin rewrite of the gameplay.
 *
 * Upstream is PIXI.js + React talking to a Colyseus GameRoom on Node. The
 * GifOS runtime inlines <script src> and drops type="module", so that stack
 * cannot come along; neither can the Docker/Node server. What is kept is the
 * thing you play: a top-down dungeon, round fighters with a staff, bullets,
 * three hearts, red bottles, bats when you are alone, other people when you
 * are not. Constants (tile 32, player 32, three lives, flask size, fire rate
 * 800 ms, bullet speed 4) are upstream's.
 *
 * Classic IIFE. No fetch, no sockets, no eval.
 */
(function (root) {
  'use strict';

  var TILE = 32;
  var MAP_W = 40, MAP_H = 28;
  var PLAYER_R = 16;
  var PLAYER_SPEED = 90;          // px/s — upstream is 1 px/tick; this is the same walk
  var BULLET_R = 4;
  var BULLET_SPEED = 240;         // 4 px/tick at 60 fps
  var BULLET_RATE = 800;
  var BULLET_LIFE = 1.35;
  var MAX_LIVES = 3;
  var RESPAWN_MS = 2800;
  var MONSTER_R = 14;
  var MONSTER_SPEED = 55;
  var MONSTER_CHASE = 90;
  var MONSTER_SIGHT = 192;
  var MONSTER_LIVES = 3;
  var FLASK_R = 12;
  var WORLD_SEED = 0x705105;      // one dungeon, every client, nothing sent
  var BG = '#25131A';

  var canvas, ctx;
  var tiles;                      // Uint8Array, 1 = wall
  var spawns = [];
  var flasks = [];
  var me = null;
  var bullets = [];
  var monsters = [];
  var particles = [];
  var messages = [];
  var cam = { x: 0, y: 0 };
  var keys = {};
  var pointer = { x: 0, y: 0, down: false, overUi: false };
  var touchMove = { id: null, x: 0, y: 0, kx: 0, ky: 0 };
  var touchAim = { id: null, x: 0, y: 0, ax: 0, ay: 0, firing: false };
  var touchOn = false;
  var lastShot = 0;
  var lastTs = 0;
  var killedBy = null;
  var killedByName = '';
  var flash = 0;
  var batsOn = true;
  var roster = [];
  var scoreOpen = false;
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

  function tileAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return 1;
    return tiles[ty * MAP_W + tx];
  }
  function setTile(tx, ty, v) {
    if (tx > 0 && ty > 0 && tx < MAP_W - 1 && ty < MAP_H - 1) tiles[ty * MAP_W + tx] = v;
  }

  function buildMap() {
    var rng = mulberry(WORLD_SEED);
    tiles = new Uint8Array(MAP_W * MAP_H);
    var i;
    for (i = 0; i < tiles.length; i++) tiles[i] = 1;

    function carveRoom(x, y, w, h) {
      var yy, xx;
      for (yy = 0; yy < h; yy++) for (xx = 0; xx < w; xx++) setTile(x + xx, y + yy, 0);
    }
    function carveH(x0, x1, y) {
      var a = Math.min(x0, x1), b = Math.max(x0, x1), x;
      for (x = a; x <= b; x++) { setTile(x, y, 0); setTile(x, y + 1, 0); }
    }
    function carveV(y0, y1, x) {
      var a = Math.min(y0, y1), b = Math.max(y0, y1), y;
      for (y = a; y <= b; y++) { setTile(x, y, 0); setTile(x + 1, y, 0); }
    }

    var rooms = [];
    for (i = 0; i < 8; i++) {
      var w = 5 + (rng() * 6 | 0), h = 4 + (rng() * 5 | 0);
      var x = 2 + (rng() * (MAP_W - w - 4) | 0);
      var y = 2 + (rng() * (MAP_H - h - 4) | 0);
      carveRoom(x, y, w, h);
      rooms.push({ x: x + (w >> 1), y: y + (h >> 1), x0: x, y0: y, w: w, h: h });
    }
    for (i = 1; i < rooms.length; i++) {
      var a = rooms[i - 1], b = rooms[i];
      if (rng() < 0.5) { carveH(a.x, b.x, a.y); carveV(a.y, b.y, b.x); }
      else { carveV(a.y, b.y, a.x); carveH(a.x, b.x, b.y); }
    }
    for (i = 0; i < 12; i++) {
      var px = 3 + (rng() * (MAP_W - 6) | 0);
      var py = 3 + (rng() * (MAP_H - 6) | 0);
      if (tiles[py * MAP_W + px] !== 0) continue;
      var floor = 0, dx, dy;
      for (dy = -1; dy <= 1; dy++) for (dx = -1; dx <= 1; dx++) {
        if (tiles[(py + dy) * MAP_W + (px + dx)] === 0) floor++;
      }
      if (floor >= 8) setTile(px, py, 1);
    }

    spawns = [];
    for (i = 0; i < rooms.length; i++) {
      spawns.push({ x: (rooms[i].x + 0.5) * TILE, y: (rooms[i].y + 0.5) * TILE });
    }
    flasks = [];
    for (i = 0; i < 3; i++) {
      var r = rooms[(i * 2 + 1) % rooms.length];
      flasks.push({
        id: i + 1,
        x: (r.x0 + 2) * TILE + TILE / 2,
        y: (r.y0 + 2) * TILE + TILE / 2,
        taken: false,
      });
    }
  }

  function blocked(x, y, r) {
    var x0 = Math.floor((x - r) / TILE), x1 = Math.floor((x + r) / TILE);
    var y0 = Math.floor((y - r) / TILE), y1 = Math.floor((y + r) / TILE);
    var tx, ty;
    for (ty = y0; ty <= y1; ty++) for (tx = x0; tx <= x1; tx++) {
      if (tileAt(tx, ty) !== 1) continue;
      var cx = Math.max(tx * TILE, Math.min(x, (tx + 1) * TILE));
      var cy = Math.max(ty * TILE, Math.min(y, (ty + 1) * TILE));
      var dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy < r * r) return true;
    }
    return false;
  }

  function slide(ent, dx, dy, r) {
    var nx = ent.x + dx, ny = ent.y + dy;
    if (!blocked(nx, ny, r)) { ent.x = nx; ent.y = ny; return; }
    if (!blocked(nx, ent.y, r)) { ent.x = nx; return; }
    if (!blocked(ent.x, ny, r)) { ent.y = ny; }
  }

  function pickSpawn() {
    var i, s, best = spawns[0], bestD = -1;
    var others = root.Net && root.Net.others ? root.Net.others() : {};
    for (i = 0; i < spawns.length; i++) {
      s = spawns[i];
      var d = 1e9, id;
      if (me) d = Math.min(d, Math.hypot(s.x - me.x, s.y - me.y));
      for (id in others) {
        var o = others[id];
        d = Math.min(d, Math.hypot(s.x - o.x, s.y - o.y));
      }
      for (id = 0; id < monsters.length; id++) {
        d = Math.min(d, Math.hypot(s.x - monsters[id].x, s.y - monsters[id].y));
      }
      if (d > bestD) { bestD = d; best = s; }
    }
    return { x: best.x, y: best.y };
  }

  function makeMe(name, hue) {
    var s = pickSpawn();
    me = {
      x: s.x, y: s.y, rot: 0, lives: MAX_LIVES, maxLives: MAX_LIVES,
      alive: true, spawn: 1, k: 0, d: 0, name: name || 'Player', hue: hue || 0.05,
      vx: 0, vy: 0, speed: 0,
    };
  }

  function spawnBats() {
    monsters = [];
    var n = 3, i;
    for (i = 0; i < n && i < spawns.length; i++) {
      var s = spawns[spawns.length - 1 - i];
      monsters.push({
        x: s.x, y: s.y, lives: MONSTER_LIVES, rot: 0,
        state: 'patrol', wait: 0.4 + i * 0.3, dir: Math.random() * Math.PI * 2,
        hitCool: 0, flap: i * 0.4,
      });
    }
    batsOn = true;
  }

  function retireBats() {
    if (!batsOn && !monsters.length) return;
    batsOn = false;
    monsters = [];
    note('The bats scatter — other people are here.');
  }

  /* ------------------------------------------------------------------ */
  /* audio (tiny beeps; unlocked on the first gesture)                    */
  /* ------------------------------------------------------------------ */

  function beep(freq, dur, vol, type) {
    try {
      if (!audioCtx) return;
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var o = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      o.type = type || 'square';
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
  /* combat                                                             */
  /* ------------------------------------------------------------------ */

  function fire(from, rot, owner, hue, cosmetic) {
    var dist = PLAYER_R + 12; // PLAYER_WEAPON_SIZE
    bullets.push({
      x: from.x + Math.cos(rot) * dist,
      y: from.y + Math.sin(rot) * dist,
      vx: Math.cos(rot) * BULLET_SPEED,
      vy: Math.sin(rot) * BULLET_SPEED,
      life: BULLET_LIFE,
      owner: owner,
      hue: hue,
      cosmetic: !!cosmetic,
    });
    puff(from.x + Math.cos(rot) * dist, from.y + Math.sin(rot) * dist, hue, 4);
  }

  function tryShoot() {
    if (!me || !me.alive) return;
    var t = now();
    if (t - lastShot < BULLET_RATE) return;
    lastShot = t;
    fire(me, me.rot, 'me', me.hue, false);
    if (root.Net) root.Net.noteShot(me.x, me.y, me.rot);
    beep(520, 0.07, 0.05, 'square');
  }

  function hurtMe(fromId, fromName) {
    if (!me || !me.alive) return;
    me.lives -= 1;
    flash = 1;
    killedBy = fromId || null;
    killedByName = fromName || '';
    beep(180, 0.12, 0.06, 'sawtooth');
    puff(me.x, me.y, 0, 10);
    if (me.lives <= 0) die();
    syncSelf(true);
  }

  function die() {
    me.alive = false;
    me.lives = 0;
    me.d++;
    me.deadAt = now();
    note((killedByName || 'Something') + ' took you down.');
    beep(110, 0.35, 0.07, 'triangle');
    puff(me.x, me.y, me.hue, 18);
    syncSelf(true);
    setTimeout(respawn, RESPAWN_MS);
  }

  function respawn() {
    if (!me) return;
    var s = pickSpawn();
    me.x = s.x; me.y = s.y;
    me.lives = MAX_LIVES;
    me.alive = true;
    me.spawn++;
    killedBy = null;
    killedByName = '';
    flash = 0;
    syncSelf(true);
  }

  function heal() {
    if (!me || !me.alive || me.lives >= MAX_LIVES) return false;
    me.lives++;
    beep(880, 0.1, 0.05, 'sine');
    puff(me.x, me.y, 0.95, 8);
    syncSelf(true);
    return true;
  }

  function puff(x, y, hue, n) {
    var i;
    for (i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 80;
      particles.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.25 + Math.random() * 0.25, hue: hue, r: 2 + Math.random() * 2,
      });
    }
  }

  function note(text) {
    messages.unshift({ text: text, t: now() });
    if (messages.length > 5) messages.pop();
  }

  function syncSelf(force) {
    if (!root.Net) return;
    var took = [];
    var i;
    for (i = 0; i < flasks.length; i++) if (flasks[i].takenByMe) took.push(flasks[i].id);
    root.Net.setSelf({
      lives: me.lives, alive: me.alive, spawn: me.spawn, deaths: me.d,
      took: took,
      killedBy: me.alive ? null : killedBy,
    });
    if (force) root.Net.publish(true);
  }

  /* ------------------------------------------------------------------ */
  /* input                                                              */
  /* ------------------------------------------------------------------ */

  function worldPointer() {
    var dpr = root.devicePixelRatio || 1;
    var sx = (pointer.x * dpr - canvas.width / 2) / dpr + cam.x;
    var sy = (pointer.y * dpr - canvas.height / 2) / dpr + cam.y;
    return { x: sx, y: sy };
  }

  function bindInput() {
    addEventListener('keydown', function (e) {
      keys[e.code] = true;
      if (e.code === 'Tab') { e.preventDefault(); scoreOpen = true; paintScore(); }
      if (e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', function (e) {
      keys[e.code] = false;
      if (e.code === 'Tab') { scoreOpen = false; paintScore(); }
    });
    canvas.addEventListener('pointerdown', function (e) {
      unlockAudio();
      if (e.pointerType === 'touch') return;
      pointer.down = true;
      pointer.x = e.clientX; pointer.y = e.clientY;
    });
    addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      pointer.x = e.clientX; pointer.y = e.clientY;
    });
    addEventListener('pointerup', function (e) {
      if (e.pointerType === 'touch') return;
      pointer.down = false;
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
    var lookEl = document.getElementById('t-look');
    var fireEl = document.getElementById('t-fire');
    var knob = moveEl && moveEl.querySelector('.t-knob');

    function stick(e, pad) {
      var r = pad.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = e.clientX - cx, dy = e.clientY - cy;
      var max = r.width * 0.42, m = Math.hypot(dx, dy) || 1;
      var k = Math.min(1, m / max);
      return { x: (dx / m) * k, y: (dy / m) * k, px: dx, py: dy, max: max };
    }

    if (moveEl) {
      moveEl.addEventListener('pointerdown', function (e) {
        unlockAudio();
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

    if (lookEl) {
      function aimAt(e) {
        pointer.x = e.clientX; pointer.y = e.clientY;
        if (!me) return;
        var w = worldPointer();
        touchAim.rot = Math.atan2(w.y - me.y, w.x - me.x);
      }
      lookEl.addEventListener('pointerdown', function (e) {
        unlockAudio();
        if (touchAim.id !== null) return;
        touchAim.id = e.pointerId;
        touchAim.ax = e.clientX; touchAim.ay = e.clientY;
        touchAim.firing = true;
        aimAt(e);
        capture(lookEl, e.pointerId);
        e.preventDefault();
      });
      lookEl.addEventListener('pointermove', function (e) {
        if (e.pointerId !== touchAim.id) return;
        aimAt(e);
        e.preventDefault();
      });
      var endAim = function (e) {
        if (e.pointerId !== touchAim.id) return;
        touchAim.id = null; touchAim.firing = false;
      };
      lookEl.addEventListener('pointerup', endAim);
      lookEl.addEventListener('pointercancel', endAim);
    }

    if (fireEl) {
      fireEl.addEventListener('pointerdown', function (e) {
        unlockAudio();
        touchAim.firing = true;
        fireEl.classList.add('on');
        e.preventDefault();
      });
      var endFire = function () { touchAim.firing = false; fireEl.classList.remove('on'); };
      fireEl.addEventListener('pointerup', endFire);
      fireEl.addEventListener('pointercancel', endFire);
    }

    var tally = document.getElementById('tally');
    if (tally) {
      tally.addEventListener('click', function () {
        scoreOpen = !scoreOpen;
        paintScore();
      });
    }
  }

  function moveVector() {
    var x = 0, y = 0;
    if (keys.KeyA || keys.ArrowLeft) x -= 1;
    if (keys.KeyD || keys.ArrowRight) x += 1;
    if (keys.KeyW || keys.ArrowUp) y -= 1;
    if (keys.KeyS || keys.ArrowDown) y += 1;
    if (touchOn && touchMove.id !== null) { x += touchMove.x; y += touchMove.y; }
    var m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x: x, y: y };
  }

  /* ------------------------------------------------------------------ */
  /* update                                                             */
  /* ------------------------------------------------------------------ */

  function update(dt) {
    if (!me) return;
    var i, b, m;

    if (me.alive) {
      var mv = moveVector();
      slide(me, mv.x * PLAYER_SPEED * dt, mv.y * PLAYER_SPEED * dt, PLAYER_R);
      me.speed = Math.hypot(mv.x, mv.y) * PLAYER_SPEED;
      if (touchOn && touchAim.id !== null && touchAim.rot != null) {
        me.rot = touchAim.rot;
      } else {
        var w = worldPointer();
        me.rot = Math.atan2(w.y - me.y, w.x - me.x);
      }
      var wantFire = pointer.down || keys.Space || (touchOn && touchAim.firing);
      if (wantFire) tryShoot();

      for (i = 0; i < flasks.length; i++) {
        var f = flasks[i];
        if (f.taken) continue;
        if (Math.hypot(me.x - f.x, me.y - f.y) < PLAYER_R + FLASK_R) {
          if (heal()) {
            f.taken = true;
            f.takenByMe = true;
            syncSelf(true);
          }
        }
      }
    } else {
      me.speed = 0;
    }

    cam.x += (me.x - cam.x) * Math.min(1, dt * 8);
    cam.y += (me.y - cam.y) * Math.min(1, dt * 8);
    clampCam();

    for (i = bullets.length - 1; i >= 0; i--) {
      b = bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.life <= 0 || blocked(b.x, b.y, BULLET_R)) {
        puff(b.x, b.y, b.hue, 3);
        bullets.splice(i, 1);
        continue;
      }
      if (b.cosmetic) continue;
      if (b.owner === 'me') {
        if (root.Net) {
          var others = root.Net.others();
          var id;
          for (id in others) {
            var o = others[id];
            if (!o.alive) continue;
            var pose = root.Net.poseOf(o);
            if (Math.hypot(b.x - pose.x, b.y - pose.y) < PLAYER_R + BULLET_R) {
              root.Net.claimHit(o.id, o.spawn);
              puff(b.x, b.y, o.hue, 8);
              bullets.splice(i, 1);
              beep(740, 0.05, 0.04, 'square');
              b = null;
              break;
            }
          }
          if (!b) continue;
        }
        for (m = monsters.length - 1; m >= 0; m--) {
          var mon = monsters[m];
          if (Math.hypot(b.x - mon.x, b.y - mon.y) < MONSTER_R + BULLET_R) {
            mon.lives--;
            puff(b.x, b.y, 0.85, 8);
            bullets.splice(i, 1);
            beep(640, 0.05, 0.04, 'square');
            if (mon.lives <= 0) {
              puff(mon.x, mon.y, 0.85, 14);
              monsters.splice(m, 1);
              me.k++;
              note('Bat down.');
            }
            b = null;
            break;
          }
        }
      }
    }

    if (batsOn && me.alive) {
      for (i = 0; i < monsters.length; i++) updateBat(monsters[i], dt);
    }

    for (i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      p.vx *= 0.92; p.vy *= 0.92;
      if (p.life <= 0) particles.splice(i, 1);
    }
    if (flash > 0) flash = Math.max(0, flash - dt * 3);

    if (root.Net) {
      if (root.Net.count() > 1) retireBats();
      root.__TOSIOS_POSE__ = function () {
        return { x: me.x, y: me.y, rot: me.rot, speed: me.speed };
      };
      syncSelf(false);
      root.Net.tick();
    }
  }

  function updateBat(bat, dt) {
    bat.flap += dt * 8;
    bat.hitCool = Math.max(0, bat.hitCool - dt);
    var dist = Math.hypot(me.x - bat.x, me.y - bat.y);
    if (dist < MONSTER_SIGHT && me.alive) {
      bat.state = 'chase';
      bat.rot = Math.atan2(me.y - bat.y, me.x - bat.x);
      slide(bat, Math.cos(bat.rot) * MONSTER_CHASE * dt, Math.sin(bat.rot) * MONSTER_CHASE * dt, MONSTER_R);
      if (dist < PLAYER_R + MONSTER_R && bat.hitCool <= 0) {
        bat.hitCool = 0.8;
        hurtMe(null, 'a bat');
      }
    } else {
      bat.wait -= dt;
      if (bat.wait <= 0) {
        bat.dir = Math.random() * Math.PI * 2;
        bat.wait = 1 + Math.random() * 2;
      }
      bat.rot = bat.dir;
      slide(bat, Math.cos(bat.dir) * MONSTER_SPEED * dt, Math.sin(bat.dir) * MONSTER_SPEED * dt, MONSTER_R);
    }
  }

  /* ------------------------------------------------------------------ */
  /* draw                                                               */
  /* ------------------------------------------------------------------ */

  function hsvFill(h, s, v) {
    var i6 = Math.floor(h * 6) % 6, f = h * 6 - Math.floor(h * 6);
    var p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    var m = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i6];
    return 'rgb(' + ((m[0] * 255) | 0) + ',' + ((m[1] * 255) | 0) + ',' + ((m[2] * 255) | 0) + ')';
  }

  /*
   * Hold the camera inside the dungeon.
   *
   * It followed the player with no bound, and draw() clamps its tile loop to
   * the map, so standing anywhere near an edge put raw background on screen —
   * measured at 1100x788 against a 40x28 tile map (1280x896 world px), a third
   * of the frame was empty black to the right of the last column, with the
   * player walking along the edge of nothing. On a viewport wider or taller
   * than the world the camera centres on it instead, which is the only way a
   * short window can avoid showing void on both sides at once.
   */
  function clampCam() {
    var dpr = root.devicePixelRatio || 1;
    var w = canvas.width / dpr, h = canvas.height / dpr;
    var worldW = MAP_W * TILE, worldH = MAP_H * TILE;
    cam.x = worldW <= w ? worldW / 2 : Math.max(w / 2, Math.min(worldW - w / 2, cam.x));
    cam.y = worldH <= h ? worldH / 2 : Math.max(h / 2, Math.min(worldH - h / 2, cam.y));
  }

  function draw() {
    var dpr = root.devicePixelRatio || 1;
    var w = canvas.width / dpr, h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2 - cam.x, h / 2 - cam.y);

    var x0 = Math.max(0, Math.floor((cam.x - w / 2) / TILE) - 1);
    var y0 = Math.max(0, Math.floor((cam.y - h / 2) / TILE) - 1);
    var x1 = Math.min(MAP_W - 1, Math.floor((cam.x + w / 2) / TILE) + 1);
    var y1 = Math.min(MAP_H - 1, Math.floor((cam.y + h / 2) / TILE) + 1);
    var tx, ty;
    for (ty = y0; ty <= y1; ty++) for (tx = x0; tx <= x1; tx++) {
      var t = tileAt(tx, ty);
      var px = tx * TILE, py = ty * TILE;
      if (t === 1) {
        ctx.fillStyle = (tx + ty) % 2 ? '#3a1f28' : '#321a22';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = 'rgba(0,0,0,.28)';
        ctx.fillRect(px, py + TILE - 6, TILE, 6);
        ctx.fillStyle = 'rgba(255,220,200,.06)';
        ctx.fillRect(px, py, TILE, 3);
      } else {
        var n = ((tx * 13 + ty * 7) % 5);
        ctx.fillStyle = n === 0 ? '#4a2a32' : '#42242c';
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = 'rgba(0,0,0,.12)';
        ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
      }
    }

    var i;
    for (i = 0; i < flasks.length; i++) if (!flasks[i].taken) drawFlask(flasks[i]);
    for (i = 0; i < monsters.length; i++) drawBat(monsters[i]);

    if (root.Net) {
      var others = root.Net.others();
      var id;
      for (id in others) {
        var o = others[id];
        var pose = root.Net.poseOf(o);
        drawFighter(pose.x, pose.y, pose.rot, o.hue, o.name, o.lives, o.alive, false);
      }
    }

    if (me) drawFighter(me.x, me.y, me.rot, me.hue, me.name, me.lives, me.alive, true);

    for (i = 0; i < bullets.length; i++) drawBullet(bullets[i]);
    for (i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.max(0, p.life * 3);
      ctx.fillStyle = hsvFill(p.hue, 0.4, 1);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    if (flash > 0) {
      ctx.fillStyle = 'rgba(180,30,40,' + (flash * 0.35) + ')';
      ctx.fillRect(0, 0, w, h);
    }

    drawHud(w, h);
  }

  function drawFlask(f) {
    var x = f.x, y = f.y;
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(x, y + 10, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6a1020';
    ctx.beginPath(); ctx.moveTo(x - 6, y + 6); ctx.lineTo(x + 6, y + 6); ctx.lineTo(x + 4, y - 4); ctx.lineTo(x - 4, y - 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e04050';
    ctx.beginPath(); ctx.moveTo(x - 4, y + 4); ctx.lineTo(x + 4, y + 4); ctx.lineTo(x + 3, y - 2); ctx.lineTo(x - 3, y - 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c8a070';
    ctx.fillRect(x - 3, y - 8, 6, 5);
    ctx.fillStyle = '#f0d090';
    ctx.fillRect(x - 4, y - 10, 8, 3);
  }

  function drawBat(bat) {
    var flap = Math.sin(bat.flap) * 7;
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(bat.x, bat.y + 12, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1018';
    ctx.beginPath();
    ctx.moveTo(bat.x, bat.y);
    ctx.quadraticCurveTo(bat.x - 16, bat.y - 4 + flap, bat.x - 20, bat.y + 6);
    ctx.quadraticCurveTo(bat.x - 8, bat.y + 2, bat.x, bat.y + 4);
    ctx.quadraticCurveTo(bat.x + 8, bat.y + 2, bat.x + 20, bat.y + 6);
    ctx.quadraticCurveTo(bat.x + 16, bat.y - 4 + flap, bat.x, bat.y);
    ctx.fill();
    ctx.fillStyle = '#2c1c28';
    ctx.beginPath(); ctx.arc(bat.x, bat.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e04050';
    ctx.beginPath(); ctx.arc(bat.x - 2.5, bat.y - 1, 1.4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(bat.x + 2.5, bat.y - 1, 1.4, 0, Math.PI * 2); ctx.fill();
  }

  function drawFighter(x, y, rot, hue, name, lives, alive, isMe) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.beginPath(); ctx.ellipse(0, 14, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
    if (!alive) {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#3a3034';
      ctx.beginPath(); ctx.arc(0, 4, PLAYER_R - 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return;
    }
    var body = hsvFill(hue, isMe ? 0.15 : 0.45, isMe ? 0.95 : 0.88);
    var outline = hsvFill(hue, 0.4, 0.35);
    ctx.rotate(rot);
    // staff (behind if aiming left-ish is handled by rotate)
    ctx.strokeStyle = '#6a4a30';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(6, 2); ctx.lineTo(PLAYER_R + 14, 0); ctx.stroke();
    ctx.fillStyle = hsvFill(hue, 0.6, 1);
    ctx.beginPath(); ctx.arc(PLAYER_R + 14, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(-rot);
    ctx.fillStyle = outline;
    ctx.beginPath(); ctx.arc(0, 0, PLAYER_R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(0, 0, PLAYER_R - 2.5, 0, Math.PI * 2); ctx.fill();
    // eyes looking along rot
    var ex = Math.cos(rot) * 5, ey = Math.sin(rot) * 5;
    ctx.fillStyle = '#1a1014';
    ctx.beginPath(); ctx.arc(ex - Math.sin(rot) * 4.5, ey + Math.cos(rot) * 4.5, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + Math.sin(rot) * 4.5, ey - Math.cos(rot) * 4.5, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(10,6,8,.7)';
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(name || 'Player', x, y - PLAYER_R - 14);
    ctx.fillStyle = isMe ? '#f4e8c8' : '#e8dcc8';
    ctx.fillText(name || 'Player', x, y - PLAYER_R - 15);

    var hearts = lives | 0, hx = x - 10, hy = y - PLAYER_R - 6, hi;
    for (hi = 0; hi < MAX_LIVES; hi++) {
      ctx.fillStyle = hi < hearts ? '#e04050' : '#3a2028';
      heart(hx + hi * 11, hy, 4.2);
    }
  }

  function heart(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.3);
    ctx.bezierCurveTo(x, y - s * 0.4, x - s, y - s * 0.4, x - s, y + s * 0.15);
    ctx.bezierCurveTo(x - s, y + s * 0.7, x, y + s * 1.15, x, y + s * 1.35);
    ctx.bezierCurveTo(x, y + s * 1.15, x + s, y + s * 0.7, x + s, y + s * 0.15);
    ctx.bezierCurveTo(x + s, y - s * 0.4, x, y - s * 0.4, x, y + s * 0.3);
    ctx.fill();
  }

  function drawBullet(b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.fillStyle = 'rgba(255,220,140,.35)';
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffe9a0';
    ctx.beginPath(); ctx.arc(0, 0, BULLET_R, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawHud(w, h) {
    if (!me) return;
    var i;
    ctx.save();
    ctx.translate(14, 14);
    for (i = 0; i < MAX_LIVES; i++) {
      ctx.fillStyle = i < me.lives ? '#e04050' : '#3a2028';
      heart(10 + i * 22, 8, 9);
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(244,232,200,.85)';
    ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'right';
    var n = root.Net && root.Net.live() ? root.Net.count() : 1;
    ctx.fillText(n <= 1 ? 'alone in the dungeon' : n + ' in the dungeon', w - 16, 26);

    ctx.textAlign = 'left';
    ctx.font = '500 12px ui-sans-serif, system-ui, sans-serif';
    var t = now();
    for (i = 0; i < messages.length; i++) {
      var age = t - messages[i].t;
      if (age > 4500) continue;
      ctx.globalAlpha = age > 3500 ? (4500 - age) / 1000 : 1;
      ctx.fillStyle = '#f4e8c8';
      ctx.fillText(messages[i].text, 14, h - 18 - i * 18);
      ctx.globalAlpha = 1;
    }

    if (!me.alive) {
      ctx.fillStyle = 'rgba(10,6,8,.45)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f4e8c8';
      ctx.textAlign = 'center';
      ctx.font = '700 28px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('Down', w / 2, h / 2 - 8);
      ctx.font = '500 14px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = '#c8b8a0';
      ctx.fillText('Back in a moment', w / 2, h / 2 + 18);
    }
  }

  function paintScore() {
    var el = document.getElementById('score');
    var body = document.getElementById('score-rows');
    var tally = document.getElementById('tally');
    if (!el || !body) return;
    var list = roster.length ? roster.slice() : [{ name: me && me.name || 'Player', k: me && me.k || 0, d: me && me.d || 0, alive: !me || me.alive, me: true }];
    if (me) {
      var ri;
      for (ri = 0; ri < list.length; ri++) if (list[ri].me) {
        list[ri] = { id: list[ri].id, name: list[ri].name, k: Math.max(list[ri].k || 0, me.k), d: Math.max(list[ri].d || 0, me.d), lives: me.lives, alive: me.alive, me: true };
      }
    }
    var html = '<tr><th></th><th>K</th><th>D</th></tr>';
    var i;
    for (i = 0; i < list.length; i++) {
      var r = list[i];
      html += '<tr class="' + (r.me ? 'me' : '') + (r.alive === false ? ' dead' : '') + '">' +
        '<td>' + escapeHtml(r.name || 'Player') + (r.me ? '  (you)' : '') + '</td>' +
        '<td class="k">' + (r.k || 0) + '</td>' +
        '<td class="d">' + (r.d || 0) + '</td></tr>';
    }
    body.innerHTML = html;
    el.hidden = !scoreOpen;
    if (tally) {
      var n = list.length;
      tally.hidden = n < 2 && !touchOn;
      tally.textContent = n < 2 ? 'scores' : n + ' · tab for scores';
    }
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
    ctx.imageSmoothingEnabled = false;
    resize();
    addEventListener('resize', resize);
    buildMap();

    var hue = 0.05;
    var name = 'Player';
    if (root.Net) hue = root.Net.tintFor('local');

    function go(list) {
      if (root.Net && root.Net.me()) {
        var id = root.Net.me();
        name = id.name || 'Player';
        hue = root.Net.tintFor(id.id || 'local');
      }
      makeMe(name, hue);
      cam.x = me.x; cam.y = me.y; clampCam();
      if (root.Net && root.Net.count() > 1) { batsOn = false; monsters = []; }
      else spawnBats();

      root.__TOSIOS_POSE__ = function () {
        return { x: me.x, y: me.y, rot: me.rot, speed: me.speed };
      };

      if (root.Net) {
        root.Net.onHit(function (d, fromId, fromName) { hurtMe(fromId, fromName); });
        root.Net.onKill(function (victim) { note('You took down ' + victim + '.'); beep(980, 0.12, 0.05, 'square'); });
        root.Net.onRoster(function (r) { roster = r; paintScore(); });
        root.Net.onShot(function (id, x, y, a, hue2) { fire({ x: x, y: y }, a, id, hue2, true); });
        root.Net.onTook(function (taken) {
          var i;
          for (i = 0; i < flasks.length; i++) {
            if (taken[flasks[i].id]) flasks[i].taken = true;
          }
        });
        syncSelf(true);
      }
      bindInput();
      paintScore();
      running = true;
      requestAnimationFrame(frame);
    }

    if (root.Net && root.Net.init) {
      root.Net.init().then(go, function () { go([]); });
    } else {
      go([]);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
