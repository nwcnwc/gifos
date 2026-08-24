// Procedural Tiny Platformer icon: a yellow square hops a brick, stomps a
// grey patrol, gold pulses. Pure Node, super-sample → downsample → palette.
import { deflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  // Hop, stomp, hold. Reads as a jump at 64px Home Screen size.
  const hop = Math.sin(Math.min(1, t * 1.55) * Math.PI);
  const px = 24 + t * 62;
  const py = 82 - hop * 44;
  const mx = 88 + Math.sin(t * Math.PI) * 4;
  const my = 82;
  const dead = t > 0.58;
  const goldPulse = 0.75 + Math.sin(t * Math.PI * 2) * 0.25;
  const gx = 58, gy = 64;
  const SIZE = 20;

  for (let pyi = 0; pyi < RW; pyi++) {
    for (let pxi = 0; pxi < RW; pxi++) {
      const x = pxi / SS, y = pyi / SS;
      if (!inCard(x, y, 6, 20)) continue;
      let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      if (y > 100 && y < 120) {
        const bx = Math.floor((x - 8) / 16);
        col = (bx + Math.floor(y / 10)) % 2 ? BRICK : mix(BRICK, PINK, 0.4);
      }
      if (inRect(x, y, 16, 92, 40, 10)) col = PURPLE;
      if (inRect(x, y, 68, 92, 44, 10)) col = PURPLE;
      const gs = 7 * goldPulse;
      if (!dead && inRect(x, y, gx - gs, gy - gs * 0.6, gs * 2, gs * 1.2)) col = GOLD;
      if (!dead && inRect(x, y, mx - SIZE / 2, my - SIZE / 2, SIZE, SIZE)) col = GREY;
      if (dead && inRect(x, y, mx - 12, my + 6, 24, 8)) col = mix(GREY, CARD_A, 0.35);
      if (inRect(x, y, px - SIZE / 2, py - SIZE / 2, SIZE, SIZE)) col = YELLOW;
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
  const PAL = [
    [17, 17, 17],
    [236, 208, 120],
    [217, 91, 67],
    [192, 41, 66],
    [84, 36, 55],
    [51, 51, 51],
  ];
  const TILE = 32;
  const dir = dirname(fileURLToPath(import.meta.url));
  const level = JSON.parse(readFileSync(join(dir, 'vendor/level.json'), 'utf8'));
  const data = level.layers[0].data;
  const tw = level.width, th = level.height;
  const objs = level.layers[1].objects;
  // Mid-run crop: the long brick shelf with gold and a grey patrol, player in the air.
  // Zoom past the 20×15 play camera so the cover is full of cave, not sky.
  const camX = 620, camY = 210;
  const scale = 2.25;
  fill(0, 0, W, H, 10, 10, 15);
  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      const cell = data[tx + ty * tw];
      if (!cell) continue;
      const c = PAL[cell] || PAL[5];
      const x0 = (tx * TILE - camX) * scale;
      const y0 = (ty * TILE - camY) * scale;
      fill(x0, y0, x0 + TILE * scale - 1, y0 + TILE * scale - 1, c[0], c[1], c[2]);
    }
  }
  for (const o of objs) {
    const x0 = (o.x - camX) * scale;
    const y0 = (o.y - camY) * scale;
    const s = TILE * scale;
    if (o.type === 'treasure') {
      fill(x0, y0 + s / 3, x0 + s, y0 + s, 255, 215, 0);
    } else if (o.type === 'monster') {
      fill(x0, y0, x0 + s, y0 + s, 83, 119, 122);
    }
  }
  // Player mid-jump above the shelf, not sitting on a spawn.
  const px = (820 - camX) * scale, py = (300 - camY) * scale, s = TILE * scale;
  fill(px, py, px + s, py + s, 236, 208, 120);
  // HUD pips — gold taken, one stomp
  fill(36, 28, 60, 52, 255, 215, 0);
  fill(68, 28, 92, 52, 255, 215, 0);
  fill(100, 28, 124, 52, 255, 215, 0);
  fill(36, 60, 60, 84, 83, 119, 122);

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
