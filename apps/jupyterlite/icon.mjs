// Procedural JupyterLite sticker: a notebook whose In [ ] runs 1+1 and Out [1]: 2.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD = [22, 26, 34];
const CARDD = [14, 16, 22];
const ORANGE = [243, 118, 38];
const INK = [232, 237, 245];
const GREEN = [140, 220, 130];
const CYAN = [118, 211, 248];
const LINE = [44, 50, 62];
const OUTLINE = [8, 10, 14];
const PAPER = [28, 32, 42];

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
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function inRound(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  if (x >= x0 + r && x <= x1 - r) return true;
  if (y >= y0 + r && y <= y1 - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, CARDD, ORANGE, INK, GREEN, CYAN, LINE, OUTLINE, PAPER, [255, 255, 255]]) {
    pal.push(b);
    pal.push(mix(b, [255, 255, 255], 0.14).map(Math.round));
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
  J: [0b01111, 0b00001, 0b00001, 0b00001, 0b10001, 0b10001, 0b01110],
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
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  '+': [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  '[': [0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110],
  ']': [0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110],
  ':': [0, 0b00100, 0, 0, 0, 0b00100, 0],
  '*': [0b00100, 0b10101, 0b01110, 0b00100, 0b01110, 0b10101, 0b00100],
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
  PI: null
};

function glyphAt(ch, col, row) {
  const g = GLYPHS[String(ch).toUpperCase()];
  if (!g) return false;
  return !!(g[row] & (1 << (4 - col)));
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const typed = Math.min(3, Math.floor(f / 2));
  const src = '1+1'.slice(0, typed);
  const running = f >= 6 && f < 8;
  const done = f >= 8;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    let col = null;
    if (inCard(x, y, 10, 18)) col = OUTLINE;
    if (inCard(x, y, 13, 16)) col = mix(CARD, CARDD, (y - 13) / 102);
    if (inRound(x, y, 13, 13, 115, 28, 8)) col = ORANGE;
    if (inRound(x, y, 22, 36, 106, 70, 6)) col = LINE;
    if (inRound(x, y, 24, 38, 104, 68, 5)) col = PAPER;
    if (done && inRound(x, y, 22, 76, 106, 110, 6)) col = LINE;
    if (done && inRound(x, y, 24, 78, 104, 108, 5)) col = mix(PAPER, [20, 40, 28], 0.35);
    const plot = (str, ox, oy, s, rgb) => {
      let cxp = ox;
      for (const ch of str) {
        for (let row = 0; row < 7; row++) for (let coln = 0; coln < 5; coln++) {
          if (!glyphAt(ch, coln, row)) continue;
          const px1 = cxp + coln * s, py1 = oy + row * s;
          if (x >= px1 && x < px1 + s && y >= py1 && y < py1 + s) col = rgb;
        }
        cxp += 6 * s;
      }
    };
    plot('JL', 28, 16, 1.4, INK);
    plot(running ? 'IN[*]' : (done ? 'IN[1]' : 'IN[ ]'), 26, 42, 1.5, CYAN);
    if (src) plot(src, 26, 54, 1.8, INK);
    if (done) {
      plot('OUT', 26, 82, 1.5, GREEN);
      plot('2', 72, 84, 2.4, GREEN);
    }
    if (!col) continue;
    const o = (py * RW + px) * 4;
    rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) {
      const o = ((y * SS + dy) * RW + (x * SS + dx)) * 4;
      if (!rgba[o + 3]) continue;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += 1; n++;
    }
    if (a / (SS * SS) < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}

export function jupyterliteIcon() {
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
function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (gph[row] & (1 << (4 - col))) {
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
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
  const roundFill = (x0, y0, x1, y1, rad, r, g, b) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x1 - rad);
      const cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
      let ok = false;
      if (x >= x0 + rad && x < x1 - rad) ok = true;
      else if (y >= y0 + rad && y < y1 - rad) ok = true;
      else {
        const dx = x - cx, dy = y - cy;
        ok = dx * dx + dy * dy <= rad * rad;
      }
      if (ok) put(x, y, r, g, b);
    }
  };
  fill(0, 0, W, H, 14, 17, 22);
  roundFill(0, 0, W, 56, 0, 243, 118, 38);
  drawText(put, 28, 16, 'JUPYTERLITE', 4, 26, 16, 10);
  drawText(put, 520, 20, 'PYTHON 3.12  IDLE', 3, 255, 232, 214);
  roundFill(24, 80, 1176, 200, 12, 22, 26, 34);
  drawText(put, 40, 96, 'MD', 3, 201, 176, 122);
  drawText(put, 140, 96, 'WELCOME', 4, 232, 237, 245);
  drawText(put, 140, 140, 'A PYTHON NOTEBOOK IN THIS FILE.', 3, 139, 149, 167);
  roundFill(24, 220, 1176, 430, 12, 22, 26, 34);
  drawText(put, 40, 240, 'IN [1]:', 3, 118, 211, 248);
  drawText(put, 200, 240, 'IMPORT SYS, MATH', 3, 232, 237, 245);
  drawText(put, 200, 284, 'PRINT(SYS.VERSION.SPLIT()[0])', 3, 232, 237, 245);
  drawText(put, 200, 328, 'PRINT("PI", ROUND(MATH.PI, 6))', 3, 232, 237, 245);
  drawText(put, 200, 376, '3.12.7', 3, 232, 237, 245);
  drawText(put, 40, 392, 'OUT [1]:', 3, 157, 222, 122);
  drawText(put, 200, 392, 'PI  3.141593', 3, 157, 222, 122);
  roundFill(24, 450, 1176, 680, 12, 22, 26, 34);
  drawText(put, 40, 470, 'IN [2]:', 3, 118, 211, 248);
  drawText(put, 200, 470, 'FIB(12)', 4, 232, 237, 245);
  drawText(put, 40, 540, 'OUT [2]:', 3, 157, 222, 122);
  drawText(put, 200, 540, '[0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89]', 3, 157, 222, 122);
  drawText(put, 40, 610, 'THE NOTEBOOK STAYS IN THIS FILE.', 3, 139, 149, 167);
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
