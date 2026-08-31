// Procedural RAWGraphs icon: a grid that becomes an alluvial.
// Sticker on transparent, dark outline, readable at 64px.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD = [28, 24, 20];
const CARD_D = [16, 14, 12];
const INK = [245, 240, 232];
const ORANGE = [247, 96, 0];
const BLUE = [61, 139, 253];
const GREEN = [22, 163, 74];
const GOLD = [234, 179, 8];
const PURPLE = [168, 85, 247];
const PAPER = [251, 247, 240];

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
  for (const b of [CARD, CARD_D, INK, ORANGE, BLUE, GREEN, GOLD, PURPLE, PAPER, [20, 18, 16]]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
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
function fillBox(rgba, x0, y0, x1, y1, col) {
  x0 = x0 | 0; y0 = y0 | 0; x1 = x1 | 0; y1 = y1 | 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (x < 0 || y < 0 || x >= OUT || y >= OUT) continue;
    for (let qy = 0; qy < SS; qy++) for (let qx = 0; qx < SS; qx++) {
      const o = (((y * SS + qy) * RW) + (x * SS + qx)) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }
}
function distSeg(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-8) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / l2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  const m = 7, rad = 22;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    if (!inCard(x, y, m, rad)) continue;
    const col = mix(CARD, CARD_D, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
    const o = (py * RW + px) * 4;
    rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
  }

  // Phase A (t<0.45): spreadsheet grid filling in.
  // Phase B: bars / alluvial ribbons take over.
  const gridT = Math.min(1, t / 0.42);
  const flowT = Math.max(0, (t - 0.35) / 0.65);
  const gx = 18, gy = 28, cw = 22, ch = 16, cols = 4, rows = 5;
  const filled = Math.floor(8 + gridT * (cols * rows - 8));
  const heats = [ORANGE, BLUE, GREEN, GOLD, PURPLE];
  if (flowT < 0.85) {
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      const ix = cy * cols + cx;
      if (ix > filled) continue;
      const x0 = gx + cx * cw + 1, y0 = gy + cy * ch + 1;
      const col = (cy === 0 || cx === 0) ? mix(INK, CARD, 0.45) : heats[ix % heats.length];
      fillBox(rgba, x0, y0, x0 + cw - 3, y0 + ch - 3, mix(col, CARD, flowT * 0.7));
    }
  }

  // Alluvial nodes + ribbons (appear as flowT grows).
  if (flowT > 0.12) {
    const nodes = [
      { x: 24, y: 34, h: 28, c: ORANGE },
      { x: 24, y: 68, h: 22, c: BLUE },
      { x: 58, y: 30, h: 18, c: GREEN },
      { x: 58, y: 52, h: 22, c: GOLD },
      { x: 58, y: 78, h: 16, c: PURPLE },
      { x: 94, y: 32, h: 24, c: ORANGE },
      { x: 94, y: 62, h: 28, c: GREEN },
    ];
    const ribbons = [
      { x0: 30, y0: 38, x1: 58, y1: 34, h: 10, c: ORANGE },
      { x0: 30, y0: 50, x1: 58, y1: 56, h: 10, c: ORANGE },
      { x0: 30, y0: 72, x1: 58, y1: 80, h: 12, c: BLUE },
      { x0: 64, y0: 34, x1: 94, y1: 36, h: 12, c: GREEN },
      { x0: 64, y0: 56, x1: 94, y1: 66, h: 14, c: GOLD },
      { x0: 64, y0: 82, x1: 94, y1: 78, h: 10, c: PURPLE },
    ];
    const shown = Math.floor(flowT * ribbons.length + 0.2);
    for (let i = 0; i < shown && i < ribbons.length; i++) {
      const rb = ribbons[i];
      for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
        const x = px / SS, y = py / SS;
        const d1 = distSeg(x, y, rb.x0, rb.y0, rb.x1, rb.y1);
        const d2 = distSeg(x, y, rb.x0, rb.y0 + rb.h, rb.x1, rb.y1 + rb.h);
        const inside = y > Math.min(rb.y0, rb.y1) - 1 && y < Math.max(rb.y0 + rb.h, rb.y1 + rb.h) + 1;
        if (inside && (d1 < rb.h * 0.55 || d2 < 1.2 || (d1 < 8 && d2 < 8 && Math.abs((rb.y0 + rb.y1) / 2 + rb.h / 2 - y) < rb.h * 0.7))) {
          const o = (py * RW + px) * 4;
          if (rgba[o + 3] < 0.5) continue;
          rgba[o] = rb.c[0]; rgba[o + 1] = rb.c[1]; rgba[o + 2] = rb.c[2];
        }
      }
    }
    for (const nd of nodes) {
      fillBox(rgba, nd.x, nd.y, nd.x + 8, nd.y + nd.h * Math.min(1, flowT * 1.4), mix(INK, nd.c, 0.25));
    }
  }

  // Accent underline that grows — reads as "a chart is happening".
  fillBox(rgba, 20, 18, 20 + Math.max(12, t * 88), 22, ORANGE);

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

export function rawgraphsIcon() {
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
    minCodeSize: 6, frames, delayCs: 10, transparentIndex: 0
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
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b01010, 0b01010, 0b00100, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0, 0b00100],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  3: [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  5: [0b11111, 0b10000, 0b10000, 0b11110, 0b00001, 0b00001, 0b11110],
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

function fillRect(put, x0, y0, x1, y1, r, g, b) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, r, g, b);
}
function fillRound(put, x0, y0, x1, y1, rad, r, g, b) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const cx = Math.min(Math.max(x, x0 + rad), x1 - rad);
    const cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
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
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 18, 17, 15);

  drawText(put, 36, 28, 'RAWGRAPHS', 4, 245, 240, 232);
  drawText(put, 320, 36, 'TABLE - CHART', 2, 247, 96, 0);
  fillRound(put, 36, 78, 200, 118, 8, 247, 96, 0);
  drawText(put, 48, 90, 'SAMPLE', 2, 255, 255, 255);
  fillRound(put, 212, 78, 430, 118, 8, 28, 26, 23);
  drawText(put, 224, 90, 'COPY SVG', 2, 245, 240, 232);
  drawText(put, 450, 92, '32 ROWS  7 COLUMNS  PRIZE FILMS', 2, 163, 155, 144);

  // Chart type rail
  const types = ['ALLUVIAL', 'TREEMAP', 'BAR', 'BUMP', 'PACK'];
  for (let i = 0; i < types.length; i++) {
    const x = 36 + i * 150;
    const on = i === 0;
    fillRound(put, x, 140, x + 140, 188, 8, on ? 42 : 28, on ? 26 : 26, on ? 16 : 23);
    drawText(put, x + 12, 156, types[i], 2, on ? 247 : 245, on ? 96 : 240, on ? 0 : 232);
  }

  // Mapping chips
  drawText(put, 36, 210, 'STEPS', 2, 163, 155, 144);
  const chips = ['ORIGIN', 'STUDIO', 'GENRE'];
  const chipC = [[247, 96, 0], [61, 139, 253], [22, 163, 74]];
  for (let i = 0; i < chips.length; i++) {
    const x = 36 + i * 150;
    fillRound(put, x, 236, x + 136, 276, 8, chipC[i][0], chipC[i][1], chipC[i][2]);
    drawText(put, x + 14, 248, chips[i], 2, 255, 255, 255);
  }
  drawText(put, 500, 250, 'SIZE  COUNT', 2, 245, 240, 232);

  // Paper card with alluvial
  fillRound(put, 36, 300, 1164, 690, 14, 251, 247, 240);

  const nodes = [
    { x: 80, ys: [[320, 110, [247, 96, 0]], [440, 80, [61, 139, 253]], [530, 60, [168, 85, 247]]], label: 'ORIGIN' },
    { x: 430, ys: [[318, 70, [22, 163, 74]], [400, 90, [234, 179, 8]], [502, 55, [247, 96, 0]], [568, 50, [61, 139, 253]]], label: 'STUDIO' },
    { x: 860, ys: [[316, 75, [247, 96, 0]], [400, 85, [22, 163, 74]], [494, 70, [61, 139, 253]], [574, 55, [168, 85, 247]]], label: 'GENRE' },
  ];
  drawText(put, 80, 308, 'ORIGIN', 2, 120, 113, 108);
  drawText(put, 430, 308, 'STUDIO', 2, 120, 113, 108);
  drawText(put, 860, 308, 'GENRE', 2, 120, 113, 108);

  function ribbon(x0, y0, h0, x1, y1, h1, col) {
    const mx = (x0 + x1) / 2;
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / Math.max(1, x1 - x0);
      const s = t * t * (3 - 2 * t);
      const y = y0 + (y1 - y0) * s;
      const h = h0 + (h1 - h0) * s;
      for (let yy = y | 0; yy < y + h; yy++) {
        put(x, yy, col[0], col[1], col[2]);
        if (x > x0 + 4 && x < x1 - 4 && (yy === (y | 0) || yy === ((y + h) | 0) - 1)) {
          put(x, yy, Math.min(255, col[0] + 20), Math.min(255, col[1] + 20), Math.min(255, col[2] + 20));
        }
      }
    }
  }
  const flows = [
    [80 + 18, 320, 50, 430, 318, 40, [247, 96, 0]],
    [80 + 18, 375, 50, 430, 400, 45, [247, 96, 0]],
    [80 + 18, 440, 50, 430, 502, 40, [61, 139, 253]],
    [80 + 18, 500, 40, 430, 568, 40, [61, 139, 253]],
    [80 + 18, 545, 40, 430, 400, 30, [168, 85, 247]],
    [430 + 18, 318, 40, 860, 316, 40, [22, 163, 74]],
    [430 + 18, 400, 50, 860, 400, 50, [234, 179, 8]],
    [430 + 18, 502, 40, 860, 494, 40, [247, 96, 0]],
    [430 + 18, 568, 40, 860, 574, 40, [61, 139, 253]],
  ];
  for (const f of flows) ribbon(f[0], f[1], f[2], f[3], f[4], f[5], f[6]);

  const labels = [
    [44, 360, 'USA'], [44, 470, 'UK'], [36, 548, 'JPN'],
    [888, 348, 'DRAMA'], [888, 438, 'ACTION'], [888, 520, 'ANIM'], [888, 596, 'SCI-FI'],
  ];
  for (const L of labels) drawText(put, L[0], L[1], L[2], 2, 28, 25, 23);

  for (const col of nodes) {
    for (const n of col.ys) {
      fillRect(put, col.x, n[0], col.x + 18, n[0] + n[1], 28, 25, 23);
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
