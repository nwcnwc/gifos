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
  const eat = (Math.sin(t * Math.PI * 2) * 0.5 + 0.5);
  const tealR = 22 + eat * 5;
  const pinkR = 11 - eat * 4;
  const tx = 54, ty = 68;
  const px = 54 + 28 - eat * 22, py = 68 - 6 + eat * 4;
  const bob = Math.sin(t * Math.PI * 2) * 1.2;
  const foods = [
    [32, 38, 3.2, YEL],
    [96, 44, 2.8, BLUE],
    [88, 92, 3.6, LIME],
    [36, 96, 2.6, PINK],
    [70, 34, 2.4, TEAL],
    [108, 72, 3.0, YEL],
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
      if (pinkR > 2.5) {
        const pb = blob(x, y, px, py + bob * 0.4, pinkR, PINK, PINK_D);
        if (pb) col = pb;
      }
      const tb = blob(x, y, tx, ty + bob, tealR, TEAL, TEAL_D);
      if (tb) col = tb;
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
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
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

function putBlob(put, cx, cy, r, col, rim) {
  const r2 = r * r;
  for (let dy = -r - 2; dy <= r + 4; dy++) for (let dx = -r - 2; dx <= r + 4; dx++) {
    const sdx = dx - 2, sdy = dy + r * 0.22;
    if (sdx * sdx / (r * r * 0.95) + sdy * sdy / (r * r * 0.45) < 1 && dy > 0) {
      put(cx + dx, cy + dy, 6, 10, 12);
    }
  }
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    const d = Math.sqrt(d2) / r;
    const shine = Math.max(0, 1 - Math.hypot(dx + r * 0.32, dy + r * 0.32) / (r * 0.55));
    let c = mix(col, WHITE, shine * 0.5);
    if (d > 0.86) c = mix(rim, col, 0.3);
    put(cx + dx, cy + dy, c[0] | 0, c[1] | 0, c[2] | 0);
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

  // radial-ish arena: darker in the middle, greyer at the rim — upstream's look
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2);
    const d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
    const t = d * d;
    put(x, y, (16 + t * 28) | 0, (24 + t * 28) | 0, (28 + t * 24) | 0);
  }
  const T = 40;
  for (let x = 0; x < W; x += T) {
    fill(x, 0, x + 1, H, 36, 52, 56);
  }
  for (let y = 0; y < H; y += T) {
    fill(0, y, W, y + 1, 36, 52, 56);
  }

  const dots = [
    [140, 120, 7, YEL], [220, 200, 6, BLUE], [310, 90, 8, LIME],
    [980, 140, 7, PINK], [1080, 260, 6, TEAL], [180, 580, 8, BLUE],
    [860, 80, 5, YEL], [1040, 560, 7, LIME], [60, 400, 6, PINK],
    [500, 60, 7, BLUE], [640, 640, 6, YEL], [420, 520, 5, LIME],
    [760, 600, 8, TEAL], [250, 340, 6, YEL], [900, 480, 5, PINK],
  ];
  for (const d of dots) {
    putBlob(put, d[0], d[1], d[2], d[3], mix(d[3], [0, 0, 0], 0.4));
  }

  putBlob(put, 920, 420, 38, [80, 160, 255], [32, 70, 130]);
  putBlob(put, 780, 240, 52, [236, 92, 132], [140, 36, 72]);
  putBlob(put, 1040, 200, 28, [120, 220, 90], [40, 100, 40]);
  putBlob(put, 430, 380, 92, TEAL, TEAL_D);
  putBlob(put, 560, 300, 22, PINK, PINK_D);

  drawText(put, 48, 48, 'IO BLOBS', 6, 232, 252, 246);
  drawText(put, 48, 100, 'EAT. GROW.', 3, 48, 196, 168);
  drawText(put, 48, 140, 'THE LINK IS THE ROOM', 2, 168, 200, 192);

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
