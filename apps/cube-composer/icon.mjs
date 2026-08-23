// Procedural Cube Composer icon: isometric cubes that turn yellow → red.
// Pure Node, super-sample → box-downsample. Deterministic.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 10;

const CREAM = [250, 250, 248];
const CYAN = [0, 160, 176];
const BROWN = [106, 74, 60];
const RED = [204, 51, 63];
const ORANGE = [235, 104, 65];
const YELLOW = [237, 201, 81];
const INK = [71, 49, 40];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function shade(rgb, k) {
  return [
    Math.max(0, Math.min(255, rgb[0] * k)),
    Math.max(0, Math.min(255, rgb[1] * k)),
    Math.max(0, Math.min(255, rgb[2] * k))
  ];
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
  for (const b of [CREAM, CYAN, BROWN, RED, ORANGE, YELLOW, INK]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.08).map(Math.round));
    for (let s = 1; s <= 3; s++) pal.push(mix(b, [0, 0, 0], s * 0.18).map(Math.round));
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

const COS = Math.sqrt(3) / 2, SIN = 0.5;
function iso(x, y, z) { return { x: (x - y) * COS, y: z - (x + y) * SIN }; }

function fillTri(put, a, b, c, rgb) {
  const minX = Math.floor(Math.min(a.x, b.x, c.x));
  const maxX = Math.ceil(Math.max(a.x, b.x, c.x));
  const minY = Math.floor(Math.min(a.y, b.y, c.y));
  const maxY = Math.ceil(Math.max(a.y, b.y, c.y));
  const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (Math.abs(area) < 0.01) return;
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const w0 = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    const w1 = (c.x - b.x) * (y - b.y) - (c.y - b.y) * (x - b.x);
    const w2 = (a.x - c.x) * (y - c.y) - (a.y - c.y) * (x - c.x);
    if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) {
      put(x, y, rgb[0], rgb[1], rgb[2]);
    }
  }
}
function fillQuad(put, p, rgb) {
  fillTri(put, p[0], p[1], p[2], rgb);
  fillTri(put, p[0], p[2], p[3], rgb);
}

function projectCube(wx, wy, wz, s, ox, oy, scale) {
  const P = (dx, dy, dz) => {
    const p = iso(wx + dx * s, wy + dy * s, wz + dz * s);
    return { x: ox + p.x * scale, y: oy - p.y * scale };
  };
  return {
    top: [P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)],
    right: [P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1)],
    left: [P(0, 1, 0), P(1, 1, 0), P(1, 1, 1), P(0, 1, 1)],
    depth: wx + wy + wz
  };
}

function lerpColor(a, b, t) { return mix(a, b, Math.max(0, Math.min(1, t))); }

function wallAt(f) {
  const t = f / (FRAMES - 1);
  // Valley of yellows turning red, left to right.
  const cols = [
    ['Yellow', 'Yellow', 'Red'],
    ['Yellow', 'Red'],
    ['Red'],
    ['Red'],
    ['Yellow', 'Red'],
    ['Yellow', 'Yellow', 'Red']
  ];
  return cols.map((stack, i) => {
    const turn = (t - i * 0.12) / 0.35;
    return stack.map((c) => {
      if (c !== 'Yellow') return RED;
      return lerpColor(YELLOW, RED, turn);
    });
  });
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 6, rad = 18;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    if (inCard(x, y, m, rad)) {
      const o = (py * RW + px) * 4;
      rgba[o] = CREAM[0]; rgba[o + 1] = CREAM[1]; rgba[o + 2] = CREAM[2]; rgba[o + 3] = 1;
    }
  }
  function put(x, y, r, g, b) {
    if (x < 0 || y < 0 || x >= OUT || y >= OUT) return;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      if (rgba[o + 3] < 0.5) continue;
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b;
    }
  }

  const wall = wallAt(f);
  const cubes = [];
  const ox = 78, oy = 108, scale = 11, s = 0.92;
  const reversed = wall.slice().reverse();
  for (let x = 0; x < reversed.length; x++) {
    const stack = reversed[x];
    for (let z = 0; z < stack.length; z++) {
      const wx = -(reversed.length - x);
      cubes.push({ face: projectCube(wx, 0, z, s, ox, oy, scale), rgb: stack[z] });
    }
  }
  cubes.sort((a, b) => a.face.depth - b.face.depth);
  for (const c of cubes) {
    fillQuad(put, c.face.left, shade(c.rgb, 0.58));
    fillQuad(put, c.face.right, shade(c.rgb, 0.78));
    fillQuad(put, c.face.top, shade(c.rgb, 1.05));
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

export function cubeComposerIcon() {
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
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
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

  fill(0, 0, W, H, 250, 250, 248);
  fill(48, 48, 248, 118, 222, 68, 23);
  fill(248, 48, 640, 118, 71, 49, 40);
  drawText(put, 72, 66, 'CUBE', 6, 255, 255, 255);
  drawText(put, 268, 66, 'COMPOSER', 6, 255, 255, 255);

  drawText(put, 56, 160, 'LINE UP THE CUBES', 3, 106, 74, 60);
  drawText(put, 56, 210, 'TAP A FUNCTION', 3, 204, 51, 63);
  drawText(put, 56, 260, 'MATCH THE PICTURE', 3, 106, 74, 60);
  fill(56, 330, 340, 400, 235, 104, 65);
  drawText(put, 80, 350, 'PLAY A FRIEND', 3, 255, 255, 255);
  drawText(put, 56, 430, 'PRESS INVITE', 3, 204, 51, 63);
  drawText(put, 56, 480, 'SAME PUZZLE', 3, 106, 74, 60);
  drawText(put, 56, 530, 'FIRST TO MATCH WINS', 3, 106, 74, 60);

  const cols = [
    [YELLOW, YELLOW, RED],
    [YELLOW, RED],
    [RED],
    [RED],
    [YELLOW, RED],
    [YELLOW, YELLOW, RED]
  ];
  const ox = 820, oy = 480, scale = 44, s = 0.92;
  const cubes = [];
  const reversed = cols.slice().reverse();
  for (let x = 0; x < reversed.length; x++) {
    const stack = reversed[x];
    for (let z = 0; z < stack.length; z++) {
      cubes.push({
        face: projectCube(-(reversed.length - x), 0, z, s, ox, oy, scale),
        rgb: stack[z]
      });
    }
  }
  cubes.sort((a, b) => a.face.depth - b.face.depth);
  const sput = (x, y, r, g, b) => put(x | 0, y | 0, r, g, b);
  for (const c of cubes) {
    fillQuad(sput, c.face.left, shade(c.rgb, 0.58));
    fillQuad(sput, c.face.right, shade(c.rgb, 0.78));
    fillQuad(sput, c.face.top, shade(c.rgb, 1.05));
  }

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
