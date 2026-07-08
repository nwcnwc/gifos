/*
 * gifos-pack-letterpress.js — "Letterpress", the professionals' computer
 * (1.gifos.app). Classic letterpress / engraved stationery on warm cream:
 * deep warm ink line work with real weight variation, cream paper fills with
 * a pressed (debossed) highlight edge, one restrained brick-red accent and a
 * steel-blue secondary, tasteful line-shading for depth. Vintage pictograms
 * on fine business stationery — dignified, precise, timeless.
 *
 * Fully procedural SVG. 160px raster, 6 frames, gentle ordered dithering.
 * Animation personality: small-amplitude and dignified — stamps press and
 * the ink darkens on impact, needles settle with damping, typing dots are
 * typewriter keys striking.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  if (!GifOS.iconPacks) return;

  const FR = 6, SIZE = 160, DELAY = 22;
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));

  // ---- palette ---------------------------------------------------------------
  const hx = (n) => clamp(n).toString(16).padStart(2, '0');
  const toHex = (a) => '#' + hx(a[0]) + hx(a[1]) + hx(a[2]);
  const fromHex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mixc = (c1, c2, t) => { const a = typeof c1 === 'string' ? fromHex(c1) : c1, b = typeof c2 === 'string' ? fromHex(c2) : c2; return toHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); };

  const INK = '#2b2620';     // deep warm ink
  const PAPER = '#fbf8f0';   // cream paper
  const CREAM = '#efe6d2';   // deeper cream (secondary plate fill)
  const RED = '#b3402e';     // brick-red accent
  const BLUE = '#2e6cb3';    // steel-blue secondary
  const RULE = '#9db3c6';    // pale ledger-blue ruled lines
  // The app accent tints small trim only — muted to a printable stamp tone.
  const trim = (a) => mixc(mixc(a, '#7a6a52', 0.4), INK, 0.1);

  // ---- engraver's toolkit ----------------------------------------------------
  let uid = 0;
  const gid = () => 'lp' + (uid++);
  // A paper plate PRESSED into the page: a bright edge peeks out below-right
  // (the deboss highlight), then the inked shape sits on top.
  function plate(d, fill, sw) {
    sw = sw == null ? 3 : sw;
    return "<path d='" + d + "' transform='translate(1,1.5)' fill='none' stroke='#ffffff' stroke-width='" + (sw + 1) + "' opacity='.9'/>"
      + "<path d='" + d + "' fill='" + (fill || PAPER) + "' stroke='" + INK + "' stroke-width='" + sw + "' stroke-linejoin='round'/>";
  }
  // Engraved (unfilled) line work with the same pressed highlight.
  function cut(d, sw, color) {
    return "<path d='" + d + "' transform='translate(0.8,1.2)' fill='none' stroke='#ffffff' stroke-width='" + (sw + 0.8) + "' opacity='.7' stroke-linecap='round'/>"
      + "<path d='" + d + "' fill='none' stroke='" + (color || INK) + "' stroke-width='" + sw + "' stroke-linecap='round' stroke-linejoin='round'/>";
  }
  // Plain interior line work (hairlines, rules, shading strokes).
  const ln = (d, sw, color, op) => "<path d='" + d + "' fill='none' stroke='" + (color || INK) + "' stroke-width='" + sw + "' stroke-linecap='round' stroke-linejoin='round'" + (op ? " opacity='" + op + "'" : '') + '/>';

  // Rounded-rect + circle path builders (single d strings so plate() works).
  const rr = (x, y, w, h, r) => 'M' + (x + r) + ' ' + y + ' h' + (w - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r
    + ' v' + (h - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 -' + r + ' ' + r + ' h-' + (w - 2 * r)
    + ' a' + r + ' ' + r + ' 0 0 1 -' + r + ' -' + r + ' v-' + (h - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' -' + r + ' z';
  const circ = (cx, cy, r) => 'M' + (cx - r) + ' ' + cy + ' a' + r + ' ' + r + ' 0 1 0 ' + (2 * r) + ' 0 a' + r + ' ' + r + ' 0 1 0 ' + (-2 * r) + ' 0 z';
  // Compact 4-point stamp star (printer's ornament).
  const star4 = (s) => 'M0 ' + (-s) + ' L' + (s * 0.3) + ' ' + (-s * 0.3) + ' L' + s + ' 0 L' + (s * 0.3) + ' ' + (s * 0.3)
    + ' L0 ' + s + ' L' + (-s * 0.3) + ' ' + (s * 0.3) + ' L' + (-s) + ' 0 L' + (-s * 0.3) + ' ' + (-s * 0.3) + ' Z';

  const SERIF = 'Georgia,\"Times New Roman\",serif';
  function shell(defs, art) {
    return "<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'>"
      + (defs ? '<defs>' + defs + '</defs>' : '') + art + '</svg>';
  }

  // ---- subjects ---------------------------------------------------------------
  const ART = {};

  // Notes — a ruled ledger pad; a fountain pen inks a line across the rule.
  ART.notes = (a, f) => {
    const w = [4, 10, 17, 24, 30, 34][f];
    const art = plate(rr(34, 22, 60, 84, 6), PAPER, 3)
      + "<path d='M34 30 a6 6 0 0 1 6 -6 h48 a6 6 0 0 1 6 6 v8 h-60 z' fill='" + CREAM + "' stroke='" + INK + "' stroke-width='2.4'/>"
      + "<circle cx='49' cy='31' r='2' fill='" + INK + "'/><circle cx='79' cy='31' r='2' fill='" + INK + "'/>"
      + ln('M42 52 h44 M42 62 h44 M42 72 h44 M42 82 h44 M42 92 h44', 1.6, RULE)
      + ln('M46 46 v52', 1.5, RED, 0.6)
      + ln('M50 62 h' + w, 2.4, INK)
      + "<g transform='translate(" + (50 + w) + ",62) rotate(36)'>"
      + plate(rr(-3.5, -34, 7, 24, 3), INK, 2)
      + "<path d='M-3.5 -10 L3.5 -10 L0 1 Z' fill='" + CREAM + "' stroke='" + INK + "' stroke-width='1.8' stroke-linejoin='round'/>"
      + ln('M0 -8 v5', 1.2)
      + '</g>';
    return { defs: '', art };
  };

  // Tic-Tac-Toe — an engraved grid; the red X rubber-stamps into the last cell.
  ART.tictactoe = (a, f) => {
    const s = [1.3, 1.12, 1, 1, 1, 1.02][f];
    const o = [0.25, 0.6, 1, 1, 0.9, 0.7][f];
    const art = plate(rr(28, 28, 72, 72, 8), PAPER, 3)
      + cut('M52 36 v56 M76 36 v56 M36 52 h56 M36 76 h56', 2.6)
      + "<g transform='translate(40,40)'>" + ln('M-6.5 -6.5 L6.5 6.5 M6.5 -6.5 L-6.5 6.5', 4.6, RED) + '</g>'
      + "<circle cx='88' cy='40' r='7.5' fill='none' stroke='" + BLUE + "' stroke-width='4.2'/>"
      + "<circle cx='40' cy='88' r='7.5' fill='none' stroke='" + BLUE + "' stroke-width='4.2'/>"
      + "<g transform='translate(64,64) scale(" + s + ")' opacity='" + o + "'>"
      + ln('M-6.5 -6.5 L6.5 6.5 M6.5 -6.5 L-6.5 7', 4.6, mixc(RED, INK, f >= 2 ? 0.15 : 0)) + '</g>';
    return { defs: '', art };
  };

  // Connect Four — a counter drops into the punched board and settles.
  ART.connect4 = (a, f) => {
    const dy = [20, 32, 46, 58, 62, 60][f];
    const hole = (x, y) => "<circle cx='" + x + "' cy='" + y + "' r='7.5' fill='#e2d8bf' stroke='" + INK + "' stroke-width='2.2'/>"
      + ln('M' + (x - 4.5) + ' ' + (y - 4.5) + ' a6.5 6.5 0 0 1 9 0', 1.3, INK, 0.35);
    const disc = (x, y, c) => plate(circ(x, y, 7), c, 2.2)
      + "<circle cx='" + x + "' cy='" + y + "' r='3.4' fill='none' stroke='" + PAPER + "' stroke-width='1.4' opacity='.8'/>";
    const art = plate(rr(28, 46, 72, 50, 6), CREAM, 3)
      + ln(rr(32, 50, 64, 42, 3), 1.2, INK, 0.35)
      + hole(42, 60) + hole(64, 60) + hole(86, 60)
      + hole(42, 82) + hole(64, 82) + hole(86, 82)
      + disc(42, 82, RED) + disc(86, 82, BLUE) + disc(64, 82, BLUE)
      + disc(64, dy, RED);
    return { defs: '', art };
  };

  // Minesweeper — the classic round ink bomb, brass cap, fuse spark flickering.
  ART.minesweeper = (a, f) => {
    const s = [1, 1.2, 0.95, 1.22, 1, 1.15][f];
    const art = plate(circ(56, 70, 26), INK, 3)
      + ln('M39 60 a21 21 0 0 1 9 -9', 2.6, PAPER, 0.85)
      + ln('M44 79 a22 22 0 0 0 5 5', 1.6, PAPER, 0.4)
      + "<g transform='rotate(38 76 45)'>" + plate(rr(69, 40, 14, 11, 3), CREAM, 2.4) + '</g>'
      + cut('M80 37 q7 -9 15 -6', 2.6)
      + "<g transform='translate(98,29) scale(" + s + ")'>"
      + "<path d='" + star4(7) + "' fill='" + RED + "'/>"
      + ln('M-6 -6 l-3 -3 M6 -6 l3 -3 M6 6 l3 3 M-6 6 l-3 3', 1.6, RED, 0.8)
      + '</g>';
    return { defs: '', art };
  };

  // Chess — an engraved pawn with line-shading, swaying with quiet dignity.
  ART.chess = (a, f) => {
    const rot = [-2.5, -1, 1, 2.5, 1, -1][f];
    const art = "<g transform='rotate(" + rot + " 64 93)'>"
      + plate(rr(45, 84, 38, 9, 4), PAPER, 3)
      + plate('M58 59 q0 14 -8 24 h28 q-8 -10 -8 -24 z', PAPER, 3)
      + plate(rr(52, 53, 24, 6.5, 3), PAPER, 2.6)
      + plate(circ(64, 42, 11.5), PAPER, 3)
      + ln('M69 35 a9 9 0 0 1 4 8', 1.4, INK, 0.4)
      + ln('M69 63 q1 11 5 17 M66 63 q0 12 3 18', 1.3, INK, 0.35)
      + ln('M74 86 h6', 1.3, INK, 0.4)
      + '</g>';
    return { defs: '', art };
  };

  // Paint — an engraved palette; the brush dips toward the wells.
  ART.paint = (a, f) => {
    const dip = [0, 1.5, 3, 4, 2.5, 1][f];
    const well = (x, y, c) => plate(circ(x, y, 5.5), c, 2);
    const art = plate('M62 38 c-25 0 -38 13 -38 28 c0 15 13 24 31 24 c8 0 8 -7 4 -11 c-4 -4 -1 -9 6 -9 c9 0 21 2 29 -6 c7 -7 3 -26 -32 -26 z', PAPER, 3)
      + ln('M34 58 a26 18 0 0 1 8 -10', 1.3, INK, 0.35)
      + well(45, 58, RED) + well(62, 52, BLUE) + well(79, 60, trim(a)) + well(42, 74, INK)
      + "<g transform='translate(88," + (32 + dip) + ") rotate(32)'>"
      + plate(rr(-3, -25, 6, 22, 3), CREAM, 2.2)
      + plate(rr(-4, -3, 8, 6, 1.5), PAPER, 2)
      + "<path d='M-4 3 L4 3 L0 12 Z' fill='" + INK + "' stroke='" + INK + "' stroke-width='1.6' stroke-linejoin='round'/>"
      + '</g>';
    return { defs: '', art };
  };

  // Calculator — a desk adding machine; keys strike like typewriter hammers.
  ART.calc = (a, f) => {
    const vals = ['128', '256', '512', '1024', '42', '7'];
    const pressed = [0, 4, 8, 2, 6, 1][f];
    let keys = '';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const i = r * 3 + c, on = i === pressed;
      keys += "<g transform='translate(0," + (on ? 1.2 : 0) + ")'>"
        + plate(rr(42 + c * 16, 54 + r * 13, 12, 9, 2.5), on ? INK : PAPER, 2) + '</g>';
    }
    const art = plate(rr(34, 24, 60, 80, 7), PAPER, 3)
      + plate(rr(41, 32, 46, 15, 2.5), CREAM, 2.4)
      + "<text x='83' y='43.5' font-family='ui-monospace,Menlo,monospace' font-size='10' font-weight='700' fill='" + INK + "' text-anchor='end'>" + vals[f] + '</text>'
      + keys
      + plate(rr(42, 93, 44, 7, 3), RED, 2.2)
      + ln('M60 96.5 h8', 1.6, PAPER, 0.9);
    return { defs: '', art };
  };

  // Stopwatch — engraved case and ticks; the red hand sweeps a full turn.
  ART.timer = (a, f) => {
    const ticks = range(12).map((i) => {
      const t = i * 30 * Math.PI / 180, big = i % 3 === 0, r1 = 25.5, r2 = big ? 20.5 : 22.5;
      return ln('M' + (64 + Math.sin(t) * r1) + ' ' + (70 - Math.cos(t) * r1) + ' L' + (64 + Math.sin(t) * r2) + ' ' + (70 - Math.cos(t) * r2), big ? 2.4 : 1.4, INK, big ? 0.9 : 0.55);
    }).join('');
    const art = plate(rr(55, 22, 18, 6, 3), CREAM, 2.4)
      + plate(rr(59, 27, 10, 9, 2), PAPER, 2.4)
      + "<g transform='rotate(42 64 70)'>" + plate(rr(60, 32, 8, 7, 2), CREAM, 2.2) + '</g>'
      + "<g transform='rotate(-42 64 70)'>" + plate(rr(60, 32, 8, 7, 2), CREAM, 2.2) + '</g>'
      + plate(circ(64, 70, 30), PAPER, 3.2)
      + "<circle cx='64' cy='70' r='25.5' fill='none' stroke='" + INK + "' stroke-width='1.2' opacity='.45'/>"
      + ticks
      + "<g transform='rotate(" + (f * 60) + " 64 70)'>"
      + ln('M64 77 L64 51', 3, RED)
      + "<path d='M61.6 55 L64 47.5 L66.4 55 z' fill='" + RED + "'/></g>"
      + plate(circ(64, 70, 3.6), INK, 1.6)
      + "<circle cx='64' cy='70' r='1' fill='" + PAPER + "'/>";
    return { defs: '', art };
  };

  // Fortune — the folded cookie; the slip of fortune slides out of the fold.
  ART.fortune = (a, f) => {
    const sl = [0, 2, 4, 5, 3.5, 1.5][f];
    const art = plate('M27 66 C 29 44 44 32 63 32 C 82 32 97 44 99 66 C 93 75 85 79 82.5 72 C 79 62 71 58 63 60 C 55 58 47 62 43.5 72 C 41 79 33 75 27 66 Z', PAPER, 3)
      + ln('M63 59 q-3 -13 0 -25', 1.8, INK, 0.55)
      + ln('M33 54 a34 30 0 0 1 11 -14 M93 55 a35 30 0 0 0 -9 -13', 1.3, INK, 0.35)
      + ln('M40 42 l3 2 M83 41 l-3 2 M52 35 l2 2.5', 1.2, INK, 0.4)
      + ln('M35 71 l4 -2 M91 70 l-4 -2', 1.3, INK, 0.4)
      + "<g transform='translate(" + (sl * 0.85) + ',' + (sl * 0.45) + ") rotate(26 64 60)'>"
      + plate(rr(62, 54, 42, 13, 2), PAPER, 2.2)
      + ln('M68 59 h16 M68 63 h12', 1.6, RED, 0.75)
      + '</g>';
    return { defs: '', art };
  };

  // Guestbook — an open ledger; a red heart is stamped onto the right page.
  ART.guestbook = (a, f) => {
    const s = [1, 1.06, 1.14, 1.06, 1, 1.02][f];
    const o = [0.85, 0.9, 1, 1, 0.9, 0.85][f];
    const art = plate('M24 44 Q44 33 64 44 L64 93 Q44 83 24 93 Z', PAPER, 3)
      + plate('M104 44 Q84 33 64 44 L64 93 Q84 83 104 93 Z', PAPER, 3)
      + ln('M64 44 V93', 2)
      + ln('M31 55 h24 M31 63 h24 M31 71 h20 M31 79 h22', 1.6, RULE)
      + ln('M27 90 q17 -8 35 1', 1.2, INK, 0.35)
      + "<g transform='translate(84,64) scale(" + s + ")' opacity='" + o + "'>"
      + "<path d='M0 9 C-10 0 -7 -9 0 -4.5 C7 -9 10 0 0 9 Z' fill='" + RED + "'/></g>"
      + ln('M75 78 h18', 1.6, RULE);
    return { defs: '', art };
  };

  // Chat — the typing dots are typewriter keys; each strikes in turn.
  ART.chat = (a, f) => {
    const hit = f % 3;
    const dots = range(3).map((i) => {
      const x = 48 + i * 13;
      return i === hit
        ? "<circle cx='" + x + "' cy='51' r='4' fill='" + INK + "'/>"
        : plate(circ(x, 48.5, 4), PAPER, 2);
    }).join('');
    const art = plate('M32 28 h56 a11 11 0 0 1 11 11 v18 a11 11 0 0 1 -11 11 h-36 l-13 13 v-13 h-7 a11 11 0 0 1 -11 -11 v-18 a11 11 0 0 1 11 -11 z', PAPER, 3)
      + dots
      + plate(rr(74, 74, 32, 20, 9), BLUE, 2.6)
      + "<path d='M94 92 l8 9 l2 -10 z' fill='" + BLUE + "'/>"
      + "<circle cx='84' cy='84' r='1.9' fill='" + PAPER + "'/><circle cx='90' cy='84' r='1.9' fill='" + PAPER + "'/><circle cx='96' cy='84' r='1.9' fill='" + PAPER + "'/>";
    return { defs: '', art };
  };

  // Folder — an engraved dossier; the filed sheet lifts and settles.
  ART.folder = (a, f) => {
    const lift = [0, 1, 2.2, 3, 2, 0.8][f];
    const art = plate('M22 36 a6 6 0 0 1 6 -6 h22 a6 6 0 0 1 5.2 3 l3.6 6 h41.2 a6 6 0 0 1 6 6 v42 a8 8 0 0 1 -8 8 h-68 a8 8 0 0 1 -8 -8 z', CREAM, 3)
      + "<g transform='translate(0," + (-lift) + ")'>"
      + plate(rr(48, 28, 44, 30, 3), PAPER, 2)
      + ln('M55 37 h28 M55 44 h20 M55 51 h24', 1.6, RULE) + '</g>'
      + plate('M20 62 a6 6 0 0 1 6 -6 h76 a6 6 0 0 1 6 6 l-2 25 a8 8 0 0 1 -8 8 h-68 a8 8 0 0 1 -8 -8 z', PAPER, 3)
      + ln('M26 62 h76 l-1.5 21 a5 5 0 0 1 -5 4.6 h-63 a5 5 0 0 1 -5 -4.6 z', 1.2, INK, 0.35)
      + "<circle cx='64' cy='78' r='5' fill='" + RED + "'/>"
      + "<circle cx='64' cy='78' r='2.6' fill='none' stroke='" + PAPER + "' stroke-width='1.2' opacity='.85'/>";
    return { defs: '', art };
  };

  // Stolen Apps — a strongbox chest; the lid creaks open over the coins.
  ART.chest = (a, f) => {
    const open = [0, 2, 4.5, 5.5, 3.5, 1][f];
    const coin = (x, y) => plate(circ(x, y, 4.2), trim(a), 2)
      + ln('M' + (x - 1.5) + ' ' + y + ' h3', 1.2, INK, 0.6);
    const art = coin(50, 56) + coin(64, 55) + coin(78, 56)
      + "<g transform='translate(0," + (-open * 0.9) + ") rotate(" + (-open) + " 98 58)'>"
      + plate('M30 60 v-9 q0 -15 34 -15 q34 0 34 15 v9 z', CREAM, 3)
      + ln('M30 53 q0 -13 34 -13 q34 0 34 13', 1.6, INK, 0.4)
      + ln('M46 60 v-19 M82 60 v-19', 2.6, INK, 0.6)
      + '</g>'
      + plate(rr(30, 60, 68, 34, 4), CREAM, 3)
      + ln('M30 72 h68 M30 83 h68', 1.3, INK, 0.3)
      + ln('M46 61 v32 M82 61 v32', 3, INK, 0.75)
      + "<circle cx='46' cy='66' r='1.2' fill='" + INK + "'/><circle cx='46' cy='88' r='1.2' fill='" + INK + "'/>"
      + "<circle cx='82' cy='66' r='1.2' fill='" + INK + "'/><circle cx='82' cy='88' r='1.2' fill='" + INK + "'/>"
      + ln('M30 64 q3 -3 6 -4 M98 64 q-3 -3 -6 -4', 2, INK, 0.5)
      + plate(rr(58, 55, 12, 16, 2), RED, 2.4)
      + "<circle cx='64' cy='61' r='1.8' fill='" + PAPER + "'/>" + ln('M64 62 v4', 1.8, PAPER, 0.9);
    return { defs: '', art };
  };

  // Video Call — the hero: a hand-cranked cine camera, reels turning.
  ART.video = (a, f) => {
    const th = f * 60;
    const reel = (cx, cy, r, dir) => plate(circ(cx, cy, r), PAPER, 3)
      + "<circle cx='" + cx + "' cy='" + cy + "' r='" + (r - 3.5) + "' fill='none' stroke='" + INK + "' stroke-width='1.2' opacity='.45'/>"
      + "<g transform='rotate(" + (dir * th) + ' ' + cx + ' ' + cy + ")'>"
      + range(3).map((k) => "<g transform='rotate(" + (k * 120) + ' ' + cx + ' ' + cy + ")'>" + ln('M' + cx + ' ' + cy + ' V' + (cy - r + 4.5), 2.2) + '</g>').join('')
      + '</g>'
      + "<circle cx='" + cx + "' cy='" + cy + "' r='3' fill='" + INK + "'/>";
    const art = reel(46, 40, 15, 1) + reel(80, 43, 11.5, -1)
      + plate(rr(26, 56, 66, 38, 6), PAPER, 3)
      + ln(rr(32, 62, 38, 26, 3), 1.3, INK, 0.4)
      + ln('M37 69 h28 M37 75 h28 M37 81 h20', 1.4, INK, 0.4)
      + "<circle cx='36' cy='89' r='1.2' fill='" + INK + "' opacity='.6'/><circle cx='64' cy='89' r='1.2' fill='" + INK + "' opacity='.6'/>"
      + "<circle cx='80' cy='66' r='3' fill='" + RED + "'/>"
      + plate('M92 63 l16 -8 v30 l-16 -8 z', CREAM, 3)
      + ln('M96 67 l8 -4', 1.4, INK, 0.4)
      + cut('M34 94 l-7 11 M84 94 l7 11', 2.8)
      + cut('M59 94 v10', 2.8);
    return { defs: '', art };
  };

  // Imposter — three stamped figures; the reversed red one fidgets.
  ART.imposter = (a, f) => {
    const rot = [-3, -1, 1.5, 3, 1, -1.5][f];
    const qo = [0.15, 0.4, 0.75, 1, 0.7, 0.35][f];
    const fig = (x, fill) => plate(rr(x - 9, 66, 18, 28, 9), fill, 2.4) + plate(circ(x, 56, 7.5), fill, 2.4);
    const art = fig(38, PAPER) + fig(64, PAPER)
      + "<g transform='rotate(" + rot + " 90 94)'>" + fig(90, RED) + '</g>'
      + ln('M34 56 h2 M41 56 h2 M60 56 h2 M67 56 h2', 1.8, INK, 0.9)
      + "<text x='90' y='42' font-family='" + SERIF + "' font-size='16' font-weight='700' fill='" + INK + "' text-anchor='middle' opacity='" + qo + "'>?</text>";
    return { defs: '', art };
  };

  // Spy — a magnifier sweeps a fingerprint card, print swelling under glass.
  ART.spy = (a, f) => {
    const mx = [0, 3.5, 7, 9, 5.5, 2][f];
    const cp = gid();
    const defs = "<clipPath id='" + cp + "'><circle cx='62' cy='62' r='13'/></clipPath>";
    // a whorl: nested open ridge arcs, like the corner of a real print
    const whorl = (cx, cy, k, sw, op) => range(4).map((i) => {
      const r = (3 + i * 3.2) * k;
      return "<path d='M" + (cx - r) + ' ' + (cy + r * 0.55) + ' A' + r + ' ' + (r * 1.15) + " 0 1 1 " + (cx + r * 0.86) + ' ' + (cy + r * 0.75) + "' fill='none' stroke='" + INK + "' stroke-width='" + sw + "' opacity='" + op + "' stroke-linecap='round'/>";
    }).join('');
    const art = plate(rr(26, 30, 48, 62, 4), PAPER, 3)
      + ln('M32 38 h18 M32 84 h26', 1.6, RULE)
      + ln('M62 38 h6', 1.6, RED, 0.8)
      + whorl(48, 62, 1, 1.3, 0.6)
      + "<g transform='translate(" + mx + ',' + (mx * 0.25) + ")'>"
      + "<circle cx='62' cy='62' r='13' fill='#ffffff' opacity='.35'/>"
      + "<g clip-path='url(#" + cp + ")'>" + whorl(54, 63, 1.9, 2, 0.8) + '</g>'
      + cut(circ(62, 62, 14), 4)
      + cut('M72 72 l15 14', 6.5)
      + ln('M73.5 73.5 l12 11', 3, CREAM)
      + '</g>';
    return { defs, art };
  };

  // Tilt — the card on the forehead rocks as the player guesses.
  ART.tilt = (a, f) => {
    const rot = [-8, -3, 2, 7, 3, -2][f];
    const head = 'M42 100 q-2 -10 0 -14 q-10 -5 -10 -18 q0 -20 20 -22 q14 -1.5 20 8 q3 5 3 10 l6 5 -5 3 q1 8 -3 11 q-4 3 -10 2 q-1 6 3 15 z';
    const art = plate(head, INK, 2.4)
      + ln('M40 52 a14 14 0 0 1 9 -6', 2, PAPER, 0.5)
      + "<g transform='translate(84,38) rotate(" + rot + ")'>"
      + plate(rr(-12, -15, 24, 31, 3), PAPER, 2.6)
      + ln(rr(-9, -12, 18, 25, 1.5), 1.1, INK, 0.35)
      + "<text x='0' y='6' font-family='" + SERIF + "' font-size='17' font-weight='700' fill='" + RED + "' text-anchor='middle'>?</text>"
      + '</g>'
      + ln('M104 26 q6 6 5 14', 1.8, INK, 0.5)
      + ln('M62 20 q-6 4 -7 12', 1.8, INK, 0.5);
    return { defs: '', art };
  };

  // The Dial — a desk gauge; the needle overshoots and settles with damping.
  ART.dial = (a, f) => {
    const ang = [-50, 28, 0, 16, 7, 11][f];
    const tick = (deg, len, sw, op) => {
      const t = deg * Math.PI / 180, r1 = 31;
      return ln('M' + (64 + Math.sin(t) * r1) + ' ' + (84 - Math.cos(t) * r1) + ' L' + (64 + Math.sin(t) * (r1 - len)) + ' ' + (84 - Math.cos(t) * (r1 - len)), sw, INK, op);
    };
    const art = plate('M26 84 a38 38 0 0 1 76 0 v8 a3 3 0 0 1 -3 3 h-70 a3 3 0 0 1 -3 -3 z', PAPER, 3)
      + range(11).map((i) => { const d = -60 + i * 12; return tick(d, i % 2 ? 3.5 : 6, i % 2 ? 1.3 : 2.2, i % 2 ? 0.45 : 0.85); }).join('')
      + "<path d='M" + (64 + Math.sin(34 * Math.PI / 180) * 31) + ' ' + (84 - Math.cos(34 * Math.PI / 180) * 31) + ' A31 31 0 0 1 ' + (64 + Math.sin(60 * Math.PI / 180) * 31) + ' ' + (84 - Math.cos(60 * Math.PI / 180) * 31) + "' fill='none' stroke='" + RED + "' stroke-width='4' stroke-linecap='round'/>"
      + ln('M32 90 h10 M86 90 h10', 1.4, INK, 0.4)
      + "<g transform='rotate(" + ang + " 64 84)'>"
      + ln('M64 84 L64 62', 3, INK)
      + "<path d='M61.4 66 L64 57 L66.6 66 z' fill='" + RED + "'/></g>"
      + plate(circ(64, 84, 4.5), CREAM, 2.4);
    return { defs: '', art };
  };

  // Party Roulette — the fanned deck of dare cards; the top card pops.
  ART.roulette = (a, f) => {
    const pop = [0, -2, -5, -6, -4, -1][f];
    const art = "<g transform='rotate(-9 50 66)'>" + plate(rr(32, 40, 38, 52, 4), CREAM, 2.4) + '</g>'
      + "<g transform='rotate(8 78 66)'>" + plate(rr(60, 40, 38, 52, 4), CREAM, 2.4) + '</g>'
      + "<g transform='translate(0," + pop + ") rotate(" + (pop * 0.35) + " 64 61)'>"
      + plate(rr(45, 34, 38, 54, 4), PAPER, 3)
      + ln(rr(49, 38, 30, 46, 2), 1.3, INK, 0.45)
      + "<g transform='translate(64,56)'><path d='" + star4(8) + "' fill='" + RED + "'/></g>"
      + ln('M56 72 h16 M58 77.5 h12', 1.8, INK, 0.75)
      + '</g>';
    return { defs: '', art };
  };

  // Fake Facts — the teller's nose grows with every whopper.
  ART.fakefacts = (a, f) => {
    const w = [8, 13, 19, 25, 18, 11][f];
    const sweat = [0, 0.2, 0.5, 0.9, 0.6, 0.3][f];
    const art = plate(circ(50, 62, 24), PAPER, 3)
      + ln('M58 42 a21 21 0 0 1 9 9', 1.4, INK, 0.4)
      + ln('M37 51 q4 -3 8 -1 M52 50 q4 -2 8 1', 2, INK, 0.85)
      + "<circle cx='42' cy='57' r='2.3' fill='" + INK + "'/><circle cx='57' cy='57' r='2.3' fill='" + INK + "'/>"
      + ln('M41 74 q7 4 14 -1', 2.2, INK)
      + plate(rr(68, 57, w, 9, 4.5), PAPER, 2.4)
      + "<circle cx='" + (68 + w - 2) + "' cy='61.5' r='2.2' fill='" + RED + "'/>"
      + "<path d='M84 36 q-3.5 5 0 8 q3.5 -3 0 -8 z' fill='" + BLUE + "' opacity='" + sweat + "'/>";
    return { defs: '', art };
  };

  // One Clue — the engraved bulb; the red filament and rays kindle.
  ART.oneclue = (a, f) => {
    const o = [0.1, 0.45, 1, 1, 0.6, 0.25][f];
    const art = ln('M64 25 v-7 M87 33 l5 -5 M41 33 l-5 -5 M95 51 h7 M33 51 h-7', 2.4, RED, Math.max(0.06, o * 0.95))
      + plate(circ(64, 50, 20), PAPER, 3)
      + ln('M52 40 a15 15 0 0 1 8 -6', 1.6, INK, 0.4)
      + ln('M57 57 q3.5 -8 7 0 q3.5 8 7 0', 2, mixc(RED, INK, 1 - o), 0.4 + o * 0.6)
      + ln('M57 57 v-8 M71 57 v-8', 1.4, INK, 0.5)
      + plate('M56 68 q8 5 16 0 l-1.5 8 h-13 z', PAPER, 2.4)
      + plate(rr(55, 78, 18, 5, 2), CREAM, 2)
      + plate(rr(56.5, 85, 15, 5, 2), CREAM, 2)
      + plate(rr(59.5, 92, 9, 4, 2), INK, 1.6);
    return { defs: '', art };
  };

  // Same Brain — two heads, one thought: the shared spark pulses between.
  ART.samebrain = (a, f) => {
    const s = [1, 1.08, 1.16, 1.1, 1.02, 1][f];
    const o = [0.6, 0.8, 1, 1, 0.85, 0.7][f];
    const face = (x) => "<circle cx='" + (x - 5.5) + "' cy='71' r='2.2' fill='" + INK + "'/><circle cx='" + (x + 5.5) + "' cy='71' r='2.2' fill='" + INK + "'/>"
      + ln('M' + (x - 4.5) + ' 79 q4.5 3.5 9 0', 2, INK);
    const art = plate(circ(42, 72, 17), PAPER, 3) + plate(circ(86, 72, 17), PAPER, 3)
      + face(42) + face(86)
      + ln('M35 60 a13 13 0 0 1 7 -4 M79 60 a13 13 0 0 1 7 -4', 1.4, INK, 0.4)
      + "<path d='M48 54 Q53 44 59 40' fill='none' stroke='" + INK + "' stroke-width='2' stroke-linecap='round' stroke-dasharray='.5 4.5' opacity='" + o + "'/>"
      + "<path d='M80 54 Q75 44 69 40' fill='none' stroke='" + INK + "' stroke-width='2' stroke-linecap='round' stroke-dasharray='.5 4.5' opacity='" + o + "'/>"
      + "<g transform='translate(64,32) scale(" + s + ")' opacity='" + o + "'>"
      + "<path d='" + star4(8) + "' fill='" + RED + "'/>"
      + "<circle r='2' fill='" + PAPER + "'/></g>";
    return { defs: '', art };
  };

  // One Night Wolves — the ink wolf tips back and howls at the engraved moon.
  ART.wolves = (a, f) => {
    const rot = [0, -1.5, -3, -3.5, -2, -1][f];
    const ho = [0, 0.3, 0.7, 1, 0.6, 0.25][f];
    const art = plate(circ(88, 38, 16), PAPER, 3)
      + "<circle cx='83' cy='34' r='2.8' fill='none' stroke='" + INK + "' stroke-width='1.3' opacity='.5'/>"
      + "<circle cx='92' cy='43' r='1.9' fill='none' stroke='" + INK + "' stroke-width='1.2' opacity='.45'/>"
      + ln('M77 46 a16 16 0 0 0 22 -3 M79 49 a16 16 0 0 0 17 -2', 1.2, INK, 0.35)
      + ln('M30 26 h5 M32.5 23.5 v5 M46 40 h4 M48 37.5 v5 M108 66 h4 M110 63.5 v5', 1.4, INK, 0.6)
      + ln('M63 32 q5 -2 6 -8 M68 38 q7 -3 9 -11', 2.2, INK, ho)
      + "<g transform='rotate(" + rot + " 46 94)'>"
      + plate('M30 96 C 25 82 27 66 38 58 L 36 46 L 43.5 53 L 56 38 L 57.5 45.5 L 51.5 48.5 C 58.5 52 63 58 62 66 L 58.5 82 L 61 96 Z', INK, 2.4)
      + ln('M33 74 q1 -8 6 -12', 1.6, PAPER, 0.45)
      + ln('M47 51 q3 2 6 1', 1.4, PAPER, 0.5)
      + '</g>'
      + cut('M22 96 h52', 2.6);
    return { defs: '', art };
  };

  // Welcome — the house seal: a hand stamp presses and the crest darkens.
  ART.welcome = (a, f) => {
    const ty = [0, 5, 10, 10, 4, 0][f];
    const mo = [0.7, 0.55, 0.4, 1, 0.95, 0.85][f];
    const art = "<g opacity='" + mo + "'>"
      + cut(circ(64, 88, 13.5), 2.6, RED)
      + "<circle cx='64' cy='88' r='10' fill='none' stroke='" + RED + "' stroke-width='1.2'/>"
      + "<g transform='translate(64,88)'><path d='" + star4(5.5) + "' fill='" + RED + "'/></g>"
      + '</g>'
      + (f === 3 ? ln('M42 80 l-7 -4 M86 80 l7 -4', 2, RED, 0.8) : '')
      + "<g transform='translate(0," + ty + ")'>"
      + plate(circ(64, 28, 8), PAPER, 2.6)
      + plate(rr(60.5, 35, 7, 13, 2), CREAM, 2.4)
      + plate('M50 48 h28 q3 0 4 3 l3 8 q1 3 -2 3 h-38 q-3 0 -2 -3 l3 -8 q1 -3 4 -3 z', PAPER, 3)
      + ln('M47 56 h34', 1.3, INK, 0.35)
      + '</g>';
    return { defs: '', art };
  };

  // ---- fallback: the initial engraved in a laurel roundel crest --------------
  function fallbackArt(letter, a, f) {
    const press = [0, 0, 1, 0.55, 0.25, 0][f];
    const sc = 1 - press * 0.025;
    const art = "<g transform='translate(64,64) scale(" + sc + ")'>"
      + plate(circ(0, 0, 36), PAPER, 3.2)
      + "<circle r='31' fill='none' stroke='" + INK + "' stroke-width='1.4' opacity='.65'/>"
      + ln('M-21 18 q5 9 16 11 M21 18 q-5 9 -16 11', 2, INK, 0.8)
      + range(3).map((i) => {
        const t = 0.25 + i * 0.3;
        return "<circle cx='" + (-21 + 15 * t) + "' cy='" + (18 + 9.5 * t) + "' r='1.7' fill='" + INK + "' opacity='.75'/>"
          + "<circle cx='" + (21 - 15 * t) + "' cy='" + (18 + 9.5 * t) + "' r='1.7' fill='" + INK + "' opacity='.75'/>";
      }).join('')
      + "<g transform='translate(0,-24)'><path d='" + star4(3.6) + "' fill='" + RED + "'/></g>"
      + "<text x='1' y='11.5' font-family='" + SERIF + "' font-size='34' font-weight='700' fill='#ffffff' opacity='.85' text-anchor='middle' transform='translate(1,1.4)'>" + letter + '</text>'
      + "<text x='1' y='11.5' font-family='" + SERIF + "' font-size='34' font-weight='700' fill='" + mixc(INK, RED, 0.12) + "' opacity='" + (0.86 + press * 0.14) + "' text-anchor='middle'>" + letter + '</text>'
      + '</g>';
    return { defs: '', art };
  }

  GifOS.iconPacks.register('letterpress', {
    size: SIZE, frames: FR, delayCs: DELAY, dither: 8,
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
