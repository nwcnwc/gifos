// Procedural icon: a mahogany backgammon table, a white checker hitting a
// blot onto the bar. Pure Node, super-sample → box-downsample. Deterministic.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [20, 12, 8];
const FRAME = [58, 28, 16];
const FELT = [74, 36, 24];
const LIGHT = [212, 184, 150];
const DARK = [139, 58, 42];
const BAR = [42, 20, 14];
const IVORY_H = [255, 248, 238];
const IVORY = [200, 180, 152];
const INK_H = [74, 58, 52];
const INK = [26, 18, 16];
const GOLD = [232, 180, 64];
const GOLD2 = [255, 224, 138];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, FRAME, FELT, LIGHT, DARK, BAR, IVORY_H, IVORY, INK_H, INK, GOLD, GOLD2]) {
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
function inTri(x, y, x0, y0, x1, y1, x2, y2) {
  const s = (x0 - x2) * (y - y2) - (y0 - y2) * (x - x2);
  const t = (x1 - x0) * (y - y0) - (y1 - y0) * (x - x0);
  const d = (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
  return (s >= 0 && t >= 0 && d >= 0) || (s <= 0 && t <= 0 && d <= 0);
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 18;
  // Close-up of the home board: bar on the left, six points, a hit onto the bar.
  const bx = 12, by = 18, bw = OUT - 24, bh = OUT - 32;
  const t = f / (FRAMES - 1);
  const COLS = 4;
  const barW = bw * 0.22;
  const pw = (bw - barW) / COLS;
  const ph = bh * 0.48;
  const hitT = Math.min(1, t * 1.12);
  const blotT = Math.max(0, (t - 0.42) / 0.58);
  function pointTri(col, top) {
    const x = bx + barW + col * pw;
    const y = top ? by : by + bh - ph;
    return { x, y, w: pw, h: ph, top };
  }
  const r = pw * 0.42;
  function stackCy(p, i) {
    return p.top ? (p.y + r + 2 + i * r * 1.62) : (p.y + p.h - r - 2 - i * r * 1.62);
  }
  const fromP = pointTri(3, false);
  const ontoP = pointTri(1, false);
  const from = { cx: fromP.x + fromP.w / 2, cy: stackCy(fromP, 1) };
  const onto = { cx: ontoP.x + ontoP.w / 2, cy: stackCy(ontoP, 0) };
  const barC = { cx: bx + barW / 2, cy: by + r + 6 };
  const flyerX = from.cx + (onto.cx - from.cx) * hitT;
  const flyerY = from.cy + (onto.cy - from.cy) * hitT - Math.sin(hitT * Math.PI) * 16;
  const blotGone = blotT > 0.06;
  const blotX = onto.cx + (barC.cx - onto.cx) * blotT;
  const blotY = onto.cy + (barC.cy - onto.cy) * blotT - Math.sin(blotT * Math.PI) * 20;
  const bot = { 0: [0, 0], 2: [0, 0], 3: [0, 0] };
  const top = { 0: [1, 1], 2: [1, 1, 1], 3: [1] };
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = CARD.slice();
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
        col = FRAME.slice();
        if (x > bx + 2 && x < bx + bw - 2 && y > by + 2 && y < by + bh - 2) {
          col = FELT.slice();
          if (x >= bx && x <= bx + barW) col = BAR.slice();
          for (let coln = 0; coln < COLS; coln++) {
            for (const isTop of [true, false]) {
              const p = pointTri(coln, isTop);
              const lite = (coln + (isTop ? 1 : 0)) % 2 === 0;
              const inside = p.top
                ? inTri(x, y, p.x, p.y, p.x + p.w, p.y, p.x + p.w / 2, p.y + p.h)
                : inTri(x, y, p.x, p.y + p.h, p.x + p.w, p.y + p.h, p.x + p.w / 2, p.y);
              if (inside) col = (lite ? LIGHT : DARK).slice();
            }
          }
          function paintStack(map, isTop) {
            for (const coln of Object.keys(map)) {
              const p = pointTri(+coln, isTop);
              const pcs = map[coln];
              for (let i = 0; i < pcs.length; i++) {
                const cy = stackCy(p, i);
                const cx = p.x + p.w / 2;
                const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
                if (d <= r * r) {
                  const u = (x - (cx - 2)) / (r * 2);
                  col = pcs[i] ? mix(INK_H, INK, Math.max(0, Math.min(1, u)))
                               : mix(IVORY_H, IVORY, Math.max(0, Math.min(1, u)));
                }
              }
            }
          }
          paintStack(top, true);
          paintStack(bot, false);
          if (!blotGone) {
            const d = (x - onto.cx) * (x - onto.cx) + (y - onto.cy) * (y - onto.cy);
            if (d <= r * r) {
              const u = (x - (onto.cx - 2)) / (r * 2);
              col = mix(INK_H, INK, Math.max(0, Math.min(1, u)));
            }
          } else {
            const d = (x - blotX) * (x - blotX) + (y - blotY) * (y - blotY);
            if (d <= r * r) {
              const u = (x - (blotX - 2)) / (r * 2);
              col = mix(INK_H, INK, Math.max(0, Math.min(1, u)));
            }
          }
          const dd = (x - flyerX) * (x - flyerX) + (y - flyerY) * (y - flyerY);
          if (dd <= r * r) {
            const u = (x - (flyerX - 2)) / (r * 2);
            col = mix(IVORY_H, IVORY, Math.max(0, Math.min(1, u)));
          }
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

export function backgammonIcon() {
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
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0, 0b00100],
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
  const fillRound = (x0, y0, x1, y1, rad, r, g, b) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x1 - rad);
      const cy = Math.min(Math.max(y, y0 + rad), y1 - rad);
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= rad * rad) put(x, y, r, g, b);
    }
  };

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = (x + y) / (W + H);
    put(x, y, (18 + t * 12) | 0, (10 + t * 8) | 0, (6 + t * 6) | 0);
  }

  const pill = 'YOUR TURN. TAP A CHECKER.';
  const pillW = pill.length * 6 * 3 + 28;
  fillRound(((W - pillW) / 2) | 0, 18, ((W + pillW) / 2) | 0, 52, 16, 42, 24, 16);
  drawText(put, ((W - pill.length * 6 * 3) / 2) | 0, 24, pill, 3, 243, 234, 216);

  const bx = 70, by = 66, bw = 1060, bh = 590;
  fill(bx, by, bx + bw, by + bh, 58, 28, 16);
  fill(bx + 16, by + 16, bx + bw - 16, by + bh - 16, 74, 36, 24);
  const ix = bx + 16, iy = by + 16, iw = bw - 32, ih = bh - 32;
  const bear = 52;
  fill(ix + iw - bear, iy, ix + iw, iy + ih, 92, 46, 28);
  const playInner = iw - bear;
  const barW = playInner * 0.075, play = playInner - barW, quad = play / 2, pw = quad / 6, ph = ih * 0.46;
  fill(ix + quad, iy, ix + quad + barW, iy + ih, 42, 20, 14);

  function tri(pos, lite) {
    let col, top, left;
    if (pos >= 12 && pos <= 17) { col = pos - 12; top = true; left = true; }
    else if (pos >= 18) { col = pos - 18; top = true; left = false; }
    else if (pos >= 6) { col = 11 - pos; top = false; left = true; }
    else { col = 5 - pos; top = false; left = false; }
    const x = ix + (left ? 0 : quad + barW) + col * pw;
    const y = top ? iy : iy + ih - ph;
    const x0 = x + 1, x1 = x + pw - 1, xm = x + pw / 2;
    const yBase = top ? y : y + ph, yTip = top ? y + ph : y;
    const ymin = Math.min(yBase, yTip), ymax = Math.max(yBase, yTip);
    for (let yy = ymin; yy <= ymax; yy++) {
      const t = (yy - yBase) / (yTip - yBase);
      const half = (1 - t) * ((x1 - x0) / 2);
      const cx = xm;
      for (let xx = cx - half; xx <= cx + half; xx++) {
        put(xx, yy, lite ? 212 : 139, lite ? 184 : 58, lite ? 150 : 42);
      }
    }
    return { x, y, w: pw, h: ph, top };
  }
  for (let pos = 0; pos < 24; pos++) tri(pos, pos % 2 === 0);

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
  const WHITE_H = [255, 248, 238], WHITE = [200, 180, 152];
  const BLACK_H = [74, 58, 52], BLACK = [26, 18, 16];
  function stack(pos, n, black) {
    const p = tri(pos, pos % 2 === 0);
    const rad = p.w * 0.38;
    for (let i = 0; i < n; i++) {
      const cy = p.top ? (p.y + rad + 4 + i * rad * 1.7) : (p.y + p.h - rad - 4 - i * rad * 1.7);
      discAt(p.x + p.w / 2, cy, rad, black ? BLACK_H : WHITE_H, black ? BLACK : WHITE);
    }
  }
  // Mid-game: white about to hit a blot on the 6-point with a 5.
  stack(0, 2, false); stack(1, 2, false); stack(2, 2, false); stack(4, 3, false);
  stack(10, 2, false); stack(11, 1, false);
  stack(23, 2, true); stack(22, 3, true); stack(20, 2, true); stack(18, 3, true);
  stack(16, 2, true); stack(5, 1, true);

  function stackTop(pos, n) {
    const p = tri(pos, pos % 2 === 0);
    const rad = p.w * 0.38;
    const i = n - 1;
    const cy = p.top ? (p.y + rad + 4 + i * rad * 1.7) : (p.y + p.h - rad - 4 - i * rad * 1.7);
    return { cx: p.x + p.w / 2, cy, rad, p };
  }
  const sel = stackTop(10, 2);
  for (let dy = -(sel.rad + 5); dy <= sel.rad + 5; dy++) for (let dx = -(sel.rad + 5); dx <= sel.rad + 5; dx++) {
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > sel.rad + 5 || d < sel.rad + 1) continue;
    put(sel.cx + dx, sel.cy + dy, 255, 224, 138);
  }
  const blot = stackTop(5, 1);
  const destR = blot.rad + 6;
  for (let dy = -destR; dy <= destR; dy++) for (let dx = -destR; dx <= destR; dx++) {
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= destR && d >= destR - 4) put(blot.cx + dx, blot.cy + dy, 255, 122, 107);
  }
  const hole = blot.rad * 0.42;
  for (let dy = -hole; dy <= hole; dy++) for (let dx = -hole; dx <= hole; dx++) {
    if (dx * dx + dy * dy <= hole * hole) put(blot.cx + dx, blot.cy + dy, 232, 180, 64);
  }

  // White 3 off (bottom tray), black 1 off (top tray) + black on the bar.
  const trayX = ix + iw - bear / 2;
  for (let i = 0; i < 3; i++) discAt(trayX, iy + ih - 22 - i * 30, 14, WHITE_H, WHITE);
  discAt(trayX, iy + 22, 14, BLACK_H, BLACK);
  discAt(ix + quad + barW / 2, iy + 22, pw * 0.36, BLACK_H, BLACK);

  function dieAt(x, y, s, n) {
    fillRound(x, y, x + s, y + s, s * 0.16, 243, 234, 216);
    const spots = {
      1: [[0, 0]],
      2: [[-0.32, -0.32], [0.32, 0.32]],
      3: [[-0.32, -0.32], [0, 0], [0.32, 0.32]],
      5: [[-0.32, -0.32], [0.32, -0.32], [0, 0], [-0.32, 0.32], [0.32, 0.32]]
    };
    const list = spots[n] || spots[1];
    const pr = s * 0.07;
    for (const [px, py] of list) {
      discAt(x + s / 2 + px * s, y + s / 2 + py * s, pr, [26, 18, 16], [26, 18, 16]);
    }
  }
  const dieS = 46;
  const dieX = ix + quad + barW + pw * 1.6;
  const dieY = iy + ih / 2 - dieS / 2;
  dieAt(dieX, dieY, dieS, 5);
  dieAt(dieX + dieS + 14, dieY, dieS, 3);

  drawText(put, 90, 670, 'WHITE 3 OFF', 3, 243, 234, 216);
  drawText(put, 860, 670, 'BLACK 1 OFF', 3, 200, 170, 140);

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
