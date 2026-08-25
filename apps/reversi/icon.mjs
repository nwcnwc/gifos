// Procedural icon: a disc flipping on green felt. Cover: a mid-game
// sandwich with a long line turning over. Pure Node, super-sample → box-downsample.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 16;

const CARD = [14, 22, 20];
const FRAME = [42, 69, 69];
const GREEN = [58, 134, 100];
const GREEN_D = [42, 110, 82];
const BLACK_H = [92, 92, 92];
const BLACK = [17, 17, 17];
const WHITE_H = [255, 255, 250];
const WHITE = [196, 196, 188];
const RIM = [214, 210, 198];
const GOLD = [232, 197, 71];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, FRAME, GREEN, GREEN_D, BLACK_H, BLACK, WHITE_H, WHITE, RIM, GOLD]) {
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

function discCol(x, y, cx, cy, rx, ry, hi, lo) {
  const nx = (x - cx) / rx, ny = (y - cy) / ry;
  if (nx * nx + ny * ny > 1) return null;
  const u = (x - (cx - rx * 0.55)) / (rx * 2.1);
  return mix(hi, lo, Math.max(0, Math.min(1, u)));
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 18;
  const t = f / (FRAMES - 1);
  // Disc turns white → edge-on → black. ScaleX is 1 at the ends, ~0.08 in the middle.
  const squash = 0.08 + 0.92 * Math.abs(2 * t - 1);
  const blackSide = t >= 0.5;
  const hi = blackSide ? BLACK_H : WHITE_H;
  const lo = blackSide ? BLACK : WHITE;
  const cx = OUT / 2, cy = OUT / 2 + 2;
  const ry = 38, rx = ry * squash;

  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = CARD.slice();
      const bx = 14, by = 14, bw = OUT - 28, bh = OUT - 28;
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
        col = FRAME.slice();
        const inset = 6;
        if (x > bx + inset && x < bx + bw - inset && y > by + inset && y < by + bh - inset) {
          col = mix(GREEN, GREEN_D, Math.max(0, Math.min(1, (x + y) / (OUT * 2))));
          // faint 3×3 grid so it still reads as a board at a glance
          const cell = (bw - inset * 2) / 3;
          const gx = ((x - (bx + inset)) / cell);
          const gy = ((y - (by + inset)) / cell);
          const fx = Math.abs(gx - Math.round(gx));
          const fy = Math.abs(gy - Math.round(gy));
          if ((fx < 0.025 && gx > 0.08 && gx < 2.92) || (fy < 0.025 && gy > 0.08 && gy < 2.92)) {
            col = mix(col, FRAME, 0.18);
          }
          const dcol = discCol(x, y, cx, cy, rx, ry, hi, lo);
          if (dcol) {
            col = dcol;
            if (squash < 0.28) col = mix(RIM, col, 0.35);
          }
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

export function reversiIcon() {
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
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
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
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
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
    put(x, y, (12 + t * 10) | 0, (20 + t * 16) | 0, (18 + t * 12) | 0);
  }

  const N = 8, cell = 72;
  const board = N * cell;
  const bx = 70, by = 72;
  fill(bx - 16, by - 16, bx + board + 16, by + board + 16, 42, 69, 69);

  function discEll(cx, cy, rx, ry, hi, lo, rim) {
    const rx2 = rx * rx, ry2 = ry * ry;
    for (let dy = -Math.ceil(ry) - 1; dy <= Math.ceil(ry) + 1; dy++) {
      for (let dx = -Math.ceil(rx) - 1; dx <= Math.ceil(rx) + 1; dx++) {
        if (dx * dx / rx2 + dy * dy / ry2 > 1) continue;
        const u = (dx + rx) / (rx * 2);
        let r = (hi[0] + (lo[0] - hi[0]) * u) | 0;
        let g = (hi[1] + (lo[1] - hi[1]) * u) | 0;
        let b = (hi[2] + (lo[2] - hi[2]) * u) | 0;
        if (rim && rx < ry * 0.4) {
          r = (r * 0.55 + RIM[0] * 0.45) | 0;
          g = (g * 0.55 + RIM[1] * 0.45) | 0;
          b = (b * 0.55 + RIM[2] * 0.45) | 0;
        }
        put(cx + dx, cy + dy, r, g, b);
      }
    }
  }
  function discAt(cx, cy, rad, hi, lo) { discEll(cx, cy, rad, rad, hi, lo, false); }

  // Mid-game. 1 black, 2 white, 0 empty.
  // Row 3 is a long sandwich: black just landed at c1, five whites flipping, black at c7.
  const grid = [
    [0, 0, 0, 1, 2, 0, 0, 0],
    [0, 0, 1, 1, 2, 2, 0, 0],
    [0, 1, 1, 1, 2, 2, 1, 0],
    [1, 1, 2, 2, 2, 2, 2, 1],
    [0, 2, 1, 1, 2, 1, 2, 0],
    [0, 0, 2, 1, 2, 1, 0, 0],
    [0, 0, 0, 1, 2, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 0, 0],
  ];
  // squash for the five whites on row 3, cols 2..6 — a wave of the flip
  const flipSx = { '3,2': 0.72, '3,3': 0.38, '3,4': 0.10, '3,5': 0.42, '3,6': 0.78 };
  const flipToBlack = { '3,2': 0.2, '3,3': 0.45, '3,4': 0.55, '3,5': 0.7, '3,6': 0.9 };

  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const gx = bx + c * cell, gy = by + r * cell;
    fill(gx + 1, gy + 1, gx + cell - 1, gy + cell - 1, 58, 134, 100);
    const cx = bx + (c + 0.5) * cell, cy = by + (r + 0.5) * cell, rad = cell * 0.38;
    const key = r + ',' + c;
    const v = grid[r][c];
    if (flipSx[key] != null) {
      const sx = flipSx[key];
      const toB = flipToBlack[key];
      const hi = mix(WHITE_H, BLACK_H, toB);
      const lo = mix(WHITE, BLACK, toB);
      discEll(cx, cy, rad * sx, rad, hi, lo, true);
    } else if (v === 1) discAt(cx, cy, rad, BLACK_H, BLACK);
    else if (v === 2) discAt(cx, cy, rad, WHITE_H, WHITE);
  }
  // gold last-move on the black that started the sandwich (row 3, col 1)
  {
    const cx = bx + (1 + 0.5) * cell, cy = by + (3 + 0.5) * cell;
    discAt(cx, cy, 6, GOLD, GOLD);
  }

  drawText(put, 740, 150, 'REVERSI', 9, 180, 230, 200);
  drawText(put, 740, 240, 'OTHELLO', 5, 58, 134, 100);
  drawText(put, 740, 350, 'COMPUTER', 3, 220, 232, 226);
  drawText(put, 740, 400, 'OR A FRIEND', 3, 220, 232, 226);
  drawText(put, 740, 490, 'ONE LINK', 3, 155, 176, 168);
  drawText(put, 740, 540, 'TRAPPED DISCS FLIP', 3, 155, 176, 168);

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
