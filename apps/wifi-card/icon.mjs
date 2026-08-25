// Procedural WiFi Card icon: a white rounded card, wifi arcs that fill in,
// a QR-like square in the corner. Pure Node, super-sample → box-downsample.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [250, 251, 253];
const INK = [28, 36, 52];
const BLUE = [33, 118, 199];
const BLUE_D = [20, 78, 150];
const LINE = [201, 206, 216];
const DOT = [18, 18, 18];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, INK, BLUE, BLUE_D, LINE, DOT, [255, 255, 255]]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.25).map(Math.round));
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

function finder(x, y, ox, oy, s) {
  const lx = x - ox, ly = y - oy;
  if (lx < 0 || ly < 0 || lx >= 7 * s || ly >= 7 * s) return null;
  const cx = Math.floor(lx / s), cy = Math.floor(ly / s);
  const ring = cx === 0 || cy === 0 || cx === 6 || cy === 6;
  const inner = cx >= 2 && cx <= 4 && cy >= 2 && cy <= 4;
  if (ring || inner) return DOT;
  return CARD;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  const m = 8, rad = 18;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    if (!inCard(x, y, m, rad)) continue;
    let col = CARD;
    const wx = 46, wy = 52;
    const dx = x - wx, dy = y - wy;
    const d = Math.sqrt(dx * dx + dy * dy);
    const ang = Math.atan2(-dy, dx);
    const fan = ang > -2.5 && ang < -0.6;
    if (d < 3.2) col = mix(BLUE, BLUE_D, t);
    for (let k = 0; k < 3; k++) {
      const r0 = 10 + k * 8, r1 = r0 + 3.2;
      const lit = t > k * 0.22;
      if (fan && d > r0 && d < r1 && lit) col = mix(BLUE, [140, 190, 235], k * 0.15);
    }
    const qx = 70, qy = 64, qs = 3.1;
    const q = finder(x, y, qx, qy, qs) || finder(x, y, qx + 18, qy, qs) ||
      finder(x, y, qx, qy + 18, qs);
    if (q && t > 0.35) {
      const jitter = ((Math.floor(x) * 13 + Math.floor(y) * 7 + f) % 5) === 0;
      if (q === DOT) col = DOT;
      else if (x > qx + 7 && y > qy + 7 && x < qx + 24 && y < qy + 24 && jitter && t > 0.55) col = DOT;
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

export function wifiCardIcon() {
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
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
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

function drawFinder(put, ox, oy, s) {
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const ring = x === 0 || y === 0 || x === 6 || y === 6;
    const inner = x >= 2 && x <= 4 && y >= 2 && y <= 4;
    const on = ring || inner;
    const col = on ? [18, 18, 18] : [255, 255, 255];
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
      put(ox + x * s + dx, oy + y * s + dy, col[0], col[1], col[2]);
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

  fill(0, 0, W, H, 246, 247, 251);
  drawText(put, 64, 48, 'WIFI CARD', 6, 28, 36, 52);
  drawText(put, 64, 110, 'POINT A PHONE AT THE CODE.', 3, 91, 101, 120);

  rr(64, 170, 1136, 660, 18, 255, 255, 255);
  // fake card edge
  for (let y = 170; y < 660; y++) {
    put(64, y, 201, 206, 216); put(1135, y, 201, 206, 216);
  }
  for (let x = 64; x < 1136; x++) {
    put(x, 170, 201, 206, 216); put(x, 659, 201, 206, 216);
  }

  drawText(put, 100, 200, 'WIFI LOGIN', 5, 28, 36, 52);

  const qx = 100, qy = 280, s = 8, n = 25;
  fill(qx, qy, qx + n * s, qy + n * s, 255, 255, 255);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const inF = (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
    if (inF) continue;
    if ((x * 7 + y * 13 + x * y) % 3 === 0) {
      fill(qx + x * s, qy + y * s, qx + (x + 1) * s, qy + (y + 1) * s, 18, 18, 18);
    }
  }
  drawFinder(put, qx, qy, s);
  drawFinder(put, qx + 18 * s, qy, s);
  drawFinder(put, qx, qy + 18 * s, s);

  drawText(put, 360, 300, 'NETWORK NAME', 3, 91, 101, 120);
  rr(360, 340, 1080, 410, 8, 248, 249, 252);
  drawText(put, 380, 358, 'GUEST', 4, 28, 36, 52);

  drawText(put, 360, 440, 'PASSWORD', 3, 91, 101, 120);
  rr(360, 480, 1080, 550, 8, 248, 249, 252);
  drawText(put, 380, 498, 'TEA-AND-CAKE', 4, 28, 36, 52);

  drawText(put, 100, 600, 'POINT YOUR PHONE AT THE CODE', 3, 91, 101, 120);

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
