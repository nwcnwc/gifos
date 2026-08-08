// Procedural icon for Sound It Out: "sat" on the night theme, with the
// highlight sweeping s -> a -> t and then the whole word lighting up cream -
// the app's own teaching cycle in eight frames. Pixel-art letterforms, drawn
// deliberately chunky. Deterministic, so builds reproduce byte-for-byte.
const OUT = 128, FRAMES = 8;

const NAVY = [13, 27, 42];    // theme night bg
const CREAM = [248, 244, 233]; // theme night fg
const GOLD = [255, 209, 102];  // theme night highlight
const DIM = [92, 107, 122];    // theme night dim
const ARC = [255, 227, 166];   // softer gold for the sound arcs

// 5x7 pixel letterforms.
const GLYPHS = {
  s: [
    '.####',
    '#....',
    '#....',
    '.###.',
    '....#',
    '....#',
    '####.',
  ],
  a: [
    '.....',
    '.....',
    '.###.',
    '....#',
    '.####',
    '#...#',
    '.####',
  ],
  t: [
    '..#..',
    '..#..',
    '#####',
    '..#..',
    '..#..',
    '..#..',
    '..##.',
  ],
};

function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r);
  const cy = Math.min(Math.max(y, lo + r), hi - r);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r || (x >= lo + r && x <= hi - r) || (y >= lo + r && y <= hi - r);
}

// palette indices
const T = 0, P_NAVY = 1, P_CREAM = 2, P_GOLD = 3, P_DIM = 4, P_ARC = 5;

function drawLetter(idx, glyph, x0, y0, scale, color) {
  const rows = GLYPHS[glyph];
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] !== '#') continue;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        const x = x0 + c * scale + dx, y = y0 + r * scale + dy;
        if (x >= 0 && x < OUT && y >= 0 && y < OUT) idx[y * OUT + x] = color;
      }
    }
  }
}

// A little arc of "sound" above a letter: three dots stepping out.
function drawArcs(idx, cx, cy, phase) {
  const radii = [10, 15, 20];
  for (let ri = 0; ri <= phase && ri < radii.length; ri++) {
    const rad = radii[ri];
    for (let a = -0.9; a <= 0.9; a += 0.12) {
      const x = Math.round(cx + rad * Math.sin(a));
      const y = Math.round(cy - rad * Math.cos(a) * 0.8);
      if (x >= 6 && x < OUT - 6 && y >= 6 && y < OUT - 6 && idx[y * OUT + x] === P_NAVY) {
        idx[y * OUT + x] = P_ARC;
      }
    }
  }
}

function frame(f) {
  const idx = new Uint8Array(OUT * OUT); // 0 = transparent
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    if (inCard(x, y, 3, 26)) idx[y * OUT + x] = P_NAVY;
  }

  const scale = 5;
  const letterW = 5 * scale, gap = 8;
  const totalW = letterW * 3 + gap * 2;
  const x0 = Math.floor((OUT - totalW) / 2), y0 = 52;
  const letters = ['s', 'a', 't'];

  // frames 0-5: highlight sweeps two frames per letter; 6-7: the whole word.
  const hl = f < 6 ? (f >> 1) : -1;
  letters.forEach((L, i) => {
    const color = hl === -1 ? P_CREAM : (i === hl ? P_GOLD : P_DIM);
    drawLetter(idx, L, x0 + i * (letterW + gap), y0, scale, color);
  });
  if (hl >= 0) {
    drawArcs(idx, x0 + hl * (letterW + gap) + letterW / 2, y0 - 4, f & 1 ? 2 : 1);
  }
  return idx;
}

export function soundItOutIcon() {
  const pal = [[0, 0, 0], NAVY, CREAM, GOLD, DIM, ARC];
  const CT = 8;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length; i++) {
    flat[i * 3] = pal[i][0]; flat[i * 3 + 1] = pal[i][1]; flat[i * 3 + 2] = pal[i][2];
  }
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frame(f));
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 3,
           frames, delayCs: 30, transparentIndex: T };
}
