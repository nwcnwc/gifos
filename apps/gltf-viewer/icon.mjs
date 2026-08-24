// Procedural glTF Viewer icon: a wireframe cube that turns. Cover is a
// 1200×720 studio shot with an inspect panel. Pure Node.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [18, 20, 26];
const INK = [232, 236, 242];
const BLUE = [88, 166, 255];
const BLUE_D = [40, 90, 180];
const LINE = [70, 90, 120];
const GOLD = [230, 190, 90];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, INK, BLUE, BLUE_D, LINE, GOLD, [255, 255, 255]]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.3).map(Math.round));
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

function rotY(p, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0] * c - p[2] * s, p[1], p[0] * s + p[2] * c];
}
function rotX(p, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
}
function project(p, w, h, scale) {
  const z = p[2] + 4;
  const f = scale / z;
  return [w / 2 + p[0] * f, h / 2 - p[1] * f, z];
}

const CUBE = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
];
const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7]
];

function stroke(rgba, w, h, x0, y0, x1, y1, col, thick) {
  const dx = x1 - x0, dy = y1 - y0;
  const n = Math.max(2, Math.hypot(dx, dy) | 0);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + dx * t, y = y0 + dy * t;
    for (let oy = -thick; oy <= thick; oy++) for (let ox = -thick; ox <= thick; ox++) {
      const px = (x + ox) | 0, py = (y + oy) | 0;
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      if (ox * ox + oy * oy > thick * thick) continue;
      const o = (py * w + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const ang = t * Math.PI * 2;
  const m = 8, rad = 18;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    if (!inCard(x, y, m, rad)) continue;
    const o = (py * RW + px) * 4;
    const g = 18 + ((x + y) * 0.15) % 4;
    rgba[o] = g; rgba[o + 1] = g + 2; rgba[o + 2] = g + 8; rgba[o + 3] = 1;
  }
  const verts = CUBE.map((p) => {
    let q = rotY(p, ang);
    q = rotX(q, 0.45);
    return project(q, RW, RW, 140);
  });
  EDGES.forEach(([a, b], i) => {
    const col = i < 4 ? BLUE : (i < 8 ? mix(BLUE, GOLD, 0.4) : INK);
    stroke(rgba, RW, RW, verts[a][0], verts[a][1], verts[b][0], verts[b][1], col, 3.2);
  });
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

export function gltfViewerIcon() {
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
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
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
  X: [0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b01010, 0b10001],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  '/': [0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b10000, 0b10000],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
};
function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const gph = GLYPHS[ch] || GLYPHS[' '];
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

  fill(0, 0, W, H, 16, 16, 18);
  fill(0, 0, 900, H, 12, 12, 14);
  fill(900, 0, W, H, 28, 28, 30);

  // floor grid
  for (let i = 0; i < 18; i++) {
    const y = 420 + i * 16;
    const shade = 28 + i * 2;
    fill(40, y, 860, y + 1, shade, shade + 4, shade + 10);
  }

  const verts = CUBE.map((p) => {
    let q = rotY(p, 0.7);
    q = rotX(q, 0.5);
    const pr = project(q, 900, 720, 280);
    return [pr[0] + 40, pr[1] + 20, pr[2]];
  });
  function thickLine(x0, y0, x1, y1, col, th) {
    const dx = x1 - x0, dy = y1 - y0;
    const n = Math.max(2, Math.hypot(dx, dy) | 0);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + dx * t, y = y0 + dy * t;
      for (let oy = -th; oy <= th; oy++) for (let ox = -th; ox <= th; ox++) {
        if (ox * ox + oy * oy <= th * th) put(x + ox, y + oy, col[0], col[1], col[2]);
      }
    }
  }
  EDGES.forEach(([a, b], i) => {
    const col = i % 3 === 0 ? BLUE : (i % 3 === 1 ? GOLD : [200, 210, 230]);
    thickLine(verts[a][0], verts[a][1], verts[b][0], verts[b][1], col, 3);
  });

  drawText(put, 40, 28, 'GLTF VIEWER', 5, 232, 236, 242);
  drawText(put, 40, 78, 'DROP A MODEL. NOTHING UPLOADED.', 2, 154, 160, 166);

  drawText(put, 924, 28, 'SCENE', 3, 154, 160, 166);
  drawText(put, 924, 80, 'DUCK.GLB', 2, 232, 236, 242);
  drawText(put, 924, 120, '3 MESHES', 2, 154, 160, 166);
  drawText(put, 924, 150, '2 MATERIALS', 2, 154, 160, 166);
  drawText(put, 924, 180, '1840 TRIANGLES', 2, 154, 160, 166);
  drawText(put, 924, 240, 'DISPLAY', 3, 154, 160, 166);
  drawText(put, 924, 290, 'WIREFRAME', 2, 88, 166, 255);
  drawText(put, 924, 320, 'GRID', 2, 232, 236, 242);
  drawText(put, 924, 350, 'AUTO-ROTATE', 2, 232, 236, 242);
  drawText(put, 924, 380, 'NEUTRAL LIGHT', 2, 230, 190, 90);
  drawText(put, 924, 460, 'SCENE TREE', 3, 154, 160, 166);
  drawText(put, 924, 510, 'SCENE  ROOT', 2, 232, 236, 242);
  drawText(put, 940, 540, 'MESH  BODY', 2, 200, 210, 230);
  drawText(put, 940, 570, 'MESH  EYE', 2, 200, 210, 230);
  drawText(put, 940, 600, 'MESH  BEAK', 2, 200, 210, 230);

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
