// Procedural BreakLock icon: a 3×3 lock with a pattern being drawn, then
// Mastermind pegs. Transparent sticker, dark outline, readable at 64px.
// screenshotPng() is a 1200×720 mid-game cover — history + live lock.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 16;

const INK = [248, 248, 252];
const INK_D = [18, 18, 22];
const LINE = [220, 228, 240];
const SUCCESS = [17, 102, 153];
const ERR = [220, 40, 40];
const PEG = [255, 255, 255];
const DIM = [70, 70, 74];
const TIP = [160, 220, 255];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [INK, INK_D, LINE, SUCCESS, ERR, PEG, DIM, TIP]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
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

const PATH = [0, 1, 2, 5]; // 4-dot reverse-C — Easy
function xy(i, ox, oy, gutter) {
  return [ox + (i % 3) * gutter, oy + Math.floor(i / 3) * gutter];
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const ox = 28, oy = 18, gutter = 36, dotR = 6.4;
  const drawN = Math.min(PATH.length, 1 + Math.floor((Math.min(f, 11) / 11) * PATH.length));
  const sub = (Math.min(f, 11) / 11) * PATH.length - (drawN - 1);
  const done = f >= 12;
  const pegsOn = f >= 13;

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      let col = null;

      // Dots
      for (let i = 0; i < 9; i++) {
        const p = xy(i, ox, oy, gutter);
        const d = Math.hypot(x - p[0], y - p[1]);
        if (d < dotR + 1.6) {
          if (d > dotR) col = INK_D;
          else col = INK;
        }
      }

      // Drawn segments
      const segs = done ? PATH.length - 1 : Math.max(0, drawN - 1);
      for (let s = 0; s < segs; s++) {
        const a = xy(PATH[s], ox, oy, gutter);
        const b = xy(PATH[s + 1], ox, oy, gutter);
        const d = distSeg(x, y, a[0], a[1], b[0], b[1]);
        if (d < 3.4) col = d < 1.7 ? (done ? SUCCESS : LINE) : INK_D;
      }
      if (!done && drawN > 0 && drawN < PATH.length) {
        const a = xy(PATH[drawN - 1], ox, oy, gutter);
        const b = xy(PATH[drawN], ox, oy, gutter);
        const mx = a[0] + (b[0] - a[0]) * Math.min(1, sub);
        const my = a[1] + (b[1] - a[1]) * Math.min(1, sub);
        const d = distSeg(x, y, a[0], a[1], mx, my);
        if (d < 3.2) col = d < 1.6 ? LINE : INK_D;
        const tip = Math.hypot(x - mx, y - my);
        if (tip < 4.2) col = tip < 2.2 ? TIP : INK_D;
      }

      // Active dots along the path
      const lit = done ? PATH.length : drawN;
      for (let k = 0; k < lit; k++) {
        const p = xy(PATH[k], ox, oy, gutter);
        const d = Math.hypot(x - p[0], y - p[1]);
        if (d < dotR + 3 && d > dotR + 0.4) col = done ? SUCCESS : TIP;
      }

      // Pegs sit under the grid, not on the bottom dots
      if (pegsOn) {
        const pegY = 118;
        const pegs = [
          { x: 40, fill: true, ring: true },
          { x: 58, fill: true, ring: true },
          { x: 76, fill: false, ring: true },
          { x: 94, fill: false, ring: false }
        ];
        for (const pg of pegs) {
          const d = Math.hypot(x - pg.x, y - pegY);
          if (d < 6.2) {
            if (d > 4.6) col = pg.ring ? INK : DIM;
            else col = pg.fill ? PEG : (pg.ring ? mix(INK_D, PEG, 0.12) : mix(INK_D, DIM, 0.4));
          }
        }
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

export function breaklockIcon() {
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
    minCodeSize: 6, frames, delayCs: 9, transparentIndex: 0
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
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
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

function fillCircle(put, cx, cy, rad, r, g, b) {
  const xA = Math.floor(cx - rad), xB = Math.ceil(cx + rad);
  const yA = Math.floor(cy - rad), yB = Math.ceil(cy + rad);
  for (let y = yA; y <= yB; y++) {
    for (let x = xA; x <= xB; x++) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
    }
  }
}
function strokeCircle(put, cx, cy, rad, w, r, g, b) {
  const xA = Math.floor(cx - rad - w), xB = Math.ceil(cx + rad + w);
  const yA = Math.floor(cy - rad - w), yB = Math.ceil(cy + rad + w);
  const inner = (rad - w) * (rad - w), outer = (rad + w) * (rad + w);
  for (let y = yA; y <= yB; y++) {
    for (let x = xA; x <= xB; x++) {
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d <= outer && d >= inner) put(x, y, r, g, b);
    }
  }
}
function strokeLine(put, x0, y0, x1, y1, w, r, g, b) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const steps = Math.ceil(len);
  for (let i = 0; i <= steps; i++) {
    fillCircle(put, x0 + dx * (i / steps), y0 + dy * (i / steps), w, r, g, b);
  }
}

function drawLock(put, ox, oy, gutter, path, lineRgb, dotR, lineW) {
  for (let i = 0; i < 9; i++) {
    const p = xy(i, ox, oy, gutter);
    fillCircle(put, p[0], p[1], dotR, 255, 255, 255);
  }
  for (let s = 0; s < path.length - 1; s++) {
    const a = xy(path[s], ox, oy, gutter);
    const b = xy(path[s + 1], ox, oy, gutter);
    const t = s / Math.max(1, path.length - 2);
    const rgb = mix([102, 102, 102], lineRgb, t);
    strokeLine(put, a[0], a[1], b[0], b[1], lineW, rgb[0], rgb[1], rgb[2]);
  }
  if (path.length) {
    const last = xy(path[path.length - 1], ox, oy, gutter);
    fillCircle(put, last[0], last[1], dotR * 0.55, lineRgb[0], lineRgb[1], lineRgb[2]);
  }
}

function drawPegs(put, x, y, good, wrong, total, scale) {
  const gap = 16 * scale;
  const start = x - ((total - 1) * gap) / 2;
  for (let i = 0; i < total; i++) {
    const px = start + i * gap;
    const filled = i < good;
    const ring = i < good + wrong;
    if (filled) fillCircle(put, px, y, 5.5 * scale, 255, 255, 255);
    else fillCircle(put, px, y, 5.5 * scale, 12, 12, 16);
    strokeCircle(put, px, y, 5.5 * scale, 1.4 * scale,
      ring ? 255 : 70, ring ? 255 : 70, ring ? 255 : 74);
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
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 0, 0, 0);

  // Title bar — inverted like the original highlight
  for (let y = 28; y < 88; y++) {
    for (let x = 36; x < 430; x++) put(x, y, 255, 255, 255);
  }
  drawText(put, 52, 44, 'BREAKLOCK', 6, 0, 0, 0);

  drawText(put, 1020, 44, '007', 5, 255, 255, 255);
  drawText(put, 36, 112, 'ABORT', 3, 210, 210, 214);

  // Dotted rule under the status bar, like the original
  for (let x = 36; x < 1164; x += 8) {
    for (let y = 148; y < 150; y++) put(x, y, 200, 200, 204);
  }

  // History stacked like the original landscape — pegs under each try
  const tries = [
    { path: [0, 1, 4, 7], good: 1, wrong: 2 },
    { path: [0, 3, 4, 5], good: 2, wrong: 1 },
    { path: [2, 1, 4, 7], good: 0, wrong: 3 },
    { path: [0, 1, 2, 5], good: 3, wrong: 1 }
  ];
  tries.forEach((tr, i) => {
    const ox = 56;
    const oy = 168 + i * 132;
    drawLock(put, ox, oy, 36, tr.path, [230, 230, 236], 5.5, 3.2);
    drawPegs(put, ox + 36, oy + 100, tr.good, tr.wrong, 4, 1.05);
  });

  // Live lock on the right, mid-draw of a 4-dot reverse-C
  const lx = 520, ly = 180, g = 155;
  drawLock(put, lx, ly, g, [0, 1, 2, 5], [255, 255, 255], 18, 10);
  const a = xy(5, lx, ly, g);
  const b = xy(8, lx, ly, g);
  strokeLine(put, a[0], a[1], a[0] + (b[0] - a[0]) * 0.62, a[1] + (b[1] - a[1]) * 0.62,
    9, 180, 220, 255);
  fillCircle(put, a[0] + (b[0] - a[0]) * 0.62, a[1] + (b[1] - a[1]) * 0.62, 13, 160, 220, 255);

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
