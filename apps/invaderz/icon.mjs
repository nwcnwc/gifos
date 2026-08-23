// Procedural icon for InvaderZ: a dark card holding 4×4 pixel invaders
// that drift down while a cannon fires. Pure Node — super-sample →
// box-downsample → small palette. Deterministic so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [18, 20, 28];
const CARD_B = [8, 10, 16];
const INK = [236, 240, 246];
const INK_D = [168, 176, 190];
const BLUE = [0, 140, 186];
const GREEN = [56, 196, 110];
const GOLD = [240, 196, 72];
const CANNON = [232, 236, 242];

const SH_A = [0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0];
const SH_B = [1, 0, 0, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 0, 0, 1];
const SH_C = [0, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0];
const SH_P = [0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, INK, INK_D, BLUE, GREEN, GOLD, CANNON]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.4).map(Math.round));
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

function blit(rgba, shape, ox, oy, cell, col) {
  for (let i = 0; i < 16; i++) {
    if (!shape[i]) continue;
    const gx = ox + (i % 4) * cell;
    const gy = oy + (i >> 2) * cell;
    for (let y = gy * SS; y < (gy + cell) * SS; y++) {
      for (let x = gx * SS; x < (gx + cell) * SS; x++) {
        const xi = x | 0, yi = y | 0;
        if (xi < 0 || yi < 0 || xi >= RW || yi >= RW) continue;
        const o = (yi * RW + xi) * 4;
        rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
      }
    }
  }
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const drop = t * 10;

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 20)) continue;
      const col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }

  blit(rgba, SH_A, 24, 18 + drop, 7, INK);
  blit(rgba, SH_B, 58, 14 + (drop * 0.7) % 12, 7, GREEN);
  blit(rgba, SH_C, 88, 22 + (10 - drop * 0.5), 7, BLUE);
  blit(rgba, SH_P, 52, 92, 6, CANNON);

  const shotY = 88 - t * 54;
  const sx = 62, ss = 4;
  for (let y = shotY * SS; y < (shotY + ss) * SS; y++) {
    for (let x = sx * SS; x < (sx + ss) * SS; x++) {
      const xi = x | 0, yi = y | 0;
      if (xi < 0 || yi < 0 || xi >= RW || yi >= RW) continue;
      const o = (yi * RW + xi) * 4;
      if (!rgba[o + 3]) continue;
      rgba[o] = GOLD[0]; rgba[o + 1] = GOLD[1]; rgba[o + 2] = GOLD[2]; rgba[o + 3] = 1;
    }
  }

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = SS * SS;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx2 = 0; sx2 < SS; sx2++) {
          const o = (((y * SS + sy) * RW) + (x * SS + sx2)) * 4;
          r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
        }
      }
      if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
      idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
    }
  }
  return idx;
}

export function invaderzIcon() {
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
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  ':': [0, 0b00100, 0, 0, 0b00100, 0, 0],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  3: [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  5: [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
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

function blitPng(put, shape, ox, oy, cell, r, g, b) {
  for (let i = 0; i < 16; i++) {
    if (!shape[i]) continue;
    const gx = ox + (i % 4) * cell;
    const gy = oy + ((i >> 2) * cell);
    for (let py = 0; py < cell; py++) {
      for (let px = 0; px < cell; px++) put(gx + px, gy + py, r, g, b);
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
    for (let x = 0; x < W; x++) put(x, y, 248, 248, 248);
  }

  const cell = 22;
  const invaders = [
    { sh: SH_A, x: 180, y: 110, r: 20, g: 20, b: 20 },
    { sh: SH_B, x: 380, y: 70, r: 0, g: 140, b: 186 },
    { sh: SH_C, x: 580, y: 130, r: 20, g: 20, b: 20 },
    { sh: SH_A, x: 780, y: 90, r: 40, g: 160, b: 90 },
    { sh: SH_B, x: 980, y: 150, r: 20, g: 20, b: 20 },
    { sh: SH_C, x: 280, y: 250, r: 20, g: 20, b: 20 },
    { sh: SH_A, x: 500, y: 220, r: 0, g: 140, b: 186 },
    { sh: SH_B, x: 720, y: 270, r: 20, g: 20, b: 20 },
    { sh: SH_C, x: 900, y: 310, r: 40, g: 160, b: 90 },
  ];
  for (const inv of invaders) blitPng(put, inv.sh, inv.x, inv.y, cell, inv.r, inv.g, inv.b);

  blitPng(put, SH_P, 560, 560, cell, 20, 20, 20);
  blitPng(put, SH_P, 360, 568, 18, 0, 140, 186);
  blitPng(put, SH_P, 780, 568, 18, 40, 160, 90);

  // shots
  for (const s of [[604, 500], [604, 450], [398, 520], [818, 530]]) {
    for (let py = 0; py < 14; py++) {
      for (let px = 0; px < 14; px++) put(s[0] + px, s[1] + py, 20, 20, 20);
    }
  }

  drawText(put, 36, 24, 'GENERATION: 7', 4, 20, 20, 20);
  drawText(put, 36, 64, 'INVADERS: 1', 4, 20, 20, 20);
  drawText(put, W / 2 - 150, 24, 'INVADERZ', 5, 20, 20, 20);

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
