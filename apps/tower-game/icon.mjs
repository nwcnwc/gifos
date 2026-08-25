// Procedural icon for Tower Game: a cyan card, a red-brick windowed stack,
// a crane swinging a floor that drops onto it. Super-sample → box-downsample
// → small palette; deterministic so GIF builds reproduce.
// screenshotPng() is the 1200×720 store cover: a TALL mid-game tower plus
// the race, not empty ground and not a missing letter.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const SKY_TOP = [126, 214, 232];
const SKY_MID = [176, 228, 214];
const SKY_BOT = [210, 236, 200];
const CITY = [90, 186, 220];
const CITY_D = [70, 160, 205];
const BRICK = [214, 78, 64];
const BRICK_D = [168, 48, 42];
const BRICK_L = [236, 118, 96];
const MORTAR = [140, 42, 38];
const WINDOW = [92, 186, 230];
const WINDOW_D = [56, 130, 186];
const GOLD = [244, 186, 72];
const GOLD_D = [210, 140, 40];
const GOLD_L = [255, 228, 150];
const HOOK = [54, 44, 40];
const STRIPE_Y = [244, 196, 64];
const STRIPE_K = [48, 40, 36];
const ROPE = [120, 88, 64];
const HEART = [236, 64, 80];
const WHITE = [255, 252, 246];
const INK = [72, 36, 28];
const GROUND = [92, 102, 118];
const TREE = [92, 168, 86];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  const bases = [SKY_TOP, SKY_MID, SKY_BOT, CITY, CITY_D, BRICK, BRICK_D, BRICK_L,
    MORTAR, WINDOW, WINDOW_D, GOLD, GOLD_D, GOLD_L, HOOK, STRIPE_Y, STRIPE_K,
    ROPE, HEART, WHITE, INK, GROUND, TREE];
  for (const b of bases) {
    pal.push(b.map(Math.round));
    pal.push(mix(b, [255, 255, 255], 0.18).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.22).map(Math.round));
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

function skyAt(y, top, bot) {
  const t = (y - top) / Math.max(1, bot - top);
  if (t < 0.45) return mix(SKY_TOP, SKY_MID, t / 0.45);
  return mix(SKY_MID, SKY_BOT, (t - 0.45) / 0.55);
}

function brickCol(x, y, b, gold) {
  const u = (x - b.x) / b.w;
  const v = (y - b.y) / b.h;
  let col = gold
    ? mix(GOLD_D, GOLD, 0.35 + 0.45 * u)
    : mix(BRICK_D, BRICK, 0.25 + 0.55 * u);
  if (u < 0.08) col = gold ? GOLD_L : BRICK_L;
  const mortarY = ((y - b.y) / 4) % 1;
  const mortarX = ((x - b.x + ((Math.floor((y - b.y) / 4) % 2) * (b.w / 6))) / (b.w / 3)) % 1;
  if (mortarY < 0.12 || mortarX < 0.08) col = gold ? GOLD_D : MORTAR;
  // two windows
  const wy = b.y + b.h * 0.28;
  const wh = b.h * 0.52;
  const ww = b.w * 0.22;
  const wx1 = b.x + b.w * 0.18;
  const wx2 = b.x + b.w * 0.58;
  const inWin = (wx, wy0) => x >= wx && x <= wx + ww && y >= wy0 && y <= wy0 + wh
    && !(y < wy0 + ww * 0.45 && ((x - (wx + ww / 2)) ** 2 + (y - (wy0 + ww * 0.45)) ** 2 > (ww * 0.5) ** 2));
  if (inWin(wx1, wy) || inWin(wx2, wy)) {
    col = mix(WINDOW_D, WINDOW, u);
    if (v < 0.45) col = mix(col, WHITE, 0.18);
  }
  if (y <= b.y + 1.4) col = mix(col, gold ? GOLD_L : BRICK_L, 0.4);
  return col;
}

function stackIcon() {
  // Bottom-up. y is top of the block. A short growing tower so the drop reads.
  return [
    { x: 32, y: 94, w: 64, h: 16 },
    { x: 36, y: 80, w: 56, h: 14 },
    { x: 34, y: 66, w: 60, h: 14 },
  ];
}

function swinging(f) {
  const t = f / (FRAMES - 1);
  const dropStart = 0.42;
  const hx = 64, hy = 12;
  if (t < dropStart) {
    const ang = Math.sin((t / dropStart) * Math.PI) * 0.62;
    const len = 26;
    return {
      x: hx + Math.sin(ang) * len - 20,
      y: hy + 8 + Math.cos(ang) * len,
      w: 40, h: 13,
      hx, hy, swinging: true, landed: false, flash: 0,
    };
  }
  const u = (t - dropStart) / (1 - dropStart);
  const ease = u * u;
  const y = 22 + ease * 31;
  const landed = u > 0.82;
  return {
    x: 38, y: landed ? 53 : y, w: 40, h: 13,
    hx, hy, swinging: false, landed,
    flash: landed ? Math.max(0, 1 - (u - 0.82) / 0.18) : 0,
  };
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 7, rad = 20;
  const floors = stackIcon();
  const drop = swinging(f);
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = skyAt(y, m, OUT - m);
      // city lumps
      if (y > 88 && y < 100) {
        const k = Math.floor((x - 14) / 10);
        const h = 6 + ((k * 5 + 3) % 9);
        if (x > 14 && x < 114 && y > 100 - h) col = (k % 2) ? CITY : CITY_D;
      }
      if (y >= 100) col = mix(GROUND, CITY_D, 0.25);
      // crane mast
      if (x > drop.hx - 1.6 && x < drop.hx + 1.6 && y > drop.hy && y < drop.hy + 10) col = HOOK;
      // striped hook block
      if (inRR(x, y, drop.hx - 6, drop.hy, drop.hx + 6, drop.hy + 8, 1)) {
        col = ((Math.floor(x + y) % 6) < 3) ? STRIPE_Y : STRIPE_K;
      }
      if (drop.swinging) {
        const dx = (drop.x + drop.w / 2) - drop.hx;
        const dy = drop.y - (drop.hy + 8);
        const steps = 18;
        for (let i = 0; i <= steps; i++) {
          const px2 = drop.hx + dx * (i / steps);
          const py2 = drop.hy + 8 + dy * (i / steps);
          if ((x - px2) * (x - px2) + (y - py2) * (y - py2) < 1.2 * 1.2) col = ROPE;
        }
      } else if (!drop.landed) {
        if (x > drop.hx - 0.8 && x < drop.hx + 0.8 && y > drop.hy + 8 && y < drop.y) col = ROPE;
      }
      for (let i = 0; i < floors.length; i++) {
        const b = floors[i];
        if (inRR(x, y, b.x, b.y, b.x + b.w, b.y + b.h, 1.5)) col = brickCol(x, y, b, false);
      }
      if (inRR(x, y, drop.x, drop.y, drop.x + drop.w, drop.y + drop.h, 1.5)) {
        col = brickCol(x, y, drop, drop.flash > 0.2);
        if (drop.flash > 0.55) col = mix(col, GOLD_L, drop.flash);
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

export function towerGameIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 9, transparentIndex: 0 };
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
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '·': [0, 0, 0, 0b00100, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const gph = GLYPHS[ch] || GLYPHS[' '];
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

function rr(put, x0, y0, x1, y1, rad, r, g, b) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
    const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
  }
}

function paintFloor(put, x0, y0, w, h, gold) {
  const base = gold ? GOLD : BRICK;
  const dark = gold ? GOLD_D : BRICK_D;
  const lite = gold ? GOLD_L : BRICK_L;
  const mort = gold ? GOLD_D : MORTAR;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const u = (x - x0) / w;
      const c = mix(dark, base, 0.35 + 0.5 * u);
      put(x, y, c[0], c[1], c[2]);
    }
  }
  // mortar
  const rowH = Math.max(6, (h / 3) | 0);
  const colW = Math.max(10, (w / 5) | 0);
  for (let y = y0; y < y0 + h; y++) {
    if (((y - y0) % rowH) === 0) {
      for (let x = x0; x < x0 + w; x++) put(x, y, mort[0], mort[1], mort[2]);
    }
    const row = ((y - y0) / rowH) | 0;
    const off = (row % 2) * (colW / 2);
    for (let x = x0; x < x0 + w; x++) {
      if (((x - x0 + off) % colW) < 1.2) put(x, y, mort[0], mort[1], mort[2]);
    }
  }
  // ledge
  for (let x = x0; x < x0 + w; x++) {
    put(x, y0, lite[0], lite[1], lite[2]);
    put(x, y0 + 1, lite[0], lite[1], lite[2]);
  }
  // two arched windows, sized like the original block art
  const ww = Math.max(16, Math.min((w * 0.22) | 0, (h * 0.55) | 0));
  const wh = Math.max(16, (h * 0.58) | 0);
  const wy = y0 + Math.max(6, (h * 0.22) | 0);
  const windows = [x0 + (w * 0.18) | 0, x0 + (w * 0.58) | 0];
  for (const wx of windows) {
    for (let y = wy; y < wy + wh; y++) for (let x = wx; x < wx + ww; x++) {
      const cx = wx + ww / 2, cy = wy + ww * 0.45;
      const inArch = y >= cy || ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= (ww * 0.5) * (ww * 0.5));
      const inBox = x >= wx + 1 && x < wx + ww - 1 && y >= wy && y < wy + wh - 1;
      if (inArch && inBox) {
        const t = (y - wy) / wh;
        const c = mix(WINDOW, WINDOW_D, t);
        const hi = (x - wx) < 4 && (y - wy) < 6;
        put(x, y, hi ? 210 : c[0], hi ? 236 : c[1], hi ? 246 : c[2]);
      }
    }
  }
}

function heart(put, cx, cy, s, on) {
  const col = on ? HEART : [198, 196, 200];
  for (let y = -s; y <= s; y++) for (let x = -s; x <= s; x++) {
    const nx = x / s, ny = y / s;
    const left = (nx + 0.32) * (nx + 0.32) + (ny + 0.28) * (ny + 0.28) <= 0.28;
    const right = (nx - 0.32) * (nx - 0.32) + (ny + 0.28) * (ny + 0.28) <= 0.28;
    const point = ny > -0.05 && ny < 0.95 && Math.abs(nx) < 0.78 * (1 - ny);
    if (left || right || point) put(cx + x, cy + y, col[0], col[1], col[2]);
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

  for (let y = 0; y < H; y++) {
    const sky = skyAt(y, 0, H);
    for (let x = 0; x < W; x++) put(x, y, sky[0], sky[1], sky[2]);
  }

  // city silhouette — only behind the tower, never under the copy
  for (let x = 540; x < W; x++) {
    const k = (x / 38) | 0;
    const h = 70 + ((k * 17 + 9) % 110);
    const top = 520 - h;
    const col = (k % 3 === 1) ? CITY_D : CITY;
    for (let y = top; y < 560; y++) put(x, y, col[0], col[1], col[2]);
  }
  for (let y = 548; y < H; y++) {
    const g = mix(GROUND, [70, 86, 102], (y - 548) / 180);
    for (let x = 0; x < W; x++) put(x, y, g[0], g[1], g[2]);
  }

  function cloud(cx, cy, s) {
    for (let i = 0; i < 5; i++) {
      const ox = cx + (i - 2) * s * 0.55;
      const oy = cy + ((i % 2) ? -s * 0.18 : s * 0.08);
      const rr0 = s * (0.55 + (i === 2 ? 0.25 : 0));
      for (let y = oy - rr0; y <= oy + rr0; y++) for (let x = ox - rr0 * 1.4; x <= ox + rr0 * 1.4; x++) {
        const dx = (x - ox) / 1.4, dy = y - oy;
        if (dx * dx + dy * dy <= rr0 * rr0) put(x, y, 248, 252, 255);
      }
    }
  }
  cloud(500, 210, 28);
  cloud(1140, 240, 22);

  // TALL mid-game tower — slim like the real crane game, not a brick wall.
  const floors = [
    { x: 784, y: 560, w: 268, h: 54 },
    { x: 798, y: 508, w: 244, h: 52 },
    { x: 788, y: 458, w: 256, h: 50 },
    { x: 808, y: 410, w: 228, h: 48 },
    { x: 794, y: 364, w: 244, h: 46 },
    { x: 814, y: 320, w: 216, h: 44 },
    { x: 800, y: 278, w: 232, h: 42 },
    { x: 818, y: 238, w: 208, h: 40 },
    { x: 806, y: 200, w: 220, h: 38 },
    { x: 822, y: 164, w: 196, h: 36 },
    { x: 810, y: 130, w: 208, h: 34 },
  ];
  for (const b of floors) paintFloor(put, b.x, b.y, b.w, b.h, false);

  // dropping perfect floor
  paintFloor(put, 824, 64, 176, 32, true);

  // crane
  const hx = 912;
  for (let y = 0; y < 52; y++) {
    put(hx, y, ROPE[0], ROPE[1], ROPE[2]);
    put(hx + 1, y, HOOK[0], HOOK[1], HOOK[2]);
  }
  for (let y = 0; y < 22; y++) for (let x = hx - 14; x < hx + 16; x++) {
    const stripe = ((x + y) % 10) < 5;
    const c = stripe ? STRIPE_Y : STRIPE_K;
    put(x, y, c[0], c[1], c[2]);
  }

  // HUD in the top-right sky, clear of the dropping floor
  rr(put, 1020, 18, 1184, 64, 16, 255, 252, 246);
  drawText(put, 1034, 32, 'SCORE 475', 2, 120, 72, 48);
  heart(put, 1060, 86, 11, false);
  heart(put, 1094, 86, 11, false);
  heart(put, 1128, 86, 11, true);

  // left copy — the reason this version exists
  drawText(put, 48, 56, 'TOWER GAME', 8, 255, 255, 255);
  rr(put, 48, 150, 268, 214, 14, 255, 244, 230);
  rr(put, 284, 150, 504, 214, 14, 255, 228, 170);
  drawText(put, 64, 170, 'YOU  12F', 3, 214, 78, 64);
  drawText(put, 300, 170, 'SAM  9F', 3, 120, 72, 48);

  drawText(put, 48, 250, 'RACE A FRIEND', 5, 255, 255, 255);
  drawText(put, 48, 316, 'FROM ONE LINK', 5, 255, 214, 80);
  drawText(put, 48, 400, 'TAP TO DROP', 4, 255, 248, 220);
  drawText(put, 48, 456, 'TAP TO DROP', 4, 255, 248, 220);
  drawText(put, 48, 530, 'SCORE IN THE FILE', 3, 255, 252, 246);
  drawText(put, 48, 620, 'TALLEST TOWER WINS', 3, 255, 230, 140);

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
