// Procedural icon for Tesseract OCR: a dark card of paper, a highlighter
// beam sweeping down, and letters filling in behind it. Photo/page → text.
// Super-sample → box-downsample → small palette. Deterministic, no RNG.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 14;

const CARD_A = [36, 26, 16];
const CARD_B = [16, 12, 8];
const AMBER = [224, 152, 48];
const DEEP = [160, 96, 24];
const PALE = [255, 232, 196];
const INK = [62, 44, 24];
const PAPER = [214, 196, 164];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, AMBER, DEEP, PALE, INK, PAPER]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.09).map(Math.round));
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

// A few "lines of text" as short dashes, so the icon reads as a page.
const LINES = [
  { y: 40, x0: 34, w: 60, h: 4 },
  { y: 50, x0: 34, w: 52, h: 4 },
  { y: 60, x0: 34, w: 58, h: 4 },
  { y: 70, x0: 34, w: 44, h: 4 },
  { y: 80, x0: 34, w: 56, h: 4 },
  { y: 90, x0: 34, w: 38, h: 4 },
];

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const pageTop = 32, pageH = 66;
  const beamY = pageTop - 4 + ((f + 0.5) / FRAMES) * (pageH + 8);
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      const inPage = x >= 30 && x <= 98 && y >= pageTop && y <= pageTop + pageH;
      if (inPage) {
        col = mix(PAPER, CARD_A, y < beamY ? 0.15 : 0.55);
        for (const ln of LINES) {
          if (y >= ln.y && y < ln.y + ln.h && x >= ln.x0 && x < ln.x0 + ln.w) {
            col = y < beamY ? mix(INK, AMBER, 0.25) : mix(PAPER, INK, 0.18);
          }
        }
      }
      const d = Math.abs(y - beamY);
      if (d < 3.2 && x >= 28 && x <= 100) {
        col = mix(col, PALE, Math.max(0, 1 - d / 3.2) * 0.92);
      }
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
      r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
    }
    if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}

export function tesseractIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 8, transparentIndex: 0 };
}
