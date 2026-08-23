// Procedural icon: a wood checkers board, a black man jumping a white one,
// a king already on the far side. Pure Node, super-sample → box-downsample.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [22, 16, 12];
const FRAME = [58, 36, 20];
const LIGHT = [232, 213, 176];
const DARK = [90, 56, 32];
const DARK2 = [106, 70, 40];
const BLACK_H = [90, 90, 90];
const BLACK = [17, 17, 17];
const WHITE_H = [255, 255, 250];
const WHITE = [196, 196, 196];
const GOLD = [232, 180, 64];
const GOLD2 = [255, 224, 138];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, FRAME, LIGHT, DARK, DARK2, BLACK_H, BLACK, WHITE_H, WHITE, GOLD, GOLD2]) {
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
function ring(col, x, y, cx, cy, rad, w, color) {
  const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
  if (d > rad || d < rad - w) return col;
  return color.slice();
}
function kingDisc(col, x, y, cx, cy, rad, hi, lo) {
  col = disc(col, x, y, cx, cy, rad, hi, lo);
  col = ring(col, x, y, cx, cy, rad * 0.58, rad * 0.12, GOLD);
  return col;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 18;
  const N = 4;
  const bx = 14, by = 14, bw = OUT - 28, bh = OUT - 28;
  const cell = bw / N;
  const pieceR = cell * 0.40;
  const t = f / (FRAMES - 1);
  // Black on (0,1) jumps white on (1,2), lands on (2,3). A white king sits (3,0).
  const from = [0, 1], over = [1, 2], to = [2, 3];
  const fromX = bx + (from[1] + 0.5) * cell, fromY = by + (from[0] + 0.5) * cell;
  const toX = bx + (to[1] + 0.5) * cell, toY = by + (to[0] + 0.5) * cell;
  const overX = bx + (over[1] + 0.5) * cell, overY = by + (over[0] + 0.5) * cell;
  const jumpT = Math.min(1, t * 1.12);
  const jx = fromX + (toX - fromX) * jumpT;
  const jy = fromY + (toY - fromY) * jumpT - Math.sin(jumpT * Math.PI) * cell * 0.62;
  const captured = jumpT > 0.52;
  const settled = [
    [3, 0, false, true],  // white king
    [3, 2, false, false],
    [0, 3, true, false],
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
        const c = Math.min(N - 1, Math.max(0, Math.floor((x - bx) / cell)));
        const r = Math.min(N - 1, Math.max(0, Math.floor((y - by) / cell)));
        const gx = bx + c * cell, gy = by + r * cell;
        const inset = 0.5;
        if (x > gx + inset && x < gx + cell - inset && y > gy + inset && y < gy + cell - inset) {
          const dark = (r + c) & 1;
          col = dark ? mix(DARK2, DARK, (x - gx) / cell) : LIGHT.slice();
          // dest ring before the jumper lands
          if (r === to[0] && c === to[1] && jumpT < 0.92) {
            col = ring(col, x, y, toX, toY, cell * 0.36, 2.2, GOLD2);
          }
          const cx = bx + (c + 0.5) * cell, cy = by + (r + 0.5) * cell;
          for (const s of settled) {
            if (s[0] === r && s[1] === c) {
              col = s[3]
                ? kingDisc(col, x, y, cx, cy, pieceR, s[2] ? BLACK_H : WHITE_H, s[2] ? BLACK : WHITE)
                : disc(col, x, y, cx, cy, pieceR, s[2] ? BLACK_H : WHITE_H, s[2] ? BLACK : WHITE);
            }
          }
          if (r === over[0] && c === over[1] && !captured) {
            col = disc(col, x, y, overX, overY, pieceR, WHITE_H, WHITE);
          }
        }
      }
    }
    col = disc(col, x, y, jx, jy, pieceR * (jumpT > 0.08 && jumpT < 0.92 ? 1.08 : 1), BLACK_H, BLACK);
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

export function checkersIcon() {
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
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'J': [0b01111, 0b00001, 0b00001, 0b00001, 0b10001, 0b10001, 0b01110],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
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
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0, 0b00100],
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
  const fillRound = (x0, y0, x1, y1, rad, r, g, b) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x1 - rad);
      const cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= rad * rad) put(x, y, r, g, b);
    }
  };

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = (x + y) / (W + H);
    put(x, y, (18 + t * 12) | 0, (12 + t * 8) | 0, (8 + t * 6) | 0);
  }

  const N = 10, cell = 54;
  const board = N * cell;
  const bx = ((W - board) / 2) | 0, by = 78;
  fill(bx - 12, by - 12, bx + board + 12, by + board + 12, 58, 36, 20);

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
  function kingAt(cx, cy, rad, hi, lo) {
    discAt(cx, cy, rad, hi, lo);
    const ir = rad * 0.54, iw = Math.max(2, rad * 0.1);
    for (let dy = -ir; dy <= ir; dy++) for (let dx = -ir; dx <= ir; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > ir || d < ir - iw) continue;
      put(cx + dx, cy + dy, 232, 180, 64);
    }
  }
  const BLACK_H = [90, 90, 90], BLACK = [17, 17, 17];
  const WHITE_H = [255, 255, 250], WHITE = [196, 196, 196];
  // Mid-game: a white king, a forced jump for the selected white man.
  // 1 black  2 white  3 white king  4 black king
  // Jump: white at 5,4 over black at 4,3 onto empty 3,2.
  const grid = [
    [0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1, 0, 0, 0, 1, 0],
    [0, 3, 0, 1, 0, 0, 0, 1, 0, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
    [0, 1, 0, 1, 0, 0, 0, 4, 0, 0],
    [0, 0, 2, 0, 2, 0, 2, 0, 0, 0],
    [0, 2, 0, 0, 0, 2, 0, 2, 0, 2],
    [2, 0, 2, 0, 2, 0, 2, 0, 2, 0],
    [0, 2, 0, 2, 0, 2, 0, 2, 0, 2],
    [2, 0, 2, 0, 0, 0, 2, 0, 2, 0],
  ];
  const sel = [5, 4], dest = [3, 2], lastFrom = [6, 1], lastTo = [5, 0];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const gx = bx + c * cell, gy = by + r * cell;
    if ((r + c) & 1) fill(gx, gy, gx + cell, gy + cell, 90, 56, 32);
    else fill(gx, gy, gx + cell, gy + cell, 232, 213, 176);
    if ((r === lastFrom[0] && c === lastFrom[1]) || (r === lastTo[0] && c === lastTo[1])) {
      for (let i = 0; i < 3; i++) {
        fill(gx + i, gy + i, gx + cell - i, gy + 3, 232, 180, 64);
        fill(gx + i, gy + cell - 3, gx + cell - i, gy + cell - i, 232, 180, 64);
        fill(gx + i, gy + i, gx + 3, gy + cell - i, 232, 180, 64);
        fill(gx + cell - 3, gy + i, gx + cell - i, gy + cell - i, 232, 180, 64);
      }
    }
    const cx = bx + (c + 0.5) * cell, cy = by + (r + 0.5) * cell, rad = cell * 0.40;
    if (r === dest[0] && c === dest[1]) {
      const rr = cell * 0.40;
      for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= rr && d >= rr - 5) put(cx + dx, cy + dy, 255, 224, 138);
        else if (d < rr - 5) put(cx + dx, cy + dy, 90, 56, 32);
      }
      // gold fill in the hole so a card-size cover still reads "jump here"
      const hole = cell * 0.16;
      for (let dy = -hole; dy <= hole; dy++) for (let dx = -hole; dx <= hole; dx++) {
        if (dx * dx + dy * dy <= hole * hole) put(cx + dx, cy + dy, 232, 180, 64);
      }
    }
    const v = grid[r][c];
    if (v === 1) discAt(cx, cy, rad, BLACK_H, BLACK);
    else if (v === 2) discAt(cx, cy, rad, WHITE_H, WHITE);
    else if (v === 3) kingAt(cx, cy, rad, WHITE_H, WHITE);
    else if (v === 4) kingAt(cx, cy, rad, BLACK_H, BLACK);
    if (r === sel[0] && c === sel[1]) {
      const rr = rad + 4;
      for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > rr || d < rad + 1) continue;
        put(cx + dx, cy + dy, 255, 224, 138);
      }
    }
  }

  // Turn pill: You must jump.
  const pillW = 520, pillH = 40, px = ((W - pillW) / 2) | 0, py = 24;
  fillRound(px, py, px + pillW, py + pillH, 12, 48, 36, 18);
  drawText(put, px + 86, py + 12, 'YOU MUST JUMP. YOUR TURN.', 3, 255, 224, 138);

  // Score under the board — side to play (white) is the lit disc.
  const sy = by + board + 28;
  discAt(bx + 48, sy, 10, WHITE_H, WHITE);
  drawText(put, bx + 66, sy - 10, '16', 3, 255, 224, 176);
  discAt(bx + board - 90, sy, 10, BLACK_H, BLACK);
  drawText(put, bx + board - 72, sy - 10, '17', 3, 160, 160, 160);

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
