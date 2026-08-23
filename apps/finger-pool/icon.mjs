// Procedural Finger Pool icon: a dark rounded card, a felt table, six
// pockets, a triangle of coloured balls, a white ball that flicks in.
// Pure Node, super-sample → box-downsample → small palette; deterministic.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [14, 22, 16];
const WOOD = [92, 58, 28];
const FELT = [17, 99, 54];
const FELT_D = [12, 72, 40];
const POCKET = [8, 8, 8];
const WHITE = [240, 240, 236];
const WHITE_L = [255, 255, 252];
const CREAM = [232, 214, 176];

const HUES = [
  [220, 48, 48], [220, 120, 36], [220, 188, 40], [64, 176, 56],
  [40, 168, 168], [48, 96, 210], [128, 64, 200], [200, 48, 140],
  [196, 36, 36], [232, 140, 32], [80, 196, 72], [36, 140, 196],
  [72, 72, 196], [168, 48, 168], [200, 48, 80]
];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, WOOD, FELT, FELT_D, POCKET, WHITE, WHITE_L, CREAM].concat(HUES)) {
    for (let s = 0; s <= 2; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.3).map(Math.round));
  }
  return pal.slice(0, 128);
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
function inCard(x, y, m, rad) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + rad), hi - rad);
  const cy = Math.min(Math.max(y, lo + rad), hi - rad);
  if (x >= lo + rad && x <= hi - rad) return true;
  if (y >= lo + rad && y <= hi - rad) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= rad * rad;
}
function dist2(x, y, cx, cy) { return (x - cx) * (x - cx) + (y - cy) * (y - cy); }

function rackPos() {
  const cx = 50, cy = 64, sp = 7;
  const out = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < i + 1; j++) {
      out.push({ x: cx - i * sp, y: cy - j * sp + i * (sp / 2) });
    }
  }
  return out;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const whiteX = 104 - t * 48;
  const whiteY = 64 + Math.sin(t * Math.PI) * 3;
  const rack = rackPos();
  const pockets = [
    [18, 22], [110, 22], [18, 106], [110, 106], [64, 22], [64, 106]
  ];
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    const o = (py * RW + px) * 4;
    if (!inCard(x, y, 6, 18)) continue;
    let col = CARD;
    if (x > 14 && x < 114 && y > 20 && y < 108) {
      const u = (x - 14) / 100;
      col = mix(FELT_D, FELT, 0.35 + 0.5 * Math.sin(u * Math.PI));
    }
    if (x > 14 && x < 114 && ((y > 20 && y < 26) || (y > 102 && y < 108))) col = WOOD;
    if (y > 20 && y < 108 && ((x > 14 && x < 20) || (x > 108 && x < 114))) col = WOOD;
    for (let i = 0; i < pockets.length; i++) {
      if (dist2(x, y, pockets[i][0], pockets[i][1]) < 5.2 * 5.2) col = POCKET;
    }
    const scatter = t > 0.55 ? (t - 0.55) * 18 : 0;
    for (let i = 0; i < rack.length; i++) {
      const p = rack[i];
      const dx = (i % 3 - 1) * scatter;
      const dy = ((i % 2) * 2 - 1) * scatter * 0.4;
      if (dist2(x, y, p.x + dx, p.y + dy) < 4.2 * 4.2) {
        const hue = HUES[i % HUES.length];
        const u = (x - (p.x + dx - 4.2)) / 8.4;
        col = mix(mix(hue, [255, 255, 255], 0.35), hue, Math.max(0, Math.min(1, u)));
      }
    }
    const br = 5.4;
    if (dist2(x, y, whiteX, whiteY) <= br * br) {
      const u = (x - (whiteX - br)) / (br * 2);
      col = mix(WHITE_L, WHITE, Math.max(0, Math.min(1, u)));
    }
    rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
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

export function fingerPoolIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 128;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 7, frames, delayCs: 10, transparentIndex: 0 };
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
  const fill = (x0, y0, x1, y1, r, g, b) => {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    x1 = Math.min(W, x1 | 0); y1 = Math.min(H, y1 | 0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, r, g, b);
  };
  function disk(cx, cy, rad, r, g, b) {
    const r2 = rad * rad;
    for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
      if (x * x + y * y <= r2) {
        const u = (x + rad) / (rad * 2);
        put(cx + x, cy + y,
          (r + (255 - r) * (1 - u) * 0.28) | 0,
          (g + (255 - g) * (1 - u) * 0.22) | 0,
          (b + (255 - b) * (1 - u) * 0.16) | 0);
      }
    }
  }

  fill(0, 0, W, H, 10, 42, 26);
  const x0 = 70, y0 = 90, x1 = W - 70, y1 = H - 90;
  fill(x0 - 18, y0 - 18, x1 + 18, y1 + 18, 92, 58, 28);
  fill(x0, y0, x1, y1, 17, 99, 54);
  const pockets = [
    [x0, y0], [x1, y0], [x0, y1], [x1, y1], [(x0 + x1) / 2, y0], [(x0 + x1) / 2, y1]
  ];
  pockets.forEach((p) => disk(p[0], p[1], 28, 8, 8, 8));

  const rack = [];
  const sp = 38;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < i + 1; j++) {
      rack.push({
        x: 420 - i * sp,
        y: H / 2 - j * sp + i * (sp / 2)
      });
    }
  }
  rack.forEach((p, i) => {
    const hue = HUES[i % HUES.length];
    disk(p.x, p.y, 22, hue[0], hue[1], hue[2]);
    disk(p.x - 6, p.y - 6, 6, 255, 255, 250);
  });
  disk(900, H / 2, 24, 240, 240, 236);
  disk(890, H / 2 - 8, 7, 255, 255, 252);

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
