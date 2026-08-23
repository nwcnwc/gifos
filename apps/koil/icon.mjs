// Procedural icon + store cover for Koil: a raycast corridor (mint walls,
// checkerboard floor that brightens toward the vanishing point) on a dark
// rounded card. Pure Node — no canvas. Deterministic so builds reproduce.
import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const PI = Math.PI, NEAR = 0.1, FAR = 10, FOV = PI * 0.5, EPS = 1e-6;
const FLOOR1 = [0x17, 0x29, 0x29], FLOOR2 = [0x2f, 0x41, 0x41];
const CEIL1 = [0x29, 0x17, 0x17], CEIL2 = [0x41, 0x2f, 0x2f];
const CARD = [16, 14, 18];
const WALLS = [
  [0, 0, 1, 1, 1, 0, 0],
  [0, 0, 0, 0, 0, 1, 0],
  [1, 0, 0, 0, 0, 1, 0],
  [1, 0, 0, 0, 0, 1, 0],
  [1, 0, 0, 0, 0, 0, 0],
  [0, 1, 1, 1, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function clampi(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x | 0); }
function vlen(x, y) { return Math.hypot(x, y); }

function tile(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= 7 || iy >= 7) return false;
  return !!WALLS[iy][ix];
}

function decodePngSync(buf) {
  if (buf[0] !== 0x89) throw new Error('not a png');
  let i = 8, w = 0, h = 0, depth = 8, ctype = 6;
  const idats = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i); const typ = buf.toString('ascii', i + 4, i + 8);
    const chunk = buf.subarray(i + 8, i + 8 + len); i += 12 + len;
    if (typ === 'IHDR') { w = chunk.readUInt32BE(0); h = chunk.readUInt32BE(4); depth = chunk[8]; ctype = chunk[9]; }
    else if (typ === 'IDAT') idats.push(chunk);
    else if (typ === 'IEND') break;
  }
  if (depth !== 8 || ctype !== 6) throw new Error('want 8-bit RGBA png');
  const raw = inflateSync(Buffer.concat(idats));
  const bpp = 4, stride = w * bpp;
  const out = Buffer.alloc(stride * h);
  let src = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filt = raw[src++]; const row = Buffer.alloc(stride);
    raw.copy(row, 0, src, src + stride); src += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = row[x];
      if (filt === 1) v = (v + a) & 255;
      else if (filt === 2) v = (v + b) & 255;
      else if (filt === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filt === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      row[x] = v;
    }
    row.copy(out, y * stride); prev = row;
  }
  return { w, h, p: out };
}

const here = dirname(fileURLToPath(import.meta.url));
const wallTex = decodePngSync(readFileSync(join(here, 'assets/images/wall.png')));
const playerTex = decodePngSync(readFileSync(join(here, 'assets/images/player.png')));
const bombTex = decodePngSync(readFileSync(join(here, 'assets/images/bomb.png')));
const keyTex = decodePngSync(readFileSync(join(here, 'assets/images/key.png')));

function snap(x, dx) {
  if (dx > 0) return Math.ceil(x + Math.sign(dx) * EPS);
  if (dx < 0) return Math.floor(x + Math.sign(dx) * EPS);
  return x;
}
function rayStep(p1x, p1y, p2x, p2y) {
  const dx = p2x - p1x, dy = p2y - p1y;
  let p3x = p2x, p3y = p2y;
  if (dx !== 0) {
    const k = dy / dx, c = p1y - k * p1x;
    p3x = snap(p2x, dx); p3y = p3x * k + c;
    if (k !== 0) {
      const y3 = snap(p2y, dy), x3 = (y3 - c) / k;
      if (Math.hypot(p2x - x3, p2y - y3) < Math.hypot(p2x - p3x, p2y - p3y)) { p3x = x3; p3y = y3; }
    }
  } else { p3y = snap(p2y, dy); p3x = p2x; }
  return [p3x, p3y];
}
function hitting(p1x, p1y, p2x, p2y) {
  return [Math.floor(p2x + Math.sign(p2x - p1x) * EPS), Math.floor(p2y + Math.sign(p2y - p1y) * EPS)];
}
function cast(p1x, p1y, p2x, p2y) {
  const sx = p1x, sy = p1y;
  while (Math.hypot(p1x - sx, p1y - sy) < FAR) {
    const [cx, cy] = hitting(p1x, p1y, p2x, p2y);
    if (tile(cx, cy)) break;
    const n = rayStep(p1x, p1y, p2x, p2y);
    p1x = p2x; p1y = p2y; p2x = n[0]; p2y = n[1];
  }
  return [p2x, p2y];
}

function sampleTex(tex, u, v) {
  let tx = Math.floor(u * tex.w); let ty = Math.floor(v * tex.h);
  if (tx < 0) tx = 0; if (ty < 0) ty = 0;
  if (tx >= tex.w) tx = tex.w - 1; if (ty >= tex.h) ty = tex.h - 1;
  const o = (ty * tex.w + tx) * 4;
  return [tex.p[o], tex.p[o + 1], tex.p[o + 2], tex.p[o + 3]];
}

function renderScene(W, H, camx, camy, camd, sprites) {
  const rgba = Buffer.alloc(W * H * 4, 0);
  const zbuf = new Float32Array(W);
  const put = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    if (a == null || a >= 250) { rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255; return; }
    const t = a / 255, u = 1 - t;
    rgba[o] = rgba[o] * u + r * t;
    rgba[o + 1] = rgba[o + 1] * u + g * t;
    rgba[o + 2] = rgba[o + 2] * u + b * t;
    rgba[o + 3] = 255;
  };
  const half = FOV * 0.5, fovLen = NEAR / Math.cos(half);
  const lx = camx + Math.cos(camd - half) * fovLen, ly = camy + Math.sin(camd - half) * fovLen;
  const rx = camx + Math.cos(camd + half) * fovLen, ry = camy + Math.sin(camd + half) * fovLen;
  const pz = (H / 2) | 0;
  const bp = vlen(lx - camx, ly - camy);
  let nlx = lx - camx, nly = ly - camy, ll = vlen(nlx, nly) || 1;
  let nrx = rx - camx, nry = ry - camy, rl = vlen(nrx, nry) || 1;
  nlx /= ll; nly /= ll; nrx /= rl; nry /= rl;
  for (let y = pz; y < H; y++) {
    const sz = H - y - 1, ap = pz - sz;
    if (ap === 0) continue;
    const b = (bp / ap) * pz / NEAR;
    const t1x = nlx * b + camx, t1y = nly * b + camy;
    const t2x = nrx * b + camx, t2y = nry * b + camy;
    for (let x = 0; x < W; x++) {
      const t = x / W;
      const tx = t1x + (t2x - t1x) * t, ty = t1y + (t2y - t1y) * t;
      const fog = vlen(tx - camx, ty - camy);
      const even = ((Math.floor(tx) + Math.floor(ty)) & 1) === 0;
      const fl = even ? FLOOR1 : FLOOR2, cl = even ? CEIL1 : CEIL2;
      put(x, y, clampi(fl[0] * fog, 0, 255), clampi(fl[1] * fog, 0, 255), clampi(fl[2] * fog, 0, 255));
      put(x, sz, clampi(cl[0] * fog, 0, 255), clampi(cl[1] * fog, 0, 255), clampi(cl[2] * fog, 0, 255));
    }
  }
  const dx = Math.cos(camd), dy = Math.sin(camd);
  for (let x = 0; x < W; x++) {
    const t = x / W;
    const hx = lx + (rx - lx) * t, hy = ly + (ry - ly) * t;
    const [px, py] = cast(camx, camy, hx, hy);
    const [cx, cy] = hitting(camx, camy, px, py);
    zbuf[x] = (px - camx) * dx + (py - camy) * dy;
    if (zbuf[x] < NEAR) zbuf[x] = NEAR;
    if (!tile(cx, cy)) continue;
    const strip = H / zbuf[x];
    const tdx = px - cx, tdy = py - cy;
    let u;
    if (Math.abs(tdx) < EPS && tdy > 0) u = tdy;
    else if (Math.abs(tdx - 1) < EPS && tdy > 0) u = 1 - tdy;
    else if (Math.abs(tdy) < EPS && tdx > 0) u = 1 - tdx;
    else u = tdx;
    const y1f = (H - strip) * 0.5;
    const y1 = Math.ceil(y1f), y2 = Math.floor(y1f + strip);
    const by1 = Math.max(0, y1), by2 = Math.min(H, y2);
    const shadow = Math.min(1 / zbuf[x] * 4, 1);
    for (let y = by1; y < by2; y++) {
      const v = (y - y1f) / strip;
      const s = sampleTex(wallTex, u, v);
      put(x, y, s[0], (s[1] * shadow) | 0, (s[2] * shadow) | 0);
    }
  }
  // sprites: {x,y,z,scale,tex,cx,cy,cw,ch}
  const vis = [];
  const fovx = rx - lx, fovy = ry - ly, fovl = vlen(fovx, fovy) || 1;
  for (const s of sprites || []) {
    const spx = s.x - camx, spy = s.y - camy, spl = vlen(spx, spy);
    if (spl <= NEAR || spl >= FAR) continue;
    const cos = (spx * dx + spy * dy) / spl;
    if (cos < 0) continue;
    const dist = NEAR / cos;
    const nx = (spx / spl) * dist + camx - lx;
    const ny = (spy / spl) * dist + camy - ly;
    const sign = (nx * fovx + ny * fovy) >= 0 ? 1 : -1;
    const t = vlen(nx, ny) / fovl * sign;
    const pdist = spx * dx + spy * dy;
    if (pdist < NEAR || pdist >= FAR) continue;
    vis.push({ ...s, t, pdist });
  }
  vis.sort((a, b) => b.pdist - a.pdist);
  for (const s of vis) {
    const cx = W * s.t, cy = H * 0.5;
    const maxS = H / s.pdist, size = maxS * s.scale;
    const x1 = Math.floor(cx - size * 0.5);
    const x2 = Math.floor(x1 + size - 1);
    const y1 = Math.floor(cy + maxS * 0.5 - maxS * s.z);
    const y2 = Math.floor(y1 + size - 1);
    const bx1 = Math.max(0, x1), bx2 = Math.min(W - 1, x2);
    const by1 = Math.max(0, y1), by2 = Math.min(H - 1, y2);
    for (let x = bx1; x <= bx2; x++) {
      if (s.pdist >= zbuf[x]) continue;
      const tx = Math.floor((x - x1) / size * s.cw);
      for (let y = by1; y <= by2; y++) {
        const ty = Math.floor((y - y1) / size * s.ch);
        const o = ((ty + s.cy) * s.tex.w + (tx + s.cx)) * 4;
        const a = s.tex.p[o + 3];
        if (a < 8) continue;
        put(x, y, s.tex.p[o], s.tex.p[o + 1], s.tex.p[o + 2], a);
      }
    }
  }
  return rgba;
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
  const bases = [CARD, FLOOR1, FLOOR2, CEIL1, CEIL2, [140, 196, 176], [70, 120, 100], [255, 180, 180], [40, 20, 30]];
  for (const b of bases) {
    pal.push(b);
    pal.push(mix(b, [255, 255, 255], 0.2).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.3).map(Math.round));
  }
  for (let i = 1; i <= 6; i++) pal.push(mix(CEIL1, CEIL2, i / 7).map(Math.round));
  for (let i = 1; i <= 4; i++) pal.push(mix(FLOOR1, FLOOR2, i / 5).map(Math.round));
  return pal;
}
function nearest(pal, r, g, b) {
  let best = 1, bd = Infinity;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i], d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

const KEYS = [
  { x: 2.5, y: 1.5 }, { x: 3.0, y: 1.5 }, { x: 3.5, y: 1.5 },
  { x: 4.0, y: 1.5 }, { x: 4.5, y: 1.5 },
];
function sceneSprites(time) {
  const out = [];
  for (const k of KEYS) {
    const z = 0.25 + 0.07 - 0.07 * Math.sin(0.7 * PI * time + k.x + k.y);
    out.push({ x: k.x, y: k.y, z, scale: 0.25, tex: keyTex, cx: 0, cy: 0, cw: keyTex.w, ch: keyTex.h });
  }
  out.push({ x: 1.5, y: 3.5, z: 0.25, scale: 0.25, tex: bombTex, cx: 0, cy: 0, cw: bombTex.w, ch: bombTex.h });
  out.push({ x: 3.2, y: 3.4, z: 1, scale: 1, tex: playerTex, cx: 55 * 2, cy: 0, cw: 55, ch: 55 });
  out.push({ x: 4.4, y: 3.6, z: 1, scale: 1, tex: playerTex, cx: 55 * 6, cy: 0, cw: 55, ch: 55 });
  return out;
}

function frameIndices(pal, f) {
  const p = f / FRAMES;
  const camx = 3.55, camy = 5.15 + 0.12 * Math.sin(p * PI * 2);
  const camd = -PI / 2 + 0.08 * Math.sin(p * PI * 2);
  const scene = renderScene(OUT, OUT, camx, camy, camd, sceneSprites(p * 4));
  const rgba = new Float32Array(RW * RW * 4);
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    if (!inCard(x, y, 4, 16)) continue;
    const ix = Math.min(OUT - 1, Math.max(0, x | 0));
    const iy = Math.min(OUT - 1, Math.max(0, y | 0));
    const o = (iy * OUT + ix) * 4;
    const dest = (py * RW + px) * 4;
    rgba[dest] = scene[o]; rgba[dest + 1] = scene[o + 1]; rgba[dest + 2] = scene[o + 2]; rgba[dest + 3] = 1;
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

export function koilIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 9, transparentIndex: 0 };
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
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  ':': [0, 0b00100, 0, 0, 0, 0b00100, 0],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '0': [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
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
  const camx = 3.55, camy = 5.05, camd = -PI / 2;
  const scene = renderScene(W, H, camx, camy, camd, sceneSprites(1.2));
  const put = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    scene[o] = r; scene[o + 1] = g; scene[o + 2] = b; scene[o + 3] = 255;
  };
  // Drop-shadow HUD matching upstream's debug overlay.
  const labels = ['FPS: 60', 'PLAYERS: 3'];
  for (let i = 0; i < labels.length; i++) {
    drawText(put, 72, 64 + i * 42, labels[i], 4, 0, 0, 0);
    drawText(put, 74, 62 + i * 42, labels[i], 4, 255, 255, 255);
  }
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    scene.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
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
