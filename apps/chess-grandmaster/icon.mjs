// Procedural icon for Chess Grandmaster: a glossy dark card carrying a gold &
// cream chessboard, with a specular sheen that sweeps diagonally across the
// frames (the "polished trophy" feel). Pure Node — no canvas. A super-sampled
// RGBA image is painted per frame, box-downsampled, and quantized to a small
// palette with a 1-bit transparent surround (the shape encode() wants for
// opts.preview). Deterministic, so builds reproduce byte-for-byte.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 10;

const CARD = [21, 20, 30];
const RIM = [201, 162, 75], RIM_D = [138, 104, 40];
const LIGHT = [238, 223, 191], DARK = [150, 104, 62];

function rr(x, y, m, r) { // signed-ish inside test for a rounded rect [m..OUT-m], radius r
  const lo = m, hi = OUT - m;
  const cx = Math.min(Math.max(x, lo + r), hi - r);
  const cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r && (y < lo || y > hi)) return y >= lo && y <= hi;
  const inX = x >= lo && x <= hi, inY = y >= lo && y <= hi;
  if (inX && (y >= lo + r && y <= hi - r)) return true;
  if (inY && (x >= lo + r && x <= hi - r)) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

function buildPalette() {
  // base colours plus brightened steps (for the sheen) and a couple of rim
  // bevel tones; index 0 is the reserved transparent slot.
  const pal = [[0, 0, 0]];
  const bases = [CARD, RIM, RIM_D, LIGHT, DARK, mix(RIM, [255, 250, 235], 0.4)];
  for (const b of bases) for (let s = 0; s <= 5; s++) pal.push(mix(b, [255, 255, 255], s * 0.12).map(Math.round));
  return pal;
}

function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e9;
  for (let i = 1; i < pal.length; i++) { const p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b, d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; bi = i; } }
  return bi;
}

function frameIndices(pal, phase) {
  // paint super-sampled RGBA
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 24, rim = 6, boardIn = m + rim + 2;
  const bSize = (OUT - 2 * boardIn), cell = bSize / 8;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
    let col = null, a = 0;
    if (rr(x, y, m, rad)) {
      a = 1;
      const insideBoard = x >= boardIn && x < OUT - boardIn && y >= boardIn && y < OUT - boardIn;
      if (insideBoard) {
        const cxi = Math.floor((x - boardIn) / cell), cyi = Math.floor((y - boardIn) / cell);
        col = ((cxi + cyi) % 2) ? DARK.slice() : LIGHT.slice();
      } else if (rr(x, y, m + 1, rad - 1) && !(x >= boardIn - 1 && x < OUT - boardIn + 1 && y >= boardIn - 1 && y < OUT - boardIn + 1)) {
        // gold rim with a soft top-left bevel
        const bev = Math.max(0, Math.min(1, (x + y) / (OUT * 1.5)));
        col = mix(mix(RIM, [255, 245, 220], 0.25), RIM_D, bev);
      } else { col = CARD.slice(); }
      // diagonal specular sheen (skip the flat card surround so it looks polished)
      if (col !== CARD) {
        const u = (x + y) / (2 * OUT);
        const s = Math.max(0, 1 - Math.abs(u - phase) / 0.13) * 0.55;
        if (s > 0) col = mix(col, [255, 255, 255], s);
      }
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }
  // box-downsample SSxSS → OUT, threshold coverage for 1-bit transparency
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) { const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4; r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3]; }
    if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}

export function grandmasterIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) { const phase = -0.25 + 1.5 * (f / (FRAMES - 1)); frames.push(frameIndices(pal, phase)); }
  return { width: OUT, height: OUT, palette: pal, numColors: pal.length, minCodeSize: Math.max(2, Math.ceil(Math.log2(pal.length))), frames, delayCs: 12, transparentIndex: 0 };
}
