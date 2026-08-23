// Procedural icon for Drawnix: a dark rounded card holding a small infinite
// canvas — a mind-map node, a flowchart box, and a freehand stroke that is
// drawn across the frames. Same super-sample → box-downsample → small-palette
// pipeline as the other app icons. Deterministic, so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [22, 26, 40];
const CARD_B = [12, 14, 24];
const PAPER = [236, 232, 222];
const INK = [36, 40, 54];
const BLUE = [70, 120, 230];
const BLUE_H = [160, 190, 255];
const CORAL = [232, 110, 72];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, PAPER, INK, BLUE, BLUE_H, CORAL]) {
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
function inCircle(x, y, cx, cy, r) { return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r; }
function distToSeg(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  if (l2 < 1e-6) return Math.hypot(x - x1, y - y1);
  let t = ((x - x1) * dx + (y - y1) * dy) / l2; t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
}

// Catmull-Rom freehand that grows with `drawn` in 0..1.
function strokePts() {
  const cps = [[28, 92], [40, 78], [58, 86], [74, 70], [90, 78], [102, 64]];
  const pts = [];
  const P = [cps[0], ...cps, cps[cps.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    for (let s = 0; s < 8; s++) {
      const t = s / 8, t2 = t * t, t3 = t2 * t;
      pts.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  pts.push(cps[cps.length - 1]);
  return pts;
}
const STROKE = strokePts();

function nearStroke(x, y, drawn, width) {
  const n = Math.max(2, Math.floor(STROKE.length * drawn));
  let best = 1e9;
  for (let i = 1; i < n; i++) {
    const d = distToSeg(x, y, STROKE[i - 1][0], STROKE[i - 1][1], STROKE[i][0], STROKE[i][1]);
    if (d < best) best = d;
  }
  return best <= width;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const p = f / FRAMES;
  const drawn = 0.12 + 0.88 * (0.5 - 0.5 * Math.cos(p * Math.PI * 2)); // draw, then fade back
  const pulse = 0.5 + 0.5 * Math.sin(p * Math.PI * 2);
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      // paper inset
      if (inRoundRect(x, y, 22, 24, 84, 80, 10)) {
        col = mix(PAPER, [255, 255, 255], 0.08);
        // faint rule lines
        if (Math.abs(((y - 30) % 9) - 0.4) < 0.35 && y > 32 && y < 98 && x > 26 && x < 102) {
          col = mix(col, INK, 0.07);
        }
        // mind-map hub
        if (inCircle(x, y, 64, 48, 9 + pulse * 0.8)) col = mix(BLUE, BLUE_H, pulse * 0.45);
        else if (inCircle(x, y, 64, 48, 11)) col = mix(BLUE, PAPER, 0.35);
        // three child nodes
        const kids = [[42, 36], [86, 38], [74, 62]];
        for (const [kx, ky] of kids) {
          const onLine = distToSeg(x, y, 64, 48, kx, ky) < 0.9;
          if (onLine) col = mix(BLUE, INK, 0.25);
          if (inCircle(x, y, kx, ky, 5.2)) col = mix(BLUE_H, PAPER, 0.15);
        }
        // flowchart box, lower left
        if (inRoundRect(x, y, 28, 72, 22, 14, 2.5)) col = mix(INK, BLUE, 0.18);
        if (inRoundRect(x, y, 30, 74, 18, 10, 1.8)) col = mix(PAPER, BLUE_H, 0.12);
        // arrow to a second box
        if (y > 78 && y < 80.4 && x > 50 && x < 62) col = INK;
        if (inRoundRect(x, y, 62, 72, 18, 14, 2.5)) col = mix(INK, CORAL, 0.2);
        if (inRoundRect(x, y, 64, 74, 14, 10, 1.8)) col = mix(PAPER, CORAL, 0.12);
        // freehand stroke on top
        if (nearStroke(x, y, drawn, 1.7)) col = CORAL;
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

export function drawnixIcon() {
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
