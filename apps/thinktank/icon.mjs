// Procedural icon: a dark 15×18 board, a red tank sliding then firing.
// Pure Node, super-sample → box-downsample. Deterministic.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [10, 10, 15];
const FRAME = [30, 30, 44];
const CELL = [16, 16, 24];
const GRID = [28, 28, 40];
const HOME_R = [52, 18, 22];
const HOME_B = [16, 28, 56];
const RED_H = [255, 140, 140];
const RED = [226, 74, 74];
const BLUE_H = [140, 190, 255];
const BLUE = [77, 159, 255];
const HINT = [245, 215, 110];
const BASE = [240, 220, 160];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, FRAME, CELL, GRID, HOME_R, HOME_B, RED_H, RED, BLUE_H, BLUE, HINT, BASE]) {
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

function fillTri(col, x, y, ax, ay, bx, by, cx, cy, hi, lo) {
  const v0x = cx - ax, v0y = cy - ay, v1x = bx - ax, v1y = by - ay, v2x = x - ax, v2y = y - ay;
  const dot00 = v0x * v0x + v0y * v0y, dot01 = v0x * v1x + v0y * v1y, dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y, dot12 = v1x * v2x + v1y * v2y;
  const inv = 1 / (dot00 * dot11 - dot01 * dot01);
  const u = (dot11 * dot02 - dot01 * dot12) * inv;
  const v = (dot00 * dot12 - dot01 * dot02) * inv;
  if (u >= 0 && v >= 0 && u + v < 1) {
    const t = Math.max(0, Math.min(1, (x - ax) / 12));
    return mix(hi, lo, t);
  }
  return col;
}
function disc(col, x, y, cx, cy, rad, hi, lo) {
  const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
  if (d > rad * rad) return col;
  const u = (x - (cx - 2)) / (rad * 2);
  return mix(hi, lo, Math.max(0, Math.min(1, u)));
}
function house(col, x, y, cx, cy, s, hi, lo) {
  const left = cx - s * 0.45, right = cx + s * 0.45, top = cy - s * 0.15, bot = cy + s * 0.45;
  if (x >= left && x <= right && y >= top && y <= bot) return mix(hi, lo, (x - left) / (right - left));
  return fillTri(col, x, y, cx, cy - s * 0.55, left - 1, top, right + 1, top, hi, lo);
}
function plusAt(col, x, y, cx, cy, s, hi, lo) {
  const t = s * 0.22, a = s * 0.48;
  if ((Math.abs(x - cx) <= t && Math.abs(y - cy) <= a) || (Math.abs(y - cy) <= t && Math.abs(x - cx) <= a)) {
    return mix(hi, lo, (x - cx + a) / (a * 2));
  }
  return col;
}
function shieldAt(col, x, y, cx, cy, s, hi, lo) {
  const dx = (x - cx) / s, dy = (y - cy) / s;
  if (dy < -0.5 || dy > 0.55) return col;
  const half = 0.42 * (1 - Math.max(0, (dy + 0.1) / 0.7));
  if (Math.abs(dx) <= half + 0.08) return mix(hi, lo, (dx + 0.5));
  return col;
}

function tankBody(col, x, y, cx, cy, dir, s, hi, lo) {
  // dir: 0 up, 1 right, 2 down, 3 left. Body rect + barrel triangle.
  const body = s * 0.28;
  if (dir === 0) {
    if (x >= cx - body && x <= cx + body && y >= cy - s * 0.05 && y <= cy + s * 0.45) col = mix(hi, lo, (x - cx + body) / (body * 2));
    col = fillTri(col, x, y, cx, cy - s, cx - s * 0.55, cy + s * 0.05, cx + s * 0.55, cy + s * 0.05, hi, lo);
  } else if (dir === 2) {
    if (x >= cx - body && x <= cx + body && y >= cy - s * 0.45 && y <= cy + s * 0.05) col = mix(hi, lo, (x - cx + body) / (body * 2));
    col = fillTri(col, x, y, cx, cy + s, cx - s * 0.55, cy - s * 0.05, cx + s * 0.55, cy - s * 0.05, hi, lo);
  } else if (dir === 1) {
    if (y >= cy - body && y <= cy + body && x >= cx - s * 0.45 && x <= cx + s * 0.05) col = mix(hi, lo, (y - cy + body) / (body * 2));
    col = fillTri(col, x, y, cx + s, cy, cx - s * 0.05, cy - s * 0.55, cx - s * 0.05, cy + s * 0.55, hi, lo);
  } else {
    if (y >= cy - body && y <= cy + body && x >= cx - s * 0.05 && x <= cx + s * 0.45) col = mix(hi, lo, (y - cy + body) / (body * 2));
    col = fillTri(col, x, y, cx - s, cy, cx + s * 0.05, cy - s * 0.55, cx + s * 0.05, cy + s * 0.55, hi, lo);
  }
  return col;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 18;
  const COLS = 5, ROWS = 6;
  const bx = 18, by = 18, bw = OUT - 36, bh = OUT - 36;
  const cellW = bw / COLS, cellH = bh / ROWS;
  const t = f / (FRAMES - 1);
  // Red tank slides right, then faces down and a yellow beam erases the blue +.
  const fromC = 1, toC = 2, row = 2, shotR = 4, shotC = 2;
  const slide = Math.min(1, t / 0.5);
  const tankC = fromC + (toC - fromC) * slide;
  const facingDown = t > 0.5;
  const fade = t < 0.58 ? 1 : Math.max(0, 1 - (t - 0.58) / 0.42);
  const settled = [
    [0, 0, 'house', true],
    [5, 4, 'house', false],
    [0, 1, 'shield', true],
    [4, 4, 'shield', false],
  ];
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = CARD.slice();
      const inside = x >= bx && x <= bx + bw && y >= by && y <= by + bh;
      if (inside) {
        col = FRAME.slice();
        const c = Math.min(COLS - 1, Math.max(0, Math.floor((x - bx) / cellW)));
        const r = Math.min(ROWS - 1, Math.max(0, Math.floor((y - by) / cellH)));
        const gx = bx + c * cellW, gy = by + r * cellH;
        const inset = 0.6;
        if (x > gx + inset && x < gx + cellW - inset && y > gy + inset && y < gy + cellH - inset) {
          col = CELL.slice();
          if (r <= 1 && c <= 1) col = mix(CELL, HOME_R, 0.6);
          if (r >= 4 && c >= 3) col = mix(CELL, HOME_B, 0.6);
          if (facingDown && c === shotC && r > row && r < shotR) col = mix(col, HINT, 0.45);
          const cx = bx + (c + 0.5) * cellW, cy = by + (r + 0.5) * cellH;
          const s = Math.min(cellW, cellH) * 0.44;
          for (const piece of settled) {
            if (piece[0] === r && piece[1] === c) {
              const hi = piece[3] ? RED_H : BLUE_H, lo = piece[3] ? RED : BLUE;
              if (piece[2] === 'house') col = house(col, x, y, cx, cy, s * 1.2, BASE, lo);
              else if (piece[2] === 'shield') col = shieldAt(col, x, y, cx, cy, s, hi, lo);
            }
          }
          if (r === shotR && c === shotC && fade > 0.05) {
            const faded = mix(CELL, BLUE, fade);
            col = plusAt(col, x, y, cx, cy, s, mix(BLUE_H, faded, 1 - fade), mix(BLUE, faded, 1 - fade));
          }
        }
      }
    }
    const tankX = bx + (tankC + 0.5) * cellW;
    const tankY = by + (row + 0.5) * cellH;
    const ts = Math.min(cellW, cellH) * 0.42;
    col = tankBody(col, x, y, tankX, tankY, facingDown ? 2 : 1, ts, RED_H, RED);
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

export function thinktankIcon() {
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
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10001, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'X': [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  '+': [0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000, 0b00000],
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
    put(x, y, (10 + t * 8) | 0, (10 + t * 6) | 0, (15 + t * 10) | 0);
  }

  const COLS = 15, ROWS = 18, cell = 32;
  const boardW = COLS * cell, boardH = ROWS * cell;
  const bx = 36, by = 64;
  fill(0, 0, W, 48, 20, 16, 28);
  fill(0, 47, W, 48, 42, 42, 60);
  drawText(put, 24, 16, 'THINKTANK', 3, 238, 240, 248);
  drawText(put, 820, 18, 'YOUR TURN', 2, 245, 215, 110);

  fill(bx, 50, bx + boardW, 62, 64, 22, 28);
  drawText(put, bx + 12, 52, 'YOUR TURN  RED', 1, 255, 90, 90);

  function tri(cx, cy, dir, hi, lo, s) {
    // dir: 0 up, 1 right, 2 down, 3 left
    const pts = {
      0: [[cx, cy - s], [cx - s * 0.7, cy + s * 0.5], [cx + s * 0.7, cy + s * 0.5]],
      1: [[cx + s, cy], [cx - s * 0.5, cy - s * 0.7], [cx - s * 0.5, cy + s * 0.7]],
      2: [[cx, cy + s], [cx - s * 0.7, cy - s * 0.5], [cx + s * 0.7, cy - s * 0.5]],
      3: [[cx - s, cy], [cx + s * 0.5, cy - s * 0.7], [cx + s * 0.5, cy + s * 0.7]],
    }[dir];
    const minx = Math.min(pts[0][0], pts[1][0], pts[2][0]) | 0;
    const maxx = Math.max(pts[0][0], pts[1][0], pts[2][0]) | 0;
    const miny = Math.min(pts[0][1], pts[1][1], pts[2][1]) | 0;
    const maxy = Math.max(pts[0][1], pts[1][1], pts[2][1]) | 0;
    const ax = pts[0][0], ay = pts[0][1], bx_ = pts[1][0], by_ = pts[1][1], cx_ = pts[2][0], cy_ = pts[2][1];
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const v0x = cx_ - ax, v0y = cy_ - ay, v1x = bx_ - ax, v1y = by_ - ay, v2x = x - ax, v2y = y - ay;
      const dot00 = v0x * v0x + v0y * v0y, dot01 = v0x * v1x + v0y * v1y, dot02 = v0x * v2x + v0y * v2y;
      const dot11 = v1x * v1x + v1y * v1y, dot12 = v1x * v2x + v1y * v2y;
      const inv = 1 / (dot00 * dot11 - dot01 * dot01);
      const u = (dot11 * dot02 - dot01 * dot12) * inv;
      const v = (dot00 * dot12 - dot01 * dot02) * inv;
      if (u >= 0 && v >= 0 && u + v < 1) {
        const t = (x - minx) / Math.max(1, maxx - minx);
        put(x, y, (hi[0] + (lo[0] - hi[0]) * t) | 0, (hi[1] + (lo[1] - hi[1]) * t) | 0, (hi[2] + (lo[2] - hi[2]) * t) | 0);
      }
    }
  }
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
  function plusDraw(cx, cy, s, hi, lo) {
    const t = (s * 0.22) | 0, a = (s * 0.48) | 0;
    fill(cx - t, cy - a, cx + t + 1, cy + a + 1, hi[0], hi[1], hi[2]);
    fill(cx - a, cy - t, cx + a + 1, cy + t + 1, lo[0], lo[1], lo[2]);
  }
  function xDraw(cx, cy, s, hi) {
    for (let i = -s; i <= s; i++) {
      put(cx + i, cy + i, hi[0], hi[1], hi[2]);
      put(cx + i, cy + i + 1, hi[0], hi[1], hi[2]);
      put(cx + i, cy - i, hi[0], hi[1], hi[2]);
      put(cx + i, cy - i + 1, hi[0], hi[1], hi[2]);
    }
  }
  function shieldDraw(cx, cy, s, hi, lo) {
    for (let y = -s; y <= s; y++) {
      const u = (y + s) / (s * 2);
      const half = (s * 0.7 * (1 - Math.max(0, (u - 0.45) / 0.55))) | 0;
      for (let x = -half; x <= half; x++) {
        const t = (x + half) / Math.max(1, half * 2);
        put(cx + x, cy + y,
          (hi[0] + (lo[0] - hi[0]) * t) | 0,
          (hi[1] + (lo[1] - hi[1]) * t) | 0,
          (hi[2] + (lo[2] - hi[2]) * t) | 0);
      }
    }
  }
  function houseDraw(cx, cy, s, hi, lo) {
    fill(cx - s * 0.45, cy - s * 0.05, cx + s * 0.45, cy + s * 0.5, lo[0], lo[1], lo[2]);
    tri(cx, cy - s * 0.15, 0, hi, lo, s * 0.55);
  }

  // Mid-game: bases in homes, tanks marching, a mine, infiltrators, a selected tank with hints.
  // codes: 0 empty, 1 red base, 2 blue base, 3 red shield, 4 blue shield,
  // 5-8 red tanks U R D L, 9-12 blue tanks U R D L, 13 red +, 14 blue +, 15 red x, 16 blue x, 17 red mine, 18 blue mine
  const grid = [];
  for (let r = 0; r < ROWS; r++) { grid[r] = []; for (let c = 0; c < COLS; c++) grid[r][c] = 0; }
  grid[3][3] = 1; grid[14][11] = 2;
  grid[1][2] = 3; grid[2][5] = 3; grid[4][1] = 3;
  grid[15][10] = 4; grid[13][13] = 4; grid[16][12] = 4;
  grid[5][4] = 7; grid[6][7] = 6; grid[8][5] = 7; grid[9][8] = 6; // red tanks D, R
  grid[10][10] = 9; grid[12][8] = 12; grid[11][12] = 11; // blue tanks U, L, D
  grid[7][6] = 13; grid[9][10] = 14;
  grid[8][9] = 15;
  grid[11][7] = 17;
  const hints = { '7,8': 1, '8,7': 1, '9,8': 1, '8,9': 1 }; // legal ortho steps from red tank at 8,5 wait that's D tank
  // selected tank at (8,5) facing down — hints are ortho neighbors empty
  const sel = [8, 5];
  hints['8,4'] = 1; hints['8,6'] = 1; hints['7,5'] = 1; hints['9,5'] = 1;

  const RED_H = [255, 140, 140], RED = [226, 74, 74];
  const BLUE_H = [140, 190, 255], BLUE = [77, 159, 255];
  const BASE_H = [250, 230, 170], BASE_R = [226, 74, 74], BASE_B = [77, 159, 255];

  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const gx = bx + c * cell, gy = by + r * cell;
    const homeR = c >= 2 && c < 5 && r >= 2 && r < 6;
    const homeB = c >= 10 && c < 13 && r >= 12 && r < 16;
    const spawnR = c >= 1 && c < 6 && r >= 1 && r < 7 && !homeR;
    const spawnB = c >= 9 && c < 14 && r >= 11 && r < 17 && !homeB;
    let bg = [22, 22, 34];
    if (homeR) bg = [64, 22, 28];
    else if (homeB) bg = [20, 34, 68];
    else if (spawnR) bg = [36, 20, 24];
    else if (spawnB) bg = [18, 26, 46];
    const fire = (sel[1] === c && r > sel[0]);
    if (fire) bg = [((bg[0] + 78) / 2) | 0, ((bg[1] + 68) / 2) | 0, ((bg[2] + 28) / 2) | 0];
    fill(gx, gy, gx + cell, gy + cell, bg[0], bg[1], bg[2]);
    fill(gx, gy, gx + cell, gy + 1, 40, 40, 58);
    fill(gx, gy, gx + 1, gy + cell, 40, 40, 58);
    if (hints[r + ',' + c]) {
      fill(gx + 2, gy + 2, gx + cell - 2, gy + cell - 2, 78, 68, 28);
    }
    if (fire) {
      fill(gx + cell * 0.44, gy, gx + cell * 0.56, gy + cell, 245, 215, 110);
    }
    const cx = bx + (c + 0.5) * cell, cy = by + (r + 0.5) * cell, s = cell * 0.34;
    const v = grid[r][c];
    if (v === 1) houseDraw(cx, cy, s * 1.15, BASE_H, BASE_R);
    else if (v === 2) houseDraw(cx, cy, s * 1.15, BASE_H, BASE_B);
    else if (v === 3) shieldDraw(cx, cy, s, RED_H, RED);
    else if (v === 4) shieldDraw(cx, cy, s, BLUE_H, BLUE);
    else if (v >= 5 && v <= 8) tri(cx, cy, [0, 1, 2, 3][v - 5], RED_H, RED, s);
    else if (v >= 9 && v <= 12) tri(cx, cy, [0, 1, 2, 3][v - 9], BLUE_H, BLUE, s);
    else if (v === 13) plusDraw(cx, cy, s, RED_H, RED);
    else if (v === 14) plusDraw(cx, cy, s, BLUE_H, BLUE);
    else if (v === 15) xDraw(cx, cy, s * 0.55, RED_H);
    else if (v === 16) xDraw(cx, cy, s * 0.55, BLUE_H);
    else if (v === 17) discAt(cx, cy, s * 0.55, RED_H, RED);
    else if (v === 18) discAt(cx, cy, s * 0.55, BLUE_H, BLUE);
    if (sel[0] === r && sel[1] === c) {
      for (let k = 0; k < cell; k++) {
        put(gx + k, gy, 110, 230, 245); put(gx + k, gy + cell - 1, 110, 230, 245);
        put(gx, gy + k, 110, 230, 245); put(gx + cell - 1, gy + k, 110, 230, 245);
      }
    }
  }

  const trayY = by + boardH + 10;
  const labels = ['SHIELD', 'TANK', 'INFIL +', 'INFIL X', 'MINE'];
  const counts = ['2', '4', '2', '1', '1'];
  const tw = 84, gap = 8;
  const trayW = labels.length * tw + (labels.length - 1) * gap;
  let tx = bx + ((boardW - trayW) / 2) | 0;
  for (let i = 0; i < labels.length; i++) {
    const on = i === 1;
    fill(tx, trayY, tx + tw, trayY + 58, on ? 40 : 28, on ? 36 : 28, on ? 20 : 40);
    for (let k = 0; k < tw; k++) {
      put(tx + k, trayY, on ? 245 : 42, on ? 215 : 42, on ? 110 : 60);
      put(tx + k, trayY + 57, on ? 245 : 42, on ? 215 : 42, on ? 110 : 60);
    }
    const cx = tx + tw / 2, cy = trayY + 20, s = 11;
    if (i === 0) shieldDraw(cx, cy, s, RED_H, RED);
    else if (i === 1) tri(cx, cy, 2, RED_H, RED, s);
    else if (i === 2) plusDraw(cx, cy, s, RED_H, RED);
    else if (i === 3) xDraw(cx, cy, s * 0.7, RED_H);
    else discAt(cx, cy, s * 0.7, RED_H, RED);
    drawText(put, tx + 10, trayY + 36, labels[i], 1, 220, 222, 240);
    drawText(put, tx + 36, trayY + 46, counts[i], 1, 154, 160, 184);
    tx += tw + gap;
  }

  const lx = 560, ly = 90;
  drawText(put, lx, ly, 'DESTROY THE BASE', 3, 226, 74, 74);
  drawText(put, lx, ly + 40, 'COMPUTER OR A FRIEND', 2, 220, 222, 240);
  drawText(put, lx, ly + 70, 'NO GAME SERVER', 2, 154, 160, 184);
  const key = [
    ['shield', 'SHIELD', 'STOPS SHOTS'],
    ['tank', 'TANK', 'SHOOTS A LINE'],
    ['plus', 'INFIL', 'STEALS NEXT TO IT'],
    ['mine', 'MINE', 'BLOWS UP'],
    ['house', 'BASE', 'PROTECT THIS'],
  ];
  for (let i = 0; i < key.length; i++) {
    const ky = ly + 130 + i * 70;
    const cx = lx + 22, cy = ky + 16, s = 14;
    if (key[i][0] === 'shield') shieldDraw(cx, cy, s, RED_H, RED);
    else if (key[i][0] === 'tank') tri(cx, cy, 2, RED_H, RED, s);
    else if (key[i][0] === 'plus') plusDraw(cx, cy, s, RED_H, RED);
    else if (key[i][0] === 'mine') discAt(cx, cy, s * 0.7, RED_H, RED);
    else houseDraw(cx, cy, s, BASE_H, BASE_R);
    drawText(put, lx + 50, ky + 4, key[i][1], 2, 238, 240, 248);
    drawText(put, lx + 50, ky + 28, key[i][2], 2, 154, 160, 184);
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
