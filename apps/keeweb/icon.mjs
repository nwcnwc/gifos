// Procedural icon for KeeWeb: a dark rounded card holding a green key whose
// bit lines up as the loop plays. Super-sample → box-downsample → small
// palette; deterministic so GIF builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [28, 36, 30];
const CARD_B = [14, 18, 15];
const GREEN = [107, 189, 88];
const GREEN_D = [58, 118, 48];
const PALE = [226, 244, 220];
const STEEL = [168, 188, 164];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, GREEN, GREEN_D, PALE, STEEL]) {
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

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const t = f / FRAMES;
  const tilt = (t - 0.5) * 0.28;
  const c = Math.cos(tilt), s = Math.sin(tilt);
  const ox = 64, oy = 66;
  function rot(px, py) {
    const dx = px - ox, dy = py - oy;
    return [ox + dx * c - dy * s, oy + dx * s + dy * c];
  }
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      const [rx, ry] = rot(x, y);
      // bow (ring)
      const bx = rx - 46, by = ry - 58;
      const d = Math.sqrt(bx * bx + by * by);
      if (d > 11 && d < 17.5) col = mix(GREEN_D, GREEN, 0.45 + 0.4 * ((rx - 30) / 40));
      // shaft
      if (rx >= 58 && rx <= 98 && Math.abs(ry - 58) < 4.2) col = mix(GREEN, PALE, 0.12);
      // teeth
      if (rx >= 86 && rx <= 98 && ry >= 58 && ry <= 72) {
        const tooth = (rx > 86 && rx < 91 && ry < 68) || (rx > 93 && rx < 98 && ry < 72);
        if (tooth) col = mix(GREEN_D, GREEN, 0.6);
      }
      // glow as it lines up
      const glow = 0.35 + 0.65 * (1 - Math.abs(t - 0.5) * 2);
      if (d < 7) col = mix(CARD_B, STEEL, glow * 0.55);
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

export function keewebIcon() {
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
