// Procedural icon for Stolen Sword: a pale rounded card, bamboo, a dark
// swordsman whose blade swings across the frames. Pure Node — super-sample →
// box-downsample → small palette. Deterministic so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 10;

const SKY_A = [221, 234, 240];
const SKY_B = [168, 196, 186];
const BAMBOO = [104, 158, 131];
const BAMBOO_D = [62, 110, 88];
const BAMBOO_L = [150, 190, 164];
const INK = [34, 34, 40];
const INK_L = [72, 72, 80];
const SHIRT = [196, 196, 196];
const SWORD = [232, 201, 24];
const SWORD_D = [168, 140, 28];
const THIEF = [219, 97, 87];
const GROUND = [90, 118, 96];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [SKY_A, SKY_B, BAMBOO, BAMBOO_D, BAMBOO_L, INK, INK_L, SHIRT, SWORD, SWORD_D, THIEF, GROUND]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.3).map(Math.round));
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
function inRR(x, y, x0, y0, x1, y1, rad) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + rad), x1 - rad);
  const cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
  if (x >= x0 + rad && x <= x1 - rad) return true;
  if (y >= y0 + rad && y <= y1 - rad) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= rad * rad;
}
function distSeg(x, y, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / l2));
  const px = x0 + t * dx, py = y0 + t * dy;
  return Math.hypot(x - px, y - py);
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  const swing = -0.55 + 1.35 * (0.5 - 0.5 * Math.cos(t * Math.PI));
  const hx = 52, hy = 58;
  const sx = hx + Math.cos(swing) * 28;
  const sy = hy + Math.sin(swing) * 28;
  const thiefX = 86 + t * 10;
  const thiefY = 46 - Math.sin(t * Math.PI) * 8;

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 20)) continue;
      const gy = (y - 6) / (OUT - 12);
      let col = mix(SKY_A, SKY_B, gy);

      // ground
      if (y > 96) col = mix(GROUND, BAMBOO_D, (y - 96) / 26);

      // bamboo stalks
      const stalks = [
        { x: 22, w: 3.2, top: 18 },
        { x: 34, w: 2.4, top: 28 },
        { x: 102, w: 3.0, top: 22 },
        { x: 112, w: 2.2, top: 34 },
      ];
      for (const s of stalks) {
        if (x > s.x - s.w && x < s.x + s.w && y > s.top && y < 100) {
          col = (Math.floor((y - s.top) / 14) % 2 === 0) ? BAMBOO : BAMBOO_D;
          if (Math.abs((y - s.top) % 14 - 0.8) < 0.7) col = BAMBOO_L;
        }
      }

      // thief (small, fleeing right)
      if (Math.hypot(x - thiefX, y - thiefY) < 5.2) col = THIEF;
      if (Math.hypot(x - (thiefX + 4), y - (thiefY - 3)) < 2.4) col = mix(THIEF, [255, 220, 210], 0.25);
      if (distSeg(x, y, thiefX, thiefY, thiefX + 9, thiefY + 2) < 1.1) col = SWORD_D;

      // hero body
      if (inRR(x, y, hx - 5, hy - 2, hx + 5, hy + 16, 2.2)) col = INK;
      if (inRR(x, y, hx - 4, hy + 14, hx - 0.5, hy + 34, 1.2)) col = INK;
      if (inRR(x, y, hx + 0.5, hy + 14, hx + 4.4, hy + 34, 1.2)) col = INK;
      if (Math.hypot(x - hx, y - (hy - 8)) < 6.2) col = INK;
      if (Math.hypot(x - (hx + 1.4), y - (hy - 9)) < 2.1) col = SHIRT;
      // hat brim
      if (inRR(x, y, hx - 8, hy - 13, hx + 8, hy - 9.5, 1.4)) col = INK_L;

      // sword
      const sw = distSeg(x, y, hx + 2, hy + 2, sx, sy);
      if (sw < 2.1) col = SWORD;
      if (sw < 1.1) col = mix(SWORD, [255, 255, 230], 0.4);
      if (Math.hypot(x - sx, y - sy) < 2.6) col = SWORD_D;

      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = SS * SS;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx2 = 0; sx2 < SS; sx2++) {
          const o = (((y * SS + sy) * RW) + (x * SS + sx2)) * 4;
          r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
        }
      }
      if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
      idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
    }
  }
  return idx;
}

export function stolenSwordIcon() {
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

export function screenshotPng() {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b, a) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const c = mix(SKY_A, mix(SKY_B, GROUND, Math.max(0, (t - 0.72) / 0.28)), t);
    for (let x = 0; x < W; x++) put(x, y, c[0] | 0, c[1] | 0, c[2] | 0);
  }

  function stalk(sx, top, w) {
    for (let y = top; y < 640; y++) {
      const joint = ((y - top) % 48) < 4;
      const col = joint ? BAMBOO_L : (((y - top) / 48 | 0) % 2 ? BAMBOO_D : BAMBOO);
      for (let x = sx - w; x <= sx + w; x++) put(x, y, col[0], col[1], col[2]);
    }
  }
  stalk(90, 40, 10);
  stalk(170, 90, 7);
  stalk(250, 20, 12);
  stalk(980, 50, 11);
  stalk(1080, 110, 8);
  stalk(1160, 30, 9);

  // dashed trajectory
  for (let i = 0; i < 18; i++) {
    const u = i / 17;
    const x = 280 + u * 420;
    const y = 480 - Math.sin(u * Math.PI) * 220;
    const r = 5 + (i % 3);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) put(x + dx, y + dy, 20, 20, 24, 70);
    }
  }

  function figure(cx, cy, ink, shirt, facing, swing) {
    const hx = cx, hy = cy;
    for (let y = hy - 8; y < hy + 70; y++) {
      for (let x = hx - 16; x < hx + 16; x++) {
        if (inRR(x, y, hx - 12, hy, hx + 12, hy + 42, 6)) put(x, y, ink[0], ink[1], ink[2]);
      }
    }
    for (let y = hy - 28; y < hy; y++) {
      for (let x = hx - 18; x < hx + 18; x++) {
        if (Math.hypot(x - hx, y - (hy - 16)) < 16) put(x, y, ink[0], ink[1], ink[2]);
      }
    }
    for (let y = hy - 22; y < hy - 10; y++) {
      for (let x = hx + 2; x < hx + 12; x++) {
        if (Math.hypot(x - (hx + 6), y - (hy - 16)) < 6) put(x, y, shirt[0], shirt[1], shirt[2]);
      }
    }
    const sx = hx + Math.cos(swing) * facing * 70;
    const sy = hy + Math.sin(swing) * 70;
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const x = hx + 8 * facing + (sx - hx) * (i / steps);
      const y = hy + 8 + (sy - hy) * (i / steps);
      const w = i < 8 ? 3 : 4;
      for (let dy = -w; dy <= w; dy++) for (let dx = -w; dx <= w; dx++) {
        if (dx * dx + dy * dy <= w * w) put(x + dx, y + dy, SWORD[0], SWORD[1], SWORD[2]);
      }
    }
  }
  figure(360, 430, INK, SHIRT, 1, -0.2);
  figure(620, 360, mix(INK, THIEF, 0.15).map(Math.round), mix(SHIRT, [180, 80, 80], 0.3).map(Math.round), 1, 0.4);
  figure(820, 250, THIEF, mix(THIEF, [255, 230, 220], 0.35).map(Math.round), 1, -0.6);

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
