// Procedural icon: a sticker of the factory — circles travel a belt,
// a cutter splits one, a painter turns a half red, it enters the hub.
// Cover: a mid-game factory around the hub, never an empty first boot.
// Pure Node — super-sample → box-downsample → small palette.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 14;

const CARD_A = [18, 22, 34];
const CARD_B = [10, 12, 22];
const FLOOR = [213, 217, 226];
const FLOOR2 = [207, 212, 222];
const BELT = [142, 160, 184];
const BELT_D = [68, 83, 102];
const MINER = [230, 193, 74];
const CUT = [224, 138, 60];
const PAINT = [224, 106, 176];
const HUB_A = [47, 111, 147];
const HUB_B = [61, 139, 179];
const INK = [28, 36, 48];
const CIR = [170, 170, 170];
const RED = [255, 102, 106];
const BLU = [102, 167, 255];
const GRN = [120, 255, 102];
const WHITE = [255, 255, 255];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, FLOOR, FLOOR2, BELT, BELT_D, MINER, CUT, PAINT, HUB_A, HUB_B, INK, CIR, RED, BLU, GRN, WHITE]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
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
function distRect(px, py, x, y, w, h, r) {
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  if (px >= x + r && px <= x + w - r && py >= y && py <= y + h) {
    return -Math.min(px - x, x + w - px, py - y, y + h - py);
  }
  if (py >= y + r && py <= y + h - r && px >= x && px <= x + w) {
    return -Math.min(px - x, x + w - px, py - y, y + h - py);
  }
  const dx = px - cx, dy = py - cy;
  return Math.hypot(dx, dy) - r;
}
function distCircle(px, py, x, y, r) {
  return Math.hypot(px - x, py - y) - r;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / FRAMES;
  // Mini factory on the card: miner left, belt across, cutter, painter, hub right.
  const miner = { x: 28, y: 64, s: 18 };
  const cutter = { x: 62, y: 64, s: 16 };
  const painter = { x: 86, y: 64, s: 16 };
  const hub = { x: 108, y: 64, s: 22 };
  const beltY = 64;
  const circleX = 28 + (t * 80);
  const split = t > 0.42;
  const painted = t > 0.7;
  const halfX = 62 + Math.max(0, t - 0.42) * 90;

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 22)) continue;
      let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      // floor window
      if (x > 14 && x < 114 && y > 28 && y < 100) {
        col = ((Math.floor(x / 10) + Math.floor(y / 10)) & 1) ? FLOOR : FLOOR2;
      }
      const dm = distRect(x, y, miner.x - miner.s / 2, miner.y - miner.s / 2, miner.s, miner.s, 3);
      const dc = distRect(x, y, cutter.x - cutter.s / 2, cutter.y - cutter.s / 2, cutter.s, cutter.s, 3);
      const dp = distRect(x, y, painter.x - painter.s / 2, painter.y - painter.s / 2, painter.s, painter.s, 3);
      const dh = distRect(x, y, hub.x - hub.s / 2, hub.y - hub.s / 2, hub.s, hub.s, 5);
      const dbelt = distRect(x, y, 22, beltY - 5, 80, 10, 4);
      if (dh < 0) col = mix(HUB_A, HUB_B, (x - 96) / 24);
      else if (dm < 0) col = MINER;
      else if (dc < 0) col = CUT;
      else if (dp < 0) col = PAINT;
      else if (dbelt < 0) col = BELT;
      if (dh < 1.2 && dh > -1) col = INK;
      if (dm < 1.1 && dm > -1) col = INK;
      if (dc < 1.1 && dc > -1) col = INK;
      if (dp < 1.1 && dp > -1) col = INK;

      // travelling circle (uncolored) before the cut
      if (!split) {
        const dsh = distCircle(x, y, circleX, beltY, 6.2);
        if (dsh < 0) col = CIR;
        if (dsh < 1.1 && dsh > -1.1) col = INK;
      } else {
        const left = distCircle(x, y, halfX, beltY - (painted ? 0 : 0), 5.4);
        // left half only: clip x < center
        const hx = painted ? 86 + (t - 0.7) * 70 : 62 + (t - 0.42) * 48;
        const hy = beltY;
        const inside = distCircle(x, y, hx, hy, 6.5);
        if (inside < 0 && x <= hx + 0.4) col = painted ? RED : CIR;
        if (Math.abs(inside) < 1.1 && x <= hx + 0.6) col = INK;
      }

      // cutter blade
      const blade = distSeg(x, y, cutter.x, cutter.y - 7, cutter.x, cutter.y + 7);
      if (blade < 0.9) col = WHITE;
      // paint drip
      const drip = distCircle(x, y, painter.x + 4, painter.y - 6, 2.2);
      if (drip < 0) col = RED;

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

export function shapezIcon() {
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
    minCodeSize: 6, frames, delayCs: 9, transparentIndex: 0
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

function putPx(rgba, W, H, x, y, r, g, b, a) {
  x = x | 0; y = y | 0;
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const o = (y * W + x) * 4;
  rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a == null ? 255 : a;
}
function fillRect(put, x, y, w, h, r, g, b) {
  for (let yy = y | 0; yy < y + h; yy++) {
    for (let xx = x | 0; xx < x + w; xx++) put(xx, yy, r, g, b);
  }
}
function fillRound(put, x, y, w, h, rad, r, g, b) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      const cx = Math.min(Math.max(xx, x + rad), x + w - rad);
      const cy = Math.min(Math.max(yy, y + rad), y + h - rad);
      if ((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) <= rad * rad ||
          (xx >= x + rad && xx < x + w - rad) || (yy >= y + rad && yy < y + h - rad)) {
        put(xx, yy, r, g, b);
      }
    }
  }
}
function fillCircle(put, x, y, rad, r, g, b) {
  const r2 = rad * rad;
  for (let yy = y - rad; yy <= y + rad; yy++) {
    for (let xx = x - rad; xx <= x + rad; xx++) {
      if ((xx - x) * (xx - x) + (yy - y) * (yy - y) <= r2) put(xx, yy, r, g, b);
    }
  }
}
function strokeCircle(put, x, y, rad, w, r, g, b) {
  const r0 = (rad - w) * (rad - w), r1 = (rad + w) * (rad + w);
  for (let yy = y - rad - w; yy <= y + rad + w; yy++) {
    for (let xx = x - rad - w; xx <= x + rad + w; xx++) {
      const d = (xx - x) * (xx - x) + (yy - y) * (yy - y);
      if (d <= r1 && d >= r0) put(xx, yy, r, g, b);
    }
  }
}

const GLYPHS = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '/': [0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b01000, 0b10000],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  7: [0b11111, 0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b01000],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
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

function drawShapeCover(put, code, cx, cy, size) {
  const quads = [];
  for (let i = 0; i < 4; i++) {
    const a = code.charAt(i * 2), b = code.charAt(i * 2 + 1);
    quads.push(a && a !== '-' ? { k: a, c: b } : null);
  }
  const HEX = {
    u: [170, 170, 170], r: [255, 102, 106], g: [120, 255, 102],
    b: [102, 167, 255], y: [252, 245, 42], p: [221, 102, 255],
    c: [0, 252, 255], w: [255, 255, 255]
  };
  const INKS = {
    u: [70, 70, 78], r: [140, 40, 44], g: [30, 100, 40],
    b: [36, 72, 130], y: [120, 110, 20], p: [110, 40, 130],
    c: [20, 110, 120], w: [90, 90, 96]
  };
  const boxes = [[0, -1], [0, 0], [-1, 0], [-1, -1]];
  const rad = size / 2;
  for (let i = 0; i < 4; i++) {
    const q = quads[i];
    if (!q) continue;
    const col = HEX[q.c] || HEX.u;
    const ink = INKS[q.c] || INKS.u;
    const bx = cx + boxes[i][0] * rad, by = cy + boxes[i][1] * rad;
    for (let yy = by; yy < by + rad; yy++) {
      for (let xx = bx; xx < bx + rad; xx++) {
        const dx = xx - cx, dy = yy - cy;
        let inside = false;
        if (q.k === 'R') inside = Math.abs(dx) <= rad * 0.86 && Math.abs(dy) <= rad * 0.86;
        else if (q.k === 'S') {
          const adx = Math.abs(dx) / rad, ady = Math.abs(dy) / rad;
          inside = adx + ady < 0.95 || (adx < 0.22 && ady < 0.95) || (ady < 0.22 && adx < 0.95);
        } else inside = dx * dx + dy * dy <= (rad * 0.92) * (rad * 0.92);
        if (!inside) continue;
        const edge = q.k === 'R'
          ? Math.min(rad * 0.86 - Math.abs(dx), rad * 0.86 - Math.abs(dy)) < 2
          : Math.abs(Math.hypot(dx, dy) - rad * 0.92) < 1.6;
        if (edge) put(xx, yy, ink[0], ink[1], ink[2]);
        else put(xx, yy, col[0], col[1], col[2]);
      }
    }
  }
}

function drawBldg(put, x, y, s, rgb, ink) {
  fillRound(put, x, y, s, s, 6, rgb[0], rgb[1], rgb[2]);
  // outline
  for (let i = 0; i < s; i++) {
    put(x + i, y, ink[0], ink[1], ink[2]);
    put(x + i, y + s - 1, ink[0], ink[1], ink[2]);
    put(x, y + i, ink[0], ink[1], ink[2]);
    put(x + s - 1, y + i, ink[0], ink[1], ink[2]);
  }
}

function drawBeltTile(put, x, y, s, dir) {
  fillRound(put, x, y, s, s, 5, 142, 160, 184);
  const m = (s * 0.32) | 0;
  if (dir === 0 || dir === 2) fillRect(put, x, y + (s - m) / 2, s, m, 107, 124, 148);
  else fillRect(put, x + (s - m) / 2, y, m, s, 107, 124, 148);
  const cx = x + s / 2, cy = y + s / 2;
  const dx = dir === 0 ? 1 : dir === 2 ? -1 : 0;
  const dy = dir === 1 ? 1 : dir === 3 ? -1 : 0;
  for (let k = -1; k <= 1; k++) {
    put(cx + dx * 6 + k, cy + dy * 6, 240, 244, 250);
    put(cx + dx * 5 - dy * 3 + k, cy + dy * 5 + dx * 3, 240, 244, 250);
    put(cx + dx * 5 + dy * 3 + k, cy + dy * 5 - dx * 3, 240, 244, 250);
  }
}

export function screenshotPng() {
  const W = 1200, H = 720;
  const rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b, a) => putPx(rgba, W, H, x, y, r, g, b, a);
  const TS = 48;
  const camX = -2.2, camY = 0.15;
  function scr(tx, ty) {
    return { x: (tx - camX) * TS + W / 2, y: (ty - camY) * TS + H / 2 };
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tx = Math.floor((x - W / 2) / TS + camX);
      const ty = Math.floor((y - H / 2) / TS + camY);
      const c = ((tx + ty) & 1) ? FLOOR2 : FLOOR;
      put(x, y, c[0], c[1], c[2]);
    }
  }

  function patch(x0, y0, w, h, kind) {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const p = scr(x, y);
        if (kind === 'r' || kind === 'g' || kind === 'b') {
          const col = kind === 'r' ? RED : kind === 'g' ? GRN : BLU;
          fillCircle(put, p.x, p.y, 14, col[0], col[1], col[2]);
        } else {
          drawShapeCover(put, kind + 'u' + kind + 'u' + kind + 'u' + kind + 'u', p.x, p.y, 28);
        }
      }
    }
  }
  patch(-8, -1, 5, 4, 'C');
  patch(4, -1, 5, 4, 'R');
  patch(-2, -6, 4, 3, 'r');

  function beltLine(x0, y0, x1, y1) {
    let x = x0, y = y0;
    while (x !== x1 || y !== y1) {
      const dir = x < x1 ? 0 : x > x1 ? 2 : y < y1 ? 1 : 3;
      const p = scr(x, y);
      drawBeltTile(put, p.x - TS / 2 + 2, p.y - TS / 2 + 2, TS - 4, dir);
      if (x !== x1) x += x < x1 ? 1 : -1;
      else y += y < y1 ? 1 : -1;
    }
    const dir = x0 < x1 || (x0 === x1 && y0 < y1) ? (x1 !== x0 ? (x1 > x0 ? 0 : 2) : 1) : 3;
    const p = scr(x1, y1);
    drawBeltTile(put, p.x - TS / 2 + 2, p.y - TS / 2 + 2, TS - 4, x1 > x0 ? 0 : x1 < x0 ? 2 : y1 > y0 ? 1 : 3);
  }

  // West circles into hub
  beltLine(-6, 0, -2, 0);
  beltLine(-6, 1, -2, 1);
  // cutters on the south line of circles
  beltLine(-6, -2, -4, -2);
  beltLine(-4, -2, -4, 0);

  // Rectangles from the east
  beltLine(6, 0, 2, 0);
  beltLine(6, 1, 2, 1);

  // Red colour down to a painter
  beltLine(-1, -5, -1, -3);
  beltLine(-1, -3, 2, -3);
  beltLine(3, 0, 3, -3);

  const minerAt = [[-7, 0], [-7, 1], [-7, -1], [5, 0], [5, 1], [-1, -5], [-6, -2]];
  for (const [x, y] of minerAt) {
    const p = scr(x, y);
    drawBldg(put, p.x - 18, p.y - 18, 36, MINER, [122, 90, 18]);
  }
  const cutAt = [[-4, -1], [-3, 1]];
  for (const [x, y] of cutAt) {
    const p = scr(x, y);
    drawBldg(put, p.x - 18, p.y - 18, 36, CUT, [122, 62, 16]);
  }
  const pnt = scr(2, -2);
  drawBldg(put, pnt.x - 18, pnt.y - 18, 36, PAINT, [122, 36, 88]);
  const rot = scr(-3, -2);
  drawBldg(put, rot.x - 18, rot.y - 18, 36, [111, 207, 122], [42, 106, 52]);

  // Hub 3x3
  {
    const p = scr(0, 0);
    fillRound(put, p.x - TS * 1.5 + 4, p.y - TS * 1.5 + 4, TS * 3 - 8, TS * 3 - 8, 16, HUB_A[0], HUB_A[1], HUB_A[2]);
    fillRound(put, p.x - TS * 0.85, p.y - TS * 0.95, TS * 1.7, TS * 1.5, 10, 20, 40, 55);
    drawShapeCover(put, 'CrCrCrCr', p.x, p.y - 8, 70);
  }

  // Items on belts
  const items = [
    { x: -5.3, y: 0, code: 'CuCuCuCu' },
    { x: -4.4, y: 0, code: 'CuCuCuCu' },
    { x: -3.2, y: 0, code: 'CuCuCuCu' },
    { x: -5.1, y: 1, code: '----CuCu' },
    { x: 4.4, y: 0, code: 'RuRuRuRu' },
    { x: 3.5, y: 0, code: 'RuRuRuRu' },
    { x: 3.2, y: -2.3, code: 'CrCrCrCr' },
    { x: 1.4, y: -2, code: 'CrCr----' },
  ];
  for (const it of items) {
    const p = scr(it.x, it.y);
    drawShapeCover(put, it.code, p.x, p.y, 28);
  }
  fillCircle(put, scr(-1, -4.2).x, scr(-1, -4.2).y, 9, RED[0], RED[1], RED[2]);
  fillCircle(put, scr(0.4, -3).x, scr(0.4, -3).y, 9, RED[0], RED[1], RED[2]);

  fillRound(put, 18, 16, 390, 108, 16, 18, 22, 30);
  fillRound(put, 28, 26, 84, 84, 10, 213, 217, 226);
  drawShapeCover(put, 'CrCrCrCr', 70, 68, 70);
  drawText(put, 128, 32, 'LEVEL 7', 2, 180, 190, 210);
  drawText(put, 128, 52, 'RED CIRCLES', 3, 238, 244, 255);
  drawText(put, 128, 80, '28 / 40', 2, 200, 210, 230);
  fillRound(put, 128, 102, 170, 8, 4, 40, 48, 60);
  fillRound(put, 128, 102, 112, 8, 4, 102, 167, 255);

  fillRound(put, 1000, 16, 180, 40, 12, 18, 22, 30);
  drawText(put, 1020, 28, '2 BUILDING', 2, 238, 244, 255);

  // toolbar
  const tools = [
    [142, 160, 184], MINER, CUT, [111, 207, 122], PAINT, [74, 81, 96]
  ];
  fillRect(put, 0, H - 78, W, 78, 18, 20, 28);
  tools.forEach((c, i) => {
    const x = 360 + i * 80;
    const on = i === 4;
    fillRound(put, x, H - 68, 64, 56, 10, 24, 28, 38);
    fillRound(put, x + 12, H - 60, 40, 32, 6, c[0], c[1], c[2]);
    if (on) {
      for (let k = 0; k < 64; k++) {
        put(x + k, H - 68, 102, 167, 255);
        put(x + k, H - 13, 102, 167, 255);
        if (k < 56) {
          put(x, H - 68 + k, 102, 167, 255);
          put(x + 63, H - 68 + k, 102, 167, 255);
        }
      }
    }
  });

  // friend cursor
  const fc = scr(3, 1);
  for (let i = 0; i < TS - 4; i++) {
    put(fc.x - TS / 2 + 2 + i, fc.y - TS / 2 + 2, 80, 200, 220);
    put(fc.x - TS / 2 + 2 + i, fc.y + TS / 2 - 2, 80, 200, 220);
    put(fc.x - TS / 2 + 2, fc.y - TS / 2 + 2 + i, 80, 200, 220);
    put(fc.x + TS / 2 - 2, fc.y - TS / 2 + 2 + i, 80, 200, 220);
  }

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
