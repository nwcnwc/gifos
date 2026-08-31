// Procedural icon for Breakout: a dark card holding a brick wall, an orange
// paddle, and a ball that flies up and pops a brick. The loop has to read
// at 64px. Pure Node — super-sample → box-downsample → small palette.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 16, HIT = 10;

const CARD_A = [28, 26, 32];
const CARD_B = [14, 12, 16];
const COURT = [198, 198, 198];
const WALL = [48, 48, 52];
const INK = [24, 24, 24];
const PAD = [245, 111, 37];
const PAD_L = [255, 174, 95];
const CYAN = [37, 160, 245];
const SPARK = [255, 255, 255];
const Y = [255, 247, 165];
const P = [255, 165, 224];
const B = [165, 179, 255];
const G = [191, 255, 165];
const O = [255, 203, 165];
const ROWS = [Y, P, B, G, O];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const c of [CARD_A, CARD_B, COURT, WALL, INK, PAD, PAD_L, CYAN, SPARK, Y, P, B, G, O]) {
    pal.push(c);
    pal.push(mix(c, [255, 255, 255], 0.25).map(Math.round));
    pal.push(mix(c, [0, 0, 0], 0.35).map(Math.round));
  }
  return pal;
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
function inRoundRect(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  if (x >= x0 + r && x <= x0 + w - r) return true;
  if (y >= y0 + r && y <= y0 + h - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const court = { x: 16, y: 18, w: 96, h: 92 };
  const ww = 7;
  const cols = 5, rows = 4;
  const gap = 1.2;
  const bw = (court.w - ww * 2 - gap * (cols + 1)) / cols;
  const bh = 8;
  const bx0 = court.x + ww + gap;
  const by0 = court.y + ww + 6;
  const targetCol = 3, targetRow = 1;
  const hit = f >= HIT;
  const k = hit ? (f - HIT) / (FRAMES - HIT) : 0;
  const padW = 30, padH = 7;
  const padX = court.x + 28 + Math.sin(f * 0.18) * 8;
  const padY = court.y + court.h - ww - padH - 4;
  const t = hit ? 1 : (f + 0.3) / HIT;
  const ballX = padX + padW * 0.62 + t * ((bx0 + (targetCol + 0.5) * (bw + gap)) - (padX + padW * 0.62));
  const ballY = padY - 4 - t * ((padY - 4) - (by0 + targetRow * (bh + gap) + bh));
  const ballR = 3.6;
  const bloom = hit && k < 0.55 ? 5 + k * 10 : 0;

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
      const o = (py * RW + px) * 4;
      if (!inCard(x, y, 6, 20)) continue;
      let col = mix(CARD_A, CARD_B, y / OUT);
      if (inRoundRect(x, y, court.x, court.y, court.w, court.h, 3)) {
        col = COURT;
        if (x < court.x + ww || x > court.x + court.w - ww || y < court.y + ww) col = WALL;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (c === targetCol && r === targetRow && hit) continue;
            const x0 = bx0 + c * (bw + gap), y0 = by0 + r * (bh + gap);
            if (x >= x0 && x < x0 + bw && y >= y0 && y < y0 + bh) {
              col = ROWS[r];
              if (x < x0 + 1.2 || y < y0 + 1.2 || x > x0 + bw - 1.2 || y > y0 + bh - 1.2) {
                col = mix(ROWS[r], WALL, 0.45);
              }
            }
          }
        }
        if (inRoundRect(x, y, padX, padY, padW, padH, padH / 2)) {
          col = mix(PAD, PAD_L, (padY + padH - y) / padH);
        }
        const dx = x - ballX, dy = y - ballY;
        const d2 = dx * dx + dy * dy;
        if (!hit && d2 <= ballR * ballR) col = INK;
        else if (hit && k < 0.7) {
          if (d2 <= (ballR * (1 - k * 0.4)) * (ballR * (1 - k * 0.4))) col = INK;
          if (bloom && d2 <= bloom * bloom && d2 > ballR * ballR) col = mix(SPARK, PAD_L, 0.35);
          for (let i = 0; i < 5; i++) {
            const a = i * (Math.PI * 2 / 5) + 0.4;
            const pxb = ballX + Math.cos(a) * (4 + k * 14);
            const pyb = ballY + Math.sin(a) * (4 + k * 14);
            const ddx = x - pxb, ddy = y - pyb;
            if (ddx * ddx + ddy * ddy <= 2.2 * 2.2) col = i % 2 ? SPARK : PAD_L;
          }
        }
      }
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

export function breakoutIcon() {
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
    minCodeSize: 6, frames, delayCs: 8, transparentIndex: 0
  };
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
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  ':': [0, 0b00100, 0, 0, 0, 0b00100, 0],
  ' ': [0, 0, 0, 0, 0, 0, 0],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (gph[row] & (1 << (4 - col))) {
          for (let dy = 0; dy < s; dy++) {
            for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
          }
        }
      }
    }
    cx += 6 * s;
  }
}

function fillRound(put, x0, y0, w, h, rad, r, g, b) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x0 + w - rad);
      const cy = Math.min(Math.max(y, y0 + rad), y0 + h - rad);
      let ok = (x >= x0 + rad && x < x0 + w - rad) || (y >= y0 + rad && y < y0 + h - rad);
      if (!ok) {
        const dx = x - cx, dy = y - cy;
        ok = dx * dx + dy * dy <= rad * rad;
      }
      if (ok) put(x, y, r, g, b);
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
  const fill = (x0, y0, x1, y1, r, g, b) => {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    x1 = Math.min(W, x1 | 0); y1 = Math.min(H, y1 | 0);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, r, g, b);
  };

  fill(0, 0, W, H, 26, 24, 30);
  const chunk = 28;
  const xchunks = 30, ychunks = 18;
  const cw = xchunks * chunk, ch = ychunks * chunk;
  const left = Math.floor((W - cw) / 2);
  const top = 86;
  const wall = chunk;
  fill(left - wall, top - wall * 2, left + cw + wall, top + ch, 200, 200, 200);
  fill(left - wall, top - wall * 2, left + cw + wall, top, 51, 51, 51);
  fill(left - wall, top - wall * 2, left, top + ch, 51, 51, 51);
  fill(left + cw, top - wall * 2, left + cw + wall, top + ch, 51, 51, 51);

  const colors = [Y, P, B, G, O];
  const rowY0 = top + chunk * 4;
  const brickW = chunk * 5;
  const groups = 6;
  const missing = { r: 1, g: 3 };
  function strokeBrick(x, y, w, h, col) {
    fill(x, y, x + w, y + h, col[0], col[1], col[2]);
    const edge = mix(col, [34, 34, 34], 0.45);
    fill(x, y, x + w, y + 2, edge[0], edge[1], edge[2]);
    fill(x, y + h - 2, x + w, y + h, edge[0], edge[1], edge[2]);
    fill(x, y, x + 2, y + h, edge[0], edge[1], edge[2]);
    fill(x + w - 2, y, x + w, y + h, edge[0], edge[1], edge[2]);
  }
  for (let r = 0; r < 5; r++) {
    for (let g = 0; g < groups; g++) {
      if (r === missing.r && g === missing.g) continue;
      const x = left + g * brickW, y = rowY0 + r * chunk;
      strokeBrick(x, y, brickW, chunk, colors[r]);
    }
  }

  const hitX = left + missing.g * brickW + brickW / 2;
  const hitY = rowY0 + missing.r * chunk + chunk / 2;
  for (let i = 0; i < 7; i++) {
    const a = i * (Math.PI * 2 / 7) + 0.3;
    const x2 = hitX + Math.cos(a) * 34;
    const y2 = hitY + Math.sin(a) * 34;
    const steps = 18;
    for (let s = 0; s <= steps; s++) {
      const x = hitX + (x2 - hitX) * (s / steps);
      const y = hitY + (y2 - hitY) * (s / steps);
      fill(x - 2, y - 2, x + 2, y + 2, 255, 220, 160);
    }
  }

  const padW = chunk * 6, padH = chunk;
  fillRound(put, left + chunk * 6, top + ch - padH - 8, padW, padH, padH / 2, 245, 111, 37);
  fillRound(put, left + chunk * 18, top + ch - padH - 8, padW, padH, padH / 2, 37, 160, 245);

  const br = Math.round(chunk * 0.3);
  const bx = hitX, by = hitY + chunk * 1.6;
  for (let i = 4; i >= 1; i--) {
    const s = br - i;
    fill(bx - i * 10 - s, by + i * 18 - s, bx - i * 10 + s, by + i * 18 + s, 80 + i * 20, 80 + i * 20, 80 + i * 20);
  }
  fill(bx - br, by - br, bx + br, by + br, 20, 20, 20);

  drawText(put, left, top - wall * 2 + 10, '0012480', 3, 239, 210, 121);
  drawText(put, left + cw - 280, top - wall * 2 + 14, 'HIGH SCORE: 0012480', 2, 175, 215, 117);
  fillRound(put, left + 210, top - wall * 2 + 14, 36, 16, 8, 245, 111, 37);
  fillRound(put, left + 254, top - wall * 2 + 14, 36, 16, 8, 245, 111, 37);
  fillRound(put, left + 298, top - wall * 2 + 14, 36, 16, 8, 245, 111, 37);

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
