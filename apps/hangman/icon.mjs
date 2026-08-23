// Procedural Hangman icon: dark card, gray gallows, the figure filling in.
// Pure Node, super-sample → box-downsample → small palette. Deterministic.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 9;

const CARD_A = [28, 30, 38];
const CARD_B = [16, 18, 24];
const STEEL = [168, 172, 184];
const STEEL_D = [110, 114, 126];
const ROPE = [196, 154, 88];
const SKIN = [210, 210, 216];
const INK = [236, 236, 242];
const BAD = [196, 80, 80];

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
  for (const b of [CARD_A, CARD_B, STEEL, STEEL_D, ROPE, SKIN, INK, BAD]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.3).map(Math.round));
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

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 6, rad = 22;
  // Frames 0–6 are the six stages plus empty; 7–8 hold the finished figure
  // so the loop reads as "the gallows filling in", not a flicker.
  const stage = Math.min(6, f);
  const poleX = 36, top = 20, beam = 100, foot = 112;
  const hx = 94, hy = 40;

  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      const wood = (d, w) => d < w;
      if (wood(distSeg(x, y, poleX, top, poleX, foot), 3.6) ||
          wood(distSeg(x, y, poleX - 2, top, beam, top), 3.4) ||
          wood(distSeg(x, y, poleX, top + 16, poleX + 16, top + 2), 2.4) ||
          wood(distSeg(x, y, poleX - 14, foot, poleX + 16, foot), 3.4)) {
        col = mix(STEEL, STEEL_D, (x + y) % 9 > 5 ? 0.25 : 0);
      }
      if (distSeg(x, y, hx, top, hx, hy - 11) < 1.6) col = ROPE;
      const dx = x - hx, dy = y - hy;
      if (stage >= 1 && dx * dx + dy * dy <= 11 * 11) {
        col = SKIN;
        if (dx * dx + dy * dy > 9.4 * 9.4) col = STEEL_D;
        if (Math.abs(dx + 4) < 1.3 && Math.abs(dy + 2) < 1.3) col = STEEL_D;
        if (Math.abs(dx - 4) < 1.3 && Math.abs(dy + 2) < 1.3) col = STEEL_D;
        if (stage >= 6 && dy > 2 && Math.abs(dx) < 4 && Math.abs(dy - 4) < 1.2) col = BAD;
      }
      if (stage >= 2) {
        const bx = hx, by = hy + 14;
        const ox = (x - bx) / 10, oy = (y - by) / 16;
        if (ox * ox + oy * oy <= 1) {
          col = SKIN;
          if (Math.abs(ox) < 0.2 && Math.abs(oy) < 0.42) col = STEEL_D;
          if (Math.abs(oy) < 0.16 && Math.abs(ox) < 0.42) col = STEEL_D;
        }
      }
      if (stage >= 3 && distSeg(x, y, hx - 7, hy + 16, hx - 20, hy + 34) < 2.0) col = SKIN;
      if (stage >= 4 && distSeg(x, y, hx + 7, hy + 16, hx + 20, hy + 34) < 2.0) col = SKIN;
      if (stage >= 5 && distSeg(x, y, hx - 4, hy + 30, hx - 12, hy + 50) < 2.0) col = SKIN;
      if (stage >= 6 && distSeg(x, y, hx + 4, hy + 30, hx + 12, hy + 50) < 2.0) col = SKIN;
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

export function hangmanIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 16, transparentIndex: 0 };
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
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '_': [0, 0, 0, 0, 0, 0, 0b11111],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '6': [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch] || GLYPHS[ch.toUpperCase()];
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
  const rr = (x0, y0, x1, y1, rad, r, g, b) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
      const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
    }
  };
  const stroke = (x1, y1, x2, y2, w, r, g, b) => {
    const x0 = Math.min(x1, x2) - w - 1, xN = Math.max(x1, x2) + w + 1;
    const y0 = Math.min(y1, y2) - w - 1, yN = Math.max(y1, y2) + w + 1;
    for (let y = y0; y <= yN; y++) for (let x = x0; x <= xN; x++) {
      if (distSeg(x, y, x1, y1, x2, y2) <= w) put(x, y, r, g, b);
    }
  };
  const circle = (cx, cy, R, r, g, b) => {
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= R * R) put(x, y, r, g, b);
    }
  };

  fill(0, 0, W, H, 18, 20, 26);

  drawText(put, 56, 48, 'HANGMAN', 8, 236, 236, 242);
  drawText(put, 56, 122, '3 OF 6', 4, 224, 112, 112);

  rr(56, 186, 248, 250, 22, 28, 30, 38);
  rr(264, 186, 456, 250, 22, 28, 30, 38);
  rr(472, 186, 620, 250, 22, 38, 40, 50);
  rr(632, 186, 790, 250, 22, 28, 30, 38);
  drawText(put, 78, 206, 'YOU', 4, 125, 206, 160);
  drawText(put, 286, 206, 'SAM', 4, 236, 236, 242);
  drawText(put, 490, 206, 'RACE', 4, 236, 236, 242);
  drawText(put, 650, 206, 'SHARE', 4, 154, 158, 176);

  const known = { P: 1, Y: 1, T: 1, O: 1, N: 1 };
  let tx = 56;
  for (const ch of 'PYTHON') {
    rr(tx, 300, tx + 72, 392, 10, 26, 28, 36);
    if (known[ch]) drawText(put, tx + 16, 322, ch, 7, 236, 236, 242);
    fill(tx, 384, tx + 72, 392, ch === 'H' ? 168 : 125, ch === 'H' ? 172 : 206, ch === 'H' ? 184 : 160);
    tx += 84;
  }

  drawText(put, 56, 430, 'A PROGRAMMING LANGUAGE', 3, 154, 158, 176);

  const keys = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
  ];
  const ok = { P: 1, Y: 1, T: 1, O: 1, N: 1 };
  const bad = { E: 1, S: 1, W: 1 };
  keys.forEach((row, ri) => {
    const inset = ri === 0 ? 0 : ri === 1 ? 28 : 78;
    row.forEach((ch, i) => {
      const x = 56 + inset + i * 62;
      const y = 488 + ri * 68;
      let r = 38, g = 40, b = 48;
      let tr = 236, tg = 236, tb = 242;
      if (ok[ch]) { r = 26; g = 50; b = 40; tr = 125; tg = 206; tb = 160; }
      if (bad[ch]) { r = 58; g = 30; b = 34; tr = 224; tg = 112; tb = 112; }
      rr(x, y, x + 54, y + 56, 8, r, g, b);
      drawText(put, x + 14, y + 14, ch, 4, tr, tg, tb);
    });
  });

  const poleX = 900, top = 70, beam = 1120, foot = 640;
  const hx = 1090, hy = 200;
  stroke(poleX, top, poleX, foot, 12, 168, 172, 184);
  stroke(poleX - 6, top, beam, top, 12, 168, 172, 184);
  stroke(poleX, top + 52, poleX + 48, top + 8, 8, 140, 144, 156);
  stroke(poleX - 44, foot, poleX + 54, foot, 12, 168, 172, 184);
  stroke(hx, top, hx, hy - 38, 5, 196, 154, 88);
  circle(hx, hy, 38, 210, 210, 216);
  circle(hx, hy, 34, 200, 200, 208);
  fill(hx - 8, hy - 8, hx - 3, hy - 3, 58, 62, 72);
  fill(hx + 3, hy - 8, hx + 8, hy - 3, 58, 62, 72);
  fill(hx - 12, hy + 10, hx + 12, hy + 14, 90, 94, 104);
  for (let y = hy + 42; y < hy + 158; y++) for (let x = hx - 42; x < hx + 42; x++) {
    const ox = (x - hx) / 38, oy = (y - (hy + 100)) / 58;
    if (ox * ox + oy * oy <= 1) put(x, y, 210, 210, 216);
  }
  stroke(hx - 22, hy + 72, hx - 78, hy + 128, 8, 210, 210, 216);

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
