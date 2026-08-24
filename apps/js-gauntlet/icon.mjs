// Procedural Gauntlet icon: a red warrior fires across a dungeon at a
// generator. Pure Node, super-sample → downsample → palette.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD_A = [22, 10, 10], CARD_B = [8, 4, 6];
const RED = [249, 5, 3], BLUE = [8, 180, 240], GOLD = [245, 252, 0];
const GREEN = [0, 255, 3], WALL = [70, 50, 40], FLOOR = [40, 28, 22];
const GHOST = [200, 200, 220], SPARK = [255, 220, 160];

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
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function inRect(x, y, x0, y0, w, h) {
  return x >= x0 && y >= y0 && x < x0 + w && y < y0 + h;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, RED, BLUE, GOLD, GREEN, WALL, FLOOR, GHOST, SPARK]) {
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
  const shotX = 40 + t * 62;
  const genPulse = 0.6 + Math.sin(t * Math.PI * 2) * 0.4;
  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 20)) continue;
      let col = mix(FLOOR, CARD_B, (y - 6) / 116);
      if (x < 18 || x > 110 || y < 18 || y > 110) col = WALL;
      if (inRect(x, y, 18, 18, 10, 40) || inRect(x, y, 100, 70, 10, 40)) col = WALL;
      if (inRect(x, y, 26, 78, 14, 18)) col = RED;
      if (inRect(x, y, 88, 36, 16, 16)) col = mix(RED, GOLD, genPulse);
      if (Math.hypot(x - shotX, y - 86) < 3) col = SPARK;
      if (f % 3 === 0 && inRect(x, y, 60, 50, 10, 10)) col = GHOST;
      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = SS * SS;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
        r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
      }
      if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
      idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
    }
  }
  return idx;
}

export function gauntletIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64, flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0;
    flat[i * 3 + 1] = pal[i][1] | 0;
    flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 10, transparentIndex: 0 };
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
  const put = (x, y, r, g, b) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
  };
  const fill = (x0, y0, x1, y1, r, g, b) => {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    x1 = Math.min(W, x1 | 0); y1 = Math.min(H, y1 | 0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, r, g, b);
  };
  fill(0, 0, W, H, 10, 10, 15);
  fill(0, 0, W, H, 36, 24, 18);
  for (let i = 0; i < 18; i++) {
    fill(0, i * 40, 48, i * 40 + 36, 70, 50, 40);
    fill(W - 48, i * 40, W, i * 40 + 36, 70, 50, 40);
  }
  fill(200, 160, 1000, 200, 70, 50, 40);
  fill(400, 400, 800, 440, 70, 50, 40);
  fill(180, 500, 220, 540, 249, 5, 3);
  fill(280, 480, 316, 516, 8, 180, 240);
  fill(860, 300, 900, 340, 245, 252, 0);
  fill(980, 520, 1016, 556, 0, 255, 3);
  fill(640, 240, 680, 280, 180, 40, 40);
  fill(520, 320, 548, 348, 200, 200, 220);
  fill(720, 360, 748, 388, 200, 80, 80);
  fill(240, 510, 400, 518, 255, 220, 160);
  fill(40, 24, 200, 56, 249, 5, 3);

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
