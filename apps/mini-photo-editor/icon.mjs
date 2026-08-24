// Procedural Mini Photo Editor icon: a landscape with a crop window that
// shrinks, then a warm filter wash. Super-sample → box-downsample.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD = [32, 32, 32];
const SKY = [110, 170, 220];
const SKY2 = [240, 196, 120];
const GROUND = [46, 120, 72];
const SUN = [255, 214, 90];
const TREE = [28, 72, 44];
const WHITE = [255, 255, 255];
const CORAL = [196, 92, 38];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, SKY, SKY2, GROUND, SUN, TREE, WHITE, CORAL]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
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
  const m = 8, rad = 22, t = f / (FRAMES - 1);
  const inset = 14 + t * 16;
  const warm = t * 0.45;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    if (!inCard(x, y, m, rad)) continue;
    let col;
    if (y < 70) col = mix(SKY, SKY2, Math.max(0, Math.min(1, (y - 12) / 58)));
    else col = mix(GROUND, TREE, Math.max(0, Math.min(1, (y - 70) / 40)));
    const sd = (x - 42) * (x - 42) + (y - 38) * (y - 38);
    if (sd < 14 * 14) col = SUN;
    if (x > 78 && x < 92 && y > 52 && y < 92) col = TREE;
    if (x > 72 && x < 98 && y > 44 && y < 58) col = TREE;
    const inCrop = x >= m + inset && x <= OUT - m - inset && y >= m + inset && y <= OUT - m - inset * 0.7;
    if (!inCrop) col = mix(col, [8, 8, 10], 0.55);
    col = mix(col, [220, 140, 60], warm);
    const o = (py * RW + px) * 4;
    rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
  }
  const x0 = m + inset, x1 = OUT - m - inset, y0 = m + inset, y1 = OUT - m - inset * 0.7;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    const on = (Math.abs(x - x0) < 1.6 || Math.abs(x - x1) < 1.6) && y >= y0 && y <= y1
      || (Math.abs(y - y0) < 1.6 || Math.abs(y - y1) < 1.6) && x >= x0 && x <= x1;
    if (!on) continue;
    const o = (py * RW + px) * 4;
    rgba[o] = 255; rgba[o + 1] = 255; rgba[o + 2] = 255; rgba[o + 3] = 1;
  }
  const hs = 3.2;
  const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
  for (const [cx, cy] of corners) {
    for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (Math.abs(x - cx) <= hs && Math.abs(y - cy) <= hs) {
        const o = (py * RW + px) * 4;
        rgba[o] = 196; rgba[o + 1] = 92; rgba[o + 2] = 38; rgba[o + 3] = 1;
      }
    }
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
export function miniPhotoIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64, flat = new Array(CT * 3).fill(0);
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
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
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
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  ':': [0, 0b00100, 0b00100, 0, 0b00100, 0b00100, 0],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  '6': [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
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
  const fill = (x0, y0, x1, y1, r, g, b) => {
    for (let y = Math.max(0, y0 | 0); y < Math.min(H, y1 | 0); y++)
      for (let x = Math.max(0, x0 | 0); x < Math.min(W, x1 | 0); x++) put(x, y, r, g, b);
  };
  const rr = (x0, y0, x1, y1, rad, r, g, b) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
      const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
    }
  };

  fill(0, 0, W, H, 18, 18, 20);
  drawText(put, 36, 28, 'MINI PHOTO EDITOR', 4, 238, 234, 227);
  drawText(put, 36, 72, 'CROP ROTATE FILTER  ON THIS DEVICE', 2, 196, 92, 38);

  // landscape
  for (let y = 110; y < 560; y++) {
    const t = (y - 110) / 280;
    const r = 90 + t * 80, g = 140 - t * 20, b = 210 - t * 90;
    fill(36, y, 1164, y + 1, r, g, b);
  }
  fill(36, 380, 1164, 560, 42, 122, 70);
  // sun
  for (let y = 150; y < 250; y++) for (let x = 160; x < 260; x++) {
    if ((x - 210) * (x - 210) + (y - 200) * (y - 200) < 48 * 48) put(x, y, 255, 214, 90);
  }
  fill(780, 260, 860, 420, 30, 80, 44);
  fill(740, 220, 900, 280, 30, 80, 44);

  // dim outside crop
  fill(36, 110, 1164, 170, 12, 12, 14);
  fill(36, 500, 1164, 560, 12, 12, 14);
  fill(36, 170, 220, 500, 12, 12, 14);
  fill(980, 170, 1164, 500, 12, 12, 14);

  // crop frame
  fill(220, 170, 980, 176, 255, 255, 255);
  fill(220, 494, 980, 500, 255, 255, 255);
  fill(220, 170, 226, 500, 255, 255, 255);
  fill(974, 170, 980, 500, 255, 255, 255);
  const hs = 18;
  [[220, 170], [980, 170], [220, 500], [980, 500]].forEach(([cx, cy]) => {
    fill(cx - hs, cy - hs, cx + hs, cy + hs, 196, 92, 38);
  });

  // chips
  const looks = ['NONE', 'GREY', 'VINTAGE', 'POLAROID', 'KODAK', 'BROWNI'];
  looks.forEach((name, i) => {
    const x0 = 36 + i * 192;
    const on = name === 'VINTAGE';
    rr(x0, 580, x0 + 180, 640, 16, on ? 196 : 28, on ? 92 : 27, on ? 38 : 24);
    drawText(put, x0 + 16, 598, name, 2, 238, 234, 227);
  });
  drawText(put, 36, 660, 'BRIGHT  CONTRAST  SAT  WARMTH  VIGNETTE', 2, 184, 176, 164);

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
