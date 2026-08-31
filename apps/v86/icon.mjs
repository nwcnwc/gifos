// CRT sticker: power LED, scan, A:\> cursor blink. Reads at 64px.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD_A = [18, 22, 16], CARD_B = [8, 10, 8];
const BEZEL = [42, 44, 38], BEZEL_D = [22, 24, 20];
const PHOS = [80, 255, 96], PHOS_D = [24, 90, 32];
const LED_OFF = [40, 20, 16], LED_ON = [255, 70, 40];
const INK = [12, 14, 12], GLASS = [6, 18, 8];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, BEZEL, BEZEL_D, PHOS, PHOS_D, LED_OFF, LED_ON, INK, GLASS]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
  }
  return pal;
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
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  if (x >= x0 + r && x <= x1 - r) return true;
  if (y >= y0 + r && y <= y1 - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

const GLYPH = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  C: [0b01111, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b01111],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  '\\': [0b10000, 0b10000, 0b01000, 0b00100, 0b00010, 0b00001, 0b00001],
  ':': [0b00000, 0b00100, 0b00100, 0b00000, 0b00100, 0b00100, 0b00000],
  '>': [0b01000, 0b00100, 0b00010, 0b00001, 0b00010, 0b00100, 0b01000],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  6: [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
};

function putGlyph(setPx, x, y, ch, s, col) {
  const g = GLYPH[ch];
  if (!g) return;
  for (let row = 0; row < 7; row++) {
    for (let colb = 0; colb < 5; colb++) {
      if (g[row] & (1 << (4 - colb))) {
        for (let dy = 0; dy < s; dy++) {
          for (let dx = 0; dx < s; dx++) setPx(x + colb * s + dx, y + row * s + dy, col);
        }
      }
    }
  }
}
function putStr(setPx, x, y, str, s, col) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    putGlyph(setPx, cx, y, ch, s, col);
    cx += 6 * s;
  }
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const set = (x, y, col) => {
    if (x < 0 || y < 0 || x >= OUT || y >= OUT) return;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
        rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
      }
    }
  };
  const power = f > 0;
  const cursor = power && (f % 2 === 0);
  const showDir = f >= 6;

  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      if (!inRoundRect(x, y, 8, 8, 120, 120, 18)) continue;
      let col = mix(CARD_A, CARD_B, y / OUT);
      if (inRoundRect(x, y, 14, 16, 114, 96, 10)) col = BEZEL;
      if (inRoundRect(x, y, 22, 24, 106, 86, 6)) {
        col = mix(INK, GLASS, 0.35 + 0.08 * Math.sin((y + f) * 0.4));
        if ((y + f) % 3 === 0) col = mix(col, [0, 0, 0], 0.18);
      }
      const dx = x - 100, dy = y - 106;
      if (dx * dx + dy * dy < 16) col = power ? LED_ON : LED_OFF;
      const o = ((y * SS) * RW + (x * SS)) * 4;
      rgba[o] = col[0]; // placeholder, filled via set below
      set(x, y, col);
    }
  }
  if (power) {
    putStr(set, 28, 36, 'V86', 2, PHOS);
    if (f >= 3) putStr(set, 28, 52, 'A:\\>', 2, PHOS);
    if (showDir) putStr(set, 28, 66, 'DIR', 2, PHOS_D);
    if (cursor) {
      for (let y = 52; y < 66; y++) for (let x = 76; x < 84; x++) set(x, y, PHOS);
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

export function v86Icon() {
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

const G2 = Object.assign({}, GLYPH, {
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  G: [0b01111, 0b10000, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  '.': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00100, 0b00100],
  '_': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b11111],
  '<': [0b00001, 0b00010, 0b00100, 0b01000, 0b00100, 0b00010, 0b00001],
  '/': [0b00001, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b10000],
  '-': [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
  ',': [0b00000, 0b00000, 0b00000, 0b00000, 0b00100, 0b00100, 0b01000],
  '(': [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ')': [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b01000],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
});

export function screenshotPng() {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b, a) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 10, 12, 10);
  // bezel
  for (let y = 40; y < 680; y++) {
    for (let x = 70; x < 1130; x++) {
      const t = (y - 40) / 640;
      put(x, y, 36 + t * 8, 38, 32);
    }
  }
  for (let y = 80; y < 620; y++) {
    for (let x = 110; x < 1090; x++) {
      const scan = (y % 3 === 0) ? 0 : 1;
      put(x, y, 2, 8 + scan * 4, 2);
    }
  }
  const set = (x, y, col) => put(x, y, col[0], col[1], col[2]);
  const green = [120, 255, 130];
  const dim = [60, 160, 70];
  const lines = [
    [140, 110, 'Welcome to FreeDOS  (www.freedos.org)', green],
    [140, 140, 'A PC inside a GIF. The floppy is the save.', dim],
    [140, 190, 'A:\\> dir', green],
    [140, 230, ' Volume in drive A is FREEDOS', dim],
    [140, 260, ' Directory of A:\\', dim],
    [140, 310, 'COMMAND  COM     66,090', green],
    [140, 340, 'VIM      EXE    205,718', green],
    [140, 370, 'NASM     EXE     80,504', green],
    [140, 400, 'GAMES            <DIR>     invaders snake tetris rogue', green],
    [140, 430, 'FDOS             <DIR>     edit himem xcopy', green],
    [140, 460, 'DEMOS            <DIR>', green],
    [140, 510, 'A:\\> cd games', green],
    [140, 540, 'A:\\GAMES> invaders_', green],
  ];
  for (const [x, y, str, col] of lines) {
    let cx = x;
    for (const ch of str.toUpperCase()) {
      const g = G2[ch] || G2[' '];
      const s = 3;
      for (let row = 0; row < 7; row++) {
        for (let colb = 0; colb < 5; colb++) {
          if (g[row] & (1 << (4 - colb))) {
            for (let dy = 0; dy < s; dy++) {
              for (let dx = 0; dx < s; dx++) set(cx + colb * s + dx, y + row * s + dy, col);
            }
          }
        }
      }
      cx += 6 * s + 1;
    }
  }
  // LED
  for (let y = 640; y < 662; y++) {
    for (let x = 1040; x < 1062; x++) {
      const dx = x - 1051, dy = y - 651;
      if (dx * dx + dy * dy < 100) put(x, y, 255, 70, 40);
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
