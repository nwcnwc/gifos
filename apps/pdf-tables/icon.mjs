// Procedural icon for PDF Tables → Excel: a green card holding a small
// SPREADSHEET GRID — a highlighted header row over ruled cells, the universal
// "this makes a table" shape. Same super-sample -> box-downsample -> small-
// palette pipeline as the other app icons; deterministic (no RNG), so builds
// reproduce byte-for-byte. A gentle pulse travels down the header row.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [24, 54, 40];
const CARD_B = [12, 28, 21];
const GREEN = [46, 160, 112];
const DEEP = [26, 104, 72];
const PALE = [206, 244, 226];
const LINE = [70, 118, 96];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, GREEN, DEEP, PALE, LINE]) for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.09).map(Math.round));
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

// The grid: 4 columns × 4 rows inside an inset box; row 0 is the header.
const GX0 = 30, GY0 = 34, GW = 68, GH = 60, COLS = 4, ROWS = 4;
const CW = GW / COLS, CH = GH / ROWS, LW = 1.4;

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const pulseCol = Math.floor((f / FRAMES) * COLS) % COLS;   // which header cell glows
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      const inGrid = x >= GX0 && x <= GX0 + GW && y >= GY0 && y <= GY0 + GH;
      if (inGrid) {
        const cx = (x - GX0) / CW, cy = (y - GY0) / CH;
        const ci = Math.min(COLS - 1, Math.floor(cx)), ri = Math.min(ROWS - 1, Math.floor(cy));
        // cell fills
        if (ri === 0) col = mix(DEEP, GREEN, ci === pulseCol ? 0.9 : 0.55);   // header row
        else col = mix(CARD_A, GREEN, 0.10 + 0.05 * ((ri + ci) % 2));
        // grid lines
        const nx = (x - GX0) % CW, ny = (y - GY0) % CH;
        const onV = nx < LW || nx > CW - LW, onH = ny < LW || ny > CH - LW;
        const border = x < GX0 + LW || x > GX0 + GW - LW || y < GY0 + LW || y > GY0 + GH - LW;
        if (onV || onH || border) col = ri === 0 ? mix(PALE, GREEN, 0.4) : LINE;
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

export function pdfTablesIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) { flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0; }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 10, transparentIndex: 0 };
}
