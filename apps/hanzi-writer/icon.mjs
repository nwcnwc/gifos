// Procedural icon: 永 written stroke by stroke. Cover: 好 mid-trace.
import { deflateSync } from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 16;
const CARD_A = [22, 16, 18], CARD_B = [10, 8, 12];
const INK = [244, 241, 234], INK_D = [210, 186, 176];
const RED = [196, 74, 58], RED_H = [224, 122, 95];
const GOLD = [244, 201, 93], OK = [61, 204, 138];

const YONG = [
  [[428,824],[503,781],[533,756],[539,741]],
  [[309,579],[358,580],[462,613],[482,608],[508,581],[505,121],[500,59],[478,24],[355,78]],
  [[110,391],[149,384],[198,387],[322,418],[339,417],[367,402],[345,333],[273,208],[201,129],[125,78]],
  [[725,621],[743,596],[749,578],[743,570],[656,489],[569,421],[569,415]],
  [[532,441],[551,399],[568,378],[678,259],[750,194],[801,163],[954,145]]
];
const HAO = [
  [[282,788],[307,769],[327,733],[264,465],[216,321],[235,298],[386,194],[411,166],[424,133]],
  [[390,556],[417,530],[424,516],[422,504],[387,361],[338,255],[304,207],[260,165],[206,127],[137,97]],
  [[59,457],[107,434],[373,491],[380,501]],
  [[493,656],[517,646],[550,644],[680,692],[706,699],[743,696],[771,669],[765,657],[677,546],[674,535],[663,536]],
  [[613,530],[637,519],[659,499],[674,474],[687,432],[711,289],[709,166],[692,92],[672,59],[648,41],[551,85]],
  [[449,384],[504,377],[860,427],[906,426],[960,412]]
];

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
function hanzi(x, y, box) {
  return [box.x + (x / 1024) * box.s, box.y + (1 - y / 900) * box.s];
}
function seglen(a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
function strokeLen(st) {
  let n = 0;
  for (let i = 1; i < st.length; i++) n += seglen(st[i - 1], st[i]);
  return n || 1;
}
function along(st, t) {
  const L = strokeLen(st);
  let left = t * L;
  for (let i = 1; i < st.length; i++) {
    const d = seglen(st[i - 1], st[i]);
    if (left <= d) {
      const u = d ? left / d : 1;
      return [st[i - 1][0] + (st[i][0] - st[i - 1][0]) * u, st[i - 1][1] + (st[i][1] - st[i - 1][1]) * u];
    }
    left -= d;
  }
  return st[st.length - 1];
}
function prefix(st, t) {
  if (t >= 1) return st.slice();
  if (t <= 0) return [st[0]];
  const L = strokeLen(st);
  let left = t * L, out = [st[0]];
  for (let i = 1; i < st.length; i++) {
    const d = seglen(st[i - 1], st[i]);
    if (left <= d) {
      const u = d ? left / d : 1;
      out.push([st[i - 1][0] + (st[i][0] - st[i - 1][0]) * u, st[i - 1][1] + (st[i][1] - st[i - 1][1]) * u]);
      return out;
    }
    out.push(st[i]);
    left -= d;
  }
  return out;
}
function distSeg(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
  if (l2 < 1e-8) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / l2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}
function distPoly(px, py, pts) {
  let best = 1e9;
  for (let i = 1; i < pts.length; i++) {
    const d = distSeg(px, py, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    if (d < best) best = d;
  }
  return best;
}
function mapped(st, box) { return st.map(p => hanzi(p[0], p[1], box)); }
function progress(f) {
  const lens = YONG.map(strokeLen);
  const total = lens.reduce((a, b) => a + b, 0);
  const t = Math.min(1, f / (FRAMES - 3));
  let left = t * total, done = [];
  for (let i = 0; i < YONG.length; i++) {
    if (left >= lens[i]) { done.push({ i, t: 1 }); left -= lens[i]; }
    else { if (left > 0) done.push({ i, t: left / lens[i] }); break; }
  }
  return done;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, INK, INK_D, RED, RED_H, GOLD, OK]) {
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
  const box = { x: 18, y: 16, s: 92 };
  const done = progress(f);
  const flash = f >= FRAMES - 2 ? (f - (FRAMES - 3)) / 2 : 0;
  const strokes = done.map(d => mapped(prefix(YONG[d.i], d.t), box));
  let tip = null;
  if (done.length) {
    const last = done[done.length - 1];
    tip = hanzi(...along(YONG[last.i], last.t), box);
  }
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    if (!inCard(x, y, 6, 20)) continue;
    let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
    if (flash > 0) col = mix(col, RED, flash * 0.25);
    const gx = x - 64, gy = y - 64;
    if (Math.abs(gx) < 0.6 || Math.abs(gy) < 0.6 || Math.abs(gx - gy) < 0.7 || Math.abs(gx + gy) < 0.7) {
      if (Math.max(Math.abs(gx), Math.abs(gy)) < 46) col = mix(col, [46, 42, 56], 0.55);
    }
    let ds = 99;
    for (let i = 0; i < strokes.length; i++) {
      const d = distPoly(x, y, strokes[i]);
      if (d < ds) ds = d;
    }
    if (ds < 2.1) col = ds < 1.05 ? INK : mix(INK, RED_H, 0.35);
    if (tip) {
      const dt = Math.hypot(x - tip[0], y - tip[1]);
      if (dt < 3.4) col = dt < 1.6 ? GOLD : mix(GOLD, RED, 0.4);
    }
    const o = (py * RW + px) * 4;
    rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
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

export function hanziWriterIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64, flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 11, transparentIndex: 0 };
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
  A:[0b01110,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001],
  C:[0b01110,0b10001,0b10000,0b10000,0b10000,0b10001,0b01110],
  D:[0b11110,0b10001,0b10001,0b10001,0b10001,0b10001,0b11110],
  E:[0b11111,0b10000,0b10000,0b11110,0b10000,0b10000,0b11111],
  G:[0b01110,0b10001,0b10000,0b10111,0b10001,0b10001,0b01110],
  H:[0b10001,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001],
  I:[0b11111,0b00100,0b00100,0b00100,0b00100,0b00100,0b11111],
  K:[0b10001,0b10010,0b10100,0b11000,0b10100,0b10010,0b10001],
  L:[0b10000,0b10000,0b10000,0b10000,0b10000,0b10000,0b11111],
  M:[0b10001,0b11011,0b10101,0b10101,0b10001,0b10001,0b10001],
  N:[0b10001,0b11001,0b10101,0b10011,0b10001,0b10001,0b10001],
  O:[0b01110,0b10001,0b10001,0b10001,0b10001,0b10001,0b01110],
  R:[0b11110,0b10001,0b10001,0b11110,0b10100,0b10010,0b10001],
  S:[0b01111,0b10000,0b10000,0b01110,0b00001,0b00001,0b11110],
  T:[0b11111,0b00100,0b00100,0b00100,0b00100,0b00100,0b00100],
  U:[0b10001,0b10001,0b10001,0b10001,0b10001,0b10001,0b01110],
  W:[0b10001,0b10001,0b10001,0b10101,0b10101,0b10101,0b01010],
  Y:[0b10001,0b10001,0b01010,0b00100,0b00100,0b00100,0b00100],
  Z:[0b11111,0b00001,0b00010,0b00100,0b01000,0b10000,0b11111],
  ' ': [0,0,0,0,0,0,0],
  '/': [0b00001,0b00010,0b00100,0b00100,0b01000,0b10000,0b10000],
  '0':[0b01110,0b10001,0b10011,0b10101,0b11001,0b10001,0b01110],
  '1':[0b00100,0b01100,0b00100,0b00100,0b00100,0b00100,0b01110],
  '2':[0b01110,0b10001,0b00001,0b00110,0b01000,0b10000,0b11111],
  '3':[0b11110,0b00001,0b00001,0b01110,0b00001,0b00001,0b11110],
  '5':[0b11111,0b10000,0b11110,0b00001,0b00001,0b10001,0b01110],
  '4':[0b00010,0b00110,0b01010,0b10010,0b11111,0b00010,0b00010],
  '6':[0b01110,0b10000,0b10000,0b11110,0b10001,0b10001,0b01110],
  '7':[0b11111,0b00001,0b00010,0b00100,0b01000,0b01000,0b01000],
  '8':[0b01110,0b10001,0b10001,0b01110,0b10001,0b10001,0b01110],
};
function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch];
    if (!gph) { cx += 6 * s; continue; }
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (gph[row] & (1 << (4 - col))) {
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(cx + col * s + dx, y + row * s + dy, r, g, b);
      }
    }
    cx += 6 * s;
  }
}
function strokeLine(put, x0, y0, x1, y1, w, r, g, b) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1, steps = Math.ceil(len);
  for (let i = 0; i <= steps; i++) {
    const x = x0 + dx * (i / steps), y = y0 + dy * (i / steps), rad = w;
    const xA = Math.floor(x - rad), xB = Math.ceil(x + rad), yA = Math.floor(y - rad), yB = Math.ceil(y + rad);
    for (let yy = yA; yy <= yB; yy++) for (let xx = xA; xx <= xB; xx++) {
      if ((xx - x) * (xx - x) + (yy - y) * (yy - y) <= rad * rad) put(xx, yy, r, g, b);
    }
  }
}
function strokePoly(put, pts, w, r, g, b) {
  for (let i = 1; i < pts.length; i++) strokeLine(put, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], w, r, g, b);
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
  fill(0, 0, W, H, 10, 10, 15);
  drawText(put, 48, 32, 'HANZI WRITER', 6, 244, 241, 234);
  drawText(put, 48, 92, 'HSK 1', 3, 154, 150, 168);
  rr(48, 140, 260, 200, 22, 22, 22, 31);
  rr(276, 140, 500, 200, 22, 22, 22, 31);
  drawText(put, 70, 158, 'YOU  7', 4, 61, 204, 138);
  drawText(put, 298, 158, 'SAM  4', 4, 244, 241, 234);
  drawText(put, 540, 158, 'HAO   GOOD', 4, 224, 122, 95);

  const box = { x: 80, y: 220, s: 460 };
  rr(box.x - 16, box.y - 16, box.x + box.s + 16, box.y + box.s + 16, 28, 22, 22, 31);
  const midX = box.x + box.s / 2, midY = box.y + box.s / 2;
  strokeLine(put, box.x, midY, box.x + box.s, midY, 1.2, 46, 42, 56);
  strokeLine(put, midX, box.y, midX, box.y + box.s, 1.2, 46, 42, 56);
  strokeLine(put, box.x, box.y, box.x + box.s, box.y + box.s, 1.2, 46, 42, 56);
  strokeLine(put, box.x + box.s, box.y, box.x, box.y + box.s, 1.2, 46, 42, 56);
  const doneN = 4;
  for (let i = 0; i < doneN; i++) {
    const pts = mapped(HAO[i], box);
    strokePoly(put, pts, 4.2, 244, 241, 234);
  }
  const live = mapped(prefix(HAO[4], 0.62), box);
  strokePoly(put, live, 4.6, 244, 201, 93);
  const tip = live[live.length - 1];
  for (let yy = -5; yy <= 5; yy++) for (let xx = -5; xx <= 5; xx++) {
    if (xx * xx + yy * yy <= 16) put(tip[0] + xx, tip[1] + yy, 244, 201, 93);
  }

  rr(620, 240, 1148, 360, 22, 20, 51, 38);
  drawText(put, 648, 278, 'STROKE  5 / 6', 4, 61, 204, 138);
  rr(620, 384, 1148, 504, 22, 30, 30, 42);
  drawText(put, 648, 422, '7 / 178  CLEAN', 4, 244, 241, 234);
  rr(620, 528, 860, 640, 18, 58, 21, 32);
  drawText(put, 648, 564, 'WATCH', 3, 244, 241, 234);
  rr(884, 528, 1148, 640, 18, 58, 21, 32);
  drawText(put, 920, 564, 'RETRY', 3, 244, 241, 234);
  drawText(put, 48, 690, 'SAME CHARACTER', 3, 154, 150, 168);

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
