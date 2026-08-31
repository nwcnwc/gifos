// Procedural icon: a film strip being TRIMMED. A teal blade sweeps, the
// offcut slides away. Reads at 64px. Super-sample → box-downsample → palette.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [18, 32, 28];
const CARD_B = [8, 14, 12];
const FILM = [210, 220, 214];
const FILM_D = [40, 52, 48];
const HOLE = [12, 18, 16];
const BLADE = [16, 185, 160];
const BLADE_H = [180, 255, 230];
const WAVE = [90, 230, 200];

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
  for (const b of [CARD_A, CARD_B, FILM, FILM_D, HOLE, BLADE, BLADE_H, WAVE]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
  }
  return pal;
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
  const u = f / (FRAMES - 1);
  const cutX = 28 + u * 72;
  const fall = Math.max(0, (u - 0.45) / 0.55);
  const offY = fall * 28;
  const offA = 1 - fall;

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 7, 20)) continue;
      let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 7) / (OUT - 14))));
      const fy0 = 38, fy1 = 90;
      const inFilmY = y >= fy0 && y <= fy1;
      const onLeft = x < cutX;
      const onRight = x >= cutX;
      const ry = y + (onRight ? offY : 0);
      const show = inFilmY && (onLeft || (onRight && offA > 0.08 && ry <= fy1 + 4));
      if (show && ry >= fy0 && ry <= fy1 && x >= 22 && x <= 106) {
        col = FILM;
        const holeRow = (ry - fy0 < 8) || (fy1 - ry < 8);
        if (holeRow) {
          const hx = ((x - 26) % 14) - 7;
          if (hx * hx + Math.pow((ry - fy0 < 8 ? ry - fy0 - 4 : ry - fy1 + 4), 2) < 6) col = HOLE;
        } else {
          const cell = Math.floor((x - 24) / 20);
          const shade = 0.12 * ((cell + f) % 3);
          col = mix(FILM, FILM_D, 0.15 + shade);
          if (Math.abs(x - (24 + cell * 20 + 10)) < 0.6) col = FILM_D;
        }
        if (onRight) col = mix(col, CARD_A, 1 - offA);
      }
      const dBlade = Math.abs(x - cutX);
      if (dBlade < 2.2 && y >= fy0 - 6 && y <= fy1 + 8) {
        col = dBlade < 0.9 ? BLADE_H : mix(BLADE, BLADE_H, 0.35);
      }
      if (u > 0.55 && onLeft && inFilmY) {
        const wx = x - 40, wy = 100;
        const bar = Math.sin((x * 0.45) + f * 0.7);
        if (Math.abs(y - wy) < 3 + bar * 5 && x > 28 && x < cutX - 2) col = WAVE;
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

export function ffmpegStudioIcon() {
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
function chunk(tag, data) {
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
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0, 0b00100],
  ':': [0, 0b00100, 0, 0, 0b00100, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '%': [0b10001, 0b10010, 0b00100, 0b01000, 0b10001, 0, 0],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '6': [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
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
  const rr = (x0, y0, x1, y1, rad, r, g, b) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
      const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
    }
  };

  fill(0, 0, W, H, 11, 18, 16);
  drawText(put, 48, 28, 'FFMPEG.WASM STUDIO', 3, 231, 244, 239);
  drawText(put, 48, 58, 'NOTHING IS UPLOADED', 2, 142, 174, 164);

  rr(36, 96, 760, 500, 16, 8, 12, 11);
  for (let y = 112; y < 484; y++) {
    for (let x = 52; x < 744; x++) {
      const u = (x - 52) / 692, v = (y - 112) / 372;
      let r = 24 + v * 30, g = 48 + (1 - v) * 40, b = 56;
      if (v > 0.55 + 0.08 * Math.sin(u * 7)) { r = 28; g = 22; b = 18; }
      const face = Math.hypot(u - 0.48, v - 0.38);
      if (face < 0.18) { r = 210; g = 170; b = 130; }
      put(x, y, r, g, b);
    }
  }
  fill(52, 430, 744, 438, 16, 185, 160);
  fill(52, 430, 320, 438, 126, 238, 216);
  rr(300, 420, 340, 448, 6, 16, 185, 160);
  drawText(put, 60, 456, 'CONCERT.MP4  24.1 MB  3:12', 2, 180, 210, 200);

  rr(780, 96, 1164, 680, 16, 18, 28, 25);
  const chips = [['TRIM', true], ['MP3', false], ['GIF', false], ['MP4', false]];
  chips.forEach((c, i) => {
    const x = 800 + (i % 2) * 170, y = 120 + Math.floor(i / 2) * 52;
    if (c[1]) rr(x, y, x + 150, y + 40, 18, 16, 185, 160);
    else rr(x, y, x + 150, y + 40, 18, 24, 38, 34);
    drawText(put, x + 28, y + 12, c[0], 2, c[1] ? 6 : 231, c[1] ? 34 : 244, c[1] ? 28 : 239);
  });
  drawText(put, 800, 240, 'START  0:12', 2, 142, 174, 164);
  rr(800, 268, 1144, 308, 8, 11, 18, 16);
  drawText(put, 816, 278, '0:12', 2, 231, 244, 239);
  drawText(put, 800, 328, 'END  0:38', 2, 142, 174, 164);
  rr(800, 356, 1144, 396, 8, 11, 18, 16);
  drawText(put, 816, 366, '0:38', 2, 231, 244, 239);
  rr(800, 430, 1144, 490, 12, 16, 185, 160);
  drawText(put, 930, 448, 'RUN', 3, 6, 34, 28);
  fill(800, 510, 1144, 516, 42, 63, 56);
  fill(800, 510, 1030, 516, 16, 185, 160);
  drawText(put, 800, 532, '67%  COPY TRIM', 2, 126, 238, 216);
  drawText(put, 800, 580, 'CLIP.MP4  4.2 MB', 2, 231, 244, 239);
  rr(800, 616, 1144, 660, 10, 16, 185, 160);
  drawText(put, 860, 628, 'DOWNLOAD', 2, 6, 34, 28);

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
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
