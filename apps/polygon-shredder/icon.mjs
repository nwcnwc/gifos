// Procedural Polygon Shredder icon: coloured flakes bursting on a transparent
// sticker, plus a 1200×720 mid-use cover (no lettered tile).
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CORAL = [237, 106, 90];
const TEAL = [112, 193, 179];
const GOLD = [255, 224, 102];
const MINT = [199, 239, 207];
const CREAM = [244, 241, 187];
const COLS = [CORAL, TEAL, GOLD, MINT, [155, 193, 188], [240, 182, 127], CREAM];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CORAL, TEAL, GOLD, MINT, CREAM, [32, 32, 32]]) {
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
function inDisk(x, y, cx, cy, r) {
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  // faint core cube so it reads at 64px
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    const dx = Math.abs(x - 64), dy = Math.abs(y - 64);
    if (dx < 8 && dy < 8) {
      const o = (py * RW + px) * 4;
      const col = mix(CORAL, GOLD, t);
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }
  for (let i = 0; i < 80; i++) {
    const ang = i * 2.399 + t * 2.2;
    const dist = 6 + (i % 18) * 2.4 + Math.sin(t * 6.28 + i) * 6;
    const cx = 64 + Math.cos(ang) * dist;
    const cy = 64 + Math.sin(ang * 1.08) * dist * 0.88;
    if (!inDisk(cx, cy, 64, 64, 58)) continue;
    const col = COLS[i % COLS.length];
    const s = 1 + (i % 3);
    for (let sy = -s; sy <= s; sy++) for (let sx = -s; sx <= s; sx++) {
      const x = cx + sx, y = cy + sy;
      if (x < 0 || y < 0 || x >= OUT || y >= OUT) continue;
      if (!inDisk(x, y, 64, 64, 60)) continue;
      for (let qy = 0; qy < SS; qy++) for (let qx = 0; qx < SS; qx++) {
        const o = ((((y | 0) * SS + qy) * RW) + ((x | 0) * SS + qx)) * 4;
        rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
      }
    }
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0, nn = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
    }
    if (a / nn < 0.22) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / nn, g / nn, b / nn);
  }
  return idx;
}
export function polygonShredderIcon() {
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
function rr(put, x0, y0, x1, y1, rad, r, g, b, a) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
    const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b, a);
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
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 32, 32, 32);
  // cubes near the centre
  for (let i = 0; i < 40; i++) {
    const ang = i * 0.31, dist = 8 + (i % 7) * 6;
    const x = 600 + Math.cos(ang) * dist;
    const y = 330 + Math.sin(ang) * dist * 0.6;
    const c = COLS[i % COLS.length];
    for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
      if (Math.abs(dx) > 6 && Math.abs(dy) > 6) continue;
      put(x + dx, y + dy, c[0], c[1], c[2]);
    }
  }
  // flakes bursting out
  for (let i = 0; i < 1800; i++) {
    const ang = i * 0.37 + 0.4;
    const dist = 30 + (i % 110) * 4.2;
    const x = 600 + Math.cos(ang) * dist;
    const y = 340 + Math.sin(ang * 1.12) * dist * 0.72;
    const c = COLS[i % COLS.length];
    const s = 1 + (i % 3);
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(x + dx, y + dy, c[0], c[1], c[2]);
  }
  rr(put, 24, 640, 1176, 700, 16, 24, 24, 24, 230);
  rr(put, 40, 652, 170, 688, 14, 237, 106, 90);
  rr(put, 184, 652, 310, 688, 14, 42, 42, 42);
  rr(put, 324, 652, 470, 688, 14, 42, 42, 42);
  rr(put, 980, 652, 1060, 688, 10, 42, 42, 42);
  rr(put, 1074, 652, 1160, 688, 10, 112, 193, 179);

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
