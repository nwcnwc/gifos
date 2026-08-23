// Procedural Kana Quiz icon: あ flipping to ア, then a correct ping.
// Demonstrates kana, not a generic "A". Pure Node, super-sample → box-downsample.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [22, 18, 28];
const CARD_B = [10, 10, 16];
const INK = [244, 241, 234];
const INK_D = [210, 200, 196];
const RED = [232, 72, 88];
const RED_H = [255, 138, 148];
const OK = [61, 204, 138];
const OK_D = [20, 90, 60];

// 64×64 1-bit glyphs (Noto Sans CJK JP Bold), two uint32 per row (hi, lo).
const HIRA_A = [
  [0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],
  [0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],
  [0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],
  [0x00000040,0x00000000],[0x0000007f,0x00000000],[0x0000007f,0x00000000],[0x0000007e,0x00000000],
  [0x0000007e,0x00070000],[0x0000007e,0x01ff0000],[0x0007ffff,0xffff0000],[0x0007ffff,0xffff0000],
  [0x0007ffff,0xffff0000],[0x0007ffff,0xffff0000],[0x0007ffff,0xfffe0000],[0x0007ffff,0xff000000],
  [0x000000fc,0x00000000],[0x000000fc,0x03e00000],[0x000000fc,0x03f80000],[0x000000fc,0x03f80000],
  [0x000001ff,0xfff00000],[0x000001ff,0xfffc0000],[0x000001ff,0xffff0000],[0x000003ff,0xffff8000],
  [0x00000fff,0xffffc000],[0x00001fff,0x8fffe000],[0x00003ffc,0x0fdff000],[0x00007ff8,0x1fc7f800],
  [0x0000fff8,0x1f83f800],[0x0001fffc,0x3f83fc00],[0x0003fdfc,0x7f01fc00],[0x0007f9fc,0x7f01fc00],
  [0x0007f1fc,0xfe01fc00],[0x000fe1fd,0xfe01fc00],[0x000fe0ff,0xfc01fc00],[0x001fc0ff,0xf801fc00],
  [0x001fc0ff,0xf801fc00],[0x001f80ff,0xf001fc00],[0x001f80ff,0xe003fc00],[0x001f80ff,0xc007f800],
  [0x001f81ff,0x800ff800],[0x001fffff,0x001ff000],[0x001fffff,0x003ff000],[0x001fffff,0x00ffe000],
  [0x001fffff,0x0fffc000],[0x000fffff,0x3fff8000],[0x0007ffbf,0x3fff0000],[0x0001fc38,0x1ffe0000],
  [0x00000000,0x1ff80000],[0x00000000,0x0fc00000],[0x00000000,0x04000000],[0x00000000,0x00000000],
  [0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],
];
const KATA_A = [
  [0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],
  [0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],
  [0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],
  [0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],[0x000c0000,0x00001000],
  [0x000fffff,0xfffff800],[0x000fffff,0xfffffc00],[0x000fffff,0xfffffe00],[0x000fffff,0xffffff00],
  [0x000fffff,0xfffffe00],[0x000fffff,0xfffffc00],[0x000fffff,0xfffffc00],[0x00000000,0x000ff800],
  [0x00000000,0x000ff000],[0x00000000,0x001ff000],[0x0000001f,0xc03fe000],[0x0000001f,0xe07fc000],
  [0x0000001f,0xe0ff8000],[0x0000001f,0xe1ff8000],[0x0000001f,0xe3ff0000],[0x0000001f,0xcffe0000],
  [0x0000001f,0xcffc0000],[0x0000001f,0xc7f80000],[0x0000001f,0xc3f00000],[0x0000001f,0xc0e00000],
  [0x0000001f,0xc0000000],[0x0000001f,0xc0000000],[0x0000001f,0xc0000000],[0x0000003f,0xc0000000],
  [0x0000003f,0xc0000000],[0x0000003f,0x80000000],[0x0000007f,0x80000000],[0x0000007f,0x80000000],
  [0x0000007f,0x80000000],[0x000000ff,0x00000000],[0x000001ff,0x00000000],[0x000003fe,0x00000000],
  [0x000007fe,0x00000000],[0x00000ffc,0x00000000],[0x00001ff8,0x00000000],[0x00007ff8,0x00000000],
  [0x0001fff0,0x00000000],[0x0003ffe0,0x00000000],[0x0001ffc0,0x00000000],[0x00007f00,0x00000000],
  [0x00003e00,0x00000000],[0x00001800,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],
  [0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],
];
const HIRA_SHI = [
  [0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],
  [0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],
  [0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],
  [0x00000000,0x00000000],[0x00007f80,0x00000000],[0x00007f80,0x00000000],[0x00007f80,0x00000000],
  [0x00007f80,0x00000000],[0x00007f80,0x00000000],[0x00007f80,0x00000000],[0x00007f80,0x00000000],
  [0x00007f80,0x00000000],[0x00007f80,0x00000000],[0x00007f80,0x00000000],[0x00007f80,0x00000000],
  [0x00007f80,0x00000000],[0x00007f80,0x00000000],[0x00007f80,0x00000000],[0x00007f80,0x00000000],
  [0x00007f80,0x00000000],[0x00007f00,0x00000000],[0x00007f00,0x00000000],[0x00007f00,0x00000000],
  [0x00007f00,0x00000000],[0x00007f00,0x00000000],[0x00007f00,0x00000000],[0x00007f00,0x00000000],
  [0x00007f00,0x00000000],[0x00007f00,0x00000000],[0x00007f00,0x00000000],[0x00007f00,0x00000000],
  [0x00007f00,0x00000000],[0x00007f00,0x0000c000],[0x00007f00,0x0000c000],[0x00007f00,0x0001e000],
  [0x00007f00,0x0003f000],[0x00007f00,0x0007f800],[0x00007f00,0x000ffc00],[0x00007f80,0x001ff800],
  [0x00007f80,0x003ff800],[0x00007f80,0x00fff000],[0x00007fe0,0x03ffe000],[0x00003ff8,0x3fffc000],
  [0x00003fff,0xffff8000],[0x00001fff,0xffff0000],[0x00001fff,0xfffc0000],[0x00000fff,0xfff80000],
  [0x000007ff,0xffe00000],[0x000001ff,0xff800000],[0x0000003f,0xf8000000],[0x00000000,0x00000000],
  [0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],[0x00000000,0x00000000],
];

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
function glyphOn(bits, x, y) {
  if (y < 0 || y > 63 || x < 0 || x > 63) return false;
  const row = bits[y];
  if (x < 32) return (row[0] & (1 << (31 - x))) !== 0;
  return (row[1] & (1 << (63 - x))) !== 0;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, INK, INK_D, RED, RED_H, OK, OK_D]) {
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
  const m = 7, rad = 20;
  const t = f / (FRAMES - 1);
  const flip = Math.min(1, Math.max(0, (t - 0.12) / 0.62));
  const squash = Math.max(0.06, Math.abs(Math.cos(flip * Math.PI)));
  const glyph = flip < 0.5 ? HIRA_A : KATA_A;
  const ping = Math.max(0, (t - 0.72) / 0.28);
  const pingR = 18 + ping * 38;
  const pingA = ping > 0 ? Math.max(0, 1 - ping) : 0;

  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      const gx = (x - 64) / squash + 32;
      const gy = y - 32;
      const ix = gx | 0, iy = gy | 0;
      if (glyphOn(glyph, ix, iy)) {
        col = mix(INK, INK_D, ((ix + iy) % 5) > 2 ? 0.35 : 0);
        if (flip >= 0.5 && ping > 0.12) col = mix(col, OK, 0.45);
      }
      if (pingA > 0) {
        const dx = x - 64, dy = y - 64;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (Math.abs(d - pingR) < 3.2) col = mix(col, OK, pingA);
      }
      if (ping > 0.28 && inCard(x, y, m, rad)) {
        const cx = x - 92, cy = y - 92;
        const onCheck =
          (Math.abs(cy - cx * 0.9) < 2.2 && cx > -10 && cx < 6) ||
          (Math.abs(cy + cx * 1.6 + 18) < 2.2 && cx > -18 && cx < -8);
        if (onCheck) col = mix(OK, [255, 255, 255], 0.25);
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

export function kanaQuizIcon() {
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

const GLYPHS = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '/': [0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b10000, 0b10000],
  '·': [0, 0, 0, 0b00100, 0, 0, 0],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
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

function blitKana(put, bits, x0, y0, scale, r, g, b) {
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    if (!glyphOn(bits, x, y)) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      put(x0 + x * scale + dx, y0 + y * scale + dy, r, g, b);
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
  const rr = (x0, y0, x1, y1, rad, r, g, b) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
      const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
    }
  };

  fill(0, 0, W, H, 10, 10, 15);

  drawText(put, 56, 36, 'KANA QUIZ', 8, 244, 241, 234);
  drawText(put, 56, 110, 'HIRAGANA', 3, 154, 150, 168);

  rr(56, 156, 250, 216, 22, 22, 22, 31);
  rr(266, 156, 460, 216, 22, 22, 22, 31);
  drawText(put, 78, 174, 'YOU  7', 4, 61, 204, 138);
  drawText(put, 288, 174, 'SAM  5', 4, 244, 241, 234);

  blitKana(put, HIRA_A, 40, 210, 6, 244, 241, 234);

  drawText(put, 56, 650, '7 / 10', 4, 255, 138, 148);

  const btns = [
    { label: 'A', ok: true, x: 620, y: 240 },
    { label: 'I', ok: false, x: 900, y: 240 },
    { label: 'U', ok: false, x: 620, y: 430 },
    { label: 'E', ok: false, x: 900, y: 430 },
  ];
  for (const btn of btns) {
    if (btn.ok) rr(btn.x, btn.y, btn.x + 250, btn.y + 150, 28, 20, 51, 38);
    else rr(btn.x, btn.y, btn.x + 250, btn.y + 150, 28, 30, 30, 42);
    const col = btn.ok ? [61, 204, 138] : [244, 241, 234];
    const tw = btn.label.length * 6 * 7;
    drawText(put, btn.x + (250 - tw) / 2, btn.y + 52, btn.label, 7, col[0], col[1], col[2]);
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
