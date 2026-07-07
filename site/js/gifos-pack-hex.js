/*
 * gifos-pack-hex.js — "The Hex", the goth computer (6.gifos.app — a hex is a
 * curse). Cute-spooky witchcraft over the dusk-purple desktop: potion glass,
 * dripping candle wax, grimoire leather, ghost-mist, rune stones. Never gory —
 * Halloween-candy energy. Witch-green glow #8bff5c, ember orange #ff8c3a,
 * deep purples, bone cream. Dimensional: wax has weight, glass has speculars,
 * mist curls, eyes blink in the dark.
 *
 * Fully procedural SVG, transparent background, 160px raster, 6 frames,
 * ordered dithering (see gifos-icons.js). NOTE on glow: the GIF has 1-bit
 * alpha, so halos fade BOTH opacity and color toward the desktop tone
 * (#0d0714) — the 50%-alpha clip edge then lands on a near-desktop color and
 * melts into the theme instead of ringing.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  if (!GifOS.iconPacks) return;

  const FR = 6, SIZE = 160, DELAY = 12;
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));

  // ---- color utilities ------------------------------------------------------
  const hx = (n) => n.toString(16).padStart(2, '0');
  const toHex = (a) => '#' + hx(clamp(a[0])) + hx(clamp(a[1])) + hx(clamp(a[2]));
  const fromHex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const shade = (c, amt) => { const a = typeof c === 'string' ? fromHex(c) : c; return toHex([a[0] + amt, a[1] + amt, a[2] + amt]); };
  const mixc = (c1, c2, t) => { const a = typeof c1 === 'string' ? fromHex(c1) : c1, b = typeof c2 === 'string' ? fromHex(c2) : c2; return toHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); };
  // Brighten an accent into a jewel trim color that reads on the dark desktop.
  const jewel = (a) => { const m = Math.max(a[0], a[1], a[2]) || 1, s = 225 / m; return toHex([a[0] * s, a[1] * s, a[2] * s]); };

  // The Hex palette.
  const GREEN = '#8bff5c';   // witch-green glow
  const EMBER = '#ff8c3a';   // ember orange
  const PDEEP = '#2a1640';   // deep purple
  const PMID = '#4a2a6a';    // mid purple
  const BONE = '#f2ead8';    // bone cream
  const INK = '#120a1e';     // night ink (outlines / darkest)
  const NIGHT = '#0d0714';   // the desktop dusk — glow edges melt into this

  // ---- gradient / material helpers -----------------------------------------
  let uid = 0;
  const grad = () => 'hx' + (uid++);
  function lg(id, stops, vert) {
    const s = stops.map((st) => "<stop offset='" + st[0] + "' stop-color='" + st[1] + "'" + (st[2] != null ? " stop-opacity='" + st[2] + "'" : '') + '/>').join('');
    return "<linearGradient id='" + id + "' x1='0' y1='0' x2='" + (vert === false ? 1 : 0) + "' y2='" + (vert === false ? 0 : 1) + "'>" + s + '</linearGradient>';
  }
  function rg(id, stops, fx, fy) {
    const s = stops.map((st) => "<stop offset='" + st[0] + "' stop-color='" + st[1] + "'" + (st[2] != null ? " stop-opacity='" + st[2] + "'" : '') + '/>').join('');
    return "<radialGradient id='" + id + "'" + (fx != null ? " fx='" + fx + "' fy='" + fy + "'" : '') + '>' + s + '</radialGradient>';
  }
  // Carved rune-stone body: moonlit top, purple core, night-dark base.
  function stoneGrad(id) {
    return lg(id, [[0, '#7a5da3'], [0.4, PMID], [1, '#231038']]);
  }
  // Old parchment / grimoire page.
  function parchGrad(id) {
    return lg(id, [[0, '#fdf8ea'], [0.55, BONE], [1, '#cbbc98']]);
  }
  // Candle / bone wax.
  function waxGrad(id) {
    return lg(id, [[0, '#fdf7e8'], [0.5, BONE], [1, '#c9b78f']], false);
  }
  // Grimoire leather.
  function leatherGrad(id) {
    return lg(id, [[0, '#5d3b86'], [0.5, '#43265f'], [1, '#2a1640']]);
  }
  // A halo that survives the GIF's 1-bit alpha: fades color toward NIGHT as
  // opacity falls, so the clip edge is desktop-colored.
  function haloGrad(id, color) {
    return rg(id, [[0, shade(color, 60), 0.95], [0.4, color, 0.8], [0.72, mixc(color, NIGHT, 0.72), 0.5], [1, NIGHT, 0]]);
  }
  // Soft top sheen for glossy bodies.
  function sheenGrad(id) {
    return lg(id, [[0, '#ffffff', 0.42], [0.4, '#ffffff', 0.12], [0.6, '#ffffff', 0]]);
  }

  // ---- motion tables --------------------------------------------------------
  const BOB = [0, -1.5, -3, -3.5, -2.5, -1];         // whole-icon hover
  const FLK = [1, 0.82, 1.12, 0.9, 1.18, 0.86];      // flame flicker scale
  const SWAY = [0, 2.5, -2, 3, -2.5, 1.5];           // flame tip sway (deg)
  const PULSE = [0.55, 0.7, 0.9, 1, 0.82, 0.62];     // glow breathing

  // Contact shadow + a faint witch-light pool on the dusk floor.
  function shadow(f, rx, cy) {
    const t = -BOB[f] / 3.5;
    cy = cy || 108;
    return "<ellipse cx='64' cy='" + cy + "' rx='" + (rx - t * 3) + "' ry='" + (6.5 - t * 1.2) + "' fill='#03010a' opacity='" + (0.62 - t * 0.12) + "' filter='url(#fblur)'/>"
      + "<ellipse cx='64' cy='" + cy + "' rx='" + (rx * 0.55) + "' ry='2.8' fill='" + mixc(GREEN, NIGHT, 0.68) + "' opacity='" + (0.4 + PULSE[f] * 0.2) + "' filter='url(#fblur)'/>";
  }

  // A candle flame with halo (needs a haloGrad id). col = flame body color.
  function flame(x, y, s, f, haloId, col) {
    const k = FLK[f];
    const body = col || EMBER;
    return "<g transform='translate(" + x + ',' + y + ")'>"
      + "<circle r='" + (15 * s * (0.85 + PULSE[f] * 0.3)) + "' cy='-4' fill='url(#" + haloId + ")'/>"
      + "<g transform='rotate(" + SWAY[f] + ") scale(" + (s * k) + ')' + "'>"
      + "<path d='M0 7 C-5.5 7 -7.5 1.5 -4.5 -3.5 C-2.5 -6.5 -1 -9.5 0 -13 C1 -9.5 2.5 -6.5 4.5 -3.5 C7.5 1.5 5.5 7 0 7 Z' fill='" + body + "'/>"
      + "<path d='M0 6 C-2.8 6 -3.8 2.5 -2.2 -0.5 C-1.2 -2.5 -0.5 -4 0 -6 C0.5 -4 1.2 -2.5 2.2 -0.5 C3.8 2.5 2.8 6 0 6 Z' fill='#fff6d8'/>"
      + '</g></g>';
  }

  // A little bat; up = wings raised.
  function bat(x, y, s, up, col, eyeCol) {
    const c = col || '#1c0f30';
    const e = eyeCol || GREEN;
    const w = up ? -7 : 2, m = up ? -2 : 3.4;
    const wing = (d) => "<path d='M0 -0.5 Q " + (5 * d) + ' ' + (w - 2.5) + ' ' + (12 * d) + ' ' + w
      + ' Q ' + (8.5 * d) + ' ' + m + ' ' + (5.5 * d) + ' ' + (m - 0.6)
      + ' Q ' + (3.5 * d) + ' ' + (m + 2.2) + ' ' + (1.4 * d) + " 1.4 Z' fill='" + c + "'/>";
    return "<g transform='translate(" + x + ',' + y + ") scale(" + s + ")'>" + wing(1) + wing(-1)
      + "<path d='M-2.6 -2 L-1.4 -5 L-0.2 -2.4 L1 -5 L2.6 -2 Z' fill='" + c + "'/>"
      + "<ellipse cx='0' cy='0.2' rx='2.7' ry='3.3' fill='" + c + "'/>"
      + "<circle cx='-1' cy='-1' r='.55' fill='" + e + "'/><circle cx='1.1' cy='-1' r='.55' fill='" + e + "'/></g>";
  }

  // Curling ghost-mist wisp. ph twists the curl.
  function wisp(x, y, s, op, ph) {
    const b = Math.sin(ph || 0) * 3;
    return "<path transform='translate(" + x + ',' + y + ") scale(" + s + ")' d='M0 10 C -6 6 " + (-5 + b) + " -2 1 -4 C 6 -6 " + (7 + b) + " -12 1 -14 C -3 -15.5 -6 -13 -6.5 -10' fill='none' stroke='#e9e2f4' stroke-width='3.6' stroke-linecap='round' opacity='" + op + "'/>";
  }

  // Little angular rune glyphs (drawn, not fonts — headless-safe).
  const RUNE_D = [
    'M0 -6 V6 M0 -5 L5 -1.5 M0 0.5 L5 4',      // fehu-ish
    'M-4 6 V-6 L0 0 L4 -6 V6',                 // mannaz-ish
    'M0 6 V-2 M0 -2 L-4.5 -6 M0 -2 L4.5 -6',   // algiz-ish
    'M-3.5 -6 V6 M-3.5 -5 L4 -1 L-3.5 3',      // thurs-ish
    'M-4 -6 L4 6 M4 -6 L-4 6',                 // gebo
    'M0 -6 V6 M-4.5 -2.5 L4.5 2.5',            // nauthiz
  ];
  function rune(x, y, s, color, i, wdt) {
    return "<g transform='translate(" + x + ',' + y + ") scale(" + s + ")'><path d='" + RUNE_D[((i % 6) + 6) % 6]
      + "' fill='none' stroke='" + color + "' stroke-width='" + (wdt || 2.4) + "' stroke-linecap='round' stroke-linejoin='round'/></g>";
  }

  // Twinkling background stars.
  function stars(pts, f) {
    return pts.map((p, i) => {
      const tw = 0.35 + 0.6 * Math.abs(Math.sin((f / FR) * Math.PI * 2 + i * 1.9));
      return "<circle cx='" + p[0] + "' cy='" + p[1] + "' r='" + p[2] + "' fill='#efe8ff' opacity='" + tw.toFixed(2) + "'/>";
    }).join('');
  }

  // Standard soft specular.
  function spec(x, y, rx, ry, op) {
    return "<ellipse cx='" + x + "' cy='" + y + "' rx='" + rx + "' ry='" + ry + "' fill='#fff' opacity='" + (op || 0.5) + "' filter='url(#fsoft)'/>";
  }

  // Frame wrapper: shared filters, contact shadow, hover.
  function shell(defs, art, f, shadowRx, shadowCy) {
    return "<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'>"
      + '<defs>'
      + "<filter id='fblur' x='-60%' y='-60%' width='220%' height='220%'><feGaussianBlur stdDeviation='4.5'/></filter>"
      + "<filter id='fsoft' x='-60%' y='-60%' width='220%' height='220%'><feGaussianBlur stdDeviation='2.2'/></filter>"
      + "<filter id='fglow' x='-80%' y='-80%' width='260%' height='260%'><feGaussianBlur stdDeviation='2.6'/></filter>"
      + defs + '</defs>'
      + shadow(f, shadowRx || 34, shadowCy)
      + "<g transform='translate(0," + BOB[f] + ")'>" + art + '</g></svg>';
  }

  const rr = (x, y, w, h, r) => 'M' + (x + r) + ' ' + y + ' h' + (w - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r
    + ' v' + (h - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 -' + r + ' ' + r + ' h-' + (w - 2 * r)
    + ' a' + r + ' ' + r + ' 0 0 1 -' + r + ' -' + r + ' v-' + (h - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' -' + r + ' z';

  // Glow-stroke: a blurred bright copy under a sharp stroke (for carved runes).
  function glowPath(d, color, w) {
    return "<path d='" + d + "' fill='none' stroke='" + color + "' stroke-width='" + (w * 2.2) + "' stroke-linecap='round' stroke-linejoin='round' opacity='.85' filter='url(#fglow)'/>"
      + "<path d='" + d + "' fill='none' stroke='" + shade(color, 55) + "' stroke-width='" + w + "' stroke-linecap='round' stroke-linejoin='round'/>";
  }

  // ---- subjects -------------------------------------------------------------
  const ART = {};

  // Notes — a grimoire page; a quill writes a rune that ignites in witch-green.
  ART.notes = (a, f) => {
    const acc = jewel(a);
    const g1 = grad(), g2 = grad(), sh = grad();
    const t = f / (FR - 1);
    const defs = parchGrad(g1) + leatherGrad(g2) + sheenGrad(sh);
    // the rune being written: three strokes revealed by dash
    const runeD = 'M56 52 V86 M56 56 L74 64 M56 70 L74 78';
    const reveal = "<path d='" + runeD + "' pathLength='100' stroke-dasharray='" + (t * 100).toFixed(1) + " 100' fill='none' stroke='" + GREEN + "' stroke-width='9' stroke-linecap='round' opacity='.8' filter='url(#fglow)'/>"
      + "<path d='" + runeD + "' pathLength='100' stroke-dasharray='" + (t * 100).toFixed(1) + " 100' fill='none' stroke='#d6ffbe' stroke-width='4' stroke-linecap='round'/>";
    // quill nib rides the stroke path (approx per frame)
    const QP = [[56, 52], [56, 76], [59, 57], [72, 63], [60, 72], [74, 78]];
    const q = QP[f];
    const art =
      // leather backing board + parchment with torn bottom edge
      "<path d='" + rr(24, 22, 80, 84, 9) + "' fill='url(#" + g2 + ")'/>"
      + "<circle cx='30' cy='28' r='2' fill='#8a6fb0'/><circle cx='98' cy='28' r='2' fill='#8a6fb0'/><circle cx='30' cy='100' r='2' fill='#8a6fb0'/><circle cx='98' cy='100' r='2' fill='#8a6fb0'/>"
      + "<path d='M30 28 h68 v66 l-6 3 -8 -3 -9 4 -10 -4 -9 4 -9 -3 -8 3 -9 -4 z' fill='#c4b48c'/>"
      + "<path d='M30 26 h68 v66 l-6 3 -8 -3 -9 4 -10 -4 -9 4 -9 -3 -8 3 -9 -4 z' fill='url(#" + g1 + ")'/>"
      + "<path d='M30 26 h68 v14 h-68 z' fill='url(#" + sh + ")'/>"
      // faded old scribbles
      + "<path d='M38 36 h44 M38 43 h32' stroke='#b3a27c' stroke-width='2.6' stroke-linecap='round' opacity='.8'/>"
      + reveal
      // the quill: a plump moon-pale feather, accent nib collar
      + "<g transform='translate(" + q[0] + ',' + q[1] + ") rotate(32)'>"
      + "<path d='M1.5 -8 C -6 -18 -5 -32 7 -42 C 16 -34 15 -18 5 -7 Q 3 -5.5 1.5 -8 Z' fill='#f7f2e4'/>"
      + "<path d='M1.5 -8 C -6 -18 -5 -32 7 -42 C 16 -34 15 -18 5 -7 Q 3 -5.5 1.5 -8 Z' fill='none' stroke='#cfc2a4' stroke-width='1.2'/>"
      + "<path d='M3 -8 C 1 -18 2 -30 7 -40' stroke='#c9bb98' stroke-width='1.5' fill='none'/>"
      + "<path d='M0 -14 l-4 -1 M1 -20 l-4.5 -2 M2 -26 l-4 -2.5' stroke='#ded2b2' stroke-width='1.2' stroke-linecap='round'/>"
      + "<path d='M3 -9 L0 0 L5.5 -7.5 Z' fill='" + acc + "'/>"
      + "<path d='M0 0 l1.6 -3.8' stroke='" + INK + "' stroke-width='1.6' stroke-linecap='round'/></g>";
    return { defs, art, shadowRx: 40 };
  };

  // Calculator — a rune-carved standing stone tablet; keys light up in turn.
  ART.calc = (a, f) => {
    const acc = jewel(a);
    const g1 = grad(), g2 = grad(), sh = grad();
    const defs = stoneGrad(g1)
      + lg(g2, [[0, '#123317'], [0.5, '#0d2410'], [1, '#081a0b']])
      + sheenGrad(sh);
    const lit = (f * 2 + 1) % 9;
    let btns = '';
    let i = 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++, i++) {
      const on = i === lit;
      const x = 41 + c * 17, y = 62 + r * 13;
      btns += "<rect x='" + x + "' y='" + y + "' width='13' height='10' rx='3' fill='" + (on ? '#1a4d1f' : '#33194f') + "'/>"
        + "<rect x='" + x + "' y='" + (y + 8) + "' width='13' height='2' rx='1' fill='#8a6fb0' opacity='.5'/>"
        + rune(x + 6.5, y + 5, 0.62, on ? GREEN : '#9d86c2', i, 3)
        + (on ? "<rect x='" + (x - 2) + "' y='" + (y - 2) + "' width='17' height='14' rx='5' fill='" + GREEN + "' opacity='.5' filter='url(#fglow)'/>" : '');
    }
    const art =
      // slab with chipped silhouette
      "<path d='M36 24 L92 22 Q100 22 100 32 L102 94 Q102 103 93 103 L36 104 Q27 104 27 95 L26 34 Q26 25 36 24 Z' fill='url(#" + g1 + ")'/>"
      + "<path d='M36 24 L92 22 Q100 22 100 32 L101 40 L27 42 L26 34 Q26 25 36 24 Z' fill='url(#" + sh + ")'/>"
      + "<path d='M96 46 l3 8 -4 6' stroke='#231038' stroke-width='2' fill='none' opacity='.8'/>"
      + "<path d='M31 88 l4 -6' stroke='#231038' stroke-width='2' fill='none' opacity='.7'/>"
      // glowing screen: carved recess with rune digits
      + "<path d='" + rr(35, 32, 58, 20, 4) + "' fill='#1b0d2e'/>"
      + "<path d='" + rr(36, 33, 56, 18, 3.5) + "' fill='url(#" + g2 + ")'/>"
      + "<rect x='38' y='34' width='52' height='6' rx='3' fill='#8bff5c' opacity='.14'/>"
      + range(3).map((k) => rune(52 + k * 13, 42, 0.85, GREEN, f + k, 2.6)).join('')
      + "<rect x='38' y='36' width='52' height='12' rx='3' fill='" + GREEN + "' opacity='.18' filter='url(#fglow)'/>"
      + btns
      // accent gem set in the stone
      + "<circle cx='64' cy='27.5' r='2.6' fill='" + acc + "'/><circle cx='63.2' cy='26.7' r='.9' fill='#fff' opacity='.85'/>";
    return { defs, art, shadowRx: 38 };
  };

  // Timer — an hourglass: bone frame, glass bulbs, glowing green sand falling.
  ART.timer = (a, f) => {
    const acc = jewel(a);
    const g1 = grad(), g2 = grad(), gh = grad();
    const t = f / (FR - 1);
    const defs = waxGrad(g1)
      + rg(g2, [[0, '#3b2b55', 0.55], [0.75, '#241638', 0.75], [1, '#180d28', 0.9]], 0.35, 0.3)
      + haloGrad(gh, GREEN);
    const topH = 16 - 11 * t;    // top sand column height
    const botH = 4 + 12 * t;     // bottom pile height
    const art =
      "<circle cx='64' cy='64' r='26' fill='url(#" + gh + ")' opacity='" + (0.5 + PULSE[f] * 0.4) + "'/>"
      // glass silhouette
      + "<path d='M44 34 C44 50 58 56 58 64 C58 72 44 78 44 94 L84 94 C84 78 70 72 70 64 C70 56 84 50 84 34 Z' fill='url(#" + g2 + ")'/>"
      // top sand (a mound draining into the neck) + bottom pile + stream
      + "<path d='M64 62 L" + (64 - Math.min(6 + topH * 1.35, 17)).toFixed(1) + ' ' + (62 - topH).toFixed(1)
      + ' Q 64 ' + (58 - topH).toFixed(1) + ' ' + (64 + Math.min(6 + topH * 1.35, 17)).toFixed(1) + ' ' + (62 - topH).toFixed(1) + " Z' fill='#5fd63a'/>"
      + "<path d='M" + (64 - 10 - botH * 0.9) + " 91 Q 64 " + (90 - botH * 2) + ' ' + (64 + 10 + botH * 0.9) + " 91 Z' fill='#5fd63a'/>"
      + "<path d='M" + (64 - 10 - botH * 0.9) + " 91 Q 64 " + (90 - botH * 2) + ' ' + (64 + 10 + botH * 0.9) + " 91 Z' fill='" + GREEN + "' opacity='.55' filter='url(#fglow)'/>"
      + "<line x1='64' y1='62' x2='64' y2='90' stroke='" + GREEN + "' stroke-width='2.4' stroke-dasharray='3 2.6' stroke-dashoffset='" + (-f * 2.8) + "' opacity='.95'/>"
      // glass edge light + specular
      + "<path d='M44 34 C44 50 58 56 58 64 C58 72 44 78 44 94 M84 34 C84 50 70 56 70 64 C70 72 84 78 84 94' fill='none' stroke='#b7a8d8' stroke-width='2' opacity='.8'/>"
      + "<path d='M49 40 C49 50 56 54 57 60' stroke='#fff' stroke-width='3' fill='none' stroke-linecap='round' opacity='.55' filter='url(#fsoft)'/>"
      // bone frame: caps + twisted posts
      + "<path d='" + rr(38, 26, 52, 9, 4.5) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(38, 93, 52, 9, 4.5) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(38, 26, 52, 4, 2) + "' fill='#fff' opacity='.4'/>"
      + "<path d='M40 35 q-4 29 0 58 M88 35 q4 29 0 58' stroke='url(#" + g1 + ")' stroke-width='6' fill='none' stroke-linecap='round'/>"
      + "<circle cx='64' cy='30.5' r='2.4' fill='" + acc + "'/><circle cx='63.3' cy='29.8' r='.8' fill='#fff' opacity='.9'/>";
    return { defs, art, shadowRx: 36 };
  };

  // Paint — a dark witch palette with glowing potion splats; bubbles rise.
  ART.paint = (a, f) => {
    const acc = jewel(a);
    const g1 = grad(), g2 = grad(), sh = grad();
    const defs = leatherGrad(g1) + waxGrad(g2) + sheenGrad(sh);
    const well = (x, y, c, glow) => "<circle cx='" + x + "' cy='" + y + "' r='7.2' fill='" + INK + "'/>"
      + "<circle cx='" + x + "' cy='" + (y - 0.8) + "' r='6.2' fill='" + c + "'/>"
      + (glow ? "<circle cx='" + x + "' cy='" + (y - 0.8) + "' r='6.2' fill='" + c + "' opacity='.6' filter='url(#fglow)'/>" : '')
      + "<ellipse cx='" + (x - 2) + "' cy='" + (y - 3.2) + "' rx='2' ry='1.3' fill='#fff' opacity='.7'/>";
    // a bubble rises from the green well and pops
    const bt = f / FR;
    const bub = bt < 0.999 ? "<circle cx='" + (47 + Math.sin(bt * 9) * 2.5) + "' cy='" + (52 - bt * 26) + "' r='" + (1.8 + bt * 1.6) + "' fill='none' stroke='" + GREEN + "' stroke-width='1.6' opacity='" + (0.95 - bt * 0.4).toFixed(2) + "'/>" : '';
    const art =
      "<path d='M66 36 c-27 0 -42 14 -42 30 c0 16 15 27 35 27 c8 0 8 -7 4 -11 c-4 -4 -1 -10 6 -10 c8 0 23 2 31 -6 c6 -6 2 -30 -34 -30 z' fill='#1b0d2e'/>"
      + "<path d='M64 34 c-27 0 -42 14 -42 30 c0 16 15 27 35 27 c8 0 8 -7 4 -11 c-4 -4 -1 -10 6 -10 c8 0 23 2 31 -6 c6 -6 2 -30 -34 -30 z' fill='url(#" + g1 + ")'/>"
      + "<path d='M64 34 c-27 0 -42 14 -42 30 l84 0 c2 -22 -14 -30 -42 -30 z' fill='url(#" + sh + ")' opacity='.6'/>"
      + well(47, 54, GREEN, true) + well(66, 47, EMBER, true) + well(85, 55, acc, true) + well(43, 72, '#c99df2', false)
      + bub
      // witch's brush: gnarled wood handle, silver ferrule, potion-dipped tip
      + "<g transform='translate(88," + (34 + Math.abs(Math.sin((f / FR) * Math.PI * 2)) * 5) + ") rotate(35)'>"
      + "<path d='M-3.5 -2 Q-5 10 -3 24 L3 24 Q5 10 3.5 -2 Z' fill='url(#" + g2 + ")'/>"
      + "<rect x='-4.5' y='-10' width='9' height='9' rx='1.5' fill='#8f87ab'/><rect x='-4.5' y='-10' width='9' height='3.4' rx='1.5' fill='#d8d2ea'/>"
      + "<path d='M-4.5 -10 q4.5 -13 9 0 z' fill='" + GREEN + "'/>"
      + "<path d='M-4.5 -10 q4.5 -13 9 0 z' fill='" + GREEN + "' opacity='.55' filter='url(#fglow)'/>"
      + "<path d='M-1.5 -16 q1.5 3 3 6' stroke='#d6ffbe' stroke-width='1.4' fill='none' opacity='.9'/></g>";
    return { defs, art, shadowRx: 40 };
  };

  // Stopwatch/Timer alt — (timer is the hourglass; this key never collides)

  // Fortune — a moon-pale cookie; the prophecy slip slides from the fold.
  ART.fortune = (a, f) => {
    const acc = jewel(a);
    const g1 = grad(), g2 = grad(), g3 = grad();
    const slide = [0, 3, 6, 7, 5, 2][f];
    const defs = lg(g1, [[0, '#f9eecb'], [0.45, '#e6cd96'], [1, '#a37f49']])
      + lg(g2, [[0, '#b5915a'], [1, '#6e5228']])
      + parchGrad(g3);
    const art =
      // the prophecy slip, sliding out of the pinch toward the lower right
      "<g transform='translate(" + slide + ',' + (slide * 0.5) + ") rotate(30 70 82)'>"
      + "<path d='" + rr(67, 77, 32, 14, 2.5) + "' fill='#cbbc98'/>"
      + "<path d='" + rr(66, 76, 32, 14, 2.5) + "' fill='url(#" + g3 + ")'/>"
      + "<path d='M71 81 h13 M71 85.5 h9' stroke='#8f7f5c' stroke-width='1.8' stroke-linecap='round'/>"
      + rune(91, 83, 0.42, mixc(acc, '#8f5cff', 0.3), 4, 3.4) + '</g>'
      // the cookie: a toasted folded crescent, pinched at the center bottom
      + "<path d='M22 74 A 42 30 0 0 1 106 74 Q 106 80 100 79 Q 84 71.5 76 78 Q 70 88 64 88 Q 58 88 52 78 Q 44 71.5 28 79 Q 22 80 22 74 Z' fill='url(#" + g1 + ")'/>"
      // the fold: deep toasted crease with a shadowed inner cavity
      + "<path d='M52 78 Q 58 87 64 87 Q 70 87 76 78 L 76 74.5 Q 70 82 64 82 Q 58 82 52 74.5 Z' fill='#7d5c2e' opacity='.6'/>"
      + "<path d='M28 78 Q 44 71 52 77 Q 58 87.5 64 87.5 Q 70 87.5 76 77 Q 84 71 100 78' fill='none' stroke='url(#" + g2 + ")' stroke-width='3.4' stroke-linecap='round' opacity='.9'/>"
      // moon-pale bloom + soft speculars
      + "<ellipse cx='45' cy='52' rx='13' ry='7' fill='#fff' opacity='.55' filter='url(#fsoft)' transform='rotate(-14 45 52)'/>"
      + "<ellipse cx='87' cy='56' rx='7' ry='4' fill='#fff' opacity='.3' filter='url(#fsoft)'/>"
      + "<path d='M64 47 Q 61 62 64 80' stroke='#a37f49' stroke-width='2.2' fill='none' opacity='.5'/>"
      // two motes of witch-light drifting off the fold
      + "<circle cx='" + (58 + f * 1.5) + "' cy='" + (44 - f * 3) + "' r='1.6' fill='" + GREEN + "' opacity='" + PULSE[f] + "'/>"
      + "<circle cx='" + (76 - f) + "' cy='" + (40 - f * 2) + "' r='1.2' fill='" + GREEN + "' opacity='" + PULSE[(f + 3) % 6] + "'/>";
    return { defs, art, shadowRx: 44 };
  };

  // Guestbook — an open grimoire, a warm heart beating above the pages.
  ART.guestbook = (a, f) => {
    const g1 = grad(), g2 = grad(), g3 = grad(), gh = grad();
    const hs = (f % 3 === 0) ? 1.18 : 1;
    const defs = leatherGrad(g1) + parchGrad(g2)
      + lg(g3, [[0, '#ffb46b'], [0.5, EMBER], [1, '#c95a14']])
      + haloGrad(gh, EMBER);
    const art =
      // leather covers peeking under the pages
      "<path d='M20 48 Q42 36 64 48 L64 100 Q42 88 20 100 Z' fill='url(#" + g1 + ")' transform='translate(-2,2)'/>"
      + "<path d='M108 48 Q86 36 64 48 L64 100 Q86 88 108 100 Z' fill='url(#" + g1 + ")' transform='translate(2,2)'/>"
      + "<path d='M24 46 Q44 34 64 46 L64 96 Q44 84 24 96 Z' fill='url(#" + g2 + ")'/>"
      + "<path d='M104 46 Q84 34 64 46 L64 96 Q84 84 104 96 Z' fill='url(#" + g2 + ")'/>"
      + "<path d='M64 46 V96' stroke='#a8946a' stroke-width='2.5'/>"
      // inked names + a small signature rune
      + "<path d='M32 56 q6 -3 12 0 M32 64 h16 M32 72 h12' stroke='#8f7f5c' stroke-width='2.4' stroke-linecap='round' fill='none'/>"
      + "<path d='M74 56 h18 M74 64 h14 M74 72 h16' stroke='#8f7f5c' stroke-width='2.4' stroke-linecap='round'/>"
      + rune(94, 84, 0.5, '#7d6a45', 1, 3)
      // the visiting heart: ember-warm, beating, haloed
      + "<g transform='translate(64,34)'>"
      + "<circle r='" + (13 * (0.8 + PULSE[f] * 0.35)).toFixed(1) + "' fill='url(#" + gh + ")'/>"
      + "<g transform='scale(" + (hs * 1.35).toFixed(2) + ")'>"
      + "<path d='M0 10 C -12 2 -11 -8 -4.5 -8 C -1.8 -8 -0.4 -6 0 -4.4 C 0.4 -6 1.8 -8 4.5 -8 C 11 -8 12 2 0 10 Z' fill='url(#" + g3 + ")'/>"
      + "<ellipse cx='-4' cy='-4' rx='2.6' ry='1.8' fill='#fff' opacity='.85'/></g></g>";
    return { defs, art, shadowRx: 46 };
  };

  // Chat — a parchment bubble whispering, a ghost-mist bubble answering.
  ART.chat = (a, f) => {
    const acc = jewel(a);
    const g1 = grad(), g2 = grad(), sh = grad();
    const defs = parchGrad(g1) + lg(g2, [[0, shade(acc, 40)], [0.5, acc], [1, shade(acc, -60)]]) + sheenGrad(sh);
    const dots = [50, 64, 78].map((x, i) =>
      "<circle cx='" + x + "' cy='55' r='4.5' fill='" + ((f % 3) === i ? GREEN : '#b5a67f') + "'/>"
      + ((f % 3) === i ? "<circle cx='" + x + "' cy='55' r='5.5' fill='" + GREEN + "' opacity='.5' filter='url(#fglow)'/>" : '')).join('');
    const art =
      "<path d='M30 31 h68 a12 12 0 0 1 12 12 v22 a12 12 0 0 1 -12 12 h-44 l-14 14 v-14 h-10 a12 12 0 0 1 -12 -12 v-22 a12 12 0 0 1 12 -12 z' fill='#8f7f5c' transform='translate(2,3)'/>"
      + "<path d='M30 29 h68 a12 12 0 0 1 12 12 v22 a12 12 0 0 1 -12 12 h-44 l-14 14 v-14 h-10 a12 12 0 0 1 -12 -12 v-22 a12 12 0 0 1 12 -12 z' fill='url(#" + g1 + ")'/>"
      + "<path d='M36 34 h56 M36 40 h10' stroke='#cbbc98' stroke-width='2' stroke-linecap='round' opacity='.7'/>"
      + dots
      + "<path d='M30 29 h68 a12 12 0 0 1 12 12 v5 h-92 v-5 a12 12 0 0 1 12 -12 z' fill='url(#" + sh + ")'/>"
      // answering bubble drifts up like a spirit, trailing mist
      + "<g transform='translate(0," + (-BOB[f] * 1.4) + ")'>"
      + "<path d='" + rr(76, 74, 32, 20, 10) + "' fill='url(#" + g2 + ")'/>"
      + "<circle cx='86' cy='84' r='2' fill='#fff'/><circle cx='93' cy='84' r='2' fill='#fff'/><circle cx='100' cy='84' r='2' fill='#fff'/>"
      + "<path d='" + rr(76, 74, 32, 9, 4.5) + "' fill='#fff' opacity='.35'/></g>";
    return { defs, art, shadowRx: 44 };
  };

  // Folder — a tattered purple folder held shut by a little bat clasp.
  ART.folder = (a, f) => {
    const acc = jewel(a);
    const g1 = grad(), g2 = grad(), g3 = grad(), sh = grad();
    const defs = lg(g1, [[0, '#3d2058'], [0.5, '#2f1747'], [1, '#1e0d33']])
      + lg(g2, [[0, '#6a4590'], [0.45, PMID], [1, '#31184c']])
      + parchGrad(g3) + sheenGrad(sh);
    const lift = [0, 1.5, 3, 3.5, 2.5, 1][f];
    const art =
      // back panel with tab
      "<path d='M20 38 a8 8 0 0 1 8 -8 h20 a8 8 0 0 1 6.4 3.2 l4.8 6.4 h41 a8 8 0 0 1 8 8 v40 a10 10 0 0 1 -10 10 h-68 a10 10 0 0 1 -10 -10 z' fill='url(#" + g1 + ")'/>"
      // a spell page peeking out
      + "<g transform='translate(0," + (-lift) + ")'>"
      + "<path d='M34 34 h58 v26 l-5 3 -7 -3 -8 3 -8 -3 -8 3 -8 -3 -7 3 -7 -3 z' fill='url(#" + g3 + ")'/>"
      + "<path d='M42 42 h36' stroke='#b5a67f' stroke-width='2.6' stroke-linecap='round'/>"
      + rune(46, 52, 0.55, mixc(GREEN, '#7d6a45', 0.35), 2, 3) + rune(58, 52, 0.55, mixc(GREEN, '#7d6a45', 0.35), 0, 3) + '</g>'
      // tattered front panel: nibbled top-right corner + stitches
      + "<path d='M18 56 a8 8 0 0 1 8 -8 h50 l4 3 5 -3 5 3.5 5 -3.5 h7 a8 8 0 0 1 8 8 l-2 32 a10 10 0 0 1 -10 9.8 h-16 l-5 -3 -6 3 h-41 a10 10 0 0 1 -10 -9.8 z' fill='url(#" + g2 + ")'/>"
      + "<path d='M18 56 a8 8 0 0 1 8 -8 h50 l4 3 5 -3 5 3.5 5 -3.5 h7 a8 8 0 0 1 8 8 l-.5 9 h-91.9 z' fill='url(#" + sh + ")'/>"
      + "<path d='M88 92 l4 -4 m3 -2 l4 -4' stroke='#8a6fb0' stroke-width='2' stroke-linecap='round' opacity='.8'/>"
      + "<path d='M24 52 l3 3 m4 -4 l3 3' stroke='#1e0d33' stroke-width='2' stroke-linecap='round' opacity='.6'/>"
      // the bone bat clasp, flapping happily against the purple leather
      + "<ellipse cx='64' cy='76' rx='11' ry='3' fill='#1e0d33' opacity='.6' filter='url(#fsoft)'/>"
      + bat(64, 73, 2, f % 2 === 0, '#e8ddc2', '#2a1640')
      + "<path d='M61 78.5 q3 2 6 0' stroke='#2a1640' stroke-width='1.2' fill='none' stroke-linecap='round' transform='translate(0,-6)'/>"
      + spec(34, 54, 10, 3, 0.28);
    return { defs, art, shadowRx: 42 };
  };

  // Chest — a cursed chest; green eyes peek and blink from the dark crack.
  ART.chest = (a, f) => {
    const acc = jewel(a);
    const g1 = grad(), g2 = grad(), g3 = grad(), gh = grad(), sh = grad();
    const defs = lg(g1, [[0, '#6a4590'], [0.5, '#4a2a6a'], [1, '#2a1640']])
      + lg(g2, [[0, '#55346f'], [0.5, '#3b2052'], [1, '#241233']])
      + lg(g3, [[0, '#e8ddc2'], [0.5, '#b5a67f'], [1, '#7d6a45']])
      + haloGrad(gh, GREEN) + sheenGrad(sh);
    // blink: eyes open except a snap-blink on frame 3
    const blink = f === 3 ? 0.15 : 1;
    const gap = 10; // the creak
    const eye = (x) => "<g transform='translate(" + x + ",52.5) scale(1," + blink + ")'>"
      + "<circle r='4' fill='" + GREEN + "'/><circle r='1.7' cy='.3' fill='#0d2410'/><circle r='.9' cx='-1.3' cy='-1.3' fill='#e9ffdc'/></g>";
    const art =
      // green light leaking through the crack
      "<ellipse cx='64' cy='54' rx='32' ry='11' fill='url(#" + gh + ")' opacity='" + (0.6 + PULSE[f] * 0.4) + "'/>"
      // lid, creaked open
      + "<g transform='translate(64," + (50 - gap) + ") rotate(-5)'>"
      + "<path d='M-36 6 v-6 q0 -17 36 -17 q36 0 36 17 v6 z' fill='url(#" + g1 + ")'/>"
      + "<path d='M-36 0 q0 -14 36 -14 q36 0 36 14' fill='none' stroke='#8a6fb0' stroke-width='3' opacity='.6'/>"
      + "<path d='M-36 5 h72' stroke='url(#" + g3 + ")' stroke-width='2.6' opacity='.9'/>"
      + "<path d='" + rr(-7, -5, 14, 11, 3) + "' fill='url(#" + g3 + ")'/></g>"
      // the dark crack + the light and the eyes inside
      + "<path d='M30 " + (58 - gap) + " Q64 " + (50 - gap) + " 98 " + (58 - gap) + " L98 60 Q64 54 30 60 Z' fill='" + INK + "'/>"
      + "<path d='M36 " + (58.5 - gap * 0.6) + " Q64 " + (52 - gap * 0.6) + " 92 " + (58.5 - gap * 0.6) + "' stroke='" + GREEN + "' stroke-width='2.2' fill='none' opacity='" + (0.3 + PULSE[f] * 0.3).toFixed(2) + "' filter='url(#fglow)'/>"
      + eye(52) + eye(76)
      // base
      + "<path d='" + rr(30, 58, 68, 36, 8) + "' fill='url(#" + g2 + ")'/>"
      + "<path d='M40 58 v36 M88 58 v36' stroke='url(#" + g3 + ")' stroke-width='4' opacity='.85'/>"
      + "<path d='M30 74 h68' stroke='#1e0d33' stroke-width='2.5' opacity='.6'/>"
      // hasp with a cursed accent gem — kept below the crack so the eyes own it
      + "<path d='" + rr(57, 61, 14, 13, 3.5) + "' fill='url(#" + g3 + ")'/>"
      + "<circle cx='64' cy='66' r='2.8' fill='" + acc + "'/><circle cx='63.2' cy='65.2' r='.9' fill='#fff' opacity='.9'/>"
      + "<path d='M64 69 v3.5' stroke='#5c4d2e' stroke-width='2.4' stroke-linecap='round'/>"
      + "<path d='" + rr(30, 58, 68, 10, 6) + "' fill='url(#" + sh + ")' opacity='.6'/>";
    return { defs, art, shadowRx: 42 };
  };

  // Video — THE HERO: a crystal-ball camera. A seeing orb on clawed bronze
  // feet; mist swirls inside, the glowing iris looks around, an ember REC
  // pip blinks on the brass cap.
  ART.video = (a, f) => {
    const acc = jewel(a);
    const g1 = grad(), g2 = grad(), g3 = grad(), gh = grad(), gm = grad();
    const defs = rg(g1, [[0, '#5b3f86'], [0.5, '#33204f'], [0.8, '#1f1235'], [1, '#140a24']], 0.36, 0.3)
      + lg(g2, [[0, '#e8ddc2'], [0.5, '#b5a67f'], [1, '#6b5a38']])
      + rg(g3, [[0, '#eaffdc'], [0.4, GREEN], [0.75, '#3f8f26'], [1, '#1c4d10']], 0.4, 0.35)
      + haloGrad(gh, GREEN)
      + rg(gm, [[0, '#c9b7ec', 0.8], [0.6, '#8a6fb0', 0.4], [1, '#4a2a6a', 0]]);
    // gaze wanders: iris offset per frame
    const gx = [0, 4, 6, 2, -4, -6][f], gy = [0, -2, 1, 3, 1, -2][f];
    const talon = (x, y, s, flip) => "<g transform='translate(" + x + ',' + y + ") scale(" + (flip ? -s : s) + ',' + s + ")'>"
      + "<path d='M-3 -8 Q5 -6 6 2 Q6.5 8.5 2 10 Q0 10.5 -0.5 9 Q3 5 0 -1 Q-2 -5 -5 -6 Q-5.5 -8.5 -3 -8 Z' fill='url(#" + g2 + ")'/>"
      + "<path d='M-2 -6.5 Q3.5 -4.5 4.5 2' stroke='#fdf7e8' stroke-width='1.3' fill='none' stroke-linecap='round' opacity='.6'/></g>";
    const art =
      // halo behind the orb
      "<circle cx='64' cy='58' r='40' fill='url(#" + gh + ")' opacity='" + (0.35 + PULSE[f] * 0.3) + "'/>"
      // three bronze talons gripping the orb + cradle ring
      + talon(44, 84, 1.1, true) + talon(84, 84, 1.1, false) + talon(64, 88, 1.25, false)
      + "<path d='M36 82 a29 13 0 0 0 56 0' fill='none' stroke='url(#" + g2 + ")' stroke-width='7' stroke-linecap='round'/>"
      // the orb
      + "<circle cx='64' cy='58' r='31' fill='url(#" + g1 + ")'/>"
      // mist swirling inside (two arcs orbiting)
      + "<g transform='rotate(" + (f * 60) + " 64 58)'>"
      + "<path d='M45 62 Q52 48 68 50' stroke='url(#" + gm + ")' stroke-width='6' fill='none' stroke-linecap='round' opacity='.75'/>"
      + "<path d='M82 60 Q76 72 62 70' stroke='url(#" + gm + ")' stroke-width='4.5' fill='none' stroke-linecap='round' opacity='.55'/></g>"
      // the seeing iris: lens ring + glowing eye that looks around
      + "<circle cx='" + (64 + gx) + "' cy='" + (58 + gy) + "' r='14.5' fill='#0d2410'/>"
      + "<circle cx='" + (64 + gx) + "' cy='" + (58 + gy) + "' r='12.5' fill='url(#" + g3 + ")'/>"
      + "<circle cx='" + (64 + gx) + "' cy='" + (58 + gy) + "' r='12.5' fill='" + GREEN + "' opacity='.4' filter='url(#fglow)'/>"
      + "<ellipse cx='" + (64 + gx) + "' cy='" + (58 + gy) + "' rx='3.4' ry='7.5' fill='" + INK + "'/>"
      + "<circle cx='" + (61.5 + gx) + "' cy='" + (52.5 + gy) + "' r='2.2' fill='#fff' opacity='.95'/>"
      // glass speculars over everything inside
      + "<ellipse cx='50' cy='40' rx='11' ry='7' fill='#fff' opacity='.5' filter='url(#fsoft)' transform='rotate(-24 50 40)'/>"
      + "<path d='M84 72 a26 26 0 0 0 6 -16' stroke='#c9b7ec' stroke-width='2.5' fill='none' stroke-linecap='round' opacity='.7'/>"
      // brass cap + blinking ember REC pip mounted on it
      + "<path d='" + rr(48, 21, 32, 10, 4) + "' fill='url(#" + g2 + ")'/>"
      + "<path d='" + rr(48, 21, 32, 4, 2) + "' fill='#fdf7e8' opacity='.5'/>"
      + "<path d='" + rr(56, 13, 16, 9, 3.5) + "' fill='url(#" + g2 + ")'/>"
      + "<circle cx='75' cy='17.5' r='3.2' fill='" + (f % 2 ? EMBER : '#a34a10') + "'/>"
      + (f % 2 ? "<circle cx='75' cy='17.5' r='4.4' fill='" + EMBER + "' opacity='.6' filter='url(#fglow)'/>" : '')
      + "<circle cx='60' cy='17.5' r='2' fill='" + acc + "'/><circle cx='59.4' cy='16.9' r='.7' fill='#fff' opacity='.9'/>";
    return { defs, art, shadowRx: 42 };
  };

  // Imposter — three lil' ghosts in a séance line; one hides jack-o-eyes.
  ART.imposter = (a, f) => {
    const acc = jewel(a);
    const g1 = grad(), g2 = grad(), gh = grad();
    const defs = lg(g1, [[0, '#ffffff'], [0.55, '#efe9f6'], [1, '#b9aed0']])
      + lg(g2, [[0, '#ffb46b'], [0.5, EMBER], [1, '#b34f10']])
      + haloGrad(gh, EMBER);
    const px = [-2.5, 0, 2.5, 0, -2.5, 0][f];
    const ghost = (x, y, s, fill, face) => "<g transform='translate(" + x + ',' + y + ") scale(" + s + ")'>"
      + "<path d='M0 -18 C-11 -18 -15 -9 -15 0 V13 q3.75 5.5 7.5 0 q3.75 -5.5 7.5 0 q3.75 5.5 7.5 0 q3.75 -5.5 7.5 0 V0 C15 -9 11 -18 0 -18 Z' fill='" + fill + "'/>"
      + face + '</g>';
    const dotFace = "<circle cx='-4.5' cy='-4' r='2.2' fill='" + INK + "'/><circle cx='4.5' cy='-4' r='2.2' fill='" + INK + "'/><path d='M-3 2 q3 2.5 6 0' stroke='" + INK + "' stroke-width='2' fill='none' stroke-linecap='round'/>";
    const susFace = "<g transform='translate(" + px + ",0)'>"
      + "<path d='M-8 -6 L-2 -3.5 L-8 -1 Z' fill='" + EMBER + "'/><path d='M8 -6 L2 -3.5 L8 -1 Z' fill='" + EMBER + "'/>"
      + "<path d='M-8 -6 L-2 -3.5 L-8 -1 Z M8 -6 L2 -3.5 L8 -1 Z' fill='" + EMBER + "' opacity='.6' filter='url(#fglow)'/>"
      + "<path d='M-4 3.5 l2.5 -2 2.5 2 2.5 -2 2.5 2' stroke='" + EMBER + "' stroke-width='1.8' fill='none' stroke-linecap='round'/></g>";
    const art =
      "<ellipse cx='64' cy='58' rx='26' ry='22' fill='url(#" + gh + ")' opacity='" + (0.4 + PULSE[f] * 0.3).toFixed(2) + "'/>"
      + ghost(34, 66 + Math.sin(f) * 1.5, 0.92, "url(#" + g1 + ")", dotFace)
      + ghost(94, 66 - Math.sin(f) * 1.5, 0.92, "url(#" + g1 + ")", dotFace)
      + ghost(64, 60, 1.22, "url(#" + g1 + ")", susFace)
      + "<ellipse cx='58' cy='44' rx='5' ry='3' fill='#fff' opacity='.85'/>"
      + "<text x='92' y='34' font-family='system-ui' font-size='19' font-weight='800' fill='" + acc + "' opacity='" + PULSE[f] + "'>?</text>";
    return { defs, art, shadowRx: 46 };
  };

  // Spy — a bone-handled magnifier sweeps the dark; hidden runes ignite.
  ART.spy = (a, f) => {
    const acc = jewel(a);
    const g1 = grad(), g2 = grad(), g3 = grad();
    const mx = [-12, -5, 3, 10, 4, -4][f];
    const defs = leatherGrad(g1)
      + rg(g2, [[0, '#d9ffc4', 0.85], [0.6, '#9fe87a', 0.55], [1, '#4d8f33', 0.35]], 0.35, 0.3)
      + waxGrad(g3);
    // secret runes across the scroll; the one under the lens ignites, magnified
    const rx = [40, 63, 86], lens = 62 + mx;
    const runes = rx.map((x, i) => {
      const lit = Math.abs(x - lens) < 14;
      return lit
        ? "<circle cx='" + x + "' cy='60' r='10' fill='" + GREEN + "' opacity='.35' filter='url(#fglow)'/>" + rune(x, 60, 1.5, GREEN, i + 1, 2.8)
        : rune(x, 60, 1, '#584573', i + 1, 3);
    }).join('');
    const art =
      // an old spell-scroll, curled at both ends
      "<path d='M20 36 q-5 24 0 48 l6 2 q-4 -26 0 -52 z' fill='#3b2052'/>"
      + "<path d='M108 36 q5 24 0 48 l-6 2 q4 -26 0 -52 z' fill='#3b2052'/>"
      + "<path d='M26 34 l76 0 q4.5 25 0 52 l-76 1 q4.5 -27 0 -53 z' fill='#1e0d33'/>"
      + "<path d='M27.5 36 l73 0 q4 24 0 49 l-73 1 q4 -26 0 -50 z' fill='url(#" + g1 + ")'/>"
      + "<path d='M32 43 h62 M32 76 h62' stroke='#1e0d33' stroke-width='2.2' opacity='.6'/>"
      + runes
      // the magnifier: green glass, bone rim, twisted bone handle
      + "<g transform='translate(" + lens + ",60)'>"
      + "<circle r='19' fill='url(#" + g2 + ")'/>"
      + "<circle r='19' fill='none' stroke='url(#" + g3 + ")' stroke-width='6'/>"
      + "<circle r='19' fill='none' stroke='#8f7f5c' stroke-width='1.4'/>"
      + "<path d='M14 14 l13 13' stroke='#8f7f5c' stroke-width='10' stroke-linecap='round'/>"
      + "<path d='M14 14 l13 13' stroke='url(#" + g3 + ")' stroke-width='6.5' stroke-linecap='round'/>"
      + "<path d='M17 20 l3.4 -3.4 M21.5 24.5 l3.4 -3.4' stroke='#c9b78f' stroke-width='1.5' stroke-linecap='round'/>"
      + "<circle cx='28.5' cy='28.5' r='3.8' fill='" + acc + "'/><circle cx='27.4' cy='27.4' r='1.2' fill='#fff' opacity='.9'/>"
      + "<path d='M-11 -9 a14 14 0 0 1 10 -6' stroke='#fff' stroke-width='3.2' fill='none' stroke-linecap='round' opacity='.85'/></g>";
    return { defs, art, shadowRx: 44 };
  };

  // Tilt — an obsidian phone rocks; a witch-light orb rolls through its maze.
  ART.tilt = (a, f) => {
    const acc = jewel(a);
    const g1 = grad(), g2 = grad(), sh = grad();
    const rot = [-12, -4, 6, 12, 4, -6][f];
    const bx = [-8, -4, 2, 7, 3, -3][f]; // the orb rolls opposite the tilt
    const defs = lg(g1, [[0, '#55346f'], [0.5, '#3b2052'], [1, '#241233']])
      + lg(g2, [[0, '#1c0f30'], [0.5, '#150a26'], [1, '#0f0620']]) + sheenGrad(sh);
    const art =
      "<g transform='rotate(" + rot + " 64 90)'>"
      + "<path d='" + rr(42, 26, 44, 68, 10) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(42, 26, 44, 68, 10) + "' fill='none' stroke='" + acc + "' stroke-width='1.6' opacity='.5'/>"
      + "<path d='" + rr(46, 32, 36, 52, 5) + "' fill='url(#" + g2 + ")'/>"
      // glowing maze walls
      + "<path d='M50 40 h20 M78 40 v14 h-12 M50 50 h12 v14 M50 74 h22 M78 64 v14' stroke='" + mixc(GREEN, NIGHT, 0.35) + "' stroke-width='3.4' fill='none' stroke-linecap='round'/>"
      // the rolling witch-light
      + "<circle cx='" + (64 + bx) + "' cy='68' r='4.6' fill='" + GREEN + "'/>"
      + "<circle cx='" + (64 + bx) + "' cy='68' r='7' fill='" + GREEN + "' opacity='.55' filter='url(#fglow)'/>"
      + "<circle cx='" + (62.8 + bx) + "' cy='66.6' r='1.4' fill='#eaffdc'/>"
      + "<circle cx='64' cy='89' r='2.4' fill='#8a6fb0' opacity='.8'/>"
      + "<path d='" + rr(42, 26, 44, 18, 10) + "' fill='url(#" + sh + ")' opacity='.7'/></g>"
      // motion wisps
      + "<path d='M28 66 q-6 -10 1 -20 M100 66 q6 -10 -1 -20' stroke='#8a6fb0' stroke-width='3.6' fill='none' stroke-linecap='round' opacity='" + (0.4 + PULSE[f] * 0.4).toFixed(2) + "'/>";
    return { defs, art, shadowRx: 30 };
  };

  // Dial — a doom gauge carved in stone; a bone needle hunts the arc.
  ART.dial = (a, f) => {
    const acc = jewel(a);
    const g1 = grad(), g2 = grad(), sh = grad();
    const ang = [-56, -24, 12, 42, 12, -24][f];
    const defs = stoneGrad(g1) + waxGrad(g2) + sheenGrad(sh);
    const arc = (a1, a2, color) => {
      const r = 30, cx = 64, cy = 80;
      const p1 = [cx + Math.sin(a1 * Math.PI / 180) * r, cy - Math.cos(a1 * Math.PI / 180) * r];
      const p2 = [cx + Math.sin(a2 * Math.PI / 180) * r, cy - Math.cos(a2 * Math.PI / 180) * r];
      return "<path d='M" + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + ' A' + r + ' ' + r + ' 0 0 1 ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1) + "' stroke='" + color + "' stroke-width='8' fill='none' stroke-linecap='round'/>"
        + "<path d='M" + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + ' A' + r + ' ' + r + ' 0 0 1 ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1) + "' stroke='" + color + "' stroke-width='10' fill='none' stroke-linecap='round' opacity='.4' filter='url(#fglow)'/>";
    };
    const art =
      // stone half-round slab
      "<path d='M22 88 a42 42 0 0 1 84 0 l-5 9 h-74 z' fill='#1b0d2e' transform='translate(2,3)'/>"
      + "<path d='M22 86 a42 42 0 0 1 84 0 l-5 9 h-74 z' fill='url(#" + g1 + ")'/>"
      + "<path d='M26 66 a42 42 0 0 1 76 12' fill='none' stroke='#8a6fb0' stroke-width='1.6' opacity='.5'/>"
      + arc(-62, -22, GREEN) + arc(-16, 16, EMBER) + arc(22, 62, '#ff4d4d')
      + rune(38, 88, 0.55, '#9d86c2', 0, 3) + rune(90, 88, 0.55, '#9d86c2', 4, 3)
      // bone needle
      + "<g transform='rotate(" + ang + " 64 80)'>"
      + "<path d='M61.5 80 L64 50 L66.5 80 Z' fill='url(#" + g2 + ")'/>"
      + "<path d='M63 76 L64 54' stroke='#fff' stroke-width='1.2' opacity='.6'/></g>"
      + "<circle cx='64' cy='80' r='6.5' fill='url(#" + g2 + ")'/><circle cx='64' cy='80' r='2.6' fill='" + acc + "'/><circle cx='62.8' cy='78.8' r='.9' fill='#fff' opacity='.9'/>"
      + "<path d='M22 86 a42 42 0 0 1 84 0 l-1 2 h-82 z' fill='url(#" + sh + ")' opacity='.4'/>";
    return { defs, art, shadowRx: 44 };
  };

  // Roulette — a fan of tarot cards; the moon card pops, daring you.
  ART.roulette = (a, f) => {
    const acc = jewel(a);
    const g1 = grad(), g2 = grad(), g3 = grad(), sh = grad();
    const pop = [0, -3, -6, -7, -5, -2][f];
    const defs = parchGrad(g1) + leatherGrad(g2)
      + rg(g3, [[0, '#fdf8ec'], [0.6, '#e8ddc2'], [1, '#b5a67f']], 0.4, 0.35) + sheenGrad(sh);
    const back = (tr) => "<g transform='" + tr + "'><path d='" + rr(0, 0, 40, 54, 7) + "' fill='url(#" + g2 + ")'/>"
      + "<path d='" + rr(3.5, 3.5, 33, 47, 5) + "' fill='none' stroke='#8a6fb0' stroke-width='1.6' opacity='.7'/>"
      + rune(20, 27, 0.8, '#8a6fb0', 3, 2.6) + '</g>';
    const art =
      back("rotate(-12 50 72) translate(28 44)")
      + back("rotate(9 78 72) translate(58 42)")
      // the top card: parchment face, moon + stars, accent border
      + "<g transform='translate(0," + pop + ")'>"
      + "<path d='" + rr(43, 32, 42, 58, 8) + "' fill='#8f7f5c' transform='translate(1.5,2.5)'/>"
      + "<path d='" + rr(43, 32, 42, 58, 8) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(46.5, 35.5, 35, 51, 5.5) + "' fill='none' stroke='" + acc + "' stroke-width='1.8' opacity='.85'/>"
      // moon with a sleepy face
      + "<circle cx='64' cy='56' r='11' fill='url(#" + g3 + ")'/>"
      + "<circle cx='64' cy='56' r='13.5' fill='#e8ddc2' opacity='.4' filter='url(#fglow)'/>"
      + "<path d='M60 55 q1.5 1.5 3 0 M67 55 q1.5 1.5 3 0' stroke='#7d6a45' stroke-width='1.6' fill='none' stroke-linecap='round'/>"
      + "<path d='M62.5 60.5 q2 1.8 4 0' stroke='#7d6a45' stroke-width='1.4' fill='none' stroke-linecap='round'/>"
      + "<path d='M53 75 l1.4 2.9 3.2 .5 -2.3 2.2 .5 3.2 -2.8 -1.5 -2.8 1.5 .5 -3.2 -2.3 -2.2 3.2 -.5 z' fill='" + EMBER + "'/>"
      + "<circle cx='76' cy='79' r='1.8' fill='" + GREEN + "' opacity='" + PULSE[f] + "'/><circle cx='55' cy='44' r='1.5' fill='" + GREEN + "' opacity='" + PULSE[(f + 3) % 6] + "'/>"
      + "<path d='" + rr(43, 32, 42, 20, 8) + "' fill='url(#" + sh + ")' opacity='.7'/></g>";
    return { defs, art, shadowRx: 40 };
  };

  // Fake Facts — a little imp under a witch hat; its nose grows and GROWS.
  ART.fakefacts = (a, f) => {
    const acc = jewel(a);
    const g1 = grad(), g2 = grad(), g3 = grad();
    const nose = [8, 14, 21, 28, 20, 12][f];
    const defs = rg(g1, [[0, '#8f68be'], [0.55, '#6a4590'], [1, '#3b2052']], 0.35, 0.3)
      + lg(g2, [[0, '#7a52a8'], [1, '#4a2a6a']], false)
      + lg(g3, [[0, '#2f1747'], [1, '#150a26']]);
    const art =
      // the imp head
      "<circle cx='50' cy='66' r='25' fill='url(#" + g1 + ")'/>"
      + "<path d='M30 52 l-6 -8 9 3 z M66 48 l7 -7 -2 9 z' fill='url(#" + g2 + ")'/>"
      + "<ellipse cx='41' cy='55' rx='7' ry='5' fill='#fff' opacity='.35' filter='url(#fsoft)'/>"
      // floppy witch hat with accent band and a bent tip that nods
      + "<path d='M39 48 Q42 31 51 23 Q49 15 58 10 Q" + (56 + (f % 2)) + ' ' + (19 - (f % 2)) + " 60 26 Q64 38 63 47 Q50 53 39 48 Z' fill='url(#" + g3 + ")'/>"
      + "<path d='M29 47 q22 -7 44 0 l3 5.5 q-25 8.5 -50 0 z' fill='url(#" + g3 + ")'/>"
      + "<path d='M35 48 q16 4.5 31 0 l1.6 4.4 q-17 5.5 -34.4 0 z' fill='" + acc + "'/>"
      + "<path d='M44 44 Q47 32 54 26' stroke='#4a3a63' stroke-width='1.6' fill='none' opacity='.8'/>"
      // sly eyes + smirk
      + "<circle cx='42' cy='62' r='3.2' fill='" + GREEN + "'/><circle cx='58' cy='62' r='3.2' fill='" + GREEN + "'/>"
      + "<circle cx='42.8' cy='61' r='1' fill='#eaffdc'/><circle cx='58.8' cy='61' r='1' fill='#eaffdc'/>"
      + "<path d='M42 78 q8 5 15 -1' stroke='" + INK + "' stroke-width='2.6' fill='none' stroke-linecap='round'/>"
      // the growing nose (with a shadow under it — it has WEIGHT)
      + "<ellipse cx='" + (72 + nose / 2) + "' cy='75' rx='" + (nose / 2 + 3) + "' ry='2.5' fill='" + INK + "' opacity='.35' filter='url(#fsoft)'/>"
      + "<path d='M68 63 L" + (72 + nose) + ' ' + (66 + nose * 0.12) + " Q" + (73 + nose) + ' ' + (68.5 + nose * 0.12) + ' ' + (71 + nose) + ' ' + (69.5 + nose * 0.12) + " L68 71 Q64 67 68 63 Z' fill='url(#" + g2 + ")'/>"
      + "<path d='M68 64.5 L" + (69 + nose) + ' ' + (66.6 + nose * 0.12) + "' stroke='#a687cc' stroke-width='1.6' stroke-linecap='round' opacity='.8'/>"
      // a fib-mote puffing off the nose tip
      + "<circle cx='" + (76 + nose) + "' cy='" + (62 + nose * 0.12) + "' r='1.7' fill='" + EMBER + "' opacity='" + PULSE[f] + "'/>";
    return { defs, art, shadowRx: 38 };
  };

  // One Clue — a dripping candle; the flame gutters, wax has weight.
  ART.oneclue = (a, f) => {
    const acc = jewel(a);
    const g1 = grad(), g2 = grad(), gh = grad();
    const defs = waxGrad(g1)
      + lg(g2, [[0, '#e8ddc2'], [0.5, '#b5a67f'], [1, '#6b5a38']])
      + haloGrad(gh, '#ffce6b');
    const art =
      // brass chamber-stick dish + ring handle
      "<ellipse cx='64' cy='94' rx='26' ry='7' fill='#4d3f20'/>"
      + "<ellipse cx='64' cy='92' rx='26' ry='7' fill='url(#" + g2 + ")'/>"
      + "<ellipse cx='64' cy='90.5' rx='19' ry='4.5' fill='#8a7647'/>"
      + "<circle cx='92' cy='88' r='6.5' fill='none' stroke='url(#" + g2 + ")' stroke-width='4'/>"
      // the candle: bone wax with heavy drips
      + "<path d='M53 50 L53 88 L75 88 L75 50 Q64 46 53 50 Z' fill='url(#" + g1 + ")'/>"
      + "<path d='M53 52 q-3 9 -1 15 q1.5 4 3 .5 q1 -5 0 -15 z' fill='#fdf7e8'/>"
      + "<path d='M75 51 q3 12 1.5 20 q-1.5 5 -3.5 1 q-1.5 -6 -0.5 -20 z' fill='#fdf7e8'/>"
      + "<path d='M60 49 q-1 7 .5 11 q1.5 3 2.5 0 q1 -6 0 -11 z' fill='#faf3e0'/>"
      + "<ellipse cx='64' cy='50' rx='11' ry='3.4' fill='#fdf7e8'/>"
      + "<ellipse cx='64' cy='50' rx='6' ry='1.8' fill='#e0d3ae'/>"
      + "<path d='M56 56 L56 84' stroke='#fff' stroke-width='2.4' opacity='.5'/>"
      // wick + guttering flame (the "clue" moment: it flares on beat 2)
      + "<path d='M64 50 q1 -3 0 -6' stroke='" + INK + "' stroke-width='2' fill='none' stroke-linecap='round'/>"
      + flame(64, 40, f === 2 ? 1.35 : 1, f, gh)
      + "<ellipse cx='64' cy='50' rx='9' ry='2.6' fill='#ffce6b' opacity='.5'/>"
      + "<circle cx='78' cy='30' r='1.6' fill='" + EMBER + "' opacity='" + PULSE[f] + "'/>"
      + "<circle cx='64' cy='84' r='2' fill='" + acc + "'/>";
    return { defs, art, shadowRx: 34 };
  };

  // Same Brain — two little spirits think the SAME glowing rune.
  ART.samebrain = (a, f) => {
    const acc = jewel(a);
    const g1 = grad(), g2 = grad(), gh = grad();
    const defs = lg(g1, [[0, '#ffffff'], [0.55, '#efe9f6'], [1, '#b9aed0']])
      + lg(g2, [[0, shade(acc, 40)], [0.55, acc], [1, shade(acc, -70)]])
      + haloGrad(gh, GREEN);
    const head = (x, fill, flip) => "<g transform='translate(" + x + ",70)" + (flip ? " scale(-1,1)" : '') + "'>"
      + "<path d='M0 -20 C-12 -20 -17 -10 -17 0 V14 q4.25 5.5 8.5 0 q4.25 -5.5 8.5 0 q4.25 5.5 8.5 0 V0 C17 -10 12 -20 0 -20 Z' fill='" + fill + "'/>"
      + "<circle cx='-5' cy='-5' r='2.4' fill='" + INK + "'/><circle cx='5' cy='-5' r='2.4' fill='" + INK + "'/>"
      + "<circle cx='-4.2' cy='-5.8' r='.8' fill='#fff'/><circle cx='5.8' cy='-5.8' r='.8' fill='#fff'/>"
      + "<path d='M-3.5 2 q3.5 3 7 0' stroke='" + INK + "' stroke-width='2.2' fill='none' stroke-linecap='round'/>"
      + "<ellipse cx='-6' cy='-13' rx='4' ry='2.6' fill='#fff' opacity='.8'/></g>";
    const art =
      head(42, "url(#" + g1 + ")", false) + head(86, "url(#" + g2 + ")", true)
      // twin thought-trails rising to one shared rune
      + "<circle cx='48' cy='44' r='2.2' fill='#c9b7ec' opacity='.9'/><circle cx='54' cy='36' r='2.8' fill='#c9b7ec' opacity='.9'/>"
      + "<circle cx='80' cy='44' r='2.2' fill='#c9b7ec' opacity='.9'/><circle cx='74' cy='36' r='2.8' fill='#c9b7ec' opacity='.9'/>"
      + "<g transform='translate(64,27) scale(" + (0.85 + PULSE[f] * 0.35) + ")'>"
      + "<circle r='13' fill='url(#" + gh + ")'/>"
      + rune(0, 0, 1.05, GREEN, 2, 3.2) + '</g>';
    return { defs, art, shadowRx: 46 };
  };

  // Wolves — THE SHOWPIECE. Full moon, flapping bats, a wolf howling on the
  // hill. This is their home theme.
  ART.wolves = (a, f) => {
    const g1 = grad(), g2 = grad(), g3 = grad(), gh = grad();
    const howl = [0, -2, -4, -5, -3, -1][f];
    const defs = rg(g1, [[0, '#fffdf2'], [0.55, '#f5ebc8'], [1, '#d8c48a']], 0.42, 0.38)
      + lg(g2, [[0, '#5a4584'], [0.5, '#3a2a58'], [1, '#241638']])
      + lg(g3, [[0, '#2a1a42'], [1, '#130a22']])
      + haloGrad(gh, '#f0e2ae');
    const art =
      // moon + breathing halo + craters
      "<circle cx='84' cy='36' r='" + (30 + PULSE[f] * 5) + "' fill='url(#" + gh + ")' opacity='" + (0.6 + PULSE[f] * 0.35) + "'/>"
      + "<circle cx='84' cy='36' r='19' fill='url(#" + g1 + ")'/>"
      + "<circle cx='78' cy='31' r='3.4' fill='#d8c48a' opacity='.7'/><circle cx='90' cy='42' r='2.4' fill='#d8c48a' opacity='.6'/><circle cx='88' cy='29' r='1.6' fill='#d8c48a' opacity='.5'/>"
      + stars([[26, 22, 1.6], [40, 14, 1.2], [112, 60, 1.4], [20, 48, 1.1], [106, 14, 1.3]], f)
      // bats crossing the moon, flapping
      + bat(96 - f * 3, 26 + Math.sin(f * 1.8) * 2.5, 1, f % 2 === 0)
      + bat(112 - f * 2, 46 + Math.cos(f * 2) * 2, 0.7, f % 2 === 1)
      // the hill (darker than the wolf so the silhouette separates)
      + "<path d='M14 94 Q34 82 58 87 Q88 80 114 92 L114 104 L14 104 Z' fill='url(#" + g3 + ")'/>"
      + "<path d='M20 91 q8 -4 16 -3 M86 86 q10 -2 18 2' stroke='#3a2a58' stroke-width='2' fill='none' stroke-linecap='round' opacity='.9'/>"
      // the wolf: sitting on the hill, chest proud, muzzle thrown up at the moon
      + "<g transform='translate(7,25) scale(0.78) rotate(" + howl + " 46 86)'>"
      // bushy tail curling around the rump
      + "<path d='M31 87 Q15 86 12 71 Q13 67.5 17 70 Q20 79 33 80 Z' fill='url(#" + g2 + ")'/>"
      // body: rump, back, neck, ear, crown, muzzle to nose tip, jaw, chest, foreleg
      + "<path d='M28 90 Q23 76 31 66 Q39 59 43 49 Q44 43 48 39 L44 30 L52 34.5 L58 30 L69 21.5 L69 26 Q62 32 57.5 36.5 Q54 41 53 48 Q56 57 55 66 L58 90 Z' fill='url(#" + g2 + ")'/>"
      // moonlit rim along the back
      + "<path d='M28 88 Q24 76 31.5 66.5 Q39.5 59.5 43.5 49.5' stroke='#8b74b8' stroke-width='1.8' fill='none' stroke-linecap='round' opacity='.8'/>"
      + "<circle cx='52.5' cy='34.5' r='1.5' fill='" + GREEN + "'/>"
      // the howl, rippling toward the moon
      + "<g opacity='" + (0.3 + PULSE[f] * 0.6).toFixed(2) + "'>"
      + "<path d='M73 17 q4 3 4 8 M78.5 12.5 q5.5 4 5.5 11' stroke='#c9b7ec' stroke-width='2.6' fill='none' stroke-linecap='round'/></g></g>"
      + "<circle cx='28' cy='36' r='1.4' fill='" + GREEN + "' opacity='" + PULSE[(f + 2) % 6] + "'/>";
    return { defs, art, shadowRx: 46, shadowCy: 110 };
  };

  // Welcome — a friendly little ghost, bobbing, waving, going half-sheer.
  ART.welcome = (a, f) => {
    const acc = jewel(a);
    const g1 = grad(), gh = grad();
    const fade = [1, 0.94, 0.8, 0.68, 0.8, 0.94][f];
    const wave = [-16, 4, 22, 34, 18, -4][f];
    const bob = BOB[f] * 1.6;
    const defs = lg(g1, [[0, '#ffffff'], [0.5, '#f4f0f8'], [1, '#c3b8d8']])
      + haloGrad(gh, '#cdbdea');
    const art =
      "<ellipse cx='64' cy='64' rx='34' ry='36' fill='url(#" + gh + ")' opacity='" + (0.3 + PULSE[f] * 0.25).toFixed(2) + "'/>"
      + "<g transform='translate(0," + bob + ")' opacity='" + fade + "'>"
      // waving arm (behind the body edge)
      + "<g transform='rotate(" + wave + " 86 62)'>"
      + "<path d='M84 62 Q96 58 100 48' stroke='url(#" + g1 + ")' stroke-width='10' fill='none' stroke-linecap='round'/></g>"
      // body with wavy hem
      + "<path d='M64 26 C46 26 39 40 39 56 V84 q6.25 8 12.5 0 q6.25 -8 12.5 0 q6.25 8 12.5 0 q6.25 -8 12.5 0 V56 C89 40 82 26 64 26 Z' fill='url(#" + g1 + ")'/>"
      + "<path d='M42 40 Q48 30 58 29' stroke='#fff' stroke-width='4' fill='none' stroke-linecap='round' opacity='.9'/>"
      // face: big eyes, open smile, blush
      + "<circle cx='56' cy='52' r='4' fill='" + INK + "'/><circle cx='72' cy='52' r='4' fill='" + INK + "'/>"
      + "<circle cx='57.4' cy='50.6' r='1.4' fill='#fff'/><circle cx='73.4' cy='50.6' r='1.4' fill='#fff'/>"
      + "<path d='M59 62 q5 5 10 0 q-1 6 -5 6 q-4 0 -5 -6 z' fill='" + INK + "'/>"
      + "<ellipse cx='48' cy='60' rx='3.6' ry='2.2' fill='" + acc + "' opacity='.55'/><ellipse cx='80' cy='60' rx='3.6' ry='2.2' fill='" + acc + "' opacity='.55'/>"
      + '</g>'
      // two motes orbiting the little ghost
      + "<circle cx='" + (64 + Math.cos((f / FR) * 6.283) * 38) + "' cy='" + (60 + Math.sin((f / FR) * 6.283) * 12) + "' r='1.8' fill='" + GREEN + "' opacity='.95'/>"
      + "<circle cx='" + (64 - Math.cos((f / FR) * 6.283) * 30) + "' cy='" + (66 - Math.sin((f / FR) * 6.283) * 10) + "' r='1.3' fill='#c9b7ec' opacity='.9'/>";
    return { defs, art, shadowRx: 34 };
  };

  // Tic-Tac-Toe — a witch's slate: chalk grid, ember X's vs witch-light O's.
  ART.tictactoe = (a, f) => {
    const g1 = grad(), sh = grad();
    const on = f % 2 === 0, xs = on ? 1.14 : 1, os = on ? 1 : 1.14;
    const defs = stoneGrad(g1) + sheenGrad(sh);
    const art =
      "<path d='" + rr(26, 26, 76, 76, 14) + "' fill='#1b0d2e'/>"
      + "<path d='" + rr(24, 24, 76, 76, 14) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(24, 24, 76, 12, 14) + "' fill='url(#" + sh + ")' opacity='.7'/>"
      // chalk grid
      + "<path d='M52 34 v58 M76 34 v58 M34 52 h58 M34 76 h58' stroke='#c9bfdd' stroke-width='3.6' stroke-linecap='round' opacity='.85'/>"
      // ember X (top-left) pulses against witch O (bottom-right)
      + "<g transform='translate(43,43) scale(" + xs + ")'>"
      + "<path d='M-5.5 -5.5 L5.5 5.5 M5.5 -5.5 L-5.5 5.5' stroke='" + EMBER + "' stroke-width='5.5' stroke-linecap='round'/>"
      + "<path d='M-5.5 -5.5 L5.5 5.5 M5.5 -5.5 L-5.5 5.5' stroke='" + EMBER + "' stroke-width='7.5' stroke-linecap='round' opacity='.4' filter='url(#fglow)'/></g>"
      + "<g transform='translate(84,84) scale(" + os + ")'>"
      + "<circle r='6.5' fill='none' stroke='" + GREEN + "' stroke-width='5'/>"
      + "<circle r='6.5' fill='none' stroke='" + GREEN + "' stroke-width='7' opacity='.4' filter='url(#fglow)'/></g>"
      // a faded chalk O from a past game
      + "<circle cx='84' cy='43' r='6.5' fill='none' stroke='#9d86c2' stroke-width='4.5' opacity='.5'/>"
      + "<circle cx='30' cy='96' r='1.6' fill='" + GREEN + "' opacity='" + PULSE[f] + "'/>";
    return { defs, art, shadowRx: 42 };
  };

  // Connect 4 — a stone board; a pumpkin drops in among moon-pale discs.
  ART.connect4 = (a, f) => {
    const g1 = grad(), g2 = grad(), g3 = grad(), sh = grad();
    const defs = stoneGrad(g1)
      + rg(g2, [[0, '#ffb46b'], [0.5, EMBER], [1, '#b34f10']], 0.38, 0.3)
      + rg(g3, [[0, '#fdf8ec'], [0.6, '#e8ddc2'], [1, '#a8946a']], 0.38, 0.3) + sheenGrad(sh);
    const dropY = [22, 33, 46, 58, 58, 58][f];
    const landed = f >= 3;
    const pumpkin = (cx, cy, r) => "<g transform='translate(" + cx + ',' + cy + ")'>"
      + "<ellipse rx='" + r + "' ry='" + (r * 0.92) + "' fill='url(#" + g2 + ")'/>"
      + "<path d='M" + (-r * 0.45) + ' ' + (-r * 0.8) + ' Q' + (-r * 0.62) + " 0 " + (-r * 0.45) + ' ' + (r * 0.78) + ' M' + (r * 0.45) + ' ' + (-r * 0.8) + ' Q' + (r * 0.62) + " 0 " + (r * 0.45) + ' ' + (r * 0.78) + "' stroke='#b34f10' stroke-width='1.4' fill='none' opacity='.8'/>"
      + "<path d='M0 " + (-r * 0.9) + " q-1 -3 2 -4.5' stroke='#3f6622' stroke-width='2.4' fill='none' stroke-linecap='round'/>"
      + "<ellipse cx='" + (-r * 0.3) + "' cy='" + (-r * 0.4) + "' rx='2.2' ry='1.4' fill='#ffd9ad' opacity='.8'/></g>";
    const moon = (cx, cy) => "<circle cx='" + cx + "' cy='" + cy + "' r='8' fill='url(#" + g3 + ")'/><circle cx='" + (cx - 2.5) + "' cy='" + (cy - 3) + "' r='2.2' fill='#fff' opacity='.8'/>";
    const hole = (cx, cy) => "<circle cx='" + cx + "' cy='" + cy + "' r='8' fill='" + INK + "'/><circle cx='" + cx + "' cy='" + (cy + 1.2) + "' r='8' fill='none' stroke='#8a6fb0' stroke-width='1.5' opacity='.55'/>";
    const art = (landed ? '' : pumpkin(46, dropY, 9))
      + "<path d='" + rr(26, 42, 76, 54, 12) + "' fill='#170a28' transform='translate(2,3)'/>"
      + "<path d='" + rr(26, 42, 76, 54, 12) + "' fill='url(#" + g1 + ")'/>"
      + (landed ? pumpkin(46, 60, 8.6) : hole(46, 60)) + hole(70, 60) + hole(92, 60)
      + moon(46, 82) + hole(70, 82) + pumpkin(92, 82, 8.6)
      + rune(112, 50, 0.5, '#9d86c2', 5, 2.6)
      + "<path d='" + rr(26, 42, 76, 18, 12) + "' fill='url(#" + sh + ")' opacity='.7'/>";
    return { defs, art, shadowRx: 42 };
  };

  // Minesweeper — a plump black-glass bomb with shy blinking eyes; the fuse
  // spits witch-green sparks.
  ART.minesweeper = (a, f) => {
    const g1 = grad(), g2 = grad(), gh = grad();
    const defs = rg(g1, [[0, '#4f3d75'], [0.55, '#2c1c4a'], [1, '#150a26']], 0.35, 0.3)
      + lg(g2, [[0, '#e8ddc2'], [0.5, '#b5a67f'], [1, '#7d6a45']])
      + haloGrad(gh, GREEN);
    const blink = f === 4 ? 0.12 : 1;
    const s = FLK[f];
    const art =
      // the bomb
      "<circle cx='58' cy='68' r='27' fill='url(#" + g1 + ")'/>"
      + "<ellipse cx='48' cy='56' rx='9' ry='6' fill='#fff' opacity='.4' filter='url(#fsoft)'/>"
      + "<path d='M38 82 a27 27 0 0 0 32 6' stroke='#6a5590' stroke-width='2.4' fill='none' stroke-linecap='round' opacity='.7'/>"
      // shy face
      + "<g transform='translate(52,68) scale(1," + blink + ")'><circle r='3.6' fill='" + GREEN + "'/><circle r='1.5' cy='.3' fill='#0d2410'/><circle cx='-1.2' cy='-1.2' r='.8' fill='#eaffdc'/></g>"
      + "<g transform='translate(68,68) scale(1," + blink + ")'><circle r='3.6' fill='" + GREEN + "'/><circle r='1.5' cy='.3' fill='#0d2410'/><circle cx='-1.2' cy='-1.2' r='.8' fill='#eaffdc'/></g>"
      + "<path d='M55 78 q5 3.5 10 0' stroke='#9d86c2' stroke-width='2.2' fill='none' stroke-linecap='round'/>"
      // brass collar + curling fuse
      + "<path d='" + rr(66, 40, 15, 12, 4) + "' fill='url(#" + g2 + ")' transform='rotate(38 73 46)'/>"
      + "<path d='M78 40 q8 -10 16 -7' stroke='#c9b78f' stroke-width='3.6' fill='none' stroke-linecap='round'/>"
      // the spark: witch-green fizz
      + "<g transform='translate(96,32) scale(" + s + ")'>"
      + "<circle r='9' fill='url(#" + gh + ")'/>"
      + "<path d='M-6.5 0 H6.5 M0 -6.5 V6.5 M-4.5 -4.5 L4.5 4.5 M4.5 -4.5 L-4.5 4.5' stroke='#d6ffbe' stroke-width='2' stroke-linecap='round'/></g>"
      + "<circle cx='" + (88 - f * 2) + "' cy='" + (24 + f) + "' r='1.4' fill='" + GREEN + "' opacity='" + PULSE[(f + 1) % 6] + "'/>";
    return { defs, art, shadowRx: 36 };
  };

  // Chess — a spectral pawn drifting above its stone base.
  ART.chess = (a, f) => {
    const acc = jewel(a);
    const g1 = grad(), g2 = grad(), gh = grad();
    const drift = Math.sin((f / FR) * Math.PI * 2) * 2.4;
    const defs = lg(g1, [[0, '#ffffff', 0.98], [0.55, '#e9e2f4', 0.92], [1, '#a99bcb', 0.85]], false)
      + stoneGrad(g2) + haloGrad(gh, '#cdbdea');
    const art =
      "<ellipse cx='64' cy='58' rx='26' ry='32' fill='url(#" + gh + ")' opacity='" + (0.3 + PULSE[f] * 0.25).toFixed(2) + "'/>"
      // the pawn — translucent porcelain-ghost, drifting
      + "<g transform='translate(0," + drift + ")'>"
      + "<circle cx='64' cy='38' r='12.5' fill='url(#" + g1 + ")'/>"
      + "<ellipse cx='59' cy='33' rx='4.2' ry='3' fill='#fff' opacity='.95'/>"
      + "<path d='" + rr(53, 49, 22, 6.5, 3.2) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='M57.5 55.5 q0 13 -6.5 22 q6.5 4 13 -1 q6.5 5 13 1 q-6.5 -9 -6.5 -22 z' fill='url(#" + g1 + ")'/>"
      // little spectral face
      + "<circle cx='60' cy='38' r='1.8' fill='" + PDEEP + "'/><circle cx='68' cy='38' r='1.8' fill='" + PDEEP + "'/>"
      + "<path d='M61.5 43 q2.5 2 5 0' stroke='" + PDEEP + "' stroke-width='1.6' fill='none' stroke-linecap='round'/></g>"
      // rune-carved stone base it refuses to touch
      + "<path d='" + rr(42, 84, 44, 12, 5) + "' fill='#1b0d2e'/>"
      + "<path d='" + rr(42, 82, 44, 12, 5) + "' fill='url(#" + g2 + ")'/>"
      + rune(56, 88, 0.5, mixc(GREEN, PMID, 0.25), 0, 3) + rune(72, 88, 0.5, mixc(GREEN, PMID, 0.25), 3, 3)
      + "<circle cx='64' cy='79' r='2' fill='" + acc + "'/>"
      + wisp(84, 74, 0.7, 0.4 + PULSE[f] * 0.3, f * 1.2);
    return { defs, art, shadowRx: 30 };
  };

  // ---- letter fallback: the initial carved into a floating rune stone -------
  function fallbackArt(letter, a, f) {
    const acc = jewel(a);
    const g1 = grad(), gh = grad(), sh = grad();
    const defs = stoneGrad(g1) + haloGrad(gh, GREEN) + sheenGrad(sh);
    const art =
      "<ellipse cx='64' cy='64' rx='42' ry='40' fill='url(#" + gh + ")' opacity='" + (0.3 + PULSE[f] * 0.3).toFixed(2) + "'/>"
      // a chipped pebble slab
      + "<path d='M42 28 L88 26 Q99 26 100 38 L102 88 Q102 99 90 100 L40 101 Q29 101 28 90 L26 40 Q26 29 38 28 Z' fill='#170a28' transform='translate(2,3)'/>"
      + "<path d='M42 28 L88 26 Q99 26 100 38 L102 88 Q102 99 90 100 L40 101 Q29 101 28 90 L26 40 Q26 29 38 28 Z' fill='url(#" + g1 + ")'/>"
      + "<path d='M42 28 L88 26 Q99 26 100 38 L100.5 44 L27 46 L26 40 Q26 29 38 28 Z' fill='url(#" + sh + ")'/>"
      + "<path d='M94 82 l4 6 -3 7' stroke='#231038' stroke-width='2' fill='none' opacity='.8'/>"
      + "<circle cx='36' cy='36' r='2' fill='" + acc + "'/><circle cx='92' cy='94' r='2' fill='" + acc + "'/>"
      // the carved letter: dark cut + green glow
      + "<text x='65' y='81' font-family='Georgia,serif' font-size='46' font-weight='700' fill='" + GREEN + "' text-anchor='middle' opacity='.8' filter='url(#fglow)'>" + letter + '</text>'
      + "<text x='65' y='81' font-family='Georgia,serif' font-size='46' font-weight='700' fill='#d6ffbe' text-anchor='middle'>" + letter + '</text>'
      + "<circle cx='100' cy='30' r='1.6' fill='" + GREEN + "' opacity='" + PULSE[f] + "'/>";
    return { defs, art, shadowRx: 40 };
  }

  GifOS.iconPacks.register('hex', {
    size: SIZE, frames: FR, delayCs: DELAY, dither: 12,
    draw(subject, accent) {
      const builder = ART[subject];
      if (!builder) return null;
      return range(FR).map((f) => { const r = builder(accent, f); return shell(r.defs, r.art, f, r.shadowRx, r.shadowCy); });
    },
    fallback(letter, accent) {
      return range(FR).map((f) => { const r = fallbackArt(letter, accent, f); return shell(r.defs, r.art, f, r.shadowRx); });
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
