// Procedural icon: a tank, turret sweeping, a shell leaving. No letters.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const DIRT = [42, 38, 24], SAND = [90, 78, 48], HULL = [200, 140, 40];
const DARK = [90, 60, 20], SHELL = [255, 220, 120], RED = [196, 48, 40];
const BLUE = [46, 125, 180], BRICK = [106, 86, 64];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [DIRT, SAND, HULL, DARK, SHELL, RED, BLUE, BRICK, [30, 26, 16], [240, 200, 80], [255, 255, 255]]) {
    pal.push(b);
    pal.push(mix(b, [255, 255, 255], 0.18).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
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
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
}
function rr(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  if (x >= x0 + r && x <= x1 - r) return true;
  if (y >= y0 + r && y <= y1 - r) return true;
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  const ang = -0.45 + t * 1.15;
  const bx = 64 + Math.cos(ang) * (26 + t * 42);
  const by = 64 + Math.sin(ang) * (26 + t * 42);
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, 6, 16)) {
      a = 1;
      col = mix(DIRT, SAND, ((Math.floor(x / 8) + Math.floor(y / 8)) % 2) ? 0.35 : 0.55);
      if (x > 92 && y > 28 && y < 100 && x < 104) col = BRICK;
      if (rr(x, y, 36, 50, 92, 86, 5)) col = HULL;
      if (rr(x, y, 32, 46, 44, 54, 1) || rr(x, y, 32, 82, 44, 90, 1) ||
          rr(x, y, 84, 46, 96, 54, 1) || rr(x, y, 84, 82, 96, 90, 1)) col = DARK;
      const dx = x - 64, dy = y - 64;
      const rx = dx * Math.cos(-ang) - dy * Math.sin(-ang);
      const ry = dx * Math.sin(-ang) + dy * Math.cos(-ang);
      if (rx > 0 && rx < 36 && Math.abs(ry) < 3.2) col = mix(HULL, SHELL, 0.35);
      if (Math.hypot(x - 64, y - 64) < 9) col = mix(HULL, SHELL, 0.15);
      if (Math.hypot(x - 64, y - 64) < 4) col = DARK;
      if (Math.hypot(x - bx, y - by) < 4 && t > 0.18) col = SHELL;
      if (t > 0.75 && Math.hypot(x - bx, y - by) < 10) col = mix(SHELL, RED, 0.4);
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

export function tanksIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64, flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 8, transparentIndex: 0 };
}

function crc(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (~c) >>> 0;
}
function pngChunk(tag, data) {
  const t = Buffer.from(tag);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
}

function paintTank(put, cx, cy, rot, tur, hull, scale) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const dark = mix(hull, [0, 0, 0], 0.45);
  function dxy(lx, ly) {
    return [cx + lx * cs - ly * sn, cy + lx * sn + ly * cs];
  }
  function blob(lx, ly, r, col) {
    const [x, y] = dxy(lx, ly);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) put((x + dx) | 0, (y + dy) | 0, col[0], col[1], col[2]);
    }
  }
  for (let i = -18 * scale; i <= 18 * scale; i += 2) {
    blob(i / scale, -12, 3 * scale, dark);
    blob(i / scale, 12, 3 * scale, dark);
  }
  for (let y = -8; y <= 8; y++) for (let x = -16; x <= 16; x++) {
    if (Math.abs(x) < 16 && Math.abs(y) < 8) blob(x, y, scale, hull);
  }
  const tc = Math.cos(tur), ts = Math.sin(tur);
  for (let i = 0; i < 28 * scale; i++) {
    put((cx + tc * i) | 0, (cy + ts * i) | 0, hull[0], hull[1], hull[2]);
    put((cx + tc * i) | 0, (cy + ts * i + 1) | 0, dark[0], dark[1], dark[2]);
  }
  blob(0, 0, 7 * scale, mix(hull, [255, 220, 120], 0.2));
}

export function screenshotPng() {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
  };
  const fill = (x0, y0, x1, y1, r, g, b) => {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    x1 = Math.min(W, x1 | 0); y1 = Math.min(H, y1 | 0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, r, g, b);
  };
  fill(0, 0, W, H, 22, 20, 14);
  for (let y = 48; y < 680; y += 40) for (let x = 40; x < 1160; x += 40) {
    const c = ((x + y) / 40) % 2 ? [46, 42, 28] : [38, 34, 22];
    fill(x, y, x + 40, y + 40, c[0], c[1], c[2]);
  }
  function wall(x, y, w, h) {
    fill(x, y, x + w, y + h, 74, 58, 40);
    for (let yy = y; yy < y + h; yy += 14) {
      const odd = ((yy - y) / 14) % 2;
      for (let xx = x + odd * 8; xx < x + w; xx += 16) {
        fill(xx + 1, yy + 1, Math.min(x + w - 1, xx + 14), Math.min(y + h - 1, yy + 13), 106, 86, 64);
      }
    }
  }
  wall(280, 160, 56, 400);
  wall(860, 160, 56, 400);
  wall(500, 330, 200, 56);
  wall(120, 340, 100, 36);
  wall(980, 340, 100, 36);

  paintTank(put, 180, 150, 0.4, 0.55, HULL, 2);
  paintTank(put, 980, 540, Math.PI + 0.3, Math.PI + 0.15, BLUE, 2);
  paintTank(put, 620, 200, 1.2, 1.4, RED, 2);

  // shells
  for (let i = 0; i < 8; i++) {
    const x = 230 + i * 18, y = 168 + i * 10;
    fill(x, y, x + 8, y + 6, SHELL[0], SHELL[1], SHELL[2]);
  }
  // explosion
  fill(600, 180, 660, 240, 255, 200, 80);
  fill(616, 196, 644, 224, 255, 120, 40);
  fill(624, 204, 636, 216, 255, 255, 220);

  function heart(x, y) {
    for (let yy = 0; yy < 22; yy++) for (let xx = 0; xx < 26; xx++) {
      const lx = (xx - 8) / 7, ly = (yy - 7) / 7;
      const rx = (xx - 18) / 7, ry = (yy - 7) / 7;
      const lobes = (lx * lx + ly * ly < 1) || (rx * rx + ry * ry < 1);
      const tri = yy > 8 && Math.abs(xx - 13) < (22 - yy) * 0.85;
      if (lobes || tri) put(x + xx, y + yy, 204, 48, 48);
    }
  }
  heart(48, 10); heart(86, 10); heart(124, 10);
  fill(200, 18, 280, 38, 240, 200, 80);
  // tally-ish bar
  fill(200, 20, 232, 36, 40, 30, 16);

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
