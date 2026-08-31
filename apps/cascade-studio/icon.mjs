// Procedural icon: a 2D profile that EXTRUDES into a solid. Reads at 64px.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [14, 18, 28];
const CARD_B = [8, 10, 18];
const INK = [232, 240, 248];
const CYAN = [56, 168, 214];
const CYAN_D = [28, 90, 120];
const FACE = [48, 140, 178];
const EDGE = [220, 232, 242];
const GRID = [40, 52, 70];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, INK, CYAN, CYAN_D, FACE, EDGE, GRID]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.4).map(Math.round));
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
function distSeg(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-8) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / l2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

function iso(x, y, z) {
  return [64 + (x - y) * 0.86, 78 - (x + y) * 0.5 - z * 0.95];
}

const PROFILE = [[-18, -11], [18, -11], [18, 11], [-18, 11]];

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const drawN = 6;
  const sketching = f < drawN;
  const kDraw = sketching ? (f + 1) / drawN : 1;
  const kExt = sketching ? 0 : (f - drawN + 1) / (FRAMES - drawN);
  const h = 2 + kExt * 22;

  const nPts = Math.max(2, Math.round(kDraw * 4));
  const pts2 = PROFILE.slice(0, nPts);
  const closed = kDraw >= 1;

  function putCol(x, y, col, a) {
    if (x < 0 || y < 0 || x >= RW || y >= RW) return;
    const o = (y * RW + x) * 4;
    rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = a;
  }

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 20)) continue;
      let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));

      // plane
      const p0 = iso(-22, -15, 0), p1 = iso(22, -15, 0), p2 = iso(22, 15, 0), p3 = iso(-22, 15, 0);
      const dPlane = Math.min(
        distSeg(x, y, p0[0], p0[1], p1[0], p1[1]),
        distSeg(x, y, p1[0], p1[1], p2[0], p2[1]),
        distSeg(x, y, p2[0], p2[1], p3[0], p3[1]),
        distSeg(x, y, p3[0], p3[1], p0[0], p0[1])
      );
      if (dPlane < 0.9) col = mix(col, GRID, 0.85);

      // 2D profile on the plane (early frames) or bottom of solid
      const poly = [];
      for (let i = 0; i < pts2.length; i++) poly.push(iso(pts2[i][0], pts2[i][1], 0));
      let dProf = 99;
      for (let i = 0; i < poly.length - (closed ? 0 : 1); i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        dProf = Math.min(dProf, distSeg(x, y, a[0], a[1], b[0], b[1]));
      }

      if (kExt > 0.05) {
        // isometric box edges
        const top = PROFILE.map((p) => iso(p[0], p[1], h));
        const bot = PROFILE.map((p) => iso(p[0], p[1], 0));
        let dE = 99;
        for (let i = 0; i < 4; i++) {
          const j = (i + 1) % 4;
          dE = Math.min(dE, distSeg(x, y, top[i][0], top[i][1], top[j][0], top[j][1]));
          dE = Math.min(dE, distSeg(x, y, bot[i][0], bot[i][1], top[i][0], top[i][1]));
        }
        // fill-ish: if inside the projected top, tint
        if (dE < 1.15) col = dE < 0.55 ? EDGE : mix(EDGE, CYAN, 0.4);
        else if (dProf < 1.0) col = mix(FACE, CYAN_D, 0.3);
        else {
          // crude fill of extruded sides
          const c = iso(0, 0, h * 0.5);
          const dC = Math.hypot(x - c[0], y - c[1]);
          if (dC < 14 + kExt * 4) col = mix(col, FACE, 0.55);
        }
      } else if (dProf < 1.2) {
        col = dProf < 0.55 ? CYAN : mix(CYAN, INK, 0.3);
      }

      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }
  void putCol;

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

export function cascadeIcon() {
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
    minCodeSize: 6, frames, delayCs: 12, transparentIndex: 0
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

function strokeLine(put, x0, y0, x1, y1, w, r, g, b) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const steps = Math.ceil(len);
  for (let i = 0; i <= steps; i++) {
    const x = x0 + dx * (i / steps), y = y0 + dy * (i / steps);
    const rad = w;
    for (let yy = Math.floor(y - rad); yy <= Math.ceil(y + rad); yy++) {
      for (let xx = Math.floor(x - rad); xx <= Math.ceil(x + rad); xx++) {
        if ((xx - x) * (xx - x) + (yy - y) * (yy - y) <= rad * rad) put(xx, yy, r, g, b);
      }
    }
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
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const panel = x < 340;
      const bg = panel ? [18, 23, 34] : [7, 9, 13];
      put(x, y, bg[0], bg[1], bg[2]);
    }
  }
  // divider
  for (let y = 0; y < H; y++) put(340, y, 42, 51, 68);

  // sketch grid
  for (let gx = 24; gx < 320; gx += 22) {
    for (let y = 70; y < 430; y++) put(gx, y, 28, 37, 52);
  }
  for (let gy = 70; gy < 430; gy += 22) {
    for (let x = 24; x < 320; x++) put(x, gy, 28, 37, 52);
  }
  // rounded rect sketch
  const sk = [[48, 360], [280, 360], [280, 140], [48, 140]];
  for (let i = 0; i < 4; i++) {
    const a = sk[i], b = sk[(i + 1) % 4];
    strokeLine(put, a[0], a[1], b[0], b[1], 2.2, 56, 168, 214);
  }
  for (const p of sk) {
    for (let yy = -5; yy <= 5; yy++) for (let xx = -5; xx <= 5; xx++) {
      if (xx * xx + yy * yy <= 25) put(p[0] + xx, p[1] + yy, 232, 240, 248);
    }
  }

  // isometric solid on the right
  function iiso(x, y, z) {
    return [780 + (x - y) * 7.2, 430 - (x + y) * 4.1 - z * 7.4];
  }
  const P = [[-18, -11], [18, -11], [18, 11], [-18, 11]];
  const Hgt = 12;
  const bot = P.map((p) => iiso(p[0], p[1], 0));
  const top = P.map((p) => iiso(p[0], p[1], Hgt));
  // fill top
  const minx = Math.min(...top.map((p) => p[0])) | 0;
  const maxx = Math.max(...top.map((p) => p[0])) | 0;
  const miny = Math.min(...top.map((p) => p[1])) | 0;
  const maxy = Math.max(...top.map((p) => p[1])) | 0;
  for (let y = miny; y <= maxy; y++) {
    for (let x = minx; x <= maxx; x++) {
      // barycentric-ish: distance to top polygon
      let inside = true;
      for (let i = 0; i < 4; i++) {
        const a = top[i], b = top[(i + 1) % 4];
        const cr = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
        if (cr < 0) inside = false;
      }
      if (inside) put(x, y, 58, 150, 186);
    }
  }
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    strokeLine(put, top[i][0], top[i][1], top[j][0], top[j][1], 2.0, 232, 240, 248);
    strokeLine(put, bot[i][0], bot[i][1], top[i][0], top[i][1], 1.8, 200, 220, 232);
    strokeLine(put, bot[i][0], bot[i][1], bot[j][0], bot[j][1], 1.5, 90, 130, 150);
  }

  // labels
  const label = (x, y, str, r, g, b) => {
    // tiny 5x7, skip — draw a bar instead
    for (let i = 0; i < str.length * 8; i++) put(x + i, y, r, g, b);
  };
  void label;
  // height / corner sliders as bars
  for (let x = 40; x < 300; x++) {
    put(x, 500, 36, 48, 64);
    put(x, 540, 36, 48, 64);
  }
  for (let x = 40; x < 180; x++) { put(x, 500, 56, 168, 214); put(x, 501, 56, 168, 214); }
  for (let x = 40; x < 140; x++) { put(x, 540, 56, 168, 214); put(x, 541, 56, 168, 214); }

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
