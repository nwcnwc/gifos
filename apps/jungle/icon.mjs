// Procedural icon: a green Jungle board, a rat, an elephant, a lion hopping
// the river. Pure Node, super-sample → box-downsample. Deterministic.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [16, 22, 16];
const FRAME = [22, 48, 28];
const LAND = [47, 106, 56];
const LAND2 = [58, 124, 68];
const WATER = [26, 74, 110];
const WATER2 = [36, 96, 140];
const RED_H = [224, 122, 90];
const RED = [196, 74, 58];
const BLUE_H = [106, 164, 216];
const BLUE = [58, 122, 184];
const DEN = [26, 18, 16];
const TRAP = [106, 90, 34];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, FRAME, LAND, LAND2, WATER, WATER2, RED_H, RED, BLUE_H, BLUE, DEN, TRAP]) {
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

function disc(col, x, y, cx, cy, rad, hi, lo) {
  const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
  if (d > rad * rad) return col;
  const u = (x - (cx - 2)) / (rad * 2);
  return mix(hi, lo, Math.max(0, Math.min(1, u)));
}

function isWaterCell(r, c) {
  if (r < 3 || r > 5) return false;
  return c === 1 || c === 2 || c === 4 || c === 5;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 18;
  const COLS = 7, ROWS = 9;
  const bx = 18, by = 14, bw = OUT - 36, bh = OUT - 28;
  const cellW = bw / COLS, cellH = bh / ROWS;
  const pieceR = Math.min(cellW, cellH) * 0.38;
  const t = f / (FRAMES - 1);
  // Lion on the left bank (row 4, col 0) hops across water to (row 4, col 3).
  const fromX = bx + 0.5 * cellW, fromY = by + 4.5 * cellH;
  const toX = bx + 3.5 * cellW, toY = by + 4.5 * cellH;
  const jumpT = Math.min(1, t * 1.12);
  const jx = fromX + (toX - fromX) * jumpT;
  const jy = fromY + (toY - fromY) * jumpT - Math.sin(jumpT * Math.PI) * cellH * 0.85;
  // Elephant on the right bank, rat in the left river.
  const elX = bx + 6.5 * cellW, elY = by + 6.5 * cellH;
  const ratX = bx + 1.5 * cellW, ratY = by + 4.5 * cellH;
  const settled = [
    [0, 0, false], [0, 6, false],
    [8, 0, true], [8, 6, true],
    [2, 0, false], [6, 6, true],
    [1, 1, false], [7, 5, true],
  ];
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = CARD.slice();
      const inside = x >= bx && x <= bx + bw && y >= by && y <= by + bh;
      if (inside) {
        col = FRAME.slice();
        const c = Math.min(COLS - 1, Math.max(0, Math.floor((x - bx) / cellW)));
        const r = Math.min(ROWS - 1, Math.max(0, Math.floor((y - by) / cellH)));
        const gx = bx + c * cellW, gy = by + r * cellH;
        const inset = 0.45;
        if (x > gx + inset && x < gx + cellW - inset && y > gy + inset && y < gy + cellH - inset) {
          if ((r === 0 && c === 3) || (r === 8 && c === 3)) col = DEN.slice();
          else if ((r === 0 && (c === 2 || c === 4)) || (r === 8 && (c === 2 || c === 4)) ||
                   (r === 1 && c === 3) || (r === 7 && c === 3)) col = TRAP.slice();
          else if (isWaterCell(r, c)) col = ((r + c) & 1) ? WATER2.slice() : WATER.slice();
          else col = ((r + c) & 1) ? LAND2.slice() : LAND.slice();
          const cx = bx + (c + 0.5) * cellW, cy = by + (r + 0.5) * cellH;
          for (const s of settled) {
            if (s[0] === r && s[1] === c) {
              col = disc(col, x, y, cx, cy, pieceR, s[2] ? RED_H : BLUE_H, s[2] ? RED : BLUE);
            }
          }
        }
      }
    }
    col = disc(col, x, y, ratX, ratY, pieceR * 0.72, BLUE_H, BLUE);
    col = disc(col, x, y, elX, elY, pieceR * 1.15, RED_H, RED);
    col = disc(col, x, y, jx, jy, pieceR, BLUE_H, BLUE);
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0, nss = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
    }
    if (a / nss < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / nss, g / nss, b / nss);
  }
  return idx;
}

export function jungleIcon() {
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
  'J': [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
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
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  ' ': [0, 0, 0, 0, 0, 0, 0],
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

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = (x + y) / (W + H);
    put(x, y, (10 + t * 8) | 0, (10 + t * 10) | 0, (15 + t * 6) | 0);
  }

  const COLS = 7, ROWS = 9, cell = 68;
  const boardW = COLS * cell, boardH = ROWS * cell;
  const bx = 48, by = 54;
  fill(bx - 12, by - 12, bx + boardW + 12, by + boardH + 12, 22, 48, 28);

  function discAt(cx, cy, rad, hi, lo) {
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      if (dx * dx + dy * dy > rad * rad) continue;
      const u = (dx + rad) / (rad * 2);
      put(cx + dx, cy + dy,
        (hi[0] + (lo[0] - hi[0]) * u) | 0,
        (hi[1] + (lo[1] - hi[1]) * u) | 0,
        (hi[2] + (lo[2] - hi[2]) * u) | 0);
    }
  }

  // Mid-game: a lion on the left bank, a rat in the river, an elephant
  // on the far bank, several pieces already off. Letters + ranks readable.
  // 0 empty, 1-8 blue, 11-18 red (rank + 10).
  const grid = [
    [6, 0, 0, 0, 0, 0, 7],
    [0, 2, 0, 0, 0, 3, 0],
    [8, 0, 0, 0, 5, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 1, 0, 5, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 16],
    [11, 0, 15, 0, 0, 0, 18],
    [0, 13, 0, 0, 0, 12, 0],
    [17, 0, 0, 0, 0, 0, 0],
  ];
  const LETTER = ['', 'R', 'C', 'D', 'W', 'P', 'T', 'L', 'E'];
  const BLUE_H = [106, 164, 216], BLUE = [58, 122, 184];
  const RED_H = [224, 122, 90], RED = [196, 74, 58];

  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const gx = bx + c * cell, gy = by + r * cell;
    const water = (r >= 3 && r <= 5) && (c === 1 || c === 2 || c === 4 || c === 5);
    const den = (c === 3 && (r === 0 || r === 8));
    const trap = (c === 3 && (r === 1 || r === 7)) ||
      ((c === 2 || c === 4) && (r === 0 || r === 8));
    if (den) fill(gx, gy, gx + cell, gy + cell, 26, 18, 16);
    else if (trap) fill(gx, gy, gx + cell, gy + cell, 106, 90, 34);
    else if (water) fill(gx, gy, gx + cell, gy + cell, ((r + c) & 1) ? 36 : 26, ((r + c) & 1) ? 96 : 74, ((r + c) & 1) ? 140 : 110);
    else fill(gx, gy, gx + cell, gy + cell, ((r + c) & 1) ? 58 : 47, ((r + c) & 1) ? 124 : 106, ((r + c) & 1) ? 68 : 56);
    const v = grid[r][c];
    if (!v) continue;
    const red = v > 10, rk = red ? v - 10 : v;
    const cx = bx + (c + 0.5) * cell, cy = by + (r + 0.5) * cell, rad = cell * 0.36;
    discAt(cx, cy, rad, red ? RED_H : BLUE_H, red ? RED : BLUE);
    const letter = LETTER[rk];
    const tw = 5 * 4;
    drawText(put, (cx - tw / 2) | 0, (cy - 16) | 0, letter, 4, 255, 255, 255);
    drawText(put, (cx + 8) | 0, (cy + 8) | 0, String(rk), 2, 255, 255, 230);
  }

  drawText(put, 560, 90, 'JUNGLE', 10, 125, 204, 106);
  drawText(put, 560, 180, 'ANIMAL CHESS', 5, 232, 238, 230);
  drawText(put, 560, 280, 'COMPUTER ON', 4, 184, 210, 176);
  drawText(put, 560, 330, 'THIS DEVICE', 4, 184, 210, 176);
  drawText(put, 560, 420, 'OR A FRIEND', 4, 125, 204, 106);
  drawText(put, 560, 470, 'FROM ONE LINK', 4, 125, 204, 106);
  drawText(put, 560, 560, 'RAT TAKES', 3, 196, 74, 58);
  drawText(put, 560, 600, 'ELEPHANT', 3, 196, 74, 58);

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
