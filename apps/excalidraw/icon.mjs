// Procedural icon for Excalidraw: a purple card holding a dark dotted canvas
// with a hand-drawn orange box and arrow that draw themselves across the
// frames. Same super-sample → box-downsample → small-palette pipeline as the
// other app icons; deterministic, so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [48, 44, 96];
const CARD_B = [24, 22, 52];
const PAPER = [22, 22, 30];
const DOT = [56, 56, 72];
const INK = [236, 232, 214];
const ORANGE = [232, 148, 64];
const ORANGE_H = [255, 196, 110];
const PURPLE = [105, 101, 219];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, PAPER, DOT, INK, ORANGE, ORANGE_H, PURPLE]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
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
function inRoundRect(x, y, x0, y0, w, h, r) {
  if (x < x0 || x > x0 + w || y < y0 || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  if (x >= x0 + r && x <= x0 + w - r) return true;
  if (y >= y0 + r && y <= y0 + h - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}
function distToSeg(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  if (l2 < 1e-6) return Math.hypot(x - x1, y - y1);
  let t = ((x - x1) * dx + (y - y1) * dy) / l2; t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}
function wobbleRect(x, y, x0, y0, w, h, t) {
  // A slightly irregular rounded rect stroke — "hand-drawn".
  const pad = 1.6;
  const onOuter = inRoundRect(x, y, x0 - pad, y0 - pad, w + pad * 2, h + pad * 2, 5);
  const onInner = inRoundRect(x, y, x0 + pad, y0 + pad, w - pad * 2, h - pad * 2, 3.4);
  if (!onOuter || onInner) return false;
  const n = Math.sin((x + y) * 0.55 + t * 4) * 0.35;
  return Math.abs(n) < 1.2;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const p = f / FRAMES;
  const drawn = 0.18 + 0.82 * (0.5 - 0.5 * Math.cos(p * Math.PI * 2));
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      if (inRoundRect(x, y, 20, 22, 88, 84, 10)) {
        col = PAPER.slice();
        if (((x | 0) % 7 === 0) && ((y | 0) % 7 === 0) && x > 24 && x < 104 && y > 26 && y < 102) {
          col = DOT.slice();
        }
        // box, left
        if (drawn > 0.12 && wobbleRect(x, y, 28, 40, 28, 40, p)) col = mix(ORANGE, ORANGE_H, 0.35);
        // arrow shaft
        const shaft = drawn > 0.45 && distToSeg(x, y, 60, 60, 78, 60) < 1.35 && x >= 60 && x <= 60 + 18 * Math.min(1, (drawn - 0.45) / 0.3);
        if (shaft) col = mix(ORANGE, INK, 0.15);
        // arrow head
        if (drawn > 0.72) {
          const head = distToSeg(x, y, 78, 60, 72, 55) < 1.2 || distToSeg(x, y, 78, 60, 72, 65) < 1.2;
          if (head) col = ORANGE_H.slice();
        }
        // second box, right
        if (drawn > 0.78 && wobbleRect(x, y, 80, 48, 22, 24, p + 0.4)) col = mix(ORANGE, PURPLE, 0.25);
      }
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
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

export function excalidrawIcon() {
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
