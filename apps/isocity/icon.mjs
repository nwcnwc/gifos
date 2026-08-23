// Procedural IsoCity icon: a cream card holding a tiny isometric city, a
// red tower rising across the frames. Pure Node, super-sample → box-downsample
// → small palette; deterministic so builds reproduce. screenshotPng() paints
// the 1200×720 store cover from the same colours.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CREAM = [250, 246, 238];
const SKY = [214, 232, 242];
const INK = [90, 74, 64];
const GROUND = [232, 220, 196];
const GROUND_L = [214, 196, 164];
const GROUND_R = [186, 166, 132];
const ROAD = [120, 120, 124];
const ROAD_L = [96, 96, 100];
const GRASS = [142, 186, 90];
const GRASS_L = [110, 150, 70];
const WATER = [110, 180, 212];
const RED = [196, 82, 74];
const RED_L = [168, 62, 56];
const RED_T = [220, 120, 110];
const BEIGE = [232, 210, 170];
const BEIGE_L = [200, 176, 136];
const BEIGE_T = [246, 232, 200];
const ACCENT = [176, 83, 85];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  const bases = [CREAM, SKY, INK, GROUND, GROUND_L, GROUND_R, ROAD, ROAD_L, GRASS, GRASS_L, WATER, RED, RED_L, RED_T, BEIGE, BEIGE_L, BEIGE_T, ACCENT];
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
    const p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b, d = dr * dr + dg * dg + db * db;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

function inDiamond(x, y, cx, cy, hw, hh) {
  return Math.abs(x - cx) / hw + Math.abs(y - cy) / hh <= 1;
}

function isoBlock(x, y, cx, baseY, hw, hh, h, top, left, right) {
  const topCy = baseY - h;
  if (inDiamond(x, y, cx, topCy, hw, hh)) return top;
  const leftX0 = cx - hw, leftX1 = cx;
  if (x >= leftX0 && x <= leftX1 && y >= topCy && y <= baseY + hh) {
    const t = (x - leftX0) / hw;
    const yTop = topCy - hh + t * hh;
    const yBot = baseY - hh + t * hh + hh;
    if (y >= yTop && y <= yBot + hh * (1 - t) && y <= baseY + hh * t) {
      const yTop2 = topCy + (x - leftX0) / hw * hh;
      const yBot2 = yTop2 + h;
      if (y >= yTop2 && y <= yBot2) return left;
    }
  }
  const rightX0 = cx, rightX1 = cx + hw;
  if (x >= rightX0 && x <= rightX1 && y >= topCy && y <= baseY + hh) {
    const t = (rightX1 - x) / hw;
    const yTop2 = topCy + (rightX1 - x) / hw * hh;
    const yBot2 = yTop2 + h;
    if (y >= yTop2 && y <= yBot2) return right;
  }
  return null;
}

function isoGround(x, y, cx, cy, hw, hh, top, left, right) {
  const h = hh * 0.35;
  return isoBlock(x, y, cx, cy + h, hw, hh, h, top, left, right);
}

function tileCenter(col, row, ox, oy, hw, hh) {
  return { x: ox + (col - row) * hw, y: oy + (col + row) * hh };
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 6, rad = 18;
  const t = f / (FRAMES - 1);
  const rise = Math.min(1, t / 0.7);
  const hw = 11, hh = 5.5;
  const ox = 64, oy = 46;
  const tiles = [
    { c: 0, r: 0, kind: 'g' }, { c: 1, r: 0, kind: 'g' }, { c: 2, r: 0, kind: 'w' }, { c: 3, r: 0, kind: 'g' },
    { c: 0, r: 1, kind: 'r' }, { c: 1, r: 1, kind: 'r' }, { c: 2, r: 1, kind: 'r' }, { c: 3, r: 1, kind: 'g' },
    { c: 0, r: 2, kind: 'g' }, { c: 1, r: 2, kind: 'b' }, { c: 2, r: 2, kind: 'r' }, { c: 3, r: 2, kind: 'g' },
    { c: 0, r: 3, kind: 'g' }, { c: 1, r: 3, kind: 'g' }, { c: 2, r: 3, kind: 't' }, { c: 3, r: 3, kind: 'g' },
  ];
  const towerH = 6 + rise * 22;

  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(SKY, CREAM, Math.max(0, Math.min(1, (y - 8) / 90)));
      for (let i = tiles.length - 1; i >= 0; i--) {
        const T = tiles[i];
        const p = tileCenter(T.c, T.r, ox, oy, hw, hh);
        let hit = null;
        if (T.kind === 'g') hit = isoGround(x, y, p.x, p.y, hw, hh, GRASS, GRASS_L, mix(GRASS_L, [0, 0, 0], 0.15));
        else if (T.kind === 'w') hit = isoGround(x, y, p.x, p.y, hw, hh, WATER, mix(WATER, [0, 40, 60], 0.25), mix(WATER, [0, 20, 40], 0.4));
        else if (T.kind === 'r') hit = isoGround(x, y, p.x, p.y, hw, hh, ROAD, ROAD_L, mix(ROAD_L, [0, 0, 0], 0.2));
        else if (T.kind === 'b') {
          hit = isoGround(x, y, p.x, p.y, hw, hh, GROUND, GROUND_L, GROUND_R);
          const b = isoBlock(x, y, p.x, p.y, hw * 0.72, hh * 0.72, 16, BEIGE_T, BEIGE, BEIGE_L);
          if (b) hit = b;
        } else if (T.kind === 't') {
          hit = isoGround(x, y, p.x, p.y, hw, hh, GROUND, GROUND_L, GROUND_R);
          const b = isoBlock(x, y, p.x, p.y, hw * 0.7, hh * 0.7, towerH, RED_T, RED, RED_L);
          if (b) hit = b;
        }
        if (hit) col = hit;
      }
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, aa = 0, n = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; aa += rgba[o + 3];
    }
    if (aa / n < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}

export function isocityIcon() {
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
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
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

export function screenshotPng() {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };
  const fill = (x0, y0, x1, y1, r, g, b) => {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    x1 = Math.min(W, x1 | 0); y1 = Math.min(H, y1 | 0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, r, g, b);
  };

  fill(0, 0, W, H, 232, 244, 250);
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const c = mix([214, 232, 242], [250, 246, 238], t);
    for (let x = 0; x < W; x++) put(x, y, c[0], c[1], c[2]);
  }

  drawText(put, 48, 48, 'ISOCITY', 10, 176, 83, 85);
  drawText(put, 48, 140, 'A TINY CITY', 4, 90, 74, 64);
  drawText(put, 48, 190, 'TAP TO PLACE TILES', 3, 120, 120, 124);
  fill(48, 250, 320, 302, 176, 83, 85);
  drawText(put, 64, 262, 'SHARE THE MAP', 3, 250, 246, 238);
  drawText(put, 48, 330, 'OR COMPARE CITIES', 3, 90, 74, 64);
  drawText(put, 48, 390, 'NO BUDGET  NO SCORE', 3, 142, 186, 90);
  drawText(put, 48, 640, 'UNOFFICIAL PORT', 3, 186, 166, 132);

  const hw = 46, hh = 23;
  const ox = 820, oy = 180;
  function diamond(cx, cy, tw, th, r, g, b) {
    const x0 = Math.floor(cx - tw), x1 = Math.ceil(cx + tw);
    const y0 = Math.floor(cy - th), y1 = Math.ceil(cy + th);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (Math.abs(x - cx) / tw + Math.abs(y - cy) / th <= 1) put(x, y, r, g, b);
    }
  }
  function block(cx, baseY, tw, th, h, top, left, right) {
    for (let y = Math.floor(baseY - h - th); y <= Math.ceil(baseY + th); y++) {
      for (let x = Math.floor(cx - tw); x <= Math.ceil(cx + tw); x++) {
        const col = isoBlock(x, y, cx, baseY, tw, th, h, top, left, right);
        if (col) put(x, y, col[0], col[1], col[2]);
      }
    }
  }
  const city = [
    [0, 0, 'g'], [1, 0, 'g'], [2, 0, 'w'], [3, 0, 'g'], [4, 0, 'g'],
    [0, 1, 'rd'], [1, 1, 'rd'], [2, 1, 'rd'], [3, 1, 'g'], [4, 1, 'g'],
    [0, 2, 'g'], [1, 2, 'b'], [2, 2, 'rd'], [3, 2, 'b'], [4, 2, 'g'],
    [0, 3, 'g'], [1, 3, 'g'], [2, 3, 't'], [3, 3, 'g'], [4, 3, 'b'],
    [0, 4, 'g'], [1, 4, 'g'], [2, 4, 'rd'], [3, 4, 'g'], [4, 4, 'g'],
  ];
  city.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
  for (const T of city) {
    const p = tileCenter(T[0], T[1], ox, oy, hw, hh);
    if (T[2] === 'g') {
      diamond(p.x, p.y, hw, hh, GRASS[0], GRASS[1], GRASS[2]);
    } else if (T[2] === 'w') {
      diamond(p.x, p.y, hw, hh, WATER[0], WATER[1], WATER[2]);
    } else if (T[2] === 'rd') {
      diamond(p.x, p.y, hw, hh, ROAD[0], ROAD[1], ROAD[2]);
    } else if (T[2] === 'b') {
      diamond(p.x, p.y, hw, hh, GROUND[0], GROUND[1], GROUND[2]);
      block(p.x, p.y, hw * 0.72, hh * 0.72, 48, BEIGE_T, BEIGE, BEIGE_L);
    } else if (T[2] === 't') {
      diamond(p.x, p.y, hw, hh, GROUND[0], GROUND[1], GROUND[2]);
      block(p.x, p.y, hw * 0.7, hh * 0.7, 92, RED_T, RED, RED_L);
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
