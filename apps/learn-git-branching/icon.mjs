// Sticker icon: a tiny commit graph that grows a branch and merges.
// Readable at 64px. Transparent outside a rounded card.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 8;

const CARD_A = [27, 40, 50];
const CARD_B = [18, 28, 36];
const INK = [232, 240, 248];
const MAIN = [61, 159, 216];
const SIDE = [232, 140, 72];
const MERGE = [125, 206, 154];
const LABEL = [246, 211, 107];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, INK, MAIN, SIDE, MERGE, LABEL]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
  }
  return pal;
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
function distSeg(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-8) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / l2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}
function distCircle(px, py, cx, cy) { return Math.hypot(px - cx, py - cy); }

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const showC1 = f >= 1;
  const showSide = f >= 3;
  const showC2 = f >= 4;
  const showMerge = f >= 6;
  const C0 = [44, 92], C1 = [44, 58], C2 = [84, 58], C3 = [44, 26];

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 22)) continue;
      let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      const edges = [];
      if (showC1) edges.push([C0[0], C0[1], C1[0], C1[1], MAIN]);
      if (showC2) edges.push([C1[0], C1[1], C2[0], C2[1], SIDE]);
      if (showMerge) {
        edges.push([C1[0], C1[1], C3[0], C3[1], MAIN]);
        edges.push([C2[0], C2[1], C3[0], C3[1], MERGE]);
      }
      for (const e of edges) {
        const d = distSeg(x, y, e[0], e[1], e[2], e[3]);
        if (d < 1.4) col = d < 0.6 ? e[4] : mix(e[4], CARD_A, 0.25);
      }
      const nodes = [
        [C0, MAIN, true],
        [C1, MAIN, showC1],
        [C2, SIDE, showC2],
        [C3, MERGE, showMerge],
      ];
      for (const [p, c, on] of nodes) {
        if (!on) continue;
        const d = distCircle(x, y, p[0], p[1]);
        if (d < 11) col = d < 9.2 ? c : INK;
      }
      if (showSide) {
        const lx = 92, ly = 92;
        if (x > lx && x < lx + 22 && y > ly && y < ly + 12) col = LABEL;
      }
      const o = (py * RW + px) * 4;
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

export function gitIcon() {
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
    minCodeSize: 6, frames, delayCs: 14, transparentIndex: 0
  };
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

function putPx(rgba, W, H, x, y, r, g, b, a) {
  x = x | 0; y = y | 0;
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 4;
  rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
}
function fillRect(put, x, y, w, h, r, g, b) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(xx, yy, r, g, b);
}
function fillCircle(put, cx, cy, rad, r, g, b) {
  const r2 = rad * rad;
  for (let y = -rad; y <= rad; y++) {
    for (let x = -rad; x <= rad; x++) {
      if (x * x + y * y <= r2) put(cx + x, cy + y, r, g, b);
    }
  }
}
function strokeLine(put, x0, y0, x1, y1, w, r, g, b) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const steps = Math.ceil(len);
  for (let i = 0; i <= steps; i++) {
    const x = x0 + dx * (i / steps), y = y0 + dy * (i / steps);
    fillCircle(put, x, y, w, r, g, b);
  }
}

export function screenshotPng() {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b, a) => putPx(rgba, W, H, x, y, r, g, b, a);
  fillRect(put, 0, 0, W, H, 27, 40, 50);
  fillRect(put, 24, 24, 820, 540, 21, 32, 40);
  fillRect(put, 860, 24, 316, 220, 21, 32, 40);
  fillRect(put, 860, 260, 316, 304, 16, 24, 30);
  fillRect(put, 24, 580, 1152, 116, 16, 24, 30);

  const nodes = [
    { x: 180, y: 460, c: [61, 159, 216], id: 'C0' },
    { x: 180, y: 340, c: [61, 159, 216], id: 'C1' },
    { x: 180, y: 220, c: [61, 159, 216], id: 'C3' },
    { x: 360, y: 340, c: [232, 140, 72], id: 'C2' },
    { x: 180, y: 100, c: [125, 206, 154], id: 'C4' },
  ];
  strokeLine(put, 180, 460, 180, 340, 3, 80, 140, 180);
  strokeLine(put, 180, 340, 180, 220, 3, 80, 140, 180);
  strokeLine(put, 180, 340, 360, 340, 3, 200, 130, 80);
  strokeLine(put, 180, 220, 180, 100, 3, 80, 140, 180);
  strokeLine(put, 360, 340, 180, 100, 3, 125, 180, 140);
  for (const n of nodes) {
    fillCircle(put, n.x, n.y, 28, n.c[0], n.c[1], n.c[2]);
    fillCircle(put, n.x, n.y, 24, n.c[0], n.c[1], n.c[2]);
  }
  // labels
  fillRect(put, 214, 86, 70, 28, 246, 211, 107);
  fillRect(put, 394, 326, 86, 28, 180, 90, 40);
  fillRect(put, 214, 206, 70, 28, 61, 159, 216);

  // goal mini
  fillCircle(put, 980, 160, 16, 61, 159, 216);
  fillCircle(put, 980, 100, 16, 125, 206, 154);
  strokeLine(put, 980, 160, 980, 100, 2, 80, 140, 180);

  // command
  fillRect(put, 40, 610, 20, 28, 61, 159, 216);
  fillRect(put, 72, 618, 12, 20, 232, 240, 248);
  fillRect(put, 92, 618, 420, 20, 40, 58, 70);
  fillRect(put, 108, 622, 280, 12, 143, 211, 255);
  fillRect(put, 1080, 608, 80, 36, 61, 159, 216);
  fillRect(put, 40, 548, 90, 26, 36, 52, 65);
  fillRect(put, 140, 548, 90, 26, 36, 52, 65);
  fillRect(put, 240, 548, 90, 26, 36, 52, 65);
  fillRect(put, 870, 280, 200, 10, 125, 206, 154);
  fillRect(put, 870, 300, 280, 8, 154, 172, 184);

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
