// Procedural icon for Underrun: a dark rounded card, a receding corridor,
// a soldier firing, a spider with red eyes. Pure Node — super-sample →
// box-downsample → small palette. Deterministic so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [18, 10, 6];
const CARD_B = [6, 4, 4];
const FLOOR = [42, 28, 16];
const FLOOR2 = [28, 18, 10];
const WALL = [22, 14, 10];
const WALL_L = [36, 22, 12];
const ORANGE = [204, 136, 0];
const ORANGE_H = [238, 153, 0];
const GLOW = [255, 112, 32];
const BLUE = [48, 72, 120];
const BLUE_L = [80, 120, 176];
const SPIDER = [16, 12, 10];
const EYE = [220, 40, 16];
const INK = [236, 220, 180];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, FLOOR, FLOOR2, WALL, WALL_L, ORANGE, ORANGE_H, GLOW, BLUE, BLUE_L, SPIDER, EYE, INK]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.45).map(Math.round));
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

function put(rgba, x, y, col, a) {
  const xi = x | 0, yi = y | 0;
  if (xi < 0 || yi < 0 || xi >= RW || yi >= RW) return;
  const o = (yi * RW + xi) * 4;
  if (a == null || a >= 1) {
    rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    return;
  }
  if (!rgba[o + 3]) return;
  rgba[o] = rgba[o] * (1 - a) + col[0] * a;
  rgba[o + 1] = rgba[o + 1] * (1 - a) + col[1] * a;
  rgba[o + 2] = rgba[o + 2] * (1 - a) + col[2] * a;
}

function fillRect(rgba, x, y, w, h, col) {
  for (let py = y * SS; py < (y + h) * SS; py++) {
    for (let px = x * SS; px < (x + w) * SS; px++) put(rgba, px, py, col);
  }
}

function soldier(rgba, x, y, sc, bob, stride, flash, colB, colH) {
  const s = sc;
  fillRect(rgba, x + 3 * s, y, 8 * s, 6 * s, colH);
  fillRect(rgba, x + 2 * s, y + 6 * s, 10 * s, 12 * s, colB);
  fillRect(rgba, x + 11 * s, y + 8 * s + bob * 0.2, 11 * s, 3 * s, colB);
  const l1 = stride > 0 ? 12 : 5;
  const l2 = stride > 0 ? 5 : 12;
  fillRect(rgba, x + 4 * s, y + 18 * s, 3 * s, l1 * s, colB);
  fillRect(rgba, x + 9 * s, y + 18 * s, 3 * s, l2 * s, colB);
  if (flash) {
    fillRect(rgba, x + 21 * s, y + 7 * s, 5 * s, 5 * s, GLOW);
    fillRect(rgba, x + 25 * s, y + 8 * s, 6 * s, 3 * s, ORANGE_H);
  }
}

function spiderAt(rgba, cx, cy, sc, legs) {
  const w = 10 * sc, h = 7 * sc;
  fillRect(rgba, cx, cy, w, h, SPIDER);
  fillRect(rgba, cx - 4 * sc, cy + (2 + legs) * sc, 4 * sc, 2 * sc, SPIDER);
  fillRect(rgba, cx + w, cy + (2 - legs) * sc, 4 * sc, 2 * sc, SPIDER);
  fillRect(rgba, cx - 3 * sc, cy + (5 - legs) * sc, 3 * sc, 2 * sc, SPIDER);
  fillRect(rgba, cx + w + sc, cy + (5 + legs) * sc, 3 * sc, 2 * sc, SPIDER);
  fillRect(rgba, cx + 1 * sc, cy + 2 * sc, 2 * sc, 2 * sc, EYE);
  fillRect(rgba, cx + 7 * sc, cy + 2 * sc, 2 * sc, 2 * sc, EYE);
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const scroll = t * 8;
  const bob = Math.abs(Math.sin(t * Math.PI * 4)) * 3.6;
  const stride = Math.sin(t * Math.PI * 4);
  const flash = (f % 3) !== 1;
  const legs = (f % 2);

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 20)) continue;
      let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      const vpX = 64, vpY = 26;
      if (y > vpY) {
        const depth = (y - vpY) / (OUT - 12 - vpY);
        const half = 5 + depth * 50;
        const left = vpX - half, right = vpX + half;
        if (x > left && x < right) {
          const u = (x - left) / (right - left);
          const tile = ((Math.floor(u * 8 + scroll) + Math.floor(depth * 10 + scroll)) & 1);
          col = mix(tile ? FLOOR : FLOOR2, ORANGE, 0.06 + depth * 0.16);
        } else if (x > left - 10 && x < left) {
          col = mix(WALL, WALL_L, (x - (left - 10)) / 10);
        } else if (x < right + 10 && x > right) {
          col = mix(WALL_L, WALL, (x - right) / 10);
        }
      }
      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }

  // spider rushing the soldier — grows as it comes down the hall, pops, next
  const st = (t * 1.05) % 1;
  const sc = 0.45 + st * 1.15;
  const sy = 30 + st * 42;
  const sx = 58 + Math.sin(st * 9) * 3;
  if (st < 0.86) {
    spiderAt(rgba, sx, sy, sc, legs);
  } else {
    const burst = (st - 0.86) / 0.14;
    fillRect(rgba, sx + 2, sy, 8 + burst * 10, 6 + burst * 6, GLOW);
    fillRect(rgba, sx + 4, sy + 2, 4, 4, ORANGE_H);
  }

  // a second spider further up the hall
  const st2 = (st + 0.45) % 1;
  if (st2 < 0.75) {
    spiderAt(rgba, 70 - st2 * 4, 28 + st2 * 28, 0.4 + st2 * 0.7, 1 - legs);
  }

  // extra soldier — smaller, further up, running with you
  const p2y = 58 + bob * 0.4;
  soldier(rgba, 40, p2y, 0.55, bob, -stride, (f % 3) === 0, [40, 90, 50], [90, 140, 90]);

  // you — running, legs pumping, muzzle flashing
  soldier(rgba, 52, 78 + bob, 1.08, bob, stride, flash, BLUE, BLUE_L);

  // plasma bolt traveling up the corridor
  const bolt = (t * 3) % 1;
  fillRect(rgba, 78 + bolt * 2, 78 - bolt * 48, 3, 5, GLOW);
  fillRect(rgba, 79 + bolt * 2, 76 - bolt * 48, 2, 3, ORANGE_H);

  // health pips
  for (let i = 0; i < 5; i++) fillRect(rgba, 14 + i * 5, 14, 3, 3, ORANGE);

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = SS * SS;
      for (let sy2 = 0; sy2 < SS; sy2++) {
        for (let sx2 = 0; sx2 < SS; sx2++) {
          const o = (((y * SS + sy2) * RW) + (x * SS + sx2)) * 4;
          r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
        }
      }
      if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
      idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
    }
  }
  return idx;
}

export function underrunIcon() {
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
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  3: [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  4: [0b10001, 0b10001, 0b10001, 0b11111, 0b00001, 0b00001, 0b00001],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

function drawText(putp, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (gph[row] & (1 << (4 - col))) {
          for (let dy = 0; dy < s; dy++) {
            for (let dx = 0; dx < s; dx++) putp(cx + col * s + dx, y + row * s + dy, r, g, b);
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
  const putp = (x, y, r, g, b, a) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const fog = Math.max(0, Math.min(1, y / H));
      putp(x, y, 8 + fog * 10, 4 + fog * 4, 2);
    }
  }

  const vpX = W / 2, vpY = 78;
  for (let y = vpY; y < H; y++) {
    const depth = (y - vpY) / (H - vpY);
    const half = 28 + depth * 560;
    const left = vpX - half, right = vpX + half;
    for (let x = 0; x < W; x++) {
      if (x > left && x < right) {
        const u = (x - left) / (right - left);
        const tile = ((Math.floor(u * 14) + Math.floor(depth * 18)) & 1);
        const shade = tile ? 52 : 34;
        const glow = depth * 22;
        putp(x, y, shade + glow, 30 + glow * 0.55, 12);
      } else if (x > left - 80 && x <= left) {
        const w = (x - (left - 80)) / 80;
        putp(x, y, 24 + w * 22, 14 + w * 10, 8);
      } else if (x >= right && x < right + 80) {
        const w = 1 - (x - right) / 80;
        putp(x, y, 24 + w * 22, 14 + w * 10, 8);
      }
    }
  }

  function blob(cx, cy, rx, ry, r, g, b) {
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) putp(cx + x, cy + y, r, g, b);
      }
    }
  }

  function soldier(sx, sy, sc, head, body, flash) {
    const [hr, hg, hb] = head, [br, bg, bb] = body;
    for (let y = 0; y < 28 * sc; y++) for (let x = 0; x < 36 * sc; x++) putp(sx + 12 * sc + x, sy + y, hr, hg, hb);
    for (let y = 0; y < 70 * sc; y++) for (let x = 0; x < 50 * sc; x++) putp(sx + 6 * sc + x, sy + 28 * sc + y, br, bg, bb);
    for (let y = 0; y < 16 * sc; y++) for (let x = 0; x < 54 * sc; x++) putp(sx + 50 * sc + x, sy + 48 * sc + y, br, bg, bb);
    for (let y = 0; y < 48 * sc; y++) for (let x = 0; x < 16 * sc; x++) putp(sx + 14 * sc + x, sy + 98 * sc + y, br, bg, bb);
    for (let y = 0; y < 40 * sc; y++) for (let x = 0; x < 16 * sc; x++) putp(sx + 36 * sc + x, sy + 98 * sc + y, br, bg, bb);
    if (flash) {
      blob(sx + 118 * sc, sy + 52 * sc, 18 * sc, 14 * sc, 255, 140, 36);
      blob(sx + 132 * sc, sy + 52 * sc, 10 * sc, 7 * sc, 255, 210, 80);
    }
  }

  function spider(cx, cy, sc) {
    for (let y = 0; y < 10 * sc; y++) for (let x = 0; x < 16 * sc; x++) putp(cx + x, cy + y, 18, 12, 10);
    for (let k = 0; k < 4; k++) {
      const ly = (k < 2 ? 2 : 6) * sc, sx = k % 2 === 0 ? -5 * sc : 16 * sc;
      for (let y = 0; y < 3 * sc; y++) for (let x = 0; x < 6 * sc; x++) putp(cx + sx + x, cy + ly + y, 18, 12, 10);
    }
    for (let y = 0; y < 4 * sc; y++) for (let x = 0; x < 3 * sc; x++) {
      putp(cx + 3 * sc + x, cy + 3 * sc + y, 220, 40, 16);
      putp(cx + 10 * sc + x, cy + 3 * sc + y, 220, 40, 16);
    }
  }

  function sentry(cx, cy, sc) {
    for (let y = 0; y < 22 * sc; y++) for (let x = 0; x < 18 * sc; x++) putp(cx + x, cy + y, 70, 48, 28);
    for (let y = 0; y < 8 * sc; y++) for (let x = 0; x < 14 * sc; x++) putp(cx + 18 * sc + x, cy + 6 * sc + y, 90, 60, 32);
    blob(cx + 9 * sc, cy + 8 * sc, 3 * sc, 3 * sc, 220, 40, 16);
  }

  // extra soldier, mid-hall, firing left-forward
  soldier(340, 330, 0.62, [90, 140, 90], [40, 90, 50], true);

  // sentry on the right wall
  sentry(820, 250, 2.2);

  // spiders in the kill zone
  spider(610, 210, 2.4);
  spider(720, 268, 3.2);
  spider(490, 240, 2.6);
  spider(640, 340, 4.4);
  spider(430, 380, 3.6);

  // you, mid-stride, gun up, muzzle lit
  soldier(530, 455, 1.05, [70, 110, 170], [48, 72, 120], true);

  // plasma bolts in the air
  const bolts = [
    [690, 470, 10, 6], [730, 430, 9, 5], [780, 370, 8, 5],
    [640, 400, 7, 4], [810, 320, 6, 4], [500, 360, 8, 5],
  ];
  for (const [x, y, rx, ry] of bolts) blob(x, y, rx, ry, 255, 96, 28);

  // a spider popping — orange burst
  blob(760, 300, 28, 22, 255, 120, 32);
  blob(760, 300, 12, 10, 255, 210, 90);

  // health pack
  for (let y = 0; y < 36; y++) for (let x = 0; x < 22; x++) putp(300 + x, 430 + y, 40, 110, 50);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) putp(303 + x, 422 + y, 70, 150, 70);

  // health pips — four left, mid-fight
  for (let i = 0; i < 4; i++) {
    for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) putp(36 + i * 22 + x, 28 + y, 238, 153, 0);
  }

  drawText(putp, 36, 56, 'FLOOR 1', 4, 238, 153, 0);
  drawText(putp, 36, 92, 'BEST 2', 3, 204, 136, 0);

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
