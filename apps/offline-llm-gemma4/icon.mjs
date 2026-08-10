// Procedural icon for Offline Cheap Text LLM Gemma 4: a dark rounded card with
// a four-pointed spark (a "4" you can read at 32px as a shape, not a glyph)
// whose arms pulse in sequence, ringed by a thin orbit that ticks round.
// THIRD distinct silhouette in the cheapest-LLM family — BitNet is a 4x4
// ternary grid, Gemma 3 is a faceted gem, this is a radiant star — so three
// providers sitting in the Providers folder are told apart at icon size.
// Pure Node, same super-sample -> box-downsample -> small-palette pipeline as
// the other app icons. Deterministic (no RNG), so builds reproduce byte-for-byte.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 8;

const CARD_A = [26, 20, 44];
const CARD_B = [13, 10, 26];
const VIOLET = [167, 139, 250];
const DIM_ = [86, 66, 150];
const PALE = [226, 214, 255];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

function buildPalette() {
  const pal = [[0, 0, 0]];
  const bases = [CARD_A, CARD_B, VIOLET, DIM_, PALE];
  for (const b of bases) for (let s = 0; s <= 5; s++) pal.push(mix(b, [255, 255, 255], s * 0.08).map(Math.round));
  return pal;
}
function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e9;
  for (let i = 1; i < pal.length; i++) { const p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b, d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; bi = i; } }
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

// Four-pointed spark: a superellipse-ish star. |x|^k + |y|^k = r^k with k < 1
// pinches the waist and throws four sharp arms along the axes.
const CX = 64, CY = 64, ARM = 40, K = 0.55;
function starField(x, y) {
  const dx = Math.abs(x - CX) / ARM, dy = Math.abs(y - CY) / ARM;
  return Math.pow(dx, K) + Math.pow(dy, K); // <= 1 is inside
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const litArm = f % 4;                  // 0 = up, 1 = right, 2 = down, 3 = left
  const orbitA = (f / FRAMES) * Math.PI * 2;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));

      // the ticking orbit ring
      const dxc = x - CX, dyc = y - CY;
      const rr = Math.sqrt(dxc * dxc + dyc * dyc);
      if (rr > 46 && rr < 48.4) {
        const ang = Math.atan2(dyc, dxc);
        let d = ang - orbitA;
        while (d < -Math.PI) d += Math.PI * 2;
        while (d > Math.PI) d -= Math.PI * 2;
        const near = Math.max(0, 1 - Math.abs(d) / 0.9);
        col = mix(mix(CARD_A, DIM_, 0.5), PALE, near * near);
      }

      const s = starField(x, y);
      if (s <= 1) {
        // which arm this pixel belongs to, for the sequenced pulse
        const arm = Math.abs(x - CX) > Math.abs(y - CY) ? (x > CX ? 1 : 3) : (y > CY ? 2 : 0);
        const core = Math.max(0, 1 - s);            // 1 at centre, 0 at the tips
        let base = mix(DIM_, VIOLET, Math.min(1, core * 2.2));
        if (arm === litArm) base = mix(base, PALE, 0.5);
        base = mix(base, PALE, Math.pow(core, 3) * 0.9); // hot core
        col = base;
      }
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) { const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4; r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3]; }
    if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}

export function gemma4Icon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) { flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0; }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 16, transparentIndex: 0 };
}
