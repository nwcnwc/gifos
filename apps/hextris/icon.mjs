// Procedural Hextris icon: a dark-outlined sticker of the centre hex.
// Across the frames a red piece falls onto a matching stack, the three
// flash and clear — it has to read at 64px. Pure Node, super-sample →
// box-downsample → small palette. screenshotPng() paints the 1200×720
// store cover: a mid-game hex with real stacks, not an empty first boot.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 16;

const CARD = [236, 240, 241];
const CARD_D = [210, 216, 220];
const INK = [44, 62, 80];
const GREY = [189, 195, 199];
const RED = [231, 76, 60];
const YEL = [241, 196, 15];
const BLU = [52, 152, 219];
const GRN = [46, 204, 113];
const FLASH = [255, 255, 255];
const OUTLINE = [20, 28, 36];

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
  for (const b of [CARD, CARD_D, INK, GREY, RED, YEL, BLU, GRN, FLASH, OUTLINE]) {
    pal.push(b.map(Math.round));
    pal.push(mix(b, [255, 255, 255], 0.22).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.28).map(Math.round));
  }
  pal.push([255, 255, 255]);
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
function distSeg(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-8) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / l2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}
function distPoly(px, py, pts, closed) {
  let best = 1e9, wn = 0;
  const n = pts.length / 2;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % n;
    const x0 = pts[i * 2], y0 = pts[i * 2 + 1], x1 = pts[j * 2], y1 = pts[j * 2 + 1];
    const d = distSeg(px, py, x0, y0, x1, y1);
    if (d < best) best = d;
    if (y0 <= py) { if (y1 > py && (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) > 0) wn++; }
    else if (y1 <= py && (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0) < 0) wn--;
  }
  return { d: best, in: wn !== 0 };
}
function hexPts(cx, cy, r, rotDeg) {
  const out = [];
  const rot = rotDeg * Math.PI / 180;
  for (let i = 0; i < 6; i++) {
    const a = rot + i * Math.PI / 3;
    out.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return out;
}
function trap(cx, cy, angDeg, dist, h, w0, w1) {
  const a = angDeg * Math.PI / 180;
  const ux = Math.cos(a), uy = Math.sin(a);
  const px = -uy, py = ux;
  const x = cx + ux * dist, y = cy + uy * dist;
  return [
    x + px * w0 - ux * h / 2, y + py * w0 - uy * h / 2,
    x - px * w0 - ux * h / 2, y - py * w0 - uy * h / 2,
    x - px * w1 + ux * h / 2, y - py * w1 + uy * h / 2,
    x + px * w1 + ux * h / 2, y + py * w1 + uy * h / 2,
  ];
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const cx = 64, cy = 68;
  const land = 8;
  const k = f <= land ? f / land : 1;
  const fallingDist = 48 - k * 22;
  const flash = f > land ? Math.max(0, 1 - (f - land) / 6) : 0;
  const gone = f >= 13;
  const hex = hexPts(cx, cy, 18, 30);
  const ring = hexPts(cx, cy, 50, 30);
  const settled = [
    { pts: trap(cx, cy, 90, 28, 10, 11, 14), col: RED, match: true },
    { pts: trap(cx, cy, 90, 38, 10, 14, 17), col: RED, match: true },
    { pts: trap(cx, cy, 30, 28, 10, 11, 14), col: BLU, match: false },
    { pts: trap(cx, cy, 150, 28, 10, 11, 14), col: YEL, match: false },
    { pts: trap(cx, cy, 210, 28, 10, 11, 14), col: GRN, match: false },
  ];
  const fall = trap(cx, cy, 90, fallingDist, 10, 17, 20);

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 22)) continue;
      let col = mix(CARD, CARD_D, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      const dr = distPoly(x, y, ring, true);
      const dh = distPoly(x, y, hex, true);
      if (dr.in) col = GREY;
      if (dh.in) col = INK;
      if (dh.d < 1.4 && !dh.in) col = OUTLINE;
      if (dr.d < 1.6 && !dr.in) col = mix(GREY, OUTLINE, 0.45);
      for (const b of settled) {
        if (gone && b.match) continue;
        const dp = distPoly(x, y, b.pts, true);
        if (dp.in) {
          col = (b.match && flash) ? mix(b.col, FLASH, flash) : b.col;
          if (dp.d < 0.7) col = mix(col, OUTLINE, 0.25);
        }
      }
      if (!gone) {
        const df = distPoly(x, y, fall, true);
        if (df.in) {
          col = flash ? mix(RED, FLASH, flash) : RED;
          if (df.d < 0.7) col = mix(col, OUTLINE, 0.25);
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

export function hextrisIcon() {
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
    minCodeSize: 6, frames, delayCs: 8, transparentIndex: 0
  };
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
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b01010, 0b10001],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  3: [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  6: [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const gph = GLYPHS[ch] || GLYPHS[' '];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (gph[row] & (1 << (4 - col))) {
          for (let dy = 0; dy < s; dy++) {
            for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
          }
        }
      }
    }
    cx += 6 * s;
  }
}
function fillPoly(put, pts, r, g, b) {
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, pts[i * 2]); minY = Math.min(minY, pts[i * 2 + 1]);
    maxX = Math.max(maxX, pts[i * 2]); maxY = Math.max(maxY, pts[i * 2 + 1]);
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
      if (distPoly(x, y, pts, true).in) put(x, y, r, g, b);
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
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 236, 240, 241);

  const cx = 620, cy = 390;
  fillPoly(put, hexPts(cx, cy, 268, 30), 189, 195, 199);
  const lanes = [
    { a: 90, cols: [RED, RED, BLU] },
    { a: 30, cols: [YEL, YEL, YEL, GRN] },
    { a: 150, cols: [BLU, RED] },
    { a: 210, cols: [GRN, GRN, YEL] },
    { a: 270, cols: [RED, BLU, BLU] },
    { a: 330, cols: [YEL, GRN] },
  ];
  const side = 78;
  const bh = 28;
  for (const ln of lanes) {
    for (let k = 0; k < ln.cols.length; k++) {
      const c = ln.cols[k];
      const dist = side * Math.sqrt(3) / 2 + 18 + k * bh;
      const w0 = 22 + k * 8, w1 = 30 + k * 8;
      fillPoly(put, trap(cx, cy, ln.a, dist, bh - 2, w0, w1), c[0], c[1], c[2]);
    }
  }
  fillPoly(put, hexPts(cx, cy, side, 30), 44, 62, 80);
  fillPoly(put, trap(cx, cy, 90, 210, 26, 38, 44), 231, 76, 60);

  drawText(put, 36, 28, 'HEXTRIS', 8, 44, 62, 80);
  drawText(put, 36, 100, '1843', 10, 44, 62, 80);
  drawText(put, 36, 188, 'HIGH SCORE  10292', 3, 149, 165, 166);
  drawText(put, 36, 240, 'RACE FROM ONE LINK', 3, 52, 152, 219);
  drawText(put, 36, 292, 'SAME BLOCKS', 3, 44, 62, 80);
  drawText(put, 36, 344, 'TWO HEXES', 3, 231, 76, 60);
  drawText(put, 36, 396, 'LAST ONE STACKING', 3, 46, 204, 113);

  // Friend ghost, top-right.
  const fx = 1048, fy = 128;
  fillPoly(put, hexPts(fx, fy, 78, 30), 189, 195, 199);
  fillPoly(put, hexPts(fx, fy, 28, 30), 44, 62, 80);
  fillPoly(put, trap(fx, fy, 90, 42, 12, 14, 18), 231, 76, 60);
  fillPoly(put, trap(fx, fy, 30, 42, 12, 14, 18), 52, 152, 219);
  fillPoly(put, trap(fx, fy, 150, 42, 12, 14, 18), 241, 196, 15);
  drawText(put, 980, 214, 'LEE  960', 3, 44, 62, 80);

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
