// Procedural OTP Auth sticker: a dark card, a cyan ring that empties, six
// digits that flip when it hits zero. Super-sample → box-downsample.
// Also the 1200×720 store cover: a list of accounts mid-tick.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [21, 25, 34];
const CARD_B = [11, 13, 18];
const INK = [238, 242, 247];
const MUTED = [139, 147, 167];
const ACCENT = [64, 210, 180];
const WARN = [240, 180, 41];
const DANGER = [224, 87, 74];
const DIGIT = [232, 255, 248];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, INK, MUTED, ACCENT, WARN, DANGER, DIGIT, [8, 17, 14]]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
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

const D5 = {
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  3: [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  5: [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  6: [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  7: [0b11111, 0b00001, 0b00010, 0b00100, 0b00100, 0b00100, 0b00100],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
};

function digitHit(ch, u, v) {
  const g = D5[ch];
  if (!g) return false;
  const c = u | 0, r = v | 0;
  if (c < 0 || c > 4 || r < 0 || r > 6) return false;
  return !!(g[r] & (1 << (4 - c)));
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const t = f / (FRAMES - 1);
  const flip = f >= 8;
  const frac = flip ? 1 : 1 - f / 8;
  const ringCol = !flip && frac < 0.18 ? DANGER : !flip && frac < 0.35 ? WARN : ACCENT;
  const code = flip ? '193046' : '482917';
  const cx = 64, cy = 58, R = 38, RWIR = 5.2;

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 22)) continue;
      let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      const dx = x - cx, dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d > R - RWIR - 1.6 && d < R + 1.2) {
        let ang = Math.atan2(dy, dx) + Math.PI / 2;
        if (ang < 0) ang += Math.PI * 2;
        const along = ang / (Math.PI * 2);
        const on = along <= frac;
        const inner = Math.abs(d - R);
        if (on) col = inner < 2.1 ? ringCol : mix(ringCol, CARD_A, 0.35);
        else if (inner < 2.4) col = mix(CARD_A, MUTED, 0.22);
      }
      // 6 digits, grouped 3-3, under the ring
      const scale = 2.05;
      const gw = 6 * scale, gh = 7 * scale, gap = 2.2 * scale;
      const groupGap = 5.5;
      const total = 6 * gw + 4 * gap + groupGap;
      let ox = cx - total / 2, oy = 96;
      const codeY = y >= oy && y < oy + gh;
      if (codeY) {
        for (let i = 0; i < 6; i++) {
          if (i === 3) ox += groupGap;
          const u = (x - ox) / scale, v = (y - oy) / scale;
          if (digitHit(code[i], u, v)) col = flip ? mix(DIGIT, ACCENT, 0.25) : DIGIT;
          ox += gw + gap;
        }
      }
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

export function otpauthIcon() {
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
    minCodeSize: 6, frames, delayCs: 12, transparentIndex: 0
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

const GLYPHS = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b10101, 0b01010],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0, 0b00100],
  '@': [0b01110, 0b10001, 0b10101, 0b10111, 0b10100, 0b10001, 0b01110],
  ':': [0, 0b00100, 0, 0, 0b00100, 0, 0],
  '+': [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  '-': [0, 0, 0, 0b11111, 0, 0, 0],
  '*': [0, 0b00100, 0b10101, 0b01110, 0b10101, 0b00100, 0],
  '/': [0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b10000, 0],
  0: D5[0], 1: D5[1], 2: D5[2], 3: D5[3], 4: D5[4],
  5: D5[5], 6: D5[6], 7: D5[7], 8: D5[8], 9: D5[9],
};

function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
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
function fillRect(put, x, y, w, h, r, g, b) {
  const x1 = Math.round(x), y1 = Math.round(y);
  const x2 = Math.round(x + w), y2 = Math.round(y + h);
  for (let yy = y1; yy < y2; yy++) for (let xx = x1; xx < x2; xx++) put(xx, yy, r, g, b);
}
function fillRound(put, x, y, w, h, rad, r, g, b) {
  const x2 = x + w, y2 = y + h;
  for (let yy = y | 0; yy < y2; yy++) {
    for (let xx = x | 0; xx < x2; xx++) {
      const cx = Math.min(Math.max(xx, x + rad), x2 - rad);
      const cy = Math.min(Math.max(yy, y + rad), y2 - rad);
      const inside = (xx >= x + rad && xx < x2 - rad) || (yy >= y + rad && yy < y2 - rad)
        || ((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) <= rad * rad);
      if (inside) put(xx, yy, r, g, b);
    }
  }
}
function fillCircle(put, cx, cy, rad, r, g, b) {
  const r2 = rad * rad;
  for (let yy = Math.floor(cy - rad); yy <= cy + rad; yy++) {
    for (let xx = Math.floor(cx - rad); xx <= cx + rad; xx++) {
      if ((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) <= r2) put(xx, yy, r, g, b);
    }
  }
}
function ring(put, cx, cy, rad, w, frac, r, g, b, tr, tg, tb) {
  const outer = rad + w / 2, inner = rad - w / 2;
  const o2 = outer * outer, i2 = inner * inner;
  for (let yy = Math.floor(cy - outer - 1); yy <= cy + outer + 1; yy++) {
    for (let xx = Math.floor(cx - outer - 1); xx <= cx + outer + 1; xx++) {
      const dx = xx - cx, dy = yy - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > o2 || d2 < i2) continue;
      let ang = Math.atan2(dy, dx) + Math.PI / 2;
      if (ang < 0) ang += Math.PI * 2;
      const on = ang / (Math.PI * 2) <= frac;
      if (on) put(xx, yy, r, g, b);
      else put(xx, yy, tr, tg, tb);
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
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 11, 13, 18);

  drawText(put, 72, 48, 'OTP AUTH', 4, 238, 242, 247);
  drawText(put, 72, 90, 'CODES STAY IN THIS FILE', 2, 139, 147, 167);
  fillRound(put, 980, 44, 140, 52, 14, 64, 210, 180);
  drawText(put, 1018, 58, 'ADD', 3, 6, 36, 29);

  fillRound(put, 72, 128, 1056, 56, 12, 16, 20, 28);
  drawText(put, 96, 146, 'SEARCH ACCOUNTS', 2, 90, 98, 114);

  const rows = [
    { issuer: 'GITHUB', acct: 'ALICE@WORK.COM', code: '482 917', next: 'NEXT 193 046', frac: 0.62, tint: [64, 210, 180], letter: 'G', copied: true, star: false },
    { issuer: 'GOOGLE', acct: 'ME', code: '193 046', next: 'NEXT 882 104', frac: 0.12, tint: [240, 180, 41], letter: 'G', copied: false, star: false, warn: true },
    { issuer: 'AMAZON', acct: 'ROOT', code: '882 104', next: 'NEXT 041 773', frac: 0.62, tint: [110, 168, 254], letter: 'A', copied: false, star: false },
    { issuer: 'PROTON MAIL', acct: 'MAIL', code: '041 773', next: 'NEXT 482 917', frac: 0.62, tint: [232, 141, 255], letter: 'P', copied: false, star: true },
  ];
  rows.forEach((row, i) => {
    const y = 208 + i * 120;
    fillRound(put, 72, y, 1056, 108, 18, 21, 25, 34);
    fillRect(put, 72, y + 8, 8, 92, row.tint[0], row.tint[1], row.tint[2]);
    fillCircle(put, 140, y + 54, 28, row.tint[0], row.tint[1], row.tint[2]);
    drawText(put, 132, y + 42, row.letter, 3, 8, 17, 14);
    drawText(put, 188, y + 18, row.issuer, 3, 238, 242, 247);
    drawText(put, 188, y + 48, row.acct, 2, 139, 147, 167);
    const codeCol = row.warn ? [240, 180, 41] : [232, 255, 248];
    drawText(put, 188, y + 74, row.code, 3, codeCol[0], codeCol[1], codeCol[2]);
    drawText(put, 430, y + 82, row.next, 2, 139, 147, 167);
    const ringCol = row.warn ? [240, 180, 41] : [64, 210, 180];
    ring(put, 1028, y + 54, 26, 6, row.frac, ringCol[0], ringCol[1], ringCol[2], 42, 49, 66);
    const secs = String(Math.max(1, Math.round(row.frac * 30)));
    drawText(put, secs.length === 1 ? 1020 : 1012, y + 46, secs, 2, 139, 147, 167);
    drawText(put, 1088, y + 40, '...', 3, 139, 147, 167);
    if (row.star) drawText(put, 960, y + 16, '*', 3, 240, 180, 41);
    if (row.copied) {
      fillRound(put, 900, y + 14, 110, 28, 12, 64, 210, 180);
      drawText(put, 914, y + 20, 'COPIED', 2, 6, 36, 29);
    }
  });

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
