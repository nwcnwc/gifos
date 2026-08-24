// Procedural icon: two hole cards, a flop sliding in. 128px animated + 1200×720 cover.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const FELT = [12, 58, 36], GOLD = [232, 196, 96], CREAM = [247, 243, 234];
const INK = [26, 18, 8], RED = [196, 40, 48], DARK = [10, 44, 26], WOOD = [90, 48, 20];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [FELT, GOLD, CREAM, INK, RED, DARK, WOOD, [46, 138, 58]]) {
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
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'Q': [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  'J': [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'X': [0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b01010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  ' ': [0, 0, 0, 0, 0, 0, 0],
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
function drawSpade(put, x, y, s, r, g, b) {
  // stem + two lobes, generic pip
  for (let dy = 0; dy < 5 * s; dy++) for (let dx = -2 * s; dx <= 2 * s; dx++) {
    const ny = dy / s, nx = dx / s;
    if (ny < 3 && nx * nx + (ny - 1.2) * (ny - 1.2) < 2.4) put(x + dx, y + dy, r, g, b);
    if (ny >= 3 && Math.abs(nx) <= 0.7) put(x + dx, y + dy, r, g, b);
  }
}
function drawHeart(put, x, y, s, r, g, b) {
  for (let dy = 0; dy < 5 * s; dy++) for (let dx = -3 * s; dx <= 3 * s; dx++) {
    const ny = dy / s, nx = Math.abs(dx / s);
    const top = (nx - 1.2) * (nx - 1.2) + (ny - 1.1) * (ny - 1.1) < 1.5;
    const bot = ny > 1.4 && ny < 4.4 && nx < (4.2 - ny) * 0.85;
    if (top || bot) put(x + dx, y + dy, r, g, b);
  }
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  const flop = Math.min(1, Math.max(0, (t - 0.2) / 0.6));
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inRR(x, y, 6, 6, 122, 122, 18)) { a = 1; col = mix(WOOD, FELT, 0.15); }
    if (inRR(x, y, 14, 16, 114, 112, 40)) { a = 1; col = mix(FELT, DARK, y / OUT); }
    if (inRR(x, y, 22, 70, 52, 114, 6)) col = CREAM;
    if (inRR(x, y, 44, 70, 74, 114, 6)) col = CREAM;
    if (flop > 0.2 && inRR(x, y, 22, 22, 48, 62, 5)) col = CREAM;
    if (flop > 0.45 && inRR(x, y, 50, 22, 76, 62, 5)) col = CREAM;
    if (flop > 0.7 && inRR(x, y, 78, 22, 104, 62, 5)) col = CREAM;
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
  drawText(put, 26, 78, 'A', 3, 26, 18, 8);
  drawSpade(put, 36, 96, 2, 26, 18, 8);
  drawText(put, 50, 78, 'K', 3, 196, 40, 48);
  drawHeart(put, 60, 96, 2, 196, 40, 48);
  if (flop > 0.2) { drawText(put, 26, 26, 'Q', 2, 26, 18, 8); drawSpade(put, 34, 40, 2, 26, 18, 8); }
  if (flop > 0.45) { drawText(put, 54, 26, 'J', 2, 196, 40, 48); drawHeart(put, 62, 40, 2, 196, 40, 48); }
  if (flop > 0.7) { drawText(put, 82, 26, '10', 2, 26, 18, 8); drawSpade(put, 94, 40, 2, 26, 18, 8); }
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

export function pokerIcon() {
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
  rr(40, 24, 1160, 696, 36, 12, 58, 36);
  drawText(put, 64, 40, 'NO ACCOUNT  NO CASH', 4, 232, 196, 96);
  drawText(put, 64, 84, 'INVITE IS THE TABLE', 4, 247, 243, 234);
  // community
  const labels = ['Q', 'J', '10', '9', '2'];
  const reds = [0, 1, 0, 1, 0];
  for (let i = 0; i < 5; i++) {
    const x = 70 + i * 118;
    rr(x, 140, x + 104, 310, 12, 247, 243, 234);
    const col = reds[i] ? [196, 40, 48] : [26, 18, 8];
    drawText(put, x + 18, 180, labels[i], 7, col[0], col[1], col[2]);
  }
  rr(70, 340, 176, 510, 12, 247, 243, 234);
  drawText(put, 92, 380, 'A', 8, 26, 18, 8);
  rr(190, 340, 296, 510, 12, 247, 243, 234);
  drawText(put, 214, 380, 'K', 8, 196, 40, 48);
  drawText(put, 330, 360, 'POT  240', 5, 232, 196, 96);
  drawText(put, 330, 420, 'YOUR HOLE', 3, 244, 236, 224);
  drawText(put, 330, 462, 'ADA TO ACT', 3, 184, 196, 176);
  // seats
  rr(70, 530, 300, 600, 10, 18, 52, 36);
  drawText(put, 86, 550, 'YOU  990', 3, 247, 243, 234);
  rr(320, 530, 560, 600, 10, 18, 52, 36);
  drawText(put, 336, 550, 'ADA  1000', 3, 232, 196, 96);
  rr(580, 530, 830, 600, 10, 18, 52, 36);
  drawText(put, 596, 550, 'CHIP  995', 3, 247, 243, 234);
  // action bar — the phone targets
  rr(70, 620, 300, 686, 12, 90, 40, 40);
  drawText(put, 120, 640, 'FOLD', 4, 247, 243, 234);
  rr(320, 620, 560, 686, 12, 232, 196, 96);
  drawText(put, 370, 640, 'CALL', 4, 26, 18, 8);
  rr(580, 620, 830, 686, 12, 232, 196, 96);
  drawText(put, 620, 640, 'RAISE', 4, 26, 18, 8);
  drawText(put, 860, 640, 'TOY CHIPS', 3, 232, 196, 96);
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
