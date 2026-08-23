// Procedural icon for Tower Defense: a blue rounded card holding a tiny
// grid, a green cannon, red blobs walking the path, a shot across the frames.
// Super-sample → box-downsample → small palette; deterministic so GIF builds
// reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [232, 244, 252];
const CARD_B = [196, 224, 240];
const INK = [11, 42, 68];
const GRID = [180, 210, 226];
const PATH = [255, 255, 255];
const BLOCK = [255, 204, 204];
const GREEN = [51, 153, 51];
const GREEN_D = [0, 102, 0];
const BLUE = [26, 116, 186];
const BLUE_L = [51, 102, 255];
const RED = [196, 48, 48];
const GOLD = [187, 141, 32];
const WALL = [120, 120, 120];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, INK, GRID, PATH, BLOCK, GREEN, GREEN_D, BLUE, BLUE_L, RED, GOLD, WALL]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.28).map(Math.round));
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
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}
function inCircle(x, y, cx, cy, r) {
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}

// Path cells on an 8×8 of the inner grid (icon space).
const PATH_CELLS = [
  [0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [2, 3], [3, 3], [4, 3],
  [4, 4], [4, 5], [5, 5], [6, 5], [6, 6], [6, 7], [7, 7],
];
const TOWERS = [
  { c: 1, r: 2, kind: 'cannon' },
  { c: 3, r: 4, kind: 'lmg' },
  { c: 5, r: 3, kind: 'cannon' },
  { c: 3, r: 1, kind: 'wall' },
];

function cellBox(c, r, ox, oy, gs) {
  return { x: ox + c * gs, y: oy + r * gs, gs };
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  const m = 6, rad = 18;
  const ox = 22, oy = 22, gs = 10.5, n = 8;

  const pathSet = new Set(PATH_CELLS.map(([c, r]) => c + ',' + r));
  const along = PATH_CELLS.length - 1;
  const monsters = [
    { u: (t * 0.85) % 1 },
    { u: (t * 0.85 + 0.33) % 1 },
    { u: (t * 0.85 + 0.66) % 1 },
  ];

  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 8) / 90)));
      const cx = Math.floor((x - ox) / gs), cy = Math.floor((y - oy) / gs);
      if (cx >= 0 && cy >= 0 && cx < n && cy < n) {
        const onPath = pathSet.has(cx + ',' + cy);
        col = onPath ? PATH : GRID;
        const lx = x - ox - cx * gs, ly = y - oy - cy * gs;
        if (lx < 0.6 || ly < 0.6) col = mix(col, INK, 0.08);
      }
      for (const T of TOWERS) {
        const b = cellBox(T.c, T.r, ox, oy, gs);
        const tx = b.x + gs / 2, ty = b.y + gs / 2;
        if (T.kind === 'wall') {
          if (x >= b.x + 1.5 && x <= b.x + gs - 1.5 && y >= b.y + 1.5 && y <= b.y + gs - 1.5) col = WALL;
        } else if (T.kind === 'cannon') {
          if (inCircle(x, y, tx, ty, gs * 0.38)) col = GREEN;
          if (inCircle(x, y, tx, ty, gs * 0.18)) col = GREEN_D;
        } else if (T.kind === 'lmg') {
          if (inCircle(x, y, tx, ty, gs * 0.28)) col = BLUE_L;
        }
      }
      for (const mo of monsters) {
        const idx = mo.u * along;
        const i0 = Math.floor(idx), i1 = Math.min(along, i0 + 1), u = idx - i0;
        const a0 = PATH_CELLS[i0], a1 = PATH_CELLS[i1];
        const mx = ox + (a0[0] + (a1[0] - a0[0]) * u + 0.5) * gs;
        const my = oy + (a0[1] + (a1[1] - a0[1]) * u + 0.5) * gs;
        if (inCircle(x, y, mx, my, 2.4)) col = RED;
      }
      // shot from first cannon toward the lead monster
      const lead = monsters[0];
      const idx = lead.u * along;
      const i0 = Math.floor(idx), i1 = Math.min(along, i0 + 1), u = idx - i0;
      const a0 = PATH_CELLS[i0], a1 = PATH_CELLS[i1];
      const mx = ox + (a0[0] + (a1[0] - a0[0]) * u + 0.5) * gs;
      const my = oy + (a0[1] + (a1[1] - a0[1]) * u + 0.5) * gs;
      const c0 = TOWERS[0];
      const sx0 = ox + (c0.c + 0.5) * gs, sy0 = oy + (c0.r + 0.5) * gs;
      const shotU = (t * 2) % 1;
      const qx = sx0 + (mx - sx0) * shotU, qy = sy0 + (my - sy0) * shotU;
      if (inCircle(x, y, qx, qy, 1.3)) col = GOLD;
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, aa = 0, n2 = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; aa += rgba[o + 3];
    }
    if (aa / n2 < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / n2, g / n2, b / n2);
  }
  return idx;
}

export function towerDefenseIcon() {
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
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'Q': [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
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
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
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
  const circ = (cx, cy, rad, r, g, b) => {
    const x0 = Math.floor(cx - rad), x1 = Math.ceil(cx + rad);
    const y0 = Math.floor(cy - rad), y1 = Math.ceil(cy + rad);
    const r2 = rad * rad;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r2) put(x, y, r, g, b);
    }
  };

  fill(0, 0, W, H, 26, 116, 186);
  fill(40, 40, 1160, 680, 224, 244, 252);

  drawText(put, 64, 64, 'TOWER DEFENSE', 6, 26, 116, 186);
  drawText(put, 64, 140, 'PICK A TOWER', 4, 11, 42, 68);
  drawText(put, 64, 190, 'TAP A SQUARE', 4, 11, 42, 68);
  fill(64, 250, 420, 302, 26, 116, 186);
  drawText(put, 80, 262, 'SHARE THE MAP', 3, 232, 244, 252);
  drawText(put, 64, 330, 'COOP OVER A MEETING', 3, 51, 153, 51);
  drawText(put, 64, 390, 'EACH PLACES THEIR OWN', 3, 11, 42, 68);
  drawText(put, 64, 600, 'UNOFFICIAL PORT', 3, 120, 150, 170);

  const gs = 36, ox = 620, oy = 80, n = 14;
  const path = new Set();
  for (let i = 0; i < 8; i++) path.add(i + ',0');
  for (let i = 0; i < 6; i++) path.add('7,' + i);
  for (let i = 7; i < 14; i++) path.add(i + ',5');
  for (let i = 5; i < 14; i++) path.add('13,' + i);

  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const x0 = ox + c * gs, y0 = oy + r * gs;
    const on = path.has(c + ',' + r);
    fill(x0, y0, x0 + gs - 1, y0 + gs - 1, on ? 255 : 210, on ? 255 : 226, on ? 255 : 236);
    fill(x0, y0, x0 + gs, y0 + 1, 180, 210, 226);
    fill(x0, y0, x0 + 1, y0 + gs, 180, 210, 226);
  }
  // entrance / exit
  circ(ox + gs / 2, oy + gs / 2, 10, 255, 255, 255);
  circ(ox + 13 * gs + gs / 2, oy + 13 * gs + gs / 2, 10, 80, 80, 80);

  function tower(c, r, kind) {
    const cx = ox + c * gs + gs / 2, cy = oy + r * gs + gs / 2;
    if (kind === 'wall') fill(cx - 10, cy - 10, cx + 10, cy + 10, 120, 120, 120);
    else if (kind === 'cannon') { circ(cx, cy, 14, 51, 153, 51); circ(cx, cy, 6, 0, 102, 0); }
    else if (kind === 'lmg') { circ(cx, cy, 10, 51, 102, 255); circ(cx, cy, 5, 80, 80, 180); }
    else if (kind === 'hmg') { circ(cx, cy, 14, 180, 80, 40); circ(cx, cy, 6, 120, 40, 20); }
  }
  tower(2, 2, 'cannon');
  tower(5, 1, 'lmg');
  tower(6, 3, 'wall');
  tower(9, 4, 'cannon');
  tower(8, 7, 'hmg');
  tower(11, 6, 'lmg');
  tower(12, 9, 'cannon');
  tower(10, 11, 'wall');

  const blobs = [[3, 0], [7, 2], [10, 5], [13, 8], [13, 12]];
  for (const [c, r] of blobs) circ(ox + c * gs + gs / 2, oy + r * gs + gs / 2, 8, 196, 48, 48);

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
