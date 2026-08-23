// Procedural Splat icon: a dark rounded card holding a ring of soft coloured
// blobs that slowly turn. Pure Node, super-sample → box-downsample → small
// palette; deterministic so builds reproduce.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [8, 10, 18];
const CARD_D = [4, 5, 10];
const INK = [232, 238, 252];
const BLUE = [70, 110, 255];
const CYAN = [80, 220, 230];
const MAGENTA = [230, 80, 180];
const GOLD = [250, 190, 70];
const RED = [240, 70, 80];
const GREEN = [80, 210, 110];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
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
function hsv(h, s, v) {
  h = (h % 1 + 1) % 1;
  const i = h * 6 | 0, f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  let r, g, b;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q; break;
  }
  return [r * 255, g * 255, b * 255];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, CARD_D, INK, BLUE, CYAN, MAGENTA, GOLD, RED, GREEN]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.4).map(Math.round));
  }
  for (let i = 0; i < 12; i++) pal.push(hsv(i / 12, 0.7, 0.9).map(Math.round));
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
function rot(p, ay) {
  const c = Math.cos(ay), s = Math.sin(ay);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}

function blobs(f) {
  const t = f / FRAMES;
  const ay = t * Math.PI * 2;
  const out = [];
  const R = 0.95, r = 0.28;
  for (let i = 0; i < 36; i++) {
    const u = i / 36 * Math.PI * 2;
    for (let j = 0; j < 8; j++) {
      const v = j / 8 * Math.PI * 2;
      const x = (R + r * Math.cos(v)) * Math.cos(u);
      const y = r * Math.sin(v) * 0.85;
      const z = (R + r * Math.cos(v)) * Math.sin(u);
      const p = rot([x, y, z], ay);
      out.push({ x: p[0], y: p[1], z: p[2], c: hsv(i / 36, 0.75, 0.95), rad: 5.5 });
    }
  }
  const balls = [
    { p: [-0.85, -0.15, 0.4], c: RED, rad: 0.32 },
    { p: [0.8, -0.18, 0.35], c: CYAN, rad: 0.28 },
    { p: [0.1, -0.2, -0.7], c: GOLD, rad: 0.26 },
  ];
  for (const b of balls) {
    const p = rot(b.p, ay);
    out.push({ x: p[0], y: p[1], z: p[2], c: b.c, rad: 9 });
  }
  out.sort((a, b) => a.z - b.z);
  return out;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const dots = blobs(f);
  const m = 8, rad = 22;
  const ox = OUT / 2, oy = OUT / 2 + 2, sc = 38;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    if (!inCard(x, y, m, rad)) continue;
    let col = mix(CARD, CARD_D, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
    for (const d of dots) {
      const sx = ox + d.x * sc, sy = oy - d.y * sc - d.z * 6;
      const dx = x - sx, dy = y - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const rr = d.rad * (0.55 + 0.2 * (d.z + 1.2));
      if (dist < rr) {
        const k = Math.max(0, 1 - dist / rr);
        const fall = k * k;
        col = mix(col, d.c, fall);
      }
    }
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

export function splatIcon() {
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
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
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

  fill(0, 0, W, H, 6, 8, 14);
  drawText(put, 48, 48, 'SPLAT', 8, 232, 238, 252);
  drawText(put, 48, 130, 'DRAG TO LOOK', 3, 70, 110, 255);
  drawText(put, 48, 190, 'A SCENE IN', 3, 180, 190, 210);
  drawText(put, 48, 230, 'THIS APP', 3, 180, 190, 210);
  rr(48, 300, 360, 372, 10, 70, 110, 255);
  drawText(put, 70, 322, 'ONE FINGER', 3, 8, 10, 18);

  // The scene: a ring of coloured blobs + three balls.
  const ox = 820, oy = 400, sc = 210, ay = 0.55;
  function r3(p) {
    const c = Math.cos(ay), s = Math.sin(ay);
    return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
  }
  const dots = [];
  const R = 0.95, r = 0.28;
  for (let i = 0; i < 40; i++) {
    const u = i / 40 * Math.PI * 2;
    for (let j = 0; j < 10; j++) {
      const v = j / 10 * Math.PI * 2;
      const x = (R + r * Math.cos(v)) * Math.cos(u);
      const y = r * Math.sin(v);
      const z = (R + r * Math.cos(v)) * Math.sin(u);
      const p = r3([x, y, z]);
      dots.push({ x: p[0], y: p[1], z: p[2], c: hsv(i / 40, 0.75, 0.95), rad: 16 });
    }
  }
  for (const b of [
    { p: [-0.9, -0.2, 0.45], c: [240, 70, 80], rad: 38 },
    { p: [0.85, -0.22, 0.4], c: [80, 220, 230], rad: 34 },
    { p: [0.1, -0.24, -0.75], c: [250, 190, 70], rad: 32 },
  ]) {
    const p = r3(b.p);
    dots.push({ x: p[0], y: p[1], z: p[2], c: b.c, rad: b.rad });
  }
  dots.sort((a, b) => a.z - b.z);
  for (const d of dots) {
    const sx = ox + d.x * sc, sy = oy - d.y * sc - d.z * 40;
    const rad = d.rad * (0.7 + 0.2 * (d.z + 1.2));
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > rad) continue;
      const k = 1 - dist / rad;
      const fall = k * k;
      const px = sx + dx | 0, py = sy + dy | 0;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const o = (py * W + px) * 4;
      const t = Math.min(1, fall * 1.15);
      rgba[o] = rgba[o] * (1 - t) + d.c[0] * t;
      rgba[o + 1] = rgba[o + 1] * (1 - t) + d.c[1] * t;
      rgba[o + 2] = rgba[o + 2] * (1 - t) + d.c[2] * t;
      rgba[o + 3] = 255;
    }
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
