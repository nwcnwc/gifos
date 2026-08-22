// Procedural icon for Vocal Remover: one waveform that COMES APART. The bars
// are drawn twice — a pink half above the centre line and a teal half below —
// and the animation pulls the two halves away from each other and lets them
// close again. That is the app in one glyph: a single track separating into
// two, and back. Same super-sample -> box-downsample -> small-palette pipeline
// the other app icons use; deterministic, so builds reproduce byte for byte.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 14;

const CARD_A = [46, 18, 40];    // card gradient top (deep plum)
const CARD_B = [12, 8, 18];     // card gradient bottom
const PINK = [236, 84, 148];    // the voice
const TEAL = [78, 214, 196];    // everything else
const HOT = [255, 214, 236];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, PINK, TEAL, HOT]) {
    for (let s = 0; s <= 5; s++) pal.push(mix(b, [255, 255, 255], s * 0.09).map(Math.round));
    for (let s = 1; s <= 3; s++) pal.push(mix(b, [0, 0, 0], s * 0.18).map(Math.round));
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

const BARS = 9, CX = 64, CY = 64, BAR_W = 7, GAP = 4;
const SPAN = BARS * BAR_W + (BARS - 1) * GAP;
const X0 = CX - SPAN / 2;

// A fixed silhouette, so the shape reads as ONE waveform rather than noise.
const SHAPE = [0.30, 0.55, 0.82, 0.62, 1.00, 0.58, 0.86, 0.48, 0.28];

function split(f) {
  // 0 -> together, 1 -> fully apart, easing at both ends of the loop
  const u = f / FRAMES;
  return 0.5 - 0.5 * Math.cos(2 * Math.PI * u);
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const sep = 2 + 11 * split(f);
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      for (let i = 0; i < BARS; i++) {
        const bx = X0 + i * (BAR_W + GAP);
        if (x < bx || x > bx + BAR_W) continue;
        const h = 6 + 30 * SHAPE[i];
        // the voice half, lifted up out of the mix
        const topB = CY - sep, topA = topB - h;
        // the accompaniment half, sinking away from it
        const botA = CY + sep, botB = botA + h;
        if (y >= topA && y <= topB) {
          const t = (topB - y) / h;
          col = mix(PINK, HOT, Math.max(0, t - 0.45) * 1.6);
        } else if (y >= botA && y <= botB) {
          const t = (y - botA) / h;
          col = mix(TEAL, [220, 255, 250], Math.max(0, t - 0.45) * 1.2);
        }
      }
      // the line they part along, fading in as they separate
      if (Math.abs(y - CY) < 0.9 && x > m + 6 && x < OUT - m - 6) {
        col = mix(col, HOT, 0.15 + 0.45 * split(f));
      }
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0; const n = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
    }
    if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}

export function vocalRemoverIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 7, transparentIndex: 0 };
}
