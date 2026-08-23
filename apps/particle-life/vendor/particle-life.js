/*
 * Particle Life — attraction/repulsion loop extracted from
 * hunar4321/particle-life particle_life.html (MIT). See UPSTREAM.txt.
 *
 * Classic IIFE. Mounts on a canvas, paints a fixed-size world so a shared
 * seed starts the same jar on every device. No GUI, no CDN, no hash URL,
 * no MediaRecorder.
 */
(function (root) {
  'use strict';

  var WORLD_W = 800;
  var WORLD_H = 800;
  var MAX_RADIUS = 200;
  // Vivid fills — same seven slots as upstream, not the dim HTML colour names.
  var PREDEFINED = ['#3ae06a', '#ff4455', '#ffb03a', '#2ee0ea', '#ff5ac8', '#c8a8ff', '#3ad4b8'];
  var MAX_PULSES = 8;

  var canvas = null;
  var ctx = null;
  var atoms = [];
  var pulses = [];
  var rings = [];
  var running = false;
  var raf = 0;
  var localSeed = 0;

  var settings = {
    seed: 91651088029,
    atoms: { count: 180, radius: 4 },
    drawings: { circle: true, background: '#05060a' },
    rules: {},
    rulesArray: [],
    radii: {},
    radii2Array: [],
    colors: [],
    numColors: 4,
    time_scale: 1.0,
    viscosity: 0.7,
    gravity: 0,
    pulseDuration: 10,
    wallRepel: 40
  };

  function mulberry32() {
    var t = localSeed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }

  function flattenRules() {
    settings.rulesArray = [];
    settings.radii2Array = [];
    for (var i = 0; i < settings.colors.length; i++) {
      var c1 = settings.colors[i];
      for (var j = 0; j < settings.colors.length; j++) {
        settings.rulesArray.push(settings.rules[c1][settings.colors[j]]);
      }
      settings.radii2Array.push(settings.radii[c1] * settings.radii[c1]);
    }
  }

  function setNumberOfColors() {
    settings.colors = [];
    for (var i = 0; i < settings.numColors; i++) settings.colors.push(PREDEFINED[i]);
  }

  function randomRules() {
    if (!isFinite(settings.seed)) settings.seed = 0xcafecafe;
    localSeed = settings.seed;
    var i, j, c1, c2;
    for (i = 0; i < settings.colors.length; i++) {
      c1 = settings.colors[i];
      settings.rules[c1] = {};
      for (j = 0; j < settings.colors.length; j++) {
        c2 = settings.colors[j];
        settings.rules[c1][c2] = mulberry32() * 2 - 1;
      }
      settings.radii[c1] = 80;
    }
    flattenRules();
  }

  function randomX() { return mulberry32() * (WORLD_W - 100) + 50; }
  function randomY() { return mulberry32() * (WORLD_H - 100) + 50; }

  function create(n, color) {
    for (var i = 0; i < n; i++) atoms.push([randomX(), randomY(), 0, 0, color]);
  }

  function randomAtoms(n, clear) {
    if (clear) atoms.length = 0;
    for (var c = 0; c < settings.colors.length; c++) create(n, c);
  }

  function rebuild(seed) {
    if (seed != null && isFinite(seed)) settings.seed = seed;
    setNumberOfColors();
    randomRules();
    randomAtoms(settings.atoms.count, true);
    pulses.length = 0;
    rings.length = 0;
  }

  function poke(x, y, sign) {
    if (!isFinite(x) || !isFinite(y)) return;
    if (x < 0) x = 0; if (x > WORLD_W) x = WORLD_W;
    if (y < 0) y = 0; if (y > WORLD_H) y = WORLD_H;
    var mag = settings.pulseDuration * (sign < 0 ? -1 : 1);
    if (pulses.length >= MAX_PULSES) pulses.shift();
    pulses.push({ x: x, y: y, mag: mag });
    if (rings.length >= MAX_PULSES) rings.shift();
    rings.push({ x: x, y: y, r: 8, a: 1, pull: mag < 0 });
  }

  function applyRules() {
    var nCol = settings.numColors;
    var ts = settings.time_scale;
    var visc = 1 - settings.viscosity;
    var wall = settings.wallRepel;
    var grav = settings.gravity;
    var i, j, a, b, fx, fy, idx, r2, g, dx, dy, d, F, p, k;

    for (i = 0; i < atoms.length; i++) {
      a = atoms[i];
      fx = 0;
      fy = 0;
      idx = a[4] * nCol;
      r2 = settings.radii2Array[a[4]];
      for (j = 0; j < atoms.length; j++) {
        b = atoms[j];
        g = settings.rulesArray[idx + b[4]];
        dx = a[0] - b[0];
        dy = a[1] - b[1];
        if (dx !== 0 || dy !== 0) {
          d = dx * dx + dy * dy;
          if (d < r2) {
            F = g / Math.sqrt(d);
            fx += F * dx;
            fy += F * dy;
          }
        }
      }
      for (k = 0; k < pulses.length; k++) {
        p = pulses[k];
        if (p.mag === 0) continue;
        dx = a[0] - p.x;
        dy = a[1] - p.y;
        d = dx * dx + dy * dy;
        if (d > 0) {
          F = 100 * p.mag / (d * ts);
          fx += F * dx;
          fy += F * dy;
        }
      }
      if (wall > 0) {
        var strength = 0.1;
        if (a[0] < wall) fx += (wall - a[0]) * strength;
        if (a[0] > WORLD_W - wall) fx += (WORLD_W - wall - a[0]) * strength;
        if (a[1] < wall) fy += (wall - a[1]) * strength;
        if (a[1] > WORLD_H - wall) fy += (WORLD_H - wall - a[1]) * strength;
      }
      fy += grav;
      a[2] = a[2] * visc + fx * ts;
      a[3] = a[3] * visc + fy * ts;
    }

    for (i = 0; i < atoms.length; i++) {
      a = atoms[i];
      a[0] += a[2];
      a[1] += a[3];
      if (a[0] < 0) { a[0] = -a[0]; a[2] *= -1; }
      if (a[0] >= WORLD_W) { a[0] = 2 * WORLD_W - a[0]; a[2] *= -1; }
      if (a[1] < 0) { a[1] = -a[1]; a[3] *= -1; }
      if (a[1] >= WORLD_H) { a[1] = 2 * WORLD_H - a[1]; a[3] *= -1; }
    }

    for (k = pulses.length - 1; k >= 0; k--) {
      p = pulses[k];
      if (p.mag > 0) p.mag -= 1;
      else if (p.mag < 0) p.mag += 1;
      if (p.mag === 0) pulses.splice(k, 1);
    }
  }

  function drawSquare(x, y, color, radius) {
    ctx.fillStyle = color;
    ctx.fillRect(x - radius, y - radius, 2 * radius, 2 * radius);
  }

  function drawCircle(x, y, color, radius) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function paint() {
    ctx.fillStyle = settings.drawings.background;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    applyRules();
    var rad = settings.atoms.radius;
    var circle = settings.drawings.circle;
    var cols = settings.colors;
    var i, a, r;
    for (i = 0; i < atoms.length; i++) {
      a = atoms[i];
      if (circle) drawCircle(a[0], a[1], cols[a[4]], rad);
      else drawSquare(a[0], a[1], cols[a[4]], rad);
    }
    for (i = rings.length - 1; i >= 0; i--) {
      r = rings[i];
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.strokeStyle = r.pull ? 'rgba(255,176,80,' + r.a.toFixed(2) + ')' : 'rgba(80,220,255,' + r.a.toFixed(2) + ')';
      ctx.lineWidth = 3;
      ctx.stroke();
      r.r += 4;
      r.a -= 0.04;
      if (r.a <= 0) rings.splice(i, 1);
    }
  }

  function frame() {
    if (!running) return;
    paint();
    raf = root.requestAnimationFrame(frame);
  }

  function mount(el) {
    canvas = el;
    if (!canvas) return;
    canvas.width = WORLD_W;
    canvas.height = WORLD_H;
    ctx = canvas.getContext('2d');
    if (!settings.colors.length) rebuild(settings.seed);
  }

  function start() {
    if (running) return;
    running = true;
    raf = root.requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) { root.cancelAnimationFrame(raf); raf = 0; }
  }

  function snapshot() {
    return {
      seed: settings.seed,
      numColors: settings.numColors,
      count: settings.atoms.count,
      viscosity: settings.viscosity,
      gravity: settings.gravity,
      time_scale: settings.time_scale,
      radius: settings.atoms.radius,
      circle: settings.drawings.circle,
      atomN: atoms.length
    };
  }

  function step(n) {
    n = n == null ? 1 : n | 0;
    if (n < 1) n = 1;
    for (var i = 0; i < n; i++) applyRules();
  }

  function getAtoms() { return atoms; }

  function worldFromEvent(e, target) {
    var el = target || canvas;
    if (!el) return null;
    var rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: (e.clientX - rect.left) / rect.width * WORLD_W,
      y: (e.clientY - rect.top) / rect.height * WORLD_H
    };
  }

  root.ParticleLife = {
    WORLD_W: WORLD_W,
    WORLD_H: WORLD_H,
    COLORS: PREDEFINED,
    MAX_RADIUS: MAX_RADIUS,
    mount: mount,
    start: start,
    stop: stop,
    poke: poke,
    rebuild: rebuild,
    resetAtoms: function () { randomAtoms(settings.atoms.count, true); pulses.length = 0; rings.length = 0; },
    setSeed: function (n) { rebuild(n); },
    setNumColors: function (n) {
      n = n | 0;
      if (n < 1) n = 1;
      if (n > PREDEFINED.length) n = PREDEFINED.length;
      settings.numColors = n;
      rebuild(settings.seed);
    },
    setCount: function (n) {
      n = n | 0;
      if (n < 20) n = 20;
      if (n > 500) n = 500;
      settings.atoms.count = n;
      randomAtoms(n, true);
    },
    setViscosity: function (v) { settings.viscosity = v; },
    setGravity: function (v) { settings.gravity = v; },
    setTimeScale: function (v) { settings.time_scale = v; },
    setRadius: function (v) { settings.atoms.radius = v; },
    setCircle: function (v) { settings.drawings.circle = !!v; },
    getSeed: function () { return settings.seed; },
    snapshot: snapshot,
    step: step,
    getAtoms: getAtoms,
    worldFromEvent: worldFromEvent,
    settings: settings
  };
})(typeof window !== 'undefined' ? window : globalThis);
