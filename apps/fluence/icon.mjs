// Procedural "wispy pencil sketch of a charismatic orator" icon for Fluence.
// Renders graphite strokes on a soft paper card into an indexed-color animated
// GIF frame set (the shape site/js/gifos-gif.js's encode() expects as
// opts.preview). The mouth opens and closes subtly across frames — the orator
// is mid-speech. Pure Node (no canvas): a float "darkness" buffer is painted
// with soft, jittered pencil dabs, super-sampled, then quantized to a warm
// graphite ramp on cream paper. Deterministic (seeded), so builds reproduce.

const OUT = 128;        // output icon size
const SS = 3;           // super-sample factor
const RW = OUT * SS;    // render size
const FRAMES = 8;
const INK = 0.55;       // global graphite weight — keep it light & wispy

// seeded PRNG (mulberry32) so the sketch is identical every build
function rng(seed) { return function () { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function deposit(buf, x, y, r, amt) {
  const x0 = Math.max(0, (x - r) | 0), x1 = Math.min(RW - 1, (x + r) | 0);
  const y0 = Math.max(0, (y - r) | 0), y1 = Math.min(RW - 1, (y + r) | 0);
  const r2 = r * r;
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = px - x, dy = py - y, d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      let f = 1 - Math.sqrt(d2) / r; f *= f; // soft falloff
      buf[py * RW + px] += amt * f;
    }
  }
}

// Catmull-Rom through control points → smooth polyline of pixel-space points.
function smooth(cps, perSeg) {
  const p = cps.map((c) => [c[0] * RW, c[1] * RW]);
  const pts = [];
  const P = [p[0], ...p, p[p.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    for (let s = 0; s < perSeg; s++) {
      const t = s / perSeg, t2 = t * t, t3 = t2 * t;
      pts.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  pts.push([p[p.length - 1][0], p[p.length - 1][1]]);
  return pts;
}

// A pencil stroke: walk the polyline depositing soft, jittered dabs. Multiple
// passes with different jitter build up the characteristic graphite grain.
function stroke(buf, cps, o) {
  o = o || {};
  const rnd = rng(o.seed || 1);
  const width = (o.width || 0.006) * RW;
  const amt = (o.amt || 0.5) * INK;
  const passes = (o.passes || 2) + 1;   // extra pass = feathery graphite buildup
  const jit = (o.jit || 0.5) * width * 1.35;
  const taper = o.taper !== false;
  const pts = smooth(cps, o.perSeg || 14);
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;   // perpendicular
      const steps = Math.max(1, Math.ceil(len / 1.1));
      for (let s = 0; s <= steps; s++) {
        const t = (i - 1 + s / steps) / (pts.length - 1);
        let press = 0.65 + 0.5 * rnd();
        if (taper) press *= Math.sin(Math.min(1, Math.max(0, t)) * Math.PI) * 0.7 + 0.35; // fade ends
        const off = (rnd() - 0.5) * jit + (rnd() - 0.5) * jit * 0.5;
        const x = a[0] + dx * (s / steps) + nx * off;
        const y = a[1] + dy * (s / steps) + ny * off;
        deposit(buf, x, y, width * (0.55 + 0.5 * rnd()), amt * press * (0.75 + 0.5 * rnd()));
      }
    }
  }
}

// short parallel hatching to shade a region (cheek/neck/lapel shadow)
function hatch(buf, x0, y0, x1, y1, n, angle, o) {
  o = o || {};
  const rnd = rng(o.seed || 7);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
    const l = (o.len || 0.05) * (0.7 + 0.6 * rnd());
    const dx = Math.cos(angle) * l, dy = Math.sin(angle) * l;
    stroke(buf, [[cx - dx, cy - dy], [cx + dx, cy + dy]], { seed: (o.seed || 7) + i * 13, width: 0.004, amt: o.amt || 0.18, passes: 1, jit: 0.4 });
  }
}

// Everything except the mouth — painted once, reused for every frame.
function paintBase() {
  const b = new Float32Array(RW * RW);

  // hair — wispy strokes flowing up and back over the crown
  const hairSeeds = [11, 23, 37, 51, 67, 83, 97, 113, 131];
  const hairPaths = [
    [[0.30, 0.30], [0.34, 0.17], [0.46, 0.11], [0.58, 0.13]],
    [[0.28, 0.34], [0.31, 0.19], [0.44, 0.10], [0.60, 0.12]],
    [[0.33, 0.27], [0.40, 0.15], [0.52, 0.11], [0.62, 0.16]],
    [[0.31, 0.24], [0.42, 0.14], [0.55, 0.13], [0.63, 0.20]],
    [[0.29, 0.31], [0.35, 0.22], [0.47, 0.15], [0.57, 0.15]],
  ];
  hairPaths.forEach((p, i) => stroke(b, p, { seed: hairSeeds[i], width: 0.010, amt: 0.34, passes: 3, jit: 0.9, taper: true }));

  // head / face outline: left temple → cheek → jaw → chin → up the front to brow
  stroke(b, [[0.30, 0.30], [0.27, 0.42], [0.30, 0.55], [0.40, 0.64], [0.50, 0.66], [0.585, 0.60]], { seed: 201, width: 0.011, amt: 0.5, passes: 2, jit: 0.5 });
  // front of face (facing viewer's right): forehead → brow → nose → lip → chin
  stroke(b, [[0.585, 0.19], [0.63, 0.30], [0.635, 0.40], [0.66, 0.45], [0.63, 0.485]], { seed: 211, width: 0.010, amt: 0.5, passes: 2, jit: 0.5 });
  stroke(b, [[0.615, 0.545], [0.60, 0.585], [0.585, 0.60]], { seed: 213, width: 0.010, amt: 0.45, passes: 2, jit: 0.5 }); // chin

  // brow + eyes (expressive, engaged)
  stroke(b, [[0.40, 0.375], [0.47, 0.35], [0.53, 0.36]], { seed: 301, width: 0.009, amt: 0.55, passes: 2, jit: 0.4 }); // near brow
  stroke(b, [[0.545, 0.365], [0.585, 0.35], [0.60, 0.365]], { seed: 305, width: 0.008, amt: 0.5, passes: 2, jit: 0.4 }); // far brow
  stroke(b, [[0.42, 0.415], [0.47, 0.405], [0.505, 0.415]], { seed: 311, width: 0.008, amt: 0.6, passes: 2, jit: 0.35 }); // near eye
  stroke(b, [[0.55, 0.41], [0.58, 0.405], [0.60, 0.415]], { seed: 315, width: 0.007, amt: 0.5, passes: 2, jit: 0.35 }); // far eye
  deposit(b, 0.465 * RW, 0.415 * RW, 0.011 * RW, 0.5 * INK); // near pupil
  deposit(b, 0.577 * RW, 0.412 * RW, 0.009 * RW, 0.42 * INK); // far pupil

  // loose "construction" wisps for an unfinished-sketch feel
  stroke(b, [[0.24, 0.40], [0.27, 0.44]], { seed: 951, width: 0.006, amt: 0.16, passes: 1, jit: 1.4 });
  stroke(b, [[0.63, 0.66], [0.60, 0.70]], { seed: 953, width: 0.006, amt: 0.14, passes: 1, jit: 1.4 });
  stroke(b, [[0.36, 0.20], [0.44, 0.16]], { seed: 957, width: 0.006, amt: 0.15, passes: 1, jit: 1.4 });

  // nose
  stroke(b, [[0.55, 0.42], [0.55, 0.47], [0.585, 0.49], [0.55, 0.50]], { seed: 401, width: 0.008, amt: 0.42, passes: 2, jit: 0.4 });

  // cheek + jaw shading, and a hint of a mustache/shadow above the lip
  hatch(b, 0.35 * RW, 0.50 * RW, 0.31 * RW, 0.58 * RW, 6, 1.2, { seed: 501, len: 0.03, amt: 0.16 });
  hatch(b, 0.58 * RW, 0.50 * RW, 0.60 * RW, 0.575 * RW, 5, 1.1, { seed: 555, len: 0.028, amt: 0.14 });

  // neck
  stroke(b, [[0.44, 0.66], [0.44, 0.74]], { seed: 601, width: 0.010, amt: 0.4, passes: 2, jit: 0.4 });
  stroke(b, [[0.56, 0.62], [0.565, 0.72]], { seed: 605, width: 0.010, amt: 0.4, passes: 2, jit: 0.4 });

  // shoulders + suit collar / lapels (an orator in a jacket)
  stroke(b, [[0.12, 0.98], [0.16, 0.82], [0.30, 0.74], [0.44, 0.74]], { seed: 701, width: 0.012, amt: 0.5, passes: 2, jit: 0.5 });
  stroke(b, [[0.88, 0.98], [0.84, 0.80], [0.70, 0.72], [0.565, 0.72]], { seed: 705, width: 0.012, amt: 0.5, passes: 2, jit: 0.5 });
  stroke(b, [[0.44, 0.74], [0.40, 0.86], [0.34, 0.98]], { seed: 711, width: 0.010, amt: 0.45, passes: 2, jit: 0.5 }); // left lapel
  stroke(b, [[0.565, 0.72], [0.60, 0.85], [0.66, 0.98]], { seed: 715, width: 0.010, amt: 0.45, passes: 2, jit: 0.5 }); // right lapel
  stroke(b, [[0.50, 0.76], [0.50, 0.98]], { seed: 721, width: 0.008, amt: 0.35, passes: 1, jit: 0.5 }); // shirt placket
  hatch(b, 0.20 * RW, 0.86 * RW, 0.30 * RW, 0.80 * RW, 7, 0.5, { seed: 731, len: 0.05, amt: 0.13 }); // jacket shade
  hatch(b, 0.72 * RW, 0.82 * RW, 0.80 * RW, 0.88 * RW, 7, 2.5, { seed: 741, len: 0.05, amt: 0.13 });

  // a raised, gesturing hand — the charismatic orator's flourish (lower right)
  stroke(b, [[0.66, 0.98], [0.74, 0.82], [0.82, 0.70], [0.86, 0.60]], { seed: 801, width: 0.011, amt: 0.42, passes: 2, jit: 0.5 }); // forearm
  stroke(b, [[0.86, 0.60], [0.90, 0.55], [0.885, 0.50]], { seed: 805, width: 0.009, amt: 0.4, passes: 2, jit: 0.5 }); // fingers
  stroke(b, [[0.86, 0.60], [0.845, 0.53], [0.86, 0.49]], { seed: 809, width: 0.008, amt: 0.36, passes: 2, jit: 0.5 });
  stroke(b, [[0.855, 0.61], [0.815, 0.575], [0.80, 0.55]], { seed: 813, width: 0.008, amt: 0.34, passes: 2, jit: 0.5 }); // thumb

  return b;
}

// The mouth for a given openness (0..1). Upper + lower lip, and a darker open
// interior when wide — the animated part.
function paintMouth(b, open) {
  const cx = 0.60, cy = 0.535, w = 0.055;
  const h = 0.006 + open * 0.032;
  stroke(b, [[cx - w, cy - 0.004], [cx - w * 0.3, cy - h * 0.6], [cx + w * 0.4, cy - h * 0.55], [cx + w, cy]], { seed: 901, width: 0.008, amt: 0.5, passes: 2, jit: 0.35 }); // upper lip
  stroke(b, [[cx - w, cy + 0.002], [cx - w * 0.2, cy + h], [cx + w * 0.5, cy + h * 0.9], [cx + w, cy]], { seed: 905, width: 0.009, amt: 0.5, passes: 2, jit: 0.35 }); // lower lip
  if (open > 0.35) { // open-mouth interior shadow
    const ix = cx * RW, iy = (cy + h * 0.35) * RW, ir = w * RW * 0.62;
    for (let py = -ir; py <= ir; py++) for (let px = -ir; px <= ir; px++) {
      const nx = px / (ir), ny = py / (ir * 0.7);
      if (nx * nx + ny * ny <= 1) deposit(b, ix + px, iy + py, 1.4, 0.10 * (open - 0.2));
    }
  }
}

// warm graphite ramp on cream paper. index 0 = transparent (outside card).
function palette(numColors) {
  const pal = new Array(numColors * 3).fill(0);
  const paper = [249, 246, 238], inkLight = [158, 154, 158], inkDark = [48, 44, 56];
  pal[3] = paper[0]; pal[4] = paper[1]; pal[5] = paper[2]; // index 1 = paper
  const grays = numColors - 2;
  for (let i = 0; i < grays; i++) {
    const t = i / (grays - 1); // 0 = faint, 1 = darkest
    // paper→lightInk for faint, lightInk→darkInk for strong (two-segment for depth)
    let c;
    if (t < 0.45) { const u = t / 0.45; c = [paper[0] + (inkLight[0] - paper[0]) * u, paper[1] + (inkLight[1] - paper[1]) * u, paper[2] + (inkLight[2] - paper[2]) * u]; }
    else { const u = (t - 0.45) / 0.55; c = [inkLight[0] + (inkDark[0] - inkLight[0]) * u, inkLight[1] + (inkDark[1] - inkLight[1]) * u, inkLight[2] + (inkDark[2] - inkLight[2]) * u]; }
    const idx = (2 + i) * 3; pal[idx] = c[0] | 0; pal[idx + 1] = c[1] | 0; pal[idx + 2] = c[2] | 0;
  }
  return pal;
}

// rounded-rect paper-card mask at output resolution (1 = paper, 0 = outside)
function cardMask() {
  const m = new Uint8Array(OUT * OUT);
  const inset = OUT * 0.045, rad = OUT * 0.15;
  const x0 = inset, y0 = inset, x1 = OUT - inset, y1 = OUT - inset;
  for (let y = 0; y < OUT; y++) for (let x = 0; x < OUT; x++) {
    let inside = (x >= x0 && x <= x1 && y >= y0 && y <= y1);
    // knock out the four rounded corners
    const cs = [[x0 + rad, y0 + rad], [x1 - rad, y0 + rad], [x0 + rad, y1 - rad], [x1 - rad, y1 - rad]];
    const inCornerBox = (x < x0 + rad || x > x1 - rad) && (y < y0 + rad || y > y1 - rad);
    if (inside && inCornerBox) {
      let ok = false;
      for (const c of cs) if (Math.hypot(x - c[0], y - c[1]) <= rad) { ok = true; break; }
      inside = ok;
    }
    m[y * OUT + x] = inside ? 1 : 0;
  }
  return m;
}

// downsample a super-sampled darkness buffer to OUT and quantize onto the card
function quantize(buf, mask, numColors) {
  const grays = numColors - 2;
  const idx = new Uint8Array(OUT * OUT);
  for (let y = 0; y < OUT; y++) {
    for (let x = 0; x < OUT; x++) {
      if (!mask[y * OUT + x]) { idx[y * OUT + x] = 0; continue; } // transparent
      let acc = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) acc += buf[(y * SS + sy) * RW + (x * SS + sx)];
      let d = acc / (SS * SS);
      d = Math.pow(Math.min(1, d), 1.25); // gamma — keep faint strokes light & wispy
      if (d < 0.03) { idx[y * OUT + x] = 1; continue; } // bare paper
      const g = Math.min(grays - 1, 1 + Math.round(d * (grays - 1)));
      idx[y * OUT + x] = 2 + (g - 1);
    }
  }
  return idx;
}

export function oratorIcon() {
  const numColors = 64;
  const pal = palette(numColors);
  const mask = cardMask();
  const base = paintBase();
  // subtle, natural speech cadence for the mouth openness across 8 frames
  const opens = [0.10, 0.35, 0.72, 0.95, 0.62, 0.28, 0.55, 0.20];
  const frames = [];
  for (let f = 0; f < FRAMES; f++) {
    const b = base.slice();
    paintMouth(b, opens[f]);
    frames.push(quantize(b, mask, numColors));
  }
  return {
    width: OUT, height: OUT, palette: pal, numColors,
    minCodeSize: Math.round(Math.log2(numColors)),
    frames, delayCs: 16, transparentIndex: 0,
  };
}
