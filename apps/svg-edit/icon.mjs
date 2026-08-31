// Procedural icon for SVG-Edit: a dark card holding a white artboard where a
// vector pen draws a star, then a circle. Reads at 64px. Super-sample →
// box-downsample → small palette. Deterministic so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [28, 28, 40];
const CARD_B = [14, 14, 22];
const PAPER = [246, 246, 242];
const INK = [28, 30, 40];
const ORANGE = [249, 188, 1];
const ORANGE_D = [200, 120, 20];
const TEAL = [40, 140, 150];
const RED = [220, 64, 56];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, PAPER, INK, ORANGE, ORANGE_D, TEAL, RED]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
  }
  return pal;
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
function inRoundRect(x, y, x0, y0, w, h, r) {
  if (x < x0 || x > x0 + w || y < y0 || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  if (x >= x0 + r && x <= x0 + w - r) return true;
  if (y >= y0 + r && y <= y0 + h - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function distSeg(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
  if (l2 < 1e-8) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / l2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}
function starPts(cx, cy, rOuter, rInner, n, rot) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + i * Math.PI / n - Math.PI / 2;
    const r = i % 2 === 0 ? rOuter : rInner;
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return pts;
}
function distPoly(px, py, pts, closed) {
  let best = 1e9;
  const n = pts.length / 2;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % n;
    const d = distSeg(px, py, pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1]);
    if (d < best) best = d;
  }
  return best;
}
function inPoly(px, py, pts) {
  let inside = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2], yi = pts[i * 2 + 1], xj = pts[j * 2], yj = pts[j * 2 + 1];
    const hit = ((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-8) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const p = f / FRAMES;
  const drawT = Math.min(1, p / 0.55);
  const fillT = Math.max(0, (p - 0.45) / 0.55);
  const star = starPts(58, 58, 22, 9, 5, p * 0.08);
  const nStar = Math.max(2, Math.floor(star.length / 2 * drawT) * 2);
  const drawnStar = star.slice(0, nStar);
  const circR = 16 * fillT;
  const penX = nStar >= 2 ? drawnStar[nStar - 2] : 58;
  const penY = nStar >= 2 ? drawnStar[nStar - 1] : 36;
  const penTipX = fillT > 0.15 ? 92 + fillT * 4 : penX;
  const penTipY = fillT > 0.15 ? 92 - fillT * 6 : penY;

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 7, 22)) continue;
      let col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 7) / (OUT - 14))));
      if (inRoundRect(x, y, 22, 22, 84, 84, 8)) {
        col = PAPER;
        if (fillT > 0.2 && (x - 92) * (x - 92) + (y - 88) * (y - 88) <= circR * circR) {
          col = mix(TEAL, PAPER, 0.12);
        }
        const ds = distPoly(x, y, drawnStar, drawT >= 0.98);
        if (drawT >= 0.98 && inPoly(x, y, star)) col = mix(ORANGE, PAPER, 0.08);
        if (ds < 1.35) col = ds < 0.65 ? ORANGE_D : mix(ORANGE, INK, 0.2);
      }
      // pen body
      const dx = x - penTipX, dy = y - penTipY;
      const along = dx * 0.6 + dy * 0.8;
      const across = -dx * 0.8 + dy * 0.6;
      if (along > 0 && along < 18 && Math.abs(across) < 2.2 - along * 0.04) {
        col = along < 4 ? INK : mix(ORANGE, ORANGE_D, 0.4);
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

export function svgEditIcon() {
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
    minCodeSize: 6, frames, delayCs: 10, transparentIndex: 0
  };
}
