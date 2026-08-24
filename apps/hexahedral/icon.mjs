// Procedural hexahedral icon: a green cube sliding onto a pink block that drops.
// Cover is an isometric field mid-play — the original's look, not a title card.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const PINK = [211, 45, 143], PINK_S = [214, 71, 154], PINK_SS = [217, 97, 165];
const BLUE = [0, 179, 197], BLUE_S = [26, 185, 202], BLUE_SS = [51, 194, 208];
const GREEN = [110, 189, 75], GREEN_S = [102, 176, 70], GREEN_SS = [94, 161, 68];
const BEIGE = [204, 182, 160], BEIGE_S = [209, 189, 169], BEIGE_SS = [214, 196, 179];
const INK = [16, 14, 18], CARD = [18, 16, 20], WHITE = [255, 255, 255];
const DARK = [10, 10, 15], BROWN = [67, 60, 56];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [PINK, PINK_S, PINK_SS, BLUE, BLUE_S, BLUE_SS, GREEN, GREEN_S, GREEN_SS, BEIGE, BEIGE_S, CARD, INK, WHITE, BROWN, DARK]) {
    pal.push(b);
    pal.push(mix(b, [255, 255, 255], 0.18).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.28).map(Math.round));
  }
  return pal.slice(0, 64);
}
function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e9;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i], d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}
function inRR(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  if (x >= x0 + r && x <= x1 - r) return true;
  if (y >= y0 + r && y <= y1 - r) return true;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function bary(x, y, x0, y0, x1, y1, x2, y2) {
  const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
  if (!d) return null;
  const a = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / d;
  const b = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / d;
  const c = 1 - a - b;
  return { a, b, c };
}
function inTri(x, y, x0, y0, x1, y1, x2, y2) {
  const p = bary(x, y, x0, y0, x1, y1, x2, y2);
  return p && p.a >= -0.01 && p.b >= -0.01 && p.c >= -0.01;
}
function edgeDist(x, y, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
  if (l2 < 1e-6) return Math.hypot(x - x0, y - y0);
  let t = ((x - x0) * dx + (y - y0) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy));
}

function fillTri(plot, x0, y0, x1, y1, x2, y2, col) {
  const minX = Math.floor(Math.min(x0, x1, x2)) - 1;
  const maxX = Math.ceil(Math.max(x0, x1, x2)) + 1;
  const minY = Math.floor(Math.min(y0, y1, y2)) - 1;
  const maxY = Math.ceil(Math.max(y0, y1, y2)) + 1;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    if (!inTri(x + 0.5, y + 0.5, x0, y0, x1, y1, x2, y2)) continue;
    plot(x, y, col);
  }
}
function strokePoly(plot, pts, width) {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const minX = Math.floor(Math.min(a[0], b[0]) - width) - 1;
    const maxX = Math.ceil(Math.max(a[0], b[0]) + width) + 1;
    const minY = Math.floor(Math.min(a[1], b[1]) - width) - 1;
    const maxY = Math.ceil(Math.max(a[1], b[1]) + width) + 1;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      if (edgeDist(x + 0.5, y + 0.5, a[0], a[1], b[0], b[1]) <= width) plot(x, y, WHITE);
    }
  }
}
function fillQuad(plot, pts, col, edge) {
  fillTri(plot, pts[0][0], pts[0][1], pts[1][0], pts[1][1], pts[2][0], pts[2][1], col);
  fillTri(plot, pts[0][0], pts[0][1], pts[2][0], pts[2][1], pts[3][0], pts[3][1], col);
  if (edge) strokePoly(plot, pts, 1.05);
}

// 2:1 isometric cube. ox,oy = centre of the top face.
function cube(plot, ox, oy, w, h, d, top, left, right) {
  const N = [ox, oy - h], E = [ox + w, oy], S = [ox, oy + h], W = [ox - w, oy];
  const Sd = [ox, oy + h + d], Ed = [ox + w, oy + d], Wd = [ox - w, oy + d];
  fillQuad(plot, [W, S, Sd, Wd], left, true);
  fillQuad(plot, [E, S, Sd, Ed], right, true);
  fillQuad(plot, [N, E, S, W], top, true);
}

const GLYPHS = {
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
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '·': [0, 0, 0, 0b00100, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0, 0b00100],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
};
function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (gph[row] & (1 << (4 - col))) {
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
      }
    }
    cx += 6 * s;
  }
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const put = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= OUT || y >= OUT) return;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 1;
    }
  };
  const plot = (x, y, col) => put(x, y, col[0], col[1], col[2]);
  const t = f / (FRAMES - 1);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    if (inRR(x, y, 6, 6, 122, 122, 22)) put(x, y, CARD[0], CARD[1], CARD[2]);
  }
  // Two field cubes, pink on the right dropping as the green cube slides on.
  const drop = t * 10;
  const landed = t > 0.72;
  cube(plot, 42, 80, 20, 11, 18, BLUE, BLUE_S, BLUE_SS);
  cube(plot, 86, 68 + drop, 20, 11, 18,
    landed ? BLUE : PINK, landed ? BLUE_S : PINK_S, landed ? BLUE_SS : PINK_SS);
  const px = 42 + t * 44, py = 56 - t * 8;
  cube(plot, px, py, 12, 7, 12, GREEN, GREEN_S, GREEN_SS);

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

export function hexahedralIcon() {
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

export function screenshotPng() {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b, a) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };
  const plot = (x, y, col) => put(x, y, col[0], col[1], col[2]);
  // Radial dark like the original.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cx = (x - W / 2) / (W / 2), cy = (y - H / 2) / (H / 2);
    const t = Math.min(1, Math.sqrt(cx * cx + cy * cy));
    const c = mix(BROWN, DARK, t);
    put(x, y, c[0], c[1], c[2]);
  }
  // HUD bar
  for (let y = 36; y < 58; y++) for (let x = 420; x < 780; x++) {
    const on = (x - 420) / 360 < 0.45;
    put(x, y, on ? PINK[0] : BLUE[0], on ? PINK[1] : BLUE[1], on ? PINK[2] : BLUE[2]);
  }
  for (let x = 420; x < 780; x++) { put(x, 36, 255, 255, 255); put(x, 57, 255, 255, 255); }
  for (let y = 36; y < 58; y++) { put(420, y, 255, 255, 255); put(779, y, 255, 255, 255); }

  // Level dots — 4 done, current, rest locked
  for (let i = 0; i < 10; i++) {
    const cx = 420 + i * 36, cy = 84;
    const col = i < 4 ? BLUE : i === 4 ? PINK : [80, 74, 70];
    for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) {
      if (x * x + y * y > 64) continue;
      if (x * x + y * y > 49) put(cx + x, cy + y, 255, 255, 255);
      else put(cx + x, cy + y, col[0], col[1], col[2]);
    }
  }

  // Mid-play 4×4 — a real-looking mix, green cube mid-slide onto a pink.
  // Layout (row, col): 0 up = pink, _ = blue, x = beige
  const field = [
    ['_', '0', '_', '_'],
    ['x', '_', 'x', '_'],
    ['0', '_', '0', '0'],
    ['0', '0', '0', '0'],
  ];
  const ox = 600, oy = 210, w = 52, h = 30, dDown = 34, dUp = 52;
  const cells = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    cells.push({ r, c, kind: field[r][c], order: r + c });
  }
  cells.sort((a, b) => a.order - b.order);
  function cellOrigin(c, r, extraY) {
    return {
      x: ox + (c - r) * w,
      y: oy + (c + r) * h + (extraY || 0)
    };
  }
  for (const cell of cells) {
    const up = cell.kind === '0';
    const broken = cell.kind === 'x';
    const p = cellOrigin(cell.c, cell.r, up ? -18 : 0);
    const d = up ? dUp : dDown;
    const top = broken ? BEIGE : up ? PINK : BLUE;
    const left = broken ? BEIGE_S : up ? PINK_S : BLUE_S;
    const right = broken ? BEIGE_SS : up ? PINK_SS : BLUE_SS;
    cube(plot, p.x, p.y, w, h, d, top, left, right);
  }
  // Green cube sitting on (2,2) — a down blue — slightly raised.
  const gp = cellOrigin(2, 2, -28);
  cube(plot, gp.x, gp.y, 22, 13, 22, GREEN, GREEN_S, GREEN_SS);

  drawText(put, 430, 660, '7 LEFT · LEVEL 11', 4, 244, 236, 224);
  drawText(put, 430, 690, 'BEST 9', 3, 0, 179, 197);

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
