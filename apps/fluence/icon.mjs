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

// A soft elliptical form-shadow — smooth graphite tone under the linework, so
// the portrait reads as shaded volume, not just outlines. Light is upper-left,
// so shadows sit on the viewer's-right of forms and under them.
function softShade(b, cx, cy, rx, ry, amt) {
  const X = cx * RW, Y = cy * RW, RX = rx * RW, RY = ry * RW;
  const x0 = Math.max(0, (X - RX) | 0), x1 = Math.min(RW - 1, (X + RX) | 0);
  const y0 = Math.max(0, (Y - RY) | 0), y1 = Math.min(RW - 1, (Y + RY) | 0);
  for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
    const nx = (px - X) / RX, ny = (py - Y) / RY, d = nx * nx + ny * ny;
    if (d > 1) continue;
    let f = 1 - Math.sqrt(d); f *= f;
    b[py * RW + px] += amt * f;
  }
}

// A 3/4-ish portrait of an earnest speaker: shaded, with real features, but
// still a loose graphite sketch. Everything except the mouth (redrawn per frame).
function paintBase() {
  const b = new Float32Array(RW * RW);

  // --- tonal foundation: soft form shadows, painted first, under the lines ---
  softShade(b, 0.615, 0.44, 0.135, 0.20, 0.34);   // shadow side of the face (right)
  softShade(b, 0.50, 0.585, 0.155, 0.085, 0.30);  // under jaw / neck shadow
  softShade(b, 0.455, 0.235, 0.215, 0.135, 0.42); // hair mass volume
  softShade(b, 0.56, 0.475, 0.045, 0.07, 0.30);   // shadow beside the nose
  softShade(b, 0.50, 0.83, 0.40, 0.18, 0.40);     // jacket / torso mass
  softShade(b, 0.50, 0.60, 0.05, 0.03, 0.22);     // shadow under lower lip

  // --- hair: side-parted, wispy strands over a shaded mass ---
  const hair = [
    [[0.31, 0.34], [0.33, 0.20], [0.45, 0.13], [0.60, 0.17]],
    [[0.30, 0.30], [0.36, 0.17], [0.50, 0.12], [0.63, 0.19]],
    [[0.33, 0.27], [0.42, 0.15], [0.55, 0.13], [0.645, 0.22]],
    [[0.355, 0.315], [0.44, 0.19], [0.55, 0.16], [0.62, 0.20]], // part sweep
    [[0.32, 0.37], [0.30, 0.28], [0.34, 0.21], [0.42, 0.17]],   // left temple wisp
    [[0.66, 0.30], [0.665, 0.24], [0.62, 0.19], [0.55, 0.165]], // right crown
  ];
  hair.forEach((p, i) => stroke(b, p, { seed: 11 + i * 17, width: 0.011, amt: 0.34, passes: 3, jit: 1.0, taper: true }));
  // hairline across the forehead
  stroke(b, [[0.345, 0.325], [0.44, 0.285], [0.56, 0.285], [0.655, 0.325]], { seed: 141, width: 0.008, amt: 0.3, passes: 2, jit: 0.6 });

  // --- face + jaw contour (left lit edge lighter, right shadow edge firmer) ---
  stroke(b, [[0.335, 0.31], [0.315, 0.41], [0.335, 0.52], [0.40, 0.605], [0.47, 0.64]], { seed: 201, width: 0.009, amt: 0.42, passes: 2, jit: 0.4 }); // left
  stroke(b, [[0.665, 0.31], [0.685, 0.41], [0.665, 0.52], [0.60, 0.605], [0.53, 0.64]], { seed: 205, width: 0.010, amt: 0.52, passes: 2, jit: 0.4 }); // right
  stroke(b, [[0.47, 0.64], [0.50, 0.648], [0.53, 0.64]], { seed: 209, width: 0.009, amt: 0.44, passes: 2, jit: 0.4 }); // chin
  // ears
  stroke(b, [[0.335, 0.40], [0.315, 0.44], [0.335, 0.48]], { seed: 221, width: 0.008, amt: 0.34, passes: 2, jit: 0.4 });
  stroke(b, [[0.665, 0.40], [0.685, 0.44], [0.665, 0.485]], { seed: 225, width: 0.008, amt: 0.4, passes: 2, jit: 0.4 });

  // --- brows (raised, engaged — set well above the eyes) ---
  stroke(b, [[0.375, 0.368], [0.44, 0.348], [0.478, 0.362]], { seed: 301, width: 0.010, amt: 0.5, passes: 2, jit: 0.3 });
  stroke(b, [[0.522, 0.362], [0.56, 0.348], [0.625, 0.37]], { seed: 305, width: 0.010, amt: 0.5, passes: 2, jit: 0.3 });

  // --- eyes: clearly OPEN — a gentle upper lid over a round, looking pupil ---
  const eye = (ex, ey, w, dark) => {
    stroke(b, [[ex - w, ey - w * 0.02], [ex - w * 0.2, ey - w * 0.26], [ex + w, ey + w * 0.02]], { seed: (ex * 1000) | 0, width: 0.006, amt: dark, passes: 2, jit: 0.22 }); // upper lid
    const cx0 = (ex + w * 0.06) * RW, cy0 = (ey + w * 0.16) * RW;
    deposit(b, cx0, cy0, 0.025 * RW, 0.20 * INK); // soft iris / socket
    deposit(b, cx0, cy0, 0.015 * RW, 0.95 * INK); // round pupil — reads as an open eye
    stroke(b, [[ex - w * 0.7, ey + w * 0.42], [ex + w * 0.6, ey + w * 0.36]], { seed: ((ex + 3) * 1000) | 0, width: 0.004, amt: dark * 0.3, passes: 1, jit: 0.3 }); // faint lower lid
  };
  eye(0.44, 0.42, 0.052, 0.5);    // near eye
  eye(0.575, 0.42, 0.047, 0.46);  // far eye

  // --- nose: bridge, tip, a nostril and the shadow plane ---
  stroke(b, [[0.505, 0.40], [0.50, 0.46], [0.485, 0.50]], { seed: 401, width: 0.007, amt: 0.3, passes: 2, jit: 0.35 }); // bridge (soft, lit side)
  stroke(b, [[0.485, 0.50], [0.50, 0.515], [0.545, 0.505]], { seed: 405, width: 0.008, amt: 0.44, passes: 2, jit: 0.35 }); // base + tip
  deposit(b, 0.505 * RW, 0.503 * RW, 0.010 * RW, 0.34 * INK); // nostril

  // --- cheek + smile lines ---
  stroke(b, [[0.585, 0.49], [0.60, 0.53], [0.585, 0.565]], { seed: 501, width: 0.006, amt: 0.24, passes: 1, jit: 0.4 }); // right nasolabial

  // --- neck ---
  stroke(b, [[0.44, 0.645], [0.445, 0.72]], { seed: 601, width: 0.009, amt: 0.32, passes: 2, jit: 0.35 });
  stroke(b, [[0.565, 0.645], [0.56, 0.72]], { seed: 605, width: 0.009, amt: 0.4, passes: 2, jit: 0.35 });

  // --- shirt collar + tie + jacket lapels (professional, a touch earnest) ---
  stroke(b, [[0.44, 0.72], [0.50, 0.80], [0.56, 0.72]], { seed: 621, width: 0.008, amt: 0.4, passes: 2, jit: 0.35 }); // collar V
  stroke(b, [[0.475, 0.755], [0.50, 0.735], [0.525, 0.755], [0.50, 0.785], [0.475, 0.755]], { seed: 631, width: 0.008, amt: 0.5, passes: 2, jit: 0.3 }); // tie knot
  stroke(b, [[0.485, 0.785], [0.47, 0.98]], { seed: 635, width: 0.012, amt: 0.42, passes: 2, jit: 0.35 }); // tie L
  stroke(b, [[0.515, 0.785], [0.53, 0.98]], { seed: 637, width: 0.012, amt: 0.42, passes: 2, jit: 0.35 }); // tie R
  softShade(b, 0.50, 0.90, 0.05, 0.10, 0.5);                    // tie tone
  stroke(b, [[0.13, 0.98], [0.17, 0.83], [0.31, 0.75], [0.44, 0.75]], { seed: 701, width: 0.012, amt: 0.5, passes: 2, jit: 0.45 }); // left shoulder
  stroke(b, [[0.87, 0.98], [0.83, 0.81], [0.69, 0.74], [0.565, 0.745]], { seed: 705, width: 0.012, amt: 0.5, passes: 2, jit: 0.45 }); // right shoulder
  stroke(b, [[0.44, 0.75], [0.39, 0.87], [0.33, 0.98]], { seed: 711, width: 0.010, amt: 0.46, passes: 2, jit: 0.4 }); // left lapel
  stroke(b, [[0.565, 0.745], [0.61, 0.87], [0.67, 0.98]], { seed: 715, width: 0.010, amt: 0.46, passes: 2, jit: 0.4 }); // right lapel

  // --- a raised, open hand — the earnest speaker's flourish (kept, refined) ---
  stroke(b, [[0.70, 0.98], [0.77, 0.83], [0.83, 0.71], [0.855, 0.63]], { seed: 801, width: 0.011, amt: 0.4, passes: 2, jit: 0.45 }); // forearm
  stroke(b, [[0.855, 0.63], [0.90, 0.585], [0.905, 0.53]], { seed: 805, width: 0.009, amt: 0.38, passes: 2, jit: 0.45 }); // finger 1
  stroke(b, [[0.86, 0.62], [0.885, 0.55], [0.875, 0.50]], { seed: 809, width: 0.008, amt: 0.36, passes: 2, jit: 0.45 }); // finger 2
  stroke(b, [[0.84, 0.62], [0.85, 0.55], [0.835, 0.51]], { seed: 811, width: 0.008, amt: 0.34, passes: 2, jit: 0.45 }); // finger 3
  stroke(b, [[0.85, 0.635], [0.815, 0.60], [0.80, 0.57]], { seed: 813, width: 0.008, amt: 0.33, passes: 2, jit: 0.45 }); // thumb
  softShade(b, 0.86, 0.63, 0.045, 0.05, 0.24); // palm tone

  return b;
}

// The mouth for a given openness (0..1) — the animated part. A confident,
// slightly-smiling speaking mouth: upper lip, lower lip, teeth/interior when open.
function paintMouth(b, open) {
  const cx = 0.50, cy = 0.565, w = 0.058;
  const h = 0.006 + open * 0.030;
  // upper lip with a gentle smile lift at the corners
  stroke(b, [[cx - w, cy - 0.006], [cx - w * 0.35, cy - h * 0.5], [cx + w * 0.35, cy - h * 0.5], [cx + w, cy - 0.004]], { seed: 901, width: 0.007, amt: 0.5, passes: 2, jit: 0.3 });
  // lower lip
  stroke(b, [[cx - w * 0.9, cy + 0.004], [cx - w * 0.2, cy + h], [cx + w * 0.5, cy + h * 0.9], [cx + w * 0.9, cy + 0.002]], { seed: 905, width: 0.008, amt: 0.46, passes: 2, jit: 0.3 });
  if (open > 0.3) { // open interior with a hint of upper teeth
    const ix = cx * RW, iy = (cy + h * 0.42) * RW, irx = w * RW * 0.72, iry = h * RW * 1.3 + 2;
    for (let py = -iry; py <= iry; py++) for (let px = -irx; px <= irx; px++) {
      const nx = px / irx, ny = py / iry;
      if (nx * nx + ny * ny <= 1) deposit(b, ix + px, iy + py, 1.3, 0.12 * (open - 0.15));
    }
    // teeth: a light band just below the upper lip (subtract a little darkness)
    const ty = (cy - h * 0.1) * RW;
    for (let px = -irx * 0.85; px <= irx * 0.85; px++) deposit(b, ix + px, ty, 1.6, -0.05 * open);
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
      d = Math.pow(Math.max(0, Math.min(1, d)), 1.25); // clamp (teeth use negative dabs), gamma for wispy faint strokes
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
