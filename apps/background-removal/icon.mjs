// Procedural icon: a head-and-shoulders cut whose colourful background
// dissolves into a checkerboard. Super-sample → box-downsample; deterministic.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD_A = [16, 28, 32], CARD_B = [8, 14, 18];
const SKIN = [243, 215, 181], HAIR = [42, 28, 20], SHIRT = [36, 87, 214];
const WALL = [220, 78, 72], WALL2 = [240, 140, 70], CK_A = [232, 236, 234], CK_B = [170, 180, 176];

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
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function subject(x, y) {
  const dx = x - 64, dy = y - 52;
  if (dx * dx / (22 * 22) + dy * dy / (28 * 28) < 1) return SKIN;
  if ((x - 46) ** 2 / 36 + (y - 54) ** 2 / 196 < 1) return HAIR;
  if ((x - 82) ** 2 / 36 + (y - 54) ** 2 / 196 < 1) return HAIR;
  if ((x - 64) ** 2 / 196 + (y - 38) ** 2 / 64 < 1 && y < 52) return HAIR;
  if (x > 54 && x < 74 && y > 78 && y < 92) return SKIN;
  if (y > 90 && (x - 64) ** 2 / (46 * 46) + (y - 128) ** 2 / (44 * 44) < 1) return SHIRT;
  return null;
}
function wall(x, y) { return mix(WALL, WALL2, Math.max(0, Math.min(1, y / OUT))); }
function checker(x, y) {
  const s = 10;
  return (Math.floor(x / s) + Math.floor(y / s)) % 2 ? CK_A : CK_B;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, SKIN, HAIR, SHIRT, WALL, WALL2, CK_A, CK_B, [56, 196, 168]]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
  }
  return pal.slice(0, 64);
}
function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e9;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i], d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}
function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  const cut = t < 0.15 ? 0 : t > 0.85 ? 1 : (t - 0.15) / 0.7;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    if (!inCard(x, y, 7, 20)) continue;
    const sub = subject(x, y);
    let col = sub || mix(wall(x, y), checker(x, y), cut);
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
    idx[y * OUT + x] = a / n < 0.5 ? 0 : nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}
export function backgroundRemovalIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64, flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 12, transparentIndex: 0 };
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
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  M: [0b10001, 0b11011, 0b10101, 0b10001, 0b10001, 0b10001, 0b10001],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b01010, 0b00100],
  J: [0b00111, 0b00001, 0b00001, 0b00001, 0b00001, 0b10001, 0b01110],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  '·': [0, 0, 0, 0b00100, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
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
    for (let y = Math.max(0, y0 | 0); y < Math.min(H, y1 | 0); y++)
      for (let x = Math.max(0, x0 | 0); x < Math.min(W, x1 | 0); x++) put(x, y, r, g, b);
  };
  const roundFill = (x0, y0, x1, y1, rad, cr, cg, cb) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const dx = x < x0 + rad ? x0 + rad - x : x > x1 - rad ? x - (x1 - rad) : 0;
      const dy = y < y0 + rad ? y0 + rad - y : y > y1 - rad ? y - (y1 - rad) : 0;
      if (dx * dx + dy * dy > rad * rad) continue;
      put(x, y, cr, cg, cb);
    }
  };
  fill(0, 0, W, H, 12, 16, 20);
  drawText(put, 36, 22, 'BACKGROUND REMOVAL', 4, 238, 244, 242);
  drawText(put, 36, 58, 'CUT ON THIS DEVICE. NO UPLOAD.', 2, 147, 164, 168);

  roundFill(28, 88, 1172, 560, 16, 18, 24, 28);
  for (let y = 100; y < 548; y++) for (let x = 40; x < 1160; x++) {
    const ck = (Math.floor(x / 18) + Math.floor(y / 18)) % 2;
    put(x, y, ck ? 40 : 28, ck ? 48 : 34, ck ? 52 : 38);
  }
  function person(cx, cy, sc) {
    for (let y = 0; y < 420; y++) for (let x = 0; x < 280; x++) {
      const px = x / sc, py = y / sc;
      const dx = px - 70, dy = py - 70;
      let col = null;
      if (dx * dx / 900 + dy * dy / 1400 < 1) col = SKIN;
      if ((px - 48) ** 2 / 80 + (py - 72) ** 2 / 900 < 1) col = HAIR;
      if ((px - 92) ** 2 / 80 + (py - 72) ** 2 / 900 < 1) col = HAIR;
      if ((px - 70) ** 2 / 1100 + (py - 48) ** 2 / 280 < 1 && py < 72) col = HAIR;
      if (px > 58 && px < 82 && py > 108 && py < 128) col = SKIN;
      if (py > 124 && (px - 70) ** 2 / 2800 + (py - 210) ** 2 / 4200 < 1) col = SHIRT;
      if (col) put(cx + x - 140, cy + y - 40, col[0], col[1], col[2]);
    }
  }
  person(600, 160, 2.0);
  drawText(put, 430, 520, 'HOLD TO SEE THE ORIGINAL', 2, 147, 164, 168);

  roundFill(36, 580, 230, 628, 8, 56, 196, 168);
  drawText(put, 52, 594, 'TAKE PHOTO', 2, 6, 36, 30);
  roundFill(246, 580, 370, 628, 8, 28, 36, 42);
  drawText(put, 266, 594, 'CHOOSE', 2, 238, 244, 242);
  roundFill(386, 580, 580, 628, 8, 28, 36, 42);
  drawText(put, 402, 594, 'DOWNLOAD PNG', 2, 238, 244, 242);

  const chips = [[232, 236, 234], [255, 255, 255], [17, 17, 17], [232, 228, 220], [0, 194, 122], [47, 107, 255]];
  chips.forEach((c, i) => {
    const x = 620 + i * 88;
    for (let yy = 586; yy < 622; yy++) for (let xx = x; xx < x + 36; xx++) {
      const dx = xx - (x + 18), dy = yy - 604;
      if (dx * dx + dy * dy <= 18 * 18) put(xx, yy, c[0], c[1], c[2]);
    }
  });
  drawText(put, 36, 656, 'MEDIUM MODEL  ·  TRANSPARENT PNG  ·  CUT ON THIS DEVICE', 2, 56, 196, 168);

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
