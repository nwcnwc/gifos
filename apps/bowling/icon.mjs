// Procedural Bowling icon: a dark rounded card, a wooden lane, ten pins,
// a red ball that rolls up the alley across the frames.
// Pure Node, super-sample → box-downsample → small palette; deterministic.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [18, 14, 18];
const WOOD = [168, 118, 62];
const WOOD_D = [110, 70, 32];
const GUTTER = [36, 40, 48];
const BALL = [196, 48, 36];
const BALL_L = [240, 120, 96];
const PIN = [240, 236, 228];
const STRIPE = [196, 48, 40];
const PIT = [20, 16, 18];
const GOLD = [232, 196, 96];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, WOOD, WOOD_D, GUTTER, BALL, BALL_L, PIN, STRIPE, PIT, GOLD]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
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
function dist2(x, y, cx, cy) { return (x - cx) * (x - cx) + (y - cy) * (y - cy); }

function pinPos() {
  const cx = 64, top = 28, rowH = 7, sp = 7;
  const rows = [[0], [-0.5, 0.5], [-1, 0, 1], [-1.5, -0.5, 0.5, 1.5]];
  const out = [];
  rows.forEach((row, r) => {
    row.forEach((k) => out.push({ x: cx + k * sp, y: top + r * rowH }));
  });
  return out;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const ballY = 98 - t * 58;
  const ballX = 64 + Math.sin(t * Math.PI) * 4;
  const pins = pinPos();
  const fallen = t > 0.72 ? 3 : 0;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    const o = (py * RW + px) * 4;
    if (!inCard(x, y, 6, 18)) continue;
    let col = mix(CARD, PIT, y / OUT);
    const laneL = 40 + (y - 24) * 0.18;
    const laneR = 88 - (y - 24) * 0.18;
    const gutL = laneL - 6, gutR = laneR + 6;
    if (y > 22 && y < 108 && x > gutL && x < gutR) col = GUTTER;
    if (y > 22 && y < 108 && x > laneL && x < laneR) {
      const u = (x - laneL) / (laneR - laneL);
      col = mix(WOOD_D, WOOD, 0.35 + 0.5 * Math.sin(u * Math.PI));
    }
    if (y > 22 && y < 32 && x > laneL - 4 && x < laneR + 4) col = PIT;
    for (let i = 0; i < pins.length; i++) {
      const p = pins[i];
      const down = i < fallen && t > 0.72;
      if (down) {
        if (dist2(x, y, p.x + 4, p.y + 2) < 3.2 * 3.2) col = mix(PIN, WOOD, 0.2);
      } else if (dist2(x, y, p.x, p.y) < 2.6 * 2.6) {
        col = PIN;
        if (y > p.y - 1 && y < p.y + 0.6) col = STRIPE;
      }
    }
    const br = 7.2 - t * 2.2;
    if (dist2(x, y, ballX, ballY) <= br * br) {
      const u = (x - (ballX - br)) / (br * 2);
      col = mix(BALL_L, BALL, Math.max(0, Math.min(1, u)));
    }
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

export function bowlingIcon() {
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
  function disk(cx, cy, rad, r, g, b) {
    const r2 = rad * rad;
    for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
      if (x * x + y * y <= r2) {
        const u = (x + rad) / (rad * 2);
        put(cx + x, cy + y,
          (r + (255 - r) * (1 - u) * 0.28) | 0,
          (g + (255 - g) * (1 - u) * 0.22) | 0,
          (b + (255 - b) * (1 - u) * 0.16) | 0);
      }
    }
  }

  fill(0, 0, W, H, 16, 14, 20);
  fill(0, 0, W, 280, 28, 24, 40);

  // perspective lane
  for (let y = 80; y < H; y++) {
    const u = (y - 80) / (H - 80);
    const half = 70 + u * 420;
    const cx = W / 2;
    const gut = 28 + u * 40;
    for (let x = (cx - half - gut) | 0; x < (cx + half + gut) | 0; x++) {
      const d = Math.abs(x - cx);
      if (d > half) put(x, y, 42, 46, 56);
      else {
        const s = d / half;
        const wr = (150 - s * 40 + ((x * 3 + y) % 17 === 0 ? 8 : 0)) | 0;
        const wg = (100 - s * 28) | 0;
        const wb = (48 - s * 12) | 0;
        put(x, y, wr, wg, wb);
      }
    }
  }
  // pit
  fill(W / 2 - 90, 70, W / 2 + 90, 120, 18, 14, 16);

  const pins = [];
  const rows = [[0], [-0.5, 0.5], [-1, 0, 1], [-1.5, -0.5, 0.5, 1.5]];
  rows.forEach((row, r) => {
    row.forEach((k) => pins.push({ x: W / 2 + k * 38, y: 128 + r * 28 }));
  });
  function pin(cx, cy) {
    const h = 46, w = 12;
    for (let y = -h; y <= 4; y++) {
      const t = (y + h) / h;
      const rw = (6 + Math.sin(t * Math.PI) * 6) | 0;
      for (let x = -rw; x <= rw; x++) {
        const col = (y > -h * 0.42 && y < -h * 0.32) ? [196, 48, 40] : [240, 236, 226];
        put(cx + x, cy + y, col[0], col[1], col[2]);
      }
    }
    disk(cx - 2, cy - 28, 3, 255, 255, 250);
  }
  pins.forEach((p) => pin(p.x, p.y));

  disk(W / 2 + 8, 560, 54, 196, 48, 36);
  disk(W / 2 - 10, 544, 14, 255, 170, 140);

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
