// Procedural Matter Sandbox icon: a coloured stack that leans and collapses.
// Cover paints a real stepped world (bodies from the engine). Pure Node.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 14;

const CARD = [11, 13, 20];
const CARD_D = [6, 8, 14];
const INK = [14, 16, 22];
const ORANGE = [241, 150, 72];
const GOLD = [245, 210, 89];
const RED = [245, 90, 60];
const NAVY = [6, 62, 123];
const CREAM = [236, 236, 209];
const TEAL = [78, 205, 196];
const ROCK = [196, 92, 56];
const FLOOR = [26, 32, 48];
const FILLS = [ORANGE, GOLD, RED, NAVY, CREAM, TEAL];

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
  for (const b of [CARD, CARD_D, INK, FLOOR, ROCK, ...FILLS]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.45).map(Math.round));
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

function xformBox(cx, cy, w, h, rot) {
  const hw = w / 2, hh = h / 2;
  const c = Math.cos(rot), s = Math.sin(rot);
  const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  const out = [];
  for (const p of corners) {
    out.push(c * p[0] - s * p[1] + cx, s * p[0] + c * p[1] + cy);
  }
  return out;
}
function inPoly(px, py, pts) {
  let inside = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2], yi = pts[i * 2 + 1];
    const xj = pts[j * 2], yj = pts[j * 2 + 1];
    const inter = ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-9) + xi);
    if (inter) inside = !inside;
  }
  return inside;
}
function distSeg(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-8) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / l2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}
function distPoly(px, py, pts) {
  let best = 1e9;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const d = distSeg(px, py, pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1]);
    if (d < best) best = d;
  }
  return best;
}

// 1+2+3+4 pyramid. A rock flies in from the left, knocks the stack over.
function boxesFor(f) {
  const t = f / (FRAMES - 1);
  const hit = Math.max(0, (t - 0.18) / 0.82);
  const fall = hit * hit;
  const rows = [
    { y: 86, xs: [40, 56, 72, 88], delay: 0.16 },
    { y: 70, xs: [48, 64, 80], delay: 0.08 },
    { y: 54, xs: [56, 72], delay: 0.02 },
    { y: 38, xs: [64], delay: 0 }
  ];
  const boxes = [];
  let k = 0;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let i = 0; i < row.xs.length; i++) {
      const local = Math.max(0, Math.min(1, (fall - row.delay) / 0.7));
      const lean = local * (0.35 + i * 0.12);
      const dx = local * (10 + i * 6 + (3 - r) * 4);
      const dy = local * local * (38 + r * 2);
      const rot = lean * (i % 2 === 0 ? 1 : -0.7) + local * 0.9 * (r - 1);
      boxes.push({
        pts: xformBox(row.xs[i] + dx, row.y + dy, 15, 14, rot),
        color: FILLS[k % FILLS.length]
      });
      k++;
    }
  }
  const rockT = Math.min(1, t / 0.42);
  const rx = 22 + rockT * 40;
  const ry = 58 - Math.sin(rockT * Math.PI) * 8;
  boxes.push({
    circle: true, x: rx, y: ry, r: 6, color: ROCK
  });
  return boxes;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const boxes = boxesFor(f);
  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 20)) continue;
      let col = mix(CARD, CARD_D, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      if (y > 98 && y < 108 && x > 22 && x < 106) col = FLOOR;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (b.circle) {
          const d = Math.hypot(x - b.x, y - b.y);
          if (d < b.r) col = d > b.r - 1.1 ? INK : b.color;
        } else if (inPoly(x, y, b.pts)) {
          const d = distPoly(x, y, b.pts);
          col = d < 1.05 ? INK : b.color;
        }
      }
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

export function matterSandboxIcon() {
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
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b01010, 0b00100],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0, 0b00100],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
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

function hexRgb(h) {
  const s = String(h || '#f19648').replace('#', '');
  if (s.length < 6) return ORANGE;
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function fillPoly(put, pts, r, g, b) {
  if (!pts || pts.length < 6) return;
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i] < minX) minX = pts[i];
    if (pts[i] > maxX) maxX = pts[i];
    if (pts[i + 1] < minY) minY = pts[i + 1];
    if (pts[i + 1] > maxY) maxY = pts[i + 1];
  }
  minX = Math.max(0, Math.floor(minX));
  maxX = Math.min(1199, Math.ceil(maxX));
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(719, Math.ceil(maxY));
  if (minX > maxX || minY > maxY) return;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (inPoly(x + 0.5, y + 0.5, pts)) put(x, y, r, g, b);
    }
  }
}
function strokePoly(put, pts, w, r, g, b) {
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    strokeLine(put, pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1], w, r, g, b);
  }
}
function strokeLine(put, x0, y0, x1, y1, w, r, g, b) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const steps = Math.ceil(len);
  const rad = w;
  for (let i = 0; i <= steps; i++) {
    const x = x0 + dx * (i / steps);
    const y = y0 + dy * (i / steps);
    const xA = Math.floor(x - rad), xB = Math.ceil(x + rad);
    const yA = Math.floor(y - rad), yB = Math.ceil(y + rad);
    for (let yy = yA; yy <= yB; yy++) {
      for (let xx = xA; xx <= xB; xx++) {
        if ((xx - x) * (xx - x) + (yy - y) * (yy - y) <= rad * rad) put(xx, yy, r, g, b);
      }
    }
  }
}
function fillCircle(put, cx, cy, rad, r, g, b) {
  const xA = Math.floor(cx - rad), xB = Math.ceil(cx + rad);
  const yA = Math.floor(cy - rad), yB = Math.ceil(cy + rad);
  for (let y = yA; y <= yB; y++) {
    for (let x = xA; x <= xB; x++) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
    }
  }
}

function roundRect(put, x, y, w, h, r, R, G, B) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const cx = Math.min(Math.max(xx, x + r), x + w - r);
      const cy = Math.min(Math.max(yy, y + r), y + h - r);
      let ok = false;
      if (xx >= x + r && xx < x + w - r) ok = true;
      else if (yy >= y + r && yy < y + h - r) ok = true;
      else ok = (xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) <= r * r;
      if (ok) put(xx, yy, R, G, B);
    }
  }
}

export function screenshotPng(scene) {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b, a) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) put(x, y, 11, 13, 20);
  }

  // Fill the card with the floor of the world (the action). Scale 1.5, crop the empty sky.
  const sc = 1.5, ox = 0, oy = -180;
  const bodies = (scene && scene.bodies) || [];
  for (const body of bodies) {
    if (body.wall && body.y < 520) continue;
    const rgb = hexRgb(body.color);
    if (body.r && body.r > 2) {
      fillCircle(put, ox + body.x * sc, oy + body.y * sc, body.r * sc, rgb[0], rgb[1], rgb[2]);
      continue;
    }
    if (!body.verts || body.verts.length < 6) continue;
    const pts = [];
    for (let i = 0; i < body.verts.length; i += 2) {
      pts.push(ox + body.verts[i] * sc, oy + body.verts[i + 1] * sc);
    }
    fillPoly(put, pts, rgb[0], rgb[1], rgb[2]);
    strokePoly(put, pts, 1.7, 14, 16, 22);
  }
  const cs = (scene && scene.constraints) || [];
  for (const c of cs) {
    strokeLine(put, ox + c.x1 * sc, oy + c.y1 * sc, ox + c.x2 * sc, oy + c.y2 * sc,
      c.sling ? 3.0 : 1.8, 210, 164, 120);
  }

  roundRect(put, 0, 0, W, 72, 0, 18, 24, 32);
  const labels = ['GRAB', 'BOX', 'BALL', 'RAGDOLL', 'SLING', 'STACK'];
  let bx = 18;
  for (let i = 0; i < labels.length; i++) {
    const on = i === 4;
    const tw = labels[i].length * 11 + 22;
    roundRect(put, bx, 16, tw, 40, 6, on ? 241 : 22, on ? 150 : 32, on ? 72 : 42);
    drawText(put, bx + 10, 26, labels[i], 2, on ? 26 : 232, on ? 18 : 238, on ? 8 : 244);
    bx += tw + 10;
  }
  roundRect(put, 560, 24, 170, 16, 8, 42, 28, 20);
  roundRect(put, 662, 20, 22, 24, 8, 241, 150, 72);
  drawText(put, 560, 48, 'GRAVITY', 2, 138, 160, 176);
  roundRect(put, W - 248, 16, 124, 40, 6, 32, 22, 16);
  drawText(put, W - 234, 26, '2 IN ROOM', 2, 241, 150, 72);
  roundRect(put, W - 112, 16, 92, 40, 6, 26, 36, 48);
  drawText(put, W - 96, 26, 'RESET', 2, 232, 238, 244);

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
