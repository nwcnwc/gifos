// Procedural icon for Piskel: a black rounded card with a gold hairline,
// holding a tiny pixel canvas. A gold-and-cream sprite walks across the
// frames — the thing the editor is for. Same super-sample → box-downsample
// → small-palette pipeline as the other app icons. Deterministic.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 8;

const CARD_A = [18, 18, 18];
const CARD_B = [8, 8, 8];
const GOLD = [255, 215, 0];
const GOLD_D = [180, 140, 10];
const CREAM = [248, 240, 214];
const INK = [12, 12, 14];
const CHECK_A = [40, 40, 44];
const CHECK_B = [28, 28, 32];
const EYE = [20, 20, 24];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, GOLD, GOLD_D, CREAM, INK, CHECK_A, CHECK_B, EYE]) {
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
  if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  if (x >= x0 + r && x <= x0 + w - r) return true;
  if (y >= y0 + r && y <= y0 + h - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}

// Tiny 8×8 walk cycle, pixel coordinates in sprite space.
// 0 empty, 1 body gold, 2 cream face, 3 ink eye, 4 dark gold boot
const SPRITE = [
  // f0
  [
    '........',
    '..22....',
    '.2112...',
    '.1111...',
    '.1111...',
    '..11....',
    '.4..4...',
    '4....4..',
  ],
  [
    '........',
    '..22....',
    '.2112...',
    '.1111...',
    '.1111...',
    '..11....',
    '..44....',
    '.4..4...',
  ],
  [
    '........',
    '..22....',
    '.2112...',
    '.1111...',
    '.1111...',
    '..11....',
    '.4..4...',
    '4....4..',
  ],
  [
    '........',
    '..22....',
    '.2112...',
    '.1111...',
    '.1111...',
    '..11....',
    '4..4....',
    '.4..4...',
  ],
];

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const walk = SPRITE[f % SPRITE.length];
  const bob = (f % 2) * 1;
  const px0 = 36 + Math.round((f / FRAMES) * 28);
  const py0 = 42 + bob;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    const o = (py * RW + px) * 4;
    if (!inCard(x, y, 6, 18)) continue;
    let col = mix(CARD_A, CARD_B, (y / OUT) * 0.55);
    // gold hairline
    if (!inCard(x, y, 9, 16)) col = mix(GOLD, GOLD_D, (y / OUT));
    // inset canvas
    if (inRoundRect(x, y, 22, 24, 84, 80, 4)) {
      const cx = Math.floor((x - 22) / 7), cy = Math.floor((y - 24) / 7);
      col = ((cx + cy) & 1) ? CHECK_A : CHECK_B;
      const sx = Math.floor((x - px0) / 6), sy = Math.floor((y - py0) / 6);
      if (sy >= 0 && sy < 8 && sx >= 0 && sx < 8) {
        const ch = walk[sy][sx];
        if (ch === '1') col = GOLD;
        else if (ch === '2') col = CREAM;
        else if (ch === '3') col = EYE;
        else if (ch === '4') col = GOLD_D;
      }
    }
    rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
    }
    const n = SS * SS;
    if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}

export function piskelIcon() {
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
