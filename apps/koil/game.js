/*
 * Koil — the world, the raycaster, items, bombs, particles.
 *
 * Faithful JS port of tsoding/koil's client.c + common.c renderer and
 * simulation (MIT). The original WASM client and its socket to
 * localhost:6970 are gone; this file never opens a socket. Solo walks the
 * map. Other people, if any, arrive through net.js.
 */
(function (root) {
  'use strict';

  var PI = Math.PI;
  var EPS = 1e-6;
  var NEAR = 0.1;
  var FAR = 10;
  var FOV = PI * 0.5;
  var PLAYER_SPEED = 2;
  var PLAYER_SIZE = 0.5;
  var PLAYER_RADIUS = 0.5;
  var BOMB_LIFETIME = 2;
  var BOMB_THROW_VELOCITY = 5;
  var BOMB_GRAVITY = 10;
  var BOMB_DAMP = 0.8;
  var BOMB_SCALE = 0.25;
  var BOMBS_CAPACITY = 20;
  var SPRITE_POOL = 1000;
  var PARTICLE_POOL = 1000;
  var PARTICLE_LIFETIME = 1;
  var PARTICLE_MAX_SPEED = 8;
  var PARTICLE_DAMP = 0.8;
  var PARTICLE_SCALE = 0.05;
  var ITEM_AMP = 0.07;
  var ITEM_FREQ = 0.7;
  var BOMB_PARTICLE_COUNT = 50;
  var SPRITE_ANGLES = 8;
  var FLOOR1 = [0x17, 0x29, 0x29], FLOOR2 = [0x2f, 0x41, 0x41];
  var CEIL1 = [0x29, 0x17, 0x17], CEIL2 = [0x41, 0x2f, 0x2f];

  var MOVING_FORWARD = 0, MOVING_BACKWARD = 1, TURNING_LEFT = 2, TURNING_RIGHT = 3;

  var WALLS_W = 7, WALLS_H = 7;
  // common.c walls[y][x]
  var WALLS = [
    [0, 0, 1, 1, 1, 0, 0],
    [0, 0, 0, 0, 0, 1, 0],
    [1, 0, 0, 0, 0, 1, 0],
    [1, 0, 0, 0, 0, 1, 0],
    [1, 0, 0, 0, 0, 0, 0],
    [0, 1, 1, 1, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0]
  ];

  function properMod(a, b) { return ((a % b) + b) % b; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clampi(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x | 0); }
  function vlen(x, y) { return Math.sqrt(x * x + y * y); }
  function vdist(ax, ay, bx, by) { return vlen(bx - ax, by - ay); }

  function sceneTile(x, y) {
    var ix = Math.floor(x), iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= WALLS_W || iy >= WALLS_H) return false;
    return !!WALLS[iy][ix];
  }

  function rectFits(px, py, sx, sy) {
    var x1 = Math.floor(px - sx * 0.5), x2 = Math.floor(px + sx * 0.5);
    var y1 = Math.floor(py - sy * 0.5), y2 = Math.floor(py + sy * 0.5);
    for (var x = x1; x <= x2; x++) for (var y = y1; y <= y2; y++) {
      if (sceneTile(x, y)) return false;
    }
    return true;
  }

  var me = { id: null, x: 1.5, y: 1.5, dir: 0, moving: 0, hue: 0, name: 'Player' };
  var analog = { mx: 0, my: 0, look: 0 }; // stick + look delta (radians this frame)
  var others = {}; // id -> {x,y,dir,moving,hue,name}
  var items = [
    { kind: 1, alive: true, x: 1.5, y: 3.5 }, // bomb
    { kind: 0, alive: true, x: 2.5, y: 1.5 },
    { kind: 0, alive: true, x: 3.0, y: 1.5 },
    { kind: 0, alive: true, x: 3.5, y: 1.5 },
    { kind: 0, alive: true, x: 4.0, y: 1.5 },
    { kind: 0, alive: true, x: 4.5, y: 1.5 }
  ];
  var bombs = [];
  for (var bi = 0; bi < BOMBS_CAPACITY; bi++) {
    bombs.push({ life: 0, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 });
  }
  var particles = [];
  for (var pi = 0; pi < PARTICLE_POOL; pi++) {
    particles.push({ life: 0, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0 });
  }

  var tex = { wall: null, player: null, bomb: null, key: null, particle: null };
  var W = 480, H = 270;
  var pixels = null, zbuf = null, imageData = null;
  var sprites = [];
  var spriteN = 0;
  var onSound = null; // (kind, px, py, ox, oy)
  var onCollect = null; // (itemIndex, kind)
  var onThrow = null; // (bomb spawn)

  function setSize(w, h) {
    W = w | 0; H = h | 0;
    imageData = new ImageData(W, H);
    pixels = imageData.data;
    zbuf = new Float32Array(W);
  }

  function imgFrom(el) {
    if (!el || !el.naturalWidth) return null;
    var c = document.createElement('canvas');
    c.width = el.naturalWidth; c.height = el.naturalHeight;
    var g = c.getContext('2d');
    g.drawImage(el, 0, 0);
    return { w: c.width, h: c.height, p: g.getImageData(0, 0, c.width, c.height).data };
  }

  function snap(x, dx) {
    if (dx > 0) return Math.ceil(x + Math.sign(dx) * EPS);
    if (dx < 0) return Math.floor(x + Math.sign(dx) * EPS);
    return x;
  }

  function rayStep(p1x, p1y, p2x, p2y) {
    var dx = p2x - p1x, dy = p2y - p1y;
    var p3x = p2x, p3y = p2y;
    if (dx !== 0) {
      var k = dy / dx, c = p1y - k * p1x;
      var x3 = snap(p2x, dx), y3 = x3 * k + c;
      p3x = x3; p3y = y3;
      if (k !== 0) {
        var y3t = snap(p2y, dy), x3t = (y3t - c) / k;
        if (vdist(p2x, p2y, x3t, y3t) < vdist(p2x, p2y, p3x, p3y)) { p3x = x3t; p3y = y3t; }
      }
    } else {
      p3y = snap(p2y, dy); p3x = p2x;
    }
    return { x: p3x, y: p3y };
  }

  function hittingCell(p1x, p1y, p2x, p2y) {
    return { x: Math.floor(p2x + Math.sign(p2x - p1x) * EPS), y: Math.floor(p2y + Math.sign(p2y - p1y) * EPS) };
  }

  function castRay(p1x, p1y, p2x, p2y) {
    var sx = p1x, sy = p1y;
    while (vdist(sx, sy, p1x, p1y) < FAR) {
      var c = hittingCell(p1x, p1y, p2x, p2y);
      if (sceneTile(c.x, c.y)) break;
      var p3 = rayStep(p1x, p1y, p2x, p2y);
      p1x = p2x; p1y = p2y; p2x = p3.x; p2y = p3.y;
    }
    return { x: p2x, y: p2y };
  }

  function cameraFov() {
    var half = FOV * 0.5;
    var fovLen = NEAR / Math.cos(half);
    return {
      lx: me.x + Math.cos(me.dir - half) * fovLen,
      ly: me.y + Math.sin(me.dir - half) * fovLen,
      rx: me.x + Math.cos(me.dir + half) * fovLen,
      ry: me.y + Math.sin(me.dir + half) * fovLen
    };
  }

  function put(x, y, r, g, b, a) {
    var o = (y * W + x) * 4;
    if (a == null || a >= 255) { pixels[o] = r; pixels[o + 1] = g; pixels[o + 2] = b; pixels[o + 3] = 255; return; }
    var t = a / 255, u = 1 - t;
    pixels[o] = pixels[o] * u + r * t;
    pixels[o + 1] = pixels[o + 1] * u + g * t;
    pixels[o + 2] = pixels[o + 2] * u + b * t;
    pixels[o + 3] = 255;
  }

  function floorCeil() {
    var cam = cameraFov();
    var pz = (H / 2) | 0;
    var bp = vlen(cam.lx - me.x, cam.ly - me.y);
    var y, x, sz, ap, b, t1x, t1y, t2x, t2y, t, tx, ty, fog, col, ix, iy, even;
    var nlx = cam.lx - me.x, nly = cam.ly - me.y, ll = vlen(nlx, nly) || 1;
    var nrx = cam.rx - me.x, nry = cam.ry - me.y, rl = vlen(nrx, nry) || 1;
    nlx /= ll; nly /= ll; nrx /= rl; nry /= rl;
    for (y = pz; y < H; y++) {
      sz = H - y - 1;
      ap = pz - sz;
      if (ap === 0) continue;
      b = (bp / ap) * pz / NEAR;
      t1x = nlx * b + me.x; t1y = nly * b + me.y;
      t2x = nrx * b + me.x; t2y = nry * b + me.y;
      for (x = 0; x < W; x++) {
        t = x / W;
        tx = lerp(t1x, t2x, t); ty = lerp(t1y, t2y, t);
        fog = vlen(tx - me.x, ty - me.y);
        ix = Math.floor(tx); iy = Math.floor(ty);
        even = ((ix + iy) & 1) === 0;
        col = even ? FLOOR1 : FLOOR2;
        put(x, y, clampi(col[0] * fog, 0, 255), clampi(col[1] * fog, 0, 255), clampi(col[2] * fog, 0, 255));
        col = even ? CEIL1 : CEIL2;
        put(x, sz, clampi(col[0] * fog, 0, 255), clampi(col[1] * fog, 0, 255), clampi(col[2] * fog, 0, 255));
      }
    }
  }

  function wallColumn(x, px, py, cx, cy, wall) {
    var strip = H / zbuf[x];
    var tdx = px - cx, tdy = py - cy, u;
    if (Math.abs(tdx) < EPS && tdy > 0) u = tdy;
    else if (Math.abs(tdx - 1) < EPS && tdy > 0) u = 1 - tdy;
    else if (Math.abs(tdy) < EPS && tdx > 0) u = 1 - tdx;
    else u = tdx;
    var y1f = (H - strip) * 0.5;
    var y1 = Math.ceil(y1f), y2 = Math.floor(y1f + strip);
    var by1 = Math.max(0, y1), by2 = Math.min(H, y2);
    var ww = wall ? wall.w : 16, wh = wall ? wall.h : 16;
    var tx = Math.floor(u * ww);
    if (tx < 0) tx = 0; if (tx >= ww) tx = ww - 1;
    var sh = wh / strip;
    var shadow = Math.min(1 / zbuf[x] * 4, 1);
    for (var y = by1; y < by2; y++) {
      var ty = Math.floor((y - y1f) * sh);
      if (ty < 0) ty = 0; if (ty >= wh) ty = wh - 1;
      var r = 140, g = 196, b = 176;
      if (wall) {
        var s = (ty * ww + tx) * 4;
        r = wall.p[s]; g = wall.p[s + 1]; b = wall.p[s + 2];
      }
      put(x, y, r, (g * shadow) | 0, (b * shadow) | 0);
    }
  }

  function renderWalls() {
    var cam = cameraFov();
    var dx = Math.cos(me.dir), dy = Math.sin(me.dir);
    for (var x = 0; x < W; x++) {
      var t = x / W;
      var hx = lerp(cam.lx, cam.rx, t), hy = lerp(cam.ly, cam.ry, t);
      var p = castRay(me.x, me.y, hx, hy);
      var c = hittingCell(me.x, me.y, p.x, p.y);
      zbuf[x] = (p.x - me.x) * dx + (p.y - me.y) * dy;
      if (zbuf[x] < NEAR) zbuf[x] = NEAR;
      if (sceneTile(c.x, c.y)) wallColumn(x, p.x, p.y, c.x, c.y, tex.wall);
    }
  }

  function pushSprite(img, x, y, z, scale, cx, cy, cw, ch) {
    if (spriteN >= SPRITE_POOL || !img) return;
    var s = sprites[spriteN];
    if (!s) { s = sprites[spriteN] = {}; }
    s.img = img; s.x = x; s.y = y; s.z = z; s.scale = scale;
    s.cx = cx; s.cy = cy; s.cw = cw; s.ch = ch;
    s.dist = 0; s.pdist = 0; s.t = 0;
    spriteN++;
  }

  function cullSprites() {
    var cam = cameraFov();
    var dirx = Math.cos(me.dir), diry = Math.sin(me.dir);
    var fovx = cam.rx - cam.lx, fovy = cam.ry - cam.ly, fovl = vlen(fovx, fovy) || 1;
    var vis = [];
    for (var i = 0; i < spriteN; i++) {
      var s = sprites[i];
      var spx = s.x - me.x, spy = s.y - me.y, spl = vlen(spx, spy);
      if (spl <= NEAR || spl >= FAR) continue;
      var cos = (spx * dirx + spy * diry) / spl;
      if (cos < 0) continue;
      s.dist = NEAR / cos;
      var nx = (spx / spl) * s.dist + me.x - cam.lx;
      var ny = (spy / spl) * s.dist + me.y - cam.ly;
      var sign = (nx * fovx + ny * fovy) >= 0 ? 1 : -1;
      s.t = vlen(nx, ny) / fovl * sign;
      s.pdist = spx * dirx + spy * diry;
      if (s.pdist < NEAR || s.pdist >= FAR) continue;
      vis.push(s);
    }
    vis.sort(function (a, b) { return b.pdist - a.pdist; });
    return vis;
  }

  function renderSprites(vis) {
    for (var i = 0; i < vis.length; i++) {
      var s = vis[i];
      var cx = W * s.t, cy = H * 0.5;
      var maxS = H / s.pdist, size = maxS * s.scale;
      var x1 = Math.floor(cx - size * 0.5);
      var x2 = Math.floor(x1 + size - 1);
      var bx1 = Math.max(0, x1), bx2 = Math.min(W - 1, x2);
      var y1 = Math.floor(cy + maxS * 0.5 - maxS * s.z);
      var y2 = Math.floor(y1 + size - 1);
      var by1 = Math.max(0, y1), by2 = Math.min(H - 1, y2);
      var img = s.img;
      for (var x = bx1; x <= bx2; x++) {
        if (s.pdist >= zbuf[x]) continue;
        var tx = Math.floor((x - x1) / size * s.cw);
        for (var y = by1; y <= by2; y++) {
          var ty = Math.floor((y - y1) / size * s.ch);
          var src = ((ty + s.cy) * img.w + (tx + s.cx)) * 4;
          var a = img.p[src + 3];
          if (a < 8) continue;
          put(x, y, img.p[src], img.p[src + 1], img.p[src + 2], a);
        }
      }
    }
  }

  function emitParticle(x, y, z) {
    for (var i = 0; i < PARTICLE_POOL; i++) {
      var p = particles[i];
      if (p.life <= 0) {
        p.life = PARTICLE_LIFETIME;
        p.x = x; p.y = y; p.z = z;
        var ang = Math.random() * 2 * PI;
        var mag = PARTICLE_MAX_SPEED * Math.random();
        p.dx = Math.cos(ang) * mag;
        p.dy = Math.sin(ang) * mag;
        p.dz = (Math.random() * 0.5 + 0.5) * mag;
        return;
      }
    }
  }

  function explodeBomb(bx, by, bz) {
    if (onSound) onSound('blast', me.x, me.y, bx, by);
    for (var i = 0; i < BOMB_PARTICLE_COUNT; i++) emitParticle(bx, by, bz);
  }

  function updateParticles(dt) {
    for (var i = 0; i < PARTICLE_POOL; i++) {
      var p = particles[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      p.dz -= BOMB_GRAVITY * dt;
      var nx = p.x + p.dx * dt, ny = p.y + p.dy * dt;
      if (sceneTile(nx, ny)) {
        var dx = Math.abs(Math.floor(p.x) - Math.floor(nx));
        var dy = Math.abs(Math.floor(p.y) - Math.floor(ny));
        if (dx > 0) p.dx *= -1;
        if (dy > 0) p.dy *= -1;
        p.dx *= PARTICLE_DAMP; p.dy *= PARTICLE_DAMP;
      } else { p.x = nx; p.y = ny; }
      var nz = p.z + p.dz * dt;
      if (nz < PARTICLE_SCALE || nz > 1) {
        p.dz *= -1; p.dx *= PARTICLE_DAMP; p.dy *= PARTICLE_DAMP;
      } else p.z = nz;
      if (p.life > 0 && tex.particle) {
        pushSprite(tex.particle, p.x, p.y, p.z, PARTICLE_SCALE, 0, 0, tex.particle.w, tex.particle.h);
      }
    }
  }

  function updateBomb(bomb, dt) {
    var collided = false;
    bomb.life -= dt;
    bomb.dz -= BOMB_GRAVITY * dt;
    var nx = bomb.x + bomb.dx * dt, ny = bomb.y + bomb.dy * dt;
    if (sceneTile(nx, ny)) {
      var dx = Math.abs(Math.floor(bomb.x) - Math.floor(nx));
      var dy = Math.abs(Math.floor(bomb.y) - Math.floor(ny));
      if (dx > 0) bomb.dx *= -1;
      if (dy > 0) bomb.dy *= -1;
      bomb.dx *= BOMB_DAMP; bomb.dy *= BOMB_DAMP; bomb.dz *= BOMB_DAMP;
      if (vlen(bomb.dx, bomb.dy) + Math.abs(bomb.dz) > 1) collided = true;
    } else { bomb.x = nx; bomb.y = ny; }
    var nz = bomb.z + bomb.dz * dt;
    if (nz < BOMB_SCALE || nz > 1) {
      bomb.dz *= -1 * BOMB_DAMP;
      bomb.dx *= BOMB_DAMP; bomb.dy *= BOMB_DAMP;
      if (vlen(bomb.dx, bomb.dy) + Math.abs(bomb.dz) > 1) collided = true;
    } else bomb.z = nz;
    return collided;
  }

  function throwBombAt(x, y, dir) {
    for (var i = 0; i < BOMBS_CAPACITY; i++) {
      var b = bombs[i];
      if (b.life <= 0) {
        b.life = BOMB_LIFETIME;
        b.x = x; b.y = y; b.z = 0.6;
        b.dx = Math.cos(dir) * BOMB_THROW_VELOCITY;
        b.dy = Math.sin(dir) * BOMB_THROW_VELOCITY;
        b.dz = 0.5 * BOMB_THROW_VELOCITY;
        return { i: i, x: b.x, y: b.y, z: b.z, dx: b.dx, dy: b.dy, dz: b.dz, life: b.life };
      }
    }
    return null;
  }

  function spawnRemoteBomb(s) {
    // Find a free slot; do not overwrite a live local bomb.
    for (var i = 0; i < BOMBS_CAPACITY; i++) {
      if (bombs[i].life <= 0) {
        bombs[i].life = s.life != null ? s.life : BOMB_LIFETIME;
        bombs[i].x = s.x; bombs[i].y = s.y; bombs[i].z = s.z;
        bombs[i].dx = s.dx; bombs[i].dy = s.dy; bombs[i].dz = s.dz;
        return;
      }
    }
  }

  function updateBombs(dt) {
    for (var i = 0; i < BOMBS_CAPACITY; i++) {
      var b = bombs[i];
      if (b.life <= 0) continue;
      if (tex.bomb) pushSprite(tex.bomb, b.x, b.y, b.z, BOMB_SCALE, 0, 0, tex.bomb.w, tex.bomb.h);
      if (updateBomb(b, dt) && onSound) onSound('rico', me.x, me.y, b.x, b.y);
      if (b.life <= 0) explodeBomb(b.x, b.y, b.z);
    }
  }

  function updatePlayer(p, dt) {
    var vx = 0, vy = 0, av = 0;
    if (p === me && (analog.mx || analog.my)) {
      // Analog stick: forward/back + strafe, relative to facing.
      var fwd = -analog.my * PLAYER_SPEED, str = analog.mx * PLAYER_SPEED;
      vx = Math.cos(p.dir) * fwd - Math.sin(p.dir) * str;
      vy = Math.sin(p.dir) * fwd + Math.cos(p.dir) * str;
    } else {
      if ((p.moving >> MOVING_FORWARD) & 1) { vx += Math.cos(p.dir) * PLAYER_SPEED; vy += Math.sin(p.dir) * PLAYER_SPEED; }
      if ((p.moving >> MOVING_BACKWARD) & 1) { vx -= Math.cos(p.dir) * PLAYER_SPEED; vy -= Math.sin(p.dir) * PLAYER_SPEED; }
    }
    if ((p.moving >> TURNING_LEFT) & 1) av -= PI;
    if ((p.moving >> TURNING_RIGHT) & 1) av += PI;
    p.dir = properMod(p.dir + av * dt, 2 * PI);
    if (p === me && analog.look) p.dir = properMod(p.dir + analog.look, 2 * PI);
    var nx = p.x + vx * dt;
    if (rectFits(nx, p.y, PLAYER_SIZE, PLAYER_SIZE)) p.x = nx;
    var ny = p.y + vy * dt;
    if (rectFits(p.x, ny, PLAYER_SIZE, PLAYER_SIZE)) p.y = ny;
  }

  function collectMine() {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it.alive) continue;
      if (vdist(me.x, me.y, it.x, it.y) >= PLAYER_RADIUS) continue;
      it.alive = false;
      if (onSound) onSound(it.kind === 0 ? 'key' : 'pickup', me.x, me.y, it.x, it.y);
      if (onCollect) onCollect(i, it.kind);
    }
  }

  function renderItems(time) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it.alive) continue;
      var z = 0.25 + ITEM_AMP - ITEM_AMP * Math.sin(ITEM_FREQ * PI * time + it.x + it.y);
      var img = it.kind === 0 ? tex.key : tex.bomb;
      if (img) pushSprite(img, it.x, it.y, z, 0.25, 0, 0, img.w, img.h);
    }
  }

  function spriteAngle(camx, camy, ent) {
    var TAU = 2 * PI;
    var a = properMod(ent.dir, TAU) - properMod(Math.atan2(ent.y - camy, ent.x - camx), TAU) - PI + PI / 8;
    return (Math.floor(properMod(a, TAU) / TAU * SPRITE_ANGLES)) | 0;
  }

  function renderOthers() {
    if (!tex.player) return;
    for (var id in others) {
      var o = others[id];
      if (!o) continue;
      var idx = spriteAngle(me.x, me.y, o);
      pushSprite(tex.player, o.x, o.y, 1, 1, 55 * idx, 0, 55, 55);
    }
  }

  var KEYS = {
    37: TURNING_LEFT, 39: TURNING_RIGHT, 38: MOVING_FORWARD, 40: MOVING_BACKWARD,
    65: TURNING_LEFT, 68: TURNING_RIGHT, 87: MOVING_FORWARD, 83: MOVING_BACKWARD
  };

  function keyDown(code) {
    var d = KEYS[code];
    if (d != null) { me.moving |= 1 << d; return; }
    if (code === 32) throwNow();
  }
  function keyUp(code) {
    var d = KEYS[code];
    if (d != null) me.moving &= ~(1 << d);
  }

  function throwNow() {
    var spawned = throwBombAt(me.x, me.y, me.dir);
    if (spawned && onThrow) onThrow(spawned);
  }

  function tick(dt, time) {
    analog.look = analog.look || 0;
    updatePlayer(me, dt);
    analog.look = 0;
    collectMine();
    spriteN = 0;
    renderItems(time);
    updateBombs(dt);
    updateParticles(dt);
    renderOthers();
    floorCeil();
    renderWalls();
    renderSprites(cullSprites());
  }

  function loadTextures() {
    tex.wall = imgFrom(document.getElementById('tex-wall'));
    tex.player = imgFrom(document.getElementById('tex-player'));
    tex.bomb = imgFrom(document.getElementById('tex-bomb'));
    tex.key = imgFrom(document.getElementById('tex-key'));
    tex.particle = imgFrom(document.getElementById('tex-particle'));
  }

  function killItem(i) {
    if (items[i]) items[i].alive = false;
  }

  function setOther(id, rec) {
    others[id] = rec;
  }
  function dropOther(id) { delete others[id]; }
  function clearOthers() { others = {}; }

  root.Koil = {
    me: me,
    items: items,
    others: function () { return others; },
    init: function (w, h) { setSize(w, h); loadTextures(); },
    resize: setSize,
    tick: tick,
    imageData: function () { return imageData; },
    width: function () { return W; },
    height: function () { return H; },
    keyDown: keyDown,
    keyUp: keyUp,
    throwNow: throwNow,
    setAnalog: function (mx, my) { analog.mx = mx; analog.my = my; },
    addLook: function (rad) { analog.look += rad; },
    spawnRemoteBomb: spawnRemoteBomb,
    killItem: killItem,
    setOther: setOther,
    dropOther: dropOther,
    clearOthers: clearOthers,
    sceneTile: sceneTile,
    onSound: function (fn) { onSound = fn; },
    onCollect: function (fn) { onCollect = fn; },
    onThrow: function (fn) { onThrow = fn; },
    PLAYER_SIZE: PLAYER_SIZE
  };
})(window);
