/*
 * gifos-pack-zen.js — "Zen Garden" icon pack (9.gifos.app, the wellness /
 * nature / artists computer, light warm-sand desktop #e9e4d8).
 *
 * Sumi-e ink wash + Japanese garden. Deep ink brush strokes with real
 * pressure variation — every stroke is a FILLED tapered path sampled along a
 * bezier, swelling and thinning like a loaded brush — over soft watercolor
 * washes (moss, clay, water blue-grey) whose blurred edges bleed past the
 * ink. Raked-sand arcs, stones, bamboo, koi, maple leaves, enso circles, and
 * a small red hanko seal as the signature accent. Animation is very calm:
 * washes bleed in, leaves drift and land, smoke curls, the enso draws itself.
 *
 * Fully procedural SVG, transparent background. 160px raster, 6 frames.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  if (!GifOS.iconPacks) return;

  const FR = 6, SIZE = 160, DELAY = 24;
  const range = (n) => Array.from({ length: n }, (_, i) => i);

  // ---- palette --------------------------------------------------------------
  const INK = '#3a352c';                 // deep sumi ink
  const INK2 = '#6a6252';               // faded ink (dry brush, ruling lines)
  const MOSS = [74, 124, 89];           // #4a7c59
  const CLAY = [201, 141, 90];          // #c98d5a
  const WATER = [122, 148, 160];        // #7a94a0
  const LEAFRED = [178, 74, 43];        // pressed-maple red
  const SEAL = '#c0392b';               // hanko red
  const SEALHI = '#f4eee0';             // hanko carved mark
  const PAPER = 'rgb(250,246,234)';     // washi

  // Tint a wash color subtly toward the app accent.
  const tint = (base, a, t) => {
    t = t == null ? 0.22 : t;
    const m = (i) => Math.round(base[i] + (a[i] - base[i]) * t);
    return 'rgb(' + m(0) + ',' + m(1) + ',' + m(2) + ')';
  };

  // ---- unique ids per icon (gradient defs) -----------------------------------
  let uid = 0;
  const gid = () => 'zg' + (uid++);
  function rg(id, stops) {
    const s = stops.map((st) => "<stop offset='" + st[0] + "' stop-color='" + st[1] + "'" + (st[2] != null ? " stop-opacity='" + st[2] + "'" : '') + '/>').join('');
    return "<radialGradient id='" + id + "'>" + s + '</radialGradient>';
  }

  // ---- the brush: tapered strokes as filled paths -----------------------------
  // Sample a cubic bezier, offset by a quadratic width profile [w0, wMid, w1].
  // t0..t1 lets a stroke DRAW ITSELF across frames while keeping its pressure.
  const F1 = (n) => (Math.round(n * 10) / 10);
  function brushD(p, w, t0, t1) {
    t0 = t0 || 0; t1 = t1 == null ? 1 : t1;
    const N = 16, L = [], R = [];
    for (let i = 0; i <= N; i++) {
      const t = t0 + (t1 - t0) * (i / N), u = 1 - t;
      const x = u * u * u * p[0] + 3 * u * u * t * p[2] + 3 * u * t * t * p[4] + t * t * t * p[6];
      const y = u * u * u * p[1] + 3 * u * u * t * p[3] + 3 * u * t * t * p[5] + t * t * t * p[7];
      let dx = 3 * u * u * (p[2] - p[0]) + 6 * u * t * (p[4] - p[2]) + 3 * t * t * (p[6] - p[4]);
      let dy = 3 * u * u * (p[3] - p[1]) + 6 * u * t * (p[5] - p[3]) + 3 * t * t * (p[7] - p[5]);
      const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
      const ww = (u * u * w[0] + 2 * u * t * w[1] + t * t * w[2]) / 2;
      L.push(F1(x - dy * ww) + ' ' + F1(y + dx * ww));
      R.push(F1(x + dy * ww) + ' ' + F1(y - dx * ww));
    }
    return 'M' + L.join(' L') + ' L' + R.reverse().join(' L') + ' Z';
  }
  const brush = (p, w, color, op, t0, t1) =>
    "<path d='" + brushD(p, w, t0, t1) + "' fill='" + (color || INK) + "'" + (op != null ? " opacity='" + op + "'" : '') + '/>';

  // Elliptical brush ring (enso, stone contours, bubbles). Angles in radians;
  // prog < 1 reveals the stroke being drawn while the pressure stays put.
  function ringD(cx, cy, rx, ry, a0, a1, w, prog) {
    const N = 30, L = [], R = [];
    const end = a0 + (a1 - a0) * (prog == null ? 1 : prog);
    for (let i = 0; i <= N; i++) {
      const a = a0 + (end - a0) * (i / N);
      const t = (a - a0) / (a1 - a0), u = 1 - t;
      const ww = (u * u * w[0] + 2 * u * t * w[1] + t * t * w[2]) / 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      L.push(F1(cx + (rx + ww) * ca) + ' ' + F1(cy + (ry + ww) * sa));
      R.push(F1(cx + (rx - ww) * ca) + ' ' + F1(cy + (ry - ww) * sa));
    }
    return 'M' + L.join(' L') + ' L' + R.reverse().join(' L') + ' Z';
  }
  const ring = (cx, cy, rx, ry, a0, a1, w, color, op, prog) =>
    "<path d='" + ringD(cx, cy, rx, ry, a0, a1, w, prog) + "' fill='" + (color || INK) + "'" + (op != null ? " opacity='" + op + "'" : '') + '/>';

  // ---- washes ----------------------------------------------------------------
  // Soft-edged watercolor: blurred shape only (a halo) ...
  const wash = (shape, op, xl) => "<g opacity='" + op + "' filter='url(#" + (xl ? 'zw2' : 'zw') + ")'>" + shape + '</g>';
  // ... or a POOL: solid core + blurred bleed past its own edge. This is what
  // makes color actually read on the sand desktop.
  const pool = (shape, op) => "<g opacity='" + op + "'>" + shape + '</g>' + wash(shape, Math.min(0.55, op * 0.8));
  const el = (cx, cy, rx, ry, fill) => "<ellipse cx='" + cx + "' cy='" + cy + "' rx='" + rx + "' ry='" + ry + "' fill='" + fill + "'/>";
  const ci = (cx, cy, r, fill, op) => "<circle cx='" + cx + "' cy='" + cy + "' r='" + r + "' fill='" + fill + "'" + (op != null ? " opacity='" + op + "'" : '') + '/>';

  // Organic stone: wash pool body + broken tapered contour (gap up-left).
  function blobD(cx, cy, rx, ry) {
    return 'M' + (cx - rx) + ' ' + cy
      + ' Q' + (cx - rx * 0.92) + ' ' + (cy - ry * 1.05) + ' ' + (cx - rx * 0.1) + ' ' + (cy - ry)
      + ' Q' + (cx + rx * 0.78) + ' ' + (cy - ry * 0.92) + ' ' + (cx + rx) + ' ' + (cy - ry * 0.05)
      + ' Q' + (cx + rx * 1.02) + ' ' + (cy + ry * 0.78) + ' ' + (cx + rx * 0.26) + ' ' + (cy + ry)
      + ' Q' + (cx - rx * 0.72) + ' ' + (cy + ry * 1.02) + ' ' + (cx - rx) + ' ' + cy + ' Z';
  }
  function stone(cx, cy, rx, ry, washC, washOp) {
    return pool("<path d='" + blobD(cx, cy, rx, ry) + "' fill='" + washC + "'/>", washOp)
      + ring(cx, cy, rx, ry, -2.4, 3.6, [1, 2.8, 0.8]);
  }

  // Raked-sand arcs: shallow concentric ellipse arcs that shimmer gently.
  function sand(cx, cy, r0, n, f, op0) {
    let s = '';
    for (let i = 0; i < n; i++) {
      const r = r0 + i * 7;
      const op = Math.max(0.08, (op0 || 0.38) - i * 0.07 + 0.08 * Math.sin((f / FR) * Math.PI * 2 + i * 1.7));
      s += "<path d='M" + (cx - r) + ' ' + cy + ' A' + r + ' ' + F1(r * 0.34) + " 0 0 0 " + (cx + r) + ' ' + cy + "' stroke='" + INK + "' stroke-width='1.8' fill='none' stroke-linecap='round' opacity='" + F1(op * 100) / 100 + "'/>";
    }
    return s;
  }

  // The signature: a small red hanko seal with a carved white mark.
  function hanko(x, y, s, op, rot) {
    return "<g transform='translate(" + x + ' ' + y + ") rotate(" + (rot == null ? -7 : rot) + ") scale(" + (s || 1) + ")'" + (op != null ? " opacity='" + op + "'" : '') + '>'
      + "<rect x='-5.5' y='-5.5' width='11' height='11' rx='2.2' fill='" + SEAL + "'/>"
      + "<path d='M-2.6 -2.4 h5.2 M0 -2.4 v5 M-2.6 2.6 h5.2' stroke='" + SEALHI + "' stroke-width='1.5' stroke-linecap='round' fill='none'/></g>";
  }

  // A brush-painted maple leaf: five fat lobe strokes that merge into a solid
  // palm with pointed tips, plus a stem.
  function leaf(x, y, s, rot, color, op) {
    let lobes = ci(0, -1.5, 3.6, color);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.62;
      const tx = Math.cos(a) * 9, ty = Math.sin(a) * 9 - 1.5;
      lobes += brush([0, -1.5, tx * 0.4, -1.5 + (ty + 1.5) * 0.4, tx * 0.75, -1.5 + (ty + 1.5) * 0.75, tx, ty], [6, 3, 0.4], color);
    }
    lobes += brush([0, 0, 0, 3.5, 0.8, 6.5, 0.2, 9.5], [2, 1.2, 0.4], color);
    return "<g transform='translate(" + x + ' ' + y + ") rotate(" + rot + ") scale(" + s + ")'" + (op != null ? " opacity='" + op + "'" : '') + '>' + lobes + '</g>';
  }

  // Breathing wash table (gentle in-out, loops cleanly).
  const BREATHE = [0, 0.3, 0.7, 1, 0.7, 0.3];

  // Frame wrapper: soft-wash filters + art on a TRANSPARENT ground.
  function shell(defs, art) {
    return "<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'>"
      + '<defs>'
      + "<filter id='zw' x='-45%' y='-45%' width='190%' height='190%'><feGaussianBlur stdDeviation='2.2'/></filter>"
      + "<filter id='zw2' x='-70%' y='-70%' width='240%' height='240%'><feGaussianBlur stdDeviation='5'/></filter>"
      + (defs || '') + '</defs>' + art + '</svg>';
  }

  // ---- subjects ---------------------------------------------------------------
  const ART = {};

  // Welcome — the enso draws itself; a maple leaf drifts through and lands.
  ART.welcome = (a, f) => {
    const prog = [0.3, 0.55, 0.8, 1, 1, 1][f];
    const mossW = tint(MOSS, a);
    const lx = [76, 70, 63, 58, 57, 57][f], ly = [16, 36, 57, 76, 79, 79][f];
    const lr = [-30, 5, 45, 78, 84, 84][f];
    const art =
      wash(el(62, 66, 30, 26, mossW), 0.24 + 0.07 * BREATHE[f], true)
      + ring(62, 64, 33, 33, -1.05, 4.9, [8.5, 5.2, 1], INK, null, prog)
      + (f >= 4 ? wash(el(58, 82, 10, 5, tint(LEAFRED, a, 0.1)), 0.3) : '')
      + leaf(lx, ly, 1.2, lr, tint(LEAFRED, a, 0.12))
      + hanko(102, 101, 0.95, f >= 3 ? 1 : 0);
    return { art };
  };

  // Wolves — THE showpiece: ink wolf howling at a bleeding wash moon.
  ART.wolves = (a, f) => {
    const g1 = gid();
    const glow = [0.5, 0.6, 0.72, 0.82, 0.74, 0.58][f];
    const mr = 27 + BREATHE[f] * 2.5;
    const mist = [0, 2, 4, 6, 4, 2][f];
    const defs = rg(g1, [[0, 'rgb(247,239,215)'], [0.55, tint(WATER, a, 0.15)], [1, tint(WATER, a, 0.15), 0]]);
    const wolf =
      "<path d='M36 20 Q46 23 51 31 Q60 41 63 52 Q68 68 62 82 L59 99 L66 99 L67 86 Q72 92 80 95 L80 99 L94 99 Q103 99 105 89 Q110 74 99 64 Q90 56 80 52 Q71 47 68 38 L74 27 L66 30 L63 19 L57 23 Q45 15 36 20 Z' fill='" + INK + "'/>"
      + brush([94, 98, 105, 100, 112, 96, 110, 87], [4, 3.2, 0.8]);
    const art =
      wash(ci(40, 36, mr, "url(#" + g1 + ")"), glow, true)
      + wash(ci(40, 36, 19, 'rgb(248,241,220)'), 0.6)
      + ring(40, 36, 20, 20, 0.8, 5.5, [0.6, 1.7, 0.4], INK2, 0.55)
      + wash("<path d='" + brushD([10, 72 - mist, 30, 69 - mist, 46, 74 - mist, 58, 71 - mist], [1, 3.5, 1]) + "' fill='" + tint(WATER, a, 0.1) + "'/>", 0.45)
      + wash("<path d='" + brushD([20, 86 + mist / 2, 38, 83 + mist / 2, 50, 87 + mist / 2, 60, 84 + mist / 2], [0.8, 3, 0.8]) + "' fill='" + tint(WATER, a, 0.1) + "'/>", 0.32)
      + "<g transform='rotate(" + [-1.5, -0.5, 0.5, 1.5, 0.5, -0.5][f] + " 84 99)'>" + wolf + '</g>'
      + brush([20, 103, 50, 99, 86, 101, 114, 104], [0.8, 4.5, 0.8])
      + sand(60, 112, 22, 2, f, 0.26)
      + hanko(115, 22, 0.85);
    return { defs, art };
  };

  // Video — a brush movie camera: two spinning reels, lens cone, hanko REC.
  ART.video = (a, f) => {
    const rec = [1, 0.55, 0.2, 0.55, 1, 0.8][f];
    const rot = f * 30;
    const reel = (cx, cy, r) => {
      let holes = '';
      for (let i = 0; i < 3; i++) {
        const t = (rot + i * 120) * Math.PI / 180;
        holes += ci(cx + Math.cos(t) * r * 0.52, cy + Math.sin(t) * r * 0.52, r * 0.2, INK);
      }
      return ring(cx, cy, r, r, -0.9, 5.1, [1.2, 3.2, 0.9])
        + pool(ci(cx, cy, r - 2, tint(WATER, a, 0.3)), 0.28)
        + holes + ci(cx, cy, 2, INK);
    };
    const art =
      // body
      pool("<rect x='30' y='56' width='54' height='36' rx='6' fill='" + tint(WATER, a) + "'/>", 0.3 + 0.06 * BREATHE[f])
      + brush([27, 56, 44, 54, 66, 56.5, 87, 55], [1.2, 3.6, 1.2])
      + brush([84, 55, 85, 66, 83.5, 80, 84.5, 93], [0.8, 2.8, 0.8])
      + brush([86, 92, 68, 94, 46, 91.5, 28, 93], [1.2, 3.6, 1.2])
      + brush([30, 92, 29.5, 80, 30.5, 68, 29.5, 55], [0.8, 2.8, 0.8])
      // reels
      + reel(43, 42, 13) + reel(69, 44, 10)
      // lens cone pointing right
      + pool("<path d='M85 66 L104 58 L104 88 L85 82 Z' fill='" + tint(WATER, a, 0.35) + "'/>", 0.3)
      + brush([84, 66, 91, 63, 98, 60.5, 105, 58], [2.6, 1.8, 1])
      + brush([84, 82, 91, 84.5, 98, 86.5, 105, 88], [2.6, 1.8, 1])
      + brush([104, 57, 104.5, 66, 103.5, 78, 104, 89], [0.8, 2.2, 0.8])
      // hanko-red REC light, pulsing
      + pool(ci(41, 74, 5, SEAL), rec)
      + "<path d='M56 72 h18 M56 78 h13' stroke='" + INK2 + "' stroke-width='1.8' stroke-linecap='round'/>";
    return { art };
  };

  // Folder — a folded washi packet tied with a dark-red cord, tails swaying.
  ART.folder = (a, f) => {
    const sway = [0, 1.5, 3, 1.5, 0, -1.5][f];
    const art =
      pool("<path d='M34 40 h60 v52 h-60 z' fill='" + PAPER + "'/>", 0.9)
      + wash("<path d='M34 40 h60 v52 h-60 z' fill='" + tint(CLAY, a, 0.3) + "'/>", 0.18 + 0.06 * BREATHE[f])
      // fold: top-right corner turned down, with its shadow
      + pool("<path d='M74 40 L94 40 L94 60 Z' fill='" + tint(CLAY, a, 0.3) + "'/>", 0.4)
      + "<path d='M74 40 L94 60' stroke='" + INK + "' stroke-width='2'/>"
      // packet outline, hand-drawn
      + brush([32, 40, 52, 38, 76, 40.5, 96, 39], [1.2, 3.4, 1.2])
      + brush([94, 39, 95, 58, 93.5, 76, 94.5, 93], [0.8, 3, 0.8])
      + brush([95, 92, 74, 94, 52, 91, 33, 93], [1.2, 3.4, 1.2])
      + brush([34, 93, 33.5, 76, 34.5, 60, 33.5, 39], [0.8, 3, 0.8])
      // cord: vertical + horizontal, knot, swaying tails
      + brush([58, 38, 58.5, 56, 57.5, 74, 58, 94], [2.2, 2.8, 1.8], SEAL)
      + brush([33, 66, 52, 65.4, 76, 66.6, 95, 66], [1.8, 2.6, 1.8], SEAL)
      + ci(58, 66, 4.4, SEAL)
      + brush([56, 69, 54.5, 74, 53.5 + sway * 0.6, 79, 52.5 + sway, 85], [2.4, 1.7, 0.5], SEAL)
      + brush([60, 69, 61.5, 74, 62.5 - sway * 0.6, 80, 63.5 - sway, 86], [2.4, 1.7, 0.5], SEAL);
    return { art };
  };

  // Notes — a washi strip; a bold calligraphy stroke writes itself.
  ART.notes = (a, f) => {
    const prog = [0.35, 0.6, 0.85, 1, 1, 1][f];
    const art =
      pool("<path d='M40 22 h48 v84 h-48 z' fill='" + PAPER + "'/>", 0.92)
      + wash("<path d='M40 22 h48 v84 h-48 z' fill='" + tint(MOSS, a, 0.2) + "'/>", 0.08)
      + brush([38, 22, 56, 20.5, 74, 22.5, 90, 21], [0.9, 2.8, 0.9])
      + brush([89, 21, 89.5, 50, 88.5, 80, 89, 107], [0.7, 2.4, 0.9])
      + brush([90, 106, 72, 108, 54, 105.5, 39, 107], [0.9, 2.8, 0.9])
      + brush([40, 107, 39.5, 78, 40.5, 50, 40, 21], [0.7, 2.4, 0.9])
      // finished character: horizontal, flick, side dot
      + brush([50, 36, 58, 38, 68, 36.5, 78, 38.5], [1.4, 4, 0.8])
      + brush([72, 44, 68, 50, 62, 54, 55, 56], [3, 2, 0.5])
      + brush([74, 52, 76, 55, 77, 58, 79, 61], [2.6, 1.6, 0.4])
      // the big vertical stroke being written now, with a wet wash halo
      + wash(el(63, 66 + 28 * prog, 5, 6.5, tint(MOSS, a, 0.15)), 0.16 * prog)
      + brush([62, 64, 60, 76, 65, 88, 60, 100], [4.4, 3, 0.6], INK, null, 0, prog)
      + hanko(79, 96, 0.8, f >= 3 ? 1 : 0.85);
    return { art };
  };

  // Calc — a soroban (abacus): brush frame, rods, one clay bead slides.
  ART.calc = (a, f) => {
    const by = [68, 63, 59.5, 59.5, 63, 68][f];
    const rods = [47, 61, 75, 89];
    const bead = (x, y, c) => "<path d='M" + (x - 6.2) + ' ' + y + ' Q' + x + ' ' + (y - 5.6) + ' ' + (x + 6.2) + ' ' + y + ' Q' + x + ' ' + (y + 5.6) + ' ' + (x - 6.2) + ' ' + y + " Z' fill='" + c + "'/>";
    let beads = '';
    rods.forEach((x, i) => {
      beads += bead(x, 43, INK);
      beads += i === 1
        ? pool(bead(x, by, tint(CLAY, a, 0.12)), 0.95)
        : bead(x, 68, INK);
      beads += bead(x, 80, INK);
    });
    const art =
      wash("<rect x='38' y='32' width='60' height='58' rx='6' fill='" + tint(CLAY, a, 0.35) + "'/>", 0.2 + 0.05 * BREATHE[f])
      + brush([34, 32, 56, 30.5, 82, 32.5, 102, 31], [1.4, 3.8, 1.4])
      + brush([100, 31, 100.5, 52, 99.5, 72, 100, 91], [1, 3.2, 1])
      + brush([102, 90, 82, 92, 58, 89.5, 34, 91], [1.4, 3.8, 1.4])
      + brush([36, 91, 35.5, 70, 36.5, 50, 36, 31], [1, 3.2, 1])
      + rods.map((x) => "<path d='M" + x + " 34 V88' stroke='" + INK2 + "' stroke-width='1.8'/>").join('')
      + brush([36, 51, 58, 50, 82, 51.6, 100, 51], [1.2, 3, 1.2]) // beam
      + beads;
    return { art };
  };

  // Timer — a zen cairn; the top stone settles into place with a tiny bounce.
  ART.timer = (a, f) => {
    const dy = [-16, -7, -1, 1.5, 0, 0][f];
    const landed = f >= 2;
    const art =
      sand(64, 107, 34, 3, f, 0.42)
      + stone(64, 91, 26, 11.5, tint(WATER, a), 0.55)
      + stone(62, 72, 19, 9, tint(CLAY, a), 0.5)
      + "<g transform='translate(0," + dy + ")'>" + stone(65, 56, 12.5, 7.5, tint(MOSS, a), 0.5) + '</g>'
      + (landed ? '' : "<path d='M48 53 h-7 M82 53 h7' stroke='" + INK2 + "' stroke-width='1.8' stroke-linecap='round' opacity='.7'/>")
      + hanko(101, 36, 0.85, landed ? 1 : 0);
    return { art };
  };

  // Fortune — a clay-wash cookie; the paper slip eases out of the fold.
  ART.fortune = (a, f) => {
    const slide = [0, 2, 4, 5.5, 4, 2][f];
    const art =
      // the slip, easing out of the center pinch toward lower-right
      "<g transform='translate(" + slide + ' ' + slide * 0.6 + ") rotate(-62 68 84)'>"
      + "<rect x='62' y='80' width='14' height='26' rx='2.5' fill='" + PAPER + "' stroke='" + INK + "' stroke-width='1.6'/>"
      + "<path d='M66 88 h6 M66 93 h4.5' stroke='" + INK2 + "' stroke-width='1.5' stroke-linecap='round'/></g>"
      // cookie body: a shallow crescent whose lip dips to the pinched center
      + pool("<path d='M22 78 A44 31 0 0 1 106 78 Q86 74 64 84 Q42 74 22 78 Z' fill='" + tint(CLAY, a, 0.15) + "'/>", 0.55)
      // outer contour: two strokes meeting at the crown
      + brush([22, 78, 28, 56, 46, 45, 64, 44], [1.4, 3.2, 2.2])
      + brush([64, 44, 82, 45, 100, 56, 106, 78], [2.2, 3.2, 1.4])
      // the folded lip, dipping to the pinch
      + brush([22, 78, 36, 75, 52, 78, 64, 84], [1, 2.6, 2.2])
      + brush([64, 84, 76, 78, 92, 75, 106, 78], [2.2, 2.6, 1])
      + sand(64, 100, 28, 2, f, 0.26);
    return { art };
  };

  // Guestbook — an open book with a pressed maple leaf bleeding into the page.
  ART.guestbook = (a, f) => {
    const bleed = 0.14 + 0.26 * BREATHE[f];
    const art =
      pool("<path d='M24 46 Q44 36 64 46 L64 92 Q44 82 24 92 Z' fill='" + PAPER + "'/><path d='M64 46 Q84 36 104 46 L104 92 Q84 82 64 92 Z' fill='" + PAPER + "'/>", 0.92)
      + brush([22, 46, 36, 39, 52, 39, 64, 46], [1, 3, 1.6])
      + brush([64, 46, 76, 39, 92, 39, 106, 46], [1.6, 3, 1])
      + brush([23, 46, 22.5, 62, 23.5, 78, 23, 92], [0.8, 2, 0.6])
      + brush([105, 46, 105.5, 62, 104.5, 78, 105, 92], [0.6, 2, 0.8])
      + brush([23, 92, 36, 85.5, 52, 85.5, 64, 92], [0.8, 2.6, 1.4])
      + brush([64, 92, 76, 85.5, 92, 85.5, 105, 92], [1.4, 2.6, 0.8])
      + "<path d='M64 46 V92' stroke='" + INK + "' stroke-width='2'/>"
      // handwriting on the left page
      + "<path d='M32 54 q8 -2 16 0 M32 62 q10 2 20 0 M32 70 q7 -2 14 0 M32 78 q9 2 17 0' stroke='" + INK2 + "' stroke-width='1.7' fill='none' stroke-linecap='round'/>"
      // pressed leaf + its wash halo bleeding into the paper
      + wash(el(85, 64, 13, 11, tint(LEAFRED, a, 0.1)), bleed)
      + leaf(85, 63, 1.2, 18, tint(LEAFRED, a, 0.1))
      + hanko(96, 84, 0.72, 0.95);
    return { art };
  };

  // Chat — two brush-ring speech bubbles; ink dots appear one by one.
  ART.chat = (a, f) => {
    const n = [1, 2, 3, 3, 2, 1][f];
    const art =
      pool(el(52, 50, 25, 19, PAPER), 0.85)
      + wash(el(52, 50, 25, 19, tint(WATER, a, 0.3)), 0.16)
      + ring(52, 50, 26, 20, -0.7, 5.2, [1, 3.4, 0.8])
      + brush([36, 66, 32, 74, 28, 80, 24, 86], [3.6, 2, 0.5])
      + range(3).map((i) => ci(42 + i * 10, 50, 3.2, INK, i < n ? 1 : 0.15)).join('')
      + pool(el(91, 82, 15, 11, tint(MOSS, a)), 0.4 + 0.08 * BREATHE[f])
      + ring(91, 82, 16, 12, 2.5, 8.4, [0.8, 2.8, 0.7])
      + brush([101, 91, 105, 96, 108, 100, 111, 105], [2.8, 1.6, 0.4])
      + range(2).map((i) => ci(87 + i * 9, 82, 2.4, PAPER, 0.9)).join('');
    return { art };
  };

  // Chest — a lacquered chest, lid ajar; warm light washes out of the gap.
  ART.chest = (a, f) => {
    const gap = [2, 3.5, 5, 6, 5, 3.5][f];
    const glow = 0.3 + 0.35 * BREATHE[f];
    const art =
      wash(el(66, 58, 26, 9, 'rgb(233,196,120)'), glow, true)
      // lid (tilted open by gap)
      + "<g transform='rotate(" + (-gap) + " 36 60)'>"
      + pool("<path d='M36 60 Q36 42 64 42 Q92 42 92 60 Z' fill='" + tint(CLAY, a) + "'/>", 0.5)
      + brush([34, 60, 40, 45, 54, 41, 65, 41], [1.2, 3.2, 2.4])
      + brush([65, 41, 76, 41, 88, 45, 94, 60], [2.4, 3.2, 1.2])
      + brush([34, 60, 52, 58.6, 76, 60.8, 94, 59.4], [1.2, 2.8, 1.2]) + '</g>'
      // box
      + pool("<rect x='36' y='63' width='56' height='31' rx='4' fill='" + tint(CLAY, a) + "'/>", 0.5)
      + brush([34, 63, 54, 61.8, 76, 63.8, 94, 62.6], [1.2, 3, 1.2])
      + brush([93, 63, 93.5, 73, 92.5, 84, 93, 94], [0.9, 2.6, 0.9])
      + brush([94, 94, 74, 95.6, 52, 93.4, 34, 94.8], [1.2, 3, 1.2])
      + brush([35, 94, 34.5, 84, 35.5, 73, 35, 62], [0.9, 2.6, 0.9])
      + "<path d='M46 64 V93 M82 64 V93' stroke='" + INK2 + "' stroke-width='1.8' opacity='.8'/>"
      + hanko(64, 76, 0.95, 1, 0) // the seal is the lock
      + sand(64, 106, 26, 2, f, 0.24);
    return { art };
  };

  // Tic-tac-toe — brush grid in raked sand; the O draws itself as a mini enso.
  ART.tictactoe = (a, f) => {
    const prog = [0.25, 0.5, 0.8, 1, 1, 1][f];
    const art =
      wash(el(64, 64, 32, 30, tint(CLAY, a, 0.35)), 0.22 + 0.05 * BREATHE[f], true)
      + brush([52, 30, 51, 52, 53, 76, 51.5, 98], [1.2, 3.4, 0.8])
      + brush([76, 31, 77, 54, 75.5, 76, 76.5, 99], [1.2, 3.4, 0.8])
      + brush([30, 52, 52, 51, 76, 53, 98, 51.5], [1.2, 3.4, 0.8])
      + brush([31, 76, 54, 77, 76, 75.5, 99, 76.5], [1.2, 3.4, 0.8])
      // ink X (played earlier), upper-left cell
      + brush([32, 33, 37, 38, 42, 42, 47, 47], [1.4, 4.2, 1])
      + brush([47, 33, 42, 38, 37, 43, 32, 47], [1, 3.6, 0.8])
      // a white stone sits in the center cell
      + stone(64, 64, 8.5, 7.5, PAPER, 0.95)
      // the O drawing itself, bottom-right cell
      + ring(87.5, 87.5, 8.5, 8.5, -1, 4.6, [4, 2.8, 0.7], INK, null, prog);
    return { art };
  };

  // Connect 4 — a clay stone drops down a bamboo-framed column and lands.
  ART.connect4 = (a, f) => {
    const dy = [26, 40, 54, 68, 66, 67][f];
    const landed = f >= 3;
    const open = (x, y) => ring(x, y, 7, 7, -2.2, 3.6, [0.6, 1.8, 0.5], INK2, 0.85);
    const moss = (x, y) => pool(ci(x, y, 6.8, tint(MOSS, a)), 0.55) + ring(x, y, 7, 7, -2.2, 3.6, [0.8, 2.2, 0.6]);
    const art =
      brush([37, 28, 36, 52, 38, 76, 36.5, 100], [1.2, 3.8, 1.5])
      + brush([91, 29, 92, 54, 90.5, 78, 91.5, 101], [1.2, 3.8, 1.5])
      + brush([28, 100, 50, 98.4, 78, 100.8, 100, 99], [1.4, 4.2, 1.4])
      + "<path d='M38 34 h52' stroke='" + INK2 + "' stroke-width='1.6' opacity='.55'/>"
      + open(46, 50) + open(82, 50)
      + open(46, 68) + open(82, 68)
      + moss(46, 86) + moss(82, 86)
      + moss(64, 86)
      + pool(ci(64, dy, 7.2, tint(CLAY, a, 0.1)), 0.6)
      + ring(64, dy, 7.2, 7.2, -2.2, 3.6, [0.9, 2.4, 0.7])
      + (landed ? sand(64, 96, 13, 1, f, 0.45) : '');
    return { art };
  };

  // Minesweeper — a round river stone with a smoking incense fuse.
  ART.minesweeper = (a, f) => {
    const ph = (f / FR) * Math.PI * 2;
    const s1 = Math.sin(ph) * 3.5, s2 = Math.sin(ph + 1.5) * 4;
    const ember = 0.55 + 0.45 * ((f % 2) ? 1 : 0.4);
    const art =
      // curling smoke (two thin drifting wisps)
      brush([72, 40, 79 + s1, 31, 64 + s2, 21, 74 + s1, 8], [1.2, 5, 0.5], INK2, 0.55)
      + brush([71, 38, 64 - s2, 29, 78 - s1, 19, 69 - s2, 7], [0.7, 3.2, 0.4], INK2, 0.34)
      // the stone
      + stone(60, 76, 26, 20, tint(WATER, a), 0.55)
      // a painted band across the stone (river-stone marking)
      + brush([38, 80, 50, 73, 70, 73, 85, 80], [1.2, 4.2, 1], PAPER, 0.92)
      // fuse + hanko-red ember (over the stone so it clearly sprouts from it)
      + brush([62, 58, 66, 51, 69, 46, 72, 41], [2.6, 1.7, 0.7])
      + wash(ci(72.5, 40, 5.5, SEAL), 0.45 * ember)
      + ci(72.5, 40, 3, SEAL, ember)
      + sand(60, 103, 30, 2, f, 0.3);
    return { art };
  };

  // Chess — a sumi pawn silhouette on goban lines; its shadow wash breathes.
  ART.chess = (a, f) => {
    const b = 0.3 + 0.14 * BREATHE[f];
    const art =
      "<path d='M26 60 h76 M26 84 h76 M44 40 v62 M84 40 v62' stroke='" + INK2 + "' stroke-width='1.6' opacity='.5'/>"
      + sand(64, 106, 28, 2, f, 0.26)
      + wash(el(64, 96, 22, 6, tint(CLAY, a)), b, true)
      // the pawn: one confident ink silhouette (ball head, collar, flared skirt)
      + "<path d='M64 30 a11.5 11.5 0 0 1 8 19.8 q-1.6 1.4 -0.6 3.2 l1.6 2 q1 2 -1 3 q1.6 12 8 22.5 q1.6 2.5 4.6 3.5 q4.4 1.5 4.4 5 v5 h-51 v-5 q0 -3.5 4.4 -5 q3 -1 4.6 -3.5 q6.4 -10.5 8 -22.5 q-2 -1 -1 -3 l1.6 -2 q1 -1.8 -0.6 -3.2 A11.5 11.5 0 0 1 64 30 Z' fill='" + INK + "'/>"
      + el(59.5, 37, 4, 2.2, 'rgba(250,246,234,0.5)')
      + brush([44, 88, 54, 86, 74, 86.5, 84, 87.5], [0.8, 2, 0.8], PAPER, 0.35)
      + hanko(100, 38, 0.8, 0.95);
    return { art };
  };

  // Paint — a ceramic dish with three washes bleeding; a brush rests across.
  ART.paint = (a, f) => {
    const g = (i) => 0.4 + 0.25 * BREATHE[(f + i * 2) % FR];
    const art =
      ring(60, 72, 32, 24, -0.6, 5.4, [1.2, 3.6, 0.9])
      + pool(el(60, 72, 30, 22, PAPER), 0.8)
      // three washes pooled in the dish, each bleeding on its own beat
      + pool(el(48, 66, 9 + BREATHE[f] * 1.5, 7, tint(MOSS, a, 0.12)), g(0))
      + pool(el(68, 62, 8 + BREATHE[(f + 2) % FR] * 1.5, 6.5, tint(CLAY, a, 0.12)), g(1))
      + pool(el(60, 80, 9 + BREATHE[(f + 4) % FR] * 1.5, 6.5, tint(WATER, a, 0.12)), g(2))
      // the brush: bamboo handle, cord wrap, wet ink tip
      + "<g transform='rotate(-36 92 48)'>"
      + brush([92, 10, 91.5, 25, 92.5, 40, 92, 53], [3, 3.4, 2.4], tint(CLAY, a, 0.15))
      + "<path d='M89.3 45 h5.4 M89.3 48 h5.4' stroke='" + INK2 + "' stroke-width='1.3'/>"
      + brush([92, 53, 91, 59, 92.5, 64, 92, 70], [4.6, 3, 0.5]) + '</g>'
      + hanko(30, 98, 0.8, 0.95);
    return { art };
  };

  // Spy — a brush magnifier sweeps over raked sand, glass tinted like water.
  ART.spy = (a, f) => {
    const mx = [-5, -2, 2, 5, 2, -2][f];
    const art =
      sand(58, 98, 16, 4, f, 0.4)
      + "<g transform='translate(" + mx + " 0)'>"
      + pool(ci(56, 54, 15, tint(WATER, a, 0.22)), 0.42)
      + ring(56, 54, 17.5, 17.5, -0.8, 5.1, [2.2, 4.2, 1.5])
      + brush([69, 66, 76, 74, 83, 81, 91, 89], [5.4, 4.2, 1.6])
      + "<path d='M46 46 a13 13 0 0 1 7 -5' stroke='" + PAPER + "' stroke-width='2.6' fill='none' stroke-linecap='round' opacity='.85'/>"
      + '</g>';
    return { art };
  };

  // Tilt — an ink phone rocks on a stone; the pebble inside rolls with it.
  ART.tilt = (a, f) => {
    const rot = [-10, -4, 4, 10, 4, -4][f];
    const art =
      stone(64, 99, 14, 5.5, tint(WATER, a), 0.5)
      + "<g transform='rotate(" + rot + " 64 94)'>"
      + pool("<rect x='47' y='32' width='34' height='60' rx='6' fill='" + PAPER + "'/>", 0.85)
      + brush([45, 32, 56, 30.6, 72, 32.8, 83, 31.4], [1.1, 3, 1.1])
      + brush([82, 31, 82.5, 52, 81.5, 74, 82, 93], [0.9, 2.6, 0.9])
      + brush([83, 92, 70, 93.8, 56, 91.6, 46, 93], [1.1, 3, 1.1])
      + brush([47, 93, 46.5, 74, 47.5, 52, 47, 31], [0.9, 2.6, 0.9])
      + wash("<rect x='52' y='40' width='24' height='44' rx='3' fill='" + tint(WATER, a, 0.3) + "'/>", 0.34)
      + pool(ci(64 + rot * 0.9, 76, 4.6, tint(MOSS, a, 0.1)), 0.65)
      + ring(64 + rot * 0.9, 76, 4.6, 4.6, -2.2, 3.6, [0.6, 1.7, 0.4])
      + '</g>'
      + "<path d='M36 74 q-5 -8 0 -16 M92 74 q5 -8 0 -16' stroke='" + INK2 + "' stroke-width='2.4' fill='none' stroke-linecap='round' opacity='" + (0.35 + 0.55 * Math.abs(rot) / 10) + "'/>";
    return { art };
  };

  // Dial — raked-sand gauge; a brush needle sweeps across the arcs.
  ART.dial = (a, f) => {
    const ang = [-52, -24, 8, 40, 8, -24][f] * Math.PI / 180;
    const tip = [64 + Math.sin(ang) * 33, 86 - Math.cos(ang) * 33];
    const mid = [64 + Math.sin(ang) * 17, 86 - Math.cos(ang) * 17];
    const arc = (r, w, op) => "<path d='M" + (64 - r) + " 86 A" + r + ' ' + r + " 0 0 1 " + (64 + r) + " 86' stroke='" + INK + "' stroke-width='" + w + "' fill='none' stroke-linecap='round' opacity='" + op + "'/>";
    const art =
      wash("<path d='M26 86 A38 38 0 0 1 102 86 Z' fill='" + tint(CLAY, a, 0.3) + "'/>", 0.24 + 0.05 * BREATHE[f], true)
      + arc(38, 2, 0.65) + arc(31, 1.8, 0.48) + arc(24, 1.6, 0.34)
      + pool(el(38, 72, 7, 5, tint(MOSS, a, 0.12)), 0.55)
      + pool(el(90, 72, 7, 5, tint(LEAFRED, a, 0.12)), 0.55)
      + brush([64, 86, mid[0], mid[1], (mid[0] + tip[0]) / 2, (mid[1] + tip[1]) / 2, tip[0], tip[1]], [4.8, 3, 0.6])
      + stone(64, 88, 7, 5.5, tint(WATER, a), 0.6)
      + brush([28, 98, 48, 96.6, 80, 98.8, 100, 97.2], [0.9, 3.2, 0.9]);
    return { art };
  };

  // Roulette — fanned washi dare cards; the stamped one lifts to be picked.
  ART.roulette = (a, f) => {
    const lift = [0, -2.5, -5, -6, -4, -1.5][f];
    const card = (rot, cx, extra) =>
      "<g transform='rotate(" + rot + ' ' + cx + " 92)'>"
      + pool("<rect x='" + (cx - 17) + "' y='36' width='34' height='52' rx='4' fill='" + PAPER + "'/>", 0.92)
      + "<rect x='" + (cx - 17) + "' y='36' width='34' height='52' rx='4' fill='none' stroke='" + INK + "' stroke-width='2'/>"
      + (extra || '') + '</g>';
    const art =
      card(-16, 56)
      + card(2, 62, "<path d='M52 62 q10 -3 20 0' stroke='" + INK2 + "' stroke-width='1.6' fill='none'/>")
      + "<g transform='translate(0 " + lift + ")'>"
      + card(16, 70,
        "<path d='M60 48 q10 -2.5 20 0 M60 56 q8 2 16 0' stroke='" + INK + "' stroke-width='1.8' fill='none' stroke-linecap='round'/>"
        + hanko(70, 72, 1, 1, 10))
      + '</g>'
      + sand(64, 104, 26, 2, f, 0.26);
    return { art };
  };

  // Fake Facts — a brush-ring face whose ink nose grows... and grows.
  ART.fakefacts = (a, f) => {
    const L = [14, 20, 26, 32, 26, 18][f];
    const art =
      wash(ci(50, 62, 22, tint(CLAY, a, 0.25)), 0.26 + 0.06 * BREATHE[f], true)
      + ring(50, 62, 24, 24, -1.2, 4.8, [1.4, 3.8, 1])
      + ci(42, 56, 2.8, INK) + ci(58, 56, 2.8, INK)
      + "<path d='M38 49 q4 -3 8 -1 M54 48 q4 -2 8 1' stroke='" + INK + "' stroke-width='2' fill='none' stroke-linecap='round'/>"
      + "<path d='M42 74 q7 4 14 0' stroke='" + INK + "' stroke-width='2.4' fill='none' stroke-linecap='round'/>"
      // the growing nose: one confident tapered stroke
      + brush([72, 60, 72 + L * 0.4, 60.5, 72 + L * 0.75, 62, 72 + L, 63.5], [6, 4.2, 1])
      + wash(ci(72 + L, 63, 4, tint(LEAFRED, a, 0.15)), 0.45);
    return { art };
  };

  // One Clue — a brush lightbulb; its warm wash glow pulses like a lantern.
  ART.oneclue = (a, f) => {
    const glow = [0.25, 0.42, 0.6, 0.72, 0.55, 0.34][f];
    const rays = range(5).map((i) => {
      const t = (-64 + i * 32) * Math.PI / 180;
      const x1 = 64 + Math.sin(t) * 27, y1 = 52 - Math.cos(t) * 27;
      const x2 = 64 + Math.sin(t) * 37, y2 = 52 - Math.cos(t) * 37;
      return brush([x1, y1, (x1 * 2 + x2) / 3, (y1 * 2 + y2) / 3, (x1 + x2 * 2) / 3, (y1 + y2 * 2) / 3, x2, y2], [2.4, 1.6, 0.4], INK, glow);
    }).join('');
    const art =
      wash(ci(64, 52, 19 + glow * 6, 'rgb(233,196,120)'), glow, true)
      + pool(ci(64, 52, 14, 'rgb(240,214,160)'), 0.4 + glow * 0.3)
      + ring(64, 52, 19, 20, -2.2, 3.5, [1.2, 3.4, 0.9])
      + brush([56, 68, 55, 72, 56, 76, 55.5, 80], [2.4, 2, 1.6])
      + brush([72, 68, 73, 72, 72, 76, 72.5, 80], [2.4, 2, 1.6])
      + "<path d='M56 82 q8 3 16 0 M57 87 q7 2.6 14 0' stroke='" + INK + "' stroke-width='2.2' fill='none' stroke-linecap='round'/>"
      + "<path d='M57 58 q3.5 -6 7 0 q3.5 6 7 0' stroke='" + INK + "' stroke-width='2' fill='none' stroke-linecap='round'/>"
      + rays;
    return { art };
  };

  // Same Brain — two stone heads, the same moss thought swirling in sync.
  ART.samebrain = (a, f) => {
    const prog = [0.4, 0.65, 0.9, 1, 0.9, 0.65][f];
    const moss = tint(MOSS, a, 0.1);
    const mind = (cx) =>
      pool(ci(cx, 64, 18, PAPER), 0.75)
      + ring(cx, 64, 19.5, 20.5, -1.9, 4.1, [1.2, 3.2, 0.9])
      + ring(cx, 62, 9.5, 9.5, -0.5, 4.4, [3.6, 2.4, 0.5], moss, null, prog)
      + ring(cx + 1, 63, 4.2, 4.2, 1.4, 5.8, [2.4, 1.6, 0.4], moss, null, prog)
      + "<path d='M" + (cx - 6) + " 76 q6 3 12 0' stroke='" + INK + "' stroke-width='1.8' fill='none' stroke-linecap='round'/>";
    const art =
      mind(40) + mind(88)
      + "<path d='M52 38 q12 -10 24 0' stroke='" + INK2 + "' stroke-width='2' fill='none' stroke-dasharray='1 5.5' stroke-linecap='round'/>"
      + pool(el(64, 32, 7, 4.5, moss), 0.35 + 0.3 * BREATHE[f])
      + brush([28, 96, 46, 94.4, 82, 96.8, 100, 95], [0.9, 3.4, 0.9]);
    return { art };
  };

  // Imposter — three pebbles meditate; the clay one can't sit still.
  ART.imposter = (a, f) => {
    const rot = [-5, -2, 2, 5, 2, -2][f];
    const closedEye = (x, y) => "<path d='M" + (x - 3.4) + ' ' + y + " q3.4 2.8 6.8 0' stroke='" + INK + "' stroke-width='2' fill='none' stroke-linecap='round'/>";
    const art =
      sand(64, 106, 32, 2, f, 0.26)
      + stone(32, 80, 15, 13, tint(WATER, a), 0.5)
      + closedEye(25, 78) + closedEye(36, 78)
      + stone(97, 81, 14, 12, tint(WATER, a), 0.5)
      + closedEye(91, 79) + closedEye(101, 79)
      + "<g transform='rotate(" + rot + " 64 82)'>"
      + stone(64, 78, 17, 15, tint(CLAY, a, 0.1), 0.55)
      + ci(58 + rot * 0.4, 74, 2.7, INK) + ci(70 + rot * 0.4, 74, 2.7, INK)
      + "<path d='M59 85 q5 -2.5 10 0' stroke='" + INK + "' stroke-width='2' fill='none' stroke-linecap='round'/>"
      + '</g>'
      + brush([64 + rot, 54, 66 + rot, 49, 63 + rot, 45, 66 + rot, 40], [0.7, 2.4, 0.5], INK, 0.6)
      + ci(65 + rot, 58.5, 1.5, INK, 0.6);
    return { art };
  };

  // ---- letter fallback: a calligraphy character + hanko ----------------------
  function fallbackArt(letter, a, f) {
    const prog = [0.4, 0.65, 0.9, 1, 1, 1][f];
    const art =
      wash(el(60, 58, 28, 26, tint(MOSS, a, 0.35)), 0.2 + 0.06 * BREATHE[f], true)
      + "<text x='58' y='80' font-family='Georgia,\"Times New Roman\",serif' font-style='italic' font-weight='700' font-size='60' fill='" + INK + "' text-anchor='middle'>" + letter + '</text>'
      + brush([32, 92, 50, 97, 76, 95, 98, 88], [0.9, 4, 0.6], INK, null, 0, prog)
      + hanko(99, 64, 0.95, f >= 3 ? 1 : 0.9);
    return { art };
  }

  GifOS.iconPacks.register('zen', {
    size: SIZE, frames: FR, delayCs: DELAY, dither: 10,
    draw(subject, accent) {
      const builder = ART[subject];
      if (!builder) return null;
      return range(FR).map((f) => { const r = builder(accent, f); return shell(r.defs, r.art); });
    },
    fallback(letter, accent) {
      return range(FR).map((f) => { const r = fallbackArt(letter, accent, f); return shell(r.defs, r.art); });
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
