/* The App GIF's visible animation.
 *
 * FIRST VERSION FAILED, and it failed measurably. A critic put it on a real Home
 * Screen at 64px beside the seeded apps and came back with numbers: the marks
 * covered 10.3% of the tile where a working glyph covers 30-50%; the upper-left
 * 40% was empty in every frame; the strokes were hairlines that merged into each
 * other at icon size; and — worst — the loop opened by growing a line out of a
 * single dot, so for a third of every 1.9 seconds the icon was A BLANK BLACK
 * SQUARE. Glance at your Home Screen at a random moment and one time in three
 * there was nothing there.
 *
 * The idea was right and the drawing was wrong. So this version keeps the idea
 * and changes everything about how it is made:
 *
 *   MASS, NOT LINES. The spread of outcomes is a FILLED wedge, which is what
 *   gives the tile something to be at a glance. The icons in this catalog that
 *   survive 64px are the ones with a big solid shape in them.
 *
 *   NEVER BLANK. Every mark is drawn in every frame. The only thing that moves
 *   is a marker running down the one branch that fails, so the animation
 *   demonstrates the app's whole point — most of these retirements are fine, one
 *   of them ends on the floor — without the icon ever being empty.
 *
 *   IT FILLS THE TILE. The plot runs corner to corner instead of hugging one
 *   side, and the strokes are thick enough to stay separate at icon size.
 *
 * Super-sample, box-downsample, small palette, deterministic — the GIF has to
 * rebuild byte-identical or the catalog check flaps.
 */

const OUT = 128, SS = 3, RW = OUT * SS;
const FRAMES = 18;

const CARD  = [23, 23, 30];
const FILL  = [30, 68, 128];     // the spread of outcomes, as a mass
const FILL2 = [42, 96, 172];     // its brighter core
const BLUE  = [96, 165, 245];    // the typical run
const RED   = [224, 72, 72];     // the one that runs out
const GRID  = [48, 48, 60];

// Plot box in 128-space — corner to corner, not tucked into one side.
const X0 = 11, X1 = 117, YB = 110, YT = 17;
const FORK = 0.42;

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// The climb, shared by every outcome: savings compounding, so it leaves the
// floor slowly and steepens.
function climb(t, endY) {
  return YB - (YB - endY) * Math.pow(t, 1.75);
}
const FORK_X = X0 + (X1 - X0) * FORK;
const FORK_Y = climb(1, 74);

// Upper and lower edges of the fan after the fork, and the typical run between.
function upper(t) { return FORK_Y + (YT - FORK_Y) * Math.pow(t, 0.85); }
function lower(t) { return FORK_Y + (86 - FORK_Y) * Math.pow(t, 0.9); }
function median(t) { return FORK_Y + (46 - FORK_Y) * Math.pow(t, 0.9); }
// The run that empties: sags early, then flattens along the floor and stays.
function ruin(t) {
  const s = Math.min(1, t / 0.72);
  return FORK_Y + (YB - FORK_Y) * (1 - Math.pow(1 - s, 2.1));
}
const xAt = (t) => FORK_X + (X1 - FORK_X) * t;

function rounded(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r);
  const cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const base of [CARD, GRID, FILL, FILL2, BLUE, RED]) {
    for (let s = 0; s <= 5; s++) pal.push(mix(base, CARD, s * 0.17).map(Math.round));
    pal.push(mix(base, [255, 255, 255], 0.25).map(Math.round));
  }
  while (pal.length < 64) pal.push([0, 0, 0]);
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

function frame(pal, f) {
  const rgb = new Float32Array(RW * RW * 3);
  const alpha = new Float32Array(RW * RW);
  const set = (o, c) => { rgb[o * 3] = c[0]; rgb[o * 3 + 1] = c[1]; rgb[o * 3 + 2] = c[2]; };

  // The card, and the fan painted as a FIELD — this is the mass that makes the
  // tile read as something rather than as an empty square with wires on it.
  for (let py = 0; py < RW; py++) {
    for (let px = 0; px < RW; px++) {
      const x = (px + 0.5) / SS, y = (py + 0.5) / SS;
      if (!rounded(x, y, 4, 27)) continue;
      const o = py * RW + px;
      alpha[o] = 1;
      set(o, CARD);
      if (x < X0 || x > X1 || y > YB || y < YT) continue;

      if (x <= FORK_X) {
        // Before the fork every outcome is the same climb, so the field is the
        // area under it.
        const t = (x - X0) / (FORK_X - X0);
        if (y >= climb(t, 74)) set(o, FILL2);
      } else {
        const t = (x - FORK_X) / (X1 - FORK_X);
        const hi = upper(t), lo = lower(t), md = median(t);
        if (y >= hi && y <= lo) set(o, y >= md ? FILL2 : FILL);
      }
    }
  }

  const put = (x, y, col, w) => {
    const r = w * SS / 2;
    const cx = x * SS, cy = y * SS;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(RW - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(RW - 1, Math.ceil(cy + r));
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = px + 0.5 - cx, dy = py + 0.5 - cy;
        if (dx * dx + dy * dy > r * r) continue;
        const o = py * RW + px;
        if (alpha[o]) set(o, col);
      }
    }
  };
  const curve = (fn, x0, x1, col, w) => {
    const n = 64;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      put(x0 + (x1 - x0) * t, fn(t), col, w);
    }
  };

  // The floor. Something for the failing line to land ON.
  for (let x = X0 - 1; x <= X1 + 1; x += 0.5) put(x, YB + 3, GRID, 2.4);

  // Everything is drawn in every frame. Nothing grows from nothing.
  curve((t) => climb(t, 74), X0, FORK_X, BLUE, 5.2);
  curve((t) => median(t), FORK_X, X1, BLUE, 5.2);
  // THE RED BRANCH IS THE STORY, so it is the heaviest line on the tile, not the
  // lightest. It was 4.6 against a large filled wedge, which made the dominant
  // read at 64px "blue thing goes up" — the exact opposite of the warning this
  // icon exists to deliver.
  curve((t) => ruin(t), FORK_X, X1, RED, 7);

  // The only thing that moves: a marker running down the branch that empties,
  // pausing where it lands. The eye follows it to the floor, which is the app's
  // entire thesis in one gesture — so it has to be unmistakably the subject
  // rather than a speck.
  const t = Math.min(1, (f / FRAMES) * 1.45);
  put(xAt(t), ruin(t), [255, 240, 240], 16);
  put(xAt(t), ruin(t), RED, 12);

  // Downsample.
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const o = (y * SS + sy) * RW + (x * SS + sx);
          a += alpha[o];
          r += rgb[o * 3]; g += rgb[o * 3 + 1]; b += rgb[o * 3 + 2];
        }
      }
      const n = SS * SS;
      if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
      idx[y * OUT + x] = nearest(pal, r / a, g / a, b / a);
    }
  }
  return idx;
}

export function retirementIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frame(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0;
    flat[i * 3 + 1] = pal[i][1] | 0;
    flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return {
    width: OUT, height: OUT, palette: flat, numColors: CT,
    minCodeSize: 6, frames, delayCs: 10, transparentIndex: 0
  };
}

/* The critic's measurement, as a build-time check.
 *
 * "It looks better" is not a thing anybody can hold a future edit to. INK is:
 * the share of the tile that is not card and not transparent, in the WORST
 * frame. The version this replaced measured 10.3% at its fullest and 0.13% at
 * its emptiest, which is what made it a blank square a third of the time.
 */
export function iconInk() {
  const pal = buildPalette();
  const cardIdx = nearest(pal, CARD[0], CARD[1], CARD[2]);
  let worst = 1, best = 0;
  for (let f = 0; f < FRAMES; f++) {
    const px = frame(pal, f);
    let on = 0, lit = 0;
    for (let i = 0; i < px.length; i++) {
      if (!px[i]) continue;
      on++;
      const p = pal[px[i]];
      // Anything visibly off the card colour counts as a mark.
      if (px[i] !== cardIdx
        && (Math.abs(p[0] - CARD[0]) + Math.abs(p[1] - CARD[1]) + Math.abs(p[2] - CARD[2])) > 24) lit++;
    }
    const share = on ? lit / on : 0;
    if (share < worst) worst = share;
    if (share > best) best = share;
  }
  return { worst: worst, best: best, frames: FRAMES };
}
