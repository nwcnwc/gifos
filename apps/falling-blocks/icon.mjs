// Procedural Falling Blocks icon: a dark rounded card holding a well of
// coloured shapes, with a T dropping into a gap across the frames. Pure
// Node, super-sample → box-downsample → small palette; deterministic so
// builds reproduce. screenshotPng() paints the 1200×720 store cover.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [18, 22, 28];
const CARD_D = [10, 12, 16];
const WELL = [8, 10, 14];
const GRID = [28, 34, 42];
const INK = [230, 236, 240];
const CYAN = [0, 196, 204];
const SHAPE = [
  [0, 220, 220],
  [255, 140, 0],
  [50, 90, 220],
  [240, 210, 0],
  [220, 50, 50],
  [40, 170, 70],
  [170, 70, 200],
];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}
function rrPix(x, y, x0, y0, x1, y1, rad) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + rad), x1 - rad), cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
  if (x >= x0 + rad && x <= x1 - rad) return true;
  if (y >= y0 + rad && y <= y1 - rad) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= rad * rad;
}

function buildPalette() {
  const pal = [[0, 0, 0]];
  const bases = [CARD, CARD_D, WELL, GRID, INK, CYAN, ...SHAPE];
  for (const b of bases) {
    pal.push(b.map(Math.round));
    pal.push(mix(b, [255, 255, 255], 0.22).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.28).map(Math.round));
  }
  return pal.slice(0, 64);
}
function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e9;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b, d = dr * dr + dg * dg + db * db;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

// Settled pile (col, row from bottom, colour index). Gap at col 4–6 row 0 for the T.
const PILE = [
  [0, 0, 4], [1, 0, 4], [2, 0, 5], [3, 0, 5], [7, 0, 0], [8, 0, 0], [9, 0, 1],
  [0, 1, 2], [1, 1, 2], [2, 1, 3], [3, 1, 3], [7, 1, 1], [8, 1, 6], [9, 1, 6],
  [1, 2, 0], [2, 2, 0], [8, 2, 4], [9, 2, 4],
];

function fallingT(f) {
  const t = f / (FRAMES - 1);
  const y = 3 + t * 8; // rows from top of the 12-row well
  return [
    { c: 5, r: y, v: 6 },
    { c: 4, r: y + 1, v: 6 },
    { c: 5, r: y + 1, v: 6 },
    { c: 6, r: y + 1, v: 6 },
  ];
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 20;
  const cols = 10, rows = 12;
  const gx0 = 24, gy0 = 16, cell = 8, gap = 0.6;
  const falling = fallingT(f);

  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD, CARD_D, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      const wx1 = gx0 + cols * cell, wy1 = gy0 + rows * cell;
      if (rrPix(x, y, gx0 - 3, gy0 - 3, wx1 + 3, wy1 + 3, 4)) col = GRID;
      if (x >= gx0 && x < wx1 && y >= gy0 && y < wy1) col = WELL;
      for (const p of PILE) {
        const x0 = gx0 + p[0] * cell, y0 = gy1(rows, gy0, cell) - (p[1] + 1) * cell;
        if (x >= x0 + gap && x < x0 + cell - gap && y >= y0 + gap && y < y0 + cell - gap) col = SHAPE[p[2]];
      }
      for (const t of falling) {
        const x0 = gx0 + t.c * cell, y0 = gy0 + t.r * cell;
        if (x >= x0 + gap && x < x0 + cell - gap && y >= y0 + gap && y < y0 + cell - gap) col = SHAPE[t.v];
      }
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
function gy1(rows, gy0, cell) { return gy0 + rows * cell; }

export function fallingBlocksIcon() {
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
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
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

function paintWell(put, fill, x0, y0, cell, board, falling) {
  const cols = 10, rows = 20;
  const w = cols * cell, h = rows * cell;
  fill(x0 - 4, y0 - 4, x0 + w + 4, y0 + h + 4, 28, 34, 42);
  fill(x0, y0, x0 + w, y0 + h, 8, 10, 14);
  function cellAt(c, r, col) {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    const px = x0 + c * cell, py = y0 + r * cell;
    fill(px + 1, py + 1, px + cell - 1, py + cell - 1, col[0], col[1], col[2]);
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = board[r] && board[r][c];
    if (v) cellAt(c, r, SHAPE[v - 1]);
  }
  if (falling) {
    for (const t of falling) cellAt(t.c, t.r, SHAPE[t.v]);
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

  fill(0, 0, W, H, 18, 22, 28);
  drawText(put, 40, 48, 'FALLING', 8, 230, 236, 240);
  drawText(put, 40, 112, 'BLOCKS', 8, 230, 236, 240);
  drawText(put, 40, 188, 'STACK THE SHAPES', 3, 0, 196, 204);
  rr(40, 250, 352, 326, 8, 0, 196, 204);
  drawText(put, 64, 272, 'PLAY A FRIEND', 3, 18, 22, 28);
  drawText(put, 40, 360, 'PRESS INVITE', 3, 255, 140, 0);
  drawText(put, 40, 412, 'SAME SHAPES', 3, 230, 236, 240);
  drawText(put, 40, 464, 'TWO BOARDS', 3, 230, 236, 240);
  drawText(put, 40, 516, 'LAST ONE STANDING', 3, 170, 70, 200);

  function pileBoard(shift) {
    const b = [];
    for (let r = 0; r < 20; r++) b[r] = new Array(10).fill(0);
    const cells = [
      [0, 19, 5], [1, 19, 5], [2, 19, 4], [3, 19, 4], [4, 19, 1], [5, 19, 1], [6, 19, 0], [7, 19, 0], [8, 19, 6], [9, 19, 6],
      [0, 18, 2], [1, 18, 2], [2, 18, 3], [3, 18, 3], [6, 18, 5], [7, 18, 5], [8, 18, 4], [9, 18, 4],
      [1, 17, 0], [2, 17, 0], [3, 17, 0], [7, 17, 1], [8, 17, 1],
      [2, 16, 6], [8, 16, 2],
    ];
    for (const c of cells) b[c[1]][(c[0] + shift) % 10] = c[2] + 1;
    return b;
  }
  const youFall = [{ c: 4, r: 6, v: 6 }, { c: 3, r: 7, v: 6 }, { c: 4, r: 7, v: 6 }, { c: 5, r: 7, v: 6 }];
  const themFall = [{ c: 2, r: 9, v: 0 }, { c: 3, r: 9, v: 0 }, { c: 4, r: 9, v: 0 }, { c: 5, r: 9, v: 0 }];
  paintWell(put, fill, 560, 80, 24, pileBoard(0), youFall);
  paintWell(put, fill, 860, 140, 16, pileBoard(3), themFall);
  drawText(put, 560, 80 + 20 * 24 + 10, 'YOU', 3, 0, 196, 204);
  drawText(put, 860, 140 + 20 * 16 + 10, 'FRIEND', 2, 170, 70, 200);

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
