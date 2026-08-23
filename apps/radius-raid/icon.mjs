// Procedural icon for Radius Raid: a dark rounded card, a white three-blade
// ship at the centre, Geometry Wars-style coloured dots orbiting it. Pure Node,
// super-sample → box-downsample → small palette. Deterministic.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [10, 12, 22];
const CARD_B = [4, 6, 12];
const WHITE = [240, 248, 255];
const CYAN = [0, 220, 255];
const MAG = [255, 70, 180];
const YEL = [255, 210, 60];
const LIME = [80, 255, 140];
const ORNG = [255, 130, 50];
const DOTS = [CYAN, MAG, YEL, LIME, ORNG, [120, 160, 255], [255, 90, 90]];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, WHITE, ...DOTS]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.4).map(Math.round));
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
  const cx = Math.min(Math.max(x, lo + r), hi - r);
  const cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const spin = t * Math.PI * 2;
  const dots = [];
  for (let i = 0; i < 14; i++) {
    const ring = 1 + (i % 3);
    const ang = spin * (0.6 + ring * 0.25) + i * 0.9;
    const rad = 18 + ring * 12 + Math.sin(spin * 2 + i) * 3;
    dots.push({
      x: 64 + Math.cos(ang) * rad,
      y: 64 + Math.sin(ang) * rad,
      r: 2.2 + (i % 4) * 0.7,
      c: DOTS[i % DOTS.length],
    });
  }
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, 6, 20)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / 116)));
      const dx = x - 64, dy = y - 64, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 54) col = mix(col, [20, 40, 60], (1 - d / 54) * 0.35);
      for (const p of dots) {
        const dd = Math.hypot(x - p.x, y - p.y);
        if (dd < p.r + 2.5) {
          const k = Math.max(0, 1 - dd / (p.r + 2.5));
          col = mix(col, p.c, k * k);
        }
      }
      // three-blade ship, rotating slowly
      const ang = spin * 0.4;
      for (let b = 0; b < 3; b++) {
        const ba = ang - Math.PI / 4 + b * (Math.PI * 2 / 3);
        const bx = 64 + Math.cos(ba) * 6, by = 64 + Math.sin(ba) * 6;
        const along = (x - 64) * Math.cos(ba) + (y - 64) * Math.sin(ba);
        const perp = -(x - 64) * Math.sin(ba) + (y - 64) * Math.cos(ba);
        if (along > 0 && along < 14 && Math.abs(perp) < 2.1) col = mix(col, WHITE, 0.9);
      }
      if (d < 4.2) col = WHITE;
      // a muzzle spark once per loop
      const flash = Math.max(0, 1 - Math.abs(t - 0.18) / 0.08);
      if (flash > 0) {
        const gx = x - (64 + Math.cos(ang) * 18), gy = y - (64 + Math.sin(ang) * 18);
        const g = Math.max(0, 1 - Math.hypot(gx, gy) / 16);
        if (g > 0) col = mix(col, CYAN, g * g * flash);
      }
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
    if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}

export function radiusRaidIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 8, transparentIndex: 0 };
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
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (gph[row] & (1 << (4 - col))) {
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
          put(cx + col * s + dx, y + row * s + dy, r, g, b);
        }
      }
    }
    cx += 6 * s;
  }
}

function seeded(n) {
  let x = (n * 1103515245 + 12345) >>> 0;
  return function () {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

export function screenshotPng() {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r | 0; rgba[o + 1] = g | 0; rgba[o + 2] = b | 0; rgba[o + 3] = a == null ? 255 : a;
  };
  const fill = (x0, y0, x1, y1, r, g, b) => {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    x1 = Math.min(W, x1 | 0); y1 = Math.min(H, y1 | 0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, r, g, b);
  };
  const disc = (cx, cy, rad, r, g, b, a) => {
    const r2 = rad * rad;
    const x0 = Math.max(0, (cx - rad) | 0), x1 = Math.min(W, (cx + rad + 1) | 0);
    const y0 = Math.max(0, (cy - rad) | 0), y1 = Math.min(H, (cy + rad + 1) | 0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2 <= r2) {
        if (a == null || a >= 255) put(x, y, r, g, b);
        else {
          const o = (y * W + x) * 4;
          const k = a / 255;
          put(x, y, rgba[o] + (r - rgba[o]) * k, rgba[o + 1] + (g - rgba[o + 1]) * k, rgba[o + 2] + (b - rgba[o + 2]) * k);
        }
      }
    }
  };
  const ring = (cx, cy, rad, th, r, g, b) => {
    const r2 = rad * rad, r1 = (rad - th) * (rad - th);
    const x0 = Math.max(0, (cx - rad) | 0), x1 = Math.min(W, (cx + rad + 1) | 0);
    const y0 = Math.max(0, (cy - rad) | 0), y1 = Math.min(H, (cy + rad + 1) | 0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d2 <= r2 && d2 >= r1) put(x, y, r, g, b);
    }
  };

  fill(0, 0, W, H, 8, 10, 16);
  // grid
  for (let x = 40; x < W; x += 48) fill(x, 0, x + 1, H, 22, 26, 36);
  for (let y = 40; y < H; y += 48) fill(0, y, W, y + 1, 22, 26, 36);

  const rnd = seeded(13);
  for (let i = 0; i < 220; i++) {
    const x = rnd() * W, y = rnd() * H, rad = 0.6 + rnd() * 1.4;
    const br = 80 + rnd() * 160;
    disc(x, y, rad, br, br, br + 20, 180);
  }

  const enemies = [
    { x: 820, y: 210, r: 28, c: CYAN },
    { x: 980, y: 360, r: 22, c: MAG },
    { x: 760, y: 520, r: 34, c: YEL },
    { x: 1080, y: 160, r: 16, c: LIME },
    { x: 300, y: 180, r: 46, c: [70, 170, 255] },
    { x: 240, y: 520, r: 18, c: ORNG },
    { x: 1040, y: 560, r: 20, c: [255, 90, 90] },
    { x: 640, y: 120, r: 14, c: [180, 120, 255] },
    { x: 900, y: 640, r: 24, c: [80, 255, 200] },
    { x: 160, y: 340, r: 12, c: CYAN },
  ];
  for (const e of enemies) {
    disc(e.x, e.y, e.r, e.c[0] * 0.12, e.c[1] * 0.12, e.c[2] * 0.12);
    ring(e.x, e.y, e.r, 2, e.c[0], e.c[1], e.c[2]);
    ring(e.x, e.y, e.r * 0.45, 1.5, e.c[0], e.c[1], e.c[2]);
  }

  // bullets from the ship toward the magenta one
  const sx = 520, sy = 390;
  for (let i = 0; i < 7; i++) {
    const t = 0.18 + i * 0.09;
    const bx = sx + (980 - sx) * t, by = sy + (360 - sy) * t;
    disc(bx, by, 3, 240, 250, 255);
    disc(bx - 10, by - 4, 2, 0, 200, 255);
  }

  // particles
  for (let i = 0; i < 40; i++) {
    const ang = rnd() * Math.PI * 2, dist = 20 + rnd() * 90;
    disc(sx + Math.cos(ang) * dist, sy + Math.sin(ang) * dist, 1 + rnd() * 2, 200, 220, 255, 160);
  }

  // three-blade ship
  const dir = Math.atan2(360 - sy, 980 - sx);
  for (let b = 0; b < 3; b++) {
    const ba = dir - Math.PI / 4 + b * (Math.PI * 2 / 3);
    for (let u = 0; u < 22; u++) for (let v = -4; v <= 4; v++) {
      put((sx + Math.cos(ba) * u - Math.sin(ba) * v) | 0,
          (sy + Math.sin(ba) * u + Math.cos(ba) * v) | 0,
          240, 248, 255);
    }
  }
  disc(sx, sy, 8, 240, 248, 255);

  // HUD
  drawText(put, 40, 28, 'HEALTH', 3, 180, 190, 210);
  fill(160, 30, 360, 48, 30, 34, 44);
  fill(160, 30, 330, 48, 40, 200, 90);
  fill(160, 30, 330, 38, 90, 230, 140);
  drawText(put, 400, 28, 'SCORE', 3, 180, 190, 210);
  drawText(put, 520, 28, 'RADIUS RAID', 3, 0, 220, 255);

  // vignette
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = (x / W) * 2 - 1, ny = (y / H) * 2 - 1;
    const v = Math.min(1, Math.sqrt(nx * nx + ny * ny) * 0.72);
    if (v < 0.45) continue;
    const k = (v - 0.45) / 0.55;
    const o = (y * W + x) * 4;
    rgba[o] = rgba[o] * (1 - k * 0.72);
    rgba[o + 1] = rgba[o + 1] * (1 - k * 0.72);
    rgba[o + 2] = rgba[o + 2] * (1 - k * 0.72);
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
