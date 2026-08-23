// Procedural Guitar Bro icon: a navy neck, six strings, a note falling in.
// Pure Node, super-sample → box-downsample. Deterministic.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 10;

const NAVY = [29, 53, 87];
const NAVY2 = [20, 36, 62];
const CREAM = [241, 250, 238];
const ICE = [168, 218, 220];
const YELLOW = [253, 231, 76];
const GREEN = [155, 197, 61];
const RED = [229, 89, 52];
const PURPLE = [124, 105, 244];
const WOOD = [92, 64, 48];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [NAVY, NAVY2, CREAM, ICE, YELLOW, GREEN, RED, PURPLE, WOOD]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
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
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function dist2(x, y, cx, cy) { return (x - cx) * (x - cx) + (y - cy) * (y - cy); }

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  const noteY = 28 + t * 70;
  const noteX = 78;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    const o = (py * RW + px) * 4;
    if (!inCard(x, y, 6, 18)) continue;
    let col = mix(NAVY, NAVY2, y / OUT);
    if (y > 96 && y < 118 && x > 16 && x < 112) col = WOOD;
    const left = 22, right = 106;
    if (y > 18 && y < 112) {
      for (let s = 0; s < 6; s++) {
        const sx = left + s * ((right - left) / 5);
        if (Math.abs(x - sx) < 0.7 + s * 0.12) col = mix(CREAM, ICE, s / 5);
      }
      for (let fret = 1; fret <= 5; fret++) {
        const fy = 28 + fret * 14;
        if (Math.abs(y - fy) < 0.7 && x > left - 2 && x < right + 2) col = CREAM;
      }
    }
    if (dist2(x, y, noteX, noteY) <= 11 * 11) {
      col = mix(NAVY, NAVY, 0);
      const ring = Math.abs(Math.sqrt(dist2(x, y, noteX, noteY)) - 9);
      if (ring < 1.6) col = t > 0.72 ? GREEN : YELLOW;
    }
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

export function guitarBroIcon() {
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

export function screenshotPng() {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };
  const fill = (x0, y0, x1, y1, r, g, b) => {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    x1 = Math.min(W, x1 | 0); y1 = Math.min(H, y1 | 0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, r, g, b);
  };
  function disk(cx, cy, rad, r, g, b) {
    const r2 = rad * rad;
    for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
      const d = x * x + y * y;
      if (d <= r2) put(cx + x, cy + y, r, g, b);
    }
  }
  function ring(cx, cy, rad, t, r, g, b) {
    const o2 = (rad - t) * (rad - t), i2 = (rad + t) * (rad + t);
    for (let y = -rad - t; y <= rad + t; y++) for (let x = -rad - t; x <= rad + t; x++) {
      const d = x * x + y * y;
      if (d >= o2 && d <= i2) put(cx + x, cy + y, r, g, b);
    }
  }

  fill(0, 0, W, H, 29, 53, 87);
  fill(0, 0, W, 110, 20, 36, 62);
  drawText(put, 48, 36, 'GUITAR BRO', 8, 241, 250, 238);
  drawText(put, 48, 140, 'NOTES FALL', 4, 168, 218, 220);
  drawText(put, 48, 190, 'TAP THE FRET', 4, 253, 231, 76);
  drawText(put, 48, 240, 'OR LISTEN', 4, 155, 197, 61);
  fill(48, 300, 430, 372, 124, 105, 244);
  drawText(put, 72, 320, 'PLAY A FRIEND', 4, 255, 255, 255);
  drawText(put, 48, 400, 'PRESS INVITE', 4, 229, 89, 52);
  drawText(put, 48, 450, 'HIGHEST SCORE', 4, 168, 218, 220);
  drawText(put, 48, 500, 'WINS', 4, 168, 218, 220);

  const neckY = 560, neckH = 120, col = 88, left = 520;
  fill(left - 16, neckY, W, neckY + neckH, 92, 64, 48);
  fill(left - 16, neckY, W, neckY + 4, 241, 250, 238);
  for (let i = 1; i < 8; i++) fill(left + i * col, neckY, left + i * col + 3, neckY + neckH, 241, 250, 238);
  const notes = [
    { x: left + col * 2.5, y: 220, n: 'G', c: CREAM },
    { x: left + col * 4.5, y: 340, n: 'A', c: YELLOW },
    { x: left + col * 3.5, y: 470, n: 'F', c: GREEN },
  ];
  notes.forEach((p) => {
    disk(p.x, p.y, 44, 29, 53, 87);
    ring(p.x, p.y, 38, 5, p.c[0], p.c[1], p.c[2]);
    drawText(put, p.x - 14, p.y - 16, p.n, 5, 241, 250, 238);
  });
  for (let i = 0; i < 5; i++) {
    const hx = W - 60 - i * 48, hy = 48;
    fill(hx - 10, hy, hx + 10, hy + 14, 229, 89, 52);
    disk(hx - 8, hy, 10, 229, 89, 52);
    disk(hx + 8, hy, 10, 229, 89, 52);
  }

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
