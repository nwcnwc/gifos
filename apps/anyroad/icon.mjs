// Procedural icon for Anyroad: a road running to a horizon, with the centre
// dashes streaming toward you. Pure Node — no canvas. A super-sampled RGBA
// image is painted per frame, box-downsampled, and quantised to a small palette
// with a 1-bit transparent surround (the shape encode() wants for opts.preview).
// Deterministic, so builds reproduce byte-for-byte.
//
// The animation is the whole point: a static road reads as a logo, a moving one
// reads as a game. Dash phase advances by exactly one dash period across the
// frame set so the loop is seamless.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 8;

const CARD = [13, 20, 36];
const SKY_HI = [44, 92, 150], SKY_LO = [128, 170, 200];
const GROUND = [46, 74, 46];
const ROAD = [38, 40, 46], ROAD_EDGE = [92, 96, 104];
const DASH = [226, 214, 150];
const CAR = [214, 58, 48], CAR_DARK = [140, 32, 28];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

// Rounded-rect test in OUT-space.
function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r);
  const cy = Math.min(Math.max(y, lo + r), hi - r);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r || (x >= lo + r && x <= hi - r) || (y >= lo + r && y <= hi - r);
}

function buildPalette() {
  const pal = [[0, 0, 0]];                       // index 0 reserved: transparent
  const bases = [CARD, GROUND, ROAD, ROAD_EDGE, DASH, CAR, CAR_DARK];
  bases.forEach((c) => pal.push(c));
  // Sky gradient steps and a couple of road-shade steps, so bands do not posterise.
  for (let i = 0; i < 8; i++) pal.push(mix(SKY_HI, SKY_LO, i / 7).map(Math.round));
  for (let i = 0; i < 5; i++) pal.push(mix(ROAD, [70, 74, 82], i / 4).map(Math.round));
  for (let i = 0; i < 4; i++) pal.push(mix(GROUND, [72, 104, 64], i / 3).map(Math.round));
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

// The horizon sits a third of the way down; the road is a trapezoid narrowing
// to a vanishing point on it. Depth `t` runs 0 at the horizon to 1 at the
// bottom edge, and everything perspective-ish is driven off t².
const HORIZON = 0.42, VANISH_X = 0.5;

function frameIndices(pal, phase) {
  const rgba = new Float32Array(RW * RW * 4);

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      if (!inCard(x, y, 3, 26)) continue;

      const u = x / OUT, v = y / OUT;
      let col;

      if (v < HORIZON) {
        col = mix(SKY_HI, SKY_LO, Math.pow(v / HORIZON, 0.7));
      } else {
        const t = (v - HORIZON) / (1 - HORIZON);        // 0 at horizon, 1 at bottom
        const persp = t * t;                             // widen fast as it nears
        const halfWidth = 0.012 + persp * 0.60;
        const centre = VANISH_X;
        const dx = Math.abs(u - centre);

        if (dx < halfWidth) {
          const across = dx / halfWidth;
          col = mix(ROAD, [70, 74, 82], 0.25 * (1 - t));
          if (across > 0.90) col = mix(col, ROAD_EDGE, (across - 0.90) / 0.10);
          // Centre dashes: phase in "depth" so they stream toward the viewer.
          const depth = 1 / Math.max(0.06, t);           // far = large depth
          const s = (depth * 1.6 + phase) % 1;
          if (across < 0.075 && s < 0.5) col = DASH;
        } else {
          col = mix(GROUND, [72, 104, 64], 0.35 * t);
        }
      }

      // A small car near the bottom, drawn in flat blocks.
      const cy = 0.795, cx = 0.5;
      const bodyW = 0.150, bodyH = 0.052;
      if (Math.abs(u - cx) < bodyW && Math.abs(v - cy) < bodyH) col = CAR;
      const cabW = 0.098, cabH = 0.040;
      if (Math.abs(u - cx) < cabW && Math.abs(v - (cy - 0.055)) < cabH) col = mix(CAR, CAR_DARK, 0.55);
      // Wheels, poking below the body.
      if (Math.abs(v - (cy + 0.052)) < 0.022 &&
          (Math.abs(u - (cx - 0.128)) < 0.030 || Math.abs(u - (cx + 0.128)) < 0.030)) col = [26, 26, 30];

      const o = (py * RW + px) * 4;
      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
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

export function anyroadIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f / FRAMES));
  const CT = 32;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 5,
           frames, delayCs: 9, transparentIndex: 0 };
}
