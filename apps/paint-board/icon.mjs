// Procedural Paint Board icon: a dark rounded card holding a cream page
// with a rainbow stroke that grows across the frames. Super-sample →
// box-downsample → small palette; deterministic so GIF builds reproduce.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [36, 28, 44];
const CARD_B = [22, 16, 28];
const PAPER = [255, 254, 248];
const INK = [16, 12, 20];
const RED = [255, 99, 99];
const GREEN = [101, 204, 138];
const BLUE = [58, 89, 209];
const YELLOW = [244, 196, 48];
const PURPLE = [155, 89, 182];
const ORANGE = [255, 140, 66];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function hsl(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)));
  };
  return [f(0), f(8), f(4)];
}
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}
function inPaper(x, y) {
  return x >= 22 && x <= 106 && y >= 26 && y <= 102;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, PAPER, INK, RED, GREEN, BLUE, YELLOW, PURPLE, ORANGE]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.28).map(Math.round));
  }
  for (let h = 0; h < 360; h += 30) pal.push(hsl(h, 90, 50));
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
function strokePoint(t) {
  const x = 30 + t * 68;
  const y = 64 + Math.sin(t * Math.PI * 2) * 22;
  return [x, y];
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const drawn = (f + 1) / FRAMES;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      if (inPaper(x, y)) {
        col = PAPER;
        const dx = x - 22, dy = y - 26;
        if (dx < 2 || dy < 2) col = mix(PAPER, INK, 0.08);
      }
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }

  const steps = 80;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (t > drawn) break;
    const [x, y] = strokePoint(t);
    const [px0, py0] = strokePoint((i - 1) / steps);
    const hue = (t * 360) | 0;
    const c = hsl(hue, 90, 50);
    const thick = 3.2;
    const samples = 6;
    for (let s = 0; s <= samples; s++) {
      const u = s / samples;
      const sx = px0 + (x - px0) * u, sy = py0 + (y - py0) * u;
      for (let oy = -thick; oy <= thick; oy++) for (let ox = -thick; ox <= thick; ox++) {
        if (ox * ox + oy * oy > thick * thick) continue;
        const gx = Math.round(sx + ox), gy = Math.round(sy + oy);
        if (!inPaper(gx, gy)) continue;
        for (let syy = 0; syy < SS; syy++) for (let sxx = 0; sxx < SS; sxx++) {
          const o = (((gy * SS + syy) * RW) + (gx * SS + sxx)) * 4;
          rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 1;
        }
      }
    }
  }

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, aa = 0, n = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; aa += rgba[o + 3];
    }
    if (aa / n < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}

export function paintBoardIcon() {
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
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  'X': [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
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
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };
  const fill = (x0, y0, x1, y1, r, g, b) => {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    x1 = Math.min(W, x1 | 0); y1 = Math.min(H, y1 | 0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, r, g, b);
  };

  for (let y = 0; y < H; y++) {
    const c = mix([36, 28, 44], [18, 14, 24], y / H);
    for (let x = 0; x < W; x++) put(x, y, c[0], c[1], c[2]);
  }

  drawText(put, 48, 48, 'PAINT BOARD', 10, 255, 99, 99);
  drawText(put, 48, 140, 'A FREEHAND BOARD', 4, 244, 239, 230);
  drawText(put, 48, 190, 'WITH WILD BRUSHES', 4, 244, 239, 230);
  fill(48, 250, 360, 302, 255, 99, 99);
  drawText(put, 64, 262, 'DRAW TOGETHER', 3, 26, 21, 32);
  drawText(put, 48, 330, 'RAINBOW STARS WAVE', 3, 101, 204, 138);
  drawText(put, 48, 380, 'THORN MESH PIXELS', 3, 58, 89, 209);
  drawText(put, 48, 640, 'UNOFFICIAL PORT', 3, 140, 130, 148);

  const px0 = 620, py0 = 80, pw = 520, ph = 560;
  fill(px0, py0, px0 + pw, py0 + ph, 255, 254, 248);

  function strokeCurve(fn, thick, colFn) {
    let prev = null;
    for (let i = 0; i <= 180; i++) {
      const t = i / 180;
      const p = fn(t);
      const x = px0 + p[0], y = py0 + p[1];
      const c = colFn(t);
      if (prev) {
        const steps = 8;
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const sx = prev[0] + (x - prev[0]) * u;
          const sy = prev[1] + (y - prev[1]) * u;
          for (let oy = -thick; oy <= thick; oy++) for (let ox = -thick; ox <= thick; ox++) {
            if (ox * ox + oy * oy > thick * thick) continue;
            const gx = (sx + ox) | 0, gy = (sy + oy) | 0;
            if (gx <= px0 || gx >= px0 + pw || gy <= py0 || gy >= py0 + ph) continue;
            put(gx, gy, c[0], c[1], c[2]);
          }
        }
      }
      prev = [x, y];
    }
  }

  strokeCurve((t) => [60 + t * 400, 180 + Math.sin(t * Math.PI * 2) * 90], 10, (t) => hsl(t * 360, 90, 50));
  strokeCurve((t) => [80 + t * 360, 360 + Math.cos(t * Math.PI * 1.6) * 70], 7, () => RED);
  strokeCurve((t) => [40 + t * 420, 480 + Math.sin(t * Math.PI * 3) * 40], 5, () => BLUE);

  for (let i = 0; i < 12; i++) {
    const cx = px0 + 90 + (i % 6) * 70;
    const cy = py0 + 80 + Math.floor(i / 6) * 70;
    const col = [RED, GREEN, YELLOW, PURPLE, ORANGE, BLUE][i % 6];
    const r = 16;
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 === 0 ? r : r * 0.42;
      const a0 = -Math.PI / 2 + k * Math.PI / 5;
      const a1 = -Math.PI / 2 + (k + 1) * Math.PI / 5;
      // fill star by painting disc-ish points along spikes
      for (let s = 0; s < 8; s++) {
        const u = s / 8;
        const ang = a0 + (a1 - a0) * 0;
        const rad = rr * (1 - u) + (k % 2 === 0 ? r * 0.42 : r) * u;
        const x = (cx + Math.cos(a0) * rr * (1 - u) + Math.cos(a1) * (k % 2 ? r : r * 0.42) * u) | 0;
        const y = (cy + Math.sin(a0) * rr * (1 - u) + Math.sin(a1) * (k % 2 ? r : r * 0.42) * u) | 0;
        for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) {
          put(x + ox, y + oy, col[0], col[1], col[2]);
        }
      }
    }
    for (let ang = 0; ang < 10; ang++) {
      const rr = ang % 2 === 0 ? r : r * 0.42;
      const a = -Math.PI / 2 + ang * Math.PI / 5;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      for (let t = 0; t <= 10; t++) {
        const px = (cx + (x - cx) * t / 10) | 0;
        const py = (cy + (y - cy) * t / 10) | 0;
        for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) put(px + ox, py + oy, col[0], col[1], col[2]);
      }
    }
  }

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
