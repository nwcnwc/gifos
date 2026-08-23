// Procedural icon for Squoosh: a round cyan blob that SQUASHES. The loop
// pinches it wide-and-flat then lets it bounce back round — that is the app
// in one glyph. Super-sample → box-downsample → small palette, same pipeline
// the other app icons use. Deterministic, so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [18, 28, 40];
const CARD_B = [8, 12, 18];
const BLOB = [0, 149, 255];
const BLOB_HI = [180, 230, 255];
const BLOB_LO = [0, 70, 140];
const EYE = [8, 16, 28];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}

function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, BLOB, BLOB_HI, BLOB_LO, EYE]) {
    for (let s = 0; s <= 5; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    for (let s = 1; s <= 3; s++) pal.push(mix(b, [0, 0, 0], s * 0.2).map(Math.round));
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

function squash(f) {
  const u = f / FRAMES;
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * u); // 0 round → 1 flat → 0
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const sq = squash(f);
  const rx = 28 + 16 * sq, ry = 28 - 12 * sq;
  const cx = 64, cy = 66 + 4 * sq;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      const nx = (x - cx) / rx, ny = (y - cy) / ry;
      const d2 = nx * nx + ny * ny;
      if (d2 <= 1) {
        const d = Math.sqrt(d2);
        const hx = nx * 0.45 - 0.35, hy = ny * 0.45 - 0.4;
        const hi = Math.max(0, 1 - Math.hypot(hx, hy) / 0.85);
        col = mix(mix(BLOB_LO, BLOB, 0.55 + 0.45 * (1 - d)), BLOB_HI, hi * hi * 0.85);
        // two eyes, stretched with the blob so they stay "on" it
        const ex = 0.32, ey = -0.12, er = 0.13 - 0.03 * sq;
        const e1 = Math.hypot(nx + ex, (ny - ey) * (ry / rx)) ;
        const e2 = Math.hypot(nx - ex, (ny - ey) * (ry / rx));
        if (e1 < er || e2 < er) col = EYE;
        else if (e1 < er + 0.06 || e2 < er + 0.06) col = mix(col, EYE, 0.4);
      }
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0; const n = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
    }
    if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}

export function squooshIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 7, transparentIndex: 0 };
}

// A store-cover screenshot of the UI, painted as RGBA and written as PNG.
// No canvas, no sharp: zlib is built into Node. Deterministic.
import { deflateSync } from 'node:zlib';

function crc(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(tag, data) {
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
  const rr = (x0, y0, x1, y1, rad, r, g, b) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
      const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
    }
  };

  fill(0, 0, W, H, 14, 20, 27);
  // header
  fill(0, 0, W, 64, 14, 20, 27);
  // blob
  for (let y = 18; y < 50; y++) for (let x = 36; x < 68; x++) {
    const nx = (x - 52) / 15, ny = (y - 34) / 15;
    if (nx * nx + ny * ny <= 1) {
      const hi = Math.max(0, 1 - Math.hypot(nx + 0.3, ny + 0.3));
      put(x, y, mix([0, 70, 140], [180, 230, 255], 0.45 + hi * 0.55).map(Math.round)[0],
        mix([0, 70, 140], [180, 230, 255], 0.45 + hi * 0.55).map(Math.round)[1],
        mix([0, 70, 140], [180, 230, 255], 0.45 + hi * 0.55).map(Math.round)[2]);
    }
  }
  // title "Squoosh" as blocky letters is too ugly — a bar of text-colour pixels
  // standing in for the word, plus the comparison stage.

  rr(24, 84, 860, 680, 18, 8, 12, 17);

  // landscape: original (left of split) vs slightly posterised (right)
  const splitX = 24 + Math.round((860 - 24) * 0.52);
  for (let y = 84; y < 680; y++) for (let x = 24; x < 860; x++) {
    const u = (x - 24) / (860 - 24), v = (y - 84) / (680 - 84);
    // sky
    let r = 70 + (1 - v) * 90, g = 140 + (1 - v) * 60, b = 210;
    // sun
    const sd = Math.hypot(u - 0.22, v - 0.22);
    if (sd < 0.09) { r = 255; g = 220; b = 90; }
    else if (sd < 0.18) { const t = 1 - (sd - 0.09) / 0.09; r += 80 * t; g += 50 * t; }
    // hills
    const h1 = 0.62 + 0.08 * Math.sin(u * 6.2) + 0.04 * Math.sin(u * 13);
    const h2 = 0.74 + 0.05 * Math.sin(u * 4.1 + 1.2);
    if (v > h2) { r = 42; g = 86; b = 52; }
    else if (v > h1) { r = 58; g = 122; b = 72; }
    if (x >= splitX) {
      // compressed side: quantise a bit so the split reads
      r = (r / 28 | 0) * 28; g = (g / 28 | 0) * 28; b = (b / 28 | 0) * 28;
    }
    put(x, y, r, g, b);
  }
  // divider
  fill(splitX - 1, 84, splitX + 2, 680, 255, 255, 255);
  for (let y = 370; y < 396; y++) for (let x = splitX - 11; x < splitX + 12; x++) {
    const dx = x - splitX, dy = y - 383;
    if (dx * dx + dy * dy <= 121) put(x, y, 255, 255, 255);
  }

  // sidebar
  rr(880, 84, 1176, 680, 16, 22, 30, 40);
  // stats chips
  const chips = [[900, 110, 'ORIG'], [990, 110, 'OUT'], [1080, 110, 'SAVE']];
  for (const [x, y] of chips) rr(x, y, x + 80, y + 58, 8, 28, 39, 52);
  // fake numbers as bars
  fill(914, 140, 966, 154, 232, 238, 245);
  fill(1004, 140, 1056, 154, 61, 214, 140);
  fill(1094, 140, 1146, 154, 61, 214, 140);
  // format row
  rr(900, 190, 1156, 230, 8, 14, 20, 27);
  fill(916, 204, 1040, 216, 0, 149, 255);
  // quality slider
  fill(900, 260, 1156, 264, 42, 58, 76);
  fill(900, 260, 1080, 264, 0, 149, 255);
  for (let y = 252; y < 272; y++) for (let x = 1070; x < 1090; x++) {
    const dx = x - 1080, dy = y - 262;
    if (dx * dx + dy * dy <= 64) put(x, y, 0, 149, 255);
  }
  // download button
  rr(900, 600, 1156, 652, 10, 0, 149, 255);

  // pack PNG
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
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
