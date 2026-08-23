// Procedural Pong icon: a dark rounded card holding a CRT-green court, two
// paddles and a ball that rallies across the frames. Pure Node, super-sample
// → box-downsample → small palette; deterministic so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [10, 16, 12];
const CARD_D = [6, 10, 8];
const PHOS = [90, 220, 110];
const PHOS_D = [36, 110, 52];
const WHITE = [236, 255, 236];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, CARD_D, PHOS, PHOS_D, WHITE]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.4).map(Math.round));
  }
  return pal;
}
function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e9;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b, d = dr * dr + dg * dg + db * db;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}
function inRoundRect(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  if (x >= x0 + r && x <= x0 + w - r) return true;
  if (y >= y0 + r && y <= y0 + h - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const court = { x: 18, y: 22, w: 92, h: 84 };
  // ball rallies: left → right → left, with a little vertical bounce
  const goingRight = t < 0.5;
  const u = goingRight ? t * 2 : (1 - (t - 0.5) * 2);
  const bx = court.x + 10 + u * (court.w - 20);
  const by = court.y + 22 + Math.sin(t * Math.PI * 2) * 22;
  const ly = by - 10;
  const ry = court.y + court.h - 28 - (by - (court.y + 22));
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    const o = (py * RW + px) * 4;
    if (!inCard(x, y, 6, 18)) continue;
    let col = mix(CARD, CARD_D, y / OUT);
    if (inRoundRect(x, y, court.x, court.y, court.w, court.h, 3)) {
      col = mix(CARD, PHOS_D, 0.18);
      // walls
      if (y < court.y + 4 || y > court.y + court.h - 4) col = PHOS;
      // dashed centre line
      const cx = court.x + court.w / 2;
      if (Math.abs(x - cx) < 1.2) {
        const dash = Math.floor((y - court.y) / 6);
        if (dash % 2 === 0) col = PHOS_D;
      }
      // paddles
      if (x > court.x + 4 && x < court.x + 10 && y > ly && y < ly + 22) col = WHITE;
      if (x > court.x + court.w - 10 && x < court.x + court.w - 4 && y > ry && y < ry + 22) col = WHITE;
      // ball
      if (Math.abs(x - bx) < 2.4 && Math.abs(y - by) < 2.4) col = WHITE;
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

export function pongIcon() {
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

// Store cover: a 1200×720 court, scores, two paddles and a ball. No canvas,
// no sharp — zlib is built into Node. Deterministic, so builds reproduce.
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

const DIGITS = [
  [1, 1, 1, 0, 1, 1, 1],
  [0, 0, 1, 0, 0, 1, 0],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 1, 0, 1, 1],
  [0, 1, 1, 1, 0, 1, 0],
  [1, 1, 0, 1, 0, 1, 1],
  [1, 1, 0, 1, 1, 1, 1],
  [1, 0, 1, 0, 0, 1, 0],
  [1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 0, 1, 0],
];

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

  const ink = [236, 255, 236];
  fill(0, 0, W, H, 0, 0, 0);
  // faint phosphor wash + scanlines
  for (let y = 0; y < H; y++) {
    const v = y % 3 === 0 ? 8 : 4;
    for (let x = 0; x < W; x++) put(x, y, v, v + 6, v, 255);
  }

  const ww = 18;
  fill(0, 0, W, ww, ink[0], ink[1], ink[2]);
  fill(0, H - ww, W, H, ink[0], ink[1], ink[2]);
  // dashed centre
  for (let y = ww; y < H - ww; y += ww * 2) fill((W - ww) / 2, y, (W + ww) / 2, y + ww, ink[0], ink[1], ink[2]);

  function digit(n, x, y, w, h) {
    const dw = (ww * 4) / 5, dh = dw;
    const blocks = DIGITS[n];
    const r = ink[0], g = ink[1], b = ink[2];
    if (blocks[0]) fill(x, y, x + w, y + dh, r, g, b);
    if (blocks[1]) fill(x, y, x + dw, y + h / 2, r, g, b);
    if (blocks[2]) fill(x + w - dw, y, x + w, y + h / 2, r, g, b);
    if (blocks[3]) fill(x, y + h / 2 - dh / 2, x + w, y + h / 2 + dh / 2, r, g, b);
    if (blocks[4]) fill(x, y + h / 2, x + dw, y + h, r, g, b);
    if (blocks[5]) fill(x + w - dw, y + h / 2, x + w, y + h, r, g, b);
    if (blocks[6]) fill(x, y + h - dh, x + w, y + h, r, g, b);
  }
  const sw = 3 * ww, sh = 4 * ww;
  digit(4, W / 2 - 1.5 * ww - sw, 2 * ww, sw, sh);
  digit(2, W / 2 + 1.5 * ww, 2 * ww, sw, sh);

  const pw = 18, ph = 110;
  fill(0, 250, pw, 250 + ph, ink[0], ink[1], ink[2]);
  fill(W - pw, 360, W, 360 + ph, ink[0], ink[1], ink[2]);
  const br = 10;
  fill(780 - br, 300 - br, 780 + br, 300 + br, ink[0], ink[1], ink[2]);

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
