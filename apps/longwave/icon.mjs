// Procedural icon: a spectrum bar with a needle sweeping the mark.
// Pure Node, super-sample → box-downsample. Deterministic.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [28, 24, 48];
const CARD_L = [44, 38, 72];
const TEAL = [94, 200, 200];
const VIOLET = [118, 86, 214];
const PINK = [224, 122, 211];
const GOLD = [240, 212, 106];
const WHITE = [255, 255, 255];
const INK = [244, 238, 252];

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
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, CARD_L, TEAL, VIOLET, PINK, GOLD, WHITE, INK]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.28).map(Math.round));
  }
  for (let i = 0; i <= 10; i++) pal.push(mix(TEAL, PINK, i / 10).map(Math.round));
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

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 18;
  const t = f / (FRAMES - 1);
  const sweep = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD, CARD_L, (x + y) / (OUT * 2));
      const bx = 18, by = 54, bw = OUT - 36, bh = 16;
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
        const u = (x - bx) / bw;
        col = mix(TEAL, mix(VIOLET, PINK, Math.max(0, (u - 0.4) / 0.6)), u);
      }
      const nx = bx + 4 + sweep * (bw - 8);
      if (Math.abs(x - nx) < 1.6 && y >= by - 10 && y <= by + bh + 10) col = WHITE;
      const dGold = Math.hypot(x - (bx + bw * 0.62), y - (by + bh / 2));
      if (dGold < 5.2 && dGold > 2.6 && t > 0.35 && t < 0.85) col = GOLD;
    }
    const off = (py * RW + px) * 4;
    if (a) { rgba[off] = col[0]; rgba[off + 1] = col[1]; rgba[off + 2] = col[2]; rgba[off + 3] = 1; }
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

export function longwaveIcon() {
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
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
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
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
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
    put(x, y, (27 + t * 18) | 0, (23 + t * 10) | 0, (48 + t * 22) | 0);
  }

  fill(70, 80, 1130, 640, 44, 38, 80);
  for (let x = 70; x < 1130; x++) {
    put(x, 80, 90, 78, 136); put(x, 81, 90, 78, 136);
    put(x, 639, 90, 78, 136); put(x, 638, 90, 78, 136);
  }

  drawText(put, 110, 120, 'LONGWAVE', 8, 196, 176, 255);

  // Poles
  fill(110, 230, 430, 300, 46, 158, 158);
  fill(770, 230, 1090, 300, 176, 74, 168);
  drawText(put, 140, 250, 'HOT', 5, 255, 255, 255);
  drawText(put, 860, 250, 'COLD', 5, 255, 255, 255);

  // Rail
  const rx = 130, ry = 380, rw = 940, rh = 22;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const u = x / rw;
    const c = u < 0.5
      ? mix([46, 158, 158], [118, 86, 214], u * 2)
      : mix([118, 86, 214], [176, 74, 168], (u - 0.5) * 2);
    put(rx + x, ry + y, c[0] | 0, c[1] | 0, c[2] | 0);
  }
  // Target gold ring around ~0.32
  const tx = rx + rw * 0.32;
  for (let dy = -18; dy <= 18; dy++) for (let dx = -18; dx <= 18; dx++) {
    const d = Math.hypot(dx, dy);
    if (d < 14 && d > 8) put(tx + dx, ry + rh / 2 + dy, 240, 212, 106);
  }
  // Needle at ~0.38
  const nx = rx + rw * 0.38;
  fill(nx - 3, ry - 28, nx + 3, ry + rh + 28, 255, 255, 255);
  for (let i = 0; i < 14; i++) for (let k = -i; k <= i; k++) {
    put(nx + k, ry - 28 - 14 + i, 255, 255, 255);
  }

  drawText(put, 110, 470, 'CLUE', 4, 183, 172, 207);
  drawText(put, 110, 520, 'COFFEE', 6, 244, 238, 252);
  drawText(put, 110, 590, 'PSYCHIC  -  GUESSER', 3, 196, 176, 255);

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
