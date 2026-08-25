/*
 * Backdooms — the Home Screen icon.
 *
 * The old icon faked the hall with two flat triangles, which is the one thing
 * a Backrooms hall cannot be: it has no vanishing point, and a vanishing point
 * is what the room is MADE of. So this casts the real thing at 384x384 and
 * boxes it down — the same room render.js draws, with the same numbers:
 * mustard panelling with a chair rail and a skirting that converge one way,
 * acoustic tiles with a T-bar grid that converge the other, and a line of
 * fluorescent panels marching away to a black end.
 *
 * THE LOOP IS A DEMONSTRATION, not a wiggle. Two orange eyes come up out of
 * that black, resolve into a thing, and get close enough to be a problem;
 * the shotgun fires and for one frame the whole corridor is white; then there
 * is a stain on the carpet and an empty hall. That is the game in 1.3 s.
 */
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS;
const FRAMES = 14, DELAY_CS = 9;

/* the room, in cell widths — render.js's WH/EH, and its FIGH */
const HALF = 0.92;        /* corridor half-width */
const EYE_H = 0.72;       /* floor to eye */
const CEIL_H = 0.60;      /* eye to ceiling */
const FIG_H = 1.12;       /* how tall the thing stands */
const FARZ = 13.0;        /* the hall ends here; fog got there first */
const TANH = 0.80;        /* tan(fov/2) */
const PROJ = RW / (2 * TANH);
const HORIZ = RW * 0.47;

/* fixtures: every second cell, down the middle of the ceiling */
const FIX0 = 2.0, FIXSP = 2.0, FIXW = 0.30, FIXL = 0.34;

const BODY = [96, 33, 26], DARKB = [34, 11, 9], SKIN = [124, 48, 36];
const EYE = [255, 118, 34], STAIN = [54, 15, 12];
const STEEL = [64, 67, 76], DSTEEL = [33, 35, 41];
const WOOD = [92, 52, 22], HAND = [130, 88, 54], WRIST = [104, 70, 44];
const FLASH_C = [255, 250, 228], FLASH_P = [255, 208, 116];

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function mod(n, m) { return ((n % m) + m) % m; }
function hash2(a, b) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/* DOOM's light diminishing: a curve that actually reaches black, which is
   what gives the end of the hall somewhere to be. */
function fogAt(d) {
  const t = 1 - d / 9.0;
  return t <= 0 ? 0 : Math.pow(t, 1.30);
}

/* ---- the card ------------------------------------------------------- */

function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r);
  const cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/* ---- surfaces -------------------------------------------------------- */

/* u runs along the hall, v from ceiling (0) to floor (1). The rail and the
   skirting are the load-bearing detail: they are the lines that converge. */
function wallTex(u, v, dim, out) {
  const RAIL0 = 0.610, RAIL1 = 0.660, BASE = 0.775;
  let r, g, b;
  if (v >= BASE) {
    const bt = (v - BASE) / (1 - BASE);
    const k = bt < 0.10 ? 1.45 : 0.80 - 0.30 * bt;
    r = 74 * k; g = 60 * k; b = 26 * k;
  } else if (v >= RAIL0 && v < RAIL1) {
    const rt = (v - RAIL0) / (RAIL1 - RAIL0);
    const lit = rt < 0.42 ? 1.60 : rt < 0.72 ? 1.05 : 0.44;
    r = 190 * lit; g = 160 * lit; b = 68 * lit;
  } else {
    const su = mod(u, 0.25) / 0.25;
    const stripe = su < 0.07 ? 0.78 : su > 0.93 ? 1.10 : (su < 0.5 ? 1.0 : 0.95);
    const band = v < RAIL0 ? 1.14 - 0.24 * (v / RAIL0) : 0.84;
    const k = stripe * band;
    r = 201 * k; g = 172 * k; b = 68 * k;
    const damp = hash2(Math.floor(u * 5.5), Math.floor(v * 6));
    const stain = clamp(damp * 1.5 - 1.00, 0, 1);
    r -= stain * 62; g -= stain * 56; b -= stain * 22;
  }
  out[0] = r * dim; out[1] = g * dim; out[2] = b * dim;
}

function ceilTex(x, z, out) {
  const gu = mod(x, 0.5), gv = mod(z, 0.5);
  if (gu < 0.05 || gv < 0.05) { out[0] = 68; out[1] = 65; out[2] = 55; return; }
  const k = 0.92 + hash2(Math.floor(x * 22), Math.floor(z * 22)) * 0.15;
  out[0] = 130 * k; out[1] = 125 * k; out[2] = 106 * k;
}

function floorTex(x, z, out) {
  const weave = ((Math.floor(x * 5) + Math.floor(z * 5)) & 1) ? 1.05 : 0.95;
  const k = weave * (0.86 + hash2(Math.floor(x * 19), Math.floor(z * 19)) * 0.22);
  out[0] = 134 * k; out[1] = 113 * k; out[2] = 50 * k;
}

/* ---- paint helpers (all in supersample space) ------------------------ */

function blendPx(rgb, x, y, r, g, b, a) {
  x = x | 0; y = y | 0;
  if (x < 0 || y < 0 || x >= RW || y >= RW) return;
  const o = (y * RW + x) * 3;
  rgb[o] += (r - rgb[o]) * a;
  rgb[o + 1] += (g - rgb[o + 1]) * a;
  rgb[o + 2] += (b - rgb[o + 2]) * a;
}
function addPx(rgb, x, y, r, g, b, a) {
  x = x | 0; y = y | 0;
  if (x < 0 || y < 0 || x >= RW || y >= RW) return;
  const o = (y * RW + x) * 3;
  rgb[o] += r * a; rgb[o + 1] += g * a; rgb[o + 2] += b * a;
}
/* the game's own primitive: a tapered capsule lit from up-and-left, so the
   icon's figures agree with the corridor they stand in */
function capsule(rgb, x0, y0, x1, y1, r0, r1, col, lit, alpha) {
  const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1e-6;
  const maxR = Math.max(r0, r1) + 1;
  const bx0 = Math.floor(Math.min(x0, x1) - maxR), bx1 = Math.ceil(Math.max(x0, x1) + maxR);
  const by0 = Math.floor(Math.min(y0, y1) - maxR), by1 = Math.ceil(Math.max(y0, y1) + maxR);
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      let t = ((x - x0) * dx + (y - y0) * dy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = x0 + dx * t, cy = y0 + dy * t, r = r0 + (r1 - r0) * t;
      const ox = x - cx, oy = y - cy, d = Math.sqrt(ox * ox + oy * oy);
      if (d > r) continue;
      const n = r > 0.01 ? ox / r : 0;
      let k = 0.46 + 0.54 * Math.sqrt(Math.max(0, 1 - n * n)) - n * 0.30;
      if (n < -0.72) k += 0.20;
      k *= lit;
      blendPx(rgb, x, y, col[0] * k, col[1] * k, col[2] * k, alpha);
    }
  }
}
function blob(rgb, cx, cy, rx, ry, col, lit, alpha) {
  const x0 = Math.floor(cx - rx) - 1, x1 = Math.ceil(cx + rx) + 1;
  const y0 = Math.floor(cy - ry) - 1, y1 = Math.ceil(cy + ry) + 1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const nx = (x - cx) / (rx || 1e-6), ny = (y - cy) / (ry || 1e-6);
      const d2 = nx * nx + ny * ny;
      if (d2 > 1) continue;
      let k = 0.48 + 0.52 * Math.sqrt(Math.max(0, 1 - d2)) - nx * 0.26 - ny * 0.16;
      k *= lit;
      blendPx(rgb, x, y, col[0] * k, col[1] * k, col[2] * k, alpha);
    }
  }
}
function glow(rgb, cx, cy, r, col, amp) {
  const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r);
  const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / r, dy = (y - cy) / r;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1) continue;
      const f = (1 - d) * (1 - d) * amp;
      addPx(rgb, x, y, col[0], col[1], col[2], f);
    }
  }
}

/* ---- the corridor ---------------------------------------------------- */

function renderHall(rgb, st) {
  const fl = st.flash;
  const c = [0, 0, 0];
  for (let px = 0; px < RW; px++) {
    const nx = ((px + 0.5) / RW) * 2 - 1;
    const rayX = nx * TANH;
    const ax = Math.abs(rayX);
    let wallD = ax > 1e-4 ? HALF / ax : FARZ;
    let back = false;
    if (wallD > FARZ) { wallD = FARZ; back = true; }
    const side = back ? 0.72 : (rayX > 0 ? 0.86 : 1.0);
    const top = HORIZ - (CEIL_H / wallD) * PROJ;
    const bot = HORIZ + (EYE_H / wallD) * PROJ;
    for (let py = 0; py < RW; py++) {
      let d, lum = -1;
      if (py >= top && py <= bot) {
        d = wallD;
        wallTex(back ? rayX * FARZ : wallD, (py - top) / (bot - top), side, c);
      } else if (py < top) {
        d = (CEIL_H * PROJ) / (HORIZ - py);
        const wx = rayX * d;
        const zc = Math.round((d - FIX0) / FIXSP) * FIXSP + FIX0;
        const n = Math.round((d - FIX0) / FIXSP);
        if (Math.abs(wx) < FIXW && Math.abs(d - zc) < FIXL && zc > 0.4 && d < 8.9) {
          let across = (1 - Math.abs(wx) / FIXW) / 0.22;
          if (across > 1) across = 1;
          let along = (1 - Math.abs(d - zc) / FIXL) / 0.16;
          if (along > 1) along = 1;
          lum = 58 + 244 * across * along;
          if (n === st.flickN) lum *= 0.26;
        } else {
          ceilTex(wx, d, c);
        }
      } else {
        d = (EYE_H * PROJ) / (py - HORIZ);
        const wx = rayX * d;
        floorTex(wx, d, c);
        const zc = Math.round((d - FIX0) / FIXSP) * FIXSP + FIX0;
        const n = Math.round((d - FIX0) / FIXSP);
        let pool = 1 - ((wx * wx) / 1.25 + ((d - zc) * (d - zc)) / 3.4);
        if (pool > 0 && zc > 0.4) {
          if (n === st.flickN) pool *= 0.26;
          c[0] *= 1 + pool * 0.90; c[1] *= 1 + pool * 0.86; c[2] *= 1 + pool * 0.62;
        }
      }
      const k = fogAt(d);
      let r, g, b;
      if (lum >= 0) {
        /* the fixture is only lightly dimmed, so the line of them survives all
           the way to the vanishing point — that line IS the depth cue */
        const fk = 0.40 + 0.60 * k;
        r = lum * fk; g = lum * fk * 0.97; b = lum * fk * 0.80;
      } else {
        r = c[0] * k; g = c[1] * k; b = c[2] * k;
      }
      if (fl > 0) {
        const near = fl * 1.18 * fogAt(d * 2.2);
        r = r * (1 + near * 1.55) + near * 22;
        g = g * (1 + near * 1.42) + near * 19;
        b = b * (1 + near * 1.00) + near * 11;
      }
      const o = (py * RW + px) * 3;
      rgb[o] = r; rgb[o + 1] = g; rgb[o + 2] = b;
    }
  }
}

/* ---- the thing ------------------------------------------------------- */

const FIG_OFF = -0.34;   /* world x, so it drifts off-axis as it closes */

function paintFigure(rgb, st) {
  const z = st.figZ;
  if (z <= 0) return;
  const h = (FIG_H / z) * PROJ;
  const feet = HORIZ + (EYE_H / z) * PROJ;
  const w = h * 0.46;
  const cx = RW / 2 + (FIG_OFF / z) * PROJ;
  const lit = Math.min(1.52, 0.30 + 1.10 * fogAt(z) + st.flash * 0.85);
  /* the hit-flash: for one frame the thing is a white-hot cutout of itself,
     which is how you know the shot connected */
  const mixw = (c) => [c[0] + (255 - c[0]) * 0.30 * st.hit,
    c[1] + (120 - c[1]) * 0.30 * st.hit, c[2] + (80 - c[2]) * 0.30 * st.hit];
  const body = mixw(BODY), dark = mixw(DARKB), skin = mixw(SKIN);

  if (st.dieT > 0) {
    /* it crumples onto the carpet and leaves a stain. It does not fade out
       standing up, and it does not topple over like a felled log. */
    const t = st.dieT;
    const sw = w * (0.55 + t * 0.85);
    blob(rgb, cx, feet - w * 0.04, sw * 1.15, sw * 0.30, STAIN, 1, 0.95 * t * st.stainA);
    if (t >= 0.98) return;
    const topY = feet - h * 0.80 * (1 - t * 0.86);
    const bw = w * (0.31 + 0.17 * t);
    capsule(rgb, cx - w * (0.25 + 0.55 * t), feet - h * 0.05 * (1 - t),
      cx + w * 0.10, feet - h * 0.06, w * 0.15, w * 0.11, dark, lit, 1);
    capsule(rgb, cx + w * (0.25 + 0.55 * t), feet - h * 0.05 * (1 - t),
      cx - w * 0.05, feet - h * 0.06, w * 0.15, w * 0.11, dark, lit, 1);
    capsule(rgb, cx - w * 0.35 * t, topY, cx + w * 0.20 * t, feet - h * 0.08,
      bw, bw * 0.88, body, lit, 1);
    if (t < 0.50) {
      const f = 1 - t / 0.50;
      const hx = cx - w * 0.48 * t, hy = topY + w * 0.06 * t;
      blob(rgb, hx, hy, w * 0.24, w * 0.21, skin, lit, 1);
      const dr = Math.max(2.0, w * 0.10);
      blob(rgb, hx - w * 0.05, hy, dr, dr * 0.9,
        [EYE[0] * f, EYE[1] * f, EYE[2] * f], 1, 1);
    }
    return;
  }

  const swing = Math.sin(st.walk * Math.PI * 2);
  const lean = st.hit * w * 0.22;
  capsule(rgb, cx - w * 0.16, feet - h * 0.44, cx - w * 0.16 + swing * w * 0.18, feet,
    w * 0.14, w * 0.10, dark, lit, 1);
  capsule(rgb, cx + w * 0.16, feet - h * 0.44, cx + w * 0.16 - swing * w * 0.18, feet,
    w * 0.14, w * 0.10, dark, lit, 1);
  capsule(rgb, cx - lean, feet - h * 0.84, cx, feet - h * 0.40, w * 0.34, w * 0.30, body, lit, 1);
  capsule(rgb, cx - w * 0.32 - lean, feet - h * 0.78,
    cx - w * 0.42 - swing * w * 0.12 - lean * 2.2, feet - h * (0.40 + st.hit * 0.22),
    w * 0.13, w * 0.09, dark, lit, 1);
  capsule(rgb, cx + w * 0.32 - lean, feet - h * 0.78,
    cx + w * 0.42 + swing * w * 0.12 - lean * 2.2, feet - h * (0.40 + st.hit * 0.22),
    w * 0.13, w * 0.09, dark, lit, 1);
  blob(rgb, cx - lean * 1.5, feet - h * 0.90, w * 0.26, h * 0.10, skin, lit, 1);

  /* The eyes are the only part of it that is never dark. At the far end of the
     hall they are the WHOLE icon: two orange sparks in the black, and you
     already know what they are. */
  const er = Math.max(2.6, w * 0.105);
  const eb = 0.72 + 0.28 * fogAt(z);
  for (let s2 = -1; s2 <= 1; s2 += 2) {
    const ex = cx + s2 * w * 0.145 - lean * 1.5, ey = feet - h * 0.915;
    glow(rgb, ex, ey, Math.max(er * 2.1, G(3.6)), EYE, 0.34 * eb);
    blob(rgb, ex, ey, er, er * 0.92, [EYE[0] * eb, EYE[1] * eb, EYE[2] * eb], 1, 1);
  }
}

/* ---- the shotgun ----------------------------------------------------- */

const G = (v) => v * SS;

function paintGun(rgb, st) {
  const dy = G(st.recoil * 9), dx = G(st.recoil * 2.0);
  const lit = 1 + st.flash * 0.62;
  const mx = G(69) + dx, my = G(66) + dy;
  const bx = G(81) + dx, by = G(140) + dy;
  /* the forearm comes in from the bottom-right corner, the way it does on
     screen — dark, so the gun is a SILHOUETTE against a lit carpet */
  capsule(rgb, G(112) + dx, G(140) + dy, G(90) + dx, G(120) + dy, G(6.8), G(6.0), WRIST, lit, 1);
  /* magazine tube, under and to the right of the barrel */
  capsule(rgb, G(87) + dx, G(138) + dy, G(75) + dx, G(78) + dy, G(3.4), G(3.0), DSTEEL, lit, 1);
  /* barrel */
  capsule(rgb, bx, by, mx, my, G(6.2), G(5.4), STEEL, lit, 1);
  /* the lit edge that makes it a cylinder and not a stripe */
  capsule(rgb, bx - G(3.2), by, mx - G(2.9), my, G(1.6), G(1.4), [136, 141, 152], lit, 0.85);
  /* muzzle: a ring with a hole in it, which is the whole tell */
  blob(rgb, mx, my, G(5.8), G(2.6), [116, 121, 132], lit, 1);
  blob(rgb, mx, my, G(3.1), G(1.3), [10, 10, 12], 1, 1);
  blob(rgb, mx, my - G(2.6), G(1.2), G(1.0), [196, 198, 204], lit, 1);
  /* the pump. The grooves are what say "shotgun" at a glance. */
  capsule(rgb, G(79) + dx, G(122) + dy, G(74) + dx, G(99) + dy, G(7.6), G(7.0), WOOD, lit, 1);
  for (let i = 0; i < 5; i++) {
    capsule(rgb, G(70) + dx, G(102 + i * 4.4) + dy, G(82) + dx, G(103 + i * 4.4) + dy,
      G(0.85), G(0.85), [38, 21, 9], lit, 0.9);
  }
  /* the hand riding it */
  capsule(rgb, G(89) + dx, G(118) + dy, G(76) + dx, G(107) + dy, G(6.0), G(5.4), HAND, lit, 1);
  for (let i = 0; i < 2; i++) {
    capsule(rgb, G(79) + dx, G(108 + i * 5.5) + dy, G(88) + dx, G(109 + i * 5.5) + dy,
      G(2.2), G(2.0), [162, 112, 70], lit, 0.8);
  }

  if (st.flash > 0.02) {
    const sc = st.flash;
    const a = Math.min(1, sc * 1.5);
    for (let i = 0; i < 7; i++) {
      const ang = (i / 7) * 6.283 + 0.35;
      const len = G((8 + (i % 3) * 5) * (0.5 + 0.5 * sc));
      capsule(rgb, mx, my, mx + Math.cos(ang) * len, my + Math.sin(ang) * len,
        G(3.0 * sc + 1.0), G(0.7), FLASH_P, 1, a);
    }
    glow(rgb, mx, my, G(18 * sc + 5), FLASH_P, 0.70 * sc);
    blob(rgb, mx, my, G(4.4 * sc + 1.6), G(3.8 * sc + 1.6), FLASH_C, 1, a);
  }
}

/* ---- the beat -------------------------------------------------------- */

function beat(f) {
  const st = { figZ: 0, walk: 0, dieT: 0, hit: 0, stainA: 1, flash: 0, recoil: 0, flickN: -1 };
  if (f <= 7) {
    st.figZ = 5.4 - 0.5 * f;              /* 5.4 cells out to 1.9, walking */
    st.walk = f * 0.25;
    if (f === 2) st.flickN = 0;           /* a tube stutters, because they do */
    if (f === 5) st.flickN = 2;
  } else if (f === 8) {
    st.figZ = 1.9; st.walk = 1.75; st.flash = 1; st.recoil = 1;
  } else if (f === 9) {
    st.figZ = 2.05; st.walk = 1.75; st.flash = 0.30; st.recoil = 0.62; st.hit = 1;
  } else if (f === 10) {
    st.figZ = 2.0; st.dieT = 0.68; st.recoil = 0.26;
  } else if (f === 11) {
    st.figZ = 2.0; st.dieT = 0.95; st.recoil = 0.08;
  } else if (f === 12) {
    st.figZ = 2.0; st.dieT = 1.0; st.stainA = 0.8;
  } else {
    st.flickN = 0;                        /* an empty hall, and a bad tube */
  }
  return st;
}

/* ---- box down, quantize, index --------------------------------------- */

let CARD_A = null;
function cardAlpha() {
  if (CARD_A) return CARD_A;
  const a = new Float32Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let n = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          if (inCard(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, 4, 18)) n++;
        }
      }
      a[y * OUT + x] = n / (SS * SS);
    }
  }
  CARD_A = a;
  return a;
}

function boxDown(rgb) {
  const out = new Float32Array(OUT * OUT * 3);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 3;
          r += rgb[o]; g += rgb[o + 1]; b += rgb[o + 2];
        }
      }
      const n = SS * SS, o2 = (y * OUT + x) * 3;
      /* the vignette, and a dark lip inside the card edge so the icon has a
         shape of its own on a light Home Screen */
      const nx = (x / (OUT - 1)) * 2 - 1, ny = (y / (OUT - 1)) * 2 - 1;
      let vig = (1 - 0.30 * nx * nx * nx * nx) * (1 - 0.26 * ny * ny * ny * ny);
      if (!inCard(x + 0.5, y + 0.5, 6.0, 16)) vig *= 0.42;
      out[o2] = clamp((r / n) * vig, 0, 255);
      out[o2 + 1] = clamp((g / n) * vig, 0, 255);
      out[o2 + 2] = clamp((b / n) * vig, 0, 255);
    }
  }
  return out;
}

/* median cut over a 6-bit histogram — the hall is nothing but gradients and a
   hand-picked ramp bands them; this spends the 63 slots where the pixels are */
function medianCut(frames, alpha, want) {
  const hist = new Map();
  for (const fr of frames) {
    for (let i = 0; i < OUT * OUT; i++) {
      if (alpha[i] < 0.5) continue;
      let r = fr[i * 3] | 0, g = fr[i * 3 + 1] | 0, b = fr[i * 3 + 2] | 0;
      if (r + g + b < 14) { r = 0; g = 0; b = 0; }
      const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
      let e = hist.get(key);
      if (!e) { e = { r: 0, g: 0, b: 0, n: 0 }; hist.set(key, e); }
      e.r += r; e.g += g; e.b += b; e.n++;
    }
  }
  const pts = [];
  for (const e of hist.values()) pts.push({ r: e.r / e.n, g: e.g / e.n, b: e.b / e.n, n: e.n });
  const stats = (bx) => {
    let r0 = 1e9, r1 = -1e9, g0 = 1e9, g1 = -1e9, b0 = 1e9, b1 = -1e9, n = 0;
    for (const p of bx) {
      if (p.r < r0) r0 = p.r; if (p.r > r1) r1 = p.r;
      if (p.g < g0) g0 = p.g; if (p.g > g1) g1 = p.g;
      if (p.b < b0) b0 = p.b; if (p.b > b1) b1 = p.b;
      n += p.n;
    }
    const dr = r1 - r0, dg = g1 - g0, db = b1 - b0;
    const range = Math.max(dr, dg, db);
    return { range, axis: range === dr ? 0 : range === dg ? 1 : 2, count: n };
  };
  let boxes = [pts];
  while (boxes.length < want) {
    let bi = -1, bs = -1, bst = null;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue;
      const s = stats(boxes[i]);
      const score = s.range * Math.sqrt(s.count);
      if (score > bs) { bs = score; bi = i; bst = s; }
    }
    if (bi < 0) break;
    const bx = boxes[bi], ax = bst.axis;
    bx.sort((p, q) => (ax === 0 ? p.r - q.r : ax === 1 ? p.g - q.g : p.b - q.b));
    let acc = 0, k = 0;
    for (; k < bx.length - 1; k++) { acc += bx[k].n; if (acc >= bst.count / 2) break; }
    /* BOTH halves must be non-empty. An empty box averages 0/0 = NaN, which
       is not equal to itself, so it dodges the dedupe and lands in the table
       as a black slot — 22 of them, on the first cut of this. */
    if (k > bx.length - 2) k = bx.length - 2;
    boxes.splice(bi, 1, bx.slice(0, k + 1), bx.slice(k + 1));
  }
  const raw = boxes.map((bx) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (const p of bx) { r += p.r * p.n; g += p.g * p.n; b += p.b * p.n; n += p.n; }
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  });
  const out = [];
  for (const c of raw) {
    let dup = false;
    for (const q of out) {
      if (Math.abs(q[0] - c[0]) <= 2 && Math.abs(q[1] - c[1]) <= 2 && Math.abs(q[2] - c[2]) <= 2) {
        dup = true; break;
      }
    }
    if (!dup) out.push(c);
  }
  return out;
}

function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e18;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b;
    const d = dr * dr * 0.9 + dg * dg * 1.2 + db * db * 0.7;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function backdoomsIcon() {
  const alpha = cardAlpha();
  const rgbs = [];
  for (let f = 0; f < FRAMES; f++) {
    const st = beat(f);
    const buf = new Float32Array(RW * RW * 3);
    renderHall(buf, st);
    paintFigure(buf, st);
    paintGun(buf, st);
    rgbs.push(boxDown(buf));
  }
  /* four hero colours are reserved: the thing's eyes and the flash are tiny
     in area and a popularity quantizer would happily merge them away — they
     are also the two things the icon is FOR. */
  const pal = [[0, 0, 0], [255, 122, 30], [176, 62, 16], [255, 252, 236], [255, 206, 112],
    [130, 88, 54], [92, 52, 22], [92, 96, 106]];
  const want = 64 - pal.length;
  for (const c of medianCut(rgbs, alpha, want + 16)) { if (pal.length < 64) pal.push(c); }

  const frames = [];
  for (const fr of rgbs) {
    const idx = new Uint8Array(OUT * OUT);
    for (let y = 0; y < OUT; y++) {
      for (let x = 0; x < OUT; x++) {
        const i = y * OUT + x;
        if (alpha[i] < 0.5) { idx[i] = 0; continue; }
        const dz = (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.47) * 5.5;
        idx[i] = nearest(pal, clamp(fr[i * 3] + dz, 0, 255),
          clamp(fr[i * 3 + 1] + dz, 0, 255), clamp(fr[i * 3 + 2] + dz, 0, 255));
      }
    }
    frames.push(idx);
  }

  const CT = 64, flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return {
    width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6,
    frames, delayCs: DELAY_CS, transparentIndex: 0,
  };
}

/*
 * screenshotPng() USED TO LIVE HERE, and it drew the store cover by hand: flat
 * mustard wedges, brown lozenges for the monsters, a grey trapezoid for the
 * gun, and pixel-font lettering. Two things were wrong with that. It was a
 * DRAWING OF the game rather than the game, so it could not be better than
 * whoever drew it — and it could drift from what the app actually looks like
 * without anything noticing, which is exactly what happened: the committed
 * cover was still showing a renderer that had been replaced.
 *
 * apps/backdooms/screenshot.png is now a REAL captured frame of the running
 * build, taken with Playwright and committed. build.mjs checks it is there and
 * the right size; it does not generate it. Retaking it is part of the work
 * whenever the game changes how it looks.
 */
