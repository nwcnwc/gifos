// Procedural Metronome sticker: a wooden pyramid whose pendulum ticks.
// Super-sample → box-downsample. Transparent around the body (sticker).
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const WOOD = [201, 162, 122];
const WOODD = [110, 67, 36];
const INK = [26, 18, 12];
const GOLD = [232, 80, 64];
const CREAM = [244, 241, 232];
const YEL = [240, 196, 32];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [WOOD, WOODD, INK, GOLD, CREAM, YEL, [42, 42, 54]]) {
    pal.push(b);
    for (let s = 1; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.28).map(Math.round));
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
function inTri(x, y, ax, ay, bx, by, cx, cy) {
  const s = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
  const t = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
  if ((s < 0) !== (t < 0) && s !== 0 && t !== 0) return false;
  const d = (cx - bx) * (y - by) - (cy - by) * (x - bx);
  return d === 0 || (d < 0) === (s + t <= 0);
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const swing = Math.sin(t * Math.PI * 2);
  const atTick = Math.abs(swing) > 0.92;
  const hx = Math.sin(swing * 0.42), hy = Math.cos(swing * 0.42);
  const peakX = 64, peakY = 10;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    let col = null;
    // base
    if (y > 112 && y < 122 && x > 22 && x < 106) col = WOODD;
    // pyramid body
    if (inTri(x, y, peakX, peakY, 18, 114, 110, 114)) col = mix(WOOD, WOODD, (y - 10) / 110);
    // inner window
    if (inTri(x, y, peakX, peakY + 18, 48, 100, 80, 100)) col = INK;
    // pendulum
    const dx = x - peakX, dy = y - (peakY + 16);
    const along = dx * hx + dy * hy;
    const perp = Math.abs(dx * hy - dy * hx);
    if (along > 4 && along < 78 && perp < 1.7) col = CREAM;
    const bx = peakX + hx * 74, by = peakY + 16 + hy * 74;
    const bd = Math.hypot(x - bx, y - by);
    if (bd < 8) col = atTick ? YEL : GOLD;
    if (bd < 8 && bd > 6.2) col = CREAM;
    // outline of pyramid
    if (col && inTri(x, y, peakX, peakY, 18, 114, 110, 114)) {
      const left = Math.abs((x - peakX) / (y - peakY + 0.01) - (18 - peakX) / (114 - peakY));
      const right = Math.abs((x - peakX) / (y - peakY + 0.01) - (110 - peakX) / (114 - peakY));
      if (y > 16 && (left < 0.018 || right < 0.018)) col = INK;
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

export function metronomeIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 8, transparentIndex: 0 };
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
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '/': [0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b10000, 0b10000],
  '+': [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
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
  const circ = (cx, cy, rad, r, g, b) => {
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
    }
  };

  fill(0, 0, W, H, 10, 10, 15);

  // wooden pyramid, pendulum at a tick
  const px0 = 90, py0 = 70;
  for (let y = 0; y < 420; y++) for (let x = -200; x < 200; x++) {
    const X = px0 + 210 + x, Y = py0 + y;
    const t = y / 420;
    const half = 18 + t * 168;
    if (Math.abs(x) <= half) {
      const edge = Math.abs(x) > half - 6;
      if (edge) put(X, Y, 26, 18, 12);
      else {
        const c = mix(WOOD, WOODD, t);
        put(X, Y, c[0], c[1], c[2]);
      }
    }
  }
  for (let y = 70; y < 360; y++) for (let x = -40; x < 40; x++) {
    const X = px0 + 210 + x, Y = py0 + 50 + y * 0.72;
    const t = y / 360;
    const half = 8 + t * 36;
    if (Math.abs(x) <= half) put(X, Y, 26, 18, 12);
  }
  const ang = 0.38;
  const hx = Math.sin(ang), hy = Math.cos(ang);
  for (let a = 8; a < 250; a++) {
    const x = px0 + 210 + hx * a, y = py0 + 78 + hy * a;
    for (let p = -2; p <= 2; p++) put(x + p * hy, y - p * hx, 244, 241, 232);
  }
  const bx = px0 + 210 + hx * 248, by = py0 + 78 + hy * 248;
  circ(bx, by, 22, 240, 196, 32);
  circ(bx, by, 14, 232, 80, 64);
  fill(px0 + 70, py0 + 430, px0 + 350, py0 + 448, 74, 46, 24);

  // BPM readout
  drawText(put, 620, 70, '120', 16, 244, 241, 232);
  drawText(put, 980, 148, 'BPM', 4, 154, 148, 134);
  drawText(put, 720, 220, 'ALLEGRO', 4, 240, 196, 32);

  // beat lights — first of the bar is the gold accent
  const pills = [
    [620, 300, 740, 328, 240, 196, 32],
    [756, 300, 876, 328, 42, 42, 54],
    [892, 300, 1012, 328, 42, 42, 54],
    [1028, 300, 1148, 328, 42, 42, 54],
  ];
  for (const p of pills) rr(p[0], p[1], p[2], p[3], 12, p[4], p[5], p[6]);

  rr(620, 360, 900, 430, 14, 232, 80, 64);
  drawText(put, 690, 378, 'STOP', 5, 255, 255, 255);
  rr(916, 360, 1148, 430, 14, 22, 22, 30);
  drawText(put, 948, 382, 'TAP', 4, 244, 241, 232);

  rr(620, 460, 760, 520, 12, 42, 21, 20);
  drawText(put, 648, 478, '4/4', 4, 244, 241, 232);
  rr(776, 460, 930, 520, 12, 22, 22, 30);
  drawText(put, 800, 478, 'BEAT', 3, 154, 148, 134);
  rr(946, 460, 1148, 520, 12, 22, 22, 30);
  drawText(put, 968, 478, 'CLICK', 3, 154, 148, 134);

  drawText(put, 620, 560, 'TEMPO LIVES IN THIS FILE', 3, 154, 148, 134);
  drawText(put, 620, 620, 'NO MICROPHONE', 3, 232, 80, 64);

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
