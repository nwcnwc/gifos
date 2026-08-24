// Procedural Tiny Platformer icon: a yellow square hops a brick, stomps a
// grey patrol, gold pulses. Pure Node, super-sample → downsample → palette.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [18, 12, 16];
const CARD_B = [10, 8, 12];
const YELLOW = [236, 208, 120];
const BRICK = [217, 91, 67];
const PINK = [192, 41, 66];
const PURPLE = [84, 36, 55];
const GREY = [83, 119, 122];
const GOLD = [255, 215, 0];
const INK = [236, 228, 200];

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
function inRect(x, y, x0, y0, w, h) {
  return x >= x0 && y >= y0 && x < x0 + w && y < y0 + h;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, YELLOW, BRICK, PINK, PURPLE, GREY, GOLD, INK]) {
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

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const hop = Math.sin(Math.min(1, t * 1.4) * Math.PI);
  const px = 28 + t * 54;
  const py = 78 - hop * 38;
  const mx = 86 + Math.sin(t * Math.PI * 2) * 6;
  const my = 86;
  const dead = t > 0.62;
  const goldPulse = 0.7 + Math.sin(t * Math.PI * 2) * 0.3;
  const gx = 54, gy = 70;

  for (let pyi = 0; pyi < RW; pyi++) {
    for (let pxi = 0; pxi < RW; pxi++) {
      const x = pxi / SS, y = pyi / SS;
      if (!inCard(x, y, 6, 20)) continue;
      let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      // floor bricks
      if (y > 98 && y < 118) {
        const bx = Math.floor((x - 10) / 14);
        col = (bx + Math.floor(y / 10)) % 2 ? BRICK : mix(BRICK, PINK, 0.35);
      }
      if (inRect(x, y, 18, 88, 36, 12)) col = PURPLE;
      if (inRect(x, y, 70, 88, 40, 12)) col = PURPLE;
      // gold
      if (!dead && Math.hypot(x - gx, y - gy) < 6 * goldPulse) col = GOLD;
      // monster
      if (!dead && inRect(x, y, mx - 8, my - 8, 16, 16)) col = GREY;
      if (dead && inRect(x, y, mx - 10, my + 2, 20, 6)) col = mix(GREY, CARD_A, 0.4);
      // player
      if (inRect(x, y, px - 8, py - 8, 16, 16)) col = YELLOW;
      const o = (pyi * RW + pxi) * 4;
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

export function tinyPlatformerIcon() {
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
  fill(0, 0, W, H, 10, 10, 15);
  const COLORS = [
    [236, 208, 120],
    [217, 91, 67],
    [192, 41, 66],
    [84, 36, 55],
    [51, 51, 51],
  ];
  const T = 24;
  // brick bands
  for (let row = 0; row < 8; row++) {
    const y = 80 + row * T;
    const c = COLORS[(row % 4) + 1];
    fill(40, y, 520, y + T - 2, c[0], c[1], c[2]);
    fill(680, y + 120, 1160, y + 120 + T - 2, c[0], c[1], c[2]);
  }
  fill(0, H - 80, W, H, 84, 36, 55);
  fill(0, H - 56, W, H, 51, 51, 51);
  // platforms
  fill(80, 480, 420, 504, 84, 36, 55);
  fill(520, 360, 860, 384, 217, 91, 67);
  fill(900, 520, 1140, 544, 84, 36, 55);
  // gold
  fill(220, 448, 244, 472, 255, 215, 0);
  fill(300, 448, 324, 472, 255, 215, 0);
  fill(700, 328, 724, 352, 255, 215, 0);
  fill(980, 488, 1004, 512, 255, 215, 0);
  // monsters
  fill(360, 456, 384, 480, 83, 119, 122);
  fill(780, 336, 804, 360, 83, 119, 122);
  fill(1040, 496, 1064, 520, 83, 119, 122);
  // player mid-jump
  fill(610, 250, 646, 286, 236, 208, 120);
  // HUD
  fill(48, 28, 72, 52, 255, 215, 0);
  fill(80, 28, 104, 52, 255, 215, 0);
  fill(112, 28, 136, 52, 255, 215, 0);
  fill(48, 60, 72, 84, 83, 119, 122);

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
