// Procedural My Mind icon: a map that grows a child, then a sibling.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CREAM = [238, 238, 221];
const INK = [51, 51, 68];
const LINE = [120, 120, 110];
const ROOT = [255, 210, 90];
const BLUE = [90, 180, 230];
const GREEN = [90, 210, 160];
const PURPLE = [200, 150, 230];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
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
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CREAM, INK, LINE, ROOT, BLUE, GREEN, PURPLE, [255, 255, 255]]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.22).map(Math.round));
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
function rr(rgba, w, x0, y0, x1, y1, rad, col) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
    const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) {
      const o = (y * w + x) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }
}
function line(rgba, w, x0, y0, x1, y1, col, thick) {
  const n = Math.max(2, Math.hypot(x1 - x0, y1 - y0) | 0);
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * (i / n);
    const y = y0 + (y1 - y0) * (i / n);
    rr(rgba, w, x - thick, y - thick, x + thick, y + thick, thick, col);
  }
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  const m = 8, rad = 16;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    if (!inCard(x, y, m, rad)) continue;
    const o = (py * RW + px) * 4;
    rgba[o] = CREAM[0]; rgba[o + 1] = CREAM[1]; rgba[o + 2] = CREAM[2]; rgba[o + 3] = 1;
  }
  const s = SS;
  function R(x0, y0, x1, y1, r, col) {
    rr(rgba, RW, x0 * s, y0 * s, x1 * s, y1 * s, r * s, col);
  }
  function L(x0, y0, x1, y1) {
    line(rgba, RW, x0 * s, y0 * s, x1 * s, y1 * s, LINE, 1.2 * s);
  }
  // Root always present.
  R(40, 28, 88, 52, 6, ROOT);
  if (t > 0.18) {
    L(42, 40, 28, 68);
    R(14, 62, 46, 86, 5, BLUE);
  }
  if (t > 0.45) {
    L(86, 40, 102, 68);
    R(82, 62, 114, 86, 5, GREEN);
  }
  if (t > 0.72) {
    L(30, 86, 30, 102);
    R(14, 100, 48, 118, 5, PURPLE);
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

export function myMindIcon() {
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
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (gph[row] & (1 << (4 - col))) {
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
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
  const bubble = (x, y, w, h, r, g, b, label, inkR, inkG, inkB) => {
    const rad = 12;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const cx = Math.min(Math.max(xx, x + rad), x + w - rad - 1);
      const cy = Math.min(Math.max(yy, y + rad), y + h - rad - 1);
      if ((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) <= rad * rad) put(xx, yy, r, g, b);
    }
    const tw = String(label).length * 18;
    drawText(put, x + Math.max(16, ((w - tw) / 2) | 0), y + Math.max(16, ((h - 21) / 2) | 0), label, 3, inkR, inkG, inkB);
  };
  const elbow = (x0, y0, x1, y1) => {
    const mx = (x0 + x1) / 2;
    fill(x0, y0 - 2, mx + 2, y0 + 2, 140, 140, 128);
    fill(mx - 2, Math.min(y0, y1), mx + 2, Math.max(y0, y1), 140, 140, 128);
    fill(mx, y1 - 2, x1, y1 + 2, 140, 140, 128);
  };

  fill(0, 0, W, H, 238, 238, 221);
  bubble(460, 70, 280, 64, 255, 210, 90, 'WEEKEND', 40, 32, 16);
  bubble(80, 250, 220, 56, 90, 180, 230, 'PACK', 20, 32, 48);
  bubble(80, 400, 240, 52, 180, 210, 240, 'PASSPORT', 20, 32, 48);
  bubble(80, 520, 220, 52, 180, 210, 240, 'CLOTHES', 20, 32, 48);
  bubble(480, 280, 240, 56, 90, 210, 160, 'BOOK', 16, 40, 28);
  bubble(460, 430, 240, 52, 160, 230, 200, 'FLIGHTS', 16, 40, 28);
  bubble(460, 550, 220, 52, 160, 230, 200, 'HOTEL', 16, 40, 28);
  bubble(880, 250, 240, 56, 200, 150, 230, 'EAT', 40, 20, 48);
  bubble(900, 400, 220, 52, 220, 180, 240, 'LUNCH', 40, 20, 48);
  elbow(600, 134, 190, 250);
  elbow(190, 306, 190, 400);
  elbow(190, 452, 190, 520);
  elbow(600, 134, 600, 280);
  elbow(600, 336, 580, 430);
  elbow(600, 336, 570, 550);
  elbow(600, 134, 1000, 250);
  elbow(1000, 306, 1010, 400);
  drawText(put, 36, 672, 'THE FILE IS THE MAP. NOTHING IS UPLOADED.', 3, 90, 90, 80);

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
