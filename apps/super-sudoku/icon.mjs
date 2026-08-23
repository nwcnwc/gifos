// Procedural Super Sudoku icon: a cream rounded card holding a 9×9 grid,
// with a 5 filling the centre cell. Pure Node, super-sample → box-downsample
// → small palette; deterministic so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CREAM = [248, 250, 252];
const INK = [15, 23, 42];
const GRID = [203, 213, 225];
const GRIDB = [51, 65, 85];
const TEAL = [13, 148, 136];
const TEALD = [15, 118, 110];
const CELL = [255, 255, 255];
const HL = [204, 251, 241];
const USER = [15, 118, 110];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CREAM, INK, GRID, GRIDB, TEAL, TEALD, CELL, HL, USER]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.28).map(Math.round));
  }
  return pal.slice(0, 64);
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
function rrPix(x, y, x0, y0, x1, y1, rad) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + rad), x1 - rad);
  const cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
  if (x >= x0 + rad && x <= x1 - rad) return true;
  if (y >= y0 + rad && y <= y1 - rad) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= rad * rad;
}

const GLYPHS = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  ':': [0, 0b00100, 0b00100, 0, 0b00100, 0b00100, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '#': [0b01010, 0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0b01010],
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
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
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

// First easy puzzle, a few cells filled as "user" numbers for the cover.
const GIVENS = [
  [5, 3, 4, 9, 2, 0, 7, 0, 0],
  [0, 6, 0, 0, 0, 7, 3, 0, 9],
  [9, 0, 0, 0, 0, 0, 0, 1, 0],
  [0, 0, 8, 7, 0, 0, 0, 0, 0],
  [4, 9, 6, 8, 0, 3, 0, 0, 2],
  [7, 2, 1, 5, 9, 4, 8, 0, 6],
  [0, 0, 0, 2, 0, 0, 9, 4, 0],
  [8, 0, 0, 0, 4, 6, 1, 0, 0],
  [0, 0, 3, 0, 0, 0, 0, 0, 0],
];

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 6, rad = 18;
  const gx0 = 14, gy0 = 14, gx1 = 114, gy1 = 114;
  const t = f / (FRAMES - 1);
  const pop = t < 0.35 ? 0 : Math.min(1, (t - 0.35) / 0.4);
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = CREAM;
      if (rrPix(x, y, gx0 - 3, gy0 - 3, gx1 + 3, gy1 + 3, 4)) col = GRIDB;
      const inner = (gx1 - gx0) / 9;
      for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
        const x0 = gx0 + c * inner, y0 = gy0 + r * inner;
        if (x >= x0 && x < x0 + inner && y >= y0 && y < y0 + inner) {
          col = (r === 4 && c === 4 && pop > 0) ? mix(CELL, HL, pop) : CELL;
          if (c % 3 === 0 && x < x0 + 1.2) col = GRIDB;
          if (r % 3 === 0 && y < y0 + 1.2) col = GRIDB;
        }
      }
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }
  function put(x, y, r, g, b) {
    if (x < 0 || y < 0 || x >= OUT || y >= OUT) return;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      if (rgba[o + 3] < 0.5) continue;
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b;
    }
  }
  const inner = (gx1 - gx0) / 9;
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    let v = GIVENS[r][c];
    let ink = INK;
    if (r === 4 && c === 4) {
      if (pop < 0.4) continue;
      v = 5;
      ink = USER;
    }
    if (!v) continue;
    const scale = 1;
    const tw = 5 * scale, th = 7 * scale;
    const cx = gx0 + c * inner + inner / 2;
    const cy = gy0 + r * inner + inner / 2;
    drawText(put, Math.round(cx - tw / 2), Math.round(cy - th / 2), String(v), scale, ink[0], ink[1], ink[2]);
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

export function sudokuIcon() {
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

  fill(0, 0, W, H, 241, 245, 249);
  drawText(put, 48, 56, 'SUPER SUDOKU', 6, 15, 118, 110);
  drawText(put, 48, 128, 'SAME PUZZLE', 4, 100, 116, 139);
  drawText(put, 48, 178, 'FIRST TO FINISH', 4, 13, 148, 136);

  rr(48, 250, 500, 330, 14, 255, 255, 255);
  drawText(put, 72, 274, 'YOU  1:12', 4, 15, 118, 110);
  rr(48, 350, 500, 430, 14, 255, 255, 255);
  drawText(put, 72, 374, 'SAM  1:48', 4, 51, 65, 85);

  drawText(put, 48, 480, 'TAP A SQUARE', 3, 100, 116, 139);
  drawText(put, 48, 530, 'THEN A NUMBER', 3, 100, 116, 139);
  drawText(put, 48, 600, 'EASY TO EVIL', 3, 13, 148, 136);

  const bx = 560, by = 48, bw = 592, pad = 8;
  const cell = ((bw - pad * 2) / 9) | 0;
  const board = pad * 2 + cell * 9;
  rr(bx, by, bx + board, by + board, 8, 51, 65, 85);
  const filled = [
    [5, 3, 4, 9, 2, 1, 7, 8, 0],
    [1, 6, 8, 4, 5, 7, 3, 2, 9],
    [9, 7, 2, 3, 8, 0, 0, 1, 0],
    [2, 5, 8, 7, 1, 0, 0, 0, 0],
    [4, 9, 6, 8, 0, 3, 0, 0, 2],
    [7, 2, 1, 5, 9, 4, 8, 0, 6],
    [0, 0, 0, 2, 0, 0, 9, 4, 0],
    [8, 0, 0, 0, 4, 6, 1, 0, 0],
    [0, 0, 3, 0, 0, 0, 0, 0, 0],
  ];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    const x0 = bx + pad + c * cell;
    const y0 = by + pad + r * cell;
    const given = GIVENS[r][c] !== 0;
    const v = filled[r][c];
    const hi = (r === 0 && c === 0);
    fill(x0 + 1, y0 + 1, x0 + cell, y0 + cell, hi ? 204 : 255, hi ? 251 : 255, hi ? 241 : 255);
    if (!v) continue;
    const scale = 5;
    const tw = 5 * scale, th = 7 * scale;
    const ink = given ? INK : USER;
    drawText(put, (x0 + ((cell - tw) / 2) | 0), (y0 + ((cell - th) / 2) | 0), String(v), scale, ink[0], ink[1], ink[2]);
  }
  for (let i = 0; i <= 9; i++) {
    const thick = i % 3 === 0;
    const x = bx + pad + i * cell;
    const y = by + pad + i * cell;
    fill(x, by + pad, x + (thick ? 3 : 1), by + pad + cell * 9, 51, 65, 85);
    fill(bx + pad, y, bx + pad + cell * 9, y + (thick ? 3 : 1), 51, 65, 85);
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
