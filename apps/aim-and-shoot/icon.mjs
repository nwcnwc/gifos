// Procedural Aim and Shoot icon: dark card, a figure that aims, a shot flies,
// a robot pops. Super-sample → box-downsample.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 10;
const CARD_A = [28, 28, 32], CARD_B = [12, 12, 16];
const INK = [20, 20, 22], BOT = [180, 40, 40], BOT2 = [40, 80, 180];
const SHOT = [255, 220, 80], GLOW = [255, 255, 200];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, INK, BOT, BOT2, SHOT, GLOW, [255, 255, 255]]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.3).map(Math.round));
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
function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  const sx = 48 + t * 52, sy = 70 - t * 18;
  const boom = t > 0.78;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, 6, 22)) {
      a = 1;
      col = mix(CARD_A, CARD_B, (y - 6) / 116);
      // robot
      if (!boom && Math.abs(x - 96) < 12 && Math.abs(y - 48) < 16) col = f % 2 ? BOT : BOT2;
      if (boom && Math.hypot(x - 96, y - 48) < 10 + (t - 0.78) * 40) col = SHOT;
      // player body
      if (Math.abs(x - 40) < 8 && y > 62 && y < 96) col = INK;
      if ((x - 40) ** 2 + (y - 54) ** 2 < 9 * 9) col = INK;
      if (distSeg(x, y, 44, 66, 58, 58) < 2.2) col = INK;
      // shot
      if (!boom && (x - sx) ** 2 + (y - sy) ** 2 < 3.4 * 3.4) col = SHOT;
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
    idx[y * OUT + x] = a / n < 0.5 ? 0 : nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}

export function aimIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64, flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 10, transparentIndex: 0 };
}

function crc(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
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
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
  };
  const fill = (x0, y0, x1, y1, r, g, b) => {
    for (let y = Math.max(0, y0 | 0); y < Math.min(H, y1 | 0); y++)
      for (let x = Math.max(0, x0 | 0); x < Math.min(W, x1 | 0); x++) put(x, y, r, g, b);
  };
  fill(0, 0, W, H, 236, 236, 236);
  fill(20, 20, 1180, 60, 20, 20, 22);
  // "Generation: 4"
  for (let i = 0; i < 9; i++) fill(40 + i * 18, 28, 52 + i * 18, 52, 255, 255, 255);
  function body(cx, cy, r, g, b, size) {
    for (let y = cy - size; y <= cy + size * 1.6; y++) for (let x = cx - size; x <= cx + size; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + Math.min(dy, 0) * Math.min(dy, 0) < size * size || (dy > 0 && dy < size * 1.5 && Math.abs(dx) < size * 0.7))
        put(x, y, r, g, b);
    }
  }
  body(600, 360, 20, 20, 22, 36);
  body(220, 200, 180, 40, 40, 28);
  body(980, 240, 40, 70, 180, 28);
  body(860, 500, 40, 140, 60, 28);
  body(300, 520, 180, 80, 40, 28);
  // shot
  for (let i = 0; i < 40; i++) {
    const x = 640 + i * 8, y = 340 - i * 2;
    fill(x, y, x + 6, y + 6, 40, 40, 40);
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
