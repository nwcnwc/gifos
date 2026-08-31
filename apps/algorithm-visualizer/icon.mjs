// Procedural icon: six bars, two swap — reads as "sorting" at 64px.
// Cover is the player mid-swap (chart + array + log), not an empty first boot.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [36, 36, 38];
const CARD_B = [22, 22, 24];
const BAR = [168, 168, 168];
const SEL = [61, 139, 253];
const PATCH = [196, 77, 122];
const INK = [232, 232, 232];
const MUTED = [140, 140, 144];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, BAR, SEL, PATCH, INK, MUTED]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
  }
  return pal;
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

// Heights of six bars. Frames 0–4: i=2 (tall) vs i=3 (short) highlight then swap.
const H0 = [4, 9, 14, 6, 11, 8];
function barsAt(f) {
  const h = H0.slice();
  const swap = f >= 6;
  if (swap) { const t = h[2]; h[2] = h[3]; h[3] = t; }
  let c2 = BAR, c3 = BAR;
  if (f >= 2 && f < 6) { c2 = SEL; c3 = SEL; }
  if (f >= 6 && f < 10) { c2 = PATCH; c3 = PATCH; }
  const cols = [BAR, BAR, c2, c3, BAR, BAR];
  return { h, cols };
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const { h, cols } = barsAt(f);
  const maxH = 16;
  const baseY = 108, left = 18, gap = 4, bw = 14;
  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 22)) continue;
      let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      for (let i = 0; i < 6; i++) {
        const x0 = left + i * (bw + gap);
        const bh = 18 + h[i] * 4.2;
        const y0 = baseY - bh;
        if (x >= x0 && x <= x0 + bw && y >= y0 && y <= baseY) {
          const edge = x < x0 + 1.2 || x > x0 + bw - 1.2 || y < y0 + 1.2;
          col = edge ? mix(cols[i], [0, 0, 0], 0.25) : cols[i];
        }
      }
      // playhead under the pair being compared
      if (f >= 2 && f < 10) {
        const mx = left + 2 * (bw + gap) + bw;
        if (Math.abs(x - mx) < 18 && y > baseY + 4 && y < baseY + 9) col = SEL;
      }
      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = SS * SS;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
          r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
        }
      }
      if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
      idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
    }
  }
  return idx;
}

export function algoIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0;
    flat[i * 3 + 1] = pal[i][1] | 0;
    flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return {
    width: OUT, height: OUT, palette: flat, numColors: CT,
    minCodeSize: 6, frames, delayCs: 12, transparentIndex: 0
  };
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
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01111, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b01111],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '=': [0, 0b11111, 0, 0b11111, 0, 0, 0],
  '[': [0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110],
  ']': [0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110],
  '/': [0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b10000, 0b10000],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  3: [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  5: [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  6: [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  ',': [0, 0, 0, 0, 0, 0b00100, 0b01000],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (gph[row] & (1 << (4 - col))) {
          for (let dy = 0; dy < s; dy++) {
            for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
          }
        }
      }
    }
    cx += 6 * s;
  }
}

function fillRect(put, x, y, w, h, r, g, b) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) put(xx, yy, r, g, b);
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
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 37, 37, 37);

  // Sidebar
  fillRect(put, 0, 0, 220, H, 43, 43, 43);
  drawText(put, 18, 18, 'ALGORITHMS', 2, 154, 154, 154);
  const cats = [
    [48, 'SORTING', false],
    [78, 'BUBBLE SORT', false],
    [106, 'INSERTION SORT', false],
    [134, 'QUICKSORT', true],
    [162, 'MERGE SORT', false],
    [200, 'SEARCH', false],
    [228, 'BINARY SEARCH', false],
    [266, 'GRAPH', false],
    [294, 'BFS', false],
    [322, 'DIJKSTRA', false],
    [360, 'DYNAMIC PROGRAMMING', false],
  ];
  for (const [yy, label, on] of cats) {
    if (on) fillRect(put, 0, yy - 8, 220, 26, 68, 68, 68);
    if (on) fillRect(put, 0, yy - 8, 4, 26, 61, 139, 253);
    const c = on ? [255, 255, 255] : (label.length > 12 && label.indexOf(' ') < 0 ? [125, 125, 125] : [210, 210, 210]);
    drawText(put, 18, yy, label, 2, c[0], c[1], c[2]);
  }

  // Header
  fillRect(put, 220, 0, W - 220, 56, 47, 47, 47);
  drawText(put, 240, 14, 'QUICKSORT', 3, 232, 232, 232);
  drawText(put, 240, 38, 'PIVOT 9 AT 10', 2, 154, 154, 154);

  // Chart
  const vals = [1, 4, 2, 7, 6, 2, 4, 5, 9, 4, 2, 8, 7, 2, 2];
  const sel = { 1: 1, 14: 1 };
  const patch = { 8: 1 };
  const chartL = 270, chartT = 90, chartW = 860, chartH = 280;
  const max = 9;
  const bw = (chartW / vals.length) | 0;
  for (let i = 0; i < vals.length; i++) {
    const bh = Math.max(12, (vals[i] / max) * chartH);
    const x = chartL + i * bw + 8;
    let col = [154, 154, 154];
    if (sel[i]) col = [61, 139, 253];
    if (patch[i]) col = [196, 77, 122];
    fillRect(put, x, chartT + chartH - bh, bw - 14, bh, col[0], col[1], col[2]);
    drawText(put, x + 4, chartT + chartH + 8, String(vals[i]), 2, 176, 176, 176);
  }

  // Array row
  const ay = 430;
  for (let i = 0; i < vals.length; i++) {
    const x = 270 + i * 56;
    let bg = [58, 58, 58];
    if (sel[i]) bg = [61, 139, 253];
    if (patch[i]) bg = [196, 77, 122];
    fillRect(put, x, ay, 48, 48, bg[0], bg[1], bg[2]);
    drawText(put, x + 14, ay + 10, String(vals[i]), 3, 240, 240, 240);
    drawText(put, x + 18, ay + 34, String(i), 1, 180, 180, 180);
  }

  // Log
  drawText(put, 270, 500, 'LOGTRACER', 2, 140, 140, 140);
  drawText(put, 270, 530, 'ORIGINAL ARRAY = [1, 4, 2, 7, 6, 2, 4, 5, 9, 4, 2, 8, 7, 2, 2]', 2, 200, 200, 200);
  drawText(put, 270, 556, 'PIVOT 9 AT 10', 2, 200, 200, 200);
  drawText(put, 270, 582, 'SWAP 4 AND 2', 2, 200, 200, 200);

  // Player
  fillRect(put, 220, H - 56, W - 220, 56, 32, 32, 32);
  fillRect(put, 250, H - 42, 70, 28, 47, 107, 64);
  drawText(put, 262, H - 34, 'PAUSE', 2, 230, 255, 236);
  fillRect(put, 340, H - 34, 520, 8, 70, 70, 70);
  fillRect(put, 340, H - 34, 210, 8, 61, 139, 253);
  drawText(put, 880, H - 36, '42 / 180', 2, 154, 154, 154);
  drawText(put, 1040, H - 36, '1X', 2, 154, 154, 154);

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
