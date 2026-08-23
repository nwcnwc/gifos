// Procedural icon: a cat is drawn, then guessed as HAT — a drawing becoming
// a guess. Pure Node, super-sample → box-downsample. Deterministic.
// Cover is mid-round: please-draw CAT on a full pad, not an empty lobby.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [42, 36, 28];
const PAPER = [255, 253, 246];
const PAPER_D = [236, 226, 204];
const INK = [28, 24, 20];
const CORAL = [232, 92, 64];
const CORAL_H = [255, 160, 140];
const BLUE = [61, 126, 166];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, PAPER, PAPER_D, INK, CORAL, CORAL_H, BLUE]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
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
function distToSeg(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  if (l2 < 1e-6) return Math.hypot(x - x1, y - y1);
  let t = ((x - x1) * dx + (y - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

// Cat as polyline segments. t in 0..1 reveals more of the line.
const CAT = [
  // head
  [48, 58, 48, 42], [48, 42, 64, 32], [64, 32, 80, 42], [80, 42, 80, 58],
  [80, 58, 64, 68], [64, 68, 48, 58],
  // ears
  [52, 44, 54, 28], [54, 28, 62, 40],
  [76, 44, 74, 28], [74, 28, 66, 40],
  // eyes
  [58, 48, 60, 50], [68, 48, 70, 50],
  // smile
  [58, 56, 64, 60], [64, 60, 70, 56],
  // body
  [56, 66, 52, 88], [52, 88, 76, 88], [76, 88, 72, 66],
  // tail
  [76, 80, 92, 70], [92, 70, 96, 58],
];

// Guess written under the drawing — the telephone beat.
const GUESS = [
  // H
  [24, 96, 24, 118], [24, 107, 40, 107], [40, 96, 40, 118],
  // A
  [48, 118, 56, 96], [56, 96, 64, 118], [51, 110, 61, 110],
  // T
  [70, 96, 90, 96], [80, 96, 80, 118],
  // ?
  [98, 98, 108, 98], [108, 98, 108, 106], [108, 106, 100, 110],
  [100, 116, 100, 118],
];

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 18;
  const t = f / (FRAMES - 1);
  const catT = Math.min(1, t / 0.58);
  const nSeg = Math.max(1, Math.round(CAT.length * Math.min(1, catT * 1.05)));
  const gT = t < 0.55 ? 0 : (t - 0.55) / 0.45;
  const nGuess = Math.round(GUESS.length * Math.min(1, gT * 1.08));
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(PAPER, PAPER_D, Math.max(0, Math.min(1, (x + y) / (OUT * 2))));
      for (let i = 0; i < nSeg; i++) {
        const s = CAT[i];
        const d = distToSeg(x, y, s[0], s[1] - 8, s[2], s[3] - 8);
        if (d < 2.1) col = i < 12 ? INK : CORAL;
      }
      for (let i = 0; i < nGuess; i++) {
        const s = GUESS[i];
        const d = distToSeg(x, y, s[0], s[1], s[2], s[3]);
        if (d < 2.4) col = CORAL;
      }
      // pencil tip: cat first, then the guess
      if (catT < 0.98 && nSeg > 0 && gT === 0) {
        const s = CAT[nSeg - 1];
        const u = Math.min(1, catT * CAT.length - (nSeg - 1));
        const px2 = s[0] + (s[2] - s[0]) * u;
        const py2 = s[1] - 8 + (s[3] - s[1]) * u;
        if (Math.hypot(x - px2, y - py2) < 3.2) col = CORAL_H;
      } else if (gT > 0 && gT < 0.98 && nGuess > 0) {
        const s = GUESS[Math.min(nGuess, GUESS.length) - 1];
        const px2 = s[0] + (s[2] - s[0]) * 0.85;
        const py2 = s[1] + (s[3] - s[1]) * 0.85;
        if (Math.hypot(x - px2, y - py2) < 3.2) col = CORAL_H;
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

export function drawphoneIcon() {
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
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '4': [0b00100, 0b01100, 0b10100, 0b11111, 0b00100, 0b00100, 0b00100],
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

function strokeSeg(put, x1, y1, x2, y2, r, g, b, w) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const n = Math.ceil(len);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x1 + dx * t, y = y1 + dy * t;
    for (let oy = -w; oy <= w; oy++) for (let ox = -w; ox <= w; ox++) {
      if (ox * ox + oy * oy <= w * w) put(x + ox, y + oy, r, g, b);
    }
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
    put(x, y, (28 + t * 18) | 0, (24 + t * 14) | 0, (20 + t * 10) | 0);
  }

  // Mid-round: the pad, a word to draw, a cat in progress. Not an empty lobby.
  drawText(put, 468, 36, 'PLEASE DRAW', 4, 184, 168, 140);
  drawText(put, 528, 78, 'CAT', 8, 232, 92, 64);

  const padX = 350, padY = 140, padS = 500;
  fill(padX, padY, padX + padS, padY + padS, 255, 253, 246);
  for (let i = 0; i < padS; i++) {
    put(padX + i, padY, 90, 80, 64); put(padX + i, padY + padS - 1, 90, 80, 64);
    put(padX, padY + i, 90, 80, 64); put(padX + padS - 1, padY + i, 90, 80, 64);
  }
  const ox = padX + 70, oy = padY + 40, sc = 3.6;
  for (const s of CAT) {
    strokeSeg(put, ox + s[0] * sc, oy + s[1] * sc, ox + s[2] * sc, oy + s[3] * sc, 28, 24, 20, 4);
  }
  // pencil tip at the tail
  const tip = CAT[CAT.length - 1];
  const tx = ox + tip[2] * sc, ty = oy + tip[3] * sc;
  for (let oy2 = -5; oy2 <= 5; oy2++) for (let ox2 = -5; ox2 <= 5; ox2++) {
    if (ox2 * ox2 + oy2 * oy2 <= 25) put(tx + ox2, ty + oy2, 255, 160, 140);
  }

  const sw = ['#111111', '#e85c40', '#3d7ea6', '#3a9a5b', '#e0b03a', '#8b5a2b', '#7b4ea3'];
  for (let i = 0; i < sw.length; i++) {
    const hex = sw[i];
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    const cx = 462 + i * 46, cy = 662;
    for (let yy = -12; yy <= 12; yy++) for (let xx = -12; xx <= 12; xx++) {
      if (xx * xx + yy * yy <= 144) put(cx + xx, cy + yy, r, g, b);
    }
  }
  drawText(put, 48, 28, 'TURN 1 OF 4', 3, 184, 168, 140);
  drawText(put, 48, 680, 'DRAWPHONE', 4, 244, 234, 212);

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
