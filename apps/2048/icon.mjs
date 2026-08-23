// Procedural 2048 icon: a cream rounded card holding a 2×2 close-up of the
// original grid, two 8-tiles sliding together into a 16. Pure Node,
// super-sample → box-downsample → small palette; deterministic so builds
// reproduce. screenshotPng() paints the 1200×720 store cover from the same
// colours — a real mid-game board with a race score, not an empty start.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CREAM = [250, 248, 239];
const INK = [119, 110, 101];
const GRID = [187, 173, 160];
const CELL = [205, 193, 180];
const GOLD = [237, 194, 46];
const TILE = {
  2:    { bg: [238, 228, 218], fg: [119, 110, 101] },
  4:    { bg: [237, 224, 200], fg: [119, 110, 101] },
  8:    { bg: [242, 177, 121], fg: [249, 246, 242] },
  16:   { bg: [245, 149, 99],  fg: [249, 246, 242] },
  32:   { bg: [246, 124, 95],  fg: [249, 246, 242] },
  64:   { bg: [246, 94, 59],   fg: [249, 246, 242] },
  128:  { bg: [237, 207, 114], fg: [249, 246, 242] },
  256:  { bg: [237, 204, 97],  fg: [249, 246, 242] },
  512:  { bg: [237, 200, 80],  fg: [249, 246, 242] },
  1024: { bg: [237, 197, 63],  fg: [249, 246, 242] },
  2048: { bg: [237, 194, 46],  fg: [249, 246, 242] },
};

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}
function rrPix(x, y, x0, y0, x1, y1, rad) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + rad), x1 - rad), cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
  if (x >= x0 + rad && x <= x1 - rad) return true;
  if (y >= y0 + rad && y <= y1 - rad) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= rad * rad;
}

function buildPalette() {
  const pal = [[0, 0, 0]];
  const bases = [CREAM, INK, GRID, CELL, GOLD];
  for (const v of Object.keys(TILE)) bases.push(TILE[v].bg, TILE[v].fg);
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

// 5×7 caps. Bit 4 is the left column.
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
  'J': [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
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
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
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

function tileAt(f) {
  // 2×2 close-up so the merge reads at Home Screen size: two 8s slide
  // together into a 16, a new 2 pops in. Tiny 4×4 digits vanish at 64px.
  const t = f / (FRAMES - 1);
  const mergeT = Math.min(1, t / 0.5);
  const slid = mergeT * mergeT * (3 - 2 * mergeT); // smoothstep col 0 → 1
  const merged = t > 0.5;
  const popT = Math.min(1, Math.max(0, (t - 0.5) / 0.28));
  const pop = merged ? 1 + 0.18 * Math.sin(popT * Math.PI) : 1;
  const tiles = [
    { c: 0, r: 1, v: 2, s: 1 },
    { c: 1, r: 1, v: 4, s: 1 },
  ];
  if (!merged) {
    tiles.push({ c: 1, r: 0, v: 8, s: 1 });
    tiles.push({ c: slid, r: 0, v: 8, s: 1 });
  } else {
    tiles.push({ c: 1, r: 0, v: 16, s: pop });
    if (t > 0.72) tiles.push({ c: 0, r: 0, v: 2, s: Math.min(1, (t - 0.72) / 0.18) });
  }
  return tiles;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 6, rad = 18;
  const gx0 = 16, gy0 = 16, gx1 = 112, gy1 = 112;
  const gap = 7;
  const inner = (gx1 - gx0 - gap) / 2;
  const tiles = tileAt(f);

  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = CREAM;
      if (rrPix(x, y, gx0 - 5, gy0 - 5, gx1 + 5, gy1 + 5, 10)) col = GRID;
      for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
        const x0 = gx0 + c * (inner + gap), y0 = gy0 + r * (inner + gap);
        if (rrPix(x, y, x0, y0, x0 + inner, y0 + inner, 5)) col = CELL;
      }
      for (let i = 0; i < tiles.length; i++) {
        const T = tiles[i], style = TILE[T.v];
        const cx = gx0 + T.c * (inner + gap) + inner / 2;
        const cy = gy0 + T.r * (inner + gap) + inner / 2;
        const half = (inner / 2) * T.s;
        if (rrPix(x, y, cx - half, cy - half, cx + half, cy + half, 5 * T.s)) col = style.bg;
      }
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }

  // Numbers, drawn after the board so they sit on the tiles. Super-sampled
  // via the same put-into-rgba path at SS.
  function put(x, y, r, g, b) {
    if (x < 0 || y < 0 || x >= OUT || y >= OUT) return;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      if (rgba[o + 3] < 0.5) continue;
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b;
    }
  }
  for (let i = 0; i < tiles.length; i++) {
    const T = tiles[i], style = TILE[T.v];
    if (T.s < 0.45) continue;
    const str = String(T.v);
    const scale = T.v >= 16 ? 3 : 4;
    const tw = str.length * 6 * scale - scale;
    const th = 7 * scale;
    const cx = gx0 + T.c * (inner + gap) + inner / 2;
    const cy = gy0 + T.r * (inner + gap) + inner / 2;
    drawText(put, Math.round(cx - tw / 2), Math.round(cy - th / 2), str, scale, style.fg[0], style.fg[1], style.fg[2]);
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

export function icon2048() {
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
  const rr = (x0, y0, x1, y1, rad, r, g, b) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
      const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
    }
  };

  fill(0, 0, W, H, 250, 248, 239);
  drawText(put, 56, 64, '2048', 12, 119, 110, 101);

  rr(56, 196, 278, 268, 16, 238, 228, 218);
  rr(294, 196, 540, 268, 16, 237, 224, 200);
  drawText(put, 76, 218, 'YOU  6124', 3, 246, 94, 59);
  drawText(put, 314, 218, 'SAM  4980', 3, 119, 110, 101);

  drawText(put, 56, 320, 'RACE A FRIEND', 4, 119, 110, 101);
  drawText(put, 56, 380, 'FROM ONE LINK', 4, 246, 94, 59);
  drawText(put, 56, 460, 'SAME STARTING TILES', 3, 187, 173, 160);
  drawText(put, 56, 514, 'FIRST TO 2048 WINS', 3, 187, 173, 160);
  drawText(put, 56, 590, 'SAVED IN THE FILE', 3, 119, 110, 101);

  // A real mid-game, not a colour chart: 1024 in the corner, 2s still around.
  const board = [
    [4, 2, 8, 16],
    [32, 8, 4, 2],
    [64, 16, 2, 32],
    [128, 4, 512, 1024],
  ];
  const bx = 600, by = 48, bw = 552, pad = 16, gap = 12;
  const cell = (bw - pad * 2 - gap * 3) / 4;
  rr(bx, by, bx + bw, by + bw, 16, 187, 173, 160);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const x0 = bx + pad + c * (cell + gap);
    const y0 = by + pad + r * (cell + gap);
    const v = board[r][c];
    const style = TILE[v];
    rr(x0, y0, x0 + cell, y0 + cell, 8, style.bg[0], style.bg[1], style.bg[2]);
    const str = String(v);
    const scale = v >= 1000 ? 4 : v >= 100 ? 5 : 6;
    const tw = str.length * 6 * scale - scale;
    const th = 7 * scale;
    drawText(put, Math.round(x0 + (cell - tw) / 2), Math.round(y0 + (cell - th) / 2), str, scale, style.fg[0], style.fg[1], style.fg[2]);
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
