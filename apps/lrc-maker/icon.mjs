// Procedural LRC Maker icon: waveform + timestamps.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD = [32, 32, 32];
const CARD_D = [20, 20, 20];
const INK = [244, 241, 187];
const CORAL = [237, 106, 90];
const TEAL = [112, 193, 179];
const GOLD = [255, 224, 102];
const MINT = [199, 239, 207];
const COLS = [CORAL, TEAL, GOLD, MINT, [155, 193, 188], [240, 182, 127]];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, CARD_D, INK, CORAL, TEAL, GOLD, MINT]) {
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
function fillRect(rgba, x0, y0, x1, y1, col, m, rad) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    if (x < 0 || y < 0 || x >= OUT || y >= OUT) continue;
    if (!inCard(x, y, m, rad)) continue;
    for (let qy = 0; qy < SS; qy++) for (let qx = 0; qx < SS; qx++) {
      const o = ((((y | 0) * SS + qy) * RW) + ((x | 0) * SS + qx)) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }
}
function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22, t = f / FRAMES;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    if (!inCard(x, y, m, rad)) continue;
    const col = mix(CARD, CARD_D, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
    const o = (py * RW + px) * 4;
    rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
  }
  const rows = 4;
  const sing = Math.floor(t * rows) % rows;
  for (let i = 0; i < rows; i++) {
    const y = 22 + i * 22;
    const lit = i <= sing;
    const on = i === sing;
    fillRect(rgba, 18, y, 110, y + 16, on ? [24, 72, 64] : [28, 32, 40], m, rad);
    fillRect(rgba, 22, y + 5, 46, y + 11, lit ? TEAL : [90, 100, 110], m, rad);
    fillRect(rgba, 52, y + 5, 102, y + 11, on ? INK : [160, 170, 180], m, rad);
  }
  const caretY = 22 + (t * rows * 22) % (rows * 22);
  fillRect(rgba, 16, caretY, 18, caretY + 16, GOLD, m, rad);
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0, nn = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
    }
    if (a / nn < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / nn, g / nn, b / nn);
  }
  return idx;
}
export function lrcMakerIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64, flat = new Array(CT * 3).fill(0);
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
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  'X': [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  'J': [0b00111, 0b00001, 0b00001, 0b00001, 0b00001, 0b10001, 0b01110],
  'Q': [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  'Z': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  ':': [0, 0b00100, 0, 0, 0, 0b00100, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0, 0b00100],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
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
    for (let y = Math.max(0, y0 | 0); y < Math.min(H, y1 | 0); y++)
      for (let x = Math.max(0, x0 | 0); x < Math.min(W, x1 | 0); x++) put(x, y, r, g, b);
  };
  fill(0, 0, W, H, 16, 20, 28);
  fill(40, 24, 1160, 696, 12, 18, 28);
  drawText(put, 64, 48, 'LRC MAKER', 5, 232, 238, 248);
  drawText(put, 900, 48, '00:19.40', 5, 126, 224, 255);

  fill(64, 110, 1136, 122, 24, 40, 48);
  fill(64, 110, 420, 122, 57, 208, 197);

  const rows = [
    ['00:12.08', 'I KEEP THE SONG HERE', false],
    ['00:19.40', 'TAP STAMP ON THE LINE', true],
    ['00:27.15', 'EXPORT AN LRC FILE', false],
    ['--:--.--', 'THE NEXT LINE WAITS', false],
  ];
  rows.forEach((row, i) => {
    const y = 160 + i * 88;
    if (row[2]) fill(64, y, 1136, y + 76, 22, 56, 48);
    else fill(64, y, 1136, y + 76, 14, 22, 32);
    drawText(put, 88, y + 24, row[0], 4, row[2] ? 57 : 90, row[2] ? 208 : 160, row[2] ? 197 : 180);
    drawText(put, 360, y + 24, row[1], 4, 232, 238, 248);
  });

  fill(64, 540, 220, 620, 24, 32, 48);
  fill(240, 540, 430, 620, 24, 32, 48);
  fill(450, 540, 1136, 620, 57, 208, 197);
  drawText(put, 96, 564, 'PLAY', 4, 232, 238, 248);
  drawText(put, 280, 564, '-5S', 4, 232, 238, 248);
  drawText(put, 680, 564, 'STAMP', 4, 8, 32, 24);
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
