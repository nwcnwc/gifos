// Procedural Falling Blocks icon: a dark rounded card holding a well.
// Across the frames a T drops, LOCKS into a gap, the full line FLASHES
// and CLEARS, and the stack drops — a loop that reads at 64px. Pure Node,
// super-sample → box-downsample → small palette; deterministic so builds
// reproduce. screenshotPng() paints the 1200×720 store cover: two mid-game
// wells with a real stack, not an empty first boot.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 16;

const CARD = [18, 22, 28];
const CARD_D = [10, 12, 16];
const WELL = [8, 10, 14];
const GRID = [28, 34, 42];
const INK = [230, 236, 240];
const CYAN = [0, 196, 204];
const FLASH = [240, 252, 255];
const SHAPE = [
  [0, 220, 220],
  [255, 140, 0],
  [50, 90, 220],
  [240, 210, 0],
  [220, 50, 50],
  [40, 170, 70],
  [170, 70, 200],
];

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
  const bases = [CARD, CARD_D, WELL, GRID, INK, CYAN, FLASH, ...SHAPE];
  for (const b of bases) {
    pal.push(b.map(Math.round));
    pal.push(mix(b, [255, 255, 255], 0.22).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.28).map(Math.round));
  }
  pal.push([255, 255, 255]);
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

// Settled pile in a 10×12 well, rows from the TOP. Bottom row 11 has a
// 3-wide gap at cols 4–6 for the T to lock into; row 10 is open at col 5
// for the stem. After the line clears, everything above row 11 drops.
const SETTLED = [
  [0, 11, 4], [1, 11, 4], [2, 11, 5], [3, 11, 5], [7, 11, 0], [8, 11, 0], [9, 11, 1],
  [0, 10, 2], [1, 10, 2], [2, 10, 3], [3, 10, 3], [4, 10, 1], [6, 10, 6], [7, 10, 1], [8, 10, 6], [9, 10, 6],
  [1, 9, 0], [2, 9, 0], [3, 9, 5], [7, 9, 4], [8, 9, 4], [9, 9, 2],
  [2, 8, 6], [8, 8, 3], [9, 8, 3],
];

function fallingT(y) {
  return [
    { c: 5, r: y, v: 6 },
    { c: 4, r: y + 1, v: 6 },
    { c: 5, r: y + 1, v: 6 },
    { c: 6, r: y + 1, v: 6 },
  ];
}

function cellsForFrame(f) {
  // 0–8 fall (T bar lands on row 11 at f=8), 9 lock flash, 10–11 line flash,
  // 12 line gone, 13–15 stack dropped + a new T peeking in for the loop.
  const cells = [];
  const LOCK_Y = 10;
  if (f <= 8) {
    const y = 1 + (LOCK_Y - 1) * (f / 8);
    for (const p of SETTLED) cells.push({ c: p[0], r: p[1], v: p[2], flash: 0 });
    for (const t of fallingT(y)) cells.push({ c: t.c, r: t.r, v: t.v, flash: f === 8 ? 0.4 : 0 });
  } else if (f === 9) {
    for (const p of SETTLED) cells.push({ c: p[0], r: p[1], v: p[2], flash: p[1] === 11 ? 0.55 : 0 });
    for (const t of fallingT(LOCK_Y)) cells.push({ c: t.c, r: t.r, v: t.v, flash: 0.7 });
  } else if (f === 10 || f === 11) {
    const flash = f === 10 ? 1 : 0.55;
    for (const p of SETTLED) cells.push({ c: p[0], r: p[1], v: p[2], flash: p[1] === 11 ? flash : 0 });
    for (const t of fallingT(LOCK_Y)) cells.push({ c: t.c, r: t.r, v: t.v, flash: t.r === 11 ? flash : 0.15 });
  } else if (f === 12) {
    // Line vanishing — only the rows above, not yet dropped.
    for (const p of SETTLED) {
      if (p[1] === 11) continue;
      cells.push({ c: p[0], r: p[1], v: p[2], flash: 0 });
    }
    cells.push({ c: 5, r: 10, v: 6, flash: 0 });
  } else {
    // Stack dropped one row. New T at the top, easing into the loop.
    for (const p of SETTLED) {
      if (p[1] === 11) continue;
      cells.push({ c: p[0], r: p[1] + 1, v: p[2], flash: 0 });
    }
    cells.push({ c: 5, r: 11, v: 6, flash: 0 });
    const y = 0.4 + (f - 13) * 0.35;
    for (const t of fallingT(y)) cells.push({ c: t.c, r: t.r, v: t.v, flash: 0 });
  }
  return cells;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 20;
  const cols = 10, rows = 12;
  const gx0 = 24, gy0 = 16, cell = 8, gap = 0.6;
  const cells = cellsForFrame(f);

  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD, CARD_D, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      const wx1 = gx0 + cols * cell, wy1 = gy0 + rows * cell;
      if (rrPix(x, y, gx0 - 3, gy0 - 3, wx1 + 3, wy1 + 3, 4)) col = GRID;
      if (x >= gx0 && x < wx1 && y >= gy0 && y < wy1) col = WELL;
      for (const t of cells) {
        const x0 = gx0 + t.c * cell, y0 = gy0 + t.r * cell;
        if (x >= x0 + gap && x < x0 + cell - gap && y >= y0 + gap && y < y0 + cell - gap) {
          col = t.flash ? mix(SHAPE[t.v], FLASH, t.flash) : SHAPE[t.v];
        }
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

export function fallingBlocksIcon() {
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
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
  '·': [0, 0, 0, 0b00100, 0b00100, 0, 0],
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

function paintWell(put, fill, x0, y0, cell, board, falling) {
  const cols = 10, rows = 20;
  const w = cols * cell, h = rows * cell;
  fill(x0 - 4, y0 - 4, x0 + w + 4, y0 + h + 4, 28, 34, 42);
  fill(x0, y0, x0 + w, y0 + h, 8, 10, 14);
  function cellAt(c, r, col, inset) {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    const pad = inset == null ? 1 : inset;
    const px = x0 + c * cell, py = y0 + r * cell;
    fill(px + pad, py + pad, px + cell - pad, py + cell - pad, col[0], col[1], col[2]);
    if (pad < 2) {
      const hi = mix(col, [255, 255, 255], 0.32);
      fill(px + pad, py + pad, px + cell - pad, py + pad + Math.max(1, (cell - 2 * pad) * 0.22), hi[0], hi[1], hi[2]);
    }
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const v = board[r] && board[r][c];
    if (v) cellAt(c, r, SHAPE[v - 1]);
  }
  if (falling) {
    for (const t of falling) cellAt(t.c, t.r, SHAPE[t.v], t.ghost ? 3 : 1);
  }
}

function boardFromRows(rows) {
  const b = [];
  for (let r = 0; r < 20; r++) {
    b[r] = new Array(10).fill(0);
    const s = rows[r] || '';
    for (let c = 0; c < 10; c++) b[r][c] = (s.charCodeAt(c) || 48) - 48;
  }
  return b;
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

  fill(0, 0, W, H, 18, 22, 28);
  drawText(put, 40, 40, 'FALLING', 8, 230, 236, 240);
  drawText(put, 40, 104, 'BLOCKS', 8, 230, 236, 240);
  drawText(put, 40, 176, 'RACE FROM ONE LINK', 3, 0, 196, 204);
  drawText(put, 40, 220, 'ON THIS DEVICE', 3, 230, 236, 240);
  rr(40, 268, 352, 344, 8, 0, 196, 204);
  drawText(put, 64, 290, 'PLAY A FRIEND', 3, 18, 22, 28);
  drawText(put, 40, 372, 'SAME SHAPES', 3, 255, 140, 0);
  drawText(put, 40, 424, 'TWO BOARDS', 3, 230, 236, 240);
  drawText(put, 40, 476, 'LAST ONE STANDING', 3, 170, 70, 200);
  drawText(put, 40, 544, 'BEST LIVES IN THE FILE', 2, 155, 164, 176);

  const youRows = [
    '0000000000',
    '0000000000',
    '0000000000',
    '0000000000',
    '0000000000',
    '0000000000',
    '0000000000',
    '0000000000',
    '0033000000',
    '0033551000',
    '0223551770',
    '0223441770',
    '0663441550',
    '0663341554',
    '0113342554',
    '0117342554',
    '0777222664',
    '0557222664',
    '0557111663',
    '0447111663',
  ];
  const themRows = [
    '0000000000',
    '0000000000',
    '0000000000',
    '0000000000',
    '0000000000',
    '0000000000',
    '0000000000',
    '0000000000',
    '0000000000',
    '0000220000',
    '0000223300',
    '0115223340',
    '0115553344',
    '0661557744',
    '0661157744',
    '0332157766',
    '0332151166',
    '0447751166',
    '0447752211',
    '0557752211',
  ];
  const youFall = [
    { c: 5, r: 4, v: 6 }, { c: 4, r: 5, v: 6 }, { c: 5, r: 5, v: 6 }, { c: 6, r: 5, v: 6 },
  ];
  const themFall = [
    { c: 3, r: 6, v: 0 }, { c: 4, r: 6, v: 0 }, { c: 5, r: 6, v: 0 }, { c: 6, r: 6, v: 0 },
  ];
  paintWell(put, fill, 490, 78, 24, boardFromRows(youRows), youFall);
  paintWell(put, fill, 860, 150, 18, boardFromRows(themRows), themFall);
  drawText(put, 490, 78 + 20 * 24 + 14, 'YOU  2400', 3, 0, 196, 204);
  drawText(put, 860, 150 + 20 * 18 + 14, 'FRIEND  1850', 2, 170, 70, 200);

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
