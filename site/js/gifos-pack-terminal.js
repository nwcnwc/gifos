/*
 * gifos-pack-terminal.js — "Terminal Zero", the developers' computer
 * (0.gifos.app). Green phosphor CRT vector graphics: every app is drawn as
 * glowing oscilloscope strokes on transparency — a bright #39ff7c core over
 * layered gaussian-blur phosphor bloom, dim #0f5c2e support lines, a faint
 * 1px double-image ghost, and scanline texture inside the larger shapes.
 *
 * Motion is terminal-native: block cursors blink, traces draw themselves
 * (stroke-dashoffset walking a pathLength'd path), radar/needle sweeps, and
 * the whole tube flickers 0.93↔1 like a tired phosphor. The accent color is
 * mixed ~25% into the green so each app's glow stays distinguishable.
 *
 * Fully procedural SVG. 160px raster, 6 frames, ordered dithering (the bloom
 * is all gradient) — see gifos-icons.js for the pack contract.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  if (!GifOS.iconPacks) return;

  const FR = 6, SIZE = 160, DELAY = 16;
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));

  // ---- phosphor palette -----------------------------------------------------
  const hx = (n) => n.toString(16).padStart(2, '0');
  const toHex = (a) => '#' + hx(clamp(a[0])) + hx(clamp(a[1])) + hx(clamp(a[2]));
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const CORE = [57, 255, 124];   // #39ff7c — bright beam
  const DIMC = [15, 92, 46];     // #0f5c2e — support lines
  const HOT = [214, 255, 228];   // beam center at full power
  // Tint the phosphor with ~25% of the app accent so apps stay tellable apart.
  function colors(accent) {
    return {
      core: toHex(mix(CORE, accent, 0.25)),
      dim: toHex(mix(DIMC, accent, 0.25)),
      mid: toHex(mix(mix(CORE, DIMC, 0.5), accent, 0.25)),
      hot: toHex(mix(HOT, accent, 0.12)),
    };
  }

  // ---- ids / drawing helpers ------------------------------------------------
  let uid = 0;
  const gid = () => 't' + (uid++);
  const FONT = 'ui-monospace,Menlo,Consolas,monospace';
  const txt = (x, y, s, size, fill, anchor, weight) =>
    "<text x='" + x + "' y='" + y + "' font-family='" + FONT + "' font-size='" + size + "'"
    + (weight ? " font-weight='" + weight + "'" : '')
    + (anchor ? " text-anchor='" + anchor + "'" : '')
    + " fill='" + fill + "' stroke='none'>" + s + '</text>';
  // Polar point on a circle (0° = 12 o'clock, clockwise).
  const pt = (cx, cy, r, deg) => {
    const a = deg * Math.PI / 180;
    return [+(cx + r * Math.sin(a)).toFixed(2), +(cy - r * Math.cos(a)).toFixed(2)];
  };
  const arc = (cx, cy, r, a1, a2) => {
    const p1 = pt(cx, cy, r, a1), p2 = pt(cx, cy, r, a2);
    return 'M' + p1[0] + ' ' + p1[1] + ' A' + r + ' ' + r + ' 0 ' + (a2 - a1 > 180 ? 1 : 0) + ' 1 ' + p2[0] + ' ' + p2[1];
  };
  // A trace that draws itself: t in 0..1 of the path revealed.
  const dashOn = (d, t, extra) => {
    t = Math.max(0, Math.min(1, t));
    if (t <= 0) return '';
    return "<path d='" + d + "' pathLength='100' stroke-dasharray='100 100' stroke-dashoffset='"
      + (100 * (1 - t)).toFixed(1) + "'" + (extra || '') + '/>';
  };
  // Scanline texture: faint 1px horizontal lines inside a region (dim layer).
  const scan = (x, y, w, h, op) => {
    let d = '';
    for (let yy = y + 2; yy < y + h; yy += 4) d += 'M' + x + ' ' + yy + 'h' + w;
    return "<path d='" + d + "' stroke-width='1' opacity='" + (op || 0.4) + "' stroke-linecap='butt'/>";
  };
  // Blinking block cursor (the terminal signature).
  const BLINK = [1, 1, 0, 1, 1, 0];
  const cursor = (x, y, w, h, f, C) =>
    BLINK[f] ? "<rect x='" + x + "' y='" + y + "' width='" + w + "' height='" + h + "' fill='" + C.core + "' stroke='none'/>" : '';
  const rr = (x, y, w, h, r) => 'M' + (x + r) + ' ' + y + ' h' + (w - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r
    + ' v' + (h - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 -' + r + ' ' + r + ' h-' + (w - 2 * r)
    + ' a' + r + ' ' + r + ' 0 0 1 -' + r + ' -' + r + ' v-' + (h - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' -' + r + ' z';

  // Phosphor flicker: the whole tube breathes on some frames.
  const FLICK = [1, 0.95, 1, 0.93, 1, 0.97];

  // ---- the shell: dim layer + bloom + ghost + crisp core ---------------------
  // Every subject returns { defs?, dim, core }. `core` is duplicated four
  // times: wide halo blur, tight glow blur, a 1px ghost, then the bright beam.
  function shell(r, f, C) {
    const fh = gid(), fg = gid();
    const coreG = (open) => "<g fill='none' stroke='" + C.core + "' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'" + open + '>' + r.core + '</g>';
    return "<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'>"
      + '<defs>'
      + "<filter id='" + fh + "' x='-70%' y='-70%' width='240%' height='240%'><feGaussianBlur stdDeviation='5'/></filter>"
      + "<filter id='" + fg + "' x='-45%' y='-45%' width='190%' height='190%'><feGaussianBlur stdDeviation='1.8'/></filter>"
      + (r.defs || '') + '</defs>'
      + "<g opacity='" + FLICK[f] + "'>"
      + coreG(" filter='url(#" + fh + ")' opacity='.5'")
      + coreG(" filter='url(#" + fg + ")' opacity='.85'")
      + "<g fill='none' stroke='" + C.dim + "' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'>" + (r.dim || '') + '</g>'
      + coreG(" transform='translate(1.3,0)' opacity='.14'")
      + coreG('')
      + '</g></svg>';
  }

  // ---- subjects ---------------------------------------------------------------
  const ART = {};

  // Notes — a text buffer: pad frame, dim finished lines, the current line
  // typing itself out with a blinking block cursor chasing it.
  ART.notes = (C, f) => {
    const w = [4, 10, 16, 22, 28, 34][f];
    const dim =
      "<path d='M46 26 v8 M64 26 v8 M82 26 v8'/>"
      + "<path d='M40 48 h48 M40 58 h40 M40 68 h46'/>"
      + scan(34, 38, 60, 60)
      + "<path d='M40 88 h30' opacity='.6'/>";
    const core =
      "<path d='" + rr(30, 30, 68, 72, 7) + "'/>"
      + "<path d='M30 40 h68' stroke-width='2'/>"
      + "<path d='M40 78 h" + w + "' stroke-width='3.5'/>"
      + cursor(42 + w, 73, 6, 10, f, C);
    return { dim, core };
  };

  // Tic-Tac-Toe — the X strokes trace themselves, then the O sweeps round.
  ART.tictactoe = (C, f) => {
    const dim = "<circle cx='87' cy='41' r='6.5'/>";
    const core =
      "<path d='M52 30 V98 M76 30 V98 M30 52 H98 M30 76 H98' stroke-width='2.6'/>"
      + dashOn('M34.5 34.5 L47.5 47.5', (f + 1) / 2, " stroke-width='4'")
      + dashOn('M47.5 34.5 L34.5 47.5', f / 2, " stroke-width='4'")
      + dashOn(arc(87, 87, 7.5, 0, 359), (f - 2) / 3, " stroke-width='4'");
    return { dim, core };
  };

  // Connect Four — a bright disc falls through the dim rack and lands hot.
  ART.connect4 = (C, f) => {
    const y = [24, 36, 52, 82, 82, 82][f];
    const land = f === 3;
    const dim =
      "<circle cx='46' cy='60' r='7'/><circle cx='64' cy='60' r='7'/><circle cx='82' cy='60' r='7'/>"
      + "<circle cx='64' cy='82' r='7'/><circle cx='82' cy='82' r='7'/>"
      + scan(34, 50, 60, 42);
    const core =
      "<path d='" + rr(30, 46, 68, 50, 6) + "'/>"
      + "<circle cx='82' cy='82' r='4' fill='" + C.dim + "' stroke='none'/><circle cx='82' cy='82' r='7' stroke-width='2.2'/>"
      + "<circle cx='46' cy='" + y + "' r='7' stroke-width='3.4'/>"
      + "<circle cx='46' cy='" + y + "' r='3' fill='" + C.core + "' stroke='none' opacity='.9'/>"
      + (land ? "<circle cx='46' cy='82' r='11' stroke-width='2' opacity='.7'/>" : '');
    return { dim, core };
  };

  // Minesweeper — the bomb; its fuse burns down, the spark crawling home.
  ART.minesweeper = (C, f) => {
    // fuse quad bezier from bomb top (74,52) out to the tip (100,36)
    const q = (t) => {
      const p0 = [74, 52], p1 = [86, 30], p2 = [100, 38];
      const u = 1 - t;
      return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
    };
    const burn = 1 - f * 0.13;
    const s = q(burn);
    const ss = [1, 1.4, 1, 1.5, 1.1, 1.35][f];
    const dim =
      arcPath(46, 66, 13, -60, -10)
      + "<path d='M100 38 q3 2 2 6' opacity='.5'/>"
      + scan(38, 56, 40, 36);
    const core =
      "<circle cx='58' cy='74' r='22' stroke-width='3.4'/>"
      + "<path d='M69 55 l8 -7' stroke-width='4'/>"
      + dashOn('M74 52 Q86 30 100 38', burn, " stroke-width='2.6'")
      + "<g transform='translate(" + s[0].toFixed(1) + ',' + s[1].toFixed(1) + ") scale(" + ss + ")'>"
      + "<path d='M-5 0 H5 M0 -5 V5 M-3.4 -3.4 L3.4 3.4 M3.4 -3.4 L-3.4 3.4' stroke='" + C.hot + "' stroke-width='2'/></g>";
    return { dim, core };
  };
  function arcPath(cx, cy, r, a1, a2) { return "<path d='" + arc(cx, cy, r, a1, a2) + "'/>"; }

  // Chess — the pawn, being 3D-scanned: a bright line sweeps down inside it.
  ART.chess = (C, f) => {
    const cp = gid();
    const sy = [34, 46, 58, 70, 82, 92][f];
    const defs = "<clipPath id='" + cp + "'>"
      + "<circle cx='64' cy='38' r='11'/><path d='M51 50 h26 l3 6 h-32 z'/>"
      + "<path d='M56 56 q4 16 -10 30 h36 q-14 -14 -10 -30 z'/><rect x='42' y='86' width='44' height='12' rx='3'/>"
      + '</clipPath>';
    const dim =
      "<path d='M58 60 q3 12 -5 22' opacity='.7'/>"
      + "<path d='M38 104 h52' opacity='.8'/>";
    const core =
      "<circle cx='64' cy='38' r='10'/>"
      + "<path d='M53 51 h22'/>"
      + "<path d='M57 51 q3 16 -9 31 h32 q-12 -15 -9 -31'/>"
      + "<path d='" + rr(44, 86, 40, 11, 4) + "'/>"
      + "<g clip-path='url(#" + cp + ")'><path d='M40 " + sy + " h48' stroke='" + C.hot + "' stroke-width='2' opacity='.9'/></g>";
    return { defs, dim, core };
  };

  // Paint — the palette; each well pulses awake in turn, brush dips.
  ART.paint = (C, f) => {
    const lit = f % 4;
    const dip = [0, 2, 4, 5, 3, 1][f];
    const wells = [[47, 57], [65, 51], [83, 60], [43, 75]];
    const wdim = wells.map((w, i) => i === lit ? '' : "<circle cx='" + w[0] + "' cy='" + w[1] + "' r='5'/>").join('');
    const wlit = wells[lit];
    const dim = wdim + "<path d='M58 84 q6 4 12 1' opacity='.6'/>";
    const core =
      "<path d='M64 34 c-27 0 -42 15 -42 31 c0 16 15 27 33 27 c9 0 10 -6 5.5 -10.5 c-5 -5 -1 -11.5 7.5 -11.5 c10 0 23 1 29 -7 c7 -9 -3 -29 -33 -29 z'/>"
      + "<circle cx='" + wlit[0] + "' cy='" + wlit[1] + "' r='5.5' stroke-width='3.2'/>"
      + "<circle cx='" + wlit[0] + "' cy='" + wlit[1] + "' r='1.8' fill='" + C.hot + "' stroke='none'/>"
      + "<g transform='translate(0," + dip + ")'>"
      + "<path d='M104 24 l-13 22' stroke-width='3'/>"
      + "<path d='M91 46 l-5 9 l10 -3 z' fill='" + C.core + "' stroke='none' opacity='.85'/></g>";
    return { dim, core };
  };

  // Calculator — hex readout stepping through the registers, one key hot.
  ART.calc = (C, f) => {
    const HEXES = ['0x00', '0x1A', '0x2F', '0x4C', '0xB7', '0xFF'];
    let keys = '', hotk = '';
    for (let r0 = 0; r0 < 3; r0++) for (let c0 = 0; c0 < 3; c0++) {
      const i = r0 * 3 + c0, x = 44 + c0 * 15, y = 60 + r0 * 13;
      if (i === (f * 4 + 1) % 9) hotk += "<rect x='" + x + "' y='" + y + "' width='10' height='8' rx='2' stroke-width='2.4'/>";
      else keys += "<rect x='" + x + "' y='" + y + "' width='10' height='8' rx='2'/>";
    }
    const dim = keys + scan(42, 34, 44, 14, 0.55);
    const core =
      "<path d='" + rr(34, 24, 60, 80, 8) + "'/>"
      + "<path d='" + rr(41, 33, 46, 16, 3) + "' stroke-width='2.2'/>"
      + txt(83, 45.5, HEXES[f], 11, C.hot, 'end', 700)
      + hotk;
    return { dim, core };
  };

  // Stopwatch — the hand sweeps 60°/frame with a phosphor trail wedge.
  ART.timer = (C, f) => {
    const ang = f * 60;
    const tip = pt(64, 70, 20, ang);
    const trail = arc(64, 70, 16, ang - 55, ang - 6);
    const ticks = range(12).map((i) => {
      const a = i * 30, p1 = pt(64, 70, 26, a), p2 = pt(64, 70, i % 3 ? 23.5 : 21.5, a);
      return 'M' + p1[0] + ' ' + p1[1] + ' L' + p2[0] + ' ' + p2[1];
    }).join(' ');
    const dim = "<path d='" + ticks + "'/>"
      + "<path d='" + trail + "' stroke-width='4' opacity='.55'/>";
    const core =
      "<circle cx='64' cy='70' r='30'/>"
      + "<path d='M64 40 V32 M56 30 h16' stroke-width='3'/>"
      + "<path d='M85 45 l6 -6' stroke-width='3'/>"
      + "<path d='M64 70 L" + tip[0] + ' ' + tip[1] + "' stroke-width='3.4'/>"
      + "<circle cx='64' cy='70' r='2.4' fill='" + C.core + "' stroke='none'/>";
    return { dim, core };
  };

  // Fortune — the folded cookie; its slip of fate slides free underneath,
  // printed dashes and all.
  ART.fortune = (C, f) => {
    const slide = [0, 3, 6, 9, 6, 3][f];
    const dim =
      "<path d='M62 42 Q58 54 62 68' opacity='.8'/>"
      + "<path d='M40 52 q5 -7 12 -9' opacity='.6'/>"
      + "<g transform='translate(" + slide + ",0) rotate(-5 76 92)'>"
      + "<path d='M64 90 h14 M64 95 h10' opacity='.9'/></g>";
    const core =
      "<path d='M22 72 A42 36 0 0 1 106 72 Q84 60 64 76 Q44 60 22 72 Z' stroke-width='3.4'/>"
      + "<g transform='translate(" + slide + ",0) rotate(-5 76 92)'>"
      + "<path d='" + rr(58, 84, 40, 16, 2) + "' stroke-width='2.4'/></g>";
    return { dim, core };
  };

  // Guestbook — the open ledger; a visitor's heart pulses on the page.
  ART.guestbook = (C, f) => {
    const hs = [1, 1.14, 1, 1.2, 1.08, 1][f];
    const dim =
      "<path d='M32 56 h20 M32 64 h16 M32 72 h18 M32 80 h12'/>"
      + scan(70, 48, 30, 42, 0.35);
    const core =
      "<path d='M24 44 Q44 33 64 44 V94 Q44 83 24 94 Z'/>"
      + "<path d='M104 44 Q84 33 64 44 V94 Q84 83 104 94 Z'/>"
      + "<path d='M64 44 V94' stroke-width='2'/>"
      + "<g transform='translate(85,64) scale(" + hs + ")'>"
      + "<path d='M0 8 C-10 0 -7.5 -9 0 -5.2 C7.5 -9 10 0 0 8 Z' stroke-width='2.8'/>"
      + (f % 2 ? "<path d='M0 8 C-10 0 -7.5 -9 0 -5.2 C7.5 -9 10 0 0 8 Z' fill='" + C.core + "' stroke='none' opacity='.25'/>" : '')
      + '</g>';
    return { dim, core };
  };

  // Chat — a big prompt bubble typing (`>` + trace + cursor), a small reply
  // bubble with cycling dots.
  ART.chat = (C, f) => {
    const w = [0, 5, 10, 15, 20, 24][f];
    const dots = [0, 1, 2].map((i) =>
      "<circle cx='" + (84 + i * 8) + "' cy='79' r='2'" + ((f % 3) === i
        ? " fill='" + C.core + "' stroke='none'" : " fill='" + C.dim + "' stroke='none'") + '/>').join('');
    const dim = scan(28, 34, 52, 24, 0.35)
      + "<path d='M40 52 h" + (w || 1) + "'" + (w ? '' : " opacity='0'") + '/>';
    const core =
      "<path d='M32 28 h48 a8 8 0 0 1 8 8 v18 a8 8 0 0 1 -8 8 h-32 l-12 12 v-12 h-4 a8 8 0 0 1 -8 -8 v-18 a8 8 0 0 1 8 -8 z'/>"
      + txt(31, 47, '&gt;', 13, C.core, null, 700)
      + cursor(42 + w, 46, 5, 9, f, C)
      + "<path d='M80 66 h20 a7 7 0 0 1 7 7 v10 a7 7 0 0 1 -7 7 h-3 l9 10 -17 -10 h-9 a7 7 0 0 1 -7 -7 v-10 a7 7 0 0 1 7 -7 z' stroke-width='2.6'/>"
      + dots;
    return { dim, core };
  };

  // Folder — a dim file card rises out of the bright folder mouth.
  ART.folder = (C, f) => {
    const lift = [0, 3, 6, 8, 5, 2][f];
    const cp = gid();
    const defs = "<clipPath id='" + cp + "'><rect x='38' y='6' width='52' height='40'/></clipPath>";
    const dim =
      "<g clip-path='url(#" + cp + ")'><g transform='translate(0," + (-lift) + ")'>"
      + "<path d='" + rr(48, 28, 32, 30, 3) + "'/>"
      + "<path d='M54 36 h20 M54 43 h14'/></g></g>"
      + scan(28, 62, 72, 32);
    const core =
      "<path d='M24 96 V44 a6 6 0 0 1 6 -6 h16 l8 8 h44 a6 6 0 0 1 6 6 v44 a6 6 0 0 1 -6 6 h-68 a6 6 0 0 1 -6 -6 z'/>"
      + "<path d='M24 58 h80' stroke-width='2.2' opacity='.8'/>";
    return { defs, dim, core };
  };

  // Stolen Apps chest — the lid creaks open; loot-light rays leak out.
  ART.chest = (C, f) => {
    const open = [0, 4, 9, 12, 8, 3][f];
    const glow = open / 12;
    const rays = glow ? "<g opacity='" + (glow * 0.9).toFixed(2) + "'>"
      + "<path d='M52 56 l-6 -14 M64 54 l0 -16 M76 56 l6 -14' stroke='" + C.hot + "' stroke-width='2'/></g>" : '';
    const dim =
      "<path d='M46 66 v28 M82 66 v28'/>"
      + scan(32, 64, 64, 30);
    const core =
      rays
      + "<g transform='rotate(" + (-open) + " 30 62)'>"
      + "<path d='M30 62 v-4 q0 -20 34 -20 q34 0 34 20 v4 z'/>"
      + "</g>"
      + "<path d='" + rr(30, 62, 68, 34, 5) + "'/>"
      + "<path d='" + rr(57, 62, 14, 14, 3) + "' stroke-width='2.6'/>"
      + "<circle cx='64' cy='68' r='1.6' fill='" + C.core + "' stroke='none'/><path d='M64 69 v4' stroke-width='2'/>";
    return { dim, core };
  };

  // Video Call — the hero. A camera whose lens is a live radar scope: sweep
  // beam, afterglow wedge, a blip lighting when the beam passes, blinking REC.
  ART.video = (C, f) => {
    const ang = f * 60;
    const tip = pt(52, 66, 12.5, ang);
    const wedge = 'M52 66 L' + pt(52, 66, 12.5, ang - 46).join(' ') + ' ' + arc(52, 66, 12.5, ang - 46, ang).slice(1) + ' Z';
    // blip lives at 150°; hot when the beam has just swept it
    const blip = pt(52, 66, 7, 150);
    const blipHot = f === 2 || f === 3;
    const dim =
      "<circle cx='52' cy='66' r='6.5' opacity='.6'/>"
      + "<path d='M45 66 h14 M52 59 v14' opacity='.45' stroke-width='1.4'/>"
      + scan(26, 46, 52, 38)
      + "<path d='" + wedge + "' fill='" + C.dim + "' stroke='none' opacity='.55'/>";
    const core =
      "<path d='" + rr(22, 42, 60, 46, 9) + "'/>"
      + "<circle cx='52' cy='66' r='14' stroke-width='2.4'/>"
      + "<path d='M52 66 L" + tip[0] + ' ' + tip[1] + "' stroke-width='2.6'/>"
      + "<circle cx='" + blip[0] + "' cy='" + blip[1] + "' r='1.8' fill='" + (blipHot ? C.hot : C.dim) + "' stroke='none'/>"
      + "<path d='M82 58 L104 46 V84 L82 72 Z' stroke-width='3'/>"
      + (f % 2 ? "<circle cx='31' cy='34' r='3.2' fill='" + C.core + "' stroke='none'/>" + txt(38, 37.5, 'REC', 8, C.core, null, 700) : "<circle cx='31' cy='34' r='3.2' stroke-width='2'/>");
    return { dim, core };
  };

  // Imposter — three crewmate glyphs; the middle one is wrong AND it knows:
  // square head, jitter, heavy ghosting, a nervous ? overhead.
  ART.imposter = (C, f) => {
    const j = [0, 2, -2, 3, -1, 1][f];
    const buddy = (x) => "<circle cx='" + x + "' cy='56' r='7'/>"
      + "<path d='M" + (x - 9) + " 92 v-14 a9 9 0 0 1 18 0 v14'/>";
    const dim = buddy(34) + buddy(94)
      + "<path d='M26 96 h76' opacity='.7'/>";
    const core =
      "<g transform='translate(" + j + ",0)'>"
      + "<rect x='57' y='47' width='14' height='14' rx='2'/>"
      + "<path d='M55 92 v-14 a9 9 0 0 1 18 0 v14'/>"
      + "<g transform='translate(" + (-j * 2) + ",0)' opacity='.3'>"
      + "<rect x='57' y='47' width='14' height='14' rx='2'/>"
      + "<path d='M55 92 v-14 a9 9 0 0 1 18 0 v14'/></g></g>"
      + (BLINK[f] ? txt(64, 40, '?', 20, C.hot, 'middle', 700) : '');
    return { dim, core };
  };

  // Spy — the glass sweeps across a latent fingerprint: barely-there in the
  // open, blazing wherever the lens passes over it.
  ART.spy = (C, f) => {
    const mx = [-16, -8, 0, 8, 16, -3][f];
    const cx = 62 + mx;
    const cp = gid();
    // the fingerprint: nested arcs + whorl, centered under the sweep line
    const fprD = arc(62, 60, 13, -75, 75) + ' ' + arc(62, 60, 9, -85, 85)
      + ' ' + arc(62, 60, 5, -95, 95) + ' M49 65 q13 9 26 0';
    const defs = "<clipPath id='" + cp + "'><circle cx='" + cx + "' cy='58' r='14.5'/></clipPath>";
    const dim = "<path d='" + fprD + "' stroke-width='1.8' opacity='.55'/>";
    const core =
      "<g clip-path='url(#" + cp + ")'><path d='" + fprD + "' stroke-width='2.2'/></g>"
      + "<circle cx='" + cx + "' cy='58' r='17'/>"
      + "<path d='M" + (cx + 12) + " 70 l11 11' stroke-width='5'/>";
    return { defs, dim, core };
  };

  // Tilt — the phone rocks on the forehead pivot; motion arcs answer each tip.
  ART.tilt = (C, f) => {
    const rot = [-14, -6, 4, 13, 5, -5][f];
    const dim =
      "<path d='M28 62 q-8 -12 0 -24'" + (rot < 0 ? " opacity='1'" : " opacity='.35'") + '/>'
      + "<path d='M100 62 q8 -12 0 -24'" + (rot > 0 ? " opacity='1'" : " opacity='.35'") + '/>'
      + "<path d='M40 100 h48' opacity='.6'/>";
    const core =
      "<g transform='rotate(" + rot + " 64 96)'>"
      + "<path d='" + rr(46, 28, 36, 62, 8) + "'/>"
      + "<path d='M58 34 h12' stroke-width='2'/>"
      + txt(64, 68, '?', 24, C.core, 'middle', 700)
      + '</g>';
    return { dim, core };
  };

  // The Dial — a scope gauge; the needle hunts, the arc glows at the tip.
  ART.dial = (C, f) => {
    const ang = [-56, -26, 8, 44, 20, -14][f];
    const tip = pt(64, 82, 27, ang);
    const ticks = [-60, -30, 0, 30, 60].map((a) => {
      const p1 = pt(64, 82, 33, a), p2 = pt(64, 82, 28, a);
      return 'M' + p1[0] + ' ' + p1[1] + ' L' + p2[0] + ' ' + p2[1];
    }).join(' ');
    const dim =
      "<path d='" + arc(64, 82, 33, -66, 66) + "'/>"
      + "<path d='M30 92 h68' opacity='.6'/>";
    const core =
      "<path d='" + ticks + "' stroke-width='2.4'/>"
      + "<path d='" + arc(64, 82, 33, ang - 12, ang + 12) + "' stroke-width='3.4'/>"
      + "<path d='M64 82 L" + tip[0] + ' ' + tip[1] + "' stroke-width='3.4'/>"
      + "<circle cx='64' cy='82' r='4'/>"
      + "<circle cx='64' cy='82' r='1.4' fill='" + C.core + "' stroke='none'/>";
    return { dim, core };
  };

  // Party Roulette — the dare deck; the top card pops with a hot '!'.
  ART.roulette = (C, f) => {
    const popY = [0, -3, -6, -8, -5, -2][f];
    const dim =
      "<g transform='rotate(-13 50 72)'><path d='" + rr(30, 44, 36, 50, 5) + "'/></g>"
      + "<g transform='rotate(11 76 72)'><path d='" + rr(60, 42, 36, 50, 5) + "'/></g>";
    const core =
      "<g transform='translate(0," + popY + ")'>"
      + "<path d='" + rr(46, 34, 36, 52, 5) + "'/>"
      + "<path d='M64 46 v20' stroke='" + C.hot + "' stroke-width='4.5'/>"
      + "<circle cx='64' cy='76' r='2.6' fill='" + C.hot + "' stroke='none'/>"
      + '</g>';
    return { dim, core };
  };

  // Fake Facts — the liar's profile; the nose trace keeps getting longer.
  ART.fakefacts = (C, f) => {
    const nose = [6, 11, 17, 24, 18, 10][f];
    const dim =
      "<path d='M40 47 q5 -3 9 0 M57 47 q5 -3 9 0' opacity='.8'/>";
    const core =
      "<circle cx='52' cy='62' r='24'/>"
      + "<circle cx='45' cy='56' r='1.8' fill='" + C.core + "' stroke='none'/>"
      + "<circle cx='61' cy='56' r='1.8' fill='" + C.core + "' stroke='none'/>"
      + "<path d='M42 74 q5 -4 9 0 q5 4 9 0' stroke-width='2.6'/>"
      + "<path d='M74 62 h" + nose + "' stroke-width='4'/>"
      + "<circle cx='" + (74 + nose) + "' cy='62' r='2' fill='" + C.hot + "' stroke='none'/>";
    return { dim, core };
  };

  // One Clue — the bulb; filament strikes, rays fire, then it rests dim.
  ART.oneclue = (C, f) => {
    const on = [1, 1, 0, 1, 0, 1][f];
    const fil = "<path d='M57 58 l3.5 -7 l3.5 7 l3.5 -7 l3.5 7' stroke-width='2.4'/>";
    const rays = range(5).map((i) => {
      const a = -64 + i * 32, p1 = pt(64, 50, 24, a), p2 = pt(64, 50, 31, a);
      return 'M' + p1[0] + ' ' + p1[1] + ' L' + p2[0] + ' ' + p2[1];
    }).join(' ');
    const dim =
      "<path d='M57 66 h14 M58 72 h12 M60 78 h8'/>"
      + (on ? '' : fil);
    const core =
      "<circle cx='64' cy='50' r='17'/>"
      + "<path d='M59 64 l1 -8 M69 64 l-1 -8' stroke-width='2'/>"
      + (on ? fil + "<path d='" + rays + "' stroke-width='2.6'/>" : '');
    return { dim, core };
  };

  // Same Brain — two heads; one thought-packet travels the link between them,
  // then the same spark strikes over both at once.
  ART.samebrain = (C, f) => {
    const t = [0.08, 0.3, 0.55, 0.8, 0.5, 0.2][f];
    const sync = f === 3;
    // packet along the arc M40 44 Q64 22 88 44
    const u = 1 - t;
    const px = u * u * 40 + 2 * u * t * 64 + t * t * 88;
    const py = u * u * 44 + 2 * u * t * 22 + t * t * 44;
    const spark = (x) => "<path d='M" + x + " 30 v6 M" + (x - 4) + " 33 h8' stroke='" + C.hot + "' stroke-width='2'/>";
    const dim =
      "<path d='M40 44 Q64 22 88 44' stroke-dasharray='3 5'/>"
      + "<path d='M30 92 h68' opacity='.6'/>";
    const core =
      "<circle cx='40' cy='66' r='17'/>"
      + "<circle cx='88' cy='66' r='17'/>"
      + "<circle cx='36' cy='63' r='1.7' fill='" + C.core + "' stroke='none'/><circle cx='45' cy='63' r='1.7' fill='" + C.core + "' stroke='none'/>"
      + "<circle cx='84' cy='63' r='1.7' fill='" + C.core + "' stroke='none'/><circle cx='93' cy='63' r='1.7' fill='" + C.core + "' stroke='none'/>"
      + "<path d='M36 73 q4 3 9 0 M84 73 q4 3 9 0' stroke-width='2.4'/>"
      + "<circle cx='" + px.toFixed(1) + "' cy='" + py.toFixed(1) + "' r='2.6' fill='" + C.hot + "' stroke='none'/>"
      + (sync ? spark(40) + spark(88) : '');
    return { dim, core };
  };

  // One Night Wolves — the moon hangs; the wolf howls, arcs rippling out.
  ART.wolves = (C, f) => {
    const n = [0, 1, 2, 3, 2, 1][f];
    const howls = range(3).map((i) => i < n
      ? "<path d='" + arc(76, 34, 7 + i * 7, 15, 70) + "' stroke-width='2.2' opacity='" + (1 - i * 0.25) + "'/>" : '').join('');
    const dim =
      "<circle cx='92' cy='30' r='2' opacity='.7'/><circle cx='100' cy='38' r='1.4' opacity='.6'/>"
      + "<circle cx='28' cy='30' r='1.2'/><circle cx='42' cy='20' r='1'/><circle cx='110' cy='62' r='1.2'/>"
      + "<path d='M22 98 h64' opacity='.8'/>";
    const core =
      "<circle cx='96' cy='32' r='13'/>"
      + howls
      // angular vector-scope wolf: back, ear, raised muzzle, chest, forelegs
      + "<path d='M30 98 L33 78 Q34 68 42 62 L47 56 L45 44 L54 50 L70 36 L67 52 L60 60 Q56 66 56 74 L55 98 Z' stroke-width='3'/>"
      + "<path d='M40 98 v-8 M48 98 v-8' stroke-width='2.4' opacity='.7'/>";
    return { dim, core };
  };

  // Welcome — the power glyph draws itself alive, pulses, and says hello.
  ART.welcome = (C, f) => {
    const arcT = (f + 1) / 4;
    const stemT = Math.min(1, (f + 1) / 2);
    const done = f >= 3;
    const powerArc = arc(64, 54, 21, 38, 322);
    const dim =
      (done ? "<circle cx='64' cy='54' r='" + (27 + (f - 3) * 4) + "' opacity='" + (0.9 - (f - 3) * 0.3) + "'/>" : '')
      + "<path d='M40 98 h48' opacity='0'/>";
    const core =
      dashOn(powerArc, arcT, " stroke-width='3.6'")
      + dashOn('M64 30 V52', stemT, " stroke-width='3.6'")
      + txt(46, 102, 'hello', 11, C.core, null, 700)
      + cursor(83, 93, 6, 10, f, C);
    return { dim, core };
  };

  // ---- fallback: [ A ] a glowing glyph between brackets, cursor blinking ----
  function fallbackArt(letter, C, f) {
    const dim = scan(40, 44, 48, 40, 0.3);
    const core =
      "<path d='M40 34 h-8 v60 h8 M88 34 h8 v60 h-8' stroke-width='3.4'/>"
      + txt(62, 78, letter, 38, C.core, 'middle', 700)
      + cursor(80, 84, 7, 11, f, C);
    return { dim, core };
  }

  GifOS.iconPacks.register('terminal', {
    size: SIZE, frames: FR, delayCs: DELAY, dither: 10,
    draw(subject, accent) {
      const builder = ART[subject];
      if (!builder) return null;
      const C = colors(accent);
      return range(FR).map((f) => shell(builder(C, f), f, C));
    },
    fallback(letter, accent) {
      const C = colors(accent);
      return range(FR).map((f) => shell(fallbackArt(letter, C, f), f, C));
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
