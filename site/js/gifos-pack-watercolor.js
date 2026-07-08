/*
 * gifos-pack-watercolor.js — "Watercolor", 6.gifos.app.
 *
 * Loose scratchy ink over wet watercolor blooms, straight from the reference
 * art: every object is drawn with 2-3 overlapping jittered pen passes (the
 * multi-stroke sketch look), filled with translucent indigo/orange/teal blooms
 * whose edges are broken by turbulence displacement, garnished with splatter.
 *
 * The animation IS the medium: the ink lines "boil" — each frame re-displaces
 * the strokes with a different turbulence seed, exactly how hand-drawn
 * animation breathes — while the blooms slowly swell and settle. Deliberately
 * slow (24cs): watercolor doesn't hurry.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  if (!GifOS.iconPacks) return;

  const FR = 5, SIZE = 192, DELAY = 24;
  const range = (n) => Array.from({ length: n }, (_, i) => i);

  // The reference palette: indigo, warm orange, teal, deep ink.
  const INK = '#2b2733';
  const INDIGO = '#3d4e9e', ORANGE = '#e8833a', TEAL = '#3f8f8f', GOLD = '#e8b83a';
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const hx = (n) => n.toString(16).padStart(2, '0');
  const toHex = (a) => '#' + hx(clamp(a[0])) + hx(clamp(a[1])) + hx(clamp(a[2]));
  // Accent softened toward the reference's muted watercolor register.
  const wash = (a) => toHex([a[0] * 0.75 + 40, a[1] * 0.75 + 40, a[2] * 0.75 + 40]);

  let uid = 0;
  const id = () => 'w' + (uid++);

  // Per-frame breathing: blooms swell/settle, phase-shifted so the paint feels wet.
  const BREATH = (f, ph) => 1 + 0.035 * Math.sin(((f / FR) * 2 + (ph || 0)) * Math.PI);
  const OPAC = (f, ph) => 1 + 0.12 * Math.sin(((f / FR) * 2 + (ph || 0) + 0.5) * Math.PI);

  // A watercolor bloom: overlapping displaced ellipses; edges broken by the
  // shared 'wc' turbulence filter, softly blurred, slightly edge-darkened.
  function bloom(cx, cy, r, color, f, ph, squash) {
    const s = BREATH(f, ph), o = OPAC(f, ph);
    const ry = r * (squash || 0.82);
    return "<g filter='url(#wc)' transform='translate(" + cx + ',' + cy + ") scale(" + s + ")'>"
      + "<ellipse rx='" + r + "' ry='" + ry + "' fill='" + color + "' opacity='" + (0.44 * o).toFixed(3) + "'/>"
      + "<ellipse cx='" + (r * 0.18) + "' cy='" + (-ry * 0.12) + "' rx='" + (r * 0.72) + "' ry='" + (ry * 0.66) + "' fill='" + color + "' opacity='" + (0.38 * o).toFixed(3) + "'/>"
      + "<ellipse rx='" + r + "' ry='" + ry + "' fill='none' stroke='" + color + "' stroke-width='1.4' opacity='" + (0.22 * o).toFixed(3) + "'/>"
      + '</g>';
  }

  // Paint splatter: a few displaced droplets that come and go with the boil.
  function splat(cx, cy, color, f, ph) {
    const on = (f + (ph || 0)) % FR;
    const o = on < 2 ? 0.5 : on < 4 ? 0.3 : 0.12;
    return "<g filter='url(#wc)' fill='" + color + "' opacity='" + o + "'>"
      + "<circle cx='" + cx + "' cy='" + cy + "' r='3.2'/>"
      + "<circle cx='" + (cx + 9) + "' cy='" + (cy - 6) + "' r='1.8'/>"
      + "<circle cx='" + (cx - 7) + "' cy='" + (cy + 5) + "' r='1.3'/>"
      + '</g>';
  }

  // Scratchy multi-pass ink: the same path drawn 2-3 times with tiny offsets
  // and rotations — the overlapping-stroke pen look of the reference. The
  // whole group runs through the per-frame 'boil' displacement.
  function inky(d, w) {
    w = w || 3.1;
    return "<g fill='none' stroke='" + INK + "' stroke-linecap='round' stroke-linejoin='round'>"
      + "<path d='" + d + "' stroke-width='" + w + "' opacity='.9'/>"
      + "<path d='" + d + "' stroke-width='" + (w * 0.62) + "' opacity='.55' transform='translate(1.6,-1.1) rotate(.7 96 96)'/>"
      + "<path d='" + d + "' stroke-width='" + (w * 0.5) + "' opacity='.32' transform='translate(-1.3,1.4) rotate(-.6 96 96)'/>"
      + '</g>';
  }
  // Solid ink shape (silhouettes: pawn, wolf) — still boiled, still layered.
  function inkFill(d) {
    return "<g fill='" + INK + "'>"
      + "<path d='" + d + "' opacity='.92'/>"
      + "<path d='" + d + "' opacity='.22' transform='translate(1,-0.7)'/>"
      + '</g>';
  }
  // The little scribble doodles that float around the reference's folder.
  function doodle(cx, cy, s, f) {
    const o = 0.5 + 0.3 * Math.sin(((f / FR) * 2) * Math.PI);
    return "<g transform='translate(" + cx + ',' + cy + ") scale(" + (s || 1) + ")' opacity='" + o.toFixed(2) + "'>"
      + inky('M0 0 a5 5 0 1 1 5 5 M14 -4 a4 4 0 1 0 4 -4 M24 2 a2.5 2.5 0 1 1 3 2', 1.8) + '</g>';
  }

  // Frame shell: shared filters (per-frame boil seed!), then art. Watercolor
  // floats on transparency — no plate, no shadow; the blooms ARE the ground.
  function shell(art, f) {
    return "<svg xmlns='http://www.w3.org/2000/svg' width='192' height='192' viewBox='0 0 192 192'>"
      + '<defs>'
      + "<filter id='boil' x='-15%' y='-15%' width='130%' height='130%'>"
      + "<feTurbulence type='fractalNoise' baseFrequency='0.014 0.02' numOctaves='2' seed='" + (f * 7 + 3) + "'/>"
      + "<feDisplacementMap in='SourceGraphic' scale='3.4'/></filter>"
      + "<filter id='wc' x='-40%' y='-40%' width='180%' height='180%'>"
      + "<feTurbulence type='fractalNoise' baseFrequency='0.052' numOctaves='3' seed='11'/>"
      + "<feDisplacementMap in='SourceGraphic' scale='16'/>"
      + "<feGaussianBlur stdDeviation='1.1'/></filter>"
      + '</defs>' + art + '</svg>';
  }
  // Most subjects: blooms behind, boiled ink in front. When a body path is
  // given, the blooms are CLIPPED to the object (paint fills it edge-to-edge,
  // like the reference) and one extra echo of the first bloom stays unclipped
  // so color still bleeds past the ink.
  function compose(blooms, ink, f, bodyD) {
    let paint = blooms;
    if (bodyD) {
      const c = id();
      paint = "<clipPath id='" + c + "'><path d='" + bodyD + "'/></clipPath>"
        + "<g opacity='.55'>" + blooms + '</g>'
        + "<g clip-path='url(#" + c + ")'>" + blooms + blooms.replace(/opacity='([0-9.]+)'/g, function (m, v) { return "opacity='" + Math.min(0.6, v * 1.25).toFixed(3) + "'"; }) + '</g>';
    }
    return shell(paint + "<g filter='url(#boil)'>" + ink + '</g>', f);
  }

  const ART = {};

  // Video — the reference's own camera: sketchy rounded body, big lens circle,
  // triangle viewfinder, blooms bleeding through, rec dot pulsing.
  ART.video = (a, f) => {
    const blooms = bloom(84, 96, 46, INDIGO, f, 0) + bloom(70, 78, 30, TEAL, f, 0.6)
      + bloom(102, 112, 28, ORANGE, f, 1.2) + bloom(150, 96, 18, wash(a), f, 0.4)
      + splat(40, 138, INDIGO, f, 1);
    const ink =
      inky('M44 58 h78 q8 0 8 8 v58 q0 8 -8 8 h-78 q-8 0 -8 -8 v-58 q0 -8 8 -8 z M42 62 h80 M46 130 h76')
      + inky('M84 95 m-27 0 a27 27 0 1 1 54 0 a27 27 0 1 1 -54 0 M84 95 m-22 0 a22 22 0 1 0 44 0 a22 22 0 1 0 -44 0', 2.2)
      + inky('M132 84 l26 -14 v52 l-26 -14 z', 2.4)
      + "<circle cx='150' cy='60' r='" + (f % 2 ? 4.5 : 3.4) + "' fill='" + ORANGE + "' opacity='.8'/>";
    return compose(blooms, ink, f);
  };

  // Folder — the reference's folder with the floating scribble doodles.
  ART.folder = (a, f) => {
    const blooms = bloom(78, 118, 44, ORANGE, f, 0) + bloom(112, 130, 36, INDIGO, f, 0.8)
      + bloom(64, 138, 26, wash(a), f, 1.4) + splat(148, 150, ORANGE, f, 2);
    const ink =
      inky('M40 88 v-14 q0 -6 6 -6 h30 l8 10 h60 q6 0 6 6 v4')
      + inky('M38 92 h112 q6 0 6 6 l-4 44 q-1 8 -9 8 h-92 q-8 0 -9 -8 l-8 -44 q-1 -6 4 -6 z')
      + inky('M46 84 h96', 1.8)
      + doodle(96, 52, 1.1, f);
    return compose(blooms, ink, f);
  };

  // Welcome — the reference's cube, blooms inside the faces.
  ART.welcome = (a, f) => {
    const blooms = bloom(96, 96, 40, ORANGE, f, 0) + bloom(78, 112, 30, INDIGO, f, 0.7)
      + bloom(116, 84, 24, wash(a), f, 1.3) + splat(150, 66, INDIGO, f, 0);
    const ink =
      inky('M96 44 L146 68 L96 92 L46 68 Z')
      + inky('M46 68 V128 L96 152 V92 M146 68 V128 L96 152')
      + inky('M96 44 L146 68 M96 92 L96 96', 1.8);
    return compose(blooms, ink, f);
  };

  // Chest — treasure chest, lid cracked, gold bloom spilling.
  ART.chest = (a, f) => {
    const lift = [0, 1.5, 3, 2, 0.5][f];
    const blooms = bloom(96, 110, 44, ORANGE, f, 0) + bloom(76, 126, 30, INDIGO, f, 0.9)
      + bloom(96, 84, 22, GOLD, f, 0.4) + splat(148, 136, ORANGE, f, 1);
    const ink =
      "<g transform='translate(0," + (-lift) + ")'>"
      + inky('M52 88 v-8 q0 -22 44 -22 q44 0 44 22 v8 z') + '</g>'
      + inky('M50 92 h92 v42 q0 8 -8 8 h-76 q-8 0 -8 -8 z')
      + inky('M88 86 h16 v18 h-16 z M96 96 v6', 2.2)
      + inky('M62 92 v48 M130 92 v48', 1.6);
    return compose(blooms, ink, f);
  };

  // Notes — sketchpad with a written line growing.
  ART.notes = (a, f) => {
    const w = 20 + 40 * (f / (FR - 1));
    const blooms = bloom(96, 104, 42, INDIGO, f, 0) + bloom(112, 84, 26, TEAL, f, 0.8)
      + bloom(76, 128, 24, wash(a), f, 1.5);
    const ink =
      inky('M58 48 h76 q6 0 6 6 v84 q0 6 -6 6 h-76 q-6 0 -6 -6 v-84 q0 -6 6 -6 z')
      + inky('M66 46 v-8 M84 46 v-8 M102 46 v-8 M120 46 v-8', 2)
      + inky('M68 78 h56 M68 96 h56 M68 114 h38', 1.8)
      + "<path d='M68 96 h" + w + "' stroke='" + ORANGE + "' stroke-width='4' fill='none' stroke-linecap='round' opacity='.75'/>";
    return compose(blooms, ink, f);
  };

  // Calc — sketchy calculator, one key blooms orange per frame.
  ART.calc = (a, f) => {
    const kx = 70 + (f % 3) * 26, ky = 96 + (f % 2) * 24;
    const blooms = bloom(96, 96, 44, TEAL, f, 0) + bloom(80, 120, 26, INDIGO, f, 0.9)
      + "<g filter='url(#wc)'><circle cx='" + kx + "' cy='" + ky + "' r='11' fill='" + ORANGE + "' opacity='.5'/></g>";
    const ink =
      inky('M58 42 h76 q6 0 6 6 v96 q0 6 -6 6 h-76 q-6 0 -6 -6 v-96 q0 -6 6 -6 z')
      + inky('M66 52 h60 v18 h-60 z', 2.2)
      + inky('M70 92 h8 M96 92 h8 M122 92 h8 M70 116 h8 M96 116 h8 M122 116 h8 M70 138 h8 M96 138 h8 M122 138 h8', 2.6);
    return compose(blooms, ink, f);
  };

  // Timer — stopwatch, hand sweeping slowly, teal bloom face.
  ART.timer = (a, f) => {
    const ang = f * 72;
    const blooms = bloom(96, 106, 40, TEAL, f, 0) + bloom(112, 90, 24, INDIGO, f, 0.7)
      + bloom(78, 122, 22, ORANGE, f, 1.3);
    const ink =
      inky('M96 106 m-40 0 a40 40 0 1 1 80 0 a40 40 0 1 1 -80 0')
      + inky('M96 66 v-14 M88 46 h16 M92 40 h8', 2.4)
      + inky('M124 70 l10 -10', 2.4)
      + "<g transform='rotate(" + ang + " 96 106)'>" + inky('M96 106 V76', 2.8) + '</g>'
      + inky('M96 106 m-3 0 a3 3 0 1 1 6 0 a3 3 0 1 1 -6 0', 2);
    return compose(blooms, ink, f);
  };

  // Tic-tac-toe — sketch grid, watercolor X and O.
  ART.tictactoe = (a, f) => {
    const blooms = bloom(70, 70, 20, ORANGE, f, 0) + bloom(122, 122, 20, TEAL, f, 0.8)
      + bloom(96, 96, 40, wash(a), f, 1.4, 0.9);
    const ink =
      inky('M78 48 v96 M114 48 v96 M48 78 h96 M48 114 h96')
      + "<g filter='url(#wc)'><path d='M60 60 l20 20 M80 60 l-20 20' stroke='" + ORANGE + "' stroke-width='7' stroke-linecap='round' fill='none' opacity='.65'/></g>"
      + "<g filter='url(#wc)'><circle cx='122' cy='122' r='11' stroke='" + TEAL + "' stroke-width='7' fill='none' opacity='.6'/></g>"
      + inky('M120 58 l16 16 M136 58 l-16 16', 2);
    return compose(blooms, ink, f);
  };

  // Connect4 — grid with three bloomed discs, one dropping.
  ART.connect4 = (a, f) => {
    const dy = [46, 62, 80, 80, 80][f];
    const blooms = bloom(96, 112, 42, INDIGO, f, 0, 0.75)
      + "<g filter='url(#wc)'><circle cx='72' cy='128' r='10' fill='" + ORANGE + "' opacity='.6'/>"
      + "<circle cx='120' cy='128' r='10' fill='" + TEAL + "' opacity='.6'/>"
      + "<circle cx='72' cy='" + dy + "' r='10' fill='" + GOLD + "' opacity='.65'/></g>";
    const ink =
      inky('M52 88 h88 q6 0 6 6 v46 q0 6 -6 6 h-88 q-6 0 -6 -6 v-46 q0 -6 6 -6 z')
      + inky('M72 104 m-10 0 a10 10 0 1 1 20 0 a10 10 0 1 1 -20 0 M96 104 m-10 0 a10 10 0 1 1 20 0 a10 10 0 1 1 -20 0 M120 104 m-10 0 a10 10 0 1 1 20 0 a10 10 0 1 1 -20 0', 1.8)
      + inky('M72 128 m-10 0 a10 10 0 1 1 20 0 a10 10 0 1 1 -20 0 M96 128 m-10 0 a10 10 0 1 1 20 0 a10 10 0 1 1 -20 0 M120 128 m-10 0 a10 10 0 1 1 20 0 a10 10 0 1 1 -20 0', 1.8)
      + (f < 3 ? inky('M72 ' + dy + ' m-10 0 a10 10 0 1 1 20 0 a10 10 0 1 1 -20 0', 2) : '');
    return compose(blooms, ink, f);
  };

  // Minesweeper — round bomb, indigo body bloom, sparking fuse.
  ART.minesweeper = (a, f) => {
    const s = f % 2 ? 1.25 : 0.85;
    const blooms = bloom(90, 112, 38, INDIGO, f, 0) + bloom(104, 96, 24, TEAL, f, 0.9)
      + splat(52, 76, INDIGO, f, 0);
    const ink =
      inky('M90 112 m-34 0 a34 34 0 1 1 68 0 a34 34 0 1 1 -68 0')
      + inky('M112 86 q4 -14 20 -18', 2.4)
      + inky('M104 78 l14 -6 -4 14 z', 2)
      + "<g transform='translate(136,62) scale(" + s + ")' filter='url(#wc)'>"
      + "<circle r='7' fill='" + ORANGE + "' opacity='.7'/><path d='M-11 0 H11 M0 -11 V11 M-8 -8 L8 8 M8 -8 L-8 8' stroke='" + ORANGE + "' stroke-width='2.4' opacity='.6'/></g>";
    return compose(blooms, ink, f);
  };

  // Chess — solid ink pawn (silhouette) over a warm bloom.
  ART.chess = (a, f) => {
    const blooms = bloom(96, 110, 40, ORANGE, f, 0) + bloom(78, 90, 24, INDIGO, f, 0.8)
      + splat(140, 130, ORANGE, f, 1);
    const ink =
      inkFill('M96 46 a13 13 0 0 1 13 13 a13 13 0 0 1 -7 11.6 q2.4 14 8 22.4 h-28 q5.6 -8.4 8 -22.4 a13 13 0 0 1 -7 -11.6 a13 13 0 0 1 13 -13 z')
      + inky('M74 100 h44', 2.4)
      + inkFill('M70 132 q0 -10 12 -12 h28 q12 2 12 12 l2 8 h-56 z');
    return compose(blooms, ink, f);
  };

  // Paint — palette with real paint blooms as wells, brush diving.
  ART.paint = (a, f) => {
    const dip = Math.abs(Math.sin((f / FR) * Math.PI * 2)) * 8;
    const blooms = bloom(84, 108, 42, wash(a), f, 0, 0.8)
      + "<g filter='url(#wc)'>"
      + "<circle cx='68' cy='96' r='9' fill='" + ORANGE + "' opacity='.65'/>"
      + "<circle cx='90' cy='86' r='9' fill='" + INDIGO + "' opacity='.65'/>"
      + "<circle cx='112' cy='96' r='9' fill='" + TEAL + "' opacity='.65'/>"
      + "<circle cx='66' cy='122' r='9' fill='" + GOLD + "' opacity='.65'/></g>"
      + splat(140, 148, INDIGO, f, 2);
    const ink =
      inky('M84 70 c-34 0 -50 18 -50 38 c0 20 18 32 42 32 c10 0 10 -8 5 -13 c-5 -5 -1 -13 8 -13 c10 0 28 3 38 -8 c8 -8 3 -36 -43 -36 z')
      + inky('M84 108 m-5 0 a5 5 0 1 1 10 0 a5 5 0 1 1 -10 0', 2)
      + "<g transform='translate(138," + (44 + dip) + ") rotate(38)'>"
      + inky('M0 0 v26 M-4 -8 h8 l-1 8 h-6 z M0 -8 q-4 -10 0 -16', 2.2) + '</g>';
    return compose(blooms, ink, f);
  };

  // Fortune — the folded cookie, slip easing out, warm blooms.
  ART.fortune = (a, f) => {
    const slide = [0, 2, 4, 5, 3][f];
    const blooms = bloom(92, 104, 40, GOLD, f, 0) + bloom(112, 88, 24, ORANGE, f, 0.7)
      + bloom(72, 120, 22, INDIGO, f, 1.4);
    const ink =
      "<g transform='translate(" + slide + ',' + (-slide * 0.3) + ")'>"
      + inky('M112 72 l30 -8 v16 l-30 6 z', 2) + inky('M118 72 l16 -4 M118 78 l12 -3', 1.4) + '</g>'
      + inky('M52 108 a44 38 0 0 1 88 0 L128 104 q-16 -7 -30 8 q-16 -14 -32 -6 z')
      + inky('M96 62 q-4 20 0 44', 1.6);
    return compose(blooms, ink, f);
  };

  // Guestbook — open book, watercolor heart bleeding on the page.
  ART.guestbook = (a, f) => {
    const hs = BREATH(f, 0.5);
    const blooms = bloom(96, 104, 42, wash(a), f, 0, 0.7)
      + "<g filter='url(#wc)' transform='translate(74,92) scale(" + hs + ")'>"
      + "<path d='M0 10 C-13 -1 -9 -14 0 -8 C9 -14 13 -1 0 10 Z' fill='" + ORANGE + "' opacity='.6'/></g>";
    const ink =
      inky('M42 66 Q68 52 96 66 L96 138 Q68 124 42 138 Z')
      + inky('M150 66 Q124 52 96 66 L96 138 Q124 124 150 138 Z')
      + inky('M108 84 h28 M108 98 h24 M108 112 h26', 1.8);
    return compose(blooms, ink, f);
  };

  // Chat — two sketch bubbles, typing dots blooming in turn.
  ART.chat = (a, f) => {
    const blooms = bloom(84, 82, 36, TEAL, f, 0, 0.75) + bloom(122, 128, 24, ORANGE, f, 0.9, 0.8)
      + "<g filter='url(#wc)'>" + [64, 84, 104].map((x, i) =>
        "<circle cx='" + x + "' cy='82' r='" + (f % 3 === i ? 7 : 4.5) + "' fill='" + INDIGO + "' opacity='.55'/>").join('') + '</g>';
    const ink =
      inky('M44 58 h80 q8 0 8 8 v26 q0 8 -8 8 h-52 l-16 14 v-14 h-12 q-8 0 -8 -8 v-26 q0 -8 8 -8 z')
      + inky('M104 112 h36 q6 0 6 6 v14 q0 6 -6 6 h-8 l10 10 l-24 -10 h-14 q-6 0 -6 -6 v-14 q0 -6 6 -6 z', 2.2);
    return compose(blooms, ink, f);
  };

  // Imposter — three ink blob-buddies; the odd one is a bloom of accent.
  ART.imposter = (a, f) => {
    const px = [-2, 0, 2, 0, -2][f];
    const blooms = bloom(96, 120, 40, INDIGO, f, 0, 0.6)
      + "<g filter='url(#wc)'><path d='M82 96 q0 -18 14 -18 q14 0 14 18 v22 h-28 z' fill='" + ORANGE + "' opacity='.6'/></g>";
    const ink =
      inky('M50 118 q0 -14 11 -14 q11 0 11 14 v14 h-22 z', 2.2)
      + inky('M120 120 q0 -13 10 -13 q10 0 10 13 v12 h-20 z', 2.2)
      + inky('M82 96 q0 -18 14 -18 q14 0 14 18 v22 h-28 z', 2.6)
      + "<g transform='translate(" + px + ",0)'>" + inky('M90 92 a4 3 0 1 0 8 0 M100 92 a4 3 0 1 0 8 0', 1.8) + '</g>'
      + inky('M122 66 a6 6 0 1 1 8 6 q-2 1 -2 5 M128 84 v2', 2);
    return compose(blooms, ink, f);
  };

  // Spy — magnifier over a bloom fingerprint.
  ART.spy = (a, f) => {
    const mx = [0, 4, 8, 5, 1][f];
    const blooms = bloom(84, 104, 36, wash(a), f, 0)
      + "<g filter='url(#wc)' opacity='.55'>"
      + inky('M76 96 a14 14 0 1 1 20 12 M72 106 a22 22 0 1 1 30 14', 1.6).replace(new RegExp(INK, 'g'), INDIGO) + '</g>';
    const ink =
      "<g transform='translate(" + mx + ",0)'>"
      + inky('M84 92 m-26 0 a26 26 0 1 1 52 0 a26 26 0 1 1 -52 0')
      + inky('M103 111 l26 26', 3.2)
      + inky('M68 78 a20 20 0 0 1 14 -6', 1.8) + '</g>';
    return compose(blooms, ink, f);
  };

  // Tilt — phone rocking, ball bloom rolling inside.
  ART.tilt = (a, f) => {
    const rot = [-10, -3, 5, 10, 2][f];
    const bx = 96 + rot * 1.6;
    const blooms = bloom(96, 100, 34, TEAL, f, 0, 1.1)
      + "<g filter='url(#wc)'><circle cx='" + bx + "' cy='118' r='8' fill='" + ORANGE + "' opacity='.65'/></g>";
    const ink =
      "<g transform='rotate(" + rot + " 96 132)'>"
      + inky('M72 48 h48 q8 0 8 8 v88 q0 8 -8 8 h-48 q-8 0 -8 -8 v-88 q0 -8 8 -8 z')
      + inky('M88 56 h16', 2) + '</g>'
      + inky('M52 96 q-6 -12 2 -22 M140 96 q6 -12 -2 -22', 1.8);
    return compose(blooms, ink, f);
  };

  // Dial — gauge with a watercolor arc, needle hunting.
  ART.dial = (a, f) => {
    const ang = [-52, -20, 12, 40, -8][f];
    const blooms = "<g filter='url(#wc)'>"
      + "<path d='M56 118 A44 44 0 0 1 78 82' stroke='" + TEAL + "' stroke-width='12' fill='none' opacity='.55'/>"
      + "<path d='M82 79 A44 44 0 0 1 112 79' stroke='" + GOLD + "' stroke-width='12' fill='none' opacity='.55'/>"
      + "<path d='M116 82 A44 44 0 0 1 136 118' stroke='" + ORANGE + "' stroke-width='12' fill='none' opacity='.55'/></g>"
      + bloom(96, 128, 26, INDIGO, f, 0.7, 0.6);
    const ink =
      inky('M48 122 a48 48 0 0 1 96 0 l-6 8 h-84 z')
      + "<g transform='rotate(" + ang + " 96 122)'>" + inky('M96 122 V84', 3) + '</g>'
      + inky('M96 122 m-4 0 a4 4 0 1 1 8 0 a4 4 0 1 1 -8 0', 2.2);
    return compose(blooms, ink, f);
  };

  // Roulette — fanned sketch cards, the top one washed in accent.
  ART.roulette = (a, f) => {
    const pop = [0, -2, -5, -3, -1][f];
    const blooms = bloom(96, 108, 38, wash(a), f, 0, 0.8) + splat(50, 70, TEAL, f, 1);
    const ink =
      "<g transform='rotate(-9 78 110)'>" + inky('M56 72 h44 q5 0 5 5 v58 q0 5 -5 5 h-44 q-5 0 -5 -5 v-58 q0 -5 5 -5 z', 2) + '</g>'
      + "<g transform='rotate(7 116 110) translate(0," + pop + ")'>"
      + inky('M92 66 h44 q5 0 5 5 v58 q0 5 -5 5 h-44 q-5 0 -5 -5 v-58 q0 -5 5 -5 z', 2.4)
      + "<g filter='url(#wc)'><path d='M114 84 v22 M114 116 a2.5 2.5 0 1 0 0.01 0' stroke='" + ORANGE + "' stroke-width='7' stroke-linecap='round' fill='none' opacity='.65'/></g>"
      + '</g>';
    return compose(blooms, ink, f);
  };

  // Fake Facts — sketch face, the nose grows in washes.
  ART.fakefacts = (a, f) => {
    const nose = [14, 22, 32, 40, 26][f];
    const blooms = bloom(80, 100, 34, wash(a), f, 0)
      + "<g filter='url(#wc)'><path d='M104 96 h" + nose + "' stroke='" + ORANGE + "' stroke-width='10' stroke-linecap='round' opacity='.6'/></g>";
    const ink =
      inky('M80 100 m-30 0 a30 30 0 1 1 60 0 a30 30 0 1 1 -60 0')
      + inky('M68 92 a4 3 0 1 0 8 0 M86 92 a4 3 0 1 0 8 0', 1.8)
      + inky('M66 116 q10 -6 22 -1', 2)
      + inky('M104 96 h' + nose, 2.2);
    return compose(blooms, ink, f);
  };

  // One Clue — sketch bulb with a glowing wash that breathes.
  ART.oneclue = (a, f) => {
    const on = f % 5 < 3;
    const blooms = (on ? bloom(96, 88, 34, GOLD, f, 0, 1) : '')
      + bloom(96, 92, 20, ORANGE, f, 0.6);
    const ink =
      inky('M96 56 a32 32 0 0 1 14 60 q-3 2 -3 8 h-22 q0 -6 -3 -8 a32 32 0 0 1 14 -60 z')
      + inky('M88 130 h16 M89 138 h14 M92 146 h8', 2)
      + inky('M88 96 q8 8 16 0 M96 100 v22', 1.8)
      + (on ? inky('M60 56 l8 8 M132 56 l-8 8 M96 40 v10', 2) : '');
    return compose(blooms, ink, f);
  };

  // Same Brain — two sketch heads, one shared bloom thought.
  ART.samebrain = (a, f) => {
    const blooms = bloom(96, 56, 18, GOLD, f, 0.2)
      + bloom(68, 108, 26, INDIGO, f, 0.8) + bloom(124, 108, 26, ORANGE, f, 1.2);
    const ink =
      inky('M68 108 m-24 0 a24 24 0 1 1 48 0 a24 24 0 1 1 -48 0')
      + inky('M124 108 m-24 0 a24 24 0 1 1 48 0 a24 24 0 1 1 -48 0')
      + inky('M60 104 a4 3 0 1 0 8 0 M72 104 a4 3 0 1 0 8 0 M62 120 q6 4 12 0', 1.7)
      + inky('M116 104 a4 3 0 1 0 8 0 M128 104 a4 3 0 1 0 8 0 M118 120 q6 4 12 0', 1.7)
      + inky('M76 76 q8 -12 16 -16 M116 76 q-8 -12 -16 -16', 1.6);
    return compose(blooms, ink, f);
  };

  // Wolves — ink wolf silhouette howling; the moon is one big orange bloom.
  ART.wolves = (a, f) => {
    const howl = [0, -2, -4, -3, -1][f];
    const blooms = bloom(130, 62, 26, ORANGE, f, 0, 1)
      + bloom(80, 140, 40, INDIGO, f, 0.8, 0.5) + splat(48, 60, INDIGO, f, 2);
    const ink =
      "<g transform='rotate(" + howl + " 76 140)'>"
      + inkFill('M56 142 q-2 -26 14 -40 l-4 -14 10 8 q5 -4 12 -4 l8 -10 4 12 q14 10 12 32 l-6 16 z')
      + inky('M96 96 q10 -8 16 -18', 2.2) + '</g>'
      + inky('M44 148 h96', 2)
      + "<circle cx='150' cy='44' r='1.8' fill='" + INK + "' opacity='.5'/><circle cx='40' cy='40' r='1.4' fill='" + INK + "' opacity='.4'/>";
    return compose(blooms, ink, f);
  };

  // Fallback — the letter drawn in ink over a bloom, splatter beside.
  function fallbackArt(letter, a, f) {
    const blooms = bloom(96, 100, 40, wash(a), f, 0) + bloom(116, 82, 22, ORANGE, f, 0.8)
      + splat(140, 136, INDIGO, f, 1);
    const ink =
      "<g filter='url(#boil)'>"
      + "<text x='96' y='118' font-family='system-ui,sans-serif' font-size='64' font-weight='700' fill='" + INK + "' text-anchor='middle' opacity='.9'>" + letter + '</text>'
      + "<text x='98' y='116' font-family='system-ui,sans-serif' font-size='64' font-weight='700' fill='none' stroke='" + INK + "' stroke-width='1' text-anchor='middle' opacity='.4'>" + letter + '</text>'
      + '</g>';
    return shell(blooms + ink, f);
  }

  GifOS.iconPacks.register('watercolor', {
    size: SIZE, frames: FR, delayCs: DELAY, dither: 14,
    draw(subject, accent) {
      const builder = ART[subject];
      if (!builder) return null;
      return range(FR).map((f) => builder(accent, f));
    },
    fallback(letter, accent) {
      return range(FR).map((f) => fallbackArt(letter, accent, f));
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
