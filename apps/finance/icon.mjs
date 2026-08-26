/* The App GIF's visible animation.
 *
 * Written against the rule the Retirement Calculator's icon paid for: an icon
 * is looked at for a fifth of a second on a crowded Home Screen, so it must
 * have MASS in every single frame, and nothing may animate by appearing from
 * nothing. Its first version grew a line out of a dot and was therefore a
 * blank tile a third of the time; that is a measured failure mode, not a
 * matter of taste, and iconInk() below holds this one to the same bar.
 *
 * So: five filled columns and a rising line, all present in all frames. The
 * only thing that moves is a marker travelling along the line and the column
 * beneath it lighting up as it passes — which reads, at a glance, as money
 * being counted across accounts.
 *
 * Super-sampled 3x and box-downsampled, fixed palette, no randomness: the GIF
 * must rebuild byte-identical or the catalog drift check flaps.
 */

const OUT = 128, SS = 3, RW = OUT * SS;
const FRAMES = 20;

const CARD = [22, 26, 33];
const BAR  = [30, 96, 78];      // the columns
const BAR2 = [38, 132, 104];    // the lit column
const LINE = [64, 214, 158];    // the total running across them
const MARK = [226, 240, 232];   // the marker on it
const GRID = [44, 52, 62];

// Layout, in OUT-space. Deliberately corner to corner: an icon that hugs one
// side of its tile reads as a mistake at 64px.
const X0 = 12, X1 = 116, YB = 112, YT = 20;
const COLS = [0.34, 0.52, 0.44, 0.72, 0.94];   // column heights, 0..1 of YB-YT

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function buildPalette() {
  const inks = [CARD, GRID, BAR, BAR2, LINE, MARK];
  const pal = [[0, 0, 0]];                       // index 0 = transparent
  const seen = new Set(['t']);
  for (const ink of inks) {
    for (const t of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const c = mix(CARD, ink, t).map((v) => Math.round(v));
      const k = c.join(',');
      if (seen.has(k)) continue;
      seen.add(k);
      pal.push(c);
    }
  }
  return pal;
}
function nearest(pal, r, g, b) {
  let best = 1, bd = Infinity;
  for (let i = 1; i < pal.length; i++) {
    const p = pal[i];
    const d = (p[0] - r) * (p[0] - r) + (p[1] - g) * (p[1] - g) + (p[2] - b) * (p[2] - b);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// ---- drawing, in supersampled space ----------------------------------------

function makeBuf() {
  const buf = new Float64Array(RW * RW * 3);
  for (let i = 0; i < RW * RW; i++) {
    buf[i * 3] = CARD[0]; buf[i * 3 + 1] = CARD[1]; buf[i * 3 + 2] = CARD[2];
  }
  return buf;
}
function px(buf, x, y, c) {
  if (x < 0 || y < 0 || x >= RW || y >= RW) return;
  const i = ((y | 0) * RW + (x | 0)) * 3;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2];
}
function rect(buf, x, y, w, h, c) {
  const x0 = Math.round(x * SS), y0 = Math.round(y * SS);
  const x1 = Math.round((x + w) * SS), y1 = Math.round((y + h) * SS);
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) px(buf, xx, yy, c);
}
// A column with a rounded top — square-topped bars look like a fence, rounded
// ones read as a chart.
function column(buf, x, w, top, c) {
  const r = Math.min(w / 2, 3);
  rect(buf, x, top + r, w, YB - top - r, c);
  const cx = (x + w / 2) * SS, cy = (top + r) * SS, rr = r * SS;
  const x0 = Math.round(x * SS), x1 = Math.round((x + w) * SS);
  for (let yy = Math.round(top * SS); yy < Math.round((top + r) * SS) + 1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const dx = xx + 0.5 - cx, dy = yy + 0.5 - cy;
      if (dy > 0 || dx * dx + dy * dy <= rr * rr) px(buf, xx, yy, c);
    }
  }
}
function disc(buf, cx, cy, r, c) {
  const rr = r * SS, X = cx * SS, Y = cy * SS;
  for (let yy = Math.floor(Y - rr) - 1; yy <= Math.ceil(Y + rr) + 1; yy++) {
    for (let xx = Math.floor(X - rr) - 1; xx <= Math.ceil(X + rr) + 1; xx++) {
      const dx = xx + 0.5 - X, dy = yy + 0.5 - Y;
      if (dx * dx + dy * dy <= rr * rr) px(buf, xx, yy, c);
    }
  }
}
function segment(buf, x0, y0, x1, y1, w, c) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * SS * 2);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    disc(buf, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, c);
  }
}

const colX = (i) => X0 + i * ((X1 - X0) / COLS.length);
const colW = ((X1 - X0) / COLS.length) - 5;
const topOf = (i) => YB - COLS[i] * (YB - YT);
// The line runs across the tops of the columns, a little above each.
const lineY = (i) => topOf(i) - 7;

function frame(pal, f) {
  const buf = makeBuf();
  const t = f / FRAMES;

  // baseline + one grid line, so the columns are standing on something
  rect(buf, X0 - 4, YB, X1 - X0 + 8, 2.5, GRID);
  rect(buf, X0 - 4, YB - (YB - YT) * 0.5, X1 - X0 + 8, 1.2, GRID);

  // WHERE THE MARKER IS. Everything else keys off this, and it is the only
  // thing in the icon that changes between frames.
  const pos = t * COLS.length;              // 0 .. COLS.length
  const lit = Math.min(COLS.length - 1, Math.floor(pos));

  for (let i = 0; i < COLS.length; i++) {
    column(buf, colX(i), colW, topOf(i), i === lit ? BAR2 : BAR);
  }

  // the running total, drawn WHOLE in every frame
  for (let i = 0; i < COLS.length - 1; i++) {
    segment(buf, colX(i) + colW / 2, lineY(i), colX(i + 1) + colW / 2, lineY(i + 1), 3.4, LINE);
  }

  // the marker, sliding along it
  const seg = Math.min(COLS.length - 2, Math.floor(pos));
  const ft = Math.min(1, Math.max(0, pos - seg));
  const mx = (colX(seg) + colW / 2) + ((colX(seg + 1) + colW / 2) - (colX(seg) + colW / 2)) * ft;
  const my = lineY(seg) + (lineY(seg + 1) - lineY(seg)) * ft;
  disc(buf, mx, my, 6.4, LINE);
  disc(buf, mx, my, 4.2, MARK);

  return down(buf, pal);
}

// Box-downsample SS x SS to one output pixel, then snap to the palette.
function down(buf, pal) {
  const out = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = (((y * SS + sy) * RW) + (x * SS + sx)) * 3;
          r += buf[i]; g += buf[i + 1]; b += buf[i + 2];
        }
      }
      const n = SS * SS;
      out[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
    }
  }
  return out;
}

export function financeIcon() {
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
    minCodeSize: 6, frames, delayCs: 8, transparentIndex: 0
  };
}

/* The same build-time check the Retirement Calculator's icon carries, for the
 * same reason: "it looks fine" is not something a future edit can be held to.
 * INK is the share of the tile that is visibly off the card colour, in the
 * WORST frame. The failure this guards against measured 0.13%. */
export function iconInk() {
  const pal = buildPalette();
  let worst = 1, best = 0;
  for (let f = 0; f < FRAMES; f++) {
    const p = frame(pal, f);
    let on = 0, lit = 0;
    for (let i = 0; i < p.length; i++) {
      if (!p[i]) continue;
      on++;
      const c = pal[p[i]];
      if (Math.abs(c[0] - CARD[0]) + Math.abs(c[1] - CARD[1]) + Math.abs(c[2] - CARD[2]) > 24) lit++;
    }
    const share = on ? lit / on : 0;
    if (share < worst) worst = share;
    if (share > best) best = share;
  }
  return { worst, best, frames: FRAMES };
}
