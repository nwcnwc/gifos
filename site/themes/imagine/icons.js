/*
 * Imagine icon pack — imagine.gifos.app showcase computer.
 *
 * Hybrid: Grok Imagine–generated PNGs for six hero subjects
 * (themes/imagine/assets/), plus procedural SVG for everything else.
 * Heroes slowly spin with a soft contact shadow; procedural subjects keep
 * the iridescent magenta/cyan/violet language of Imagine.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  if (!GifOS.iconPacks) return;

  // 192px raster = pixel-perfect on 3x phone screens (icons display at 64 CSS
  // px). The art is drawn in a 128 viewBox and scales up losslessly (SVG).
  const FR = 6, SIZE = 192, DELAY = 18;
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));

  // ---- color utilities ------------------------------------------------------
  const hx = (n) => n.toString(16).padStart(2, '0');
  const toHex = (a) => '#' + hx(clamp(a[0])) + hx(clamp(a[1])) + hx(clamp(a[2]));
  const fromHex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const shade = (c, amt) => { const a = typeof c === 'string' ? fromHex(c) : c; return toHex([a[0] + amt, a[1] + amt, a[2] + amt]); };
  const mixc = (c1, c2, t) => { const a = typeof c1 === 'string' ? fromHex(c1) : c1, b = typeof c2 === 'string' ? fromHex(c2) : c2; return toHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); };
  // Saturate + brighten an accent into a rich "candy" body color.
  const candy = (a) => { const m = Math.max(a[0], a[1], a[2]) || 1, s = 235 / m; return [a[0] * s, a[1] * s, a[2] * s]; };

  const INK = '#12081f';      // deepest shadow ink (Imagine night studio)
  const IRI = ['#ff5cc8', '#4dd6ff', '#b09aff']; // Imagine signature trio

  // ---- gradient / material helpers -----------------------------------------
  // Each icon assembles its own <defs>; ids are per-icon so frames stay small.
  let uid = 0;
  const grad = () => 'g' + (uid++);
  function lg(id, stops, vert) {
    const s = stops.map((st) => "<stop offset='" + st[0] + "' stop-color='" + st[1] + "'" + (st[2] != null ? " stop-opacity='" + st[2] + "'" : '') + '/>').join('');
    return "<linearGradient id='" + id + "' x1='0' y1='0' x2='" + (vert === false ? 1 : 0) + "' y2='" + (vert === false ? 0 : 1) + "'>" + s + '</linearGradient>';
  }
  function rg(id, stops, fx, fy) {
    const s = stops.map((st) => "<stop offset='" + st[0] + "' stop-color='" + st[1] + "'" + (st[2] != null ? " stop-opacity='" + st[2] + "'" : '') + '/>').join('');
    return "<radialGradient id='" + id + "'" + (fx != null ? " fx='" + fx + "' fy='" + fy + "'" : '') + '>' + s + '</radialGradient>';
  }
  // A glossy 3-stop vertical body gradient from a base color.
  function bodyGrad(id, base) {
    return lg(id, [[0, shade(base, 52)], [0.45, base], [1, shade(base, -46)]]);
  }
  // Soft top-sheen overlay for any shape (apply as fill over the body).
  function sheenGrad(id) {
    return lg(id, [[0, '#ffffff', 0.5], [0.35, '#ffffff', 0.14], [0.55, '#ffffff', 0]]);
  }

  // Motion tables.
  const FLOAT = [0, -2, -3.5, -4, -3, -1.5];
  const SPARK = [0, 0.3, 0.9, 1, 0.6, 0.15];

  // Contact shadow: tightens/lightens as the object floats up.
  function shadow(f, rx, cy) {
    const t = -FLOAT[f] / 4; // 0..1
    return "<ellipse cx='64' cy='" + (cy || 108) + "' rx='" + (rx - t * 4) + "' ry='" + (7 - t * 1.5) + "' fill='" + INK + "' opacity='" + (0.34 - t * 0.1) + "' filter='url(#fblur)'/>";
  }
  // The aurora signature: a tiny iridescent 4-point sparkle.
  function sparkle(x, y, s, f) {
    const o = SPARK[f]; if (!o) return '';
    return "<g transform='translate(" + x + ',' + y + ") scale(" + s + ")' opacity='" + o + "'>"
      + "<path d='M0 -7 C1 -2 2 -1 7 0 C2 1 1 2 0 7 C-1 2 -2 1 -7 0 C-2 -1 -1 -2 0 -7 Z' fill='#fff'/>"
      + "<path d='M0 -4.2 C.6 -1.2 1.2 -.6 4.2 0 C1.2 .6 .6 1.2 0 4.2 C-.6 1.2 -1.2 .6 -4.2 0 C-1.2 -.6 -.6 -1.2 0 -4.2 Z' fill='" + IRI[(f + 1) % 3] + "'/></g>";
  }
  // Standard soft speculars for a rounded body.
  function spec(x, y, rx, ry, op) {
    return "<ellipse cx='" + x + "' cy='" + y + "' rx='" + rx + "' ry='" + ry + "' fill='#fff' opacity='" + (op || 0.55) + "' filter='url(#fsoft)'/>";
  }

  // Frame wrapper: defs + shadow + floated art. All subjects share this shell.
  function shell(defs, art, f, shadowRx) {
    return "<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'>"
      + '<defs>'
      + "<filter id='fblur' x='-60%' y='-60%' width='220%' height='220%'><feGaussianBlur stdDeviation='4.5'/></filter>"
      + "<filter id='fsoft' x='-60%' y='-60%' width='220%' height='220%'><feGaussianBlur stdDeviation='2.2'/></filter>"
      + "<filter id='fglow' x='-80%' y='-80%' width='260%' height='260%'><feGaussianBlur stdDeviation='3.5'/></filter>"
      + defs + '</defs>'
      + shadow(f, shadowRx || 34)
      + "<g transform='translate(0," + FLOAT[f] + ")'>" + art + '</g></svg>';
  }

  // Rounded-rect path (so shapes can be reused for gradients + strokes).
  const rr = (x, y, w, h, r) => 'M' + (x + r) + ' ' + y + ' h' + (w - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r
    + ' v' + (h - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 -' + r + ' ' + r + ' h-' + (w - 2 * r)
    + ' a' + r + ' ' + r + ' 0 0 1 -' + r + ' -' + r + ' v-' + (h - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' -' + r + ' z';

  // ---- subjects -------------------------------------------------------------
  const ART = {};

  // Meeting (hero) — a glossy screen holding a 2×2 grid of participant tiles,
  // each a little head-and-shoulders. A speaking glow travels tile to tile,
  // frame to frame; the aurora sparkle drifts at the corner.
  ART.video = (a, f) => {
    const base = toHex(candy(a));
    const g1 = grad(), g2 = grad(), sh = grad(), scr = grad();
    const defs = lg(g1, [[0, '#ffffff'], [0.5, '#f3effc'], [1, '#d8d2ea']])      // bezel
      + rg(scr, [[0, '#2a2152'], [0.7, '#1d1640'], [1, '#140d2e']], 0.42, 0.3)   // screen glass
      + bodyGrad(g2, base)
      + sheenGrad(sh);
    // one participant: rounded tile, accent body, white head + shoulders,
    // and a bright accent ring when they're the one speaking this frame.
    const tile = (x, y, w, h, on) => {
      const cx = x + w / 2, headR = h * 0.2, headY = y + h * 0.4;
      return "<path d='" + rr(x, y, w, h, 6) + "' fill='url(#" + g2 + ")'/>"
        + "<path d='" + rr(x, y, w, h * 0.5, 6) + "' fill='url(#" + sh + ")'/>"
        + "<path d='M" + (cx - w * 0.3) + ' ' + (y + h - 1.5) + ' a' + (w * 0.3) + ' ' + (h * 0.36)
          + ' 0 0 1 ' + (w * 0.6) + " 0 z' fill='#fff' opacity='.95'/>"
        + "<circle cx='" + cx + "' cy='" + headY + "' r='" + headR + "' fill='#fff' opacity='.97'/>"
        + (on ? "<path d='" + rr(x - 1.6, y - 1.6, w + 3.2, h + 3.2, 7.6) + "' fill='none' stroke='" + base + "' stroke-width='3'/>"
              + "<path d='" + rr(x - 1.6, y - 1.6, w + 3.2, h + 3.2, 7.6) + "' fill='none' stroke='" + base + "' stroke-width='3' opacity='.6' filter='url(#fglow)'/>" : '');
    };
    const gx = 31, gy = 40, tw = 30, th = 24, gp = 6, act = f % 4;
    const tiles = [[gx, gy], [gx + tw + gp, gy], [gx, gy + th + gp], [gx + tw + gp, gy + th + gp]]
      .map((p, i) => tile(p[0], p[1], tw, th, i === act)).join('');
    const art =
      "<path d='" + rr(20, 26, 88, 76, 17) + "' fill='url(#" + g1 + ")'/>"       // bezel
      + "<path d='" + rr(26, 33, 76, 62, 11) + "' fill='url(#" + scr + ")'/>"    // screen
      + tiles
      + "<path d='" + rr(20, 26, 88, 22, 17) + "' fill='url(#" + sh + ")'/>"     // bezel top-gloss
      + sparkle(104, 30, 1, f);
    return { defs, art, shadowRx: 44 };
  };

  // Folder — dimensional two-tone folder, paper peeking, star sticker.
  ART.folder = (a, f) => {
    const base = toHex(candy(a));
    const g1 = grad(), g2 = grad(), g3 = grad(), sh = grad();
    const lift = [0, 1.5, 3, 3.5, 2.5, 1][f];
    const defs = bodyGrad(g1, shade(base, -34))
      + lg(g2, [[0, shade(base, 58)], [0.5, base], [1, shade(base, -30)]])
      + lg(g3, [[0, '#ffffff'], [1, '#e4def4']])
      + sheenGrad(sh);
    const art =
      // back panel with tab
      "<path d='M20 38 a8 8 0 0 1 8 -8 h20 a8 8 0 0 1 6.4 3.2 l4.8 6.4 h41 a8 8 0 0 1 8 8 v40 a10 10 0 0 1 -10 10 h-68 a10 10 0 0 1 -10 -10 z' fill='url(#" + g1 + ")'/>"
      // paper
      + "<g transform='translate(0," + (-lift) + ")'>"
      + "<path d='" + rr(32, 34, 62, 30, 5) + "' fill='url(#" + g3 + ")'/>"
      + "<path d='M40 42 h36 M40 49 h26' stroke='#b9b2d6' stroke-width='3' stroke-linecap='round' fill='none'/></g>"
      // front panel
      + "<path d='M18 56 a8 8 0 0 1 8 -8 h76 a8 8 0 0 1 8 8 l-2 32 a10 10 0 0 1 -10 9.8 h-68 a10 10 0 0 1 -10 -9.8 z' fill='url(#" + g2 + ")'/>"
      + "<path d='M18 56 a8 8 0 0 1 8 -8 h76 a8 8 0 0 1 8 8 l-.6 10 h-90.8 z' fill='url(#" + sh + ")'/>"
      + spec(34, 54, 12, 3.5, 0.5)
      + sparkle(97, 88, 0.9, f);
    return { defs, art, shadowRx: 42 };
  };

  // Notes — thick glossy notepad, metal spiral, accent cover band, pencil.
  ART.notes = (a, f) => {
    const base = toHex(candy(a));
    const g1 = grad(), g2 = grad(), g3 = grad(), sh = grad();
    const w = 12 + 26 * (f / (FR - 1));
    const pdx = 34 + w, pdy = 66 - w * 0.1;
    const defs = lg(g1, [[0, '#ffffff'], [0.6, '#f4f0fd'], [1, '#d5cfe8']])
      + bodyGrad(g2, base)
      + lg(g3, [[0, '#fff2b3'], [0.5, '#ffd23c'], [1, '#e0a41f']], false)
      + sheenGrad(sh);
    const art =
      // page block with depth
      "<path d='" + rr(30, 30, 66, 68, 10) + "' fill='#b7aed6'/>"
      + "<path d='" + rr(28, 28, 66, 68, 10) + "' fill='url(#" + g1 + ")'/>"
      // cover band + spiral
      + "<path d='M28 38 a10 10 0 0 1 10 -10 h46 a10 10 0 0 1 10 10 v6 h-66 z' fill='url(#" + g2 + ")'/>"
      + range(5).map((i) => "<rect x='" + (36 + i * 12) + "' y='24' width='4' height='12' rx='2' fill='#cfd4e6'/><rect x='" + (36 + i * 12) + "' y='24' width='4' height='5' rx='2' fill='#f2f5ff'/>").join('')
      // ruled lines + the accent line being written
      + "<path d='M38 56 h46 M38 66 h46 M38 76 h46 M38 86 h30' stroke='#ddd8ec' stroke-width='3' stroke-linecap='round'/>"
      + "<path d='M38 66 h" + w + "' stroke='" + base + "' stroke-width='4' stroke-linecap='round'/>"
      + "<path d='" + rr(28, 28, 66, 20, 10) + "' fill='url(#" + sh + ")'/>"
      // pencil
      + "<g transform='translate(" + pdx + ',' + pdy + ") rotate(42)'>"
      + "<rect x='-4' y='-26' width='8' height='20' rx='2' fill='url(#" + g3 + ")'/>"
      + "<rect x='-4' y='-30' width='8' height='5' rx='2' fill='#ff9eb0'/>"
      + "<path d='M-4 -6 L4 -6 L0 2 Z' fill='#efe6d2'/><path d='M-1.5 -2.5 L1.5 -2.5 L0 2 Z' fill='" + INK + "'/></g>"
      + sparkle(24, 36, 0.85, f);
    return { defs, art, shadowRx: 38 };
  };

  // Calculator — deep glossy body, glowing screen, candy buttons.
  ART.calc = (a, f) => {
    const base = toHex(candy(a));
    const g1 = grad(), g2 = grad(), g3 = grad(), sh = grad();
    const defs = bodyGrad(g1, shade(base, -20))
      + lg(g2, [[0, '#eafcd9'], [1, '#b8ecab']])
      + lg(g3, [[0, '#ffffff'], [1, '#dcd6ee']])
      + sheenGrad(sh);
    const lit = f % 4;
    let btns = '';
    let i = 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++, i++) {
      const on = i === (lit * 3 + 1) % 9;
      btns += "<rect x='" + (40 + c * 17) + "' y='" + (62 + r * 12.5) + "' width='13' height='9' rx='4.5' fill='" + (on ? '#ffd23c' : ("url(#" + g3 + ")")) + "'/>"
        + "<rect x='" + (40 + c * 17) + "' y='" + (62 + r * 12.5) + "' width='13' height='4.5' rx='2.2' fill='#fff' opacity='.55'/>";
    }
    const art =
      "<path d='" + rr(30, 26, 68, 76, 14) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(38, 34, 52, 20, 6) + "' fill='" + shade(base, -75) + "' opacity='.6'/>"
      + "<path d='" + rr(38, 33, 52, 20, 6) + "' fill='url(#" + g2 + ")'/>"
      + "<text x='84' y='49' font-family='ui-monospace,monospace' font-size='15' font-weight='700' fill='#3f7a35' text-anchor='end'>" + [128, 256, 512, 1024, 42, 7][f] + "</text>"
      + btns
      + "<path d='" + rr(30, 26, 68, 24, 14) + "' fill='url(#" + sh + ")'/>"
      + spec(42, 31, 9, 3, 0.5)
      + sparkle(104, 30, 0.9, f);
    return { defs, art, shadowRx: 36 };
  };

  // Stopwatch — metal bezel, glass face, sweeping accent hand.
  ART.timer = (a, f) => {
    const base = toHex(candy(a));
    const g1 = grad(), g2 = grad(), g3 = grad();
    const ang = f * 60;
    const defs = lg(g1, [[0, '#ffffff'], [0.5, '#d9d4ea'], [1, '#9c94bd']])
      + rg(g2, [[0, '#ffffff'], [0.75, '#f3effc'], [1, '#ddd6ef']], 0.4, 0.3)
      + bodyGrad(g3, base);
    const ticks = range(12).map((i) => {
      const t = i * 30 * Math.PI / 180, r1 = 24.5, r2 = i % 3 === 0 ? 20 : 22;
      return "<line x1='" + (64 + Math.sin(t) * r1) + "' y1='" + (66 - Math.cos(t) * r1) + "' x2='" + (64 + Math.sin(t) * r2) + "' y2='" + (66 - Math.cos(t) * r2) + "' stroke='#8f87b3' stroke-width='" + (i % 3 === 0 ? 3 : 2) + "' stroke-linecap='round'/>";
    }).join('');
    const art =
      // crown + shoulders
      "<rect x='58' y='22' width='12' height='12' rx='3' fill='url(#" + g1 + ")'/>"
      + "<rect x='54' y='20' width='20' height='7' rx='3.5' fill='url(#" + g3 + ")'/>"
      + "<g transform='rotate(40 64 66)'><rect x='58' y='30' width='12' height='9' rx='3' fill='url(#" + g1 + ")'/></g>"
      + "<g transform='rotate(-40 64 66)'><rect x='58' y='30' width='12' height='9' rx='3' fill='url(#" + g1 + ")'/></g>"
      // case + face
      + "<circle cx='64' cy='66' r='34' fill='url(#" + g1 + ")'/>"
      + "<circle cx='64' cy='66' r='34' fill='" + INK + "' opacity='.1'/>"
      + "<circle cx='64' cy='66' r='28.5' fill='" + shade(base, -60) + "'/>"
      + "<circle cx='64' cy='66' r='27' fill='url(#" + g2 + ")'/>"
      + ticks
      // hand
      + "<g transform='rotate(" + ang + " 64 66)'>"
      + "<line x1='64' y1='66' x2='64' y2='46' stroke='" + base + "' stroke-width='4.5' stroke-linecap='round'/>"
      + "<line x1='64' y1='66' x2='64' y2='72' stroke='" + base + "' stroke-width='4.5' stroke-linecap='round'/></g>"
      + "<circle cx='64' cy='66' r='4' fill='" + shade(base, -40) + "'/><circle cx='63' cy='65' r='1.4' fill='#fff' opacity='.8'/>"
      // glass highlight
      + "<path d='M42 52 a27 27 0 0 1 34 -7 a30 30 0 0 0 -34 7 z' fill='#fff' opacity='.65' filter='url(#fsoft)'/>"
      + sparkle(96, 34, 1, f);
    return { defs, art, shadowRx: 36 };
  };

  // Welcome — the aurora crystal: an iridescent glossy cube with sparkles.
  ART.welcome = (a, f) => {
    const g1 = grad(), g2 = grad(), g3 = grad(), sh = grad();
    const hue = f % 3;
    const defs = lg(g1, [[0, shade(IRI[hue], 60)], [0.5, IRI[hue]], [1, shade(IRI[(hue + 2) % 3], -20)]])
      + lg(g2, [[0, shade(IRI[(hue + 1) % 3], 70)], [1, IRI[(hue + 1) % 3]]])
      + lg(g3, [[0, '#ffffff', 0.9], [1, '#ffffff', 0.1]])
      + sheenGrad(sh);
    const art =
      // cube: top, left, right faces
      "<path d='M64 30 L94 44 L64 58 L34 44 Z' fill='url(#" + g2 + ")'/>"
      + "<path d='M34 44 L64 58 V94 L34 80 Z' fill='url(#" + g1 + ")'/>"
      + "<path d='M94 44 L64 58 V94 L94 80 Z' fill='url(#" + g1 + ")' opacity='.82'/>"
      + "<path d='M64 30 L94 44 L64 58 L34 44 Z' fill='url(#" + g3 + ")' opacity='.5'/>"
      + "<path d='M34 44 L64 58 L94 44' fill='none' stroke='#fff' stroke-width='1.6' opacity='.7'/>"
      + "<path d='M64 58 V94' stroke='#fff' stroke-width='1.6' opacity='.45'/>"
      + spec(52, 40, 9, 4, 0.75)
      + sparkle(64 + [0, 24, 34, 24, 0, -20][f] * 0.9, 36 - [0, 6, 10, 6, 0, -4][f], 1.15, f)
      + sparkle(30, 66, 0.7, (f + 3) % 6);
    return { defs, art, shadowRx: 32 };
  };

  // Tic-Tac-Toe — porcelain board tile, candy X and O taking turns to pop.
  ART.tictactoe = (a, f) => {
    const g1 = grad(), g2 = grad(), g3 = grad(), sh = grad();
    const on = f % 2 === 0, xs = on ? 1.15 : 1, os = on ? 1 : 1.15;
    const defs = lg(g1, [[0, '#ffffff'], [0.55, '#f1ecfb'], [1, '#cfc7e6']])
      + bodyGrad(g2, '#ff6b6b') + bodyGrad(g3, '#4dabf7') + sheenGrad(sh);
    const grid = "<path d='M52 34 v60 M76 34 v60 M34 52 h60 M34 76 h60' stroke='#b9b0d8' stroke-width='4.5' stroke-linecap='round'/>"
      + "<path d='M52 34 v60 M76 34 v60 M34 52 h60 M34 76 h60' stroke='#8f85b8' stroke-width='1.5' stroke-linecap='round' transform='translate(0,1.4)'/>";
    const art =
      "<path d='" + rr(26, 26, 76, 76, 16) + "' fill='#a99fce'/>"
      + "<path d='" + rr(24, 24, 76, 76, 16) + "' fill='url(#" + g1 + ")'/>"
      + grid
      + "<g transform='translate(43,43) scale(" + xs + ")'>"
      + "<path d='M-6.5 -6.5 L6.5 6.5 M6.5 -6.5 L-6.5 6.5' stroke='url(#" + g2 + ")' stroke-width='7' stroke-linecap='round'/></g>"
      + "<g transform='translate(85,85) scale(" + os + ")'><circle r='7.5' fill='none' stroke='url(#" + g3 + ")' stroke-width='6.5'/></g>"
      + "<circle cx='85' cy='43' r='7.5' fill='none' stroke='#d8d0ec' stroke-width='6.5'/>"
      + "<path d='" + rr(24, 24, 76, 26, 16) + "' fill='url(#" + sh + ")'/>"
      + sparkle(26, 90, 0.9, f);
    return { defs, art, shadowRx: 42 };
  };

  // Connect Four — glossy blue board, a red disc drops and lands.
  ART.connect4 = (a, f) => {
    const g1 = grad(), g2 = grad(), g3 = grad(), sh = grad();
    const defs = bodyGrad(g1, '#3f7ae8') + bodyGrad(g2, '#ff5d5d') + bodyGrad(g3, '#ffd23c') + sheenGrad(sh);
    const dropY = [24, 34, 46, 58, 58, 58][f];
    const landed = f >= 3;
    const hole = (cx, cy, fill) => fill
      ? "<circle cx='" + cx + "' cy='" + cy + "' r='8' fill='url(#" + fill + ")'/><circle cx='" + (cx - 2.5) + "' cy='" + (cy - 3) + "' r='2.4' fill='#fff' opacity='.75'/>"
      : "<circle cx='" + cx + "' cy='" + cy + "' r='8' fill='#1c3f85'/><circle cx='" + cx + "' cy='" + (cy + 1.2) + "' r='8' fill='none' stroke='#7fa8f2' stroke-width='1.6' opacity='.55'/>";
    const disc = "<g transform='translate(46," + dropY + ")'><circle r='9' fill='url(#" + g2 + ")'/><circle cx='-2.6' cy='-3' r='2.6' fill='#fff' opacity='.8'/></g>";
    const art = (landed ? '' : disc)
      + "<path d='" + rr(26, 42, 76, 54, 12) + "' fill='" + shade('#3f7ae8', -70) + "' transform='translate(2,3)'/>"
      + "<path d='" + rr(26, 42, 76, 54, 12) + "' fill='url(#" + g1 + ")'/>"
      + hole(46, 60, landed ? g2 : null) + hole(70, 60, null) + hole(94 - 2, 60, null)
      + hole(46, 82, g3) + hole(70, 82, null) + hole(92, 82, g3)
      + "<path d='" + rr(26, 42, 76, 22, 12) + "' fill='url(#" + sh + ")'/>"
      + sparkle(100, 34, 1, f);
    return { defs, art, shadowRx: 42 };
  };

  // Minesweeper — a round glossy bomb, brass cap, fizzing spark.
  ART.minesweeper = (a, f) => {
    const g1 = grad(), g2 = grad(), g3 = grad();
    const defs = rg(g1, [[0, '#6b5f96'], [0.55, '#453a6e'], [1, '#221a45']], 0.35, 0.3)
      + lg(g2, [[0, '#ffe9a8'], [0.5, '#e8b84c'], [1, '#9c7420']])
      + rg(g3, [[0, '#fff7cf'], [0.5, '#ffd23c'], [1, '#ff8f3c', 0]]);
    const s = f % 2 ? 1.25 : 0.9;
    const art =
      "<circle cx='60' cy='70' r='28' fill='url(#" + g1 + ")'/>"
      + "<ellipse cx='50' cy='58' rx='9' ry='6.5' fill='#fff' opacity='.5' filter='url(#fsoft)'/>"
      + "<path d='" + rr(68, 38, 14, 12, 4) + "' fill='url(#" + g2 + ")' transform='rotate(38 75 44)'/>"
      + "<path d='M78 40 q9 -10 16 -6' stroke='#c9bfa4' stroke-width='4' fill='none' stroke-linecap='round'/>"
      + "<g transform='translate(96,32) scale(" + s + ")'>"
      + "<circle r='9' fill='url(#" + g3 + ")' filter='url(#fglow)'/>"
      + "<path d='M-8 0 H8 M0 -8 V8 M-5.5 -5.5 L5.5 5.5 M5.5 -5.5 L-5.5 5.5' stroke='#fff2ad' stroke-width='2.2' stroke-linecap='round'/></g>"
      + sparkle(30, 44, 0.9, (f + 2) % 6);
    return { defs, art, shadowRx: 34 };
  };

  // Chess — a porcelain pawn on a candy base.
  ART.chess = (a, f) => {
    const base = toHex(candy(a));
    const g1 = grad(), g2 = grad(), sh = grad();
    const defs = lg(g1, [[0, '#ffffff'], [0.55, '#efeafb'], [1, '#b9aed9']], false)
      + bodyGrad(g2, base) + sheenGrad(sh);
    const art =
      "<circle cx='64' cy='40' r='13' fill='url(#" + g1 + ")'/>"
      + "<ellipse cx='59' cy='35' rx='4.5' ry='3.2' fill='#fff' opacity='.9'/>"
      + "<path d='" + rr(52, 52, 24, 7, 3.5) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='M57 59 q0 14 -7 24 h28 q-7 -10 -7 -24 z' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(44, 83, 40, 11, 5) + "' fill='url(#" + g2 + ")'/>"
      + "<path d='" + rr(44, 83, 40, 5, 2.5) + "' fill='#fff' opacity='.35'/>"
      + sparkle(90, 36, 1, f);
    return { defs, art, shadowRx: 30 };
  };

  // Paint — porcelain palette, candy wells, a brush that dips.
  ART.paint = (a, f) => {
    const base = toHex(candy(a));
    const g1 = grad(), g2 = grad(), g3 = grad(), sh = grad();
    const dip = Math.abs(Math.sin((f / FR) * Math.PI * 2)) * 6;
    const defs = lg(g1, [[0, '#ffffff'], [0.6, '#f2edfc'], [1, '#c9c0e4']])
      + lg(g2, [[0, '#e8e2f4'], [1, '#a89dcb']])
      + bodyGrad(g3, base) + sheenGrad(sh);
    const well = (x, y, c) => "<circle cx='" + x + "' cy='" + y + "' r='6.5' fill='" + shade(c, -50) + "'/>"
      + "<circle cx='" + x + "' cy='" + (y - 1) + "' r='5.8' fill='" + c + "'/>"
      + "<ellipse cx='" + (x - 1.8) + "' cy='" + (y - 3) + "' rx='2' ry='1.4' fill='#fff' opacity='.75'/>";
    const art =
      "<path d='M64 38 c-26 0 -40 14 -40 30 c0 16 14 26 34 26 c8 0 8 -7 4 -11 c-4 -4 -1 -10 6 -10 c8 0 22 2 30 -6 c6 -6 2 -29 -34 -29 z' fill='#b3a9d4'/>"
      + "<path d='M62 36 c-26 0 -40 14 -40 30 c0 16 14 26 34 26 c8 0 8 -7 4 -11 c-4 -4 -1 -10 6 -10 c8 0 22 2 30 -6 c6 -6 2 -29 -34 -29 z' fill='url(#" + g1 + ")'/>"
      + well(46, 56, '#ff6b8f') + well(64, 50, '#4dabf7') + well(82, 58, '#ffd23c') + well(42, 74, '#7bd96a')
      + "<g transform='translate(88," + (34 + dip) + ") rotate(35)'>"
      + "<rect x='-3.5' y='-2' width='7' height='26' rx='3' fill='url(#" + g2 + ")'/>"
      + "<rect x='-4.5' y='-10' width='9' height='9' rx='2' fill='#cfd4e6'/><rect x='-4.5' y='-10' width='9' height='4' rx='2' fill='#f2f5ff'/>"
      + "<path d='M-4.5 -10 q4.5 -12 9 0 z' fill='url(#" + g3 + ")'/></g>"
      + sparkle(30, 38, 0.9, f);
    return { defs, art, shadowRx: 40 };
  };

  // Fortune — the classic folded cookie: golden dome, pinched lip, the white
  // slip sliding out of the fold.
  ART.fortune = (a, f) => {
    const g1 = grad(), g2 = grad(), g3 = grad();
    const slide = [0, 3, 6, 7, 5, 2][f];
    const defs = lg(g1, [[0, '#ffe9b0'], [0.45, '#f2b854'], [1, '#b97c1e']])
      + lg(g2, [[0, '#e8a53f'], [1, '#8f5c12']])
      + lg(g3, [[0, '#ffffff'], [1, '#e7e0f2']]);
    const art =
      // the slip, emerging from the fold
      "<g transform='translate(" + slide + ',' + (slide * 0.4) + ")'>"
      + "<path d='" + rr(76, 62, 34, 15, 3) + "' fill='url(#" + g3 + ")' transform='rotate(14 93 69)'/>"
      + "<path d='M82 68 l14 3.5 M81 73 l10 2.5' stroke='#b9a4c9' stroke-width='2' stroke-linecap='round' transform='rotate(14 93 69)'/></g>"
      // cookie dome with the pinched folded lip
      + "<path d='M22 74 A42 36 0 0 1 106 74 L96 71 Q80 64 66 80 Q48 64 32 71 Z' fill='url(#" + g1 + ")'/>"
      + "<path d='M22 74 A42 36 0 0 1 106 74 L96 71 Q88 68 80 70 Q70 60 66 80 Q48 64 32 71 Z' fill='url(#" + g1 + ")'/>"
      // fold shading along the lip + center crease
      + "<path d='M32 71 Q48 64 66 80 Q80 64 96 71' fill='none' stroke='url(#" + g2 + ")' stroke-width='4' stroke-linecap='round' opacity='.75'/>"
      + "<path d='M64 42 Q60 58 66 78' stroke='#8f5c12' stroke-width='2.6' fill='none' opacity='.4'/>"
      // gloss
      + "<ellipse cx='44' cy='52' rx='10' ry='6' fill='#fff' opacity='.6' filter='url(#fsoft)'/>"
      + "<ellipse cx='84' cy='54' rx='6' ry='4' fill='#fff' opacity='.4' filter='url(#fsoft)'/>"
      + sparkle(28, 40, 1, f);
    return { defs, art, shadowRx: 44 };
  };

  // Guestbook — an open porcelain book, glossy heart beating on the page.
  ART.guestbook = (a, f) => {
    const g1 = grad(), g2 = grad(), g3 = grad();
    const hs = f % 2 ? 1.16 : 1;
    const defs = lg(g1, [[0, '#ffffff'], [0.6, '#f4effd'], [1, '#cdc4e6']])
      + lg(g2, [[0, '#fdfbff'], [1, '#ddd5ee']])
      + bodyGrad(g3, '#ff5d7a');
    const art =
      "<path d='M22 46 Q42 34 64 46 L64 96 Q42 84 22 96 Z' fill='#b1a7d2' transform='translate(2,3)'/>"
      + "<path d='M106 46 Q86 34 64 46 L64 96 Q86 84 106 96 Z' fill='#b1a7d2' transform='translate(-2,3)'/>"
      + "<path d='M22 44 Q42 32 64 44 L64 94 Q42 82 22 94 Z' fill='url(#" + g1 + ")'/>"
      + "<path d='M106 44 Q86 32 64 44 L64 94 Q86 82 106 94 Z' fill='url(#" + g2 + ")'/>"
      + "<path d='M64 44 V94' stroke='#a397c6' stroke-width='2.5'/>"
      + "<path d='M74 56 h20 M74 64 h16 M74 72 h18' stroke='#cfc6e6' stroke-width='2.8' stroke-linecap='round'/>"
      + "<g transform='translate(43,64) scale(" + hs + ")'>"
      + "<path d='M0 9 C-11 0 -8 -10 0 -6 C8 -10 11 0 0 9 Z' fill='url(#" + g3 + ")'/>"
      + "<ellipse cx='-3.5' cy='-4' rx='2.4' ry='1.7' fill='#fff' opacity='.8'/></g>"
      + sparkle(100, 34, 1, f);
    return { defs, art, shadowRx: 46 };
  };

  // Chat — big porcelain bubble typing, small candy bubble answering.
  ART.chat = (a, f) => {
    const base = toHex(candy(a));
    const g1 = grad(), g2 = grad(), sh = grad();
    const defs = lg(g1, [[0, '#ffffff'], [0.6, '#f3eefc'], [1, '#cfc6e8']])
      + bodyGrad(g2, base) + sheenGrad(sh);
    const dots = [50, 64, 78].map((x, i) =>
      "<circle cx='" + x + "' cy='56' r='4.5' fill='" + ((f % 3) === i ? base : '#c9c0e2') + "'/>").join('');
    const art =
      "<path d='M30 32 h68 a12 12 0 0 1 12 12 v22 a12 12 0 0 1 -12 12 h-44 l-14 14 v-14 h-10 a12 12 0 0 1 -12 -12 v-22 a12 12 0 0 1 12 -12 z' fill='#b4aad6' transform='translate(2,3)'/>"
      + "<path d='M30 30 h68 a12 12 0 0 1 12 12 v22 a12 12 0 0 1 -12 12 h-44 l-14 14 v-14 h-10 a12 12 0 0 1 -12 -12 v-22 a12 12 0 0 1 12 -12 z' fill='url(#" + g1 + ")'/>"
      + dots
      + "<path d='M30 30 h68 a12 12 0 0 1 12 12 v6 h-92 v-6 a12 12 0 0 1 12 -12 z' fill='url(#" + sh + ")'/>"
      + "<g transform='translate(0," + (-FLOAT[f] * 0.8) + ")'>"
      + "<path d='" + rr(76, 74, 32, 20, 10) + "' fill='url(#" + g2 + ")'/>"
      + "<circle cx='86' cy='84' r='2' fill='#fff'/><circle cx='93' cy='84' r='2' fill='#fff'/><circle cx='100' cy='84' r='2' fill='#fff'/>"
      + "<path d='" + rr(76, 74, 32, 9, 4.5) + "' fill='#fff' opacity='.4'/></g>"
      + sparkle(24, 78, 0.9, f);
    return { defs, art, shadowRx: 44 };
  };

  // Stolen Apps — a treasure chest, lid creaking, gold spilling light.
  ART.chest = (a, f) => {
    const g1 = grad(), g2 = grad(), g3 = grad(), sh = grad();
    const lift = [0, 2, 5, 6, 4, 1][f];
    const defs = lg(g1, [[0, '#a5713d'], [0.5, '#7d5027'], [1, '#5a3618']])
      + lg(g2, [[0, '#c98a4b'], [0.5, '#966130'], [1, '#6b421d']])
      + lg(g3, [[0, '#fff3c4'], [0.5, '#ffd23c'], [1, '#c9971b']]) + sheenGrad(sh);
    const art =
      // glow from inside
      "<ellipse cx='64' cy='" + (56 - lift / 2) + "' rx='30' ry='8' fill='#ffd23c' opacity='" + (lift / 12) + "' filter='url(#fglow)'/>"
      // lid
      + "<g transform='translate(64," + (52 - lift) + ") rotate(" + (-lift * 1.2) + ")'>"
      + "<path d='M-34 6 v-6 q0 -17 34 -17 q34 0 34 17 v6 z' fill='url(#" + g1 + ")'/>"
      + "<path d='M-34 0 q0 -14 34 -14 q34 0 34 14' fill='none' stroke='#c98a4b' stroke-width='3' opacity='.7'/>"
      + "<path d='" + rr(-7, -4, 14, 10, 3) + "' fill='url(#" + g3 + ")'/></g>"
      // coins
      + range(3).map((i) => "<circle cx='" + (48 + i * 16) + "' cy='" + (56 - lift / 2) + "' r='" + (5.5 - (i % 2)) + "' fill='url(#" + g3 + ")'/>").join('')
      // base
      + "<path d='" + rr(30, 58, 68, 36, 8) + "' fill='url(#" + g2 + ")'/>"
      + "<path d='M38 58 v36 M90 58 v36' stroke='#5a3618' stroke-width='3' opacity='.5'/>"
      + "<path d='" + rr(55, 56, 18, 15, 4) + "' fill='url(#" + g3 + ")'/>"
      + "<circle cx='64' cy='62' r='2.2' fill='#7d5a10'/><path d='M64 62 v5' stroke='#7d5a10' stroke-width='2.4' stroke-linecap='round'/>"
      + "<path d='" + rr(30, 58, 68, 12, 6) + "' fill='url(#" + sh + ")'/>"
      + sparkle(100, 40, 1.1, f);
    return { defs, art, shadowRx: 42 };
  };

  // Imposter — three glossy capsule buddies; the accent one is sus.
  ART.imposter = (a, f) => {
    const base = toHex(candy(a));
    const g1 = grad(), g2 = grad(), sh = grad();
    const px = [-3, 0, 3, 0, -3, 0][f];
    const defs = lg(g1, [[0, '#ffffff'], [0.55, '#eee9f9'], [1, '#bfb4dd']])
      + bodyGrad(g2, base) + sheenGrad(sh);
    const buddy = (x, w, h, fill) =>
      "<path d='" + rr(x, 92 - h, w, h, w / 2) + "' fill='" + fill + "'/>"
      + "<path d='" + rr(x, 92 - h, w, h / 2.4, w / 2.4) + "' fill='#fff' opacity='.35'/>";
    const art =
      buddy(26, 22, 34, "url(#" + g1 + ")") + buddy(78, 22, 30, "url(#" + g1 + ")")
      + buddy(50, 28, 44, "url(#" + g2 + ")")
      // visor on the sus one
      + "<path d='" + rr(56, 56, 18, 10, 5) + "' fill='#241d47'/>"
      + "<ellipse cx='" + (62 + px) + "' cy='60' rx='4.5' ry='3' fill='#9fd8ff'/>"
      + "<ellipse cx='" + (61 + px) + "' cy='59' rx='1.6' ry='1.1' fill='#fff'/>"
      + "<text x='84' y='42' font-family='system-ui' font-size='20' font-weight='800' fill='#fff' opacity='" + SPARK[f] + "'>?</text>"
      + sparkle(30, 44, 0.9, (f + 2) % 6);
    return { defs, art, shadowRx: 44 };
  };

  // Spy — fedora over a glass magnifier that sweeps.
  ART.spy = (a, f) => {
    const base = toHex(candy(a));
    const g1 = grad(), g2 = grad(), g3 = grad();
    const mx = [0, 5, 10, 12, 7, 2][f];
    const defs = lg(g1, [[0, '#6a6180'], [0.5, '#4a4260'], [1, '#2e2840']])
      + bodyGrad(g2, base)
      + rg(g3, [[0, '#dff2ff', 0.85], [0.7, '#a8d4f2', 0.5], [1, '#7fb2dd', 0.3]], 0.35, 0.3);
    const art =
      // fedora
      "<path d='M26 56 q0 -8 10 -9 q2 -13 12 -16 q6 8 16 8 q10 0 16 -8 q10 3 12 16 q10 1 10 9 q-38 10 -76 0 z' fill='url(#" + g1 + ")'/>"
      + "<path d='M32 47 q32 8 64 0 l4 8 q-36 10 -72 0 z' fill='url(#" + g2 + ")'/>"
      + "<ellipse cx='48' cy='38' rx='7' ry='4' fill='#fff' opacity='.25' filter='url(#fsoft)'/>"
      // magnifier
      + "<g transform='translate(" + (58 + mx) + ",74)'>"
      + "<circle r='16' fill='url(#" + g3 + ")'/>"
      + "<circle r='16' fill='none' stroke='#cfc9e2' stroke-width='5'/>"
      + "<circle r='16' fill='none' stroke='#8f87ab' stroke-width='1.6'/>"
      + "<path d='M11.5 11.5 l12 12' stroke='#8f87ab' stroke-width='8' stroke-linecap='round'/>"
      + "<path d='M11.5 11.5 l12 12' stroke='#cfc9e2' stroke-width='5' stroke-linecap='round'/>"
      + "<path d='M-9 -7 a11 11 0 0 1 8 -5' stroke='#fff' stroke-width='3' fill='none' stroke-linecap='round' opacity='.9'/></g>"
      + sparkle(98, 32, 1, f);
    return { defs, art, shadowRx: 42 };
  };

  // Tilt — a glossy phone rocking on its corner, motion arcs.
  ART.tilt = (a, f) => {
    const base = toHex(candy(a));
    const g1 = grad(), g2 = grad(), sh = grad();
    const rot = [-12, -4, 6, 12, 4, -6][f];
    const defs = bodyGrad(g1, shade(base, -30))
      + lg(g2, [[0, '#3b3357'], [0.5, '#241d47'], [1, '#191338']]) + sheenGrad(sh);
    const art =
      "<g transform='rotate(" + rot + " 64 90)'>"
      + "<path d='" + rr(42, 26, 44, 68, 10) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(46, 32, 36, 52, 5) + "' fill='url(#" + g2 + ")'/>"
      + "<path d='M50 36 L74 60 M60 34 L82 56' stroke='#6a5fa0' stroke-width='5' opacity='.5' stroke-linecap='round'/>"
      + "<circle cx='64' cy='89' r='2.6' fill='#fff' opacity='.5'/>"
      + "<path d='" + rr(42, 26, 44, 20, 10) + "' fill='url(#" + sh + ")'/></g>"
      + "<path d='M28 66 q-6 -10 1 -20 M100 66 q6 -10 -1 -20' stroke='#8f87b3' stroke-width='4' fill='none' stroke-linecap='round' opacity='" + (0.4 + SPARK[f] * 0.5) + "'/>"
      + sparkle(100, 88, 0.9, f);
    return { defs, art, shadowRx: 30 };
  };

  // The Dial — a glossy gauge, needle hunting across a rainbow arc.
  ART.dial = (a, f) => {
    const g1 = grad(), g2 = grad();
    const ang = [-58, -25, 10, 40, 10, -25][f];
    const defs = lg(g1, [[0, '#ffffff'], [0.6, '#f1ecfb'], [1, '#c9c0e4']])
      + lg(g2, [[0, '#e8e2f4'], [1, '#9c94bd']]);
    const arc = (a1, a2, color) => {
      const r = 30, cx = 64, cy = 78;
      const p1 = [cx + Math.sin(a1 * Math.PI / 180) * r, cy - Math.cos(a1 * Math.PI / 180) * r];
      const p2 = [cx + Math.sin(a2 * Math.PI / 180) * r, cy - Math.cos(a2 * Math.PI / 180) * r];
      return "<path d='M" + p1[0] + ' ' + p1[1] + ' A' + r + ' ' + r + " 0 0 1 " + p2[0] + ' ' + p2[1] + "' stroke='" + color + "' stroke-width='9' fill='none' stroke-linecap='round'/>";
    };
    const art =
      "<path d='M24 86 a40 40 0 0 1 80 0 l-6 8 h-68 z' fill='#b1a7d2' transform='translate(2,3)'/>"
      + "<path d='M24 84 a40 40 0 0 1 80 0 l-6 8 h-68 z' fill='url(#" + g1 + ")'/>"
      + arc(-62, -22, '#7bd96a') + arc(-18, 18, '#ffd23c') + arc(22, 62, '#ff6b6b')
      + "<g transform='rotate(" + ang + " 64 78)'>"
      + "<path d='M64 78 L64 52' stroke='#241d47' stroke-width='5' stroke-linecap='round'/>"
      + "<path d='M64 78 L64 55' stroke='url(#" + g2 + ")' stroke-width='2.4' stroke-linecap='round'/></g>"
      + "<circle cx='64' cy='78' r='6.5' fill='url(#" + g2 + ")'/><circle cx='62.5' cy='76.5' r='2' fill='#fff' opacity='.8'/>"
      + sparkle(102, 42, 1, f);
    return { defs, art, shadowRx: 44 };
  };

  // Party Roulette — glossy cards fan out; the top one demands attention.
  ART.roulette = (a, f) => {
    const base = toHex(candy(a));
    const g1 = grad(), g2 = grad(), sh = grad();
    const pop = [0, -3, -6, -7, -5, -2][f];
    const defs = lg(g1, [[0, '#ffffff'], [0.6, '#f2edfb'], [1, '#cfc6e8']])
      + bodyGrad(g2, base) + sheenGrad(sh);
    const art =
      "<g transform='rotate(-10 52 70)'><path d='" + rr(30, 44, 40, 52, 8) + "' fill='#d5cdea'/></g>"
      + "<g transform='rotate(6 70 70)'><path d='" + rr(56, 42, 40, 52, 8) + "' fill='url(#" + g1 + ")'/></g>"
      + "<g transform='translate(0," + pop + ")'>"
      + "<path d='" + rr(42, 34, 42, 56, 9) + "' fill='url(#" + g2 + ")'/>"
      + "<path d='" + rr(42, 34, 42, 22, 9) + "' fill='url(#" + sh + ")'/>"
      + "<path d='M63 46 v18' stroke='#fff' stroke-width='7' stroke-linecap='round'/>"
      + "<circle cx='63' cy='76' r='4' fill='#fff'/></g>"
      + sparkle(102, 36, 1, f);
    return { defs, art, shadowRx: 40 };
  };

  // Fake Facts — a candy face whose glossy nose grows and grows.
  ART.fakefacts = (a, f) => {
    const base = toHex(candy(a));
    const g1 = grad(), g2 = grad();
    const nose = [10, 16, 24, 30, 22, 14][f];
    const defs = rg(g1, [[0, shade(base, 55)], [0.6, base], [1, shade(base, -45)]], 0.35, 0.3)
      + lg(g2, [[0, shade(base, 30)], [1, shade(base, -35)]], false);
    const art =
      "<circle cx='52' cy='62' r='26' fill='url(#" + g1 + ")'/>"
      + "<ellipse cx='42' cy='50' rx='8' ry='5.5' fill='#fff' opacity='.55' filter='url(#fsoft)'/>"
      + "<circle cx='44' cy='58' r='3.4' fill='" + INK + "'/><circle cx='58' cy='58' r='3.4' fill='" + INK + "'/>"
      + "<circle cx='45.2' cy='56.8' r='1.2' fill='#fff'/><circle cx='59.2' cy='56.8' r='1.2' fill='#fff'/>"
      + "<path d='M44 74 q8 -5 16 0' stroke='" + INK + "' stroke-width='3' fill='none' stroke-linecap='round'/>"
      + "<g><rect x='72' y='60' width='" + nose + "' height='9' rx='4.5' fill='url(#" + g2 + ")'/>"
      + "<rect x='72' y='61.5' width='" + nose + "' height='3' rx='1.5' fill='#fff' opacity='.4'/></g>"
      + sparkle(100, 38, 1, f);
    return { defs, art, shadowRx: 36 };
  };

  // One Clue — a real glowing bulb with a brass screw base.
  ART.oneclue = (a, f) => {
    const g1 = grad(), g2 = grad(), g3 = grad();
    const on = f % 2 === 0;
    const defs = rg(g1, [[0, '#fffbe0'], [0.55, on ? '#ffe27a' : '#efeafb'], [1, on ? '#f2b52e' : '#c9c0e0']], 0.4, 0.35)
      + lg(g2, [[0, '#e8e2f4'], [0.5, '#b9b0d4'], [1, '#8f87ab']])
      + rg(g3, [[0, '#ffe9a0', 0.8], [1, '#ffd23c', 0]]);
    const art =
      (on ? "<circle cx='64' cy='54' r='34' fill='url(#" + g3 + ")'/>" : '')
      + "<circle cx='64' cy='54' r='24' fill='url(#" + g1 + ")'/>"
      + "<path d='M56 66 q0 -10 -5 -16 M72 66 q0 -10 5 -16' stroke='" + (on ? '#f2a41f' : '#a89dc4') + "' stroke-width='2.5' fill='none'/>"
      + "<path d='M57 62 q7 6 14 0 l-1.5 12 h-11 z' fill='url(#" + g1 + ")'/>"
      + "<ellipse cx='55' cy='44' rx='7' ry='5' fill='#fff' opacity='.7' filter='url(#fsoft)'/>"
      + "<path d='" + rr(54, 76, 20, 5, 2.5) + "' fill='url(#" + g2 + ")'/>"
      + "<path d='" + rr(55, 82, 18, 5, 2.5) + "' fill='url(#" + g2 + ")'/>"
      + "<path d='" + rr(57, 88, 14, 5, 5) + "' fill='url(#" + g2 + ")'/>"
      + (on ? "<path d='M34 30 l5 5 M94 30 l-5 5 M64 20 v7' stroke='#ffd23c' stroke-width='4' stroke-linecap='round'/>" : '')
      + sparkle(96, 78, 0.9, f);
    return { defs, art, shadowRx: 30 };
  };

  // Same Brain — two glossy heads, one shared spark of thought.
  ART.samebrain = (a, f) => {
    const base = toHex(candy(a));
    const g1 = grad(), g2 = grad();
    const defs = rg(g1, [[0, shade(base, 50)], [0.6, base], [1, shade(base, -45)]], 0.35, 0.3)
      + rg(g2, [[0, '#ffffff'], [0.6, '#efeafb'], [1, '#b9aed9']], 0.35, 0.3);
    const art =
      "<circle cx='44' cy='66' r='23' fill='url(#" + g2 + ")'/>"
      + "<circle cx='84' cy='66' r='23' fill='url(#" + g1 + ")'/>"
      + "<ellipse cx='36' cy='55' rx='7' ry='5' fill='#fff' opacity='.7' filter='url(#fsoft)'/>"
      + "<ellipse cx='76' cy='55' rx='7' ry='5' fill='#fff' opacity='.55' filter='url(#fsoft)'/>"
      // the same thought striking both heads at once
      + "<path d='M44 30 q-3 8 3 12 M84 30 q3 8 -3 12' stroke='#b9aed9' stroke-width='3.5' fill='none' stroke-linecap='round'/>"
      + sparkle(64, 30, 1.3, f)
      // matching faces so they read as two heads thinking in sync
      + "<circle cx='38' cy='66' r='2.6' fill='" + INK + "'/><circle cx='50' cy='66' r='2.6' fill='" + INK + "'/>"
      + "<path d='M40 75 q4 3.5 8 0' stroke='" + INK + "' stroke-width='2.4' fill='none' stroke-linecap='round'/>"
      + "<circle cx='78' cy='66' r='2.6' fill='" + INK + "'/><circle cx='90' cy='66' r='2.6' fill='" + INK + "'/>"
      + "<path d='M80 75 q4 3.5 8 0' stroke='" + INK + "' stroke-width='2.4' fill='none' stroke-linecap='round'/>";
    return { defs, art, shadowRx: 46 };
  };

  // One Night Wolves — a glossy moon and a howling silhouette.
  ART.wolves = (a, f) => {
    const g1 = grad(), g2 = grad();
    const howl = [0, -2, -4, -5, -3, -1][f];
    const glow = [0.35, 0.5, 0.7, 0.8, 0.6, 0.45][f];
    const defs = rg(g1, [[0, '#fff8dc'], [0.6, '#ffe9a8'], [1, '#e8c465']], 0.4, 0.35)
      + lg(g2, [[0, '#4a4266'], [0.6, '#332c4d'], [1, '#241d3d']]);
    const art =
      "<circle cx='84' cy='42' r='22' fill='#ffe9a8' opacity='" + glow + "' filter='url(#fglow)'/>"
      + "<circle cx='84' cy='42' r='17' fill='url(#" + g1 + ")'/>"
      + "<circle cx='78' cy='38' r='3' fill='#e8c465' opacity='.6'/><circle cx='89' cy='47' r='2.2' fill='#e8c465' opacity='.5'/>"
      + "<circle cx='30' cy='30' r='1.6' fill='#fff' opacity='.8'/><circle cx='46' cy='22' r='1.2' fill='#fff' opacity='.6'/><circle cx='108' cy='70' r='1.4' fill='#fff' opacity='.7'/>"
      + "<g transform='rotate(" + howl + " 52 94)'>"
      + "<path d='M32 94 q-2 -20 10 -30 l-3 -11 8 6 q4 -2.5 9 -2.5 l6 -8 3 10 q10 8 8 21 l-5 14 z' fill='url(#" + g2 + ")'/>"
      + "<path d='M62 58 q7 -5 12 -12' stroke='#332c4d' stroke-width='4' stroke-linecap='round' fill='none'/>"
      + "<circle cx='46' cy='68' r='2' fill='#ffe9a8'/></g>"
      + sparkle(108, 92, 0.8, f);
    return { defs, art, shadowRx: 40 };
  };

  // ---- letter fallback: a glossy candy tile with the initial ----------------
  function fallbackArt(letter, a, f) {
    const base = toHex(candy(a));
    const g1 = grad(), sh = grad();
    const defs = bodyGrad(g1, base) + sheenGrad(sh);
    const art = "<path d='" + rr(30, 30, 68, 68, 20) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(30, 30, 68, 30, 20) + "' fill='url(#" + sh + ")'/>"
      + "<text x='64' y='79' font-family='system-ui,sans-serif' font-size='40' font-weight='800' fill='#fff' text-anchor='middle'>" + letter + '</text>'
      + sparkle(98, 34, 1, f);
    return { defs, art, shadowRx: 36 };
  }

  // ---- Grok Imagine heroes (baked PNGs) — full seed vocabulary -------------
  // Absolute paths so they resolve from any page on the computer origin.
  // meet → video via gifos-icons.js SUBJECTS alias.
  const BAKED = {
    welcome: '/themes/imagine/assets/welcome.png',
    video: '/themes/imagine/assets/video.png',
    notes: '/themes/imagine/assets/notes.png',
    folder: '/themes/imagine/assets/folder.png',
    chess: '/themes/imagine/assets/chess.png',
    paint: '/themes/imagine/assets/paint.png',
    calc: '/themes/imagine/assets/calc.png',
    timer: '/themes/imagine/assets/timer.png',
    tictactoe: '/themes/imagine/assets/tictactoe.png',
    connect4: '/themes/imagine/assets/connect4.png',
    minesweeper: '/themes/imagine/assets/minesweeper.png',
    fortune: '/themes/imagine/assets/fortune.png',
    guestbook: '/themes/imagine/assets/guestbook.png',
    chat: '/themes/imagine/assets/chat.png',
    chest: '/themes/imagine/assets/chest.png',
    imposter: '/themes/imagine/assets/imposter.png',
    spy: '/themes/imagine/assets/spy.png',
    tilt: '/themes/imagine/assets/tilt.png',
    dial: '/themes/imagine/assets/dial.png',
    roulette: '/themes/imagine/assets/roulette.png',
    fakefacts: '/themes/imagine/assets/fakefacts.png',
    oneclue: '/themes/imagine/assets/oneclue.png',
    samebrain: '/themes/imagine/assets/samebrain.png',
    wolves: '/themes/imagine/assets/wolves.png',
    speechcoach: '/themes/imagine/assets/speechcoach.png',
    askai: '/themes/imagine/assets/askai.png',
  };
  const bakedCache = {};
  function loadBaked(url) {
    const hit = bakedCache[url];
    if (hit && hit.complete && hit.naturalWidth) return Promise.resolve(hit);
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => { bakedCache[url] = img; res(img); };
      img.onerror = () => rej(new Error('imagine baked icon failed: ' + url));
      img.src = url;
    });
  }

  // Slow spin + soft contact shadow. Transparent canvas — no tile background.
  function drawBaked(ctx, size, img, subject, f) {
    ctx.clearRect(0, 0, size, size);
    const scale = 0.94;
    const w = size * scale;
    const cx = size / 2;
    const cy = size / 2;

    // Contact shadow under the object
    const shY = cy + w * 0.42;
    ctx.save();
    ctx.fillStyle = 'rgba(8,4,18,0.42)';
    ctx.filter = 'blur(' + Math.max(2.5, w * 0.022) + 'px)';
    ctx.beginPath();
    ctx.ellipse(cx, shY, w * 0.34, Math.max(3, w * 0.065), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Gentle continuous rock/spin over the 6-frame loop
    const angle = Math.sin((f / FR) * Math.PI * 2) * 0.14;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.drawImage(img, -w / 2, -w / 2, w, w);
    ctx.restore();

    // Subject-specific accents (screen-space)
    if (subject === 'video' && f % 2 === 0) {
      ctx.fillStyle = '#ff3b30';
      ctx.shadowColor = 'rgba(255,59,48,.75)';
      ctx.shadowBlur = w * 0.05;
      ctx.beginPath();
      ctx.arc(cx + w * 0.28, cy - w * 0.22, w * 0.028, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    if (subject === 'welcome' && (f + 1) % 3 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      [[0.28, -0.3], [0.34, -0.34], [0.22, -0.26]].forEach((p) => {
        ctx.beginPath();
        ctx.arc(cx + w * p[0], cy + w * p[1], w * 0.012, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  function bakedFrames(subject) {
    const url = BAKED[subject];
    if (!url) return null;
    return range(FR).map((f) => function (ctx, size) {
      return loadBaked(url).then((img) => drawBaked(ctx, size, img, subject, f));
    });
  }

  GifOS.iconPacks.register('imagine', {
    size: SIZE, frames: FR, delayCs: DELAY, dither: 14,
    draw(subject, accent) {
      const baked = bakedFrames(subject);
      if (baked) return baked;
      const builder = ART[subject];
      if (!builder) return null;
      return range(FR).map((f) => { const r = builder(accent, f); return shell(r.defs, r.art, f, r.shadowRx); });
    },
    fallback(letter, accent) {
      return range(FR).map((f) => { const r = fallbackArt(letter, accent, f); return shell(r.defs, r.art, f, r.shadowRx); });
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
