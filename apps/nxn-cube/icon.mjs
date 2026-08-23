// Procedural icon + store cover for NxN Cube: a colourful 3×3 cube turning
// in place. Pure Node, super-sample → box-downsample → small palette.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [22, 24, 36];
const CARD_B = [12, 14, 22];
const PLASTIC = [18, 18, 20];
const RED = [251, 54, 54];
const ORANGE = [255, 147, 81];
const YELLOW = [250, 222, 112];
const GREEN = [157, 225, 111];
const BLUE = [81, 172, 250];
const PURPLE = [218, 109, 250];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, PLASTIC, RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE, [238, 241, 248], [147, 160, 184]]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
  }
  return pal;
}
function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e9;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b, d = dr * dr + dg * dg + db * db;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

function rot(p, ax, ay) {
  const cy = Math.cos(ay), sy = Math.sin(ay);
  let x = p[0] * cy + p[2] * sy;
  let z = -p[0] * sy + p[2] * cy;
  const cx = Math.cos(ax), sx = Math.sin(ax);
  const y = p[1] * cx - z * sx;
  z = p[1] * sx + z * cx;
  return [x, y, z];
}

const FACES = [
  { c: RED,    v: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] },
  { c: ORANGE, v: [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]] },
  { c: YELLOW, v: [[-1, -1, -1], [-1, 1, -1], [-1, 1, 1], [-1, -1, 1]] },
  { c: GREEN,  v: [[1, -1, 1], [1, 1, 1], [1, 1, -1], [1, -1, -1]] },
  { c: BLUE,   v: [[-1, -1, 1], [-1, 1, 1], [1, 1, 1], [1, -1, 1]] },
  { c: PURPLE, v: [[1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, -1]] },
];

function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function bilerp(v, u, w) {
  const a = lerp3(v[0], v[1], u), b = lerp3(v[3], v[2], u);
  return lerp3(a, b, w);
}

function orient2d(p, q, r) {
  return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
}
function fillTri(zbuf, col, W, H, a, b, c, rgb) {
  const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  const area = orient2d(a, b, c);
  if (Math.abs(area) < 1e-6) return;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const p = [x + 0.5, y + 0.5];
    const wA = orient2d(b, c, p) / area;
    const wB = orient2d(c, a, p) / area;
    const wC = orient2d(a, b, p) / area;
    if (wA < -0.01 || wB < -0.01 || wC < -0.01) continue;
    const z = a[2] * wA + b[2] * wB + c[2] * wC;
    const i = y * W + x;
    if (z <= zbuf[i]) continue;
    zbuf[i] = z;
    const o = i * 4;
    col[o] = rgb[0]; col[o + 1] = rgb[1]; col[o + 2] = rgb[2]; col[o + 3] = 1;
  }
}

function project(p, scale, ox, oy, zBias) {
  return [ox + p[0] * scale, oy - p[1] * scale, p[2] + (zBias || 0)];
}

function paintCube(col, W, H, ox, oy, scale, ax, ay, n) {
  const zbuf = new Float32Array(W * H);
  zbuf.fill(-1e9);
  const faces = FACES.map((f) => {
    const v = f.v.map((p) => rot(p, ax, ay));
    const z = (v[0][2] + v[1][2] + v[2][2] + v[3][2]) / 4;
    return { c: f.c, v, z };
  }).sort((a, b) => a.z - b.z);
  const gap = 0.07;
  for (const f of faces) {
    const pv = f.v.map((p) => project(p, scale, ox, oy));
    fillTri(zbuf, col, W, H, pv[0], pv[1], pv[2], PLASTIC);
    fillTri(zbuf, col, W, H, pv[0], pv[2], pv[3], PLASTIC);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const u0 = (i + gap) / n, u1 = (i + 1 - gap) / n;
      const w0 = (j + gap) / n, w1 = (j + 1 - gap) / n;
      const q = [
        bilerp(f.v, u0, w0), bilerp(f.v, u1, w0),
        bilerp(f.v, u1, w1), bilerp(f.v, u0, w1),
      ].map((p) => project(p, scale, ox, oy, 0.04));
      const lit = mix(f.c, [255, 255, 255], 0.08 + 0.12 * Math.max(0, f.z));
      fillTri(zbuf, col, W, H, q[0], q[1], q[2], lit);
      fillTri(zbuf, col, W, H, q[0], q[2], q[3], lit);
    }
  }
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const ay = t * Math.PI * 2;
  const ax = 0.48;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    if (!inCard(x, y, 8, 22)) continue;
    const c = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 8) / (OUT - 16))));
    const o = (py * RW + px) * 4;
    rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 1;
  }
  paintCube(rgba, RW, RW, RW / 2, RW / 2 + 6 * SS, 38 * SS, ax, ay, 3);
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
    }
    if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}

export function nxnCubeIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 10, transparentIndex: 0 };
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
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'X': [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '×': [0, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
};
function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch] || GLYPHS[' '];
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (gph[row] & (1 << (4 - col))) {
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
      }
    }
    cx += 6 * s;
  }
}

export function screenshotPng() {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };
  const fill = (x0, y0, x1, y1, r, g, b) => {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    x1 = Math.min(W, x1 | 0); y1 = Math.min(H, y1 | 0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, r, g, b);
  };
  const rr = (x0, y0, x1, y1, rad, r, g, b) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
      const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
    }
  };

  fill(0, 0, W, H, 18, 20, 28);
  rr(0, 0, W, 64, 0, 16, 18, 28);
  drawText(put, 28, 22, 'NXN CUBE', 4, 238, 241, 248);
  rr(280, 16, 430, 50, 8, 26, 28, 42);
  drawText(put, 300, 24, '3×3', 3, 238, 241, 248);
  rr(450, 16, 650, 50, 8, 251, 54, 54);
  drawText(put, 470, 24, 'SCRAMBLE', 3, 255, 255, 255);
  rr(670, 16, 830, 50, 8, 26, 28, 42);
  drawText(put, 690, 24, 'RESTORE', 3, 147, 160, 184);
  drawText(put, 860, 24, '18 MOVES', 3, 238, 241, 248);

  const col = new Float32Array(W * H * 4);
  paintCube(col, W, H, 430, 400, 210, 0.50, 0.62, 3);
  for (let y = 64; y < H; y++) for (let x = 0; x < 860; x++) {
    const o = (y * W + x) * 4;
    if (col[o + 3] > 0.5) put(x, y, col[o] | 0, col[o + 1] | 0, col[o + 2] | 0);
  }

  rr(900, 90, 1170, 670, 18, 20, 22, 34);
  drawText(put, 930, 120, 'RACE', 3, 147, 160, 184);
  drawText(put, 930, 180, 'YOU', 3, 157, 225, 111);
  drawText(put, 930, 220, 'SOLVED  18', 2, 157, 225, 111);
  drawText(put, 930, 280, 'SAM', 3, 238, 241, 248);
  drawText(put, 930, 320, '22 MOVES', 2, 147, 160, 184);
  drawText(put, 930, 380, 'LEA', 3, 238, 241, 248);
  drawText(put, 930, 420, '31 MOVES', 2, 147, 160, 184);
  drawText(put, 930, 520, 'SAME SCRAMBLE', 2, 147, 160, 184);
  drawText(put, 930, 560, 'FIRST TO SOLVED', 2, 147, 160, 184);

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
