// Procedural icon for JS Paint: a teal Win98-ish card holding a white canvas
// with a paintbrush that dabs a colour across the frames. Same super-sample →
// box-downsample → small-palette pipeline as the other app icons.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [0, 104, 104];
const CARD_D = [0, 72, 72];
const TEAL = [0, 128, 128];
const PAPER = [248, 248, 240];
const INK = [16, 16, 24];
const RED = [200, 48, 48];
const BLUE = [40, 80, 180];
const YEL = [232, 188, 48];
const WOOD = [150, 92, 44];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, CARD_D, TEAL, PAPER, INK, RED, BLUE, YEL, WOOD]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
  }
  return pal;
}
function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e9;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b, d = dr * dr + dg * dg + db * db;
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
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}
function inRoundRect(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  if (x >= x0 + r && x <= x0 + w - r) return true;
  if (y >= y0 + r && y <= y0 + h - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const dab = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    const o = (py * RW + px) * 4;
    if (!inCard(x, y, 6, 18)) continue;
    let col = mix(CARD, CARD_D, (y / OUT) * 0.55);
    // inset paper
    if (inRoundRect(x, y, 22, 24, 84, 72, 4)) {
      col = PAPER;
      // a little house
      if (y > 58 && y < 84 && x > 38 && x < 62) col = mix(WOOD, PAPER, 0.15);
      if (y > 46 && y < 62 && Math.abs(x - 50) < (62 - y) * 0.9) col = RED;
      // sun
      const sd = Math.hypot(x - 86, y - 38);
      if (sd < 8 + dab * 1.2) col = YEL;
    }
    // brush handle
    const bx = 28 + dab * 54, by = 92 - dab * 18;
    const dx = x - bx, dy = y - by;
    const along = dx * 0.6 + dy * 0.8;
    const across = dx * 0.8 - dy * 0.6;
    if (along > 0 && along < 28 && Math.abs(across) < 2.2) col = WOOD;
    if (along > 26 && along < 34 && Math.abs(across) < 3.4) col = mix(RED, BLUE, dab);
    rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
    }
    const n = SS * SS;
    if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}

export function jspaintIcon() {
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

// A store-cover screenshot of Classic Paint: teal workspace, toolbox, canvas
// with a house and sun. No canvas, no sharp: zlib is built into Node.
import { deflateSync } from 'node:zlib';

function crc(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(tag, data) {
  const t = Buffer.from(tag);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
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
  const rect = (x0, y0, x1, y1, r, g, b) => {
    fill(x0, y0, x1, y0 + 1, r, g, b);
    fill(x0, y1 - 1, x1, y1, r, g, b);
    fill(x0, y0, x0 + 1, y1, r, g, b);
    fill(x1 - 1, y0, x1, y1, r, g, b);
  };

  // workspace
  fill(0, 0, W, H, 128, 128, 128);
  // title bar
  fill(0, 0, W, 28, 0, 0, 128);
  fill(6, 6, 22, 22, 0, 128, 128);
  fill(8, 8, 20, 20, 248, 248, 240);
  // menu
  fill(0, 28, W, 52, 192, 192, 192);
  fill(12, 36, 40, 44, 0, 0, 0);
  fill(52, 36, 84, 44, 0, 0, 0);
  fill(96, 36, 128, 44, 0, 0, 0);
  fill(140, 36, 184, 44, 0, 0, 0);
  fill(196, 36, 228, 44, 0, 0, 0);
  fill(240, 36, 272, 44, 0, 0, 0);
  // toolbox
  fill(8, 60, 72, 420, 192, 192, 192);
  rect(8, 60, 72, 420, 255, 255, 255);
  const tools = [
    [0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2], [0, 3], [1, 3],
    [0, 4], [1, 4], [0, 5], [1, 5], [0, 6], [1, 6], [0, 7], [1, 7],
  ];
  for (const [c, r] of tools) {
    const x = 14 + c * 28, y = 68 + r * 28;
    fill(x, y, x + 24, y + 24, 192, 192, 192);
    rect(x, y, x + 24, y + 24, 128, 128, 128);
    fill(x + 2, y + 2, x + 22, y + 22, 255, 255, 255);
    fill(x + 6, y + 6, x + 18, y + 18, 0, 0, 128);
  }
  fill(14, 68, 38, 92, 0, 0, 128); // selected tool
  // canvas
  fill(88, 60, 1168, 620, 255, 255, 255);
  rect(88, 60, 1168, 620, 64, 64, 64);
  // house
  fill(420, 340, 700, 560, 196, 140, 72);
  for (let y = 220; y < 360; y++) {
    const t = (y - 220) / 140;
    const half = 180 * (1 - t);
    fill(560 - half, y, 560 + half, y + 1, 200, 48, 48);
  }
  fill(500, 420, 580, 560, 80, 48, 24);
  fill(620, 380, 680, 460, 160, 210, 230);
  // sun
  for (let y = 110; y < 210; y++) for (let x = 900; x < 1000; x++) {
    const dx = x - 950, dy = y - 160;
    if (dx * dx + dy * dy <= 48 * 48) put(x, y, 232, 188, 48);
  }
  // grass
  fill(88, 560, 1168, 620, 72, 140, 64);
  // color box
  fill(8, 632, 720, 712, 192, 192, 192);
  const pal = [
    [0, 0, 0], [128, 128, 128], [128, 0, 0], [128, 128, 0], [0, 128, 0], [0, 128, 128], [0, 0, 128], [128, 0, 128],
    [128, 128, 64], [0, 64, 64], [0, 128, 255], [0, 64, 128], [64, 0, 255], [128, 64, 0],
    [255, 255, 255], [192, 192, 192], [255, 0, 0], [255, 255, 0], [0, 255, 0], [0, 255, 255], [0, 0, 255], [255, 0, 255],
  ];
  pal.forEach((c, i) => {
    const x = 80 + (i % 14) * 28, y = 644 + Math.floor(i / 14) * 28;
    fill(x, y, x + 24, y + 24, c[0], c[1], c[2]);
    rect(x, y, x + 24, y + 24, 64, 64, 64);
  });
  fill(16, 644, 64, 700, 0, 0, 0);
  fill(36, 664, 72, 708, 255, 255, 255);
  // status bar
  fill(0, 700, W, H, 192, 192, 192);

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
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
