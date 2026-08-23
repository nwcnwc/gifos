// Procedural Pool icon: a felt table, a cue that pulls back and strikes,
// a yellow ball that rolls into a corner pocket. Cover is a mid-game spread.
// Pure Node, super-sample → box-downsample → small palette; deterministic.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [18, 14, 10];
const WOOD = [92, 58, 28];
const WOOD_D = [58, 34, 16];
const FELT = [28, 110, 52];
const FELT_D = [16, 78, 38];
const POCKET = [8, 8, 8];
const CUE = [232, 214, 176];
const WHITE = [240, 240, 236];
const RED = [196, 42, 36];
const YELLOW = [232, 186, 42];
const BLACK = [18, 18, 20];
const LINE = [230, 240, 220];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, WOOD, WOOD_D, FELT, FELT_D, POCKET, CUE, WHITE, RED, YELLOW, BLACK, LINE]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
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
function inRoundRect(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  if (x >= x0 + r && x <= x0 + w - r) return true;
  if (y >= y0 + r && y <= y0 + h - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function dist2(x, y, cx, cy) { return (x - cx) * (x - cx) + (y - cy) * (y - cy); }

function shotAt(t) {
  // 0–0.30 pull · 0.30–0.40 strike · 0.40–1.0 yellow rolls into the pocket.
  const pocket = { x: 105, y: 36 };
  const yel0 = { x: 72, y: 58 };
  const wh0 = { x: 34, y: 70 };
  let pull = 0, wx = wh0.x, wy = wh0.y, yx = yel0.x, yy = yel0.y, yr = 5.6, flash = 0, spark = 0;
  if (t < 0.30) {
    pull = (t / 0.30) * 16;
  } else if (t < 0.40) {
    const u = (t - 0.30) / 0.10;
    pull = 16 * (1 - u);
    wx = wh0.x + u * 16;
    wy = wh0.y - u * 6;
    spark = 1 - Math.abs(u - 0.35) * 2;
    if (spark < 0) spark = 0;
  } else {
    const u = (t - 0.40) / 0.60;
    wx = wh0.x + 16 + u * 6;
    wy = wh0.y - 6 - u * 2;
    yx = yel0.x + (pocket.x - yel0.x) * Math.min(1, u * 1.15);
    yy = yel0.y + (pocket.y - yel0.y) * Math.min(1, u * 1.15);
    yr = 5.6 * (1 - Math.max(0, (u - 0.62) / 0.38));
    if (u > 0.70) flash = (1 - (u - 0.70) / 0.30) * 1;
  }
  return { pull, wx, wy, yx, yy, yr, flash, spark, pocket };
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  const table = { x: 14, y: 28, w: 100, h: 72 };
  const felt = { x: 20, y: 34, w: 88, h: 60 };
  const shot = shotAt(t);
  const cueX0 = 14 - shot.pull;
  const cueY = 72;
  const cueX1 = cueX0 + 36;
  const balls = [
    { x: shot.wx, y: shot.wy, c: WHITE, r: 5.4 },
    { x: 54, y: 82, c: RED, r: 4.9 },
    { x: 66, y: 50, c: RED, r: 4.9 },
    { x: 82, y: 82, c: YELLOW, r: 4.9 },
    { x: 94, y: 68, c: BLACK, r: 4.9 },
  ];
  if (shot.yr > 0.6) balls.splice(1, 0, { x: shot.yx, y: shot.yy, c: YELLOW, r: shot.yr });
  const pockets = [
    [felt.x + 2, felt.y + 2], [felt.x + felt.w / 2, felt.y],
    [felt.x + felt.w - 2, felt.y + 2], [felt.x + 2, felt.y + felt.h - 2],
    [felt.x + felt.w / 2, felt.y + felt.h], [felt.x + felt.w - 2, felt.y + felt.h - 2],
  ];
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    const o = (py * RW + px) * 4;
    if (!inCard(x, y, 6, 18)) continue;
    let col = mix(CARD, WOOD_D, y / OUT * 0.3);
    if (inRoundRect(x, y, table.x, table.y, table.w, table.h, 8)) {
      col = mix(WOOD, WOOD_D, (x + y) / 200);
    }
    if (inRoundRect(x, y, felt.x, felt.y, felt.w, felt.h, 6)) {
      col = mix(FELT, FELT_D, ((x * 0.4 + y) / 140));
    }
    for (const p of pockets) {
      if (dist2(x, y, p[0], p[1]) < 4.4 * 4.4) col = POCKET;
    }
    if (shot.flash > 0 && dist2(x, y, shot.pocket.x, shot.pocket.y) < 8.5 * 8.5) {
      col = mix(col, YELLOW, shot.flash * 0.7);
    }
    if (shot.spark > 0 && dist2(x, y, 50, 64) < (5 + shot.spark * 6) ** 2) {
      col = mix(col, WHITE, shot.spark * 0.55);
    }
    const along = (x - cueX0) / (cueX1 - cueX0);
    const cueYAt = cueY - along * 3.2;
    if (along >= 0 && along <= 1 && Math.abs(y - cueYAt) < 1.2) {
      col = mix(CUE, WOOD, along * 0.4);
    }
    for (const b of balls) {
      const d = dist2(x, y, b.x, b.y);
      if (d <= b.r * b.r) {
        const u = (x - (b.x - b.r * 0.55)) / (b.r * 2);
        col = mix(mix(b.c, WHITE, 0.35), b.c, clamp(u, 0, 1));
      }
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

export function poolIcon() {
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
  function disk(cx, cy, rad, r, g, b, a) {
    const r2 = rad * rad;
    for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
      const d = x * x + y * y;
      if (d <= r2) {
        const u = (x + rad) / (rad * 2);
        const k = 1 - u * 0.22;
        put(cx + x, cy + y,
          (r * k + (255 - r) * (1 - u) * 0.22) | 0,
          (g * k + (255 - g) * (1 - u) * 0.22) | 0,
          (b * k + (255 - b) * (1 - u) * 0.16) | 0,
          a == null ? 255 : a);
      }
    }
  }
  function ball(cx, cy, rgb, rad) {
    rad = rad || 22;
    disk(cx, cy, rad, rgb[0], rgb[1], rgb[2]);
    disk(cx - rad * 0.32, cy - rad * 0.32, rad * 0.28,
      Math.min(255, rgb[0] + 70), Math.min(255, rgb[1] + 70), Math.min(255, rgb[2] + 70));
  }

  fill(0, 0, W, H, 12, 10, 8);
  fill(16, 28, W - 16, H - 28, 96, 60, 30);
  fill(16, 28, W - 16, 36, 120, 80, 42);
  for (let y = 58; y < H - 58; y++) {
    const v = (y - 58) / (H - 116);
    const r = (22 + v * 8) | 0, g = (108 - v * 18) | 0, b = (48 - v * 8) | 0;
    for (let x = 58; x < W - 58; x++) {
      const n = ((x * 13 + y * 7) % 17) === 0 ? 4 : 0;
      put(x, y, r, g + n, b);
    }
  }
  const pockets = [
    [70, 70], [W / 2, 60], [W - 70, 70],
    [70, H - 70], [W / 2, H - 60], [W - 70, H - 70],
  ];
  for (const p of pockets) disk(p[0], p[1], 30, 8, 8, 8);

  const red = [196, 42, 36], yel = [232, 186, 42], blk = [16, 16, 18], wh = [236, 236, 232];

  // Mid-game: a real spread, one hanging in the jaws, cue lined up.
  const placed = [
    [340, 430, wh, 24],
    [1088, 168, yel, 22],   // hanging on the top-right pocket
    [720, 360, blk, 22],
    [520, 250, red, 22],
    [880, 500, red, 22],
    [250, 190, red, 22],
    [640, 560, red, 22],
    [480, 500, yel, 22],
    [760, 230, yel, 22],
    [600, 360, yel, 22],
    [210, 530, yel, 22],
    [980, 430, red, 22],
    [430, 300, yel, 22],
  ];
  for (const b of placed) ball(b[0], b[1], b[2], b[3]);
  // half-sunk red in the bottom-left pocket
  disk(78, H - 62, 16, red[0], red[1], red[2]);

  // cue, pulled back, aimed at the hanging yellow
  const cueX0 = 40, cueY0 = 520, cueX1 = 318, cueY1 = 438;
  const cueLen = Math.hypot(cueX1 - cueX0, cueY1 - cueY0);
  const cdx = (cueX1 - cueX0) / cueLen, cdy = (cueY1 - cueY0) / cueLen;
  const px = -cdy, py = cdx;
  for (let i = 0; i < cueLen; i++) {
    const x = cueX0 + cdx * i, y = cueY0 + cdy * i;
    const thick = i > cueLen - 18 ? 3.2 : 2.4;
    for (let t = -thick; t <= thick; t++) {
      put(x + px * t, y + py * t, (220 - i * 0.12) | 0, (200 - i * 0.1) | 0, 160);
    }
  }
  disk(cueX1, cueY1, 4, 240, 236, 220);

  // aim line from white toward the hanging yellow
  const ax0 = 360, ay0 = 418, ax1 = 1048, ay1 = 186;
  const alen = Math.hypot(ax1 - ax0, ay1 - ay0);
  for (let i = 0; i < alen; i += 14) {
    const x = ax0 + (ax1 - ax0) * (i / alen);
    const y = ay0 + (ay1 - ay0) * (i / alen);
    disk(x, y, 2, 230, 240, 210);
  }
  // ghost of the object ball, just before the pocket
  for (let a = 0; a < 40; a++) {
    const ang = (a / 40) * Math.PI * 2;
    put(1088 + Math.cos(ang) * 26, 168 + Math.sin(ang) * 26, 240, 240, 220);
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
