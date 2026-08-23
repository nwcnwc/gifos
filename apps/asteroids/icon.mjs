// Procedural icon for Asteroids: a dark card holding a vector ship and a
// rock. The ship turns and the exhaust flickers; the rock drifts the other
// way. Pure Node — super-sample → box-downsample → small palette.
// Deterministic so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [12, 16, 28];
const CARD_B = [6, 8, 16];
const INK = [232, 240, 255];
const INK_D = [140, 168, 210];
const EXH = [255, 196, 96];
const ROCK = [186, 198, 214];
const GLOW = [96, 160, 255];

const SHIP = [-5, 4, 0, -12, 5, 4];
const EXHAUST = [-3, 6, 0, 11, 3, 6];
const ROCK_P = [-10, 0, -5, 7, -3, 4, 1, 10, 5, 4, 10, 0, 5, -6, 2, -10, -4, -10, -4, -5];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, INK, INK_D, EXH, ROCK, GLOW]) {
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
  const t = f / FRAMES;
  const shipRot = -18 + t * 40;
  const rockRot = t * -80;
  const thrust = (f % 3) !== 1;
  const ship = xform(SHIP, shipRot, 2.6, 52, 72);
  const exh = xform(EXHAUST, shipRot, 2.6, 52, 72);
  const rock = xform(ROCK_P, rockRot, 2.15, 88, 48);

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 20)) continue;
      let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      const ds = distPoly(x, y, ship, true);
      const dr = distPoly(x, y, rock, true);
      const de = thrust ? distPoly(x, y, exh, false) : 99;
      if (ds < 1.15) col = ds < 0.55 ? INK : mix(INK, GLOW, 0.35);
      else if (de < 1.0) col = de < 0.45 ? EXH : mix(EXH, CARD_A, 0.25);
      else if (dr < 1.15) col = dr < 0.55 ? ROCK : mix(ROCK, INK_D, 0.4);
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
    { x: 260, y: 180, rot: 20, s: 7.2 },
    { x: 940, y: 160, rot: 200, s: 6.4 },
    { x: 1080, y: 480, rot: 80, s: 5.8 },
    { x: 180, y: 520, rot: 310, s: 4.6 },
    { x: 520, y: 120, rot: 140, s: 2.4 },
    { x: 780, y: 560, rot: 55, s: 2.2 },
    { x: 640, y: 300, rot: 0, s: 2.0 },
    { x: 400, y: 400, rot: 90, s: 2.1 },
    { x: 1000, y: 300, rot: 170, s: 2.3 },
  ];
  for (const rk of rocks) {
    const pts = xform(ROCK_P, rk.rot, rk.s, rk.x, rk.y);
    strokePoly(put, pts, true, 1.6, 210, 220, 235);
  }

  const ship = xform(SHIP, -12, 3.4, 600, 400);
  const exh = xform(EXHAUST, -12, 3.4, 600, 400);
  strokePoly(put, exh, false, 1.4, 255, 196, 96);
  strokePoly(put, ship, true, 1.8, 232, 240, 255);

  const p2 = xform(SHIP, 40, 3.0, 420, 260);
  strokePoly(put, p2, true, 1.6, 120, 210, 255);
  const p3 = xform(SHIP, 200, 3.0, 860, 390);
  strokePoly(put, p3, true, 1.6, 255, 170, 140);

  // shots
  const shots = [[630, 340], [638, 318], [646, 296], [840, 370], [828, 352]];
  for (const s of shots) {
    strokeLine(put, s[0] - 2, s[1] - 2, s[0] + 2, s[1] + 2, 1.2, 232, 240, 255);
    strokeLine(put, s[0] + 2, s[1] - 2, s[0] - 2, s[1] + 2, 1.2, 232, 240, 255);
  }

  drawText(put, 36, 28, '2480', 4, 232, 240, 255);
  drawText(put, W / 2 - 140, 36, 'ASTEROIDS', 5, 232, 240, 255);
  // spare lives, top right — tiny ships
  for (let i = 0; i < 2; i++) {
    const life = xform(SHIP, 0, 1.6, W - 40 - i * 28, 48);
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
