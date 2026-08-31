// Procedural icon for SVG-Edit: a dark card holding a white artboard where a
// vector pen draws a star, then a circle. Reads at 64px. Super-sample →
// box-downsample → small palette. Deterministic so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [28, 28, 40];
const CARD_B = [14, 14, 22];
const PAPER = [246, 246, 242];
const INK = [28, 30, 40];
const ORANGE = [249, 188, 1];
const ORANGE_D = [200, 120, 20];
const TEAL = [40, 140, 150];
const RED = [220, 64, 56];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, PAPER, INK, ORANGE, ORANGE_D, TEAL, RED]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
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
function inRoundRect(x, y, x0, y0, w, h, r) {
  if (x < x0 || x > x0 + w || y < y0 || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  if (x >= x0 + r && x <= x0 + w - r) return true;
  if (y >= y0 + r && y <= y0 + h - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function distSeg(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
  if (l2 < 1e-8) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / l2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}
function starPts(cx, cy, rOuter, rInner, n, rot) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + i * Math.PI / n - Math.PI / 2;
    const r = i % 2 === 0 ? rOuter : rInner;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return pts;
}
function distPoly(px, py, pts, closed) {
  let best = 1e9;
  const n = pts.length / 2;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % n;
    const d = distSeg(px, py, pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1]);
    if (d < best) best = d;
  }
  return best;
}
function inPoly(px, py, pts) {
  let inside = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2], yi = pts[i * 2 + 1], xj = pts[j * 2], yj = pts[j * 2 + 1];
    const hit = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-8) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const p = f / FRAMES;
  const drawT = Math.min(1, p / 0.55);
  const fillT = Math.max(0, (p - 0.45) / 0.55);
  const star = starPts(58, 58, 22, 9, 5, p * 0.08);
  const nStar = Math.max(2, Math.floor(star.length / 2 * drawT) * 2);
  const drawnStar = star.slice(0, nStar);
  const circR = 16 * fillT;
  const penX = nStar >= 2 ? drawnStar[nStar - 2] : 58;
  const penY = nStar >= 2 ? drawnStar[nStar - 1] : 36;
  const penTipX = fillT > 0.15 ? 92 + fillT * 4 : penX;
  const penTipY = fillT > 0.15 ? 92 - fillT * 6 : penY;

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 7, 22)) continue;
      let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 7) / (OUT - 14))));
      if (inRoundRect(x, y, 22, 22, 84, 84, 8)) {
        col = PAPER;
        if (fillT > 0.2 && (x - 92) * (x - 92) + (y - 88) * (y - 88) <= circR * circR) {
          col = mix(TEAL, PAPER, 0.12);
        }
        const ds = distPoly(x, y, drawnStar, drawT >= 0.98);
        if (drawT >= 0.98 && inPoly(x, y, star)) col = mix(ORANGE, PAPER, 0.08);
        if (ds < 1.35) col = ds < 0.65 ? ORANGE_D : mix(ORANGE, INK, 0.2);
      }
      // pen body
      const dx = x - penTipX, dy = y - penTipY;
      const along = dx * 0.6 + dy * 0.8;
      const across = -dx * 0.8 + dy * 0.6;
      if (along > 0 && along < 18 && Math.abs(across) < 2.2 - along * 0.04) {
        col = along < 4 ? INK : mix(ORANGE, ORANGE_D, 0.4);
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

export function svgEditIcon() {
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

function strokeLine(put, x0, y0, x1, y1, w, r, g, b) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const steps = Math.ceil(len);
  for (let i = 0; i <= steps; i++) {
    const x = x0 + dx * (i / steps), y = y0 + dy * (i / steps);
    const rad = w;
    for (let yy = Math.floor(y - rad); yy <= Math.ceil(y + rad); yy++) {
      for (let xx = Math.floor(x - rad); xx <= Math.ceil(x + rad); xx++) {
        if ((xx - x) * (xx - x) + (yy - y) * (yy - y) <= rad * rad) put(xx, yy, r, g, b);
      }
    }
  }
}
function fillCircle(put, cx, cy, rad, r, g, b) {
  const xA = Math.floor(cx - rad), xB = Math.ceil(cx + rad);
  const yA = Math.floor(cy - rad), yB = Math.ceil(cy + rad);
  for (let y = yA; y <= yB; y++) {
    for (let x = xA; x <= xB; x++) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
    }
  }
}
function fillPoly(put, pts, r, g, b) {
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, pts[i * 2]); maxX = Math.max(maxX, pts[i * 2]);
    minY = Math.min(minY, pts[i * 2 + 1]); maxY = Math.max(maxY, pts[i * 2 + 1]);
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
      if (inPoly(x, y, pts)) put(x, y, r, g, b);
    }
  }
}

const GLYPHS = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b01010, 0b00100],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};
function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
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

export function screenshotPng() {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b, a) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };
  const fill = (x0, y0, w, h, r, g, b) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(x, y, r, g, b);
  };

  fill(0, 0, W, H, 10, 10, 16);
  fill(0, 0, W, 36, 18, 18, 26);
  drawText(put, 16, 10, 'SVG-EDIT', 2, 249, 188, 1);
  drawText(put, 160, 12, 'OPEN  SAVE SVG  PNG', 2, 200, 204, 216);
  drawText(put, W - 280, 12, 'SAVED ON THIS DEVICE', 2, 154, 160, 180);

  fill(0, 36, 48, H - 36, 22, 22, 32);
  const tools = [56, 110, 164, 218, 272, 326, 380, 434];
  for (let i = 0; i < tools.length; i++) {
    const y = tools[i];
    fill(8, y, 32, 32, i === 2 ? 249 : 36, i === 2 ? 188 : 36, i === 2 ? 1 : 48);
    if (i === 0) fillCircle(put, 24, y + 16, 8, 232, 234, 242);
    if (i === 1) fill(14, y + 10, 20, 12, 232, 234, 242);
    if (i === 2) strokeLine(put, 14, y + 24, 34, y + 8, 2, 20, 20, 28);
    if (i === 3) fill(14, y + 10, 20, 16, 80, 160, 170);
    if (i === 4) fillCircle(put, 24, y + 16, 10, 80, 160, 170);
    if (i === 5) drawText(put, 16, y + 10, 'T', 2, 232, 234, 242);
  }

  fill(48, 36, W - 48, 52, 22, 22, 34);
  fill(70, 88, W - 90, H - 108, 255, 255, 252);

  // Illustration: sun, hills, a path-bird, SVG lettering — mid-use, not empty.
  fillCircle(put, 980, 180, 54, 249, 188, 1);
  fillCircle(put, 980, 180, 44, 255, 220, 80);
  const hill1 = [70, 620, 220, 420, 400, 560, 560, 380, 760, 540, 980, 360, 1180, 580, 1180, 700, 70, 700];
  fillPoly(put, hill1, 46, 140, 110);
  const hill2 = [70, 680, 300, 520, 520, 640, 740, 480, 1180, 640, 1180, 700, 70, 700];
  fillPoly(put, hill2, 32, 100, 86);
  const bird = [420, 240, 480, 220, 560, 250, 520, 270, 470, 255];
  for (let i = 0; i < bird.length - 2; i += 2) {
    strokeLine(put, bird[i], bird[i + 1], bird[i + 2], bird[i + 3], 3.2, 220, 64, 56);
  }
  drawText(put, 140, 160, 'SVG', 10, 28, 30, 40);
  // selection handles on the star
  const star = starPts(300, 280, 70, 28, 5, 0.15);
  fillPoly(put, star, 249, 140, 40);
  for (let i = 0; i < star.length; i += 2) {
    fill(star[i] - 4, star[i + 1] - 4, 8, 8, 20, 20, 30);
  }

  fill(W - 200, 88, 200, H - 108, 22, 22, 34);
  drawText(put, W - 184, 110, 'LAYERS', 2, 249, 188, 1);
  fill(W - 184, 150, 168, 28, 40, 40, 56);
  drawText(put, W - 176, 156, 'STAR', 2, 232, 234, 242);
  fill(W - 184, 186, 168, 28, 30, 30, 42);
  drawText(put, W - 176, 192, 'HILLS', 2, 180, 184, 196);
  fill(W - 184, 222, 168, 28, 30, 30, 42);
  drawText(put, W - 176, 228, 'SUN', 2, 180, 184, 196);

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
