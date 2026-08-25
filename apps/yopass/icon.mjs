// Sticker icon: a folded note slides into a padlock and the shackle clicks shut.
// Transparent background — GifOS icons float on the wallpaper, no tile.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 16;
const INK = [18, 26, 38], BLUE = [46, 125, 210], BLUE_D = [24, 78, 150];
const GOLD = [232, 196, 96], GOLD_D = [168, 132, 48];
const STEEL = [196, 208, 220], STEEL_D = [120, 136, 156];
const PAPER = [240, 236, 224], PAPER_D = [196, 180, 150], SEAL = [196, 72, 64];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [INK, BLUE, BLUE_D, GOLD, GOLD_D, STEEL, STEEL_D, PAPER, PAPER_D, SEAL, [12, 18, 28]]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.4).map(Math.round));
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
function rr(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  if (x >= x0 + r && x <= x1 - r) return true;
  if (y >= y0 + r && y <= y1 - r) return true;
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f >= FRAMES - 3 ? 1 : f / (FRAMES - 4);
  // Paper sits under the lock, slides up into it; shackle drops; gold click.
  const paperT = Math.min(1, t / 0.5);
  const shut = Math.min(1, Math.max(0, (t - 0.2) / 0.55));
  const click = Math.min(1, Math.max(0, (t - 0.75) / 0.25));
  const shackleLift = 20 * (1 - shut);
  const paperY = 126 - paperT * 52;
  const body = mix(BLUE, GOLD, click);
  const bodyD = mix(BLUE_D, GOLD_D, click * 0.85);
  const cx = 64, bodyY0 = 54, bodyY1 = 104, bodyX0 = 28, bodyX1 = 100;

  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    let col = null, a = 0;

    // folded note (behind the body once it is in)
    const nX0 = 40, nX1 = 88, nY0 = paperY - 32, nY1 = paperY;
    if (paperT < 0.98 && rr(x, y, nX0, nY0, nX1, nY1, 4)) {
      a = 1;
      col = PAPER;
      if (x > (nX0 + nX1) / 2) col = mix(PAPER, PAPER_D, 0.45);
      if (Math.abs(x - (nX0 + nX1) / 2) < 1.2) col = PAPER_D;
      // red wax seal
      if ((x - 64) * (x - 64) + (y - (nY0 + 12)) * (y - (nY0 + 12)) <= 16) col = SEAL;
      // outline
      if (!rr(x, y, nX0 + 2, nY0 + 2, nX1 - 2, nY1 - 2, 3)) col = INK;
    }

    // shackle (steel arch)
    const scx = cx, scy = bodyY0 - shackleLift, ro = 28, ri = 17;
    const d = Math.hypot(x - scx, y - scy);
    if (y < scy + 5 && d <= ro && d >= ri) {
      a = 1;
      col = mix(STEEL, STEEL_D, (x - (scx - ro)) / (2 * ro));
      if (d > ro - 2.2 || d < ri + 2.2) col = INK;
    }

    // lock body
    if (rr(x, y, bodyX0, bodyY0, bodyX1, bodyY1, 12)) {
      a = 1;
      const gy = (y - bodyY0) / (bodyY1 - bodyY0);
      col = mix(body, bodyD, gy * 0.55);
      if (!rr(x, y, bodyX0 + 3, bodyY0 + 3, bodyX1 - 3, bodyY1 - 3, 10)) col = INK;
      // keyhole
      const hx = x - cx, hy = y - 74;
      if (hx * hx + hy * hy <= 36) col = INK;
      if (Math.abs(hx) < 3.2 && y > 74 && y < 90) col = INK;
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

export function yopassIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64, flat = new Array(CT * 3).fill(0);
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
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '/': [0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b10000, 0b10000],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (gph[row] & (1 << (4 - col))) {
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
      }
    }
    cx += 6 * s;
  }
}

function textWidth(str, s) { return String(str).length * 6 * s; }

// Mid-use: a locked secret, not the empty first-boot form.
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
  const radfill = (x0, y0, x1, y1, rad, r, g, b) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
      const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
    }
  };

  // app background
  fill(0, 0, W, H, 12, 17, 24);
  for (let y = 0; y < 280; y++) {
    const t = 1 - y / 280;
    const r = 12 + 14 * t, g = 17 + 25 * t, b = 24 + 40 * t;
    fill(0, y, W, y + 1, r | 0, g | 0, b | 0);
  }

  // header
  drawText(put, 80, 48, 'YOPASS', 5, 232, 238, 246);
  radfill(980, 40, 1140, 88, 24, 22, 29, 40);
  put(1004, 64, 46, 125, 210); // chip dot is too small; draw a blob
  for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
    if (dx * dx + dy * dy <= 25) put(1004 + dx, 64 + dy, 46, 125, 210);
  }
  drawText(put, 1018, 54, 'LOCKED', 3, 138, 151, 171);

  // card
  radfill(80, 120, 1120, 680, 28, 22, 29, 40);

  // padlock on the card
  const lx = 600, ly = 250;
  radfill(lx - 70, ly, lx + 70, ly + 130, 18, 46, 125, 210);
  for (let a = 0; a < 360; a++) {
    const rad = a * Math.PI / 180;
    const x = lx + Math.cos(rad) * 58;
    const y = ly + Math.sin(rad) * 52 - 8;
    if (y < ly + 8) {
      for (let k = 0; k < 12; k++) {
        const rr = 46 + k;
        put((lx + Math.cos(rad) * rr) | 0, (ly + Math.sin(rad) * 52 - 8) | 0, 196, 208, 220);
      }
    }
  }
  // keyhole
  for (let y = ly + 40; y < ly + 90; y++) for (let x = lx - 12; x < lx + 12; x++) {
    const hx = x - lx, hy = y - (ly + 52);
    if (hx * hx + hy * hy <= 80 || (Math.abs(hx) < 6 && hy > 0 && hy < 32)) put(x, y, 14, 20, 28);
  }

  drawText(put, 600 - textWidth('LOCKED', 6) / 2, 410, 'LOCKED', 6, 232, 238, 246);

  const meta = 'PASSPHRASE ON  -  BURNS AFTER READING  -  1 HOUR';
  drawText(put, 600 - textWidth(meta, 2) / 2, 470, meta, 2, 138, 151, 171);

  // invite callout
  radfill(160, 520, 1040, 600, 16, 19, 34, 56);
  const call = 'THE INVITE OPENS A ONE TIME ROOM';
  drawText(put, 600 - textWidth(call, 3) / 2, 548, call, 3, 200, 220, 245);

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
