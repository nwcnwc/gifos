// Procedural cover: a dim hallway, a door, a flashlight cone that sweeps.
// Not a particle-life / pivot heatmap. Deterministic.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const VOID = [8, 6, 5];
const WALL = [42, 28, 18];
const WALL2 = [28, 18, 12];
const FLOOR = [24, 16, 10];
const FLOOR2 = [36, 24, 14];
const DOOR = [18, 12, 8];
const DOORLIT = [196, 132, 58];
const AMBER = [232, 176, 88];
const BEAM = [255, 214, 140];
const KEY = [212, 168, 64];

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
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [VOID, WALL, WALL2, FLOOR, FLOOR2, DOOR, DOORLIT, AMBER, BEAM, KEY, [255, 255, 255]]) {
    pal.push(b.map((n) => n | 0));
    pal.push(mix(b, [255, 255, 255], 0.18).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
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

// Hallway in 1-point perspective. x,y in icon pixels.
function hall(x, y, swing) {
  const cx = 64, horizon = 52;
  const u = (x - cx) / 64;
  const v = (y - horizon) / 76;
  // door at vanishing point
  const doorW = 9 + Math.abs(v) * 2;
  const doorH = 22;
  const dx = x - cx, dy = y - (horizon + 6);
  const inDoor = Math.abs(dx) < doorW && dy > -doorH && dy < 8 && y < 78;
  const floor = y > horizon;
  const wallSide = !floor && Math.abs(u) > 0.12 + (horizon - y) * 0.004;
  let col = VOID;
  if (floor) {
    const plank = ((x + y * 0.4) / 7 | 0) & 1;
    col = mix(FLOOR, FLOOR2, plank);
    const recede = Math.min(1, (y - horizon) / 70);
    col = mix(col, VOID, 1 - recede * 0.7);
  } else if (wallSide) {
    const brick = ((y / 6 | 0) + (x / 9 | 0)) & 1;
    col = mix(WALL, WALL2, brick * 0.5);
    col = mix(col, VOID, Math.max(0, (52 - y) / 70));
  } else {
    col = mix(WALL2, VOID, 0.45);
  }
  if (inDoor) {
    const lit = Math.abs(dx) < doorW * 0.35 && dy > -6;
    col = lit ? DOORLIT : DOOR;
    if (dy > 0 && Math.abs(dx) < 1.6) col = mix(DOORLIT, AMBER, 0.5); // crack of light
  }
  // flashlight cone from bottom-left, sweeping
  const ox = 18, oy = 118;
  const ang = -0.55 + swing * 0.9;
  const vx = x - ox, vy = y - oy;
  const dist = Math.sqrt(vx * vx + vy * vy) + 0.01;
  const a = Math.atan2(vy, vx);
  const da = Math.abs(a - ang);
  const wrap = Math.min(da, Math.abs(da - Math.PI * 2));
  const cone = wrap < 0.28 && dist < 130;
  if (cone) {
    const fall = Math.max(0, 1 - dist / 130) * Math.max(0, 1 - wrap / 0.28);
    col = mix(col, BEAM, fall * 0.55);
    col = mix(col, AMBER, fall * 0.2);
  }
  // brass key on the floor, glints when the beam hits it
  const kx = 54, ky = 96;
  if ((x - kx) ** 2 + (y - ky) ** 2 < 9) {
    const hit = cone ? 1 : 0.25;
    col = mix(KEY, AMBER, hit);
  }
  // figure walking the boards toward the door (the loop is a walk, not a wiggle)
  const walk = (swing + 1) / 2;
  const wx = 26 + walk * 28;
  const wy = 114 - walk * 20;
  const dxw = x - wx, dyw = y - wy;
  const body = Math.abs(dxw) < 1.7 && dyw > -11 && dyw < 3;
  const head = dxw * dxw + (y - (wy - 12)) ** 2 < 5.5;
  if (body || head) {
    const lit = cone ? 0.35 : 0.12;
    col = mix([210, 214, 224], BEAM, lit);
  }
  return col;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const swing = Math.sin((f / (FRAMES - 1)) * Math.PI * 2);
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    if (!inCard(x, y, 5, 18)) continue;
    const col = hall(x, y, swing);
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
    idx[y * OUT + x] = a / n < 0.5 ? 0 : nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}

export function houseIcon() {
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
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
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
  const put = (x, y, r, g, b) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
  };
  const fill = (x0, y0, x1, y1, r, g, b) => {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    x1 = Math.min(W, x1 | 0); y1 = Math.min(H, y1 | 0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, r, g, b);
  };
  fill(0, 0, W, H, 10, 8, 7);

  const ox = 90, oy = 680;
  const ang = -0.42;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = x / W * 128, ny = y / H * 128;
    // reuse hall() in screenshot space with a wider door
    const cx = 600, horizon = 280;
    const u = (x - cx) / 600;
    const floor = y > horizon;
    const dx = x - cx, dy = y - (horizon + 20);
    const doorW = 48 + Math.abs(dy) * 0.04;
    const inDoor = Math.abs(dx) < doorW && dy > -210 && dy < 40 && y < 460;
    let col;
    if (floor) {
      const plank = ((x + y * 0.35) / 28 | 0) & 1;
      col = mix(FLOOR, FLOOR2, plank);
      col = mix(col, VOID, 1 - Math.min(1, (y - horizon) / 420) * 0.75);
    } else if (Math.abs(u) > 0.08 + (horizon - y) * 0.0004) {
      const brick = ((y / 22 | 0) + (x / 40 | 0)) & 1;
      col = mix(WALL, WALL2, brick * 0.45);
      col = mix(col, VOID, Math.max(0, (horizon - y) / 380));
    } else {
      col = mix(WALL2, VOID, 0.5);
    }
    if (inDoor) {
      col = Math.abs(dx) < doorW * 0.28 && dy > -40 ? DOORLIT : DOOR;
      if (dy > 10 && Math.abs(dx) < 6) col = mix(DOORLIT, AMBER, 0.55);
    }
    const vx = x - ox, vy = y - oy;
    const dist = Math.sqrt(vx * vx + vy * vy) + 0.01;
    const a = Math.atan2(vy, vx);
    const wrap = Math.abs(a - ang);
    if (wrap < 0.32 && dist < 980) {
      const fall = Math.max(0, 1 - dist / 980) * Math.max(0, 1 - wrap / 0.32);
      col = mix(col, BEAM, fall * 0.5);
      col = mix(col, AMBER, fall * 0.18);
    }
    const kx = 520, ky = 560;
    if ((x - kx) ** 2 / 80 + (y - ky) ** 2 / 28 < 1) col = mix(KEY, AMBER, 0.4);
    put(x, y, col[0] | 0, col[1] | 0, col[2] | 0);
  }

  drawText(put, 48, 36, 'THE HOUSE', 7, 244, 214, 160);
  drawText(put, 48, 96, 'THE FILE IS THE SAVE.', 3, 196, 148, 88);

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
