// Procedural icon: a spy (fedora, coat) vs a location (building + pin).
// The spy peeks; the pin drops onto the building. Demonstrates, not a wiggle.
// Pure Node, super-sample → box-downsample. Deterministic.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [28, 14, 18];
const CARD_D = [18, 8, 12];
const CREAM = [243, 230, 212];
const CREAM_D = [214, 190, 164];
const INK = [42, 24, 24];
const RED = [196, 40, 48];
const RED_H = [255, 106, 106];
const PIN = [180, 48, 52];
const GOLD = [232, 196, 96];
const COAT = [58, 32, 38];
const COAT_H = [110, 70, 78];
const FACE = [214, 186, 168];
const BRICK = [92, 48, 52];
const BRICK_D = [58, 28, 32];
const WIN = [232, 210, 180];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, CARD_D, CREAM, CREAM_D, INK, RED, RED_H, PIN, GOLD, COAT, COAT_H, FACE, BRICK, BRICK_D, WIN]) {
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
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  if (x >= x0 + r && x <= x1 - r) return true;
  if (y >= y0 + r && y <= y1 - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}
function distToSeg(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  if (l2 < 1e-6) return Math.hypot(x - x1, y - y1);
  let t = ((x - x1) * dx + (y - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}
function inEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx, dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function spyHit(x, y, ox) {
  const sx = x - ox;
  // fedora brim
  if (inEllipse(sx, y, 38, 44, 22, 5.5)) return 'brim';
  // crown
  if (inRoundRect(sx, y, 26, 28, 50, 46, 6)) return 'crown';
  // head
  if (Math.hypot(sx - 38, y - 54) < 12) return 'head';
  // visor slit
  if (sx > 30 && sx < 50 && y > 51 && y < 55) return 'visor';
  // coat body
  if (inRoundRect(sx, y, 22, 64, 54, 112, 10)) return 'coat';
  // collar V
  if (distToSeg(sx, y, 38, 64, 26, 80) < 3.2 || distToSeg(sx, y, 38, 64, 50, 80) < 3.2) return 'collar';
  return null;
}
function buildingHit(x, y) {
  // body
  if (inRoundRect(x, y, 74, 58, 114, 112, 4)) return 'body';
  // roof
  const roofL = distToSeg(x, y, 72, 60, 94, 38);
  const roofR = distToSeg(x, y, 116, 60, 94, 38);
  if ((roofL < 3.4 || roofR < 3.4) && y >= 36 && y <= 62) return 'roof';
  if (x >= 76 && x <= 112 && y >= 42 && y <= 60) {
    const t = (x - 94) / 22;
    if (y >= 42 + Math.abs(t) * 16) return 'roofFill';
  }
  return null;
}
function windowHit(x, y) {
  const cells = [[80, 68], [98, 68], [80, 88], [98, 88]];
  for (const [wx, wy] of cells) {
    if (x >= wx && x <= wx + 10 && y >= wy && y <= wy + 12) return true;
  }
  return false;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  const peek = Math.min(1, t * 1.2);
  const ox = -26 + peek * 26;
  const pinY = 34 - (1 - Math.min(1, t * 1.2)) * 22;
  const glint = Math.max(0, Math.sin((t - 0.55) * Math.PI * 1.6));
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, 6, 20)) {
      a = 1;
      col = mix(CARD, CARD_D, Math.max(0, Math.min(1, (x + y) / (OUT * 2))));

      const bld = buildingHit(x, y);
      if (bld) {
        col = mix(BRICK, BRICK_D, Math.max(0, Math.min(1, y / OUT)));
        if (bld === 'roof' || bld === 'roofFill') col = mix(PIN, BRICK, 0.35);
        if (windowHit(x, y)) col = mix(WIN, GOLD, 0.15);
      }

      const sp = spyHit(x, y, ox);
      if (sp) {
        if (sp === 'brim' || sp === 'crown') col = mix(INK, COAT, 0.15);
        else if (sp === 'head') col = mix(FACE, CREAM, 0.2);
        else if (sp === 'visor') col = mix(INK, RED, 0.55);
        else if (sp === 'collar') col = CREAM.slice();
        else col = mix(COAT, COAT_H, Math.max(0, Math.min(1, (x - 20) / 40)));
        if (sp === 'visor' && glint > 0.12) col = mix(col, GOLD, Math.min(1, glint * 1.2));
        if (sp === 'brim' && y > 42 && y < 46 && Math.abs((x - ox) - 38) < 10) col = GOLD.slice();
      }

      const pxp = 94, pyp = pinY;
      const pd = Math.hypot(x - pxp, y - (pyp - 6));
      const tip = distToSeg(x, y, pxp, pyp - 4, pxp, pyp + 12);
      if (pd < 8.5 || (tip < 3.4 && y > pyp - 4 && y < pyp + 13)) {
        col = mix(RED_H, PIN, Math.max(0, Math.min(1, (x - 86) / 16)));
      }
      if (Math.hypot(x - pxp, y - (pyp - 6)) < 3.4) col = CREAM.slice();
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0, nss = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
    }
    if (a / nss < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / nss, g / nss, b / nss);
  }
  return idx;
}

export function spyfallIcon() {
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

const GLYPHS = {
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'J': [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10001, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'Q': [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  'X': [0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b01010, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  'Z': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
  ':': [0, 0b00100, 0, 0, 0, 0b00100, 0],
  '.': [0, 0, 0, 0, 0, 0, 0b00100],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b10001, 0b10001, 0b10001, 0b11111, 0b00001, 0b00001, 0b00001],
  '5': [0b11111, 0b10000, 0b10000, 0b11110, 0b00001, 0b00001, 0b11110],
  '6': [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b00100, 0b00100, 0b00100],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
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
function roundRect(fill, x0, y0, x1, y1, rad, r, g, b) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
    const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
    let ok = false;
    if (x >= x0 + rad && x < x1 - rad) ok = true;
    else if (y >= y0 + rad && y < y1 - rad) ok = true;
    else ok = (x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad;
    if (ok) fill(x, y, r, g, b);
  }
}

export function screenshotPng() {
  // In-round, role hidden. Nobody on this picture is named as the spy.
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

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = (x + y) / (W + H);
    put(x, y, (18 + t * 22) | 0, (10 + t * 8) | 0, (14 + t * 12) | 0);
  }

  drawText(put, 70, 36, 'ROUND', 4, 196, 168, 176);
  drawText(put, 70, 80, '7:42', 10, 243, 230, 212);

  roundRect(put, 520, 48, 1130, 210, 18, 243, 230, 212);
  drawText(put, 560, 78, 'YOUR ROLE', 4, 122, 90, 88);
  drawText(put, 560, 128, 'TAP TO SHOW', 5, 42, 24, 24);

  drawText(put, 70, 200, 'THE FIRST QUESTION WILL BE ASKED BY ALEX.', 2, 255, 106, 106);

  const players = [['ALEX', true], ['SAM', false], ['JO', false], ['KIM', false]];
  for (let i = 0; i < players.length; i++) {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 70 + col * 220, y = 250 + row * 78;
    roundRect(put, x, y, x + 204, y + 66, 10, 42, 28, 34);
    drawText(put, x + 18, y + 22, players[i][0], 3, 243, 230, 212);
    if (players[i][1]) drawText(put, x + 130, y + 26, '1ST', 2, 255, 106, 106);
  }

  const locs = [
    ['AIRPLANE', false], ['BANK', true], ['BEACH', false], ['CASINO', false],
    ['HOTEL', true], ['SCHOOL', false], ['THEATER', false], ['HOSPITAL', false],
    ['CIRCUS', false], ['EMBASSY', false], ['SUBMARINE', false], ['UNIVERSITY', true]
  ];
  for (let i = 0; i < locs.length; i++) {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 520 + col * 210, y = 240 + row * 108;
    roundRect(put, x, y, x + 196, y + 90, 12, 42, 28, 34);
    const struck = locs[i][1];
    drawText(put, x + 16, y + 32, locs[i][0], 3,
      struck ? 138 : 243, struck ? 106 : 230, struck ? 112 : 212);
    if (struck) {
      for (let xx = x + 14; xx < x + 180; xx++) put(xx, y + 46, 196, 40, 48);
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
