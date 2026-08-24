// Procedural icon: a yellow Backrooms hall, a dark figure closing, a muzzle flash.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD = [18, 14, 8];
const WALL = [196, 168, 48];
const WALL_D = [140, 112, 28];
const FLOOR = [168, 140, 48];
const CEIL = [210, 190, 90];
const DARK = [40, 28, 12];
const GUN = [70, 68, 62];
const FLASH = [255, 220, 120];
const FIG = [48, 16, 12];
const EYE = [220, 32, 24];

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
  for (const b of [CARD, WALL, WALL_D, FLOOR, CEIL, DARK, GUN, FLASH, FIG, EYE]) {
    pal.push(b);
    pal.push(mix(b, [255, 255, 255], 0.2).map(Math.round));
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
function fillRect(rgba, x, y, w, h, col) {
  const x0 = Math.max(0, x * SS | 0), y0 = Math.max(0, y * SS | 0);
  const x1 = Math.min(RW, (x + w) * SS | 0), y1 = Math.min(RW, (y + h) * SS | 0);
  for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) {
    const o = (py * RW + px) * 4;
    if (!rgba[o + 3]) continue;
    rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2];
  }
}
function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const flash = Math.max(0, Math.sin(t * Math.PI * 2));
  const close = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 - 0.3));
  const HORIZON = OUT * 0.42, VPX = OUT * 0.5;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    if (!inCard(x, y, 4, 16)) continue;
    const dx = x - VPX;
    const wall = Math.abs(dx) / Math.max(4, (y - HORIZON) * 1.2 + 8);
    let col;
    if (y < HORIZON) {
      col = mix(CEIL, WALL, Math.pow(y / HORIZON, 1.2) * 0.5);
      if (wall > 0.55) col = dx < 0 ? WALL : WALL_D;
    } else {
      const d = (y - HORIZON) / (OUT - HORIZON);
      col = mix(DARK, FLOOR, 0.25 + d * 0.75);
      if (wall > 0.7) col = dx < 0 ? WALL : WALL_D;
    }
    const o = (py * RW + px) * 4;
    rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
  }
  const gw = 8 + close * 16, gh = 14 + close * 24;
  const gx0 = VPX - gw * 0.35, gy0 = HORIZON - 2 + close * 10;
  fillRect(rgba, gx0 + gw * 0.22, gy0, gw * 0.42, gh * 0.28, FIG);
  fillRect(rgba, gx0 + gw * 0.12, gy0 + gh * 0.26, gw * 0.62, gh * 0.5, FIG);
  fillRect(rgba, gx0 + gw * 0.28, gy0 + gh * 0.08, gw * 0.08, gh * 0.08, EYE);
  fillRect(rgba, gx0 + gw * 0.48, gy0 + gh * 0.08, gw * 0.08, gh * 0.08, EYE);
  fillRect(rgba, 57, 88, 14, 34, GUN);
  fillRect(rgba, 61, 70, 6, 22, GUN);
  if (flash > 0.4) fillRect(rgba, 60, 62, 8 + flash * 6, 8 + flash * 4, FLASH);
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, al = 0, n = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; al += rgba[o + 3];
    }
    if (al / n < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}
export function backdoomsIcon() {
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
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
};
function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
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
  const HORIZON = 300, VPX = W / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - VPX;
    if (y < HORIZON) {
      const wall = Math.abs(dx) / Math.max(8, (HORIZON - y) * 1.4 + 40);
      if (wall > 0.48) put(x, y, dx < 0 ? 210 : 168, dx < 0 ? 176 : 132, dx < 0 ? 52 : 32);
      else put(x, y, 228, 206, 92);
    } else {
      const d = (y - HORIZON) / (H - HORIZON);
      put(x, y, 138 + d * 36, 108 + d * 18, 28);
      const wall = Math.abs(dx) / Math.max(8, (y - HORIZON) * 1.2 + 20);
      if (wall > 0.68) put(x, y, dx < 0 ? 186 : 140, dx < 0 ? 150 : 108, dx < 0 ? 40 : 24);
    }
  }
  function fig(cx, cy, s) {
    for (let y = cy; y < cy + s; y++) for (let x = cx - s * 0.22; x < cx + s * 0.22; x++) put(x, y, 52, 18, 12);
    for (let y = cy - s * 0.28; y < cy; y++) for (let x = cx - s * 0.16; x < cx + s * 0.16; x++) put(x, y, 40, 14, 10);
    put(cx - s * 0.06, cy - s * 0.16, 220, 36, 24);
    put(cx + s * 0.06, cy - s * 0.16, 220, 36, 24);
    const barW = s * 0.4;
    for (let x = cx - barW; x < cx + barW; x++) put(x, cy - s * 0.36, 20, 80, 20);
  }
  fig(VPX + 20, 310, 160);
  fig(VPX - 140, 280, 70);
  fig(VPX + 220, 295, 90);
  for (let y = 430; y < 700; y++) {
    const w = 14 + (y - 430) * 0.1;
    for (let x = VPX - w; x < VPX + w; x++) put(x, y, 78, 74, 66);
  }
  for (let i = 0; i < 180; i++) {
    const ang = (i * 2.399) % (Math.PI * 2), rad = (i * 17 % 40);
    put(VPX + Math.cos(ang) * rad, 340 + Math.sin(ang) * rad * 0.6, 255, 220, 120);
  }
  for (let x = 36; x < 36 + 220; x++) for (let y = 28; y < 42; y++) put(x, y, 200, 24, 24);
  for (let x = 36; x < 36 + 90; x++) for (let y = 48; y < 56; y++) put(x, y, 240, 210, 40);
  drawText(put, 36, H - 64, 'BACKDOOMS', 5, 240, 220, 140);
  drawText(put, 36, 64, 'SCORE 12', 4, 255, 255, 255);
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
