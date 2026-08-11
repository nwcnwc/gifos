// Procedural icon for Offline Neural Text to Speech: a warm rounded card with a
// centred WAVEFORM — seven vertical bars whose heights travel as a wave.
//
// Deliberately a different silhouette from its sibling. Offline Text to Speech
// is a violet card with a speaker cone and radiating arcs; this is an amber card
// with a symmetric bar cluster. Both live in the Providers folder and both serve
// Text → speech, so at 32px the ONLY thing telling them apart is the shape and
// the hue — the two are picked to differ in both, not just colour (a colour-only
// difference disappears for anyone who cannot separate violet from amber).
//
// Pure Node, same super-sample -> box-downsample -> small-palette pipeline as
// the other app icons. Deterministic (no RNG), so builds reproduce byte-for-byte.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [58, 34, 22];    // card gradient top (warm dark)
const CARD_B = [28, 16, 11];    // card gradient bottom
const AMBER = [255, 138, 76];
const DEEP = [176, 78, 34];
const PALE = [255, 226, 205];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

function buildPalette() {
  const pal = [[0, 0, 0]];
  const bases = [CARD_A, CARD_B, AMBER, DEEP, PALE];
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

// Seven bars, symmetric about the middle, heights driven by a travelling wave.
// The envelope keeps the outer bars shorter so the cluster reads as a voice
// waveform rather than a bar chart.
const BARS = 7, CX = 64, CY = 64, BAR_W = 8, GAP = 5;
const SPAN = BARS * BAR_W + (BARS - 1) * GAP;
const X0 = CX - SPAN / 2;

function barHeight(i, f) {
  const phase = (f / FRAMES) * Math.PI * 2;
  const centred = 1 - Math.abs(i - (BARS - 1) / 2) / ((BARS - 1) / 2); // 0 edge, 1 middle
  const envelope = 0.42 + 0.58 * centred;
  const wave = 0.5 + 0.5 * Math.sin(phase - i * 0.85);
  return (10 + 34 * wave) * envelope;   // half-height in px
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      for (let i = 0; i < BARS; i++) {
        const bx = X0 + i * (BAR_W + GAP);
        if (x < bx || x > bx + BAR_W) continue;
        const h = barHeight(i, f);
        if (y < CY - h || y > CY + h) continue;
        // rounded caps: trim the corners of each bar
        const dyEnd = Math.max(0, Math.abs(y - CY) - (h - BAR_W / 2));
        const dxMid = Math.abs(x - (bx + BAR_W / 2));
        if (dyEnd > 0 && dxMid * dxMid + dyEnd * dyEnd > (BAR_W / 2) * (BAR_W / 2)) continue;
        const heat = Math.max(0, 1 - Math.abs(y - CY) / (h + 1));   // hot in the middle
        col = mix(mix(DEEP, AMBER, 0.65), PALE, heat * heat * 0.85);
      }
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0; const n = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) { const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4; r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3]; }
    if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}

export function neuralTtsIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) { flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0; }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 8, transparentIndex: 0 };
}
