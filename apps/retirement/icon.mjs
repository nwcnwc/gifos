/* The App GIF's visible animation.
 *
 * An icon that merely wiggles loses to one that DEMONSTRATES, so this one draws
 * the app's own answer: a portfolio climbing through the working years, a rule
 * where the paycheck stops, and then the fan — three futures out of the same
 * savings. Two hold. One bleeds down to the axis and stays there.
 *
 * That last line is the whole reason the app exists, and it is the only red
 * thing on the icon. At 64px on a Home Screen you cannot read a number, but you
 * can read a shape that goes up, splits, and has one branch on the floor.
 *
 * Super-sample, box-downsample, small palette, deterministic — the GIF has to
 * rebuild byte-identical or the catalog check flaps.
 */

const OUT = 128, SS = 3, RW = OUT * SS;
const DRAW = 15, HOLD = 6, FRAMES = DRAW + HOLD;

const CARD  = [22, 22, 29];
const GRID  = [38, 38, 47];
const BLUE  = [57, 135, 229];
const PALE  = [125, 180, 240];
const RED   = [208, 59, 59];
const MUTED = [120, 120, 132];

// Plot box, in 128-space.
const X0 = 17, X1 = 113, YB = 105, YT = 26;
const SPLIT = 0.52;               // where the paycheck starts

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// The working years: savings compounding, so it leaves the axis slowly and
// steepens. t in [0,1] across the accumulation half.
function accumY(t) {
  return YB - (YB - 62) * Math.pow(t, 1.9);
}
function accumPt(t) {
  return [X0 + (X1 - X0) * SPLIT * t, accumY(t)];
}
// The three futures, all leaving the same point.
const BRANCH = [
  { to: YT + 2, col: BLUE, bend: -0.35 },      // it grew
  { to: 70,     col: PALE, bend: 0.10 },       // it held
  { to: YB,     col: RED,  bend: 0.85 }        // it ran out
];
function branchPt(b, t) {
  const x0 = X0 + (X1 - X0) * SPLIT, y0 = accumY(1);
  const x = x0 + (X1 - x0) * t;
  // A quadratic bow, so the losing line sags early and flattens on the floor
  // instead of walking down in a straight diagonal.
  const lin = y0 + (b.to - y0) * t;
  const y = lin + b.bend * 26 * t * (1 - t) * 4 * (b.to > y0 ? 1 : -1);
  return [x, Math.max(YT - 2, Math.min(YB, y))];
}

function rounded(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r);
  const cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const base of [CARD, GRID, BLUE, PALE, RED, MUTED]) {
    for (let s = 0; s <= 5; s++) pal.push(mix(base, CARD, s * 0.16).map(Math.round));
    pal.push(mix(base, [255, 255, 255], 0.22).map(Math.round));
  }
  while (pal.length < 32) pal.push([0, 0, 0]);
  return pal.slice(0, 32);
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

function frame(pal, f) {
  const rgb = new Float32Array(RW * RW * 3);
  const alpha = new Float32Array(RW * RW);

  // The card.
  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
      if (!rounded(x, y, 5, 24)) continue;
      const o = py * RW + px;
      alpha[o] = 1;
      rgb[o * 3] = CARD[0]; rgb[o * 3 + 1] = CARD[1]; rgb[o * 3 + 2] = CARD[2];
    }
  }

  const put = (x, y, col, w) => {
    // Stamp a disc of radius w/2 at a 128-space point.
    const r = w * SS / 2;
    const cx = x * SS, cy = y * SS;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(RW - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(RW - 1, Math.ceil(cy + r));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = px + 0.5 - cx, dy = py + 0.5 - cy;
        if (dx * dx + dy * dy > r * r) continue;
        const o = py * RW + px;
        if (!alpha[o]) continue;             // never paint outside the card
        rgb[o * 3] = col[0]; rgb[o * 3 + 1] = col[1]; rgb[o * 3 + 2] = col[2];
      }
    }
  };
  const stroke = (pts, col, w) => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(d * SS));
      for (let k = 0; k <= n; k++) {
        put(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n, col, w);
      }
    }
  };

  // Baseline, and the rule where the paycheck starts.
  stroke([[X0 - 2, YB + 4], [X1 + 2, YB + 4]], GRID, 2);
  const sx = X0 + (X1 - X0) * SPLIT;
  const prog = Math.min(1, f / (DRAW - 1));
  if (prog > SPLIT * 0.95) {
    for (let y = YT - 2; y < YB + 4; y += 5) stroke([[sx, y], [sx, y + 2.6]], MUTED, 1.6);
  }

  // The working years.
  const aT = Math.min(1, prog / SPLIT);
  const acc = [];
  for (let k = 0; k <= 26; k++) {
    const t = aT * k / 26;
    acc.push(accumPt(t));
  }
  if (acc.length > 1) stroke(acc, BLUE, 4.4);

  // The fan.
  if (prog > SPLIT) {
    const bT = Math.min(1, (prog - SPLIT) / (1 - SPLIT));
    for (const b of BRANCH) {
      const pts = [];
      for (let k = 0; k <= 26; k++) pts.push(branchPt(b, bT * k / 26));
      stroke(pts, b.col, b.col === RED ? 4.0 : 4.4);
    }
    // A dot on the end of the losing line once it is on the floor — the beat
    // the whole animation is built around.
    if (bT > 0.94) {
      const e = branchPt(BRANCH[2], 1);
      put(e[0], e[1], RED, 7.5);
    }
  }

  // Downsample.
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx2 = 0; sx2 < SS; sx2++) {
          const o = (y * SS + sy) * RW + (x * SS + sx2);
          a += alpha[o];
          r += rgb[o * 3]; g += rgb[o * 3 + 1]; b += rgb[o * 3 + 2];
        }
      }
      const n = SS * SS;
      if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
      idx[y * OUT + x] = nearest(pal, r / a, g / a, b / a);
    }
  }
  return idx;
}

export function retirementIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frame(pal, Math.min(f, DRAW - 1)));
  const CT = 32;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0;
    flat[i * 3 + 1] = pal[i][1] | 0;
    flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return {
    width: OUT, height: OUT, palette: flat, numColors: CT,
    minCodeSize: 5, frames, delayCs: 9, transparentIndex: 0
  };
}
