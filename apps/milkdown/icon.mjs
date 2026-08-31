// Procedural Milkdown icon: a notebook where `# HI` becomes a heading.
// Cover is the editor mid-use with a real packing note, not an empty boot.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 8;

const CARD = [18, 22, 30];
const INK = [236, 239, 244];
const MUTED = [138, 147, 163];
const ACCENT = [136, 192, 208];
const GOLD = [235, 203, 139];
const MARK = [163, 190, 140];
const LINE = [42, 49, 64];
const OUTL = [8, 10, 14];
const HASH = [94, 129, 172];

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
  for (const b of [CARD, INK, MUTED, ACCENT, GOLD, MARK, LINE, OUTL, HASH]) {
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
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  3: [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  5: [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  6: [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  ':': [0, 0b00100, 0b00100, 0, 0b00100, 0b00100, 0],
  ',': [0, 0, 0, 0, 0b00100, 0b00100, 0b01000],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
  '?': [0b01110, 0b10001, 0b00001, 0b00110, 0b00100, 0, 0b00100],
  '#': [0b01010, 0b11111, 0b01010, 0b01010, 0b11111, 0b01010, 0b01010],
  '*': [0b00100, 0b10101, 0b01110, 0b00100, 0b01110, 0b10101, 0b00100],
  '|': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  '/': [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  "'": [0b00100, 0b00100, 0, 0, 0, 0, 0],
  '"': [0b01010, 0b01010, 0, 0, 0, 0, 0],
  '(': [0b00100, 0b01000, 0b10000, 0b10000, 0b10000, 0b01000, 0b00100],
  ')': [0b00100, 0b00010, 0b00001, 0b00001, 0b00001, 0b00010, 0b00100],
  '[': [0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110],
  ']': [0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110],
  '+': [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  '=': [0, 0b11111, 0, 0, 0b11111, 0, 0],
  '`': [0b01000, 0b00100, 0, 0, 0, 0, 0],
  '×': [0b10001, 0b01010, 0b00100, 0b00100, 0b01010, 0b10001, 0],
};

function drawTextBuf(rgba, W, H, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) throw new Error('missing glyph for ' + JSON.stringify(ch));
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (gph[row] & (1 << (4 - col))) {
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
          const xx = (cx + col * s + dx) | 0, yy = (y + row * s + dy) | 0;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const o = (yy * W + xx) * 4;
          rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 1;
        }
      }
    }
    cx += 6 * s;
  }
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 7, rad = 18;
  const formed = f >= 3;
  const showHash = f < 3;
  const showGoMd = f >= 3 && f < 5;
  const showGo = f >= 5;
  const showBullet = f >= 6;
  const caretOn = (f % 2) === 0;

  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    if (!inRound(x, y, m, m, OUT - m, OUT - m, rad)) continue;
    let col = CARD;
    const edge = !inRound(x, y, m + 2.2, m + 2.2, OUT - m - 2.2, OUT - m - 2.2, rad - 2);
    if (edge) col = OUTL;
    else if (y < m + 18) col = mix(CARD, ACCENT, 0.08);
    const o = (py * RW + px) * 4;
    rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
  }

  const put = (x, y, r, g, b) => {
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const xx = (x * SS + sx) | 0, yy = (y * SS + sy) | 0;
      if (xx < 0 || yy < 0 || xx >= RW || yy >= RW) continue;
      const o = (yy * RW + xx) * 4;
      if (!rgba[o + 3]) continue;
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 1;
    }
  };

  if (showHash) {
    drawTextBuf(rgba, RW, RW, 22 * SS, 28 * SS, f === 0 ? '#' : '# HI', 3, HASH[0], HASH[1], HASH[2]);
  } else {
    drawTextBuf(rgba, RW, RW, 22 * SS, 24 * SS, 'HI', 4, ACCENT[0], ACCENT[1], ACCENT[2]);
  }
  if (showGoMd) {
    drawTextBuf(rgba, RW, RW, 22 * SS, 58 * SS, '**GO**', 2, GOLD[0], GOLD[1], GOLD[2]);
  } else if (showGo) {
    drawTextBuf(rgba, RW, RW, 22 * SS, 58 * SS, 'GO', 3, MARK[0], MARK[1], MARK[2]);
  }
  if (showBullet) {
    drawTextBuf(rgba, RW, RW, 22 * SS, 88 * SS, '- MAPS', 2, INK[0], INK[1], INK[2]);
  }
  if (caretOn && f < 7) {
    const cx = formed ? 58 : (f === 0 ? 40 : 78);
    const cy = formed ? 58 : 28;
    for (let i = 0; i < 16; i++) put(cx, cy + i, ACCENT[0], ACCENT[1], ACCENT[2]);
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

export function milkdownIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 12, transparentIndex: 0 };
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

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) throw new Error('missing glyph for ' + JSON.stringify(ch));
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
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    x1 = Math.min(W, x1 | 0); y1 = Math.min(H, y1 | 0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, r, g, b);
  };

  fill(0, 0, W, H, 18, 22, 30);
  fill(0, 0, W, 56, 14, 18, 24);
  fill(0, 56, W, 57, 42, 49, 64);

  fill(16, 12, 118, 44, 136, 192, 208);
  drawText(put, 32, 20, 'WRITE', 2, 10, 18, 22);
  fill(122, 12, 228, 44, 26, 32, 42);
  drawText(put, 138, 20, 'SOURCE', 2, 180, 188, 200);
  drawText(put, 252, 20, 'B  I  S  H1  H2  "  LIST  TABLE  LINK', 2, 200, 208, 220);

  drawText(put, 48, 84, 'PACKING FOR THE TRAIN', 6, 136, 192, 208);
  drawText(put, 48, 150, 'THE NOTES LIVE IN THIS FILE. CLOSE IT, COME BACK.', 2, 220, 224, 230);
  drawText(put, 48, 198, 'BRING', 4, 136, 192, 208);
  drawText(put, 48, 252, 'X  TICKETS', 3, 163, 190, 140);
  drawText(put, 48, 300, '   CHARGERS', 3, 236, 239, 244);
  drawText(put, 48, 348, '   THE PAPERBACK', 3, 236, 239, 244);

  fill(48, 404, 54, 488, 94, 129, 172);
  drawText(put, 72, 412, 'IF WE MISS THE 09:40, THE 10:12', 2, 200, 208, 220);
  drawText(put, 72, 448, 'STILL GETS US THERE.', 2, 200, 208, 220);

  drawText(put, 48, 512, 'WHO HAS WHAT:', 3, 220, 224, 230);
  fill(48, 556, 720, 684, 22, 28, 38);
  drawText(put, 68, 568, 'WHO           JOB', 3, 136, 192, 208);
  fill(68, 606, 700, 608, 42, 49, 64);
  drawText(put, 68, 620, 'YOU           SNACKS', 3, 236, 239, 244);
  drawText(put, 68, 656, 'THEM          MAPS', 3, 236, 239, 244);

  fill(0, 696, W, H, 14, 18, 24);
  fill(0, 696, W, 697, 42, 49, 64);
  drawText(put, 48, 704, '93 WORDS  SAVED ON THIS DEVICE', 2, 138, 147, 163);

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
