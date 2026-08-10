// Procedural icon for Offline Cheap Text LLM Gemma: a dark rounded card
// holding a faceted gem — Gemma's namesake — whose facets light in a rotating
// sweep across the frames, over a soft "thinking" spark trail. Deliberately a
// DIFFERENT shape language from the BitNet sibling (which is a 4x4 ternary
// grid), so the two providers are never confused in the Providers folder at
// icon size. Pure Node, same super-sample -> box-downsample -> small-palette
// pipeline as the other app icons. Deterministic (no RNG), so builds
// reproduce byte-for-byte.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 8;

const CARD_A = [20, 26, 44];
const CARD_B = [11, 14, 26];
const BLUE = [122, 162, 247];
const DIM_ = [58, 82, 138];
const PALE = [186, 208, 255];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

function buildPalette() {
  const pal = [[0, 0, 0]];
  const bases = [CARD_A, CARD_B, BLUE, DIM_, PALE];
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

// Gem outline: a classic cut — flat table on top, girdle, tapering pavilion.
// Returned as a closed polygon in icon space.
const GEM_CX = 64, GEM_TOP = 40, GEM_GIRDLE = 62, GEM_BOT = 96, GEM_HW = 27, GEM_TW = 15;
const GEM = [
  [GEM_CX - GEM_TW, GEM_TOP],
  [GEM_CX + GEM_TW, GEM_TOP],
  [GEM_CX + GEM_HW, GEM_GIRDLE],
  [GEM_CX, GEM_BOT],
  [GEM_CX - GEM_HW, GEM_GIRDLE],
];

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Which facet a point belongs to: table (0), then four pavilion wedges (1..4)
// split by the diagonals from the girdle corners down to the culet.
function facetOf(x, y) {
  if (y <= GEM_GIRDLE) return x < GEM_CX ? 1 : 2;      // crown left / right
  return x < GEM_CX ? 3 : 4;                           // pavilion left / right
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const lit = f % 5; // which facet is currently catching the light (0 = table)
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      if (inPoly(x, y, GEM)) {
        const isTable = y < GEM_TOP + 9;
        const fc = isTable ? 0 : facetOf(x, y);
        // base facet shade: crown brighter than pavilion, with a vertical ramp
        const depth = Math.max(0, Math.min(1, (y - GEM_TOP) / (GEM_BOT - GEM_TOP)));
        let base = mix(BLUE, DIM_, depth * 0.85);
        if (fc === 1 || fc === 3) base = mix(base, CARD_B, 0.18); // left faces in shadow
        if (fc === lit) base = mix(base, PALE, 0.55);             // the sweeping highlight
        if (isTable) base = mix(base, PALE, lit === 0 ? 0.5 : 0.22);
        col = base;
        // facet edges: thin pale lines along the girdle and the two diagonals
        const nearGirdle = Math.abs(y - GEM_GIRDLE) < 1.4;
        const dl = Math.abs((x - GEM_CX) / GEM_HW + (y - GEM_GIRDLE) / (GEM_BOT - GEM_GIRDLE));
        const dr = Math.abs((GEM_CX - x) / GEM_HW + (y - GEM_GIRDLE) / (GEM_BOT - GEM_GIRDLE));
        const nearTable = Math.abs(y - (GEM_TOP + 9)) < 1.2;
        if (nearGirdle || nearTable || (y > GEM_GIRDLE && (dl < 0.06 || dr < 0.06))) col = mix(col, PALE, 0.7);
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

export function gemmaIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) { flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0; }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 16, transparentIndex: 0 };
}
