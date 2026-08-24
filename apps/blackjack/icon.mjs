// Procedural blackjack icon: ace of spades sliding onto a ten of hearts → 21.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const FELT = [14, 58, 34], GOLD = [232, 196, 96], GOLD2 = [244, 236, 224];
const INK = [26, 18, 8], RED = [196, 40, 48], CREAM = [247, 243, 234];
const DARK = [10, 44, 26], WOOD = [106, 58, 24], BACK = [26, 42, 120];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [FELT, GOLD, GOLD2, INK, RED, CREAM, DARK, WOOD, BACK, [46, 138, 58]]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.3).map(Math.round));
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
function inRR(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  if (x >= x0 + r && x <= x1 - r) return true;
  if (y >= y0 + r && y <= y1 - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}

const GLYPHS = {
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'J': [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  'Q': [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  ':': [0, 0b00100, 0, 0, 0, 0b00100, 0],
  '·': [0, 0, 0, 0b00100, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  'X': [0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b01010, 0b10001],
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

function heart(put, cx, cy, s, r, g, b) {
  for (let y = -s; y <= s; y++) for (let x = -s; x <= s; x++) {
    const nx = x / s, ny = y / s;
    const a = (nx * nx + ny * ny - 1);
    const inH = (nx * nx + (ny + 0.35) * (ny + 0.35) < 0.42 && ny < 0.15)
      || (Math.abs(nx) * 1.6 + (ny + 0.1) < 1.05 && ny > -0.15);
    if (inH && ny > -0.85) put(cx + x, cy + y, r, g, b);
    void a;
  }
}
function spade(put, cx, cy, s, r, g, b) {
  for (let y = -s; y <= s + 2; y++) for (let x = -s; x <= s; x++) {
    const nx = x / s, ny = y / s;
    const lobe = (nx * nx + (ny + 0.25) * (ny + 0.25) < 0.55 && ny < 0.35);
    const tip = Math.abs(nx) * 1.3 + (-ny) < 0.95 && ny < 0.1;
    const stem = Math.abs(x) < Math.max(1, s * 0.18) && y > s * 0.15 && y < s * 0.95;
    const base = Math.abs(x) < s * 0.45 && y > s * 0.7 && y < s * 1.05;
    if (lobe || tip || stem || base) put(cx + x, cy + y, r, g, b);
  }
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  const slide = (1 - t) * 28;
  const show21 = t > 0.72;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inRR(x, y, 6, 6, 122, 122, 18)) { a = 1; col = FELT; }
    if (inRR(x, y, 4, 4, 124, 124, 20) && !inRR(x, y, 10, 10, 118, 118, 16)) col = WOOD;
    if (inRR(x, y, 22, 30, 72, 100, 7)) col = CREAM;
    if (inRR(x, y, 46 + slide, 22, 96 + slide, 92, 7)) col = CREAM;
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }
  function put(x, y, r, g, b) {
    if (x < 0 || y < 0 || x >= OUT || y >= OUT) return;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      if (rgba[o + 3] < 0.5) continue;
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b;
    }
  }
  drawText(put, 30, 42, '10', 4, 196, 40, 48);
  heart(put, 46, 78, 8, 196, 40, 48);
  const ax = (54 + slide) | 0;
  drawText(put, ax + 8, 36, 'A', 5, 26, 18, 8);
  spade(put, ax + 26, 68, 9, 26, 18, 8);
  for (let y = 108; y < 122; y++) for (let x = 54; x < 74; x++) {
    const dx = x - 64, dy = y - 115;
    if (dx * dx + dy * dy <= 49) put(x, y, 232, 196, 96);
    if (dx * dx + dy * dy <= 25 && dx * dx + dy * dy >= 9) put(x, y, 244, 236, 224);
  }
  if (show21) drawText(put, 44, 8, '21', 5, 232, 196, 96);
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

export function blackjackIcon() {
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
  // wood rail + felt
  for (let y = 20; y < 700; y++) for (let x = 30; x < 1170; x++) {
    const nx = (x - 600) / 560, ny = (y - 360) / 330;
    if (nx * nx + ny * ny <= 1.02) put(x, y, 106, 58, 24);
    if (nx * nx + ny * ny <= 0.92) {
      const glow = Math.max(0, 1 - (nx * nx + (ny + 0.15) * (ny + 0.15)));
      put(x, y, (14 + glow * 28) | 0, (58 + glow * 40) | 0, (34 + glow * 16) | 0);
    }
  }
  drawText(put, 64, 44, 'BLACKJACK', 7, 247, 243, 234);
  drawText(put, 64, 110, 'TOY CHIPS  NO CASH', 3, 232, 196, 96);
  drawText(put, 860, 50, 'CHIPS 215', 4, 232, 196, 96);

  function cardFace(x, y, w, h, rank, suitRed, pip) {
    rr(x, y, x + w, y + h, 18, 247, 243, 234);
    const col = suitRed ? [196, 40, 48] : [26, 18, 8];
    drawText(put, x + 18, y + 22, rank, 6, col[0], col[1], col[2]);
    if (pip === 'H') heart(put, x + (w / 2) | 0, y + (h * 0.62) | 0, 28, col[0], col[1], col[2]);
    else spade(put, x + (w / 2) | 0, y + (h * 0.58) | 0, 30, col[0], col[1], col[2]);
  }
  // dealer: 7 up, hole down
  cardFace(160, 170, 170, 240, '7', false, 'S');
  rr(250, 190, 420, 430, 18, 26, 42, 120);
  for (let y = 200; y < 420; y += 10) for (let x = 260; x < 410; x += 10) {
    if (((x + y) / 10) & 1) put(x, y, 244, 236, 224);
  }
  drawText(put, 160, 430, 'DEALER  7', 3, 184, 196, 176);

  // player blackjack
  cardFace(480, 250, 190, 270, 'A', false, 'S');
  cardFace(620, 280, 190, 270, '10', true, 'H');
  drawText(put, 480, 560, 'YOU  21', 4, 232, 196, 96);
  drawText(put, 480, 610, 'BLACKJACK', 4, 232, 196, 96);

  rr(900, 240, 1120, 320, 16, 232, 196, 96);
  drawText(put, 930, 262, 'HIT', 5, 26, 18, 8);
  rr(900, 340, 1120, 420, 16, 232, 196, 96);
  drawText(put, 918, 362, 'STAND', 5, 26, 18, 8);
  rr(900, 440, 1120, 520, 16, 232, 196, 96);
  drawText(put, 910, 462, 'DOUBLE', 5, 26, 18, 8);

  drawText(put, 64, 660, 'THE FILE HOLDS THE PILE   INVITE IS EXTRA SEATS', 3, 184, 196, 176);
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
