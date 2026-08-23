// Procedural icon for Floppy Bird: a cyan rounded card, green pipes, a yellow
// bird whose wing beats across the frames. Super-sample → box-downsample →
// small palette; deterministic so GIF builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 8;

const SKY_A = [110, 206, 214];
const SKY_B = [62, 176, 188];
const LAND = [222, 216, 149];
const LAND_D = [180, 168, 96];
const PIPE = [115, 191, 46];
const PIPE_D = [73, 128, 22];
const PIPE_L = [174, 224, 90];
const BIRD = [250, 224, 72];
const BIRD_D = [220, 168, 32];
const BEAK = [232, 124, 36];
const WHITE = [250, 250, 246];
const INK = [36, 28, 20];
const RED = [228, 64, 48];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [SKY_A, SKY_B, LAND, LAND_D, PIPE, PIPE_D, PIPE_L, BIRD, BIRD_D, BEAK, WHITE, INK, RED]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.28).map(Math.round));
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
function inRR(x, y, x0, y0, x1, y1, rad) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + rad), x1 - rad);
  const cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
  if (x >= x0 + rad && x <= x1 - rad) return true;
  if (y >= y0 + rad && y <= y1 - rad) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= rad * rad;
}

function drawBird(put, cx, cy, scale, flap, ghost) {
  const a = ghost ? 0.45 : 1;
  const body = (x, y, r, col) => {
    const dx = x - cx, dy = y - cy;
    // skip, used via pixel walk outside
    return dx * dx + dy * dy;
  };
  void body;
  const wingY = cy + (flap ? -3 : 4) * scale;
  const wingH = (flap ? 5 : 7) * scale;
  return { wingY, wingH, a };
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const flap = (f % 2) === 0;
  const bob = Math.sin(t * Math.PI * 2) * 3;
  const m = 7, rad = 20;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(SKY_A, SKY_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      // land
      if (y > 98) col = mix(LAND, LAND_D, (y - 98) / 22);
      // left pipe (upper + lower with a gap)
      if (x > 18 && x < 34) {
        if (y < 48 || y > 78) {
          col = mix(PIPE_D, PIPE, (x - 18) / 16);
          if (x > 20 && x < 24) col = PIPE_L;
        }
        if ((y > 44 && y < 50) || (y > 76 && y < 82)) {
          if (x > 16 && x < 36) col = mix(PIPE_D, PIPE, 0.4);
        }
      }
      // right pipe
      if (x > 92 && x < 110) {
        if (y < 40 || y > 70) {
          col = mix(PIPE_D, PIPE, (x - 92) / 18);
          if (x > 94 && x < 98) col = PIPE_L;
        }
        if ((y > 36 && y < 42) || (y > 68 && y < 74)) {
          if (x > 90 && x < 112) col = mix(PIPE_D, PIPE, 0.4);
        }
      }
      // bird body
      const bx = 58, by = 62 + bob;
      const dx = x - bx, dy = y - by;
      const rx = 13, ry = 10;
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) {
        col = mix(BIRD_D, BIRD, 0.45 + 0.4 * ((x - (bx - rx)) / (2 * rx)));
      }
      // wing
      const wy = by + (flap ? -6 : 3);
      const wdx = x - (bx - 2), wdy = y - wy;
      const wrx = 9, wry = flap ? 4.5 : 6.5;
      if ((wdx * wdx) / (wrx * wrx) + (wdy * wdy) / (wry * wry) <= 1 && x < bx + 4) {
        col = mix(BIRD, WHITE, flap ? 0.15 : 0.05);
      }
      // beak
      if (x > bx + 8 && x < bx + 18 && y > by - 3 && y < by + 5) {
        const kx = x - (bx + 8), ky = y - by;
        if (ky > -2.5 + kx * 0.15 && ky < 2.8 - kx * 0.12) col = BEAK;
      }
      // eye
      const ex = bx + 5, ey = by - 2;
      if ((x - ex) * (x - ex) + (y - ey) * (y - ey) <= 3.4 * 3.4) col = WHITE;
      if ((x - (ex + 1.2)) * (x - (ex + 1.2)) + (y - ey) * (y - ey) <= 1.5 * 1.5) col = INK;
      // red tuft
      if ((x - (bx - 6)) * (x - (bx - 6)) + (y - (by - 8)) * (y - (by - 8)) <= 3.2 * 3.2) col = RED;
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

export function floppyBirdIcon() {
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
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  '·': [0, 0, 0, 0b00100, 0, 0, 0],
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

function paintBird(put, cx, cy, scale, flap, ghost) {
  const dim = ghost ? 0.55 : 1;
  const tint = (r, g, b) => ghost
    ? [Math.round(r * 0.75 + 80), Math.round(g * 0.75 + 40), Math.round(b * 0.55 + 90)]
    : [r, g, b];
  const bodyR = 28 * scale, bodyH = 20 * scale;
  for (let y = cy - bodyH; y <= cy + bodyH; y++) {
    for (let x = cx - bodyR; x <= cx + bodyR + 16 * scale; x++) {
      const dx = (x - cx) / bodyR, dy = (y - cy) / bodyH;
      if (dx * dx + dy * dy <= 1) {
        const c = tint(...mix(BIRD_D, BIRD, 0.4 + 0.4 * ((x - (cx - bodyR)) / (2 * bodyR))));
        put(x, y, c[0], c[1], c[2]);
      }
    }
  }
  const wy = cy + (flap ? -12 : 6) * scale;
  const wrx = 18 * scale, wry = (flap ? 8 : 12) * scale;
  for (let y = wy - wry; y <= wy + wry; y++) {
    for (let x = cx - wrx - 4 * scale; x <= cx + 6 * scale; x++) {
      const dx = (x - (cx - 4 * scale)) / wrx, dy = (y - wy) / wry;
      if (dx * dx + dy * dy <= 1) {
        const c = tint(...mix(BIRD, WHITE, flap ? 0.2 : 0.05));
        put(x, y, c[0], c[1], c[2]);
      }
    }
  }
  for (let y = cy - 8 * scale; y <= cy + 10 * scale; y++) {
    for (let x = cx + 18 * scale; x <= cx + 38 * scale; x++) {
      const kx = (x - (cx + 18 * scale)) / (20 * scale);
      const ky = (y - cy) / (10 * scale);
      if (ky > -0.45 + kx * 0.2 && ky < 0.5 - kx * 0.15 && kx >= 0 && kx <= 1) {
        const c = tint(...BEAK);
        put(x, y, c[0], c[1], c[2]);
      }
    }
  }
  const ex = cx + 10 * scale, ey = cy - 4 * scale, er = 7 * scale;
  for (let y = ey - er; y <= ey + er; y++) for (let x = ex - er; x <= ex + er; x++) {
    if ((x - ex) * (x - ex) + (y - ey) * (y - ey) <= er * er) {
      const c = tint(...WHITE);
      put(x, y, c[0], c[1], c[2]);
    }
  }
  const px = ex + 3 * scale, py = ey, pr = 3.2 * scale;
  for (let y = py - pr; y <= py + pr; y++) for (let x = px - pr; x <= px + pr; x++) {
    if ((x - px) * (x - px) + (y - py) * (y - py) <= pr * pr) put(x, y, INK[0], INK[1], INK[2]);
  }
  const tx = cx - 14 * scale, ty = cy - 16 * scale, tr = 7 * scale;
  for (let y = ty - tr; y <= ty + tr; y++) for (let x = tx - tr; x <= tx + tr; x++) {
    if ((x - tx) * (x - tx) + (y - ty) * (y - ty) <= tr * tr) {
      const c = tint(...RED);
      put(x, y, c[0], c[1], c[2]);
    }
  }
  void dim;
}

function paintPipe(put, x0, gapTop, gapBot, H) {
  const W = 72;
  const cap = 22;
  for (let y = 0; y < gapTop; y++) for (let x = x0; x < x0 + W; x++) {
    const g = x < x0 + 12 ? PIPE_L : mix(PIPE_D, PIPE, (x - x0) / W);
    put(x, y, g[0], g[1], g[2]);
  }
  for (let y = gapTop - cap; y < gapTop; y++) for (let x = x0 - 8; x < x0 + W + 8; x++) {
    const g = mix(PIPE_D, PIPE, 0.45);
    put(x, y, g[0], g[1], g[2]);
  }
  for (let y = gapBot; y < H; y++) for (let x = x0; x < x0 + W; x++) {
    const g = x < x0 + 12 ? PIPE_L : mix(PIPE_D, PIPE, (x - x0) / W);
    put(x, y, g[0], g[1], g[2]);
  }
  for (let y = gapBot; y < gapBot + cap; y++) for (let x = x0 - 8; x < x0 + W + 8; x++) {
    const g = mix(PIPE_D, PIPE, 0.45);
    put(x, y, g[0], g[1], g[2]);
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
    const sky = mix(SKY_A, SKY_B, y / (H * 0.78));
    const landY = H * 0.78;
    for (let x = 0; x < W; x++) {
      if (y < landY) put(x, y, sky[0], sky[1], sky[2]);
      else {
        const g = mix(LAND, LAND_D, (y - landY) / (H - landY));
        put(x, y, g[0], g[1], g[2]);
      }
    }
  }
  // ceiling strip
  for (let y = 0; y < 18; y++) for (let x = 0; x < W; x++) {
    const c = ((x + y) % 14 < 7) ? [210, 168, 96] : [186, 140, 72];
    put(x, y, c[0], c[1], c[2]);
  }

  paintPipe(put, 520, 210, 390, Math.floor(H * 0.78));
  paintPipe(put, 860, 160, 340, Math.floor(H * 0.78));

  paintBird(put, 280, 310, 2.2, true, false);
  paintBird(put, 430, 250, 2.2, false, true);

  drawText(put, 70, 40, 'FLOPPY BIRD', 7, 255, 255, 255);
  drawText(put, 70, 640, 'TAP TO FLAP  ·  RACE A FRIEND', 3, 255, 248, 210);

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
