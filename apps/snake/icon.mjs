// Procedural icon for Snake: a navy rounded card, a green snake that crawls
// to a red apple, eats it, and grows. Not a wiggle — the loop is the bite.
// Pure Node, super-sample → box-downsample → small palette. Deterministic.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [8, 12, 72];
const CARD_B = [0, 0, 40];
const GREEN = [56, 210, 72];
const GREEN_D = [24, 120, 40];
const GREEN_HI = [180, 245, 160];
const APPLE = [220, 48, 48];
const APPLE_HI = [255, 210, 90];
const LEAF = [48, 160, 64];
const EYE = [12, 22, 14];
const GOLD = [255, 210, 48];
const GOLD_D = [190, 140, 20];

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
  for (const b of [CARD_A, CARD_B, GREEN, GREEN_D, GREEN_HI, APPLE, APPLE_HI, LEAF, EYE, GOLD, GOLD_D]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    for (let s = 1; s <= 2; s++) pal.push(mix(b, [0, 0, 0], s * 0.22).map(Math.round));
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

// Head walks along a shallow arc toward the apple at (90, 62). After the bite
// (frame 6) the body lengthens and a new apple appears ahead.
function scene(f) {
  const bite = 6;
  const headX = 34 + Math.min(f, bite) * 9.2 + Math.max(0, f - bite) * 3.4;
  const headY = 70 - Math.sin((Math.min(f, bite) / bite) * Math.PI) * 8;
  const nSeg = 9 + Math.max(0, f - bite) * 1.4;
  const pts = [];
  for (let i = 0; i <= nSeg; i++) {
    const back = i * 6.2;
    const x = headX - back;
    const y = headY + Math.sin((x - 20) / 16) * 5.5;
    pts.push({ x, y, t: 1 - i / nSeg });
  }
  pts.reverse(); // tail → head
  const appleA = {
    x: 90, y: 62,
    scale: f < 5 ? 1 : f === 5 ? 0.55 : 0,
  };
  const appleB = {
    x: 108, y: 40,
    scale: f < 8 ? 0 : Math.min(1, (f - 8) / 3),
  };
  return { pts, appleA, appleB, headX, headY };
}

function distToPath(x, y, pts) {
  let best = 1e9, at = 0, nx = 0, ny = 1;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const vx = b.x - a.x, vy = b.y - a.y;
    const len2 = vx * vx + vy * vy || 1;
    let u = ((x - a.x) * vx + (y - a.y) * vy) / len2;
    u = Math.max(0, Math.min(1, u));
    const px = a.x + vx * u, py = a.y + vy * u;
    const d = Math.hypot(x - px, y - py);
    if (d < best) {
      best = d; at = a.t + (b.t - a.t) * u;
      const l = Math.hypot(vx, vy) || 1;
      nx = -vy / l; ny = vx / l;
    }
  }
  return { d: best, t: at, nx, ny };
}

function putApple(x, y, apple, colRef) {
  if (apple.scale <= 0.02) return;
  const sc = apple.scale;
  const ad = Math.hypot(x - apple.x, y - (apple.y + 2));
  if (ad < 9.2 * sc) {
    const hi = Math.max(0, 1 - Math.hypot(x - (apple.x - 3 * sc), y - apple.y) / (9 * sc));
    colRef.col = mix(APPLE, APPLE_HI, hi * 0.55);
  }
  if (Math.abs(x - apple.x) < 1.2 * sc && y > apple.y - 12 * sc && y < apple.y - 4 * sc) {
    colRef.col = mix(GREEN_D, LEAF, 0.4);
  }
  const lx = (x - (apple.x + 4 * sc)) / sc, ly = (y - (apple.y - 8 * sc)) / sc;
  if (lx * lx / 18 + ly * ly / 8 < 1 && lx > -1) colRef.col = LEAF;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const scn = scene(f);
  const pts = scn.pts;
  const head = pts[pts.length - 1];
  const neck = pts[pts.length - 2] || pts[0];
  const hx = head.x - neck.x, hy = head.y - neck.y;
  const hl = Math.hypot(hx, hy) || 1;
  const hdx = hx / hl, hdy = hy / hl;
  const growing = f >= 6;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      const sp = distToPath(x, y, pts);
      const thick = (growing ? 8.4 : 7.0) - sp.t * 2.6;
      if (sp.d < thick) {
        const along = 0.3 + 0.7 * sp.t;
        const stripe = ((sp.t * 14) % 1) > 0.55 ? 0.16 : 0;
        col = mix(GREEN_D, GREEN_HI, along * 0.7 + stripe);
        const rim = (thick - sp.d) / thick;
        if (rim < 0.25) col = mix(col, GREEN_D, 1 - rim / 0.25);
      }
      const hd = Math.hypot(x - head.x, y - head.y);
      const hr = growing ? 10.4 : 9.2;
      if (hd < hr) {
        col = mix(GREEN, GREEN_HI, 0.35 + 0.4 * Math.max(0, 1 - hd / hr));
        const ex = head.x + hdx * 3.4 - hdy * 2.9;
        const ey = head.y + hdy * 3.4 + hdx * 2.9;
        const ex2 = head.x + hdx * 3.4 + hdy * 2.9;
        const ey2 = head.y + hdy * 3.4 - hdx * 2.9;
        if (Math.hypot(x - ex, y - ey) < 1.7 || Math.hypot(x - ex2, y - ey2) < 1.7) col = EYE;
      }
      const cref = { col };
      putApple(x, y, scn.appleA, cref);
      putApple(x, y, scn.appleB, cref);
      col = cref.col;
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

export function snakeIcon() {
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
  'J': [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '·': [0, 0, 0, 0b00100, 0, 0, 0],
  ':': [0, 0b00100, 0b00100, 0, 0b00100, 0b00100, 0],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '6': [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
};
function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
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

  fill(0, 0, W, H, 252, 84, 84);
  drawText(put, 36, 26, 'JAVASCRIPT SNAKE', 4, 255, 255, 255);
  drawText(put, 36, 66, 'YOU  24', 3, 48, 220, 72);
  drawText(put, 860, 66, 'FRIEND  18', 3, 255, 210, 48);

  const COLS = 28, ROWS = 18;
  const cell = 32;
  const bx = ((W - COLS * cell) / 2) | 0;
  const by = 108;
  fill(bx, by, bx + COLS * cell, by + ROWS * cell, 0, 0, 140);
  // faint grid
  for (let gx = 1; gx < COLS; gx++) fill(bx + gx * cell, by, bx + gx * cell + 1, by + ROWS * cell, 8, 8, 160);
  for (let gy = 1; gy < ROWS; gy++) fill(bx, by + gy * cell, bx + COLS * cell, by + gy * cell + 1, 8, 8, 160);

  function cellAt(cx, cy, r, g, b, head) {
    const x0 = bx + cx * cell, y0 = by + cy * cell;
    const inset = 3;
    fill(x0 + inset, y0 + inset, x0 + cell - inset, y0 + cell - inset, r, g, b);
    if (head) {
      fill(x0 + inset, y0 + inset, x0 + cell - inset, y0 + 10, Math.min(255, r + 50), Math.min(255, g + 50), Math.min(255, b + 40));
    }
  }
  function eyes(cx, cy, dir) {
    const x0 = bx + cx * cell, y0 = by + cy * cell;
    const mids = { 0: [11, 8, 21, 8], 1: [22, 11, 22, 21], 2: [11, 22, 21, 22], 3: [8, 11, 8, 21] };
    const e = mids[dir] || mids[1];
    put(x0 + e[0], y0 + e[1], 16, 22, 16);
    put(x0 + e[0] + 1, y0 + e[1], 16, 22, 16);
    put(x0 + e[2], y0 + e[3], 16, 22, 16);
    put(x0 + e[2] + 1, y0 + e[3], 16, 22, 16);
    put(x0 + e[0], y0 + e[1] + 1, 16, 22, 16);
    put(x0 + e[2], y0 + e[3] + 1, 16, 22, 16);
  }

  // Two snakes contesting one apple. Green (you) from the left, gold from the right.
  // Cells listed tail → head. Neither snake is a sine scribble; they read as bodies.
  const green = [
    [1, 14], [2, 14], [3, 14], [4, 14], [5, 14], [5, 13], [5, 12],
    [6, 12], [7, 12], [8, 12], [8, 11], [8, 10], [9, 10], [10, 10],
    [11, 10], [11, 9], [11, 8], [12, 8], [13, 8], [14, 8], [15, 8],
    [16, 8], [16, 7], [16, 6],
  ];
  const gold = [
    [26, 15], [25, 15], [24, 15], [23, 15], [22, 15], [22, 14], [22, 13],
    [21, 13], [20, 13], [19, 13], [19, 12], [19, 11], [18, 11], [17, 11],
    [16, 11], [16, 10], [16, 9], [17, 9],
  ];
  for (let i = 0; i < green.length; i++) {
    const [x, y] = green[i];
    const t = i / (green.length - 1);
    cellAt(x, y, Math.round(28 + 20 * t), Math.round(140 + 80 * t), Math.round(40 + 32 * t), i === green.length - 1);
  }
  eyes(16, 6, 0);
  for (let i = 0; i < gold.length; i++) {
    const [x, y] = gold[i];
    const t = i / (gold.length - 1);
    cellAt(x, y, Math.round(200 + 55 * t), Math.round(150 + 60 * t), Math.round(20 + 28 * t), i === gold.length - 1);
  }
  eyes(17, 9, 3);

  // Apple — roundish via filled diamond+square, with a leaf. Not a snake cell.
  const ax = 18, ay = 6;
  const x0 = bx + ax * cell + cell / 2, y0 = by + ay * cell + cell / 2 + 2;
  for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) {
    if (x * x + (y + 1) * (y + 1) <= 11 * 11) {
      const hi = Math.max(0, 1 - Math.hypot(x + 4, y + 4) / 14);
      put((x0 + x) | 0, (y0 + y) | 0, Math.round(220 + 35 * hi), Math.round(40 + 140 * hi), Math.round(40 + 20 * hi));
    }
  }
  for (let y = -8; y <= -2; y++) put(x0 | 0, (y0 + y) | 0, 40, 130, 50);
  for (let y = -10; y <= -4; y++) for (let x = 2; x <= 8; x++) {
    if ((x - 4) * (x - 4) / 12 + (y + 7) * (y + 7) / 8 < 1) put((x0 + x) | 0, (y0 + y) | 0, 48, 160, 64);
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
