// Procedural Grid Garden icon: a 5×5 dirt bed, a carrot, water filling that
// cell. Reads at 64px. Pure Node — super-sample → box-downsample.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 10;

const CARD_A = [78, 150, 62];
const CARD_B = [52, 110, 44];
const DIRT = [83, 61, 31];
const DIRT_L = [131, 107, 50];
const WOOD = [109, 87, 32];
const CARROT = [245, 166, 35];
const CARROT_D = [219, 147, 29];
const LEAF = [122, 192, 45];
const WATER = [81, 140, 179];
const WATER_L = [180, 220, 235];
const INK = [28, 22, 12];

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
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, DIRT, DIRT_L, WOOD, CARROT, CARROT_D, LEAF, WATER, WATER_L, INK]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
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

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 6, rad = 20;
  const gridX = 18, gridY = 22, cell = 18.4, n = 5;
  const fill = Math.min(1, (f + 0.2) / 7);
  const cx0 = gridX + 2 * cell, cy0 = gridY + 1 * cell;

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, m, rad)) continue;
      let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      if (x >= gridX - 3 && x <= gridX + n * cell + 3 &&
          y >= gridY - 3 && y <= gridY + n * cell + 3) col = WOOD;
      const gx = x - gridX, gy = y - gridY;
      if (gx >= 0 && gy >= 0 && gx < n * cell && gy < n * cell) {
        const ci = Math.floor(gx / cell), ri = Math.floor(gy / cell);
        const lx = gx - ci * cell, ly = gy - ri * cell;
        col = ((ci + ri) % 2) ? DIRT_L : DIRT;
        if (lx < 0.7 || ly < 0.7) col = mix(col, WOOD, 0.35);
        if (ci === 2 && ri === 1) {
          const watered = ly / cell < fill;
          if (watered) col = mix(WATER, WATER_L, (Math.sin((x + y + f) * 0.4) + 1) * 0.25);
          const mx = gridX + 2 * cell + cell / 2;
          const my = gridY + 1 * cell + cell * 0.62;
          const dx = x - mx, dy = y - my;
          const carrot = (dy > -6 && dy < 6 && Math.abs(dx) < (6 - Math.abs(dy) * 0.45));
          if (carrot) col = dy > 2 ? CARROT_D : CARROT;
          const leafY = my - 6.2, leafX = mx;
          if (Math.hypot(x - leafX, y - leafY) < 3.2 && y < leafY + 1.4) col = LEAF;
          if (Math.hypot(x - (leafX - 2.4), y - (leafY + 0.6)) < 2.2) col = LEAF;
          if (Math.hypot(x - (leafX + 2.4), y - (leafY + 0.6)) < 2.2) col = LEAF;
        }
      }
      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }
  void cx0; void cy0;

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0, nss = SS * SS;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
        r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
      }
      if (a / nss < 0.5) { idx[y * OUT + x] = 0; continue; }
      idx[y * OUT + x] = nearest(pal, r / nss, g / nss, b / nss);
    }
  }
  return idx;
}

export function gardenIcon() {
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
    minCodeSize: 6, frames, delayCs: 12, transparentIndex: 0
  };
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

const GLYPHS = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  ':': [0, 0b00100, 0, 0, 0, 0b00100, 0],
  '/': [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  '%': [0b11001, 0b11010, 0b00010, 0b00100, 0b01000, 0b01011, 0b10011],
  '#': [0b01010, 0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0b01010],
  '{': [0b00110, 0b01000, 0b01000, 0b10000, 0b01000, 0b01000, 0b00110],
  '}': [0b01100, 0b00010, 0b00010, 0b00001, 0b00010, 0b00010, 0b01100],
  ';': [0, 0b00100, 0, 0, 0, 0b00100, 0b01000],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  3: [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  5: [0b11111, 0b10000, 0b10000, 0b11110, 0b00001, 0b10001, 0b01110],
  6: [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
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

function fillRect(put, x, y, w, h, r, g, b) {
  const x1 = Math.floor(x), y1 = Math.floor(y);
  const x2 = Math.ceil(x + w), y2 = Math.ceil(y + h);
  for (let yy = y1; yy < y2; yy++) for (let xx = x1; xx < x2; xx++) put(xx, yy, r, g, b);
}

function carrot(put, cx, cy, s) {
  for (let y = -s * 1.1; y <= s * 1.15; y++) {
    const half = (s * 0.7) * (1 - Math.abs(y) / (s * 1.2));
    for (let x = -half; x <= half; x++) {
      const shade = y > s * 0.25 ? CARROT_D : CARROT;
      put(cx + x, cy + y, shade[0], shade[1], shade[2]);
    }
  }
  for (let i = -1; i <= 1; i++) {
    const a = i * 0.7;
    for (let t = 0; t < s * 0.9; t++) {
      put(cx + Math.sin(a) * t * 0.45, cy - s * 1.05 - t * 0.55,
        LEAF[0], LEAF[1], LEAF[2]);
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
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = y / H;
      put(x, y, mix(CARD_A, CARD_B, t)[0], mix(CARD_A, CARD_B, t)[1], mix(CARD_A, CARD_B, t)[2]);
    }
  }

  drawText(put, 48, 36, 'GRID GARDEN', 5, 255, 255, 255);
  drawText(put, 48, 86, 'LEVEL 16 OF 28', 3, 230, 245, 220);

  const lines = [
    'WRITE GRID-AREA TO WATER',
    'THE WIDE BED OF CARROTS.',
    '',
    'GRID-AREA: 1 / 2 / 4 / 6',
  ];
  lines.forEach((ln, i) => drawText(put, 48, 140 + i * 28, ln, 2, 236, 244, 220));

  fillRect(put, 48, 280, 470, 360, 224, 224, 224);
  fillRect(put, 48, 280, 36, 360, 153, 153, 153);
  for (let i = 0; i < 14; i++) {
    drawText(put, 54, 292 + i * 24, String(i + 1), 2, 213, 213, 213);
  }
  const code = [
    '#GARDEN {',
    '  DISPLAY: GRID;',
    '  GRID-TEMPLATE-COLUMNS:',
    '    20% 20% 20% 20% 20%;',
    '  GRID-TEMPLATE-ROWS:',
    '    20% 20% 20% 20% 20%;',
    '}',
    '',
    '#WATER {',
    '  GRID-AREA: 1 / 2 / 4 / 6;',
    '}',
  ];
  code.forEach((ln, i) => drawText(put, 96, 292 + i * 24, ln, 2, 40, 40, 40));
  fillRect(put, 390, 590, 110, 36, 218, 147, 30);
  drawText(put, 412, 598, 'NEXT', 3, 255, 255, 255);

  const bx = 560, by = 40, bs = 600, pad = 14;
  fillRect(put, bx, by, bs, bs, WOOD[0], WOOD[1], WOOD[2]);
  const inner = bs - pad * 2, cell = inner / 5;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const x = bx + pad + c * cell, y = by + pad + r * cell;
      const dirt = (c + r) % 2 ? DIRT_L : DIRT;
      fillRect(put, x + 1, y + 1, cell - 2, cell - 2, dirt[0], dirt[1], dirt[2]);
    }
  }
  const wx = bx + pad + 1 * cell, wy = by + pad + 0 * cell;
  const ww = 4 * cell - 2, wh = 3 * cell - 2;
  for (let y = 0; y < wh; y++) {
    for (let x = 0; x < ww; x++) {
      const ripple = (Math.sin((x + y) * 0.08) + 1) * 0.5;
      const col = mix(WATER, WATER_L, 0.15 + ripple * 0.25);
      put(wx + 1 + x, wy + 1 + y, col[0], col[1], col[2]);
    }
  }
  for (let r = 0; r < 3; r++) {
    for (let c = 1; c < 5; c++) {
      carrot(put,
        bx + pad + c * cell + cell * 0.5,
        by + pad + r * cell + cell * 0.58,
        22);
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
