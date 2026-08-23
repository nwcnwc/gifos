// Procedural icon: cream paper, a coral scribble of a cat drawing itself.
// Pure Node, super-sample → box-downsample. Deterministic.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [42, 36, 28];
const PAPER = [255, 253, 246];
const PAPER_D = [236, 226, 204];
const INK = [28, 24, 20];
const CORAL = [232, 92, 64];
const CORAL_H = [255, 160, 140];
const BLUE = [61, 126, 166];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, PAPER, PAPER_D, INK, CORAL, CORAL_H, BLUE]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
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
function distToSeg(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  if (l2 < 1e-6) return Math.hypot(x - x1, y - y1);
  let t = ((x - x1) * dx + (y - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

// Cat as polyline segments. t in 0..1 reveals more of the line.
const CAT = [
  // head
  [48, 58, 48, 42], [48, 42, 64, 32], [64, 32, 80, 42], [80, 42, 80, 58],
  [80, 58, 64, 68], [64, 68, 48, 58],
  // ears
  [52, 44, 54, 28], [54, 28, 62, 40],
  [76, 44, 74, 28], [74, 28, 66, 40],
  // eyes
  [58, 48, 60, 50], [68, 48, 70, 50],
  // smile
  [58, 56, 64, 60], [64, 60, 70, 56],
  // body
  [56, 66, 52, 88], [52, 88, 76, 88], [76, 88, 72, 66],
  // tail
  [76, 80, 92, 70], [92, 70, 96, 58],
];

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 18;
  const t = f / (FRAMES - 1);
  const nSeg = Math.max(1, Math.round(CAT.length * Math.min(1, t * 1.05)));
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(PAPER, PAPER_D, Math.max(0, Math.min(1, (x + y) / (OUT * 2))));
      for (let i = 0; i < nSeg; i++) {
        const s = CAT[i];
        const d = distToSeg(x, y, s[0], s[1], s[2], s[3]);
        if (d < 2.1) col = i < 12 ? INK : CORAL;
      }
      // pencil tip following the latest segment
      if (nSeg > 0 && t < 0.98) {
        const s = CAT[nSeg - 1];
        const px2 = s[0] + (s[2] - s[0]) * Math.min(1, t * CAT.length - (nSeg - 1));
        const py2 = s[1] + (s[3] - s[1]) * Math.min(1, t * CAT.length - (nSeg - 1));
        if (Math.hypot(x - px2, y - py2) < 3.2) col = CORAL_H;
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

export function drawphoneIcon() {
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

const GLYPHS = {
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
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

function strokeSeg(put, x1, y1, x2, y2, r, g, b, w) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const n = Math.ceil(len);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x1 + dx * t, y = y1 + dy * t;
    for (let oy = -w; oy <= w; oy++) for (let ox = -w; ox <= w; ox++) {
      if (ox * ox + oy * oy <= w * w) put(x + ox, y + oy, r, g, b);
    }
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

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = (x + y) / (W + H);
    put(x, y, (28 + t * 18) | 0, (24 + t * 14) | 0, (20 + t * 10) | 0);
  }

  // three paper cards: CAT → drawing → HAT
  function paper(x, y, w, h) {
    fill(x, y, x + w, y + h, 255, 253, 246);
    // edge
    for (let i = 0; i < w; i++) {
      put(x + i, y, 90, 80, 64); put(x + i, y + h - 1, 90, 80, 64);
    }
    for (let i = 0; i < h; i++) {
      put(x, y + i, 90, 80, 64); put(x + w - 1, y + i, 90, 80, 64);
    }
  }
  paper(48, 90, 280, 520);
  paper(360, 90, 280, 520);
  paper(672, 90, 280, 520);

  drawText(put, 110, 300, 'CAT', 9, 28, 24, 20);
  // cat drawing on middle card
  const ox = 400, oy = 180, sc = 3.2;
  for (const s of CAT) {
    strokeSeg(put, ox + s[0] * sc, oy + s[1] * sc, ox + s[2] * sc, oy + s[3] * sc, 28, 24, 20, 3);
  }
  drawText(put, 740, 200, 'HAT', 9, 232, 92, 64);
  // brim + crown
  const hx = 730, hy = 340;
  fill(hx + 20, hy + 70, hx + 220, hy + 100, 232, 92, 64);
  fill(hx + 70, hy, hx + 170, hy + 74, 232, 92, 64);

  drawText(put, 48, 640, 'DRAWPHONE', 5, 244, 234, 212);
  drawText(put, 640, 650, 'THE INVITE IS THE ROOM', 2, 184, 168, 140);

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
