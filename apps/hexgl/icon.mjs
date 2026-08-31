// Procedural HexGL icon: a cyan hex-track and an orange dart ship that
// surges toward the camera. Transparent sticker, dark outline, reads at 64px.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const SKY_A = [8, 16, 28];
const SKY_B = [42, 88, 120];
const HEX = [40, 150, 196];
const HEX_D = [18, 70, 96];
const LINE = [180, 230, 255];
const SHIP = [246, 100, 57];
const SHIP_HI = [255, 180, 90];
const GLOW = [80, 200, 255];
const WHITE = [240, 248, 255];
const INK = [6, 10, 16];

function mix(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function inDisk(x, y, cx, cy, r) {
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [SKY_A, SKY_B, HEX, HEX_D, LINE, SHIP, SHIP_HI, GLOW, WHITE, INK]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
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

function hexDist(px, py, cx, cy, r) {
  const x = Math.abs(px - cx), y = Math.abs(py - cy);
  return Math.max(x * 0.866 + y * 0.5, y) - r;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  const zoom = 0.72 + t * 0.55;
  const shipY = 78 - t * 10;
  const shipS = 0.85 + t * 0.55;
  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inDisk(x, y, 64, 64, 58)) continue;
      let col = mix(SKY_A, SKY_B, Math.max(0, Math.min(1, (y - 20) / 70)));
      const cx = 64, cy = 58;
      const u = (x - cx) / zoom, v = (y - cy) / zoom + t * 18;
      const hx = ((u / 18) % 1 + 1) % 1 - 0.5;
      const hy = ((v / 20) % 1 + 1) % 1 - 0.5;
      const hd = hexDist(hx * 18, hy * 20, 0, 0, 7.2);
      if (Math.abs(hd) < 1.15 && y > 28) col = mix(HEX, LINE, 0.35);
      else if (hd < 0 && y > 30) col = mix(HEX_D, HEX, 0.45 + 0.2 * Math.sin((v + u) * 0.2));
      // vanishing lines
      const dx = x - 64;
      const vanishing = Math.abs(dx) - (y - 24) * 0.42;
      if (y > 30 && Math.abs(vanishing) < 1.4) col = LINE;
      // ship dart
      const sx = 64, sy = shipY;
      const dxs = x - sx, dys = y - sy;
      const onBody = dys > -10 * shipS && dys < 14 * shipS && Math.abs(dxs) < (14 * shipS - dys * 0.55);
      const onWing = dys > 2 * shipS && dys < 10 * shipS && Math.abs(dxs) > 4 * shipS && Math.abs(dxs) < 16 * shipS - (dys - 2 * shipS);
      const onTrail = dys > 12 * shipS && dys < 22 * shipS && Math.abs(dxs) < 3.2 * shipS;
      if (onTrail) col = mix(GLOW, SHIP_HI, (f % 3) / 3);
      else if (onWing) col = SHIP;
      else if (onBody) col = dys < 0 ? SHIP_HI : SHIP;
      const rim = Math.abs(Math.hypot(x - 64, y - 64) - 57);
      if (rim < 1.6) col = mix(INK, HEX, 0.25);
      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }
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

export function hexglIcon() {
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
    const sky = mix([6, 12, 22], [70, 130, 170], y / (H * 0.55));
    for (let x = 0; x < W; x++) {
      const sun = Math.hypot(x - W * 0.72, y - 90);
      let col = sky;
      if (sun < 70) col = mix([255, 200, 120], sky, sun / 70);
      put(x, y, col[0], col[1], col[2]);
    }
  }
  // distant scrapers
  for (let i = 0; i < 28; i++) {
    const bx = 40 + i * 44 + (i % 3) * 8;
    const bw = 18 + (i % 4) * 6;
    const bh = 80 + ((i * 17) % 160);
    const top = 280 - bh;
    for (let y = top; y < 320; y++) {
      for (let x = bx; x < bx + bw; x++) {
        const lit = 30 + ((x + y) % 7) * 4;
        put(x, y, 20 + lit, 40 + lit * 0.6, 55 + lit * 0.4);
      }
    }
  }
  // track receding
  for (let y = 300; y < H; y++) {
    const p = (y - 300) / (H - 300);
    const half = 40 + p * 520;
    const cx = W / 2;
    for (let x = cx - half; x <= cx + half; x++) {
      const u = (x - (cx - half)) / (half * 2);
      const edge = u < 0.04 || u > 0.96;
      const hex = Math.abs(((x / (18 + p * 40)) % 1) - 0.5) < 0.06
        || Math.abs(((y / (16 + p * 28)) % 1) - 0.5) < 0.05;
      let col = edge ? [200, 80, 40] : hex ? [50, 160, 200] : [18, 36, 52];
      put(x, y, col[0], col[1], col[2]);
    }
  }
  // ship
  const sx = 600, sy = 470;
  for (let y = -50; y < 70; y++) {
    for (let x = -70; x < 70; x++) {
      const body = y > -40 && y < 50 && Math.abs(x) < (28 - y * 0.32);
      const wing = y > 0 && y < 36 && Math.abs(x) > 16 && Math.abs(x) < 62 - y;
      const trail = y > 48 && y < 78 && Math.abs(x) < 10;
      if (trail) put(sx + x, sy + y, 80, 210, 255);
      else if (wing) put(sx + x, sy + y, 246, 100, 57);
      else if (body) put(sx + x, sy + y, y < 0 ? 255 : 246, y < 0 ? 180 : 110, y < 0 ? 90 : 50);
    }
  }
  // HUD
  function bar(x0, y0, w, h, r, g, b) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x0 + x, y0 + y, r, g, b);
  }
  bar(40, 36, 280, 46, 8, 16, 28);
  bar(W - 220, 36, 180, 46, 8, 16, 28);
  // time digits as blocks: 1'08''42 and LAP 2/3
  function glyph(ch, ox, oy, s, r, g, b) {
    const G = {
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
      "'": [0b00100, 0b00100, 0b00000, 0, 0, 0, 0],
      'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
      'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
      'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
      '/': [0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b10000, 0b10000],
      ' ': [0, 0, 0, 0, 0, 0, 0],
    };
    const gph = G[ch];
    if (!gph) return 6 * s;
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (gph[row] & (1 << (4 - col))) {
          for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(ox + col * s + dx, oy + row * s + dy, r, g, b);
        }
      }
    }
    return 6 * s;
  }
  let tx = 52, ty = 44;
  for (const ch of "1'08''42") tx += glyph(ch, tx, ty, 4, 220, 240, 255);
  tx = W - 200; ty = 44;
  for (const ch of 'LAP 2/3') tx += glyph(ch, tx, ty, 4, 220, 240, 255);
  // speed
  bar(W / 2 - 70, H - 86, 140, 36, 8, 16, 28);
  tx = W / 2 - 36; ty = H - 78;
  for (const ch of '412') tx += glyph(ch, tx, ty, 5, 255, 255, 255);

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
