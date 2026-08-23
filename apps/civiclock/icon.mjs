// Procedural icon: a dark isometric city, a commuter crossing, windows lighting.
// Pure Node, super-sample → box-downsample. Deterministic. Original geometry.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 14;

const NIGHT = [8, 10, 18];
const GRASS = [28, 52, 38];
const GRASS_H = [42, 78, 54];
const ROAD = [52, 54, 66];
const ROAD_H = [90, 94, 110];
const HOME = [46, 130, 80];
const HOME_S = [28, 86, 54];
const HOME_T = [90, 186, 120];
const SHOP = [52, 104, 190];
const SHOP_S = [32, 68, 140];
const SHOP_T = [120, 170, 230];
const WORK = [190, 128, 40];
const WORK_S = [130, 84, 22];
const WORK_T = [230, 176, 70];
const WIN = [255, 214, 110];
const WATER = [28, 78, 118];
const WATER_H = [80, 160, 200];
const PLANT = [140, 148, 158];
const GOLD = [240, 186, 72];
const INK = [242, 242, 248];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  const bases = [NIGHT, GRASS, GRASS_H, ROAD, ROAD_H, HOME, HOME_S, HOME_T, SHOP, SHOP_S, SHOP_T,
    WORK, WORK_S, WORK_T, WIN, WATER, WATER_H, PLANT, GOLD, INK];
  for (const b of bases) {
    pal.push(b.map(Math.round));
    pal.push(mix(b, [255, 255, 255], 0.22).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
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

const TW = 22, TH = 11;
function iso(x, y) {
  return { sx: 64 + (x - y) * (TW / 2), sy: 38 + (x + y) * (TH / 2) };
}

function putCol(rgba, px, py, col, a) {
  if (px < 0 || py < 0 || px >= RW || py >= RW) return;
  const o = (py * RW + px) * 4;
  const aa = a == null ? 1 : a;
  if (aa >= 1) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; return; }
  if (!rgba[o + 3]) {
    rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = aa;
    return;
  }
}

function fillDiamond(rgba, sx, sy, col, inset) {
  const w = (TW / 2 - (inset || 0)) * SS, h = (TH / 2 - (inset || 0) * 0.5) * SS;
  const cx = sx * SS, cy = sy * SS;
  const minx = Math.max(0, Math.floor(cx - w)), maxx = Math.min(RW - 1, Math.ceil(cx + w));
  const miny = Math.max(0, Math.floor(cy - h)), maxy = Math.min(RW - 1, Math.ceil(cy + h));
  for (let py = miny; py <= maxy; py++) for (let px = minx; px <= maxx; px++) {
    const dx = Math.abs(px - cx) / w, dy = Math.abs(py - cy) / h;
    if (dx + dy <= 1.02) putCol(rgba, px, py, col, 1);
  }
}

function fillBox(rgba, sx, sy, hgt, top, left, right) {
  const w = (TW / 2 - 1.5) * SS, d = (TH / 2 - 1) * SS, h = hgt * SS;
  const cx = sx * SS, cy = sy * SS;
  for (let py = Math.floor(cy - h - d); py <= cy + 2; py++) {
    for (let px = Math.floor(cx - w); px <= Math.ceil(cx + w); px++) {
      const x = px - cx, y = py - cy;
      // left face: x in [-w,0], y between 0 and -h, skewed
      if (x <= 0 && x >= -w) {
        const y0 = -x * (d / w);
        const y1 = y0 - h;
        if (y <= y0 + 2 && y >= y1 - 1) {
          const onTop = y <= y1 + d * 0.55 && Math.abs(x) / w + Math.abs(y - y1) / d <= 1.15;
          if (onTop && y < y1 + 4) putCol(rgba, px, py, top, 1);
          else putCol(rgba, px, py, left, 1);
        }
      }
      if (x >= 0 && x <= w) {
        const y0 = x * (d / w) * 0.15;
        const y1 = -h + x * 0.02;
        if (y <= 2 && y >= -h - 2 && x < w * 0.98) {
          if (y < -h + 3) putCol(rgba, px, py, top, 1);
          else putCol(rgba, px, py, right, 1);
        }
      }
    }
  }
}

function windowDots(rgba, sx, sy, hgt, lit, n) {
  const col = lit ? WIN : [18, 20, 28];
  for (let i = 0; i < n; i++) {
    const wx = (sx + 3 + (i % 2) * 4) * SS;
    const wy = (sy - 5 - Math.floor(i / 2) * 4) * SS;
    if (wy < (sy - hgt) * SS) continue;
    for (let dy = 0; dy < 3 * SS / 2; dy++) for (let dx = 0; dx < 2 * SS / 2; dx++) {
      putCol(rgba, (wx + dx) | 0, (wy + dy) | 0, col, 1);
    }
  }
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  const night = Math.max(0, Math.min(1, (t - 0.15) / 0.55));
  const grass = mix(GRASS_H, mix(GRASS, NIGHT, 0.55), night);
  const water = mix(WATER_H, mix(WATER, NIGHT, 0.4), night * 0.7);

  // rounded sticker card
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    const m = 5, r = 26, lo = m, hi = OUT - m;
    if (x < lo || x > hi || y < lo || y > hi) continue;
    const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
    const ok = (x >= lo + r && x <= hi - r) || (y >= lo + r && y <= hi - r) ||
      ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r);
    if (!ok) continue;
    const sky = mix([18, 36, 58], NIGHT, night);
    putCol(rgba, px, py, mix(sky, [40, 24, 48], (1 - y / OUT) * 0.25), 1);
  }

  const tiles = [
    { x: 0, y: 2, k: 'w' }, { x: 0, y: 1, k: 'w' }, { x: 0, y: 0, k: 'w' },
    { x: 1, y: 0, k: 'g' }, { x: 2, y: 0, k: 'h', s: 2 }, { x: 3, y: 0, k: 'h', s: 3 },
    { x: 1, y: 1, k: 'r' }, { x: 2, y: 1, k: 'r' }, { x: 3, y: 1, k: 'r' },
    { x: 1, y: 2, k: 'p' }, { x: 2, y: 2, k: 's', s: 2 }, { x: 3, y: 2, k: 'k', s: 2 },
    { x: 2, y: 3, k: 'r' }, { x: 3, y: 3, k: 'g' },
  ];
  tiles.sort((a, b) => (a.x + a.y) - (b.x + b.y));
  for (const tl of tiles) {
    const p = iso(tl.x, tl.y);
    if (tl.k === 'w') fillDiamond(rgba, p.sx, p.sy, water, 0);
    else if (tl.k === 'g') fillDiamond(rgba, p.sx, p.sy, grass, 0);
    else if (tl.k === 'r') {
      fillDiamond(rgba, p.sx, p.sy, mix(ROAD, NIGHT, night * 0.25), 0);
      fillDiamond(rgba, p.sx, p.sy, mix(ROAD_H, GOLD, night * 0.15), 3);
    } else if (tl.k === 'p') {
      fillDiamond(rgba, p.sx, p.sy, mix(PLANT, NIGHT, night * 0.3), 0);
      fillBox(rgba, p.sx, p.sy, 16, mix(PLANT, [255, 255, 255], 0.2), mix(PLANT, [0, 0, 0], 0.3), PLANT);
      const puff = (t * 18) % 10;
      const pc = mix([200, 210, 220], [255, 255, 255], 0.3);
      fillDiamond(rgba, p.sx + 1, p.sy - 20 - puff, pc, 8);
    } else if (tl.k === 'h' || tl.k === 's' || tl.k === 'k') {
      const top = tl.k === 'h' ? HOME_T : tl.k === 's' ? SHOP_T : WORK_T;
      const side = tl.k === 'h' ? HOME_S : tl.k === 's' ? SHOP_S : WORK_S;
      const face = tl.k === 'h' ? HOME : tl.k === 's' ? SHOP : WORK;
      fillDiamond(rgba, p.sx, p.sy, mix(face, NIGHT, 0.4), 0);
      const hgt = 8 + tl.s * 7;
      fillBox(rgba, p.sx, p.sy, hgt, mix(top, NIGHT, night * 0.15), mix(side, NIGHT, night * 0.25), mix(face, NIGHT, night * 0.12));
      windowDots(rgba, p.sx, p.sy, hgt, night > 0.35, 2 + tl.s * 2);
    }
  }

  // commuter walks the road as night falls
  const path = [iso(1, 1), iso(2, 1), iso(3, 1), iso(3, 2)];
  const u = Math.min(0.999, t * 1.05) * (path.length - 1);
  const a = u | 0, fr = u - a;
  const A = path[a], B = path[Math.min(path.length - 1, a + 1)];
  const px = A.sx + (B.sx - A.sx) * fr;
  const py = A.sy + (B.sy - A.sy) * fr;
  const person = mix(GOLD, WIN, night);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (dx * dx + dy * dy <= 5) {
      putCol(rgba, ((px) * SS + dx * SS / 2) | 0, ((py - 3) * SS + dy * SS / 2) | 0, person, 1);
    }
  }

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0, nss = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
    }
    if (a / nss < 0.45) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / nss, g / nss, b / nss);
  }
  return idx;
}

export function civiclockIcon() {
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
function pngFromRgba(W, H, rgba) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    Buffer.from(rgba).copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
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

export function dumpIconPngs(dir) {
  const ic = civiclockIcon();
  const pal = [];
  for (let i = 0; i < ic.numColors; i++) {
    pal.push([ic.palette[i * 3], ic.palette[i * 3 + 1], ic.palette[i * 3 + 2]]);
  }
  for (let f = 0; f < ic.frames.length; f++) {
    const idx = ic.frames[f];
    const rgba = Buffer.alloc(OUT * OUT * 4);
    for (let i = 0; i < OUT * OUT; i++) {
      const p = pal[idx[i]] || [0, 0, 0];
      const a = idx[i] === ic.transparentIndex ? 0 : 255;
      rgba[i * 4] = p[0]; rgba[i * 4 + 1] = p[1]; rgba[i * 4 + 2] = p[2]; rgba[i * 4 + 3] = a;
    }
    writeFileSync(join(dir, 'icon-f' + f + '.png'), pngFromRgba(OUT, OUT, rgba));
    const s = 64, small = Buffer.alloc(s * s * 4);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const sx = (x * OUT / s) | 0, sy = (y * OUT / s) | 0;
      const o = (sy * OUT + sx) * 4, d = (y * s + x) * 4;
      small[d] = rgba[o]; small[d + 1] = rgba[o + 1]; small[d + 2] = rgba[o + 2]; small[d + 3] = rgba[o + 3];
    }
    writeFileSync(join(dir, 'icon64-f' + f + '.png'), pngFromRgba(s, s, small));
  }
}
