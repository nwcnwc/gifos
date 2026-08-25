// Procedural Signature Pad icon: a dark rounded card holding a cream slip
// whose ink line writes itself. Super-sample → box-downsample → small palette;
// deterministic so GIF builds reproduce.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [28, 32, 46];
const CARD_B = [16, 18, 28];
const PAPER = [247, 243, 234];
const PAPER_D = [226, 218, 200];
const LINE = [210, 200, 184];
const INK = [36, 72, 156];
const INK_D = [20, 22, 28];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
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
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, PAPER, PAPER_D, LINE, INK, INK_D]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.28).map(Math.round));
  }
  return pal.slice(0, 64);
}
function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e9;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b, d = dr * dr + dg * dg + db * db;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

// A looping autograph on the cream slip, in icon pixels.
const SIG = [
  [22, 78], [24, 64], [28, 52], [38, 46], [48, 52], [46, 70],
  [36, 84], [28, 82], [40, 72], [56, 58], [68, 50], [78, 54],
  [82, 66], [76, 78], [86, 74], [100, 58], [112, 50], [118, 56],
];

function polylineLen(pts) {
  let n = 0;
  for (let i = 1; i < pts.length; i++) n += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return n;
}
const SIG_LEN = polylineLen(SIG);

function distToPath(x, y, pts, until) {
  let acc = 0, best = 1e9;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (acc >= until) break;
    const use = Math.min(1, (until - acc) / seg);
    const x2 = a[0] + (b[0] - a[0]) * use, y2 = a[1] + (b[1] - a[1]) * use;
    best = Math.min(best, distToSeg(x, y, a[0], a[1], x2, y2));
    acc += seg;
  }
  return best;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const written = SIG_LEN * Math.max(0, Math.min(1, (f + 1) / (FRAMES - 1)));
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      const px0 = 18, py0 = 34, px1 = 110, py1 = 100;
      if (x >= px0 && x <= px1 && y >= py0 && y <= py1) {
        const br = 8;
        const ix = Math.min(Math.max(x, px0 + br), px1 - br);
        const iy = Math.min(Math.max(y, py0 + br), py1 - br);
        const inPaper = (x >= px0 + br && x <= px1 - br) || (y >= py0 + br && y <= py1 - br) ||
          ((x - ix) * (x - ix) + (y - iy) * (y - iy) <= br * br);
        if (inPaper) {
          col = mix(PAPER, PAPER_D, Math.max(0, Math.min(1, (x + y) / (OUT * 2))));
          if (Math.abs(y - 88) < 0.9 && x >= 24 && x <= 104) col = LINE;
          const d = distToPath(x, y, SIG, written);
          if (d < 1.7) col = mix(INK_D, INK, Math.max(0, 1 - d));
          else if (d < 2.4) col = mix(col, INK, 0.35);
        }
      }
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, aa = 0, n = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; aa += rgba[o + 3];
    }
    if (aa / n < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}

export function signaturePadIcon() {
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
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
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

  fill(0, 0, W, H, 18, 20, 28);
  for (let y = 0; y < H; y++) {
    const c = mix([28, 32, 46], [16, 18, 28], y / H);
    for (let x = 0; x < W; x++) put(x, y, c[0], c[1], c[2]);
  }

  drawText(put, 48, 48, 'SIGNATURE PAD', 8, 197, 212, 240);
  drawText(put, 48, 140, 'SIGN WITH A FINGER', 4, 220, 220, 228);
  drawText(put, 48, 190, 'SIGN WITH A FINGER', 4, 220, 220, 228);
  rr(48, 250, 340, 310, 10, 58, 106, 212);
  drawText(put, 72, 268, 'PASS THE PAD', 3, 244, 247, 255);
  drawText(put, 48, 340, 'CLEAR  UNDO  SAVE PNG', 3, 180, 180, 188);
  drawText(put, 48, 390, 'BLACK INK OR BLUE', 3, 36, 72, 156);
  drawText(put, 48, 640, 'UNOFFICIAL PORT', 3, 120, 120, 128);

  rr(680, 80, 1164, 640, 22, 247, 243, 234);
  // baseline
  fill(720, 520, 1124, 524, 210, 200, 184);
  drawText(put, 720, 560, 'SIGN ABOVE', 3, 154, 146, 132);

  const ox = 720, oy = 180, sc = 7.6;
  for (let i = 1; i < SIG.length; i++) {
    const a = SIG[i - 1], b = SIG[i];
    const x1 = ox + (a[0] - 18) * sc, y1 = oy + (a[1] - 44) * sc;
    const x2 = ox + (b[0] - 18) * sc, y2 = oy + (b[1] - 44) * sc;
    const steps = Math.max(8, Math.hypot(x2 - x1, y2 - y1) | 0);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
      const thick = 3.2 + 1.4 * Math.sin(i + t);
      for (let dy = -thick; dy <= thick; dy++) for (let dx = -thick; dx <= thick; dx++) {
        if (dx * dx + dy * dy <= thick * thick) {
          const col = mix(INK_D, INK, 0.55 + 0.45 * ((dx + thick) / (thick * 2)));
          put((x + dx) | 0, (y + dy) | 0, col[0], col[1], col[2]);
        }
      }
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
