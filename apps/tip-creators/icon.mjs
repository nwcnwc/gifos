/* The App GIF's visible animation: a gold coin with a heart struck into it,
 * a highlight sweeping across the face so the tile reads as metal.
 *
 * The retirement icon's lesson is load-bearing here (see its icon.mjs): a
 * Home Screen glyph must NEVER be blank in any frame and must carry real ink
 * at 64px. So the coin is a big FILLED disc — about 40% of the tile in every
 * single frame — and the only thing that animates is light moving over it.
 * Glance at any moment and the coin is simply there.
 */

const OUT = 128, SS = 3, RW = OUT * SS;
const FRAMES = 18;

const CARD   = [23, 23, 30];
const RIM    = [172, 121, 22];   // the coin's edge
const GOLD   = [255, 196, 57];   // the face
const GOLD_D = [217, 158, 27];   // its shaded lower half
const HEART  = [163, 96, 10];    // the heart, struck (darker, not a hole)
const SHINE  = [255, 232, 160];  // the sweeping highlight
const SPARK  = [255, 250, 235];  // the sparkle

const CX = 64 * SS, CY = 64 * SS, R = 46 * SS, RIM_W = 4.5 * SS;

// Implicit heart, centered/scaled into the coin face. Classic sextic:
// (x^2 + y^2 - 1)^3 - x^2 y^3 <= 0, y up.
function inHeart(px, py) {
  const x = (px - CX) / (R * 0.62);
  const y = -(py - CY + 4 * SS) / (R * 0.62);
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y <= 0;
}

function colorAt(px, py, f) {
  const dx = px - CX, dy = py - CY;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d > R) {
    // Sparkle: a small dot orbiting just outside the rim, twice per loop.
    const ang = (f / FRAMES) * Math.PI * 4;
    const sx = CX + Math.cos(ang - 0.9) * (R + 9 * SS);
    const sy = CY + Math.sin(ang - 0.9) * (R + 9 * SS) * 0.92;
    const sd = Math.hypot(px - sx, py - sy);
    if (sd < 3.2 * SS) return SPARK;
    return CARD;
  }
  if (d > R - RIM_W) return RIM;
  // The sweeping highlight: a diagonal band whose offset walks the coin.
  const t = f / FRAMES;
  const band = (dx + dy) / Math.SQRT2 - (t * 2 - 1) * (R * 2.2);
  const lit = Math.abs(band) < 10 * SS;
  if (inHeart(px, py)) return lit ? GOLD_D : HEART;
  if (lit) return SHINE;
  return dy > R * 0.35 ? GOLD_D : GOLD;
}

function buildPalette() {
  // Index 0 is transparent by convention; the card is a real color.
  return [[0, 0, 0], CARD, RIM, GOLD, GOLD_D, HEART, SHINE, SPARK];
}
function nearest(pal, r, g, b) {
  let best = 1, bd = Infinity;
  for (let i = 1; i < pal.length; i++) {
    const d = (pal[i][0] - r) ** 2 + (pal[i][1] - g) ** 2 + (pal[i][2] - b) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

function frame(pal, f) {
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      // Supersample: average SS x SS true-color samples, then index.
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = colorAt(x * SS + sx, y * SS + sy, f);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS;
      idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
    }
  }
  return idx;
}

export function tipIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frame(pal, f));
  const CT = 8;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0;
    flat[i * 3 + 1] = pal[i][1] | 0;
    flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return {
    width: OUT, height: OUT, palette: flat, numColors: CT,
    minCodeSize: 3, frames, delayCs: 10, transparentIndex: 0,
  };
}

// The critic's measurement, as a build-time check (same doctrine as
// retirement/icon.mjs): ink = share of the tile that is a mark — not card,
// not transparent — in the WORST frame. The coin must never fade or blink.
export function iconInk() {
  const pal = buildPalette();
  let worst = 1, best = 0;
  for (let f = 0; f < FRAMES; f++) {
    const px = frame(pal, f);
    let on = 0, lit = 0;
    for (let i = 0; i < px.length; i++) {
      if (!px[i]) continue;
      on++;
      if (px[i] !== 1) lit++; // anything that isn't the card is a mark
    }
    const share = on ? lit / on : 0;
    if (share < worst) worst = share;
    if (share > best) best = share;
  }
  return { worst, best, frames: FRAMES };
}
