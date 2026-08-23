// Procedural icon: a dark card, a keyboard, keys lighting as if typed.
// Pure Node, super-sample → box-downsample. Deterministic.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [22, 22, 30];
const CARD_B = [10, 10, 15];
const KEY = [36, 36, 48];
const KEY_D = [24, 24, 34];
const INK = [210, 210, 220];
const AMBER = [255, 193, 74];
const AMBER_H = [255, 230, 160];
const OK = [125, 255, 179];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function inRound(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  if (x >= x0 + r && x <= x1 - r) return true;
  if (y >= y0 + r && y <= y1 - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, KEY, KEY_D, INK, AMBER, AMBER_H, OK]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
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

// Mini QWERTY. Sequence spells home-row then "TYPE" — keys light as if typed.
const ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
];
const PRESS = ['A', 'S', 'D', 'F', 'J', 'K', 'L', 'T', 'Y', 'P', 'E', 'A'];

function keyBox(row, col) {
  const keyW = 9.4, keyH = 11, gap = 1.4;
  const rowN = ROWS[row].length;
  const totalW = rowN * keyW + (rowN - 1) * gap;
  const x0 = (OUT - totalW) / 2 + (row === 1 ? 3 : row === 2 ? 8 : 0);
  const y0 = 38 + row * (keyH + gap);
  return { x0: x0 + col * (keyW + gap), y0, x1: x0 + col * (keyW + gap) + keyW, y1: y0 + keyH };
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 7, rad = 20;
  const pressed = PRESS[f % PRESS.length];
  const prev = PRESS[(f + PRESS.length - 1) % PRESS.length];
  const prev2 = PRESS[(f + PRESS.length - 2) % PRESS.length];

  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      // space bar
      if (inRound(x, y, 38, 78, 90, 90, 3)) col = KEY.slice();
      for (let r = 0; r < ROWS.length; r++) {
        for (let c = 0; c < ROWS[r].length; c++) {
          const b = keyBox(r, c);
          if (inRound(x, y, b.x0, b.y0, b.x1, b.y1, 1.6)) {
            const letter = ROWS[r][c];
            if (letter === pressed) col = mix(AMBER_H, AMBER, (x - b.x0) / (b.x1 - b.x0));
            else if (letter === prev) col = mix(AMBER, KEY, 0.45);
            else if (letter === prev2) col = mix(AMBER, KEY, 0.75);
            else col = mix(KEY, KEY_D, ((x + y) % 7) > 4 ? 0.3 : 0);
            // letter nibble
            const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
            if (Math.abs(x - cx) < 1.1 && Math.abs(y - cy) < 1.4) {
              col = letter === pressed ? CARD_B.slice() : INK.slice();
            }
          }
        }
      }
      if (inRound(x, y, 38, 78, 90, 90, 3) && pressed === ' ') col = AMBER.slice();
      // caret tick at the top
      if (y > 18 && y < 28 && x > 24 && x < 104) {
        const caretX = 24 + ((f % 8) / 7) * 72;
        if (Math.abs(x - caretX) < 1.2) col = AMBER.slice();
        else if (x < caretX) col = mix(OK, CARD_A, 0.55);
        else col = mix(INK, CARD_A, 0.7);
      }
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
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

export function typingIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 9, transparentIndex: 0 };
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
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  ',': [0, 0, 0, 0, 0b00100, 0b00100, 0b01000],
  ';': [0, 0, 0b00100, 0, 0b00100, 0b00100, 0b01000],
  ':': [0, 0, 0b00100, 0, 0, 0b00100, 0],
  "'": [0b00100, 0b00100, 0, 0, 0, 0, 0],
  '%': [0b10001, 0b10010, 0b00100, 0b00100, 0b00100, 0b01001, 0b10001],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '6': [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
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
  const rr = (x0, y0, x1, y1, rad, r, g, b) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
      const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
    }
  };

  // never-empty first boot: dark page, stats, a passage mid-type with a caret
  fill(0, 0, W, H, 10, 10, 15);
  drawText(put, 64, 36, 'TYPING', 6, 255, 193, 74);

  rr(64, 108, 280, 228, 16, 20, 20, 28);
  drawText(put, 92, 124, '62', 8, 255, 193, 74);
  drawText(put, 92, 196, 'WPM', 3, 122, 122, 144);

  rr(300, 108, 516, 228, 16, 20, 20, 28);
  drawText(put, 328, 124, '98', 8, 125, 255, 179);
  drawText(put, 328, 196, 'ACC', 3, 122, 122, 144);

  rr(536, 108, 780, 228, 16, 20, 20, 28);
  drawText(put, 564, 124, '0:18', 7, 232, 232, 240);
  drawText(put, 564, 196, 'TIME', 3, 122, 122, 144);

  rr(64, 252, 1136, 668, 20, 20, 20, 28);

  const lines = [
    'THE HOME ROW IS WHERE YOUR FINGERS REST.',
    'ASDF JKL; EIGHT KEYS, EVERY TIME.',
    'SPEED COMES LATER; FIRST THE HANDS LEARN',
    'WHERE EACH LETTER LIVES.',
  ];
  // first two lines typed (white), amber caret on SPEED, rest muted
  const s = 4, x0 = 96;
  for (let i = 0; i < lines.length; i++) {
    const y = 296 + i * 72;
    if (i < 2) {
      drawText(put, x0, y, lines[i], s, 232, 232, 240);
    } else if (i === 2) {
      const cw = 5 * 6 * s;
      fill(x0 - 6, y - 10, x0 + cw + 4, y + 7 * s + 8, 255, 193, 74);
      drawText(put, x0, y, 'SPEED', s, 26, 18, 6);
      drawText(put, x0 + 6 * 6 * s, y, 'COMES LATER; FIRST THE HANDS LEARN', s, 90, 90, 114);
    } else {
      drawText(put, x0, y, lines[i], s, 90, 90, 114);
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
