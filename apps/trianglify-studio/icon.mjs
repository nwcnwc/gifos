// Procedural Trianglify icon: a rounded card of real triangles whose wash
// of colour cycles. Cover is a mid-use Spectral wallpaper with the dock.
// Pure Node — trianglify UMD in vm, barycentric fill, box-downsample.
import { deflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const dir = dirname(fileURLToPath(import.meta.url));
const OUT = 128, SS = 2, RW = OUT * SS, FRAMES = 12;

function loadTrianglify() {
  const code = readFileSync(join(dir, 'vendor', 'trianglify.js'), 'utf8');
  const sandbox = { self: {}, window: {}, console };
  vm.runInNewContext(code, sandbox);
  return sandbox.trianglify;
}

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
function rotHue(r, g, b, deg) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  const d = max - min;
  if (d > 1e-6) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  h = (h + deg + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)));
  };
  return [f(0), f(8), f(4)];
}
function fillTri(rgba, W, H, x0, y0, x1, y1, x2, y2, r, g, b) {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(area) < 1e-6) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const w0 = ((x1 - x) * (y2 - y) - (x2 - x) * (y1 - y)) / area;
      const w1 = ((x2 - x) * (y0 - y) - (x0 - x) * (y2 - y)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 >= -0.02 && w1 >= -0.02 && w2 >= -0.02) {
        const o = (y * W + x) * 4;
        rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
      }
    }
  }
}
function paintPattern(rgba, W, H, pattern, hue) {
  const pts = pattern.points, polys = pattern.polys;
  for (let i = 0; i < polys.length; i++) {
    const p = polys[i];
    const rgb = p.color.rgb();
    const c = hue ? rotHue(rgb[0], rgb[1], rgb[2], hue) : [rgb[0] | 0, rgb[1] | 0, rgb[2] | 0];
    const a = pts[p.vertexIndices[0]];
    const b = pts[p.vertexIndices[1]];
    const d = pts[p.vertexIndices[2]];
    fillTri(rgba, W, H, a[0], a[1], b[0], b[1], d[0], d[1], c[0], c[1], c[2]);
  }
}
function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e9;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bd) { bd = dist; bi = i; }
  }
  return bi;
}
function quantize(rgba, pal) {
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

export function trianglifyIcon() {
  const tri = loadTrianglify();
  const PALS = ['YlGnBu', 'Spectral', 'YlOrRd', 'RdPu'];
  const patterns = PALS.map((p) => tri({
    width: RW, height: RW, cellSize: 42, variance: 0.7,
    seed: 'icon', xColors: p, yColors: 'match'
  }));
  const pal = [[0, 0, 0], [12, 16, 20], [232, 244, 246]];
  const seen = new Set();
  const per = Math.floor((64 - pal.length) / patterns.length);
  for (const pattern of patterns) {
    let n = 0;
    for (let i = 0; i < pattern.polys.length && n < per; i++) {
      const rgb = pattern.polys[i].color.rgb().map((v) => Math.round(v / 4) * 4);
      const k = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
      if (seen.has(k)) continue;
      seen.add(k);
      pal.push(rgb);
      n++;
    }
  }
  const INK = [18, 22, 28];
  const frames = [];
  for (let f = 0; f < FRAMES; f++) {
    const pattern = patterns[Math.floor(f / 3) % patterns.length];
    const rgba = new Float32Array(RW * RW * 4);
    const tmp = new Float32Array(RW * RW * 4);
    paintPattern(tmp, RW, RW, pattern, 0);
    for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
      const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
      const outer = inCard(x, y, 7, 22);
      if (!outer) continue;
      const inner = inCard(x, y, 9.4, 20.5);
      const o = (py * RW + px) * 4;
      if (!inner) {
        rgba[o] = INK[0]; rgba[o + 1] = INK[1]; rgba[o + 2] = INK[2]; rgba[o + 3] = 1;
        continue;
      }
      rgba[o] = tmp[o]; rgba[o + 1] = tmp[o + 1]; rgba[o + 2] = tmp[o + 2]; rgba[o + 3] = 1;
    }
    frames.push(quantize(rgba, pal));
  }
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 12, transparentIndex: 0 };
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
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
};
function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const gph = GLYPHS[ch] || GLYPHS[' '];
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (gph[row] & (1 << (4 - col))) {
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
      }
    }
    cx += 6 * s;
  }
}
function fillRound(put, x0, y0, x1, y1, rad, rr, gg, bb, aa) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
    const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
    let ok = true;
    if ((x < x0 + rad || x > x1 - rad) && (y < y0 + rad || y > y1 - rad)) {
      ok = (x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad;
    }
    if (ok) put(x, y, rr, gg, bb, aa);
  }
}

export function screenshotPng() {
  const tri = loadTrianglify();
  const W = 1200, H = 720;
  const pattern = tri({
    width: W, height: H, cellSize: 72, variance: 0.75,
    seed: 'sunset-42', xColors: 'Spectral', yColors: 'match'
  });
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b, a) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };
  const tmp = new Float32Array(W * H * 4);
  paintPattern(tmp, W, H, pattern, 0);
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4] = tmp[i * 4];
    rgba[i * 4 + 1] = tmp[i * 4 + 1];
    rgba[i * 4 + 2] = tmp[i * 4 + 2];
    rgba[i * 4 + 3] = 255;
  }
  // Bottom dock — mid-use, not empty first-boot.
  for (let y = 520; y < H; y++) {
    const t = (y - 520) / 200;
    const shade = Math.round(8 + t * 10);
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      rgba[o] = Math.round(rgba[o] * (1 - t * 0.72) + shade);
      rgba[o + 1] = Math.round(rgba[o + 1] * (1 - t * 0.72) + shade + 4);
      rgba[o + 2] = Math.round(rgba[o + 2] * (1 - t * 0.72) + shade + 8);
    }
  }
  fillRound(put, 36, 548, 420, 600, 8, 16, 32, 38);
  drawText(put, 52, 562, 'SUNSET-42', 4, 232, 244, 246);
  const pals = [
    ['#ffffd9', '#41b6c4', '#081d58'],
    ['#9e0142', '#ffffbf', '#5e4fa2'],
    ['#fff7f3', '#dd3497', '#49006a'],
    ['#ffffe5', '#78c679', '#004529'],
    ['#fff7bc', '#fe9929', '#662506'],
    ['#f7fcf0', '#7bccc4', '#084081'],
    ['#f7f4f9', '#9e9ac8', '#3f007d'],
    ['#fff5f0', '#fb6a4a', '#67000d']
  ];
  pals.forEach((cols, i) => {
    const x0 = 36 + i * 88;
    for (let x = 0; x < 78; x++) {
      const t = x / 77;
      const c = t < 0.5 ? mix(hex(cols[0]), hex(cols[1]), t * 2) : mix(hex(cols[1]), hex(cols[2]), (t - 0.5) * 2);
      for (let y = 0; y < 28; y++) put(x0 + x, 614 + y, c[0], c[1], c[2]);
    }
  });
  fillRound(put, 760, 548, 900, 600, 8, 41, 182, 196);
  drawText(put, 790, 562, 'PNG', 4, 7, 16, 20);
  fillRound(put, 916, 548, 1056, 600, 8, 22, 48, 56);
  drawText(put, 946, 562, 'SVG', 4, 232, 244, 246);
  fillRound(put, 760, 616, 1056, 668, 8, 30, 138, 150);
  drawText(put, 790, 630, 'SHARE', 4, 7, 16, 20);
  drawText(put, 36, 668, 'SPECTRAL  HD 1920x1080', 2, 180, 220, 226);

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
function hex(s) {
  return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
}
