/*
 * icon.mjs — the App GIF's own animation: an Earth being imaged.
 *
 * The icon is judged at 64 px on a Home Screen next to a dozen others, and the
 * rule the gauntlet sets is that the animation has to DEMONSTRATE, not wiggle.
 * So it does exactly what the app does: a satellite's swath sweeps across the
 * globe, and the grey Earth turns into colour behind it — day by day, forever.
 * You can tell what this app is from across the room.
 *
 * Painted procedurally in pure Node (no canvas, no image decoder), from the
 * 1-bit land mask baked by tools/make-assets.py. Super-sampled, box-downsampled
 * and quantised to a small palette with a transparent surround, the shape
 * gifos-gif.js wants for opts.preview. Deterministic: same bytes every build.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 14;
const MASK_W = 512, MASK_H = 256;

// Cool and dark before the pass, true-colour after it.
const SPACE = [8, 12, 20];
const OCEAN_DARK = [16, 30, 50], OCEAN = [26, 78, 132];
const LAND_DARK = [34, 44, 46], LAND = [96, 122, 62], DESERT = [176, 152, 96];
const ICE = [232, 240, 248];
const SCAN = [120, 214, 255];
const RIM = [76, 194, 255];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function loadMask() {
  const bits = readFileSync(join(HERE, 'assets', 'landmask.bin'));
  return (lon, lat) => {
    let x = Math.floor((lon + 180) / 360 * MASK_W);
    let y = Math.floor((90 - lat) / 180 * MASK_H);
    x = ((x % MASK_W) + MASK_W) % MASK_W;
    if (y < 0) y = 0;
    if (y >= MASK_H) y = MASK_H - 1;
    const i = y * MASK_W + x;
    return (bits[i >> 3] >> (7 - (i & 7))) & 1;
  };
}

function buildPalette() {
  const pal = [[0, 0, 0]];                     // 0 is the transparent surround
  const push = (c) => pal.push(c.map(Math.round));
  [SPACE, ICE, SCAN, RIM].forEach(push);
  for (let i = 0; i < 6; i++) push(mix(OCEAN_DARK, OCEAN, i / 5));
  for (let i = 0; i < 6; i++) push(mix(LAND_DARK, LAND, i / 5));
  for (let i = 0; i < 5; i++) push(mix(LAND_DARK, DESERT, i / 4));
  for (let i = 0; i < 4; i++) push(mix(OCEAN, [120, 190, 235], i / 3));
  for (let i = 0; i < 4; i++) push(mix(LAND, DESERT, i / 3));
  return pal;
}

function nearest(pal, r, g, b) {
  let best = 1, bd = Infinity;
  for (let i = 1; i < pal.length; i++) {
    const dr = pal[i][0] - r, dg = pal[i][1] - g, db = pal[i][2] - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/*
 * An orthographic globe: screen x,y -> a point on a sphere centred on
 * (LON0, 0), which is the projection a person means when they say "the Earth
 * from space". The swath is a band in the SCREEN's x, sweeping left to right;
 * everything behind it is painted in colour, everything ahead is the dim
 * "not imaged yet" Earth.
 */
const LON0 = 6;                     // Africa and Europe: the most legible face
const R = 0.455;                    // globe radius as a fraction of the icon

function frameIndices(pal, land, phase) {
  const rgba = new Float32Array(RW * RW * 4);
  const sweep = -0.25 + phase * 1.5;     // the swath's screen x, in -0.5..0.5-ish

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const u = px / RW - 0.5, v = py / RW - 0.5;
      const d = Math.sqrt(u * u + v * v);
      const o = (py * RW + px) * 4;

      if (d > R + 0.045) continue;                        // transparent surround

      if (d > R) {
        // The atmosphere: a thin accent rim, fading out. It is what makes a
        // flat disc read as a planet at 64 px.
        const t = 1 - (d - R) / 0.045;
        const c = mix(SPACE, RIM, t * t * 0.85);
        rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2];
        rgba[o + 3] = t * t;
        continue;
      }

      // Sphere point.
      const z = Math.sqrt(Math.max(0, R * R - u * u - v * v));
      const lat = Math.asin(v / R) * -180 / Math.PI;
      const lon = LON0 + Math.atan2(u, z) * 180 / Math.PI;
      const isLand = land(lon, lat);
      const absLat = Math.abs(lat);

      // Imaged or not: the swath edge is at `sweep`, and the 0.10 band around
      // it is the bright scan line itself.
      const rel = (u - sweep) / 0.10;
      const imaged = rel < -1 ? 1 : rel > 1 ? 0 : (1 - (rel + 1) / 2);

      let cold, warm;
      if (isLand) {
        // Deserts by latitude, ice at the caps: enough truth to be recognisable
        // without carrying a second texture.
        const dry = Math.exp(-Math.pow((absLat - 24) / 9, 2));
        warm = mix(LAND, DESERT, dry * 0.85);
        if (absLat > 66) warm = mix(warm, ICE, Math.min(1, (absLat - 66) / 10));
        cold = mix(LAND_DARK, [50, 58, 64], 0.4);
      } else {
        warm = mix(OCEAN, [12, 48, 92], Math.min(1, absLat / 90));
        if (absLat > 74) warm = mix(warm, ICE, Math.min(1, (absLat - 74) / 12));
        cold = OCEAN_DARK;
      }
      let c = mix(cold, warm, imaged);

      // The scan line, and its glow just ahead of it.
      const band = Math.abs(u - sweep);
      if (band < 0.014) c = mix(c, SCAN, 1 - band / 0.014);
      else if (u > sweep && band < 0.05) c = mix(c, SCAN, (1 - band / 0.05) * 0.18);

      // Shade the limb so the disc is a ball, not a sticker.
      const shade = 0.55 + 0.45 * (z / R);
      c = [c[0] * shade, c[1] * shade, c[2] * shade];
      // A soft specular on the imaged side, up and left.
      const spec = Math.max(0, 1 - Math.hypot(u + 0.16, v + 0.17) / 0.30);
      c = mix(c, [255, 255, 255], spec * spec * 0.14 * imaged);

      rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2];
      rgba[o + 3] = 1;
    }
  }

  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      const n = SS * SS;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4;
          r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3];
        }
      }
      if (a / n < 0.42) { idx[y * OUT + x] = 0; continue; }
      const w = a / n;
      idx[y * OUT + x] = nearest(pal, r / n / w, g / n / w, b / n / w);
    }
  }
  return idx;
}

export function worldviewIcon() {
  const pal = buildPalette();
  const land = loadMask();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, land, f / FRAMES));
  const CT = 32;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0;
    flat[i * 3 + 1] = pal[i][1] | 0;
    flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return {
    width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 5,
    frames, delayCs: 10, transparentIndex: 0,
  };
}
