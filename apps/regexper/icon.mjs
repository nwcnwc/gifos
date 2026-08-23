// Procedural icon for Regexper: a lime card holding a railroad diagram whose
// bead travels the track. Pure Node, super-sample → box-downsample.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [186, 218, 85];
const CARD_B = [140, 164, 64];
const TAN = [203, 203, 186];
const GRAY = [107, 102, 89];
const INK = [24, 22, 18];
const WHITE = [250, 250, 246];
const BLUE = [218, 233, 229];
const GOLD = [248, 202, 0];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, TAN, GRAY, INK, WHITE, BLUE, GOLD]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.09).map(Math.round));
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
function inRect(x, y, x0, y0, x1, y1, rad) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + rad), x1 - rad);
  const cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
  if (x >= x0 + rad && x <= x1 - rad) return true;
  if (y >= y0 + rad && y <= y1 - rad) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= rad * rad;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const t = f / FRAMES;
  const boxes = [
    { x0: 22, x1: 48, label: 0 },
    { x0: 54, x1: 86, label: 1 },
    { x0: 92, x1: 106, label: 2 },
  ];
  const ay = 64;
  const beadX = 18 + t * 92;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      // track
      if (Math.abs(y - ay) < 2 && x > 16 && x < 112) col = INK;
      // start / end circles
      const d0 = Math.hypot(x - 18, y - ay);
      const d1 = Math.hypot(x - 110, y - ay);
      if (d0 < 5.5) col = d0 < 3.5 ? GRAY : INK;
      if (d1 < 5.5) col = d1 < 3.5 ? GRAY : INK;
      for (const b of boxes) {
        if (inRect(x, y, b.x0, ay - 14, b.x1, ay + 14, 4)) {
          col = b.label === 1 ? mix(BLUE, WHITE, 0.15) : mix(TAN, WHITE, 0.2);
          if (x < b.x0 + 1.6 || x > b.x1 - 1.6 || y < ay - 13 || y > ay + 13) col = INK;
        }
      }
      // loop over the middle box
      const lx = x - 70, ly = y - (ay - 22);
      const loop = Math.abs(Math.hypot(lx, ly * 1.6) - 16);
      if (loop < 1.8 && y < ay - 2 && x > 54 && x < 86) col = INK;
      // travelling bead
      const db = Math.hypot(x - beadX, y - ay);
      if (db < 4.2) col = mix(GOLD, WHITE, 0.35);
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

export function regexperIcon() {
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
  'X': [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  'Z': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  '/': [0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b10000, 0b10000],
  '^': [0b00100, 0b01010, 0b10001, 0, 0, 0, 0],
  '$': [0b00100, 0b01111, 0b10100, 0b01110, 0b00101, 0b11110, 0b00100],
  '+': [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  '@': [0b01110, 0b10001, 0b10101, 0b10111, 0b10000, 0b10001, 0b01110],
  '[': [0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110],
  ']': [0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
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
  const rr = (x0, y0, x1, y1, rad, r, g, b) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
      const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
    }
  };
  const circle = (cx, cy, rad, r, g, b) => {
    for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
      if (x * x + y * y <= rad * rad) put(cx + x, cy + y, r, g, b);
    }
  };

  fill(0, 0, W, H, 107, 102, 89);
  fill(0, 0, W, 150, 186, 218, 85);
  fill(0, 150, W, 156, 140, 164, 64);
  drawText(put, 48, 42, 'REGEXPER', 8, 24, 22, 18);
  drawText(put, 48, 108, 'RAILROAD DIAGRAMS ON THIS DEVICE', 3, 107, 102, 89);

  rr(48, 180, 1152, 280, 4, 203, 203, 186);
  drawText(put, 68, 214, '/^[A-Z]+@[A-Z]+.[A-Z]+$/', 4, 24, 22, 18);
  rr(48, 300, 200, 352, 4, 186, 218, 85);
  drawText(put, 68, 316, 'DISPLAY', 3, 24, 22, 18);
  drawText(put, 760, 316, 'DOWNLOAD SVG  //  PNG', 3, 24, 22, 18);

  fill(48, 380, 1152, 680, 255, 255, 255);
  const ay = 530;
  fill(80, ay - 2, 1120, ay + 2, 24, 22, 18);
  circle(90, ay, 10, 107, 102, 89);
  circle(90, ay, 12, 24, 22, 18);
  circle(90, ay, 8, 107, 102, 89);
  circle(1110, ay, 12, 24, 22, 18);
  circle(1110, ay, 8, 107, 102, 89);

  function box(x0, y0, x1, y1, r, g, b, label, lr, lg, lb) {
    rr(x0, y0, x1, y1, 8, r, g, b);
    // outline
    rr(x0, y0, x1, y0 + 3, 0, 24, 22, 18);
    rr(x0, y1 - 3, x1, y1, 0, 24, 22, 18);
    rr(x0, y0, x0 + 3, y1, 0, 24, 22, 18);
    rr(x1 - 3, y0, x1, y1, 0, 24, 22, 18);
    const tw = label.length * 12;
    drawText(put, ((x0 + x1) / 2 - tw / 2) | 0, ((y0 + y1) / 2 - 8) | 0, label, 2, lr, lg, lb);
  }
  box(130, 490, 310, 570, 107, 102, 89, 'START OF LINE', 250, 250, 246);
  box(340, 490, 500, 570, 218, 233, 229, 'A-Z', 24, 22, 18);
  box(540, 490, 620, 570, 218, 233, 229, '@', 24, 22, 18);
  box(660, 490, 820, 570, 218, 233, 229, 'A-Z', 24, 22, 18);
  box(860, 490, 940, 570, 218, 233, 229, '.', 24, 22, 18);
  box(980, 490, 1080, 570, 107, 102, 89, 'END', 250, 250, 246);

  // loop ticks over the A-Z boxes
  for (const cx of [420, 740]) {
    for (let x = cx - 50; x <= cx + 50; x++) {
      const y = 454 + Math.round(18 * Math.sin(((x - (cx - 50)) / 100) * Math.PI));
      put(x, y, 24, 22, 18);
      put(x, y + 1, 24, 22, 18);
    }
  }
  drawText(put, 390, 420, '1+ TIMES', 2, 24, 22, 18);
  drawText(put, 710, 420, '1+ TIMES', 2, 24, 22, 18);

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
