// Procedural Nonogram icon: cream card, a 5×5 plus filling in with yellow
// mesh and blue cells. Pure Node, super-sample → box-downsample → small
// palette; deterministic so builds reproduce.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CREAM = [244, 241, 234];
const CARD = [255, 255, 255];
const INK = [17, 17, 17];
const MUTED = [85, 85, 85];
const BLUE = [14, 190, 255];
const BLUED = [10, 154, 212];
const GREEN = [71, 207, 115];
const YELLOW = [252, 208, 0];
const RED = [255, 60, 65];
const MESH = [221, 216, 204];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CREAM, CARD, INK, MUTED, BLUE, BLUED, GREEN, YELLOW, RED, MESH]) {
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
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b01010, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  ':': [0, 0b00100, 0b00100, 0, 0b00100, 0b00100, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '×': [0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b01010, 0b10001],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
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

// 5×5 plus filling in — first easy puzzle.
const ORDER = [
  [2, 2], [2, 1], [2, 3], [1, 2], [3, 2],
  [2, 0], [2, 4], [0, 2], [4, 2],
];

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 6, rad = 18;
  const gx0 = 22, gy0 = 18, gx1 = 98, gy1 = 94;
  const n = Math.min(ORDER.length, Math.floor((f / (FRAMES - 1)) * ORDER.length + 0.01));
  const filled = {};
  for (let k = 0; k < n; k++) filled[ORDER[k][0] + ',' + ORDER[k][1]] = 1;

  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = CREAM;
      if (rrPix(x, y, gx0 - 2, gy0 - 2, gx1 + 2, gy1 + 2, 3)) col = MESH;
      const inner = (gx1 - gx0) / 5;
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
        const x0 = gx0 + c * inner, y0 = gy0 + r * inner;
        if (x >= x0 && x < x0 + inner && y >= y0 && y < y0 + inner) {
          col = filled[r + ',' + c] ? BLUE : CARD;
          if (x < x0 + 0.8 || y < y0 + 0.8) col = mix(col, YELLOW, 0.55);
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
  const rowHints = ['1', '1', '5', '1', '1'];
  const colHints = ['1', '1', '5', '1', '1'];
  const inner = (gx1 - gx0) / 5;
  for (let r = 0; r < 5; r++) {
    const ok = n >= 9;
    const ink = ok ? GREEN : MUTED;
    drawText(put, gx1 + 6, Math.round(gy0 + r * inner + inner / 2 - 4), rowHints[r], 1, ink[0], ink[1], ink[2]);
  }
  for (let c = 0; c < 5; c++) {
    const ok = n >= 9;
    const ink = ok ? GREEN : MUTED;
    drawText(put, Math.round(gx0 + c * inner + inner / 2 - 3), gy1 + 4, colHints[c], 1, ink[0], ink[1], ink[2]);
  }

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0, nn = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
    }
    if (a / nn < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / nn, g / nn, b / nn);
  }
  return idx;
}

export function nonogramIcon() {
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

const HEART = [
  [0, 1, 1, 0, 0, 0, 1, 1, 0, 0],
  [1, 1, 1, 1, 0, 1, 1, 1, 1, 0],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [0, 1, 1, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
  [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
  [0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
];

function hintsOfLine(line) {
  const hints = [];
  let run = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i]) run += 1;
    else if (run) { hints.push(run); run = 0; }
  }
  if (run) hints.push(run);
  return hints.length ? hints : [0];
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

  fill(0, 0, W, H, 244, 241, 234);
  drawText(put, 48, 56, 'NONOGRAM', 6, 10, 154, 212);
  drawText(put, 48, 128, 'PICROSS', 4, 85, 85, 85);
  drawText(put, 48, 178, 'SAME PUZZLE', 4, 14, 190, 255);
  drawText(put, 48, 228, 'FIRST TO FINISH', 4, 71, 207, 115);

  rr(48, 300, 500, 380, 14, 255, 255, 255);
  drawText(put, 72, 324, 'YOU  0:48', 4, 10, 154, 212);
  rr(48, 400, 500, 480, 14, 255, 255, 255);
  drawText(put, 72, 424, 'SAM  1:12', 4, 85, 85, 85);

  drawText(put, 48, 530, 'TAP TO FILL', 3, 85, 85, 85);
  drawText(put, 48, 580, 'DRAG A LINE', 3, 85, 85, 85);
  drawText(put, 48, 630, 'CROSS TO MARK', 3, 14, 190, 255);

  const bx = 560, by = 48, cell = 48, pad = 8;
  const board = pad * 2 + cell * 10;
  rr(bx, by, bx + board + 88, by + board + 88, 8, 255, 255, 255);
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) {
    const x0 = bx + pad + c * cell;
    const y0 = by + pad + r * cell;
    const on = HEART[r][c];
    fill(x0 + 1, y0 + 1, x0 + cell, y0 + cell, on ? 14 : 255, on ? 190 : 255, on ? 255 : 255);
  }
  for (let i = 0; i <= 10; i++) {
    const x = bx + pad + i * cell;
    const y = by + pad + i * cell;
    fill(x, by + pad, x + 1, by + pad + cell * 10, 252, 208, 0);
    fill(bx + pad, y, bx + pad + cell * 10, y + 1, 252, 208, 0);
  }
  for (let r = 0; r < 10; r++) {
    const h = hintsOfLine(HEART[r]);
    const y = by + pad + r * cell + 16;
    drawText(put, bx + pad + cell * 10 + 10, y, h.join(' '), 2, 71, 207, 115);
  }
  for (let c = 0; c < 10; c++) {
    const col = HEART.map((row) => row[c]);
    const h = hintsOfLine(col);
    const x = bx + pad + c * cell + 10;
    drawText(put, x, by + pad + cell * 10 + 12, String(h[0]), 2, 71, 207, 115);
    if (h[1]) drawText(put, x, by + pad + cell * 10 + 32, String(h[1]), 2, 71, 207, 115);
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
