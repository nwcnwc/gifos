// Procedural Math Race icon: 9 + 4 is solved, YOU jumps past SAM, next equation.
// Thick glyphs + spaced operator so it still reads at 64px Home Screen size.
// Pure Node, super-sample → box-downsample → small palette. Deterministic.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [22, 24, 34];
const CARD_B = [10, 10, 16];
const FG = [242, 244, 250];
const MUTED = [154, 160, 184];
const GREEN = [125, 255, 154];
const GREEN_D = [40, 140, 70];
const RED = [255, 107, 122];
const AMBER = [255, 193, 77];
const INK = [10, 10, 15];

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
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, FG, MUTED, GREEN, GREEN_D, RED, AMBER, INK]) {
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

// 5×7 caps. Bit 4 is the left column.
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
  '+': [0b00100, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00100],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '×': [0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0, 0],
  '=': [0, 0b11111, 0, 0, 0b11111, 0, 0],
  ':': [0, 0b00100, 0, 0, 0, 0b00100, 0],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
};

function glyphAt(ch, col, row) {
  const g = GLYPHS[ch] || GLYPHS[String(ch).toUpperCase()];
  if (!g) return false;
  return !!(g[row] & (1 << (4 - col)));
}

function inPill(x, y, cx, cy, rx, ry) {
  const ox = (x - cx) / rx, oy = (y - cy) / ry;
  return ox * ox + oy * oy <= 1;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 6, rad = 22;
  // Story at a glance: 9 + 4 is solved, YOU 7→8 jumps past SAM 6, then 3 × 6.
  // Clock ticks. Thick glyphs so it still reads at 64px Home Screen size.
  let eq = ['9', '+', '4'], ans = '', you = '7', sam = '6', glow = 0, pop = 1;
  if (f === 2) ans = '1';
  if (f === 3) ans = '13';
  if (f === 4) { ans = '13'; glow = 1; }
  if (f === 5) { ans = '13'; glow = 0.7; pop = 1.12; }
  if (f === 6) { ans = '13'; you = '8'; pop = 1.28; glow = 0.4; }
  if (f === 7) { ans = '13'; you = '8'; pop = 1.08; }
  if (f === 8) { eq = ['3', '×', '6']; ans = ''; you = '8'; }
  if (f === 9) { eq = ['3', '×', '6']; ans = ''; you = '8'; }
  if (f === 10) { eq = ['3', '×', '6']; ans = '1'; you = '8'; }
  if (f === 11) { eq = ['3', '×', '6']; ans = '18'; you = '8'; glow = 0.3; }

  const eqS = 3.55, ansS = 2.7, scS = 2.45;
  const barW = 88, barH = 7, barX = (OUT - barW) / 2, barY = 16;
  const frac = (12 - (f < 8 ? 0 : f - 6)) / 12;

  // Circular stamp per glyph pixel — 1px bars vanish at 64px.
  function hitCh(ch, x0, y0, s, x, y) {
    const r = 0.72 * s;
    const r2 = r * r;
    for (let gr = 0; gr < 7; gr++) for (let gc = 0; gc < 5; gc++) {
      if (!glyphAt(ch, gc, gr)) continue;
      const dx = x - (x0 + (gc + 0.5) * s);
      const dy = y - (y0 + (gr + 0.5) * s);
      if (dx * dx + dy * dy <= r2) return true;
    }
    return false;
  }
  function textW(str, s, tracking) {
    const t = tracking == null ? 6.35 : tracking;
    return str.length * t * s - (t - 5) * s;
  }
  function hitStr(str, x0, y0, s, x, y, tracking) {
    const t = tracking == null ? 6.35 : tracking;
    let cx = x0;
    for (let i = 0; i < str.length; i++) {
      if (hitCh(str[i], cx, y0, s, x, y)) return true;
      cx += t * s;
    }
    return false;
  }
  // Fat gap around a slightly smaller operator so "9+4" never reads "94".
  const gap = eqS * 9.6;
  const opS = eqS * 0.82;
  const eqW = eqS * 5 * 2 + gap;
  const eqX0 = (OUT - eqW) / 2;
  const eqY = 30;
  const opX = eqX0 + eqS * 5 + (gap - opS * 5) / 2;
  const bX = eqX0 + eqS * 5 + gap;
  const ansX = ans ? (OUT - textW(ans, ansS, 6.5)) / 2 : 0;
  const ansY = 62;
  const barCol = f >= 9 ? RED : AMBER;
  const ansCol = glow > 0.25 ? GREEN : FG;
  const youS = scS * pop;
  const youCx = 40, youCy = 108, youRx = 24 * pop, youRy = 14 * pop;
  const samCx = 90, samCy = 108, samRx = 24, samRy = 14;
  const youTX = youCx - textW(you, youS, 6.4) / 2;
  const youTY = youCy - 3.5 * youS;
  const samTX = samCx - textW(sam, scS, 6.4) / 2;
  const samTY = samCy - 3.5 * scS;

  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      if (glow > 0) col = mix(col, GREEN_D, glow * 0.5);

      // shrinking time bar — the clock, without eating equation space
      if (x >= barX && x <= barX + barW && y >= barY && y <= barY + barH) {
        const filled = (x - barX) / barW <= frac;
        col = filled ? barCol : mix(CARD_B, MUTED, 0.25);
      }

      if (hitCh(eq[0], eqX0, eqY, eqS, x, y)) col = FG;
      if (hitCh(eq[1], opX, eqY + (eqS - opS) * 3.5, opS, x, y)) col = mix(GREEN, FG, 0.2);
      if (hitCh(eq[2], bX, eqY, eqS, x, y)) col = FG;
      if (hitCh('=', (OUT - 5 * ansS * 0.7) / 2, ansY - 2, ansS * 0.55, x, y)) col = MUTED;
      if (ans && hitStr(ans, ansX, ansY + 10, ansS, x, y, 6.5)) col = ansCol;

      if (inPill(x, y, youCx, youCy, youRx, youRy)) {
        col = mix(GREEN_D, GREEN, 0.4 + (f === 6 ? 0.4 : 0));
        if (hitStr(you, youTX, youTY, youS, x, y, 6.4)) col = INK;
      }
      if (inPill(x, y, samCx, samCy, samRx, samRy)) {
        col = mix(CARD_A, MUTED, 0.22);
        if (hitStr(sam, samTX, samTY, scS, x, y, 6.4)) col = FG;
      }
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

export function mathRaceIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
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

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str) {
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
  const rr = (x0, y0, x1, y1, rad, r, g, b) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
      const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
    }
  };

  fill(0, 0, W, H, 10, 10, 15);
  for (let y = 0; y < 220; y++) for (let x = 0; x < W; x++) {
    const t = 1 - y / 220;
    put(x, y, (10 + 12 * t) | 0, (10 + 22 * t) | 0, (15 + 14 * t) | 0);
  }

  drawText(put, 56, 40, 'MATH RACE', 6, 242, 244, 250);
  rr(920, 36, 1144, 92, 22, 20, 20, 28);
  drawText(put, 948, 50, '0:23', 5, 255, 107, 122);

  rr(48, 130, 760, 430, 28, 20, 20, 28);
  rr(56, 138, 752, 422, 24, 16, 40, 24);
  drawText(put, 130, 180, '14 - 6', 14, 242, 244, 250);
  drawText(put, 330, 300, '=', 8, 154, 160, 184);
  drawText(put, 430, 288, '8', 14, 125, 255, 154);

  rr(48, 454, 370, 560, 18, 28, 28, 40);
  rr(390, 454, 712, 560, 18, 28, 28, 40);
  drawText(put, 72, 488, 'YOU', 4, 154, 160, 184);
  drawText(put, 250, 478, '12', 7, 125, 255, 154);
  drawText(put, 414, 488, 'SAM', 4, 154, 160, 184);
  drawText(put, 592, 478, '9', 7, 242, 244, 250);

  drawText(put, 56, 590, 'SAME EQUATION', 3, 154, 160, 184);
  drawText(put, 56, 630, 'FIRST CORRECT SCORES', 3, 125, 255, 154);
  drawText(put, 56, 670, 'NO GAME SERVER', 3, 255, 193, 77);

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '0', 'GO'];
  const kx0 = 790, ky0 = 140, kw = 110, kh = 86, gap = 12;
  for (let i = 0; i < keys.length; i++) {
    const c = i % 3, r = (i / 3) | 0;
    const x0 = kx0 + c * (kw + gap), y0 = ky0 + r * (kh + gap);
    const go = keys[i] === 'GO';
    rr(x0, y0, x0 + kw, y0 + kh, 16, go ? 125 : 26, go ? 255 : 26, go ? 154 : 38);
    const tw = keys[i].length * 6 * 4;
    drawText(put, x0 + (kw - tw) / 2, y0 + 26, keys[i], 4, go ? 10 : 242, go ? 10 : 244, go ? 15 : 250);
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
