// Procedural icon for Offline Cheap Text LLM BitNet: a dark rounded card with
// a 4×4 grid of ternary cells — each holding −1, 0 or +1 as a minus bar, a
// dot, or a plus — that reshuffle in a travelling wave across the frames (the
// "thinking in trits" feel). Pure Node, same super-sample → box-downsample →
// small-palette pipeline as the other app icons. Deterministic (fixed pattern
// table, no RNG), so builds reproduce byte-for-byte.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 8;

const CARD_A = [18, 24, 34];
const CARD_B = [10, 13, 20];
const MINT = [92, 220, 180];
const DIM_ = [52, 92, 82];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

function buildPalette() {
  const pal = [[0, 0, 0]];
  const bases = [CARD_A, CARD_B, MINT, DIM_, mix(MINT, [255, 255, 255], 0.4)];
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

// A fixed trit for each grid cell per frame: cell (r,c) cycles −1→0→+1 with a
// phase offset that sweeps diagonally, so the change reads as a wave.
const trit = (r, c, f) => (((r * 2 + c * 3 + f) % 3) + 3) % 3; // 0,1,2 = −,0,+

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const G = 4, cell = 22, gx0 = (OUT - G * cell) / 2, gy0 = (OUT - G * cell) / 2 + 2;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      const c = Math.floor((x - gx0) / cell), r = Math.floor((y - gy0) / cell);
      if (r >= 0 && r < G && c >= 0 && c < G) {
        const cx = gx0 + c * cell + cell / 2, cy = gy0 + r * cell + cell / 2;
        const t = trit(r, c, f);
        // the wave: the cell whose trit JUST changed glows brighter
        const hot = ((r * 2 + c * 3 + f) % 3) === 0;
        const ink = hot ? MINT : DIM_;
        const TH = 2.4, L = 6;
        if (t === 0) { // minus bar
          if (Math.abs(y - cy) < TH && Math.abs(x - cx) < L) col = ink.slice();
        } else if (t === 1) { // zero dot (ring)
          const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
          if (d < 4.6 && d > 1.8) col = ink.slice();
        } else { // plus
          if ((Math.abs(y - cy) < TH && Math.abs(x - cx) < L) || (Math.abs(x - cx) < TH && Math.abs(y - cy) < L)) col = ink.slice();
        }
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

export function bitnetIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) { flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0; }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 16, transparentIndex: 0 };
}
