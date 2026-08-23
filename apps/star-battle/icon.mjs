// Star Battle icon + cover.
// Icon: a yellow chick-saucer firing a blue shot that hits a red one — the
// loop is the shot, not a wiggle. Cover composites the real vendor sprites
// mid-wave with extra ships, so the card looks like the game.
// Pure Node — deterministic so builds reproduce.
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const here = dirname(fileURLToPath(import.meta.url));

const CARD_A = [14, 16, 24];
const CARD_B = [6, 8, 14];
const YEL = [242, 196, 58];
const YEL_D = [196, 140, 28];
const RED = [196, 64, 48];
const RED_D = [140, 36, 28];
const DOME = [210, 226, 236];
const GOLD = [255, 220, 90];
const WHITE = [246, 248, 252];
const INK = [28, 22, 18];
const ORANGE = [236, 140, 48];
const BLUE = [80, 150, 255];
const BLUE_L = [180, 214, 255];
const CYAN = [72, 196, 210];
const GREEN = [72, 176, 96];
const ROCK = [168, 112, 64];
const FLASH = [255, 240, 180];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, YEL, YEL_D, RED, RED_D, DOME, GOLD, WHITE, INK, ORANGE, BLUE, BLUE_L, CYAN, GREEN, ROCK, FLASH]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.4).map(Math.round));
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

function blitChick(col, x, y, cx, cy, body, dark, scale, hit) {
  const dx = x - cx, dy = y - cy;
  const rx = 18 * scale, ry = 8 * scale;
  const hull = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
  let drew = false;
  if (hull < 1 && dy > -ry * 0.35) {
    col = mix(dark, body, 0.4 + (dx + rx) / (rx * 3));
    const footL = Math.hypot(dx + rx * 0.55, dy - ry * 0.45);
    const footR = Math.hypot(dx - rx * 0.55, dy - ry * 0.45);
    if (footL < 2.4 * scale || footR < 2.4 * scale) col = ORANGE;
    drew = true;
  }
  const drx = 8.5 * scale, dry = 7 * scale;
  const dome = (dx * dx) / (drx * drx) + ((dy + 3.2 * scale) * (dy + 3.2 * scale)) / (dry * dry);
  if (dome < 1 && dy < 2.5 * scale) { col = mix(col, DOME, 0.92); drew = true; }
  const hx = cx, hy = cy - 1.2 * scale;
  const hd = Math.hypot(x - hx, y - hy);
  if (hd < 6.2 * scale) {
    col = mix(dark, body, 0.55 + (x - (hx - 6 * scale)) / (18 * scale));
    drew = true;
  }
  const eyeL = Math.hypot(x - (hx - 2.1 * scale), y - (hy - 0.6 * scale));
  const eyeR = Math.hypot(x - (hx + 2.1 * scale), y - (hy - 0.6 * scale));
  if (eyeL < 1.15 * scale || eyeR < 1.15 * scale) col = INK;
  if (hit && drew) col = mix(col, FLASH, 0.65);
  return col;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const bob = Math.sin(t * Math.PI * 2) * 2.0;
  const shotT = (f % FRAMES) / (FRAMES - 1);
  const shotX = 48 + shotT * 46;
  const hit = f >= 9;

  const stars = [];
  for (let i = 0; i < 28; i++) {
    const sx = 12 + ((i * 47) % 104);
    const sy = 14 + ((i * 73) % 100);
    stars.push({ x: sx, y: sy, r: 0.6 + (i % 3) * 0.35 });
  }

  const meX = 36, meY = 74 + bob;
  const palX = 30, palY = 40 + bob * 0.5;
  const foeX = 96, foeY = 50 - bob * 0.7;

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 20)) continue;
      let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      for (const s of stars) {
        const dd = Math.hypot(x - s.x, y - s.y);
        if (dd < s.r + 0.4) col = mix(col, WHITE, Math.max(0, 1 - dd / (s.r + 0.4)) * 0.8);
      }
      col = blitChick(col, x, y, palX, palY, CYAN, mix(CYAN, [0, 0, 0], 0.3), 0.72, false);
      col = blitChick(col, x, y, foeX, foeY, RED, RED_D, 0.95, hit);
      col = blitChick(col, x, y, meX, meY, YEL, YEL_D, 1.05, false);

      // muzzle flash on the first frames
      if (f <= 2) {
        const mx = meX + 19, my = meY - 0.5;
        const md = Math.hypot(x - mx, y - my);
        if (md < 4.2 - f * 0.6) col = mix(col, BLUE_L, 0.95);
      }
      // blue plasma shot traveling toward the red ship — must read at 64px
      if (!hit) {
        const sdx = x - shotX, sdy = y - (meY - 1);
        const shot = (sdx * sdx) / (9 * 9) + (sdy * sdy) / (3.2 * 3.2);
        if (shot < 1 && sdx > -3) col = mix(BLUE, BLUE_L, 0.35 + (sdx + 9) / 18);
      } else {
        const boom = Math.hypot(x - foeX, y - foeY);
        const r0 = 5 + (f - 9) * 2.2, r1 = r0 + 3.5;
        if (boom < r1 && boom > r0) col = mix(col, FLASH, 0.8);
      }

      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = SS * SS;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx2 = 0; sx2 < SS; sx2++) {
          const o = (((y * SS + sy) * RW) + (x * SS + sx2)) * 4;
          r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
        }
      }
      if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
      idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
    }
  }
  return idx;
}

export function starBattleIcon() {
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

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodePng(buf) {
  if (buf[0] !== 0x89) throw new Error('not a png');
  let i = 8, w = 0, h = 0, depth = 8, ctype = 6;
  const idats = [];
  let pal = null, trns = null;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i);
    const typ = buf.toString('ascii', i + 4, i + 8);
    const chunk = buf.subarray(i + 8, i + 8 + len);
    i += 12 + len;
    if (typ === 'IHDR') {
      w = chunk.readUInt32BE(0); h = chunk.readUInt32BE(4);
      depth = chunk[8]; ctype = chunk[9];
      if (chunk[12] !== 0) throw new Error('interlaced png');
    } else if (typ === 'PLTE') {
      pal = [];
      for (let k = 0; k < chunk.length; k += 3) pal.push([chunk[k], chunk[k + 1], chunk[k + 2], 255]);
    } else if (typ === 'tRNS') {
      trns = Buffer.from(chunk);
    } else if (typ === 'IDAT') idats.push(chunk);
    else if (typ === 'IEND') break;
  }
  if (pal && trns) {
    for (let k = 0; k < trns.length && k < pal.length; k++) pal[k][3] = trns[k];
  }
  const samples = ctype === 0 ? 1 : ctype === 2 ? 3 : ctype === 3 ? 1 : ctype === 4 ? 2 : 4;
  const bitsPerPix = depth * samples;
  const bpp = Math.max(1, (bitsPerPix / 8) | 0);
  const rowBytes = Math.ceil(w * bitsPerPix / 8);
  const raw = inflateSync(Buffer.concat(idats));
  const rows = [];
  let src = 0;
  let prev = Buffer.alloc(rowBytes);
  for (let y = 0; y < h; y++) {
    const filt = raw[src++];
    const row = Buffer.alloc(rowBytes);
    raw.copy(row, 0, src, src + rowBytes); src += rowBytes;
    for (let x = 0; x < rowBytes; x++) {
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = row[x];
      if (filt === 1) v = (v + a) & 255;
      else if (filt === 2) v = (v + b) & 255;
      else if (filt === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filt === 4) v = (v + paeth(a, b, c)) & 255;
      else if (filt !== 0) throw new Error('bad filter ' + filt);
      row[x] = v;
    }
    rows.push(row);
    prev = row;
  }
  function unpack(row, x) {
    if (depth === 8) return row[x];
    const ppb = 8 / depth;
    const byte = row[(x / ppb) | 0];
    const shift = 8 - depth - (x % ppb) * depth;
    return (byte >> shift) & ((1 << depth) - 1);
  }
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (ctype === 2 && depth === 8) {
        const s = x * 3;
        out[o] = row[s]; out[o + 1] = row[s + 1]; out[o + 2] = row[s + 2]; out[o + 3] = 255;
      } else if (ctype === 6 && depth === 8) {
        const s = x * 4;
        out[o] = row[s]; out[o + 1] = row[s + 1]; out[o + 2] = row[s + 2]; out[o + 3] = row[s + 3];
      } else if (ctype === 3) {
        const c = pal[unpack(row, x)] || [0, 0, 0, 0];
        out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = c[3];
      } else if (ctype === 0) {
        const g = unpack(row, x);
        out[o] = g; out[o + 1] = g; out[o + 2] = g; out[o + 3] = 255;
      } else {
        throw new Error('unsupported png ctype=' + ctype + ' depth=' + depth);
      }
    }
  }
  return { w, h, p: out };
}

function loadAsset(rel) {
  return decodePng(readFileSync(join(here, 'vendor', rel)));
}

function sheetFrame(src, fi, cols) {
  const fw = Math.floor(src.w / cols), fh = src.h;
  const sx0 = (fi % cols) * fw;
  const p = Buffer.alloc(fw * fh * 4);
  for (let y = 0; y < fh; y++) {
    src.p.copy(p, y * fw * 4, ((y * src.w) + sx0) * 4, ((y * src.w) + sx0 + fw) * 4);
  }
  return { w: fw, h: fh, p };
}

function blit(dst, dw, dh, src, dx, dy, scale, opt) {
  opt = opt || {};
  const sw = Math.max(1, Math.round(src.w * scale));
  const sh = Math.max(1, Math.round(src.h * scale));
  const aMul = opt.a == null ? 1 : opt.a;
  const hue = opt.hue || 0;
  for (let y = 0; y < sh; y++) {
    const sy = Math.min(src.h - 1, (y / scale) | 0);
    for (let x = 0; x < sw; x++) {
      const sx = Math.min(src.w - 1, (x / scale) | 0);
      const o = (sy * src.w + sx) * 4;
      let r = src.p[o], g = src.p[o + 1], b = src.p[o + 2];
      const a = src.p[o + 3] * aMul;
      if (a < 8) continue;
      if (hue) {
        const c = hueRotate(r, g, b, hue);
        r = c[0]; g = c[1]; b = c[2];
      }
      const px = (dx + x) | 0, py = (dy + y) | 0;
      if (px < 0 || py < 0 || px >= dw || py >= dh) continue;
      const d = (py * dw + px) * 4;
      const aa = a / 255;
      dst[d] = Math.round(r * aa + dst[d] * (1 - aa));
      dst[d + 1] = Math.round(g * aa + dst[d + 1] * (1 - aa));
      dst[d + 2] = Math.round(b * aa + dst[d + 2] * (1 - aa));
      dst[d + 3] = 255;
    }
  }
}

function hueRotate(r, g, b, deg) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const wr = 0.213, wg = 0.715, wb = 0.072;
  const m = [
    wr + c * (1 - wr) + s * (-wr), wg + c * (-wg) + s * (-wg), wb + c * (-wb) + s * (1 - wb),
    wr + c * (-wr) + s * 0.143, wg + c * (1 - wg) + s * 0.140, wb + c * (-wb) + s * (-0.283),
    wr + c * (-wr) + s * (-(1 - wr)), wg + c * (-wg) + s * wg, wb + c * (1 - wb) + s * wb,
  ];
  return [
    Math.max(0, Math.min(255, m[0] * r + m[1] * g + m[2] * b)),
    Math.max(0, Math.min(255, m[3] * r + m[4] * g + m[5] * b)),
    Math.max(0, Math.min(255, m[6] * r + m[7] * g + m[8] * b)),
  ].map(Math.round);
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
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (gph[row] & (1 << (4 - col))) {
          for (let dy = 0; dy < s; dy++) {
            for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
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
  const put = (x, y, r, g, b, a) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) put(x, y, 10, 12, 18);
  }
  for (let i = 0; i < 220; i++) {
    const sx = (i * 97 + 13) % W;
    const sy = (i * 53 + 29) % H;
    const b = 170 + (i % 70);
    put(sx, sy, b, b, b + 12);
    if (i % 6 === 0) {
      put(sx + 1, sy, b, b, b);
      put(sx, sy + 1, b, b, b);
    }
  }

  const player = loadAsset('img/plane/player.png');
  const enemy = loadAsset('img/plane/enemy.png');
  const friend = loadAsset('img/plane/friend.png');
  const rock = loadAsset('img/meteorites/meteorites_1.png');
  const fuel = loadAsset('img/fuel2.png');
  const pBullet = loadAsset('img/playerBullet.png');
  const eBullet = loadAsset('img/enemyBullet.png');
  const you = sheetFrame(player, 1, 4);
  const pal = sheetFrame(player, 2, 4);
  const pal2 = sheetFrame(player, 0, 4);
  const foe = sheetFrame(enemy, 1, 4);
  const foe2 = sheetFrame(enemy, 2, 4);
  const buddy = sheetFrame(friend, 1, 4);

  const S = 1.55;
  blit(rgba, W, H, pal2, 40, 470, S, { hue: 140 });
  blit(rgba, W, H, pal, 90, 140, S, { hue: 180 });
  blit(rgba, W, H, you, 70, 300, S);

  blit(rgba, W, H, foe, 620, 90, S);
  blit(rgba, W, H, foe2, 780, 230, S);
  blit(rgba, W, H, foe, 700, 430, S);
  blit(rgba, W, H, foe2, 940, 140, 1.35);
  blit(rgba, W, H, foe, 880, 520, 1.4);
  blit(rgba, W, H, foe2, 1080, 250, 1.25);
  blit(rgba, W, H, rock, 560, 280, 1.7);
  blit(rgba, W, H, rock, 1020, 360, 1.45);
  blit(rgba, W, H, buddy, 980, 60, 1.25);
  blit(rgba, W, H, fuel, 430, 180, 1.3);

  const bS = 0.7;
  blit(rgba, W, H, pBullet, 210, 338, bS);
  blit(rgba, W, H, pBullet, 310, 332, bS);
  blit(rgba, W, H, pBullet, 410, 326, bS);
  blit(rgba, W, H, pBullet, 230, 178, bS, { hue: 180 });
  blit(rgba, W, H, pBullet, 340, 172, bS, { hue: 180 });
  blit(rgba, W, H, pBullet, 180, 508, bS, { hue: 140 });
  blit(rgba, W, H, eBullet, 540, 250, 0.55);
  blit(rgba, W, H, eBullet, 640, 470, 0.55);

  // HUD — mid-wave, extra ships in the room
  for (let y = 18; y < 70; y++) {
    for (let x = 24; x < 430; x++) {
      const o = (y * W + x) * 4;
      rgba[o] = Math.round(rgba[o] * 0.4);
      rgba[o + 1] = Math.round(rgba[o + 1] * 0.4);
      rgba[o + 2] = Math.round(rgba[o + 2] * 0.4);
    }
  }
  drawText(put, 40, 30, '3 SHIPS', 4, 255, 220, 90);
  drawText(put, 280, 30, '85', 4, 236, 240, 246);

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
