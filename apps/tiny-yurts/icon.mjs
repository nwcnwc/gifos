// Procedural Tiny Yurts icon: a green valley sticker, a yurt, a path that
// draws itself to a farm. Super-sample → box-downsample.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 10;
const GRASS_A = [138, 170, 85], GRASS_B = [90, 140, 70];
const PATH = [221, 204, 170], YURT = [245, 240, 230], ROOF = [176, 70, 52];
const FARM = [232, 196, 64], INK = [40, 40, 30], OX = [90, 70, 50];
const OUTLINE = [40, 50, 30];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [GRASS_A, GRASS_B, PATH, YURT, ROOF, FARM, INK, OX, OUTLINE, [255, 255, 255]]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.25).map(Math.round));
  }
  return pal.slice(0, 64);
}
function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e9;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i], d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}
function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  const endx = 38 + t * 54, endy = 84 - t * 32;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, 4, 26)) {
      a = 1;
      col = mix(GRASS_A, GRASS_B, (y - 4) / 120);
      // faint grid
      if (Math.abs((x % 10) - 0.4) < 0.35 || Math.abs((y % 10) - 0.4) < 0.35) {
        col = mix(col, OUTLINE, 0.08);
      }
      if (distSeg(x, y, 38, 84, endx, endy) < 4.2) col = PATH;
      if (distSeg(x, y, 38, 84, endx, endy) < 5.4 && distSeg(x, y, 38, 84, endx, endy) >= 4.2) {
        col = mix(PATH, OUTLINE, 0.35);
      }
      // yurt body
      if ((x - 38) ** 2 + (y - 86) ** 2 < 16 * 16 && y > 78) col = YURT;
      if ((x - 38) ** 2 + (y - 86) ** 2 < 17.4 * 17.4 && (x - 38) ** 2 + (y - 86) ** 2 >= 16 * 16 && y > 78) col = OUTLINE;
      // roof
      if ((x - 38) ** 2 / (16 * 16) + (y - 76) ** 2 / (12 * 12) < 1 && y < 82) col = ROOF;
      // farm
      const fx = 96, fy = 48;
      if (Math.abs(x - fx) < 13 && Math.abs(y - fy) < 9) col = FARM;
      if (Math.abs(x - fx) < 6 && y > fy - 14 && y < fy - 6) col = [80, 140, 55];
      if (t > 0.7 && (x - (fx - 10)) ** 2 / 25 + (y - (fy + 14)) ** 2 / 12 < 1) col = OX;
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
    }
    idx[y * OUT + x] = a / n < 0.5 ? 0 : nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}

export function yurtsIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64, flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 12, transparentIndex: 0 };
}

function crc(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
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
  const put = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
  };
  const fill = (x0, y0, x1, y1, r, g, b) => {
    for (let y = Math.max(0, y0 | 0); y < Math.min(H, y1 | 0); y++)
      for (let x = Math.max(0, x0 | 0); x < Math.min(W, x1 | 0); x++) put(x, y, r, g, b);
  };
  const circ = (cx, cy, rad, r, g, b) => {
    const r2 = rad * rad;
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d <= r2) put(x, y, r, g, b);
    }
  };
  const ellipse = (cx, cy, rx, ry, r, g, b) => {
    for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) {
      if ((x - cx) * (x - cx) / (rx * rx) + (y - cy) * (y - cy) / (ry * ry) <= 1) put(x, y, r, g, b);
    }
  };

  fill(0, 0, W, H, 138, 170, 85);
  for (let x = 24; x < W; x += 40) fill(x, 0, x + 1, H, 112, 148, 68);
  for (let y = 24; y < H; y += 40) fill(0, y, W, y + 1, 112, 148, 68);

  // pond
  ellipse(980, 520, 110, 70, 102, 153, 187);
  ellipse(980, 510, 80, 46, 119, 176, 204);

  // winding path yurt → farm → yurt → farm
  const path = (x0, y0, x1, y1) => {
    const thick = 28;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    for (let i = 0; i <= len; i++) {
      const x = x0 + dx * (i / len), y = y0 + dy * (i / len);
      for (let t = -thick / 2; t <= thick / 2; t++) put((x + nx * t) | 0, (y + ny * t) | 0, 221, 204, 170);
    }
  };
  path(220, 430, 520, 430);
  path(520, 430, 520, 220);
  path(520, 220, 780, 220);
  path(520, 430, 520, 560);
  path(520, 560, 760, 560);

  function yurt(cx, cy) {
    circ(cx, cy + 10, 52, 245, 240, 230);
    ellipse(cx, cy - 28, 54, 36, 176, 70, 52);
    fill(cx - 8, cy + 8, cx + 8, cy + 42, 90, 70, 50);
  }
  function farm(x, y, w, h) {
    fill(x, y, x + w, y + h, 232, 196, 64);
    fill(x + 18, y - 22, x + w - 18, y + 4, 80, 140, 55);
  }
  yurt(220, 420);
  yurt(780, 210);
  farm(740, 500, 160, 80);
  farm(250, 160, 140, 70);

  // ox / goat
  ellipse(800, 545, 22, 12, 90, 70, 50);
  circ(818, 538, 8, 90, 70, 50);
  ellipse(300, 195, 16, 10, 200, 200, 195);
  circ(312, 188, 7, 200, 200, 195);

  // trees
  function tree(tx, ty) {
    circ(tx, ty, 22, 70, 120, 55);
    fill(tx - 4, ty + 14, tx + 4, ty + 36, 90, 70, 40);
  }
  tree(140, 240); tree(1080, 180); tree(90, 560); tree(1100, 400);

  // HUD: score, clock, path tiles, pause — mid-game, not first boot
  fill(24, 24, 210, 88, 51, 51, 46);
  circ(52, 56, 18, 138, 170, 85);
  fill(78, 44, 198, 72, 238, 238, 230);
  // fake "2" ox count as a pale block
  fill(24, 96, 170, 148, 51, 51, 46);
  circ(52, 122, 16, 200, 200, 195);

  circ(1120, 72, 40, 51, 51, 46);
  fill(1116, 44, 1124, 76, 238, 238, 230);
  fill(1104, 100, 1136, 116, 200, 200, 195);

  fill(1040, 36, 1096, 92, 245, 240, 230);
  fill(1056, 48, 1064, 80, 51, 51, 46);
  fill(1072, 48, 1080, 80, 51, 51, 46);

  // path-tile diamond
  const dcx = 90, dcy = 640;
  for (let y = -36; y <= 36; y++) for (let x = -36; x <= 36; x++) {
    if (Math.abs(x) + Math.abs(y) < 36) put(dcx + x, dcy + y, 51, 51, 46);
  }
  fill(dcx + 20, dcy + 16, dcx + 48, dcy + 44, 238, 238, 230);

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
