// Procedural Sokoban icon: a cream rounded card holding a tiny warehouse,
// with the keeper pushing a crate onto a gold spot. Pure Node, super-sample
// → box-downsample → small palette; deterministic so builds reproduce.
import { deflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CREAM = [250, 244, 232];
const INK = [36, 23, 15];
const WALL = [107, 68, 35];
const WALLH = [138, 90, 50];
const FLOOR = [201, 166, 107];
const FLOOR2 = [191, 154, 94];
const GOAL = [232, 197, 71];
const BOX = [196, 120, 42];
const BOXH = [224, 154, 74];
const BOXOK = [212, 160, 23];
const KEEPER = [47, 111, 143];
const KEEPERH = [79, 163, 200];
const GOLD = [232, 184, 74];
const CRATE = [196, 120, 42];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CREAM, INK, WALL, WALLH, FLOOR, FLOOR2, GOAL, BOX, BOXH, BOXOK, KEEPER, KEEPERH, GOLD, CRATE]) {
    pal.push(b.map(Math.round));
    pal.push(mix(b, [255, 255, 255], 0.18).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.22).map(Math.round));
  }
  return pal.slice(0, 64);
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

const GLYPHS = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
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
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
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

// Tiny legal push: ##### / #---# / #$@.# / #---# / #####
function poseAt(f) {
  const t = Math.min(1, Math.max(0, (f / (FRAMES - 1) - 0.08) / 0.84));
  const e = t * t * (3 - 2 * t);
  return {
    player: { x: 1 + e, y: 2 },
    box: { x: 2 + e, y: 2 },
    parked: t > 0.92
  };
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 6, rad = 18;
  const pose = poseAt(f);
  const gx0 = 18, gy0 = 18, tile = 18.4;

  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = CREAM;
      const cx = Math.floor((x - gx0) / tile);
      const cy = Math.floor((y - gy0) / tile);
      if (cx >= 0 && cy >= 0 && cx < 5 && cy < 5) {
        const wall = cx === 0 || cy === 0 || cx === 4 || cy === 4;
        if (wall) col = ((cx + cy) % 2) ? WALL : WALLH;
        else col = ((cx + cy) % 2) ? FLOOR : FLOOR2;
      }
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }

  function put(x, y, r, g, b) {
    if (x < 0 || y < 0 || x >= OUT || y >= OUT) return;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      if (rgba[o + 3] < 0.5) continue;
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b;
    }
  }
  function fill(x0, y0, x1, y1, r, g, b) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, r, g, b);
  }

  const goalX = gx0 + 3 * tile, goalY = gy0 + 2 * tile;
  const gcx = goalX + tile / 2, gcy = goalY + tile / 2;
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    const dx = x - gcx, dy = y - gcy, d = Math.sqrt(dx * dx + dy * dy);
    if (d > tile * 0.16 && d < tile * 0.28) put(x, y, GOAL[0], GOAL[1], GOAL[2]);
  }

  const bx = gx0 + pose.box.x * tile + tile * 0.16;
  const by = gy0 + pose.box.y * tile + tile * 0.16;
  const bs = tile * 0.68;
  const bc = pose.parked ? BOXOK : BOX;
  fill(bx, by, bx + bs, by + bs, bc[0], bc[1], bc[2]);
  fill(bx + 2, by + 2, bx + bs - 2, by + bs * 0.32, BOXH[0], BOXH[1], BOXH[2]);

  const kx = gx0 + pose.player.x * tile + tile / 2;
  const ky = gy0 + pose.player.y * tile + tile / 2;
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    const dx = x - kx, dy = y - (ky + 2);
    if (dx * dx + dy * dy <= (tile * 0.22) * (tile * 0.22)) put(x, y, KEEPER[0], KEEPER[1], KEEPER[2]);
    const hx = x - kx, hy = y - (ky - 3);
    if (hx * hx + hy * hy <= (tile * 0.16) * (tile * 0.16)) put(x, y, KEEPERH[0], KEEPERH[1], KEEPERH[2]);
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

export function sokobanIcon() {
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

  fill(0, 0, W, H, 36, 23, 15);
  fill(48, 48, 248, 118, 232, 184, 74);
  fill(248, 48, 520, 118, 196, 120, 42);
  drawText(put, 72, 66, 'SOKO', 6, 36, 23, 15);
  drawText(put, 268, 66, 'BAN', 6, 250, 244, 232);

  drawText(put, 56, 160, 'PUSH THE BOXES', 3, 232, 197, 71);
  drawText(put, 56, 210, 'ONTO THE SPOTS', 3, 201, 166, 107);
  rr(56, 280, 340, 352, 8, 232, 184, 74);
  drawText(put, 80, 302, 'PLAY A FRIEND', 3, 36, 23, 15);
  drawText(put, 56, 390, 'PRESS INVITE', 3, 232, 184, 74);
  drawText(put, 56, 440, 'SAME WAREHOUSE', 3, 201, 166, 107);
  drawText(put, 56, 490, 'FIRST TO FINISH WINS', 3, 201, 166, 107);
  drawText(put, 56, 580, 'FIFTY ROOMS', 3, 138, 90, 50);

  const dir = dirname(fileURLToPath(import.meta.url));
  const levels = JSON.parse(readFileSync(join(dir, 'vendor', 'levels.json'), 'utf8'));
  const lv = levels[0];
  const tile = 28;
  const ox = 560, oy = 90;
  for (let y = 0; y < lv.h; y++) {
    for (let x = 0; x < lv.w; x++) {
      const ch = lv.map.charAt(y * lv.w + x);
      if (ch === ' ') continue;
      const x0 = ox + x * tile, y0 = oy + y * tile;
      if (ch === '#') {
        const wc = ((x + y) % 2) ? [90, 56, 28] : [107, 68, 35];
        fill(x0, y0, x0 + tile, y0 + tile, wc[0], wc[1], wc[2]);
        fill(x0, y0, x0 + tile, y0 + 5, 138, 90, 50);
      } else {
        const fc = ((x + y) % 2) ? [201, 166, 107] : [191, 154, 94];
        fill(x0, y0, x0 + tile, y0 + tile, fc[0], fc[1], fc[2]);
        if (ch === '.' || ch === '*' || ch === '+') {
          const cx = x0 + tile / 2, cy = y0 + tile / 2;
          for (let yy = y0; yy < y0 + tile; yy++) for (let xx = x0; xx < x0 + tile; xx++) {
            const dx = xx - cx, dy = yy - cy, d = Math.sqrt(dx * dx + dy * dy);
            if (d > 5 && d < 9) put(xx, yy, 232, 197, 71);
          }
        }
        if (ch === '$' || ch === '*') {
          const bc = ch === '*' ? BOXOK : BOX;
          rr(x0 + 4, y0 + 4, x0 + tile - 4, y0 + tile - 4, 3, bc[0], bc[1], bc[2]);
        }
        if (ch === '@' || ch === '+') {
          const cx = x0 + tile / 2, cy = y0 + tile / 2;
          for (let yy = y0; yy < y0 + tile; yy++) for (let xx = x0; xx < x0 + tile; xx++) {
            const dx = xx - cx, dy = yy - (cy + 3);
            if (dx * dx + dy * dy <= 64) put(xx, yy, KEEPER[0], KEEPER[1], KEEPER[2]);
            const hx = xx - cx, hy = yy - (cy - 5);
            if (hx * hx + hy * hy <= 36) put(xx, yy, KEEPERH[0], KEEPERH[1], KEEPERH[2]);
          }
        }
      }
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
