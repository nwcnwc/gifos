// Procedural OpenJSCAD icon: a brass gear that turns. Cover is a 1200×720
// split of the gear script beside the lit solid. Pure Node.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [18, 16, 12];
const BRASS = [242, 180, 52];
const BRASS_D = [160, 100, 28];
const INK = [232, 228, 214];
const HOLE = [22, 20, 16];
const LINE = [70, 62, 40];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, BRASS, BRASS_D, INK, HOLE, LINE, [255, 255, 255], [40, 120, 200]]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.3).map(Math.round));
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

function gearHit(x, y, cx, cy, rot, teeth, outer, inner, bore) {
  const dx = x - cx, dy = y - cy;
  const d = Math.hypot(dx, dy);
  if (d < bore) return 'hole';
  if (d > outer + 1.2) return null;
  const ang = Math.atan2(dy, dx) - rot;
  const step = Math.PI * 2 / teeth;
  let a = ang % step;
  if (a < 0) a += step;
  const mid = step / 2;
  const t = Math.abs(a - mid) / mid;
  const rim = t < 0.38 ? outer : inner;
  if (d <= rim) return 'body';
  if (d <= rim + 1.1 && t < 0.5) return 'edge';
  return null;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const rot = (f / FRAMES) * Math.PI * 2 / 8;
  const cx = OUT / 2, cy = OUT / 2 + 2;
  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
      if (!inCard(x, y, 6, 20)) continue;
      const o = (py * RW + px) * 4;
      let col = mix(CARD, [28, 24, 18], (y - 6) / (OUT - 12));
      const hit = gearHit(x, y, cx, cy, rot, 10, 42, 30, 10);
      if (hit === 'body') {
        const nx = (x - cx) / 42, ny = (y - cy) / 42;
        const nd = Math.max(0, nx * -0.35 + ny * -0.55 + 0.75);
        col = mix(BRASS_D, BRASS, 0.25 + 0.75 * nd);
      } else if (hit === 'edge') {
        col = INK;
      } else if (hit === 'hole') {
        col = HOLE;
      }
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

export function openjscadIcon() {
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
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b01010, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '=': [0, 0b11111, 0, 0b11111, 0, 0, 0],
  '(': [0b00100, 0b01000, 0b10000, 0b10000, 0b10000, 0b01000, 0b00100],
  ')': [0b00100, 0b00010, 0b00001, 0b00001, 0b00001, 0b00010, 0b00100],
  '{': [0b00110, 0b01000, 0b01000, 0b10000, 0b01000, 0b01000, 0b00110],
  '}': [0b01100, 0b00010, 0b00010, 0b00001, 0b00010, 0b00010, 0b01100],
  ',': [0, 0, 0, 0, 0b00100, 0b00100, 0b01000],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  '\'': [0b00100, 0b00100, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '/': [0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b10000, 0b10000],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const gph = GLYPHS[ch] || GLYPHS[' '];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (gph[row] & (1 << (4 - col))) {
          for (let dy = 0; dy < s; dy++) {
            for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
          }
        }
      }
    }
    cx += 6 * s;
  }
}

function blob(put, cx, cy, rx, ry, col, lx, ly, lz) {
  const x0 = Math.max(0, (cx - rx) | 0), x1 = (cx + rx) | 0;
  const y0 = Math.max(0, (cy - ry) | 0), y1 = (cy + ry) | 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const nx = (x - cx) / rx, ny = (y - cy) / ry;
    const d = nx * nx + ny * ny;
    if (d > 1) continue;
    const nz = Math.sqrt(Math.max(0, 1 - d));
    const nd = Math.max(0, nx * lx + ny * ly + nz * lz);
    const s = 0.22 + 0.78 * nd;
    put(x, y, col[0] * s, col[1] * s, col[2] * s);
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

  fill(0, 0, W, H, 10, 10, 15);
  fill(0, 0, 520, H, 16, 16, 22);
  fill(520, 0, W, H, 14, 15, 18);

  fill(16, 16, 108, 54, 43, 108, 176);
  drawText(put, 34, 26, 'RUN', 2, 255, 255, 255);
  fill(116, 16, 200, 54, 242, 180, 52);
  drawText(put, 130, 26, 'GEAR', 2, 26, 18, 8);
  fill(208, 16, 292, 54, 30, 30, 40);
  drawText(put, 222, 26, 'CUBE', 2, 210, 210, 220);
  fill(300, 16, 384, 54, 30, 30, 40);
  drawText(put, 318, 26, 'STL', 2, 210, 210, 220);

  const code = [
    'CONST MAIN = (P) => {',
    '  CONST BODY = EXTRUDE(',
    '    GEARPROFILE(P.TEETH)',
    '  )',
    '  CONST HOLE = CYLINDER(',
    '    { RADIUS: P.BORE }',
    '  )',
    '  RETURN SUBTRACT(BODY, HOLE)',
    '}',
  ];
  code.forEach((ln, i) => drawText(put, 28, 84 + i * 28, ln, 2, 180, 200, 220));

  drawText(put, 28, 380, 'TEETH', 2, 154, 148, 130);
  fill(130, 384, 360, 396, 40, 40, 50);
  fill(130, 384, 250, 396, 242, 180, 52);
  drawText(put, 370, 380, '16', 2, 242, 180, 52);
  drawText(put, 28, 420, 'THICK', 2, 154, 148, 130);
  fill(130, 424, 360, 436, 40, 40, 50);
  fill(130, 424, 210, 436, 242, 180, 52);
  drawText(put, 370, 420, '6', 2, 242, 180, 52);
  drawText(put, 28, 460, 'BORE', 2, 154, 148, 130);
  fill(130, 464, 360, 476, 40, 40, 50);
  fill(130, 464, 190, 476, 242, 180, 52);
  drawText(put, 370, 460, '4', 2, 242, 180, 52);

  drawText(put, 28, 640, '1840 TRIANGLES  32 MS', 2, 154, 148, 130);

  for (let i = 0; i < 14; i++) {
    const y = 520 + i * 12;
    fill(560 + i * 6, y, 1160 - i * 6, y + 1, 32 + i, 34 + i, 40);
  }

  const Lx = -0.35, Ly = -0.55, Lz = 0.8;
  const gcx = 860, gcy = 330;
  const iso = 0.62;
  for (let layer = 26; layer >= 0; layer--) {
    const ox = layer * 0.15, oy = layer * 0.85;
    const face = layer === 0;
    for (let y = gcy - 200; y <= gcy + 200; y++) {
      for (let x = gcx - 210; x <= gcx + 210; x++) {
        const sx = x - ox;
        const sy = gcy + (y - oy - gcy) / iso;
        const hit = gearHit(sx, sy, gcx, gcy, 0.22, 16, 198, 146, 40);
        if (!hit || hit === 'hole') continue;
        if (!face && hit === 'edge') continue;
        const nx = (sx - gcx) / 198, ny = (sy - gcy) / 198;
        const d = nx * nx + ny * ny;
        const nz = Math.sqrt(Math.max(0, 1 - d));
        const nd = Math.max(0, nx * Lx + ny * Ly + nz * Lz);
        let col;
        if (!face) col = mix(BRASS_D, HOLE, 0.15);
        else if (hit === 'edge') col = INK;
        else col = mix(BRASS_D, BRASS, 0.22 + 0.78 * nd);
        put(x, y, col[0], col[1], col[2]);
      }
    }
  }
  blob(put, gcx, gcy, 36, 22, HOLE, 0, 0, 1);

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
