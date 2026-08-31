// Procedural Monaco Code icon: a VS Code window that types syntax, then a
// second caret arrives (pair). Cover is mid-use hello.ts, not an empty boot.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [18, 18, 20];
const WIN = [30, 30, 30];
const SIDE = [37, 37, 38];
const INK = [212, 212, 212];
const KW = [86, 156, 214];
const STR = [206, 145, 120];
const FN = [220, 220, 170];
const NUM = [181, 206, 168];
const ACC = [0, 122, 204];
const PAIR = [241, 76, 76];
const OUTL = [8, 8, 10];
const TAB = [45, 45, 45];

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
  for (const b of [CARD, WIN, SIDE, INK, KW, STR, FN, NUM, ACC, PAIR, OUTL, TAB]) {
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
  const t = f / (FRAMES - 1);
  const blink = (f % 4) < 3;
  const pairOn = f >= 6;
  const lines = [
    { y: 44, x0: 42, w: 62, c: KW, from: 0.00 },
    { y: 56, x0: 42, w: 48, c: FN, from: 0.12 },
    { y: 68, x0: 50, w: 54, c: STR, from: 0.28 },
    { y: 80, x0: 50, w: 40, c: NUM, from: 0.44 },
    { y: 92, x0: 42, w: 28, c: KW, from: 0.60 }
  ];
  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inRound(x, y, 8, 8, 120, 120, 18)) continue;
      let col = CARD;
      const ring = inRound(x, y, 8, 8, 120, 120, 18) && !inRound(x, y, 11, 11, 117, 117, 16);
      if (ring) { col = OUTL; }
      else {
        if (y < 28) col = SIDE;
        if (x < 36 && y >= 28) col = SIDE;
        if (x >= 36 && y >= 28) col = WIN;
        if (y >= 28 && y < 40 && x >= 36 && x < 78) col = TAB;
        if (y >= 28 && y < 40 && x >= 40 && x < 72) col = mix(TAB, ACC, 0.35);
        if (x >= 16 && x < 32 && y >= 36 && y < 42) col = ACC;
        if (x >= 16 && x < 30 && y >= 48 && y < 54) col = INK;
        if (x >= 16 && x < 28 && y >= 60 && y < 66) col = mix(INK, SIDE, 0.4);
        if (x >= 16 && x < 34 && y >= 72 && y < 78) col = mix(INK, SIDE, 0.4);
        for (let i = 0; i < lines.length; i++) {
          const ln = lines[i];
          const grow = Math.max(0, Math.min(1, (t - ln.from) / 0.22));
          const w = ln.w * grow;
          if (grow > 0 && x >= ln.x0 && x <= ln.x0 + w && y >= ln.y && y <= ln.y + 7) col = ln.c;
        }
        if (blink && x >= 90 && x < 92 && y >= 80 && y < 96) col = INK;
        if (pairOn && x >= 58 && x < 60 && y >= 56 && y < 72) col = PAIR;
        if (pairOn && x >= 60 && x < 78 && y >= 50 && y < 58) col = PAIR;
      }
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

export function monacoCodeIcon() {
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
    minCodeSize: 6, frames, delayCs: 10, transparentIndex: 0
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
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  a: [0, 0b01110, 0b00001, 0b01111, 0b10001, 0b01111, 0],
  b: [0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b11110, 0],
  c: [0, 0b01110, 0b10000, 0b10000, 0b10000, 0b01110, 0],
  d: [0b00001, 0b00001, 0b01111, 0b10001, 0b10001, 0b01111, 0],
  e: [0, 0b01110, 0b10001, 0b11111, 0b10000, 0b01110, 0],
  f: [0b00110, 0b01000, 0b11100, 0b01000, 0b01000, 0b01000, 0],
  g: [0, 0b01111, 0b10001, 0b01111, 0b00001, 0b01110, 0],
  h: [0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0],
  i: [0b00100, 0, 0b01100, 0b00100, 0b00100, 0b01110, 0],
  j: [0b00010, 0, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  k: [0b10000, 0b10000, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010],
  l: [0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110, 0],
  m: [0, 0b11010, 0b10101, 0b10101, 0b10101, 0b10101, 0],
  n: [0, 0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0],
  o: [0, 0b01110, 0b10001, 0b10001, 0b10001, 0b01110, 0],
  p: [0, 0b11110, 0b10001, 0b11110, 0b10000, 0b10000, 0],
  q: [0, 0b01111, 0b10001, 0b01111, 0b00001, 0b00001, 0],
  r: [0, 0b10110, 0b11000, 0b10000, 0b10000, 0b10000, 0],
  s: [0, 0b01111, 0b10000, 0b01110, 0b00001, 0b11110, 0],
  t: [0b00100, 0b01110, 0b00100, 0b00100, 0b00100, 0b00010, 0],
  u: [0, 0b10001, 0b10001, 0b10001, 0b10011, 0b01101, 0],
  v: [0, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100, 0],
  w: [0, 0b10001, 0b10001, 0b10101, 0b10101, 0b01010, 0],
  x: [0, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0],
  y: [0, 0b10001, 0b10001, 0b01111, 0b00001, 0b01110, 0],
  z: [0, 0b11111, 0b00010, 0b00100, 0b01000, 0b11111, 0],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0],
  ',': [0, 0, 0, 0, 0b00100, 0b00100, 0b01000],
  ':': [0, 0b00100, 0, 0, 0b00100, 0, 0],
  ';': [0, 0b00100, 0, 0, 0b00100, 0b00100, 0b01000],
  '(': [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ')': [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  '{': [0b00110, 0b01000, 0b01000, 0b10000, 0b01000, 0b01000, 0b00110],
  '}': [0b01100, 0b00010, 0b00010, 0b00001, 0b00010, 0b00010, 0b01100],
  '[': [0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110],
  ']': [0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110],
  "'": [0b00100, 0b00100, 0, 0, 0, 0, 0],
  '`': [0b01000, 0b00100, 0, 0, 0, 0, 0],
  '=': [0, 0b11111, 0, 0b11111, 0, 0, 0],
  '-': [0, 0, 0b11111, 0, 0, 0, 0],
  '_': [0, 0, 0, 0b11111, 0, 0, 0],
  '?': [0b01110, 0b10001, 0b00010, 0b00100, 0, 0b00100, 0],
  '/': [0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b10000, 0],
  '*': [0b00100, 0b10101, 0b01110, 0b00100, 0b01110, 0b10101, 0],
  $: [0b00100, 0b01111, 0b10100, 0b01110, 0b00101, 0b11110, 0b00100],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100, 0],
  '+': [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
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
  kw: [86, 156, 214],
  fn: [220, 220, 170],
  str: [206, 145, 120],
  typ: [78, 201, 176],
  ink: [212, 212, 212],
  cmt: [106, 153, 85],
  num: [181, 206, 168],
  pun: [212, 212, 212]
};

export function screenshotPng() {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b) => putPix(rgba, W, H, x, y, r, g, b);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 30, 30, 30);

  fillRound(put, 0, 0, W - 1, 40, 0, 50, 50, 51);
  drawRuns(put, 18, 12, 2, [{ t: 'Monaco Code', c: [220, 220, 220] }]);
  drawRuns(put, 980, 12, 2, [{ t: 'Find  Format  New', c: [180, 180, 180] }]);

  for (let y = 41; y < H - 28; y++) {
    for (let x = 0; x < 220; x++) put(x, y, 37, 37, 38);
  }
  drawRuns(put, 18, 56, 2, [{ t: 'FILES', c: [140, 140, 140] }]);
  const side = [
    { t: 'hello.ts', on: true },
    { t: 'app.js', on: false },
    { t: 'data.json', on: false },
    { t: 'README.md', on: false }
  ];
  side.forEach((row, i) => {
    const y = 92 + i * 36;
    if (row.on) {
      for (let yy = y - 8; yy < y + 24; yy++) {
        for (let x = 0; x < 220; x++) put(x, yy, 55, 55, 61);
      }
    }
    drawRuns(put, 22, y, 2, [{ t: row.t, c: row.on ? [255, 255, 255] : [190, 190, 190] }]);
  });

  for (let y = 41; y < 76; y++) {
    for (let x = 220; x < W; x++) put(x, y, 37, 37, 38);
  }
  for (let y = 41; y < 76; y++) {
    for (let x = 220; x < 400; x++) put(x, y, 30, 30, 30);
  }
  drawRuns(put, 236, 52, 2, [{ t: 'hello.ts', c: [230, 230, 230] }]);
  drawRuns(put, 400, 52, 2, [{ t: 'README.md', c: [140, 140, 140] }]);

  const s = 2;
  const x0 = 268;
  let y = 100;
  const gap = 28;
  const L = [
    [{ t: '/** Pair-program from one invite. */', c: C.cmt }],
    [{ t: 'export type ', c: C.kw }, { t: 'Guest ', c: C.typ }, { t: '= { name: string; driving: boolean };', c: C.ink }],
    [{ t: '', c: C.ink }],
    [{ t: 'export function ', c: C.kw }, { t: 'greet', c: C.fn }, { t: '(who: ', c: C.ink }, { t: 'Guest', c: C.typ }, { t: '): ', c: C.ink }, { t: 'string', c: C.typ }, { t: ' {', c: C.ink }],
    [{ t: '  return who.driving', c: C.ink }],
    [{ t: '    ? ', c: C.ink }, { t: '`${who.name} is typing.`', c: C.str }],
    [{ t: '    : ', c: C.ink }, { t: '`Waiting for ${who.name}…`;', c: C.str }],
    [{ t: '}', c: C.ink }],
    [{ t: '', c: C.ink }],
    [{ t: 'const ', c: C.kw }, { t: 'you', c: C.fn }, { t: ': ', c: C.ink }, { t: 'Guest', c: C.typ }, { t: ' = { name: ', c: C.ink }, { t: "'you'", c: C.str }, { t: ', driving: true };', c: C.ink }],
    [{ t: 'console.log(greet(you));', c: C.ink }]
  ];
  let lineNo = 1;
  for (const runs of L) {
    drawRuns(put, 232, y, 2, [{ t: String(lineNo).padStart(2, ' '), c: [90, 90, 90] }]);
    if (runs[0].t) drawRuns(put, x0, y, s, runs);
    y += gap;
    lineNo++;
  }

  fillRound(put, 700, 300, 1148, 500, 6, 37, 37, 38);
  for (let y = 300; y <= 500; y++) put(700, y, 0, 122, 204);
  drawRuns(put, 720, 320, 2, [{ t: 'greet', c: C.fn }]);
  drawRuns(put, 720, 356, 2, [{ t: '(who: Guest): string', c: C.ink }]);
  drawRuns(put, 720, 400, 2, [{ t: 'function greet(who: Guest): string', c: [160, 160, 160] }]);
  drawRuns(put, 720, 444, 2, [{ t: 'Pair-program from one invite.', c: C.cmt }]);

  for (let yy = 212; yy < 248; yy++) put(455, yy, 241, 76, 76);
  fillRound(put, 457, 196, 545, 218, 3, 241, 76, 76);
  drawRuns(put, 465, 200, 2, [{ t: 'Alex', c: [255, 255, 255] }]);

  for (let y = H - 28; y < H; y++) {
    for (let x = 0; x < W; x++) put(x, y, 0, 122, 204);
  }
  drawRuns(put, 16, H - 22, 2, [{ t: 'TypeScript  Ln 11, Col 28', c: [255, 255, 255] }]);
  drawRuns(put, 780, H - 22, 2, [{ t: 'Alex is in this editor.', c: [255, 255, 255] }]);

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
