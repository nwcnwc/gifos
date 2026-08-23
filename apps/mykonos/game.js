/* Walk the island. Orbit camera. Static world is cached per yaw. */
(function (root) {
  'use strict';

  var W = root.MykWorld;
  var VW = 16;
  var VH = 16;
  var SPEED = 2.15;
  var R = 0.28;

  var canvas, ctx;
  var world = null;
  var px = 7.5, py = 7.5, pYaw = 0;
  var moving = 0;
  var camYaw = 0.55;
  var camPitch = 0.42;
  var zoom = 1.15;
  var analog = { x: 0, y: 0 };
  var keys = {};
  var others = [];
  var clock = 0;
  var cache = { yaw: 1e9, pitch: 1e9, canvas: null, ox: 0, oy: 0 };
  var originX = (W.GW * W.VPT) / 2;
  var originY = (W.GH * W.VPT) / 2;

  function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }

  function project(vx, vy, vz, yaw, pitch) {
    var dx = vx - originX, dy = vy - originY;
    var c = Math.cos(yaw), s = Math.sin(yaw);
    var rx = dx * c - dy * s;
    var ry = dx * s + dy * c;
    var flat = 0.22 + pitch * 0.55;
    return {
      sx: (rx - ry) * (VW / 2),
      sy: (rx + ry) * (VW / 4) * flat - vz * VH * (0.55 + pitch * 0.7),
      depth: rx + ry + vz * 0.15
    };
  }

  function rgb(r, g, b) {
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }
  function shade(r, g, b, a) {
    if (a >= 0) return [r + (255 - r) * a, g + (255 - g) * a, b + (255 - b) * a];
    return [r * (1 + a), g * (1 + a), b * (1 + a)];
  }

  function drawVoxel(g, ax, ay, r, gv, b, s) {
    var hw = VW * s / 2, qw = VW * s / 4, h = VH * s;
    var t = shade(r, gv, b, 0.2);
    var l = shade(r, gv, b, -0.22);
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(ax + hw, ay + qw);
    g.lineTo(ax, ay + hw);
    g.lineTo(ax - hw, ay + qw);
    g.closePath();
    g.fillStyle = rgb(t[0], t[1], t[2]);
    g.fill();
    g.beginPath();
    g.moveTo(ax + hw, ay + qw);
    g.lineTo(ax + hw, ay + qw + h);
    g.lineTo(ax, ay + hw + h);
    g.lineTo(ax, ay + hw);
    g.closePath();
    g.fillStyle = rgb(r, gv, b);
    g.fill();
    g.beginPath();
    g.moveTo(ax - hw, ay + qw);
    g.lineTo(ax - hw, ay + qw + h);
    g.lineTo(ax, ay + hw + h);
    g.lineTo(ax, ay + hw);
    g.closePath();
    g.fillStyle = rgb(l[0], l[1], l[2]);
    g.fill();
  }

  function sortedWorld(yaw, pitch) {
    var list = world.voxels.slice();
    var i, v, p;
    for (i = 0; i < list.length; i++) {
      v = list[i];
      p = project(v.x, v.y, v.z, yaw, pitch);
      v._sx = p.sx; v._sy = p.sy; v._d = p.depth;
    }
    list.sort(function (a, b) { return a._d - b._d; });
    return list;
  }

  function worldBounds(list) {
    var i, minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9, v;
    for (i = 0; i < list.length; i++) {
      v = list[i];
      if (v._sx < minX) minX = v._sx;
      if (v._sy < minY) minY = v._sy;
      if (v._sx > maxX) maxX = v._sx;
      if (v._sy > maxY) maxY = v._sy;
    }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  function rebuildCache() {
    var list = sortedWorld(camYaw, camPitch);
    var b = worldBounds(list);
    var pad = VW + VH + 8;
    var w = Math.ceil(b.maxX - b.minX + pad * 2);
    var h = Math.ceil(b.maxY - b.minY + pad * 2 + VH);
    var off = document.createElement('canvas');
    off.width = Math.max(8, w);
    off.height = Math.max(8, h);
    var g = off.getContext('2d');
    var ox = -b.minX + pad, oy = -b.minY + pad;
    var i, v;
    for (i = 0; i < list.length; i++) {
      v = list[i];
      drawVoxel(g, ox + v._sx, oy + v._sy, v.r, v.g, v.b, 1);
    }
    cache.yaw = camYaw;
    cache.pitch = camPitch;
    cache.canvas = off;
    cache.ox = ox;
    cache.oy = oy;
  }

  function tryMove(nx, ny) {
    if (!W.blocked(world.occ, nx, py) && !W.blocked(world.occ, nx - R, py) &&
        !W.blocked(world.occ, nx + R, py)) px = nx;
    if (!W.blocked(world.occ, px, ny) && !W.blocked(world.occ, px, ny - R) &&
        !W.blocked(world.occ, px, ny + R)) py = ny;
  }

  function walk(dt) {
    var ax = analog.x, ay = analog.y;
    if (keys[87] || keys[38]) ay -= 1;
    if (keys[83] || keys[40]) ay += 1;
    if (keys[65] || keys[37]) ax -= 1;
    if (keys[68] || keys[39]) ax += 1;
    if (keys[81]) camYaw -= dt * 1.1;
    if (keys[69]) camYaw += dt * 1.1;
    var len = Math.hypot(ax, ay);
    if (len > 1) { ax /= len; ay /= len; len = 1; }
    moving = len > 0.08 ? 1 : 0;
    if (!moving) return;
    var c = Math.cos(camYaw), s = Math.sin(camYaw);
    /* yaw=0 iso: screen-up is world (-1,-1). Orbit rotates that. */
    var fx = -c - s, fy = s - c;
    var fl = Math.hypot(fx, fy) || 1;
    fx /= fl; fy /= fl;
    var rx = c - s, ry = -s - c;
    var rl = Math.hypot(rx, ry) || 1;
    rx /= rl; ry /= rl;
    var vx = (-ay * fx + ax * rx) * SPEED * dt;
    var vy = (-ay * fy + ax * ry) * SPEED * dt;
    tryMove(px + vx, py + vy);
    pYaw = Math.atan2(vy, vx);
  }

  function personList(x, y, tint, mv, t) {
    return W.person(x * W.VPT, y * W.VPT, 1, tint, mv, t);
  }

  function drawPeople(g, cx, cy, scale) {
    var list = personList(px, py, [250, 248, 236], moving, clock);
    var i, o, j, v, p;
    for (i = 0; i < others.length; i++) {
      o = others[i];
      list = list.concat(personList(o.x, o.y, o.tint, o.mv, clock));
    }
    for (j = 0; j < list.length; j++) {
      v = list[j];
      p = project(v.x, v.y, v.z, camYaw, camPitch);
      v._sx = p.sx; v._sy = p.sy; v._d = p.depth;
    }
    list.sort(function (a, b) { return a._d - b._d; });
    for (j = 0; j < list.length; j++) {
      v = list[j];
      drawVoxel(g, cx + v._sx * scale, cy + v._sy * scale, v.r, v.g, v.b, scale);
    }
  }

  function paintSky() {
    var w = canvas.width, h = canvas.height;
    var grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#8ec8ee');
    grd.addColorStop(0.48, '#3a86c8');
    grd.addColorStop(0.62, '#1b5ba8');
    grd.addColorStop(1, '#4da8c4');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  }

  function draw(dt) {
    clock += dt;
    walk(dt);
    if (!cache.canvas ||
        Math.abs(cache.yaw - camYaw) > 0.012 ||
        Math.abs(cache.pitch - camPitch) > 0.012) {
      rebuildCache();
    }
    var w = canvas.width, h = canvas.height;
    paintSky();
    var me = project(px * W.VPT, py * W.VPT, 2, camYaw, camPitch);
    var scale = zoom;
    var cx = w / 2 - me.sx * scale;
    var cy = h * 0.58 - me.sy * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      cache.canvas,
      cx - cache.ox * scale,
      cy - cache.oy * scale,
      cache.canvas.width * scale,
      cache.canvas.height * scale
    );
    drawPeople(ctx, cx, cy, scale);
  }

  function resize() {
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.floor(root.innerWidth * dpr));
    canvas.height = Math.max(1, Math.floor(root.innerHeight * dpr));
  }

  function init(el) {
    canvas = el;
    ctx = canvas.getContext('2d');
    world = W.seed();
    px = world.spawn.x;
    py = world.spawn.y;
    resize();
    rebuildCache();
    root.addEventListener('keydown', function (e) {
      keys[e.keyCode] = 1;
      if (e.keyCode === 32) e.preventDefault();
    });
    root.addEventListener('keyup', function (e) { keys[e.keyCode] = 0; });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      zoomBy(e.deltaY > 0 ? 0.92 : 1.08);
    }, { passive: false });
    var drag = null;
    canvas.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') return;
      drag = { x: e.clientX, y: e.clientY };
      canvas.classList.add('drag');
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag) return;
      orbit(e.clientX - drag.x, e.clientY - drag.y);
      drag.x = e.clientX; drag.y = e.clientY;
    });
    function endDrag() { drag = null; canvas.classList.remove('drag'); }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    return world;
  }

  function orbit(dx, dy) {
    camYaw += dx * 0.006;
    camPitch = clamp(camPitch - dy * 0.004, 0.18, 0.72);
  }
  function zoomBy(f) { zoom = clamp(zoom * f, 0.55, 2.2); }
  function setAnalog(x, y) { analog.x = x; analog.y = y; }
  function setOthers(list) { others = list || []; }
  function pose() {
    return { x: px, y: py, yaw: pYaw, mv: moving };
  }
  function setPose(x, y) {
    if (x != null) px = x;
    if (y != null) py = y;
  }

  root.Myk = {
    init: init,
    draw: draw,
    resize: resize,
    orbit: orbit,
    zoomBy: zoomBy,
    setAnalog: setAnalog,
    setOthers: setOthers,
    pose: pose,
    setPose: setPose,
    world: function () { return world; }
  };
})(window);
