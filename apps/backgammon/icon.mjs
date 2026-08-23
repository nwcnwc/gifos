// Procedural icon: a mahogany backgammon table, a white checker sliding
// along the home board. Pure Node, super-sample → box-downsample. Deterministic.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [20, 12, 8];
const FRAME = [58, 28, 16];
const FELT = [74, 36, 24];
const LIGHT = [212, 184, 150];
const DARK = [139, 58, 42];
const BAR = [42, 20, 14];
const IVORY_H = [255, 248, 238];
const IVORY = [200, 180, 152];
const INK_H = [74, 58, 52];
const INK = [26, 18, 16];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, FRAME, FELT, LIGHT, DARK, BAR, IVORY_H, IVORY, INK_H, INK]) {
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
function inTri(x, y, x0, y0, x1, y1, x2, y2) {
  const s = (x0 - x2) * (y - y2) - (y0 - y2) * (x - x2);
  const t = (x1 - x0) * (y - y0) - (y1 - y0) * (x - x0);
  const d = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
  return (s >= 0 && t >= 0 && d >= 0) || (s <= 0 && t <= 0 && d <= 0);
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 18;
  const bx = 14, by = 22, bw = OUT - 28, bh = OUT - 40;
  const t = f / (FRAMES - 1);
  const barW = bw * 0.08;
  const play = bw - barW;
  const quad = play / 2;
  const pw = quad / 6;
  const ph = bh * 0.42;
  const slideX0 = bx + quad + barW + 5.5 * pw;
  const slideX1 = bx + quad + barW + 2.5 * pw;
  const slideX = slideX0 + (slideX1 - slideX0) * t;
  const slideY = by + bh - 14 - Math.sin(t * Math.PI) * 6;
  function pointTri(pos) {
    let col, top, left;
    if (pos >= 12 && pos <= 17) { col = pos - 12; top = true; left = true; }
    else if (pos >= 18) { col = pos - 18; top = true; left = false; }
    else if (pos >= 6) { col = 11 - pos; top = false; left = true; }
    else { col = 5 - pos; top = false; left = false; }
    const x = bx + (left ? 0 : quad + barW) + col * pw;
    const y = top ? by : by + bh - ph;
    return { x, y, w: pw, h: ph, top };
  }
  const stacks = {
    23: [0, 0], 12: [0, 0, 0, 0, 0], 7: [0, 0, 0], 5: [0, 0, 0, 0, 0],
    0: [1, 1], 11: [1, 1, 1, 1, 1], 16: [1, 1, 1], 18: [1, 1, 1, 1, 1]
  };
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = CARD.slice();
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
        col = FRAME.slice();
        if (x > bx + 2 && x < bx + bw - 2 && y > by + 2 && y < by + bh - 2) {
          col = FELT.slice();
          if (x >= bx + quad && x <= bx + quad + barW) col = BAR.slice();
          for (let pos = 0; pos < 24; pos++) {
            const p = pointTri(pos);
            const lite = pos % 2 === 0;
            const inside = p.top
              ? inTri(x, y, p.x, p.y, p.x + p.w, p.y, p.x + p.w / 2, p.y + p.h)
              : inTri(x, y, p.x, p.y + p.h, p.x + p.w, p.y + p.h, p.x + p.w / 2, p.y);
            if (inside) col = (lite ? LIGHT : DARK).slice();
          }
          const r = pw * 0.38;
          for (const pos of Object.keys(stacks)) {
            const p = pointTri(+pos);
            const pcs = stacks[pos];
            for (let i = 0; i < Math.min(pcs.length, 4); i++) {
              const cy = p.top ? (p.y + r + 1 + i * r * 1.55) : (p.y + p.h - r - 1 - i * r * 1.55);
              const cx = p.x + p.w / 2;
              const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
              if (d <= r * r) {
                const u = (x - (cx - 2)) / (r * 2);
                col = pcs[i] ? mix(INK_H, INK, Math.max(0, Math.min(1, u)))
                             : mix(IVORY_H, IVORY, Math.max(0, Math.min(1, u)));
              }
            }
          }
          const dd = (x - slideX) * (x - slideX) + (y - slideY) * (y - slideY);
          if (dd <= r * r) {
            const u = (x - (slideX - 2)) / (r * 2);
            col = mix(IVORY_H, IVORY, Math.max(0, Math.min(1, u)));
          }
        }
      }
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
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

export function backgammonIcon() {
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
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
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
    put(x, y, (18 + t * 12) | 0, (10 + t * 8) | 0, (6 + t * 6) | 0);
  }

  const bx = 48, by = 70, bw = 680, bh = 580;
  fill(bx, by, bx + bw, by + bh, 58, 28, 16);
  fill(bx + 14, by + 14, bx + bw - 14, by + bh - 14, 74, 36, 24);
  const ix = bx + 14, iy = by + 14, iw = bw - 28, ih = bh - 28;
  const barW = iw * 0.08, play = iw - barW, quad = play / 2, pw = quad / 6, ph = ih * 0.42;
  fill(ix + quad, iy, ix + quad + barW, iy + ih, 42, 20, 14);

  function tri(pos, lite) {
    let col, top, left;
    if (pos >= 12 && pos <= 17) { col = pos - 12; top = true; left = true; }
    else if (pos >= 18) { col = pos - 18; top = true; left = false; }
    else if (pos >= 6) { col = 11 - pos; top = false; left = true; }
    else { col = 5 - pos; top = false; left = false; }
    const x = ix + (left ? 0 : quad + barW) + col * pw;
    const y = top ? iy : iy + ih - ph;
    const x0 = x + 1, x1 = x + pw - 1, xm = x + pw / 2;
    const yBase = top ? y : y + ph, yTip = top ? y + ph : y;
    const ymin = Math.min(yBase, yTip), ymax = Math.max(yBase, yTip);
    for (let yy = ymin; yy <= ymax; yy++) {
      const t = (yy - yBase) / (yTip - yBase);
      const half = (1 - t) * ((x1 - x0) / 2);
      const cx = xm;
      for (let xx = cx - half; xx <= cx + half; xx++) {
        put(xx, yy, lite ? 212 : 139, lite ? 184 : 58, lite ? 150 : 42);
      }
    }
    return { x, y, w: pw, h: ph, top };
  }
  for (let pos = 0; pos < 24; pos++) tri(pos, pos % 2 === 0);

  function discAt(cx, cy, rad, hi, lo) {
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      if (dx * dx + dy * dy > rad * rad) continue;
      const u = (dx + rad) / (rad * 2);
      put(cx + dx, cy + dy,
        (hi[0] + (lo[0] - hi[0]) * u) | 0,
        (hi[1] + (lo[1] - hi[1]) * u) | 0,
        (hi[2] + (lo[2] - hi[2]) * u) | 0);
    }
  }
  const WHITE_H = [255, 248, 238], WHITE = [200, 180, 152];
  const BLACK_H = [74, 58, 52], BLACK = [26, 18, 16];
  function stack(pos, n, black) {
    const p = tri(pos, pos % 2 === 0);
    const rad = p.w * 0.38;
    for (let i = 0; i < n; i++) {
      const cy = p.top ? (p.y + rad + 4 + i * rad * 1.7) : (p.y + p.h - rad - 4 - i * rad * 1.7);
      discAt(p.x + p.w / 2, cy, rad, black ? BLACK_H : WHITE_H, black ? BLACK : WHITE);
    }
  }
  stack(23, 2, false); stack(12, 5, false); stack(7, 3, false); stack(5, 5, false);
  stack(0, 2, true); stack(11, 5, true); stack(16, 3, true); stack(18, 5, true);

  drawText(put, 760, 160, 'BACKGAMMON', 6, 243, 234, 216);
  drawText(put, 760, 250, 'A TABLE', 5, 212, 184, 150);
  drawText(put, 760, 360, 'COMPUTER', 3, 232, 220, 200);
  drawText(put, 760, 410, 'OR A FRIEND', 3, 232, 220, 200);
  drawText(put, 760, 500, 'WHITE GOES FIRST', 3, 196, 154, 96);

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
