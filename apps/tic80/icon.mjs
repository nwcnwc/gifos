// TIC-80 sticker: a rounded cart whose label IS the 240×136 screen, with
// the default little-computer sprite walking and HELLO WORLD on it.
// Super-sample → box-downsample → small palette. Deterministic.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const PAL16 = [
  [26, 28, 44], [93, 39, 93], [177, 62, 83], [239, 125, 87],
  [255, 205, 117], [167, 240, 112], [56, 183, 100], [37, 113, 121],
  [41, 54, 111], [59, 93, 201], [65, 166, 246], [115, 239, 247],
  [244, 244, 244], [148, 176, 194], [86, 108, 134], [51, 60, 87],
];
const INK = [18, 16, 24];
const SHELL = [48, 44, 62];
const SHELL_D = [28, 26, 38];
const LABEL = [26, 28, 44];

// Official default sprite (demos/luademo.lua TILES, 2×2), two walk frames.
const SPR_A = [
  'ECCCCCCCCCCCCEEE',
  'CC8888888888CCEE',
  'CAAAAAAAAAAA0CEE',
  'CA888888888A0CEE',
  'CACCCCCCCCCA0CCC',
  'CACC0CCC0CCA0C0C',
  'CACC0CCC0CCA0C0C',
  'CACC0CCC0CCA0C0C',
  'CACCCCCCCCCA00CC',
  'CAAAAAAAAAAA0CCE',
  'CAAACAAACAAA0CEE',
  'CAAAACCCAAAA0CEE',
  'CAAAAAAAAAAA0CEE',
  'C88888888888CCEE',
  'CC000CCC000CCEEE',
  'ECCCCCECCCCCEEEE',
];
const SPR_B = [
  'ECCCCCCCCCCCCEEE',
  'CC8888888888CCEE',
  'CAAAAAAAAAAA0CEE',
  'CA888888888A0CEE',
  'CACCCCCCCCCA0CCC',
  'CACCCCCCCCCA0C0C',
  'CACC0CCC0CCA0C0C',
  'CACC0CCC0CCA0C0C',
  'CACCCCCCCCCA00CC',
  'CAAAAAAAAAAA0CCE',
  'CAAACAAACAAA0CEE',
  'CAAAACCCAAAA0CEE',
  'CAAAAAAAAAAA0CEE',
  'C88888888888CCEE',
  'CC000CCC000CCEEE',
  'ECCCCCECCCCCEEEE',
];

const GLYPHS = {
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b01010, 0b01010],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00000, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [...PAL16, INK, SHELL, SHELL_D, LABEL]) {
    pal.push(b);
    pal.push(mix(b, [255, 255, 255], 0.18).map(Math.round));
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
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  if (x >= x0 + r && x <= x1 - r) return true;
  if (y >= y0 + r && y <= y1 - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function putSpr(rgba, originX, originY, scale, frame, key) {
  const spr = frame ? SPR_B : SPR_A;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const idx = parseInt(spr[y][x], 16);
      if (idx === key) continue;
      const [r, g, b] = PAL16[idx];
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = originX + x * scale + dx;
          const py = originY + y * scale + dy;
          if (px < 0 || py < 0 || px >= RW || py >= RW) continue;
          const o = (py * RW + px) * 4;
          rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
        }
      }
    }
  }
}

function putText(rgba, x, y, str, s, rgb) {
  let cx = x;
  for (const ch of str) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (gph[row] & (1 << (4 - col))) {
          for (let dy = 0; dy < s; dy++) {
            for (let dx = 0; dx < s; dx++) {
              const px = cx + col * s + dx, py = y + row * s + dy;
              if (px < 0 || py < 0 || px >= RW || py >= RW) continue;
              const o = (py * RW + px) * 4;
              rgba[o] = rgb[0]; rgba[o + 1] = rgb[1]; rgba[o + 2] = rgb[2]; rgba[o + 3] = 255;
            }
          }
        }
      }
    }
    cx += 6 * s;
  }
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const walk = (f >> 1) % 2;
  const bob = Math.round(Math.sin(f / FRAMES * Math.PI * 2) * 2);
  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inRoundRect(x, y, 10, 8, 118, 120, 14)) continue;
      let col = mix(SHELL, SHELL_D, (y - 8) / 112);
      if (!inRoundRect(x, y, 13, 11, 115, 117, 12)) col = INK;
      // screen
      if (inRoundRect(x, y, 22, 20, 106, 78, 4)) {
        col = LABEL;
        // scanline
        if (((y | 0) % 3) === 0) col = mix(LABEL, PAL16[8], 0.25);
      }
      // cart lip
      if (inRoundRect(x, y, 40, 108, 88, 118, 3)) col = PAL16[15];
      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 255;
    }
  }
  const screenOx = Math.round(36 * SS), screenOy = Math.round(24 * SS);
  putSpr(rgba, screenOx + Math.round((8 + bob) * SS), screenOy + 2 * SS, 3, walk, 14);
  putText(rgba, Math.round(30 * SS), Math.round(58 * SS), 'HELLO WORLD!', 2, PAL16[12]);

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let dy = 0; dy < SS; dy++) {
        for (let dx = 0; dx < SS; dx++) {
          const o = ((y * SS + dy) * RW + (x * SS + dx)) * 4;
          if (rgba[o + 3] < 8) continue;
          r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += 1; n++;
        }
      }
      if (!n) { idx[y * OUT + x] = 0; continue; }
      idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
    }
  }
  return idx;
}

export function tic80Icon() {
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
    minCodeSize: 6, frames, delayCs: 10, transparentIndex: 0
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
      const t = y / H;
      put(x, y, 14 + t * 8, 12 + t * 6, 22 + t * 10);
    }
  }

  // Bezel
  const bx = 90, by = 40, bw = 1020, bh = 640, br = 28;
  for (let y = by; y < by + bh; y++) {
    for (let x = bx; x < bx + bw; x++) {
      const dx = Math.min(x - bx, bx + bw - 1 - x);
      const dy = Math.min(y - by, by + bh - 1 - y);
      if (dx < 0 || dy < 0) continue;
      const inr = dx >= br || dy >= br || (dx - br) * (dx - br) + (dy - br) * (dy - br) <= br * br;
      if (!inr) continue;
      put(x, y, 36, 34, 48);
    }
  }

  // 240×136 screen, integer scaled ×4 = 960×544, centered in the bezel
  const S = 4, sw = 240 * S, sh = 136 * S;
  const sx = ((W - sw) / 2) | 0, sy = 78;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const col = ((y / S) | 0) % 3 === 0 ? mix(PAL16[0], PAL16[8], 0.12) : PAL16[0];
      put(sx + x, sy + y, col[0], col[1], col[2]);
    }
  }

  function spr(ox, oy, scale, frame) {
    const sprP = frame ? SPR_B : SPR_A;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const idx = parseInt(sprP[y][x], 16);
        if (idx === 14) continue;
        const [r, g, b] = PAL16[idx];
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) put(ox + x * scale + dx, oy + y * scale + dy, r, g, b);
        }
      }
    }
  }
  function text(x, y, str, s, rgb) {
    let cx = x;
    for (const ch of str) {
      const gph = GLYPHS[ch];
      if (!gph) { cx += 6 * s; continue; }
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (gph[row] & (1 << (4 - col))) {
            for (let dy = 0; dy < s; dy++) {
              for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, rgb[0], rgb[1], rgb[2]);
            }
          }
        }
      }
      cx += 6 * s;
    }
  }

  spr(sx + 96 * S, sy + 24 * S, 4 * S, 0);
  text(sx + 84 * S, sy + 84 * S, 'HELLO WORLD!', 4, PAL16[12]);

  // tiny HUD as if the GifOS bar were cropped — a cart name on the bezel
  text(bx + 36, by + 16, 'HELLO', 3, PAL16[10]);

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
