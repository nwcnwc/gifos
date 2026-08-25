// Procedural JSON Diff sticker: two columns, green add / red drop walking
// in. Super-sample → box-downsample.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD = [22, 24, 32];
const DOT = [244, 241, 232];
const GOLD = [80, 170, 90];
const INK = [180, 70, 70];

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
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, DOT, GOLD, INK, [255, 255, 255]]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.25).map(Math.round));
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
function finder(x, y, ox, oy, s) {
  const lx = x - ox, ly = y - oy;
  if (lx < 0 || ly < 0 || lx >= 7 * s || ly >= 7 * s) return null;
  const cx = Math.floor(lx / s), cy = Math.floor(ly / s);
  const ring = cx === 0 || cy === 0 || cx === 6 || cy === 6;
  const inner = cx >= 2 && cx <= 4 && cy >= 2 && cy <= 4;
  if (ring || inner) return DOT;
  return CARD;
}

function brace(x, y, ox, open) {
  const lx = x - ox, ly = y - 26;
  if (lx < 0 || lx > 10 || ly < 0 || ly > 76) return false;
  const along = ly / 76;
  const lip = (along < 0.12 || along > 0.88) ? 4 : (Math.abs(along - 0.5) < 0.08 ? 5 : 1.6);
  if (open) return lx < lip + 1.4 && lx > lip - 1.6;
  return (10 - lx) < lip + 1.4 && (10 - lx) > lip - 1.6;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  const m = 10, rad = 18;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    if (!inCard(x, y, m, rad)) continue;
    let col = CARD;
    const mid = OUT / 2;
    if (x < mid - 1.5) col = mix(CARD, [28, 34, 44], 0.45);
    else if (x > mid + 1.5) col = mix(CARD, [34, 28, 28], 0.35);
    else col = [8, 8, 12];
    if (brace(x, y, 18, true) || brace(x, y, 100, false)) col = DOT;
    const row = Math.floor((y - 34) / 11);
    if (row >= 0 && row < 5 && y > 34 && y < 90) {
      if (x > 30 && x < 56) {
        col = row === 2 && t > 0.25 ? INK : DOT;
      }
      if (x > 72 && x < 98) {
        if (row === 1 && t > 0.2) col = GOLD;
        else if (row === 3 && t > 0.55) col = GOLD;
        else if (row === 2 && t > 0.25) col = mix(CARD, [40, 30, 30], 0.2);
        else col = DOT;
      }
    }
    const o = (py * RW + px) * 4;
    rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
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

export function jsonDiffIcon() {
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
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
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
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  ':': [0, 0b00100, 0b00100, 0, 0b00100, 0b00100, 0],
  '/': [0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b10000, 0b10000],
  '{': [0b00110, 0b01000, 0b01000, 0b10000, 0b01000, 0b01000, 0b00110],
  '}': [0b01100, 0b00010, 0b00010, 0b00001, 0b00010, 0b00010, 0b01100],
  '"': [0b01010, 0b01010, 0, 0, 0, 0, 0],
  '+': [0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0, 0],
  '-': [0, 0, 0b11111, 0, 0, 0, 0],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
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
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
      }
    }
    cx += 6 * s;
  }
}
function drawFinder(put, ox, oy, s) {
  for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
    const ring = x === 0 || y === 0 || x === 6 || y === 6;
    const inner = x >= 2 && x <= 4 && y >= 2 && y <= 4;
    const col = (ring || inner) ? [18, 18, 18] : [255, 255, 255];
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
      put(ox + x * s + dx, oy + y * s + dy, col[0], col[1], col[2]);
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

  fill(0, 0, W, H, 10, 10, 15);
  drawText(put, 48, 28, 'JSON DIFF', 6, 80, 170, 90);
  drawText(put, 48, 84, 'PASTE TWO DOCUMENTS. SEE WHAT CHANGED.', 3, 154, 148, 134);

  rr(48, 140, 392, 430, 12, 16, 16, 24);
  drawText(put, 68, 158, 'LEFT  OLD', 2, 154, 148, 134);
  drawText(put, 68, 200, '{', 4, 244, 241, 232);
  drawText(put, 100, 200, 'NAME: ADA', 3, 244, 241, 232);
  drawText(put, 100, 250, 'N: 1', 3, 244, 241, 232);
  drawText(put, 100, 300, 'TAGS: MATH NOTES', 2, 244, 241, 232);
  drawText(put, 100, 340, 'USER.ROLE: EDITOR', 2, 244, 241, 232);
  drawText(put, 68, 384, '}', 4, 244, 241, 232);

  rr(416, 140, 760, 430, 12, 16, 16, 24);
  drawText(put, 436, 158, 'RIGHT  NEW', 2, 154, 148, 134);
  drawText(put, 436, 200, '{', 4, 244, 241, 232);
  drawText(put, 468, 200, 'NAME: ADA LOVELACE', 2, 80, 170, 90);
  drawText(put, 468, 250, 'N: 2', 3, 80, 170, 90);
  drawText(put, 468, 300, 'OK: TRUE', 3, 80, 170, 90);
  drawText(put, 468, 340, 'USER.ROLE: ADMIN', 2, 80, 170, 90);
  drawText(put, 436, 384, '}', 4, 244, 241, 232);

  rr(784, 140, 1152, 430, 12, 16, 16, 24);
  drawText(put, 804, 158, 'DIFFERENCE', 2, 154, 148, 134);
  fill(804, 200, 1132, 248, 29, 74, 42);
  drawText(put, 820, 214, '+  OK: TRUE', 2, 216, 255, 216);
  fill(804, 256, 1132, 304, 74, 29, 29);
  drawText(put, 820, 270, '-  TAGS: NOTES', 2, 255, 208, 208);
  fill(804, 312, 1132, 360, 42, 58, 42);
  drawText(put, 820, 326, 'NAME: ADA / ADA LOVELACE', 2, 216, 255, 216);
  drawText(put, 804, 384, '2 ADDED  1 REMOVED  3 CHANGED', 2, 154, 148, 134);

  drawText(put, 48, 470, 'VISUAL   JSON DELTA   JSON PATCH', 3, 80, 170, 90);
  drawText(put, 48, 530, 'MATCH LISTS BY ID. LAST PAIR STAYS IN THE FILE.', 3, 154, 148, 134);
  drawText(put, 48, 590, 'INVITE SHOWS A READ-ONLY VIEW IN A MEETING.', 3, 154, 148, 134);
  drawText(put, 48, 650, 'UNOFFICIAL PORT OF JSONDIFFPATCH', 3, 80, 170, 90);

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
