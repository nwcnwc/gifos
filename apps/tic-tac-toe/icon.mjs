// Procedural icon: X and O take turns, then a win line draws across the top.
// Pure Node, super-sample → box-downsample. Deterministic.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 16;

const CARD = [48, 50, 54];
const PAPER = [243, 230, 200];
const PAPER_D = [226, 210, 176];
const GRID = [58, 52, 40];
const INK = [26, 22, 18];
const OINK = [155, 48, 68];
const WIN = [196, 60, 60];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, PAPER, PAPER_D, GRID, INK, OINK, WIN]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
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
function distToSeg(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  if (l2 < 1e-6) return Math.hypot(x - x1, y - y1);
  let t = ((x - x1) * dx + (y - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

function cellAt(r, c, boardIn, step) {
  return { cx: boardIn + (c + 0.5) * step, cy: boardIn + (r + 0.5) * step };
}

function drawX(col, x, y, cx, cy, s, w, ink) {
  if (distToSeg(x, y, cx - s, cy - s, cx + s, cy + s) < w) return ink;
  if (distToSeg(x, y, cx + s, cy - s, cx - s, cy + s) < w) return ink;
  return col;
}
function drawO(col, x, y, cx, cy, ro, ri, ink) {
  const d = Math.hypot(x - cx, y - cy);
  if (d <= ro && d >= ri) return ink;
  return col;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 18, boardIn = 20;
  const n = 3, span = OUT - 2 * boardIn, step = span / n;
  // Five placements then a win line. Newest mark drops in.
  // X(0,0) O(1,1) X(0,2) O(2,1) X(0,1) — top row wins.
  const seq = [
    { r: 0, c: 0, x: true },
    { r: 1, c: 1, x: false },
    { r: 0, c: 2, x: true },
    { r: 2, c: 1, x: false },
    { r: 0, c: 1, x: true }
  ];
  const per = 2;
  const placeN = Math.min(seq.length, Math.floor(f / per) + 1);
  const sub = (f % per) / per;
  const drop = placeN <= seq.length && f < seq.length * per ? Math.max(0, 1 - sub) : 0;
  const winU = f >= 12 ? Math.min(1, (f - 12) / 3) : 0;

  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      const inside = x >= boardIn - 2 && x <= OUT - boardIn + 2 && y >= boardIn - 2 && y <= OUT - boardIn + 2;
      if (inside) {
        col = mix(PAPER, PAPER_D, Math.max(0, Math.min(1, (x + y) / (OUT * 2))));
        for (let i = 1; i < n; i++) {
          const p = boardIn + i * step;
          if (Math.abs(y - p) < 1.2 && x >= boardIn && x <= OUT - boardIn) col = GRID;
          if (Math.abs(x - p) < 1.2 && y >= boardIn && y <= OUT - boardIn) col = GRID;
        }
        const s = 9.2, w = 1.85;
        for (let k = 0; k < placeN; k++) {
          const mk = seq[k];
          const c = cellAt(mk.r, mk.c, boardIn, step);
          let cy = c.cy;
          if (k === placeN - 1 && drop) cy -= drop * 11;
          if (mk.x) col = drawX(col, x, y, c.cx, cy, s, w, INK);
          else col = drawO(col, x, y, c.cx, cy, 11.2, 7.8, OINK);
        }
        if (winU > 0) {
          const aC = cellAt(0, 0, boardIn, step);
          const bC = cellAt(0, 2, boardIn, step);
          const x2 = aC.cx + (bC.cx - aC.cx) * winU;
          if (distToSeg(x, y, aC.cx, aC.cy, x2, bC.cy) < 2.15) col = WIN;
        }
      } else col = CARD.slice();
    }
    const off = (py * RW + px) * 4;
    if (a) { rgba[off] = col[0]; rgba[off + 1] = col[1]; rgba[off + 2] = col[2]; rgba[off + 3] = 1; }
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0, nss = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
    }
    if (a / nss < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / nss, g / nss, b / nss);
  }
  return idx;
}

export function ticTacToeIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 8, transparentIndex: 0 };
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

function blend(dst, o, r, g, b, a) {
  if (a >= 0.995) { dst[o] = r; dst[o + 1] = g; dst[o + 2] = b; dst[o + 3] = 255; return; }
  if (a <= 0.005) return;
  const da = dst[o + 3] / 255;
  const outA = a + da * (1 - a);
  if (outA <= 0) return;
  dst[o] = Math.round((r * a + dst[o] * da * (1 - a)) / outA);
  dst[o + 1] = Math.round((g * a + dst[o + 1] * da * (1 - a)) / outA);
  dst[o + 2] = Math.round((b * a + dst[o + 2] * da * (1 - a)) / outA);
  dst[o + 3] = Math.round(outA * 255);
}

export function screenshotPng() {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b, a) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    blend(rgba, (y * W + x) * 4, r, g, b, a == null ? 1 : a);
  };
  const cover = (d, half, aa) => {
    if (d <= half - aa) return 1;
    if (d >= half + aa) return 0;
    return 1 - (d - (half - aa)) / (2 * aa);
  };

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = (x + y) / (W + H);
    put(x, y, (42 + t * 18) | 0, (44 + t * 14) | 0, (48 + t * 10) | 0);
  }

  const board = 640, bx = (W - board) / 2, by = (H - board) / 2;
  const pad = 36, span = board - 2 * pad, step = span / 3;
  const rad = 28;
  for (let y = 0; y < board; y++) for (let x = 0; x < board; x++) {
    const px = bx + x, py = by + y;
    const cx = Math.min(Math.max(x, rad), board - rad);
    const cy = Math.min(Math.max(y, rad), board - rad);
    const inR = (x >= rad && x <= board - rad) || (y >= rad && y <= board - rad)
      || ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad);
    if (!inR) continue;
    const t = (x + y) / (board * 2);
    put(px, py, (243 - t * 16) | 0, (230 - t * 20) | 0, (200 - t * 24) | 0);
  }

  function strokeSeg(x1, y1, x2, y2, half, r, g, b, aa) {
    const minx = Math.max(0, Math.floor(Math.min(x1, x2) - half - aa - 1));
    const maxx = Math.min(W - 1, Math.ceil(Math.max(x1, x2) + half + aa + 1));
    const miny = Math.max(0, Math.floor(Math.min(y1, y2) - half - aa - 1));
    const maxy = Math.min(H - 1, Math.ceil(Math.max(y1, y2) + half + aa + 1));
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const a = cover(distToSeg(x, y, x1, y1, x2, y2), half, aa);
      if (a) put(x, y, r, g, b, a);
    }
  }
  function strokeRing(cx, cy, ro, ri, r, g, b, aa) {
    const rad = ro + aa + 1;
    const minx = Math.max(0, Math.floor(cx - rad)), maxx = Math.min(W - 1, Math.ceil(cx + rad));
    const miny = Math.max(0, Math.floor(cy - rad)), maxy = Math.min(H - 1, Math.ceil(cy + rad));
    const half = (ro - ri) / 2, mid = (ro + ri) / 2;
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const a = cover(Math.abs(Math.hypot(x - cx, y - cy) - mid), half, aa);
      if (a) put(x, y, r, g, b, a);
    }
  }

  const gx1 = bx + pad + step, gx2 = bx + pad + 2 * step;
  const gy1 = by + pad + step, gy2 = by + pad + 2 * step;
  const g0x = bx + pad, g1x = bx + pad + span;
  const g0y = by + pad, g1y = by + pad + span;
  strokeSeg(g0x, gy1, g1x, gy1, 2.2, 58, 52, 40, 1.2);
  strokeSeg(g0x, gy2, g1x, gy2, 2.2, 58, 52, 40, 1.2);
  strokeSeg(gx1, g0y, gx1, g1y, 2.2, 58, 52, 40, 1.2);
  strokeSeg(gx2, g0y, gx2, g1y, 2.2, 58, 52, 40, 1.2);

  function center(r, c) {
    return { x: bx + pad + (c + 0.5) * step, y: by + pad + (r + 0.5) * step };
  }
  function markX(r, c) {
    const p = center(r, c), s = step * 0.26;
    strokeSeg(p.x - s, p.y - s, p.x + s, p.y + s, 8, 26, 22, 18, 1.4);
    strokeSeg(p.x + s, p.y - s, p.x - s, p.y + s, 8, 26, 22, 18, 1.4);
  }
  function markO(r, c) {
    const p = center(r, c);
    strokeRing(p.x, p.y, step * 0.32, step * 0.22, 155, 48, 68, 1.4);
  }

  // Mid-game, X wins the top row. A real board with a win line.
  markX(0, 0); markO(1, 1); markX(0, 2);
  markO(2, 1); markX(0, 1); markO(2, 2);

  const a = center(0, 0), b = center(0, 2);
  for (const rc of [[0, 0], [0, 1], [0, 2]]) {
    const p = center(rc[0], rc[1]);
    const half = step * 0.46;
    for (let y = Math.floor(p.y - half); y <= p.y + half; y++) {
      for (let x = Math.floor(p.x - half); x <= p.x + half; x++) {
        put(x, y, 196, 60, 60, 0.07);
      }
    }
  }
  strokeSeg(a.x, a.y, b.x, b.y, 7, 196, 60, 60, 1.5);

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
