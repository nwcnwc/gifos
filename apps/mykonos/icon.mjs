// Procedural Mykonos icon: a dark rounded card, a little white island,
// a cobalt dome, a walker that strolls. Pure Node, super-sample →
// box-downsample → small palette; deterministic so builds reproduce.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [18, 28, 48];
const SKY = [142, 200, 238];
const SKY_D = [27, 91, 168];
const SEA = [77, 168, 196];
const SEA_L = [168, 224, 238];
const SAND = [232, 212, 168];
const GRASS = [126, 170, 95];
const GRASS_D = [92, 138, 68];
const WHITE = [250, 250, 245];
const WHITE_D = [230, 226, 211];
const COBALT = [27, 91, 168];
const COBALT_L = [46, 111, 188];
const WOOD = [160, 115, 68];
const PEACH = [240, 200, 168];
const PINK = [216, 91, 142];
const PATH = [196, 180, 156];

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
  for (const b of [CARD, SKY, SKY_D, SEA, SEA_L, SAND, GRASS, GRASS_D, WHITE, WHITE_D, COBALT, COBALT_L, WOOD, PEACH, PINK, PATH]) {
    pal.push(b);
    pal.push(mix(b, [255, 255, 255], 0.18).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.28).map(Math.round));
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

function iso(x, y, z, yaw) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const rx = x * c - y * s, ry = x * s + y * c;
  return { sx: (rx - ry) * 7, sy: (rx + ry) * 3.5 - z * 6 };
}

function putCube(buf, cx, cy, x, y, z, yaw, col, zbuf) {
  const p = iso(x, y, z, yaw);
  const ax = cx + p.sx, ay = cy + p.sy;
  const depth = p.sy + z * 0.2;
  const hw = 7, qw = 3.5, h = 6;
  const top = mix(col, [255, 255, 255], 0.22);
  const left = mix(col, [0, 0, 0], 0.22);
  function face(pts, c) {
    const minX = Math.floor(Math.min(...pts.map((q) => q[0])));
    const maxX = Math.ceil(Math.max(...pts.map((q) => q[0])));
    const minY = Math.floor(Math.min(...pts.map((q) => q[1])));
    const maxY = Math.ceil(Math.max(...pts.map((q) => q[1])));
    for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
      if (px < 0 || py < 0 || px >= OUT || py >= OUT) continue;
      let w = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const yi = pts[i][1], yj = pts[j][1];
        if ((yi > py) !== (yj > py)) {
          const xint = (pts[j][0] - pts[i][0]) * (py - yi) / ((yj - yi) || 1e-6) + pts[i][0];
          if (px < xint) w++;
        }
      }
      if (w % 2 === 0) continue;
      const o = py * OUT + px;
      if (zbuf[o] > depth + 0.05) continue;
      zbuf[o] = depth;
      buf[o * 3] = c[0]; buf[o * 3 + 1] = c[1]; buf[o * 3 + 2] = c[2];
    }
  }
  face([[ax, ay], [ax + hw, ay + qw], [ax, ay + hw], [ax - hw, ay + qw]], top);
  face([[ax + hw, ay + qw], [ax + hw, ay + qw + h], [ax, ay + hw + h], [ax, ay + hw]], col);
  face([[ax - hw, ay + qw], [ax - hw, ay + qw + h], [ax, ay + hw + h], [ax, ay + hw]], left);
}

function sceneCubes(t) {
  const yaw = 0.5 + t * Math.PI * 2 * 0.08;
  const cubes = [];
  for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
    const r = Math.hypot(x, y);
    if (r > 4.6) cubes.push([x, y, 0, SEA]);
    else if (r > 3.6) cubes.push([x, y, 0, SAND]);
    else cubes.push([x, y, 0, ((x + y) & 1) ? GRASS : GRASS_D]);
  }
  for (let x = -1; x <= 1; x++) cubes.push([x, 0, 0, PATH]);
  for (let z = 1; z <= 3; z++) {
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 0; y++) {
      if (z === 3 && x === 0 && y === 0) continue;
      cubes.push([x, y, z, (x + y + z) & 1 ? WHITE : WHITE_D]);
    }
  }
  cubes.push([0, 0, 4, COBALT]);
  cubes.push([0, 0, 5, COBALT_L]);
  cubes.push([1, -1, 3, PINK]);
  cubes.push([-2, 1, 1, WOOD]);
  cubes.push([-2, 1, 2, [61, 115, 85]]);
  cubes.push([-2, 1, 3, [61, 115, 85]]);
  const walk = -2 + t * 4;
  cubes.push([walk, 2, 1, WOOD]);
  cubes.push([walk, 2, 2, WHITE]);
  cubes.push([walk, 2, 3, PEACH]);
  return { yaw, cubes };
}

function frameIndices(pal, f) {
  const t = f / FRAMES;
  const { yaw, cubes } = sceneCubes(t);
  const small = new Float32Array(OUT * OUT * 3);
  const zbuf = new Float32Array(OUT * OUT);
  zbuf.fill(-1e9);
  const cx = 64, cy = 62;
  const order = cubes.slice().sort((a, b) => {
    const pa = iso(a[0], a[1], a[2], yaw);
    const pb = iso(b[0], b[1], b[2], yaw);
    return (pa.sx + pa.sy) - (pb.sx + pb.sy);
  });
  for (const c of order) putCube(small, cx, cy, c[0], c[1], c[2], yaw, c[3], zbuf);

  const rgba = new Float32Array(RW * RW * 4);
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    const o = (py * RW + px) * 4;
    if (!inCard(x, y, 6, 18)) continue;
    let col = mix(SKY, SKY_D, Math.max(0, (y - 18) / 90));
    if (y > 78) col = mix(SEA, SEA_L, 0.35 + 0.2 * Math.sin(x * 0.2 + t * 6));
    const ix = Math.min(OUT - 1, Math.max(0, x | 0));
    const iy = Math.min(OUT - 1, Math.max(0, y | 0));
    const so = (iy * OUT + ix) * 3;
    if (zbuf[iy * OUT + ix] > -1e8) col = [small[so], small[so + 1], small[so + 2]];
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

export function mykonosIcon() {
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
  function cube(cx, cy, x, y, z, col, yaw) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const rx = x * c - y * s, ry = x * s + y * c;
    const ax = cx + (rx - ry) * 22;
    const ay = cy + (rx + ry) * 11 - z * 18;
    const hw = 22, qw = 11, h = 18;
    const top = mix(col, [255, 255, 255], 0.2);
    const left = mix(col, [0, 0, 0], 0.22);
    function triFill(pts, c3) {
      const minX = Math.floor(Math.min(...pts.map((q) => q[0])));
      const maxX = Math.ceil(Math.max(...pts.map((q) => q[0])));
      const minY = Math.floor(Math.min(...pts.map((q) => q[1])));
      const maxY = Math.ceil(Math.max(...pts.map((q) => q[1])));
      for (let py = minY; py <= maxY; py++) for (let px = minX; px <= maxX; px++) {
        let w = 0;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const yi = pts[i][1], yj = pts[j][1];
          if ((yi > py) !== (yj > py)) {
            const xint = (pts[j][0] - pts[i][0]) * (py - yi) / ((yj - yi) || 1e-6) + pts[i][0];
            if (px < xint) w++;
          }
        }
        if (w % 2) put(px, py, c3[0], c3[1], c3[2]);
      }
    }
    triFill([[ax, ay], [ax + hw, ay + qw], [ax, ay + hw], [ax - hw, ay + qw]], top);
    triFill([[ax + hw, ay + qw], [ax + hw, ay + qw + h], [ax, ay + hw + h], [ax, ay + hw]], col);
    triFill([[ax - hw, ay + qw], [ax - hw, ay + qw + h], [ax, ay + hw + h], [ax, ay + hw]], left);
  }

  for (let y = 0; y < H; y++) {
    const u = y / H;
    const col = u < 0.55
      ? mix(SKY, SKY_D, u / 0.55)
      : mix(SKY_D, SEA, (u - 0.55) / 0.45);
    for (let x = 0; x < W; x++) put(x, y, col[0], col[1], col[2]);
  }

  const yaw = 0.55;
  const cx = W / 2, cy = 390;
  const cubes = [];
  for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) {
    const r = Math.hypot(x, y);
    if (r > 7.4) cubes.push([x, y, 0, SEA]);
    else if (r > 6.2) cubes.push([x, y, 0, SAND]);
    else if (Math.abs(x) < 1 || Math.abs(y) < 1) cubes.push([x, y, 0, PATH]);
    else cubes.push([x, y, 0, ((x + y) & 1) ? GRASS : GRASS_D]);
  }
  for (let z = 1; z <= 4; z++) for (let x = -1; x <= 1; x++) for (let y = -2; y <= 0; y++) {
    cubes.push([x - 3, y, z, WHITE]);
  }
  cubes.push([-3, -1, 5, COBALT]);
  cubes.push([-3, -1, 6, COBALT_L]);
  for (let z = 1; z <= 3; z++) for (let x = 2; x <= 4; x++) for (let y = -1; y <= 1; y++) {
    cubes.push([x, y, z, WHITE_D]);
  }
  cubes.push([3, 0, 4, PINK]);
  cubes.push([-5, 2, 1, WOOD]);
  cubes.push([-5, 2, 2, [61, 115, 85]]);
  cubes.push([-5, 2, 3, [40, 90, 60]]);
  cubes.push([1, 3, 1, WOOD]);
  cubes.push([1, 3, 2, WHITE]);
  cubes.push([1, 3, 3, PEACH]);
  cubes.sort((a, b) => (a[0] + a[1] + a[2] * 0.2) - (b[0] + b[1] + b[2] * 0.2));
  for (const c of cubes) cube(cx, cy, c[0], c[1], c[2], c[3], yaw);

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
