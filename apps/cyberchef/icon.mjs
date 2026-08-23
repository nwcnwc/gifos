// Procedural icon for CyberChef: a dark rounded card holding a chef's hat
// over a red bake-button disc. Steam curls rise and the disc pulses — the
// "Swiss Army Knife of cyber" as a kitchen timer. Pure Node, same super-sample
// → box-downsample → small-palette pipeline as the other app icons.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [36, 20, 20];
const CARD_B = [18, 10, 12];
const RED = [244, 67, 54];
const RED_D = [160, 32, 28];
const CREAM = [245, 236, 220];
const STEAM = [220, 210, 200];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD_A, CARD_B, RED, RED_D, CREAM, STEAM]) {
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

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const pulse = 0.5 - 0.5 * Math.cos((f / FRAMES) * Math.PI * 2);
  const steamP = f / FRAMES;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inCard(x, y, m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      const cx = OUT / 2;

      // bake disc
      const dx = x - cx, dy = y - 78;
      const discR = 22 + pulse * 2.2;
      const d = Math.hypot(dx, dy);
      if (d < discR) {
        const t = d / discR;
        col = mix(RED, RED_D, t * 0.55);
        if (d > discR - 2.2) col = mix(col, CREAM, 0.35);
      }

      // hat brim
      const brimY = 58, brimW = 28, brimH = 5;
      if (Math.abs(x - cx) < brimW && y > brimY && y < brimY + brimH) col = CREAM;
      // hat puff (ellipse)
      const hx = (x - cx) / 18, hy = (y - 44) / 16;
      if (hx * hx + hy * hy < 1 && y < brimY + 1) {
        col = mix(CREAM, [255, 255, 255], 0.15 - hy * 0.1);
        // band
        if (y > 52 && y < 56) col = mix(RED, CREAM, 0.15);
      }
      // hat top bubble
      const tx = (x - cx + 2) / 7, ty = (y - 30) / 7;
      if (tx * tx + ty * ty < 1) col = CREAM;

      // steam curls above the hat
      for (let s = 0; s < 3; s++) {
        const sy = 22 - ((steamP + s * 0.22) % 1) * 16;
        const sx = cx + Math.sin((steamP + s) * Math.PI * 2 + s) * 6;
        const sd = Math.hypot(x - sx, y - sy);
        if (sd < 2.4 && y < 36) col = mix(col, STEAM, Math.max(0, 1 - sd / 2.4) * 0.85);
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

export function cyberChefIcon() {
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
