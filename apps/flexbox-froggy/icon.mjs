// Sticker icon: a green frog hops onto a lilypad, then a yellow friend
// lands beside it — two frogs in the same pond. Transparent, dark outline.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const INK = [22, 48, 28];
const GREEN = [76, 210, 80];
const GREEN_D = [48, 168, 52];
const BELLY = [130, 248, 132];
const YELLOW = [240, 210, 64];
const YELLOW_D = [210, 168, 28];
const YBELLY = [255, 236, 140];
const PAD = [56, 168, 62];
const PAD_D = [32, 122, 38];
const WATER = [31, 87, 104];
const WHITE = [255, 255, 255];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [INK, GREEN, GREEN_D, BELLY, YELLOW, YELLOW_D, YBELLY, PAD, PAD_D, WATER, WHITE]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
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
function hop(t) { return t < 0 || t > 1 ? 0 : 4 * t * (1 - t); }

function disk(x, y, cx, cy, r) {
  const dx = x - cx, dy = y - cy;
  return Math.hypot(dx, dy) - r;
}
function rrect(x, y, x0, y0, x1, y1, rad) {
  const cx = Math.min(Math.max(x, x0 + rad), x1 - rad);
  const cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
  if (x >= x0 + rad && x <= x1 - rad && y >= y0 + rad && y <= y1 - rad) return -1;
  if (x >= x0 + rad && x <= x1 - rad) return y < y0 ? y0 - y : y - y1;
  if (y >= y0 + rad && y <= y1 - rad) return x < x0 ? x0 - x : x - x1;
  return Math.hypot(x - cx, y - cy) - rad;
}

function frogAt(x, y, cx, cy, s, body, dark, belly) {
  // Eyes, body, belly — distances. Negative = inside.
  const eyeL = disk(x, y, cx - 11 * s, cy - 16 * s, 7.2 * s);
  const eyeR = disk(x, y, cx + 11 * s, cy - 16 * s, 7.2 * s);
  const pupilL = disk(x, y, cx - 11 * s, cy - 16.5 * s, 3.1 * s);
  const pupilR = disk(x, y, cx + 11 * s, cy - 16.5 * s, 3.1 * s);
  const bodyD = rrect(x, y, cx - 18 * s, cy - 12 * s, cx + 18 * s, cy + 18 * s, 6 * s);
  const bellyD = rrect(x, y, cx - 12 * s, cy - 2 * s, cx + 12 * s, cy + 12 * s, 4 * s);
  const legL = disk(x, y, cx - 16 * s, cy + 14 * s, 6.5 * s);
  const legR = disk(x, y, cx + 16 * s, cy + 14 * s, 6.5 * s);
  let col = null, d = 99, outline = 99;
  const consider = (dist, fill, ring) => {
    outline = Math.min(outline, dist);
    if (dist < d && dist < 0.6) { d = dist; col = dist < -ring ? fill : INK; }
  };
  consider(pupilL, INK, 0.4);
  consider(pupilR, INK, 0.4);
  consider(eyeL, WHITE, 1.1);
  consider(eyeR, WHITE, 1.1);
  consider(bellyD, belly, 0.8);
  consider(bodyD, body, 1.2);
  consider(legL, dark, 1.0);
  consider(legR, dark, 1.0);
  return { col, outline };
}

function padAt(x, y, cx, cy, r) {
  const ang = Math.atan2(y - cy, x - cx);
  const notch = Math.abs(((ang + Math.PI * 1.5) % (Math.PI * 2)) - 0.0) < 0.22 && Math.hypot(x - cx, y - cy) > r * 0.2;
  const d = disk(x, y, cx, cy, r);
  if (notch) return { col: null, outline: 99 };
  if (d < 0.6) {
    const inner = disk(x, y, cx + 3, cy + 4, r * 0.72);
    const fill = inner < 0 ? PAD_D : PAD;
    return { col: d < -1.3 ? fill : INK, outline: d };
  }
  return { col: null, outline: d };
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const gT = Math.min(1, f / 6);
  const yT = Math.max(0, (f - 7) / 4);
  const padRx = 92, padRy = 100, padLx = 36, padLy = 102;
  const gX = 28 + gT * (padRx - 28), gY = 80 - hop(gT) * 34;
  const yX = 112 - yT * (112 - padLx), yY = 80 - hop(yT) * 34;
  const pad1x = padRx, pad1y = padRy, pad2x = padLx, pad2y = padLy;

  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null;
    const water = rrect(x, y, 10, 18, 118, 118, 22);
    if (water < 0.8) col = water < -1.6 ? WATER : INK;
    const p1 = padAt(x, y, pad1x, pad1y, 22);
    const p2 = padAt(x, y, pad2x, pad2y, 18);
    if (p1.col) col = p1.col;
    if (p2.col) col = p2.col;
    if (yT > 0.02) {
      const fr = frogAt(x, y, yX, yY, 0.72, YELLOW, YELLOW_D, YBELLY);
      if (fr.col) col = fr.col;
    }
    const fg = frogAt(x, y, gX, gY, 0.78, GREEN, GREEN_D, BELLY);
    if (fg.col) col = fg.col;
    if (!col) continue;
    const o = (py * RW + px) * 4;
    rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
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

export function froggyIcon() {
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
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  ':': [0, 0b00100, 0, 0, 0, 0b00100, 0],
  '#': [0b01010, 0b11111, 0b01010, 0b01010, 0b11111, 0b01010, 0b01010],
  '{': [0b00110, 0b01000, 0b01000, 0b10000, 0b01000, 0b01000, 0b00110],
  '}': [0b01100, 0b00010, 0b00010, 0b00001, 0b00010, 0b00010, 0b01100],
  ';': [0, 0b00100, 0, 0, 0b00100, 0b00100, 0b01000],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  3: [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
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
function fill(put, x0, y0, x1, y1, r, g, b) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, r, g, b);
}
function rr(put, x0, y0, x1, y1, rad, r, g, b) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
    const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
  }
}
function circle(put, cx, cy, rad, r, g, b) {
  const r2 = rad * rad;
  for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2) put(x, y, r, g, b);
  }
}
function frogSprite(put, cx, cy, s, body, dark, belly) {
  circle(put, cx - 11 * s, cy - 16 * s, 7.4 * s, body[0], body[1], body[2]);
  circle(put, cx + 11 * s, cy - 16 * s, 7.4 * s, body[0], body[1], body[2]);
  circle(put, cx - 11 * s, cy - 16.5 * s, 3.2 * s, 20, 20, 20);
  circle(put, cx + 11 * s, cy - 16.5 * s, 3.2 * s, 20, 20, 20);
  circle(put, cx - 16 * s, cy + 14 * s, 6.6 * s, dark[0], dark[1], dark[2]);
  circle(put, cx + 16 * s, cy + 14 * s, 6.6 * s, dark[0], dark[1], dark[2]);
  rr(put, cx - 18 * s, cy - 12 * s, cx + 18 * s, cy + 18 * s, 6 * s, body[0], body[1], body[2]);
  rr(put, cx - 12 * s, cy - 2 * s, cx + 12 * s, cy + 12 * s, 4 * s, belly[0], belly[1], belly[2]);
}
function lily(put, cx, cy, rad, r, g, b) {
  circle(put, cx, cy, rad, r, g, b);
  circle(put, cx + 4, cy + 6, rad * 0.72, r - 20, g - 20, b - 14);
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
  fill(put, 0, 0, W, H, 67, 160, 71);
  fill(put, 600, 0, W, H, 67, 160, 71);
  // Pond
  rr(put, 600, 0, 1200, 720, 18, 31, 87, 104);
  lily(put, 720, 210, 64, 63, 161, 66);
  lily(put, 900, 360, 64, 63, 161, 66);
  lily(put, 1080, 210, 64, 210, 70, 70);
  frogSprite(put, 720, 200, 2.1, GREEN, GREEN_D, BELLY);
  frogSprite(put, 900, 350, 2.1, YELLOW, YELLOW_D, YBELLY);
  frogSprite(put, 1080, 200, 2.1, [228, 84, 84], [176, 48, 48], [255, 170, 170]);
  // Friend frogs on the waterline
  frogSprite(put, 780, 640, 1.15, GREEN, GREEN_D, BELLY);
  frogSprite(put, 980, 640, 1.15, YELLOW, YELLOW_D, YBELLY);
  drawText(put, 750, 680, 'YOU', 2, 255, 255, 255);
  drawText(put, 950, 680, 'MAYA', 2, 255, 255, 255);

  // Sidebar
  drawText(put, 36, 36, 'FLEXBOX FROGGY', 4, 255, 255, 255);
  rr(put, 36, 92, 280, 128, 4, 90, 180, 94);
  drawText(put, 52, 102, 'LEVEL 3 OF 24', 2, 255, 255, 255);
  drawText(put, 36, 150, 'HELP ALL THREE FROGS', 2, 230, 245, 230);
  drawText(put, 36, 176, 'FIND THEIR LILYPADS', 2, 230, 245, 230);
  drawText(put, 36, 210, 'JUSTIFY-CONTENT', 2, 255, 255, 210);
  rr(put, 36, 260, 560, 560, 8, 224, 224, 224);
  fill(put, 36, 260, 70, 560, 153, 153, 153);
  drawText(put, 86, 278, '#POND {', 3, 80, 80, 80);
  drawText(put, 110, 314, 'DISPLAY: FLEX;', 3, 120, 120, 120);
  drawText(put, 110, 350, 'JUSTIFY-CONTENT:', 3, 30, 30, 30);
  drawText(put, 110, 386, 'SPACE-AROUND;', 3, 30, 30, 30);
  drawText(put, 86, 422, '}', 3, 80, 80, 80);
  rr(put, 400, 500, 540, 544, 6, 209, 22, 6);
  drawText(put, 430, 512, 'NEXT', 3, 255, 255, 255);
  rr(put, 36, 580, 220, 618, 12, 20, 20, 20);
  circle(put, 58, 599, 10, 105, 218, 107);
  drawText(put, 76, 590, 'YOU', 2, 255, 255, 255);
  rr(put, 236, 580, 430, 618, 12, 20, 20, 20);
  circle(put, 258, 599, 10, 240, 210, 64);
  drawText(put, 276, 590, 'MAYA', 2, 255, 255, 255);

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
