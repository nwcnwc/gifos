// Procedural icon for hat.sh: a dark rounded card holding a gold padlock
// whose shackle settles closed across the frames. Pure Node, super-sample →
// box-downsample → small palette; deterministic so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [22, 30, 52];
const CARD_B = [12, 16, 30];
const GOLD = [232, 196, 96];
const GOLD_D = [168, 132, 48];
const STEEL = [107, 140, 255];
const PALE = [236, 240, 252];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, GOLD, GOLD_D, STEEL, PALE]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.09).map(Math.round));
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

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const t = f / FRAMES;
  const open = 0.5 + 0.5 * Math.cos(t * Math.PI * 2); // 1 = open, 0 = shut
  const glow = 0.35 + 0.65 * (1 - open);
  const bodyX0 = 44, bodyX1 = 84, bodyY0 = 58, bodyY1 = 96;
  const cx = 64, shackleR = 18, shackleY = 58, shackleT = 6.5;
  const holeR = 5.2, holeY = 72;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      // lock body
      if (x >= bodyX0 && x <= bodyX1 && y >= bodyY0 && y <= bodyY1) {
        const br = 8;
        const ix = Math.min(Math.max(x, bodyX0 + br), bodyX1 - br);
        const iy = Math.min(Math.max(y, bodyY0 + br), bodyY1 - br);
        const inBody = (x >= bodyX0 + br && x <= bodyX1 - br) || (y >= bodyY0 + br && y <= bodyY1 - br) ||
          ((x - ix) * (x - ix) + (y - iy) * (y - iy) <= br * br);
        if (inBody) col = mix(GOLD_D, GOLD, 0.35 + 0.35 * ((x - bodyX0) / (bodyX1 - bodyX0)));
      }
      // shackle: ring sitting on the body, right side lifts a little when "open"
      const lift = open * 7;
      const sx = x - cx, sy = y - (shackleY - lift);
      const d = Math.sqrt(sx * sx + sy * sy);
      const onRing = d > shackleR - shackleT && d < shackleR + 0.6 && sy < 4;
      if (onRing) col = mix(GOLD, PALE, 0.15 + glow * 0.35);
      // keyhole
      const hx = x - cx, hy = y - holeY;
      if (hx * hx + hy * hy <= holeR * holeR) col = mix(CARD_B, STEEL, glow);
      else if (Math.abs(hx) < 2.2 && hy > 0 && hy < 12) col = mix(CARD_B, STEEL, glow * 0.8);
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

export function hatShIcon() {
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

// Store cover: the encrypt card, painted as RGBA PNG. No canvas, no sharp —
// zlib is built into Node. Deterministic, so builds reproduce.
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

// 5×7 caps. Bit 4 is the left column.
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
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  '+': [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
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
  const rr = (x0, y0, x1, y1, rad, r, g, b) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
      const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
    }
  };

  fill(0, 0, W, H, 11, 16, 32);
  // left: lock + name
  const cx = 250, cy = 310;
  rr(cx - 70, cy - 10, cx + 70, cy + 120, 18, 232, 196, 96);
  for (let y = cy - 90; y < cy + 10; y++) for (let x = cx - 50; x < cx + 50; x++) {
    const sx = x - cx, sy = y - (cy - 20);
    const d = Math.sqrt(sx * sx + sy * sy);
    if (d > 28 && d < 42 && sy < 8) put(x, y, 236, 220, 150);
  }
  for (let y = cy + 28; y < cy + 78; y++) for (let x = cx - 12; x < cx + 12; x++) {
    const hx = x - cx, hy = y - (cy + 42);
    if (hx * hx + hy * hy <= 100 || (Math.abs(hx) < 6 && hy > 0 && hy < 32)) put(x, y, 12, 16, 30);
  }
  drawText(put, 154, 470, 'HAT.SH', 6, 238, 241, 248);
  drawText(put, 90, 530, 'ENCRYPT IN THIS TAB', 3, 154, 166, 195);
  drawText(put, 118, 568, 'NOTHING LEAVES', 3, 154, 166, 195);

  // right: encrypt card
  rr(520, 70, 1140, 650, 22, 20, 28, 48);
  rr(560, 100, 720, 148, 18, 107, 140, 255);
  rr(740, 100, 900, 148, 18, 20, 28, 48);
  rr(920, 100, 1060, 148, 18, 20, 28, 48);
  drawText(put, 582, 114, 'ENCRYPT', 3, 8, 16, 31);
  drawText(put, 760, 114, 'DECRYPT', 3, 154, 166, 195);
  drawText(put, 950, 114, 'KEYS', 3, 154, 166, 195);

  // drop zone
  rr(560, 180, 1100, 340, 16, 12, 18, 34);
  drawText(put, 700, 230, 'DROP FILES HERE', 3, 238, 241, 248);
  drawText(put, 690, 274, 'EACH FILE BECOMES A', 2, 154, 166, 195);
  drawText(put, 760, 300, '.ENC', 3, 107, 140, 255);

  // password fields
  drawText(put, 560, 370, 'PASSWORD  12+ CHARACTERS', 2, 154, 166, 195);
  rr(560, 392, 1100, 440, 10, 12, 18, 34);
  drawText(put, 560, 460, 'CONFIRM', 2, 154, 166, 195);
  rr(560, 482, 1100, 530, 10, 12, 18, 34);
  rr(560, 560, 820, 620, 12, 107, 140, 255);
  drawText(put, 610, 578, 'ENCRYPT', 3, 8, 16, 31);

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
