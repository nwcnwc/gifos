// Procedural icon: a dark room whose fire grows. Reads at 64px.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD = [12, 10, 8], CARD_D = [6, 5, 4];
const WALL = [22, 18, 14], FLOOR = [16, 12, 10];
const INK = [8, 6, 4];
const EMBER = [180, 60, 20], FLAME = [232, 140, 40], CORE = [255, 230, 140];
const GLOW = [200, 90, 30], ASH = [60, 48, 36];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, CARD_D, WALL, FLOOR, INK, EMBER, FLAME, CORE, GLOW, ASH]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
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
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const heat = Math.min(1, 0.15 + f / (FRAMES - 1));
  const flicker = 0.85 + 0.15 * Math.sin(f * 1.7);
  const h = heat * flicker;
  const fx = 64, fy = 86;
  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 18)) continue;
      let col = mix(CARD, CARD_D, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      if (y > 92) col = mix(FLOOR, ASH, 0.25);
      if (y < 36) col = mix(WALL, CARD, 0.4);
      const dx = x - fx, dy = y - (fy - 8 * h);
      const dist = Math.hypot(dx, dy * 1.35);
      const hearth = Math.hypot(x - fx, y - 98);
      if (hearth < 14 && y > 90) col = mix(ASH, INK, (hearth / 14));
      if (dist < 6 + 16 * h) {
        const t = dist / (6 + 16 * h);
        if (t < 0.25) col = CORE;
        else if (t < 0.55) col = mix(CORE, FLAME, (t - 0.25) / 0.3);
        else col = mix(FLAME, EMBER, (t - 0.55) / 0.45);
      } else if (dist < 22 + 18 * h) {
        col = mix(col, GLOW, 0.35 * h * (1 - (dist - 6) / 40));
      }
      if (y > 28 && y < 70 && Math.abs(x - 64) > 38 && Math.abs(x - 64) < 44) {
        col = mix(col, INK, 0.5);
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

export function darkRoomIcon() {
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
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  X: [0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b01010, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0, 0b00100],
  ':': [0, 0b00100, 0, 0, 0b00100, 0, 0],
  '+': [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  3: [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  5: [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  6: [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
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
    for (let x = 0; x < W; x++) put(x, y, 18, 16, 12);
  }
  drawText(put, 48, 36, 'A FIRELIT ROOM', 4, 232, 228, 214);
  drawText(put, 48, 84, 'OUTSIDE', 3, 140, 130, 110);
  const logs = [
    'the fire is roaring',
    'the light from the fire spills from the windows',
    'builder puts up a hut, out in the forest',
    'the town is booming. word does get around.',
    'wood +8',
  ];
  for (let i = 0; i < logs.length; i++) {
    drawText(put, 48, 160 + i * 36, logs[i], 2, 200, 190, 170);
  }
  drawText(put, 48, 380, 'STOKE FIRE', 3, 232, 168, 72);
  for (let x = 48; x < 280; x++) {
    put(x, 372, 232, 168, 72); put(x, 418, 232, 168, 72);
  }
  for (let y = 372; y < 418; y++) {
    put(48, y, 232, 168, 72); put(280, y, 232, 168, 72);
  }
  drawText(put, 48, 450, 'GATHER WOOD', 3, 232, 228, 214);
  for (let x = 790; x < 1150; x++) {
    put(x, 100, 220, 210, 190); put(x, 310, 220, 210, 190);
  }
  for (let y = 100; y < 310; y++) {
    put(790, y, 220, 210, 190); put(1150, y, 220, 210, 190);
  }
  drawText(put, 820, 120, 'STORES', 3, 232, 228, 214);
  const stores = ['WOOD     142', 'FUR       18', 'MEAT       9', 'LEATHER    4'];
  for (let i = 0; i < stores.length; i++) {
    drawText(put, 820, 170 + i * 32, stores[i], 2, 200, 190, 170);
  }
  drawText(put, 820, 340, 'VILLAGE', 3, 232, 228, 214);
  drawText(put, 820, 390, 'HUTS       3', 2, 200, 190, 170);
  drawText(put, 820, 422, 'TRAPS      4', 2, 200, 190, 170);
  drawText(put, 820, 454, 'POP       12', 2, 200, 190, 170);
  const x0 = 560, y0 = 530;
  for (let i = 0; i < 90; i++) {
    const t = i / 90;
    const wob = Math.sin(i * 0.4) * 10;
    const xx = x0 + wob * (1 - t);
    const yy = y0 - t * 110;
    const rr = 28 * (1 - t * 0.7);
    for (let dy = -rr; dy <= rr; dy++) {
      for (let dx = -rr; dx <= rr; dx++) {
        if (dx * dx + dy * dy * 1.6 <= rr * rr) {
          const k = Math.sqrt(dx * dx + dy * dy) / rr;
          const r = k < 0.3 ? 255 : k < 0.6 ? 232 : 180;
          const g = k < 0.3 ? 230 : k < 0.6 ? 140 : 60;
          const b = k < 0.3 ? 140 : 30;
          put(xx + dx, yy + dy, r, g, b);
        }
      }
    }
  }
  for (let x = x0 - 36; x < x0 + 36; x++) {
    for (let y = y0; y < y0 + 10; y++) put(x, y, 60, 40, 24);
  }
  drawText(put, 48, 680, 'SOUND ON.   LIGHTS ON.   HYPER.   RESTART.', 2, 120, 110, 96);

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
function strokeDot(put, x, y, r, g, b) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dx * dx + dy * dy <= 5) put(x + dx, y + dy, r, g, b);
    }
  }
}
