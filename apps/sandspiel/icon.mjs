// Procedural Sandspiel icon: hourglass of sand / water / fire / plant.
// 128 animated GIF frames + 1200×720 cover. Deterministic.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 2, RW = OUT * SS, FRAMES = 128;
const CARD = [26, 20, 16];
const GLASS = [74, 64, 56];
const SAND = [230, 196, 110];
const WATER = [74, 144, 217];
const FIRE = [255, 106, 42];
const PLANT = [76, 175, 80];
const WOOD = [138, 90, 50];
const LAVA = [224, 64, 32];
const ICE = [184, 228, 240];
const INK = [240, 230, 212];

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
function inGlass(x, y) {
  const cx = 64, top = 22, bot = 106, neckY = 64, neckW = 5;
  if (y < top || y > bot) return false;
  const t = (y - top) / (neckY - top);
  const u = (y - neckY) / (bot - neckY);
  let half;
  if (y < neckY) half = 28 * (1 - t) + neckW * t;
  else half = neckW * (1 - u) + 28 * u;
  return Math.abs(x - cx) <= half;
}
function inUpperBulb(x, y) {
  return inGlass(x, y) && y < 64;
}
function inLowerBulb(x, y) {
  return inGlass(x, y) && y >= 64;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, GLASS, SAND, WATER, FIRE, PLANT, WOOD, LAVA, ICE, INK]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
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

function hash(i) {
  let x = (i * 1103515245 + 12345) >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  return (x >>> 0) / 4294967296;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 20;
  const drain = f / FRAMES;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    if (!inCard(x, y, m, rad)) continue;
    let col = mix(CARD, [18, 14, 12], (y - m) / (OUT - 2 * m));
    if (inGlass(x, y)) {
      col = mix(GLASS, CARD, 0.35);
      const topFill = 22 + (64 - 22) * (1 - drain * 0.85);
      const botFill = 106 - (106 - 64) * (drain * 0.85);
      if (inUpperBulb(x, y) && y > topFill) {
        const n = hash((x | 0) * 17 + (y | 0) * 31 + f);
        col = n > 0.86 ? WATER : n > 0.72 ? mix(SAND, FIRE, 0.25) : SAND;
      } else if (inLowerBulb(x, y) && y > botFill) {
        const n = hash((x | 0) * 13 + (y | 0) * 29 + (f >> 2));
        if (y > 92 && Math.abs(x - 64) < 18) col = n > 0.55 ? WATER : mix(WATER, ICE, 0.3);
        else if (n > 0.82) col = PLANT;
        else col = SAND;
      }
      if (Math.abs(x - 64) < 2.4 && y > 50 && y < 78) {
        const stream = (f + (y | 0) * 3) % 7;
        col = stream < 3 ? SAND : stream < 5 ? WATER : FIRE;
      }
    } else {
      const spark = hash((x | 0) + (y | 0) * 128 + f * 3);
      if (spark > 0.992 && y < 50) col = FIRE;
      if (spark > 0.985 && y > 90 && x > 88) col = PLANT;
    }
    const o = (py * RW + px) * 4;
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

export function sandspielIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 3, transparentIndex: 0 };
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
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
};
function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (gph[row] & (1 << (4 - col))) {
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
      }
    }
    cx += 6 * s;
  }
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
  fill(0, 0, W, H, 26, 20, 16);
  drawText(put, 48, 28, 'SANDSPIEL', 7, 230, 196, 110);
  drawText(put, 48, 88, 'POUR. SAVE. A WALL OF BOARDS.', 3, 184, 168, 140);

  const palStrip = [SAND, WATER, FIRE, WOOD, LAVA, PLANT, ICE, [196, 94, 200], [232, 120, 160], [184, 224, 64]];
  palStrip.forEach((c, i) => fill(48 + i * 52, 128, 48 + i * 52 + 44, 152, c[0], c[1], c[2]));

  const gx = 48, gy = 176, gw = 1104, gh = 500;
  const cw = 6, ch = 6;
  const cols = (gw / cw) | 0, rows = (gh / ch) | 0;
  function cellAt(cx, cy) {
    const nx = cx / cols, ny = cy / rows;
    const dune = ny > 0.62 + Math.sin(nx * 12) * 0.04 + ((cx * 13 + cy * 7) % 9) * 0.002;
    const water = ny > 0.82;
    const wood = nx > 0.12 && nx < 0.22 && ny > 0.38 && ny < 0.72;
    const plant = nx > 0.14 && nx < 0.28 && ny > 0.28 && ny < 0.5 && ((cx + cy) % 5 < 2);
    const lava = nx > 0.78 && ny > 0.55 && ny < 0.82;
    const fire = wood && ny < 0.48 && ((cx * 3 + cy) % 7 < 3);
    const ice = nx > 0.55 && nx < 0.7 && ny > 0.7 && ny < 0.82;
    const wall = ny > 0.96 || nx < 0.01 || nx > 0.99;
    if (wall) return GLASS;
    if (fire) return FIRE;
    if (plant) return PLANT;
    if (wood) return WOOD;
    if (lava) return mix(LAVA, FIRE, ((cx + cy) % 4) / 4);
    if (ice) return ICE;
    if (water) return mix(WATER, ICE, (ny - 0.82) * 2);
    if (dune) return mix(SAND, [200, 160, 80], ((cx * 5 + cy) % 6) / 8);
    if (ny > 0.5 && nx > 0.4 && nx < 0.48 && ((cx + cy * 3) % 11 === 0)) return [232, 120, 160];
    return CARD;
  }
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const c = cellAt(cx, cy);
      fill(gx + cx * cw, gy + cy * ch, gx + (cx + 1) * cw, gy + (cy + 1) * ch, c[0] | 0, c[1] | 0, c[2] | 0);
    }
  }

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
