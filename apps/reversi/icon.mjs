// Procedural icon: a green Reversi board, a black disk settling and a
// white one flipping. Pure Node, super-sample → box-downsample. Deterministic.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [14, 22, 20];
const FRAME = [47, 79, 79];
const GREEN = [58, 134, 100];
const GREEN_D = [42, 110, 82];
const BLACK_H = [70, 70, 70];
const BLACK = [17, 17, 17];
const WHITE_H = [250, 250, 244];
const WHITE = [220, 220, 214];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, FRAME, GREEN, GREEN_D, BLACK_H, BLACK, WHITE_H, WHITE]) {
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

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 18;
  const N = 8;
  const bx = 16, by = 16, bw = OUT - 32, bh = OUT - 32;
  const cell = bw / N;
  const diskR = cell * 0.38;
  const t = f / (FRAMES - 1);
  // opening: white d4, black e4, black d5, white e5. Black drops onto d3 and
  // flips d4.
  const dropCol = 3, dropRow = 2;
  const dropY0 = by + (dropRow + 0.5) * cell - 16;
  const dropY1 = by + (dropRow + 0.5) * cell;
  const dropY = dropY0 + (dropY1 - dropY0) * Math.min(1, t * 1.2);
  const flipT = Math.max(0, (t - 0.45) / 0.55);
  const settled = [
    [3, 3, false], [3, 4, true], [4, 3, true], [4, 4, false],
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
        const inset = 0.7;
        if (x > gx + inset && x < gx + cell - inset && y > gy + inset && y < gy + cell - inset) {
          col = mix(GREEN, GREEN_D, Math.max(0, Math.min(1, (x + y) / (OUT * 2))));
          const cx = bx + (c + 0.5) * cell, cy = by + (r + 0.5) * cell;
          for (const s of settled) {
            if (s[0] === r && s[1] === c) {
              const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
              if (d <= diskR * diskR) {
                const u = (x - (cx - 2)) / (diskR * 2);
                let black = s[2];
                if (r === 3 && c === 3 && flipT > 0) black = flipT > 0.5;
                col = black ? mix(BLACK_H, BLACK, Math.max(0, Math.min(1, u)))
                            : mix(WHITE_H, WHITE, Math.max(0, Math.min(1, u)));
              }
            }
          }
          if (c === dropCol && r === dropRow) {
            const dd = (x - cx) * (x - cx) + (y - dropY) * (y - dropY);
            if (dd <= diskR * diskR && Math.abs(dropY - cy) < diskR * 1.2) {
              const u = (x - (cx - 2)) / (diskR * 2);
              col = mix(BLACK_H, BLACK, Math.max(0, Math.min(1, u)));
            }
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
  fill(bx - 16, by - 16, bx + board + 16, by + board + 16, 47, 79, 79);

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
  const BLACK_H = [70, 70, 70], BLACK = [17, 17, 17];
  const WHITE_H = [250, 250, 244], WHITE = [220, 220, 214];
  // a real-looking opening that has spread a little from the four centre disks
  const grid = [
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 0, 0],
    [0, 0, 0, 1, 1, 1, 0, 0],
    [0, 0, 2, 2, 1, 0, 0, 0],
    [0, 0, 0, 1, 2, 2, 0, 0],
    [0, 0, 0, 0, 1, 2, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
  ];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const gx = bx + c * cell, gy = by + r * cell;
    fill(gx + 1, gy + 1, gx + cell - 1, gy + cell - 1, 58, 134, 100);
    const cx = bx + (c + 0.5) * cell, cy = by + (r + 0.5) * cell, rad = cell * 0.38;
    const v = grid[r][c];
    if (v === 1) discAt(cx, cy, rad, BLACK_H, BLACK);
    else if (v === 2) discAt(cx, cy, rad, WHITE_H, WHITE);
  }

  drawText(put, 740, 160, 'REVERSI', 9, 180, 230, 200);
  drawText(put, 740, 250, 'OTHELLO', 5, 58, 134, 100);
  drawText(put, 740, 360, 'COMPUTER', 3, 220, 232, 226);
  drawText(put, 740, 410, 'OR A FRIEND', 3, 220, 232, 226);
  drawText(put, 740, 500, 'BLACK GOES FIRST', 3, 155, 176, 168);

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
