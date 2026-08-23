// Procedural Particle Life icon: a dark rounded card holding coloured
// specks that drift into little clumps. Pure Node, super-sample →
// box-downsample → small palette; deterministic so builds reproduce.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [10, 12, 16];
const CARD_D = [4, 6, 10];
const INK = [232, 238, 244];
const CYAN = [0, 196, 204];
const GREEN = [40, 200, 90];
const RED = [230, 60, 70];
const ORANGE = [255, 150, 50];
const MAGENTA = [220, 80, 180];
const COLS = [GREEN, RED, ORANGE, CYAN, MAGENTA];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, CARD_D, INK, CYAN, ...COLS]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.4).map(Math.round));
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

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const CLUMPS = [
  { x: 40, y: 48, c: 0, n: 18, spread: 11 },
  { x: 86, y: 42, c: 1, n: 16, spread: 10 },
  { x: 52, y: 84, c: 2, n: 14, spread: 9 },
  { x: 90, y: 88, c: 3, n: 16, spread: 10 },
  { x: 64, y: 64, c: 4, n: 10, spread: 7 },
];

function specks(f) {
  const rnd = mulberry(0x91a7e);
  const t = f / FRAMES;
  const out = [];
  for (const cl of CLUMPS) {
    for (let i = 0; i < cl.n; i++) {
      const ang = rnd() * Math.PI * 2 + t * (0.6 + rnd());
      const rad = (rnd() ** 0.55) * cl.spread;
      const wob = Math.sin(t * Math.PI * 2 + i) * 1.6;
      out.push({
        x: cl.x + Math.cos(ang) * rad + wob,
        y: cl.y + Math.sin(ang) * rad * 0.85 + Math.cos(t * 4 + i) * 1.2,
        c: cl.c,
        r: 1.3 + rnd() * 1.1
      });
    }
  }
  return out;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const dots = specks(f);
  const m = 8, rad = 22;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    if (!inCard(x, y, m, rad)) continue;
    let col = mix(CARD, CARD_D, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
    for (const d of dots) {
      const dx = x - d.x, dy = y - d.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < d.r) col = COLS[d.c];
      else if (dist < d.r + 1.4) col = mix(col, COLS[d.c], 1 - (dist - d.r) / 1.4);
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

export function particleLifeIcon() {
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
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'J': [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
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
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'X': [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
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
  const rr = (x0, y0, x1, y1, rad, r, g, b) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
      const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
    }
  };

  fill(0, 0, W, H, 8, 10, 14);
  drawText(put, 48, 56, 'PARTICLE', 7, 232, 238, 244);
  drawText(put, 48, 120, 'LIFE', 7, 0, 196, 204);
  drawText(put, 48, 200, 'TOUCH TO STIR', 3, 255, 176, 80);
  rr(48, 260, 340, 330, 8, 0, 196, 204);
  drawText(put, 64, 282, 'SHARE THE JAR', 3, 8, 16, 20);
  drawText(put, 48, 360, 'SAME MIX', 3, 232, 238, 244);
  drawText(put, 48, 412, 'YOUR STIR', 3, 232, 238, 244);
  drawText(put, 48, 464, 'THEY SEE IT', 3, 170, 90, 200);

  // The jar
  rr(430, 40, 1160, 680, 16, 4, 6, 10);
  const rnd = mulberry(0x51fe);
  const clumps = [
    { x: 620, y: 220, c: GREEN, n: 90, s: 70 },
    { x: 880, y: 200, c: RED, n: 80, s: 64 },
    { x: 700, y: 420, c: ORANGE, n: 85, s: 68 },
    { x: 960, y: 460, c: CYAN, n: 90, s: 72 },
    { x: 820, y: 340, c: MAGENTA, n: 50, s: 48 },
    { x: 540, y: 500, c: GREEN, n: 40, s: 40 },
    { x: 1040, y: 280, c: ORANGE, n: 36, s: 36 },
  ];
  for (const cl of clumps) {
    for (let i = 0; i < cl.n; i++) {
      const ang = rnd() * Math.PI * 2;
      const rad = (rnd() ** 0.5) * cl.s;
      const x = cl.x + Math.cos(ang) * rad;
      const y = cl.y + Math.sin(ang) * rad * 0.82;
      const R = 2 + (rnd() * 2) | 0;
      const col = mix(cl.c, [255, 255, 255], rnd() * 0.25);
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy <= R * R) put(x + dx, y + dy, col[0], col[1], col[2]);
      }
    }
  }
  // a stir ring
  const rx = 780, ry = 300, rr0 = 54;
  for (let a = 0; a < 360; a++) {
    const th = a * Math.PI / 180;
    for (let w = 0; w < 3; w++) {
      put(rx + Math.cos(th) * (rr0 + w), ry + Math.sin(th) * (rr0 + w), 120, 220, 255);
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
