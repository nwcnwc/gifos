// Procedural Smartcrop icon: a photo with a person on the left and a
// landscape on the right. A gold crop box starts centred (the naive cut)
// and slides onto the face; the rest dims. Super-sample → box-downsample.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [18, 14, 16];
const SKY = [78, 132, 186];
const SKY2 = [242, 186, 110];
const SUN = [242, 196, 90];
const HILL = [46, 108, 58];
const HILL2 = [62, 122, 68];
const HOUSE = [196, 92, 58];
const SKIN = [232, 184, 150];
const HAIR = [58, 36, 24];
const SHIRT = [196, 138, 98];
const GOLD = [232, 184, 72];
const INK = [244, 239, 230];
const FACE = [126, 200, 232];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r);
  const cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function scene(x, y) {
  const t = y / OUT;
  let col = t < 0.55 ? mix(SKY, SKY2, t / 0.55) : mix(HILL, HILL2, (t - 0.55) / 0.45);
  const dx = x - 96, dy = y - 36;
  if (dx * dx + dy * dy < 14 * 14) col = SUN;
  if (y > 72 && y > 118 - (x - 48) * 0.35 && x > 58) col = HILL;
  if (x > 86 && x < 108 && y > 78 && y < 112) col = HOUSE;
  if (x > 94 && x < 100 && y > 94 && y < 112) col = [80, 40, 28];
  const fx = 40, fy = 50;
  if (y > 64 && y < 110 && Math.abs(x - fx) < 16) col = SHIRT;
  const fd = (x - fx) * (x - fx) + (y - fy) * (y - fy) * 1.15;
  if (fd < 17 * 17) col = SKIN;
  if ((x - fx) * (x - fx) * 0.85 + (y - (fy - 10)) * (y - (fy - 10)) < 17 * 9 && y < fy - 2) col = HAIR;
  const ed1 = (x - (fx - 5.5)) * (x - (fx - 5.5)) + (y - (fy + 0.5)) * (y - (fy + 0.5));
  const ed2 = (x - (fx + 5.5)) * (x - (fx + 5.5)) + (y - (fy + 0.5)) * (y - (fy + 0.5));
  if (ed1 < 2.4 * 2.4 || ed2 < 2.4 * 2.4) col = HAIR;
  if (Math.abs(x - fx) < 5 && Math.abs(y - (fy + 8)) < 1.2 && y > fy + 6) col = [160, 90, 80];
  return col;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, SKY, SKY2, SUN, HILL, HILL2, HOUSE, SKIN, HAIR, SHIRT, GOLD, INK, FACE, [0, 0, 0]]) {
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
function ease(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = ease(f / (FRAMES - 1));
  const box = 52;
  const startX = 38, startY = 38;
  const endX = 12, endY = 24;
  const bx = startX + (endX - startX) * t;
  const by = startY + (endY - startY) * t;
  const m = 8, rad = 20;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    if (!inCard(x, y, m, rad)) continue;
    let col = scene(x, y);
    const inside = x >= bx && x <= bx + box && y >= by && y <= by + box;
    if (!inside) col = mix(col, CARD, 0.55 + t * 0.2);
    const onEdge =
      (Math.abs(x - bx) < 1.6 && y >= by && y <= by + box) ||
      (Math.abs(x - (bx + box)) < 1.6 && y >= by && y <= by + box) ||
      (Math.abs(y - by) < 1.6 && x >= bx && x <= bx + box) ||
      (Math.abs(y - (by + box)) < 1.6 && x >= bx && x <= bx + box);
    if (onEdge) col = GOLD;
    const fx = 40, fy = 50;
    const onFace =
      t > 0.28 &&
      ((Math.abs(x - (fx - 18)) < 1.3 && y > fy - 16 && y < fy + 16) ||
       (Math.abs(x - (fx + 18)) < 1.3 && y > fy - 16 && y < fy + 16) ||
       (Math.abs(y - (fy - 16)) < 1.3 && x > fx - 18 && x < fx + 18) ||
       (Math.abs(y - (fy + 16)) < 1.3 && x > fx - 18 && x < fx + 18));
    if (onFace) col = FACE;
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

export function smartcropIcon() {
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
  M: [0b10001, 0b11011, 0b10101, 0b10001, 0b10001, 0b10001, 0b10001],
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
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  ':': [0, 0b00100, 0b00100, 0, 0b00100, 0b00100, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '×': [0b10001, 0b01010, 0b00100, 0, 0b00100, 0b01010, 0b10001],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
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
  const roundFill = (x0, y0, x1, y1, r, cr, cg, cb) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const dx = x < x0 + r ? x0 + r - x : x > x1 - r ? x - (x1 - r) : 0;
      const dy = y < y0 + r ? y0 + r - y : y > y1 - r ? y - (y1 - r) : 0;
      if (dx * dx + dy * dy > r * r) continue;
      put(x, y, cr, cg, cb);
    }
  };
  const strokeRect = (x0, y0, x1, y1, w, r, g, b) => {
    fill(x0, y0, x1, y0 + w, r, g, b);
    fill(x0, y1 - w, x1, y1, r, g, b);
    fill(x0, y0, x0 + w, y1, r, g, b);
    fill(x1 - w, y0, x1, y1, r, g, b);
  };

  fill(0, 0, W, H, 18, 16, 20);
  drawText(put, 36, 22, 'SMARTCROP', 5, 244, 239, 230);
  drawText(put, 36, 62, 'FACES STAY IN THE FRAME.', 2, 180, 168, 150);

  const photo = { x: 36, y: 96, w: 1128, h: 436 };
  roundFill(28, 88, 1172, 548, 16, 11, 10, 14);

  function photoCol(u, v) {
    let col = v < 0.55 ? mix(SKY, SKY2, v / 0.55) : mix(HILL, [90, 140, 70], (v - 0.55) / 0.45);
    const dx = u - 0.78, dy = v - 0.18;
    if (dx * dx + dy * dy < 0.07 * 0.07) col = SUN;
    if (v > 0.52 && v > 0.95 - u * 0.55) col = HILL;
    if (u > 0.68 && u < 0.86 && v > 0.52 && v < 0.88) col = HOUSE;
    if (u > 0.74 && u < 0.78 && v > 0.68 && v < 0.88) col = [80, 40, 28];
    const fx = 0.27, fy = 0.38;
    if (v > 0.50 && v < 0.94 && Math.abs(u - fx) < 0.12) col = SHIRT;
    const fdx = (u - fx) / 0.09, fdy = (v - fy) / 0.11;
    if (fdx * fdx + fdy * fdy < 1) col = SKIN;
    if ((u - fx) * (u - fx) / (0.10 * 0.10) + (v - (fy - 0.07)) * (v - (fy - 0.07)) / (0.06 * 0.06) < 1 && v < fy) col = HAIR;
    const e1 = (u - (fx - 0.03)) * (u - (fx - 0.03)) + (v - fy) * (v - fy);
    const e2 = (u - (fx + 0.03)) * (u - (fx + 0.03)) + (v - fy) * (v - fy);
    if (e1 < 0.00045 || e2 < 0.00045) col = HAIR;
    if (Math.abs(u - fx) < 0.028 && Math.abs(v - (fy + 0.045)) < 0.008 && v > fy + 0.03) col = [170, 96, 86];
    return col;
  }

  const crop = { x: photo.x + 70, y: photo.y + 18, w: 420, h: 420 };
  const face = { x: photo.x + 185, y: photo.y + 70, w: 200, h: 230 };
  for (let y = 0; y < photo.h; y++) for (let x = 0; x < photo.w; x++) {
    const u = x / photo.w, v = y / photo.h;
    let col = photoCol(u, v);
    const px = photo.x + x, py = photo.y + y;
    const inCrop = px >= crop.x && px < crop.x + crop.w && py >= crop.y && py < crop.y + crop.h;
    if (!inCrop) col = mix(col, [12, 10, 12], 0.55);
    put(px, py, col[0] | 0, col[1] | 0, col[2] | 0);
  }
  strokeRect(face.x, face.y, face.x + face.w, face.y + face.h, 3, 126, 200, 232);
  strokeRect(crop.x, crop.y, crop.x + crop.w, crop.y + crop.h, 6, 232, 184, 72);

  // Result strip — the actual crop, always on screen.
  const rw = 168, rh = 168, rx = 1000, ry = 348;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const px = crop.x + (x / rw) * crop.w;
    const py = crop.y + (y / rh) * crop.h;
    const u = (px - photo.x) / photo.w, v = (py - photo.y) / photo.h;
    const col = photoCol(u, v);
    put(rx + x, ry + y, col[0] | 0, col[1] | 0, col[2] | 0);
  }
  strokeRect(rx - 4, ry - 4, rx + rw + 4, ry + rh + 4, 4, 232, 184, 72);
  drawText(put, rx - 4, ry - 28, 'CROP', 2, 232, 184, 72);
  drawText(put, 36, 552, 'HOLD FOR THE CROP, FULL SIZE', 2, 180, 168, 150);

  roundFill(36, 580, 220, 628, 8, 232, 184, 72);
  drawText(put, 52, 594, 'TAKE PHOTO', 2, 26, 18, 8);
  roundFill(236, 580, 360, 628, 8, 28, 24, 36);
  drawText(put, 256, 594, 'CHOOSE', 2, 244, 239, 230);
  roundFill(376, 580, 590, 628, 8, 42, 122, 82);
  drawText(put, 392, 594, 'DOWNLOAD JPEG', 2, 255, 255, 255);

  const chips = [
    { t: '1:1 AVATAR', on: true },
    { t: '3:1 BANNER', on: false },
    { t: '16:9 WIDE', on: false },
    { t: '4:5 PORTRAIT', on: false },
    { t: '9:16 STORY', on: false },
  ];
  let cx = 36;
  chips.forEach((c) => {
    const w = c.t.length * 12 + 28;
    if (c.on) roundFill(cx, 644, cx + w, 684, 16, 232, 184, 72);
    else roundFill(cx, 644, cx + w, 684, 16, 28, 24, 32);
    drawText(put, cx + 14, 656, c.t, 2, c.on ? 26 : 244, c.on ? 18 : 239, c.on ? 8 : 230);
    cx += w + 10;
  });

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
