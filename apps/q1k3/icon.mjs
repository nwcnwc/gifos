// Procedural icon for Q1K3: a dark rounded card looking down a torch-lit
// stone hall, shotgun at the hip, a muzzle flash that breathes. Pure Node —
// super-sample → box-downsample → small palette. Deterministic so builds
// reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [18, 12, 10];
const SKY = [28, 22, 20];
const WALL_L = [92, 58, 36];
const WALL_R = [58, 36, 24];
const FLOOR = [48, 32, 22];
const FLOOR_D = [28, 18, 12];
const TORCH = [255, 140, 40];
const TORCH_C = [255, 220, 120];
const GUN = [70, 68, 62];
const GUN_H = [140, 130, 110];
const FLASH = [255, 230, 160];
const ACCENT = [196, 92, 36];

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
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, SKY, WALL_L, WALL_R, FLOOR, FLOOR_D, TORCH, TORCH_C, GUN, GUN_H, FLASH, ACCENT]) {
    pal.push(b);
    pal.push(mix(b, [255, 255, 255], 0.2).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
  }
  for (let i = 1; i <= 5; i++) pal.push(mix(WALL_L, FLOOR, i / 6).map(Math.round));
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
  const flash = Math.max(0, Math.sin(t * Math.PI * 2));
  const torch = 0.55 + 0.45 * Math.sin(t * Math.PI * 2 + 0.7);
  const HORIZON = OUT * 0.46;
  const VPX = OUT * 0.5, VPY = HORIZON;

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 4, 16)) continue;
      let col;
      const dx = x - VPX;
      const wall = Math.abs(dx) / Math.max(4, (y - VPY) * 1.15 + 8);

      if (y < HORIZON) {
        col = mix(SKY, WALL_L, Math.pow(y / HORIZON, 1.4) * 0.4);
        // a torch on the left wall
        const tx = 28 + (y / HORIZON) * 8, ty = HORIZON - 18;
        const td = Math.hypot(x - tx, y - ty);
        if (td < 3 + torch * 2) col = mix(col, TORCH_C, torch);
        else if (td < 10) col = mix(col, TORCH, (1 - td / 10) * torch * 0.7);
      } else {
        const d = (y - HORIZON) / (OUT - HORIZON);
        col = mix(FLOOR_D, FLOOR, 0.2 + d * 0.8);
        const n = ((Math.sin(x * 9.1 + y * 4.7) * 43758.5453) % 1 + 1) % 1;
        if (n > 0.93 - d * 0.05) col = mix(col, FLOOR_D, 0.55);
        if (wall > 0.92) {
          col = dx < 0 ? WALL_L : WALL_R;
          const grout = Math.abs((y * 0.35 + (dx < 0 ? 0 : 3)) % 7 - 3.5);
          if (grout < 0.45) col = mix(col, FLOOR_D, 0.4);
        }
      }

      // shotgun, bottom centre
      const gx = 64, gy = 108;
      const gun = Math.abs(x - gx) < 7 + (y - gy) * 0.18 && y > 86 && y < 122;
      if (gun) col = mix(GUN, GUN_H, (x - gx + 8) / 16);
      const barrel = Math.abs(x - gx) < 2.2 && y > 70 && y < 90;
      if (barrel) col = GUN;
      if (flash > 0.45 && Math.hypot(x - gx, y - 68) < 5 + flash * 4) {
        col = mix(FLASH, TORCH, 1 - flash);
      }

      const o = (py * RW + px) * 4;
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

export function q1k3Icon() {
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
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  3: [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  ' ': [0, 0, 0, 0, 0, 0, 0],
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

export function screenshotPng() {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b, a) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };
  const HORIZON = 310;
  const VPX = W / 2;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - VPX;
      if (y < HORIZON) {
        const t = y / HORIZON;
        const r = 36 + t * 40, g = 24 + t * 18, b = 18 + t * 8;
        put(x, y, r, g, b);
        const wall = Math.abs(dx) / Math.max(8, (HORIZON - y) * 1.6 + 40);
        if (wall > 0.55) {
          const side = dx < 0;
          const u = (y * 0.08 + (side ? 0 : 4)) % 9;
          const grout = Math.abs(u - 4.5) < 0.4;
          if (grout) put(x, y, 28, 16, 10);
          else put(x, y, side ? 110 : 72, side ? 68 : 44, side ? 40 : 26);
        }
      } else {
        const d = (y - HORIZON) / (H - HORIZON);
        const r = 42 + d * 28, g = 28 + d * 14, b = 18 + d * 6;
        put(x, y, r, g, b);
        const n = ((Math.sin(x * 0.07 + y * 0.11) * 43758.5453) % 1 + 1) % 1;
        if (n > 0.92) put(x, y, 28, 16, 10);
        const wall = Math.abs(dx) / Math.max(8, (y - HORIZON) * 1.35 + 20);
        if (wall > 0.72) {
          const side = dx < 0;
          put(x, y, side ? 96 : 62, side ? 58 : 38, side ? 34 : 22);
        }
      }
    }
  }

  let rng = 1;
  function rnd() { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; }

  // torches
  function torch(tx, ty, s) {
    for (let i = 0; i < 80; i++) {
      const a = rnd() * Math.PI * 2;
      const rad = rnd() * 18 * s;
      put(tx + Math.cos(a) * rad, ty + Math.sin(a) * rad * 1.2, 255, 150 + rnd() * 70, 40);
    }
    for (let i = 0; i < 30; i++) {
      const a = rnd() * Math.PI * 2;
      const rad = rnd() * 8 * s;
      put(tx + Math.cos(a) * rad, ty + Math.sin(a) * rad, 255, 230, 140);
    }
  }
  torch(260, 240, 1.4);
  torch(940, 250, 1.2);

  // shotgun
  for (let y = 430; y < 700; y++) {
    const w = 14 + (y - 430) * 0.09;
    for (let x = VPX - w; x < VPX + w; x++) {
      put(x, y, 78, 74, 66);
    }
  }
  for (let y = 360; y < 450; y++) {
    for (let x = VPX - 7; x < VPX + 7; x++) put(x, y, 64, 62, 56);
  }
  // muzzle
  for (let i = 0; i < 120; i++) {
    const a = rnd() * Math.PI * 2;
    const rad = rnd() * 28;
    put(VPX + Math.cos(a) * rad, 348 + Math.sin(a) * rad * 0.7, 255, 220, 140);
  }

  // a grunt silhouette down the hall
  for (let y = 250; y < 360; y++) {
    const t = (y - 250) / 110;
    const w = 8 + t * 18;
    for (let x = VPX + 40 - w; x < VPX + 40 + w; x++) put(x, y, 22, 16, 12);
  }
  for (let y = 228; y < 258; y++) {
    for (let x = VPX + 28; x < VPX + 52; x++) put(x, y, 22, 16, 12);
  }

  drawText(put, 36, 28, 'Q1K3', 6, 224, 120, 48);
  drawText(put, 36, H - 64, '100', 5, 224, 224, 224);
  drawText(put, W - 160, H - 64, 'Q', 5, 224, 224, 224);

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
