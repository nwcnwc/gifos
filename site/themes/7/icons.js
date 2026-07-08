/*
 * gifos-pack-sevens.js — "Lucky Sevens", the gamers/night-owls computer
 * (7.gifos.app). Neon glitch on near-black.
 *
 * Every icon is a stroke-only NEON TUBE SIGN mounted on a dark rounded
 * backing plate. Each tube is three layered strokes — a wide blurred glow,
 * a medium saturated stroke, and a thin near-white core — which is what
 * makes neon read as neon. Dual tube colors: hot magenta and electric cyan.
 * Garnish: chromatic-offset glitch ghosts on 1–2 frames, slice displacement,
 * marquee bulbs, tick dashes, lucky 7s and casino trim.
 *
 * Fully procedural SVG. 160px raster, 7 frames, 10cs.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  if (!GifOS.iconPacks) return;

  const FR = 7, SIZE = 160, DELAY = 13;
  const range = (n) => Array.from({ length: n }, (_, i) => i);

  // ---- the sign palette -----------------------------------------------------
  const MAG = '#ff2fd6';   // hot magenta tube
  const CYN = '#39e6ff';   // electric cyan tube
  const CORE = '#fff0ff';  // near-white tube core
  const PLATE = '#0a0210'; // sign board
  // Accent [r,g,b] biases which tube leads: warm accents lean magenta,
  // cool accents lean cyan. Returns [primary, secondary].
  const lean = (a) => (a[0] >= a[2] ? [MAG, CYN] : [CYN, MAG]);

  // ---- unique ids (clip paths etc.) ----------------------------------------
  let uid = 0;
  const nid = () => 'n' + (uid++);

  // ---- neon building blocks -------------------------------------------------
  // A tube: wide transparent glow + saturated stroke + near-white core.
  function tube(d, c, w, o) {
    w = w || 3; o = o == null ? 1 : o;
    if (o <= 0.02) return '';
    return "<g fill='none' stroke-linecap='round' stroke-linejoin='round'>"
      + "<path d='" + d + "' stroke='" + c + "' stroke-width='" + (w * 3.4) + "' opacity='" + (0.3 * o).toFixed(3) + "' filter='url(#ng)'/>"
      + "<path d='" + d + "' stroke='" + c + "' stroke-width='" + (w * 1.55) + "' opacity='" + (0.85 * o).toFixed(3) + "'/>"
      + "<path d='" + d + "' stroke='" + CORE + "' stroke-width='" + (w * 0.6) + "' opacity='" + o + "'/></g>";
  }
  // A neon bulb / dot.
  function dot(x, y, r, c, o) {
    o = o == null ? 1 : o;
    if (o <= 0.02) return '';
    return "<circle cx='" + x + "' cy='" + y + "' r='" + (r * 2.4) + "' fill='" + c + "' opacity='" + (0.3 * o).toFixed(3) + "' filter='url(#ng)'/>"
      + "<circle cx='" + x + "' cy='" + y + "' r='" + r + "' fill='" + c + "' opacity='" + (0.9 * o).toFixed(3) + "'/>"
      + "<circle cx='" + x + "' cy='" + y + "' r='" + (r * 0.45) + "' fill='" + CORE + "' opacity='" + o + "'/>";
  }
  // Chromatic-offset glitch ghost of a path: red/blue separated low-opacity
  // copies. Only emitted on the given frames.
  function ghost(d, w, f, frames, dx) {
    if (frames.indexOf(f) < 0) return '';
    dx = dx || 2;
    return "<g fill='none' stroke-linecap='round' stroke-linejoin='round'>"
      + "<path d='" + d + "' stroke='#ff2840' stroke-width='" + w + "' opacity='.4' transform='translate(-" + dx + ",0)'/>"
      + "<path d='" + d + "' stroke='#2f6bff' stroke-width='" + w + "' opacity='.4' transform='translate(" + dx + ",0)'/></g>";
  }
  // Slice displacement: re-draw a thin horizontal band of the art shifted.
  // Returns {defs, art}; caller merges. Only used on glitch frames.
  function slice(artStr, y, h, dx) {
    const id = nid();
    return {
      defs: "<clipPath id='" + id + "'><rect x='0' y='" + y + "' width='128' height='" + h + "'/></clipPath>",
      art: "<g clip-path='url(#" + id + ")' transform='translate(" + dx + ",0)' opacity='.85'>" + artStr + '</g>',
    };
  }
  // Tiny floating tick dashes beside a sign (garnish).
  function ticks(x, y, c, f, ph) {
    const o = [0.9, 0.35, 0.7, 0.2, 0.85, 0.4, 0.65][(f + (ph || 0)) % FR];
    return tube('M' + x + ' ' + y + ' h5', c, 1.5, o)
      + tube('M' + (x + 2) + ' ' + (y + 6) + ' h5', c, 1.5, o * 0.6);
  }
  // Marquee bulbs chasing around the plate border.
  function marquee(f, box, c1, c2) {
    const [x, y, w, h] = box, inset = 6.5;
    const pts = [];
    const n = 6; // bulbs per edge
    for (let i = 1; i < n; i++) pts.push([x + inset + (w - 2 * inset) * (i / n), y + inset]);
    for (let i = 1; i < n; i++) pts.push([x + w - inset, y + inset + (h - 2 * inset) * (i / n)]);
    for (let i = 1; i < n; i++) pts.push([x + w - inset - (w - 2 * inset) * (i / n), y + h - inset]);
    for (let i = 1; i < n; i++) pts.push([x + inset, y + h - inset - (h - 2 * inset) * (i / n)]);
    return pts.map((p, i) => {
      const lit = (i + f) % 3 === 0;
      return dot(p[0], p[1], lit ? 2 : 1.3, lit ? c1 : c2, lit ? 1 : 0.35);
    }).join('');
  }
  // 4-point neon star spark.
  function star(x, y, s, c, o) {
    if (o <= 0.02) return '';
    const d = 'M' + x + ' ' + (y - s) + ' Q' + (x + s * 0.18) + ' ' + (y - s * 0.18) + ' ' + (x + s) + ' ' + y
      + ' Q' + (x + s * 0.18) + ' ' + (y + s * 0.18) + ' ' + x + ' ' + (y + s)
      + ' Q' + (x - s * 0.18) + ' ' + (y + s * 0.18) + ' ' + (x - s) + ' ' + y
      + ' Q' + (x - s * 0.18) + ' ' + (y - s * 0.18) + ' ' + x + ' ' + (y - s) + ' Z';
    return tube(d, c, 1.6, o);
  }

  // ---- motion tables (7 frames) ---------------------------------------------
  const BREATH = [0.8, 0.9, 1, 0.92, 0.82, 0.9, 1];         // glow breathing
  const BUZZ = [1, 1, 1, 0.15, 0.65, 1, 1];                  // segment cuts out, buzzes back
  const BUZZ2 = [1, 0.5, 1, 1, 0.15, 1, 0.8];                // alternate buzz
  const FLICK_ON = [0.12, 0.8, 0.25, 1, 0.9, 1, 1];          // sign powering on
  const chase = (i, n, f, dim) => ((f % n) === i ? 1 : (dim == null ? 0.4 : dim));

  // ---- frame shell: filters + backing plate + art ---------------------------
  function shell(defs, art, box) {
    box = box || [14, 14, 100, 100];
    const [x, y, w, h] = box;
    return "<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'>"
      + '<defs>'
      + "<filter id='ng' x='-150%' y='-150%' width='400%' height='400%'><feGaussianBlur stdDeviation='2.6'/></filter>"
      + "<filter id='ng2' x='-150%' y='-150%' width='400%' height='400%'><feGaussianBlur stdDeviation='5'/></filter>"
      + defs + '</defs>'
      // the sign board
      + "<rect x='" + x + "' y='" + y + "' width='" + w + "' height='" + h + "' rx='16' fill='" + PLATE + "' opacity='.87'/>"
      + "<rect x='" + (x + 1) + "' y='" + (y + 1) + "' width='" + (w - 2) + "' height='" + (h - 2) + "' rx='15' fill='none' stroke='#3a1450' stroke-width='1.4' opacity='.9'/>"
      + art + '</svg>';
  }

  // rounded-rect path helper (stroke-only signs love these)
  const rr = (x, y, w, h, r) => 'M' + (x + r) + ' ' + y + ' h' + (w - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r
    + ' v' + (h - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 -' + r + ' ' + r + ' h-' + (w - 2 * r)
    + ' a' + r + ' ' + r + ' 0 0 1 -' + r + ' -' + r + ' v-' + (h - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' -' + r + ' z';

  // ---- subjects -------------------------------------------------------------
  const ART = {};

  // Notes — neon notepad: cyan pad outline, magenta ruled lines that light up
  // top-to-bottom like a marquee; spiral ticks buzz.
  ART.notes = (a, f) => {
    const [P, S] = lean(a);
    const pad = rr(40, 34, 48, 62, 8);
    let defs = '';
    let art = tube(pad, S, 2.6, BREATH[f])
      + tube('M40 46 h48', S, 2, 0.85)
      + range(3).map((i) => "<g>" + tube('M48 ' + (58 + i * 13) + ' h' + [32, 24, 30][i], P, 2.4, chase(i, 3, f, 0.5)) + '</g>').join('')
      + range(4).map((i) => tube('M' + (48 + i * 11) + ' 29 v9', P, 1.8, BUZZ[(f + i) % FR])).join('')
      + ticks(96, 40, P, f, 2);
    art += ghost(pad, 1.6, f, [3]);
    return { defs, art };
  };

  // Tic-tac-toe — cyan grid; magenta X steady, cyan O is the classic broken
  // tube that cuts out and buzzes back.
  ART.tictactoe = (a, f) => {
    const grid = 'M55 38 v52 M73 38 v52 M38 55 h52 M38 73 h52';
    const X = 'M41 41 L51 51 M51 41 L41 51';
    const O = 'M82 82 m-6.5 0 a6.5 6.5 0 1 0 13 0 a6.5 6.5 0 1 0 -13 0';
    let art = tube(grid, CYN, 2.2, BREATH[f])
      + tube(X, MAG, 2.8, 1)
      + tube(O, MAG, 2.8, BUZZ[f])
      + tube('M59 60 L69 70 M69 60 L59 70', MAG, 2.2, 0.28)
      + ghost(X, 1.8, f, [5]);
    return { defs: '', art };
  };

  // Connect 4 — neon ring grid; a magenta ring drops down the middle column
  // and lands with a flash.
  ART.connect4 = (a, f) => {
    const ringD = (x, y, r) => 'M' + x + ' ' + y + ' m-' + r + ' 0 a' + r + ' ' + r + ' 0 1 0 ' + (2 * r) + ' 0 a' + r + ' ' + r + ' 0 1 0 -' + (2 * r) + ' 0';
    const cols = [46, 64, 82], rows = [59, 79];
    const dropY = [24, 32, 42, 59, 79, 79, 79][f];
    const landed = f >= 4;
    let art = tube(rr(32, 45, 64, 48, 9), CYN, 2.4, BREATH[f]);
    for (const x of cols) for (const y of rows) {
      const isTarget = x === 64 && y === 79;
      if (isTarget && landed) continue;
      const filled = (x === 46 && y === 79) || (x === 82 && y === 79);
      art += tube(ringD(x, y, 6.5), filled ? MAG : CYN, filled ? 2.2 : 1.4, filled ? 0.95 : 0.25);
    }
    art += tube(ringD(64, dropY, 6.5), MAG, 2.4, landed ? (f === 4 ? 1 : 0.95) : 0.95);
    if (f === 4) art += star(64, 64, 5, CYN, 1);
    return { defs: '', art };
  };

  // Minesweeper — a neon bomb: magenta body, cyan fuse, sparking star that
  // fizzes bigger and pops with a glitch.
  ART.minesweeper = (a, f) => {
    const body = 'M58 72 m-20 0 a20 20 0 1 0 40 0 a20 20 0 1 0 -40 0';
    const sparkS = [2.5, 4, 3, 5.5, 3.5, 6.5, 3][f];
    let art = tube(body, MAG, 2.8, BREATH[f])
      + tube('M70 55 l6 -7', MAG, 2.4, 1)
      + tube('M76 48 q8 -10 16 -8', CYN, 2, 1)
      + star(94, 38, sparkS, CYN, [0.9, 1, 0.8, 1, 0.85, 1, 0.7][f])
      + dot(94, 38, 1.6, CORE, f % 2 ? 1 : 0.6)
      + tube('M52 66 a8 8 0 0 1 4 -4', CYN, 1.6, 0.7)
      + ghost(body, 1.8, f, [5], 2.5);
    return { defs: '', art };
  };

  // Chess — a neon pawn; the head tube cuts out and buzzes back.
  ART.chess = (a, f) => {
    const head = 'M64 43 m-10 0 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0';
    const body = 'M53 58 h22 M58 61 q1 12 -8 22 M70 61 q-1 12 8 22';
    const base = 'M46 89 h36';
    let art = tube(head, CYN, 2.6, BUZZ[f])
      + tube(body, CYN, 2.6, 1)
      + tube(base, MAG, 3, BREATH[f])
      + ticks(90, 40, MAG, f)
      + ghost(base, 2, f, [2]);
    return { defs: '', art };
  };

  // Paint — neon palette outline; three paint-well bulbs chase.
  ART.paint = (a, f) => {
    const blob = 'M64 36 c-21 0 -34 12 -34 27 c0 14 12 23 28 23 c7 0 7 -6 3.5 -10 c-3 -3.5 -1 -8.5 6 -8.5 c7 0 18 2 24 -4.5 c6 -6.5 2 -27 -27.5 -27 z';
    let art = tube(blob, CYN, 2.6, BREATH[f])
      + dot(48, 54, 3.4, MAG, chase(0, 3, f))
      + dot(63, 48, 3.4, CYN, chase(1, 3, f))
      + dot(78, 56, 3.4, MAG, chase(2, 3, f))
      + ticks(94, 78, MAG, f, 1)
      + ghost(blob, 1.8, f, [4]);
    return { defs: '', art };
  };

  // Calculator — magenta body, cyan screen showing slot-machine 7s that light
  // one by one; button bulbs.
  ART.calc = (a, f) => {
    const body = rr(40, 30, 48, 68, 9);
    const seven = (x, y) => 'M' + x + ' ' + y + ' h8 l-5.5 11';
    let art = tube(body, MAG, 2.6, BREATH[f])
      + tube(rr(46, 37, 36, 15, 3), CYN, 1.8, 0.85);
    const lit = f % 4;
    for (let i = 0; i < 3; i++) art += tube(seven(51 + i * 11, 40.5), CYN, 1.8, i < lit ? 1 : 0.18);
    let i = 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++, i++) {
      art += dot(52 + c * 12, 64 + r * 11, 2, i === (f * 2) % 9 ? MAG : CYN, i === (f * 2) % 9 ? 1 : 0.35);
    }
    art += ghost(body, 1.6, f, [6]);
    return { defs: '', art };
  };

  // Stopwatch — cyan case, magenta hand sweeping a full lap over the loop.
  ART.timer = (a, f) => {
    const face = 'M64 68 m-26 0 a26 26 0 1 0 52 0 a26 26 0 1 0 -52 0';
    const ang = f * (360 / FR);
    let art = tube(face, CYN, 2.6, BREATH[f])
      + tube('M58 30 h12 M64 31 v9', CYN, 2.4, 1)
      + range(4).map((i) => {
        const t = i * Math.PI / 2;
        return tube('M' + (64 + Math.sin(t) * 21) + ' ' + (68 - Math.cos(t) * 21) + ' L' + (64 + Math.sin(t) * 17) + ' ' + (68 - Math.cos(t) * 17), CYN, 1.6, 0.7);
      }).join('')
      + "<g transform='rotate(" + ang + " 64 68)'>" + tube('M64 68 V50', MAG, 2.8, 1) + '</g>'
      + dot(64, 68, 2.4, MAG, 1)
      + ghost(face, 1.6, f, [2]);
    return { defs: '', art };
  };

  // Fortune — neon cookie sign with a twinkling lucky star; the fold lip
  // buzzes like an old sign.
  ART.fortune = (a, f) => {
    // half-moon cookie on its flat side, fold crease down the middle, the
    // paper fortune sliding out underneath.
    const cookie = 'M26 72 A36 31 0 0 1 98 72 Z';
    const slide = [0, 2, 4, 5, 4, 2, 0][f];
    const slip = 'M84 70 l' + (12 + slide) + ' -4 l2 6 l-' + (12 + slide) + ' 4 z';
    let art = tube(slip, CYN, 1.6, 0.95)
      + tube('M88 71 l' + (6 + slide) + ' -2', CYN, 1, 0.8)
      + tube(cookie, MAG, 2.7, BREATH[f])
      + tube('M62 46 V70', MAG, 1.6, BUZZ2[f] * 0.6)
      + star(100, 40, [4, 5.5, 4.5, 6, 4, 5, 4.5][f], CYN, [0.7, 1, 0.8, 1, 0.75, 1, 0.85][f])
      + dot(44, 60, 1.3, MAG, 0.5) + dot(78, 56, 1.1, MAG, 0.4)
      + ghost(cookie, 1.8, f, [4]);
    return { defs: '', art };
  };

  // Guestbook — open neon book, a magenta heart beating above the spine.
  ART.guestbook = (a, f) => {
    const left = 'M28 52 Q46 42 64 52 L64 90 Q46 80 28 90 Z';
    const right = 'M100 52 Q82 42 64 52 M64 90 Q82 80 100 90 L100 52';
    const hs = [1, 1.14, 1, 0.94, 1.1, 1, 1.05][f];
    const heart = 'M0 6 C-8 -1 -6 -9 0 -5 C6 -9 8 -1 0 6 Z';
    let art = tube(left, CYN, 2.4, BREATH[f])
      + tube(right, CYN, 2.4, BREATH[(f + 3) % FR])
      + tube('M64 52 V90', CYN, 1.8, 0.8)
      + tube('M36 62 h18 M36 70 h14', CYN, 1.4, 0.35)
      + "<g transform='translate(82,66) scale(" + hs + ")'>" + tube(heart, MAG, 2.2 / hs, 1) + '</g>'
      + ticks(30, 36, MAG, f);
    return { defs: '', art };
  };

  // Chat — big cyan bubble with chasing dots; small magenta bubble buzzes in
  // to reply.
  ART.chat = (a, f) => {
    const big = 'M38 34 h44 a10 10 0 0 1 10 10 v16 a10 10 0 0 1 -10 10 h-26 l-10 10 v-10 h-8 a10 10 0 0 1 -10 -10 v-16 a10 10 0 0 1 10 -10 z';
    const small = rr(72, 76, 26, 17, 8.5);
    let art = tube(big, CYN, 2.4, BREATH[f])
      + range(3).map((i) => dot(50 + i * 10, 52, 2.4, MAG, chase(i, 3, f, 0.3))).join('')
      + tube(small, MAG, 2.2, FLICK_ON[f])
      + (FLICK_ON[f] > 0.5 ? dot(80, 84.5, 1.5, CYN, 0.9) + dot(86, 84.5, 1.5, CYN, 0.9) + dot(92, 84.5, 1.5, CYN, 0.9) : '')
      + ghost(big, 1.6, f, [5]);
    return { defs: '', art };
  };

  // Folder — magenta folder sign; the tab segment is the flickering tube.
  ART.folder = (a, f) => {
    const bodyD = 'M30 50 v34 a8 8 0 0 0 8 8 h52 a8 8 0 0 0 8 -8 v-28 a6 6 0 0 0 -6 -6 h-34';
    const tabD = 'M30 50 v-8 a6 6 0 0 1 6 -6 h16 l6 8';
    let art = tube(bodyD, MAG, 2.6, BREATH[f])
      + tube(tabD, MAG, 2.6, BUZZ[f])
      + tube('M30 62 h68', CYN, 1.8, 0.55)
      + ticks(96, 30, CYN, f)
      + ghost(bodyD, 1.8, f, [3]);
    return { defs: '', art };
  };

  // Stolen Apps — a neon VAULT: magenta safe, cyan door ring, the handle
  // wheel spins.
  ART.chest = (a, f) => {
    const safe = rr(34, 34, 60, 60, 10);
    const ring = 'M64 64 m-17 0 a17 17 0 1 0 34 0 a17 17 0 1 0 -34 0';
    const ang = f * (360 / FR);
    let art = tube(safe, MAG, 2.6, BREATH[f])
      + tube(ring, CYN, 2.2, 1)
      + "<g transform='rotate(" + ang + " 64 64)'>"
      + tube('M64 64 V52 M64 64 L53.6 70 M64 64 L74.4 70', CYN, 2.2, 1)
      + '</g>'
      + dot(64, 64, 2.6, MAG, 1)
      + dot(41, 41, 1.4, CYN, 0.5) + dot(87, 41, 1.4, CYN, 0.5)
      + dot(41, 87, 1.4, CYN, 0.5) + dot(87, 87, 1.4, CYN, 0.5)
      + ghost(ring, 1.6, f, [1]);
    return { defs: '', art };
  };

  // Video call — the HERO: cyan camera sign, magenta lens, blinking REC bulb,
  // marquee corner ticks, slice glitch that heals.
  ART.video = (a, f) => {
    // Meeting in neon: a screen framing a 2x2 grid of glowing participant
    // tubes; the magenta "speaking" glow chases from tile to tile.
    const screen = rr(24, 44, 56, 46, 9);
    const tile = (x, y, glow) => tube(rr(x, y, 20, 15, 4), CYN, 2.2, glow)
      + tube('M' + (x + 10) + ' ' + (y + 6) + ' m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0', MAG, 1.8, glow)
      + tube('M' + (x + 4.5) + ' ' + (y + 13) + ' a5.5 4 0 0 1 11 0', MAG, 1.6, glow * 0.8);
    const gx = 30, gy = 50, tw = 20, thh = 15, gp = 4, act = f % 4;
    const cells = [[gx, gy], [gx + tw + gp, gy], [gx, gy + thh + gp], [gx + tw + gp, gy + thh + gp]];
    let defs = '';
    let core = tube(screen, CYN, 2.6, BREATH[f])
      + cells.map((c, i) => tile(c[0], c[1], i === act ? 1 : 0.28)).join('')
      + dot(72, 40, 2.4, MAG, f % 2 ? 1 : 0.25);
    let art = core + ticks(98, 88, MAG, f, 3) + ghost(screen, 1.8, f, [2, 5], 2.5);
    if (f === 2) { const s = slice(core, 58, 7, 4); defs += s.defs; art += s.art; }
    return { defs, art };
  };

  // Imposter — three capsule crewmates; the magenta one jitters with a
  // chromatic split. Sus.
  ART.imposter = (a, f) => {
    // crewmate: capsule body with a leg notch, so it reads as a little guy
    const crew = (x, y, w, h) => {
      const r = w / 2, leg = w * 0.32;
      return 'M' + x + ' ' + y + ' v-' + (h - r) + ' a' + r + ' ' + r + ' 0 0 1 ' + w + ' 0 v' + (h - r)
        + ' h-' + leg + ' v-' + (h * 0.18) + ' h-' + (w - 2 * leg) + ' v' + (h * 0.18) + ' z';
    };
    const jx = [0, 0, 2.5, -2.5, 0, 1.5, 0][f];
    const mid = crew(52, 92, 24, 40);
    let art = tube(crew(28, 90, 18, 28), CYN, 2, 0.8)
      + tube('M35 70 h9', CYN, 2.2, 0.8)
      + tube(crew(84, 90, 18, 26), CYN, 2, 0.8)
      + tube('M91 72 h9', CYN, 2.2, 0.8)
      + "<g transform='translate(" + jx + ",0)'>"
      + tube(mid, MAG, 2.5, 1)
      + tube('M59 64 h11', CYN, 2.8, 1)
      + '</g>'
      + (jx !== 0 ? ghost(mid, 1.8, f, [f], 3) : '')
      + tube('M78 42 q1 -8 8 -8 q7 0 7 6 q0 5 -7 7', MAG, 1.8, [0.2, 0.9, 0.4, 1, 0.3, 0.9, 0.5][f])
      + dot(86, 54, 1.3, MAG, [0.2, 0.9, 0.4, 1, 0.3, 0.9, 0.5][f]);
    return { defs: '', art };
  };

  // Spy — a neon magnifier; a magenta scan arc sweeps around inside the lens.
  ART.spy = (a, f) => {
    const ring = 'M56 58 m-19 0 a19 19 0 1 0 38 0 a19 19 0 1 0 -38 0';
    const ang = f * (360 / FR);
    let art = tube(ring, CYN, 2.8, BREATH[f])
      + tube('M70 72 l18 18', CYN, 3.4, 1)
      + "<g transform='rotate(" + ang + " 56 58)'>"
      + tube('M56 58 m0 -13 a13 13 0 0 1 11 6.5', MAG, 2.2, 0.95)
      + '</g>'
      + dot(50, 51, 1.6, CORE, 0.8)
      + ticks(92, 34, MAG, f)
      + ghost(ring, 1.8, f, [4]);
    return { defs: '', art };
  };

  // Tilt — a magenta phone rocking on its corner; cyan motion arcs flash at
  // the extremes.
  ART.tilt = (a, f) => {
    const rot = [-14, -6, 4, 14, 6, -4, -12][f];
    const phone = rr(48, 32, 32, 56, 8);
    const extreme = Math.abs(rot) > 10;
    let art = "<g transform='rotate(" + rot + " 64 88)'>"
      + tube(phone, MAG, 2.6, 1)
      + tube('M56 40 l16 16 M66 38 l10 10', CYN, 2, 0.6)
      + tube('M60 82 h8', CYN, 1.8, 0.8)
      + '</g>'
      + tube('M36 68 q-6 -12 2 -22', CYN, 2, extreme && rot < 0 ? 1 : 0.25)
      + tube('M92 68 q6 -12 -2 -22', CYN, 2, extreme && rot > 0 ? 1 : 0.25)
      + ghost(phone, 1.8, f, [3]);
    return { defs: '', art };
  };

  // The Dial — a neon gauge; the needle hunts, the hot zone buzzes.
  ART.dial = (a, f) => {
    const ang = [-55, -30, -5, 22, 48, 22, -12][f];
    const arc = (a1, a2, r) => {
      const p = (t) => (64 + Math.sin(t * Math.PI / 180) * r) + ' ' + (80 - Math.cos(t * Math.PI / 180) * r);
      return 'M' + p(a1) + ' A' + r + ' ' + r + ' 0 0 1 ' + p(a2);
    };
    let art = tube(arc(-62, 12, 30), CYN, 2.6, BREATH[f])
      + tube(arc(20, 62, 30), MAG, 2.6, f === 4 ? BUZZ[3] : 1)
      + range(5).map((i) => {
        const t = (-60 + i * 30) * Math.PI / 180;
        return tube('M' + (64 + Math.sin(t) * 25) + ' ' + (80 - Math.cos(t) * 25) + ' L' + (64 + Math.sin(t) * 21) + ' ' + (80 - Math.cos(t) * 21), CYN, 1.5, 0.5);
      }).join('')
      + "<g transform='rotate(" + ang + " 64 80)'>" + tube('M64 80 V58', MAG, 2.6, 1) + '</g>'
      + dot(64, 80, 2.8, CYN, 1)
      + tube('M38 92 h52', CYN, 2, 0.6);
    return { defs: '', art };
  };

  // Party Roulette — neon dare cards; the top card pops, its "!" flickers.
  ART.roulette = (a, f) => {
    const pop = [0, -2, -4, -5, -3, -1, 0][f];
    const back = rr(36, 44, 32, 46, 6);
    const front = rr(58, 38, 32, 46, 6);
    let art = "<g transform='rotate(-10 52 66)'>" + tube(back, CYN, 2, 0.45)
      + tube('M46 56 h10 l-7 12', CYN, 1.6, 0.4) + '</g>'
      + "<g transform='rotate(7 74 62) translate(0," + pop + ")'>"
      + tube(front, MAG, 2.6, 1)
      + tube('M74 48 v16', CYN, 2.6, [1, 1, 0.2, 1, 0.7, 1, 1][f])
      + dot(74, 74, 2.2, CYN, [1, 1, 0.2, 1, 0.7, 1, 1][f])
      + '</g>'
      + ticks(96, 88, MAG, f, 2)
      + ghost(front, 1.8, f, [1]);
    return { defs: '', art };
  };

  // Fake Facts — a neon face whose magenta nose grows... and glitches at
  // maximum lie.
  ART.fakefacts = (a, f) => {
    const face = 'M52 62 m-22 0 a22 22 0 1 0 44 0 a22 22 0 1 0 -44 0';
    const nose = [8, 14, 20, 27, 33, 22, 12][f];
    const noseD = 'M74 60 h' + nose;
    let art = tube(face, CYN, 2.6, BREATH[f])
      + dot(44, 56, 1.8, CYN, 1) + dot(58, 56, 1.8, CYN, 1)
      + tube('M44 72 q7 5 15 1', CYN, 2, 0.9)
      + tube(noseD, MAG, 3, 1)
      + dot(74 + nose, 60, 2, MAG, 0.9)
      + (f === 4 ? ghost(noseD, 2.2, f, [4], 3) : '')
      + ghost(face, 1.6, f, [4]);
    return { defs: '', art };
  };

  // One Clue — a neon bulb sign powering ON: filament first, then glow, rays.
  ART.oneclue = (a, f) => {
    const on = FLICK_ON[f];
    const bulb = 'M64 54 m-19 0 a19 19 0 1 0 38 0 a19 19 0 1 0 -38 0';
    let art = (on > 0.6 ? "<circle cx='64' cy='54' r='26' fill='" + CYN + "' opacity='" + (0.16 * on) + "' filter='url(#ng2)'/>" : '')
      + tube(bulb, CYN, 2.6, 0.35 + on * 0.65)
      + tube('M56 60 l4 -9 l4 9 l4 -9', MAG, 2.2, on)
      + tube('M57 78 h14 M58 84 h12 M60 90 h8', CYN, 1.8, 0.7)
      + (on > 0.7 ? tube('M40 32 l5 5 M88 32 l-5 5 M64 24 v7', MAG, 2, on) : '')
      + ghost(bulb, 1.6, f, [2]);
    return { defs: '', art };
  };

  // Same Brain — twin neon heads with the identical brainwave; the shared
  // spark strikes both at once.
  ART.samebrain = (a, f) => {
    const wave = (x) => 'M' + x + ' 66 l4 -6 l4 9 l4 -7 l4 4';
    const sync = [0.5, 1, 0.6, 1, 0.7, 1, 0.8][f];
    let art = tube('M46 66 m-17 0 a17 17 0 1 0 34 0 a17 17 0 1 0 -34 0', CYN, 2.4, BREATH[f])
      + tube('M82 66 m-17 0 a17 17 0 1 0 34 0 a17 17 0 1 0 -34 0', MAG, 2.4, BREATH[f])
      + tube(wave(38), MAG, 2, sync)
      + tube(wave(74), CYN, 2, sync)
      + star(64, 34, [4, 6, 4.5, 6.5, 5, 6, 4.5][f], f % 2 ? MAG : CYN, sync)
      + tube('M46 44 q0 -6 4 -8 M82 44 q0 -6 -4 -8', CYN, 1.6, sync * 0.8);
    return { defs: '', art };
  };

  // Wolves — an icy neon moon breathing; a magenta wolf howls, arcs rising.
  ART.wolves = (a, f) => {
    const moonG = BREATH[f];
    // front-facing wolf head: two pointed ears, cheeks tapering to the chin
    const wolf = 'M42 36 L38 56 Q38 72 60 86 Q82 72 82 56 L78 36 L70 46 Q60 42 50 46 Z';
    const eyeO = [1, 1, 0.2, 1, 1, 0.5, 1][f];
    let art = "<circle cx='98' cy='32' r='15' fill='" + CYN + "' opacity='" + (0.18 * moonG).toFixed(3) + "' filter='url(#ng2)'/>"
      + tube('M98 32 m-10.5 0 a10.5 10.5 0 1 0 21 0 a10.5 10.5 0 1 0 -21 0', CYN, 2.2, moonG)
      + dot(95, 29, 1.2, CYN, 0.5) + dot(101, 36, 1, CYN, 0.4)
      + tube(wolf, MAG, 2.4, 1)
      + dot(52, 58, 1.7, CYN, eyeO) + dot(68, 58, 1.7, CYN, eyeO)
      + tube('M57 70 h6 l-3 4 z', MAG, 1.6, 0.9)
      + tube('M44 42 l4 8 M76 42 l-4 8', MAG, 1.5, 0.5)
      + dot(26, 36, 1.2, CORE, 0.7) + dot(36, 24, 1, CORE, 0.5) + dot(104, 66, 1, CORE, 0.5)
      + ghost(wolf, 1.6, f, [5]);
    return { defs: '', art };
  };

  // Welcome — the 777 JACKPOT sign: marquee bulbs chase the plate, the middle
  // seven buzzes like a tired tube.
  ART.welcome = (a, f) => {
    const seven = (x) => 'M' + x + ' 50 h16 l-10 26';
    let art = marquee(f, [14, 14, 100, 100], MAG, CYN)
      + tube(seven(30), MAG, 3, 1)
      + tube(seven(56), MAG, 3, BUZZ[f])
      + tube(seven(82), MAG, 3, 1)
      + tube('M36 88 h56', CYN, 2, [0.4, 0.7, 1, 0.7, 0.4, 0.7, 1][f])
      + star(98, 34, 4.5, CYN, [0.6, 1, 0.7, 1, 0.8, 1, 0.7][f])
      + ghost(seven(56), 2, f, [3], 2.5);
    return { defs: '', art };
  };

  // ---- letter fallback: the initial as a buzzing neon sign ------------------
  function fallbackArt(letter, a, f) {
    const [P, S] = lean(a);
    const o = FLICK_ON[f];
    const t = (extra) => "<text x='64' y='80' font-family='system-ui,sans-serif' font-size='52' font-weight='800' text-anchor='middle' fill='none' " + extra + '>' + letter + '</text>';
    let art = t("stroke='" + P + "' stroke-width='9' opacity='" + (0.3 * o).toFixed(3) + "' filter='url(#ng)'")
      + t("stroke='" + P + "' stroke-width='4' opacity='" + (0.85 * o).toFixed(3) + "'")
      + t("stroke='" + CORE + "' stroke-width='1.6' opacity='" + o + "'")
      + tube('M40 92 h48', S, 2, o * 0.8)
      + ticks(94, 30, S, f);
    if (f === 2) art += t("stroke='#ff2840' stroke-width='2' opacity='.4' transform='translate(-2,0)'")
      + t("stroke='#2f6bff' stroke-width='2' opacity='.4' transform='translate(2,0)'");
    return { defs: '', art };
  }

  GifOS.iconPacks.register('sevens', {
    size: SIZE, frames: FR, delayCs: DELAY, dither: 10,
    draw(subject, accent) {
      const builder = ART[subject];
      if (!builder) return null;
      return range(FR).map((f) => { const r = builder(accent, f); return shell(r.defs, r.art, r.plate); });
    },
    fallback(letter, accent) {
      return range(FR).map((f) => { const r = fallbackArt(letter, accent, f); return shell(r.defs, r.art, r.plate); });
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
