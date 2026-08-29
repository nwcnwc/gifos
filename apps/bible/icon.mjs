// Procedural icon for the Bible: an open book, seen a little from above, a
// page lifting and turning in a slow loop, a red ribbon marker, gold edges on
// a deep night card. The animation is the book being READ — a page actually
// turns — because an icon's loop should demonstrate, not wiggle.
//
// Super-sample -> box-downsample -> small palette. Deterministic, so GIF
// builds reproduce byte-for-byte.
import {} from 'node:zlib';

const OUT = 128, SS = 3, RW = OUT * SS, FRAMES = 14;

const CARD = [13, 13, 22];
const CARD_EDGE = [32, 30, 48];
const COVER = [58, 30, 20];
const COVER_D = [38, 20, 14];
const PAGE = [242, 234, 214];
const PAGE_D = [214, 202, 176];
const PAGE_TURN = [250, 244, 228];
const LINE = [150, 140, 120];
const GOLD = [201, 162, 39];
const GOLD_D = [140, 110, 28];
const RIBBON = [178, 52, 44];

function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function buildPalette() {
  const pal = [[0, 0, 0]];
  for (const b of [CARD, CARD_EDGE, COVER, COVER_D, PAGE, PAGE_D, PAGE_TURN, LINE, GOLD, GOLD_D, RIBBON]) {
    pal.push(b);
    pal.push(mix(b, [255, 255, 255], 0.18).map(Math.round));
    pal.push(mix(b, [0, 0, 0], 0.3).map(Math.round));
  }
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

function inCard(x, y, m, r) {
  const lo = m, hi = OUT - m;
  if (x < lo || x > hi || y < lo || y > hi) return false;
  const cx = Math.min(Math.max(x, lo + r), hi - r);
  const cy = Math.min(Math.max(y, lo + r), hi - r);
  if (x >= lo + r && x <= hi - r) return true;
  if (y >= lo + r && y <= hi - r) return true;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/* One frame at super-sampled resolution, painted in float RGB. */
function frameIndices(pal, f) {
  const rgba = new Float32Array(RW * RW * 4);
  const put = (x, y, c, a) => {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= RW || y >= RW) return;
    const o = (y * RW + x) * 4;
    const w = a === undefined ? 1 : a;
    rgba[o] += c[0] * w; rgba[o + 1] += c[1] * w; rgba[o + 2] += c[2] * w; rgba[o + 3] += w;
  };

  const S = SS;
  // The card.
  for (let y = 0; y < RW; y++) {
    for (let x = 0; x < RW; x++) {
      const ox = x / S, oy = y / S;
      if (inCard(ox, oy, 6, 22)) {
        const edge = inCard(ox, oy, 6, 22) && !inCard(ox, oy, 9, 20);
        put(x, y, edge ? CARD_EDGE : CARD);
      }
    }
  }

  // Book geometry, in OUT coordinates scaled by S.
  const cx = 64 * S;                     // spine
  const topY = 46 * S, botY = 96 * S;    // page block top and bottom at the spine
  const w = 38 * S;                      // half-width of the open book
  const sag = 6 * S;                     // pages dip toward the spine

  const pageTopAt = (dx) => topY + sag * (1 - Math.abs(dx) / w) * (Math.abs(dx) / w < 1 ? 1 : 0) - 0 +
                            (sag * (Math.abs(dx) / w)) - sag;
  // simpler: outer corners higher than the spine by `sag`
  const topEdge = (dx) => topY - sag * (Math.abs(dx) / w) + sag;
  const botEdge = (dx) => botY - (sag * 0.6) * (Math.abs(dx) / w);

  // Cover: slightly larger than the page block.
  for (let x = -w - 3 * S; x <= w + 3 * S; x++) {
    const t0 = topEdge(Math.min(Math.abs(x), w)) - 2 * S;
    const b0 = botEdge(Math.min(Math.abs(x), w)) + 3 * S;
    for (let y = t0; y <= b0; y++) {
      put(cx + x, y, Math.abs(x) > w ? COVER : COVER_D);
    }
  }

  // Page blocks: left and right stacks with a lined texture and gold edges.
  for (let side = -1; side <= 1; side += 2) {
    for (let dx = 1; dx <= w; dx++) {
      const x = cx + side * dx;
      const t0 = topEdge(dx), b0 = botEdge(dx);
      for (let y = t0; y <= b0; y++) {
        const nearEdge = dx > w - 2 * S || y > b0 - 2 * S;
        put(x, y, nearEdge ? GOLD_D : (y - t0 < 1.2 * S ? PAGE_D : PAGE));
      }
    }
  }

  // Text lines: quiet dashes on both pages.
  for (let side = -1; side <= 1; side += 2) {
    for (let li = 0; li < 6; li++) {
      const y = topY + 6 * S + li * 7 * S;
      for (let dx = 6 * S; dx <= w - 7 * S; dx++) {
        if (((dx / S) | 0) % 9 === 8) continue;      // word gaps
        const x = cx + side * dx;
        const yy = y - (sag * (dx / w)) + sag * 0.6;
        put(x, yy, LINE, 0.55);
        put(x, yy + 1, LINE, 0.25);
      }
    }
  }

  // Drop capital on the left page: one gold block letter.
  for (let dy = 0; dy < 9 * S; dy++) {
    for (let dx = 0; dx < 7 * S; dx++) {
      const border = dy < 1.4 * S || dy > 7.6 * S || dx < 1.4 * S || dx > 5.6 * S;
      if (border) put(cx - w + 7 * S + dx, topY + 5 * S + dy, GOLD, 0.9);
    }
  }

  // Ribbon marker falling from the spine over the bottom edge.
  for (let y = botY - 2 * S; y < botY + 12 * S; y++) {
    const wob = Math.sin(y / (6 * S) + f * 0.2) * 1.2 * S;
    for (let dx = -1.6 * S; dx <= 1.6 * S; dx++) put(cx + dx + wob, y, RIBBON);
  }

  // THE TURNING PAGE. Phase 0..1 over the loop; the page lifts from the right,
  // arcs over the spine, and lands on the left. Drawn as a curved sheet.
  const phase = f / FRAMES;
  const lift = Math.sin(phase * Math.PI);           // 0 -> 1 -> 0
  const across = -Math.cos(phase * Math.PI);        // -1 (right) -> 1 (left)
  for (let u = 0; u <= 1; u += 1 / (w * 1.4)) {
    // u runs from the spine to the free edge of the turning sheet.
    const reach = u * w;
    const px = cx - across * reach * -1;            // horizontal position
    const x = cx + across * reach;
    const curl = Math.sin(u * Math.PI * 0.5);
    const yTop = topEdge(reach) - lift * (26 * S) * curl;
    const yBot = botEdge(reach) - lift * (20 * S) * curl;
    for (let y = yTop; y <= yBot; y++) {
      put(x, y, u > 0.94 ? GOLD_D : PAGE_TURN, 0.96);
      put(x + (across > 0 ? -1 : 1), y, PAGE_D, 0.2);
    }
    void px;
  }

  // Downsample.
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const o = ((y * S + sy) * RW + (x * S + sx)) * 4;
          if (rgba[o + 3] > 0) {
            r += rgba[o] / rgba[o + 3];
            g += rgba[o + 1] / rgba[o + 3];
            b += rgba[o + 2] / rgba[o + 3];
            n++;
          }
        }
      }
      idx[y * OUT + x] = n > (S * S) / 2 ? nearest(pal, r / n, g / n, b / n) : 0;
    }
  }
  return idx;
}

export function bibleIcon() {
  const pal = buildPalette();
  const frames = [];
  for (let f = 0; f < FRAMES; f++) frames.push(frameIndices(pal, f));
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0;
    flat[i * 3 + 1] = pal[i][1] | 0;
    flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return {
    width: OUT, height: OUT, palette: flat, numColors: CT,
    minCodeSize: 6, frames, delayCs: 12, transparentIndex: 0
  };
}

/* ---- the DATA BACKUP stamp ------------------------------------------------
 * The backup GIF wears this same animation, but it must never be mistaken
 * for the app: DATA BACKUP prints across every frame in bold red, with a
 * one-pixel shadow so it reads on pages and cover alike. 5x7 capitals drawn
 * as chunky blocks — a rubber stamp, not a caption. */
const STAMP_RED = [211, 36, 30];
const STAMP_SHADOW = [96, 12, 10];
const STAMP_FONT = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
};
function stampWord(idx, word, y0, scale, off, colorI) {
  const cols = word.length * 6 - 1;
  const x0 = Math.round((OUT - cols * scale) / 2);
  for (let ci = 0; ci < word.length; ci++) {
    const glyph = STAMP_FONT[word[ci]];
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (!((glyph[gy] >> (4 - gx)) & 1)) continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const px = x0 + (ci * 6 + gx) * scale + dx + off;
            const py = y0 + gy * scale + dy + off;
            if (px >= 0 && py >= 0 && px < OUT && py < OUT) idx[py * OUT + px] = colorI;
          }
        }
      }
    }
  }
}
function stampOver(idx, redI, shadowI) {
  // Shadows for both words first, then the red — so no letter's shadow ever
  // lands on a neighbour's face.
  stampWord(idx, 'DATA', 40, 3, 1, shadowI);
  stampWord(idx, 'BACKUP', 67, 3, 1, shadowI);
  stampWord(idx, 'DATA', 40, 3, 0, redI);
  stampWord(idx, 'BACKUP', 67, 3, 0, redI);
}

export function backupIcon() {
  const pal = buildPalette();
  const redI = pal.length; pal.push(STAMP_RED);
  const shadowI = pal.length; pal.push(STAMP_SHADOW);
  const frames = [];
  for (let f = 0; f < FRAMES; f++) {
    const idx = frameIndices(pal, f);
    stampOver(idx, redI, shadowI);
    frames.push(idx);
  }
  const CT = 64;
  const flat = new Array(CT * 3).fill(0);
  for (let i = 0; i < pal.length && i < CT; i++) {
    flat[i * 3] = pal[i][0] | 0;
    flat[i * 3 + 1] = pal[i][1] | 0;
    flat[i * 3 + 2] = pal[i][2] | 0;
  }
  return {
    width: OUT, height: OUT, palette: flat, numColors: CT,
    minCodeSize: 6, frames, delayCs: 12, transparentIndex: 0
  };
}

// The cover is a REAL capture of the running app, retaken by the gauntlet;
// this build never overwrites it with a drawing.
export function screenshotPng() { return null; }
