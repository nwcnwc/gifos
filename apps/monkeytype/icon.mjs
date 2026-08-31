// Procedural Monkeytype icon: a yellow caret types through "the lazy"
// on a serika-dark card, then 87 wpm lands. Reads at 64px. Deterministic.
// Store art is a real mid-test screenshot (tools/shoot.js), not a pixel pangram.

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD_A = [50, 52, 55], CARD_B = [32, 34, 37];
const SUB = [100, 102, 105], TEXT = [209, 208, 197];
const MAIN = [226, 183, 20], ERR = [202, 71, 84], INK = [18, 18, 20];

const GLYPHS = {
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '%': [0b11001, 0b11010, 0b00100, 0b01000, 0b10110, 0b00110, 0],
  '#': [0b01010, 0b11111, 0b01010, 0b01010, 0b11111, 0b01010, 0],
  '@': [0b01110, 0b10001, 0b10111, 0b10101, 0b10111, 0b10000, 0b01110],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  3: [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  5: [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  6: [0b01110, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b01110],
  7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
};

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r), cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, SUB, TEXT, MAIN, ERR, INK]) {
    for (let s = 0; s <= 3; s++) pal.push(mix(b, [255, 255, 255], s * 0.1).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
  }
  return pal.slice(0, 64);
}
function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e9;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}
function textW(str, s, tracking) {
  const t = tracking == null ? 6.2 : tracking;
  return str.length * t * s - (t - 5) * s;
}

function stampCh(rgb, ch, x0, y0, s, col) {
  const g = GLYPHS[ch] || GLYPHS[String(ch).toUpperCase()];
  if (!g) return;
  const rad = Math.max(1.1, 0.62 * s);
  for (let gr = 0; gr < 7; gr++) for (let gc = 0; gc < 5; gc++) {
    if (!(g[gr] & (1 << (4 - gc)))) continue;
    const cx = x0 + (gc + 0.5) * s, cy = y0 + (gr + 0.5) * s;
    const xA = Math.max(0, Math.floor(cx - rad)), xB = Math.min(OUT - 1, Math.ceil(cx + rad));
    const yA = Math.max(0, Math.floor(cy - rad)), yB = Math.min(OUT - 1, Math.ceil(cy + rad));
    for (let y = yA; y <= yB; y++) for (let x = xA; x <= xB; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= rad * rad) {
        const o = (y * OUT + x) * 4;
        rgb[o] = col[0]; rgb[o + 1] = col[1]; rgb[o + 2] = col[2]; rgb[o + 3] = 1;
      }
    }
  }
}
function stampStr(rgb, str, x0, y0, s, col, tracking) {
  const t = tracking == null ? 6.2 : tracking;
  let cx = x0;
  for (let i = 0; i < str.length; i++) {
    stampCh(rgb, str[i], cx, y0, s, col);
    cx += t * s;
  }
}

function frameIndices(pal, f) {
  const rgb = new Float32Array(OUT * OUT * 4);
  const line = 'the lazy';
  const typed = Math.min(line.length, Math.max(0, f <= 8 ? f : 8));
  const showWpm = f >= 9;
  const s = 2.55, y0 = 44;
  const x0 = (OUT - textW(line, s, 6.15)) / 2;

  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    if (!inCard(x, y, 6, 22)) continue;
    const col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
    const o = (y * OUT + x) * 4;
    rgb[o] = col[0]; rgb[o + 1] = col[1]; rgb[o + 2] = col[2]; rgb[o + 3] = 1;
  }
  if (!showWpm) {
    stampStr(rgb, line.slice(0, typed), x0, y0, s, TEXT, 6.15);
    stampStr(rgb, line.slice(typed), x0 + typed * 6.15 * s, y0, s, SUB, 6.15);
    if (f % 3 !== 2) {
      const cx = x0 + typed * 6.15 * s;
      for (let y = (y0 - 2) | 0; y <= (y0 + 7 * s + 2) | 0; y++) {
        for (let x = (cx - 1) | 0; x <= (cx + 2) | 0; x++) {
          if (x < 0 || y < 0 || x >= OUT || y >= OUT) continue;
          const o = (y * OUT + x) * 4;
          if (!rgb[o + 3]) continue;
          rgb[o] = MAIN[0]; rgb[o + 1] = MAIN[1]; rgb[o + 2] = MAIN[2];
        }
      }
    }
  } else {
    stampStr(rgb, '87', (OUT - textW('87', 3.6, 6.4)) / 2, 28, 3.6, MAIN, 6.4);
    stampStr(rgb, 'WPM', (OUT - textW('WPM', 1.7, 6.2)) / 2, 78, 1.7, SUB, 6.2);
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let i = 0; i < OUT * OUT; i++) {
    if (rgb[i * 4 + 3] < 0.5) { idx[i] = 0; continue; }
    idx[i] = nearest(pal, rgb[i * 4], rgb[i * 4 + 1], rgb[i * 4 + 2]);
  }
  return idx;
}

export function monkeytypeIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64, flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 10, transparentIndex: 0 };
}
