/*
 * icon.mjs — the App GIF's own animation: an Earth being imaged.
 *
 * The icon is judged at 64 px on a Home Screen next to a dozen others, and the
 * rule the gauntlet sets is that the animation has to DEMONSTRATE, not wiggle.
 *
 * So it is the real thing, simplified: the Earth TURNS, and a fixed imaging
 * swath hangs in front of it. Land rises at the left limb dark and unimaged,
 * crosses the bright scan line, and comes out the other side in colour — which
 * is exactly how a polar orbiter builds a daily picture of a rotating planet.
 * Every frame differs from the last (the first cut swept a band across a still
 * globe and then held it for half the loop, so two moments a second apart
 * looked identical and the icon read as a JPEG).
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
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 20;
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

/*
 * 64 colours, and the count is CHECKED. The first cut built 35 entries into a
 * 32-colour table: nearest() happily returned index 33, the encoder wrote a
 * 32-entry palette, and every pixel that landed past the end came out as
 * whatever the decoder had there — continents of white sitting over the
 * Sahara. A palette that overflows does not warn, it hallucinates.
 */
const CT = 64;

function buildPalette() {
  const pal = [[0, 0, 0]];                     // 0 is the transparent surround
  const push = (c) => pal.push(c.map(Math.round));
  [SPACE, ICE, SCAN, RIM].forEach(push);
  const ramp = (a, b, n) => { for (let i = 0; i < n; i++) push(mix(a, b, i / (n - 1))); };
  ramp(OCEAN_DARK, OCEAN, 8);                  // the ocean, dim to lit
  ramp([12, 48, 92], OCEAN, 6);                // cold ocean to warm ocean
  ramp(OCEAN, [110, 175, 225], 5);             // shallow water and the specular
  ramp(LAND_DARK, LAND, 8);                    // land, unimaged to imaged
  ramp(LAND_DARK, DESERT, 6);
  ramp(LAND, DESERT, 6);
  ramp(DESERT, ICE, 5);                        // desert into snow line
  ramp(mix(LAND, ICE, 0.5), ICE, 5);
  ramp(SPACE, RIM, 6);                         // the atmosphere's own steps
  ramp(mix(OCEAN, SCAN, 0.5), SCAN, 4);        // the scan line over water
  if (pal.length > CT) throw new Error('icon palette has ' + pal.length + ' colours, table holds ' + CT);
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
  const spin = phase * 360;                 // a whole turn across the frame set
  const SWATH = -0.22;                      // where the scan line hangs, in screen x

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const u = px / RW - 0.5, v = py / RW - 0.5;
      const d = Math.sqrt(u * u + v * v);
      const o = (py * RW + px) * 4;

      if (d > R + 0.05) continue;                        // transparent surround

      if (d > R) {
        // Atmosphere: all the way around, brightest on the imaged side. A hard
        // arc on one shoulder reads as a selection glow, not as air.
        const t = 1 - (d - R) / 0.05;
        const side = 0.45 + 0.55 * Math.max(0, Math.min(1, (u - SWATH + 0.35) / 0.7));
        const c = mix(SPACE, RIM, t * t * 0.95 * side);
        rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2];
        rgba[o + 3] = t * t;
        continue;
      }

      // Sphere point, with the globe turned by `spin`.
      const z = Math.sqrt(Math.max(0, R * R - u * u - v * v));
      const lat = Math.asin(v / R) * -180 / Math.PI;
      const lon = LON0 + spin + Math.atan2(u, z) * 180 / Math.PI;
      const isLand = land(lon, lat);
      const absLat = Math.abs(lat);

      // Imaged behind the swath, not yet imaged in front of it. Features enter
      // at the left limb dark and leave the right limb in colour.
      const rel = (u - SWATH) / 0.085;
      const imaged = rel > 1 ? 1 : rel < -1 ? 0 : (rel + 1) / 2;

      // Colour. Latitude bands use cos(lat), not |lat| — the absolute value has
      // a kink at the equator, and after quantising that kink is a visible
      // hairline straight across the planet.
      const warmth = Math.cos(lat * Math.PI / 180);
      let cold, warm;
      if (isLand) {
        const dry = Math.exp(-Math.pow((absLat - 24) / 10, 2));
        warm = mix(LAND, DESERT, dry * 0.85);
        if (absLat > 64) warm = mix(warm, ICE, Math.min(1, (absLat - 64) / 12));
        cold = mix(LAND_DARK, [44, 52, 60], 0.35);
      } else {
        warm = mix([12, 48, 92], OCEAN, warmth);
        if (absLat > 72) warm = mix(warm, ICE, Math.min(1, (absLat - 72) / 14));
        cold = OCEAN_DARK;
      }
      let c = mix(cold, warm, imaged);

      // The scan line itself, with a short glow ahead of it.
      const band = Math.abs(u - SWATH);
      if (band < 0.016) c = mix(c, SCAN, 1 - band / 0.016);
      else if (u > SWATH && band < 0.06) c = mix(c, SCAN, (1 - band / 0.06) * 0.22);

      // Shade the limb so the disc is a ball, and light it from up-left.
      const shade = 0.52 + 0.48 * (z / R);
      c = [c[0] * shade, c[1] * shade, c[2] * shade];
      const spec = Math.max(0, 1 - Math.hypot(u + 0.15, v + 0.18) / 0.32);
      c = mix(c, [255, 255, 255], spec * spec * 0.16 * imaged);

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
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0;
    flat[i * 3 + 1] = pal[i][1] | 0;
    flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return {
    width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6,
    frames, delayCs: 8, transparentIndex: 0,
  };
}
