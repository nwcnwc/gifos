// Four lamps counting in binary — reads as a live logic bench at 64px.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 16;

const CARD_A = [18, 24, 32];
const CARD_B = [10, 14, 20];
const TRACE = [46, 196, 138];
const TRACE_D = [24, 110, 78];
const LAMP_ON = [110, 255, 180];
const LAMP_OFF = [90, 40, 40];
const INK = [220, 236, 230];
const BOX = [32, 44, 56];
const GOLD = [232, 196, 96];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, TRACE, TRACE_D, LAMP_ON, LAMP_OFF, INK, BOX, GOLD]) {
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
function distSeg(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-8) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / l2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const n = f % 16;
  const bits = [n & 1, (n >> 1) & 1, (n >> 2) & 1, (n >> 3) & 1];
  const lamps = [
    { x: 28, y: 78 }, { x: 52, y: 78 }, { x: 76, y: 78 }, { x: 100, y: 78 }
  ];
  const clkX = 28, clkY = 38;
  const box = { x0: 44, y0: 28, x1: 108, y1: 56 };

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 20)) continue;
      let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      const inBox = x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
      const edge = inBox && (x < box.x0 + 1.4 || x > box.x1 - 1.4 || y < box.y0 + 1.4 || y > box.y1 - 1.4);
      if (inBox) col = edge ? TRACE : BOX;
      const dClk = Math.hypot(x - clkX, y - clkY);
      if (dClk < 10) col = dClk > 8.2 ? TRACE : mix(BOX, GOLD, 0.25);
      if (dClk < 4 && (f % 4) < 2) col = GOLD;
      let dW = distSeg(x, y, clkX + 10, clkY, box.x0, clkY);
      for (let i = 0; i < 4; i++) {
        const lx = lamps[i].x, ly = lamps[i].y;
        dW = Math.min(dW, distSeg(x, y, lx, box.y1, lx, ly - 9));
        const dL = Math.hypot(x - lx, y - ly);
        if (dL < 9) {
          const on = bits[i];
          col = dL > 7.4 ? TRACE : (on ? LAMP_ON : LAMP_OFF);
          if (on && dL < 3) col = INK;
        }
      }
      if (dW < 1.1) col = dW < 0.55 ? TRACE : TRACE_D;
      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0, nss = SS * SS;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
          r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
        }
      }
      if (a / nss < 0.5) { idx[y * OUT + x] = 0; continue; }
      idx[y * OUT + x] = nearest(pal, r / nss, g / nss, b / nss);
    }
  }
  return idx;
}

export function digitaljsIcon() {
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
    minCodeSize: 6, frames, delayCs: 12, transparentIndex: 0
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
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '+': [0b00100, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00100],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
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
function fillRect(put, x0, y0, x1, y1, r, g, b) {
  for (let y = y0 | 0; y < y1; y++) for (let x = x0 | 0; x < x1; x++) put(x, y, r, g, b);
}
function strokeRect(put, x0, y0, x1, y1, w, r, g, b) {
  fillRect(put, x0, y0, x1, y0 + w, r, g, b);
  fillRect(put, x0, y1 - w, x1, y1, r, g, b);
  fillRect(put, x0, y0, x0 + w, y1, r, g, b);
  fillRect(put, x1 - w, y0, x1, y1, r, g, b);
}
function fillCircle(put, cx, cy, rad, r, g, b) {
  const xA = Math.floor(cx - rad), xB = Math.ceil(cx + rad);
  const yA = Math.floor(cy - rad), yB = Math.ceil(cy + rad);
  for (let y = yA; y <= yB; y++) {
    for (let x = xA; x <= xB; x++) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
    }
  }
}
function strokeLine(put, x0, y0, x1, y1, w, r, g, b) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const steps = Math.ceil(len);
  for (let i = 0; i <= steps; i++) {
    fillCircle(put, x0 + dx * (i / steps), y0 + dy * (i / steps), w, r, g, b);
  }
}

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function screenshotPng() {
  const live = join(dirname(fileURLToPath(import.meta.url)), 'cover-src.png');
  if (existsSync(live)) return readFileSync(live);
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b, a) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x % 20 === 0 && y % 20 === 0) put(x, y, 26, 34, 44);
      else put(x, y, 12, 16, 22);
    }
  }
  fillRect(put, 0, 0, W, 56, 17, 22, 30);
  fillRect(put, 16, 12, 110, 44, 30, 74, 56);
  drawText(put, 28, 18, 'PAUSE', 3, 182, 240, 212);
  strokeRect(put, 122, 12, 210, 44, 2, 42, 59, 72);
  drawText(put, 134, 18, 'STEP', 3, 180, 196, 210);
  drawText(put, 230, 18, '4-BIT COUNTER', 3, 180, 196, 210);
  drawText(put, W - 130, 18, 'LIVE', 3, 110, 255, 180);

  const clk = { x: 140, y: 220 };
  fillCircle(put, clk.x, clk.y, 48, 26, 36, 48);
  strokeRect(put, clk.x - 48, clk.y - 48, clk.x + 48, clk.y + 48, 3, 46, 196, 138);
  drawText(put, clk.x - 28, clk.y - 10, 'CLK', 3, 232, 196, 96);
  fillCircle(put, clk.x, clk.y + 18, 6, 232, 196, 96);

  const rst = { x: 140, y: 400 };
  fillRect(put, rst.x - 44, rst.y - 28, rst.x + 44, rst.y + 28, 28, 38, 50);
  strokeRect(put, rst.x - 44, rst.y - 28, rst.x + 44, rst.y + 28, 3, 46, 196, 138);
  fillRect(put, rst.x - 22, rst.y - 14, rst.x + 22, rst.y + 14, 210, 220, 230);
  drawText(put, rst.x - 36, rst.y + 40, 'RESET', 2, 180, 196, 210);

  const dff = { x0: 360, y0: 160, x1: 620, y1: 460 };
  fillRect(put, dff.x0, dff.y0, dff.x1, dff.y1, 26, 36, 48);
  strokeRect(put, dff.x0, dff.y0, dff.x1, dff.y1, 3, 46, 196, 138);
  drawText(put, 430, 280, 'COUNT', 4, 220, 236, 230);
  drawText(put, 455, 320, 'DFF', 3, 138, 160, 150);

  fillCircle(put, 800, 280, 78, 26, 36, 48);
  for (let a = 0; a < 360; a += 2) {
    const rad = 78;
    const xx = 800 + Math.cos(a * Math.PI / 180) * rad;
    const yy = 280 + Math.sin(a * Math.PI / 180) * rad;
    fillCircle(put, xx, yy, 2, 46, 196, 138);
  }
  drawText(put, 774, 268, '+1', 4, 220, 236, 230);

  const hex = { x0: 980, y0: 210, x1: 1140, y1: 310 };
  fillRect(put, hex.x0, hex.y0, hex.x1, hex.y1, 26, 36, 48);
  strokeRect(put, hex.x0, hex.y0, hex.x1, hex.y1, 3, 46, 196, 138);
  drawText(put, 1028, 242, 'B', 6, 110, 255, 180);

  const bits = [1, 1, 0, 1];
  for (let i = 0; i < 4; i++) {
    const x = 420 + i * 90, y = 560;
    fillCircle(put, x, y, 28, bits[i] ? 40 : 70, bits[i] ? 90 : 32, bits[i] ? 70 : 32);
    fillCircle(put, x, y, 22, bits[i] ? 110 : 90, bits[i] ? 255 : 40, bits[i] ? 180 : 40);
    drawText(put, x - 14, y + 40, 'Q' + i, 2, 180, 196, 210);
    strokeLine(put, x, dff.y1, x, y - 28, 2, 46, 196, 138);
  }

  strokeLine(put, clk.x + 48, clk.y, dff.x0, clk.y, 2, 46, 196, 138);
  strokeLine(put, rst.x + 44, rst.y, dff.x0, rst.y, 2, 46, 196, 138);
  strokeLine(put, dff.x1, 280, 722, 280, 2, 46, 196, 138);
  strokeLine(put, 878, 280, hex.x0, 260, 2, 46, 196, 138);

  fillRect(put, 0, 660, W, H, 15, 20, 27);
  drawText(put, 24, 676, 'PINS  RESET 0   VALUE B   Q3 Q2 Q1 Q0  1 0 1 1', 2, 138, 160, 150);

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
