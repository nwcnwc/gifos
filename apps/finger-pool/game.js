/* Finger Pool table: the flick from victorqribeiro/fingerPool main.js, a
 * 2:1 letterboxed felt so two devices share one shape. Sphere.js reads
 * the globals w, h, c, r, TWOPI — they stay at top level on purpose. */
var TWOPI = Math.PI * 2;
var w = 800, h = 400, c = null, r = 28;
var spheres = [], holes = [];

(function (root) {
  'use strict';

  var WHITE = 'hsl(360, 100%, 100%)';
  var STILL = 0.08;
  var SETTLE_FRAMES = 8;

  var ox = 0, oy = 0, cssW = 800, cssH = 400, dpr = 1;
  var moving = false;
  var stillFrames = 0;
  var pottedThisShot = 0;
  var shots = 0;
  var seq = 0;
  var score = 0;
  var holding = null;
  var onHit = null;
  var onHole = null;

  function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }

  /* Upstream: l = -max(distance / dt * 12, 7) */
  function impulseOf(dist, dt) {
    if (!(dt > 0)) dt = 1;
    return -Math.max(dist / dt * 12, 7);
  }

  function radiusOf(W, H) {
    var v = Math.floor(Math.min(W, H) * 0.07);
    return clamp(v, 16, 36);
  }

  function isWhite(s) { return s && s.c === WHITE; }

  function coloredLeft() {
    var n = 0, i;
    for (i = 0; i < spheres.length; i++) {
      if (!isWhite(spheres[i]) && !spheres[i].isGone) n++;
    }
    return n;
  }

  function createSpheres() {
    spheres = [];
    var index = 0, i, j, posx, posy;
    for (i = 0; i < 5; i++) {
      for (j = 0; j < i + 1; j++) {
        posx = w / 2 - i * r * 2 - w / 5;
        posy = h / 2 - j * r * 2 + (i * r);
        if (h > w) {
          posx = w / 2 - j * r * 2 + (i * r);
          posy = h / 2 - i * r * 2 - h / 5;
        }
        spheres.push(new Sphere(posx, posy, r, 'hsl(' + (index++ * (360 / 15)) + ', 100%, 50%)', '3d', index));
      }
    }
    spheres.push(
      h > w
        ? new Sphere(w / 2, h / 2 + h / 3, r, WHITE)
        : new Sphere(w / 2 + w / 3, h / 2, r, WHITE)
    );
  }

  function createHoles() {
    var hr = r + r * 0.2;
    holes = [
      new Sphere(r / 2, r / 2, hr, 'black', '2d'),
      new Sphere(w - r / 2, r / 2, hr, 'black', '2d'),
      new Sphere(r / 2, h - r / 2, hr, 'black', '2d'),
      new Sphere(w - r / 2, h - r / 2, hr, 'black', '2d')
    ];
    if (w >= h) {
      holes = holes.concat([
        new Sphere(w / 2, 0, hr, 'black', '2d'),
        new Sphere(w / 2, h, hr, 'black', '2d')
      ]);
    } else {
      holes = holes.concat([
        new Sphere(0, h / 2, hr, 'black', '2d'),
        new Sphere(w, h / 2, hr, 'black', '2d')
      ]);
    }
  }

  function resetWhite(s) {
    if (h > w) s.pos.set(w / 2, h / 2 + h / 3);
    else s.pos.set(w / 2 + w / 3, h / 2);
    s.vel.set(0, 0);
    s.acc.set(0, 0);
    s.isGone = false;
  }

  function stillNow() {
    var i, s;
    for (i = 0; i < spheres.length; i++) {
      s = spheres[i];
      if (s.vel.getLength() > STILL) return false;
      if (s.acc.getLength() > 0.01) return false;
    }
    return true;
  }

  function step() {
    var i, j, d, s;
    for (i = 0; i < spheres.length; i++) spheres[i].update();
    for (i = 0; i < spheres.length - 1; i++) {
      for (j = i + 1; j < spheres.length; j++) {
        d = spheres[i].collideSphere(spheres[j]);
        if (d) {
          if (onHit) onHit(d);
        }
      }
    }
    for (i = spheres.length - 1; i >= 0; i--) {
      s = spheres[i];
      for (j = 0; j < holes.length; j++) {
        if (s.collideHole(holes[j])) {
          if (onHole) onHole(s);
        }
      }
      if (s.isGone) {
        if (isWhite(s)) resetWhite(s);
        else {
          pottedThisShot += 1;
          spheres.splice(i, 1);
        }
      }
    }
    if (stillNow()) {
      stillFrames += 1;
      if (stillFrames > SETTLE_FRAMES) moving = false;
    } else {
      stillFrames = 0;
    }
  }

  function pick(x, y) {
    var i, s;
    for (i = 0; i < spheres.length; i++) {
      s = spheres[i];
      if ((s.pos.x - x) * (s.pos.x - x) + (s.pos.y - y) * (s.pos.y - y) < s.r * s.r) return s;
    }
    return null;
  }

  function grab(x, y) {
    if (moving) return null;
    holding = pick(x, y);
    return holding;
  }

  function flick(sx, sy, ex, ey, dt) {
    var s = holding || pick(sx, sy);
    var a, dist, l;
    if (moving || !s) {
      holding = null;
      return false;
    }
    a = Math.atan2(sy - ey, sx - ex);
    dist = Math.sqrt((sx - ex) * (sx - ex) + (sy - ey) * (sy - ey));
    l = impulseOf(dist, dt);
    s.acc = new Vec2(Math.cos(a) * l, Math.sin(a) * l);
    holding = null;
    moving = true;
    stillFrames = 0;
    pottedThisShot = 0;
    seq += 1;
    return true;
  }

  function dropGrab() { holding = null; }

  function reset() {
    r = radiusOf(w, h);
    createSpheres();
    createHoles();
    moving = false;
    stillFrames = 0;
    pottedThisShot = 0;
    shots = 0;
    seq = 0;
    score = 0;
    holding = null;
  }

  function layout(canvas, W, H) {
    var tw, th, oldW, oldH, sx, sy, i, pw, ph;
    dpr = (root.devicePixelRatio || 1);
    cssW = W;
    cssH = H;
    tw = W;
    th = W * 0.5;
    if (th > H * 0.88) {
      th = H * 0.88;
      tw = th * 2;
    }
    ox = (W - tw) / 2;
    oy = (H - th) / 2;
    oldW = w;
    oldH = h;
    w = tw;
    h = th;
    r = radiusOf(w, h);
    pw = Math.round(W * dpr);
    ph = Math.round(H * dpr);
    if (canvas && (canvas.width !== pw || canvas.height !== ph)) {
      canvas.width = pw;
      canvas.height = ph;
    }
    if (canvas) c = canvas.getContext('2d');
    if (oldW > 0 && spheres && spheres.length) {
      sx = w / oldW;
      sy = h / oldH;
      for (i = 0; i < spheres.length; i++) {
        spheres[i].pos.x *= sx;
        spheres[i].pos.y *= sy;
        spheres[i].r = r;
      }
    }
    createHoles();
    if (c) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = (r * 0.8) + 'px Arial';
    }
  }

  function draw() {
    var i;
    if (!c) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#0a3d24';
    c.fillRect(0, 0, cssW, cssH);
    c.save();
    c.translate(ox, oy);
    c.fillStyle = '#116336';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(0,0,0,0.35)';
    c.lineWidth = 4;
    c.strokeRect(2, 2, w - 4, h - 4);
    for (i = 0; i < holes.length; i++) holes[i].show();
    for (i = 0; i < spheres.length; i++) spheres[i].show();
    c.restore();
  }

  function drawAim(sx, sy, ex, ey) {
    if (!c || !holding) return;
    c.save();
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.translate(ox, oy);
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = 2;
    if (c.setLineDash) c.setLineDash([8, 6]);
    c.beginPath();
    c.moveTo(holding.pos.x, holding.pos.y);
    c.lineTo(holding.pos.x + (ex - sx), holding.pos.y + (ey - sy));
    c.stroke();
    c.restore();
  }

  function pack() {
    var i, s, out = [];
    for (i = 0; i < spheres.length; i++) {
      s = spheres[i];
      out.push({
        x: s.pos.x / w,
        y: s.pos.y / h,
        vx: s.vel.x / w,
        vy: s.vel.y / h,
        c: s.c,
        t: s.t,
        e: s.effect,
        g: s.isGone ? 1 : 0
      });
    }
    return { balls: out, moving: moving ? 1 : 0, left: coloredLeft() };
  }

  function applyPack(p) {
    var i, b, s;
    if (!p || !p.balls) return;
    spheres = [];
    for (i = 0; i < p.balls.length; i++) {
      b = p.balls[i];
      s = new Sphere(b.x * w, b.y * h, r, b.c, b.e || '3d', b.t || '');
      s.vel.set((b.vx || 0) * w, (b.vy || 0) * h);
      s.isGone = !!b.g;
      spheres.push(s);
    }
    moving = !!p.moving;
    stillFrames = moving ? 0 : SETTLE_FRAMES + 1;
    createHoles();
  }

  function fromScreen(x, y) { return { x: x - ox, y: y - oy }; }

  function finishShot() {
    shots += 1;
    score += pottedThisShot;
    return pottedThisShot;
  }

  root.FingerPool = {
    impulseOf: impulseOf,
    radiusOf: radiusOf,
    reset: reset,
    layout: layout,
    step: step,
    grab: grab,
    dropGrab: dropGrab,
    flick: flick,
    pick: pick,
    draw: draw,
    drawAim: drawAim,
    pack: pack,
    applyPack: applyPack,
    fromScreen: fromScreen,
    finishShot: finishShot,
    coloredLeft: coloredLeft,
    still: function () { return !moving; },
    moving: function () { return moving; },
    holding: function () { return holding; },
    pottedThisShot: function () { return pottedThisShot; },
    shots: function () { return shots; },
    setShots: function (n) { shots = n; },
    seq: function () { return seq; },
    setSeq: function (n) { seq = n; },
    score: function () { return score; },
    setScore: function (n) { score = n; },
    over: function () { return coloredLeft() === 0; },
    setOnHit: function (fn) { onHit = fn; },
    setOnHole: function (fn) { onHole = fn; }
  };
})(window);
