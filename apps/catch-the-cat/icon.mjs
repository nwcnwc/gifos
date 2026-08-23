// Procedural icon for Catch the Cat: a dark rounded card holding a honeycomb
// of hexes with a black cat on it. Walls blink in; the cat hops one cell.
// Pure Node, super-sample → box-downsample → small palette; deterministic.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [18, 24, 40];
const CARD_B = [10, 14, 26];
const HEX = [36, 48, 68];
const HEX_D = [22, 32, 48];
const WALL = [61, 143, 122];
const WALL_H = [140, 220, 190];
const GOLD = [232, 176, 90];
const CAT = [18, 16, 20];
const CAT_E = [240, 220, 160];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, HEX, HEX_D, WALL, WALL_H, GOLD, CAT, CAT_E]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.25).map(Math.round));
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

// Axial hex: even-r offset. Returns {x,y} of cell centre.
function hexCenter(i, j, size, ox, oy) {
  const x = ox + size * Math.sqrt(3) * (i + 0.5 * (j & 1));
  const y = oy + size * 1.5 * j;
  return { x, y };
}
function inHex(px, py, cx, cy, r) {
  const dx = Math.abs(px - cx), dy = Math.abs(py - cy);
  return dy <= r && dx <= r * 0.8660254 && (dx * 0.57735027 + dy) <= r;
}
function inDot(px, py, cx, cy, r) {
  return (px - cx) * (px - cx) + (py - cy) * (py - cy) <= r * r;
}

function catBlob(px, py, cx, cy, sc, face) {
  // head
  const hx = cx + face * sc * 0.15, hy = cy - sc * 0.35;
  const hd = Math.hypot(px - hx, py - hy);
  if (hd < sc * 0.55) return 'body';
  // ears
  const e1x = hx - sc * 0.38, e1y = hy - sc * 0.42;
  const e2x = hx + sc * 0.32, e2y = hy - sc * 0.46;
  if (Math.hypot(px - e1x, py - e1y) < sc * 0.22) return 'body';
  if (Math.hypot(px - e2x, py - e2y) < sc * 0.20) return 'body';
  // body
  const bx = cx - face * sc * 0.05, by = cy + sc * 0.35;
  if (Math.hypot((px - bx) / 1.15, (py - by) / 0.85) < sc * 0.62) return 'body';
  // tail
  const tx = cx - face * sc * 0.85, ty = cy + sc * 0.15;
  const td = Math.hypot(px - tx, py - ty);
  if (td < sc * 0.18) return 'body';
  // eye
  const eyeX = hx + face * sc * 0.18, eyeY = hy - sc * 0.05;
  if (Math.hypot(px - eyeX, py - eyeY) < sc * 0.09) return 'eye';
  return null;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const dx = 14.2, dy = 12.4, dotR = 5.1;
  const ox = 22, oy = 22;
  const catPath = [[2, 2], [3, 2], [3, 3], [4, 3], [4, 2], [5, 2]];
  const step = Math.min(catPath.length - 1, Math.floor(t * (catPath.length - 0.01)));
  const catCell = catPath[step];
  const walls = [[1, 1], [4, 1], [2, 3], [5, 3], [0, 4], [3, 5], [6, 4]];
  const lit = Math.floor(t * walls.length);
  const cell = (i, j) => ({ x: ox + i * dx + ((j & 1) ? dx / 2 : 0), y: oy + j * dy });

  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, 6, 22)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
        if (j === 0 && (i === 0 || i === 6)) continue;
        if (j === 6 && (i === 0 || i === 6)) continue;
        const c = cell(i, j);
        if (!inDot(x, y, c.x, c.y, dotR)) continue;
        const wallI = walls.findIndex((w) => w[0] === i && w[1] === j);
        if (wallI >= 0 && wallI <= lit) col = mix(WALL, WALL_H, wallI === lit ? 0.55 : 0.15);
        else col = mix(HEX, HEX_D, ((i + j) & 1) ? 0.35 : 0);
      }
      const cc = cell(catCell[0], catCell[1]);
      const bounce = Math.abs(Math.sin(t * Math.PI * catPath.length));
      const part = catBlob(x, y, cc.x, cc.y - bounce * 2.2, 6.2, 1);
      if (part === 'body') col = CAT;
      else if (part === 'eye') col = GOLD;
    }
    const o = (py * RW + px) * 4;
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

export function catchTheCatIcon() {
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
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};
function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch] || GLYPHS[' '];
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

  fill(0, 0, W, H, 11, 16, 32);
  drawText(put, 72, 42, 'CATCH THE CAT', 8, 232, 176, 90);
  drawText(put, 72, 114, 'WALL IT IN', 4, 154, 166, 195);

  // The game itself is circles on a hex lattice, not hex tiles.
  const cols = 11, rows = 7;
  const dx = 78, dy = 68;
  const ox = 140, oy = 210;
  const dotR = 24;
  const catI = 5, catJ = 3;
  const walls = new Set(['2,2', '8,2', '3,4', '7,4', '1,6', '9,6', '4,1', '6,1', '5,7', '0,4', '10,4', '2,5', '8,5']);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const cx = ox + i * dx + ((j & 1) ? dx / 2 : 0);
    const cy = oy + j * dy;
    const isWall = walls.has(i + ',' + j);
    const isCat = i === catI && j === catJ;
    const r = isCat ? 28 : dotR;
    for (let y = (cy - r - 8) | 0; y <= (cy + r + 8) | 0; y++) {
      for (let x = (cx - r - 8) | 0; x <= (cx + r + 8) | 0; x++) {
        if (isCat) {
          const part = catBlob(x, y, cx, cy + 2, 34, 1);
          if (part === 'body') put(x, y, 12, 10, 14);
          else if (part === 'eye') put(x, y, 232, 176, 90);
        } else if (inDot(x, y, cx, cy, r)) {
          if (isWall) put(x, y, 61, 143, 122);
          else put(x, y, 36, 48, 68);
        }
      }
    }
  }

  drawText(put, 72, 678, 'TAP THE DOTS', 4, 154, 166, 195);

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
