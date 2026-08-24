// Procedural Field Play icon: cyan particles on a transparent sticker, plus a
// 1200×720 mid-use cover of the field (no lettered tile).
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const INK = [232, 238, 248];
const CYAN = [57, 208, 197];
const BLUE = [31, 111, 235];
const GOLD = [255, 210, 90];
const NAVY = [19, 41, 79];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [NAVY, INK, CYAN, BLUE, GOLD, [11, 24, 50]]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.4).map(Math.round));
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

function fieldAt(x, y) {
  // v = (cos y, cos x) — README 2
  return { vx: Math.cos(y), vy: Math.cos(x) };
}

function inDisk(x, y, cx, cy, r) {
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  // faint vortex ring so the sticker reads at 64px — no opaque card
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    const dx = x - 64, dy = y - 64;
    const r = Math.hypot(dx, dy);
    if (r > 58 || r < 10) continue;
    const ring = Math.exp(-Math.pow((r - 34) / 16, 2));
    const ang = Math.atan2(dy, dx) + t * Math.PI * 2;
    const col = mix(CYAN, GOLD, (Math.sin(ang * 3) * 0.5 + 0.5) * 0.4);
    const a = 0.18 + 0.35 * ring;
    const o = (py * RW + px) * 4;
    rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = a;
  }
  for (let i = 0; i < 56; i++) {
    const seed = i * 17.13;
    let px = ((seed * 1.7) % 1) * 6 - 3;
    let py = ((seed * 2.3) % 1) * 6 - 3;
    for (let s = 0; s < f * 5 + 10; s++) {
      const v = fieldAt(px, py);
      px += v.vx * 0.07; py += v.vy * 0.07;
    }
    const cx = 64 + px * 14, cy = 64 + py * 14;
    if (!inDisk(cx, cy, 64, 64, 56)) continue;
    const sp = Math.min(1, Math.hypot(Math.cos(py), Math.cos(px)));
    const col = mix(CYAN, GOLD, sp);
    for (let sy = -2; sy <= 2; sy++) for (let sx = -2; sx <= 2; sx++) {
      const x = cx + sx, y = cy + sy;
      if (x < 0 || y < 0 || x >= OUT || y >= OUT) continue;
      if (!inDisk(x, y, 64, 64, 58)) continue;
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

export function fieldPlayIcon() {
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

  // Full-bleed field, mid-flow — black plane, cyan specks, a pour, matching the toy.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 6, 8, 14);
  for (let i = 0; i < 14000; i++) {
    let px = ((i * 17.13) % 1) * 8 - 4;
    let py = ((i * 9.71) % 1) * 6 - 3;
    for (let s = 0; s < 22; s++) {
      const v = fieldAt(px, py);
      px += v.vx * 0.055; py += v.vy * 0.055;
    }
    const x = (px + 4) / 8 * W;
    const y = (py + 3) / 6 * H;
    put(x, y, 90, 210, 230);
    put(x + 1, y, 57, 208, 197);
  }
  // denser pour, as if a finger just tapped
  for (let i = 0; i < 1100; i++) {
    const ang = (i * 2.399) % (Math.PI * 2);
    const rad = (i % 80) * 0.85;
    const x = 780 + Math.cos(ang) * rad;
    const y = 310 + Math.sin(ang) * rad * 0.85;
    put(x, y, 180, 240, 255);
    put(x + 1, y, 57, 208, 197);
  }

  // in-app chrome: chips along the bottom, one selected — mid-use, not first boot
  rr(put, 24, 640, 1176, 700, 16, 11, 24, 50, 230);
  const chips = [
    { t: 0, w: 150, on: false },
    { t: 1, w: 170, on: true },
    { t: 2, w: 140, on: false },
    { t: 3, w: 160, on: false },
  ];
  let cx = 40;
  for (let i = 0; i < chips.length; i++) {
    const on = chips[i].on;
    const w = chips[i].w;
    if (on) rr(put, cx, 652, cx + w, 688, 14, 31, 111, 235);
    else rr(put, cx, 652, cx + w, 688, 14, 15, 28, 51);
    cx += w + 14;
  }
  // pause / reset pills
  rr(put, 980, 652, 1060, 688, 10, 15, 28, 51);
  rr(put, 1074, 652, 1160, 688, 10, 57, 208, 197);

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
