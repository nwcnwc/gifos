// Procedural icon: a navy card holding a water grid. A shot falls onto a
// ship cell, lands, and the cell goes red with an X. The loop is the shot.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 14;

const CARD = [14, 32, 52];
const CARD_D = [8, 20, 34];
const WATER = [37, 86, 123];
const CELL = [153, 194, 225];
const SHIP = [110, 124, 134];
const SHIP_H = [180, 190, 198];
const HIT = [246, 0, 24];
const HIT_H = [255, 180, 80];
const ORANGE = [255, 146, 0];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, CARD_D, WATER, CELL, SHIP, SHIP_H, HIT, HIT_H, ORANGE]) {
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

function nearDiag(lx, ly, size, thick) {
  // local 0..size in a cell; true if on either diagonal of an X
  const a = Math.abs(lx - ly);
  const b = Math.abs(lx - (size - ly));
  return a < thick || b < thick;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const n = 8, pad = 20, span = OUT - 2 * pad, step = span / n;
  const tRow = 4, tCol = 2; // ship cell the shot hits
  const tx = pad + (tCol + 0.5) * step;
  const ty = pad + (tRow + 0.5) * step;
  const fallN = 6;
  const falling = f < fallN;
  const u = Math.min(1, f / (fallN - 1));
  const ease = u * u;
  const shotY = 8 + (ty - 8) * ease;
  const shotX = tx + (1 - u) * 4;
  const shotR = falling ? 4.2 - u * 0.5 : 0;
  const hitAge = Math.max(0, f - fallN);
  const ringR = 4.5 + hitAge * 2.4;
  const ringA = Math.max(0, 1 - hitAge / 8);
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, 8, 18)) {
      a = 1;
      col = mix(CARD, CARD_D, Math.max(0, Math.min(1, y / OUT)));
      if (x >= pad - 2 && x <= OUT - pad + 2 && y >= pad - 2 && y <= OUT - pad + 2) {
        col = WATER.slice();
        const cx = Math.floor((x - pad) / step), cy = Math.floor((y - pad) / step);
        const ix = pad + cx * step, iy = pad + cy * step;
        if (cx >= 0 && cy >= 0 && cx < n && cy < n) {
          const inset = 1.05;
          if (x > ix + inset && x < ix + step - inset && y > iy + inset && y < iy + step - inset) {
            col = CELL.slice();
            // ship: row 4, cols 1-4
            if (cy === 4 && cx >= 1 && cx <= 4) col = mix(SHIP_H, SHIP, 0.28 + 0.35 * ((x - ix) / step));
            // miss: (1,6) with a small x
            if (cx === 6 && cy === 1) {
              col = [244, 247, 250];
              const lx = x - ix, ly = y - iy;
              if (nearDiag(lx, ly, step, 0.9)) col = [30, 30, 36];
            }
            // the shot cell
            if (cx === tCol && cy === tRow) {
              if (!falling) {
                const flash = hitAge === 0 ? 1 : Math.max(0, 1 - hitAge / 3);
                col = mix(HIT_H, HIT, 1 - flash * 0.55);
                const lx = x - ix, ly = y - iy;
                if (nearDiag(lx, ly, step, 1.15)) col = mix([20, 8, 10], HIT, 0.15);
              }
            }
          }
        }
        if (!falling) {
          const dx = x - tx, dy = y - ty;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > ringR && d < ringR + 2.2) {
            col = mix(col, mix(HIT, ORANGE, 0.5), ringA * (1 - (d - ringR) / 2.2));
          }
        }
      }
      if (falling && shotR > 0) {
        const dx = x - shotX, dy = y - shotY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < shotR + 1.8) {
          const core = d < shotR;
          col = core ? mix(HIT_H, ORANGE, d / shotR) : mix(col, ORANGE, 1 - (d - shotR) / 1.8);
        }
      }
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0, nss = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
    }
    if (a / nss < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / nss, g / nss, b / nss);
  }
  return idx;
}

export function battleboatIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 8, transparentIndex: 0 };
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
  const rr = (x0, y0, x1, y1, rad, r, g, b) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x1 - rad - 1);
      const cy = Math.min(Math.max(y, y0 + rad), y1 - rad - 1);
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= rad * rad) put(x, y, r, g, b);
    }
  };

  fill(0, 0, W, H, 13, 27, 42);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = y / H;
    put(x, y, (13 + t * 8) | 0, (27 + t * 14) | 0, (42 + t * 18) | 0);
  }

  function board(ox, oy, size, ships, marks, lastKey) {
    const N = 10, gap = 3;
    const cell = Math.floor((size - 12 - gap * 9) / 10);
    rr(ox, oy, ox + size, oy + size, 12, 37, 86, 123);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const x0 = ox + 6 + c * (cell + gap);
      const y0 = oy + 6 + r * (cell + gap);
      let col = [153, 194, 225];
      const key = r + ',' + c;
      if (ships[key]) col = [110, 124, 134];
      if (marks[key] === 'm') col = [244, 247, 250];
      if (marks[key] === 'h') col = [246, 0, 24];
      if (marks[key] === 's') col = [26, 26, 26];
      rr(x0, y0, x0 + cell, y0 + cell, 3, col[0], col[1], col[2]);
      if (marks[key] === 'm' || marks[key] === 'h') {
        const cx = x0 + cell / 2, cy = y0 + cell / 2;
        for (let k = -Math.floor(cell * 0.28); k <= Math.floor(cell * 0.28); k++) {
          put(cx + k, cy + k, 30, 30, 34);
          put(cx + k, cy - k, 30, 30, 34);
        }
      }
      if (key === lastKey) {
        const o = 255, g = 146;
        for (let k = 0; k < cell; k++) {
          put(x0 + k, y0, o, g, 0); put(x0 + k, y0 + 1, o, 182, 85);
          put(x0 + k, y0 + cell - 1, o, g, 0); put(x0 + k, y0 + cell - 2, o, 182, 85);
          put(x0, y0 + k, o, g, 0); put(x0 + 1, y0 + k, o, 182, 85);
          put(x0 + cell - 1, y0 + k, o, g, 0); put(x0 + cell - 2, y0 + k, o, 182, 85);
        }
      }
    }
  }

  const myShips = {};
  [[2, 1, 5, 1], [4, 3, 4, 0], [0, 6, 3, 1], [5, 0, 3, 0], [8, 0, 2, 1]].forEach(function (s) {
    for (let i = 0; i < s[2]; i++) {
      const r = s[3] ? s[0] : s[0] + i, c = s[3] ? s[1] + i : s[1];
      myShips[r + ',' + c] = 1;
    }
  });
  const myMarks = { '2,2': 'h', '2,3': 'h', '5,3': 'h', '0,0': 'm', '1,8': 'm', '6,6': 'm', '8,0': 's', '8,1': 's' };
  const enMarks = {
    '1,1': 'm', '2,8': 'm', '7,2': 'm', '0,9': 'm', '6,1': 'm', '3,3': 'm',
    '5,7': 'm', '9,4': 'm', '2,2': 'm', '7,8': 'm', '1,5': 'm', '9,0': 'm',
    '0,2': 's', '0,3': 's', '8,8': 'h', '4,4': 'h', '4,5': 'h', '4,6': 'h'
  };

  drawText(put, 70, 28, 'BATTLEBOAT', 6, 255, 182, 85);
  drawText(put, 70, 82, 'HIT. YOUR SHOT.', 3, 238, 246, 251);
  board(70, 130, 500, myShips, myMarks, '5,3');
  board(630, 130, 500, {}, enMarks, '4,6');
  drawText(put, 70, 650, 'YOUR FLEET', 3, 155, 184, 204);
  drawText(put, 630, 650, 'ENEMY FLEET', 3, 155, 184, 204);
  // remaining-ship pips under the enemy board
  const pipLens = [5, 4, 3, 3, 2];
  const pipSunk = [false, false, false, false, true];
  let px0 = 630;
  for (let s = 0; s < pipLens.length; s++) {
    for (let k = 0; k < pipLens[s]; k++) {
      const col = pipSunk[s] ? [26, 26, 26] : [110, 124, 134];
      rr(px0 + k * 12, 678, px0 + k * 12 + 10, 686, 1, col[0], col[1], col[2]);
    }
    px0 += pipLens[s] * 12 + 14;
  }
  drawText(put, 70, 678, 'TWO DEVICES. ONE LINK.', 2, 255, 146, 0);

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
