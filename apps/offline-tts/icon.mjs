// Procedural icon for Offline Text to Speech: a violet rounded card with a white
// speaker whose sound waves pulse outward frame by frame. Pure Node (no
// canvas), same super-sample → box-downsample → small-palette pipeline as
// chess-grandmaster/icon.mjs. Deterministic, so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 10;

const CARD_A = [92, 62, 210];   // card gradient top (violet)
const CARD_B = [58, 34, 140];   // card gradient bottom
const WHITE = [244, 242, 255];
const WAVE = [180, 240, 200];   // minty wave — reads "audio" against violet

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

function buildPalette() {
  const pal = [[0, 0, 0]]; // index 0 = transparent
  const bases = [CARD_A, CARD_B, WHITE, WAVE, mix(CARD_A, WHITE, 0.35)];
  for (const b of bases) for (let s = 0; s <= 5; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
  return pal;
}
function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e9;
  for (let i = 1; i < pal.length; i++) { const p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b, d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; bi = i; } }
  return bi;
}

// Rounded-rect inside test on OUT-scale coords.
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}

function frameIndices(pal, phase) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  // speaker geometry (OUT coords): box + horn, centered-left
  const bx0 = 30, bx1 = 46, by0 = 52, by1 = 76;   // the box
  const hx1 = 62;                                  // horn tip x
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      // speaker: box
      if (x >= bx0 && x <= bx1 && y >= by0 && y <= by1) col = WHITE.slice();
      // horn: triangle widening to the right of the box
      if (x > bx1 && x <= hx1) {
        const t = (x - bx1) / (hx1 - bx1);
        const half = 12 + 14 * t;
        if (Math.abs(y - 64) <= half) col = WHITE.slice();
      }
      // three wave arcs, pulsing with phase: arc i lights when phase passes it
      const cx = hx1 + 2, cy = 64;
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      for (let w = 0; w < 3; w++) {
        const rw = 12 + w * 11;
        const on = Math.max(0, 1 - Math.abs(phase * 3 - w) / 1.0); // travelling pulse
        if (on > 0.05 && Math.abs(d - rw) < 2.6 && x > cx && Math.abs(y - cy) < rw * 0.82) {
          col = mix(col, WAVE, 0.35 + 0.65 * on);
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

export function offlineTtsIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f / (FRAMES - 1)));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) { flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0; }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 12, transparentIndex: 0 };
}
