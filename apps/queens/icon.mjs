import { deflateSync } from 'node:zlib';
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD = [22, 18, 32];
const INK = [16, 12, 24];
const Q = [20, 16, 20];
const COLS = [
  [94, 79, 162], [50, 135, 189], [213, 62, 79], [172, 221, 165],
  [253, 174, 97], [101, 194, 165], [245, 109, 67], [108, 122, 137],
];
function mix(a, b, t) { return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}
function buildPalette() {
  const pal = [[0,0,0], CARD, INK, Q, [255,255,255]];
  for (const b of COLS) { pal.push(b); pal.push(mix(b,[255,255,255],0.25).map(Math.round)); pal.push(mix(b,[0,0,0],0.3).map(Math.round)); }
  return pal.slice(0, 64);
}
function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e9;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i], d = (p[0]-r)**2 + (p[1]-g)**2 + (p[2]-b)**2;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}
const REG = [
  'AAAABBCC','AAAABBCC','AADDBBCC','AADDEECC','FFDDEECC','FFGGEEHH','FFGGEEHH','FFGGHHHH'
];
function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const placed = Math.min(8, Math.floor((f / (FRAMES - 1)) * 8) + 1);
  const queens = [[0,3],[1,6],[2,1],[3,7],[4,4],[5,0],[6,5],[7,2]];
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    if (!inCard(x, y, 6, 14)) continue;
    const col0 = 18, row0 = 18, s = 11.5;
    const c = Math.floor((x - col0) / s), r = Math.floor((y - row0) / s);
    let col = CARD;
    if (c >= 0 && c < 8 && r >= 0 && r < 8) {
      const letter = REG[r].charCodeAt(c) - 65;
      col = COLS[letter] || CARD;
      for (let i = 0; i < placed; i++) {
        if (queens[i][0] === r && queens[i][1] === c) col = mix(col, Q, 0.55);
      }
    }
    const o = (py * RW + px) * 4;
    rgba[o] = col[0]; rgba[o+1] = col[1]; rgba[o+2] = col[2]; rgba[o+3] = 1;
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o+1]; b += rgba[o+2]; a += rgba[o+3];
    }
    idx[y * OUT + x] = a / n < 0.5 ? 0 : nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}
export function queensIcon() {
  const pal = buildPalette(), frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64, flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i*3] = pal[i][0]|0; flat[i*3+1] = pal[i][1]|0; flat[i*3+2] = pal[i][2]|0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 10, transparentIndex: 0 };
}
function crc(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (~c) >>> 0;
}
function pngChunk(tag, data) {
  const t = Buffer.from(tag), len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([t, data]), c = Buffer.alloc(4); c.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, c]);
}
const GLYPHS = {
  A:[14,17,17,31,17,17,17],C:[14,17,16,16,16,17,14],E:[31,16,16,30,16,16,31],
  G:[14,17,16,23,17,17,14],H:[17,17,17,31,17,17,17],I:[31,4,4,4,4,4,31],
  L:[16,16,16,16,16,16,31],N:[17,25,21,19,17,17,17],O:[14,17,17,17,17,17,14],
  Q:[14,17,17,17,21,18,13],S:[15,16,16,14,1,1,30],T:[31,4,4,4,4,4,4],
  U:[17,17,17,17,17,17,14],V:[17,17,17,17,17,10,4],' ':[0,0,0,0,0,0,0],
};
function drawText(put, x, y, str, s, r, g, b) {
  let cx = x;
  for (const ch of str.toUpperCase()) {
    const gph = GLYPHS[ch]; if (!gph) { cx += 6*s; continue; }
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (gph[row] & (1 << (4 - col))) {
        for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) put(cx + col*s + dx, y + row*s + dy, r, g, b);
      }
    }
    cx += 6 * s;
  }
}
export function screenshotPng() {
  const W = 1200, H = 720, rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b) => {
    x = x|0; y = y|0; if (x<0||y<0||x>=W||y>=H) return;
    const o = (y*W+x)*4; rgba[o]=r; rgba[o+1]=g; rgba[o+2]=b; rgba[o+3]=255;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) put(x, y, 22, 18, 32);
  const N = 8, S = 64, ox = 80, oy = 80;
  const queens = [[0,3],[1,6],[2,1],[3,7],[4,4],[5,0],[6,5],[7,2]];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const letter = REG[r].charCodeAt(c) - 65;
    const col = COLS[letter];
    for (let y = 0; y < S-2; y++) for (let x = 0; x < S-2; x++) put(ox+c*S+x, oy+r*S+y, col[0], col[1], col[2]);
    const q = queens.find((p) => p[0]===r && p[1]===c);
    if (q) drawText(put, ox+c*S+18, oy+r*S+16, 'Q', 5, 20, 16, 20);
  }
  drawText(put, 640, 120, 'QUEENS', 10, 244, 238, 248);
  drawText(put, 640, 240, 'ONE PER COLOUR', 4, 180, 168, 196);
  drawText(put, 640, 320, 'NO SERVER', 4, 180, 168, 196);
  drawText(put, 640, 400, 'THE FILE IS THE SAVE', 3, 180, 168, 196);
  const raw = Buffer.alloc((W*4+1)*H);
  for (let y = 0; y < H; y++) { raw[y*(W*4+1)] = 0; rgba.copy(raw, y*(W*4+1)+1, y*W*4, (y+1)*W*4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4); ihdr[8]=8; ihdr[9]=6;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]), pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
