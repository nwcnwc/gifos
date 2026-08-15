// Procedural icon for FPS Simple: a dark card looking down a sand-coloured
// street at dusk, with a gold reticle centred on it. The reticle's four arms
// breathe in and out across the frames the way a crosshair does when you move,
// and a faint muzzle glow pulses once per loop.
//
// Pure Node — no canvas. A super-sampled RGBA image is painted per frame,
// box-downsampled, and quantized to a small palette with a 1-bit transparent
// surround (the shape encode() wants for opts.preview). Deterministic, so
// builds reproduce byte for byte.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD = [16, 15, 22];
const SKY_HI = [92, 116, 150], SKY_LO = [186, 168, 138];
const GROUND = [150, 120, 82], GROUND_D = [96, 76, 52];
const WALL_L = [122, 116, 106], WALL_R = [74, 70, 66];
const GOLD = [214, 172, 78], GOLD_HI = [255, 232, 176];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

function rr(x, y, m, r) { // inside a rounded rect [m..OUT-m] with radius r
  const lo = m, hi = OUT - m;
  const inX = x >= lo && x <= hi, inY = y >= lo && y <= hi;
  if (!inX || !inY) return false;
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const cx = Math.min(Math.max(x, lo + r), hi - r);
  const cy = Math.min(Math.max(y, lo + r), hi - r);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function buildPalette() {
  const pal = [[0, 0, 0]]; // index 0 reserved transparent
  const bases = [CARD, SKY_HI, SKY_LO, GROUND, GROUND_D, WALL_L, WALL_R, GOLD, GOLD_HI];
  for (const b of bases) {
    pal.push(b);
    pal.push(mix(b, [255, 255, 255], 0.18));
    pal.push(mix(b, [0, 0, 0], 0.3));
  }
  // a few extra sky/ground steps so the gradients do not band badly
  for (let i = 1; i <= 6; i++) pal.push(mix(SKY_HI, SKY_LO, i / 7));
  for (let i = 1; i <= 4; i++) pal.push(mix(GROUND, GROUND_D, i / 5));
  return pal;
}

function nearest(pal, r, g, b) {
  let best = 1, bd = Infinity;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i];
    const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// One frame. `spread` is how far the reticle arms sit from centre (0..1),
// `flash` is the muzzle glow (0..1).
function frameIndices(pal, spread, flash) {
  const rgba = new Float32Array(RW * RW * 4);
  const HORIZON = OUT * 0.52;

  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = px / SS, y = py / SS;
      const o = (py * RW + px) * 4;
      if (!rr(x, y, 4, 16)) continue;

      let col;
      if (y < HORIZON) {
        // sky, brightening toward the horizon
        col = mix(SKY_HI, SKY_LO, Math.pow(y / HORIZON, 1.6));
      } else {
        // the street receding to a vanishing point at the centre of the horizon
        const d = (y - HORIZON) / (OUT - HORIZON); // 0 at horizon, 1 at the bottom
        col = mix(GROUND_D, GROUND, 0.25 + d * 0.75);
        // a scatter of stones, fixed by position so it does not crawl
        const n = ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1 + 1) % 1;
        if (n > 0.94 - d * 0.06) col = mix(col, GROUND_D, 0.5);
      }

      // buildings left and right, converging on the vanishing point
      const cx = OUT / 2;
      const relY = (y - HORIZON) / (OUT - HORIZON);
      if (y > HORIZON * 0.34) {
        const openness = Math.max(0, relY) * 0.42 + 0.10; // street widens toward us
        const edgeL = cx - openness * OUT, edgeR = cx + openness * OUT;
        if (x < edgeL) {
          const t = Math.min(1, (edgeL - x) / (OUT * 0.42));
          col = mix(WALL_L, mix(WALL_L, [0, 0, 0], 0.45), t);
          // window slots
          if (((x * 0.22 + 9) | 0) % 3 === 0 && ((y * 0.16) | 0) % 3 === 1 && y < HORIZON + 8) col = mix(col, [30, 26, 26], 0.75);
        } else if (x > edgeR) {
          const t = Math.min(1, (x - edgeR) / (OUT * 0.42));
          col = mix(WALL_R, mix(WALL_R, [0, 0, 0], 0.35), t);
          if (((x * 0.22) | 0) % 3 === 0 && ((y * 0.16) | 0) % 3 === 1 && y < HORIZON + 8) col = mix(col, [26, 22, 22], 0.75);
        }
      }

      // muzzle glow, low right, as if a weapon just fired off-frame
      if (flash > 0.01) {
        const gx = x - OUT * 0.74, gy = y - OUT * 0.88;
        const g = Math.max(0, 1 - Math.hypot(gx, gy) / (OUT * 0.30));
        if (g > 0) col = mix(col, GOLD_HI, g * g * flash * 0.75);
      }

      // the reticle: four arms and a dot, dead centre
      const rx = Math.abs(x - cx), ry = Math.abs(y - OUT * 0.5);
      const gap = 5 + spread * 7, arm = 12, th = 1.6;
      const onV = rx <= th && ry >= gap && ry <= gap + arm;
      const onH = ry <= th && rx >= gap && rx <= gap + arm;
      const dot = rx * rx + ry * ry <= 2.2 * 2.2;
      if (onV || onH || dot) col = dot ? GOLD_HI : GOLD;

      rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1;
    }
  }

  // box-downsample SS×SS → OUT, threshold coverage for 1-bit transparency
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
      if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
      idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
    }
  }
  return idx;
}

export function fpsSimpleIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) {
    const p = f / FRAMES;
    const spread = 0.5 - 0.5 * Math.cos(p * Math.PI * 2);       // breathe in and out
    const flash = Math.max(0, 1 - Math.abs(p - 0.12) / 0.10);   // one muzzle pulse
    frames.push(frameIndices(pal, spread, flash));
  }
  // The GIF colour table must be a power of two and a FLAT byte array
  // (numColors*3). Pad to 64; the tail entries stay unused.
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 9, transparentIndex: 0 };
}
