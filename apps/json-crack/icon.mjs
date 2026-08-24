// Procedural JSON Crack icon: a { } that cracks into linked cards.
// Cover is a 1200×720 graph laid out by graph.js. Pure Node.
import { deflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const BG = [11, 13, 19];
const CARD = [23, 26, 36];
const INK = [199, 210, 254];
const IND = [99, 102, 241];
const GREEN = [134, 239, 172];
const LINE = [75, 85, 99];
const NUM = [125, 211, 252];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [BG, CARD, INK, IND, GREEN, LINE, NUM, [255, 255, 255]]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.3).map(Math.round));
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
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r);
  const cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function rr(rgba, w, x0, y0, x1, y1, rad, col) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
    const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) {
      const o = (y * w + x) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }
}

function putRgba(rgba, w, x, y, col, a) {
  x = x | 0; y = y | 0;
  if (x < 0 || y < 0 || x >= w || y >= RW) return;
  const o = (y * w + x) * 4;
  rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = a == null ? 1 : a;
}

function lineRgba(rgba, w, x0, y0, x1, y1, col, thick) {
  const dx = x1 - x0, dy = y1 - y0;
  const n = Math.max(2, Math.ceil(Math.hypot(dx, dy)));
  const t = thick || 1;
  for (let i = 0; i <= n; i++) {
    const x = x0 + dx * (i / n), y = y0 + dy * (i / n);
    for (let oy = -t; oy <= t; oy++) for (let ox = -t; ox <= t; ox++) {
      putRgba(rgba, w, x + ox, y + oy, col);
    }
  }
}

function bezierRgba(rgba, w, x1, y1, x2, y2, col, tGrow, thick) {
  const mx = (x1 + x2) / 2;
  const steps = 48;
  const last = Math.max(1, Math.floor(steps * Math.min(1, tGrow)));
  let px = x1, py = y1;
  for (let i = 1; i <= last; i++) {
    const t = i / steps, u = 1 - t;
    const x = u * u * u * x1 + 3 * u * u * t * mx + 3 * u * t * t * mx + t * t * t * x2;
    const y = u * u * u * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y2;
    lineRgba(rgba, w, px, py, x, y, col, thick);
    px = x; py = y;
  }
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  const m = 8, rad = 16;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    if (!inCard(x, y, m, rad)) continue;
    const o = (py * RW + px) * 4;
    rgba[o] = BG[0]; rgba[o + 1] = BG[1]; rgba[o + 2] = BG[2]; rgba[o + 3] = 1;
  }
  const s = SS;
  function R(x0, y0, x1, y1, r, col) {
    rr(rgba, RW, x0 * s, y0 * s, x1 * s, y1 * s, r * s, col);
  }
  function row(x, y, w, col) {
    R(x, y, x + w, y + 3, 1, col);
  }

  // A { } that cracks into three linked cards. Edges grow — the loop earns it.
  if (t < 0.18) {
    R(48, 36, 56, 92, 2, IND);
    R(48, 36, 80, 44, 2, IND);
    R(48, 84, 80, 92, 2, IND);
    R(72, 36, 80, 92, 2, mix(IND, BG, 0.4));
    R(72, 36, 80, 44, 2, IND);
    R(72, 84, 80, 92, 2, IND);
  } else {
    R(18, 40, 58, 88, 4, CARD);
    R(18, 40, 21, 88, 2, IND);
    row(24, 50, 26, INK);
    row(24, 60, 20, GREEN);
    row(24, 70, 16, NUM);
    const e1 = Math.max(0, (t - 0.18) / 0.32);
    bezierRgba(rgba, RW, 58 * s, 52 * s, 72 * s, 40 * s, LINE, e1, 1);
    if (t > 0.28) {
      R(70, 26, 110, 60, 4, CARD);
      R(70, 26, 73, 60, 2, IND);
      row(76, 36, 26, INK);
      row(76, 46, 18, GREEN);
    }
    const e2 = Math.max(0, (t - 0.48) / 0.32);
    bezierRgba(rgba, RW, 58 * s, 76 * s, 72 * s, 88 * s, LINE, e2, 1);
    if (t > 0.55) {
      R(70, 72, 110, 106, 4, CARD);
      R(70, 72, 73, 106, 2, GREEN);
      row(76, 82, 26, INK);
      row(76, 92, 14, NUM);
    }
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

export function jsonCrackIcon() {
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
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  3: [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  5: [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  6: [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  ',': [0, 0, 0, 0, 0b00100, 0b00100, 0b01000],
  ':': [0, 0, 0b00100, 0, 0, 0b00100, 0],
  '{': [0b00110, 0b00100, 0b00100, 0b01000, 0b00100, 0b00100, 0b00110],
  '}': [0b01100, 0b00100, 0b00100, 0b00010, 0b00100, 0b00100, 0b01100],
  '[': [0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110],
  ']': [0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110],
  '"': [0b01010, 0b01010, 0, 0, 0, 0, 0],
  "'": [0b00100, 0b00100, 0, 0, 0, 0, 0],
  '/': [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  '+': [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
};
function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const gph = GLYPHS[ch] || GLYPHS[' '];
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (gph[row] & (1 << (4 - col))) {
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
      }
    }
    cx += 6 * s;
  }
}

function loadGraph() {
  const dir = dirname(fileURLToPath(import.meta.url));
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(dir, 'graph.js'), 'utf8'), ctx);
  return ctx.JsonCrack;
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
  const card = (x0, y0, x1, y1, accent) => {
    fill(x0, y0, x1, y1, 23, 26, 36);
    fill(x0, y0, x0 + 6, y1, accent[0], accent[1], accent[2]);
  };
  const bezier = (x1, y1, x2, y2) => {
    const mx = (x1 + x2) / 2;
    let px = x1, py = y1;
    for (let i = 1; i <= 64; i++) {
      const t = i / 64, u = 1 - t;
      const x = u * u * u * x1 + 3 * u * u * t * mx + 3 * u * t * t * mx + t * t * t * x2;
      const y = u * u * u * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y2;
      put(x, y, 75, 85, 99);
      put(x, y + 1, 75, 85, 99);
      put(x + 1, y, 75, 85, 99);
      px = x; py = y;
    }
  };

  fill(0, 0, W, H, 11, 13, 19);
  fill(0, 0, 340, H, 17, 19, 26);
  drawText(put, 24, 24, 'JSON CRACK', 4, 199, 210, 254);
  drawText(put, 24, 70, 'NOTHING IS UPLOADED.', 2, 156, 163, 175);
  drawText(put, 24, 128, '{', 3, 99, 102, 241);
  drawText(put, 48, 168, 'SQUADNAME:', 2, 156, 163, 175);
  drawText(put, 48, 198, '"SUPER HERO SQUAD"', 2, 134, 239, 172);
  drawText(put, 48, 236, 'HOMETOWN:', 2, 156, 163, 175);
  drawText(put, 48, 266, '"METRO CITY"', 2, 134, 239, 172);
  drawText(put, 48, 304, 'FORMED: 2016', 2, 125, 211, 252);
  drawText(put, 48, 342, 'ACTIVE: TRUE', 2, 240, 171, 252);
  drawText(put, 48, 380, 'MEMBERS: [', 2, 165, 180, 252);
  drawText(put, 72, 418, '{ NAME, AGE.. }', 2, 156, 163, 175);
  drawText(put, 72, 448, '{ NAME, AGE.. }', 2, 156, 163, 175);
  drawText(put, 48, 486, ']', 2, 165, 180, 252);
  drawText(put, 24, 530, '}', 3, 99, 102, 241);
  drawText(put, 24, 660, 'THE FILE IS THE DOCUMENT.', 2, 107, 114, 128);

  const JC = loadGraph();
  const COVER = {
    squadName: 'Super hero squad',
    homeTown: 'Metro City',
    formed: 2016,
    active: true,
    members: [
      { name: 'Molecule Man', age: 29 },
      { name: 'Madame Uppercut', age: 39 }
    ]
  };
  const g = JC.toGraph(COVER);
  const laid = JC.layout(g, {});
  const gx0 = 360, gy0 = 70;
  const colX = [352, 716, 900];
  const colW = [352, 168, 276];
  function colOf(n) {
    const d = Math.round((n.x - 24) / 232);
    return Math.max(0, Math.min(2, d));
  }
  function X(v) { return gx0 + v; }
  function Y(v) { return gy0 + v * 1.05; }

  function drawClipped(x, y, str, s, r, g, b, xMax) {
    let cx = x;
    for (const ch of String(str).toUpperCase()) {
      if (cx + 5 * s > xMax) break;
      const gph = GLYPHS[ch] || GLYPHS[' '];
      for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
        if (gph[row] & (1 << (4 - col))) {
          for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
        }
      }
      cx += 6 * s;
    }
  }

  function rect(n) {
    const c = colOf(n);
    return { x: colX[c], y: Y(n.y), w: colW[c], h: Math.max(n.h * 1.1, 88) };
  }
  const byId = {};
  laid.nodes.forEach((n) => { byId[n.id] = n; });
  laid.edges.forEach((e) => {
    const a = byId[e.from], b = byId[e.to];
    if (!a || !b) return;
    const ra = rect(a), rb = rect(b);
    bezier(ra.x + ra.w, Y(e.y1), rb.x, Y(e.y2));
  });
  laid.nodes.forEach((n) => {
    const rct = rect(n);
    const x0 = rct.x, y0 = rct.y, x1 = rct.x + rct.w, y1 = rct.y + rct.h;
    card(x0, y0, x1, y1, n.isArray ? GREEN : IND);
    const ts = 2;
    const xMax = x1 - 10;
    const title = n.isArray ? ('[] ' + n.size + ' ITEMS') : ('{} ' + n.size + ' KEYS');
    drawClipped(x0 + 14, y0 + 12, title, ts, 199, 210, 254, xMax);
    n.rows.slice(0, 5).forEach((r, ri) => {
      const yy = y0 + 40 + ri * 24;
      if (yy + 14 > y1 - 8) return;
      const key = String(r.k || '');
      let val = r.nested
        ? (r.t === 'array' ? '[' + r.size + ']' : '{' + r.size + '}')
        : String(r.v);
      drawClipped(x0 + 14, yy, key + (key ? ': ' : ''), ts, 156, 163, 175, xMax);
      const vx = x0 + 14 + (key ? (key.length + 2) * 6 * ts : 0);
      const col = r.nested ? [165, 180, 252]
        : r.t === 'number' ? [125, 211, 252]
        : r.t === 'boolean' ? [240, 171, 252]
        : r.t === 'null' ? [107, 114, 128]
        : [134, 239, 172];
      if (vx < xMax) drawClipped(vx, yy, val, ts, col[0], col[1], col[2], xMax);
    });
  });

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
