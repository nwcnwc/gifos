// NES pad sticker + a real in-game cover (Lawn Mower, emulated at build).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const jsnes = require('./vendor/jsnes.min.js');
const DIR = dirname(fileURLToPath(import.meta.url));

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const SHELL = [184, 176, 168];
const SHELL_D = [120, 112, 104];
const INK = [24, 20, 18];
const RED = [196, 44, 40];
const RED_L = [255, 120, 96];
const CREAM = [236, 228, 216];
const FACE = [42, 36, 32];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [SHELL, SHELL_D, INK, RED, RED_L, CREAM, FACE, [80, 160, 48], [40, 80, 28]]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.4).map(Math.round));
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
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  if (x >= x0 + r && x <= x1 - r) return true;
  if (y >= y0 + r && y <= y1 - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function inCircle(x, y, cx, cy, r) {
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const dir = f % 4; // 0U 1R 2D 3L
  const aOn = f >= 6 && (f % 3) !== 1;
  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inRoundRect(x, y, 8, 28, 120, 108, 18)) continue;
      let col = mix(SHELL, SHELL_D, (y - 28) / 80);
      // outline
      if (!inRoundRect(x, y, 11, 31, 117, 105, 16)) col = INK;
      // d-pad plus — two bars, one arm lit
      const vBar = inRoundRect(x, y, 28, 48, 48, 88, 2);
      const hBar = inRoundRect(x, y, 16, 60, 60, 76, 2);
      if (vBar || hBar) {
        let lit = false;
        if (dir === 0 && vBar && y < 60) lit = true;
        if (dir === 1 && hBar && x > 48) lit = true;
        if (dir === 2 && vBar && y > 76) lit = true;
        if (dir === 3 && hBar && x < 28) lit = true;
        col = lit ? CREAM : FACE;
      }
      // A / B
      if (inCircle(x, y, 102, 58, 11)) col = aOn ? RED_L : RED;
      else if (inCircle(x, y, 80, 72, 11)) col = RED;
      if (inCircle(x, y, 102, 58, 11) && inCircle(x, y, 102, 58, 10.2) === false) col = INK;
      if (inCircle(x, y, 80, 72, 11) && inCircle(x, y, 80, 72, 10.2) === false) col = INK;
      // start / select
      if (inRoundRect(x, y, 54, 70, 72, 76, 3)) col = FACE;
      if (inRoundRect(x, y, 54, 80, 72, 86, 3)) col = FACE;
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

export function jsnesIcon() {
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
    minCodeSize: 6, frames, delayCs: 12, transparentIndex: 0
  };
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
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10001, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
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

function captureLawn() {
  const rom = readFileSync(join(DIR, 'vendor', 'roms', 'lawn_mower.nes'));
  const C = jsnes.Controller;
  let last = null;
  const nes = new jsnes.NES({
    emulateSound: false,
    onFrame(fb) { last = fb; }
  });
  nes.loadROM(rom);
  for (let i = 0; i < 280; i++) {
    if (i >= 24 && i < 48) nes.buttonDown(1, C.BUTTON_START);
    else nes.buttonUp(1, C.BUTTON_START);
    if (i > 90) {
      nes.buttonDown(1, C.BUTTON_RIGHT);
      nes.buttonDown(1, C.BUTTON_A);
    }
    nes.frame();
  }
  return last;
}

function argb(c) {
  return [(c >>> 16) & 255, (c >>> 8) & 255, c & 255];
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
    for (let x = 0; x < W; x++) {
      const t = y / H;
      put(x, y, 22 + t * 6, 16, 12);
    }
  }

  const fb = captureLawn();
  const SCALE = 2;
  const cropY = 8, visH = 224;
  const gw = 256 * SCALE, gh = visH * SCALE;
  const gx = 56, gy = ((H - gh) / 2) | 0;
  // bezel
  for (let y = gy - 18; y < gy + gh + 18; y++) {
    for (let x = gx - 22; x < gx + gw + 22; x++) put(x, y, 28, 24, 20);
  }
  for (let y = gy - 8; y < gy + gh + 8; y++) {
    for (let x = gx - 8; x < gx + gw + 8; x++) put(x, y, 8, 8, 8);
  }
  for (let y = 0; y < visH; y++) {
    for (let x = 0; x < 256; x++) {
      const c = argb(fb[(y + cropY) * 256 + x] >>> 0);
      for (let sy = 0; sy < SCALE; sy++) {
        for (let sx = 0; sx < SCALE; sx++) {
          const scan = sy === SCALE - 1 ? 0.82 : 1;
          put(gx + x * SCALE + sx, gy + y * SCALE + sy,
            c[0] * scan, c[1] * scan, c[2] * scan);
        }
      }
    }
  }

  // NES pad on the right
  const px = 820, py = 210, pw = 320, ph = 210;
  for (let y = py; y < py + ph; y++) {
    for (let x = px; x < px + pw; x++) {
      const rx = x - px, ry = y - py;
      const r = 36;
      const inx = rx >= r && rx <= pw - r || ry >= r && ry <= ph - r ||
        ((Math.min(Math.max(rx, r), pw - r) - rx) ** 2 + (Math.min(Math.max(ry, r), ph - r) - ry) ** 2) <= r * r;
      if (!inx) continue;
      put(x, y, 186, 178, 170);
    }
  }
  // d-pad
  const dcx = px + 78, dcy = py + 108;
  for (let y = dcy - 46; y <= dcy + 46; y++) {
    for (let x = dcx - 16; x <= dcx + 16; x++) put(x, y, 28, 24, 22);
  }
  for (let y = dcy - 16; y <= dcy + 16; y++) {
    for (let x = dcx - 46; x <= dcx + 46; x++) put(x, y, 28, 24, 22);
  }
  // A/B
  function disc(cx, cy, rad, r, g, b) {
    for (let y = cy - rad; y <= cy + rad; y++) {
      for (let x = cx - rad; x <= cx + rad; x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
      }
    }
  }
  disc(px + 262, py + 78, 28, 196, 44, 40);
  disc(px + 204, py + 118, 28, 196, 44, 40);
  drawText(put, px + 252, py + 72, 'A', 2, 42, 16, 12);
  drawText(put, px + 196, py + 112, 'B', 2, 42, 16, 12);

  drawText(put, 820, 80, 'P1 YOU', 4, 236, 228, 216);
  drawText(put, 820, 128, 'P2 FRIEND', 4, 196, 44, 40);
  drawText(put, 820, 460, 'LAWN MOWER', 3, 180, 168, 150);
  drawText(put, 820, 500, 'DROP A ROM', 3, 180, 168, 150);

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
