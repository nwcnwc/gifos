// Procedural icon for SkiFree: a snow rounded card, green trees, a magenta
// skier cutting down the slope, a faded ghost on their tail. Super-sample →
// box-downsample → small palette; deterministic so GIF builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 10;

const SKY_A = [186, 220, 242];
const SKY_B = [244, 247, 251];
const SNOW = [252, 253, 255];
const SNOW_D = [214, 226, 236];
const TREE = [46, 140, 72];
const TREE_D = [28, 96, 52];
const TRUNK = [110, 72, 42];
const SKI = [196, 40, 72];
const SKI_D = [140, 24, 52];
const SKIN = [255, 214, 170];
const GHOST = [120, 160, 210];
const INK = [22, 50, 74];
const YETI = [168, 176, 186];
const YETI_D = [110, 118, 130];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [SKY_A, SKY_B, SNOW, SNOW_D, TREE, TREE_D, TRUNK, SKI, SKI_D, SKIN, GHOST, INK, YETI, YETI_D]) {
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
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}
function inTri(x, y, x1, y1, x2, y2, x3, y3) {
  const s = (x1 - x3) * (y - y3) - (y1 - y3) * (x - x3);
  const t = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
  const u = (x3 - x2) * (y - y2) - (y3 - y2) * (x - x2);
  return (s >= 0 && t >= 0 && u >= 0) || (s <= 0 && t <= 0 && u <= 0);
}
function inCirc(x, y, cx, cy, r) {
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}

function trees() {
  return [
    { x: 28, y: 42, s: 11 },
    { x: 96, y: 38, s: 13 },
    { x: 22, y: 88, s: 15 },
    { x: 104, y: 78, s: 12 },
    { x: 40, y: 108, s: 9 },
    { x: 86, y: 102, s: 10 },
  ];
}

function skierAt(f, ghost) {
  const t = f / (FRAMES - 1);
  const sway = Math.sin(t * Math.PI * 2) * 10;
  if (ghost) {
    return { x: 52 + sway * 0.6, y: 44 + t * 18, lean: sway * 0.04 };
  }
  return { x: 64 + sway, y: 58 + t * 22, lean: sway * 0.08 };
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 7, rad = 20;
  const pines = trees();
  const me = skierAt(f, false);
  const gh = skierAt(f, true);
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      const gy = (y - m) / (OUT - 2 * m);
      col = gy < 0.28 ? mix(SKY_A, SKY_B, gy / 0.28) : mix(SNOW, SNOW_D, (gy - 0.28) / 0.72);
      // piste tracks
      if (gy > 0.32 && Math.abs(x - 64) < 22 + gy * 8 && ((x + y * 0.4) % 7 < 0.7)) {
        col = mix(col, SNOW_D, 0.35);
      }
      for (let i = 0; i < pines.length; i++) {
        const p = pines[i];
        if (inTri(x, y, p.x, p.y - p.s * 1.6, p.x - p.s, p.y + p.s * 0.4, p.x + p.s, p.y + p.s * 0.4)) {
          col = mix(TREE_D, TREE, (x - (p.x - p.s)) / (p.s * 2));
        }
        if (x > p.x - 1.4 && x < p.x + 1.4 && y > p.y + p.s * 0.2 && y < p.y + p.s * 0.85) col = TRUNK;
      }
      // ghost skier
      if (inCirc(x, y, gh.x, gh.y - 6, 4.2) || inTri(x, y, gh.x, gh.y - 10, gh.x - 5, gh.y + 2, gh.x + 5, gh.y + 2)) {
        col = mix(col, GHOST, 0.55);
      }
      if ((x > gh.x - 7 && x < gh.x + 7 && y > gh.y + 1 && y < gh.y + 3.2)) col = mix(col, GHOST, 0.5);
      // yeti, late frames
      if (f > 6) {
        const yx = 30 + (f - 6) * 4, yy = 70;
        if (inCirc(x, y, yx, yy - 8, 6) || inCirc(x, y, yx, yy + 2, 7)) col = mix(YETI_D, YETI, (x - yx + 8) / 16);
      }
      // player skier
      const sx = me.x + me.lean * (y - me.y), sy = me.y;
      if (inCirc(x, y, sx, sy - 7, 4.4)) col = SKIN;
      if (inTri(x, y, sx, sy - 11, sx - 6, sy + 3, sx + 6, sy + 3)) col = mix(SKI_D, SKI, (x - (sx - 6)) / 12);
      if (x > sx - 8 && x < sx + 8 && y > sy + 2 && y < sy + 4.4) col = SKI_D;
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
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

export function skiFreeIcon() {
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
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '·': [0, 0, 0, 0b00100, 0, 0, 0],
};
function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const gph = GLYPHS[ch] || GLYPHS[' '];
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

function paintTree(put, x, y, s) {
  for (let i = 0; i < s; i++) {
    const w = 2 + i * 1.15;
    const yy = y + i;
    for (let dx = -w; dx <= w; dx++) {
      const t = (dx + w) / (w * 2 || 1);
      const c = mix(TREE_D, TREE, t);
      put(x + dx, yy, c[0], c[1], c[2]);
    }
  }
  for (let i = 0; i < s * 0.35; i++) {
    put(x, y + s + i, TRUNK[0], TRUNK[1], TRUNK[2]);
    put(x + 1, y + s + i, TRUNK[0], TRUNK[1], TRUNK[2]);
  }
}

function paintSkier(put, x, y, col, ski) {
  for (let dy = -18; dy <= 8; dy++) for (let dx = -10; dx <= 10; dx++) {
    const inHead = dx * dx + (dy + 12) * (dy + 12) <= 36;
    const inBody = Math.abs(dx) < 7 - Math.abs(dy + 2) * 0.15 && dy > -10 && dy < 4;
    if (inHead) put(x + dx, y + dy, SKIN[0], SKIN[1], SKIN[2]);
    else if (inBody) put(x + dx, y + dy, col[0], col[1], col[2]);
  }
  for (let dx = -14; dx <= 14; dx++) {
    put(x + dx, y + 8, ski[0], ski[1], ski[2]);
    put(x + dx, y + 9, ski[0], ski[1], ski[2]);
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

  for (let y = 0; y < H; y++) {
    const gy = y / H;
    const sky = gy < 0.28 ? mix(SKY_A, SKY_B, gy / 0.28) : mix(SNOW, SNOW_D, (gy - 0.28) / 0.72);
    for (let x = 0; x < W; x++) put(x, y, sky[0], sky[1], sky[2]);
  }

  const grove = [
    [180, 220, 70], [320, 300, 90], [90, 480, 110], [250, 560, 80],
    [980, 200, 85], [1100, 340, 95], [1020, 520, 75], [880, 600, 100],
    [420, 640, 60], [760, 180, 55], [540, 250, 48],
  ];
  for (const [x, y, s] of grove) paintTree(put, x, y, s);

  paintSkier(put, 620, 360, SKI, SKI_D);
  paintSkier(put, 540, 260, mix(GHOST, SNOW, 0.25), mix(GHOST, INK, 0.2));

  // yeti
  for (let dy = -28; dy <= 24; dy++) for (let dx = -22; dx <= 22; dx++) {
    if (dx * dx * 0.7 + (dy + 4) * (dy + 4) <= 420) {
      put(140 + dx, 340 + dy, YETI[0], YETI[1], YETI[2]);
    }
  }

  drawText(put, 64, 64, 'SKIFREE', 10, 22, 50, 74);
  drawText(put, 64, 160, 'POINT AND SKI', 5, 40, 80, 110);
  drawText(put, 64, 230, 'RACE A GHOST', 5, 180, 32, 58);
  drawText(put, 64, 640, 'FARTHEST WINS', 3, 22, 50, 74);

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
