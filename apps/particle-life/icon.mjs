// Procedural Particle Life icon: colourful specks that scatter, then cluster.
// Cover paints a real jar (atoms from the engine) — never an empty black field.
// Pure Node, super-sample → box-downsample → small palette; deterministic.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const WORLD_W = 800, WORLD_H = 800;

const CARD = [8, 10, 16];
const CARD_D = [4, 5, 10];
const INK = [232, 238, 244];
const CYAN = [46, 224, 234];
const GREEN = [58, 224, 106];
const RED = [255, 68, 85];
const ORANGE = [255, 176, 58];
const MAGENTA = [255, 90, 200];
const LAVENDER = [200, 168, 255];
const COLS = [GREEN, RED, ORANGE, CYAN, MAGENTA];

const CSS_RGB = {
  '#3ae06a': GREEN, '#ff4455': RED, '#ffb03a': ORANGE, '#2ee0ea': CYAN,
  '#ff5ac8': MAGENTA, '#c8a8ff': LAVENDER, '#3ad4b8': [58, 212, 184],
  green: GREEN, red: RED, orange: ORANGE, cyan: CYAN, magenta: MAGENTA,
  lavender: LAVENDER, teal: [58, 212, 184]
};

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
  for (const b of [CARD, CARD_D, INK, CYAN, ...COLS, LAVENDER]) {
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

// Four clumps + a small mixed cell. Each speck is born scattered and falls in.
const CLUMPS = [
  { x: 42, y: 46, c: 0, n: 20, spread: 11, worm: 18 },
  { x: 88, y: 40, c: 1, n: 18, spread: 10, worm: 16 },
  { x: 48, y: 88, c: 2, n: 16, spread: 9, worm: 14 },
  { x: 92, y: 86, c: 3, n: 18, spread: 10, worm: 16 },
  { x: 66, y: 64, c: 4, n: 12, spread: 7, worm: 8 },
];

function specks(f) {
  const rnd = mulberry(0x91a7e);
  const t = f / (FRAMES - 1);
  const collapse = t < 0.7 ? (t / 0.7) * (t / 0.7) : 1; // ease-in cluster
  const out = [];
  for (const cl of CLUMPS) {
    for (let i = 0; i < cl.n; i++) {
      const bornAng = rnd() * Math.PI * 2;
      const bornRad = 28 + rnd() * 36;
      const sx = 64 + Math.cos(bornAng) * bornRad;
      const sy = 64 + Math.sin(bornAng) * bornRad * 0.9;
      const worm = (i / cl.n - 0.5) * cl.worm;
      const orbit = t * (0.7 + rnd() * 0.6);
      const ang = rnd() * Math.PI * 2 + orbit;
      const rad = (rnd() ** 0.55) * cl.spread * (1.15 - 0.35 * collapse);
      const ex = cl.x + Math.cos(ang) * rad + Math.cos(ang * 0.4) * worm * 0.35;
      const ey = cl.y + Math.sin(ang) * rad * 0.82 + Math.sin(t * Math.PI * 2 + i) * 1.1;
      out.push({
        x: sx + (ex - sx) * collapse,
        y: sy + (ey - sy) * collapse,
        c: cl.c,
        r: 1.45 + rnd() * 1.15
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
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'J': [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
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

function rgbOf(name) {
  if (!name) return CYAN;
  const k = String(name).toLowerCase();
  if (CSS_RGB[k]) return CSS_RGB[k];
  if (k[0] === '#' && k.length === 7) {
    return [parseInt(k.slice(1, 3), 16), parseInt(k.slice(3, 5), 16), parseInt(k.slice(5, 7), 16)];
  }
  return CYAN;
}

function fallbackAtoms() {
  const rnd = mulberry(0x51fe);
  const atoms = [];
  const clumps = [
    { x: 240, y: 220, c: 0, n: 160, s: 95, worm: 70 },
    { x: 540, y: 200, c: 1, n: 150, s: 88, worm: 64 },
    { x: 360, y: 430, c: 2, n: 155, s: 92, worm: 80 },
    { x: 620, y: 500, c: 3, n: 160, s: 96, worm: 72 },
    { x: 420, y: 340, c: 4, n: 90, s: 58, worm: 40 },
    { x: 150, y: 560, c: 0, n: 70, s: 48, worm: 30 },
    { x: 680, y: 280, c: 2, n: 70, s: 46, worm: 28 },
    { x: 560, y: 640, c: 1, n: 60, s: 42, worm: 24 },
  ];
  for (const cl of clumps) {
    for (let i = 0; i < cl.n; i++) {
      const ang = rnd() * Math.PI * 2;
      const rad = (rnd() ** 0.45) * cl.s;
      const worm = (i / cl.n - 0.5) * cl.worm;
      atoms.push([
        cl.x + Math.cos(ang) * rad + Math.cos(ang * 0.5) * worm,
        cl.y + Math.sin(ang) * rad * 0.78 + Math.sin(ang * 0.7) * worm * 0.4,
        0, 0, cl.c
      ]);
    }
  }
  return atoms;
}

function encodePng(W, H, rgba) {
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

export function screenshotPng(opts) {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b, a) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };
  const rr = (x0, y0, x1, y1, rad, r, g, b) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
      const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
    }
  };

  const atoms = (opts && opts.atoms && opts.atoms.length) ? opts.atoms : fallbackAtoms();
  const palette = (opts && opts.colors && opts.colors.length)
    ? opts.colors.map(rgbOf)
    : COLS;

  // Crop to the densest part of the jar so the card is full of life, not a
  // black sea with five lonely islands.
  const GW = 16, GH = 10;
  const hist = new Uint16Array(GW * GH);
  let n = 0;
  for (const a of atoms) {
    if (!a) continue;
    n++;
    const gx = Math.min(GW - 1, Math.max(0, (a[0] / WORLD_W * GW) | 0));
    const gy = Math.min(GH - 1, Math.max(0, (a[1] / WORLD_H * GH) | 0));
    hist[gy * GW + gx]++;
  }
  if (n < 8) return encodePng(W, H, rgba);
  let best = 0, bx = 4, by = 3;
  const CW = 9, CH = 6; // ~ window of the grid, ~ 4:3 of the world
  for (let y = 0; y <= GH - CH; y++) for (let x = 0; x <= GW - CW; x++) {
    let s = 0;
    for (let yy = 0; yy < CH; yy++) for (let xx = 0; xx < CW; xx++) s += hist[(y + yy) * GW + (x + xx)];
    if (s > best) { best = s; bx = x; by = y; }
  }
  const x0 = bx / GW * WORLD_W, y0 = by / GH * WORLD_H;
  const x1 = (bx + CW) / GW * WORLD_W, y1 = (by + CH) / GH * WORLD_H;
  const s = Math.max(W / Math.max(40, x1 - x0), H / Math.max(40, y1 - y0));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 5, 6, 10);

  for (const a of atoms) {
    const x = (a[0] - cx) * s + W / 2;
    const y = (a[1] - cy) * s + H / 2;
    const col = palette[a[4] % palette.length] || CYAN;
    const R = 5;
    for (let dy = -R - 1; dy <= R + 1; dy++) for (let dx = -R - 1; dx <= R + 1; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 <= R * R) put(x + dx, y + dy, col[0], col[1], col[2]);
      else if (d2 <= (R + 1.6) * (R + 1.6)) {
        const t = 1 - (Math.sqrt(d2) - R) / 1.6;
        const px = (x + dx) | 0, py = (y + dy) | 0;
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const o = (py * W + px) * 4;
        rgba[o] = (rgba[o] * (1 - t) + col[0] * t) | 0;
        rgba[o + 1] = (rgba[o + 1] * (1 - t) + col[1] * t) | 0;
        rgba[o + 2] = (rgba[o + 2] * (1 - t) + col[2] * t) | 0;
        rgba[o + 3] = 255;
      }
    }
  }

  // Two stir rings sitting on real clumps — a poke you made, a poke they made.
  const mapped = [];
  for (const a of atoms) {
    const x = (a[0] - cx) * s + W / 2;
    const y = (a[1] - cy) * s + H / 2;
    if (x > 80 && x < W - 80 && y > 80 && y < H - 140) mapped.push([x, y]);
  }
  function densest(ignore) {
    let best = 0, bx = W * 0.4, by = H * 0.4;
    const step = 40;
    for (let y = 100; y < H - 160; y += step) for (let x = 100; x < W - 100; x += step) {
      if (ignore && Math.hypot(x - ignore[0], y - ignore[1]) < 140) continue;
      let c = 0;
      for (const p of mapped) {
        const dx = p[0] - x, dy = p[1] - y;
        if (dx * dx + dy * dy < 55 * 55) c++;
      }
      if (c > best) { best = c; bx = x; by = y; }
    }
    return [bx, by];
  }
  const p1 = densest(null);
  const p2 = densest(p1);
  function ring(rx, ry, r0, cr, cg, cb) {
    for (let a = 0; a < 360; a++) {
      const th = a * Math.PI / 180;
      for (let w = 0; w < 3; w++) put(rx + Math.cos(th) * (r0 + w), ry + Math.sin(th) * (r0 + w), cr, cg, cb);
    }
  }
  ring(p1[0], p1[1], 58, 80, 220, 255);
  ring(p2[0], p2[1], 46, 255, 176, 80);

  // Chip over the jar — the reason to use this copy.
  rr(36, H - 118, 430, H - 36, 14, 0, 196, 204);
  drawText(put, 56, H - 96, 'SHARE THE JAR', 4, 8, 16, 20);
  drawText(put, 56, H - 64, 'ONE LINK. THEY SEE IT.', 2, 8, 32, 36);

  return encodePng(W, H, rgba);
}
