// Procedural icon for IO Blobs: a dark rounded card looking down on an
// arena, a teal blob swallowing a smaller pink one, scattered food dots.
// The chase closes across the frames.
//
// Pure Node — no canvas. Super-sample → box-downsample → small palette;
// deterministic so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [18, 32, 36];
const CARD_B = [8, 14, 16];
const GRID = [28, 42, 46];
const TEAL = [48, 196, 168];
const TEAL_D = [20, 110, 96];
const PINK = [236, 92, 132];
const PINK_D = [140, 36, 72];
const YEL = [255, 210, 80];
const BLUE = [80, 160, 255];
const LIME = [120, 220, 90];
const WHITE = [244, 252, 250];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, GRID, TEAL, TEAL_D, PINK, PINK_D, YEL, BLUE, LIME, WHITE]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
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
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}

function blob(x, y, cx, cy, r, col, rim) {
  const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
  if (d2 > r * r) return null;
  const d = Math.sqrt(d2) / r;
  const hx = cx - r * 0.32, hy = cy - r * 0.32;
  const shine = Math.max(0, 1 - Math.hypot(x - hx, y - hy) / (r * 0.55));
  if (d > 0.86) return mix(rim, col, 0.35);
  return mix(col, WHITE, shine * 0.45);
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const t = f / FRAMES;
  // One-way chomp: chase, swallow, a new morsel appears so the loop reads as eat.
  const chase = Math.min(1, t / 0.58);
  const gulp = t < 0.58 ? 0 : Math.min(1, (t - 0.58) / 0.22);
  const after = t < 0.80 ? 0 : (t - 0.80) / 0.20;
  const tealR = 20 + chase * 3 + gulp * 8 - after * 5;
  const pinkR = Math.max(0, 12.5 - gulp * 13);
  const tx = 48 + chase * 6 + gulp * 4, ty = 66;
  const px = 92 - chase * 26 - gulp * 14, py = 64 - chase * 2 + gulp * 3;
  const bob = Math.sin(t * Math.PI * 2) * 1.1;
  const spark = gulp > 0.15 && gulp < 0.85;
  const foods = [
    [28, 36, 3.0 - after * 1.2, YEL],
    [100, 40, after > 0.3 ? 3.2 : 2.6, BLUE],
    [90, 96, 3.4, LIME],
    [34, 98, 2.5, PINK],
    [72, 30, 2.3, TEAL],
    [108, 74, 2.8, YEL],
    [54, 42, 2.2, LIME],
  ];

  for (let pyi = 0; pyi < RW; pyi++) for (let pxi = 0; pxi < RW; pxi++) {
    const x = pxi / SS, y = pyi / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      const floorish = x > 16 && x < 112 && y > 18 && y < 112;
      if (floorish) {
        const txg = ((x / 10) | 0), tyg = ((y / 10) | 0);
        col = (txg + tyg) % 2 ? mix(CARD_A, GRID, 0.35) : mix(CARD_B, GRID, 0.25);
      }
      const sdx = x - (tx + 2), sdy = y - (ty + 10 + bob);
      if (sdx * sdx / 420 + sdy * sdy / 90 < 1) col = mix(col, [0, 0, 0], 0.28);
      for (const fd of foods) {
        const ddx = x - fd[0], ddy = y - fd[1];
        if (ddx * ddx + ddy * ddy <= fd[2] * fd[2]) col = fd[3];
      }
      if (pinkR > 2.2) {
        const pb = blob(x, y, px, py + bob * 0.4, pinkR, PINK, PINK_D);
        if (pb) col = pb;
      }
      const tb = blob(x, y, tx, ty + bob, tealR, TEAL, TEAL_D);
      if (tb) col = tb;
      if (spark) {
        const ang = (x + y + f * 7) % 7;
        const sdx = x - tx, sdy = y - (ty + bob);
        const sd = Math.hypot(sdx, sdy);
        if (sd > tealR * 0.92 && sd < tealR * 1.22 && ang < 1.2) col = mix(YEL, WHITE, 0.4);
      }
      if (after > 0.45) {
        const nb = blob(x, y, 102, 58, 4.2 + after * 2.2, PINK, PINK_D);
        if (nb) col = nb;
      }
    }
    const o = (pyi * RW + pxi) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }

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

export function ioBlobsIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 8, transparentIndex: 0 };
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
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (gph[row] & (1 << (4 - col))) {
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
          put(cx + col * s + dx, y + row * s + dy, r, g, b);
        }
      }
    }
    cx += 6 * s;
  }
}

function putBlob(put, cx, cy, r, col, rim, wobble) {
  const r2 = r * r;
  for (let dy = -r - 2; dy <= r + 4; dy++) for (let dx = -r - 2; dx <= r + 4; dx++) {
    const sdx = dx - 2, sdy = dy + r * 0.22;
    if (sdx * sdx / (r * r * 0.95) + sdy * sdy / (r * r * 0.45) < 1 && dy > 0) {
      put(cx + dx, cy + dy, 6, 10, 12);
    }
  }
  for (let dy = -r - 3; dy <= r + 3; dy++) for (let dx = -r - 3; dx <= r + 3; dx++) {
    const ang = Math.atan2(dy, dx);
    const wr = r * (1 + (wobble || 0.06) * Math.sin(ang * 3 + r));
    if (dx * dx + dy * dy > wr * wr) continue;
    const d = Math.sqrt(dx * dx + dy * dy) / wr;
    const shine = Math.max(0, 1 - Math.hypot(dx + r * 0.32, dy + r * 0.32) / (r * 0.55));
    let c = mix(col, WHITE, shine * 0.5);
    if (d > 0.86) c = mix(rim, col, 0.3);
    put(cx + dx, cy + dy, c[0] | 0, c[1] | 0, c[2] | 0);
  }
}

function putDot(put, cx, cy, r, col) {
  cx = cx | 0; cy = cy | 0;
  r = Math.max(4, r);
  const r2 = r * r;
  for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) {
    if (dx * dx + dy * dy > r2) continue;
    const d = Math.sqrt(dx * dx + dy * dy) / r;
    const c = mix(col, WHITE, Math.max(0, 0.45 - d));
    put(cx + dx, cy + dy, c[0] | 0, c[1] | 0, c[2] | 0);
  }
}

function putThorn(put, cx, cy, r) {
  const n = 18;
  for (let dy = -r * 1.35; dy <= r * 1.35; dy++) for (let dx = -r * 1.35; dx <= r * 1.35; dx++) {
    const ang = Math.atan2(dy, dx);
    const k = ((ang + Math.PI) / (Math.PI * 2)) * n;
    const spike = (k - Math.floor(k) < 0.5) ? 1.26 : 0.78;
    const wr = r * spike;
    if (dx * dx + dy * dy > wr * wr) continue;
    const d = Math.sqrt(dx * dx + dy * dy) / wr;
    const c = mix([76, 190, 58], [200, 255, 106], Math.max(0, 1 - d));
    put(cx + dx, cy + dy, c[0] | 0, c[1] | 0, c[2] | 0);
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
  const fill = (x0, y0, x1, y1, r, g, b) => {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    x1 = Math.min(W, x1 | 0); y1 = Math.min(H, y1 | 0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, r, g, b);
  };

  // Mid-arena: dense pellets, a swallow in progress, a spike, names, scores.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2);
    const d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
    const t = d * d;
    put(x, y, (18 + t * 22) | 0, (26 + t * 22) | 0, (30 + t * 18) | 0);
  }
  const T = 48;
  for (let x = 0; x < W; x += T) fill(x, 0, x + 1, H, 40, 56, 60);
  for (let y = 0; y < H; y += T) fill(0, y, W, y + 1, 40, 56, 60);

  const rng = (function (a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  })(0x10B10B5);
  const blobs = [[470, 390, 110], [820, 210, 64], [980, 430, 50], [240, 220, 40], [590, 348, 34]];
  for (let i = 0; i < 140; i++) {
    const fx = 18 + rng() * (W - 36), fy = 18 + rng() * (H - 36);
    let covered = false;
    for (const b of blobs) {
      if ((fx - b[0]) * (fx - b[0]) + (fy - b[1]) * (fy - b[1]) < (b[2] + 8) * (b[2] + 8)) covered = true;
    }
    if (covered) continue;
    const fr = 7 + rng() * 5;
    const pal = [YEL, BLUE, LIME, PINK, TEAL, [255, 140, 70], [180, 120, 255]][i % 7];
    putDot(put, fx, fy, fr, pal);
  }

  putThorn(put, 700, 520, 42);
  putThorn(put, 180, 500, 34);

  putBlob(put, 980, 430, 44, [80, 160, 255], [32, 70, 130], 0.07);
  putBlob(put, 820, 210, 58, [236, 92, 132], [140, 36, 72], 0.08);
  putBlob(put, 1088, 250, 26, [120, 220, 90], [40, 100, 40], 0.07);
  putBlob(put, 240, 220, 34, [255, 170, 60], [140, 80, 20], 0.07);
  putBlob(put, 470, 390, 102, TEAL, TEAL_D, 0.09);
  putBlob(put, 590, 348, 28, PINK, PINK_D, 0.1);

  drawText(put, 454, 248, 'YOU', 3, 232, 252, 246);
  drawText(put, 790, 128, 'NIBBLER', 2, 244, 220, 228);
  drawText(put, 948, 372, 'DRIFT', 2, 200, 220, 244);
  drawText(put, 214, 168, 'PIP', 2, 255, 220, 180);

  drawText(put, 36, H - 64, '1840', 5, 232, 252, 246);
  drawText(put, 36, H - 28, 'BEST 2210', 2, 138, 176, 168);

  const boardX = W - 268, boardY = 28;
  for (let y = boardY; y < boardY + 168; y++) for (let x = boardX; x < boardX + 240; x++) {
    put(x, y, 10, 18, 20);
  }
  drawText(put, boardX + 16, boardY + 12, 'LARGEST', 2, 138, 176, 168);
  drawText(put, boardX + 16, boardY + 44, 'YOU        1840', 2, 64, 212, 176);
  drawText(put, boardX + 16, boardY + 72, 'NIBBLER     960', 2, 200, 220, 214);
  drawText(put, boardX + 16, boardY + 100, 'DRIFT       410', 2, 200, 220, 214);
  drawText(put, boardX + 16, boardY + 128, 'PIP         180', 2, 200, 220, 214);

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
