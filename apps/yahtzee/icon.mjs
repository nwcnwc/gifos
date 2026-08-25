// Procedural Yahtzee icon: green felt card, five dice, one rolling through
// faces. Pure Node, super-sample → box-downsample. Deterministic.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const FELT = [26, 122, 58];
const FELT_D = [16, 86, 40];
const FELT_H = [48, 150, 78];
const IVORY = [244, 236, 220];
const IVORY_D = [214, 200, 176];
const PIP = [28, 24, 22];
const GOLD = [232, 197, 71];
const INK = [244, 239, 228];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function rrPix(x, y, x0, y0, x1, y1, rad) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + rad), x1 - rad), cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
  if (x >= x0 + rad && x <= x1 - rad) return true;
  if (y >= y0 + rad && y <= y1 - rad) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= rad * rad;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [FELT, FELT_D, FELT_H, IVORY, IVORY_D, PIP, GOLD, INK]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.3).map(Math.round));
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

function pips(n) {
  const c = [0.5, 0.5];
  const tl = [0.28, 0.28], tr = [0.72, 0.28];
  const ml = [0.28, 0.5], mr = [0.72, 0.5];
  const bl = [0.28, 0.72], br = [0.72, 0.72];
  if (n === 1) return [c];
  if (n === 2) return [tl, br];
  if (n === 3) return [tl, c, br];
  if (n === 4) return [tl, tr, bl, br];
  if (n === 5) return [tl, tr, c, bl, br];
  return [tl, ml, bl, tr, mr, br];
}

function faceAt(i, f) {
  // Five dice tumble from a mixed hand onto a Yahtzee of sixes.
  const land = 8 + i; // last ~4 frames all sixes
  if (f >= land) return 6;
  const tumble = [6, 1, 5, 2, 4, 3, 6, 5, 6];
  return tumble[(f + i * 2) % tumble.length];
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 6, rad = 18;
  const t = f / (FRAMES - 1);
  const die = 18;
  const gap = 4;
  const rowW = 5 * die + 4 * gap;
  const x0 = (OUT - rowW) / 2;
  const y0 = (OUT - die) / 2 + 2;
  const landed = f >= 10;

  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(FELT_H, FELT_D, (x + y) / (OUT * 2));
      if (landed && y > 22 && y < 28) {
        const gx = (x - 18) / 92;
        if (gx > 0 && gx < 1) col = mix(GOLD, col, 0.35);
      }
      for (let i = 0; i < 5; i++) {
        const bounce = landed ? 0 : Math.sin((t * 6 + i * 0.7) * Math.PI) * (1 - t) * 5;
        const spin = landed ? 1 : 1 + 0.12 * Math.sin((t * 8 + i) * Math.PI);
        const dx0 = x0 + i * (die + gap);
        const dy0 = y0 + bounce;
        const half = (die / 2) * spin;
        const cx = dx0 + die / 2, cy = dy0 + die / 2;
        if (rrPix(x, y, cx - half, cy - half, cx + half, cy + half, 3 * spin)) {
          col = mix(IVORY, IVORY_D, (x - (cx - half)) / (half * 2));
          const face = faceAt(i, f);
          const pr = 2.1 * spin;
          for (const p of pips(face)) {
            const pxp = cx - half + p[0] * half * 2;
            const pyp = cy - half + p[1] * half * 2;
            const ddx = x - pxp, ddy = y - pyp;
            if (ddx * ddx + ddy * ddy <= pr * pr) col = PIP;
          }
        }
      }
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

export function yahtzeeIcon() {
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
  'X': [0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b01010, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  'Z': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  '+': [0b00000, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000],
  '/': [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  '-': [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
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

function paintDie(put, x0, y0, size, face) {
  const rad = Math.max(4, size * 0.12);
  for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) {
    const cx = Math.min(Math.max(x, x0 + rad), x0 + size - rad - 1);
    const cy = Math.min(Math.max(y, y0 + rad), y0 + size - rad - 1);
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > rad * rad) continue;
    const u = (x - x0) / size;
    put(x, y,
      (IVORY[0] + (IVORY_D[0] - IVORY[0]) * u) | 0,
      (IVORY[1] + (IVORY_D[1] - IVORY[1]) * u) | 0,
      (IVORY[2] + (IVORY_D[2] - IVORY[2]) * u) | 0);
  }
  const pr = size * 0.09;
  for (const p of pips(face)) {
    const cx = x0 + p[0] * size, cy = y0 + p[1] * size;
    for (let dy = -pr; dy <= pr; dy++) for (let dx = -pr; dx <= pr; dx++) {
      if (dx * dx + dy * dy <= pr * pr) put((cx + dx) | 0, (cy + dy) | 0, PIP[0], PIP[1], PIP[2]);
    }
  }
}

function rr(put, x0, y0, x1, y1, rad, r, g, b) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
    const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
  }
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

  fill(0, 0, W, H, 26, 122, 58);
  fill(0, 0, W, 10, 16, 86, 40);

  drawText(put, 48, 36, 'YAHTZEE', 8, 244, 239, 228);

  rr(put, 48, 112, 300, 172, 12, 244, 239, 228);
  rr(put, 316, 112, 560, 172, 12, 36, 96, 50);
  drawText(put, 64, 132, 'YOU  163', 3, 180, 35, 24);
  drawText(put, 332, 132, 'SAM  142', 3, 244, 239, 228);

  // Mid-game scorecard — filled lines, a live total, not an empty boot.
  // Upper 3+6+12+8+20+18 = 67, +35 bonus = 102; + 3oak 18 + full house 25 + chance 18 = 163.
  rr(put, 48, 196, 560, 680, 16, 244, 236, 220);
  const rows = [
    ['ONES', '3', 1],
    ['TWOS', '6', 1],
    ['THREES', '12', 1],
    ['FOURS', '8', 1],
    ['FIVES', '20', 1],
    ['SIXES', '18', 1],
    ['BONUS +35', '35', 1],
    ['3 OF A KIND', '18', 1],
    ['FULL HOUSE', '25', 1],
    ['CHANCE', '18', 1],
    ['YAHTZEE', '', 0],
    ['TOTAL', '163', 2],
  ];
  rows.forEach((row, i) => {
    const y = 214 + i * 38;
    if (row[2] === 2) rr(put, 64, y - 6, 544, y + 32, 6, 232, 197, 71);
    else if (row[2] === 1) rr(put, 64, y - 4, 544, y + 30, 6, 212, 196, 154);
    else rr(put, 64, y - 4, 544, y + 30, 6, 255, 250, 240);
    const ink = row[2] === 2 ? [26, 70, 36] : [42, 36, 24];
    drawText(put, 80, y + 4, row[0], 2, ink[0], ink[1], ink[2]);
    if (row[1]) drawText(put, 460, y + 4, row[1], 2, ink[0], ink[1], ink[2]);
  });

  drawText(put, 600, 48, 'TAP TO KEEP', 4, 232, 197, 71);
  drawText(put, 600, 108, 'THREE ROLLS', 3, 244, 239, 228);
  drawText(put, 600, 156, 'ONE INVITE', 3, 210, 230, 200);

  const faces = [6, 6, 6, 5, 5];
  const size = 96;
  const gap = 14;
  const x0 = 600;
  const y0 = 240;
  for (let i = 0; i < 5; i++) {
    paintDie(put, x0 + i * (size + gap), y0, size, faces[i]);
  }
  drawText(put, 600, 360, 'FULL HOUSE  25', 3, 244, 239, 228);

  rr(put, 600, 430, 1148, 520, 12, 232, 197, 71);
  drawText(put, 624, 460, 'PLAY A FRIEND', 4, 26, 70, 36);
  drawText(put, 600, 560, 'A TABLE OVER A MEETING', 3, 244, 239, 228);
  drawText(put, 600, 614, 'EVERYONE SEES THE SAME DICE', 3, 210, 230, 200);

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
