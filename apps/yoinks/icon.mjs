// Procedural yoinks sticker: the pixel word on its dark card, the paste box
// with the forged-on yoink button, and a progress bar that fills across the
// loop while upstream's shimmer beam crosses the letters.
const OUT = 128, FRAMES = 12;

// palette indices
const T = 0, CARD = 1, WHITE = 2, GRAY = 3, DIM = 4, LIGHT = 5, EDGE = 6;
const PALETTE = [
  [0, 0, 0],          // transparent
  [24, 24, 27],       // card (#18181b, the dark theme)
  [255, 255, 255],    // primary
  [161, 161, 170],    // gray (#a1a1aa)
  [82, 82, 91],       // dim (#52525b)
  [228, 228, 231],    // shimmer
  [8, 10, 14]         // outline
];

const GLYPHS = {
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  I: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b11111],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110]
};

function inRound(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x >= x1 || y < y0 || y >= y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - 1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - 1 - r);
  if (x >= x0 + r && x < x1 - r) return true;
  if (y >= y0 + r && y < y1 - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function frame(f) {
  const px = new Uint8Array(OUT * OUT).fill(T);
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < OUT && y < OUT) px[y * OUT + x] = c; };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, c); };

  // card
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    if (inRound(x, y, 4, 4, OUT - 4, OUT - 4, 20)) put(x, y, CARD);
    if (inRound(x, y, 4, 4, OUT - 4, OUT - 4, 20) && !inRound(x, y, 6, 6, OUT - 6, OUT - 6, 18)) put(x, y, EDGE);
  }

  // the word, 5x7 glyphs at scale 3, 6 letters = 108 px wide
  const S = 3, word = 'YOINKS', gx0 = (OUT - (word.length * 6 * S - S)) >> 1, gy0 = 26;
  // shimmer beam: a tilted band crossing left to right over the loop
  const t = f / FRAMES;
  const beam = -20 + t * (OUT + 40);
  let cx = gx0;
  for (const ch of word) {
    const g = GLYPHS[ch];
    for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
      if (!(g[row] & (1 << (4 - col)))) continue;
      for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
        const x = cx + col * S + dx, y = gy0 + row * S + dy;
        const d = Math.abs(x - (6 - row) * 2 - beam);
        put(x, y, d < 6 ? LIGHT : (ch === 'O' && col === 0 ? GRAY : WHITE));
      }
    }
    cx += 6 * S;
  }

  // the paste box: thin gray frame, prompt chevron, and the white button
  const bx0 = 14, by0 = 62, bx1 = 114, by1 = 84;
  rect(bx0, by0, bx1 - 26, by0 + 1, DIM);
  rect(bx0, by1 - 1, bx1 - 26, by1, DIM);
  rect(bx0, by0, bx0 + 1, by1, DIM);
  rect(bx1 - 26, by0, bx1, by1, WHITE);               // yoink button
  // "❯" as a pixel chevron
  const chx = bx0 + 6, chy = by0 + 8;
  for (let i = 0; i < 4; i++) { put(chx + i, chy + i, WHITE); put(chx + i, chy + 6 - i, WHITE); }
  // placeholder dashes
  rect(chx + 8, by0 + 10, chx + 44, by0 + 12, DIM);
  // the button's "y": a tiny glyph in card colour on the white
  const yg = GLYPHS.Y, yx = bx1 - 26 + 8, yy = by0 + 4;
  for (let row = 0; row < 7; row++) for (let col = 0; col < 5; col++) {
    if (yg[row] & (1 << (4 - col))) { put(yx + col * 2, yy + row * 2, CARD); put(yx + col * 2 + 1, yy + row * 2, CARD); put(yx + col * 2, yy + row * 2 + 1, CARD); put(yx + col * 2 + 1, yy + row * 2 + 1, CARD); }
  }

  // progress bar filling across the loop
  const px0 = 14, px1 = 114, py0 = 98, py1 = 106;
  rect(px0, py0, px1, py1, DIM);
  const fill = Math.round((px1 - px0) * ((f + 1) / FRAMES));
  rect(px0, py0, px0 + fill, py1, WHITE);

  return px;
}

export function yoinksIcon() {
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frame(f));
  const CT = 8;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < PALETTE.length; i++) { flat[i * 3] = PALETTE[i][0]; flat[i * 3 + 1] = PALETTE[i][1]; flat[i * 3 + 2] = PALETTE[i][2]; }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 3, frames, delayCs: 12, transparentIndex: T };
}
