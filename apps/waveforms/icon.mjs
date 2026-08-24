// Procedural Waveforms icon: a travelling wave that morphs sine→square→saw.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD = [244, 241, 234];
const INK = [3, 128, 244];
const AXIS = [176, 190, 197];
const PINK = [233, 30, 99];

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
  for (const b of [CARD, INK, AXIS, PINK, [33, 33, 33], [255, 255, 255], [15, 18, 32]]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.25).map(Math.round));
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

function sineY(t) { return Math.sin(t); }
function triY(t) {
  const p = ((t / (Math.PI * 2)) % 1 + 1) % 1;
  if (p < 0.25) return p / 0.25;
  if (p < 0.5) return 1 - (p - 0.25) / 0.25;
  if (p < 0.75) return -(p - 0.5) / 0.25;
  return -1 + (p - 0.75) / 0.25;
}
function sqY(t) { return Math.sin(t) >= 0 ? 1 : -1; }
function sawY(t) {
  const p = ((t / (Math.PI * 2)) % 1 + 1) % 1;
  return p * 2 - 1;
}
function morphY(t, f) {
  // 0–3 sine, 3–6 → square, 6–9 → saw, 9–12 → sine
  const x = f / FRAMES;
  let a, b, u;
  if (x < 0.25) { a = sineY; b = sineY; u = 0; }
  else if (x < 0.5) { a = sineY; b = sqY; u = (x - 0.25) / 0.25; }
  else if (x < 0.75) { a = sqY; b = sawY; u = (x - 0.5) / 0.25; }
  else { a = sawY; b = sineY; u = (x - 0.75) / 0.25; }
  const s = u * u * (3 - 2 * u);
  return a(t) * (1 - s) + b(t) * s;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 20, phase = f / FRAMES * Math.PI * 2;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    if (!inCard(x, y, m, rad)) continue;
    let col = CARD;
    if (Math.abs(y - 64) < 0.7) col = AXIS;
    const t = (x / 128) * Math.PI * 2 * 2 + phase;
    const yy = 64 - morphY(t, f) * 28;
    const d = Math.abs(y - yy);
    if (d < 2.4) col = mix(INK, PINK, (f / FRAMES) * 0.35);
    else if (d < 3.2) col = mix(CARD, INK, 0.45);
    const o = (py * RW + px) * 4;
    rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
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

export function waveformsIcon() {
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

// 5×7 glyphs, full A–Z 0–9 plus the punctuation the covers need.
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
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  3: [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  5: [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  6: [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  ',': [0, 0, 0, 0, 0b00100, 0b00100, 0b01000],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '/': [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  ':': [0, 0b00100, 0b00100, 0, 0b00100, 0b00100, 0],
  '+': [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  '×': [0, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0],
};
function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const gph = GLYPHS[ch] || GLYPHS[' '];
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (gph[row] & (1 << (4 - col))) {
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
      }
    }
    cx += 6 * s;
  }
  return cx;
}
function fillRound(put, x0, y0, x1, y1, r, rr, gg, bb) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const cx = Math.min(Math.max(x, x0 + r), x1 - r - 1);
    const cy = Math.min(Math.max(y, y0 + r), y1 - r - 1);
    let ok = true;
    if (x < x0 + r && y < y0 + r) ok = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    else if (x > x1 - r && y < y0 + r) ok = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    else if (x < x0 + r && y > y1 - r) ok = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    else if (x > x1 - r && y > y1 - r) ok = (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    if (ok) put(x, y, rr, gg, bb);
  }
}

export function screenshotPng() {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
  };
  const fill = (x0, y0, x1, y1, r, g, b) => {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    x1 = Math.min(W, x1 | 0); y1 = Math.min(H, y1 | 0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, r, g, b);
  };

  // Dark phone chrome around a cream graph — mid-lesson, square assembling.
  fill(0, 0, W, H, 15, 18, 32);
  fillRound(put, 40, 28, 1160, 430, 18, 244, 241, 234);
  for (let x = 56; x < 1144; x++) put(x, 228, 196, 190, 178);

  // Ghost harmonics + mixed square (converge ~0.65). Connect vertical edges
  // so a square jump is a wall, not a gap.
  const mixSq = (t) => {
    let y = Math.sin(t);
    y += Math.sin(t * 3) / 3;
    y += Math.sin(t * 5) / 5;
    y += Math.sin(t * 7) / 7;
    const sq = Math.sin(t) >= 0 ? 1 : -1;
    return y * 0.35 + sq * 0.65;
  };
  let prevY = null;
  for (let x = 56; x < 1144; x++) {
    const u = (x - 56) / 1088;
    const t = u * Math.PI * 2 * 2;
    const y3 = 228 - Math.sin(t * 3) * 70;
    const y5 = 228 - Math.sin(t * 5) * 42;
    put(x, y3 | 0, 125, 200, 170);
    put(x, y5 | 0, 230, 120, 150);
    const y = 228 - mixSq(t) * 150;
    const lo = prevY == null ? y : Math.min(prevY, y);
    const hi = prevY == null ? y : Math.max(prevY, y);
    for (let yy = lo; yy <= hi; yy++) {
      for (let t2 = -2; t2 <= 2; t2++) put(x, (yy + t2) | 0, 3, 128, 244);
    }
    prevY = y;
  }

  // Hear pill + Hz on the cream card's footer.
  fillRound(put, 56, 360, 210, 410, 10, 233, 30, 99);
  drawText(put, 78, 374, 'MUTE', 3, 255, 255, 255);
  drawText(put, 230, 376, '220 HZ', 3, 74, 74, 88);

  // Copy + chips + sliders on the dark body.
  drawText(put, 48, 454, 'SQUARE', 5, 77, 163, 255);
  drawText(put, 48, 500, 'ODD HARMONICS ASSEMBLE THE SHAPE. CONVERGE TO HEAR IT.', 2, 200, 208, 230);

  const chips = [
    { label: 'SINE', on: false },
    { label: 'TRI', on: false },
    { label: 'SQUARE', on: true },
    { label: 'SAW', on: false },
  ];
  chips.forEach((c, i) => {
    const x0 = 48 + i * 180;
    if (c.on) fillRound(put, x0, 548, x0 + 166, 612, 10, 30, 58, 102);
    else fillRound(put, x0, 548, x0 + 166, 612, 10, 23, 27, 46);
    drawText(put, x0 + 18, 568, c.label, 3, c.on ? 255 : 180, c.on ? 255 : 190, c.on ? 255 : 210);
  });

  fillRound(put, 48, 632, 1152, 662, 6, 23, 27, 46);
  fillRound(put, 48, 632, 48 + Math.round(1104 * 0.7), 662, 6, 77, 163, 255);
  drawText(put, 48, 676, 'HARMONICS 8   CONVERGE 0.65   PLACE SAVED IN THIS FILE.', 2, 139, 144, 168);

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
