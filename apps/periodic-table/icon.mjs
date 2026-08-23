// Procedural icon: a few coloured element cells, Au flashing.
// Demonstrates a table, not a generic flask. Pure Node, super-sample.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 10;

const CARD = [16, 16, 24];
const FG = [242, 242, 246];
const ALK = [196, 107, 255];
const AE = [123, 140, 255];
const TR = [61, 206, 122];
const NM = [255, 78, 200];
const NG = [255, 77, 109];
const HL = [62, 198, 255];
const AU = [232, 180, 60];
const AU2 = [255, 230, 140];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, FG, ALK, AE, TR, NM, NG, HL, AU, AU2]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
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
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

const GLYPHS = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '6': [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
};

function stampGlyph(rgba, x0, y0, ch, s, col, a) {
  const gph = GLYPHS[ch];
  if (!gph) return;
  for (let row = 0; row < 7; row++) for (let colb = 0; colb < 5; colb++) {
    if (!(gph[row] & (1 << (4 - colb)))) continue;
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
      const x = ((x0 + colb * s + dx) * SS) | 0;
      const y = ((y0 + row * s + dy) * SS) | 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const px = x + sx, py = y + sy;
        if (px < 0 || py < 0 || px >= RW || py >= RW) continue;
        const o = (py * RW + px) * 4;
        rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = a;
      }
    }
  }
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 18;
  const t = f / (FRAMES - 1);
  const pulse = 0.45 + 0.55 * Math.sin(t * Math.PI);
  // 3×3 of real cells: H C O / Fe Au Ag / He Ne F  — Au flashes
  const cells = [
    { s: 'H',  c: NM, r: 0, k: 0 },
    { s: 'C',  c: NM, r: 0, k: 1 },
    { s: 'O',  c: NM, r: 0, k: 2 },
    { s: 'FE', c: TR, r: 1, k: 0 },
    { s: 'AU', c: mix(AU, AU2, pulse), r: 1, k: 1, flash: 1 },
    { s: 'AG', c: TR, r: 1, k: 2 },
    { s: 'HE', c: NG, r: 2, k: 0 },
    { s: 'NE', c: NG, r: 2, k: 1 },
    { s: 'F',  c: HL, r: 2, k: 2 },
  ];
  const bx = 18, by = 20, gap = 4, cell = 28;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = CARD.slice();
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }
  for (const celld of cells) {
    const x0 = bx + celld.k * (cell + gap);
    const y0 = by + celld.r * (cell + gap);
    const bg = mix([18, 18, 26], celld.c, 0.22);
    for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (x < x0 || x > x0 + cell || y < y0 || y > y0 + cell) continue;
      const o = (py * RW + px) * 4;
      let col = bg.slice();
      if (y > y0 + cell - 3) col = celld.c.slice();
      if (celld.flash) {
        const cx = x0 + cell / 2, cy = y0 + cell / 2;
        const d = Math.hypot(x - cx, y - cy);
        if (d < 16) col = mix(col, celld.c, 0.35 + pulse * 0.4);
      }
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
    const gs = celld.s.length > 1 ? 2 : 3;
    const tw = celld.s.length * 6 * gs;
    const tx = x0 + Math.max(1, (cell - tw) / 2);
    const ty = y0 + 10;
    for (let i = 0; i < celld.s.length; i++) {
      stampGlyph(rgba, tx + i * 6 * gs, ty, celld.s[i], gs, celld.flash ? mix(AU2, [255, 255, 255], pulse) : FG, 1);
    }
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0, nss = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
    }
    if (a / nss < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / nss, g / nss, b / nss);
  }
  return idx;
}

export function periodicTableIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 12, transparentIndex: 0 };
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

const ALL = {
  ...GLYPHS,
  B: GLYPHS.B, P: GLYPHS.P, K: GLYPHS.K, V: GLYPHS.V, Y: GLYPHS.Y, W: GLYPHS.W,
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
};

function catOf(z) {
  if (z >= 57 && z <= 71) return 'lanthanide';
  if (z >= 89 && z <= 103) return 'actinide';
  const alkali = { 3: 1, 11: 1, 19: 1, 37: 1, 55: 1, 87: 1 };
  const ae = { 4: 1, 12: 1, 20: 1, 38: 1, 56: 1, 88: 1 };
  const noble = { 2: 1, 10: 1, 18: 1, 36: 1, 54: 1, 86: 1, 118: 1 };
  const halogen = { 9: 1, 17: 1, 35: 1, 53: 1, 85: 1, 117: 1 };
  const metalloid = { 5: 1, 14: 1, 32: 1, 33: 1, 51: 1, 52: 1, 84: 1 };
  const nonmetal = { 1: 1, 6: 1, 7: 1, 8: 1, 15: 1, 16: 1, 34: 1 };
  if (alkali[z]) return 'alkali';
  if (ae[z]) return 'alkaline-earth';
  if (noble[z]) return 'noble';
  if (halogen[z]) return 'halogen';
  if (metalloid[z]) return 'metalloid';
  if (nonmetal[z]) return 'nonmetal';
  function groupOf(n) {
    if (n === 1) return 1;
    if (n === 2) return 18;
    if (n >= 3 && n <= 4) return n - 2;
    if (n >= 5 && n <= 10) return n + 8;
    if (n >= 11 && n <= 12) return n - 10;
    if (n >= 13 && n <= 18) return n;
    if (n >= 19 && n <= 36) return n - 18;
    if (n >= 37 && n <= 54) return n - 36;
    if (n === 55 || n === 56) return n - 54;
    if (n >= 57 && n <= 71) return 0;
    if (n >= 72 && n <= 86) return n - 68;
    if (n === 87 || n === 88) return n - 86;
    if (n >= 89 && n <= 103) return 0;
    if (n >= 104 && n <= 118) return n - 100;
    return 0;
  }
  const g = groupOf(z);
  if (g >= 3 && g <= 12) return 'transition';
  return 'post-transition';
}
function groupOf(z) {
  if (z === 1) return 1;
  if (z === 2) return 18;
  if (z >= 3 && z <= 4) return z - 2;
  if (z >= 5 && z <= 10) return z + 8;
  if (z >= 11 && z <= 12) return z - 10;
  if (z >= 13 && z <= 18) return z;
  if (z >= 19 && z <= 36) return z - 18;
  if (z >= 37 && z <= 54) return z - 36;
  if (z === 55 || z === 56) return z - 54;
  if (z >= 57 && z <= 71) return 0;
  if (z >= 72 && z <= 86) return z - 68;
  if (z === 87 || z === 88) return z - 86;
  if (z >= 89 && z <= 103) return 0;
  if (z >= 104 && z <= 118) return z - 100;
  return 0;
}
function cellOf(z) {
  if (z >= 57 && z <= 71) return { r: 7, c: (z - 57) + 2 };
  if (z >= 89 && z <= 103) return { r: 8, c: (z - 89) + 2 };
  const g = groupOf(z);
  const period = z <= 2 ? 1 : z <= 10 ? 2 : z <= 18 ? 3 : z <= 36 ? 4 : z <= 54 ? 5 : z <= 86 ? 6 : 7;
  return { r: period - 1, c: g - 1 };
}

const CATCOL = {
  alkali: [196, 107, 255],
  'alkaline-earth': [123, 140, 255],
  transition: [61, 206, 122],
  'post-transition': [46, 201, 212],
  metalloid: [212, 192, 74],
  nonmetal: [255, 78, 200],
  halogen: [62, 198, 255],
  noble: [255, 77, 109],
  lanthanide: [230, 200, 74],
  actinide: [255, 153, 0],
};

export function screenshotPng() {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b, a) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };
  const fill = (x0, y0, x1, y1, r, g, b) => {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    x1 = Math.min(W, x1 | 0); y1 = Math.min(H, y1 | 0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, r, g, b);
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 10, 10, 15);

  function drawText(x, y, str, s, r, g, b) {
    let px = x;
    for (const ch of str.toUpperCase()) {
      const gph = ALL[ch];
      if (!gph) { px += 6 * s; continue; }
      for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
        if (gph[row] & (1 << (4 - col))) {
          for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
            put(px + col * s + dx, y + row * s + dy, r, g, b);
          }
        }
      }
      px += 6 * s;
    }
  }

  const SYMS = {
    1: 'H', 2: 'HE', 6: 'C', 8: 'O', 26: 'FE', 79: 'AU', 82: 'PB', 118: 'OG'
  };
  const cell = 36, gap = 3, bx = 28, by = 64;
  for (let z = 1; z <= 118; z++) {
    const p = cellOf(z);
    const x0 = bx + p.c * (cell + gap);
    const y0 = by + p.r * (cell + gap);
    const cat = catOf(z);
    const col = CATCOL[cat] || [80, 80, 90];
    const bg = mix([18, 18, 26], col, z === 79 ? 0.55 : 0.28).map(Math.round);
    fill(x0, y0, x0 + cell, y0 + cell, bg[0], bg[1], bg[2]);
    fill(x0, y0 + cell - 3, x0 + cell, y0 + cell, col[0], col[1], col[2]);
    const lab = SYMS[z];
    if (lab) {
      const gs = lab.length > 1 ? 2 : 3;
      const tw = lab.length * 6 * gs;
      drawText(x0 + Math.max(2, (cell - tw) / 2), y0 + 10, lab, gs, 242, 242, 246);
    }
  }
  // Gold (79) ring
  const gp = cellOf(79);
  const gx = bx + gp.c * (cell + gap) + cell / 2;
  const gy = by + gp.r * (cell + gap) + cell / 2;
  for (let dy = -22; dy <= 22; dy++) for (let dx = -22; dx <= 22; dx++) {
    const d = Math.hypot(dx, dy);
    if (d > 18 && d <= 22) put(gx + dx, gy + dy, 232, 180, 60);
  }

  const chips = [
    ['ALKALI', 196, 107, 255],
    ['NOBLE', 255, 77, 109],
    ['TRANSITION', 61, 206, 122],
    ['HALOGEN', 62, 198, 255],
  ];
  let chipX = 28;
  const chipY = by + 9 * (cell + gap) + 16;
  for (const [lab, r, g, b] of chips) {
    const w = lab.length * 18 + 28;
    fill(chipX, chipY, chipX + w, chipY + 36, r, g, b);
    drawText(chipX + 12, chipY + 10, lab, 2, 10, 10, 15);
    chipX += w + 10;
  }

  // Gold card
  const cx0 = 760, cy0 = 80, cx1 = 1172, cy1 = 640;
  fill(cx0, cy0, cx1, cy1, 20, 20, 28);
  fill(cx0, cy0, cx1, cy0 + 8, 232, 180, 60);
  drawText(cx0 + 36, cy0 + 40, 'AU', 14, 232, 180, 60);
  drawText(cx0 + 36, cy0 + 168, 'GOLD', 7, 242, 242, 246);
  drawText(cx0 + 36, cy0 + 250, 'NUMBER  79', 3, 154, 160, 180);
  drawText(cx0 + 36, cy0 + 304, 'MASS  196.97', 3, 154, 160, 180);
  drawText(cx0 + 36, cy0 + 358, 'TRANSITION METAL', 3, 61, 206, 122);
  drawText(cx0 + 36, cy0 + 430, '2 8 18 32 18 1', 3, 232, 180, 60);
  drawText(28, 18, 'PERIODIC TABLE', 3, 200, 200, 210);

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
