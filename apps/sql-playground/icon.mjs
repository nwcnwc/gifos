// Sticker icon: a table that fills as a query runs. Cover is mid-query with real rows.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD = [14, 20, 28];
const CARDD = [8, 12, 18];
const INK = [232, 238, 244];
const TEAL = [61, 190, 160];
const HEAD = [26, 36, 48];
const LINE = [36, 48, 62];
const ROW = [18, 26, 36];
const MUTED = [139, 151, 166];
const OUTLINE = [6, 8, 12];

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
function inRound(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  if (x >= x0 + r && x <= x1 - r) return true;
  if (y >= y0 + r && y <= y1 - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, CARDD, INK, TEAL, HEAD, LINE, ROW, MUTED, OUTLINE, [255, 255, 255]]) {
    pal.push(b);
    for (let s = 1; s <= 2; s++) pal.push(mix(b, [255, 255, 255], s * 0.14).map(Math.round));
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
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  ':': [0, 0b00100, 0b00100, 0, 0b00100, 0b00100, 0],
  ',': [0, 0, 0, 0, 0b00100, 0b00100, 0b01000],
  "'": [0b00100, 0b00100, 0, 0, 0, 0, 0],
  '*': [0b00100, 0b10101, 0b01110, 0b00100, 0b01110, 0b10101, 0b00100],
  '/': [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  '+': [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  '=': [0, 0b11111, 0, 0, 0b11111, 0, 0],
  '(': [0b00100, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b00100],
  ')': [0b00100, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b00100],
  '>': [0b01000, 0b00100, 0b00010, 0b00001, 0b00010, 0b00100, 0b01000],
  '<': [0b00010, 0b00100, 0b01000, 0b10000, 0b01000, 0b00100, 0b00010],
  '_': [0, 0, 0, 0, 0, 0, 0b11111],
  ';': [0, 0, 0, 0, 0b00100, 0b00100, 0b01000],
};

function glyphAt(ch, col, row) {
  const g = GLYPHS[String(ch).toUpperCase()];
  if (!g) return false;
  return !!(g[row] & (1 << (4 - col)));
}

function plotGlyph(colRef, str, ox, oy, s, rgb, x, y) {
  let cxp = ox;
  let hit = colRef;
  for (const ch of str) {
    for (let row = 0; row < 7; row++) for (let coln = 0; coln < 5; coln++) {
      if (!glyphAt(ch, coln, row)) continue;
      const px1 = cxp + coln * s, py1 = oy + row * s;
      if (x >= px1 && x < px1 + s && y >= py1 && y < py1 + s) hit = rgb;
    }
    cxp += 6 * s;
  }
  return hit;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  const qLen = 52 + t * 40;
  const rowsOn = Math.max(0, Math.min(4, Math.floor((t - 0.22) * 9)));
  const litRow = rowsOn > 0 ? Math.min(4, rowsOn) : 0;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    let col = null;
    if (inCard(x, y, 10, 18)) col = OUTLINE;
    if (inCard(x, y, 12, 16)) col = mix(CARD, CARDD, (y - 12) / 104);
    if (inRound(x, y, 20, 20, 108, 42, 6)) col = HEAD;
    col = plotGlyph(col, 'SQL', 28, 24, 2.2, TEAL, x, y);
    if (x > 70 && x < 70 + qLen && y > 28 && y < 34) col = mix(TEAL, INK, 0.35);
    if (t > 0.12 && x > 70 && x < 102 && y > 36 && y < 39) col = LINE;

    const gx0 = 20, gy0 = 50, cw = [52, 22], ch = 16;
    for (let r = 0; r < 5; r++) {
      const y0 = gy0 + r * ch;
      for (let c = 0; c < 2; c++) {
        const x0 = gx0 + (c === 0 ? 0 : cw[0] + 4);
        const w = cw[c];
        if (!inRound(x, y, x0, y0 + 1, x0 + w, y0 + ch - 2, 3)) continue;
        if (r === 0) col = HEAD;
        else if (r <= litRow) col = r === litRow ? mix(ROW, TEAL, 0.45) : ROW;
        else col = mix(CARD, LINE, 0.4);
        if (r === 0) {
          const barW = c === 0 ? 28 : 10;
          if (y > y0 + 5 && y < y0 + 11 && x > x0 + 6 && x < x0 + 6 + barW) col = TEAL;
        } else if (r <= litRow) {
          const barW = c === 0 ? 22 + r * 4 : 8;
          if (y > y0 + 5 && y < y0 + 11 && x > x0 + 6 && x < x0 + 6 + barW) col = r === litRow ? INK : MUTED;
        }
      }
    }
    if (!col) continue;
    const o = (py * RW + px) * 4;
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

export function sqlPlaygroundIcon() {
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

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) throw new Error('missing glyph for ' + JSON.stringify(ch));
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (gph[row] & (1 << (4 - col))) {
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
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

  fill(0, 0, W, H, 11, 15, 20);
  drawText(put, 36, 22, 'SQL PLAYGROUND', 5, 232, 238, 244);
  drawText(put, 36, 66, 'THE DATABASE LIVES IN THIS FILE.', 2, 139, 151, 166);

  const btns = [
    [36, 102, 150, 146, 61, 190, 160, 'RUN', 6, 34, 27],
    [162, 102, 310, 146, 26, 34, 44, 'EXPLAIN', 232, 238, 244],
    [322, 102, 454, 146, 26, 34, 44, 'SAMPLE', 232, 238, 244],
    [466, 102, 560, 146, 26, 34, 44, 'OPEN', 232, 238, 244],
    [572, 102, 666, 146, 26, 34, 44, 'SAVE', 232, 238, 244]
  ];
  for (const b of btns) {
    fill(b[0], b[1], b[2], b[3], b[4], b[5], b[6]);
    const tw = String(b[7]).length * 6 * 2;
    drawText(put, b[0] + Math.floor((b[2] - b[0] - tw) / 2), b[1] + 12, b[7], 2, b[8], b[9], b[10]);
  }

  fill(36, 166, 280, 680, 20, 26, 34);
  drawText(put, 52, 180, 'TABLES', 2, 139, 151, 166);
  const schema = [
    [52, 220, 'ARTISTS      8', 232, 238, 244],
    [52, 256, 'ALBUMS      10', 232, 238, 244],
    [52, 292, 'TRACKS      24', 61, 190, 160],
    [72, 328, 'ID INTEGER PK', 139, 151, 166],
    [72, 356, 'NAME TEXT', 139, 151, 166],
    [72, 384, 'ALBUM ID INT', 139, 151, 166],
    [72, 412, 'MS INTEGER', 139, 151, 166],
    [72, 440, 'GENRE TEXT', 139, 151, 166],
    [52, 484, 'CUSTOMERS    6', 232, 238, 244],
    [52, 520, 'INVOICES     8', 232, 238, 244],
    [52, 556, 'INVOICE LINES 18', 232, 238, 244]
  ];
  for (const s of schema) drawText(put, s[0], s[1], s[2], 2, s[3], s[4], s[5]);

  fill(296, 166, 1164, 360, 16, 22, 29);
  const sql = [
    [312, 176, 'SELECT AR.NAME AS ARTIST, AL.TITLE AS ALBUM,'],
    [312, 208, '       COUNT(T.ID) AS TRACKS,'],
    [312, 240, '       ROUND(SUM(T.MS) / 60000.0, 1) AS MINUTES'],
    [312, 272, 'FROM ARTISTS AR JOIN ALBUMS AL ON AL.ARTIST_ID = AR.ID'],
    [312, 304, 'JOIN TRACKS T ON T.ALBUM_ID = AL.ID'],
    [312, 336, 'GROUP BY AL.ID ORDER BY MINUTES DESC;']
  ];
  for (const line of sql) drawText(put, line[0], line[1], line[2], 2, 157, 222, 184);

  fill(296, 376, 1164, 640, 20, 26, 34);
  fill(296, 376, 1164, 416, 26, 36, 48);
  drawText(put, 312, 388, 'ARTIST              ALBUM                 TRACKS   MINUTES', 2, 139, 151, 166);
  const rows = [
    ['CANNONBALL ADDERLEY', 'SOMETHIN ELSE', '4', '35.3'],
    ['JOHN COLTRANE', 'A LOVE SUPREME', '3', '32.9'],
    ['MILES DAVIS', 'KIND OF BLUE', '3', '24.6'],
    ['MILES DAVIS', 'SKETCHES OF SPAIN', '2', '21.8'],
    ['JOHN COLTRANE', 'BLUE TRAIN', '2', '19.9'],
    ['CHARLES MINGUS', 'MINGUS AH UM', '2', '13.1']
  ];
  rows.forEach((row, i) => {
    const y = 432 + i * 32;
    drawText(put, 312, y, row[0], 2, 232, 238, 244);
    drawText(put, 560, y, row[1], 2, 232, 238, 244);
    drawText(put, 900, y, row[2], 2, 157, 222, 184);
    drawText(put, 1020, y, row[3], 2, 157, 222, 184);
  });

  drawText(put, 36, 692, '10 ROWS  2 MS     PRESS INVITE TO SHARE THIS DATABASE.', 2, 139, 151, 166);

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
