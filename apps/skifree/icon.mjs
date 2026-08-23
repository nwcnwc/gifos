// SkiFree icon + cover. Icon is two skiers racing through trees (the loop
// has to read at 64px). Cover composites the real vendor sprites mid-run.
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 10;
const here = dirname(fileURLToPath(import.meta.url));

const SKY_A = [186, 220, 242];
const SKY_B = [244, 247, 251];
const SNOW = [252, 253, 255];
const SNOW_D = [214, 226, 236];
const INK = [22, 50, 74];
const LEAD = [180, 32, 58];
const WHITE = [255, 255, 255];

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
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (ctype === 6 && depth === 8) {
        const s = x * 4;
        out[o] = row[s]; out[o + 1] = row[s + 1]; out[o + 2] = row[s + 2]; out[o + 3] = row[s + 3];
      } else if (ctype === 2 && depth === 8) {
        const s = x * 3;
        out[o] = row[s]; out[o + 1] = row[s + 1]; out[o + 2] = row[s + 2]; out[o + 3] = 255;
      } else {
        throw new Error('unsupported png ctype=' + ctype);
      }
    }
  }
  return { w, h, p: out };
}
function crop(src, sx, sy, sw, sh) {
  const p = Buffer.alloc(sw * sh * 4);
  for (let y = 0; y < sh; y++) {
    const yy = sy + y;
    if (yy < 0 || yy >= src.h) continue;
    src.p.copy(p, y * sw * 4, (yy * src.w + sx) * 4, (yy * src.w + sx + sw) * 4);
  }
  return { w: sw, h: sh, p };
}
function blit(dst, dw, dh, src, dx, dy, scale, opt) {
  opt = opt || {};
  const sw = Math.max(1, Math.round(src.w * scale));
  const sh = Math.max(1, Math.round(src.h * scale));
  const aMul = opt.a == null ? 1 : opt.a;
  for (let y = 0; y < sh; y++) {
    const sy = Math.min(src.h - 1, (y / scale) | 0);
    for (let x = 0; x < sw; x++) {
      const sx = Math.min(src.w - 1, (x / scale) | 0);
      const o = (sy * src.w + sx) * 4;
      let r = src.p[o], g = src.p[o + 1], b = src.p[o + 2];
      const a = src.p[o + 3] * aMul;
      if (a < 8) continue;
      const px = (dx + x) | 0, py = (dy + y) | 0;
      if (px < 0 || py < 0 || px >= dw || py >= dh) continue;
      if (opt.ghost) {
        const t = 0.55;
        r = Math.round(r * (1 - t) + 80 * t);
        g = Math.round(g * (1 - t) + 190 * t);
        b = Math.round(b * (1 - t) + 230 * t);
      }
      const d = (py * dw + px) * 4;
      const aa = a / 255;
      dst[d] = Math.round(r * aa + dst[d] * (1 - aa));
      dst[d + 1] = Math.round(g * aa + dst[d + 1] * (1 - aa));
      dst[d + 2] = Math.round(b * aa + dst[d + 2] * (1 - aa));
      dst[d + 3] = 255;
    }
  }
}

const chars = decodePng(readFileSync(join(here, 'vendor', 'sprite-characters.png')));
const objs = decodePng(readFileSync(join(here, 'vendor', 'skifree-objects.png')));

const PART = {
  east: [0, 0, 24, 34],
  esEast: [24, 0, 24, 34],
  sEast: [49, 0, 17, 34],
  south: [65, 0, 17, 34],
  sWest: [49, 37, 17, 34],
  wsWest: [24, 37, 24, 34],
  west: [0, 37, 24, 34],
  jumping: [84, 0, 32, 34],
};
function skier(part) {
  const p = PART[part] || PART.south;
  return crop(chars, p[0], p[1], p[2], p[3]);
}
const smallTree = crop(objs, 0, 28, 30, 34);
const tallTree = crop(objs, 95, 66, 32, 64);
const rock = crop(objs, 30, 52, 23, 11);
const jumpRamp = crop(objs, 109, 55, 32, 8);
const startSign = crop(objs, 260, 103, 42, 27);
const yeti = crop(chars, 90, 112, 32, 43);

function buildPalette() {
  const pal = [[0, 0, 0]];
  const bases = [SKY_A, SKY_B, SNOW, SNOW_D, INK, LEAD, WHITE,
    [46, 140, 72], [28, 96, 52], [196, 40, 72], [255, 214, 170],
    [80, 190, 230], [110, 72, 42], [168, 176, 186]];
  for (const b of bases) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.28).map(Math.round));
  }
  return pal.slice(0, 64);
}
function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e9;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b, d = dr * dr + dg * dg + db * db;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

// Icon: magenta skier chasing a cyan ghost down a snow card. Trees scroll
// up past them so the loop is a race, not a wiggle.
function frameIndices(pal, f) {
  const rgba = Buffer.alloc(RW * RW * 4);
  const put = (x, y, r, g, b, a) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= RW || y >= RW) return;
    const o = (y * RW + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };
  const m = 7, rad = 20;
  const t = f / (FRAMES - 1);
  const sway = Math.sin(t * Math.PI * 2);
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    if (!inCard(x, y, m, rad)) continue;
    const gy = (y - m) / (OUT - 2 * m);
    const col = gy < 0.22 ? mix(SKY_A, SKY_B, gy / 0.22) : mix(SNOW, SNOW_D, (gy - 0.22) / 0.78);
    put(px, py, col[0], col[1], col[2]);
  }
  // Scroll trees up the card (camera follows the race).
  const scroll = (f * 11) % 90;
  const grove = [
    [18, 28], [96, 22], [24, 70], [100, 64], [40, 108], [88, 96], [62, 8],
  ];
  for (const [gx, gy] of grove) {
    const y = ((gy + scroll) % 110) + 8;
    const useTall = (gx + gy) % 2 === 0;
    blit(rgba, RW, RW, useTall ? tallTree : smallTree, gx * SS, y * SS, SS * (useTall ? 0.55 : 0.7));
  }
  const ghostPart = sway > 0.2 ? 'sEast' : sway < -0.2 ? 'sWest' : 'south';
  const mePart = f > 6 ? 'jumping' : ghostPart;
  const gx = 36 + sway * 6;
  const gy = 28 + t * 8;
  const mx = 58 + sway * 9;
  const my = 48 + t * 12;
  blit(rgba, RW, RW, skier(ghostPart), gx * SS, gy * SS, SS * 2.05, { ghost: true, a: 0.9 });
  blit(rgba, RW, RW, skier(mePart), mx * SS, my * SS, SS * 2.2);
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

export function skiFreeIcon() {
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

const GLYPHS = {
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
};
function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
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
    const gy = y / H;
    const sky = gy < 0.16 ? mix(SKY_A, SKY_B, gy / 0.16) : mix(SNOW, SNOW_D, (gy - 0.16) / 0.84);
    for (let x = 0; x < W; x++) put(x, y, sky[0], sky[1], sky[2]);
  }

  const scale = 3.2;
  // Mid-run grove: trees close and far, a clear racing lane down the middle.
  const grove = [
    [40, 140, 1], [180, 160, 0], [90, 210, 1], [210, 280, 0], [30, 360, 1],
    [140, 430, 0], [70, 540, 1], [200, 600, 0],
    [980, 150, 1], [1100, 200, 0], [1020, 250, 1], [1140, 320, 0],
    [990, 430, 0], [1110, 510, 1], [1030, 600, 0], [1160, 640, 1],
    [280, 120, 0], [860, 90, 1], [320, 500, 1], [840, 470, 0],
    [400, 640, 0], [760, 620, 1], [500, 130, 0], [700, 160, 1],
    [250, 350, 1], [900, 340, 0],
  ];
  for (const [x, y, tall] of grove) {
    blit(rgba, W, H, tall ? tallTree : smallTree, x, y, tall ? scale * 1.15 : scale);
  }
  blit(rgba, W, H, rock, 430, 300, scale);
  blit(rgba, W, H, rock, 780, 410, scale);
  blit(rgba, W, H, jumpRamp, 560, 390, scale);
  blit(rgba, W, H, yeti, 80, 300, scale * 1.2);

  // Ghost further down the mountain (lower on the frame). Player chasing.
  blit(rgba, W, H, skier('sEast'), 500, 210, scale * 1.7, { ghost: true, a: 0.95 });
  blit(rgba, W, H, skier('south'), 640, 390, scale * 1.85);

  // Race HUD — two pills, away from the action.
  function pill(x, y, w, h) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      put(xx, yy, 255, 255, 255);
    }
  }
  pill(48, 36, 300, 64);
  pill(852, 36, 300, 64);
  drawText(put, 68, 52, 'YOU  842M', 5, 22, 50, 74);
  drawText(put, 872, 52, 'SAM  901M', 5, 180, 32, 58);

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
