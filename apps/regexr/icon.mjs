// Procedural RegExr sticker: /(\\d+)/ matching digits that light up.
// Cover is the dark tester mid-use with the default capitalized-word pattern.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 8;
const CARD = [28, 32, 38];
const INK = [232, 234, 237];
const ACC = [112, 176, 224];
const MATCH = [255, 210, 70];
const QUANT = [240, 160, 96];
const GROUP = [141, 204, 141];
const OUTL = [12, 14, 18];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
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
  for (const b of [CARD, INK, ACC, MATCH, QUANT, GROUP, OUTL]) {
    for (let s = 0; s <= 2; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
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

const GLYPH = {
  '/': [0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b10000, 0b10000],
  '(': [0b00110, 0b01000, 0b10000, 0b10000, 0b10000, 0b01000, 0b00110],
  ')': [0b01100, 0b00010, 0b00001, 0b00001, 0b00001, 0b00010, 0b01100],
  '\\': [0b10000, 0b10000, 0b01000, 0b00100, 0b00100, 0b00010, 0b00001],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  '+': [0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0, 0],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  1: [0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  3: [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  5: [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  6: [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '[': [0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110],
  ']': [0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '$': [0b00100, 0b01111, 0b10100, 0b01110, 0b00101, 0b11110, 0b00100],
  '*': [0b00100, 0b10101, 0b01110, 0b00100, 0b01110, 0b10101, 0],
  '?': [0b01110, 0b10001, 0b00001, 0b00110, 0b00100, 0, 0b00100],
  '|': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  '^': [0b00100, 0b01010, 0b10001, 0, 0, 0, 0],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  ',': [0, 0, 0, 0, 0b00100, 0b00100, 0b01000],
  ':': [0, 0b00100, 0b00100, 0, 0b00100, 0b00100, 0],
  '&': [0b01100, 0b10010, 0b10100, 0b01000, 0b10101, 0b10010, 0b01101],
};

function stamp(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const gph = GLYPH[ch] || GLYPH[ch.toUpperCase()];
    if (!gph) { cx += 6 * s; continue; }
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (gph[row] & (1 << (4 - col))) {
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
      }
    }
    cx += 6 * s;
  }
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const lit = f % 2 === 0;
  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inRound(x, y, 8, 8, 120, 120, 22)) continue;
      let col = mix(CARD, [18, 20, 24], (y - 8) / 112);
      const ring = inRound(x, y, 8, 8, 120, 120, 22) && !inRound(x, y, 11, 11, 117, 117, 20);
      if (ring) col = OUTL;
      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }
  const put = (x, y, r, g, b) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= OUT || y >= OUT) return;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      if (!rgba[o + 3]) continue;
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 1;
    }
  };
  // /(\\d+)/g
  stamp(put, 18, 28, '/', 2, ACC[0], ACC[1], ACC[2]);
  stamp(put, 30, 28, '(', 2, GROUP[0], GROUP[1], GROUP[2]);
  stamp(put, 42, 28, '\\D', 2, QUANT[0], QUANT[1], QUANT[2]);
  stamp(put, 66, 28, '+', 2, QUANT[0], QUANT[1], QUANT[2]);
  stamp(put, 78, 28, ')', 2, GROUP[0], GROUP[1], GROUP[2]);
  stamp(put, 90, 28, '/', 2, ACC[0], ACC[1], ACC[2]);
  stamp(put, 102, 28, 'G', 2, ACC[0], ACC[1], ACC[2]);

  stamp(put, 22, 62, 'ABC', 3, INK[0], INK[1], INK[2]);
  const nCol = lit ? MATCH : INK;
  stamp(put, 58, 62, '12', 3, nCol[0], nCol[1], nCol[2]);
  stamp(put, 82, 62, 'XY', 3, INK[0], INK[1], INK[2]);
  const nCol2 = (f % 4 >= 2) ? MATCH : INK;
  stamp(put, 22, 86, '34', 3, nCol2[0], nCol2[1], nCol2[2]);
  stamp(put, 46, 86, 'ZZ', 3, INK[0], INK[1], INK[2]);

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = SS * SS;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
        r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
      }
      if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
      idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
    }
  }
  return idx;
}

export function regexrIcon() {
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
    minCodeSize: 6, frames, delayCs: 12, transparentIndex: 0
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
  fill(0, 0, W, H, 28, 32, 38);
  fill(0, 0, W, 52, 44, 48, 54);
  stamp(put, 24, 16, 'REGEXR', 3, 112, 176, 224);
  stamp(put, 220, 20, 'EXPRESSION', 2, 154, 160, 166);
  stamp(put, 900, 20, '8 MATCHES  0.4MS', 2, 141, 204, 141);

  fill(0, 52, W, 128, 22, 24, 28);
  stamp(put, 24, 72, '/([A-Z])\\W+/G', 3, 141, 204, 141);
  fill(24, 108, 52, 118, 240, 160, 96);
  stamp(put, 64, 108, 'G I M S U Y', 2, 112, 176, 224);

  fill(0, 128, 860, 520, 22, 24, 28);
  const lines = [
    ['REGEXR WAS CREATED BY GSKINNER.COM.', [0, 6]],
    ['EDIT THE EXPRESSION & TEXT TO SEE MATCHES.', [0, 4]],
    ['ROLL OVER MATCHES OR THE EXPRESSION FOR DETAILS.', [0, 4]],
    ['THIS COPY RUNS JAVASCRIPT REGEXP IN THIS TAB.', [0, 4]],
    ['THE SIDE BAR INCLUDES A CHEATSHEET.', [0, 3]],
    ['PRESS INVITE TO SHARE THE PATTERN.', [0, 5]],
    ['REPLACE & LIST OUTPUT CUSTOM RESULTS.', [0, 7]],
    ['DETAILS LISTS CAPTURE GROUPS.', [0, 7]],
    ['EXPLAIN DESCRIBES YOUR EXPRESSION.', [0, 7]],
  ];
  let y = 148;
  for (const [txt, span] of lines) {
    stamp(put, 28, y, txt, 2, INK[0], INK[1], INK[2]);
    const hit = txt.slice(span[0], span[1]);
    fill(26, y - 3, 28 + hit.length * 12 + 4, y + 17, 90, 72, 16);
    stamp(put, 28, y, txt, 2, INK[0], INK[1], INK[2]);
    stamp(put, 28 + span[0] * 12, y, hit, 2, MATCH[0], MATCH[1], MATCH[2]);
    y += 36;
  }

  fill(0, 520, 860, 720, 37, 40, 46);
  stamp(put, 24, 536, 'TOOLS   REPLACE   LIST   DETAILS   EXPLAIN', 2, 112, 176, 224);
  stamp(put, 24, 580, 'REPLACE WITH  $1', 2, 154, 160, 166);
  stamp(put, 24, 624, 'R  E  T  T  T  P  R  D  E', 3, 255, 210, 70);
  stamp(put, 24, 668, 'CAPTURE GROUP 1 OF EACH MATCH', 2, 154, 160, 166);

  fill(860, 128, 1200, 720, 37, 40, 46);
  stamp(put, 880, 148, 'CHEATSHEET', 2, 112, 176, 224);
  const cheat = [
    ['.', 'ANY CHAR'],
    ['\\W \\D \\S', 'WORD DIGIT SPACE'],
    ['[ABC]', 'ANY OF A B C'],
    ['^ABC$', 'START / END'],
    ['(ABC)', 'CAPTURE GROUP'],
    ['\\1', 'BACKREF'],
    ['A* A+ A?', 'QUANTIFIERS'],
    ['AB|CD', 'ALTERNATION'],
  ];
  y = 190;
  for (const [t, d] of cheat) {
    stamp(put, 880, y, t, 2, 240, 160, 96);
    stamp(put, 880, y + 22, d, 2, 154, 160, 166);
    y += 52;
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
