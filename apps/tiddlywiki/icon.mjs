// Procedural icon for TiddlyWiki: a dark rounded card holding a stack of
// tiddler pages. A new page slides in and lines of writing appear — it has
// to read as a notebook at 64px. Pure Node, super-sample → box-downsample
// → small palette. Deterministic so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [28, 32, 48];
const CARD_B = [14, 16, 28];
const PAGE = [244, 236, 214];
const PAGE_D = [214, 198, 160];
const INK = [36, 32, 28];
const GOLD = [216, 148, 72];
const RULE = [180, 72, 56];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, PAGE, PAGE_D, INK, GOLD, RULE]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
  }
  return pal;
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
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  if (x >= x0 + r && x <= x1 - r) return true;
  if (y >= y0 + r && y <= y1 - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  // A third tiddler slides in from the right, then lines of ink appear.
  const slide = t < 0.45 ? (t / 0.45) : 1;
  const write = t < 0.5 ? 0 : (t - 0.5) / 0.5;
  const pages = [
    { dx: -9, dy: -10, rot: -11, z: 0 },
    { dx: -2, dy: -3, rot: -4, z: 1 },
    { dx: 4 + (1 - slide) * 38, dy: 4, rot: 6, z: 2 },
  ];
  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 7, 22)) continue;
      let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 7) / (OUT - 14))));
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const rad = p.rot * Math.PI / 180;
        const cx = 64 + p.dx, cy = 66 + p.dy;
        const xr = (x - cx) * Math.cos(-rad) - (y - cy) * Math.sin(-rad);
        const yr = (x - cx) * Math.sin(-rad) + (y - cy) * Math.cos(-rad);
        const pw = 34, ph = 42;
        if (!inRoundRect(xr, yr, -pw, -ph, pw, ph, 5)) continue;
        const edge = !inRoundRect(xr, yr, -pw + 2.2, -ph + 2.2, pw - 2.2, ph - 2.2, 4);
        col = edge ? mix(INK, PAGE_D, 0.25) : mix(PAGE, PAGE_D, (yr + ph) / (ph * 2) * 0.35);
        // red title rule
        if (yr > -ph + 8 && yr < -ph + 11 && Math.abs(xr) < pw - 8) col = RULE;
        if (i === 2) {
          const lines = 4;
          for (let li = 0; li < lines; li++) {
            const ly = -ph + 18 + li * 8;
            const maxW = (pw - 9) * Math.max(0, Math.min(1, write * lines - li));
            if (maxW <= 0) continue;
            if (Math.abs(yr - ly) < 1.15 && xr > -pw + 8 && xr < -pw + 8 + maxW * 2) {
              col = INK;
            }
          }
        } else {
          for (let li = 0; li < 3; li++) {
            const ly = -ph + 20 + li * 9;
            const w = pw - 10 - li * 4;
            if (Math.abs(yr - ly) < 1.0 && Math.abs(xr) < w) col = mix(INK, PAGE_D, 0.45);
          }
        }
      }
      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = SS * SS;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
          r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
        }
      }
      if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
      idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
    }
  }
  return idx;
}

export function tiddlywikiIcon() {
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
  return {
    width: OUT, height: OUT, palette: flat, numColors: CT,
    minCodeSize: 6, frames, delayCs: 10, transparentIndex: 0
  };
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
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
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
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '+': [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (gph[row] & (1 << (4 - col))) {
          for (let dy = 0; dy < s; dy++) {
            for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
          }
        }
      }
    }
    cx += 6 * s;
  }
}
function fillRoundRect(put, x0, y0, x1, y1, rad, r, g, b) {
  for (let y = y0 | 0; y <= y1; y++) {
    for (let x = x0 | 0; x <= x1; x++) {
      if (inRoundRect(x, y, x0, y0, x1, y1, rad)) put(x, y, r, g, b);
    }
  }
}
function fillRect(put, x0, y0, x1, y1, r, g, b) {
  for (let y = y0 | 0; y <= y1; y++) {
    for (let x = x0 | 0; x <= x1; x++) put(x, y, r, g, b);
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
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) put(x, y, 46, 52, 64);
  }

  // Sidebar
  fillRect(put, 0, 0, 300, H, 59, 66, 82);
  fillRect(put, 300, 0, 301, H, 76, 86, 106);
  drawText(put, 28, 28, 'TIDDLYWIKI', 3, 236, 188, 120);
  drawText(put, 28, 58, 'GARDEN NOTES', 2, 180, 188, 204);
  fillRoundRect(put, 24, 92, 276, 124, 8, 76, 86, 106);
  drawText(put, 36, 102, 'SEARCH', 2, 140, 150, 168);
  drawText(put, 28, 148, 'OPEN', 2, 216, 148, 72);
  drawText(put, 28, 180, 'TOMATO NOTES', 2, 236, 232, 220);
  drawText(put, 28, 208, 'PACKING LIST', 2, 180, 188, 204);
  drawText(put, 28, 236, 'GETTINGSTARTED', 2, 180, 188, 204);
  drawText(put, 28, 300, 'TAGS', 2, 216, 148, 72);
  fillRoundRect(put, 28, 332, 130, 360, 8, 136, 192, 208);
  drawText(put, 40, 340, 'GARDEN', 2, 36, 42, 54);
  fillRoundRect(put, 140, 332, 250, 360, 8, 208, 160, 120);
  drawText(put, 152, 340, 'JOURNAL', 2, 36, 42, 54);

  // Top plus
  fillRoundRect(put, W - 72, 18, W - 24, 64, 10, 191, 97, 106);
  drawText(put, W - 56, 30, '+', 3, 255, 255, 255);

  function tiddler(x, y, w, h, title, lines, tag) {
    fillRoundRect(put, x, y, x + w, y + h, 12, 236, 233, 224);
    fillRect(put, x + 22, y + 18, x + 22 + Math.min(220, title.length * 18), y + 22, 180, 72, 56);
    drawText(put, x + 22, y + 32, title, 3, 46, 42, 38);
    let ly = y + 78;
    for (const line of lines) {
      const width = Math.min(w - 48, 20 + line * 14);
      fillRect(put, x + 22, ly, x + 22 + width, ly + 8, 90, 84, 78);
      ly += 22;
    }
    if (tag) {
      fillRoundRect(put, x + 22, y + h - 40, x + 22 + tag.length * 14 + 20, y + h - 16, 8, 136, 192, 208);
      drawText(put, x + 32, y + h - 34, tag, 2, 36, 42, 54);
    }
  }

  tiddler(340, 88, 780, 300, 'TOMATO NOTES', [42, 38, 40, 28, 36, 22], 'GARDEN');
  tiddler(340, 410, 780, 250, 'PACKING LIST', [24, 30, 18, 26, 22], 'JOURNAL');

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
