// Procedural icon: six strings, tab numbers, a playhead that walks.
// Cover is Greensleeves mid-bar. Pure Node.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [28, 18, 10];
const CARD_B = [12, 8, 6];
const PAPER = [244, 236, 220];
const INK = [28, 22, 16];
const GOLD = [196, 140, 48];
const RED = [180, 64, 32];
const MUTED = [140, 120, 96];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, PAPER, INK, GOLD, RED, MUTED, [255, 255, 255]]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
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
  const cx = Math.min(Math.max(x, lo + r), hi - r);
  const cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

const NUMS = {
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  3: [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  5: [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110]
};

function stamp(rgba, x0, y0, ch, col) {
  const g = NUMS[ch];
  if (!g) return;
  for (let row = 0; row < 7; row++) {
    for (let colb = 0; colb < 5; colb++) {
      if (!(g[row] & (1 << (4 - colb)))) continue;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const x = ((x0 + colb) * SS + dx) | 0;
          const y = ((y0 + row) * SS + dy) | 0;
          if (x < 0 || y < 0 || x >= RW || y >= RW) continue;
          const o = (y * RW + x) * 4;
          rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
        }
      }
    }
  }
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const cursorX = 28 + t * 72;
  const notes = [
    { x: 32, str: 0, n: 0 }, { x: 46, str: 0, n: 3 }, { x: 60, str: 0, n: 5 },
    { x: 74, str: 0, n: 7 }, { x: 88, str: 0, n: 8 }, { x: 54, str: 4, n: 0 },
    { x: 82, str: 5, n: 0 }
  ];
  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 20)) continue;
      let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      const px0 = 22, py0 = 26, pw = 84, ph = 76;
      if (x >= px0 && x <= px0 + pw && y >= py0 && y <= py0 + ph) {
        col = PAPER;
        const sy = py0 + 12;
        for (let s = 0; s < 6; s++) {
          const ly = sy + s * 10;
          if (Math.abs(y - ly) < 0.7) col = mix(INK, MUTED, 0.45);
        }
        if (Math.abs(x - cursorX) < 1.4 && y > sy - 6 && y < sy + 56) col = RED;
        if (x > cursorX - 8 && x < cursorX + 6 && y > sy - 4 && y < sy + 54) {
          col = mix(col, GOLD, 0.28);
        }
      }
      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }
  for (const n of notes) {
    const lit = Math.abs((28 + n.x - 32) - cursorX) < 10;
    stamp(rgba, n.x, 32 + n.str * 10, n.n, lit ? RED : INK);
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

export function alphatabIcon() {
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
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
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
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0, 0b00100],
  ':': [0, 0b00100, 0, 0, 0, 0b00100, 0],
  '/': [0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b10000, 0b10000],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  3: [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  5: [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  6: [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  '%': [0b11001, 0b11010, 0b00010, 0b00100, 0b01000, 0b01011, 0b10011]
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
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
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) put(x, y, 10, 10, 15);
  }
  for (let y = 0; y < 56; y++) {
    for (let x = 0; x < W; x++) put(x, y, 20, 20, 24);
  }
  drawText(put, 24, 18, 'OPEN', 3, 232, 234, 237);
  drawText(put, 160, 18, 'GREENSLEEVES', 3, 240, 230, 208);
  drawText(put, 920, 18, 'BOTH  PAGE  100%', 2, 154, 160, 166);

  const paperY = 56;
  for (let y = paperY; y < H - 72; y++) {
    for (let x = 0; x < W; x++) put(x, y, 244, 239, 230);
  }
  drawText(put, 80, 80, 'GREENSLEEVES', 4, 28, 22, 16);
  drawText(put, 80, 118, 'ANONYMOUS  TRADITIONAL', 2, 120, 100, 80);

  const staffY = 180;
  for (let i = 0; i < 5; i++) {
    const y = staffY + i * 14;
    for (let x = 60; x < W - 40; x++) put(x, y, 40, 36, 32);
  }
  const tabY = 320;
  drawText(put, 28, tabY - 8, 'TAB', 2, 40, 36, 32);
  for (let i = 0; i < 6; i++) {
    const y = tabY + i * 22;
    for (let x = 80; x < W - 40; x++) put(x, y, 60, 52, 44);
  }

  const notes = [0, 3, 5, 7, 8, 7, 5, 2, 3, 0, 2, 3, 2, 0];
  const cursorI = 4;
  for (let i = 0; i < notes.length; i++) {
    const x = 140 + i * 70;
    const on = i === cursorI;
    const r = on ? 180 : 28, g = on ? 64 : 22, b = on ? 32 : 16;
    if (on) {
      for (let y = staffY - 10; y < tabY + 6 * 22; y++) {
        for (let dx = -18; dx < 28; dx++) {
          const px = x + dx;
          if (px < 80 || px > W - 40) continue;
          const o = (y * W + px) * 4;
          rgba[o] = Math.min(255, (rgba[o] * 0.72 + 196 * 0.28) | 0);
          rgba[o + 1] = Math.min(255, (rgba[o + 1] * 0.72 + 140 * 0.28) | 0);
          rgba[o + 2] = Math.min(255, (rgba[o + 2] * 0.72 + 48 * 0.28) | 0);
        }
      }
      for (let y = staffY - 10; y < tabY + 6 * 22; y++) put(x + 4, y, 180, 64, 32);
    }
    put(x, staffY + 28, r, g, b);
    put(x + 1, staffY + 28, r, g, b);
    put(x, staffY + 29, r, g, b);
    put(x + 1, staffY + 29, r, g, b);
    drawText(put, x - 8, tabY - 8, String(notes[i]), 3, r, g, b);
  }

  for (let y = H - 72; y < H; y++) {
    for (let x = 0; x < W; x++) put(x, y, 20, 20, 24);
  }
  drawText(put, 28, H - 50, 'PAUSE', 3, 26, 18, 8);
  for (let y = H - 56; y < H - 20; y++) {
    for (let x = 20; x < 150; x++) {
      const o = (y * W + x) * 4;
      if (rgba[o] < 40) { rgba[o] = 196; rgba[o + 1] = 140; rgba[o + 2] = 48; }
    }
  }
  drawText(put, 28, H - 50, 'PAUSE', 3, 26, 18, 8);
  drawText(put, 180, H - 48, '01:12 / 02:04', 3, 200, 200, 210);
  drawText(put, 900, H - 48, 'SPEED 100%', 2, 154, 160, 166);

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
