// Procedural icon for Snake: a dark rounded card holding a green snake that
// slithers around a red apple. Pure Node — super-sample → box-downsample →
// small palette, 1-bit transparent surround. Deterministic so builds match.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [18, 28, 22];
const CARD_B = [8, 14, 12];
const GREEN = [56, 176, 72];
const GREEN_D = [28, 110, 44];
const GREEN_HI = [170, 236, 150];
const APPLE = [220, 48, 48];
const APPLE_HI = [255, 210, 90];
const LEAF = [48, 160, 64];
const EYE = [12, 22, 14];

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
  for (const b of [CARD_A, CARD_B, GREEN, GREEN_D, GREEN_HI, APPLE, APPLE_HI, LEAF, EYE]) {
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

function snakePath(phase) {
  const pts = [];
  const n = 28;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = 22 + t * 84;
    const y = 64 + Math.sin(t * Math.PI * 2.15 + phase) * 22
      + Math.sin(t * Math.PI * 4.3 + phase * 1.4) * 7;
    pts.push({ x, y, t });
  }
  return pts;
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

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const phase = (f / FRAMES) * Math.PI * 2;
  const pts = snakePath(phase);
  const head = pts[pts.length - 1];
  const neck = pts[pts.length - 2];
  const hx = head.x - neck.x, hy = head.y - neck.y;
  const hl = Math.hypot(hx, hy) || 1;
  const hdx = hx / hl, hdy = hy / hl;
  const apple = { x: 64 + Math.cos(phase) * 4, y: 36 };
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      const sp = distToPath(x, y, pts);
      const thick = 7.2 - sp.t * 3.4;
      if (sp.d < thick) {
        const along = 0.35 + 0.65 * sp.t;
        const stripe = ((sp.t * 18 + phase) % 1) > 0.55 ? 0.18 : 0;
        col = mix(GREEN_D, GREEN_HI, along * 0.7 + stripe);
        const rim = (thick - sp.d) / thick;
        if (rim < 0.25) col = mix(col, GREEN_D, 1 - rim / 0.25);
      }
      // head
      const hd = Math.hypot(x - head.x, y - head.y);
      if (hd < 9.4) {
        col = mix(GREEN, GREEN_HI, 0.35 + 0.4 * Math.max(0, 1 - hd / 9));
        const ex = head.x + hdx * 3.2 - hdy * 2.8;
        const ey = head.y + hdy * 3.2 + hdx * 2.8;
        const ex2 = head.x + hdx * 3.2 + hdy * 2.8;
        const ey2 = head.y + hdy * 3.2 - hdx * 2.8;
        if (Math.hypot(x - ex, y - ey) < 1.7 || Math.hypot(x - ex2, y - ey2) < 1.7) col = EYE;
      }
      // apple
      const ad = Math.hypot(x - apple.x, y - (apple.y + 2));
      if (ad < 9.5) {
        const hi = Math.max(0, 1 - Math.hypot(x - (apple.x - 3), y - apple.y) / 9);
        col = mix(APPLE, APPLE_HI, hi * 0.55);
      }
      if (Math.abs(x - apple.x) < 1.2 && y > apple.y - 12 && y < apple.y - 4) col = mix(GREEN_D, LEAF, 0.4);
      const lx = x - (apple.x + 4), ly = y - (apple.y - 8);
      if (lx * lx / 18 + ly * ly / 8 < 1 && lx > -1) col = LEAF;
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
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
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
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  ':': [0, 0b00100, 0b00100, 0, 0b00100, 0b00100, 0],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
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
  drawText(put, 36, 28, 'JAVASCRIPT SNAKE', 4, 255, 255, 255);
  drawText(put, 36, 68, 'LENGTH: 24', 3, 255, 255, 255);
  drawText(put, 900, 68, 'LENGTH: 18', 3, 255, 255, 255);

  const COLS = 28, ROWS = 18;
  const cell = 32;
  const bx = ((W - COLS * cell) / 2) | 0;
  const by = 110;
  fill(bx, by, bx + COLS * cell, by + ROWS * cell, 0, 0, 168);

  function cellAt(cx, cy, r, g, b, head) {
    const x0 = bx + cx * cell, y0 = by + cy * cell;
    fill(x0 + 1, y0 + 1, x0 + cell - 1, y0 + cell - 1, r, g, b);
    if (head) fill(x0 + 1, y0 + 1, x0 + cell - 1, y0 + 8, Math.min(255, r + 50), Math.min(255, g + 50), Math.min(255, b + 40));
  }

  const red = [];
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    red.push({ x: 2 + ((i * 0.7) | 0), y: 8 + Math.round(Math.sin(t * 3.2) * 4) });
  }
  for (let i = red.length - 1; i >= 0; i--) {
    const c = red[i];
    cellAt(c.x, c.y, 255, 40, 40, i === 0);
  }
  const green = [];
  for (let i = 0; i < 18; i++) {
    const t = i / 17;
    green.push({ x: 25 - ((i * 0.65) | 0), y: 10 + Math.round(Math.sin(t * 2.8 + 1.2) * 3) });
  }
  for (let i = green.length - 1; i >= 0; i--) {
    const c = green[i];
    cellAt(c.x, c.y, 48, 220, 72, i === 0);
  }
  cellAt(14, 7, 255, 48, 48, false);
  fill(bx + 14 * cell + 10, by + 7 * cell + 10, bx + 14 * cell + 18, by + 7 * cell + 18, 255, 210, 74);

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
