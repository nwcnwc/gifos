// Procedural icon for Racer: a rounded card looking down an Outrun dusk
// highway. The centre dashes race toward the camera across the frames, and
// the sun breathes. Pure Node — no canvas. Super-sample → box-downsample →
// small palette. Deterministic, so builds reproduce byte for byte.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [18, 10, 24];
const SKY_TOP = [28, 16, 64];
const SKY_MID = [180, 48, 110];
const SKY_HOR = [255, 140, 64];
const SUN = [255, 220, 120];
const SUN_RIM = [255, 92, 64];
const ROAD = [48, 42, 52];
const ROAD_L = [72, 64, 76];
const GRASS_L = [18, 70, 48];
const GRASS_D = [10, 40, 28];
const RUMBLE_A = [210, 50, 48];
const RUMBLE_B = [236, 236, 232];
const DASH = [255, 214, 80];
const PALM = [6, 18, 12];
const PALM_D = [4, 10, 8];
const CAR = [210, 36, 48];
const CAR_HI = [255, 92, 80];
const WHITE = [248, 240, 228];

function mix(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
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
function buildPalette() {
  const pal = [[0, 0, 0]];
  const bases = [CARD, SKY_TOP, SKY_MID, SKY_HOR, SUN, SUN_RIM, ROAD, ROAD_L,
                 GRASS_L, GRASS_D, RUMBLE_A, RUMBLE_B, DASH, PALM, CAR, CAR_HI, WHITE];
  for (const b of bases) {
    pal.push(b);
    pal.push(mix(b, [255, 255, 255], 0.22).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.28).map(Math.round));
  }
  for (let i = 1; i <= 5; i++) pal.push(mix(SKY_TOP, SKY_MID, i / 6).map(Math.round));
  for (let i = 1; i <= 4; i++) pal.push(mix(SKY_MID, SKY_HOR, i / 5).map(Math.round));
  return pal;
}
function nearest(pal, r, g, b) {
  let best = 1, bd = Infinity;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i];
    const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function palm(x, y, px, py, h) {
  // trunk
  const tx = px, ty0 = py, ty1 = py - h;
  const onTrunk = x >= tx - 1.2 && x <= tx + 1.2 && y <= ty0 && y >= ty1;
  // fronds: a few arcs from the crown
  let onFrond = false;
  if (y < ty1 + 4) {
    const dx = x - tx, dy = y - ty1;
    const d = Math.hypot(dx, dy);
    onFrond = d < h * 0.45 && (Math.abs(dy) < 3.2 || Math.abs(dx) > 2);
  }
  return onTrunk || onFrond;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const HORIZON = OUT * 0.46;
  const cx = OUT / 2;
  const t = f / FRAMES;
  const scroll = t; // dashes race toward us
  const sunPulse = 0.55 + 0.45 * Math.sin(t * Math.PI * 2);
  const sunR = 11 + sunPulse * 2.2;

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      const o = (py * RW + px) * 4;
      if (!inCard(x, y, 4, 18)) continue;

      let col;
      if (y < HORIZON) {
        const k = y / HORIZON;
        col = k < 0.55
          ? mix(SKY_TOP, SKY_MID, k / 0.55)
          : mix(SKY_MID, SKY_HOR, (k - 0.55) / 0.45);
        const sx = x - cx, sy = y - (HORIZON - 2);
        const sd = Math.hypot(sx, sy);
        if (sd < sunR) col = mix(SUN_RIM, SUN, 1 - sd / sunR);
        else if (sd < sunR * 2.4) {
          const g = 1 - (sd - sunR) / (sunR * 1.4);
          col = mix(col, SUN_RIM, g * g * 0.55 * sunPulse);
        }
        // two palm silhouettes on the skyline
        if (palm(x, y, 22, HORIZON + 1, 28) || palm(x, y, 108, HORIZON + 2, 24))
          col = PALM;
      } else {
        const d = (y - HORIZON) / (OUT - HORIZON); // 0 horizon, 1 bottom
        const half = 6 + d * (OUT * 0.52);
        const left = cx - half, right = cx + half;
        if (x < left || x > right) {
          col = mix(GRASS_D, GRASS_L, d);
          if (palm(x, y, 14, OUT - 8, 38) || palm(x, y, 118, OUT - 4, 32))
            col = PALM;
        } else {
          col = mix(ROAD, ROAD_L, d * 0.6);
          const rumble = half * 0.08;
          const onR = (x > left && x < left + rumble) || (x < right && x > right - rumble);
          if (onR) col = (((y * 0.35 + f) | 0) % 2) ? RUMBLE_A : RUMBLE_B;
          // centre dashes, scrolling
          const lane = (x - cx);
          if (Math.abs(lane) < 1.4 + d * 1.2) {
            const z = 1 / Math.max(0.04, d);
            const stripe = ((z * 0.35 + scroll * 8) % 2);
            if (stripe < 1) col = DASH;
          }
        }
      }

      // the car, bottom centre — a red wedge with a windshield
      const carY0 = OUT - 28, carY1 = OUT - 10;
      if (y >= carY0 && y <= carY1) {
        const cy = (y - carY0) / (carY1 - carY0);
        const hw = 7 + cy * 14;
        if (Math.abs(x - cx) < hw) {
          col = mix(CAR, CAR_HI, 1 - cy);
          if (cy < 0.42 && Math.abs(x - cx) < hw * 0.55) col = mix(col, [80, 160, 200], 0.45);
        }
      }

      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      const n = SS * SS;
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

export function racerIcon() {
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
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
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
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };
  const HORIZON = 310;
  const cx = W / 2;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r, g, b;
      if (y < HORIZON) {
        const k = y / HORIZON;
        const c = k < 0.5
          ? mix(SKY_TOP, SKY_MID, k / 0.5)
          : mix(SKY_MID, SKY_HOR, (k - 0.5) / 0.5);
        r = c[0]; g = c[1]; b = c[2];
        const sx = x - cx, sy = y - (HORIZON - 20);
        const sd = Math.hypot(sx, sy);
        if (sd < 70) {
          const t = 1 - sd / 70;
          const s = mix(SUN_RIM, SUN, t);
          r = s[0]; g = s[1]; b = s[2];
        } else if (sd < 180) {
          const t = 1 - (sd - 70) / 110;
          r = r + (SUN_RIM[0] - r) * t * t * 0.5;
          g = g + (SUN_RIM[1] - g) * t * t * 0.5;
          b = b + (SUN_RIM[2] - b) * t * t * 0.5;
        }
        // hills
        const hill = 28 * Math.sin(x * 0.007) + 18 * Math.sin(x * 0.013 + 1.2);
        if (y > HORIZON - 40 - hill) {
          r = 22; g = 48; b = 36;
        }
      } else {
        const d = (y - HORIZON) / (H - HORIZON);
        const half = 40 + d * 620;
        const left = cx - half, right = cx + half;
        if (x < left || x > right) {
          const c = mix(GRASS_D, GRASS_L, d);
          r = c[0]; g = c[1]; b = c[2];
        } else {
          const c = mix(ROAD, ROAD_L, d * 0.5);
          r = c[0]; g = c[1]; b = c[2];
          const rumble = half * 0.07;
          if ((x > left && x < left + rumble) || (x < right && x > right - rumble)) {
            const stripe = ((y / 14) | 0) % 2;
            if (stripe) { r = RUMBLE_A[0]; g = RUMBLE_A[1]; b = RUMBLE_A[2]; }
            else { r = RUMBLE_B[0]; g = RUMBLE_B[1]; b = RUMBLE_B[2]; }
          }
          if (Math.abs(x - cx) < 4 + d * 6) {
            const z = 1 / Math.max(0.05, d);
            if ((z * 0.4) % 2 < 1) { r = DASH[0]; g = DASH[1]; b = DASH[2]; }
          }
        }
      }
      put(x, y, r, g, b);
    }
  }

  // palms, left and right of the road — silhouettes against the dusk sky
  function drawPalm(px, baseY, h) {
    const pr = 8, pg = 16, pb = 12;
    for (let y = baseY; y > baseY - h; y--) {
      const taper = (baseY - y) / h;
      const tw = 6 - taper * 3;
      for (let x = px - tw; x < px + tw; x++) put(x, y, pr, pg, pb);
    }
    const top = baseY - h;
    for (let a = -5; a <= 5; a++) {
      const ang = a * 0.42;
      for (let i = 0; i < 90; i++) {
        const len = i * 0.95;
        const fx = px + Math.sin(ang) * len;
        const fy = top + 12 + Math.abs(Math.cos(ang)) * (len * 0.38) + i * 0.08;
        put(fx, fy, pr, pg, pb);
        put(fx + 1, fy, pr, pg, pb);
        put(fx, fy + 1, pr, pg, pb);
      }
    }
  }
  drawPalm(90, 680, 220);
  drawPalm(1110, 700, 200);
  drawPalm(160, 520, 140);

  // player car
  const carY = 620;
  for (let y = 0; y < 70; y++) {
    const cy = y / 70;
    const hw = 28 + cy * 70;
    for (let x = -hw; x < hw; x++) {
      let r = CAR[0], g = CAR[1], b = CAR[2];
      if (cy < 0.4 && Math.abs(x) < hw * 0.5) { r = 70; g = 150; b = 190; }
      if (cy > 0.78 && (Math.abs(x) > hw * 0.55)) { r = 20; g = 20; b = 22; }
      put(cx + x, carY + y, r, g, b);
    }
  }
  // a car ahead, smaller
  const ax = cx + 70, ay = 430;
  for (let y = 0; y < 28; y++) {
    const hw = 10 + (y / 28) * 22;
    for (let x = -hw; x < hw; x++) put(ax + x, ay + y, 40, 90, 180);
  }

  // HUD chips
  function chip(x, y, w, h, r, g, b) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const dx = Math.min(xx - x, x + w - 1 - xx);
      const dy = Math.min(yy - y, y + h - 1 - yy);
      if (dx + dy < 6 && (dx < 3 || dy < 3) && !(dx >= 3 && dy >= 3)) continue;
      put(xx, yy, r, g, b);
    }
  }
  chip(28, 22, 250, 46, 255, 255, 255);
  drawText(put, 44, 34, 'TIME 12.4', 4, 20, 12, 12);
  chip(960, 22, 210, 46, 255, 214, 80);
  drawText(put, 984, 34, '148 MPH', 4, 26, 14, 8);
  chip(28, 82, 200, 40, 255, 92, 64);
  drawText(put, 44, 92, 'START RACE', 3, 26, 8, 4);

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
