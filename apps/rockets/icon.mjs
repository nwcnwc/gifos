// Procedural icon: a dark rounded card of space, a rocket catching a star.
// The chase closes across the frames — the animation demonstrates.
//
// Pure Node — no canvas. Super-sample → box-downsample → small palette;
// deterministic so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [18, 14, 36];
const CARD_B = [6, 8, 18];
const ORANGE = [255, 140, 64];
const ORANGE_D = [180, 70, 28];
const GOLD = [255, 210, 80];
const GOLD_D = [180, 130, 20];
const WHITE = [255, 246, 232];
const FLAME = [255, 90, 40];
const CYAN = [126, 224, 255];
const TEAL = [40, 160, 200];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, ORANGE, ORANGE_D, GOLD, GOLD_D, WHITE, FLAME, CYAN, TEAL]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
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

function side(ax, ay, bx, by, px, py) { return (px - ax) * (by - ay) - (py - ay) * (bx - ax); }
function inTri(px, py, a, b, c) {
  const s1 = side(a[0], a[1], b[0], b[1], px, py);
  const s2 = side(b[0], b[1], c[0], c[1], px, py);
  const s3 = side(c[0], c[1], a[0], a[1], px, py);
  const hasNeg = s1 < 0 || s2 < 0 || s3 < 0;
  const hasPos = s1 > 0 || s2 > 0 || s3 > 0;
  return !(hasNeg && hasPos);
}

function inStar(x, y, cx, cy, r) {
  const dx = x - cx, dy = y - cy;
  const d = Math.hypot(dx, dy);
  if (d > r) return false;
  const a = Math.atan2(dy, dx);
  const t = ((a + Math.PI) / (Math.PI * 2) * 5);
  const f = Math.abs(t - Math.round(t));
  const rad = r * 0.38 + (r - r * 0.38) * (1 - Math.min(1, f * 2.15));
  return d <= rad;
}

function rot(lx, ly, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return [lx * c - ly * s, lx * s + ly * c];
}

function rocketAt(x, y, cx, cy, ang, scale) {
  const dx = x - cx, dy = y - cy;
  const p = rot(dx, dy, -ang);
  const lx = p[0] / scale, ly = p[1] / scale;
  // nose at +x
  const body = inTri(lx, ly, [16, 0], [-11, 8], [-11, -8]);
  const finL = inTri(lx, ly, [-10, -8], [-4, -3], [-12, -14]);
  const finR = inTri(lx, ly, [-10, 8], [-4, 3], [-12, 14]);
  const canopy = ((lx - 5) * (lx - 5) / 16 + ly * ly / 9) <= 1 && lx > 1;
  const flame = inTri(lx, ly, [-11, -5], [-11, 5], [-11 - 12, 0]);
  if (canopy) return 'canopy';
  if (body) return 'body';
  if (finL || finR) return 'fin';
  if (flame) return 'flame';
  return null;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const t = f / FRAMES;
  const catchT = 0.72;
  const caught = t > catchT;
  const fly = Math.min(1, t / catchT);
  const rx = 32 + fly * 50;
  const ry = 88 - fly * 42;
  const ang = -0.78 + fly * 0.38;
  const sx = 88, sy = 44;
  const burst = caught ? (t - catchT) / (1 - catchT) : 0;
  const sparkle = [
    [28, 32], [48, 24], [100, 36], [108, 88], [30, 100], [70, 108], [92, 70], [54, 54]
  ];

  for (let pyi = 0; pyi < RW; pyi++) for (let pxi = 0; pxi < RW; pxi++) {
    const x = pxi / SS, y = pyi / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      for (let i = 0; i < sparkle.length; i++) {
        const dx = x - sparkle[i][0], dy = y - sparkle[i][1];
        if (dx * dx + dy * dy < 1.7 * 1.7) col = mix(col, WHITE, 0.45 + 0.2 * Math.sin(t * Math.PI * 2 + i));
      }
      if ((!caught || burst < 0.45) && inStar(x, y, sx, sy, 14 * (caught ? 1 - burst * 0.7 : 1))) {
        const d = Math.hypot(x - sx, y - sy) / 14;
        col = d < 0.35 ? WHITE : mix(GOLD, GOLD_D, d);
      }
      if (caught && burst < 0.9) {
        const d = Math.hypot(x - sx, y - sy);
        const ring = Math.abs(d - burst * 26);
        if (ring < 2.8) col = mix(GOLD, WHITE, 0.7);
        else if (d < 8 * (1 - burst)) col = mix(GOLD, WHITE, 1 - burst);
      }
      const part = rocketAt(x, y, rx, ry, ang, 1.18);
      if (part === 'flame' && !caught) col = mix(FLAME, GOLD, (Math.sin(t * 40) * 0.5 + 0.5));
      if (part === 'fin') col = ORANGE_D;
      if (part === 'body') {
        const along = (x - rx + 8) / 24;
        col = mix(ORANGE_D, ORANGE, Math.max(0, Math.min(1, along)));
      }
      if (part === 'canopy') col = mix(CYAN, WHITE, 0.35);
    }
    const o = (pyi * RW + pxi) * 4;
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

export function rocketsIcon() {
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
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  ':': [0, 0b00100, 0b00100, 0, 0b00100, 0b00100, 0],
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

function putStar(put, cx, cy, r, col, rim) {
  const reach = Math.ceil(r * 2.2);
  for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
    const d = Math.hypot(dx, dy);
    if (inStar(cx + dx, cy + dy, cx, cy, r)) {
      const u = d / r;
      const c = mix(col, rim, u * 0.55);
      const shine = Math.max(0, 1 - Math.hypot(dx + r * 0.25, dy + r * 0.25) / (r * 0.5));
      const cc = mix(c, WHITE, shine * 0.5);
      put(cx + dx, cy + dy, cc[0] | 0, cc[1] | 0, cc[2] | 0);
    } else if (d < r * 1.7) {
      const a = (1 - d / (r * 1.7)) * 0.22;
      if (a > 0.04) {
        const bg = [12, 10, 28];
        const c = mix(bg, col, a);
        put(cx + dx, cy + dy, c[0] | 0, c[1] | 0, c[2] | 0);
      }
    }
  }
}

function putRocket(put, cx, cy, ang, scale, body, rim) {
  const reach = 22 * scale;
  for (let ly = -reach; ly <= reach; ly++) for (let lx = -reach * 1.3; lx <= reach * 1.3; lx++) {
    const p = rot(lx, ly, ang);
    const x = (cx + p[0]) | 0, y = (cy + p[1]) | 0;
    const slx = lx / scale, sly = ly / scale;
    const flame = inTri(slx, sly, [-11, -5], [-11, 5], [-22, 0]);
    const finL = inTri(slx, sly, [-10, -8], [-4, -3], [-12, -14]);
    const finR = inTri(slx, sly, [-10, 8], [-4, 3], [-12, 14]);
    const hull = inTri(slx, sly, [16, 0], [-11, 8], [-11, -8]);
    const canopy = ((slx - 5) * (slx - 5) / 16 + sly * sly / 9) <= 1 && slx > 1;
    if (flame) put(x, y, FLAME[0], 140, 50);
    else if (finL || finR) put(x, y, rim[0], rim[1], rim[2]);
    else if (canopy) put(x, y, 180, 230, 255);
    else if (hull) {
      const u = (slx + 11) / 27;
      const c = mix(rim, body, Math.max(0, Math.min(1, u)));
      put(x, y, c[0] | 0, c[1] | 0, c[2] | 0);
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

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - W * 0.5) / (W * 0.5), dy = (y - H * 0.42) / (H * 0.7);
    const d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
    put(x, y, (12 + d * 10) | 0, (10 + d * 8) | 0, (28 + d * 10) | 0);
  }

  const rng = (function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  })(0x5A1A5A);
  for (let i = 0; i < 140; i++) {
    const x = (rng() * W) | 0, y = (rng() * H) | 0;
    const b = 160 + (rng() * 80) | 0;
    put(x, y, b, b, Math.min(255, b + 20));
  }

  const stars = [
    [180, 140, 20, GOLD], [320, 220, 15, GOLD], [480, 110, 22, GOLD],
    [640, 260, 17, GOLD], [820, 160, 24, GOLD], [980, 240, 16, GOLD],
    [240, 420, 18, GOLD], [430, 500, 14, GOLD], [710, 480, 20, GOLD],
    [900, 400, 17, GOLD], [1080, 520, 19, GOLD], [150, 600, 15, GOLD],
    [560, 600, 16, CYAN], [1000, 120, 14, CYAN], [760, 320, 18, GOLD],
    [390, 280, 13, GOLD], [520, 380, 15, GOLD], [110, 300, 12, GOLD],
    [1050, 360, 13, CYAN], [670, 140, 12, GOLD], [300, 640, 14, GOLD],
  ];
  for (const s of stars) putStar(put, s[0], s[1], s[2], s[3], mix(s[3], [0, 0, 0], 0.4));

  putRocket(put, 400, 330, -0.5, 2.8, ORANGE, ORANGE_D);
  putRocket(put, 840, 270, 0.35, 2.1, TEAL, mix(TEAL, [0, 0, 0], 0.35));

  // score HUD, top-left — a mid-sky with a score, never empty
  for (let y = 36; y < 132; y++) for (let x = 36; x < 250; x++) {
    put(x, y, 8, 10, 22);
  }
  drawText(put, 52, 50, 'SCORE', 3, 255, 210, 150);
  drawText(put, 52, 78, '27', 6, 255, 231, 194);
  for (let y = 36; y < 132; y++) for (let x = 270; x < 470; x++) {
    put(x, y, 8, 10, 22);
  }
  drawText(put, 286, 50, 'TIME', 3, 255, 210, 150);
  drawText(put, 286, 78, '0:41', 6, 255, 231, 194);

  drawText(put, 52, 640, 'CATCH STARS', 4, 255, 178, 90);

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
