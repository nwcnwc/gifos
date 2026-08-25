// Procedural Pixel It icon: a photo-like landscape that chunkifies into
// palette blocks. Super-sample → box-downsample; deterministic builds.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [18, 14, 22];
const SKY = [90, 160, 210];
const SKY2 = [250, 210, 140];
const SUN = [242, 211, 107];
const HILL = [45, 106, 58];
const HILL2 = [62, 122, 68];
const HOUSE = [196, 92, 58];
const PAL = [
  [140, 143, 174], [88, 69, 99], [62, 33, 55], [154, 99, 72],
  [215, 155, 125], [245, 237, 186], [192, 199, 65], [100, 125, 52],
  [228, 148, 58], [157, 48, 59], [210, 100, 113], [112, 55, 127],
  [126, 196, 193], [52, 133, 157], [23, 67, 75], [31, 14, 28],
];

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
function nearestPal(r, g, b) {
  let bi = 0, bd = 1e9;
  for (let i = 0; i < PAL.length; i++) {
    const p = PAL[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bd) { bd = d; bi = i; }
  }
  return PAL[bi];
}
function scene(x, y) {
  const t = y / OUT;
  let col = t < 0.55 ? mix(SKY, SKY2, t / 0.55) : mix(HILL, HILL2, (t - 0.55) / 0.45);
  const dx = x - 40, dy = y - 36;
  if (dx * dx + dy * dy < 18 * 18) col = SUN;
  if (y > 70 && y > 120 - (x - 20) * 0.4 && x < 90) col = HILL;
  if (x > 88 && x < 108 && y > 78 && y < 108) col = HOUSE;
  if (x > 94 && x < 100 && y > 92 && y < 108) col = [80, 40, 28];
  return col;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, SKY, SKY2, SUN, HILL, HILL2, HOUSE, [255, 255, 255], ...PAL]) {
    for (let s = 0; s <= 2; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
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
function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  const block = 1 + Math.round(t * 11);
  const m = 8, rad = 20;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    if (!inCard(x, y, m, rad)) continue;
    const bx = Math.floor(x / block) * block + block / 2;
    const by = Math.floor(y / block) * block + block / 2;
    let col = scene(bx, by);
    if (t > 0.35) col = mix(col, nearestPal(col[0], col[1], col[2]), Math.min(1, (t - 0.35) / 0.5));
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

export function pixelitIcon() {
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
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  'M': [0b10001, 0b11011, 0b10101, 0b10001, 0b10001, 0b10001, 0b10001],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
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
  const roundFill = (x0, y0, x1, y1, r, cr, cg, cb) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const dx = x < x0 + r ? x0 + r - x : x > x1 - r ? x - (x1 - r) : 0;
      const dy = y < y0 + r ? y0 + r - y : y > y1 - r ? y - (y1 - r) : 0;
      if (dx * dx + dy * dy > r * r) continue;
      put(x, y, cr, cg, cb);
    }
  };
  fill(0, 0, W, H, 18, 16, 24);
  drawText(put, 36, 22, 'PIXEL IT', 5, 244, 239, 230);
  drawText(put, 36, 62, 'PHOTO TO PIXEL ART.', 2, 180, 168, 150);

  const pal = PAL;
  const block = 10;
  roundFill(28, 96, 1172, 560, 16, 11, 10, 14);
  function paintScene(x0, y0, w, h, pixel) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const sx = pixel ? Math.floor(x / block) * block + block / 2 : x;
      const sy = pixel ? Math.floor(y / block) * block + block / 2 : y;
      const u = sx / w, v = sy / h;
      let col = v < 0.55 ? mix(SKY, SKY2, v / 0.55) : mix(HILL, [90, 140, 70], (v - 0.55) / 0.45);
      const dx = sx - w * 0.22, dy = sy - h * 0.22;
      if (dx * dx + dy * dy < (h * 0.12) * (h * 0.12)) col = SUN;
      if (v > 0.5 && v > 0.85 - u * 0.5) col = HILL;
      if (u > 0.68 && u < 0.86 && v > 0.52 && v < 0.88) col = HOUSE;
      if (u > 0.72 && u < 0.76 && v > 0.68 && v < 0.88) col = [80, 40, 28];
      if (pixel) col = nearestPal(col[0], col[1], col[2]);
      put(x0 + x, y0 + y, col[0] | 0, col[1] | 0, col[2] | 0);
    }
  }
  paintScene(36, 108, 1128, 436, true);
  drawText(put, 420, 520, 'HOLD TO SEE THE ORIGINAL', 2, 180, 168, 150);

  roundFill(36, 580, 220, 628, 8, 228, 148, 58);
  drawText(put, 52, 594, 'TAKE PHOTO', 2, 26, 18, 8);
  roundFill(236, 580, 360, 628, 8, 28, 24, 36);
  drawText(put, 256, 594, 'CHOOSE', 2, 244, 239, 230);
  roundFill(376, 580, 560, 628, 8, 28, 24, 36);
  drawText(put, 392, 594, 'DOWNLOAD PNG', 2, 244, 239, 230);

  drawText(put, 36, 644, 'BLOCK 8', 2, 180, 168, 150);
  fill(160, 654, 700, 660, 58, 51, 72);
  fill(268, 646, 296, 668, 228, 148, 58);
  pal.forEach((c, i) => fill(720 + i * 52, 644, 720 + i * 52 + 44, 676, c[0], c[1], c[2]));
  drawText(put, 36, 688, 'CLASSIC PALETTE', 2, 228, 148, 58);

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
