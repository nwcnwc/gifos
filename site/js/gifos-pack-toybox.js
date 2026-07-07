/*
 * gifos-pack-toybox.js — "Toybox", the kawaii computer's icon pack
 * (3.gifos.app — light lavender pastel desktop).
 *
 * Glossy squishy-toy icons, like Sanrio merchandise or gachapon prizes:
 * fat inflated forms, pastel gradient bodies, big soft speculars, a white
 * die-cut sticker rim around every icon (feMorphology dilate), soft contact
 * shadows, and little orbiting pearl beads as garnish. A few objects get a
 * tiny kawaii face (dot eyes + smile + blush cheeks) that blinks on the
 * last frame. Squash-and-stretch bounces everywhere.
 *
 * Fully procedural SVG. 160px raster, 6 frames, ordered dithering so the
 * pastel gradients survive GIF's 256 colors.
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
  // Pastelize an accent: mix 45% toward white so every app body is a soft toy.
  const pastel = (a) => toHex([a[0] + (255 - a[0]) * 0.45, a[1] + (255 - a[1]) * 0.45, a[2] + (255 - a[2]) * 0.45]);

  // The toybox pastel candy shelf.
  const BLUSH = '#ffb3d1', BLUE = '#a8dcff', MINT = '#b8f2cf', BUTTER = '#ffe9a8', LAV = '#d9c6ff';
  const INK = '#5b4a72';    // soft plum ink for faces + details
  const CHEEK = '#ff9ec5';  // blush cheeks
  const RIM = '#ffffff';    // die-cut sticker rim

  // ---- gradients / materials -------------------------------------------------
  let uid = 0;
  const grad = () => 't' + (uid++);
  function lg(id, stops, vert) {
    const s = stops.map((st) => "<stop offset='" + st[0] + "' stop-color='" + st[1] + "'" + (st[2] != null ? " stop-opacity='" + st[2] + "'" : '') + '/>').join('');
    return "<linearGradient id='" + id + "' x1='0' y1='0' x2='" + (vert === false ? 1 : 0) + "' y2='" + (vert === false ? 0 : 1) + "'>" + s + '</linearGradient>';
  }
  function rg(id, stops, fx, fy) {
    const s = stops.map((st) => "<stop offset='" + st[0] + "' stop-color='" + st[1] + "'" + (st[2] != null ? " stop-opacity='" + st[2] + "'" : '') + '/>').join('');
    return "<radialGradient id='" + id + "'" + (fx != null ? " fx='" + fx + "' fy='" + fy + "'" : '') + '>' + s + '</radialGradient>';
  }
  // Squishy vertical body gradient — bright pastel top, deeper candy bottom.
  function bodyGrad(id, base) {
    return lg(id, [[0, shade(base, 34)], [0.45, base], [1, shade(base, -44)]]);
  }
  // Inflated ball gradient (for round bodies / beads).
  function ballGrad(id, base) {
    return rg(id, [[0, shade(base, 48)], [0.55, base], [1, shade(base, -46)]], 0.35, 0.3);
  }
  // Marshmallow white (porcelain with a lavender bottom).
  function marshGrad(id) {
    return lg(id, [[0, '#ffffff'], [0.55, '#f7f3fd'], [1, '#d8ccef']]);
  }
  function sheenGrad(id) {
    return lg(id, [[0, '#ffffff', 0.75], [0.4, '#ffffff', 0.2], [0.62, '#ffffff', 0]]);
  }

  // ---- motion tables ---------------------------------------------------------
  const FLOAT = [0, -2, -3.5, -4, -3, -1.5];        // gentle idle hover
  const SQX = [1.05, 1.015, 0.99, 0.972, 0.99, 1.03];  // squash & stretch pair
  const SQY = [0.94, 0.99, 1.02, 1.045, 1.02, 0.97];
  const POP = [0, 0.35, 0.85, 1, 0.6, 0.2];         // opacity pop-in curve

  // Squash-and-stretch wrapper anchored at the object's base line.
  const squash = (f, cy) => "translate(64," + cy + ") scale(" + SQX[f] + ',' + SQY[f] + ") translate(-64," + (-cy) + ')';

  // Contact shadow — sits OUTSIDE the die-cut group so it stays a soft blob.
  function shadow(f, rx, cy) {
    const t = -FLOAT[f] / 4;
    return "<ellipse cx='64' cy='" + (cy || 108) + "' rx='" + (rx - t * 4) + "' ry='" + (6.5 - t * 1.3) + "' fill='#8a76b8' opacity='" + (0.32 - t * 0.09) + "' filter='url(#tblur)'/>";
  }
  // Big soft specular blob for a rounded body.
  function spec(x, y, rx, ry, op) {
    return "<ellipse cx='" + x + "' cy='" + y + "' rx='" + rx + "' ry='" + ry + "' fill='#fff' opacity='" + (op || 0.65) + "' filter='url(#tsoft)'/>";
  }
  // A glossy pearl bead. Returns {def, art}.
  function pearl(x, y, r, c) {
    const id = grad();
    return {
      def: ballGrad(id, c),
      art: "<circle cx='" + x + "' cy='" + y + "' r='" + r + "' fill='url(#" + id + ")'/>"
        + "<circle cx='" + (x - r * 0.3) + "' cy='" + (y - r * 0.38) + "' r='" + (r * 0.32) + "' fill='#fff' opacity='.95'/>",
    };
  }
  // An orbiting pearl — the toybox signature garnish. {def, art, behind}.
  function orbit(f, cx, cy, rx, ry, r, c, phase) {
    const th = (f / FR) * Math.PI * 2 + (phase || 0);
    const p = pearl(cx + Math.cos(th) * rx, cy + Math.sin(th) * ry, r, c);
    return { def: p.def, art: p.art, behind: Math.sin(th) < 0 };
  }
  // Tiny kawaii face: dot eyes with glints (curved shut on the last frame),
  // a smile, blush cheeks.
  function face(x, y, f, s, col) {
    s = s || 1; col = col || INK;
    const ex = 6 * s, blink = f === FR - 1;
    const eyes = blink
      ? "<path d='M" + (x - ex - 2.7 * s) + ' ' + y + " q" + (2.7 * s) + ' ' + (2.7 * s) + ' ' + (5.4 * s) + " 0 M" + (x + ex - 2.7 * s) + ' ' + y + " q" + (2.7 * s) + ' ' + (2.7 * s) + ' ' + (5.4 * s) + " 0' stroke='" + col + "' stroke-width='" + (2.5 * s) + "' fill='none' stroke-linecap='round'/>"
      : "<circle cx='" + (x - ex) + "' cy='" + y + "' r='" + (2.7 * s) + "' fill='" + col + "'/><circle cx='" + (x + ex) + "' cy='" + y + "' r='" + (2.7 * s) + "' fill='" + col + "'/>"
        + "<circle cx='" + (x - ex + 0.9 * s) + "' cy='" + (y - 0.9 * s) + "' r='" + (0.9 * s) + "' fill='#fff'/><circle cx='" + (x + ex + 0.9 * s) + "' cy='" + (y - 0.9 * s) + "' r='" + (0.9 * s) + "' fill='#fff'/>";
    return eyes
      + "<path d='M" + (x - 3.2 * s) + ' ' + (y + 5 * s) + " q" + (3.2 * s) + ' ' + (3.6 * s) + ' ' + (6.4 * s) + " 0' stroke='" + col + "' stroke-width='" + (2.4 * s) + "' fill='none' stroke-linecap='round'/>"
      + "<ellipse cx='" + (x - 11.5 * s) + "' cy='" + (y + 3.6 * s) + "' rx='" + (3.4 * s) + "' ry='" + (2.3 * s) + "' fill='" + CHEEK + "' opacity='.7'/>"
      + "<ellipse cx='" + (x + 11.5 * s) + "' cy='" + (y + 3.6 * s) + "' rx='" + (3.4 * s) + "' ry='" + (2.3 * s) + "' fill='" + CHEEK + "' opacity='.7'/>";
  }

  // Frame shell: soft shadow under a die-cut white sticker rim around the art.
  function shell(defs, art, f, shadowRx, shadowCy) {
    return "<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'>"
      + '<defs>'
      + "<filter id='tdie' x='-15%' y='-15%' width='130%' height='130%'>"
      + "<feMorphology in='SourceAlpha' operator='dilate' radius='2.6' result='fat'/>"
      + "<feFlood flood-color='" + RIM + "'/><feComposite in2='fat' operator='in' result='rim'/>"
      + "<feMerge><feMergeNode in='rim'/><feMergeNode in='SourceGraphic'/></feMerge></filter>"
      + "<filter id='tblur' x='-60%' y='-60%' width='220%' height='220%'><feGaussianBlur stdDeviation='4'/></filter>"
      + "<filter id='tsoft' x='-60%' y='-60%' width='220%' height='220%'><feGaussianBlur stdDeviation='2.1'/></filter>"
      + "<filter id='tglow' x='-80%' y='-80%' width='260%' height='260%'><feGaussianBlur stdDeviation='3.2'/></filter>"
      + defs + '</defs>'
      + shadow(f, shadowRx || 34, shadowCy)
      + "<g filter='url(#tdie)'><g transform='translate(0," + FLOAT[f] + ")'>" + art + '</g></g></svg>';
  }

  // Rounded-rect path.
  const rr = (x, y, w, h, r) => 'M' + (x + r) + ' ' + y + ' h' + (w - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r
    + ' v' + (h - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 -' + r + ' ' + r + ' h-' + (w - 2 * r)
    + ' a' + r + ' ' + r + ' 0 0 1 -' + r + ' -' + r + ' v-' + (h - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' -' + r + ' z';

  // ---- subjects --------------------------------------------------------------
  const ART = {};

  // Video Call — THE HERO. A fat glossy camera: pastel body, huge candy lens,
  // blinking REC gem, viewfinder bump, TWO pearls orbiting like moons.
  ART.video = (a, f) => {
    const base = pastel(a);
    const g1 = grad(), g2 = grad(), g3 = grad(), sh = grad();
    const o1 = orbit(f, 64, 66, 50, 15, 5, BLUSH, 0);
    const o2 = orbit(f, 64, 66, 50, 15, 3.6, MINT, Math.PI * 0.85);
    const defs = bodyGrad(g1, base) + marshGrad(g2)
      + rg(g3, [[0, '#8d7ab8'], [0.5, '#635192'], [0.8, '#463672'], [1, '#352857']], 0.38, 0.3)
      + sheenGrad(sh) + o1.def + o2.def;
    const rec = f % 2 === 0;
    const art = (o1.behind ? o1.art : '') + (o2.behind ? o2.art : '')
      + "<g transform='" + squash(f, 92) + "'>"
      // viewfinder bump + body
      + "<path d='" + rr(34, 30, 32, 18, 9) + "' fill='url(#" + g2 + ")'/>"
      + "<path d='" + rr(18, 42, 92, 50, 24) + "' fill='url(#" + g1 + ")'/>"
      // lens: white ring, deep candy glass, iris, big catch-light
      + "<circle cx='52' cy='67' r='24' fill='" + shade(base, -58) + "'/>"
      + "<circle cx='52' cy='66' r='22.5' fill='url(#" + g2 + ")'/>"
      + "<circle cx='52' cy='66.5' r='17.5' fill='url(#" + g3 + ")'/>"
      + "<circle cx='52' cy='66.5' r='8' fill='#352857'/>"
      + "<ellipse cx='45.5' cy='58.5' rx='6' ry='4.4' fill='#fff' opacity='.9' filter='url(#tsoft)'/>"
      + "<circle cx='59' cy='73' r='2.2' fill='" + BLUE + "' opacity='.9'/>"
      // REC gem + little control pearls
      + "<circle cx='95' cy='58' r='6' fill='" + (rec ? '#ff6d96' : '#f0b7cc') + "'/>"
      + "<circle cx='93.2' cy='56' r='1.9' fill='#fff' opacity='.9'/>"
      + (rec ? "<circle cx='95' cy='58' r='6' fill='#ff6d96' opacity='.55' filter='url(#tglow)'/>" : '')
      + "<circle cx='88' cy='78' r='4' fill='" + BUTTER + "'/><circle cx='86.8' cy='76.8' r='1.3' fill='#fff' opacity='.9'/>"
      + "<circle cx='99' cy='78' r='4' fill='" + MINT + "'/><circle cx='97.8' cy='76.8' r='1.3' fill='#fff' opacity='.9'/>"
      // sheen + speculars
      + "<path d='" + rr(18, 42, 92, 25, 24) + "' fill='url(#" + sh + ")'/>"
      + spec(84, 49, 10, 3.5, 0.7)
      + '</g>'
      + (o1.behind ? '' : o1.art) + (o2.behind ? '' : o2.art);
    return { defs, art, shadowRx: 44 };
  };

  // Folder — a chubby pastel folder hugging a doodled page; heart sticker.
  ART.folder = (a, f) => {
    const base = pastel(a);
    const g1 = grad(), g2 = grad(), g3 = grad(), sh = grad();
    const lift = [0, 1.5, 3.5, 4, 2.5, 1][f];
    const o = orbit(f, 64, 66, 48, 13, 4, BUTTER, Math.PI * 0.3);
    const defs = bodyGrad(g1, shade(base, -30)) + bodyGrad(g2, base) + marshGrad(g3) + sheenGrad(sh) + o.def;
    const art = (o.behind ? o.art : '')
      + "<g transform='" + squash(f, 96) + "'>"
      // back panel with fat tab
      + "<path d='M22 42 a11 11 0 0 1 11 -11 h17 a10 10 0 0 1 8.3 4.4 l3.6 5.2 h33.5 a11 11 0 0 1 11 11 v34 a13 13 0 0 1 -13 13 h-60 a13 13 0 0 1 -13 -13 z' fill='url(#" + g1 + ")'/>"
      // doodle page peeking up
      + "<g transform='translate(0," + (-lift) + ")'>"
      + "<path d='" + rr(34, 34, 60, 28, 8) + "' fill='url(#" + g3 + ")'/>"
      + "<path d='M43 44 h28 M43 52 h18' stroke='#c8bce4' stroke-width='3.5' stroke-linecap='round' fill='none'/>"
      + "<path d='M82 50 c-4.5 -3.6 -3 -8 1 -6.4 c4 -1.6 5.5 2.8 1 6.4 z' fill='" + CHEEK + "' transform='translate(-1,-2)'/></g>"
      // fat front panel
      + "<path d='M18 58 a10 10 0 0 1 10 -10 h72 a10 10 0 0 1 10 10 l-1.6 24 a13 13 0 0 1 -13 12.4 h-62.8 a13 13 0 0 1 -13 -12.4 z' fill='url(#" + g2 + ")'/>"
      + "<path d='M18 58 a10 10 0 0 1 10 -10 h72 a10 10 0 0 1 10 10 l-.6 9 h-90.8 z' fill='url(#" + sh + ")'/>"
      // heart sticker
      + "<g transform='translate(92,82) scale(1.1)'><path d='M0 6.5 C-8 0 -6 -7.5 0 -4.6 C6 -7.5 8 0 0 6.5 Z' fill='#fff'/>"
      + "<path d='M0 5 C-6.4 0 -4.8 -6 0 -3.7 C4.8 -6 6.4 0 0 5 Z' fill='" + BLUSH + "'/>"
      + "<ellipse cx='-2.2' cy='-2.6' rx='1.7' ry='1.2' fill='#fff' opacity='.9'/></g>"
      + spec(34, 55, 11, 3.4, 0.6)
      + '</g>'
      + (o.behind ? '' : o.art);
    return { defs, art, shadowRx: 46 };
  };

  // Notes — a marshmallow notepad with fat pearl spiral rings, a pastel cover
  // band, an accent line being written by a chubby pencil.
  ART.notes = (a, f) => {
    const base = pastel(a);
    const g1 = grad(), g2 = grad(), g3 = grad(), sh = grad();
    const w = 10 + 26 * (f / (FR - 1));
    const defs = marshGrad(g1) + bodyGrad(g2, base)
      + lg(g3, [[0, '#fff3c4'], [0.5, BUTTER], [1, '#e8bd62']], false) + sheenGrad(sh);
    const rings = range(4).map((i) => {
      const x = 40 + i * 16;
      return "<rect x='" + (x - 2.5) + "' y='24' width='5' height='14' rx='2.5' fill='#cdbfe8'/>"
        + "<rect x='" + (x - 2.5) + "' y='24' width='5' height='6' rx='2.5' fill='#fff'/>";
    }).join('');
    const art =
      "<g transform='" + squash(f, 98) + "'>"
      // fat page block
      + "<path d='" + rr(28, 30, 72, 68, 18) + "' fill='#c3b4e2'/>"
      + "<path d='" + rr(26, 28, 72, 68, 18) + "' fill='url(#" + g1 + ")'/>"
      // pastel cover band
      + "<path d='M26 46 v-4 a14 14 0 0 1 14 -14 h44 a14 14 0 0 1 14 14 v4 z' fill='url(#" + g2 + ")'/>"
      + rings
      // ruled lines + the line being written
      + "<path d='M38 60 h48 M38 70 h48 M38 80 h34' stroke='#e2daf2' stroke-width='4' stroke-linecap='round' fill='none'/>"
      + "<path d='M38 70 h" + w + "' stroke='" + shade(base, -34) + "' stroke-width='5' stroke-linecap='round' fill='none'/>"
      + "<path d='" + rr(26, 28, 72, 20, 14) + "' fill='url(#" + sh + ")'/>"
      // chubby pencil
      + "<g transform='translate(" + (40 + w) + ',' + (66 - w * 0.06) + ") rotate(40)'>"
      + "<rect x='-5' y='-30' width='10' height='22' rx='3' fill='url(#" + g3 + ")'/>"
      + "<rect x='-5' y='-35' width='10' height='7' rx='3.5' fill='" + BLUSH + "'/>"
      + "<path d='M-5 -8 L5 -8 L0 2 Z' fill='#ffe4c7'/><path d='M-1.8 -3.4 L1.8 -3.4 L0 2 Z' fill='" + INK + "'/>"
      + "<rect x='-5' y='-30' width='4' height='22' rx='2' fill='#fff' opacity='.4'/></g>"
      + '</g>';
    return { defs, art, shadowRx: 42 };
  };

  // Calculator — a chubby pastel calc with a minty screen and pearl buttons.
  ART.calc = (a, f) => {
    const base = pastel(a);
    const g1 = grad(), g2 = grad(), g3 = grad(), sh = grad();
    const defs = bodyGrad(g1, base)
      + lg(g2, [[0, '#eafcda'], [1, '#b6ecb2']])
      + marshGrad(g3) + sheenGrad(sh);
    const lit = (f * 2) % 9;
    let btns = '';
    let i = 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++, i++) {
      const x = 46 + c * 18, y = 66 + r * 13.5, on = i === lit;
      btns += "<circle cx='" + x + "' cy='" + y + "' r='" + (on ? 6.4 : 5.6) + "' fill='" + (on ? BUTTER : ("url(#" + g3 + ")")) + "'/>"
        + "<circle cx='" + (x - 1.6) + "' cy='" + (y - 1.8) + "' r='1.8' fill='#fff' opacity='.95'/>";
    }
    const art =
      "<g transform='" + squash(f, 102) + "'>"
      + "<path d='" + rr(30, 24, 68, 80, 22) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(40, 36, 48, 20, 9) + "' fill='" + shade(base, -60) + "' opacity='.5'/>"
      + "<path d='" + rr(40, 35, 48, 20, 9) + "' fill='url(#" + g2 + ")'/>"
      + "<text x='82' y='51' font-family='ui-monospace,monospace' font-size='14' font-weight='700' fill='#4f8a4a' text-anchor='end'>" + [3, 12, 88, 256, 512, ':3'][f] + "</text>"
      + btns
      + "<path d='" + rr(30, 24, 68, 26, 20) + "' fill='url(#" + sh + ")'/>"
      + spec(44, 30, 9, 3, 0.6)
      + '</g>';
    return { defs, art, shadowRx: 40 };
  };

  // Stopwatch — a fat pastel watch with pearl ticks and a sweeping candy hand.
  ART.timer = (a, f) => {
    const base = pastel(a);
    const g1 = grad(), g2 = grad(), sh = grad();
    const ang = f * 60;
    const defs = bodyGrad(g1, base)
      + rg(g2, [[0, '#ffffff'], [0.7, '#fbf8ff'], [1, '#e4daf4']], 0.4, 0.3) + sheenGrad(sh);
    const ticks = range(12).map((i) => {
      const t = i * 30 * Math.PI / 180, R = 22;
      const major = i % 3 === 0;
      return "<circle cx='" + (64 + Math.sin(t) * R) + "' cy='" + (70 - Math.cos(t) * R) + "' r='" + (major ? 2.6 : 1.6) + "' fill='" + (major ? shade(base, -40) : '#cbbee6') + "'/>";
    }).join('');
    const art =
      "<g transform='" + squash(f, 102) + "'>"
      // crown + fat side ears
      + "<rect x='57' y='24' width='14' height='12' rx='5' fill='url(#" + g1 + ")'/>"
      + "<rect x='51' y='20' width='26' height='9' rx='4.5' fill='" + BUTTER + "'/>"
      + "<rect x='51' y='20' width='26' height='4' rx='2' fill='#fff' opacity='.6'/>"
      + "<g transform='rotate(42 64 70)'><rect x='56' y='30' width='16' height='11' rx='5' fill='url(#" + g1 + ")'/></g>"
      + "<g transform='rotate(-42 64 70)'><rect x='56' y='30' width='16' height='11' rx='5' fill='url(#" + g1 + ")'/></g>"
      // fat case + porcelain face
      + "<circle cx='64' cy='70' r='34' fill='url(#" + g1 + ")'/>"
      + "<circle cx='64' cy='70' r='26.5' fill='" + shade(base, -52) + "'/>"
      + "<circle cx='64' cy='69.5' r='25.5' fill='url(#" + g2 + ")'/>"
      + ticks
      // candy hand
      + "<g transform='rotate(" + ang + " 64 70)'>"
      + "<path d='M64 70 V52' stroke='" + shade(base, -46) + "' stroke-width='5.5' stroke-linecap='round'/>"
      + "<path d='M64 70 v6.5' stroke='" + shade(base, -46) + "' stroke-width='5.5' stroke-linecap='round'/></g>"
      + "<circle cx='64' cy='70' r='4.6' fill='" + BLUSH + "'/><circle cx='62.7' cy='68.6' r='1.5' fill='#fff'/>"
      // glass + case gloss
      + "<path d='M45 55 a25 25 0 0 1 26 -8 a28 28 0 0 0 -26 8 z' fill='#fff' opacity='.75' filter='url(#tsoft)'/>"
      + spec(44, 46, 7, 4, 0.5)
      + '</g>';
    return { defs, art, shadowRx: 40 };
  };

  // Welcome — a chubby mitten hand waving hello, heart popping at the top.
  ART.welcome = (a, f) => {
    const base = pastel(a);
    const g1 = grad(), sh = grad();
    const wave = [-11, -5, 3, 9, 4, -4][f];
    const defs = bodyGrad(g1, base) + sheenGrad(sh);
    const fing = (x, y, h) => "<path d='" + rr(x, y, 13, h, 6.5) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(x + 2, y + 2, 5, 10, 2.5) + "' fill='#fff' opacity='.55'/>";
    const art =
      "<g transform='rotate(" + wave + " 64 96)'>"
      // palm + four chubby fingers + thumb
      + fing(38, 36, 34) + fing(52, 29, 40) + fing(66, 31, 38) + fing(80, 39, 32)
      + "<path d='" + rr(38, 54, 55, 40, 20) + "' fill='url(#" + g1 + ")'/>"
      + "<g transform='rotate(38 40 76)'><path d='" + rr(24, 66, 26, 15, 7.5) + "' fill='url(#" + g1 + ")'/></g>"
      + "<path d='" + rr(38, 54, 55, 20, 10) + "' fill='url(#" + sh + ")'/>"
      + spec(58, 68, 12, 6, 0.5)
      // cuff
      + "<path d='" + rr(46, 90, 38, 13, 6.5) + "' fill='#fff'/>"
      + "<path d='" + rr(46, 96, 38, 7, 3.5) + "' fill='" + LAV + "'/>"
      + '</g>'
      // motion arcs + popping heart
      + "<path d='M24 60 q-7 -11 0 -22 M104 60 q7 -11 0 -22' stroke='" + shade(base, -30) + "' stroke-width='4.5' fill='none' stroke-linecap='round' opacity='" + (0.35 + POP[f] * 0.55) + "'/>"
      + "<g transform='translate(97,30) scale(" + (0.8 + POP[f] * 0.5) + ")' opacity='" + (0.25 + POP[f] * 0.75) + "'>"
      + "<path d='M0 7 C-9 0 -6.5 -8.5 0 -5.2 C6.5 -8.5 9 0 0 7 Z' fill='" + BLUSH + "'/>"
      + "<ellipse cx='-2.5' cy='-3' rx='2' ry='1.4' fill='#fff' opacity='.9'/></g>";
    return { defs, art, shadowRx: 36 };
  };

  // Tic-Tac-Toe — a marshmallow tile; candy X and O take turns bouncing.
  ART.tictactoe = (a, f) => {
    const g1 = grad(), g2 = grad(), g3 = grad(), sh = grad();
    const on = f % 2 === 0, xs = on ? 1.2 : 1, os = on ? 1 : 1.2;
    const defs = marshGrad(g1) + bodyGrad(g2, '#ff8fb8') + bodyGrad(g3, '#7cc4f8') + sheenGrad(sh);
    const art =
      "<g transform='" + squash(f, 100) + "'>"
      + "<path d='" + rr(26, 28, 80, 76, 24) + "' fill='#c3b4e2'/>"
      + "<path d='" + rr(24, 26, 80, 76, 24) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='M52 38 v52 M76 38 v52 M36 52 h56 M36 76 h56' stroke='#c5b2e8' stroke-width='6' stroke-linecap='round' fill='none'/>"
      + "<g transform='translate(42,43) scale(" + xs + ")'>"
      + "<path d='M-6.5 -6.5 L6.5 6.5 M6.5 -6.5 L-6.5 6.5' stroke='url(#" + g2 + ")' stroke-width='9' stroke-linecap='round'/></g>"
      + "<g transform='translate(87,86) scale(" + os + ")'><circle r='7.5' fill='none' stroke='url(#" + g3 + ")' stroke-width='8'/></g>"
      + "<circle cx='87' cy='43' r='7' fill='none' stroke='#e2d8f2' stroke-width='7'/>"
      + "<path d='" + rr(24, 26, 80, 26, 22) + "' fill='url(#" + sh + ")'/>"
      + '</g>';
    return { defs, art, shadowRx: 46 };
  };

  // Connect Four — a fat pastel board; a blush disc plops in and squishes.
  ART.connect4 = (a, f) => {
    const base = pastel(a);
    const g1 = grad(), g2 = grad(), g3 = grad(), g4 = grad(), sh = grad();
    const defs = bodyGrad(g1, base) + ballGrad(g2, BLUSH) + ballGrad(g3, BUTTER) + ballGrad(g4, MINT) + sheenGrad(sh);
    const dropY = [20, 30, 44, 58, 60, 60][f];
    const landed = f >= 3;
    const squish = f === 3;
    const hole = (cx, cy, fill) => fill
      ? "<circle cx='" + cx + "' cy='" + cy + "' r='8.8' fill='url(#" + fill + ")'/><circle cx='" + (cx - 2.6) + "' cy='" + (cy - 3) + "' r='2.4' fill='#fff' opacity='.9'/>"
      : "<circle cx='" + cx + "' cy='" + cy + "' r='8.8' fill='#63508e'/>"
      + "<path d='M" + (cx - 6) + ' ' + (cy + 4.4) + " a8.8 8.8 0 0 0 12 0' stroke='" + shade(base, 46) + "' stroke-width='2.2' fill='none' opacity='.8'/>";
    const disc = landed
      ? "<g transform='translate(44,62)'><ellipse rx='" + (squish ? 10.6 : 8.8) + "' ry='" + (squish ? 7 : 8.8) + "' fill='url(#" + g2 + ")'/><circle cx='-2.6' cy='-3' r='2.4' fill='#fff' opacity='.9'/></g>"
      : "<g transform='translate(44," + dropY + ")'><ellipse rx='8.4' ry='9.8' fill='url(#" + g2 + ")'/><circle cx='-2.6' cy='-3.4' r='2.4' fill='#fff' opacity='.9'/></g>";
    const art = (landed ? '' : disc)
      + "<path d='" + rr(22, 44, 84, 56, 20) + "' fill='" + shade(base, -62) + "' transform='translate(1.5,3)'/>"
      + "<path d='" + rr(22, 44, 84, 56, 20) + "' fill='url(#" + g1 + ")'/>"
      + hole(44, 62, null) + hole(66, 62, null) + hole(88, 62, null)
      + hole(44, 85, g3) + hole(66, 85, null) + hole(88, 85, g4)
      + (landed ? disc : '')
      + "<path d='" + rr(22, 44, 84, 20, 10) + "' fill='url(#" + sh + ")'/>"
      + spec(36, 51, 8, 3, 0.55);
    return { defs, art, shadowRx: 48 };
  };

  // Minesweeper — a totally unbothered kawaii bomb, fizzing happily.
  ART.minesweeper = (a, f) => {
    const g1 = grad(), g2 = grad(), g3 = grad();
    const defs = ballGrad(g1, '#9d8ac8')
      + lg(g2, [[0, '#fff3c4'], [0.5, BUTTER], [1, '#e0b358']])
      + rg(g3, [[0, '#fffbe2'], [0.5, BUTTER], [1, '#ffc46a', 0]]);
    const s = f % 2 ? 1.3 : 0.95;
    const art =
      "<g transform='" + squash(f, 96) + "'>"
      // fat round body with kawaii face
      + "<circle cx='60' cy='68' r='28' fill='url(#" + g1 + ")'/>"
      + spec(49, 55, 9, 6.5, 0.6)
      + face(60, 68, f, 1, '#fff')
      // butter cap + fuse
      + "<g transform='rotate(36 76 42)'><path d='" + rr(69, 36, 15, 13, 6) + "' fill='url(#" + g2 + ")'/></g>"
      + "<path d='M81 40 q8 -9 15 -6' stroke='#cdbfe8' stroke-width='4.5' fill='none' stroke-linecap='round'/>"
      + '</g>'
      // pulsing spark star
      + "<g transform='translate(99,30) scale(" + s + ")'>"
      + "<circle r='8.5' fill='url(#" + g3 + ")' filter='url(#tglow)'/>"
      + "<path d='M0 -7 C1 -2 2 -1 7 0 C2 1 1 2 0 7 C-1 2 -2 1 -7 0 C-2 -1 -1 -2 0 -7 Z' fill='#fff'/>"
      + "<path d='M0 -4 C.6 -1.2 1.2 -.6 4 0 C1.2 .6 .6 1.2 0 4 C-.6 1.2 -1.2 .6 -4 0 C-1.2 -.6 -.6 -1.2 0 -4 Z' fill='" + BUTTER + "'/></g>";
    return { defs, art, shadowRx: 36 };
  };

  // Chess — a chubby porcelain pawn bouncing on a candy base, bead orbiting.
  ART.chess = (a, f) => {
    const base = pastel(a);
    const g1 = grad(), g2 = grad(), sh = grad();
    const o = orbit(f, 64, 44, 36, 10, 4.5, BLUSH, Math.PI * 0.25);
    const defs = marshGrad(g1) + bodyGrad(g2, shade(base, -26)) + sheenGrad(sh) + o.def;
    const art = (o.behind ? o.art : '')
      + "<g transform='" + squash(f, 98) + "'>"
      // fat head
      + "<circle cx='64' cy='42' r='17' fill='url(#" + g1 + ")'/>"
      + spec(58, 36, 6, 4.5, 0.9)
      // collar
      + "<path d='" + rr(47, 56, 34, 9.5, 4.75) + "' fill='url(#" + g1 + ")'/>"
      // plump body
      + "<path d='M54 65 q1.5 15 -10 24 h40 q-11.5 -9 -10 -24 z' fill='url(#" + g1 + ")'/>"
      // candy base
      + "<path d='" + rr(38, 87, 52, 13, 6.5) + "' fill='url(#" + g2 + ")'/>"
      + "<path d='" + rr(38, 87, 52, 6, 3) + "' fill='#fff' opacity='.5'/>"
      + '</g>'
      + (o.behind ? '' : o.art);
    return { defs, art, shadowRx: 34 };
  };

  // Paint — an inflated palette with candy paint wells; a fat brush dips.
  ART.paint = (a, f) => {
    const base = pastel(a);
    const g1 = grad(), g2 = grad(), sh = grad();
    const dip = Math.abs(Math.sin((f / FR) * Math.PI * 2)) * 6;
    const defs = marshGrad(g1) + bodyGrad(g2, base) + sheenGrad(sh);
    const well = (x, y, c) => "<circle cx='" + x + "' cy='" + y + "' r='7.5' fill='" + shade(c, -46) + "'/>"
      + "<circle cx='" + x + "' cy='" + (y - 1.2) + "' r='6.6' fill='" + c + "'/>"
      + "<ellipse cx='" + (x - 2) + "' cy='" + (y - 3.6) + "' rx='2.4' ry='1.7' fill='#fff' opacity='.9'/>";
    const art =
      "<g transform='" + squash(f, 98) + "'>"
      + "<path d='M64 36 c-28 0 -44 15 -44 32 c0 17 16 28 37 28 c9 0 9 -7.5 4.5 -12 c-4.5 -4.5 -1 -11 6.5 -11 c9 0 24 2.5 32 -6 c6.5 -7 2 -31 -36 -31 z' fill='#c3b4e2' transform='translate(2,3)'/>"
      + "<path d='M64 36 c-28 0 -44 15 -44 32 c0 17 16 28 37 28 c9 0 9 -7.5 4.5 -12 c-4.5 -4.5 -1 -11 6.5 -11 c9 0 24 2.5 32 -6 c6.5 -7 2 -31 -36 -31 z' fill='url(#" + g1 + ")'/>"
      + well(46, 58, BLUSH) + well(66, 50, BLUE) + well(85, 60, BUTTER) + well(41, 77, MINT)
      + spec(80, 78, 9, 4, 0.55)
      + '</g>'
      // chubby brush dipping
      + "<g transform='translate(92," + (30 + dip) + ") rotate(32)'>"
      + "<rect x='-4.5' y='-4' width='9' height='28' rx='4.5' fill='url(#" + g1 + ")'/>"
      + "<rect x='-5.5' y='-13' width='11' height='10' rx='3' fill='" + BUTTER + "'/><rect x='-5.5' y='-13' width='11' height='4.5' rx='2.2' fill='#fff' opacity='.6'/>"
      + "<path d='M-5.5 -13 q5.5 -14 11 0 z' fill='url(#" + g2 + ")'/>"
      + "<rect x='-3' y='-2' width='3.5' height='24' rx='1.7' fill='#fff' opacity='.5'/></g>";
    return { defs, art, shadowRx: 44 };
  };

  // Fortune — a golden kawaii cookie; its fortune slip (with a heart) peeks up.
  ART.fortune = (a, f) => {
    const g1 = grad(), g2 = grad(), g3 = grad();
    const lift = [0, 2.5, 5, 6, 4, 1.5][f];
    const defs = bodyGrad(g1, '#ffd98f') + ballGrad(g2, '#ffd98f') + marshGrad(g3);
    const art =
      // the slip rising from the fold
      "<g transform='translate(0," + (-lift) + ")'>"
      + "<path d='" + rr(53, 22, 22, 28, 5) + "' fill='url(#" + g3 + ")'/>"
      + "<path d='M64 36 c-4 -3.2 -2.7 -7 .1 -5.6 c2.8 -1.4 4.1 2.4 -.1 5.6 z' fill='" + CHEEK + "'/>"
      + "<path d='M58 42 h12' stroke='#c8bce4' stroke-width='2.4' stroke-linecap='round'/></g>"
      + "<g transform='" + squash(f, 92) + "'>"
      // the classic folded cookie: a tall round half-moon with a soft
      // double-hump lip (the two folded lobes) and a center crease
      + "<path d='M23 79 A41 41 0 0 1 105 79 Q105 83 100 83 Q82 73 64 86 Q46 73 28 83 Q23 83 23 79 Z' fill='url(#" + g2 + ")'/>"
      + "<path d='M28 83 Q46 73 64 86 Q82 73 100 83' fill='none' stroke='#dda746' stroke-width='4.5' stroke-linecap='round' opacity='.55'/>"
      + "<path d='M64 42 q-3.5 18 0 42' stroke='#c98f2e' stroke-width='2.8' fill='none' opacity='.35'/>"
      + spec(44, 54, 10, 7, 0.75) + spec(88, 58, 6, 4.5, 0.55)
      + face(48, 62, f, 0.92, '#8a5c1e')
      + '</g>';
    return { defs, art, shadowRx: 48 };
  };

  // Guestbook — an open marshmallow book, a fat blush heart beating on it.
  ART.guestbook = (a, f) => {
    const base = pastel(a);
    const g1 = grad(), g2 = grad(), g3 = grad();
    const hs = f % 2 ? 1.22 : 1;
    const o = orbit(f, 64, 60, 48, 12, 4, MINT, Math.PI * 1.35);
    const defs = marshGrad(g1) + lg(g2, [[0, '#fffdff'], [1, '#ddd0f0']]) + ballGrad(g3, '#ff8fb8') + o.def;
    const art = (o.behind ? o.art : '')
      + "<g transform='" + squash(f, 96) + "'>"
      // candy cover peeking below
      + "<path d='M20 48 Q42 34 64 48 L64 96 Q42 82 20 96 Z' fill='" + shade(base, -28) + "' transform='translate(-2.5,4.5)'/>"
      + "<path d='M108 48 Q86 34 64 48 L64 96 Q86 82 108 96 Z' fill='" + shade(base, -28) + "' transform='translate(2.5,4.5)'/>"
      // fat pages
      + "<path d='M22 46 Q43 33 64 46 L64 94 Q43 81 22 94 Z' fill='url(#" + g1 + ")'/>"
      + "<path d='M106 46 Q85 33 64 46 L64 94 Q85 81 106 94 Z' fill='url(#" + g2 + ")'/>"
      + "<path d='M64 46 V94' stroke='#bcabde' stroke-width='3'/>"
      + "<path d='M74 58 h20 M74 67 h15 M74 76 h18' stroke='#cfc0ea' stroke-width='3.6' stroke-linecap='round'/>"
      // beating heart
      + "<g transform='translate(43,66) scale(" + hs + ")'>"
      + "<path d='M0 10 C-12 1 -9 -11 0 -6.5 C9 -11 12 1 0 10 Z' fill='url(#" + g3 + ")'/>"
      + "<ellipse cx='-4' cy='-4' rx='2.8' ry='2' fill='#fff' opacity='.95'/></g>"
      + '</g>'
      + (o.behind ? '' : o.art);
    return { defs, art, shadowRx: 48 };
  };

  // Chat — two puffy bubbles; typing dots do the wave in the big one.
  ART.chat = (a, f) => {
    const base = pastel(a);
    const g1 = grad(), g2 = grad(), sh = grad();
    const defs = marshGrad(g1) + bodyGrad(g2, base) + sheenGrad(sh);
    const dots = [46, 61, 76].map((x, i) => {
      const on = (f % 3) === i;
      const dy = Math.sin(((f + i * 2) / 3) * Math.PI) * 2.2;
      return "<circle cx='" + x + "' cy='" + (54 - dy) + "' r='" + (on ? 5.4 : 4.6) + "' fill='" + (on ? shade(base, -22) : '#d5c9ec') + "'/>";
    }).join('');
    const art =
      "<g transform='" + squash(f, 96) + "'>"
      // big marshmallow bubble
      + "<path d='M32 28 h58 a16 16 0 0 1 16 16 v20 a16 16 0 0 1 -16 16 h-40 q-2 10 -14 14 q5 -7 3 -14 h-7 a16 16 0 0 1 -16 -16 v-20 a16 16 0 0 1 16 -16 z' fill='#c3b4e2' transform='translate(1.5,3)'/>"
      + "<path d='M32 28 h58 a16 16 0 0 1 16 16 v20 a16 16 0 0 1 -16 16 h-40 q-2 10 -14 14 q5 -7 3 -14 h-7 a16 16 0 0 1 -16 -16 v-20 a16 16 0 0 1 16 -16 z' fill='url(#" + g1 + ")'/>"
      + dots
      + "<path d='M32 28 h58 a16 16 0 0 1 16 16 v6 h-90 v-6 a16 16 0 0 1 16 -16 z' fill='url(#" + sh + ")'/>"
      + '</g>'
      // little accent reply bobs opposite
      + "<g transform='translate(0," + (-FLOAT[f] * 1.2) + ")'>"
      + "<path d='" + rr(74, 74, 36, 24, 12) + "' fill='url(#" + g2 + ")'/>"
      + "<path d='M84 96 q1 6 -4 10 q8 -3 10 -10 z' fill='" + shade(base, -20) + "'/>"
      + "<circle cx='85' cy='86' r='2.4' fill='#fff'/><circle cx='92' cy='86' r='2.4' fill='#fff'/><circle cx='99' cy='86' r='2.4' fill='#fff'/>"
      + "<path d='" + rr(74, 74, 36, 10, 5) + "' fill='#fff' opacity='.45'/></g>";
    return { defs, art, shadowRx: 46 };
  };

  // Chest — a squishy treasure chest with a face; the lid bounces, pearls pop.
  ART.chest = (a, f) => {
    const base = pastel(a);
    const g1 = grad(), g2 = grad(), g3 = grad(), sh = grad();
    const lift = [0, 2, 5, 6.5, 4, 1][f];
    const defs = bodyGrad(g1, base) + bodyGrad(g2, shade(base, -42))
      + lg(g3, [[0, '#fff3c4'], [0.5, BUTTER], [1, '#e0b358']]) + sheenGrad(sh);
    const p1 = pearl(46, 54 - lift * 1.4, 4.5, '#fff'), p2 = pearl(64, 51 - lift * 1.8, 5.5, BLUSH), p3 = pearl(82, 54 - lift * 1.4, 4, MINT);
    const art =
      // treasure glow
      "<ellipse cx='64' cy='" + (56 - lift / 2) + "' rx='30' ry='7' fill='" + BUTTER + "' opacity='" + (lift / 12) + "' filter='url(#tglow)'/>"
      + p1.def + p2.def + p3.def
      + p1.art + p2.art + p3.art
      // fat lid
      + "<g transform='translate(64," + (54 - lift) + ") rotate(" + (-lift * 1.1) + ")'>"
      + "<path d='M-40 6 v-4 q0 -21 40 -21 q40 0 40 21 v4 z' fill='url(#" + g1 + ")'/>"
      + "<path d='M-40 2 q0 -17 40 -17 q40 0 40 17' fill='none' stroke='#fff' stroke-width='4' opacity='.55'/>"
      + "<path d='M-28 5 v-15 M28 5 v-15' stroke='" + shade(base, -52) + "' stroke-width='4.5' stroke-linecap='round' opacity='.55'/>"
      + "<path d='" + rr(-8.5, -6, 17, 12, 5.5) + "' fill='url(#" + g3 + ")'/></g>"
      // fat base (deeper tone) with kawaii face
      + "<path d='M24 58 h80 v24 a14 14 0 0 1 -14 14 h-52 a14 14 0 0 1 -14 -14 z' fill='url(#" + g2 + ")'/>"
      + "<path d='M36 60 v34 M92 60 v34' stroke='" + shade(base, -68) + "' stroke-width='4.5' stroke-linecap='round' opacity='.5'/>"
      + "<path d='" + rr(53.5, 56, 21, 17, 6.5) + "' fill='url(#" + g3 + ")'/>"
      + "<circle cx='64' cy='62.5' r='2.5' fill='#a8781f'/><path d='M64 62.5 v6' stroke='#a8781f' stroke-width='2.8' stroke-linecap='round'/>"
      + face(64, 83, f, 0.85, '#fff')
      + "<path d='M24 58 h80 v9 h-80 z' fill='url(#" + sh + ")'/>";
    return { defs, art, shadowRx: 48 };
  };

  // Imposter — three squishy jellybeans; the accent one's eyes dart. Sus.
  ART.imposter = (a, f) => {
    const base = pastel(a);
    const g1 = grad(), g2 = grad(), sh = grad();
    const px = [-3, 0, 3.5, 0, -3, 0][f];
    const defs = lg(g1, [[0, '#fdfbff'], [0.45, '#efe8fa'], [1, '#bfaee0']]) + bodyGrad(g2, base) + sheenGrad(sh);
    const bean = (x, w, h, fill) =>
      "<path d='" + rr(x, 96 - h, w, h, w / 2) + "' fill='" + fill + "'/>"
      + "<path d='" + rr(x + 3, 99 - h, w - 6, h / 2.6, (w - 6) / 2) + "' fill='#fff' opacity='.45'/>";
    const art =
      bean(20, 26, 38, "url(#" + g1 + ")") + bean(82, 26, 34, "url(#" + g1 + ")")
      + "<g transform='" + squash(f, 96) + "'>"
      + bean(47, 34, 50, "url(#" + g2 + ")")
      // darting eyes + worried brows
      + "<circle cx='" + (58 + px) + "' cy='62' r='3' fill='" + INK + "'/><circle cx='" + (70 + px) + "' cy='62' r='3' fill='" + INK + "'/>"
      + "<circle cx='" + (59 + px) + "' cy='61' r='1' fill='#fff'/><circle cx='" + (71 + px) + "' cy='61' r='1' fill='#fff'/>"
      + "<path d='M60 70 h8' stroke='" + INK + "' stroke-width='2.6' stroke-linecap='round'/>"
      + "<ellipse cx='52' cy='67' rx='3' ry='2.1' fill='" + CHEEK + "' opacity='.7'/><ellipse cx='76' cy='67' rx='3' ry='2.1' fill='" + CHEEK + "' opacity='.7'/>"
      + '</g>'
      + "<text x='84' y='40' font-family='system-ui,sans-serif' font-size='22' font-weight='800' fill='" + shade(base, -46) + "' opacity='" + POP[f] + "'>?</text>";
    return { defs, art, shadowRx: 46 };
  };

  // Spy — a big candy magnifier sweeping over a trail of blush paw prints.
  ART.spy = (a, f) => {
    const base = pastel(a);
    const g1 = grad(), g2 = grad(), sh = grad();
    const mx = [0, 6, 12, 14, 8, 2][f];
    const defs = bodyGrad(g1, base)
      + rg(g2, [[0, '#eaf6ff', 0.92], [0.7, '#bfe2fb', 0.6], [1, '#93c6ee', 0.45]], 0.35, 0.3)
      + sheenGrad(sh);
    const paw = (x, y, s, o) => "<g transform='translate(" + x + ',' + y + ") scale(" + s + ")' opacity='" + o + "'>"
      + "<ellipse cx='0' cy='1.5' rx='3.6' ry='3' fill='" + CHEEK + "'/>"
      + "<circle cx='-3.4' cy='-2.6' r='1.5' fill='" + CHEEK + "'/><circle cx='0' cy='-3.6' r='1.5' fill='" + CHEEK + "'/><circle cx='3.4' cy='-2.6' r='1.5' fill='" + CHEEK + "'/></g>";
    const art =
      // paw trail wandering up-right
      paw(28, 92, 1, 0.85) + paw(44, 82, 1.05, 0.9) + paw(60, 74, 1.1, 0.95) + paw(76, 68, 1.15, 1)
      // fat magnifier
      + "<g transform='translate(" + (52 + mx) + ",56)'>"
      + "<g transform='rotate(45)'><path d='" + rr(-7, 24, 14, 30, 7) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(-7, 24, 6, 30, 3) + "' fill='#fff' opacity='.5'/></g>"
      + "<circle r='26' fill='url(#" + g2 + ")'/>"
      + "<circle r='26' fill='none' stroke='" + shade(base, -48) + "' stroke-width='9.5'/>"
      + "<circle r='26' fill='none' stroke='url(#" + g1 + ")' stroke-width='7'/>"
      + "<path d='M-15 -12 a19 19 0 0 1 11 -8' stroke='#fff' stroke-width='5' fill='none' stroke-linecap='round' opacity='.95'/>"
      + "<circle cx='9' cy='9' r='2.2' fill='#fff' opacity='.7'/>"
      + '</g>';
    return { defs, art, shadowRx: 42 };
  };

  // Tilt — a chubby phone rocking on its bottom corner; a ball rolls inside.
  ART.tilt = (a, f) => {
    const base = pastel(a);
    const g1 = grad(), g2 = grad(), g3 = grad(), sh = grad();
    const rot = [-11, -4, 5, 11, 4, -5][f];
    const bx = 64 - rot * 1.1;
    const defs = bodyGrad(g1, base)
      + lg(g2, [[0, '#6a578f'], [0.5, '#4f3f78'], [1, '#3b2e60']])
      + ballGrad(g3, BUTTER) + sheenGrad(sh);
    const art =
      "<g transform='rotate(" + rot + " 64 92)'>"
      + "<path d='" + rr(40, 26, 48, 68, 20) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(46, 36, 36, 48, 10) + "' fill='url(#" + g2 + ")'/>"
      // little ball rolling on the screen floor
      + "<circle cx='" + Math.max(52, Math.min(76, bx)) + "' cy='76' r='6' fill='url(#" + g3 + ")'/>"
      + "<circle cx='" + (Math.max(52, Math.min(76, bx)) - 1.8) + "' cy='73.8' r='1.8' fill='#fff' opacity='.95'/>"
      + "<path d='M50 40 L72 62 M60 38 L80 58' stroke='#8d7ab8' stroke-width='5' opacity='.45' stroke-linecap='round'/>"
      + "<circle cx='64' cy='89' r='2.8' fill='#fff' opacity='.6'/>"
      + "<path d='" + rr(40, 26, 48, 20, 16) + "' fill='url(#" + sh + ")'/>"
      + '</g>'
      + "<path d='M26 64 q-7 -11 1 -22 M102 64 q7 -11 -1 -22' stroke='" + shade(base, -28) + "' stroke-width='4.5' fill='none' stroke-linecap='round' opacity='" + (0.35 + POP[f] * 0.55) + "'/>";
    return { defs, art, shadowRx: 34 };
  };

  // The Dial — a marshmallow gauge with a pastel rainbow arc; needle hunts.
  ART.dial = (a, f) => {
    const base = pastel(a);
    const g1 = grad(), g2 = grad(), sh = grad();
    const ang = [-56, -24, 12, 42, 12, -24][f];
    const defs = marshGrad(g1) + ballGrad(g2, base) + sheenGrad(sh);
    const arc = (a1, a2, color) => {
      const R = 29, cx = 64, cy = 80;
      const p1 = [cx + Math.sin(a1 * Math.PI / 180) * R, cy - Math.cos(a1 * Math.PI / 180) * R];
      const p2 = [cx + Math.sin(a2 * Math.PI / 180) * R, cy - Math.cos(a2 * Math.PI / 180) * R];
      return "<path d='M" + p1[0] + ' ' + p1[1] + ' A' + R + ' ' + R + " 0 0 1 " + p2[0] + ' ' + p2[1] + "' stroke='" + color + "' stroke-width='11' fill='none' stroke-linecap='round'/>";
    };
    const art =
      "<g transform='" + squash(f, 96) + "'>"
      + "<path d='M22 88 a42 42 0 0 1 84 0 q0 8 -8 8 h-68 q-8 0 -8 -8 z' fill='#c3b4e2' transform='translate(1.5,3)'/>"
      + "<path d='M22 86 a42 42 0 0 1 84 0 q0 8 -8 8 h-68 q-8 0 -8 -8 z' fill='url(#" + g1 + ")'/>"
      + arc(-58, -22, MINT) + arc(-16, 16, BUTTER) + arc(22, 58, BLUSH)
      + "<g transform='rotate(" + ang + " 64 80)'>"
      + "<path d='M64 80 L64 56' stroke='" + INK + "' stroke-width='6' stroke-linecap='round'/>"
      + "<path d='M64 80 L64 58' stroke='#8d7ab8' stroke-width='2.6' stroke-linecap='round'/></g>"
      + "<circle cx='64' cy='80' r='7.5' fill='url(#" + g2 + ")'/><circle cx='62' cy='78' r='2.2' fill='#fff' opacity='.95'/>"
      + spec(42, 58, 8, 4.5, 0.6)
      + '</g>';
    return { defs, art, shadowRx: 46 };
  };

  // Party Roulette — fat dare cards fan out; the top one pops, bossy as ever.
  ART.roulette = (a, f) => {
    const base = pastel(a);
    const g1 = grad(), g2 = grad(), sh = grad();
    const pop = [0, -3, -6, -7.5, -5, -2][f];
    const defs = marshGrad(g1) + bodyGrad(g2, base) + sheenGrad(sh);
    const art =
      "<g transform='rotate(-12 50 70)'><path d='" + rr(26, 44, 42, 54, 12) + "' fill='" + LAV + "'/>"
      + "<path d='M40 60 c-4.5 -3.6 -3.2 -8.5 .5 -6.6 c3.7 -1.9 5 3 .5 6.6 z' fill='#fff' opacity='.8' transform='translate(6,10)'/></g>"
      + "<g transform='rotate(8 74 70)'><path d='" + rr(58, 42, 42, 54, 12) + "' fill='url(#" + g1 + ")'/></g>"
      + "<g transform='translate(0," + pop + ")'>"
      + "<path d='" + rr(42, 32, 44, 60, 13) + "' fill='url(#" + g2 + ")'/>"
      + "<path d='" + rr(42, 32, 44, 24, 12) + "' fill='url(#" + sh + ")'/>"
      + "<path d='M64 46 v20' stroke='#fff' stroke-width='8' stroke-linecap='round'/>"
      + "<circle cx='64' cy='79' r='4.6' fill='#fff'/>"
      + spec(52, 40, 6, 3, 0.7)
      + '</g>';
    return { defs, art, shadowRx: 42 };
  };

  // Fake Facts — a squishy face whose glossy nose grows… somebody's fibbing.
  ART.fakefacts = (a, f) => {
    const base = pastel(a);
    const g1 = grad(), g2 = grad();
    const nose = [8, 15, 23, 29, 21, 12][f];
    const px = [0, 1.5, 3, 3, 1.5, 0][f];
    const defs = ballGrad(g1, base) + lg(g2, [[0, shade(base, -8)], [1, shade(base, -52)]], false);
    const art =
      "<g transform='" + squash(f, 92) + "'>"
      + "<circle cx='50' cy='64' r='27' fill='url(#" + g1 + ")'/>"
      + spec(40, 50, 8.5, 6, 0.6)
      // shifty eyes + worried smile + cheeks
      + "<circle cx='" + (42 + px) + "' cy='60' r='3' fill='" + INK + "'/><circle cx='" + (57 + px) + "' cy='60' r='3' fill='" + INK + "'/>"
      + "<circle cx='" + (43 + px) + "' cy='59' r='1' fill='#fff'/><circle cx='" + (58 + px) + "' cy='59' r='1' fill='#fff'/>"
      + "<path d='M44 76 q3 -3.5 7 -1 q4 2.5 7 -1' stroke='" + INK + "' stroke-width='2.6' fill='none' stroke-linecap='round'/>"
      + "<ellipse cx='36' cy='68' rx='3.6' ry='2.5' fill='" + CHEEK + "' opacity='.75'/><ellipse cx='63' cy='69' rx='3.2' ry='2.2' fill='" + CHEEK + "' opacity='.7'/>"
      // the growing nose
      + "<rect x='70' y='58' width='" + nose + "' height='11' rx='5.5' fill='url(#" + g2 + ")'/>"
      + "<circle cx='" + (70 + nose - 4) + "' cy='63.5' r='5.5' fill='" + mixc(shade(base, -20), CHEEK, 0.55) + "'/>"
      + "<ellipse cx='" + (70 + nose - 5) + "' cy='61' rx='2.2' ry='1.6' fill='#fff' opacity='.85'/>"
      + "<rect x='72' y='59.5' width='" + (nose - 6) + "' height='3.5' rx='1.75' fill='#fff' opacity='.5'/>"
      + '</g>'
      // sweat drop at max stretch
      + "<path d='M38 34 q-4.5 7 0 9.5 q4.5 -2.5 0 -9.5 z' fill='" + BLUE + "' opacity='" + POP[f] + "' transform='translate(0," + (POP[f] * 3) + ")'/>";
    return { defs, art, shadowRx: 40 };
  };

  // One Clue — a fat glowing bulb with a heart filament and pearl screw base.
  ART.oneclue = (a, f) => {
    const g1 = grad(), g2 = grad(), g3 = grad();
    const on = [1, 0.7, 0.4, 0.25, 0.5, 0.85][f];
    const glass = mixc('#efe8fb', '#ffe27f', on);
    const defs = rg(g1, [[0, '#fffbe6'], [0.55, glass], [1, mixc('#cbbde4', '#f2b944', on)]], 0.4, 0.35)
      + lg(g2, [[0, '#f4eefc'], [0.5, '#cdc0e6'], [1, '#a493c8']])
      + rg(g3, [[0, '#ffedb0', 0.85], [1, BUTTER, 0]]);
    const art =
      "<circle cx='64' cy='52' r='36' fill='url(#" + g3 + ")' opacity='" + on + "'/>"
      + "<g transform='" + squash(f, 96) + "'>"
      // fat glass ball
      + "<circle cx='64' cy='52' r='26' fill='url(#" + g1 + ")'/>"
      // heart filament
      + "<path d='M64 60 C55 53 57.5 44 64 47.5 C70.5 44 73 53 64 60 Z' fill='none' stroke='" + mixc('#b0a0cc', '#e8963c', on) + "' stroke-width='3' stroke-linejoin='round'/>"
      + "<path d='M58 66 q6 4 12 0 l-1.5 8 h-9 z' fill='url(#" + g1 + ")'/>"
      + spec(54, 42, 7, 5, 0.85)
      // pearl screw base
      + "<path d='" + rr(52, 74, 24, 6.5, 3.2) + "' fill='url(#" + g2 + ")'/>"
      + "<path d='" + rr(53.5, 82, 21, 6.5, 3.2) + "' fill='url(#" + g2 + ")'/>"
      + "<path d='" + rr(56, 90, 16, 6.5, 3.2) + "' fill='url(#" + g2 + ")'/>"
      + '</g>'
      // rays when bright
      + "<g opacity='" + on + "'><path d='M30 26 l6 6 M98 26 l-6 6 M64 12 v8 M22 52 h8 M98 52 h8' stroke='" + BUTTER + "' stroke-width='5' stroke-linecap='round'/></g>";
    return { defs, art, shadowRx: 32 };
  };

  // Same Brain — two squishy heads sharing the same sparkly thought.
  ART.samebrain = (a, f) => {
    const base = pastel(a);
    const g1 = grad(), g2 = grad(), g3 = grad();
    const ss = 0.9 + POP[f] * 0.45;
    const defs = ballGrad(g1, base) + marshGrad(g2) + ballGrad(g3, BUTTER);
    const art =
      "<g transform='" + squash(f, 92) + "'>"
      + "<circle cx='42' cy='68' r='24' fill='url(#" + g2 + ")'/>"
      + "<circle cx='86' cy='68' r='24' fill='url(#" + g1 + ")'/>"
      + spec(34, 56, 7, 5, 0.75) + spec(78, 56, 7, 5, 0.6)
      + face(42, 68, f, 0.85) + face(86, 68, f, 0.85)
      + '</g>'
      // the one shared idea, striking both at once
      + "<path d='M46 38 q-4 7 2 11 M82 38 q4 7 -2 11' stroke='#c8bce4' stroke-width='4' fill='none' stroke-linecap='round'/>"
      + "<g transform='translate(64,28) scale(" + ss + ")'>"
      + "<circle r='9' fill='url(#" + g3 + ")'/>"
      + "<circle cx='-2.6' cy='-3' r='2.6' fill='#fff' opacity='.95'/>"
      + "<path d='M0 -13 v-4 M11 -8 l3 -3 M-11 -8 l-3 -3' stroke='" + BUTTER + "' stroke-width='3.5' stroke-linecap='round' opacity='" + POP[f] + "'/></g>";
    return { defs, art, shadowRx: 48 };
  };

  // Wolves — a sleepy kawaii moon over a chubby plum wolf, howling softly.
  ART.wolves = (a, f) => {
    const g1 = grad(), g2 = grad();
    const howl = [0, -2, -4, -5, -3, -1][f];
    const glow = [0.4, 0.55, 0.75, 0.85, 0.65, 0.5][f];
    const defs = ballGrad(g1, '#ffe6a0') + lg(g2, [[0, '#9c88c2'], [0.55, '#7c68a4'], [1, '#5f4d85']]);
    const star = (x, y, s, o) => "<g transform='translate(" + x + ',' + y + ") scale(" + s + ")' opacity='" + o + "'>"
      + "<path d='M0 -4 C.6 -1.2 1.2 -.6 4 0 C1.2 .6 .6 1.2 0 4 C-.6 1.2 -1.2 .6 -4 0 C-1.2 -.6 -.6 -1.2 0 -4 Z' fill='#fff'/></g>";
    const art =
      // sleepy moon
      "<circle cx='88' cy='40' r='24' fill='" + BUTTER + "' opacity='" + glow + "' filter='url(#tglow)'/>"
      + "<circle cx='88' cy='40' r='18' fill='url(#" + g1 + ")'/>"
      + spec(81, 33, 5.5, 4, 0.8)
      + "<path d='M81 42 q2.6 2.6 5.2 0 M91 42 q2.6 2.6 5.2 0' stroke='#c99f3e' stroke-width='2.4' fill='none' stroke-linecap='round'/>"
      + "<path d='M86 48.5 q2 2 4 0' stroke='#c99f3e' stroke-width='2.2' fill='none' stroke-linecap='round'/>"
      + "<ellipse cx='78.5' cy='46' rx='2.6' ry='1.8' fill='" + CHEEK + "' opacity='.75'/><ellipse cx='97.5' cy='46' rx='2.6' ry='1.8' fill='" + CHEEK + "' opacity='.75'/>"
      + star(30, 26, 1.3, 0.95) + star(46, 44, 0.9, 0.7) + star(112, 68, 1, 0.8)
      // chubby wolf, muzzle up mid-howl
      + "<g transform='rotate(" + howl + " 46 96)'>"
      // body + head with two pointy ears and a raised snout
      + "<path d='M24 96 q-3 -19 8 -29 q-1 -4 -4 -14 q7 3 11 8 q2 -1.5 5 -1.5 q1 -6 6 -12 q4 5 4.5 11 q6 2 10 7 l9 -6 q-1 8 -5 12 q4 7 3 15 l-4 9.5 z' fill='url(#" + g2 + ")'/>"
      // inner ears
      + "<path d='M31 60 l4.5 5 M52 53 l-2 5.5' stroke='" + CHEEK + "' stroke-width='3.5' stroke-linecap='round' opacity='.9'/>"
      // snout ridge + nose bead
      + "<path d='M62 66 q6 -3.5 10.5 -9' stroke='#4e3e70' stroke-width='5' stroke-linecap='round' fill='none'/>"
      + "<circle cx='73.5' cy='55.5' r='3' fill='#4e3e70'/><circle cx='72.6' cy='54.6' r='1' fill='#cbbde4'/>"
      // closed happy eye + cheek
      + "<path d='M44 70 q3 3 6 0' stroke='#efe6fb' stroke-width='2.6' fill='none' stroke-linecap='round'/>"
      + "<ellipse cx='38' cy='76' rx='3.2' ry='2.2' fill='" + CHEEK + "' opacity='.85'/>"
      + '</g>'
      // little sleepy zzz drifting from the moon
      + "<text x='108' y='" + (30 - f) + "' font-family='system-ui,sans-serif' font-size='11' font-weight='800' fill='#c8bce4' opacity='" + (0.4 + POP[f] * 0.5) + "'>z</text>";
    return { defs, art, shadowRx: 42 };
  };

  // ---- letter fallback: embossed letter on a squishy marshmallow tile -------
  function fallbackArt(letter, a, f) {
    const base = pastel(a);
    const g1 = grad(), sh = grad();
    const o = orbit(f, 64, 64, 48, 14, 4.5, '#fff', Math.PI * 0.15);
    const defs = bodyGrad(g1, base) + sheenGrad(sh) + o.def;
    const art = (o.behind ? o.art : '')
      + "<g transform='" + squash(f, 98) + "'>"
      + "<path d='" + rr(28, 30, 72, 68, 26) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(28, 30, 72, 32, 24) + "' fill='url(#" + sh + ")'/>"
      + "<text x='64' y='81' font-family='ui-rounded,system-ui,sans-serif' font-size='42' font-weight='800' fill='" + shade(base, -52) + "' text-anchor='middle' opacity='.55'>" + letter + '</text>'
      + "<text x='64' y='79' font-family='ui-rounded,system-ui,sans-serif' font-size='42' font-weight='800' fill='#fff' text-anchor='middle'>" + letter + '</text>'
      + spec(44, 40, 8, 4, 0.6)
      + '</g>'
      + (o.behind ? '' : o.art);
    return { defs, art, shadowRx: 42 };
  }

  GifOS.iconPacks.register('toybox', {
    size: SIZE, frames: FR, delayCs: DELAY, dither: 12,
    draw(subject, accent) {
      const builder = ART[subject];
      if (!builder) return null;
      return range(FR).map((f) => { const r = builder(accent, f); return shell(r.defs, r.art, f, r.shadowRx, r.shadowCy); });
    },
    fallback(letter, accent) {
      return range(FR).map((f) => { const r = fallbackArt(letter, accent, f); return shell(r.defs, r.art, f, r.shadowRx, r.shadowCy); });
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
