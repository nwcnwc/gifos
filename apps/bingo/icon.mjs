// Procedural icon: a cream bingo card, a cell daubed, a numbered ball
// (N 32) that lands. Pure Node, super-sample → box-downsample.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const DIGITS = {
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  '3': [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
};
function glyphHit(px, py, ox, oy, s, str, map) {
  let cx = ox;
  for (const ch of str) {
    const g = map[ch];
    if (!g) { cx += 6 * s; continue; }
    const col = Math.floor((px - cx) / s);
    const row = Math.floor((py - oy) / s);
    if (col >= 0 && col < 5 && row >= 0 && row < 7 && (g[row] & (1 << (4 - col)))) return true;
    cx += 6 * s;
  }
  return false;
}

const FELT = [16, 32, 24];
const CARD = [244, 234, 212];
const CARD_D = [214, 198, 164];
const INK = [26, 20, 16];
const RED = [196, 40, 48];
const RED_H = [255, 106, 106];
const GOLD = [232, 196, 96];
const BLUE = [42, 90, 168];
const GREEN = [26, 122, 58];
const ORANGE = [196, 90, 24];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [FELT, CARD, CARD_D, INK, RED, RED_H, GOLD, BLUE, GREEN, ORANGE]) {
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
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  if (x >= x0 + r && x <= x1 - r) return true;
  if (y >= y0 + r && y <= y1 - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  const daub = Math.min(1, Math.max(0, (t - 0.18) / 0.45));
  const ballIn = Math.min(1, Math.max(0, (t - 0.02) / 0.5));
  const ballX = 94;
  const ballY = 34;
  const ballR = 26 * (0.4 + 0.6 * ballIn);
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inRoundRect(x, y, 6, 6, 122, 122, 18)) {
      a = 1;
      col = mix(FELT, [8, 20, 14], Math.max(0, Math.min(1, y / OUT)));
    }
    if (inRoundRect(x, y, 14, 12, 114, 116, 10)) {
      a = 1;
      col = mix(CARD, CARD_D, Math.max(0, Math.min(1, (x + y) / (OUT * 2))));
      const headers = [BLUE, RED, GREEN, GOLD, ORANGE];
      if (y >= 18 && y <= 32) {
        const colI = Math.min(4, Math.max(0, Math.floor((x - 18) / 19)));
        if (x >= 18 && x <= 110) col = mix(headers[colI], CARD, 0.12);
      }
      const gx0 = 18, gy0 = 36, cell = 17, gap = 2;
      for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
        const x0 = gx0 + c * (cell + gap), y0 = gy0 + r * (cell + gap);
        if (x >= x0 && x <= x0 + cell && y >= y0 && y <= y0 + cell) {
          col = [255, 253, 246];
          const cx = x0 + cell / 2, cy = y0 + cell / 2;
          const free = c === 2 && r === 2;
          const marked = (c === 1 && r === 1) || (c === 3 && r === 2) || (c === 0 && r === 4);
          const d = Math.hypot(x - cx, y - cy);
          if (free) {
            if (d < 6.2) col = mix(GOLD, CARD, 0.2);
          } else if (marked && daub > 0) {
            if (d < 8.4 * daub) col = mix(RED_H, RED, Math.max(0, Math.min(1, (x - x0) / cell)));
          }
        }
      }
    }
    const bd = Math.hypot(x - ballX, y - ballY);
    if (ballIn > 0.08 && bd < ballR) {
      a = 1;
      const shine = Math.max(0, 1 - Math.hypot(x - (ballX - 5), y - (ballY - 5)) / ballR);
      col = mix([255, 176, 176], RED, 0.55 - shine * 0.4);
      if (bd > ballR - 2.2) col = mix(RED, [80, 16, 16], 0.35);
      if (ballR > 16) {
        if (glyphHit(x, y, ballX - 5, ballY - 16, 1.35, 'N', DIGITS)) col = [255, 230, 210];
        if (glyphHit(x, y, ballX - 13, ballY - 4, 2.15, '32', DIGITS)) col = [255, 255, 255];
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

export function bingoIcon() {
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
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  '3': [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  '4': [0b10001, 0b10001, 0b10001, 0b11111, 0b00001, 0b00001, 0b00001],
  '5': [0b11111, 0b10000, 0b10000, 0b11110, 0b00001, 0b10001, 0b01110],
  '6': [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b00100, 0b00100, 0b00100],
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
  const fillRound = (x0, y0, x1, y1, rad, r, g, b) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (inRoundRect(x, y, x0, y0, x1 - 1, y1 - 1, rad)) put(x, y, r, g, b);
    }
  };
  const fillCircle = (cx, cy, rad, r, g, b) => {
    const r2 = rad * rad;
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r2) put(x, y, r, g, b);
    }
  };

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = (x + y) / (W + H);
    put(x, y, (16 + t * 18) | 0, (32 + t * 22) | 0, (24 + t * 14) | 0);
  }

  fillRound(60, 50, 640, 670, 24, 244, 234, 212);
  const headers = ['B', 'I', 'N', 'G', 'O'];
  const hcol = [[42, 90, 168], [196, 40, 48], [26, 122, 58], [196, 138, 24], [196, 90, 24]];
  const nums = [
    [5, 16, 42, 52, 68],
    [8, 22, 33, 48, 71],
    [3, 18, 0, 55, 64],
    [12, 29, 38, 47, 74],
    [7, 21, 41, 58, 63],
  ];
  const daubed = { '0,0': 1, '1,1': 1, '2,2': 1, '3,1': 1, '4,4': 1, '2,0': 1, '0,4': 1 };
  for (let c = 0; c < 5; c++) {
    drawText(put, 92 + c * 104, 70, headers[c], 7, hcol[c][0], hcol[c][1], hcol[c][2]);
  }
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const x = 80 + c * 104, y = 150 + r * 96;
    fillRound(x, y, x + 92, y + 84, 12, 255, 253, 246);
    const n = nums[r][c];
    const marked = daubed[c + ',' + r] || n === 0;
    if (marked) fillCircle(x + 46, y + 42, 32, 196, 40, 48);
    const label = n === 0 ? 'FREE' : String(n);
    const s = n === 0 ? 3 : 5;
    const tw = label.length * 6 * s;
    const col = marked ? [255, 255, 255] : [26, 20, 16];
    drawText(put, x + 46 - (tw / 2 | 0), y + (n === 0 ? 32 : 28), label, s, col[0], col[1], col[2]);
  }

  drawText(put, 700, 70, 'BINGO', 12, 244, 234, 212);
  fillCircle(860, 280, 118, 244, 210, 180);
  fillCircle(860, 280, 108, 196, 40, 48);
  fillCircle(820, 250, 22, 255, 160, 160);
  drawText(put, 830, 200, 'N', 6, 255, 230, 210);
  drawText(put, 790, 258, '32', 12, 255, 255, 255);
  drawText(put, 700, 440, 'ONE INVITE', 4, 184, 196, 176);
  drawText(put, 700, 500, 'DAUB YOUR CARD', 4, 184, 196, 176);
  drawText(put, 700, 570, 'YOUR CARD', 4, 232, 196, 96);

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
