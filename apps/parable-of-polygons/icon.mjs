// Sticker icon: mixed triangles & squares shuffle into two camps.
// Cover: the essay mid-use — a segregated town plus the moral.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const TRI = [245, 195, 24], SQ = [86, 125, 255], INK = [45, 32, 24];
const PAPER = [238, 238, 238], DARK = [34, 34, 34], RED = [204, 39, 39];
const FACE = [45, 32, 24];

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
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [TRI, SQ, INK, PAPER, DARK, RED, [255, 255, 255], FACE]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
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

// Mixed start, segregated end. Each entry: [x0,y0,x1,y1, kind 0=sq 1=tri]
const PEEPS = [
  [28, 36, 30, 34, 1], [48, 32, 32, 52, 1], [70, 38, 34, 70, 1],
  [36, 56, 36, 88, 1], [58, 60, 52, 36, 1], [80, 54, 54, 54, 1],
  [44, 80, 52, 72, 1], [66, 84, 50, 90, 1],
  [92, 34, 90, 34, 0], [108, 40, 94, 52, 0], [86, 58, 96, 70, 0],
  [104, 62, 92, 88, 0], [76, 78, 108, 40, 0], [96, 84, 110, 62, 0],
  [88, 96, 108, 84, 0], [52, 44, 38, 48, 1], [100, 50, 112, 52, 0],
];

function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(t) { return t * t * (3 - 2 * t); }

function distTri(px, py, cx, cy, s) {
  // signed-ish distance to an equilateral-ish triangle
  const x0 = cx, y0 = cy - s * 0.72;
  const x1 = cx + s * 0.68, y1 = cy + s * 0.48;
  const x2 = cx - s * 0.68, y2 = cy + s * 0.48;
  return distPoly(px, py, [x0, y0, x1, y1, x2, y2], true);
}
function distSq(px, py, cx, cy, s) {
  const h = s * 0.55;
  const dx = Math.max(Math.abs(px - cx) - h, 0);
  const dy = Math.max(Math.abs(py - cy) - h, 0);
  const out = Math.hypot(dx, dy);
  const ix = h - Math.abs(px - cx), iy = h - Math.abs(py - cy);
  if (ix > 0 && iy > 0) return -Math.min(ix, iy);
  return out;
}
function distSeg(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
  if (l2 < 1e-8) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / l2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}
function distPoly(px, py, pts, closed) {
  let best = 1e9, n = pts.length / 2, last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % n;
    const d = distSeg(px, py, pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1]);
    if (d < best) best = d;
  }
  return best;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = smooth(Math.min(1, f / (FRAMES - 1)));
  const shake = f < 5 ? Math.sin(f * 1.7) : 0;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    if (!inCard(x, y, 6, 22)) continue;
    let col = PAPER;
    for (let i = 0; i < PEEPS.length; i++) {
      const p = PEEPS[i];
      const cx = lerp(p[0], p[2], t) + (p[4] ? shake * 1.4 : -shake * 1.1);
      const cy = lerp(p[1], p[3], t);
      const s = 11;
      const d = p[4] ? distTri(x, y, cx, cy, s) : distSq(x, y, cx, cy, s);
      if (d < 1.35) {
        const fill = p[4] ? TRI : SQ;
        col = d < 0.55 ? INK : (d < 0.95 ? mix(fill, INK, 0.35) : fill);
        // eyes
        const ey = cy - 1.2, el = cx - 2.2, er = cx + 2.2;
        if (Math.hypot(x - el, y - ey) < 0.7 || Math.hypot(x - er, y - ey) < 0.7) col = FACE;
      }
    }
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

export function polygonsIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64, flat = new Array(CT * 3).fill(0);
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
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01111, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b01111],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
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
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  "'": [0b00100, 0b00100, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  '%': [0b10001, 0b10010, 0b00100, 0b01000, 0b00100, 0b01001, 0b10001],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  3: [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  6: [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch] || GLYPHS[' '];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (gph[row] & (1 << (4 - col))) {
          for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++)
            put(cx + col * s + dx, y + row * s + dy, r, g, b);
        }
      }
    }
    cx += 6 * s;
  }
}

function fillTri(put, cx, cy, s, r, g, b) {
  const x0 = cx, y0 = cy - s * 0.72;
  const x1 = cx + s * 0.68, y1 = cy + s * 0.48;
  const x2 = cx - s * 0.68, y2 = cy + s * 0.48;
  const minx = Math.floor(Math.min(x0, x1, x2)), maxx = Math.ceil(Math.max(x0, x1, x2));
  const miny = Math.floor(Math.min(y0, y1, y2)), maxy = Math.ceil(Math.max(y0, y1, y2));
  const edge = (ax, ay, bx, by, px, py) => (px - ax) * (by - ay) - (py - ay) * (bx - ax);
  const area = edge(x0, y0, x1, y1, x2, y2);
  for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
    const w0 = edge(x1, y1, x2, y2, x, y);
    const w1 = edge(x2, y2, x0, y0, x, y);
    const w2 = edge(x0, y0, x1, y1, x, y);
    if ((w0 >= 0 && w1 >= 0 && w2 >= 0 && area >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0 && area <= 0))
      put(x, y, r, g, b);
  }
  // outline
  strokeLine(put, x0, y0, x1, y1, 2, INK[0], INK[1], INK[2]);
  strokeLine(put, x1, y1, x2, y2, 2, INK[0], INK[1], INK[2]);
  strokeLine(put, x2, y2, x0, y0, 2, INK[0], INK[1], INK[2]);
  // legs + face
  strokeLine(put, cx - s * 0.18, cy + s * 0.48, cx - s * 0.18, cy + s * 0.72, 2, INK[0], INK[1], INK[2]);
  strokeLine(put, cx + s * 0.18, cy + s * 0.48, cx + s * 0.18, cy + s * 0.72, 2, INK[0], INK[1], INK[2]);
  put(cx - s * 0.16, cy - s * 0.08, FACE[0], FACE[1], FACE[2]);
  put(cx + s * 0.16, cy - s * 0.08, FACE[0], FACE[1], FACE[2]);
}
function fillSq(put, cx, cy, s, r, g, b) {
  const h = s * 0.52;
  for (let y = cy - h; y <= cy + h; y++) for (let x = cx - h; x <= cx + h; x++) put(x, y, r, g, b);
  strokeLine(put, cx - h, cy - h, cx + h, cy - h, 2, INK[0], INK[1], INK[2]);
  strokeLine(put, cx + h, cy - h, cx + h, cy + h, 2, INK[0], INK[1], INK[2]);
  strokeLine(put, cx + h, cy + h, cx - h, cy + h, 2, INK[0], INK[1], INK[2]);
  strokeLine(put, cx - h, cy + h, cx - h, cy - h, 2, INK[0], INK[1], INK[2]);
  strokeLine(put, cx - s * 0.16, cy + h, cx - s * 0.16, cy + h + s * 0.22, 2, INK[0], INK[1], INK[2]);
  strokeLine(put, cx + s * 0.16, cy + h, cx + s * 0.16, cy + h + s * 0.22, 2, INK[0], INK[1], INK[2]);
  put(cx - s * 0.16, cy - s * 0.08, FACE[0], FACE[1], FACE[2]);
  put(cx + s * 0.16, cy - s * 0.08, FACE[0], FACE[1], FACE[2]);
}
function strokeLine(put, x0, y0, x1, y1, w, r, g, b) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, steps = Math.ceil(len);
  for (let i = 0; i <= steps; i++) {
    const x = x0 + dx * (i / steps), y = y0 + dy * (i / steps);
    const rad = w;
    for (let yy = Math.floor(y - rad); yy <= Math.ceil(y + rad); yy++)
      for (let xx = Math.floor(x - rad); xx <= Math.ceil(x + rad); xx++)
        if ((xx - x) * (xx - x) + (yy - y) * (yy - y) <= rad * rad) put(xx, yy, r, g, b);
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
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    put(x, y, y < 86 ? 12 : (x > 760 && y > 120 ? 34 : 238),
           y < 86 ? 12 : (x > 760 && y > 120 ? 34 : 238),
           y < 86 ? 12 : (x > 760 && y > 120 ? 34 : 238));
  }
  drawText(put, 48, 22, 'PARABLE OF THE POLYGONS', 4, 245, 195, 24);
  drawText(put, 48, 56, 'A PLAYABLE POST ON THE SHAPE OF SOCIETY', 2, 200, 200, 200);
  drawText(put, 48, 108, 'SMALL INDIVIDUAL BIAS', 3, 34, 34, 34);
  drawText(put, 48, 140, 'LARGE COLLECTIVE BIAS', 3, 204, 39, 39);

  // Segregated 14x10 town on the paper
  const tile = 44, ox = 48, oy = 188;
  for (let gy = 0; gy < 10; gy++) {
    for (let gx = 0; gx < 14; gx++) {
      if ((gx + gy * 3) % 7 === 0) continue;
      const cx = ox + gx * tile + tile / 2;
      const cy = oy + gy * tile + tile / 2;
      const tri = gx < 7;
      if (tri) fillTri(put, cx, cy, 28, TRI[0], TRI[1], TRI[2]);
      else fillSq(put, cx, cy, 28, SQ[0], SQ[1], SQ[2]);
    }
  }

  // Stats panel
  for (let y = 160; y < 380; y++) for (let x = 800; x < 1150; x++) put(x, y, 26, 26, 26);
  drawText(put, 820, 176, 'SEGREGATION', 2, 200, 200, 200);
  drawText(put, 820, 204, '86%', 5, 204, 39, 39);
  for (let i = 0; i < 280; i++) {
    const x = 820 + i;
    const y = 340 - Math.min(140, i * 0.55 + (i > 80 ? (i - 80) * 0.4 : 0));
    put(x, y, 204, 39, 39);
    put(x, y + 1, 204, 39, 39);
    put(x, y + 2, 160, 30, 30);
  }

  // Slider
  for (let x = 800; x < 1150; x++) for (let y = 430; y < 466; y++) {
    put(x, y, x < 920 ? 85 : (x < 1100 ? 170 : 32),
           x < 920 ? 85 : (x < 1100 ? 170 : 32),
           x < 920 ? 85 : (x < 1100 ? 170 : 32));
  }
  for (let y = 426; y < 470; y++) for (let x = 912; x < 926; x++) put(x, y, 238, 238, 238);
  drawText(put, 800, 480, "I'LL MOVE IF LESS THAN 33%", 2, 204, 39, 39);
  drawText(put, 800, 512, 'OF MY NEIGHBORS ARE LIKE ME', 2, 200, 200, 200);
  drawText(put, 800, 560, 'START', 3, 255, 255, 255);
  drawText(put, 980, 560, 'NEW BOARD', 3, 200, 200, 200);

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
