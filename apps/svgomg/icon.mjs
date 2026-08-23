// Procedural icon for SVGOMG: an indigo rounded card holding a five-point
// star that shrinks across the frames — the SVG getting smaller. Super-sample
// → box-downsample → small palette. Deterministic, so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [63, 81, 181];
const CARD_B = [26, 35, 126];
const PINK = [233, 30, 99];
const STAR = [255, 255, 255];
const STAR_D = [197, 202, 233];

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
  for (const b of [CARD_A, CARD_B, PINK, STAR, STAR_D]) {
    for (let s = 0; s <= 5; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    for (let s = 1; s <= 3; s++) pal.push(mix(b, [0, 0, 0], s * 0.2).map(Math.round));
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

function starHit(x, y, cx, cy, r) {
  // even-odd 5-point star
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5;
    const rr = i % 2 === 0 ? r : r * 0.4;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
    const hit = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}

function squash(f) {
  const u = f / FRAMES;
  return 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(2 * Math.PI * u)); // 1 big → 0.55 small → 1
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const scale = squash(f);
  const cx = 64, cy = 64;
  const r = 38 * scale;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      if (starHit(x, y, cx, cy, r)) {
        const d = Math.hypot(x - cx, y - (cy - 8)) / (r + 1);
        col = mix(STAR_D, STAR, 1 - Math.min(1, d));
      }
      // small pink spark in the corner that grows as the star shrinks
      const spark = 5 + (1 - scale) * 8;
      if (Math.hypot(x - 96, y - 96) < spark) col = mix(PINK, STAR, 0.15);
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0; const n = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
    }
    if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}

export function svgomgIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 8, transparentIndex: 0 };
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
function chunk(tag, data) {
  const t = Buffer.from(tag);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
}

const GLYPHS = {
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  'Z': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '%': [0b10001, 0b10010, 0b00100, 0b00100, 0b00100, 0b01001, 0b10001],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
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

  fill(0, 0, W, H, 236, 239, 241);
  fill(0, 0, W, 72, 48, 63, 159);
  // star mark
  for (let y = 16; y < 56; y++) for (let x = 28; x < 72; x++) {
    const px = (x - 50) / 18, py = (y - 36) / 18;
    const a = Math.atan2(py, px) + Math.PI / 2;
    const r = Math.hypot(px, py);
    const spikes = Math.cos(a * 5);
    if (r < 0.55 + 0.45 * Math.max(0, spikes)) put(x, y, 255, 255, 255);
  }
  drawText(put, 84, 26, 'SVGOMG', 4, 255, 255, 255);
  rr(980, 18, 1080, 54, 14, 255, 255, 255);
  drawText(put, 996, 28, 'IMAGE', 2, 48, 63, 159);
  rr(1090, 18, 1174, 54, 14, 48, 63, 159);
  drawText(put, 1104, 28, 'CODE', 2, 200, 210, 240);

  // preview card
  rr(24, 96, 860, 680, 16, 255, 255, 255);
  // checkerboard
  for (let y = 112; y < 600; y++) for (let x = 40; x < 844; x++) {
    const cx = ((x - 40) >> 4) & 1, cy = ((y - 112) >> 4) & 1;
    if (cx ^ cy) put(x, y, 238, 238, 238);
    else put(x, y, 255, 255, 255);
  }
  // a simple car-like blob in indigo
  rr(180, 260, 700, 430, 40, 63, 81, 181);
  rr(220, 210, 500, 280, 30, 63, 81, 181);
  for (let y = 400; y < 470; y++) for (let x = 250; x < 330; x++) {
    const dx = x - 290, dy = y - 430; if (dx * dx + dy * dy < 35 * 35) put(x, y, 33, 33, 33);
  }
  for (let y = 400; y < 470; y++) for (let x = 540; x < 620; x++) {
    const dx = x - 580, dy = y - 430; if (dx * dx + dy * dy < 35 * 35) put(x, y, 33, 33, 33);
  }
  drawText(put, 40, 624, '26 KB  -  16 KB', 3, 48, 63, 159);
  drawText(put, 430, 624, '-38%', 3, 0, 137, 123);
  rr(700, 612, 840, 664, 10, 233, 30, 99);
  drawText(put, 718, 628, 'DOWNLOAD', 2, 255, 255, 255);

  // settings
  rr(880, 96, 1176, 680, 16, 255, 255, 255);
  drawText(put, 900, 120, 'FEATURES', 2, 96, 125, 139);
  const rows = ['DOCTYPE', 'COMMENTS', 'METADATA', 'IDS', 'COLOURS', 'PATHS', 'GROUPS', 'TRANSFORMS'];
  rows.forEach((label, i) => {
    const y = 168 + i * 52;
    rr(900, y, 948, y + 28, 14, 63, 81, 181);
    for (let yy = y + 4; yy < y + 24; yy++) for (let xx = 920; xx < 944; xx++) {
      const dx = xx - 932, dy = yy - (y + 14);
      if (dx * dx + dy * dy < 10 * 10) put(xx, yy, 255, 255, 255);
    }
    drawText(put, 964, y + 8, label, 2, 33, 33, 33);
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
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
