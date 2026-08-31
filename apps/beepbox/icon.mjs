// Procedural BeepBox icon: a dark card holding a piano-roll. Notes sit on
// the grid and a white playhead walks left to right — the thing the tracker
// is for. Pure Node, super-sample → box-downsample → small palette.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [18, 18, 22];
const CARD_B = [6, 6, 10];
const GRID = [48, 48, 52];
const TONIC = [96, 72, 48];
const NOTE1 = [37, 243, 255];
const NOTE2 = [255, 255, 37];
const NOTE3 = [255, 151, 82];
const DRUM = [200, 200, 210];
const HEAD = [255, 255, 255];
const LOOP = [119, 68, 255];
const INK = [12, 12, 16];

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
function inRoundRect(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  if (x >= x0 + r && x <= x0 + w - r) return true;
  if (y >= y0 + r && y <= y0 + h - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, GRID, TONIC, NOTE1, NOTE2, NOTE3, DRUM, HEAD, LOOP, INK]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
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

// pitch rows 0 (high) .. 7 (low). x in 0..31 ticks of one bar.
const MELODY = [
  [0, 2, 4], [2, 2, 2], [4, 2, 0], [6, 2, 1],
  [8, 4, 2], [12, 4, 4], [16, 4, 0], [20, 4, 1], [24, 4, 2], [28, 4, 4],
];
const BASS = [[0, 4, 7], [8, 4, 5], [16, 4, 4], [24, 4, 7]];
const DRUMS = [[0, 2], [8, 2], [16, 2], [24, 2]];

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const gx0 = 16, gy0 = 22, gw = 96, gh = 64, rows = 8, ticks = 32;
  const playX = gx0 + (f / FRAMES) * gw;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    const o = (py * RW + px) * 4;
    if (!inCard(x, y, 6, 18)) continue;
    let col = mix(CARD_A, CARD_B, y / OUT);
    if (x >= gx0 && x <= gx0 + gw && y >= gy0 && y <= gy0 + gh) {
      const row = Math.floor((y - gy0) / (gh / rows));
      col = (row === 7 || row === 3) ? TONIC : GRID;
      if (((x - gx0) / (gw / 8) | 0) % 2 === 0) col = mix(col, CARD_B, 0.12);
    }
    function paintNote(t0, dur, row, rgb) {
      const nx = gx0 + (t0 / ticks) * gw;
      const nw = (dur / ticks) * gw - 1.2;
      const ny = gy0 + row * (gh / rows) + 1;
      const nh = gh / rows - 2;
      if (inRoundRect(x, y, nx, ny, nw, nh, 1.4)) col = rgb;
    }
    for (const n of MELODY) paintNote(n[0], n[1], n[2], NOTE1);
    for (const n of BASS) paintNote(n[0], n[1], n[2], NOTE2);
    for (const n of DRUMS) paintNote(n[0], n[1], 7, DRUM);
    if (x >= gx0 && x <= gx0 + gw && Math.abs(x - playX) < 1.4 && y >= gy0 && y <= gy0 + gh) col = HEAD;
    if (inRoundRect(x, y, gx0, 94, gw * 0.28, 6, 2)) col = LOOP;
    if (inRoundRect(x, y, 22, 106, 18, 10, 2)) col = mix(NOTE1, INK, 0.15);
    if (inRoundRect(x, y, 44, 106, 18, 10, 2)) col = mix(HEAD, GRID, 0.4);
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

export function beepboxIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0;
    flat[i * 3 + 1] = pal[i][1] | 0;
    flat[i * 3 + 2] = pal[i][2] | 0;
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
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  3: [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  5: [0b11111, 0b10000, 0b10000, 0b11110, 0b00001, 0b00001, 0b11110],
  6: [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
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
  fill(0, 0, W, H, 0, 0, 0);

  const gx = 70, gy = 70, gw = 820, gh = 430;
  const rows = 12, beats = 8;
  for (let row = 0; row < rows; row++) {
    const y0 = gy + row * (gh / rows);
    const y1 = y0 + gh / rows;
    const isTonic = row % 5 === 0;
    if (isTonic) fill(gx, y0, gx + gw, y1, 80, 60, 40);
    else fill(gx, y0, gx + gw, y1, 40, 40, 44);
    if (row % 2 === 0) {
      if (isTonic) fill(gx, y0, gx + gw, y1, 70, 52, 34);
      else fill(gx, y0, gx + gw, y1, 34, 34, 38);
    }
  }
  for (let b = 1; b < beats; b++) {
    const x = gx + (b / beats) * gw;
    fill(x, gy, x + 2, gy + gh, 28, 28, 32);
  }

  function noteBox(beat0, beat1, row, r, g, b) {
    const x0 = gx + (beat0 / beats) * gw + 4;
    const x1 = gx + (beat1 / beats) * gw - 4;
    const y0 = gy + row * (gh / rows) + 4;
    const y1 = y0 + gh / rows - 8;
    fill(x0, y0, x1, y1, r, g, b);
  }
  noteBox(0, 0.5, 4, 37, 243, 255);
  noteBox(0.5, 1, 2, 37, 243, 255);
  noteBox(1, 1.5, 0, 37, 243, 255);
  noteBox(1.5, 2, 1, 37, 243, 255);
  noteBox(2, 3, 2, 146, 249, 255);
  noteBox(3, 4, 4, 37, 243, 255);
  noteBox(4, 5, 0, 37, 243, 255);
  noteBox(5, 6, 1, 146, 249, 255);
  noteBox(6, 7, 2, 37, 243, 255);
  noteBox(7, 8, 4, 37, 243, 255);
  noteBox(0, 1, 9, 255, 255, 37);
  noteBox(2, 3, 8, 255, 255, 37);
  noteBox(4, 5, 7, 255, 255, 37);
  noteBox(6, 7, 9, 255, 255, 37);
  noteBox(0, 2, 6, 255, 151, 82);
  noteBox(4, 6, 5, 255, 151, 82);
  noteBox(0, 0.4, 11, 224, 224, 230);
  noteBox(2, 2.4, 11, 224, 224, 230);
  noteBox(2, 2.4, 10, 170, 170, 180);
  noteBox(4, 4.4, 11, 224, 224, 230);
  noteBox(6, 6.4, 11, 224, 224, 230);
  noteBox(6, 6.4, 10, 170, 170, 180);

  const playX = gx + gw * 0.42;
  fill(playX, gy - 8, playX + 3, gy + gh + 8, 255, 255, 255);

  const ty = gy + gh + 24;
  for (let i = 0; i < 16; i++) {
    const x0 = gx + i * 48;
    const on = i < 4;
    if (on) fill(x0, ty, x0 + 42, ty + 42, 68, 68, 80);
    else fill(x0, ty, x0 + 42, ty + 42, 36, 36, 42);
    const label = String(i + 1);
    const ox = label.length > 1 ? x0 + 4 : x0 + 12;
    if (on) drawText(put, ox, ty + 12, label, 3, 255, 255, 255);
    else drawText(put, ox, ty + 12, label, 3, 140, 140, 150);
  }
  fill(gx, ty + 48, gx + 42 * 4 + 18, ty + 58, 119, 68, 255);

  fill(920, 70, 1170, 650, 16, 16, 20);
  drawText(put, 940, 90, 'BEEPBOX', 4, 37, 243, 255);
  drawText(put, 940, 140, 'EASY  C', 3, 200, 200, 210);
  drawText(put, 940, 190, 'TEMPO', 2, 150, 150, 160);
  fill(940, 220, 1140, 236, 68, 68, 72);
  fill(940, 220, 1080, 236, 37, 243, 255);
  drawText(put, 940, 260, 'CHIP SQUARE', 2, 255, 255, 37);
  drawText(put, 940, 310, 'PLAY', 3, 255, 255, 255);
  fill(940, 350, 1020, 410, 37, 243, 255);
  drawText(put, 940, 430, '2 JAMMING', 2, 37, 243, 255);
  drawText(put, 940, 480, 'THE SONG', 2, 180, 180, 190);
  drawText(put, 940, 510, 'IS IN THE', 2, 180, 180, 190);
  drawText(put, 940, 540, 'FILE', 2, 180, 180, 190);

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
