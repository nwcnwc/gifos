// Procedural icon: a hex grid, a knight leaping the 2+1 hex jump.
// Pure Node, super-sample → box-downsample. Deterministic.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [16, 16, 22];
const HEX1 = [201, 160, 106];
const HEX2 = [138, 90, 50];
const HEX3 = [90, 56, 32];
const W_HI = [250, 244, 230];
const W_LO = [210, 198, 170];
const B_HI = [70, 70, 82];
const B_LO = [18, 18, 24];
const GOLD = [232, 197, 71];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, HEX1, HEX2, HEX3, W_HI, W_LO, B_HI, B_LO, GOLD]) {
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
function inFlatHex(px, py, cx, cy, R) {
  const x = Math.abs(px - cx), y = Math.abs(py - cy);
  if (x > R) return false;
  const ymax = x <= R * 0.5 ? (R * Math.sqrt(3) / 2) : (Math.sqrt(3) * (R - x));
  return y <= ymax + 0.35;
}
function hexColor(q, r) { return ((q - r) % 3 + 3) % 3; }
function hexPixel(q, r, size) {
  return { x: size * Math.sqrt(3) / 2 * q, y: -size * (r + q / 2) };
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 18;
  const size = 11.2;
  const ox = OUT / 2, oy = OUT / 2 + 2;
  const t = f / (FRAMES - 1);
  const from = { q: -1, r: 0 }, to = { q: 1, r: 2 };
  const a = hexPixel(from.q, from.r, size), b = hexPixel(to.q, to.r, size);
  const jumpT = Math.min(1, t * 1.12);
  const jx = ox + a.x + (b.x - a.x) * jumpT;
  const jy = oy + a.y + (b.y - a.y) * jumpT - Math.sin(jumpT * Math.PI) * size * 1.15;
  const settled = [
    [0, -1, false], [1, -1, false], [-1, 1, true], [0, 1, true], [2, 0, true], [-2, 1, false]
  ];
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a1 = 0;
    if (inCard(x, y, m, rad)) {
      a1 = 1;
      col = CARD.slice();
      for (let q = -2; q <= 2; q++) {
        const rMin = Math.max(-2, -2 - q), rMax = Math.min(2, 2 - q);
        for (let r = rMin; r <= rMax; r++) {
          const p = hexPixel(q, r, size);
          if (inFlatHex(x, y, ox + p.x, oy + p.y, size * 0.92)) {
            const c = hexColor(q, r);
            col = (c === 0 ? HEX1 : c === 1 ? HEX2 : HEX3).slice();
            for (const s of settled) {
              if (s[0] === q && s[1] === r) {
                const cx = ox + p.x, cy = oy + p.y;
                const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
                const pr = size * 0.28;
                if (d <= pr * pr) {
                  const u = (x - (cx - 2)) / (pr * 2);
                  col = s[2] ? mix(B_HI, B_LO, Math.max(0, Math.min(1, u)))
                             : mix(W_HI, W_LO, Math.max(0, Math.min(1, u)));
                }
              }
            }
          }
        }
      }
    }
    const pr = size * 0.32;
    const dd = (x - jx) * (x - jx) + (y - jy) * (y - jy);
    if (dd <= pr * pr) {
      a1 = 1;
      const u = (x - (jx - 2)) / (pr * 2);
      col = mix(W_HI, W_LO, Math.max(0, Math.min(1, u)));
      // a little ear so it reads as a knight, not a pawn
      const ear = (x - (jx + pr * 0.35)) * (x - (jx + pr * 0.35)) + (y - (jy - pr * 0.55)) * (y - (jy - pr * 0.55));
      if (ear <= (pr * 0.28) * (pr * 0.28)) col = mix(W_HI, GOLD, 0.25);
    }
    const o = (py * RW + px) * 4;
    if (a1) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
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

export function hexChessIcon() {
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
  'X': [0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b01010, 0b10001],
  ' ': [0, 0, 0, 0, 0, 0, 0],
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

const FILES = 'abcdefghikl';
function parseAlg(s) {
  const qi = FILES.indexOf(s[0]);
  const rank = parseInt(s.slice(1), 10);
  const q = qi - 5;
  const rMin = Math.max(-5, -5 - q);
  return { q: q, r: rMin + rank - 1 };
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

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = (x + y) / (W + H);
    put(x, y, (10 + t * 8) | 0, (10 + t * 6) | 0, (15 + t * 10) | 0);
  }

  const size = 38;
  const ox = 420, oy = 368;
  const HEXC = [[201, 160, 106], [138, 90, 50], [90, 56, 32]];
  function drawHex(cx, cy, R, rgb) {
    const r0 = Math.ceil(R * Math.sqrt(3) / 2) + 1;
    for (let dy = -r0; dy <= r0; dy++) for (let dx = -R - 1; dx <= R + 1; dx++) {
      if (inFlatHex(cx + dx, cy + dy, cx, cy, R)) {
        put(cx + dx, cy + dy, rgb[0], rgb[1], rgb[2]);
      }
    }
  }
  function discAt(cx, cy, rad, hi, lo) {
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      if (dx * dx + dy * dy > rad * rad) continue;
      const u = (dx + rad) / (rad * 2);
      put(cx + dx, cy + dy,
        (hi[0] + (lo[0] - hi[0]) * u) | 0,
        (hi[1] + (lo[1] - hi[1]) * u) | 0,
        (hi[2] + (lo[2] - hi[2]) * u) | 0);
    }
  }
  const glyphs = {
    K: 'K', Q: 'Q', R: 'R', B: 'B', N: 'N', P: ''
  };

  // Mid-game: queens developed, a knight has leaped, pawns have met in the centre.
  const white = 'Kg1 Qc3 Rc1 Ri1 Nd1 Nf4 Bf1 Bf2 Bf3 Pb2 Pc2 Pd3 Pe4 Pf5 Pg4 Ph3 Pi2 Pk1';
  const black = 'Kg10 Qc6 Rc8 Ri8 Nd9 Nh9 Bf9 Bf10 Bf11 Pb7 Pc7 Pd7 Pe6 Pf7 Pg7 Ph7 Pi7 Pk7';
  function place(str, color) {
    const out = [];
    for (const tok of str.split(' ')) {
      const letter = tok[0];
      const h = parseAlg(tok.slice(1));
      out.push({ q: h.q, r: h.r, kind: letter, color: color });
    }
    return out;
  }
  const pieces = place(white, 'w').concat(place(black, 'b'));

  for (let q = -5; q <= 5; q++) {
    const rMin = Math.max(-5, -5 - q), rMax = Math.min(5, 5 - q);
    for (let r = rMin; r <= rMax; r++) {
      const p = hexPixel(q, r, size);
      const c = hexColor(q, r);
      drawHex(ox + p.x, oy + p.y, size * 0.92, HEXC[c]);
    }
  }
  // last-move glow on the leaping knight's hex and origin
  const glow = [parseAlg('h1'), parseAlg('f4')];
  for (const h of glow) {
    const p = hexPixel(h.q, h.r, size);
    const cx = ox + p.x, cy = oy + p.y, R = size * 0.92;
    const r0 = Math.ceil(R * Math.sqrt(3) / 2) + 1;
    for (let dy = -r0; dy <= r0; dy++) for (let dx = -R - 1; dx <= R + 1; dx++) {
      if (inFlatHex(cx + dx, cy + dy, cx, cy, R * 0.88)) {
        const o = ((cy + dy) * W + (cx + dx)) * 4;
        if (cx + dx >= 0 && cy + dy >= 0 && cx + dx < W && cy + dy < H) {
          rgba[o] = Math.min(255, rgba[o] + 40);
          rgba[o + 1] = Math.min(255, rgba[o + 1] + 28);
        }
      }
    }
  }
  for (const pc of pieces) {
    const p = hexPixel(pc.q, pc.r, size);
    const cx = ox + p.x, cy = oy + p.y;
    const hi = pc.color === 'w' ? [250, 244, 230] : [70, 70, 82];
    const lo = pc.color === 'w' ? [210, 198, 170] : [18, 18, 24];
    const rad = pc.kind === 'P' ? size * 0.28 : size * 0.34;
    discAt(cx, cy, rad, hi, lo);
    if (pc.kind !== 'P') {
      const ink = pc.color === 'w' ? [90, 56, 32] : [232, 197, 71];
      drawText(put, cx - 8, cy - 11, glyphs[pc.kind], 2, ink[0], ink[1], ink[2]);
    }
  }
  // Selected leaping knight + legal hexes, so the cover is a game in progress.
  {
    const sel = parseAlg('f4');
    const p = hexPixel(sel.q, sel.r, size);
    const cx = ox + p.x, cy = oy + p.y, rad = size * 0.42;
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > rad - 2.2 && d <= rad) put(cx + dx, cy + dy, 28, 205, 211);
    }
    const hints = ['g6', 'h5', 'i3', 'd5'];
    for (const a of hints) {
      const h = parseAlg(a);
      const q = hexPixel(h.q, h.r, size);
      discAt(ox + q.x, oy + q.y, size * 0.12, [255, 220, 140], [232, 197, 71]);
    }
  }

  drawText(put, 860, 160, 'HEX', 9, 232, 197, 71);
  drawText(put, 860, 240, 'CHESS', 9, 201, 160, 106);
  drawText(put, 860, 360, 'COMPUTER', 3, 210, 198, 170);
  drawText(put, 860, 410, 'OR A FRIEND', 3, 210, 198, 170);
  drawText(put, 860, 500, 'THREE BISHOPS', 3, 201, 162, 39);

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
