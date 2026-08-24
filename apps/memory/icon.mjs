// Four pads lighting in sequence, then a mid-play cover with a live score.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 8;
const CARD_A = [18, 22, 32], CARD_B = [10, 12, 18];
const RED = [192, 57, 43], BLUE = [36, 113, 163], GREEN = [30, 132, 73], GOLD = [183, 149, 11];
const PADS = [RED, BLUE, GREEN, GOLD];
const INK = [240, 244, 250];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function inRound(x, y, x0, y0, x1, y1, rad) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + rad), x1 - rad);
  const cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
  return (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, ...PADS, INK, [255, 255, 255]]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.3).map(Math.round));
  }
  return pal.slice(0, 64);
}
function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e9;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i], d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const seq = [0, 2, 1, 3, 0, 2, 1, 3];
  const lit = seq[f % seq.length];
  const boxes = [[18, 18, 62, 62], [66, 18, 110, 62], [18, 66, 62, 110], [66, 66, 110, 110]];
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, 5, 24)) {
      a = 1;
      col = mix(CARD_A, CARD_B, (y - 5) / 118);
      boxes.forEach((b, i) => {
        if (inRound(x, y, b[0], b[1], b[2], b[3], 10)) {
          col = i === lit ? mix(PADS[i], [255, 255, 255], 0.38) : mix(PADS[i], [0, 0, 0], 0.28);
        }
      });
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
    idx[y * OUT + x] = a / n < 0.5 ? 0 : nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}

export function memoryIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64, flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 14, transparentIndex: 0 };
}

function crc(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (~c) >>> 0;
}
function pngChunk(tag, data) {
  const t = Buffer.from(tag);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
}

export function screenshotPng() {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
  };
  const rr = (x0, y0, x1, y1, rad, r, g, b) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
      const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
      if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) put(x, y, r, g, b);
    }
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 18, 21, 28);

  // header
  rr(40, 28, 280, 78, 8, 28, 34, 48);
  // "score" chips
  rr(820, 28, 980, 78, 8, 28, 34, 48);
  rr(1000, 28, 1160, 78, 8, 28, 34, 48);
  // pale ticks on chips (Best 12 / Score 8)
  for (let x = 850; x < 950; x++) for (let y = 46; y < 60; y++) put(x, y, 154, 163, 181);
  for (let x = 1030; x < 1130; x++) for (let y = 46; y < 60; y++) put(x, y, 143, 212, 168);

  const cols = [[192, 57, 43], [36, 113, 163], [30, 132, 73], [183, 149, 11], [108, 52, 131], [26, 82, 118]];
  // 6 pads, mid-round — one lit with a step number block
  const boxes = [
    [48, 110, 428, 330], [436, 110, 816, 330], [824, 110, 1152, 330],
    [48, 350, 428, 570], [436, 350, 816, 570], [824, 350, 1152, 570],
  ];
  boxes.forEach((b, i) => {
    const lit = i === 1;
    const c = lit ? mix(cols[i], [255, 255, 255], 0.28).map(Math.round) : mix(cols[i], [0, 0, 0], 0.12).map(Math.round);
    rr(b[0], b[1], b[2], b[3], 36, c[0], c[1], c[2]);
  });
  // step "3" on the lit pad
  const n3 = (x, y, r, g, b) => {
    rr(x, y, x + 54, y + 12, 2, r, g, b);
    rr(x + 42, y, x + 54, y + 70, 2, r, g, b);
    rr(x, y + 30, x + 54, y + 42, 2, r, g, b);
    rr(x, y + 58, x + 54, y + 70, 2, r, g, b);
  };
  n3(596, 190, 255, 255, 255);

  // Start bar
  rr(48, 600, 860, 688, 18, 58, 125, 92);
  rr(880, 600, 1152, 688, 18, 42, 51, 72);

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
