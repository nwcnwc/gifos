// Procedural Hangman icon: dark card, gray gallows, the figure filling in.
// Pure Node, super-sample → box-downsample → small palette. Deterministic.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 10;

const CARD_A = [22, 22, 28];
const CARD_B = [10, 10, 14];
const STEEL = [168, 172, 184];
const STEEL_D = [110, 114, 126];
const ROPE = [196, 154, 88];
const SKIN = [210, 210, 216];
const INK = [236, 236, 242];
const BAD = [196, 80, 80];

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
function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, STEEL, STEEL_D, ROPE, SKIN, INK, BAD]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
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
  const m = 7, rad = 20;
  const stage = Math.min(6, Math.floor((f / (FRAMES - 1)) * 6.99));
  const poleX = 42, top = 24, beam = 92, foot = 108;
  const hx = 88, hy = 42;

  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      const wood = (d, w) => d < w;
      if (wood(distSeg(x, y, poleX, top, poleX, foot), 3.2) ||
          wood(distSeg(x, y, poleX - 2, top, beam, top), 3.0) ||
          wood(distSeg(x, y, poleX, top + 14, poleX + 14, top + 2), 2.2) ||
          wood(distSeg(x, y, poleX - 12, foot, poleX + 14, foot), 3.0)) {
        col = mix(STEEL, STEEL_D, (x + y) % 9 > 5 ? 0.25 : 0);
      }
      if (distSeg(x, y, hx, top, hx, hy - 9) < 1.4) col = ROPE;
      const dx = x - hx, dy = y - hy;
      if (stage >= 1 && dx * dx + dy * dy <= 9.5 * 9.5) {
        col = SKIN;
        if (dx * dx + dy * dy > 8.2 * 8.2) col = STEEL_D;
        if (Math.abs(dy + 1) < 1.1 && Math.abs(dx) < 7) col = mix(SKIN, INK, 0.35);
        if (stage >= 6 && dy > 1 && Math.abs(dx) < 3.2 && Math.abs(dy - 3) < 1.4) col = BAD;
      }
      if (stage >= 2) {
        const bx = hx, by = hy + 12;
        const ox = (x - bx) / 8, oy = (y - by) / 14;
        if (ox * ox + oy * oy <= 1) {
          col = SKIN;
          if (Math.abs(ox) < 0.22 && Math.abs(oy) < 0.45) col = STEEL_D;
          if (Math.abs(oy) < 0.18 && Math.abs(ox) < 0.45) col = STEEL_D;
        }
      }
      if (stage >= 3 && distSeg(x, y, hx - 6, hy + 14, hx - 16, hy + 28) < 1.7) col = SKIN;
      if (stage >= 4 && distSeg(x, y, hx + 6, hy + 14, hx + 16, hy + 28) < 1.7) col = SKIN;
      if (stage >= 5 && distSeg(x, y, hx - 3, hy + 26, hx - 10, hy + 42) < 1.7) col = SKIN;
      if (stage >= 6 && distSeg(x, y, hx + 3, hy + 26, hx + 10, hy + 42) < 1.7) col = SKIN;
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
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

export function hangmanIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 14, transparentIndex: 0 };
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
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '_': [0, 0, 0, 0, 0, 0, 0b11111],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '6': [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch] || GLYPHS[ch.toUpperCase()];
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
  const rr = (x0, y0, x1, y1, rad, r, g, b) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
      const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
    }
  };
  const stroke = (x1, y1, x2, y2, w, r, g, b) => {
    const x0 = Math.min(x1, x2) - w - 1, xN = Math.max(x1, x2) + w + 1;
    const y0 = Math.min(y1, y2) - w - 1, yN = Math.max(y1, y2) + w + 1;
    for (let y = y0; y <= yN; y++) for (let x = x0; x <= xN; x++) {
      if (distSeg(x, y, x1, y1, x2, y2) <= w) put(x, y, r, g, b);
    }
  };
  const circle = (cx, cy, R, r, g, b) => {
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= R * R) put(x, y, r, g, b);
    }
  };

  fill(0, 0, W, H, 12, 12, 16);

  drawText(put, 56, 56, 'HANGMAN', 10, 236, 236, 242);
  drawText(put, 56, 150, 'SAME WORD', 4, 154, 158, 176);
  drawText(put, 56, 200, 'FIRST TO FINISH', 4, 154, 158, 176);
  drawText(put, 56, 250, 'OR ONE ROPE', 4, 196, 154, 88);

  rr(56, 330, 250, 392, 24, 26, 26, 34);
  rr(270, 330, 470, 392, 24, 26, 26, 34);
  drawText(put, 78, 350, 'YOU  1', 4, 125, 206, 160);
  drawText(put, 292, 350, 'SAM  3', 4, 236, 236, 242);

  drawText(put, 56, 450, 'P Y T _ O N', 6, 236, 236, 242);
  drawText(put, 56, 530, 'WRONG  2 OF 6', 3, 196, 80, 80);
  drawText(put, 56, 590, 'RACE A FRIEND', 3, 156, 162, 176);

  const poleX = 820, top = 80, beam = 1040, foot = 640;
  const hx = 1020, hy = 210;
  stroke(poleX, top, poleX, foot, 10, 168, 172, 184);
  stroke(poleX - 6, top, beam, top, 10, 168, 172, 184);
  stroke(poleX, top + 48, poleX + 44, top + 8, 7, 140, 144, 156);
  stroke(poleX - 40, foot, poleX + 50, foot, 10, 168, 172, 184);
  stroke(hx, top, hx, hy - 36, 4, 196, 154, 88);
  circle(hx, hy, 36, 210, 210, 216);
  circle(hx, hy, 32, 200, 200, 208);
  fill(hx - 28, hy - 6, hx + 28, hy + 4, 180, 180, 188);
  // oval body
  for (let y = hy + 40; y < hy + 150; y++) for (let x = hx - 40; x < hx + 40; x++) {
    const ox = (x - hx) / 36, oy = (y - (hy + 95)) / 55;
    if (ox * ox + oy * oy <= 1) put(x, y, 210, 210, 216);
  }
  stroke(hx - 12, hy + 70, hx + 12, hy + 120, 4, 90, 90, 100);
  stroke(hx + 12, hy + 70, hx - 12, hy + 120, 4, 90, 90, 100);
  stroke(hx - 20, hy + 70, hx - 70, hy + 40, 7, 210, 210, 216);

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
