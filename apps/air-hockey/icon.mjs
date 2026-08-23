// Procedural Air Hockey icon: a dark wood card holding a white ice table,
// red rails, two paddles and a puck that slides end to end. Pure Node,
// super-sample → box-downsample → small palette; deterministic so builds
// reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [42, 28, 18];
const CARD_D = [28, 18, 12];
const WOOD = [96, 58, 32];
const WOOD_D = [62, 36, 18];
const ICE = [236, 244, 248];
const ICE_D = [210, 224, 232];
const RED = [196, 36, 36];
const RED_D = [140, 22, 22];
const CYAN = [32, 168, 196];
const PUCK = [24, 24, 28];
const WHITE = [252, 252, 252];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, CARD_D, WOOD, WOOD_D, ICE, ICE_D, RED, RED_D, CYAN, PUCK, WHITE]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
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
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}
function inRoundRect(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  if (x >= x0 + r && x <= x0 + w - r) return true;
  if (y >= y0 + r && y <= y0 + h - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}
function inCircle(x, y, cx, cy, r) {
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}
function inRing(x, y, cx, cy, r0, r1) {
  const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
  return d >= r0 * r0 && d <= r1 * r1;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const table = { x: 28, y: 16, w: 72, h: 96 };
  const goingUp = t < 0.5;
  const u = goingUp ? t * 2 : (1 - (t - 0.5) * 2);
  const puckY = table.y + 22 + u * (table.h - 44);
  const puckX = table.x + table.w / 2 + Math.sin(t * Math.PI * 2) * 10;
  const padAy = table.y + table.h - 18;
  const padBy = table.y + 18;
  const padAx = table.x + table.w / 2 + Math.sin(t * Math.PI * 2) * 8;
  const padBx = table.x + table.w / 2 - Math.sin(t * Math.PI * 2) * 8;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    const o = (py * RW + px) * 4;
    if (!inCard(x, y, 6, 18)) continue;
    let col = mix(CARD, CARD_D, y / OUT);
    if (inRoundRect(x, y, table.x - 6, table.y - 6, table.w + 12, table.h + 12, 8)) col = mix(WOOD, WOOD_D, (y - table.y) / table.h);
    if (inRoundRect(x, y, table.x, table.y, table.w, table.h, 5)) {
      col = mix(ICE, ICE_D, (y - table.y) / table.h);
      const cx = table.x + table.w / 2, cy = table.y + table.h / 2;
      if (Math.abs(y - cy) < 1.1) col = CYAN;
      if (inRing(x, y, cx, cy, 8, 10)) col = RED;
      if (inCircle(x, y, cx, cy, 1.4)) col = RED_D;
      if (y < table.y + 3 || y > table.y + table.h - 3) col = RED;
      if ((x < table.x + 3 || x > table.x + table.w - 3) &&
          !(Math.abs(y - table.y) < 14 || Math.abs(y - (table.y + table.h)) < 14)) col = RED;
      const goalW = 22;
      if ((y < table.y + 5 || y > table.y + table.h - 5) && Math.abs(x - cx) < goalW / 2) col = ICE;
    }
    if (inCircle(x, y, padAx, padAy, 7.5)) col = RED_D;
    if (inCircle(x, y, padAx, padAy, 5.2)) col = RED;
    if (inCircle(x, y, padAx, padAy, 2.2)) col = WHITE;
    if (inCircle(x, y, padBx, padBy, 7.5)) col = RED_D;
    if (inCircle(x, y, padBx, padBy, 5.2)) col = RED;
    if (inCircle(x, y, padBx, padBy, 2.2)) col = WHITE;
    if (inCircle(x, y, puckX, puckY, 4.2)) col = PUCK;
    if (inCircle(x, y, puckX, puckY, 1.6)) col = mix(PUCK, WHITE, 0.25);
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

export function airHockeyIcon() {
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

import { deflateSync } from 'node:zlib';

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
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };
  const fill = (x0, y0, x1, y1, r, g, b) => {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    x1 = Math.min(W, x1 | 0); y1 = Math.min(H, y1 | 0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, r, g, b);
  };
  const disc = (cx, cy, rad, r, g, b) => {
    const r2 = rad * rad;
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r2) put(x, y, r, g, b);
    }
  };
  const ring = (cx, cy, r0, r1, r, g, b) => {
    const a2 = r0 * r0, b2 = r1 * r1;
    for (let y = cy - r1; y <= cy + r1; y++) for (let x = cx - r1; x <= cx + r1; x++) {
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d >= a2 && d <= b2) put(x, y, r, g, b);
    }
  };

  // dark wood room
  for (let y = 0; y < H; y++) {
    const v = 28 + (y % 7 === 0 ? 6 : 0);
    for (let x = 0; x < W; x++) {
      const u = v + ((x + y) % 11 === 0 ? 4 : 0);
      put(x, y, u + 10, u, u - 6);
    }
  }

  const tx = 330, ty = 40, tw = 540, th = 640;
  const rail = 22;
  fill(tx - rail, ty - rail, tx + tw + rail, ty + th + rail, 92, 52, 28);
  fill(tx, ty, tx + tw, ty + th, 236, 244, 248);

  const red = [196, 36, 36];
  const cyan = [32, 168, 196];
  fill(tx, ty, tx + tw, ty + 8, red[0], red[1], red[2]);
  fill(tx, ty + th - 8, tx + tw, ty + th, red[0], red[1], red[2]);
  fill(tx, ty + 80, tx + 8, ty + th - 80, red[0], red[1], red[2]);
  fill(tx + tw - 8, ty + 80, tx + tw, ty + th - 80, red[0], red[1], red[2]);

  const mx = tx + tw / 2, my = ty + th / 2;
  fill(tx + 8, my - 4, tx + tw - 8, my + 4, cyan[0], cyan[1], cyan[2]);
  ring(mx, my, 70, 80, red[0], red[1], red[2]);
  disc(mx, my, 8, red[0], red[1], red[2]);
  ring(mx, ty + 90, 70, 78, red[0], red[1], red[2]);
  ring(mx, ty + th - 90, 70, 78, red[0], red[1], red[2]);
  ring(tx + 130, ty + 160, 36, 44, red[0], red[1], red[2]);
  ring(tx + tw - 130, ty + 160, 36, 44, red[0], red[1], red[2]);
  ring(tx + 130, ty + th - 160, 36, 44, red[0], red[1], red[2]);
  ring(tx + tw - 130, ty + th - 160, 36, 44, red[0], red[1], red[2]);

  // goal mouths
  fill(mx - 70, ty, mx + 70, ty + 8, 236, 244, 248);
  fill(mx - 70, ty + th - 8, mx + 70, ty + th, 236, 244, 248);

  // paddles
  disc(mx + 40, ty + th - 110, 38, 140, 22, 22);
  disc(mx + 40, ty + th - 110, 28, 196, 36, 36);
  disc(mx + 40, ty + th - 110, 10, 252, 252, 252);
  disc(mx - 30, ty + 110, 38, 140, 22, 22);
  disc(mx - 30, ty + 110, 28, 196, 36, 36);
  disc(mx - 30, ty + 110, 10, 252, 252, 252);

  // puck
  disc(mx + 90, my - 40, 22, 24, 24, 28);
  disc(mx + 90, my - 44, 8, 48, 48, 54);

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
