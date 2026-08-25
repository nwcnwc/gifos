// Procedural icon for Catch the Cat: a dark rounded card holding a honeycomb
// of hexes with a black cat on it. Walls blink in; the cat hops one cell.
// Pure Node, super-sample → box-downsample → small palette; deterministic.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [18, 24, 40];
const CARD_B = [10, 14, 26];
const HEX = [36, 48, 68];
const HEX_D = [22, 32, 48];
const WALL = [61, 143, 122];
const WALL_H = [140, 220, 190];
const GOLD = [232, 176, 90];
const CAT = [18, 16, 20];
const CAT_E = [240, 220, 160];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, HEX, HEX_D, WALL, WALL_H, GOLD, CAT, CAT_E]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.25).map(Math.round));
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

// Axial hex: even-r offset. Returns {x,y} of cell centre.
function hexCenter(i, j, size, ox, oy) {
  const x = ox + size * Math.sqrt(3) * (i + 0.5 * (j & 1));
  const y = oy + size * 1.5 * j;
  return { x, y };
}
function inHex(px, py, cx, cy, r) {
  const dx = Math.abs(px - cx), dy = Math.abs(py - cy);
  return dy <= r && dx <= r * 0.8660254 && (dx * 0.57735027 + dy) <= r;
}
function inDot(px, py, cx, cy, r) {
  return (px - cx) * (px - cx) + (py - cy) * (py - cy) <= r * r;
}

function catBlob(px, py, cx, cy, sc, face) {
  // head
  const hx = cx + face * sc * 0.15, hy = cy - sc * 0.35;
  const hd = Math.hypot(px - hx, py - hy);
  if (hd < sc * 0.55) return 'body';
  // ears
  const e1x = hx - sc * 0.38, e1y = hy - sc * 0.42;
  const e2x = hx + sc * 0.32, e2y = hy - sc * 0.46;
  if (Math.hypot(px - e1x, py - e1y) < sc * 0.22) return 'body';
  if (Math.hypot(px - e2x, py - e2y) < sc * 0.20) return 'body';
  // body
  const bx = cx - face * sc * 0.05, by = cy + sc * 0.35;
  if (Math.hypot((px - bx) / 1.15, (py - by) / 0.85) < sc * 0.62) return 'body';
  // tail
  const tx = cx - face * sc * 0.85, ty = cy + sc * 0.15;
  const td = Math.hypot(px - tx, py - ty);
  if (td < sc * 0.18) return 'body';
  // eye
  const eyeX = hx + face * sc * 0.18, eyeY = hy - sc * 0.05;
  if (Math.hypot(px - eyeX, py - eyeY) < sc * 0.09) return 'eye';
  return null;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const dx = 14.2, dy = 12.4, dotR = 5.1;
  const ox = 22, oy = 22;
  const catPath = [[2, 2], [3, 2], [3, 3], [4, 3], [4, 2], [5, 2]];
  const step = Math.min(catPath.length - 1, Math.floor(t * (catPath.length - 0.01)));
  const catCell = catPath[step];
  const walls = [[1, 1], [4, 1], [2, 3], [5, 3], [0, 4], [3, 5], [6, 4]];
  const lit = Math.floor(t * walls.length);
  const cell = (i, j) => ({ x: ox + i * dx + ((j & 1) ? dx / 2 : 0), y: oy + j * dy });

  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, 6, 22)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
        if (j === 0 && (i === 0 || i === 6)) continue;
        if (j === 6 && (i === 0 || i === 6)) continue;
        const c = cell(i, j);
        if (!inDot(x, y, c.x, c.y, dotR)) continue;
        const wallI = walls.findIndex((w) => w[0] === i && w[1] === j);
        if (wallI >= 0 && wallI <= lit) col = mix(WALL, WALL_H, wallI === lit ? 0.55 : 0.15);
        else col = mix(HEX, HEX_D, ((i + j) & 1) ? 0.35 : 0);
      }
      const cc = cell(catCell[0], catCell[1]);
      const bounce = Math.abs(Math.sin(t * Math.PI * catPath.length));
      const part = catBlob(x, y, cc.x, cc.y - bounce * 2.2, 6.2, 1);
      if (part === 'body') col = CAT;
      else if (part === 'eye') col = GOLD;
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

export function catchTheCatIcon() {
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
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  // The cover writes real sentences now, so the alphabet has to be a real
  // alphabet — a missing glyph fell through to a space and silently deleted a
  // letter out of the middle of a word.
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'J': [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'Q': [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  'X': [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  'Z': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  '.': [0, 0, 0, 0, 0, 0b00110, 0b00110],
  ',': [0, 0, 0, 0, 0b00110, 0b00110, 0b01100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};
function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch] || GLYPHS[' '];
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

// The store cover. It is a DRAWING of the app, not a capture of it, so it has
// to be redrawn whenever the app stops looking like it — and in 1.2.0 the board
// stopped being flat. So this projects the same way view.js does: rotateX by
// TILT, then divide by the perspective term, painting back row to front row so
// a wall column can stand in front of the dot behind it. A cover still showing
// a flat grid would be advertising a different game.
export function screenshotPng() {
  const W = 1200, H = 720, SS = 2;
  const RW = W * SS, RH = H * SS;
  const buf = Buffer.alloc(RW * RH * 3);

  const set = (x, y, c) => {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= RW || y >= RH) return;
    const o = (y * RW + x) * 3;
    buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2];
  };
  const bg = [11, 16, 32];
  for (let i = 0; i < RW * RH; i++) { buf[i * 3] = bg[0]; buf[i * 3 + 1] = bg[1]; buf[i * 3 + 2] = bg[2]; }

  // A pool of light under the table — the same vignette style.css puts there.
  const gx = RW * 0.5, gy = RH * 0.6, gw = RW * 0.62, gh = RH * 0.44;
  for (let y = 0; y < RH; y++) {
    for (let x = 0; x < RW; x++) {
      const u = (x - gx) / gw, v = (y - gy) / gh;
      const d = Math.sqrt(u * u + v * v);
      if (d >= 1) continue;
      const t = (1 - d) * (1 - d) * 0.16;
      const o = (y * RW + x) * 3;
      buf[o] = Math.round(bg[0] + (90 - bg[0]) * t);
      buf[o + 1] = Math.round(bg[1] + (120 - bg[1]) * t);
      buf[o + 2] = Math.round(bg[2] + (190 - bg[2]) * t);
    }
  }

  // ---- the projection, matching view.js ------------------------------------
  const TILT = 36 * Math.PI / 180, PERSP = 1150 * SS;
  const CX = RW * 0.5, CY = RH * 0.545;
  const project = (bx, by, bz) => {
    const Y = by * Math.cos(TILT) - (bz || 0) * Math.sin(TILT);
    const Z = by * Math.sin(TILT) + (bz || 0) * Math.cos(TILT);
    const w = 1 - Z / PERSP;
    return { x: CX + bx / w, y: CY + Y / w, k: 1 / w };
  };

  const COLS = 11, ROWS = 11, R = 26 * SS;
  const DX = 2 * R, DY = R * Math.sqrt(3);
  const boardW = (COLS - 1) * DX + R, boardH = (ROWS - 1) * DY;
  const cell = (i, j) => ({
    bx: i * DX + ((j & 1) ? R : 0) - boardW / 2,
    by: j * DY - boardH / 2,
  });

  const disc = (px, py, rx, ry, c) => {
    for (let y = Math.floor(py - ry); y <= Math.ceil(py + ry); y++) {
      for (let x = Math.floor(px - rx); x <= Math.ceil(px + rx); x++) {
        const u = (x - px) / rx, v = (y - py) / ry;
        if (u * u + v * v <= 1) set(x, y, c);
      }
    }
  };
  const shade = (c, t) => (t >= 0
    ? [c[0] + (255 - c[0]) * t, c[1] + (255 - c[1]) * t, c[2] + (255 - c[2]) * t]
    : [c[0] * (1 + t), c[1] * (1 + t), c[2] * (1 + t)]).map((v) => Math.max(0, Math.min(255, Math.round(v))));

  const SOCKET = [30, 39, 64], RIMSOCK = [27, 33, 54], RIMRING = [96, 54, 58];
  const CAP = [79, 174, 147], SIDE = [35, 90, 76];
  const WALL_LIFT = R * 1.0;

  const walls = new Set(['2,1', '7,1', '5,2', '1,3', '9,3', '3,4', '6,4', '8,5', '2,6', '4,7', '7,7', '9,8', '3,9', '6,9']);
  const cats = [[4, 5, [232, 176, 90], 'YOU'], [7, 6, [125, 206, 154], 'ANA']];

  // Back row to front row: a column must be able to stand in front of the
  // socket behind it, and a cat in front of both.
  const late = [];
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const { bx, by } = cell(i, j);
      const p = project(bx, by, 0);
      // The rim is where a cat gets away, so it is marked — a thin red ring
      // round the socket, the way the app marks it, not a red dot.
      const rim = i === 0 || i === COLS - 1 || j === 0 || j === ROWS - 1;
      if (rim) disc(p.x, p.y, R * 0.86 * p.k, R * 0.86 * Math.cos(TILT) * p.k, RIMRING);
      disc(p.x, p.y, R * (rim ? 0.76 : 0.84) * p.k, R * (rim ? 0.76 : 0.84) * Math.cos(TILT) * p.k,
           rim ? RIMSOCK : SOCKET);
      if (walls.has(i + ',' + j)) {
        for (let s = 0; s <= 6; s++) {
          const z = (WALL_LIFT * s) / 6;
          const q = project(bx, by, z);
          const c = s === 6 ? CAP : shade(SIDE, -0.4 + 0.4 * (s / 6));
          disc(q.x, q.y, R * 0.72 * q.k, R * 0.72 * Math.cos(TILT) * q.k, c);
        }
        const top = project(bx, by, WALL_LIFT);
        disc(top.x - R * 0.2 * top.k, top.y - R * 0.24 * top.k, R * 0.28 * top.k, R * 0.28 * Math.cos(TILT) * top.k,
             shade(CAP, 0.3));
      }
      for (const c of cats) if (c[0] === i && c[1] === j) late.push({ p, tone: c[2], tag: c[3] });
    }
    // Cats on this row go down after the row's dots and before the next row's,
    // so a nearer wall still overlaps them.
    while (late.length) drawCat(late.shift());
  }

  function drawCat(c) {
    const p = c.p, sc = R * 1.7 * p.k;
    const bodyAt = (x, y) => catBlob(x, y, p.x, p.y - sc * 0.78, sc * 1.25, -1);
    disc(p.x, p.y, sc * 0.62, sc * 0.24, [4, 6, 12]);
    // A rim first, then the silhouette over it — the way the app lights a black
    // cat on a black table.
    const glow = shade(c.tone, -0.3);
    for (let y = Math.floor(p.y - sc * 2.8); y <= Math.ceil(p.y + sc * 0.6); y++) {
      for (let x = Math.floor(p.x - sc * 1.9); x <= Math.ceil(p.x + sc * 1.9); x++) {
        if (bodyAt(x, y)) continue;
        let near = false;
        for (let a = 0; a < 12 && !near; a++) {
          const dx = Math.cos(a * Math.PI / 6) * SS * 2.2, dy = Math.sin(a * Math.PI / 6) * SS * 2.2;
          if (bodyAt(x + dx, y + dy) === 'body') near = true;
        }
        if (near) set(x, y, glow);
      }
    }
    for (let y = Math.floor(p.y - sc * 2.6); y <= Math.ceil(p.y + sc * 0.4); y++) {
      for (let x = Math.floor(p.x - sc * 1.7); x <= Math.ceil(p.x + sc * 1.7); x++) {
        const part = bodyAt(x, y);
        if (part === 'body') set(x, y, [12, 10, 14]);
        else if (part === 'eye') set(x, y, c.tone);
      }
    }
    drawText(rgb(set), Math.round(p.x - c.tag.length * 3 * SS), Math.round(p.y - sc * 3.2), c.tag, 2 * SS,
             c.tone[0], c.tone[1], c.tone[2]);
  }

  drawText(rgb(set), 58 * SS, 40 * SS, 'CATCH THE CAT', 8 * SS, 232, 176, 90);
  drawText(rgb(set), 58 * SS, 112 * SS, 'WALL IT IN. TURN THE TABLE.', 4 * SS, 154, 166, 195);
  drawText(rgb(set), 58 * SS, 656 * SS, 'RACE A FRIEND, OR PEN EVERY CAT TOGETHER', 4 * SS, 154, 166, 195);

  // ---- box-downsample -----------------------------------------------------
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = ((y * SS + sy) * RW + (x * SS + sx)) * 3;
          r += buf[o]; g += buf[o + 1]; b += buf[o + 2];
        }
      }
      const n = SS * SS, o = (y * W + x) * 4;
      rgba[o] = Math.round(r / n); rgba[o + 1] = Math.round(g / n);
      rgba[o + 2] = Math.round(b / n); rgba[o + 3] = 255;
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

// drawText was written against a put(x, y, r, g, b) signature; the cover paints
// into an RGB buffer through set(x, y, [r, g, b]).
function rgb(set) { return (x, y, r, g, b) => set(x, y, [r, g, b]); }
