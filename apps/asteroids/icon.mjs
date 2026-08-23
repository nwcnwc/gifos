// Procedural icon for Asteroids: a dark card holding a vector ship that
// SHOOTS a rock. The shot travels, the rock bursts, fragments fly, and the
// loop restarts — it has to read at 64px. Pure Node — super-sample →
// box-downsample → small palette. Deterministic so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 16, SHOT_N = 10;

const CARD_A = [12, 16, 28];
const CARD_B = [6, 8, 16];
const INK = [232, 240, 255];
const INK_D = [140, 168, 210];
const EXH = [255, 196, 96];
const ROCK = [186, 198, 214];
const GLOW = [96, 160, 255];
const SPARK = [255, 255, 255];

const SHIP = [-5, 4, 0, -12, 5, 4];
const EXHAUST = [-3, 6, 0, 11, 3, 6];
const ROCK_P = [-10, 0, -5, 7, -3, 4, 1, 10, 5, 4, 10, 0, 5, -6, 2, -10, -4, -10, -4, -5];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, INK, INK_D, EXH, ROCK, GLOW, SPARK]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.4).map(Math.round));
  }
  return pal;
}
function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e9;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}
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

function xform(pts, rotDeg, scale, tx, ty) {
  const rad = rotDeg * Math.PI / 180;
  const s = Math.sin(rad), c = Math.cos(rad);
  const out = [];
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i] * scale, y = pts[i + 1] * scale;
    out.push(c * x - s * y + tx, s * x + c * y + ty);
  }
  return out;
}
function distSeg(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-8) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / l2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}
function distPoly(px, py, pts, closed) {
  let best = 1e9;
  const n = pts.length / 2;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % n;
    const d = distSeg(px, py, pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1]);
    if (d < best) best = d;
  }
  return best;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const shipRot = 38;
  const rockRot = -18 + f * -5;
  const thrust = (f % 3) !== 1;
  const shipX = 44, shipY = 90;
  const rockX = 90, rockY = 38;
  const ship = xform(SHIP, shipRot, 2.8, shipX, shipY);
  const exh = xform(EXHAUST, shipRot, 2.8, shipX, shipY);
  const hit = f >= SHOT_N;
  const k = hit ? (f - SHOT_N) / (FRAMES - SHOT_N) : 0;
  const rock = xform(ROCK_P, rockRot, hit ? 2.2 * (1 - k * 0.7) : 2.2, rockX, rockY);
  const bits = hit ? [
    xform(ROCK_P, rockRot + k * 50, 0.9, rockX + k * 18, rockY - k * 6),
    xform(ROCK_P, rockRot - k * 40, 0.8, rockX - k * 14, rockY - k * 16),
    xform(ROCK_P, rockRot + k * 70, 0.75, rockX + k * 4, rockY + k * 18),
  ] : [];
  const rad = (shipRot - 90) * Math.PI / 180;
  const ux = Math.cos(rad), uy = Math.sin(rad);
  const shotT = hit ? 1 : (f + 0.4) / SHOT_N;
  const shotX = shipX + ux * (12 + shotT * 48);
  const shotY = shipY + uy * (12 + shotT * 48);
  const boom = [];
  if (hit) {
    for (let i = 0; i < 5; i++) {
      const a = i * (Math.PI * 2 / 5) + 0.3;
      const L = 4 + k * 16;
      boom.push([rockX + Math.cos(a) * 2, rockY + Math.sin(a) * 2,
                 rockX + Math.cos(a) * L, rockY + Math.sin(a) * L]);
    }
  }

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 20)) continue;
      let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      const ds = distPoly(x, y, ship, true);
      const dr = (!hit || k < 0.75) ? distPoly(x, y, rock, true) : 99;
      const de = thrust ? distPoly(x, y, exh, false) : 99;
      let db = 99;
      for (let i = 0; i < bits.length; i++) {
        const d = distPoly(x, y, bits[i], true);
        if (d < db) db = d;
      }
      let dBoom = 99;
      for (let i = 0; i < boom.length; i++) {
        const b = boom[i];
        const d = distSeg(x, y, b[0], b[1], b[2], b[3]);
        if (d < dBoom) dBoom = d;
      }
      const dShot = hit ? 99 : distSeg(
        x, y,
        shotX - ux * 7, shotY - uy * 7,
        shotX + ux * 1.5, shotY + uy * 1.5
      );
      if (ds < 1.2) col = ds < 0.55 ? INK : mix(INK, GLOW, 0.35);
      else if (de < 1.05) col = de < 0.45 ? EXH : mix(EXH, CARD_A, 0.25);
      else if (dShot < 1.35) col = dShot < 0.7 ? SPARK : mix(SPARK, GLOW, 0.45);
      else if (dBoom < 1.05) col = dBoom < 0.5 ? SPARK : mix(EXH, SPARK, 0.4);
      else if (db < 1.1) col = db < 0.5 ? ROCK : mix(ROCK, INK_D, 0.4);
      else if (dr < 1.2) col = dr < 0.55 ? ROCK : mix(ROCK, INK_D, 0.4);
      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = SS * SS;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
          r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
        }
      }
      if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
      idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
    }
  }
  return idx;
}

export function asteroidsIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0;
    flat[i * 3 + 1] = pal[i][1] | 0;
    flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return {
    width: OUT, height: OUT, palette: flat, numColors: CT,
    minCodeSize: 6, frames, delayCs: 10, transparentIndex: 0
  };
}

import { deflateSync } from 'node:zlib';

function crc(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function pngChunk(tag, data) {
  const t = Buffer.from(tag);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
}

const GLYPHS = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (gph[row] & (1 << (4 - col))) {
          for (let dy = 0; dy < s; dy++) {
            for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
          }
        }
      }
    }
    cx += 6 * s;
  }
}

function strokePoly(put, pts, closed, w, r, g, b) {
  const n = pts.length / 2;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % n;
    strokeLine(put, pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1], w, r, g, b);
  }
}
function strokeLine(put, x0, y0, x1, y1, w, r, g, b) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const steps = Math.ceil(len);
  for (let i = 0; i <= steps; i++) {
    const x = x0 + dx * (i / steps);
    const y = y0 + dy * (i / steps);
    const rad = w;
    const xA = Math.floor(x - rad), xB = Math.ceil(x + rad);
    const yA = Math.floor(y - rad), yB = Math.ceil(y + rad);
    for (let yy = yA; yy <= yB; yy++) {
      for (let xx = xA; xx <= xB; xx++) {
        if ((xx - x) * (xx - x) + (yy - y) * (yy - y) <= rad * rad) put(xx, yy, r, g, b);
      }
    }
  }
}

export function screenshotPng() {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b, a) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) put(x, y, 5, 6, 10);
  }

  const rocks = [
    { x: 210, y: 170, rot: 20, s: 7.0 },
    { x: 1040, y: 140, rot: 200, s: 6.2 },
    { x: 1120, y: 520, rot: 80, s: 5.6 },
    { x: 140, y: 560, rot: 310, s: 5.0 },
    { x: 480, y: 90, rot: 140, s: 2.5 },
    { x: 820, y: 620, rot: 55, s: 2.4 },
    { x: 390, y: 430, rot: 90, s: 2.2 },
    { x: 980, y: 340, rot: 170, s: 2.3 },
    { x: 300, y: 320, rot: 250, s: 2.0 },
    { x: 700, y: 80, rot: 10, s: 1.9 },
  ];
  for (const rk of rocks) {
    const pts = xform(ROCK_P, rk.rot, rk.s, rk.x, rk.y);
    strokePoly(put, pts, true, 1.6, 210, 220, 235);
  }

  // A rock mid-break — the shot just landed.
  const boomX = 740, boomY = 268;
  strokePoly(put, xform(ROCK_P, 30, 3.4, boomX, boomY), true, 1.5, 230, 236, 248);
  const bits = [
    { rot: 70, s: 1.8, x: boomX + 46, y: boomY - 18 },
    { rot: 200, s: 1.6, x: boomX - 38, y: boomY - 36 },
    { rot: 320, s: 1.5, x: boomX + 10, y: boomY + 48 },
  ];
  for (const b of bits) strokePoly(put, xform(ROCK_P, b.rot, b.s, b.x, b.y), true, 1.4, 210, 220, 235);
  for (let i = 0; i < 5; i++) {
    const a = i * (Math.PI * 2 / 5) + 0.4;
    strokeLine(put, boomX + Math.cos(a) * 6, boomY + Math.sin(a) * 6,
      boomX + Math.cos(a) * 34, boomY + Math.sin(a) * 34, 1.3, 255, 220, 160);
  }

  const shipRot = -52;
  const ship = xform(SHIP, shipRot, 4.4, 560, 430);
  const exh = xform(EXHAUST, shipRot, 4.4, 560, 430);
  strokePoly(put, exh, false, 1.6, 255, 196, 96);
  strokePoly(put, ship, true, 2.0, 232, 240, 255);

  const p2 = xform(SHIP, 28, 3.4, 400, 250);
  const e2 = xform(EXHAUST, 28, 3.4, 400, 250);
  strokePoly(put, e2, false, 1.3, 120, 210, 255);
  strokePoly(put, p2, true, 1.7, 120, 210, 255);
  const p3 = xform(SHIP, 210, 3.4, 900, 400);
  strokePoly(put, p3, true, 1.7, 255, 170, 140);

  const SAUCER = [-20, 0, -12, -4, 12, -4, 20, 0, 12, 4, -12, 4];
  const SAUCER_TOP = [-8, -4, -6, -6, 6, -6, 8, -4];
  strokePoly(put, xform(SAUCER, 0, 2.4, 250, 400), true, 1.6, 232, 240, 255);
  strokePoly(put, xform(SAUCER_TOP, 0, 2.4, 250, 400), false, 1.4, 232, 240, 255);

  const shots = [
    [612, 372], [644, 336], [676, 300], [708, 268],
    [428, 214], [444, 186],
    [872, 372],
  ];
  for (const s of shots) {
    strokeLine(put, s[0] - 3, s[1] - 3, s[0] + 3, s[1] + 3, 1.4, 232, 240, 255);
    strokeLine(put, s[0] + 3, s[1] - 3, s[0] - 3, s[1] + 3, 1.4, 232, 240, 255);
  }

  drawText(put, W - 188, 28, '2480', 4, 232, 240, 255);
  for (let i = 0; i < 2; i++) {
    const life = xform(SHIP, 0, 1.6, W - 40 - i * 28, 78);
    strokePoly(put, life, true, 1.2, 232, 240, 255);
  }

  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    rgba.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
