// Procedural icon for Tower Game: a coral rounded card, a beige stack, a
// swinging floor that drops onto it across the frames. Super-sample →
// box-downsample → small palette; deterministic so GIF builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 10;

const SKY_A = [255, 176, 120];
const SKY_B = [249, 82, 64];
const SKY_C = [90, 170, 230];
const BLOCK = [255, 196, 118];
const BLOCK_D = [214, 140, 68];
const BLOCK_L = [255, 228, 170];
const PERFECT = [255, 214, 80];
const HOOK = [92, 56, 42];
const ROPE = [176, 120, 80];
const WHITE = [255, 252, 246];
const INK = [72, 28, 22];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [SKY_A, SKY_B, SKY_C, BLOCK, BLOCK_D, BLOCK_L, PERFECT, HOOK, ROPE, WHITE, INK]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.28).map(Math.round));
  }
  return pal.slice(0, 64);
}
function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e9;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b, d = dr * dr + dg * dg + db * db;
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
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}
function inRR(x, y, x0, y0, x1, y1, rad) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + rad), x1 - rad);
  const cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
  if (x >= x0 + rad && x <= x1 - rad) return true;
  if (y >= y0 + rad && y <= y1 - rad) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= rad * rad;
}

function stack() {
  // Bottom-up: {x, y, w, h} in icon space. y is top of the block.
  return [
    { x: 34, y: 96, w: 60, h: 14 },
    { x: 38, y: 83, w: 52, h: 13 },
    { x: 36, y: 70, w: 56, h: 13 },
    { x: 42, y: 58, w: 44, h: 12 },
  ];
}

function swinging(f) {
  const t = f / (FRAMES - 1);
  const dropStart = 0.45;
  if (t < dropStart) {
    const ang = Math.sin(t / dropStart * Math.PI) * 0.55;
    const len = 28;
    const hx = 64, hy = 14;
    return {
      x: hx + Math.sin(ang) * len - 18,
      y: hy + Math.cos(ang) * len,
      w: 36, h: 12,
      hx, hy, swinging: true,
    };
  }
  const u = (t - dropStart) / (1 - dropStart);
  const ease = u * u;
  return { x: 40, y: 18 + ease * 28, w: 36, h: 12, hx: 64, hy: 14, swinging: false };
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 7, rad = 20;
  const floors = stack();
  const drop = swinging(f);
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      const gy = (y - m) / (OUT - 2 * m);
      col = gy < 0.45 ? mix(SKY_C, SKY_A, gy / 0.45) : mix(SKY_A, SKY_B, (gy - 0.45) / 0.55);
      // hook
      if (x > drop.hx - 1.4 && x < drop.hx + 1.4 && y > drop.hy && y < drop.hy + 8) col = HOOK;
      if (drop.swinging) {
        const dx = (drop.x + drop.w / 2) - drop.hx;
        const dy = drop.y - drop.hy;
        const steps = 20;
        for (let i = 0; i <= steps; i++) {
          const px2 = drop.hx + dx * (i / steps);
          const py2 = drop.hy + dy * (i / steps);
          if ((x - px2) * (x - px2) + (y - py2) * (y - py2) < 1.3 * 1.3) col = ROPE;
        }
      }
      for (let i = 0; i < floors.length; i++) {
        const b = floors[i];
        if (inRR(x, y, b.x, b.y, b.x + b.w, b.y + b.h, 2)) {
          col = mix(BLOCK_D, BLOCK, (x - b.x) / b.w);
          if (x < b.x + 3) col = BLOCK_L;
        }
      }
      if (inRR(x, y, drop.x, drop.y, drop.x + drop.w, drop.y + drop.h, 2)) {
        col = drop.swinging ? mix(BLOCK, PERFECT, 0.35) : mix(BLOCK_D, BLOCK, (x - drop.x) / drop.w);
        if (x < drop.x + 3) col = BLOCK_L;
      }
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

export function towerGameIcon() {
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
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '·': [0, 0, 0, 0b00100, 0, 0, 0],
};
function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const gph = GLYPHS[ch] || GLYPHS[' '];
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

function paintBlock(put, x0, y0, w, h, col, hi) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const t = (x - x0) / w;
    const c = mix(col, hi, t < 0.12 ? 0.8 : 0.15 + 0.4 * t);
    if (y === y0 || y === y0 + h - 1 || x === x0 || x === x0 + w - 1) {
      put(x, y, BLOCK_D[0], BLOCK_D[1], BLOCK_D[2]);
    } else {
      put(x, y, c[0], c[1], c[2]);
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

  for (let y = 0; y < H; y++) {
    const gy = y / H;
    const sky = gy < 0.4 ? mix(SKY_C, SKY_A, gy / 0.4) : mix(SKY_A, SKY_B, (gy - 0.4) / 0.6);
    for (let x = 0; x < W; x++) put(x, y, sky[0], sky[1], sky[2]);
  }

  const floors = [
    { x: 620, y: 560, w: 420, h: 70 },
    { x: 650, y: 494, w: 360, h: 66 },
    { x: 635, y: 430, w: 390, h: 64 },
    { x: 670, y: 368, w: 320, h: 62 },
    { x: 655, y: 308, w: 350, h: 60 },
    { x: 690, y: 250, w: 280, h: 58 },
  ];
  for (const b of floors) paintBlock(put, b.x, b.y, b.w, b.h, BLOCK, BLOCK_L);
  paintBlock(put, 720, 160, 220, 52, mix(BLOCK, PERFECT, 0.4), WHITE);

  // crane rope
  for (let y = 0; y < 160; y++) {
    const x = 830 + (y / 160) * 0;
    put(x, y, ROPE[0], ROPE[1], ROPE[2]);
    put(x + 1, y, HOOK[0], HOOK[1], HOOK[2]);
  }

  drawText(put, 64, 80, 'TOWER GAME', 10, 255, 255, 255);
  drawText(put, 64, 200, 'TAP TO STACK', 5, 255, 248, 210);
  drawText(put, 64, 280, 'RACE A FRIEND', 5, 255, 230, 120);
  drawText(put, 64, 620, 'TALLEST TOWER WINS', 3, 255, 252, 246);

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
