// Procedural icon for Restfox: a dark card with two orange fox ears, a purple
// GET chip, and a request line whose head travels left-to-right across the
// loop — send. Same super-sample → box-downsample → small-palette pipeline as
// the other app icons; deterministic, so builds reproduce byte-for-byte.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [41, 41, 41];
const CARD_B = [22, 22, 22];
const EAR = [225, 118, 17];
const EAR_D = [160, 70, 8];
const GET = [171, 122, 255];
const SEND = [127, 79, 213];
const LINE = [90, 90, 96];
const PALE = [217, 217, 217];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, EAR, EAR_D, GET, SEND, LINE, PALE]) {
    for (let s = 0; s <= 4; s++) pal.push(mix(b, [255, 255, 255], s * 0.09).map(Math.round));
    for (let s = 1; s <= 2; s++) pal.push(mix(b, [0, 0, 0], s * 0.2).map(Math.round));
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
function inTri(x, y, ax, ay, bx, by, cx, cy) {
  const s = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
  const t = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
  const u = (cx - bx) * (y - by) - (cy - by) * (x - bx);
  return (s >= 0 && t >= 0 && u >= 0) || (s <= 0 && t <= 0 && u <= 0);
}
function inRoundRect(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  if (x >= x0 + r && x <= x0 + w - r) return true;
  if (y >= y0 + r && y <= y0 + h - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 10, rad = 22;
  const t = f / FRAMES;
  const head = 28 + t * 72; // request-line head, wrapping
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    // fox ears sit on the card's top edge
    const earL = inTri(x, y, 40, 18, 52, 18, 46, 4);
    const earR = inTri(x, y, 76, 18, 88, 18, 82, 4);
    if (earL || earR) { a = 1; col = mix(EAR, EAR_D, (y - 4) / 16); }
    else if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      // GET chip
      if (inRoundRect(x, y, 22, 36, 36, 16, 4)) col = mix(GET, SEND, 0.35);
      // URL track
      if (inRoundRect(x, y, 62, 38, 44, 12, 3)) col = mix(CARD_B, LINE, 0.55);
      // request line
      const ly = 78;
      if (y > ly - 1.4 && y < ly + 1.4 && x > 24 && x < 104) col = LINE;
      const dx = x - head, dy = y - ly;
      const g = Math.max(0, 1 - Math.hypot(dx, dy) / 7);
      if (g > 0) col = mix(col, SEND, g);
      // chevron at the head
      if (inTri(x, y, head, ly - 6, head, ly + 6, head + 9, ly)) col = PALE;
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

export function restfoxIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 9, transparentIndex: 0 };
}
