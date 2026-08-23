// Procedural yellow tank icon + 1200×720 cover. Pure Node, deterministic.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 8;
const YA = [231, 231, 148], YB = [231, 156, 33], YC = [107, 107, 0];
const CARD = [16, 16, 16], BRICK = [156, 74, 0], BRICKD = [107, 8, 0], STEEL = [173, 173, 173];
const EAGLE = [99, 99, 99], GRASS = [140, 214, 0], WATER = [66, 66, 255];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, YA, YB, YC, BRICK, BRICKD, STEEL, EAGLE, GRASS, WATER, [255, 255, 255]]) {
    pal.push(b);
    pal.push(mix(b, [255, 255, 255], 0.2).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
  }
  return pal;
}
function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e9;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i], d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

function paintTank(put, cx, cy, s, tread) {
  // s = pixel size. Tank faces up, 16×16 at scale s, centred on (cx,cy).
  const x0 = Math.round(cx - 8 * s), y0 = Math.round(cy - 8 * s);
  const sh = tread ? s : 0;
  const fill = (x, y, w, h, col) => {
    for (let yy = 0; yy < h * s; yy++) for (let xx = 0; xx < w * s; xx++)
      put(x0 + x * s + xx, y0 + y * s + yy + (x < 4 ? sh : 0), col[0], col[1], col[2]);
  };
  fill(1, 4, 3, 11, YA); fill(2, 4, 1, 11, YB);
  fill(12, 4, 3, 11, YC); fill(12, 4, 2, 11, YB);
  fill(4, 5, 8, 9, YA); fill(5, 6, 6, 7, YB); fill(6, 7, 4, 5, YC);
  fill(7, 1, 2, 6, YA);
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
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    if (!inCard(x, y, 6, 18)) continue;
    put(x, y, CARD[0], CARD[1], CARD[2]);
    // brick floor
    if (y > 88 && ((x >> 3) + (y >> 3)) % 2 === 0) put(x, y, BRICKD[0], BRICKD[1], BRICKD[2]);
    else if (y > 88) put(x, y, BRICK[0], BRICK[1], BRICK[2]);
  }
  paintTank((x, y, r, g, b) => put(x, y, r, g, b), 64, 58, 4, f % 2);
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

export function battleCityIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 8, transparentIndex: 0 };
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

const GLYPHS = {
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
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
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
      }
    }
    cx += 6 * s;
  }
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

  fill(0, 0, W, H, 117, 117, 117);
  const ox = 80, oy = 40, S = 3; // 208*3 = 624 playfield
  fill(ox, oy, ox + 208 * S, oy + 208 * S, 0, 0, 0);

  function brick(bx, by) {
    for (let y = 0; y < 4 * S; y++) for (let x = 0; x < 4 * S; x++) {
      const odd = ((bx + by) / 4) % 2 === 0;
      put(ox + bx * S + x, oy + by * S + y, odd ? 107 : 156, odd ? 8 : 74, 0);
    }
  }
  function steel(sx, sy) {
    fill(ox + sx * S, oy + sy * S, ox + (sx + 8) * S, oy + (sy + 8) * S, 173, 173, 173);
    fill(ox + (sx + 2) * S, oy + (sy + 2) * S, ox + (sx + 6) * S, oy + (sy + 6) * S, 255, 255, 255);
  }
  // Stage-1-ish columns of brick
  for (let col = 1; col <= 11; col += 2) {
    if (col === 6) continue;
    for (let row = 1; row <= 10; row++) {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) brick(col * 16 + j * 4, row * 16 + i * 4);
    }
  }
  // eagle house
  for (let i = 0; i < 4; i++) {
    brick(5 * 16 + i * 4, 11 * 16);
    brick(7 * 16 + i * 4, 11 * 16);
    brick(5 * 16, 12 * 16 + i * 4);
    brick(7 * 16 + 12, 12 * 16 + i * 4);
  }
  steel(3 * 16, 3 * 16); steel(9 * 16, 3 * 16);

  function tank(px, py, colA, colB, colC, rot) {
    // 16×16 up-facing, then rotate 90*rot
    const pix = [];
    const stamp = (x, y, w, h, c) => {
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) pix.push([x + xx, y + yy, c]);
    };
    stamp(1, 4, 3, 11, colA); stamp(2, 4, 1, 11, colB);
    stamp(12, 4, 3, 11, colC); stamp(12, 4, 2, 11, colB);
    stamp(4, 5, 8, 9, colA); stamp(5, 6, 6, 7, colB); stamp(6, 7, 4, 5, colC);
    stamp(7, 1, 2, 6, colA);
    for (const [x, y, c] of pix) {
      let rx = x, ry = y;
      if (rot === 1) { rx = 15 - y; ry = x; }
      if (rot === 2) { rx = 15 - x; ry = 15 - y; }
      if (rot === 3) { rx = y; ry = 15 - x; }
      fill(ox + (px + rx) * S, oy + (py + ry) * S, ox + (px + rx + 1) * S, oy + (py + ry + 1) * S, c[0], c[1], c[2]);
    }
  }
  tank(64, 192, YA, YB, YC, 0);
  tank(128, 192, [181, 247, 206], [0, 140, 49], [0, 82, 0], 0);
  tank(16, 32, [255, 255, 255], [173, 173, 173], [0, 66, 74], 2);
  tank(160, 48, [255, 255, 255], [181, 49, 33], [90, 0, 123], 2);
  tank(96, 80, [255, 255, 255], [173, 173, 173], [0, 66, 74], 1);

  // eagle
  fill(ox + 102 * S, oy + 196 * S, ox + 122 * S, oy + 208 * S, 99, 99, 99);
  fill(ox + 108 * S, oy + 192 * S, ox + 116 * S, oy + 196 * S, 107, 8, 0);

  // HUD strip
  fill(ox + 208 * S, oy, W - 40, oy + 208 * S, 117, 117, 117);
  drawText(put, ox + 208 * S + 20, oy + 20, 'BATTLE', 4, 0, 0, 0);
  drawText(put, ox + 208 * S + 20, oy + 56, 'CITY', 4, 0, 0, 0);

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
