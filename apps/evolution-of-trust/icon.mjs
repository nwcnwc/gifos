// Procedural icon: two peeps play the Game of Trust. A gold coin passes
// between them, then the right one cheats (red X) and the left one copies.
// Sticker on transparent, dark outline, readable at 64px.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 16;

const INK = [28, 24, 32];
const SKIN = [255, 232, 204];
const SKIN_D = [232, 196, 160];
const BLUE = [64, 137, 221];
const PURP = [82, 83, 127];
const GOLD = [242, 196, 64];
const GOLD_D = [196, 140, 28];
const RED = [221, 64, 64];
const WHITE = [255, 255, 255];
const PINK = [255, 117, 255];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [INK, SKIN, SKIN_D, BLUE, PURP, GOLD, GOLD_D, RED, WHITE, PINK]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
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

function disc(x, y, cx, cy, r) {
  const dx = x - cx, dy = y - cy;
  return Math.hypot(dx, dy) - r;
}
function stadium(x, y, x0, y0, x1, y1, r) {
  const dx = x1 - x0, dy = y1 - y0;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((x - x0) * dx + (y - y0) * dy) / l2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy)) - r;
}

function peep(x, y, cx, cy, face, bodyCol, hatCol, arm) {
  // arm: -1 left extend, +1 right extend, 0 down
  const head = disc(x, y, cx, cy - 10, 18);
  const body = stadium(x, y, cx, cy + 4, cx, cy + 28, 11);
  const hat = disc(x, y, cx, cy - 24, 9);
  const eyeL = disc(x, y, cx - 6, cy - 12, 2.2);
  const eyeR = disc(x, y, cx + 6, cy - 12, 2.2);
  const armY = cy + 10;
  const armX = cx + arm * 22;
  const hand = stadium(x, y, cx + arm * 8, armY, armX, armY - 2, 3.4);
  let col = null, d = 1e9;
  const consider = (dist, c, w) => {
    if (dist < w && dist < d) { d = dist; col = c; }
  };
  consider(hat, hatCol, 1.6);
  consider(head, SKIN, 1.4);
  consider(body, bodyCol, 1.4);
  consider(hand, SKIN, 1.2);
  consider(eyeL, INK, 0.6);
  consider(eyeR, INK, 0.6);
  if (col && (head < 2.2 || body < 2.2 || hat < 2.2 || hand < 2.0)) {
    // outline
    const outline = Math.min(head, body, hat, hand);
    if (outline > -1.15 && outline < 1.5 && eyeL > 0.4 && eyeR > 0.4) col = INK;
  }
  return { d, col, face };
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const cheat = f >= 8;
  const copy = f >= 12;
  const pass = cheat ? 1 : (f / 8);
  const coinX = 40 + pass * 48;
  const coinY = 58 - Math.sin(pass * Math.PI) * 10;
  const leftArm = cheat && copy ? 1 : (cheat ? 0 : 1);
  const rightArm = cheat ? 0 : -1;

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      const L = peep(x, y, 40, 64, 'c', BLUE, BLUE, leftArm);
      const R = peep(x, y, 88, 64, 'd', PURP, PURP, rightArm);
      let col = null;
      if (L.col && R.col) col = L.d < R.d ? L.col : R.col;
      else col = L.col || R.col;
      const coin = disc(x, y, coinX, coinY, 7);
      if (!cheat && coin < 1.4) {
        col = coin < 0 ? GOLD : (coin < 0.7 ? GOLD_D : INK);
        if (disc(x, y, coinX, coinY, 3) < 0) col = mix(GOLD, WHITE, 0.45);
      }
      if (cheat) {
        const xMark = Math.min(
          stadium(x, y, 80, 44, 100, 64, 1.6),
          stadium(x, y, 100, 44, 80, 64, 1.6)
        );
        if (xMark < 1.1) col = xMark < 0.2 ? RED : mix(RED, INK, 0.4);
      }
      if (copy) {
        const x2 = Math.min(
          stadium(x, y, 28, 44, 48, 64, 1.6),
          stadium(x, y, 48, 44, 28, 64, 1.6)
        );
        if (x2 < 1.1) col = x2 < 0.2 ? RED : mix(RED, INK, 0.4);
      }
      if (!col) continue;
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

export function trustIcon() {
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
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
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

function fillDisc(put, cx, cy, rad, r, g, b) {
  const xA = Math.floor(cx - rad), xB = Math.ceil(cx + rad);
  const yA = Math.floor(cy - rad), yB = Math.ceil(cy + rad);
  for (let y = yA; y <= yB; y++) {
    for (let x = xA; x <= xB; x++) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
    }
  }
}
function strokeLine(put, x0, y0, x1, y1, w, r, g, b) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const steps = Math.ceil(len);
  for (let i = 0; i <= steps; i++) {
    fillDisc(put, x0 + dx * (i / steps), y0 + dy * (i / steps), w, r, g, b);
  }
}

const HATS = [
  [64, 137, 221],
  [82, 83, 127],
  [255, 117, 255],
  [239, 199, 1],
  [246, 178, 76],
  [136, 168, 206],
  [134, 196, 72],
  [255, 94, 94],
];

function drawPeep(put, cx, cy, s, hat, outline) {
  const [hr, hg, hb] = hat;
  fillDisc(put, cx, cy + s * 0.55, s * 0.55, hr, hg, hb);
  fillDisc(put, cx, cy - s * 0.15, s * 0.62, 255, 232, 204);
  fillDisc(put, cx, cy - s * 0.78, s * 0.32, hr, hg, hb);
  fillDisc(put, cx - s * 0.22, cy - s * 0.22, s * 0.08, 28, 24, 32);
  fillDisc(put, cx + s * 0.22, cy - s * 0.22, s * 0.08, 28, 24, 32);
  if (outline) {
    // dark ring around head
    const rad = s * 0.62;
    for (let a = 0; a < 48; a++) {
      const th = a / 48 * Math.PI * 2;
      fillDisc(put, cx + Math.cos(th) * rad, cy - s * 0.15 + Math.sin(th) * rad, 1.4, 28, 24, 32);
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
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = y / H;
      put(x, y, 255 - t * 8, 250 - t * 10, 244 - t * 6);
    }
  }

  // Footer bar like the original
  for (let y = H - 70; y < H; y++) {
    for (let x = 0; x < W; x++) put(x, y, 34, 34, 34);
  }
  for (let i = 0; i < 10; i++) {
    const dx = 280 + i * 64, dy = H - 36;
    const on = i === 3;
    fillDisc(put, dx, dy, 12, on ? 255 : 34, on ? 255 : 34, on ? 255 : 34);
    for (let a = 0; a < 32; a++) {
      const th = a / 32 * Math.PI * 2;
      fillDisc(put, dx + Math.cos(th) * 12, dy + Math.sin(th) * 12, 1.4, 255, 255, 255);
    }
  }

  drawText(put, 70, 36, 'THE EVOLUTION OF TRUST', 5, 40, 40, 48);
  drawText(put, 70, 84, 'ROUND ROBIN  PLACE YOUR BETS', 3, 160, 160, 168);

  const CX = 430, CY = 360, RAD = 210, N = 16;
  const peeps = [];
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2 - Math.PI / 2;
    peeps.push({
      x: CX + Math.cos(a) * RAD,
      y: CY + Math.sin(a) * RAD * 0.82,
      hat: HATS[i % HATS.length],
    });
  }
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      if ((j - i) % 3 !== 0 && (j - i) !== 1 && (j - i) !== N - 1) continue;
      const A = peeps[i], B = peeps[j];
      strokeLine(put, A.x, A.y, B.x, B.y, 1.2, 200, 190, 170);
    }
  }
  // highlighted match
  strokeLine(put, peeps[0].x, peeps[0].y, peeps[7].x, peeps[7].y, 2.4, 64, 137, 221);
  for (const p of peeps) drawPeep(put, p.x, p.y, 28, p.hat, true);

  // coins in the highlighted match
  fillDisc(put, (peeps[0].x + peeps[7].x) / 2, (peeps[0].y + peeps[7].y) / 2, 10, 242, 196, 64);
  fillDisc(put, (peeps[0].x + peeps[7].x) / 2, (peeps[0].y + peeps[7].y) / 2, 5, 255, 230, 140);

  // Side panel — bets, like the original tournament page
  for (let y = 150; y < 560; y++) {
    for (let x = 780; x < 1140; x++) put(x, y, 255, 255, 255);
  }
  drawText(put, 800, 168, 'WHO WINS', 4, 40, 40, 48);
  const labels = [
    ['COPYCAT', HATS[0]],
    ['ALL CHEAT', HATS[1]],
    ['ALL COOP', HATS[2]],
    ['GRUDGER', HATS[3]],
    ['DETECTIVE', HATS[4]],
  ];
  labels.forEach((row, i) => {
    const y = 230 + i * 58;
    fillDisc(put, 824, y + 10, 16, row[1][0], row[1][1], row[1][2]);
    drawText(put, 852, y, row[0], 3, 40, 40, 48);
  });

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
