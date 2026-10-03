// Procedural icon for Offline Captions (Whisper): a deep-blue card with three
// CAPTION LINES being written — rounded bars that grow across the frames, the
// last one with a blinking cursor — and a small live dot in the corner. Same
// super-sample -> box-downsample -> small-palette pipeline as the TTS icons;
// deterministic, so builds reproduce.
const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 12;

const CARD_A = [22, 36, 60];     // card gradient top
const CARD_B = [8, 13, 24];      // card gradient bottom
const LINE = [159, 179, 209];    // caption text bars
const BRIGHT = [238, 244, 255];  // the line being written
const CYAN = [92, 200, 255];     // cursor + live dot
const RED = [255, 92, 92];

function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

function buildPalette() {
  const pal = [[0, 0, 0]];
  const bases = [CARD_A, CARD_B, LINE, BRIGHT, CYAN, RED];
  for (const b of bases) for (let s = 0; s <= 5; s++) pal.push(mix(b, [255, 255, 255], s * 0.08).map(Math.round));
  for (let s = 1; s <= 4; s++) pal.push(mix(CARD_A, CARD_B, s / 5).map(Math.round));
  return pal;
}
function nearest(pal, r, g, b) {
  let bi = 1, bd = 1e9;
  for (let i = 1; i < pal.length; i++) { const p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b, d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; bi = i; } }
  return bi;
}
function inRound(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r);
  if (x >= x0 + r && x <= x1 - r) return true;
  if (y >= y0 + r && y <= y1 - r) return true;
  const dx = x - cx, dy = y - cy; return dx * dx + dy * dy <= r * r;
}

// Three lines; the widths of the first two are fixed, the third grows with the
// frame and carries the cursor.
const LINES = [{ y: 44, w: 0.72 }, { y: 64, w: 0.56 }, { y: 84, w: 0.62 }];
const LX0 = 24, LX1 = 104, LH = 9;

function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const m = 8, rad = 22;
  const grow = (f % FRAMES) / (FRAMES - 1);          // 0..1 across the loop
  const blink = (f % 4) < 2;
  for (let py = 0; py < RW; py++) for (let px = 0; px < RW; px++) {
    const x = px / SS, y = py / SS;
    let col = null, a = 0;
    if (inRound(x, y, m, m, OUT - m, OUT - m, rad)) {
      a = 1;
      col = mix(CARD_A, CARD_B, Math.max(0, Math.min(1, (y - m) / (OUT - 2 * m))));
      for (let i = 0; i < LINES.length; i++) {
        const L = LINES[i];
        const last = i === LINES.length - 1;
        const w = last ? L.w * (0.25 + 0.75 * grow) : L.w;
        const x1 = LX0 + (LX1 - LX0) * w;
        if (inRound(x, y, LX0, L.y - LH / 2, x1, L.y + LH / 2, LH / 2)) col = last ? BRIGHT : LINE;
        if (last && blink && inRound(x, y, x1 + 3, L.y - LH / 2 - 1, x1 + 6, L.y + LH / 2 + 1, 1)) col = CYAN;
      }
      // the live dot, top right
      const dx = x - 104, dy = y - 24, pulse = 4.5 + 1.2 * Math.sin((f / FRAMES) * Math.PI * 2);
      if (dx * dx + dy * dy <= pulse * pulse) col = RED;
    }
    const o = (py * RW + px) * 4;
    if (a) { rgba[o] = col[0]; rgba[o + 1] = col[1]; rgba[o + 2] = col[2]; rgba[o + 3] = 1; }
  }
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0; const n = SS * SS;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) { const o = (((y * SS + sy) * RW) + (x * SS + sx)) * 4; r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; a += rgba[o + 3]; }
    if (a / n < 0.5) { idx[y * OUT + x] = 0; continue; }
    idx[y * OUT + x] = nearest(pal, r / n, g / n, b / n);
  }
  return idx;
}

export function whisperIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) { flat[i * 3] = pal[i][0] | 0; flat[i * 3 + 1] = pal[i][1] | 0; flat[i * 3 + 2] = pal[i][2] | 0; }
  return { width: OUT, height: OUT, palette: flat, numColors: CT, minCodeSize: 6, frames, delayCs: 12, transparentIndex: 0 };
}
