// Procedural icon: a line drawing itself across a dark card.
// Cover: a mid-round doodle, whose-turn visible. Never a blank page.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [22, 20, 16];
const PAPER = [28, 25, 21];
const PAPER_L = [42, 37, 30];
const CREAM = [244, 239, 230];
const GOLD = [244, 201, 93];
const GOLD_H = [255, 232, 160];
const CORAL = [232, 93, 76];
const MINT = [109, 206, 122];
const SKY = [110, 181, 255];
const LILAC = [201, 160, 255];
const INK = [18, 16, 12];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, PAPER, PAPER_L, CREAM, GOLD, GOLD_H, CORAL, MINT, SKY, LILAC, INK]) {
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

function bez(t, p0, p1, p2, p3) {
  const u = 1 - t, uu = u * u, uuu = uu * u, tt = t * t, ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y
  };
}
function sampleBez(p0, p1, p2, p3, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(bez(i / n, p0, p1, p2, p3));
  return pts;
}
function stampAt(rgba, cx, cy, r, col) {
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(RW - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(RW - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > r + 0.7) continue;
    let a = 1;
    if (d > r - 0.7) a = Math.max(0, (r + 0.7 - d) / 1.4);
    const o = (y * RW + x) * 4;
    if (!rgba[o + 3]) continue;
    rgba[o] = rgba[o] * (1 - a) + col[0] * a;
    rgba[o + 1] = rgba[o + 1] * (1 - a) + col[1] * a;
    rgba[o + 2] = rgba[o + 2] * (1 - a) + col[2] * a;
  }
}
function stamp(rgba, pts, until, rad, col, aaScale) {
  const r = rad * aaScale;
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const maxLen = total * Math.max(0, Math.min(1, until));
  let walked = 0;
  const step = Math.max(0.35, rad * 0.4);
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x, ay = pts[i - 1].y, bx = pts[i].x, by = pts[i].y;
    const seg = Math.hypot(bx - ax, by - ay) || 1e-6;
    for (let u = 0; u < 1; u += step / seg) {
      if (walked + u * seg > maxLen) return;
      stampAt(rgba, (ax + (bx - ax) * u) * aaScale, (ay + (by - ay) * u) * aaScale, r, col);
    }
    walked += seg;
    if (walked > maxLen) return;
  }
  if (until >= 1 && pts.length) {
    const last = pts[pts.length - 1];
    stampAt(rgba, last.x * aaScale, last.y * aaScale, r, col);
  }
}

function along(pts, until) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const want = total * Math.max(0, Math.min(1, until));
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x, ay = pts[i - 1].y, bx = pts[i].x, by = pts[i].y;
    const seg = Math.hypot(bx - ax, by - ay) || 1e-6;
    if (walked + seg >= want) {
      const u = (want - walked) / seg;
      return { x: ax + (bx - ax) * u, y: ay + (by - ay) * u };
    }
    walked += seg;
  }
  return pts[pts.length - 1];
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  // Draw over the first 9 frames, hold the last 3 — a line drawing itself.
  const t = f <= 8 ? f / 8 : 1;
  const m = 8, rad = 18;
  const gold = sampleBez(
    { x: 18, y: 86 }, { x: 36, y: 28 }, { x: 86, y: 104 }, { x: 112, y: 40 }
  , 72);
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      const u = Math.max(0, Math.min(1, (x + y) / (OUT * 2)));
      col = mix(PAPER, PAPER_L, u);
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }
  stamp(rgba, gold, t, 3.4, mix(GOLD_H, GOLD, 0.35), SS);
  if (t > 0.02 && t < 0.995) {
    const nib = along(gold, t);
    stampAt(rgba, nib.x * SS, nib.y * SS, 5.2 * SS, GOLD_H);
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

export function oneStrokeIcon() {
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
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  3: [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  6: [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  X: [0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b01010, 0b10001],
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
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
  "'": [0b00100, 0b00100, 0b01000, 0, 0, 0, 0],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0, 0b00100],
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

function disc(put, cx, cy, rad, hi, lo) {
  const ir = Math.ceil(rad + 1);
  for (let dy = -ir; dy <= ir; dy++) for (let dx = -ir; dx <= ir; dx++) {
    const d = Math.hypot(dx, dy);
    if (d > rad + 0.6) continue;
    let a = 1;
    if (d > rad - 0.6) a = Math.max(0, rad + 0.6 - d);
    const u = (dx + rad) / (rad * 2);
    const r = (hi[0] + (lo[0] - hi[0]) * u) | 0;
    const g = (hi[1] + (lo[1] - hi[1]) * u) | 0;
    const b = (hi[2] + (lo[2] - hi[2]) * u) | 0;
    if (a >= 1) put(cx + dx, cy + dy, r, g, b);
    else if (a > 0.15) put(cx + dx, cy + dy, r, g, b);
  }
}

function stampPx(put, pts, until, rad, col) {
  const lo = mix(col, [0, 0, 0], 0.25).map(Math.round);
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  const maxLen = total * Math.max(0, Math.min(1, until));
  let walked = 0;
  const step = Math.max(0.8, rad * 0.45);
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1].x, ay = pts[i - 1].y, bx = pts[i].x, by = pts[i].y;
    const seg = Math.hypot(bx - ax, by - ay) || 1e-6;
    for (let u = 0; u < 1; u += step / seg) {
      if (walked + u * seg > maxLen) return;
      disc(put, ax + (bx - ax) * u, ay + (by - ay) * u, rad, col, lo);
    }
    walked += seg;
    if (walked > maxLen) return;
  }
  if (until >= 1 && pts.length) {
    const last = pts[pts.length - 1];
    disc(put, last.x, last.y, rad, col, lo);
  }
}

function roundRect(put, x0, y0, x1, y1, r, col) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const cx = Math.min(Math.max(x, x0 + r), x1 - r - 1);
    const cy = Math.min(Math.max(y, y0 + r), y1 - r - 1);
    const inside = (x >= x0 + r && x < x1 - r) || (y >= y0 + r && y < y1 - r) ||
      ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r);
    if (inside) put(x, y, col[0], col[1], col[2]);
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
    put(x, y, (14 + t * 12) | 0, (13 + t * 10) | 0, (11 + t * 8) | 0);
  }

  // header
  fill(0, 0, W, 56, 18, 16, 13);
  disc(put, 36, 28, 11, GOLD, CORAL);
  drawText(put, 56, 14, 'ONE STROKE', 4, 244, 239, 230);
  roundRect(put, 968, 12, 1176, 46, 16, [48, 40, 22]);
  disc(put, 990, 29, 5, GOLD, GOLD);
  drawText(put, 1004, 18, "SAM'S TURN", 2, 244, 201, 93);

  // seats
  const seats = [
    { x: 36, label: 'YOU', me: true, turn: false },
    { x: 236, label: 'MAYA', me: false, turn: false },
    { x: 436, label: 'SAM', me: false, turn: true },
    { x: 636, label: 'RIO', me: false, turn: false },
  ];
  for (const s of seats) {
    const col = s.turn ? [48, 40, 22] : [37, 34, 28];
    roundRect(put, s.x, 68, s.x + 184, 114, 12, col);
    if (s.turn) {
      roundRect(put, s.x, 68, s.x + 184, 72, 2, GOLD);
      roundRect(put, s.x, 110, s.x + 184, 114, 2, GOLD);
    }
    const ink = s.turn ? GOLD : CREAM;
    drawText(put, s.x + 28, 82, s.label, 3, ink[0], ink[1], ink[2]);
  }

  // paper — the product. Mid-round doodle, whose-turn on the page.
  const px0 = 36, py0 = 128, px1 = 836, py1 = 628;
  roundRect(put, px0, py0, px1, py1, 22, PAPER);
  // vignette
  for (let y = py0; y < py1; y++) for (let x = px0; x < px1; x++) {
    const nx = (x - px0) / (px1 - px0), ny = (y - py0) / (py1 - py0);
    const v = Math.hypot(nx - 0.5, ny - 0.48);
    if (v > 0.42) {
      const a = Math.min(0.35, (v - 0.42) * 0.9);
      const o = (y * W + x) * 4;
      rgba[o] = (rgba[o] * (1 - a)) | 0;
      rgba[o + 1] = (rgba[o + 1] * (1 - a)) | 0;
      rgba[o + 2] = (rgba[o + 2] * (1 - a)) | 0;
    }
  }

  function paperBez(a, b, c, d, n) {
    const map = (p) => ({
      x: px0 + 24 + p.x * (px1 - px0 - 48),
      y: py0 + 24 + p.y * (py1 - py0 - 48)
    });
    return sampleBez(map(a), map(b), map(c), map(d), n);
  }

  // 1. gold moon
  stampPx(put, paperBez(
    { x: 0.62, y: 0.16 }, { x: 0.78, y: 0.06 }, { x: 0.92, y: 0.26 }, { x: 0.70, y: 0.36 }
  , 40), 1, 6.2, GOLD);
  // 2. cream horizon
  stampPx(put, paperBez(
    { x: 0.04, y: 0.64 }, { x: 0.28, y: 0.52 }, { x: 0.62, y: 0.72 }, { x: 0.96, y: 0.58 }
  , 50), 1, 5.0, CREAM);
  // 3. mint tree (one stroke: trunk and a branch)
  stampPx(put, paperBez(
    { x: 0.22, y: 0.80 }, { x: 0.16, y: 0.42 }, { x: 0.32, y: 0.22 }, { x: 0.18, y: 0.14 }
  , 40), 1, 7.2, MINT);
  // 4. coral bird
  stampPx(put, paperBez(
    { x: 0.46, y: 0.30 }, { x: 0.54, y: 0.16 }, { x: 0.60, y: 0.22 }, { x: 0.70, y: 0.14 }
  , 28), 1, 4.6, CORAL);
  // 5. sky path — mid-round, not a blank page
  stampPx(put, paperBez(
    { x: 0.08, y: 0.28 }, { x: 0.22, y: 0.12 }, { x: 0.40, y: 0.20 }, { x: 0.52, y: 0.08 }
  , 32), 1, 4.2, SKY);

  // whose-turn sits ON the paper
  roundRect(put, 250, 150, 622, 228, 16, [22, 18, 14]);
  drawText(put, 278, 176, "WAITING FOR SAM", 3, 244, 201, 93);

  // inks
  const inks = [CREAM, CORAL, GOLD, MINT, SKY, LILAC, [255, 138, 212]];
  inks.forEach((c, i) => {
    disc(put, 70 + i * 42, 668, 13, c, mix(c, [0, 0, 0], 0.2).map(Math.round));
  });
  for (let a = 0; a < 360; a += 4) {
    const rad = a * Math.PI / 180;
    put(70 + 2 * 42 + Math.cos(rad) * 16, 668 + Math.sin(rad) * 16, 255, 232, 160);
  }

  roundRect(put, 430, 646, 560, 696, 10, [37, 34, 28]);
  drawText(put, 458, 662, 'UNDO', 2, 168, 159, 144);
  roundRect(put, 576, 646, 780, 696, 10, [80, 68, 32]);
  drawText(put, 618, 662, 'SEND', 2, 120, 110, 90);

  // right copy
  drawText(put, 860, 200, 'ONE', 8, 244, 201, 93);
  drawText(put, 860, 270, 'STROKE', 8, 244, 239, 230);
  drawText(put, 860, 380, 'EACH', 4, 168, 159, 144);
  drawText(put, 860, 460, 'THE INVITE', 3, 201, 160, 255);
  drawText(put, 860, 500, 'IS THE STUDIO', 3, 201, 160, 255);
  drawText(put, 860, 570, 'ONE LINE EACH', 3, 109, 206, 122);

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
