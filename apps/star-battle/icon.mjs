// Procedural icon for Star Battle: a dark starfield card, a yellow saucer
// on the left firing at a red one on the right. Pure Node — super-sample →
// box-downsample → small palette. Deterministic so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [14, 16, 24];
const CARD_B = [6, 8, 14];
const YEL = [242, 196, 58];
const YEL_D = [196, 140, 28];
const RED = [196, 64, 48];
const RED_D = [140, 36, 28];
const DOME = [186, 214, 230];
const GOLD = [255, 220, 90];
const WHITE = [236, 240, 246];
const GREEN = [72, 176, 96];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, YEL, YEL_D, RED, RED_D, DOME, GOLD, WHITE, GREEN]) {
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

function saucer(x, y, body, dark, bob) {
  return { x, y: y + bob, body, dark };
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const bob = Math.sin(t * Math.PI * 2) * 2.2;
  const shotX = 46 + (t * 52) % 52;

  const stars = [];
  for (let i = 0; i < 28; i++) {
    const sx = 12 + ((i * 47) % 104);
    const sy = 14 + ((i * 73) % 100);
    stars.push({ x: sx, y: sy, r: 0.6 + (i % 3) * 0.35 });
  }

  const me = saucer(36, 72, YEL, YEL_D, bob);
  const foe = saucer(94, 44, RED, RED_D, -bob * 0.7);
  const pal2 = saucer(28, 38, GREEN, mix(GREEN, [0, 0, 0], 0.3), bob * 0.5);

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 20)) continue;
      let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      for (const s of stars) {
        const dd = Math.hypot(x - s.x, y - s.y);
        if (dd < s.r + 0.4) col = mix(col, WHITE, Math.max(0, 1 - dd / (s.r + 0.4)) * 0.8);
      }
      function blitSaucer(s) {
        const dx = x - s.x, dy = y - s.y;
        const hull = (dx * dx) / (18 * 18) + (dy * dy) / (8 * 8);
        const dome = (dx * dx) / (8 * 8) + ((dy + 3) * (dy + 3)) / (6.5 * 6.5);
        if (hull < 1 && dy > -2) col = mix(s.dark, s.body, 0.45 + (dx + 18) / 50);
        if (dome < 1 && dy < 2) col = mix(col, DOME, 0.85);
        const light = Math.hypot(dx - 6, dy - 5);
        if (hull < 1 && light < 2.2) col = mix(col, GOLD, 0.6);
      }
      blitSaucer(pal2);
      blitSaucer(foe);
      blitSaucer(me);
      // shot
      const sdx = x - shotX, sdy = y - (me.y - 1);
      if (Math.abs(sdy) < 1.4 && sdx > 0 && sdx < 10) col = GOLD;
      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = SS * SS;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx2 = 0; sx2 < SS; sx2++) {
          const o = (((y * SS + sy) * RW) + (x * SS + sx2)) * 4;
          r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
        }
      }
      if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
      idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
    }
  }
  return idx;
}

export function starBattleIcon() {
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
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
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

function blitSaucerPng(put, cx, cy, scale, body, dark, dome) {
  const rx = 46 * scale, ry = 20 * scale;
  const drx = 20 * scale, dry = 16 * scale;
  for (let y = -ry - dry; y <= ry + 4; y++) {
    for (let x = -rx; x <= rx; x++) {
      const nx = x / rx, ny = y / ry;
      if (nx * nx + ny * ny <= 1 && y > -ry * 0.35) {
        const t = (x + rx) / (rx * 2);
        const c = mix(dark, body, 0.35 + t * 0.5);
        put(cx + x, cy + y, c[0], c[1], c[2]);
      }
      const dx = x / drx, dy = (y + ry * 0.35) / dry;
      if (dx * dx + dy * dy <= 1 && y < ry * 0.2) {
        put(cx + x, cy + y, dome[0], dome[1], dome[2]);
      }
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
    for (let x = 0; x < W; x++) put(x, y, 12, 14, 22);
  }
  for (let i = 0; i < 180; i++) {
    const sx = (i * 97 + 13) % W;
    const sy = (i * 53 + 29) % H;
    const b = 180 + (i % 60);
    put(sx, sy, b, b, b + 10);
    if (i % 7 === 0) {
      put(sx + 1, sy, b, b, b);
      put(sx, sy + 1, b, b, b);
    }
  }

  blitSaucerPng(put, 220, 400, 2.4, YEL, YEL_D, DOME);
  blitSaucerPng(put, 180, 220, 1.6, GREEN, mix(GREEN, [0, 0, 0], 0.3), DOME);
  blitSaucerPng(put, 860, 180, 2.1, RED, RED_D, [200, 200, 210]);
  blitSaucerPng(put, 980, 360, 1.8, RED, RED_D, [200, 200, 210]);
  blitSaucerPng(put, 740, 480, 1.5, RED, RED_D, [200, 200, 210]);
  blitSaucerPng(put, 1080, 140, 1.2, [160, 120, 90], [100, 70, 50], [180, 180, 180]);

  // shots
  for (const s of [[340, 396], [420, 392], [500, 388], [260, 216]]) {
    for (let py = 0; py < 8; py++) {
      for (let px = 0; px < 22; px++) put(s[0] + px, s[1] + py, GOLD[0], GOLD[1], GOLD[2]);
    }
  }

  // fuel bottle
  for (let y = 0; y < 36; y++) {
    for (let x = 0; x < 22; x++) {
      const dx = (x - 11) / 11, dy = (y - 18) / 18;
      if (dx * dx + dy * dy < 1) put(520 + x, 80 + y, 70, 170, 90);
    }
  }

  drawText(put, 36, 24, 'STAR BATTLE', 5, 236, 220, 90);

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
