import { deflateSync } from 'node:zlib';
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD = [22, 18, 32];
const INK = [16, 12, 24];
const Q = [20, 16, 20];
const XCOL = [40, 28, 36];
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
  const pal = [[0,0,0], CARD, INK, Q, XCOL, [255,255,255], [244,238,248]];
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
// A crown that reads at 64px Home Screen size: 5×5 in cell space.
function crown(lx, ly) {
  // lx,ly in 0..1 of the cell. Points of a queen.
  const cx = 0.5, cy = 0.52;
  const dx = lx - cx, dy = ly - cy;
  if (ly > 0.78 && ly < 0.90 && lx > 0.22 && lx < 0.78) return true; // base
  if (ly > 0.58 && ly < 0.80 && lx > 0.28 && lx < 0.72) return true; // band
  // three spikes
  const spikes = [0.30, 0.50, 0.70];
  for (const sx of spikes) {
    const px = lx - sx, py = ly - 0.34;
    if (px * px * 18 + py * py * 9 < 0.22 && ly < 0.62) return true;
  }
  if (dx * dx + dy * dy < 0.012) return true;
  return false;
}
function xMark(lx, ly) {
  const a = Math.abs(lx - ly);
  const b = Math.abs(lx - (1 - ly));
  return (a < 0.12 || b < 0.12) && lx > 0.18 && lx < 0.82 && ly > 0.18 && ly < 0.82;
}
function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const placed = Math.min(8, Math.floor((f / (FRAMES - 1)) * 8) + 1);
  const queens = [[0,3],[1,6],[2,1],[3,7],[4,4],[5,0],[6,5],[7,2]];
  const xs = [[0,0],[0,1],[1,0],[2,0],[3,1],[4,1],[5,2],[6,1],[7,0],[7,7]];
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    if (!inCard(x, y, 6, 14)) continue;
    const col0 = 18, row0 = 18, s = 11.5;
    const c = Math.floor((x - col0) / s), r = Math.floor((y - row0) / s);
    let col = CARD;
    if (c >= 0 && c < 8 && r >= 0 && r < 8) {
      const letter = REG[r].charCodeAt(c) - 65;
      col = COLS[letter] || CARD;
      const lx = (x - col0) / s - c, ly = (y - row0) / s - r;
      let isQ = false;
      for (let i = 0; i < placed; i++) {
        if (queens[i][0] === r && queens[i][1] === c) isQ = true;
      }
      if (isQ && crown(lx, ly)) col = Q;
      else if (!isQ) {
        for (const p of xs) {
          if (p[0] === r && p[1] === c && xMark(lx, ly)) col = mix(col, XCOL, 0.55);
        }
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
function fill(put, x0, y0, x1, y1, r, g, b) {
  x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
  x1 = Math.min(1200, x1 | 0); y1 = Math.min(720, y1 | 0);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, r, g, b);
}
function drawCrown(put, cx, cy, s, r, g, b) {
  // s ~ scale. A filled queen silhouette.
  fill(put, cx - 3*s, cy + 4*s, cx + 3*s, cy + 5.5*s, r, g, b);
  fill(put, cx - 2.4*s, cy + 1.5*s, cx + 2.4*s, cy + 4.2*s, r, g, b);
  const pts = [-2.2, 0, 2.2];
  for (const p of pts) {
    for (let y = -3*s; y < 2*s; y++) for (let x = -1.1*s; x < 1.1*s; x++) {
      const xx = x / s, yy = (y + 0.5*s) / s;
      if (xx * xx * 1.6 + (yy + 1.2) * (yy + 1.2) * 0.7 < 1.1) put(cx + p*s + x, cy + y, r, g, b);
    }
  }
}
function drawX(put, cx, cy, s, r, g, b) {
  for (let i = -2.2*s; i <= 2.2*s; i++) {
    for (let w = -0.45*s; w <= 0.45*s; w++) {
      put(cx + i + w, cy + i, r, g, b);
      put(cx + i + w, cy - i, r, g, b);
    }
  }
}
export function screenshotPng() {
  const W = 1200, H = 720, rgba = Buffer.alloc(W * H * 4, 0);
  const put = (x, y, r, g, b) => {
    x = x|0; y = y|0; if (x<0||y<0||x>=W||y>=H) return;
    const o = (y*W+x)*4; rgba[o]=r; rgba[o+1]=g; rgba[o+2]=b; rgba[o+3]=255;
  };
  // App chrome facsimile — mid-use of level 1, not a first-boot card.
  fill(put, 0, 0, W, H, 22, 18, 32);
  fill(put, 40, 28, 1160, 692, 34, 30, 44);
  const N = 8, S = 72, ox = 80, oy = 96;
  const queens = [[0,3],[1,6],[2,1],[3,7],[4,4],[5,0],[6,5],[7,2]];
  const xs = [[0,0],[0,1],[0,2],[0,4],[0,5],[0,7],[1,0],[1,1],[1,2],[1,3],[1,4],[1,7],[2,0],[2,2],[2,3],[2,4],[2,5],[2,7],[3,0],[3,2],[3,3],[3,4],[3,5],[3,6],[4,0],[4,1],[4,2],[4,3],[4,5],[4,6],[4,7],[5,1],[5,2],[5,3],[5,4],[5,5],[5,7],[6,0],[6,1],[6,2],[6,3],[6,4],[6,6],[6,7],[7,0],[7,1],[7,3],[7,4],[7,5],[7,6],[7,7]];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const letter = REG[r].charCodeAt(c) - 65;
    const col = COLS[letter];
    for (let y = 0; y < S-2; y++) for (let x = 0; x < S-2; x++) put(ox+c*S+x, oy+r*S+y, col[0], col[1], col[2]);
    const q = queens.find((p) => p[0]===r && p[1]===c);
    if (q) drawCrown(put, ox+c*S+S/2-1, oy+r*S+S/2-2, 5.5, 20, 16, 20);
    else if (xs.find((p) => p[0]===r && p[1]===c)) {
      drawX(put, ox+c*S+S/2, oy+r*S+S/2, 8, 40, 24, 32);
    }
  }
  // title + status, matching the play screen
  fill(put, 80, 44, 400, 76, 244, 238, 248);
  // fake "Level 1 · 8×8" bar using blocks rather than a lettered tile
  fill(put, 80, 48, 260, 72, 244, 238, 248);
  fill(put, 80, 48, 88, 72, 94, 79, 162);
  fill(put, 700, 48, 820, 72, 45, 74, 48);
  fill(put, 840, 48, 980, 72, 34, 30, 44);
  // control row
  const btns = [80, 250, 420, 590];
  for (const x of btns) fill(put, x, 690-44, x+150, 690, 34, 30, 44);
  fill(put, 590, 690-44, 740, 690, 94, 79, 162);

  const raw = Buffer.alloc((W*4+1)*H);
  for (let y = 0; y < H; y++) { raw[y*(W*4+1)] = 0; rgba.copy(raw, y*(W*4+1)+1, y*W*4, (y+1)*W*4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4); ihdr[8]=8; ihdr[9]=6;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]), pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
