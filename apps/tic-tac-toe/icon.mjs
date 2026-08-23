// Procedural icon: a cream notebook 3×3 with an X settling onto the centre.
// Pure Node, super-sample → box-downsample. Deterministic.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [48, 50, 54];
const PAPER = [244, 234, 212];
const PAPER_D = [226, 210, 180];
const GRID = [58, 52, 40];
const INK = [28, 24, 20];
const OINK = [139, 58, 74];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, PAPER, PAPER_D, GRID, INK, OINK]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
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
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}
function distToSeg(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  if (l2 < 1e-6) return Math.hypot(x - x1, y - y1);
  let t = ((x - x1) * dx + (y - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 18, boardIn = 22;
  const n = 3, span = OUT - 2 * boardIn, step = span / n;
  const t = f / FRAMES;
  const drop = Math.max(0, 1 - t * 1.15);
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      const inside = x >= boardIn - 2 && x <= OUT - boardIn + 2 && y >= boardIn - 2 && y <= OUT - boardIn + 2;
      if (inside) {
        col = mix(PAPER, PAPER_D, Math.max(0, Math.min(1, (x + y) / (OUT * 2))));
        for (let i = 1; i < n; i++) {
          const p = boardIn + i * step;
          if (Math.abs(y - p) < 1.15 && x >= boardIn && x <= OUT - boardIn) col = GRID;
          if (Math.abs(x - p) < 1.15 && y >= boardIn && y <= OUT - boardIn) col = GRID;
        }
        const cell = (r, c) => ({
          cx: boardIn + (c + 0.5) * step,
          cy: boardIn + (r + 0.5) * step
        });
        const o = cell(0, 2);
        const od = Math.hypot(x - o.cx, y - o.cy);
        if (od > 8.2 && od < 11.6) col = OINK;
        const tl = cell(0, 0);
        const s = 9.5;
        if (distToSeg(x, y, tl.cx - s, tl.cy - s, tl.cx + s, tl.cy + s) < 1.7) col = INK;
        if (distToSeg(x, y, tl.cx + s, tl.cy - s, tl.cx - s, tl.cy + s) < 1.7) col = INK;
        const c = cell(1, 1);
        const by = c.cy - drop * 14;
        if (distToSeg(x, y, c.cx - s, by - s, c.cx + s, by + s) < 1.9) col = INK;
        if (distToSeg(x, y, c.cx + s, by - s, c.cx - s, by + s) < 1.9) col = INK;
      } else col = CARD.slice();
    }
    const off = (py * RW + px) * 4;
    if (a) { rgba[off] = col[0]; rgba[off + 1] = col[1]; rgba[off + 2] = col[2]; rgba[off + 3] = 1; }
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

export function ticTacToeIcon() {
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
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'X': [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
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

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = (x + y) / (W + H);
    put(x, y, (48 + t * 16) | 0, (50 + t * 12) | 0, (54 + t * 8) | 0);
  }

  const board = 600, bx = 70, by = 60;
  const pad = 28, span = board - 2 * pad, step = span / 3;
  for (let y = 0; y < board; y++) for (let x = 0; x < board; x++) {
    const t = (x + y) / (board * 2);
    put(bx + x, by + y, (244 - t * 18) | 0, (234 - t * 22) | 0, (212 - t * 28) | 0);
  }
  function hline(yy) {
    for (let x = pad; x <= pad + span; x++) {
      put(bx + x, by + yy, 58, 52, 40);
      put(bx + x, by + yy + 1, 58, 52, 40);
      put(bx + x, by + yy + 2, 58, 52, 40);
    }
  }
  function vline(xx) {
    for (let y = pad; y <= pad + span; y++) {
      put(bx + xx, by + y, 58, 52, 40);
      put(bx + xx + 1, by + y, 58, 52, 40);
      put(bx + xx + 2, by + y, 58, 52, 40);
    }
  }
  hline(Math.round(pad + step)); hline(Math.round(pad + 2 * step));
  vline(Math.round(pad + step)); vline(Math.round(pad + 2 * step));

  function markX(r, c) {
    const cx = bx + pad + (c + 0.5) * step, cy = by + pad + (r + 0.5) * step, s = step * 0.28;
    for (let i = -s; i <= s; i++) {
      for (let w = -5; w <= 5; w++) {
        put(cx + i + w * 0.35, cy + i, 28, 24, 20);
        put(cx + i, cy + i + w * 0.35, 28, 24, 20);
        put(cx + i + w * 0.35, cy - i, 28, 24, 20);
        put(cx + i, cy - i + w * 0.35, 28, 24, 20);
      }
    }
  }
  function markO(r, c) {
    const cx = bx + pad + (c + 0.5) * step, cy = by + pad + (r + 0.5) * step;
    const ro = step * 0.32, ri = step * 0.22;
    for (let dy = -ro; dy <= ro; dy++) for (let dx = -ro; dx <= ro; dx++) {
      const d = Math.hypot(dx, dy);
      if (d <= ro && d >= ri) put(cx + dx, cy + dy, 139, 58, 74);
    }
  }
  markX(0, 0); markO(0, 1); markX(0, 2);
  markO(1, 0); markX(1, 1); markO(1, 2);
  markX(2, 2);

  drawText(put, 720, 150, 'TIC-TAC-TOE', 7, 246, 230, 184);
  drawText(put, 720, 250, 'THREE IN A ROW', 4, 200, 176, 130);
  drawText(put, 720, 370, 'COMPUTER', 3, 244, 234, 212);
  drawText(put, 720, 420, 'OR A FRIEND', 3, 244, 234, 212);
  drawText(put, 720, 520, 'X GOES FIRST', 3, 176, 160, 120);

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
