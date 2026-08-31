// EPUB Reader icon: an open book whose right page turns. Cover is the reader
// mid-chapter with Contents open and a pointer on a line. Pure Node.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD_A = [28, 20, 14], CARD_B = [14, 10, 8];
const PAPER = [244, 239, 228], INK = [32, 24, 18];
const GOLD = [196, 122, 48], LINE = [180, 160, 140], SPINE = [90, 52, 28];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, PAPER, INK, GOLD, LINE, SPINE, [255, 255, 255]]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
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
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = (f % FRAMES) / FRAMES;
  const curl = Math.sin(t * Math.PI) * 18;
  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 7, 20)) continue;
      let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 7) / (OUT - 14))));
      const bx = 22, by = 28, bw = 84, bh = 74, mid = bx + bw / 2;
      const inBook = x >= bx && x <= bx + bw && y >= by && y <= by + bh;
      if (inBook) {
        if (Math.abs(x - mid) < 3) col = SPINE;
        else if (x < mid) {
          col = PAPER;
          const ly = y - (by + 12);
          if (ly > 0 && ly < 50 && (ly % 7) < 1.2 && x > bx + 6 && x < mid - 6) col = LINE;
        } else {
          const fromRight = (bx + bw) - x;
          const turning = fromRight < curl && y < by + 48;
          if (turning) col = mix(GOLD, PAPER, 0.2 + fromRight / Math.max(1, curl));
          else {
            col = PAPER;
            const ly = y - (by + 12);
            if (ly > 0 && ly < 50 && (ly % 7) < 1.2 && x > mid + 6 && x < bx + bw - 6) col = LINE;
            if (Math.abs(y - (by + 22 + (f % 5) * 6)) < 2.4 && x > mid + 8 && x < mid + 32) col = GOLD;
          }
        }
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

export function epubReaderIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64, flat = new Array(CT * 3).fill(0);
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
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [15, 16, 16, 16, 16, 16, 15],
  D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 14], H: [17, 17, 17, 31, 17, 17, 17], I: [31, 4, 4, 4, 4, 4, 31],
  K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31], M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17], Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  ' ': [0, 0, 0, 0, 0, 0, 0], '-': [0, 0, 0, 31, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0, 4], ',': [0, 0, 0, 0, 0, 4, 8], '/': [1, 2, 4, 4, 8, 16, 16],
  ':': [0, 4, 0, 0, 0, 4, 0],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 6, 8, 16, 31],
  3: [30, 1, 1, 14, 1, 1, 30], 4: [2, 6, 10, 18, 31, 2, 2]
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (gph[row] & (1 << (4 - col))) {
          for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
        }
      }
    }
    cx += 6 * s;
  }
}
function fillRect(put, x, y, w, h, r, g, b) {
  for (let yy = y | 0; yy < y + h; yy++) for (let xx = x | 0; xx < x + w; xx++) put(xx, yy, r, g, b);
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
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 12, 12, 18);
  fillRect(put, 0, 0, W, 56, 20, 20, 26);
  drawText(put, 24, 18, 'OPEN', 3, 232, 232, 236);
  drawText(put, 140, 18, 'CONTENTS', 3, 196, 122, 48);
  drawText(put, 380, 18, '2 / 4', 3, 180, 180, 188);
  drawText(put, 820, 18, 'POINT', 3, 196, 122, 48);
  drawText(put, 1000, 18, 'FIND', 3, 180, 180, 188);
  fillRect(put, 0, 56, 260, H - 56, 22, 22, 30);
  drawText(put, 24, 76, 'CONTENTS', 2, 154, 160, 166);
  const toc = ['TITLE', 'FOLDING A BOAT', 'THE WATER', 'WHY IT STAYS UP'];
  for (let i = 0; i < toc.length; i++) {
    if (i === 2) fillRect(put, 12, 118 + i * 44, 236, 36, 42, 42, 52);
    drawText(put, 24, 126 + i * 44, toc[i], 2, 232, 232, 236);
  }
  const px = 280, py = 72, pw = 880, ph = 600;
  fillRect(put, px, py, pw, ph, 244, 239, 228);
  drawText(put, px + 48, py + 36, 'THE WATER', 5, 32, 24, 18);
  drawText(put, px + 48, py + 92, 'A BASIN, A GUTTER, A SLOW RIVER IF YOU HAVE ONE.', 2, 90, 70, 50);
  const body = [
    'A PAPER BOAT IS A FAIR-WEATHER SAILOR. STILL WATER',
    'IS KIND. MOVING WATER IS A LESSON. PLACE THE BOAT',
    'ON A BASIN FIRST, WHERE YOU CAN SEE THE WATERLINE.',
    'IF THE SIDES DRINK, THE CREASES WERE NOT SHARP.',
    'ON A GUTTER AFTER RAIN THE BOAT WILL TRAVEL FARTHER',
    'THAN YOU EXPECT. THE CURRENT IS THE ENGINE. A STICK',
    'IS A RUDDER, NOT A MOTOR. ONE TAP ON THE STERN.',
    'WHY IT GLIDES: FOUR FORCES, SAME AS ANY HULL.'
  ];
  for (let i = 0; i < body.length; i++) {
    const y = py + 150 + i * 44;
    if (i === 7) fillRect(put, px + 40, y - 8, 640, 36, 255, 214, 10);
    drawText(put, px + 48, y, body[i], 2, 40, 32, 26);
  }
  const ptrX = px + 700, ptrY = py + 150 + 7 * 44 + 10;
  for (let yy = -10; yy <= 10; yy++) {
    for (let xx = -10; xx <= 10; xx++) {
      if (xx * xx + yy * yy <= 64) put(ptrX + xx, ptrY + yy, 196, 122, 48);
    }
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
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}
