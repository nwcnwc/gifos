// Sticker icon: two blocks snap together, a turtle draws a square.
// Readable at 64px. Transparent, dark outline.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [16, 22, 34];
const CARD_B = [10, 14, 22];
const INK = [20, 24, 32];
const GREEN = [92, 184, 92];
const GOLD = [240, 196, 72];
const PURPLE = [150, 110, 210];
const WHITE = [240, 236, 224];
const PATH = [210, 200, 180];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, INK, GREEN, GOLD, PURPLE, WHITE, PATH]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.45).map(Math.round));
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
function inRoundRect(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  if (x >= x0 + r && x <= x0 + w - r) return true;
  if (y >= y0 + r && y <= y0 + h - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  const snap = Math.min(1, t * 1.4);
  const bx = 18 + (1 - snap) * 22;
  const by = 28;
  const b2x = 54 + snap * 14;
  const b2y = 54;
  const side = Math.min(4, Math.floor(t * 5));
  const turtle = [
    [96, 96], [96, 72], [120, 72], [120, 96], [96, 96]
  ];

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 22)) continue;
      let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      const in1 = inRoundRect(x, y, bx, by, 52, 28, 6);
      const notch = inRoundRect(x, y, bx + 18, by + 24, 14, 10, 3);
      const in2 = inRoundRect(x, y, b2x, b2y, 52, 28, 6);
      const tab = inRoundRect(x, y, b2x + 18, b2y - 8, 14, 12, 3);
      if ((in1 || notch) && !(x > bx + 18 && x < bx + 32 && y > by + 22 && y < by + 28 && !notch)) {
        const edge = Math.min(
          Math.abs(x - bx), Math.abs(x - (bx + 52)),
          Math.abs(y - by), Math.abs(y - (by + 28))
        );
        col = edge < 2.1 ? INK : GREEN;
      }
      if (in2 || tab) {
        const edge = Math.min(
          Math.abs(x - b2x), Math.abs(x - (b2x + 52)),
          Math.abs(y - b2y), Math.abs(y - (b2y + 28))
        );
        col = edge < 2.1 ? INK : PURPLE;
      }
      for (let i = 0; i < Math.min(side, 4); i++) {
        const a = turtle[i], b = turtle[i + 1];
        if (distSeg(x, y, a[0], a[1], b[0], b[1]) < 2.1) col = GOLD;
      }
      const tip = turtle[Math.min(side, 4)];
      if (Math.hypot(x - tip[0], y - tip[1]) < 4.2) col = WHITE;
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

export function gamesIcon() {
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
    minCodeSize: 6, frames, delayCs: 12, transparentIndex: 0
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

function rr(put, x, y, w, h, r, R, G, B) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (inRoundRect(xx, yy, x, y, w, h, r)) put(xx, yy, R, G, B);
    }
  }
}
const GLYPHS = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10001, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  ' ': [0, 0, 0, 0, 0, 0, 0]
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

function line(put, x0, y0, x1, y1, w, R, G, B) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  const steps = Math.ceil(len);
  for (let i = 0; i <= steps; i++) {
    const x = x0 + dx * (i / steps), y = y0 + dy * (i / steps);
    const rad = w;
    for (let yy = Math.floor(y - rad); yy <= Math.ceil(y + rad); yy++) {
      for (let xx = Math.floor(x - rad); xx <= Math.ceil(x + rad); xx++) {
        if ((xx - x) * (xx - x) + (yy - y) * (yy - y) <= rad * rad) put(xx, yy, R, G, B);
      }
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
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) put(x, y, 14, 18, 26);
  }
  // Maze on the left — level 6 path with pegman mid-walk.
  const map = [
    [0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0],
    [0,1,1,1,1,1,0,0],
    [0,1,0,0,0,1,0,0],
    [0,1,1,3,0,1,0,0],
    [0,0,0,0,0,1,0,0],
    [0,2,1,1,1,1,0,0],
    [0,0,0,0,0,0,0,0]
  ];
  const ox = 48, oy = 70, s = 68;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const v = map[y][x];
      const cx = ox + x * s, cy = oy + y * s;
      if (v === 0) rr(put, cx, cy, s - 2, s - 2, 4, 18, 22, 32);
      else {
        rr(put, cx + 8, cy + 8, s - 18, s - 18, 8, 214, 204, 186);
        if (v === 3) {
          rr(put, cx + 24, cy + 10, 18, 28, 3, 40, 140, 70);
          rr(put, cx + 30, cy + 36, 6, 18, 1, 90, 70, 40);
        }
      }
    }
  }
  // Pegman on the bottom corridor, facing east.
  const px = ox + 3.5 * s, py = oy + 6.5 * s;
  for (let yy = -18; yy <= 22; yy++) {
    for (let xx = -16; xx <= 16; xx++) {
      if (xx * xx + (yy + 4) * (yy + 4) < 210) put(px + xx, py + yy, 245, 215, 110);
    }
  }
  put(px + 6, py - 4, 40, 40, 40);
  put(px + 7, py - 4, 40, 40, 40);
  line(put, px + 10, py, px + 22, py, 2.2, 40, 40, 40);

  // Blocks on the right — a forever loop with move + turn.
  rr(put, 640, 90, 500, 92, 16, 92, 184, 92);
  rr(put, 656, 112, 52, 48, 8, 214, 204, 186);
  drawText(put, 724, 122, 'REPEAT UNTIL', 4, 20, 40, 20);
  rr(put, 700, 210, 420, 78, 14, 150, 110, 210);
  drawText(put, 728, 234, 'MOVE FORWARD', 4, 248, 240, 255);
  rr(put, 700, 310, 420, 78, 14, 150, 110, 210);
  drawText(put, 728, 334, 'TURN LEFT', 4, 248, 240, 255);
  rr(put, 700, 410, 420, 78, 14, 92, 184, 92);
  drawText(put, 728, 434, 'TURN RIGHT', 4, 20, 40, 20);
  rr(put, 980, 560, 160, 64, 12, 47, 125, 50);
  drawText(put, 1024, 580, 'RUN', 4, 240, 255, 240);
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
