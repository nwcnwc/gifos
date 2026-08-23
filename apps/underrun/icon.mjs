// Procedural icon for Underrun: a dark rounded card, a receding corridor,
// a soldier firing, a spider with red eyes. Pure Node — super-sample →
// box-downsample → small palette. Deterministic so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [18, 10, 6];
const CARD_B = [6, 4, 4];
const FLOOR = [42, 28, 16];
const FLOOR2 = [28, 18, 10];
const WALL = [22, 14, 10];
const WALL_L = [36, 22, 12];
const ORANGE = [204, 136, 0];
const ORANGE_H = [238, 153, 0];
const GLOW = [255, 112, 32];
const BLUE = [48, 72, 120];
const BLUE_L = [80, 120, 176];
const SPIDER = [16, 12, 10];
const EYE = [220, 40, 16];
const INK = [236, 220, 180];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, FLOOR, FLOOR2, WALL, WALL_L, ORANGE, ORANGE_H, GLOW, BLUE, BLUE_L, SPIDER, EYE, INK]) {
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

function put(rgba, x, y, col, a) {
  const xi = x | 0, yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= RW || yi >= RW) return;
  const o = (yi * RW + xi) * 4;
  if (a == null || a >= 1) {
    rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    return;
  }
  if (!rgba[o + 3]) return;
  rgba[o] = rgba[o] * (1 - a) + col[0] * a;
  rgba[o + 1] = rgba[o + 1] * (1 - a) + col[1] * a;
  rgba[o + 2] = rgba[o + 2] * (1 - a) + col[2] * a;
}

function fillRect(rgba, x, y, w, h, col) {
  for (let py = y * SS; py < (y + h) * SS; py++) {
    for (let px = x * SS; px < (x + w) * SS; px++) put(rgba, px, py, col);
  }
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const bob = Math.sin(t * Math.PI * 2) * 1.4;
  const crawl = t * 10;

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 20)) continue;
      let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      // receding corridor: walls pinch toward a vanishing point
      const vpX = 64, vpY = 28;
      const depth = (y - vpY) / (OUT - 12 - vpY);
      if (y > vpY) {
        const half = 6 + depth * 48;
        const left = vpX - half, right = vpX + half;
        if (x > left && x < right) {
          const u = (x - left) / (right - left);
          const tile = ((Math.floor(u * 8) + Math.floor(depth * 10)) & 1);
          col = mix(tile ? FLOOR : FLOOR2, ORANGE, 0.08 + depth * 0.12);
        } else if (x > left - 10 && x < left) {
          col = mix(WALL, WALL_L, (x - (left - 10)) / 10);
        } else if (x < right + 10 && x > right) {
          col = mix(WALL_L, WALL, (x - right) / 10);
        }
      }
      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }

  // spider — body + legs + red eyes, crawling down the corridor
  const sx = 62, sy = 34 + crawl;
  fillRect(rgba, sx, sy, 10, 7, SPIDER);
  fillRect(rgba, sx - 4, sy + 2, 4, 2, SPIDER);
  fillRect(rgba, sx + 10, sy + 2, 4, 2, SPIDER);
  fillRect(rgba, sx + 1, sy + 2, 2, 2, EYE);
  fillRect(rgba, sx + 7, sy + 2, 2, 2, EYE);

  // soldier — blue suit, bobbing
  const px = 58, py = 86 + bob;
  fillRect(rgba, px + 3, py, 8, 6, BLUE_L);      // head
  fillRect(rgba, px + 2, py + 6, 10, 12, BLUE);  // body
  fillRect(rgba, px + 11, py + 8, 10, 3, BLUE);  // gun
  fillRect(rgba, px + 4, py + 18, 3, 8, BLUE);   // legs
  fillRect(rgba, px + 8, py + 18, 3, 8, BLUE);

  // muzzle flash on even frames
  if ((f % 3) !== 1) {
    fillRect(rgba, px + 20, py + 7, 5, 5, GLOW);
    fillRect(rgba, px + 24, py + 8, 6, 3, ORANGE_H);
  }

  // health pips
  for (let i = 0; i < 5; i++) fillRect(rgba, 14 + i * 5, 14, 3, 3, ORANGE);

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = SS * SS;
      for (let sy2 = 0; sy2 < SS; sy2++) {
        for (let sx2 = 0; sx2 < SS; sx2++) {
          const o = (((y * SS + sy2) * RW) + (x * SS + sx2)) * 4;
          r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
        }
      }
      if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
      idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
    }
  }
  return idx;
}

export function underrunIcon() {
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

const GLYPHS = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

function drawText(putp, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (gph[row] & (1 << (4 - col))) {
          for (let dy = 0; dy < s; dy++) {
            for (let dx = 0; dx < s; dx++) putp(cx + col * s + dx, y + row * s + dy, r, g, b);
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
  const putp = (x, y, r, g, b, a) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const fog = Math.max(0, Math.min(1, y / H));
      putp(x, y, 8 + fog * 10, 4 + fog * 4, 2);
    }
  }

  const vpX = W / 2, vpY = 90;
  for (let y = vpY; y < H; y++) {
    const depth = (y - vpY) / (H - vpY);
    const half = 40 + depth * 520;
    const left = vpX - half, right = vpX + half;
    for (let x = 0; x < W; x++) {
      if (x > left && x < right) {
        const u = (x - left) / (right - left);
        const tile = ((Math.floor(u * 12) + Math.floor(depth * 16)) & 1);
        const shade = tile ? 48 : 32;
        const glow = depth * 18;
        putp(x, y, shade + glow, 28 + glow * 0.6, 12);
      } else if (x > left - 70 && x <= left) {
        const w = (x - (left - 70)) / 70;
        putp(x, y, 28 + w * 18, 16 + w * 8, 8);
      } else if (x >= right && x < right + 70) {
        const w = 1 - (x - right) / 70;
        putp(x, y, 28 + w * 18, 16 + w * 8, 8);
      }
    }
  }

  // soldier
  const sx = 560, sy = 470;
  for (let y = 0; y < 28; y++) for (let x = 0; x < 36; x++) putp(sx + 12 + x, sy + y, 70, 110, 170);
  for (let y = 0; y < 70; y++) for (let x = 0; x < 50; x++) putp(sx + 6 + x, sy + 28 + y, 48, 72, 120);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 54; x++) putp(sx + 50 + x, sy + 48 + y, 48, 72, 120);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 16; x++) putp(sx + 14 + x, sy + 98 + y, 48, 72, 120);
  for (let y = 0; y < 48; y++) for (let x = 0; x < 16; x++) putp(sx + 36 + x, sy + 98 + y, 48, 72, 120);
  // muzzle
  for (let y = 0; y < 22; y++) for (let x = 0; x < 28; x++) putp(sx + 104 + x, sy + 42 + y, 255, 120, 32);

  // extra soldier further back
  const s2x = 360, s2y = 360;
  for (let y = 0; y < 18; y++) for (let x = 0; x < 24; x++) putp(s2x + 8 + x, s2y + y, 90, 140, 90);
  for (let y = 0; y < 44; y++) for (let x = 0; x < 32; x++) putp(s2x + 4 + x, s2y + 18 + y, 40, 90, 50);

  // spiders
  function spider(cx, cy, sc) {
    for (let y = 0; y < 10 * sc; y++) for (let x = 0; x < 16 * sc; x++) putp(cx + x, cy + y, 18, 12, 10);
    for (let y = 0; y < 4 * sc; y++) for (let x = 0; x < 3 * sc; x++) {
      putp(cx + 3 * sc + x, cy + 3 * sc + y, 220, 40, 16);
      putp(cx + 10 * sc + x, cy + 3 * sc + y, 220, 40, 16);
    }
  }
  spider(620, 220, 3);
  spider(780, 280, 2);
  spider(500, 250, 2);

  // health pips
  for (let i = 0; i < 4; i++) {
    for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) putp(36 + i * 22 + x, 28 + y, 238, 153, 0);
  }

  drawText(putp, 36, 56, 'UNDERRUN', 5, 238, 153, 0);
  drawText(putp, 36, 100, 'CLICK TO INITIATE', 3, 204, 136, 0);

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
