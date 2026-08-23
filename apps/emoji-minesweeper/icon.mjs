// Procedural icon for Emoji Minesweeper: a dark rounded card holding a
// spiked mine whose fuse spark walks around the top. Pure Node, super-sample
// → box-downsample → small palette; deterministic so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [28, 32, 48];
const CARD_B = [14, 16, 28];
const STEEL = [48, 52, 64];
const STEEL_H = [92, 98, 118];
const GOLD = [255, 184, 48];
const GOLD_H = [255, 232, 160];
const SPARK = [255, 120, 40];
const FLAG = [232, 72, 64];
const CREAM = [246, 240, 228];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, STEEL, STEEL_H, GOLD, GOLD_H, SPARK, FLAG, CREAM]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.09).map(Math.round));
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

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const t = f / FRAMES;
  const cx = 64, cy = 72, R = 26;
  const ang = t * Math.PI * 2;
  const fuseX = cx + 18, fuseY = cy - 22;
  const sparkX = fuseX + 10 * Math.cos(ang);
  const sparkY = fuseY - 8 - 4 * Math.sin(ang * 2);
  const sparkR = 3.2 + 1.4 * Math.sin(ang * 3);
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      // spikes
      for (let k = 0; k < 8; k++) {
        const sa = k * Math.PI / 4;
        const sx = Math.cos(sa), sy = Math.sin(sa);
        const along = (x - cx) * sx + (y - cy) * sy;
        const perp = (x - cx) * -sy + (y - cy) * sx;
        if (along > R - 4 && along < R + 11 && Math.abs(perp) < 3.2 - (along - R) * 0.12) {
          col = mix(STEEL, STEEL_H, 0.35 + 0.3 * (along / (R + 11)));
        }
      }
      // body
      const dx = x - cx, dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < R) {
        const hx = (x - (cx - 8)) / R, hy = (y - (cy - 9)) / R;
        const hi = Math.max(0, 1 - Math.sqrt(hx * hx + hy * hy));
        col = mix(STEEL, STEEL_H, 0.25 + hi * 0.7);
      }
      // fuse
      const fx = x - fuseX, fy = y - fuseY;
      const fuseAlong = fx * 0.7 + fy * -0.72;
      const fusePerp = fx * 0.72 + fy * 0.7;
      if (fuseAlong > -2 && fuseAlong < 16 && Math.abs(fusePerp) < 2.1) {
        col = mix(GOLD, SPARK, 0.15);
      }
      // spark
      const sdx = x - sparkX, sdy = y - sparkY;
      const sd = Math.sqrt(sdx * sdx + sdy * sdy);
      if (sd < sparkR) col = mix(GOLD_H, SPARK, sd / sparkR);
      else if (sd < sparkR + 3.5) {
        const glow = 1 - (sd - sparkR) / 3.5;
        col = mix(col, GOLD, glow * 0.55);
      }
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

export function minesIcon() {
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
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  ':': [0, 0b00100, 0b00100, 0, 0b00100, 0b00100, 0],
  '%': [0b11001, 0b11010, 0b00100, 0b01000, 0b10110, 0b10011, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
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

function mineAt(put, cx, cy, scale, spark) {
  const R = 11 * scale;
  for (let k = 0; k < 8; k++) {
    const sa = k * Math.PI / 4;
    const sx = Math.cos(sa), sy = Math.sin(sa);
    for (let along = R - 2; along < R + 7 * scale; along++) {
      const half = (2.2 * scale) - (along - R) * 0.15;
      for (let p = -half; p <= half; p++) {
        put(Math.round(cx + sx * along - sy * p), Math.round(cy + sy * along + sx * p), 42, 46, 58);
      }
    }
  }
  for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
    if (x * x + y * y <= R * R) {
      const hi = Math.max(0, 1 - Math.hypot(x + 4 * scale, y + 5 * scale) / R);
      put(cx + x, cy + y,
        Math.round(88 + hi * 90), Math.round(92 + hi * 90), Math.round(108 + hi * 90));
    }
  }
  if (spark) {
    const sx = cx + 10 * scale, sy = cy - 16 * scale;
    for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) {
      const d = Math.hypot(x, y);
      if (d < 4 * scale) put(sx + x, sy + y, 255, 210, 80);
      else if (d < 6 * scale) put(sx + x, sy + y, 255, 140, 40);
    }
  }
}

function flagAt(put, cx, cy, scale) {
  for (let y = 0; y < 18 * scale; y++) put(cx, cy + y, 200, 200, 210);
  for (let y = 0; y < 8 * scale; y++) {
    const w = (8 * scale) - y * 0.6;
    for (let x = 1; x < w; x++) put(cx + x, cy + y, 232, 72, 64);
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

  fill(0, 0, W, H, 10, 10, 15);
  // left title + mine
  mineAt(put, 210, 250, 3.4, true);
  drawText(put, 78, 400, 'EMOJI', 6, 255, 184, 48);
  drawText(put, 48, 460, 'MINESWEEPER', 5, 238, 241, 248);
  drawText(put, 70, 530, 'RACE A FRIEND', 3, 154, 166, 195);
  drawText(put, 64, 572, 'SAME BOARD. FIRST', 2, 154, 166, 195);
  drawText(put, 96, 598, 'TO CLEAR WINS.', 2, 154, 166, 195);

  // board card
  rr(480, 40, 1160, 680, 22, 22, 26, 38);
  // race strip
  rr(510, 60, 1130, 168, 14, 16, 18, 28);
  drawText(put, 528, 76, 'RACE', 2, 154, 166, 195);
  drawText(put, 528, 108, 'YOU', 3, 255, 184, 48);
  drawText(put, 720, 108, '18.42', 3, 238, 241, 248);
  rr(880, 116, 1040, 124, 3, 40, 44, 56);
  fill(880, 116, 1000, 124, 255, 184, 48);
  drawText(put, 1050, 110, '72', 2, 154, 166, 195);
  drawText(put, 528, 140, 'SAM', 3, 238, 241, 248);
  drawText(put, 720, 140, '21.05', 3, 238, 241, 248);
  rr(880, 148, 1040, 156, 3, 40, 44, 56);
  fill(880, 148, 980, 156, 110, 170, 255);

  // 10x10 cells
  const N = 10, CS = 44, ox = 560, oy = 200;
  // a fake solved-ish board: 0 closed, 1 open, 2 flag, 3 mine
  const NUM_COL = [
    [80, 140, 255], [60, 180, 90], [232, 72, 64], [80, 80, 200],
    [160, 80, 40], [40, 160, 160], [20, 20, 20], [120, 120, 120],
  ];
  const layout = [
    '111c1c1111',
    '1c11112c11',
    '111c111111',
    'c1111c11c1',
    '1112111111',
    '1c1111c111',
    '111c111211',
    'c11111c111',
    '1112c111c1',
    '11c111111m',
  ];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const x0 = ox + c * CS, y0 = oy + r * CS;
    const ch = layout[r][c];
    if (ch === 'c') {
      rr(x0 + 2, y0 + 2, x0 + CS - 2, y0 + CS - 2, 6, 42, 48, 64);
    } else if (ch === '2') {
      rr(x0 + 2, y0 + 2, x0 + CS - 2, y0 + CS - 2, 6, 42, 48, 64);
      flagAt(put, x0 + 16, y0 + 10, 1.3);
    } else if (ch === 'm') {
      rr(x0 + 2, y0 + 2, x0 + CS - 2, y0 + CS - 2, 6, 28, 22, 24);
      mineAt(put, x0 + CS / 2, y0 + CS / 2 + 2, 1.05, false);
    } else {
      rr(x0 + 2, y0 + 2, x0 + CS - 2, y0 + CS - 2, 6, 18, 20, 30);
      const n = ((r * 3 + c * 7) % 3) + 1;
      const col = NUM_COL[n - 1];
      drawText(put, x0 + 16, y0 + 14, String(n), 2, col[0], col[1], col[2]);
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
