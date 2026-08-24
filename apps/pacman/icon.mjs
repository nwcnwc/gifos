// Procedural Pac-Man icon: dark card, a yellow mouth that chomps, a pellet
// that disappears, a ghost that flashes. Super-sample → box-downsample.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 10;

const CARD_A = [8, 8, 22];
const CARD_B = [2, 2, 10];
const YEL = [255, 230, 0];
const YEL_D = [196, 150, 0];
const BLUE = [20, 80, 220];
const PINK = [255, 120, 180];
const RED = [220, 40, 40];
const PEL = [255, 210, 160];
const DOT = [255, 190, 80];
const EYE = [255, 255, 255];
const PUP = [20, 40, 160];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, YEL, YEL_D, BLUE, PINK, RED, PEL, DOT, EYE, PUP]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.3).map(Math.round));
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

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 6, rad = 22;
  const mouth = 0.08 + 0.22 * Math.abs(Math.sin(f / (FRAMES - 1) * Math.PI));
  const px = 46 + f * 3.4, py = 64;
  const gx = 96 - f * 1.6, gy = 62;
  const eaten = f > 5;
  const ghostCol = f % 2 ? BLUE : PINK;

  for (let pyi = 0; pyi < RW; pyi++) for (let pxi = 0; pxi < RW; pxi++) {
    const x = pxi / SS, y = pyi / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      // dots
      for (let i = 0; i < 5; i++) {
        const dx = 70 + i * 9 - x, dy = 64 - y;
        if (dx * dx + dy * dy < 2.2 * 2.2 && !(eaten && i < 2)) col = DOT;
      }
      // power pellet
      if (!eaten) {
        const dx = 92 - x, dy = 64 - y;
        if (dx * dx + dy * dy < 5.5 * 5.5) col = PEL;
      }
      // ghost body
      {
        const dx = x - gx, dy = y - gy;
        const body = (dx * dx) / (16 * 16) + (Math.max(0, -dy + 2) * Math.max(0, -dy + 2)) / (14 * 14) <= 1
          && dy < 12;
        const skirt = dy > 8 && dy < 16 && Math.abs(dx) < 16 && Math.sin(dx * 0.9 + f) > -0.2;
        if (body || skirt) {
          col = ghostCol;
          if (dx * dx + (dy + 4) * (dy + 4) < 12) col = EYE;
          if ((dx + 4) * (dx + 4) + (dy + 4) * (dy + 4) < 3.2) col = PUP;
          if ((dx - 4) * (dx - 4) + (dy + 4) * (dy + 4) < 3.2) col = PUP;
        }
      }
      // pac-man
      {
        const dx = x - px, dy = y - py;
        const r2 = dx * dx + dy * dy;
        if (r2 <= 22 * 22) {
          const ang = Math.atan2(dy, dx);
          if (ang < -mouth * Math.PI || ang > mouth * Math.PI) {
            col = r2 > 19 * 19 ? YEL_D : YEL;
            if ((dx + 4) * (dx + 4) + (dy + 8) * (dy + 8) < 4) col = CARD_B;
          }
        }
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

export function pacmanIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 12, transparentIndex: 0 };
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
  const put = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
  };
  const fill = (x0, y0, x1, y1, r, g, b) => {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    x1 = Math.min(W, x1 | 0); y1 = Math.min(H, y1 | 0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, r, g, b);
  };
  fill(0, 0, W, H, 4, 4, 12);
  // maze walls
  const wall = (x0, y0, x1, y1) => fill(x0, y0, x1, y1, 20, 40, 200);
  wall(40, 40, 1160, 56);
  wall(40, 664, 1160, 680);
  wall(40, 40, 56, 680);
  wall(1144, 40, 1160, 680);
  wall(200, 140, 500, 156);
  wall(700, 140, 1000, 156);
  wall(200, 140, 216, 300);
  wall(984, 140, 1000, 300);
  wall(480, 280, 720, 296);
  wall(200, 480, 500, 496);
  wall(700, 480, 1000, 496);
  wall(560, 360, 640, 520);
  // pellets
  for (let x = 90; x < 1110; x += 36) {
    for (let y of [90, 240, 420, 620]) {
      if (x > 540 && x < 660 && y === 420) continue;
      fill(x, y, x + 6, y + 6, 255, 210, 140);
    }
  }
  fill(90, 90, 110, 110, 255, 230, 160);
  fill(1080, 90, 1100, 110, 255, 230, 160);
  fill(90, 600, 110, 620, 255, 230, 160);
  fill(1080, 600, 1100, 620, 255, 230, 160);
  // pac-man
  const pcx = 320, pcy = 360, pr = 48;
  for (let y = pcy - pr; y <= pcy + pr; y++) for (let x = pcx - pr; x <= pcx + pr; x++) {
    const dx = x - pcx, dy = y - pcy;
    if (dx * dx + dy * dy <= pr * pr) {
      const ang = Math.atan2(dy, dx);
      if (ang < -0.45 || ang > 0.45) put(x, y, 255, 230, 0);
    }
  }
  // ghosts
  function ghost(cx, cy, r, g, b) {
    for (let y = cy - 40; y <= cy + 44; y++) for (let x = cx - 36; x <= cx + 36; x++) {
      const dx = x - cx, dy = y - cy;
      if ((dx * dx) / (36 * 36) + (Math.max(-dy, 0) * Math.max(-dy, 0)) / (40 * 40) <= 1 && dy < 36) {
        put(x, y, r, g, b);
      } else if (dy >= 28 && dy < 44 && Math.abs(dx) < 36 && Math.sin(dx * 0.28) > -0.15) {
        put(x, y, r, g, b);
      }
    }
    fill(cx - 16, cy - 10, cx - 4, cy + 4, 255, 255, 255);
    fill(cx + 4, cy - 10, cx + 16, cy + 4, 255, 255, 255);
    fill(cx - 12, cy - 6, cx - 6, cy, 30, 40, 140);
    fill(cx + 8, cy - 6, cx + 14, cy, 30, 40, 140);
  }
  ghost(620, 250, 220, 40, 40);
  ghost(780, 250, 40, 180, 220);
  ghost(940, 250, 255, 120, 180);
  ghost(700, 520, 255, 140, 40);

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
