// Procedural icon for InvaderZ: a dark card holding 4×4 pixel invaders
// that drift down while TWO cannons fire. Mid-loop a shot hits a body
// and it bursts — the loop is extra cannons plus a kill, not a wiggle.
// Pure Node — super-sample → box-downsample → small palette. Deterministic.

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [18, 20, 28];
const CARD_B = [8, 10, 16];
const INK = [236, 240, 246];
const INK_D = [168, 176, 190];
const BLUE = [0, 140, 186];
const GREEN = [56, 196, 110];
const GOLD = [240, 196, 72];
const CANNON = [232, 236, 242];
const BURST = [255, 220, 80];

// Irregular genetic blobs — not the classic crab.
const SH_A = [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1];
const SH_B = [0, 1, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1, 0];
const SH_C = [1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 0, 1];
const SH_B2 = [0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 1, 0, 1, 0]; // one cell flipped
const SH_P = [0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, INK, INK_D, BLUE, GREEN, GOLD, CANNON, BURST]) {
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

function blitRect(rgba, x0, y0, w, h, col) {
  for (let y = y0 * SS; y < (y0 + h) * SS; y++) {
    for (let x = x0 * SS; x < (x0 + w) * SS; x++) {
      const xi = x | 0, yi = y | 0;
      if (xi < 0 || yi < 0 || xi >= RW || yi >= RW) continue;
      const o = (yi * RW + xi) * 4;
      if (!rgba[o + 3]) continue;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const drop = t * 14;
  const hit = f >= 6;

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 20)) continue;
      const col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }

  blit(rgba, SH_A, 20, 30 + drop, 7, INK);
  blit(rgba, f >= 8 ? SH_B2 : SH_B, 52, 26 + drop * 0.7, 7, GREEN);
  if (!hit) blit(rgba, SH_C, 82, 34 + drop * 0.4, 7, BLUE);

  blit(rgba, SH_P, 28, 94, 6, CANNON);
  blit(rgba, SH_P, 70, 94, 6, BLUE);

  // Ground line the cannons stand on.
  blitRect(rgba, 16, 114, 96, 1, INK_D);

  // Black cannon's shot — hits the blue invader around frame 6.
  if (!hit) {
    const shotY = 88 - t * 46;
    blitRect(rgba, 38, shotY, 4, 4, GOLD);
  } else if (f <= 9) {
    const bx = 92, by = 40 + drop * 0.4;
    const rad = 5 + (f - 6) * 4;
    for (let k = 0; k < 4; k++) {
      const ang = k * Math.PI / 2 + (f - 6) * 0.35;
      blitRect(rgba, bx + Math.cos(ang) * rad - 1, by + Math.sin(ang) * rad - 1, 4, 4, BURST);
    }
  }

  // Extra cannon's shot, delayed so both barrels read.
  if (f >= 3) {
    const shotY = 88 - ((f - 3) / (FRAMES - 3)) * 54;
    if (shotY > 22) blitRect(rgba, 80, shotY, 4, 4, GOLD);
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
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '/': [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  5: [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b10001, 0b01110],
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

function dashLine(put, x0, x1, y, r, g, b) {
  for (let x = x0; x < x1; x++) {
    if (((x - x0) / 10 | 0) % 2 === 0) {
      for (let dy = 0; dy < 3; dy++) put(x, y + dy, r, g, b);
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
  // Mid-wave: irregular bodies at mixed heights, one already through-close,
  // one bursting from a hit. Three cannons on the line. HUD corners stay clear.
  const invaders = [
    { sh: SH_B, x: 280, y: 160, r: 0, g: 140, b: 186 },
    { sh: SH_C, x: 470, y: 130, r: 20, g: 20, b: 20 },
    { sh: SH_A, x: 660, y: 150, r: 40, g: 160, b: 90 },
    { sh: SH_B2, x: 850, y: 170, r: 20, g: 20, b: 20 },
    { sh: SH_C, x: 1000, y: 200, r: 0, g: 140, b: 186 },
    { sh: SH_B, x: 180, y: 250, r: 20, g: 20, b: 20 },
    { sh: SH_A, x: 390, y: 280, r: 40, g: 160, b: 90 },
    { sh: SH_C, x: 720, y: 240, r: 20, g: 20, b: 20 },
    { sh: SH_B, x: 940, y: 320, r: 20, g: 20, b: 20 },
    { sh: SH_A, x: 80, y: 360, r: 20, g: 20, b: 20 },
  ];
  for (const inv of invaders) blitPng(put, inv.sh, inv.x, inv.y, cell, inv.r, inv.g, inv.b);

  // The line they must not cross — just above the cannons.
  dashLine(put, 20, W - 20, 548, 40, 40, 40);

  blitPng(put, SH_P, 540, 568, cell, 20, 20, 20);
  blitPng(put, SH_P, 300, 572, 18, 0, 140, 186);
  blitPng(put, SH_P, 820, 572, 18, 40, 160, 90);

  // Shots in flight, and a burst on the close invader at left.
  for (const s of [[584, 470], [584, 410], [328, 500], [848, 510]]) {
    for (let py = 0; py < 14; py++) {
      for (let px = 0; px < 14; px++) put(s[0] + px, s[1] + py, 20, 20, 20);
    }
  }
  const bx = 114, by = 370;
  for (let k = 0; k < 4; k++) {
    const ang = k * Math.PI / 2 + 0.3;
    const x = bx + Math.cos(ang) * 28, y = by + Math.sin(ang) * 28;
    for (let py = 0; py < 12; py++) {
      for (let px = 0; px < 12; px++) put(x + px, y + py, 20, 20, 20);
    }
  }

  drawText(put, 28, 22, 'GEN 7', 4, 20, 20, 20);
  drawText(put, 28, 62, 'THROUGH 1/5', 4, 20, 20, 20);
  drawText(put, 28, 102, 'KILLS 11', 4, 20, 20, 20);
  drawText(put, W - 220, 22, 'BEST 9', 4, 20, 20, 20);
  drawText(put, W - 220, 62, 'ELITE', 4, 20, 20, 20);
  blitPng(put, SH_B2, W - 118, 96, 10, 20, 20, 20);

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
