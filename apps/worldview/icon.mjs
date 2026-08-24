/*
 * icon.mjs — the App GIF's own animation: an Earth being imaged.
 *
 * The icon is judged at 64 px on a Home Screen next to a dozen others, and the
 * rule the gauntlet sets is that the animation has to DEMONSTRATE, not wiggle.
 *
 * What this app is: A NEW PICTURE OF THE EARTH, EVERY DAY. So the icon is one
 * full, sunlit disc — the shot a whole-Earth camera actually returns — and the
 * loop is today's picture being replaced by the next one: a bright scan line
 * crosses the disc and the weather behind it is a different day's weather, then
 * a beat, then it happens again the other way. Land, ocean and the coastlines
 * never move, so the thing is legible at 64 px; the clouds do, so the motion
 * says "new imagery" rather than "world".
 *
 * Two earlier cuts were wrong in instructive ways, both caught by a critic who
 * only ever saw the frames: a band sweeping a STILL globe held for half the
 * loop (two moments a second apart were identical — "a JPEG wearing a .gif
 * extension"), and then a ROTATING globe, which is what every browser, VPN and
 * translation app on Earth already uses, with a hard terminator that read as a
 * scratch and five frames of anonymous Pacific in the middle of the loop.
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
const OUT = 128, SS = 3, RW = OUT * SS;
// 8 frames of wipe, 2 of hold, twice — so the loop closes on itself and the
// only still moments are the deliberate beats.
const WIPE = 8, HOLD = 2, FRAMES = (WIPE + HOLD) * 2;
const MASK_W = 512, MASK_H = 256;

// A sunlit disc: no night side, because a whole-Earth picture does not have one.
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
 * 128 colours, and the count is CHECKED. The first cut built 35 entries into a
 * 32-colour table: nearest() happily returned index 33, the encoder wrote a
 * 32-entry palette, and every pixel that landed past the end came out as
 * whatever the decoder had there — continents of white sitting over the
 * Sahara. A palette that overflows does not warn, it hallucinates.
 */
const CT = 128;

function buildPalette() {
  const pal = [[0, 0, 0]];                     // 0 is the transparent surround
  const push = (c) => pal.push(c.map(Math.round));
  [SPACE, ICE, SCAN, RIM].forEach(push);
  const ramp = (a, b, n) => { for (let i = 0; i < n; i++) push(mix(a, b, i / (n - 1))); };
  ramp(OCEAN_DARK, OCEAN, 6);
  ramp([16, 58, 104], OCEAN, 8);               // cold ocean to warm ocean
  ramp(OCEAN, [110, 175, 225], 5);             // shallow water and the specular
  ramp(LAND_DARK, LAND, 8);                    // land, unimaged to imaged
  ramp(LAND_DARK, DESERT, 6);
  ramp(LAND, DESERT, 6);
  ramp(DESERT, ICE, 4);                        // desert into snow line
  ramp(SPACE, RIM, 6);                         // the atmosphere's own steps
  ramp(mix(OCEAN, SCAN, 0.5), SCAN, 4);        // the scan line over water
  ramp(OCEAN, [242, 246, 252], 6);             // cloud over sea
  ramp(LAND, [242, 246, 252], 5);              // cloud over land
  ramp(DESERT, [242, 246, 252], 4);
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
 * An orthographic globe centred on (LON0, 0) — the projection a person means
 * when they say "the Earth from space".
 */
const LON0 = 14;                    // Africa and Europe: the most legible face
const R = 0.452;                    // globe radius as a fraction of the icon

// Cheap value noise, seeded, sampled in lat/lon. Two octaves is enough to read
// as weather at 64 px and cheap enough to run per super-sample.
function noise2(seed, x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return s - Math.floor(s);
}
function smooth(seed, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = noise2(seed, xi, yi), b = noise2(seed, xi + 1, yi);
  const c = noise2(seed, xi, yi + 1), d = noise2(seed, xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
// A day's weather: banded, so it reads as fronts and cyclones rather than fog.
function cloudAt(day, lon, lat) {
  const x = lon / 26, y = lat / 15;
  let n = smooth(day * 7 + 1, x, y) * 0.62 + smooth(day * 7 + 2, x * 2.3, y * 2.3) * 0.38;
  n += 0.10 * Math.sin(lat / 9 + smooth(day * 7 + 3, x, y) * 3);
  const t = (n - 0.52) / 0.30;
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}

/*
 * phase 0..1 over the whole loop. The first half wipes day A into day B, the
 * second half wipes B back into A; each half ends with a short hold so the
 * picture can be READ before it changes again.
 */
function frameIndices(pal, land, frame) {
  const rgba = new Float32Array(RW * RW * 4);
  const half = WIPE + HOLD;
  const inSecond = frame >= half;
  const k = frame % half;
  const wiping = k < WIPE;
  // The wipe front travels a little past both limbs so nothing is left behind.
  const front = wiping ? -0.56 + (k / (WIPE - 1)) * 1.12 : 0.62;
  const dayNew = inSecond ? 1 : 0;          // the day arriving behind the front
  const dayOld = inSecond ? 0 : 1;

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const u = px / RW - 0.5, v = py / RW - 0.5;
      const d = Math.sqrt(u * u + v * v);
      const o = (py * RW + px) * 4;

      if (d > R + 0.048) continue;                       // transparent surround

      if (d > R) {
        // Atmosphere, all the way around, a touch brighter towards the light.
        const t = 1 - (d - R) / 0.048;
        const lit = 0.62 + 0.38 * Math.max(0, Math.min(1, (0.4 - u - v) / 0.8));
        const c = mix(SPACE, RIM, t * t * 0.95 * lit);
        rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2];
        rgba[o + 3] = t * t;
        continue;
      }

      const z = Math.sqrt(Math.max(0, R * R - u * u - v * v));
      const lat = Math.asin(v / R) * -180 / Math.PI;
      const lon = LON0 + Math.atan2(u, z) * 180 / Math.PI;
      const absLat = Math.abs(lat);
      const isLand = land(lon, lat);

      // The ground: fixed, so the icon is the same recognisable Earth in every
      // frame. Deserts by latitude, ice at the caps, a warmer ocean at the
      // equator — cos(lat), never |lat|, which leaves a hairline at the equator.
      let ground;
      if (isLand) {
        const dry = Math.exp(-Math.pow((absLat - 24) / 10, 2));
        ground = mix(LAND, DESERT, dry * 0.85);
        if (absLat > 62) ground = mix(ground, ICE, Math.min(1, (absLat - 62) / 12));
      } else {
        ground = mix([16, 58, 104], OCEAN, Math.cos(lat * Math.PI / 180));
        if (absLat > 70) ground = mix(ground, ICE, Math.min(1, (absLat - 70) / 14));
      }

      // The weather: which day's clouds this pixel is showing depends on
      // whether the front has passed it.
      const day = (u < front) ? dayNew : dayOld;
      const cloud = cloudAt(day, lon, lat);
      let c = mix(ground, [242, 246, 252], cloud * 0.92);

      // The scan line and a short glow ahead of it.
      if (wiping) {
        const band = Math.abs(u - front);
        if (band < 0.014) c = mix(c, SCAN, 1 - band / 0.014);
        else if (u > front && band < 0.055) c = mix(c, SCAN, (1 - band / 0.055) * 0.3);
      }

      // Round it: limb darkening plus a soft specular up and left.
      const shade = 0.66 + 0.34 * (z / R);
      c = [c[0] * shade, c[1] * shade, c[2] * shade];
      const spec = Math.max(0, 1 - Math.hypot(u + 0.16, v + 0.19) / 0.34);
      c = mix(c, [255, 255, 255], spec * spec * 0.18);

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
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, land, f));
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0;
    flat[i * 3 + 1] = pal[i][1] | 0;
    flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return {
    width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 7,
    frames, delayCs: 8, transparentIndex: 0,
  };
}
