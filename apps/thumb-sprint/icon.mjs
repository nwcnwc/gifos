// Procedural Thumb Sprint icon: a sticker sprints across a dark track and
// breaks the finish tape. Demonstrates the game, not a wiggle.
// Super-sample → box-downsample. Deterministic.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 14;

const CARD = [10, 10, 15];
const CARD_D = [16, 16, 24];
const TRACK = [20, 20, 30];
const LINE = [42, 42, 56];
const INK = [40, 12, 10];
const RED = [255, 92, 74];
const RED_H = [255, 176, 164];
const MINT = [74, 222, 128];
const BLUE = [96, 165, 250];
const TAPE = [255, 224, 102];
const WHITE = [244, 241, 234];
const POST = [58, 50, 40];

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
function inRoundRect(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  if (x >= x0 + r && x <= x0 + w - r) return true;
  if (y >= y0 + r && y <= y0 + h - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, CARD_D, TRACK, LINE, INK, RED, RED_H, MINT, BLUE, TAPE, WHITE, POST]) {
    for (let s = 0; s <= 2; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
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

function stickerAt(x, y, cx, cy, size, phase, body, hi) {
  const run = Math.sin(phase * Math.PI * 2);
  const leg = run * size * 0.22;
  const hx = cx, hy = cy - size * 0.42;
  const dHead = Math.hypot(x - hx, y - hy);
  if (dHead <= size * 0.32) {
    if (dHead > size * 0.26) return INK;
    const u = (x - (hx - size * 0.2)) / (size * 0.5);
    const c = mix(hi, body, Math.max(0, Math.min(1, u)));
    const e1 = Math.hypot(x - (hx - size * 0.1), y - (hy - size * 0.04));
    const e2 = Math.hypot(x - (hx + size * 0.1), y - (hy - size * 0.04));
    if (e1 < size * 0.055 || e2 < size * 0.055) return INK;
    if (e1 < size * 0.09 || e2 < size * 0.09) return WHITE;
    return c;
  }
  if (inRoundRect(x, y, cx - size * 0.28, cy - size * 0.18, size * 0.56, size * 0.48, size * 0.2)) {
    if (inRoundRect(x, y, cx - size * 0.22, cy - size * 0.12, size * 0.44, size * 0.36, size * 0.16)) {
      const u = (x - (cx - size * 0.22)) / (size * 0.5);
      return mix(hi, body, Math.max(0, Math.min(1, u)));
    }
    return INK;
  }
  const l1 = distSeg(x, y, cx - size * 0.1, cy + size * 0.22, cx - size * 0.18 - leg, cy + size * 0.52);
  const l2 = distSeg(x, y, cx + size * 0.1, cy + size * 0.22, cx + size * 0.18 + leg, cy + size * 0.52);
  if (l1 < size * 0.07 || l2 < size * 0.07) return INK;
  return null;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 7, rad = 20;
  const t = f / (FRAMES - 1);
  const runX = 26 + t * 70;
  const chaseX = 20 + t * 62;
  const phase = t * 5.5;
  const tapeX = 106;
  const broken = t > 0.82;
  const trackTop = 34, trackBot = 112;

  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD, CARD_D, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      if (y > trackTop && y < trackBot && x > 14 && x < 114) {
        col = (y > 72) ? mix(TRACK, [24, 24, 36], 0.4) : TRACK.slice();
        if (Math.abs(y - 73) < 1.0) col = LINE;
        if (x < 20) col = mix(TRACK, WHITE, 0.14);
      }
      if (x > tapeX - 3.4 && x < tapeX + 3.4 && ((y > trackTop + 2 && y < trackTop + 12) || (y > trackBot - 12 && y < trackBot - 2))) col = POST;
      if (!broken && Math.abs(x - tapeX) < 1.8 && y > trackTop + 12 && y < trackBot - 12 && ((y | 0) % 7 < 4)) col = TAPE;
      if (broken && Math.abs(x - tapeX) < 8 && y > trackTop + 12 && y < trackBot - 12) {
        const flutter = Math.sin(y * 0.35 + f) * 4;
        if (Math.abs(x - (tapeX + flutter)) < 1.3 && (y | 0) % 6 < 3) col = mix(TAPE, WHITE, 0.35);
      }
      const back = stickerAt(x, y, chaseX, 92, 16, phase + 0.4, MINT, [180, 250, 200]);
      if (back) col = back;
      const st = stickerAt(x, y, runX, 54, 22, phase, RED, RED_H);
      if (st) col = st;
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

export function thumbSprintIcon() {
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

const GLYPHS = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
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

function fillRR(put, x0, y0, x1, y1, rad, r, g, b) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
    const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
  }
}

function drawStickerPng(put, cx, cy, size, phase, body, hi) {
  const run = Math.sin(phase * Math.PI * 2);
  const leg = run * size * 0.22;
  const ink = INK;
  // shadow
  for (let dy = -8; dy <= 8; dy++) for (let dx = -size * 0.5; dx <= size * 0.5; dx++) {
    const ox = dx / (size * 0.45), oy = (dy + 2) / 7;
    if (ox * ox + oy * oy <= 1) put(cx + dx, cy + size * 0.62 + dy, 0, 0, 0, 80);
  }
  const stroke = (x1, y1, x2, y2, w) => {
    const x0 = Math.min(x1, x2) - w - 1, xN = Math.max(x1, x2) + w + 1;
    const y0 = Math.min(y1, y2) - w - 1, yN = Math.max(y1, y2) + w + 1;
    for (let y = y0; y <= yN; y++) for (let x = x0; x <= xN; x++) {
      if (distSeg(x, y, x1, y1, x2, y2) <= w) put(x, y, ink[0], ink[1], ink[2]);
    }
  };
  stroke(cx - size * 0.12, cy + size * 0.22, cx - size * 0.2 - leg, cy + size * 0.58, size * 0.07);
  stroke(cx + size * 0.12, cy + size * 0.22, cx + size * 0.2 + leg, cy + size * 0.58, size * 0.07);
  fillRR(put, cx - size * 0.32, cy - size * 0.2, cx + size * 0.32, cy + size * 0.36, size * 0.22, ink[0], ink[1], ink[2]);
  fillRR(put, cx - size * 0.24, cy - size * 0.12, cx + size * 0.24, cy + size * 0.28, size * 0.18, body[0], body[1], body[2]);
  // head
  const hr = size * 0.32;
  for (let dy = -hr - 2; dy <= hr + 2; dy++) for (let dx = -hr - 2; dx <= hr + 2; dx++) {
    const d = Math.hypot(dx, dy);
    if (d <= hr + 2 && d > hr - 1) put(cx + dx, cy - size * 0.44 + dy, ink[0], ink[1], ink[2]);
    else if (d <= hr - 1) {
      const u = (dx + hr) / (hr * 2);
      put(cx + dx, cy - size * 0.44 + dy,
        (hi[0] + (body[0] - hi[0]) * u) | 0,
        (hi[1] + (body[1] - hi[1]) * u) | 0,
        (hi[2] + (body[2] - hi[2]) * u) | 0);
    }
  }
  const eyes = [[-size * 0.1, -size * 0.48], [size * 0.1, -size * 0.48]];
  for (const e of eyes) {
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      if (dx * dx + dy * dy <= 25) put(cx + e[0] + dx, cy + e[1] + dy, 255, 255, 255);
      if (dx * dx + dy * dy <= 8) put(cx + e[0] + dx + 1, cy + e[1] + dy, ink[0], ink[1], ink[2]);
    }
  }
  // smile
  for (let a = 0.2; a <= 0.8; a += 0.02) {
    const ang = Math.PI * a;
    const sx = cx + Math.cos(ang) * size * 0.12;
    const sy = cy - size * 0.38 + Math.sin(ang) * size * 0.1;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (dx * dx + dy * dy <= 4) put(sx + dx, sy + dy, ink[0], ink[1], ink[2]);
    }
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
  const fill = (x0, y0, x1, y1, r, g, b) => {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    x1 = Math.min(W, x1 | 0); y1 = Math.min(H, y1 | 0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, r, g, b);
  };

  fill(0, 0, W, H, 10, 10, 15);

  drawText(put, 40, 28, 'THUMB SPRINT', 6, 244, 241, 234);
  drawText(put, 980, 36, 'GO', 5, 255, 224, 102);

  const trackTop = 96, trackBot = 430, trackLeft = 40, trackRight = 1160;
  fill(trackLeft, trackTop, trackRight, trackBot, 12, 12, 20);
  const lanes = [
    { name: 'YOU', p: 0.68, body: RED, hi: RED_H, y: 0 },
    { name: 'SAM', p: 0.61, body: MINT, hi: [187, 247, 208], y: 1 },
    { name: 'RIO', p: 0.52, body: BLUE, hi: [191, 219, 254], y: 2 },
  ];
  const laneH = (trackBot - trackTop) / 3;
  const tapeX = 1088;
  for (let i = 0; i < 3; i++) {
    const y0 = trackTop + i * laneH;
    if (i % 2) fill(trackLeft, y0, trackRight, y0 + laneH, 16, 16, 26);
    drawText(put, 56, y0 + 28, lanes[i].name, 3, lanes[i].body[0], lanes[i].body[1], lanes[i].body[2]);
    const x = 180 + lanes[i].p * (tapeX - 220);
    drawStickerPng(put, x, y0 + laneH * 0.55, 54, 0.35 + i * 0.2, lanes[i].body, lanes[i].hi);
  }
  fill(tapeX - 6, trackTop + 6, tapeX + 6, trackTop + 22, 58, 50, 40);
  fill(tapeX - 6, trackBot - 22, tapeX + 6, trackBot - 6, 58, 50, 40);
  for (let y = trackTop + 24; y < trackBot - 24; y++) {
    if ((y % 16) < 10) fill(tapeX - 2, y, tapeX + 2, y + 1, 255, 224, 102);
  }

  // mash pad
  fillRR(put, 80, 460, 1120, 690, 40, 255, 92, 74);
  fillRR(put, 100, 478, 1100, 640, 32, 255, 122, 108);
  drawText(put, 390, 530, 'MASH', 12, 255, 255, 255);
  drawText(put, 430, 630, 'TAP OR SPACE', 3, 255, 220, 210);

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
