// Procedural Bitsy icon: a rounded card holding a tiny blue room and the
// classic cat, stepping in place. Super-sample → box-downsample → small
// palette; deterministic so GIF builds reproduce.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [10, 22, 48];
const CARD_B = [6, 14, 32];
const BLUE = [0, 82, 204];
const TILE = [128, 159, 255];
const WHITE = [255, 255, 255];
const PINK = [230, 67, 125];
const GOLD = [235, 191, 77];
const INK = [244, 239, 232];

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
  for (const b of [CARD_A, CARD_B, BLUE, TILE, WHITE, PINK, GOLD, INK]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.28).map(Math.round));
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

const BLOCK = [
  '11111111',
  '10000001',
  '10000001',
  '10011001',
  '10011001',
  '10000001',
  '10000001',
  '11111111',
];
const CAT_A = [
  '00000000',
  '00000000',
  '01010001',
  '01110001',
  '01110010',
  '01111100',
  '00111100',
  '00100100',
];
const CAT_B = [
  '00000000',
  '00000000',
  '01010001',
  '01110001',
  '01110010',
  '01111100',
  '00111100',
  '01000010',
];
const AVA = [
  '00011000',
  '00011000',
  '00011000',
  '00111100',
  '01111110',
  '10111101',
  '00100100',
  '00100100',
];

function blit8(put, sprite, ox, oy, px, fg, bg) {
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const on = sprite[y][x] === '1';
    const col = on ? fg : bg;
    for (let dy = 0; dy < px; dy++) for (let dx = 0; dx < px; dx++) {
      put(ox + x * px + dx, oy + y * px + dy, col[0], col[1], col[2]);
    }
  }
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const cat = (f % 4) < 2 ? CAT_A : CAT_B;
  const walk = ((f / 2) | 0) % 2;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      const pad = 22, span = OUT - pad * 2, cell = span / 16;
      const gx = Math.floor((x - pad) / cell), gy = Math.floor((y - pad) / cell);
      if (gx >= 0 && gx < 16 && gy >= 0 && gy < 16) {
        const wall = gx === 0 || gy === 0 || gx === 15 || gy === 15;
        col = wall ? TILE : BLUE;
      }
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }
  const put = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= OUT || y >= OUT) return;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 1;
    }
  };
  const px = 5;
  const origin = 22 + (16 - 8) * ((OUT - 44) / 16) / 2;
  blit8(put, BLOCK, 22 + 1 * 5.25, 22 + 1 * 5.25, 5, TILE, BLUE);
  blit8(put, AVA, 36, 48, px, WHITE, BLUE);
  blit8(put, cat, 58 + walk * 2, 72, px, WHITE, BLUE);

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, aa = 0, n = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; aa += rgba[o + 3];
    }
    if (aa / n < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}

export function bitsyIcon() {
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
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
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

  fill(0, 0, W, H, 10, 22, 48);
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const c = mix([10, 22, 48], [6, 14, 32], t);
    for (let x = 0; x < W; x++) put(x, y, c[0], c[1], c[2]);
  }

  drawText(put, 48, 48, 'BITSY', 12, 244, 239, 232);
  drawText(put, 48, 160, 'A TINY WORLD', 4, 128, 159, 255);
  drawText(put, 48, 210, 'WALK AROUND', 4, 244, 239, 232);
  fill(48, 270, 340, 322, 230, 67, 125);
  drawText(put, 64, 282, 'SHARE THE WORLD', 3, 244, 239, 232);
  drawText(put, 48, 360, 'MAKE A ROOM', 3, 235, 191, 77);
  drawText(put, 48, 410, 'WRITE WHAT THEY SAY', 3, 235, 191, 77);
  drawText(put, 48, 640, 'UNOFFICIAL PORT', 3, 110, 130, 170);

  const cell = 28;
  const ox = 560, oy = 80, n = 16;
  for (let iy = 0; iy < n; iy++) for (let ix = 0; ix < n; ix++) {
    const wall = ix === 0 || iy === 0 || ix === 15 || iy === 15;
    const col = wall ? TILE : BLUE;
    fill(ox + ix * cell, oy + iy * cell, ox + (ix + 1) * cell, oy + (iy + 1) * cell, col[0], col[1], col[2]);
  }
  const px = cell;
  function stamp(sprite, sx, sy, fg) {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      if (sprite[y][x] !== '1') continue;
      const x0 = ox + sx * cell + Math.floor(x * cell / 8);
      const y0 = oy + sy * cell + Math.floor(y * cell / 8);
      const x1 = ox + sx * cell + Math.floor((x + 1) * cell / 8);
      const y1 = oy + sy * cell + Math.floor((y + 1) * cell / 8);
      fill(x0, y0, x1, y1, fg[0], fg[1], fg[2]);
    }
  }
  stamp(AVA, 4, 4, WHITE);
  stamp(CAT_A, 8, 12, WHITE);
  stamp(BLOCK, 1, 1, TILE);

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
