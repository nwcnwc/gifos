// Procedural Hydra icon: a dark card of oscillating bands that fold into
// a kaleidoscope. Cover is mid-jam — the picture full of colour, recipe
// visible at the bottom. Super-sample → box-downsample. Deterministic.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD = [8, 6, 12];
const INK = [244, 238, 246];
const MAG = [196, 61, 122];
const CYAN = [57, 208, 197];
const GOLD = [255, 211, 106];
const VIO = [140, 80, 220];

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
  for (const b of [CARD, INK, MAG, CYAN, GOLD, VIO, [255, 255, 255]]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.4).map(Math.round));
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
function hsl(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)));
  };
  return [f(0), f(8), f(4)];
}

const DYES = [MAG, CYAN, GOLD, VIO, INK];

function kaleid(x, y, t, sides) {
  const cx = 64, cy = 66;
  const dx = (x - cx) / 52, dy = (y - cy) / 52;
  const r = Math.hypot(dx, dy);
  let a = Math.atan2(dy, dx) + t * Math.PI * 2;
  const slice = (Math.PI * 2) / sides;
  a = ((a % slice) + slice) % slice;
  a = Math.abs(a - slice / 2);
  const px = r * Math.cos(a);
  const osc = Math.sin(px * 12 - t * 6.28);
  return { r, osc, px };
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const m = 8, rad = 20;
  const sides = 5;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    if (!inCard(x, y, m, rad)) continue;
    const k = kaleid(x, y, t, sides);
    let col = CARD;
    if (k.r < 0.98) {
      const bi = ((Math.floor((k.osc + 1) * 2.2) + Math.floor(k.px * 6 + t * 8)) % DYES.length + DYES.length) % DYES.length;
      col = DYES[bi];
    }
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

export function hydraIcon() {
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

function rr(put, x0, y0, x1, y1, rad, r, g, b, a) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
    const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b, a);
  }
}

const GLYPHS = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  ',': [0, 0, 0, 0, 0b00100, 0b00100, 0b01000],
  '(': [0b00100, 0b01000, 0b10000, 0b10000, 0b10000, 0b01000, 0b00100],
  ')': [0b00100, 0b00010, 0b00001, 0b00001, 0b00001, 0b00010, 0b00100],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  3: [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  5: [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  6: [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
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

  const t = 0.42;
  const sides = 5;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cx = W * 0.52, cy = H * 0.46;
    let dx = (x - cx) / (H * 0.48), dy = (y - cy) / (H * 0.48);
    let rad = Math.hypot(dx, dy);
    let a = Math.atan2(dy, dx);
    const pi = Math.PI * 2;
    a = ((a % (pi / sides)) + pi / sides) % (pi / sides);
    a = Math.abs(a - pi / sides / 2);
    const px = rad * Math.cos(a) + t;
    const hue = (px * 90 + t * 80 + rad * 40) % 360;
    const band = Math.sin(px * 16 + t * 8) * 0.5 + 0.5;
    const c = hsl(hue, 68, 18 + band * 38);
    put(x, y, c[0], c[1], c[2]);
  }

  // recipe overlay — mid-use, a real kaleid patch, not empty first-boot
  rr(put, 28, 500, 1172, 696, 14, 10, 6, 16, 230);
  drawText(put, 52, 524, 'osc(18, 0.1, 0.9)', 4, 214, 255, 232);
  drawText(put, 52, 564, '  .kaleid(5)', 4, 214, 255, 232);
  drawText(put, 52, 604, '  .color(0.9, 0.3, 0.6)', 4, 255, 211, 106);
  drawText(put, 52, 644, '  .out()', 4, 232, 90, 160);
  rr(put, 1008, 620, 1148, 672, 12, 57, 208, 197);
  drawText(put, 1030, 632, 'RUN', 3, 8, 32, 24);

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
