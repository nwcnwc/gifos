// Procedural icon for TOSIOS: a dark rounded card looking down on a dungeon
// floor, a round fighter with a staff, a yellow bolt in flight. The staff
// sweeps and the bolt crosses the tile across the frames.
//
// Pure Node — no canvas. Super-sample → box-downsample → small palette;
// deterministic so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [42, 18, 24];
const CARD_B = [18, 8, 12];
const FLOOR = [74, 42, 50];
const FLOOR_D = [52, 28, 36];
const WALL = [36, 18, 24];
const WALL_H = [92, 52, 60];
const SKIN = [236, 214, 196];
const STAFF = [122, 82, 48];
const BOLT = [255, 224, 140];
const HEART = [224, 64, 80];
const PALE = [244, 232, 200];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, FLOOR, FLOOR_D, WALL, WALL_H, SKIN, STAFF, BOLT, HEART, PALE]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
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

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const t = f / FRAMES;
  const ang = -0.4 + Math.sin(t * Math.PI * 2) * 0.55;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  const px = 58, py = 70;
  const boltT = (t + 0.15) % 1;
  const bx = 58 + ca * (18 + boltT * 52);
  const by = 70 + sa * (18 + boltT * 52);
  const bob = Math.sin(t * Math.PI * 2) * 1.4;

  for (let pyi = 0; pyi < RW; pyi++) for (let pxi = 0; pxi < RW; pxi++) {
    const x = pxi / SS, y = pyi / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      // dungeon floor tiles
      const tx = ((x / 10) | 0), ty = ((y / 10) | 0);
      const floorish = x > 18 && x < 110 && y > 22 && y < 110;
      if (floorish) {
        col = (tx + ty) % 2 ? FLOOR : FLOOR_D;
        // walls around the edge of the floor
        if (x < 26 || x > 102 || y < 30 || y > 102) col = mix(WALL, WALL_H, ((x + y) % 7) / 7);
        // a pillar
        if (x > 84 && x < 96 && y > 36 && y < 48) col = mix(WALL, WALL_H, 0.4);
      }
      // drop shadow
      const sdx = x - (px + 1), sdy = y - (py + 11 + bob);
      if (sdx * sdx / 140 + sdy * sdy / 28 < 1) col = mix(col, [0, 0, 0], 0.35);
      // body
      const dx = x - px, dy = y - (py + bob);
      if (dx * dx + dy * dy <= 15 * 15) col = mix(SKIN, [40, 24, 24], 0.12);
      if (dx * dx + dy * dy <= 12.2 * 12.2) col = SKIN;
      // eyes along aim
      const ex = px + ca * 4, ey = py + bob + sa * 4;
      const e1x = ex - sa * 4.2, e1y = ey + ca * 4.2;
      const e2x = ex + sa * 4.2, e2y = ey - ca * 4.2;
      if ((x - e1x) * (x - e1x) + (y - e1y) * (y - e1y) <= 2.1 * 2.1) col = [24, 14, 16];
      if ((x - e2x) * (x - e2x) + (y - e2y) * (y - e2y) <= 2.1 * 2.1) col = [24, 14, 16];
      // staff
      const sx0 = px + ca * 8, sy0 = py + bob + sa * 8;
      const sx1 = px + ca * 28, sy1 = py + bob + sa * 28;
      const sdx2 = sx1 - sx0, sdy2 = sy1 - sy0, sl = Math.hypot(sdx2, sdy2) || 1;
      const tline = ((x - sx0) * sdx2 + (y - sy0) * sdy2) / (sl * sl);
      if (tline >= 0 && tline <= 1) {
        const qx = sx0 + tline * sdx2, qy = sy0 + tline * sdy2;
        const dd = (x - qx) * (x - qx) + (y - qy) * (y - qy);
        if (dd <= 2.4 * 2.4) col = STAFF;
      }
      const cx = px + ca * 28, cy = py + bob + sa * 28;
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= 4.2 * 4.2) col = mix(HEART, BOLT, 0.35);
      // bolt in flight
      const bdx = x - bx, bdy = y - by;
      if (bdx * bdx + bdy * bdy <= 9) col = mix(BOLT, [255, 255, 255], 0.4);
      if (bdx * bdx + bdy * bdy <= 3.4 * 3.4) col = BOLT;
      // a heart in the corner
      const hx = 28, hy = 38;
      const hdx = x - hx, hdy = y - hy;
      if (hdx * hdx + (hdy - 1) * (hdy - 1) <= 22 && hdy > -2) {
        const left = (x - (hx - 3.2)) * (x - (hx - 3.2)) + (y - (hy - 0.4)) * (y - (hy - 0.4)) <= 3.4 * 3.4;
        const right = (x - (hx + 3.2)) * (x - (hx + 3.2)) + (y - (hy - 0.4)) * (y - (hy - 0.4)) <= 3.4 * 3.4;
        const bottom = y > hy - 0.5 && y < hy + 7 && Math.abs(x - hx) < (7 - (y - hy)) * 0.7;
        if (left || right || bottom) col = HEART;
      }
    }
    const o = (pyi * RW + pxi) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
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

export function tosiosIcon() {
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

const GLYPHS = {
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b00100, 0b00100],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '/': [0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000, 0b10000],
};
function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (gph[row] & (1 << (4 - col))) {
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) {
          put(cx + col * s + dx, y + row * s + dy, r, g, b);
        }
      }
    }
    cx += 6 * s;
  }
}

function fighter(put, x, y, ang, skin, outline) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  // shadow
  for (let dy = -6; dy <= 6; dy++) for (let dx = -14; dx <= 14; dx++) {
    if (dx * dx / 196 + (dy - 16) * (dy - 16) / 36 < 1) put(x + dx, y + dy + 18, 12, 6, 8);
  }
  // staff
  for (let t = 0; t <= 34; t++) {
    const sx = x + ca * (10 + t), sy = y + sa * (10 + t);
    for (let k = -2; k <= 2; k++) put((sx - sa * k) | 0, (sy + ca * k) | 0, 122, 82, 48);
  }
  put((x + ca * 46) | 0, (y + sa * 46) | 0, 224, 64, 80);
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    if (dx * dx + dy * dy <= 16) put((x + ca * 46 + dx) | 0, (y + sa * 46 + dy) | 0, 232, 80, 96);
  }
  // body
  for (let dy = -18; dy <= 18; dy++) for (let dx = -18; dx <= 18; dx++) {
    const d = dx * dx + dy * dy;
    if (d <= 18 * 18) put(x + dx, y + dy, outline[0], outline[1], outline[2]);
    if (d <= 15 * 15) put(x + dx, y + dy, skin[0], skin[1], skin[2]);
  }
  // eyes
  const ex = x + ca * 6, ey = y + sa * 6;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    if (dx * dx + dy * dy <= 5) {
      put((ex - sa * 6 + dx) | 0, (ey + ca * 6 + dy) | 0, 24, 14, 16);
      put((ex + sa * 6 + dx) | 0, (ey - ca * 6 + dy) | 0, 24, 14, 16);
    }
  }
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

  fill(0, 0, W, H, 37, 19, 26);
  // floor tiles
  const T = 40;
  for (let ty = 0; ty < H / T + 1; ty++) for (let tx = 0; tx < W / T + 1; tx++) {
    const x0 = tx * T, y0 = ty * T;
    const wall = tx < 2 || ty < 1 || tx > 27 || ty > 16 || (tx === 18 && ty >= 3 && ty <= 6);
    const odd = (tx + ty) % 2;
    if (wall) {
      fill(x0, y0, x0 + T, y0 + T, odd ? 48 : 40, odd ? 22 : 18, odd ? 30 : 24);
      fill(x0, y0, x0 + T, y0 + 4, 88, 48, 56);
    } else {
      fill(x0, y0, x0 + T, y0 + T, odd ? 78 : 66, odd ? 44 : 36, odd ? 52 : 44);
    }
  }

  // potion
  fill(430, 250, 454, 286, 106, 16, 32);
  fill(434, 256, 450, 280, 224, 64, 80);
  fill(436, 240, 448, 252, 200, 160, 96);

  fighter(put, 520, 390, 0.35, [236, 214, 196], [80, 48, 48]);
  fighter(put, 820, 300, 3.5, [196, 214, 236], [40, 48, 80]);
  fighter(put, 940, 480, -1.9, [214, 196, 140], [72, 56, 32]);

  // bolts
  for (let i = 0; i < 18; i++) {
    const x = 560 + i * 12, y = 404 + i * 4;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (dx * dx + dy * dy <= 10) put(x + dx, y + dy, 255, 230, 150);
    }
  }

  // HUD hearts
  for (let i = 0; i < 3; i++) {
    const hx = 48 + i * 46, hy = 40;
    for (let dy = -12; dy <= 16; dy++) for (let dx = -14; dx <= 14; dx++) {
      const left = (dx + 6) * (dx + 6) + (dy + 4) * (dy + 4) <= 64;
      const right = (dx - 6) * (dx - 6) + (dy + 4) * (dy + 4) <= 64;
      const bot = dy > 0 && dy < 14 && Math.abs(dx) < 12 - dy * 0.7;
      if (left || right || bot) put(hx + dx, hy + dy, i < 2 ? 224 : 58, i < 2 ? 64 : 28, i < 2 ? 80 : 36);
    }
  }

  drawText(put, 48, 86, 'TOSIOS', 5, 244, 232, 200);
  drawText(put, 48, 130, 'A DUNGEON  A STAFF', 2, 200, 168, 160);
  drawText(put, 48, 156, 'WHOEVER OPENS THE LINK', 2, 200, 168, 160);

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
