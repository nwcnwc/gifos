// Chrome Dino icon + cover, painted from the real Chromium sprite sheet.
// Icon: the dino running (the loop has to read at 64px). Cover: mid-jump
// over a cactus, a ghost dino in the race, HI score showing — never the
// start screen. Pure Node, super-sample → downsample → small palette.
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 8;
const here = dirname(fileURLToPath(import.meta.url));

const DINO = [83, 83, 83];
const DINO_D = [36, 36, 36];
const WHITE = [247, 247, 247];
const GROUND = [83, 83, 83];
const CARD_A = [247, 247, 247];
const CARD_B = [232, 232, 232];
const SKY = [247, 247, 247];
const INK = [20, 20, 20];

const SPRITE = {
  CACTUS_LARGE: { x: 332, y: 2, w: 25, h: 50 },
  CACTUS_SMALL: { x: 228, y: 2, w: 17, h: 35 },
  CLOUD: { x: 86, y: 2, w: 46, h: 14 },
  HORIZON: { x: 2, y: 54, w: 600, h: 12 },
  PTERODACTYL: { x: 134, y: 2, w: 46, h: 40 },
  TEXT: { x: 655, y: 2, w: 10, h: 13 },
  TREX: { x: 848, y: 2, w: 44, h: 47 },
};
const RUN = [88, 132];
const JUMP = 0;

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
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

function readPngGray(buf) {
  if (buf[0] !== 0x89) throw new Error('not png');
  let p = 8, w, h, bitDepth, colorType;
  const idats = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p); p += 4;
    const type = buf.toString('ascii', p, p + 4); p += 4;
    const data = buf.subarray(p, p + len); p += len + 4;
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idats.push(data);
    else if (type === 'IEND') break;
  }
  if (colorType !== 0 || bitDepth !== 8) throw new Error('expected 8-bit gray sprite');
  const raw = inflateSync(Buffer.concat(idats));
  const pixels = new Uint8Array(w * h);
  let off = 0;
  const prev = new Uint8Array(w);
  const paeth = (a, b, c) => {
    const v = a + b - c, pa = Math.abs(v - a), pb = Math.abs(v - b), pc = Math.abs(v - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < h; y++) {
    const f = raw[off++];
    const row = new Uint8Array(w);
    for (let x = 0; x < w; x++) {
      const v = raw[off++];
      const a = x ? row[x - 1] : 0, b = prev[x], c = x ? prev[x - 1] : 0;
      row[x] = f === 0 ? v
        : f === 1 ? (v + a) & 255
        : f === 2 ? (v + b) & 255
        : f === 3 ? (v + ((a + b) >> 1)) & 255
        : (v + paeth(a, b, c)) & 255;
    }
    pixels.set(row, y * w);
    prev.set(row);
  }
  return { w, h, pixels };
}

const sheet = readPngGray(readFileSync(join(here, 'vendor', 'sprites-1x.png')));

function sample(sx, sy) {
  if (sx < 0 || sy < 0 || sx >= sheet.w || sy >= sheet.h) return 0;
  return sheet.pixels[sy * sheet.w + sx];
}

function colorOf(v, tint) {
  if (v === 0) return null;
  let r, g, b;
  if (v === 83) { r = 83; g = 83; b = 83; }
  else if (v >= 240) { r = 247; g = 247; b = 247; }
  else { r = v; g = v; b = v; }
  if (tint) {
    r = Math.round(r * (0.45 + tint[0] / 255 * 0.55));
    g = Math.round(g * (0.45 + tint[1] / 255 * 0.55));
    b = Math.round(b * (0.45 + tint[2] / 255 * 0.55));
  }
  return [r, g, b];
}

function blit(put, sx, sy, tw, th, dx, dy, scale, tint, alpha) {
  const a = alpha == null ? 1 : alpha;
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const col = colorOf(sample(sx + x, sy + y), tint);
      if (!col) continue;
      for (let yy = 0; yy < scale; yy++) {
        for (let xx = 0; xx < scale; xx++) {
          put(dx + x * scale + xx, dy + y * scale + yy, col[0], col[1], col[2], a);
        }
      }
    }
  }
}

function outline(put, sx, sy, tw, th, dx, dy, scale, rgb) {
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      if (!sample(sx + x, sy + y)) continue;
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const nx = x + ox, ny = y + oy;
        const empty = nx < 0 || ny < 0 || nx >= tw || ny >= th || !sample(sx + nx, sy + ny);
        if (!empty) continue;
        for (let yy = 0; yy < scale; yy++) {
          for (let xx = 0; xx < scale; xx++) {
            put(dx + nx * scale + xx, dy + ny * scale + yy, rgb[0], rgb[1], rgb[2], 1);
          }
        }
      }
    }
  }
}

function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [DINO, DINO_D, WHITE, GROUND, CARD_A, CARD_B, INK, [80, 140, 200], [200, 90, 70]]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
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

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const put = (x, y, r, g, b, a) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= RW || y >= RW) return;
    const o = (y * RW + x) * 4;
    const aa = a == null ? 1 : a;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = aa;
  };
  const frame = RUN[f % 2];
  const hop = (f % 4 === 1 || f % 4 === 2) ? 4 : 0;
  const scale = 2 * SS;
  const groundY = 108;
  const dinoX = 16 * SS, dinoY = (groundY - SPRITE.TREX.h * 2 - hop) * SS;
  const tx = SPRITE.TREX.x + frame, ty = SPRITE.TREX.y;
  const cactus = SPRITE.CACTUS_SMALL;
  const cScale = Math.round(1.6 * SS);
  const cx = 86 * SS, cy = (groundY - Math.round(cactus.h * 1.6)) * SS;

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 20)) continue;
      const col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      put(px, py, col[0], col[1], col[2], 1);
    }
  }
  // Ground line the dino is running on.
  for (let x = 14 * SS; x < 114 * SS; x++) {
    for (let t = 0; t < SS; t++) put(x, groundY * SS + t, GROUND[0], GROUND[1], GROUND[2], 1);
  }
  outline(put, cactus.x, cactus.y, cactus.w, cactus.h, cx, cy, cScale, DINO_D);
  blit(put, cactus.x, cactus.y, cactus.w, cactus.h, cx, cy, cScale);
  outline(put, tx, ty, SPRITE.TREX.w, SPRITE.TREX.h, dinoX, dinoY, scale, DINO_D);
  blit(put, tx, ty, SPRITE.TREX.w, SPRITE.TREX.h, dinoX, dinoY, scale);

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

export function chromeDinoIcon() {
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
    minCodeSize: 6, frames, delayCs: 8, transparentIndex: 0
  };
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
    const srcA = a == null ? 1 : a;
    if (srcA >= 0.995) {
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
      return;
    }
    const dstA = rgba[o + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA <= 0) return;
    rgba[o] = Math.round((r * srcA + rgba[o] * dstA * (1 - srcA)) / outA);
    rgba[o + 1] = Math.round((g * srcA + rgba[o + 1] * dstA * (1 - srcA)) / outA);
    rgba[o + 2] = Math.round((b * srcA + rgba[o + 2] * dstA * (1 - srcA)) / outA);
    rgba[o + 3] = Math.round(outA * 255);
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) put(x, y, SKY[0], SKY[1], SKY[2]);
  }

  const ground = 548;
  const S = 5;
  // Horizon, tiled.
  for (let x = 0; x < W; x += SPRITE.HORIZON.w * S) {
    blit(put, SPRITE.HORIZON.x, SPRITE.HORIZON.y, SPRITE.HORIZON.w, SPRITE.HORIZON.h,
      x, ground, S);
  }

  blit(put, SPRITE.CLOUD.x, SPRITE.CLOUD.y, SPRITE.CLOUD.w, SPRITE.CLOUD.h, 80, 90, 4);
  blit(put, SPRITE.CLOUD.x, SPRITE.CLOUD.y, SPRITE.CLOUD.w, SPRITE.CLOUD.h, 420, 140, 3);
  blit(put, SPRITE.CLOUD.x, SPRITE.CLOUD.y, SPRITE.CLOUD.w, SPRITE.CLOUD.h, 860, 70, 4);

  const cactusL = SPRITE.CACTUS_LARGE;
  const cactusS = SPRITE.CACTUS_SMALL;
  const cactusY = ground + 12 * S - cactusL.h * S;
  blit(put, cactusL.x, cactusL.y, cactusL.w, cactusL.h, 640, cactusY, S);
  blit(put, cactusS.x, cactusS.y, cactusS.w, cactusS.h, 980, ground + 12 * S - cactusS.h * S, S);
  blit(put, cactusS.x, cactusS.y, cactusS.w, cactusS.h, 40, ground + 12 * S - cactusS.h * S, 4);

  // Pterodactyl high.
  blit(put, SPRITE.PTERODACTYL.x, SPRITE.PTERODACTYL.y, SPRITE.PTERODACTYL.w, SPRITE.PTERODACTYL.h,
    1040, 250, 4);

  // Ghost dino, running, a little behind (the race).
  const ghostY = ground + 12 * S - SPRITE.TREX.h * S;
  blit(put, SPRITE.TREX.x + RUN[1], SPRITE.TREX.y, SPRITE.TREX.w, SPRITE.TREX.h,
    160, ghostY, S, [80, 140, 200], 0.72);

  // Hero dino mid-jump over the large cactus.
  const jumpY = cactusY - 38 * S;
  blit(put, SPRITE.TREX.x + JUMP, SPRITE.TREX.y, SPRITE.TREX.w, SPRITE.TREX.h,
    545, jumpY, S);

  // Score: HI 00480   00312
  const digit = (n) => SPRITE.TEXT.x + n * SPRITE.TEXT.w;
  const drawNum = (str, x0, y0, hi) => {
    let x = x0;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === ' ') { x += 8 * 3; continue; }
      const n = ch === 'H' ? 10 : ch === 'I' ? 11 : (ch | 0);
      blit(put, digit(n), SPRITE.TEXT.y, SPRITE.TEXT.w, SPRITE.TEXT.h,
        x, y0, 3, hi ? [120, 120, 120] : null, hi ? 0.85 : 1);
      x += 11 * 3;
    }
  };
  drawNum('00312', W - 36 - 5 * 33, 28, false);
  drawNum('HI 00480', W - 36 - 5 * 33 - 56 - (2 * 33 + 24 + 5 * 33), 28, true);

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
