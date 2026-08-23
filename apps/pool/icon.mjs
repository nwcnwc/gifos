// Procedural Pool icon: a dark rounded card holding a felt table, pockets,
// a rack of red/yellow balls and a cue that pulls back across the frames.
// Pure Node, super-sample → box-downsample → small palette; deterministic.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [18, 14, 10];
const WOOD = [92, 58, 28];
const WOOD_D = [58, 34, 16];
const FELT = [28, 110, 52];
const FELT_D = [16, 78, 38];
const POCKET = [8, 8, 8];
const CUE = [232, 214, 176];
const WHITE = [240, 240, 236];
const RED = [196, 42, 36];
const YELLOW = [232, 186, 42];
const BLACK = [18, 18, 20];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, WOOD, WOOD_D, FELT, FELT_D, POCKET, CUE, WHITE, RED, YELLOW, BLACK]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
  }
  return pal;
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
function inRoundRect(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h + 0); // keep r
  const cy2 = Math.min(Math.max(y, y0 + r), y0 + h - r);
  if (x >= x0 + r && x <= x0 + w - r) return true;
  if (y >= y0 + r && y <= y0 + h - r) return true;
  const dx = x - cx, dy = y - cy2; return dx * dx + dy * dy <= r * r;
}
function dist2(x, y, cx, cy) { return (x - cx) * (x - cx) + (y - cy) * (y - cy); }

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const table = { x: 14, y: 28, w: 100, h: 72 };
  const felt = { x: 20, y: 34, w: 88, h: 60 };
  const pull = 4 + Math.sin(t * Math.PI) * 10;
  const cueX0 = 22 - pull, cueY = 64;
  const balls = [
    { x: 38, y: 64, c: WHITE },
    { x: 78, y: 58, c: YELLOW },
    { x: 84, y: 64, c: RED },
    { x: 78, y: 70, c: RED },
    { x: 90, y: 58, c: YELLOW },
    { x: 90, y: 64, c: BLACK },
    { x: 90, y: 70, c: YELLOW },
    { x: 96, y: 64, c: RED },
  ];
  const pockets = [
    [felt.x + 2, felt.y + 2], [felt.x + felt.w / 2, felt.y],
    [felt.x + felt.w - 2, felt.y + 2], [felt.x + 2, felt.y + felt.h - 2],
    [felt.x + felt.w / 2, felt.y + felt.h], [felt.x + felt.w - 2, felt.y + felt.h - 2],
  ];
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    const o = (py * RW + px) * 4;
    if (!inCard(x, y, 6, 18)) continue;
    let col = mix(CARD, WOOD_D, y / OUT * 0.3);
    if (inRoundRect(x, y, table.x, table.y, table.w, table.h, 8)) {
      col = mix(WOOD, WOOD_D, (x + y) / 200);
    }
    if (inRoundRect(x, y, felt.x, felt.y, felt.w, felt.h, 6)) {
      col = mix(FELT, FELT_D, ((x * 0.4 + y) / 140));
    }
    for (const p of pockets) {
      if (dist2(x, y, p[0], p[1]) < 4.2 * 4.2) col = POCKET;
    }
    // cue stick
    const cueX1 = cueX0 + 36, thick = 1.15;
    const along = (x - cueX0) / (cueX1 - cueX0);
    if (along >= 0 && along <= 1 && Math.abs(y - cueY) < thick) col = mix(CUE, WOOD, along * 0.4);
    for (const b of balls) {
      const d = dist2(x, y, b.x, b.y);
      if (d <= 4.1 * 4.1) {
        const u = (x - (b.x - 2.2)) / 8;
        col = mix(mix(b.c, WHITE, 0.35), b.c, Math.max(0, Math.min(1, u)));
      }
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

export function poolIcon() {
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
  function disk(cx, cy, rad, r, g, b) {
    const r2 = rad * rad;
    for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
      if (x * x + y * y <= r2) {
        const u = (x + rad) / (rad * 2);
        put(cx + x, cy + y, (r + (255 - r) * (1 - u) * 0.25) | 0, (g + (255 - g) * (1 - u) * 0.25) | 0, (b + (255 - b) * (1 - u) * 0.18) | 0);
      }
    }
  }
  function ball(cx, cy, rgb) {
    disk(cx, cy, 22, rgb[0], rgb[1], rgb[2]);
    disk(cx - 6, cy - 6, 6, Math.min(255, rgb[0] + 70), Math.min(255, rgb[1] + 70), Math.min(255, rgb[2] + 70));
  }

  fill(0, 0, W, H, 12, 10, 8);
  // rails
  fill(20, 40, W - 20, H - 40, 96, 60, 30);
  fill(20, 40, W - 20, 48, 120, 80, 42);
  // felt
  for (let y = 70; y < H - 70; y++) {
    const v = (y - 70) / (H - 140);
    const r = (22 + v * 8) | 0, g = (108 - v * 18) | 0, b = (48 - v * 8) | 0;
    for (let x = 70; x < W - 70; x++) {
      const n = ((x * 13 + y * 7) % 17) === 0 ? 4 : 0;
      put(x, y, r, g + n, b);
    }
  }
  // pockets
  const pockets = [
    [80, 80], [W / 2, 72], [W - 80, 80],
    [80, H - 80], [W / 2, H - 72], [W - 80, H - 80],
  ];
  for (const p of pockets) disk(p[0], p[1], 28, 8, 8, 8);

  // rack on the right
  const red = [196, 42, 36], yel = [232, 186, 42], blk = [16, 16, 18], wh = [236, 236, 232];
  const gx = 820, gy = 360, sp = 40;
  const rack = [
    [0, 0, yel],
    [1, -0.5, red], [1, 0.5, yel],
    [2, -1, yel], [2, 0, blk], [2, 1, red],
    [3, -1.5, red], [3, -0.5, yel], [3, 0.5, red], [3, 1.5, yel],
    [4, -2, yel], [4, -1, red], [4, 0, yel], [4, 1, red], [4, 2, yel],
  ];
  for (const b of rack) ball(gx + b[0] * sp * 0.9, gy + b[1] * sp, b[2]);
  ball(280, 360, wh);

  // cue
  for (let i = 0; i < 340; i++) {
    const x = 40 + i, y = 368 + i * 0.02;
    fill(x, y - 3, x + 1, y + 4, 220 - i * 0.15, 200 - i * 0.12, 160);
  }
  fill(370, 364, 392, 376, 240, 236, 220);

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
