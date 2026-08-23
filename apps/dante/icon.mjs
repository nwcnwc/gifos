// Procedural icon for Dante: a dark rounded card looking down a hex
// platform over lava, a little red devil, a soul drifting. Super-sample
// → box-downsample → small palette. Deterministic so GIF builds reproduce.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [18, 8, 6];
const SKY = [42, 12, 8];
const SKY_H = [90, 28, 12];
const LAVA = [210, 48, 12];
const LAVA_H = [255, 160, 40];
const HEX = [110, 42, 28];
const HEX_D = [62, 22, 16];
const DEVIL = [196, 36, 24];
const DEVIL_D = [120, 18, 14];
const HORN = [48, 14, 12];
const SOUL = [180, 230, 255];
const SOUL_C = [80, 200, 220];
const INK = [255, 210, 170];
const ACCENT = [246, 97, 17];

function mix(a, b, t) {
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
function inHex(x, y, cx, cy, r) {
  const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
  return dy < r * 0.866 && dx < r && (r * 0.866 - dy) > dx * 0.5;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, SKY, SKY_H, LAVA, LAVA_H, HEX, HEX_D, DEVIL, DEVIL_D, HORN, SOUL, SOUL_C, INK, ACCENT]) {
    pal.push(b);
    pal.push(mix(b, [255, 255, 255], 0.22).map(Math.round));
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

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const bob = Math.sin(t * Math.PI * 2) * 2;
  const soulA = t * Math.PI * 2;
  const lava = 0.45 + 0.55 * Math.sin(t * Math.PI * 2 + 0.4);

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 4, 16)) continue;
      let col;
      if (y < 52) {
        const k = y / 52;
        col = mix(SKY, SKY_H, k * 0.7);
        const n = ((Math.sin(x * 0.31 + y * 0.17) * 43758.5453) % 1 + 1) % 1;
        if (n > 0.94) col = mix(col, LAVA_H, 0.25);
      } else if (y > 96) {
        const d = (y - 96) / (OUT - 96);
        col = mix(LAVA, LAVA_H, (0.2 + d * 0.6) * lava);
        const n = ((Math.sin(x * 0.4 + y * 0.2 + t * 6) * 43758.5453) % 1 + 1) % 1;
        if (n > 0.88) col = mix(col, LAVA_H, 0.8);
      } else {
        col = mix(SKY_H, HEX_D, (y - 52) / 44);
      }
      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }

  function put(x, y, r, g, b) {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= OUT || y >= OUT) return;
    for (let dy = 0; dy < SS; dy++) {
      for (let dx = 0; dx < SS; dx++) {
        const o = ((y * SS + dy) * RW + (x * SS + dx)) * 4;
        if (!rgba[o + 3]) continue;
        rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 1;
      }
    }
  }

  function hexPad(cx, cy, r, top, side) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!inHex(x, y, cx, cy, r)) continue;
        const edge = inHex(x, y, cx, cy, r - 1.6) ? top : side;
        put(x, y, edge[0], edge[1], edge[2]);
      }
    }
  }
  hexPad(40, 78, 22, HEX, HEX_D);
  hexPad(88, 86, 18, mix(HEX, HEX_D, 0.3).map(Math.round), HEX_D);
  hexPad(64, 68, 16, mix(HEX, [140, 60, 36], 0.4).map(Math.round), HEX_D);

  const dx = 62, dy = 58 + bob;
  for (let i = -6; i <= 6; i++) {
    for (let j = -10; j <= 8; j++) {
      const inBody = Math.abs(i) < 5 - Math.abs(j + 1) * 0.15 && j > -8 && j < 6;
      const inHead = i * i + (j + 7) * (j + 7) <= 16;
      if (inHead) put(dx + i, dy + j, DEVIL[0], DEVIL[1], DEVIL[2]);
      else if (inBody) put(dx + i, dy + j, DEVIL_D[0], DEVIL_D[1], DEVIL_D[2]);
    }
  }
  put(dx - 4, dy - 12, HORN[0], HORN[1], HORN[2]);
  put(dx - 5, dy - 13, HORN[0], HORN[1], HORN[2]);
  put(dx + 4, dy - 12, HORN[0], HORN[1], HORN[2]);
  put(dx + 5, dy - 13, HORN[0], HORN[1], HORN[2]);
  put(dx - 2, dy - 6, 20, 8, 6);
  put(dx + 2, dy - 6, 20, 8, 6);

  const sx = 88 + Math.cos(soulA) * 10;
  const sy = 44 + Math.sin(soulA) * 6;
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2;
    const rad = 3 + (i % 5) * 0.5;
    const c = i < 30 ? SOUL : SOUL_C;
    put(sx + Math.cos(a) * rad, sy + Math.sin(a) * rad * 1.2, c[0], c[1], c[2]);
  }
  put(sx, sy, 255, 255, 255);

  const gx = 36 + Math.cos(soulA + 2) * 4;
  const gy = 72;
  for (let j = -8; j <= 6; j++) {
    for (let i = -4; i <= 4; i++) {
      if (i * i * 0.7 + (j + 2) * (j + 2) * 0.4 < 12) {
        put(gx + i, gy + j, 90, 110, 140);
      }
    }
  }

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const o = ((y * SS + dy) * RW + (x * SS + dx)) * 4;
          if (!rgba[o + 3]) continue;
          r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += 1; n++;
        }
      }
      idx[y * OUT + x] = n ? nearest(pal, r / n, g / n, b / n) : 0;
    }
  }
  return idx;
}

export function danteIcon() {
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
    minCodeSize: 6, frames, delayCs: 10, transparentIndex: 0
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
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  3: [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
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
    const gy = y / H;
    const sky = gy < 0.42 ? mix(SKY, SKY_H, gy / 0.42) : mix(LAVA, LAVA_H, (gy - 0.42) / 0.58 * 0.7);
    for (let x = 0; x < W; x++) {
      const n = ((Math.sin(x * 0.011 + y * 0.017) * 43758.5453) % 1 + 1) % 1;
      let c = sky;
      if (gy > 0.55 && n > 0.9) c = mix(c, LAVA_H, 0.5);
      put(x, y, c[0], c[1], c[2]);
    }
  }

  function hexAt(cx, cy, r, col, edge) {
    for (let y = cy - r; y <= cy + r * 0.6; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
        if (dy < r * 0.5 && dx < r && (r * 0.5 - dy) > dx * 0.28) {
          const e = (dy > r * 0.42 || dx > r * 0.88);
          const c = e ? edge : col;
          put(x, y, c[0], c[1], c[2]);
        }
      }
    }
  }
  hexAt(280, 420, 160, HEX, HEX_D);
  hexAt(640, 380, 200, mix(HEX, [140, 56, 32], 0.3).map(Math.round), HEX_D);
  hexAt(980, 460, 150, HEX_D, mix(HEX_D, [20, 8, 6], 0.4).map(Math.round));
  hexAt(480, 520, 90, mix(HEX, LAVA, 0.2).map(Math.round), HEX_D);

  const dx = 620, dy = 340;
  for (let j = -70; j <= 80; j++) {
    for (let i = -36; i <= 36; i++) {
      const inBody = Math.abs(i) < 28 - Math.abs(j) * 0.08 && j > -40 && j < 70;
      const inHead = i * i + (j + 48) * (j + 48) <= 900;
      if (inHead) put(dx + i, dy + j, DEVIL[0], DEVIL[1], DEVIL[2]);
      else if (inBody) put(dx + i, dy + j, DEVIL_D[0], DEVIL_D[1], DEVIL_D[2]);
    }
  }
  for (let k = 0; k < 18; k++) {
    put(dx - 22 - k * 0.2, dy - 78 - k, HORN[0], HORN[1], HORN[2]);
    put(dx + 22 + k * 0.2, dy - 78 - k, HORN[0], HORN[1], HORN[2]);
    put(dx - 21 - k * 0.2, dy - 78 - k, HORN[0], HORN[1], HORN[2]);
    put(dx + 21 + k * 0.2, dy - 78 - k, HORN[0], HORN[1], HORN[2]);
  }
  put(dx - 12, dy - 44, 12, 6, 4);
  put(dx + 12, dy - 44, 12, 6, 4);
  put(dx - 11, dy - 44, 12, 6, 4);
  put(dx + 11, dy - 44, 12, 6, 4);

  const sx = 880, sy = 220;
  for (let i = 0; i < 220; i++) {
    const a = (i / 220) * Math.PI * 2;
    const rad = 18 + (i % 7);
    const c = i < 80 ? SOUL : SOUL_C;
    put(sx + Math.cos(a) * rad, sy + Math.sin(a) * rad * 1.15, c[0], c[1], c[2]);
  }
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    put(sx + Math.cos(a) * 8, sy + Math.sin(a) * 8, 255, 255, 255);
  }

  const gx = 360, gy = 300;
  for (let j = -40; j <= 50; j++) {
    for (let i = -22; i <= 22; i++) {
      if (i * i * 0.6 + (j + 4) * (j + 4) * 0.35 < 380) {
        put(gx + i, gy + j, 80, 100, 130);
      }
    }
  }

  drawText(put, 48, 36, 'DANTE', 12, 246, 97, 17);
  drawText(put, 48, 140, '13 SOULS', 6, 255, 210, 170);
  drawText(put, 48, H - 72, 'HELL', 5, 210, 48, 12);

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
