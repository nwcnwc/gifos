// Procedural Primitive icon: a face emerges from triangles.
// Super-sample → box-downsample; deterministic.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD = [18, 14, 20];
const SKIN = [232, 176, 140];
const HAIR = [48, 28, 22];
const EYE = [32, 24, 22];
const LIP = [168, 72, 82];
const BG = [46, 52, 68];

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
function portrait(x, y) {
  const dx = x - 64, dy = y - 64;
  if (dx * dx / (34 * 34) + (dy + 4) * (dy + 4) / (42 * 42) < 1) {
    if (dy < -14 && Math.abs(dx) < 28) return HAIR;
    if (dx * dx / (24 * 24) + (dy - 2) * (dy - 2) / (30 * 30) < 1) {
      if ((x - 54) * (x - 54) + (y - 58) * (y - 58) < 12) return EYE;
      if ((x - 74) * (x - 74) + (y - 58) * (y - 58) < 12) return EYE;
      if (y > 78 && y < 86 && Math.abs(dx) < 9) return LIP;
      return SKIN;
    }
    return HAIR;
  }
  return BG;
}
function bary(px, py, ax, ay, bx, by, cx, cy) {
  const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(d) < 1e-8) return null;
  const u = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
  const v = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
  const w = 1 - u - v;
  if (u < 0 || v < 0 || w < 0) return null;
  return [u, v, w];
}
// Largest-first, the way Primitive adds shapes. Centroids sample the face.
const TRIS = [
  [8, 8, 120, 8, 64, 120],
  [8, 8, 8, 120, 64, 64],
  [120, 8, 120, 120, 64, 64],
  [28, 18, 100, 18, 64, 108],
  [22, 36, 64, 12, 106, 36],
  [30, 44, 98, 44, 64, 102],
  [36, 52, 64, 22, 92, 52],
  [40, 70, 64, 38, 88, 70],
  [38, 48, 58, 48, 48, 68],
  [70, 48, 90, 48, 80, 68],
  [50, 74, 78, 74, 64, 92],
  [24, 88, 64, 108, 48, 118],
  [64, 108, 104, 88, 80, 118],
  [48, 20, 80, 20, 64, 40],
  [54, 54, 62, 54, 58, 64],
  [66, 54, 74, 54, 70, 64],
];
function triColor(t) {
  const cx = (t[0] + t[2] + t[4]) / 3;
  const cy = (t[1] + t[3] + t[5]) / 3;
  return portrait(cx, cy);
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, SKIN, HAIR, EYE, LIP, BG, [255, 255, 255], [236, 92, 64]]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
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
  const n = 3 + Math.round((f / (FRAMES - 1)) * (TRIS.length - 3));
  const m = 8, rad = 20;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    if (!inCard(x, y, m, rad)) continue;
    let col = CARD;
    for (let i = 0; i < n; i++) {
      const t = TRIS[i];
      if (bary(x, y, t[0], t[1], t[2], t[3], t[4], t[5])) col = triColor(t);
    }
    const o = (py * RW + px) * 4;
    rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0, nn = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
    }
    if (a / nn < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / nn, g / nn, b / nn);
  }
  return idx;
}

export function primitiveIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0;
    flat[i * 3 + 1] = pal[i][1] | 0;
    flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return {
    width: OUT, height: OUT, palette: flat, numColors: CT,
    minCodeSize: 6, frames, delayCs: 10, transparentIndex: 0
  };
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
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10001, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '%': [0b11001, 0b11010, 0b00100, 0b01000, 0b10110, 0b00110, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  '/': [0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b10000, 0b10000],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
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
function fillTri(put, ax, ay, bx, by, cx, cy, r, g, b) {
  const minx = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const maxx = Math.min(1199, Math.ceil(Math.max(ax, bx, cx)));
  const miny = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const maxy = Math.min(719, Math.ceil(Math.max(ay, by, cy)));
  for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
    if (bary(x + 0.5, y + 0.5, ax, ay, bx, by, cx, cy)) put(x, y, r, g, b);
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
  fill(0, 0, W, H, 18, 16, 20);
  drawText(put, 36, 22, 'PRIMITIVE', 5, 244, 235, 230);
  drawText(put, 36, 62, 'PHOTO TO TRIANGLES.', 2, 180, 160, 144);

  const x0 = 36, y0 = 96, w = 1128, h = 408;
  roundFill(28, 88, 1172, 512, 16, 11, 10, 14);
  fill(x0, y0, x0 + w, y0 + h, BG[0], BG[1], BG[2]);
  const box = h;
  const bx = x0 + (w - box) / 2, by = y0;
  const sc = box / OUT;
  function mapT(t) {
    return [bx + t[0] * sc, by + t[1] * sc, bx + t[2] * sc, by + t[3] * sc, bx + t[4] * sc, by + t[5] * sc];
  }
  const sides = [
    [x0, y0, bx + 30, y0, x0, y0 + h],
    [x0 + w, y0, x0 + w, y0 + h, bx + box - 30, y0],
  ];
  for (const t of sides) fillTri(put, t[0], t[1], t[2], t[3], t[4], t[5], 38, 42, 56);
  // Shoulders so the stage reads as a photo, not a floating mask.
  fillTri(put, bx + 40 * sc, by + 110 * sc, bx + 64 * sc, by + 90 * sc, bx + 20 * sc, by + 128 * sc, HAIR[0], HAIR[1], HAIR[2]);
  fillTri(put, bx + 88 * sc, by + 110 * sc, bx + 108 * sc, by + 128 * sc, bx + 64 * sc, by + 90 * sc, HAIR[0], HAIR[1], HAIR[2]);
  for (const src of TRIS) {
    const t = mapT(src);
    const col = triColor(src);
    fillTri(put, t[0], t[1], t[2], t[3], t[4], t[5], col[0] | 0, col[1] | 0, col[2] | 0);
  }
  drawText(put, 36, 104, '50 OF 50  91.20% SIMILAR', 2, 236, 92, 64);
  drawText(put, 360, 470, 'HOLD TO SEE THE ORIGINAL', 2, 180, 160, 144);

  roundFill(36, 540, 180, 588, 8, 236, 92, 64);
  drawText(put, 70, 554, 'START', 2, 26, 10, 8);
  roundFill(196, 540, 380, 588, 8, 28, 22, 26);
  drawText(put, 212, 554, 'TAKE PHOTO', 2, 244, 235, 230);
  roundFill(396, 540, 540, 588, 8, 28, 22, 26);
  drawText(put, 424, 554, 'CLASSIC', 2, 244, 235, 230);
  roundFill(556, 540, 740, 588, 8, 36, 24, 22);
  drawText(put, 572, 554, 'TRIANGLES', 2, 236, 92, 64);

  drawText(put, 36, 608, 'SHAPES 50', 2, 180, 160, 144);
  fill(200, 618, 780, 624, 58, 48, 52);
  fill(268, 610, 296, 632, 236, 92, 64);
  drawText(put, 36, 652, 'RASTER   VECTOR', 2, 180, 160, 144);
  fill(36, 688, 200, 708, 236, 92, 64);
  fill(216, 688, 400, 708, 48, 28, 22);
  fill(416, 688, 600, 708, 232, 176, 140);

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
