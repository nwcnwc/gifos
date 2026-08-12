// Procedural icon for Offline Neural TTS (Kokoro): a violet card with a centred
// WAVEFORM, hot in electric cyan. Same silhouette family as its KittenTTS
// sibling (an amber waveform), recoloured to read as the GPU voice — the two
// differ in hue AND the cyan core, not colour alone. Same super-sample ->
// box-downsample -> small-palette pipeline; deterministic, so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [40, 28, 78];    // card gradient top (violet dark)
const CARD_B = [16, 11, 34];    // card gradient bottom
const VIOLET = [124, 92, 255];
const DEEP = [78, 52, 176];
const CYAN = [140, 230, 255];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

function buildPalette() {
  const pal = [[0, 0, 0]];
  const bases = [CARD_A, CARD_B, VIOLET, DEEP, CYAN];
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

const BARS = 7, CX = 64, CY = 64, BAR_W = 8, GAP = 5;
const SPAN = BARS * BAR_W + (BARS - 1) * GAP;
const X0 = CX - SPAN / 2;

function barHeight(i, f) {
  const phase = (f / FRAMES) * Math.PI * 2;
  const centred = 1 - Math.abs(i - (BARS - 1) / 2) / ((BARS - 1) / 2);
  const envelope = 0.42 + 0.58 * centred;
  const wave = 0.5 + 0.5 * Math.sin(phase - i * 0.85);
  return (10 + 34 * wave) * envelope;
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
        const dyEnd = Math.max(0, Math.abs(y - CY) - (h - BAR_W / 2));
        const dxMid = Math.abs(x - (bx + BAR_W / 2));
        if (dyEnd > 0 && dxMid * dxMid + dyEnd * dyEnd > (BAR_W / 2) * (BAR_W / 2)) continue;
        const heat = Math.max(0, 1 - Math.abs(y - CY) / (h + 1));   // cyan core
        col = mix(mix(DEEP, VIOLET, 0.65), CYAN, heat * heat * 0.9);
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

export function kokoroTtsIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) { flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0; }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 8, transparentIndex: 0 };
}
