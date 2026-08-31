// Procedural icon: a dark room whose fire grows. Reads at 64px — the flame
// fills the card; a pinprick ember does not survive Home Screen size.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;
const CARD = [18, 14, 10], CARD_D = [10, 8, 6];
const WALL = [28, 22, 16], FLOOR = [22, 16, 12];
const INK = [8, 6, 4];
const EMBER = [200, 48, 10], FLAME = [240, 140, 28], CORE = [255, 236, 150];
const GLOW = [220, 90, 18], ASH = [72, 48, 28], LOG = [48, 28, 14];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, CARD_D, WALL, FLOOR, INK, EMBER, FLAME, CORE, GLOW, ASH, LOG]) {
    pal.push(b.map(Math.round));
    pal.push(mix(b, [255, 255, 255], 0.18).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.35).map(Math.round));
    pal.push(mix(b, [255, 180, 40], 0.22).map(Math.round));
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
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r);
  const cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
}

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const grow = f / (FRAMES - 1);
  const flicker = 0.9 + 0.1 * Math.sin(f * 2.3);
  // First frame is already a handful of embers, not a pinprick.
  const heat = (0.42 + 0.58 * grow) * flicker;
  const fx = 64, baseY = 96;
  const flameH = 38 + 46 * heat;
  const flameW = 16 + 18 * heat;
  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 6, 18)) continue;
      let col = mix(CARD, CARD_D, Math.max(0, Math.min(1, (y - 6) / (OUT - 12))));
      if (y < 40) col = mix(WALL, CARD, 0.35);
      if (y > 92) col = mix(FLOOR, ASH, 0.2);

      // A window so the square reads as a room, not a void.
      if (y > 22 && y < 44 && x > 86 && x < 108) {
        const wx = Math.abs(x - 97) / 11, wy = Math.abs(y - 33) / 11;
        col = mix(col, mix(INK, GLOW, 0.25 + 0.45 * heat), 0.55 + 0.25 * (1 - Math.max(wx, wy)));
      }

      const localY = (baseY - 6) - y;
      const localX = x - fx;
      const taper = Math.max(0, 1 - Math.pow(Math.max(0, localY) / flameH, 1.25));
      const half = flameW * taper;
      const inStem = localY > -10 && localY < flameH && Math.abs(localX) < half + 1;
      const radial = half > 1 ? Math.abs(localX) / half : 1;
      const along = Math.max(0, Math.min(1, localY / flameH));

      const glowR = 28 + 36 * heat;
      const glowD = Math.hypot(localX, (localY - flameH * 0.25) * 0.7);
      if (glowD < glowR) {
        col = mix(col, GLOW, 0.55 * heat * (1 - glowD / glowR));
      }

      if (inStem && radial < 1) {
        const coreN = 0.22 + 0.2 * (1 - along);
        if (radial < coreN && along < 0.72) col = CORE;
        else if (radial < 0.62) col = mix(CORE, FLAME, (radial - coreN) / 0.5);
        else col = mix(FLAME, EMBER, (radial - 0.62) / 0.38);
        if (along > 0.78) col = mix(col, EMBER, (along - 0.78) / 0.22);
      }

      // Logs under the hearth — a shape, not a spark.
      const log1 = Math.hypot((x - 64) / 18, (y - 100) / 5);
      const log2 = Math.hypot((x - 54) / 14, (y - 103) / 4.5);
      const log3 = Math.hypot((x - 74) / 14, (y - 103) / 4.5);
      if (log1 < 1 || log2 < 1 || log3 < 1) col = mix(LOG, ASH, 0.3);

      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = SS * SS;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
          r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
        }
      }
      if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
      idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
    }
  }
  return idx;
}

export function darkRoomIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0;
    flat[i * 3 + 1] = pal[i][1] | 0;
    flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return {
    width: OUT, height: OUT, palette: flat, numColors: CT,
    minCodeSize: 6, frames, delayCs: 12, transparentIndex: 0
  };
}
