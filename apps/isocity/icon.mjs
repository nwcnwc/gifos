// IsoCity icon + cover from the Kenney sheet. Icon: a cream card, a tiny
// isometric city that grows across the frames (dirt → roads → trees → houses
// → towers). Cover: a built city mid-use, never empty dirt, with a share bar
// so the card sells the reason this copy exists. Pure Node, deterministic.
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = 128, SS = 2, RW = OUT * SS, FRAMES = 12;
const here = dirname(fileURLToPath(import.meta.url));

const CREAM = [250, 246, 238];
const SKY = [214, 232, 242];
const INK = [90, 74, 64];
const ACCENT = [176, 83, 85];
const WHITE = [250, 246, 238];
const CHIP = [246, 241, 234];

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

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
function decodePng(buf) {
  if (buf[0] !== 0x89) throw new Error('not a png');
  let i = 8, w = 0, h = 0, depth = 8, ctype = 6;
  const idats = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const typ = buf.toString('ascii', i + 4, i + 8);
    const chunk = buf.subarray(i + 8, i + 8 + len);
    i += 12 + len;
    if (typ === 'IHDR') {
      w = chunk.readUInt32BE(0); h = chunk.readUInt32BE(4);
      depth = chunk[8]; ctype = chunk[9];
      if (chunk[12] !== 0) throw new Error('interlaced png');
    } else if (typ === 'IDAT') idats.push(chunk);
    else if (typ === 'IEND') break;
  }
  const samples = ctype === 2 ? 3 : 4;
  const bpp = samples;
  const rowBytes = w * bpp;
  const raw = inflateSync(Buffer.concat(idats));
  const out = Buffer.alloc(w * h * 4);
  let src = 0;
  let prev = Buffer.alloc(rowBytes);
  for (let y = 0; y < h; y++) {
    const filt = raw[src++];
    const row = Buffer.alloc(rowBytes);
    raw.copy(row, 0, src, src + rowBytes); src += rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = row[x];
      if (filt === 1) v = (v + a) & 255;
      else if (filt === 2) v = (v + b) & 255;
      else if (filt === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filt === 4) v = (v + paeth(a, b, c)) & 255;
      else if (filt !== 0) throw new Error('bad filter ' + filt);
      row[x] = v;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (ctype === 6) {
        const s = x * 4;
        out[o] = row[s]; out[o + 1] = row[s + 1]; out[o + 2] = row[s + 2]; out[o + 3] = row[s + 3];
      } else {
        const s = x * 3;
        out[o] = row[s]; out[o + 1] = row[s + 1]; out[o + 2] = row[s + 2]; out[o + 3] = 255;
      }
    }
    prev = row;
  }
  return { w, h, p: out };
}

const sheet = decodePng(readFileSync(join(here, 'vendor/textures/01_130x66_130x230.png')));
const TW = 130, TH = 230;
const tileCache = new Map();

function tileSprite(row, col) {
  const key = row + ',' + col;
  if (tileCache.has(key)) return tileCache.get(key);
  const p = Buffer.alloc(TW * TH * 4);
  for (let y = 0; y < TH; y++) {
    const sy = row * TH + y;
    for (let x = 0; x < TW; x++) {
      const sx = col * TW + x;
      const s = (sy * sheet.w + sx) * 4;
      const d = (y * TW + x) * 4;
      const r = sheet.p[s], g = sheet.p[s + 1], b = sheet.p[s + 2], a = sheet.p[s + 3];
      if (r + g + b < 18) { p[d + 3] = 0; continue; }
      p[d] = r; p[d + 1] = g; p[d + 2] = b; p[d + 3] = a;
    }
  }
  const spr = { w: TW, h: TH, p };
  tileCache.set(key, spr);
  return spr;
}

function blit(dst, dw, dh, src, dx, dy, scale) {
  const sw = Math.max(1, Math.round(src.w * scale));
  const sh = Math.max(1, Math.round(src.h * scale));
  const x0 = Math.max(0, dx | 0), y0 = Math.max(0, dy | 0);
  const x1 = Math.min(dw, (dx | 0) + sw), y1 = Math.min(dh, (dy | 0) + sh);
  for (let y = y0; y < y1; y++) {
    const sy = Math.min(src.h - 1, ((y - (dy | 0)) / scale) | 0);
    for (let x = x0; x < x1; x++) {
      const sx = Math.min(src.w - 1, ((x - (dx | 0)) / scale) | 0);
      const o = (sy * src.w + sx) * 4;
      const a = src.p[o + 3];
      if (a < 8) continue;
      const d = (y * dw + x) * 4;
      const aa = a / 255;
      dst[d] = Math.round(src.p[o] * aa + dst[d] * (1 - aa));
      dst[d + 1] = Math.round(src.p[o + 1] * aa + dst[d + 1] * (1 - aa));
      dst[d + 2] = Math.round(src.p[o + 2] * aa + dst[d + 2] * (1 - aa));
      dst[d + 3] = 255;
    }
  }
}

function isoBlit(dst, dw, dh, row, col, mapX, mapY, ox, oy, scale) {
  const spr = tileSprite(row, col);
  const tileW = 128 * scale, tileH = 64 * scale;
  const dx = ox + (mapY - mapX) * tileW / 2 - 65 * scale;
  const dy = oy + (mapX + mapY) * tileH / 2 - 130 * scale;
  blit(dst, dw, dh, spr, dx, dy, scale);
}

function buildPalette() {
  const pal = [[0, 0, 0]];
  const bases = [CREAM, SKY, INK, ACCENT, WHITE, CHIP, [142, 186, 90], [110, 180, 212], [196, 82, 74], [232, 210, 170], [120, 120, 124], [186, 166, 132]];
  for (const b of bases) {
    pal.push(b.map(Math.round));
    pal.push(mix(b, [255, 255, 255], 0.18).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.22).map(Math.round));
    pal.push(mix(b, [255, 255, 255], 0.4).map(Math.round));
  }
  return pal.slice(0, 64);
}
function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e9;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b, d = dr * dr + dg * dg + db * db;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

// 4×4 city. Frame 0 is dirt; later frames grow roads, trees, water, houses, towers.
const GROW = [
  { f: 2, x: 0, y: 1, r: 0, c: 2 },
  { f: 2, x: 1, y: 1, r: 0, c: 8 },
  { f: 2, x: 2, y: 1, r: 0, c: 3 },
  { f: 3, x: 3, y: 1, r: 4, c: 4 },
  { f: 3, x: 0, y: 0, r: 0, c: 6 },
  { f: 4, x: 3, y: 0, r: 0, c: 7 },
  { f: 5, x: 1, y: 2, r: 5, c: 8 },
  { f: 6, x: 2, y: 2, r: 4, c: 6 },
  { f: 7, x: 1, y: 0, r: 0, c: 1 },
  { f: 8, x: 0, y: 2, r: 5, c: 0 },
  { f: 9, x: 2, y: 0, r: 5, c: 2 },
  { f: 10, x: 1, y: 3, r: 5, c: 1 },
  { f: 11, x: 2, y: 3, r: 4, c: 10 },
];

function cityAt(f) {
  const cells = [];
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) cells.push({ x, y, r: 0, c: 0 });
  for (const e of GROW) {
    if (f < e.f) continue;
    const i = e.x * 4 + e.y;
    cells[i] = { x: e.x, y: e.y, r: e.r, c: e.c };
  }
  cells.sort((a, b) => (a.x + a.y) - (b.x + b.y) || a.x - b.x);
  return cells;
}

function frameIndices(pal, f) {
  const rgba = Buffer.alloc(RW * RW * 4);
  const m = 6, rad = 18;
  const scale = 0.30;
  const ox = 64 * SS, oy = 44 * SS;
  const cells = cityAt(f);

  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    if (!inCard(x, y, m, rad)) continue;
    const col = mix(SKY, CREAM, Math.max(0, Math.min(1, (y - 8) / 90)));
    const o = (py * RW + px) * 4;
    rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 255;
  }

  for (const T of cells) {
    isoBlit(rgba, RW, RW, T.r, T.c, T.x, T.y, ox, oy, scale * SS);
  }

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
    }
    if (a / n < 80) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}

export function isocityIcon() {
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
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
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

// 7×7 built city, x-major like IsoCity.pack(). Never empty dirt.
export const DEMO = [
  [5, 2], [0, 4], [5, 3], [5, 11], [4, 10], [0, 6], [4, 4],
  [0, 2], [0, 8], [0, 2], [0, 2], [0, 9], [0, 7], [4, 4],
  [5, 0], [0, 5], [5, 1], [0, 1], [5, 7], [0, 6], [4, 5],
  [0, 6], [5, 8], [0, 3], [0, 8], [0, 3], [5, 6], [4, 4],
  [5, 5], [0, 2], [4, 7], [0, 2], [5, 4], [0, 7], [4, 5],
  [0, 7], [5, 10], [0, 3], [0, 8], [0, 3], [4, 6], [4, 1],
  [5, 9], [0, 6], [5, 7], [4, 8], [0, 6], [4, 11], [4, 0],
];

export function screenshotPng() {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };

  for (let y = 0; y < H; y++) {
    const c = mix([214, 232, 242], [250, 246, 238], y / H);
    for (let x = 0; x < W; x++) put(x, y, c[0], c[1], c[2]);
  }

  // App chrome — mid-use of Share the map, not a poster.
  for (let y = 0; y < 56; y++) for (let x = 0; x < W; x++) put(x, y, 255, 255, 255);
  for (let x = 0; x < W; x++) put(x, 56, 236, 230, 222);
  drawText(put, 28, 18, 'ISOCITY', 3, 176, 83, 85);
  for (let y = 12; y < 44; y++) for (let x = 430; x < 690; x++) put(x, y, 176, 83, 85);
  drawText(put, 446, 18, 'SHARE THE MAP', 3, 250, 246, 238);
  function pill(x0, y0, x1, y1, fill, ink, label) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + 12), x1 - 13);
      const cy = Math.min(Math.max(y, y0 + 12), y1 - 13);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= 12 * 12) put(x, y, fill[0], fill[1], fill[2]);
    }
    drawText(put, x0 + 16, y0 + 8, label, 2, ink[0], ink[1], ink[2]);
  }
  pill(720, 12, 830, 44, [255, 244, 242], ACCENT, 'YOU');
  pill(846, 12, 956, 44, CHIP, INK, 'SAM');

  const scale = 1.12;
  const ox = 600, oy = 188;
  const order = [];
  for (let x = 0; x < 7; x++) for (let y = 0; y < 7; y++) {
    const t = DEMO[x * 7 + y];
    order.push({ x, y, r: t[0], c: t[1] });
  }
  order.sort((a, b) => (a.x + a.y) - (b.x + b.y) || a.x - b.x);
  for (const T of order) isoBlit(rgba, W, H, T.r, T.c, T.x, T.y, ox, oy, scale);

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
