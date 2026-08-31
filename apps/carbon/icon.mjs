// Procedural Carbon icon: a sticker window that types syntax-coloured
// bars. Cover is the grey field + Seti + the default snippet, mid-use.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 8;

const GRAY = [171, 184, 195];
const WIN = [21, 23, 24];
const KW = [230, 205, 105];
const STR = [85, 181, 219];
const PROP = [160, 116, 196];
const NUM = [205, 63, 69];
const INK = [207, 210, 209];
const DOT_R = [255, 95, 86];
const DOT_Y = [255, 189, 46];
const DOT_G = [39, 201, 63];
const OUTL = [18, 18, 18];

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
  for (const b of [GRAY, WIN, KW, STR, PROP, NUM, INK, DOT_R, DOT_Y, DOT_G, OUTL]) {
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

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = 0.2 + 0.8 * (f / (FRAMES - 1));
  const lines = [
    { y: 52, w: 78, c: KW },
    { y: 64, w: 58, c: STR },
    { y: 76, w: 70, c: PROP },
    { y: 88, w: 44, c: NUM },
  ];
  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inRound(x, y, 8, 8, 120, 120, 22)) continue;
      let col = GRAY;
      const inWin = inRound(x, y, 20, 28, 108, 108, 8);
      const ring = inRound(x, y, 19, 27, 109, 109, 9) && !inWin;
      if (ring) col = OUTL;
      else if (inWin) {
        col = WIN;
        const dots = [[32, 38, DOT_R], [44, 38, DOT_Y], [56, 38, DOT_G]];
        for (const d of dots) {
          const dx = x - d[0], dy = y - d[1];
          if (dx * dx + dy * dy <= 3.4 * 3.4) col = d[2];
        }
        for (let i = 0; i < lines.length; i++) {
          const ln = lines[i];
          const grow = Math.max(0, Math.min(1, t * 1.35 - i * 0.18));
          const w = ln.w * grow;
          if (x >= 28 && x <= 28 + w && y >= ln.y && y <= ln.y + 6) col = ln.c;
        }
      } else col = mix(GRAY, [140, 152, 162], (y - 8) / 112);
      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = SS * SS;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
          r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
        }
      }
      if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
      idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
    }
  }
  return idx;
}

export function carbonIcon() {
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

const GLYPHS = {
  a: [0, 0b01110, 0b00001, 0b01111, 0b10001, 0b01111, 0],
  b: [0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b11110, 0],
  c: [0, 0b01110, 0b10000, 0b10000, 0b10000, 0b01110, 0],
  d: [0b00001, 0b00001, 0b01111, 0b10001, 0b10001, 0b01111, 0],
  e: [0, 0b01110, 0b10001, 0b11111, 0b10000, 0b01110, 0],
  f: [0b00110, 0b01000, 0b11110, 0b01000, 0b01000, 0b01000, 0],
  g: [0, 0b01111, 0b10001, 0b10001, 0b01111, 0b00001, 0b01110],
  h: [0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0],
  i: [0b00100, 0, 0b01100, 0b00100, 0b00100, 0b01110, 0],
  j: [0b00010, 0, 0b00110, 0b00010, 0b00010, 0b01100, 0],
  k: [0b10000, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0],
  l: [0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110, 0],
  m: [0, 0b11010, 0b10101, 0b10101, 0b10101, 0b10101, 0],
  n: [0, 0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0],
  o: [0, 0b01110, 0b10001, 0b10001, 0b10001, 0b01110, 0],
  p: [0, 0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000],
  q: [0, 0b01111, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001],
  r: [0, 0b10110, 0b11000, 0b10000, 0b10000, 0b10000, 0],
  s: [0, 0b01111, 0b10000, 0b01110, 0b00001, 0b11110, 0],
  t: [0b01000, 0b11110, 0b01000, 0b01000, 0b01000, 0b00110, 0],
  u: [0, 0b10001, 0b10001, 0b10001, 0b10001, 0b01111, 0],
  v: [0, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100, 0],
  w: [0, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010, 0],
  x: [0, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0],
  y: [0, 0b10001, 0b10001, 0b10001, 0b01111, 0b00001, 0b01110],
  z: [0, 0b11111, 0b00010, 0b00100, 0b01000, 0b11111, 0],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '.': [0, 0, 0, 0, 0, 0b00100, 0],
  ',': [0, 0, 0, 0, 0, 0b00100, 0b01000],
  "'": [0b00100, 0b00100, 0, 0, 0, 0, 0],
  '=': [0, 0, 0b11111, 0, 0b11111, 0, 0],
  '>': [0, 0b01000, 0b00100, 0b00010, 0b00100, 0b01000, 0],
  '(': [0b00100, 0b01000, 0b10000, 0b10000, 0b10000, 0b01000, 0b00100],
  ')': [0b00100, 0b00010, 0b00001, 0b00001, 0b00001, 0b00010, 0b00100],
  '{': [0b00110, 0b01000, 0b01000, 0b10000, 0b01000, 0b01000, 0b00110],
  '}': [0b01100, 0b00010, 0b00010, 0b00001, 0b00010, 0b00010, 0b01100],
  '[': [0b11100, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11100],
  ']': [0b00111, 0b00001, 0b00001, 0b00001, 0b00001, 0b00001, 0b00111],
  '?': [0b01110, 0b10001, 0b00010, 0b00100, 0, 0b00100, 0],
  ':': [0, 0b00100, 0, 0, 0b00100, 0, 0],
  '+': [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  '*': [0, 0b10101, 0b01110, 0b00100, 0b01110, 0b10101, 0],
  '/': [0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b10000, 0],
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
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
};

function putPix(rgba, W, H, x, y, r, g, b) {
  x = x | 0; y = y | 0;
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 4;
  rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
}
function fillRound(put, x0, y0, x1, y1, r, cr, cg, cb) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (inRound(x, y, x0, y0, x1, y1, r)) put(x, y, cr, cg, cb);
    }
  }
}
function drawChar(put, ch, x, y, s, r, g, b) {
  const gph = GLYPHS[ch] || GLYPHS[' '];
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 5; col++) {
      if (gph[row] & (1 << (4 - col))) {
        for (let dy = 0; dy < s; dy++) {
          for (let dx = 0; dx < s; dx++) put(x + col * s + dx, y + row * s + dy, r, g, b);
        }
      }
    }
  }
}
function drawRuns(put, x, y, s, runs) {
  let cx = x;
  for (const run of runs) {
    const [rr, gg, bb] = run.c;
    for (const ch of run.t) {
      drawChar(put, ch, cx, y, s, rr, gg, bb);
      cx += 6 * s;
    }
  }
  return cx;
}

const C = {
  kw: [230, 205, 105],
  def: [85, 181, 219],
  op: [159, 202, 86],
  var: [207, 210, 209],
  prop: [160, 116, 196],
  str: [85, 181, 219],
  num: [205, 63, 69],
};

export function screenshotPng() {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b) => putPix(rgba, W, H, x, y, r, g, b);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 171, 184, 195);

  const wx = 70, wy = 118, ww = 1060, wh = 456;
  for (let i = 18; i >= 0; i--) {
    const a = Math.round(28 * (1 - i / 18));
    fillRound(put, wx - 2, wy + 6 + i, wx + ww + 2, wy + wh + 12 + i, 8,
      Math.round(30 + a), Math.round(32 + a), Math.round(34 + a));
  }
  fillRound(put, wx, wy, wx + ww, wy + wh, 8, 21, 23, 24);

  const dots = [[wx + 28, wy + 28, DOT_R], [wx + 52, wy + 28, DOT_Y], [wx + 76, wy + 28, DOT_G]];
  for (const d of dots) {
    for (let y = -7; y <= 7; y++) {
      for (let x = -7; x <= 7; x++) {
        if (x * x + y * y <= 49) put(d[0] + x, d[1] + y, d[2][0], d[2][1], d[2][2]);
      }
    }
  }

  const s = 2;
  const x0 = wx + 32;
  let y = wy + 70;
  const gap = 7 * s + 12;
  const L = [
    [
      { t: 'const ', c: C.kw }, { t: 'pluckDeep ', c: C.def }, { t: '= ', c: C.op },
      { t: 'key ', c: C.var }, { t: '=> ', c: C.op }, { t: 'obj ', c: C.var }, { t: '=> ', c: C.op },
      { t: 'key', c: C.var }, { t: '.', c: C.op }, { t: 'split', c: C.prop }, { t: '(', c: C.var },
      { t: "'.'", c: C.str }, { t: ').', c: C.var }, { t: 'reduce', c: C.prop },
      { t: '((accum, key) ', c: C.var }, { t: '=> ', c: C.op }, { t: 'accum[key], obj)', c: C.var },
    ],
    [{ t: '', c: C.var }],
    [
      { t: 'const ', c: C.kw }, { t: 'compose ', c: C.def }, { t: '= (', c: C.op },
      { t: '...fns) ', c: C.var }, { t: '=> ', c: C.op }, { t: 'res ', c: C.var }, { t: '=> ', c: C.op },
      { t: 'fns.', c: C.var }, { t: 'reduce', c: C.prop }, { t: '((accum, next) ', c: C.var },
      { t: '=> ', c: C.op }, { t: 'next(accum), res)', c: C.var },
    ],
    [{ t: '', c: C.var }],
    [
      { t: 'const ', c: C.kw }, { t: 'unfold ', c: C.def }, { t: '= (f, seed) ', c: C.var },
      { t: '=> ', c: C.op }, { t: '{', c: C.var },
    ],
    [
      { t: '  const ', c: C.kw }, { t: 'go ', c: C.def }, { t: '= (f, seed, acc) ', c: C.var },
      { t: '=> ', c: C.op }, { t: '{', c: C.var },
    ],
    [
      { t: '    const ', c: C.kw }, { t: 'res ', c: C.def }, { t: '= f(seed)', c: C.var },
    ],
    [
      { t: '    return ', c: C.kw }, { t: 'res ', c: C.var }, { t: '? ', c: C.op },
      { t: 'go(f, res[', c: C.var }, { t: '1', c: C.num }, { t: '], acc.', c: C.var },
      { t: 'concat', c: C.prop }, { t: '([res[', c: C.var }, { t: '0', c: C.num }, { t: ']])) : acc', c: C.var },
    ],
    [{ t: '  }', c: C.var }],
    [
      { t: '  return ', c: C.kw }, { t: 'go(f, seed, [])', c: C.var },
    ],
    [{ t: '}', c: C.var }],
  ];
  for (const runs of L) {
    if (runs[0].t) drawRuns(put, x0, y, s, runs);
    y += gap;
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
