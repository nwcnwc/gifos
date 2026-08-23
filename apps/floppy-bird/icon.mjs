// Floppy Bird icon + cover. Icon is a yellow bird tapping through a pipe
// (the loop has to read at 64px). Cover composites the real vendor sprites
// mid-flight, with a race score, so the card looks like the game.
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 8;
const here = dirname(fileURLToPath(import.meta.url));

const SKY_A = [110, 206, 214];
const SKY_B = [78, 192, 202];
const SKY_FILL = [78, 192, 202];
const LAND = [222, 216, 149];
const LAND_D = [180, 168, 96];
const GRASS = [116, 191, 46];
const PIPE = [115, 191, 46];
const PIPE_D = [73, 128, 22];
const PIPE_L = [174, 224, 90];
const BIRD = [250, 224, 72];
const BIRD_D = [220, 168, 32];
const BEAK = [232, 124, 36];
const WHITE = [250, 250, 246];
const INK = [36, 28, 20];
const RED = [228, 64, 48];
const CLOUD = [248, 252, 240];

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
  for (const b of [SKY_A, SKY_B, SKY_FILL, LAND, LAND_D, GRASS, PIPE, PIPE_D, PIPE_L, BIRD, BIRD_D, BEAK, WHITE, INK, RED, CLOUD]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
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

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const flap = (f % 2) === 0;
  const bob = Math.sin(t * Math.PI * 2) * 4;
  // Bird stays IN the gap, tapping, drifting a little through the pipe.
  const bx = 58 + Math.sin(t * Math.PI * 2) * 6;
  const by = 60 + bob;
  const m = 7, rad = 20;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(SKY_A, SKY_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      // clouds
      const c1 = (x - 28) * (x - 28) / 140 + (y - 28) * (y - 28) / 40;
      const c2 = (x - 86) * (x - 86) / 90 + (y - 24) * (y - 24) / 28;
      if (c1 < 1 || c2 < 1) col = mix(col, CLOUD, 0.85);
      // hills
      if (y > 86 && y <= 100) {
        const hill = 92 + 4 * Math.sin(x * 0.35);
        if (y > hill) col = mix(GRASS, PIPE_D, (y - 86) / 20);
      }
      if (y > 100) col = mix(LAND, LAND_D, (y - 100) / 20);
      if (y > 100 && y < 104) col = GRASS;
      // ONE pipe, gap large enough that a 64px icon still reads the tap
      const px0 = 46, px1 = 92, gap0 = 42, gap1 = 80;
      if (x >= px0 && x <= px1 && (y < gap0 || y > gap1) && y < 102) {
        col = mix(PIPE_D, PIPE, (x - px0) / (px1 - px0));
        if (x > px0 + 4 && x < px0 + 12) col = PIPE_L;
      }
      if ((y > gap0 - 5 && y < gap0 + 1) || (y > gap1 - 1 && y < gap1 + 5)) {
        if (x > px0 - 6 && x < px1 + 6 && y < 102) col = mix(PIPE_D, PIPE, 0.45);
      }
      // bird body — large, in the gap
      const dx = x - bx, dy = y - by;
      const rx = 16, ry = 12;
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) {
        col = mix(BIRD_D, BIRD, 0.45 + 0.4 * ((x - (bx - rx)) / (2 * rx)));
      }
      const wy = by + (flap ? -7 : 4);
      const wdx = x - (bx - 3), wdy = y - wy;
      const wrx = 11, wry = flap ? 5 : 7.5;
      if ((wdx * wdx) / (wrx * wrx) + (wdy * wdy) / (wry * wry) <= 1 && x < bx + 5) {
        col = mix(BIRD, WHITE, flap ? 0.18 : 0.05);
      }
      if (x > bx + 10 && x < bx + 22 && y > by - 4 && y < by + 6) {
        const kx = x - (bx + 10), ky = y - by;
        if (ky > -3 + kx * 0.15 && ky < 3.2 - kx * 0.12) col = BEAK;
      }
      const ex = bx + 6, ey = by - 2.5;
      if ((x - ex) * (x - ex) + (y - ey) * (y - ey) <= 4.2 * 4.2) col = WHITE;
      if ((x - (ex + 1.4)) * (x - (ex + 1.4)) + (y - ey) * (y - ey) <= 1.7 * 1.7) col = INK;
      if ((x - (bx - 8)) * (x - (bx - 8)) + (y - (by - 10)) * (y - (by - 10)) <= 3.6 * 3.6) col = RED;
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
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 8, transparentIndex: 0 };
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
  let rgbKey = null;
  if (ctype === 2 && trns && trns.length >= 6) {
    rgbKey = [(trns[0] << 8) | trns[1], (trns[2] << 8) | trns[3], (trns[4] << 8) | trns[5]];
  }
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (ctype === 2 && depth === 8) {
        const s = x * 3, r = row[s], g = row[s + 1], b = row[s + 2];
        let a = 255;
        if (rgbKey) {
          const R = rgbKey[0] >> 8, G = rgbKey[1] >> 8, B = rgbKey[2] >> 8;
          if (r === R && g === G && b === B) a = 0;
        }
        out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
      } else if (ctype === 6 && depth === 8) {
        const s = x * 4;
        out[o] = row[s]; out[o + 1] = row[s + 1]; out[o + 2] = row[s + 2]; out[o + 3] = row[s + 3];
      } else if (ctype === 3) {
        const c = pal[unpack(row, x)] || [0, 0, 0, 0];
        out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = c[3];
      } else if (ctype === 0) {
        const v = unpack(row, x);
        const g = depth === 8 ? v : v * (255 / ((1 << depth) - 1));
        out[o] = g; out[o + 1] = g; out[o + 2] = g; out[o + 3] = 255;
      } else {
        throw new Error('unsupported png ctype=' + ctype + ' depth=' + depth);
      }
    }
  }
  return { w, h, p: out };
}

function loadAsset(name) {
  return decodePng(readFileSync(join(here, 'vendor', 'assets', name)));
}

function birdFrame(src, fi) {
  const fw = src.w, fh = 24, sy = (fi % 4) * fh;
  const p = Buffer.alloc(fw * fh * 4);
  for (let y = 0; y < fh; y++) src.p.copy(p, y * fw * 4, ((sy + y) * src.w) * 4, ((sy + y) * src.w + fw) * 4);
  return { w: fw, h: fh, p };
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
      if (opt.dropBlack && r + g + b < 110) continue;
      const a = src.p[o + 3] * aMul;
      if (a < 8) continue;
      const px = (dx + x) | 0, py = (dy + y) | 0;
      if (px < 0 || py < 0 || px >= dw || py >= dh) continue;
      if (opt.ghost) {
        // Same bird, cyan — a ghost, not a muddy duck.
        const t = 0.55;
        r = Math.round(r * (1 - t) + 72 * t);
        g = Math.round(g * (1 - t) + 216 * t);
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

function tileX(dst, dw, dh, src, y, scale) {
  const sw = Math.round(src.w * scale);
  const sh = Math.round(src.h * scale);
  for (let x = 0; x < dw; x += sw) blit(dst, dw, dh, src, x, y, scale);
  return sh;
}

function paintPipe(dst, dw, dh, body, capDown, capUp, x, gapTop, gapBot, landY, scale) {
  const w = Math.round(body.w * scale);
  const capH = Math.round(capDown.h * scale);
  const bodySrc = body;
  for (let y = 0; y < gapTop - capH; y++) {
    const slice = { w: bodySrc.w, h: 1, p: bodySrc.p };
    blit(dst, dw, dh, slice, x, y, scale);
  }
  blit(dst, dw, dh, capDown, x, gapTop - capH, scale);
  blit(dst, dw, dh, capUp, x, gapBot, scale);
  for (let y = gapBot + capH; y < landY; y++) {
    const slice = { w: bodySrc.w, h: 1, p: bodySrc.p };
    blit(dst, dw, dh, slice, x, y, scale);
  }
  void w;
}

const GLYPHS = {
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};
function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch] || GLYPHS[' '];
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (gph[row] & (1 << (4 - col))) {
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
      }
    }
    cx += 6 * s;
  }
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

  const sky = loadAsset('sky.png');
  const land = loadAsset('land.png');
  const ceiling = loadAsset('ceiling.png');
  const body = loadAsset('pipe.png');
  const capDown = loadAsset('pipe-down.png');
  const capUp = loadAsset('pipe-up.png');
  const bird = loadAsset('bird.png');
  const font4 = loadAsset('font_big_4.png');
  const font6 = loadAsset('font_big_6.png');

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, SKY_FILL[0], SKY_FILL[1], SKY_FILL[2]);

  const landY = 560;
  const skyScale = 3;
  const skyH = Math.round(sky.h * skyScale);
  tileX(rgba, W, H, sky, landY - skyH, skyScale);
  tileX(rgba, W, H, land, landY, 2);
  tileX(rgba, W, H, ceiling, 0, 3);

  const pScale = 4;
  paintPipe(rgba, W, H, body, capDown, capUp, 360, 150, 440, landY, pScale);
  paintPipe(rgba, W, H, body, capDown, capUp, 820, 130, 360, landY, pScale);

  const you = birdFrame(bird, 1);
  const them = birdFrame(bird, 2);
  // Mid-flight THROUGH the first pipe gap; ghost is a little ahead.
  blit(rgba, W, H, you, 400, 236, 5);
  blit(rgba, W, H, them, 680, 200, 5, { ghost: true, a: 0.9 });

  blit(rgba, W, H, font4, 72, 64, 2, { dropBlack: true });

  // Race score — the reason this copy exists.
  for (let y = 620; y < 688; y++) for (let x = 48; x < 560; x++) {
    const o = (y * W + x) * 4;
    rgba[o] = Math.round(rgba[o] * 0.35);
    rgba[o + 1] = Math.round(rgba[o + 1] * 0.35);
    rgba[o + 2] = Math.round(rgba[o + 2] * 0.35);
  }
  drawText(put, 70, 636, 'YOU', 5, 255, 229, 106);
  drawText(put, 280, 636, 'SAM', 5, 160, 230, 235);
  blit(rgba, W, H, font4, 168, 628, 1.4, { dropBlack: true });
  blit(rgba, W, H, font6, 378, 628, 1.4, { dropBlack: true });

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
