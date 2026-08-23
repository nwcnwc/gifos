// Procedural icon for Q1K3: a dark rounded card looking down a torch-lit
// stone hall in the middle of a fight — shotgun at the hip, a grunt closing,
// a muzzle flash that earns the loop. Cover is the same hall mid-combat.
// Pure Node — super-sample → box-downsample → small palette. Deterministic.
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
const GRUNT = [52, 68, 36];
const GRUNT_D = [24, 32, 16];
const SKIN = [196, 150, 96];
const BLOOD = [140, 28, 18];
const PELLET = [255, 240, 200];

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
  for (const b of [CARD, SKY, WALL_L, WALL_R, FLOOR, FLOOR_D, TORCH, TORCH_C, GUN, GUN_H, FLASH, ACCENT, GRUNT, GRUNT_D, SKIN, BLOOD, PELLET]) {
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

function fillRect(rgba, x, y, w, h, col) {
  const x0 = Math.max(0, x * SS | 0), y0 = Math.max(0, y * SS | 0);
  const x1 = Math.min(RW, (x + w) * SS | 0), y1 = Math.min(RW, (y + h) * SS | 0);
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const o = (py * RW + px) * 4;
      if (!rgba[o + 3]) continue;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2];
    }
  }
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const flash = Math.max(0, Math.sin(t * Math.PI * 2));
  const torch = 0.55 + 0.45 * Math.sin(t * Math.PI * 2 + 0.7);
  const close = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 - 0.4));
  const recoil = flash > 0.55 ? 1.6 : 0;
  const HORIZON = OUT * 0.42;
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
        const tx = 28 + (y / HORIZON) * 8, ty = HORIZON - 18;
        const td = Math.hypot(x - tx, y - ty);
        if (td < 3 + torch * 2) col = mix(col, TORCH_C, torch);
        else if (td < 10) col = mix(col, TORCH, (1 - td / 10) * torch * 0.7);
        const tx2 = 98 - (y / HORIZON) * 8, ty2 = HORIZON - 16;
        const td2 = Math.hypot(x - tx2, y - ty2);
        if (td2 < 2.5 + torch * 1.6) col = mix(col, TORCH_C, torch * 0.85);
        else if (td2 < 8) col = mix(col, TORCH, (1 - td2 / 8) * torch * 0.5);
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

      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }

  // grunt closing down the hall — olive so it does not vanish into rust walls
  const gw = 10 + close * 14;
  const gh = 16 + close * 22;
  const gx0 = VPX - gw * 0.35 + 4;
  const gy0 = HORIZON - 2 + close * 8 + recoil;
  fillRect(rgba, gx0 + gw * 0.22, gy0, gw * 0.42, gh * 0.28, SKIN);           // head
  fillRect(rgba, gx0 + gw * 0.12, gy0 + gh * 0.26, gw * 0.62, gh * 0.42, GRUNT); // body
  fillRect(rgba, gx0 + gw * 0.18, gy0 + gh * 0.66, gw * 0.2, gh * 0.34, GRUNT_D); // legs
  fillRect(rgba, gx0 + gw * 0.5, gy0 + gh * 0.66, gw * 0.2, gh * 0.34, GRUNT_D);
  fillRect(rgba, gx0 + gw * 0.38, gy0 + gh * 0.4, gw * 0.18, gh * 0.38, GUN);  // gun at us

  // shotgun in the foreground
  fillRect(rgba, 57, 88, 14, 34, GUN);
  fillRect(rgba, 61, 70, 6, 22, GUN);
  fillRect(rgba, 59, 108, 10, 14, GUN_H);
  if (flash > 0.42) {
    const fs = 4 + flash * 8;
    fillRect(rgba, 64 - fs / 2, 66 - fs / 2, fs, fs, FLASH);
    fillRect(rgba, 62, 64, 8, 8, TORCH_C);
  }
  if (flash > 0.5) {
    fillRect(rgba, 63, 58, 3, 10, PELLET);
    fillRect(rgba, gx0 + gw * 0.4, gy0 + gh * 0.3, 3, 3, FLASH);
    fillRect(rgba, gx0 + gw * 0.5, gy0 + gh * 0.2, 2, 2, BLOOD);
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
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  3: [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  5: [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  6: [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
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

function drawInfinity(put, x, y, s, r, g, b) {
  for (let a = 0; a < Math.PI * 2; a += 0.08) {
    const px = x + Math.cos(a) * 3.2 * s + Math.cos(a) * 1.4 * s;
    const py = y + Math.sin(a * 2) * 1.6 * s;
    for (let dy = 0; dy < s; dy++) {
      for (let dx = 0; dx < s; dx++) put(px + dx, py + dy, r, g, b);
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
  const HORIZON = 300;
  const VPX = W / 2;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - VPX;
      if (y < HORIZON) {
        const t = y / HORIZON;
        const r = 32 + t * 44, g = 20 + t * 20, b = 14 + t * 10;
        put(x, y, r, g, b);
        const wall = Math.abs(dx) / Math.max(8, (HORIZON - y) * 1.55 + 36);
        if (wall > 0.52) {
          const side = dx < 0;
          const u = (y * 0.08 + (side ? 0 : 4)) % 9;
          const grout = Math.abs(u - 4.5) < 0.4;
          if (grout) put(x, y, 28, 16, 10);
          else put(x, y, side ? 118 : 76, side ? 72 : 46, side ? 42 : 28);
        }
      } else {
        const d = (y - HORIZON) / (H - HORIZON);
        const r = 40 + d * 30, g = 26 + d * 16, b = 16 + d * 8;
        put(x, y, r, g, b);
        const n = ((Math.sin(x * 0.07 + y * 0.11) * 43758.5453) % 1 + 1) % 1;
        if (n > 0.92) put(x, y, 28, 16, 10);
        const wall = Math.abs(dx) / Math.max(8, (y - HORIZON) * 1.32 + 18);
        if (wall > 0.70) {
          const side = dx < 0;
          put(x, y, side ? 100 : 64, side ? 60 : 40, side ? 36 : 24);
        }
      }
    }
  }

  let rng = 1;
  function rnd() { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; }

  function torch(tx, ty, s) {
    for (let i = 0; i < 90; i++) {
      const a = rnd() * Math.PI * 2;
      const rad = rnd() * 20 * s;
      put(tx + Math.cos(a) * rad, ty + Math.sin(a) * rad * 1.25, 255, 145 + rnd() * 75, 36);
    }
    for (let i = 0; i < 36; i++) {
      const a = rnd() * Math.PI * 2;
      const rad = rnd() * 9 * s;
      put(tx + Math.cos(a) * rad, ty + Math.sin(a) * rad, 255, 230, 140);
    }
  }
  torch(250, 228, 1.5);
  torch(960, 236, 1.25);

  function grunt(cx, cy, s, recoil) {
    const y0 = cy + recoil;
    // legs
    for (let y = y0 + s * 0.55; y < y0 + s; y++) {
      const t = (y - y0) / s;
      for (let x = cx - s * 0.22; x < cx - s * 0.04; x++) put(x, y, 44, 30, 18);
      for (let x = cx + s * 0.04; x < cx + s * 0.22; x++) put(x, y, 40, 28, 16);
    }
    // body
    for (let y = y0 - s * 0.05; y < y0 + s * 0.55; y++) {
      const t = (y - (y0 - s * 0.05)) / (s * 0.6);
      const w = s * (0.22 + t * 0.08);
      for (let x = cx - w; x < cx + w; x++) put(x, y, 86 - t * 18, 64 - t * 14, 38 - t * 8);
    }
    // head
    for (let y = y0 - s * 0.38; y < y0 - s * 0.02; y++) {
      const w = s * 0.16;
      for (let x = cx - w; x < cx + w; x++) put(x, y, 158, 108, 68);
    }
    // gun toward camera
    for (let y = y0 + s * 0.08; y < y0 + s * 0.42; y++) {
      for (let x = cx - s * 0.05; x < cx + s * 0.05; x++) put(x, y, 62, 60, 54);
    }
  }
  grunt(VPX + 36, 318, 168, 6);
  grunt(VPX - 110, 268, 78, 0);

  // shotgun
  for (let y = 430; y < 700; y++) {
    const w = 16 + (y - 430) * 0.11;
    for (let x = VPX - w; x < VPX + w; x++) put(x, y, 78, 74, 66);
  }
  for (let y = 348; y < 450; y++) {
    for (let x = VPX - 8; x < VPX + 8; x++) put(x, y, 64, 62, 56);
  }
  // muzzle flash
  for (let i = 0; i < 220; i++) {
    const a = rnd() * Math.PI * 2;
    const rad = rnd() * 42;
    put(VPX + Math.cos(a) * rad, 338 + Math.sin(a) * rad * 0.7, 255, 220, 130);
  }
  for (let i = 0; i < 50; i++) {
    const a = rnd() * Math.PI * 2;
    const rad = rnd() * 16;
    put(VPX + Math.cos(a) * rad, 334 + Math.sin(a) * rad * 0.55, 255, 250, 210);
  }

  // pellet streaks toward the near grunt
  for (let i = 0; i < 8; i++) {
    const ox = (i - 3.5) * 7;
    const x0 = VPX + ox * 0.2, y0 = 336;
    const x1 = VPX + 36 + ox * 1.6, y1 = 250 + (i % 3) * 8;
    const steps = 18;
    for (let k = 4; k < steps; k++) {
      const u = k / steps;
      put(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 255, 236, 180);
      put(x0 + (x1 - x0) * u + 1, y0 + (y1 - y0) * u, 255, 200, 90);
    }
  }

  // impact sparks on the near grunt
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2;
    const rad = rnd() * 22;
    put(VPX + 36 + Math.cos(a) * rad, 300 + Math.sin(a) * rad, 255, 180 + rnd() * 50, 60);
  }

  drawText(put, 36, H - 64, '64', 5, 224, 224, 224);
  drawInfinity(put, W - 90, H - 48, 3.2, 224, 224, 224);

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
