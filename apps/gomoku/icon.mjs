// Procedural icon: a wooden goban, a fifth black stone completing a diagonal.
// Pure Node, super-sample → box-downsample. Deterministic.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 16;

const WOOD_A = [224, 176, 120];
const WOOD_B = [168, 116, 60];
const LINE = [48, 28, 10];
const BLACK_H = [96, 96, 96];
const BLACK = [18, 16, 14];
const WHITE_H = [250, 248, 242];
const WHITE = [196, 196, 204];
const CARD = [36, 24, 14];
const GOLD = [240, 193, 74];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [WOOD_A, WOOD_B, LINE, BLACK_H, BLACK, WHITE_H, WHITE, CARD, GOLD]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
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

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 18, boardIn = 20;
  const n = 5, span = OUT - 2 * boardIn, step = span / (n - 1);
  const stoneR = 9.4;
  // Four black on the diagonal; the fifth drops onto the last point and the line lights up.
  const blacks = [[0, 0], [1, 1], [2, 2], [3, 3]];
  const fifth = [4, 4];
  const whites = [[0, 2], [2, 0]];
  const dropFrames = 11;
  let u = f <= dropFrames ? f / dropFrames : 1;
  if (u < 1) u = u * u;
  const glow = f > dropFrames ? (0.55 + 0.45 * Math.sin((f - dropFrames) / (FRAMES - 1 - dropFrames) * Math.PI)) : 0;
  const fx = boardIn + fifth[1] * step;
  const fy1 = boardIn + fifth[0] * step;
  const fy = fy1 - (1 - u) * (fy1 - (boardIn - 6));
  function atStone(x, y, cx, cy, r) {
    return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
  }
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      const inside = x >= boardIn - 2 && x <= OUT - boardIn + 2 && y >= boardIn - 2 && y <= OUT - boardIn + 2;
      if (inside) {
        col = mix(WOOD_A, WOOD_B, Math.max(0, Math.min(1, (x + y) / (OUT * 2))));
        for (let i = 0; i < n; i++) {
          const p = boardIn + i * step;
          if (Math.abs(y - p) < 0.7 && x >= boardIn && x <= OUT - boardIn) col = LINE;
          if (Math.abs(x - p) < 0.7 && y >= boardIn && y <= OUT - boardIn) col = LINE;
        }
        const stars = [[2, 2]];
        for (const s of stars) {
          const sx = boardIn + s[1] * step, sy = boardIn + s[0] * step;
          if ((x - sx) * (x - sx) + (y - sy) * (y - sy) < 2.1 * 2.1) col = LINE;
        }
      } else col = CARD.slice();
      for (const s of whites) {
        const sx = boardIn + s[1] * step, sy = boardIn + s[0] * step;
        if (atStone(x, y, sx, sy, stoneR)) {
          const t = (x - (sx - 2)) / (stoneR * 2);
          col = mix(WHITE_H, WHITE, Math.max(0, Math.min(1, t)));
        }
      }
      for (const s of blacks) {
        const sx = boardIn + s[1] * step, sy = boardIn + s[0] * step;
        if (atStone(x, y, sx, sy, stoneR)) {
          const t = (x - (sx - 2.2)) / (stoneR * 2);
          col = mix(BLACK_H, BLACK, Math.max(0.2, Math.min(1, t)));
        }
      }
      if (atStone(x, y, fx, fy, stoneR)) {
        const t = (x - (fx - 2.2)) / (stoneR * 2);
        col = mix(BLACK_H, BLACK, Math.max(0.2, Math.min(1, t)));
      }
      if (glow > 0) {
        const line = blacks.concat([fifth]);
        for (const s of line) {
          const sx = boardIn + s[1] * step, sy = boardIn + s[0] * step;
          const d = Math.sqrt((x - sx) * (x - sx) + (y - sy) * (y - sy));
          if (d > stoneR * 0.98 && d < stoneR * 1.42) col = GOLD;
        }
      }
    }
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

export function gomokuIcon() {
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
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
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

  fill(0, 0, W, H, 26, 18, 12);
  // table
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = (x + y) / (W + H);
    put(x, y, (32 + t * 18) | 0, (20 + t * 10) | 0, (12 + t * 6) | 0);
  }

  const board = 680, bx = 40, by = 20;
  const N = 15, pad = 32, span = board - 2 * pad, step = span / (N - 1);
  for (let y = 0; y < board; y++) for (let x = 0; x < board; x++) {
    const t = (x + y) / (board * 2);
    const r = (224 - t * 56) | 0, g = (176 - t * 52) | 0, b = (118 - t * 40) | 0;
    put(bx + x, by + y, r, g, b);
  }
  // grid (2px so the 15 lines read at cover size)
  for (let i = 0; i < N; i++) {
    const p = Math.round(pad + i * step);
    for (let x = pad; x <= pad + span; x++) {
      put(bx + x, by + p, 48, 28, 10);
      put(bx + x, by + p + 1, 48, 28, 10);
    }
    for (let y = pad; y <= pad + span; y++) {
      put(bx + p, by + y, 48, 28, 10);
      put(bx + p + 1, by + y, 48, 28, 10);
    }
  }
  function star(r, c) {
    const x = bx + pad + c * step, y = by + pad + r * step;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (dx * dx + dy * dy <= 9) put(x + dx, y + dy, 42, 24, 8);
    }
  }
  [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]].forEach(function (p) { star(p[0], p[1]); });

  function stone(r, c, black, mark) {
    const x = bx + pad + c * step, y = by + pad + r * step, rad = step * 0.46;
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      if (dx * dx + dy * dy > rad * rad) continue;
      const u = (dx + rad) / (rad * 2);
      if (black) put(x + dx, y + dy, (90 - u * 72) | 0, (88 - u * 72) | 0, (86 - u * 72) | 0);
      else put(x + dx, y + dy, (250 - u * 50) | 0, (248 - u * 48) | 0, (242 - u * 30) | 0);
    }
    if (mark) {
      const ring = rad + 3;
      for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > rad + 0.2 && d <= ring) put(x + dx, y + dy, black ? 252 : 32, black ? 250 : 20, black ? 240 : 10);
      }
    }
  }
  // A mid-game fight — not an opening, not an empty board. Alternating, no overlap.
  const moves = [
    [7, 7], [7, 8],
    [6, 8], [6, 7],
    [8, 6], [8, 7],
    [5, 7], [7, 6],
    [7, 5], [5, 8],
    [9, 9], [8, 8],
    [4, 8], [4, 7],
    [8, 4], [9, 6],
    [6, 6], [5, 6],
    [5, 5], [6, 5],
    [8, 9], [9, 8],
    [4, 6], [4, 5],
    [6, 4], [7, 4],
    [9, 7], [10, 7],
    [3, 9], [3, 8],
    [10, 6], [10, 8],
    [4, 9], [5, 9],
    [8, 5], [9, 5],
    [6, 9], [6, 10],
    [3, 7], [3, 6],
    [9, 4], [10, 5],
    [2, 8], [2, 7],
    [11, 7], [11, 6],
    [1, 9], [12, 5],
    [12, 9], [1, 6],
    [2, 10], [13, 7],
  ];
  const seen = new Set();
  for (const p of moves) {
    const k = p[0] + ',' + p[1];
    if (seen.has(k)) throw new Error('cover stone overlap at ' + k);
    seen.add(k);
  }
  moves.forEach(function (p, i) {
    stone(p[0], p[1], i % 2 === 0, i === moves.length - 1);
  });

  drawText(put, 760, 140, 'GOMOKU', 9, 232, 196, 122);
  drawText(put, 760, 230, 'FIVE IN A ROW', 4, 196, 154, 96);
  drawText(put, 760, 360, 'COMPUTER', 3, 232, 220, 200);
  drawText(put, 760, 410, 'OR A FRIEND', 3, 232, 220, 200);
  drawText(put, 760, 500, 'FIVE IN A ROW', 3, 176, 140, 96);

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
