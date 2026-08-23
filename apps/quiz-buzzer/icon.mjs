// Procedural icon: a dark card, four coloured pads, a buzzer lighting,
// a score ticking. Pure Node, super-sample → box-downsample. Deterministic.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [14, 14, 22];
const CARD_D = [8, 8, 14];
const RED = [226, 61, 61];
const RED_H = [255, 130, 130];
const BLUE = [47, 127, 224];
const BLUE_H = [110, 180, 255];
const GOLD = [230, 192, 30];
const GOLD_H = [255, 230, 110];
const GREEN = [43, 182, 115];
const GREEN_H = [120, 235, 170];
const INK = [242, 242, 248];
const MUTED = [154, 160, 180];
const BUZZ = [232, 64, 72];
const BUZZ_H = [255, 160, 160];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, CARD_D, RED, RED_H, BLUE, BLUE_H, GOLD, GOLD_H, GREEN, GREEN_H, INK, MUTED, BUZZ, BUZZ_H]) {
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
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  if (x >= x0 + r && x <= x1 - r) return true;
  if (y >= y0 + r && y <= y1 - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  // Red pad lights, sinks, then a white ring — a buzzer, not a wiggle.
  const press = Math.max(0, Math.min(1, (t - 0.08) / 0.32));
  const glow = Math.sin(Math.min(1, Math.max(0, (t - 0.14) / 0.5)) * Math.PI);
  const score = Math.min(3, Math.max(0, Math.floor((t - 0.38) * 7)));
  const sink = press * 4;
  const pads = [
    { x0: 12, y0: 36 + sink, x1: 61, y1: 78 + sink, hi: RED_H, lo: RED, buzz: true },
    { x0: 67, y0: 36, x1: 116, y1: 78, hi: BLUE_H, lo: BLUE, buzz: false },
    { x0: 12, y0: 82, x1: 61, y1: 118, hi: GOLD_H, lo: GOLD, buzz: false },
    { x0: 67, y0: 82, x1: 116, y1: 118, hi: GREEN_H, lo: GREEN, buzz: false },
  ];
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, 5, 24)) {
      a = 1;
      col = mix(CARD, CARD_D, Math.max(0, Math.min(1, (x + y) / (OUT * 2))));
      for (let i = 0; i < 4; i++) {
        const p = pads[i];
        if (inRoundRect(x, y, p.x0, p.y0, p.x1, p.y1, 11)) {
          const u = (x - p.x0) / (p.x1 - p.x0);
          const lit = p.buzz ? 0.18 + press * 0.95 : 0.16;
          col = mix(p.lo, p.hi, lit * (0.4 + u * 0.6));
          if (p.buzz && glow > 0.04) {
            const inset = 5.5 - glow * 1.4;
            const onRing = !inRoundRect(x, y, p.x0 + inset, p.y0 + inset, p.x1 - inset, p.y1 - inset, 8);
            if (onRing) col = mix(col, [255, 255, 255], Math.min(1, glow * 1.15));
            else col = mix(col, [255, 220, 220], glow * 0.35);
          }
        }
      }
      // score pips tick — large enough to read at 64px
      for (let s = 0; s < 3; s++) {
        const sx = 28 + s * 24, sy = 20;
        const dd = Math.hypot(x - sx, y - sy);
        if (dd <= 7.2) {
          col = s < score ? mix(GOLD_H, GOLD, (x - sx + 7) / 14) : mix(MUTED, CARD, 0.35);
        } else if (dd <= 8.6 && s < score) {
          col = mix(col, GOLD_H, 0.7);
        }
      }
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

export function quizBuzzerIcon() {
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

const GLYPHS = {
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'J': [0b11111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
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
  'X': [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  'Z': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  '3': [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  '4': [0b10001, 0b10001, 0b10001, 0b11111, 0b00001, 0b00001, 0b00001],
  '5': [0b11111, 0b10000, 0b10000, 0b11110, 0b00001, 0b10001, 0b01110],
  '6': [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b00100, 0b00100, 0b00100],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '?': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0, 0b00100],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
  ':': [0, 0b00100, 0, 0, 0, 0b00100, 0],
  '.': [0, 0, 0, 0, 0, 0, 0b00100],
  "'": [0b00100, 0b00100, 0b01000, 0, 0, 0, 0],
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
  const fillRound = (x0, y0, x1, y1, rad, r, g, b) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (inRoundRect(x, y, x0, y0, x1 - 1, y1 - 1, rad)) put(x, y, r, g, b);
    }
  };

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = (x + y) / (W + H);
    put(x, y, (10 + t * 10) | 0, (10 + t * 8) | 0, (15 + t * 14) | 0);
  }

  drawText(put, 48, 36, 'QUIZ BUZZER', 5, 242, 242, 248);
  drawText(put, 980, 36, 'LIVE 08', 4, 255, 122, 130);
  drawText(put, 48, 96, 'SCIENCE', 3, 230, 192, 30);
  drawText(put, 48, 140, 'WHICH PLANET HAS', 5, 242, 242, 248);
  drawText(put, 48, 190, 'THE GREAT RED SPOT?', 5, 242, 242, 248);

  const pads = [
    { x: 48, y: 280, w: 360, h: 170, c: [226, 61, 61], label: 'JUPITER', win: true },
    { x: 428, y: 280, w: 360, h: 170, c: [47, 127, 224], label: 'SATURN', win: false },
    { x: 48, y: 470, w: 360, h: 170, c: [230, 192, 30], label: 'MARS', win: false },
    { x: 428, y: 470, w: 360, h: 170, c: [43, 182, 115], label: 'NEPTUNE', win: false },
  ];
  for (const p of pads) {
    const hi = p.win ? mix(p.c, [255, 255, 255], 0.22) : p.c;
    fillRound(p.x, p.y, p.x + p.w, p.y + p.h, 22, hi[0] | 0, hi[1] | 0, hi[2] | 0);
    if (p.win) {
      fillRound(p.x + 8, p.y + 8, p.x + p.w - 8, p.y + p.h - 8, 16, 36, 90, 58);
      fillRound(p.x + 16, p.y + 16, p.x + p.w - 16, p.y + p.h - 16, 14, hi[0] | 0, hi[1] | 0, hi[2] | 0);
    }
    const tw = p.label.length * 6 * 5;
    const ink = p.c[1] > 160 ? [26, 20, 8] : [255, 255, 255];
    drawText(put, p.x + (p.w - tw) / 2, p.y + 70, p.label, 5, ink[0], ink[1], ink[2]);
  }
  drawText(put, 120, 318, 'FIRST', 3, 255, 255, 255);

  fillRound(830, 120, 1160, 660, 22, 20, 20, 30);
  drawText(put, 860, 150, 'BOARD', 4, 230, 192, 30);
  const board = [
    ['SAM', '3', true],
    ['MAYA', '2', false],
    ['LEE', '1', false],
    ['JORDAN', '0', false],
  ];
  board.forEach((row, i) => {
    const y = 230 + i * 90;
    if (row[2]) fillRound(850, y - 12, 1140, y + 60, 12, 42, 36, 16);
    else fillRound(850, y - 12, 1140, y + 60, 12, 28, 28, 40);
    drawText(put, 870, y + 8, row[0], 4, 242, 242, 248);
    drawText(put, 1080, y + 8, row[1], 4, row[2] ? 230 : 154, row[2] ? 192 : 160, row[2] ? 30 : 180);
  });
  drawText(put, 860, 600, 'SAM GOT IT', 3, 125, 235, 170);

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

function pngFromRgba(W, H, rgba) {
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    Buffer.from(rgba).copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
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

export function dumpIconPngs(dir) {
  const ic = quizBuzzerIcon();
  const pal = [];
  for (let i = 0; i < ic.numColors; i++) {
    pal.push([ic.palette[i * 3], ic.palette[i * 3 + 1], ic.palette[i * 3 + 2]]);
  }
  for (let f = 0; f < ic.frames.length; f++) {
    const idx = ic.frames[f];
    const rgba = Buffer.alloc(OUT * OUT * 4);
    for (let i = 0; i < OUT * OUT; i++) {
      const p = pal[idx[i]] || [0, 0, 0];
      const a = idx[i] === ic.transparentIndex ? 0 : 255;
      rgba[i * 4] = p[0]; rgba[i * 4 + 1] = p[1]; rgba[i * 4 + 2] = p[2]; rgba[i * 4 + 3] = a;
    }
    writeFileSync(join(dir, 'icon-f' + f + '.png'), pngFromRgba(OUT, OUT, rgba));
    // 64px neighbour-size critic
    const s = 64, small = Buffer.alloc(s * s * 4);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const sx = (x * OUT / s) | 0, sy = (y * OUT / s) | 0;
      const o = (sy * OUT + sx) * 4, d = (y * s + x) * 4;
      small[d] = rgba[o]; small[d + 1] = rgba[o + 1]; small[d + 2] = rgba[o + 2]; small[d + 3] = rgba[o + 3];
    }
    writeFileSync(join(dir, 'icon64-f' + f + '.png'), pngFromRgba(s, s, small));
  }
}
