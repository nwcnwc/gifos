// Procedural icon: a fat spectrum with a knob sliding onto the mark.
// Pure Node, super-sample → box-downsample. Deterministic.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [28, 24, 48];
const CARD_L = [44, 38, 72];
const TEAL = [94, 200, 200];
const VIOLET = [118, 86, 214];
const PINK = [224, 122, 211];
const GOLD = [240, 212, 106];
const WHITE = [255, 255, 255];
const INK = [244, 238, 252];

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
  for (const b of [CARD, CARD_L, TEAL, VIOLET, PINK, GOLD, WHITE, INK]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.28).map(Math.round));
  }
  for (let i = 0; i <= 10; i++) pal.push(mix(TEAL, PINK, i / 10).map(Math.round));
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
  const m = 8, rad = 18;
  const t = f / (FRAMES - 1);
  // Ease out to the mark, hold, ease back — the knob demonstrates the game.
  const sweep = t < 0.72 ? 0.5 - 0.5 * Math.cos((t / 0.72) * Math.PI) : 1 - (t - 0.72) / 0.28 * 0.15;
  const markU = 0.62;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD, CARD_L, (x + y) / (OUT * 2));
      const bx = 16, by = 52, bw = OUT - 32, bh = 22;
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
        const u = (x - bx) / bw;
        col = mix(TEAL, mix(VIOLET, PINK, Math.max(0, (u - 0.4) / 0.6)), u);
      }
      const nx = bx + 12 + sweep * (bw - 24);
      const ny = by + bh / 2 + 12;
      // stem
      if (Math.abs(x - nx) < 2.6 && y >= by - 10 && y <= by + bh + 4) col = WHITE;
      // knob — large enough to read at Home Screen size
      const kd = Math.hypot(x - nx, y - ny);
      if (kd < 12.5) col = mix(WHITE, VIOLET, Math.min(1, kd / 13) * 0.4);
      if (kd < 12.5 && kd > 10.2) col = WHITE;
      // gold mark
      const mx = bx + bw * markU, my = by + bh / 2;
      const dGold = Math.hypot(x - mx, y - my);
      const pulse = t > 0.45 && t < 0.85 ? 1 : 0.55;
      if (dGold < 7.2 && dGold > 3.4) col = mix(GOLD, WHITE, 0.15 * pulse);
    }
    const off = (py * RW + px) * 4;
    if (a) { rgba[off] = col[0]; rgba[off + 1] = col[1]; rgba[off + 2] = col[2]; rgba[off + 3] = 1; }
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

export function longwaveIcon() {
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
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0, 0b00100],
  '\'': [0b00100, 0b00100, 0, 0, 0, 0, 0],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b10001, 0b10001, 0b10001, 0b11111, 0b00001, 0b00001, 0b00001],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b01000],
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
function fillRound(put, x0, y0, x1, y1, rad, r, g, b) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const cx = Math.min(Math.max(x, x0 + rad), x1 - 1 - rad);
    const cy = Math.min(Math.max(y, y0 + rad), y1 - 1 - rad);
    let ok = false;
    if (x >= x0 + rad && x < x1 - rad) ok = true;
    else if (y >= y0 + rad && y < y1 - rad) ok = true;
    else {
      const dx = x - cx, dy = y - cy;
      ok = dx * dx + dy * dy <= rad * rad;
    }
    if (ok) put(x, y, r, g, b);
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

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = (x + y) / (W + H);
    put(x, y, (27 + t * 18) | 0, (23 + t * 10) | 0, (48 + t * 22) | 0);
  }

  fillRound(put, 90, 48, 1110, 672, 28, 44, 38, 80);

  // Turn banner
  fillRound(put, 140, 80, 1060, 168, 16, 58, 50, 100);
  drawText(put, 280, 104, 'YOU ARE THE GUESSER', 5, 196, 176, 255);

  // Poles
  fillRound(put, 140, 196, 470, 276, 14, 46, 158, 158);
  fillRound(put, 730, 196, 1060, 276, 14, 176, 74, 168);
  drawText(put, 200, 220, 'HOT', 5, 255, 255, 255);
  drawText(put, 820, 220, 'COLD', 5, 255, 255, 255);

  // Fat rail
  const rx = 150, ry = 340, rw = 900, rh = 36;
  fillRound(put, rx, ry, rx + rw, ry + rh, 18, 40, 34, 70);
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const u = x / rw;
    const c = u < 0.5
      ? mix([46, 158, 158], [118, 86, 214], u * 2)
      : mix([118, 86, 214], [176, 74, 168], (u - 0.5) * 2);
    const yy = ry + y, xx = rx + x;
    const cy = Math.min(Math.max(yy, ry + 18), ry + rh - 19);
    const cx = Math.min(Math.max(xx, rx + 18), rx + rw - 19);
    let ok = (xx >= rx + 18 && xx < rx + rw - 18) || (yy >= ry + 18 && yy < ry + rh - 18);
    if (!ok) {
      const dx = xx - cx, dy = yy - cy;
      ok = dx * dx + dy * dy <= 18 * 18;
    }
    if (ok) put(xx, yy, c[0] | 0, c[1] | 0, c[2] | 0);
  }

  // Scoring wedges around ~0.36 (mid-round reveal feel)
  const cell = rw / 20;
  const tTick = 7;
  const wedges = [
    [tTick - 2, [212, 104, 88], '2'],
    [tTick - 1, [232, 154, 74], '3'],
    [tTick, [240, 212, 106], '4'],
    [tTick + 1, [232, 154, 74], '3'],
    [tTick + 2, [212, 104, 88], '2'],
  ];
  for (const [tick, col] of wedges) {
    const x0 = rx + (tick - 0.5) * cell;
    const x1 = rx + (tick + 0.5) * cell;
    fill(x0, ry, x1, ry + rh, col[0], col[1], col[2]);
  }

  // Needle + knob a hair off the 4 (close, not dead-on) — mid-round, clue + dial
  const nx = rx + 8.2 * cell;
  fill(nx - 3, ry - 18, nx + 3, ry + rh + 10, 255, 255, 255);
  const ky = ry + rh + 28, kr = 26;
  for (let dy = -kr; dy <= kr; dy++) for (let dx = -kr; dx <= kr; dx++) {
    const d = Math.hypot(dx, dy);
    if (d <= kr) {
      const t = d / kr;
      const c = mix([255, 255, 255], [196, 176, 255], t * 0.55);
      put(nx + dx, ky + dy, c[0] | 0, c[1] | 0, c[2] | 0);
    }
  }

  // Clue
  drawText(put, 140, 470, 'THE CLUE', 3, 183, 172, 207);
  drawText(put, 140, 510, 'COFFEE', 8, 244, 238, 252);

  // Score pips + lock
  drawText(put, 140, 590, 'SCORE 5', 3, 196, 176, 255);
  for (let i = 0; i < 7; i++) {
    const px = 430 + i * 22, py = 604;
    const on = i < 5;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      if (dx * dx + dy * dy <= 25) put(px + dx, py + dy, on ? 196 : 70, on ? 176 : 62, on ? 255 : 110);
    }
  }
  fillRound(put, 720, 574, 1060, 640, 14, 118, 86, 214);
  drawText(put, 760, 592, 'LOCK', 4, 255, 255, 255);

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
