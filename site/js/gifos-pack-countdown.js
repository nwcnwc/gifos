/*
 * gifos-pack-countdown.js — "Countdown", the space nerds' computer (5.gifos.app).
 *
 * Retro-futurist space age over a near-black deep-space desktop: polished
 * chrome with crisp horizon-line star reflections, ember-orange thruster glow,
 * violet nebula accents, porthole glass, and a few tiny stars twinkling around
 * every object (garnish, never a full starfield). Subjects are reimagined as
 * mission hardware — the video app is a little satellite, the folder a mission
 * dossier, the timer a T-minus countdown clock, the chess pawn a rocket.
 *
 * Fully procedural SVG. 160px raster, 6 frames, ordered dithering so the
 * chrome gradients survive GIF's 256 colors. Same pack contract as aurora.
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
  const bright = (a) => { const m = Math.max(a[0], a[1], a[2]) || 1, s = 225 / m; return toHex([a[0] * s, a[1] * s, a[2] * s]); };

  const EMBER = '#ff8a5c';     // thruster ember
  const EMBERD = '#ff5c2e';    // hot ember core edge
  const VIOLET = '#b09aff';    // nebula violet
  const INK = '#0c1028';       // deepest space ink
  const HULL = '#161b3d';      // dark hull navy

  // ---- gradient / material helpers ------------------------------------------
  let uid = 0;
  const grad = () => 'cd' + (uid++);
  function lg(id, stops, vert) {
    const s = stops.map((st) => "<stop offset='" + st[0] + "' stop-color='" + st[1] + "'" + (st[2] != null ? " stop-opacity='" + st[2] + "'" : '') + '/>').join('');
    return "<linearGradient id='" + id + "' x1='0' y1='0' x2='" + (vert === false ? 1 : 0) + "' y2='" + (vert === false ? 0 : 1) + "'>" + s + '</linearGradient>';
  }
  function rg(id, stops, fx, fy) {
    const s = stops.map((st) => "<stop offset='" + st[0] + "' stop-color='" + st[1] + "'" + (st[2] != null ? " stop-opacity='" + st[2] + "'" : '') + '/>').join('');
    return "<radialGradient id='" + id + "'" + (fx != null ? " fx='" + fx + "' fy='" + fy + "'" : '') + '>' + s + '</radialGradient>';
  }
  // POLISHED CHROME: bright sky reflection, a crisp dark horizon line, then a
  // lighter ground bounce. Optional accent tint keeps each icon's identity.
  function chrome(id, a, vert) {
    const t = a ? ((h) => mixc(h, toHex(a), 0.1)) : ((h) => h);
    return lg(id, [
      [0, t('#feffff')], [0.30, t('#c8d2e4')], [0.46, t('#909cb8')], [0.505, t('#39415e')],
      [0.56, t('#a9b3ca')], [0.66, t('#e9eef8')], [0.86, t('#cfd7e8')], [1, t('#6f7a94')],
    ], vert);
  }
  // Dark porthole glass with a deep navy well.
  function glassG(id) {
    return rg(id, [[0, '#42528e'], [0.5, '#222b5c'], [0.8, '#141b44'], [1, '#0c112f']], 0.38, 0.3);
  }
  // Ember plasma ball.
  function emberG(id) {
    return rg(id, [[0, '#fff3da'], [0.4, '#ffc06a'], [0.75, EMBER], [1, EMBERD]], 0.4, 0.35);
  }
  // Accent panel body gradient (satin metal, tinted).
  function panelG(id, base) {
    return lg(id, [[0, shade(base, 55)], [0.45, base], [1, shade(base, -60)]]);
  }
  const sheen = (id) => lg(id, [[0, '#ffffff', 0.55], [0.4, '#ffffff', 0.12], [0.6, '#ffffff', 0]]);

  // Motion tables.
  const FLOAT = [0, -1.5, -2.5, -3, -2, -0.5];   // gentle zero-g drift
  const TW = [0.12, 0.5, 1, 0.65, 0.3, 0.06];    // twinkle envelope
  const PULSE = [1, 1.22, 0.92, 1.3, 1.05, 1.34]; // thruster flicker

  // A tiny 4-point star; phase-shifted per star so the sky shimmers.
  function twk(x, y, s, f, ph, col) {
    const o = TW[(f + (ph || 0)) % 6];
    if (o < 0.08) return '';
    const k = (s * (0.72 + o * 0.5)).toFixed(2);
    return "<g transform='translate(" + x + ',' + y + ") scale(" + k + ")' opacity='" + o + "'>"
      + "<path d='M0 -5 C.5 -1.5 1.5 -.5 5 0 C1.5 .5 .5 1.5 0 5 C-.5 1.5 -1.5 .5 -5 0 C-1.5 -.5 -.5 -1.5 0 -5 Z' fill='" + (col || '#ffffff') + "'/>"
      + "<circle r='1.1' fill='#fff'/></g>";
  }
  // A pulsing thruster plume (ember shell, cream core).
  function flame(x, y, s, f) {
    const p = PULSE[f];
    return "<g transform='translate(" + x + ',' + y + ") scale(" + (s * (0.85 + p * 0.18)).toFixed(2) + ',' + (s * (0.62 + p * 0.42)).toFixed(2) + ")'>"
      + "<path d='M-5.5 0 Q-4.5 9 0 15 Q4.5 9 5.5 0 Z' fill='" + EMBERD + "' opacity='.8' filter='url(#fglow)'/>"
      + "<path d='M-5 0 Q-4 8.5 0 13.5 Q4 8.5 5 0 Z' fill='" + EMBER + "'/>"
      + "<path d='M-2.6 0 Q-2 5 0 8.5 Q2 5 2.6 0 Z' fill='#ffedc2'/></g>";
  }
  // Soft specular blob.
  function spec(x, y, rx, ry, op) {
    return "<ellipse cx='" + x + "' cy='" + y + "' rx='" + rx + "' ry='" + ry + "' fill='#fff' opacity='" + (op || 0.5) + "' filter='url(#fsoft)'/>";
  }
  // Circular-arc path (degrees clockwise from 12 o'clock).
  function arcP(cx, cy, r, a1, a2) {
    const rad = (d) => (d - 90) * Math.PI / 180;
    const x1 = cx + Math.cos(rad(a1)) * r, y1 = cy + Math.sin(rad(a1)) * r;
    const x2 = cx + Math.cos(rad(a2)) * r, y2 = cy + Math.sin(rad(a2)) * r;
    const large = (a2 - a1) > 180 ? 1 : 0;
    return 'M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1);
  }

  // Frame wrapper: filters + nebula under-haze + drifting art + garnish stars.
  // Every subject gets 3 twinkling stars around it (its own or these defaults).
  const DEF_STARS = [[17, 24, 0.85, 1], [111, 15, 0.65, 3], [115, 90, 0.75, 5]];
  function shell(defs, art, f, stars) {
    const st = (stars || DEF_STARS).map((s) => twk(s[0], s[1], s[2], f, s[3], s[4])).join('');
    return "<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'>"
      + '<defs>'
      + "<filter id='fblur' x='-60%' y='-60%' width='220%' height='220%'><feGaussianBlur stdDeviation='4.5'/></filter>"
      + "<filter id='fsoft' x='-60%' y='-60%' width='220%' height='220%'><feGaussianBlur stdDeviation='2.2'/></filter>"
      + "<filter id='fglow' x='-80%' y='-80%' width='260%' height='260%'><feGaussianBlur stdDeviation='3.2'/></filter>"
      + defs + '</defs>'
      + "<ellipse cx='64' cy='109' rx='34' ry='6' fill='" + VIOLET + "' opacity='" + (0.1 - FLOAT[f] * 0.012).toFixed(3) + "' filter='url(#fblur)'/>"
      + "<g transform='translate(0," + FLOAT[f] + ")'>" + art + '</g>' + st + '</svg>';
  }

  const rr = (x, y, w, h, r) => 'M' + (x + r) + ' ' + y + ' h' + (w - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r
    + ' v' + (h - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 -' + r + ' ' + r + ' h-' + (w - 2 * r)
    + ' a' + r + ' ' + r + ' 0 0 1 -' + r + ' -' + r + ' v-' + (h - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' -' + r + ' z';

  // ---- subjects --------------------------------------------------------------
  const ART = {};

  // Video Call — HERO: a little chrome satellite. Camera-eye lens, violet solar
  // wings with a sweeping sun glint, dish, blinking beacon, orbiting spark.
  ART.video = (a, f) => {
    const base = bright(a);
    const cg = grad(), ph = grad(), gl = grad(), pg = grad(), sh = grad();
    const rot = [-6, -3, 0, 3, 6, 3][f];
    const th = (f / FR) * Math.PI * 2;
    const ox = 64 + Math.cos(th) * 47, oy = 64 + Math.sin(th) * 12;
    const behind = Math.sin(th) < 0;
    const spark = "<circle cx='" + ox.toFixed(1) + "' cy='" + oy.toFixed(1) + "' r='3' fill='" + EMBER + "'/>"
      + "<circle cx='" + ox.toFixed(1) + "' cy='" + oy.toFixed(1) + "' r='3' fill='" + EMBER + "' opacity='.6' filter='url(#fglow)'/>"
      + "<circle cx='" + (ox - 1).toFixed(1) + "' cy='" + (oy - 1).toFixed(1) + "' r='1' fill='#fff'/>";
    const glint = 16 + f * 3.4; // sun glint sweeping across the solar cells
    const defs = chrome(cg, a) + chrome(ph, a, false) + glassG(gl) + sheen(sh)
      + lg(pg, [[0, '#6b7ce0'], [0.5, '#3d4cb0'], [1, '#252e7c']]);
    const panel = (x) =>
      "<rect x='" + x + "' y='51' width='27' height='24' rx='2.5' fill='" + INK + "'/>"
      + "<rect x='" + (x + 1) + "' y='52' width='25' height='22' rx='2' fill='url(#" + pg + ")'/>"
      + "<path d='M" + (x + 1) + ' 59.3 h25 M' + (x + 1) + ' 66.6 h25 M' + (x + 9.3) + ' 52 v22 M' + (x + 17.6) + " 52 v22' stroke='#8fa0ff' stroke-width='1' opacity='.55'/>"
      + "<rect x='" + (x + glint * 0.6 - 5) + "' y='52' width='5' height='22' fill='#fff' opacity='.3' transform='skewX(-12)' transform-origin='" + (x + 13) + " 63'/>"
      + "<rect x='" + (x + 1) + "' y='52' width='25' height='6' rx='2' fill='#fff' opacity='.14'/>";
    const art = (behind ? spark : '')
      + "<g transform='rotate(" + rot + " 64 62)'>"
      // wing strut
      + "<rect x='26' y='60' width='76' height='4.6' rx='2.3' fill='url(#" + ph + ")'/>"
      + panel(12) + panel(89)
      // dish + beacon
      + "<path d='M76 38 q10 -8 16 -4 q-2 8 -13 9 z' fill='url(#" + cg + ")'/>"
      + "<circle cx='90' cy='35' r='2.2' fill='" + (f % 2 ? EMBER : '#7a3618') + "'/>"
      + (f % 2 ? "<circle cx='90' cy='35' r='3.4' fill='" + EMBER + "' opacity='.55' filter='url(#fglow)'/>" : '')
      + "<rect x='62' y='34' width='4' height='12' rx='2' fill='url(#" + cg + ")'/>"
      + "<circle cx='64' cy='33' r='2.4' fill='" + (f % 2 ? '#7a3618' : EMBER) + "'/>"
      // hull
      + "<path d='" + rr(45, 44, 38, 37, 8) + "' fill='url(#" + cg + ")'/>"
      + "<path d='" + rr(45, 44, 38, 8, 4) + "' fill='" + base + "' opacity='.8'/>"
      + "<path d='" + rr(45, 44, 38, 37, 8) + "' fill='none' stroke='" + INK + "' stroke-width='1.2' opacity='.35'/>"
      // camera eye
      + "<circle cx='64' cy='64' r='14.5' fill='" + INK + "'/>"
      + "<circle cx='64' cy='64' r='13' fill='url(#" + cg + ")'/>"
      + "<circle cx='64' cy='64' r='10' fill='url(#" + gl + ")'/>"
      + "<circle cx='64' cy='64' r='4.6' fill='#0a0e26'/>"
      + "<circle cx='64' cy='64' r='4.6' fill='url(#" + gl + ")' opacity='.5'/>"
      + "<ellipse cx='60' cy='59.5' rx='3.4' ry='2.4' fill='#fff' opacity='.85'/>"
      + "<circle cx='68.5' cy='68.5' r='1.3' fill='" + VIOLET + "' opacity='.9'/>"
      + "<path d='" + rr(45, 44, 38, 16, 8) + "' fill='url(#" + sh + ")'/>"
      + '</g>'
      + (behind ? '' : spark);
    return { defs, art, stars: [[20, 20, 0.9, 1], [104, 100, 0.7, 4], [28, 96, 0.6, 2]] };
  };

  // Timer — the namesake T-minus countdown clock. Chrome bezel, deep display,
  // digits tick 5-4-3-2-1-GO while the ember progress ring drains.
  ART.timer = (a, f) => {
    const cg = grad(), gl = grad(), sh = grad();
    const label = ['T-5', 'T-4', 'T-3', 'T-2', 'T-1', 'GO!'][f];
    const go = f === 5;
    const remain = (5 - f) / 5;
    const defs = chrome(cg, a) + glassG(gl) + sheen(sh);
    const ticks = range(12).map((i) => {
      const t = i * 30 * Math.PI / 180, r1 = 26, r2 = i % 3 === 0 ? 21.5 : 23.5;
      return "<line x1='" + (64 + Math.sin(t) * r1).toFixed(1) + "' y1='" + (66 - Math.cos(t) * r1).toFixed(1) + "' x2='" + (64 + Math.sin(t) * r2).toFixed(1) + "' y2='" + (66 - Math.cos(t) * r2).toFixed(1) + "' stroke='#7f89ad' stroke-width='" + (i % 3 === 0 ? 2.6 : 1.6) + "' stroke-linecap='round'/>";
    }).join('');
    const art =
      // crown + shoulders
      "<rect x='59' y='23' width='10' height='10' rx='2.5' fill='url(#" + cg + ")'/>"
      + "<rect x='55' y='21' width='18' height='6' rx='3' fill='url(#" + cg + ")'/>"
      + "<g transform='rotate(42 64 66)'><rect x='59' y='30' width='10' height='8' rx='2.5' fill='url(#" + cg + ")'/></g>"
      + "<g transform='rotate(-42 64 66)'><rect x='59' y='30' width='10' height='8' rx='2.5' fill='url(#" + cg + ")'/></g>"
      // chrome case + dark face
      + "<circle cx='64' cy='66' r='33' fill='url(#" + cg + ")'/>"
      + "<circle cx='64' cy='66' r='28' fill='" + INK + "'/>"
      + "<circle cx='64' cy='66' r='28' fill='url(#" + gl + ")' opacity='.55'/>"
      + ticks
      // ember progress ring draining
      + (remain > 0
        ? "<path d='" + arcP(64, 66, 24.6, 0, 350 * remain) + "' stroke='" + EMBER + "' stroke-width='3.4' fill='none' stroke-linecap='round'/>"
          + "<path d='" + arcP(64, 66, 24.6, 0, 350 * remain) + "' stroke='" + EMBER + "' stroke-width='3.4' fill='none' stroke-linecap='round' opacity='.5' filter='url(#fglow)'/>"
        : "<circle cx='64' cy='66' r='24.6' fill='none' stroke='" + EMBER + "' stroke-width='3.4' opacity='.9' filter='url(#fglow)'/>")
      // display window
      + "<path d='" + rr(46, 57, 36, 18, 4) + "' fill='" + (go ? '#3d1505' : '#070a20') + "'/>"
      + "<path d='" + rr(46, 57, 36, 18, 4) + "' fill='none' stroke='#4a5480' stroke-width='1.2'/>"
      + "<text x='64' y='71' font-family='ui-monospace,monospace' font-size='13.5' font-weight='700' fill='" + (go ? '#ffd9a0' : EMBER) + "' text-anchor='middle'>" + label + '</text>'
      + "<text x='64' y='71' font-family='ui-monospace,monospace' font-size='13.5' font-weight='700' fill='" + EMBER + "' text-anchor='middle' opacity='.6' filter='url(#fglow)'>" + label + '</text>'
      // glass sweep
      + "<path d='M43 51 a28 28 0 0 1 30 -9 a32 32 0 0 0 -30 9 z' fill='#fff' opacity='.5' filter='url(#fsoft)'/>"
      + "<circle cx='64' cy='66' r='33' fill='none' stroke='#fff' stroke-width='1' opacity='.35'/>";
    return { defs, art, stars: [[20, 30, 0.85, 0], [106, 24, 0.7, 2], [110, 92, 0.65, 4]] };
  };

  // Chess — the pawn reimagined as a chrome hop rocket hovering over its pad.
  ART.chess = (a, f) => {
    const base = bright(a);
    const cg = grad(), ng = grad(), gl = grad(), pg = grad();
    const hov = [0, -1.5, -3, -3.5, -2, -0.5][f];
    const defs = chrome(cg, null, false) + panelG(ng, base) + glassG(gl) + chrome(pg, a);
    const art =
      // launch pad base
      "<path d='" + rr(42, 90, 44, 9, 4.5) + "' fill='url(#" + pg + ")'/>"
      + "<path d='" + rr(50, 85, 28, 6, 3) + "' fill='" + HULL + "'/>"
      + "<circle cx='46.5' cy='94.5' r='1.2' fill='#0c1028' opacity='.6'/><circle cx='81.5' cy='94.5' r='1.2' fill='#0c1028' opacity='.6'/>"
      + "<g transform='translate(0," + hov + ")'>"
      + flame(64, 79, 0.72, f)
      // body cylinder (horizontal chrome for roundness)
      + "<path d='M64 24 C71 31 73.5 40 73.5 50 L73.5 72 Q64 76.5 54.5 72 L54.5 50 C54.5 40 57 31 64 24 Z' fill='url(#" + cg + ")'/>"
      // nose cone accent
      + "<path d='M64 24 C69.5 29.5 71.8 36 72.6 42 Q64 46 55.4 42 C56.2 36 58.5 29.5 64 24 Z' fill='url(#" + ng + ")'/>"
      // fins
      + "<path d='M54.5 58 Q45 65 46 78 L54.5 71 Z' fill='url(#" + ng + ")'/>"
      + "<path d='M73.5 58 Q83 65 82 78 L73.5 71 Z' fill='" + shade(base, -55) + "'/>"
      // porthole
      + "<circle cx='64' cy='53' r='6.2' fill='" + INK + "'/>"
      + "<circle cx='64' cy='53' r='5' fill='url(#" + gl + ")'/>"
      + "<ellipse cx='62' cy='51' rx='1.8' ry='1.3' fill='#fff' opacity='.85'/>"
      // nozzle
      + "<path d='M57.5 73 L70.5 73 L68.5 79 L59.5 79 Z' fill='#3a415e'/>"
      + "<path d='M57 71.5 h14 v2.4 h-14 z' fill='url(#" + cg + ")'/>"
      + "<ellipse cx='59' cy='36' rx='1.8' ry='7' fill='#fff' opacity='.5' filter='url(#fsoft)'/>"
      + '</g>';
    return { defs, art, stars: [[26, 30, 0.9, 1], [100, 22, 0.7, 3], [104, 74, 0.65, 5]] };
  };

  // Minesweeper — a spiky naval-mine asteroid, blinking arm light, slow tumble.
  ART.minesweeper = (a, f) => {
    const rk = grad(), cg = grad();
    const rot = [0, 4, 8, 12, 8, 4][f];
    const on = f % 2 === 0;
    const defs = rg(rk, [[0, '#726d94'], [0.5, '#4b4674'], [0.8, '#2e2a52'], [1, '#201c40']], 0.36, 0.3)
      + chrome(cg);
    const spike = (ang) =>
      "<g transform='rotate(" + ang + " 62 66)'>"
      + "<path d='M59 44 L62 32 L65 44 Z' fill='url(#" + cg + ")'/>"
      + "<circle cx='62' cy='31.5' r='2.6' fill='url(#" + cg + ")'/>"
      + '</g>';
    const art =
      spike(0) + spike(45) + spike(90) + spike(135) + spike(180) + spike(225) + spike(270) + spike(315)
      + "<circle cx='62' cy='66' r='23.5' fill='url(#" + rk + ")'/>"
      + "<circle cx='62' cy='66' r='23.5' fill='none' stroke='#6e6a92' stroke-width='1' opacity='.5'/>"
      // craters tumbling
      + "<g transform='rotate(" + rot + " 62 66)'>"
      + "<ellipse cx='54' cy='60' rx='5.5' ry='4.5' fill='#26224a'/><ellipse cx='54.6' cy='59.2' rx='4.8' ry='3.6' fill='#3c3866'/>"
      + "<ellipse cx='71' cy='73' rx='4' ry='3.2' fill='#26224a'/><ellipse cx='71.5' cy='72.4' rx='3.4' ry='2.6' fill='#3c3866'/>"
      + "<ellipse cx='66' cy='55' rx='2.6' ry='2.1' fill='#26224a'/>"
      + "<ellipse cx='51' cy='75' rx='3' ry='2.4' fill='#26224a'/>"
      + '</g>'
      + spec(52, 52, 7, 5, 0.32)
      + "<path d='" + arcP(62, 66, 21.5, 130, 215) + "' stroke='" + VIOLET + "' stroke-width='2' fill='none' stroke-linecap='round' opacity='.45'/>"
      // blinking detonator light on the top spike
      + "<circle cx='62' cy='31.5' r='1.6' fill='" + (on ? '#ffedc2' : '#5a2412') + "'/>"
      + (on ? "<circle cx='62' cy='31.5' r='5' fill='" + EMBER + "' opacity='.6' filter='url(#fglow)'/>" : '');
    return { defs, art, stars: [[22, 28, 0.85, 2], [104, 34, 0.7, 0], [106, 96, 0.7, 4]] };
  };

  // Welcome — a small ringed planet, chrome ring with a spark riding it.
  ART.welcome = (a, f) => {
    const base = bright(a);
    const pg = grad(), cg = grad(), cl = grad();
    const th = (f / FR) * Math.PI * 2;
    const sx = 64 + Math.cos(th) * 35, sy = 62 + Math.sin(th) * 9.6;
    const front = Math.sin(th) > 0;
    const defs = rg(pg, [[0, shade(base, 60)], [0.45, base], [0.8, shade(base, -60)], [1, shade(base, -95)]], 0.36, 0.3)
      + chrome(cg, null, false)
      + "<clipPath id='" + cl + "'><circle cx='64' cy='62' r='19'/></clipPath>";
    const spark = twk(sx.toFixed(1), sy.toFixed(1), 0.8, f, 0, '#ffe9c2');
    const ring = (half) =>
      "<path d='M" + (half === 'back' ? '98.5 62 A34.5 9.6 0 0 0 29.5 62' : '29.5 62 A34.5 9.6 0 0 0 98.5 62')
      + "' fill='none' stroke='url(#" + cg + ")' stroke-width='4.6'/>"
      + "<path d='M" + (half === 'back' ? '98.5 62 A34.5 9.6 0 0 0 29.5 62' : '29.5 62 A34.5 9.6 0 0 0 98.5 62')
      + "' fill='none' stroke='#fff' stroke-width='1' opacity='.5'/>";
    const art =
      "<g transform='rotate(-14 64 62)'>"
      + ring('back') + (front ? '' : spark)
      + "<circle cx='64' cy='62' r='19' fill='url(#" + pg + ")'/>"
      + "<g clip-path='url(#" + cl + ")'>"
      + "<path d='M43 54 Q64 48 86 55 L86 60 Q64 53 43 59 Z' fill='#fff' opacity='.35'/>"
      + "<path d='M43 66 Q64 60 86 67 L86 72.5 Q64 65 43 71.5 Z' fill='" + INK + "' opacity='.45'/>"
      + "<path d='M43 76 Q64 71 86 77 L86 80.5 Q64 75 43 79.5 Z' fill='#fff' opacity='.22'/>"
      + "<ellipse cx='73' cy='57' rx='4.5' ry='2.6' fill='#fff' opacity='.4'/>"
      + '</g>'
      + spec(56, 50, 6.5, 4.5, 0.5)
      + ring('front') + (front ? spark : '')
      + '</g>';
    return { defs, art, stars: [[20, 26, 0.95, 1], [106, 20, 0.7, 3], [24, 98, 0.65, 5]] };
  };

  // Folder — the mission dossier: gunmetal jacket, chrome trim, wing insignia.
  ART.folder = (a, f) => {
    const base = bright(a);
    const bk = grad(), fr = grad(), pp = grad(), sh = grad();
    const lift = [0, 1.2, 2.4, 3, 2, 0.8][f];
    const defs = lg(bk, [[0, '#454e74'], [0.5, '#2f3659'], [1, '#1d2242']])
      + chrome(fr, a)
      + lg(pp, [[0, '#f2f5ff'], [1, '#c4cce8']])
      + sheen(sh);
    const art =
      // back jacket with tab
      "<path d='M20 38 a8 8 0 0 1 8 -8 h20 a8 8 0 0 1 6.4 3.2 l4.8 6.4 h41 a8 8 0 0 1 8 8 v40 a10 10 0 0 1 -10 10 h-68 a10 10 0 0 1 -10 -10 z' fill='url(#" + bk + ")'/>"
      // papers peeking
      + "<g transform='translate(0," + (-lift) + ")'>"
      + "<path d='" + rr(32, 34, 62, 28, 4) + "' fill='url(#" + pp + ")'/>"
      + "<path d='M40 42 h36 M40 48 h22' stroke='#8b93b8' stroke-width='2.6' stroke-linecap='round'/>"
      + "<path d='M66 48 h12' stroke='" + HULL + "' stroke-width='5' stroke-linecap='butt'/>"
      + '</g>'
      // chrome front panel
      + "<path d='M18 56 a8 8 0 0 1 8 -8 h76 a8 8 0 0 1 8 8 l-2 32 a10 10 0 0 1 -10 9.8 h-68 a10 10 0 0 1 -10 -9.8 z' fill='url(#" + fr + ")'/>"
      + "<path d='M18 56 a8 8 0 0 1 8 -8 h76 a8 8 0 0 1 8 8 l-.4 6 h-91.2 z' fill='url(#" + sh + ")'/>"
      + "<path d='M20.5 92 l-1 -30 M107.5 92 l1 -30' stroke='" + INK + "' stroke-width='0' />"
      // rivets
      + "<circle cx='25' cy='55' r='1.4' fill='#39415e'/><circle cx='103' cy='55' r='1.4' fill='#39415e'/>"
      + "<circle cx='24' cy='90' r='1.4' fill='#39415e'/><circle cx='104' cy='90' r='1.4' fill='#39415e'/>"
      // wing insignia: gold star with swept chevron wings on a hull plate
      + "<path d='" + rr(42, 62, 44, 24, 6) + "' fill='" + HULL + "'/>"
      + "<path d='" + rr(42, 62, 44, 24, 6) + "' fill='none' stroke='" + shade(base, -20) + "' stroke-width='1.4' opacity='.9'/>"
      + "<path d='M46 74 q9 -6.5 15 -1 l-2.6 4.2 q-6 -4 -12.4 -3.2 z' fill='#ffd76a'/>"
      + "<path d='M82 74 q-9 -6.5 -15 -1 l2.6 4.2 q6 -4 12.4 -3.2 z' fill='#ffd76a'/>"
      + "<path d='M46 74 q9 -6.5 15 -1 M82 74 q-9 -6.5 -15 -1' stroke='#a4650f' stroke-width='.8' fill='none' opacity='.7'/>"
      + "<path d='M64 65 l2.3 4.8 5.3 .7 -3.9 3.7 1 5.3 -4.7 -2.6 -4.7 2.6 1 -5.3 -3.9 -3.7 5.3 -.7 z' fill='#ffd76a'/>"
      + "<path d='M64 65 l2.3 4.8 5.3 .7 -3.9 3.7 1 5.3 -4.7 -2.6 -4.7 2.6 1 -5.3 -3.9 -3.7 5.3 -.7 z' fill='none' stroke='#a4650f' stroke-width='.8' opacity='.7'/>";
    return { defs, art, stars: [[16, 22, 0.85, 0], [112, 26, 0.7, 2], [112, 100, 0.6, 4]] };
  };

  // Notes — the mission log clipboard: chrome clip, checklist ticking itself.
  ART.notes = (a, f) => {
    const base = bright(a);
    const cg = grad(), bd = grad(), pp = grad();
    const w = 8 + 26 * (f / (FR - 1));
    const defs = chrome(cg) + panelG(bd, base)
      + lg(pp, [[0, '#f6f8ff'], [0.7, '#e6ebfb'], [1, '#c2cae6']]);
    const check = (y, done) =>
      "<rect x='40' y='" + y + "' width='7' height='7' rx='2' fill='none' stroke='#8b93b8' stroke-width='2'/>"
      + (done ? "<path d='M41.5 " + (y + 3.5) + " l2 2.4 3.5 -5' stroke='" + EMBERD + "' stroke-width='2.2' fill='none' stroke-linecap='round' stroke-linejoin='round'/>" : '');
    const art =
      // board
      "<path d='" + rr(32, 28, 64, 72, 9) + "' fill='url(#" + bd + ")'/>"
      + "<path d='" + rr(32, 28, 64, 72, 9) + "' fill='none' stroke='" + INK + "' stroke-width='1.2' opacity='.35'/>"
      // paper
      + "<path d='" + rr(37, 40, 54, 54, 4) + "' fill='url(#" + pp + ")'/>"
      // chrome clip
      + "<path d='" + rr(50, 22, 28, 12, 5) + "' fill='url(#" + cg + ")'/>"
      + "<circle cx='64' cy='28' r='2.6' fill='#39415e'/>"
      // header
      + "<text x='42' y='49' font-family='ui-monospace,monospace' font-size='5.4' fill='" + shade(base, -70) + "' letter-spacing='1'>FLIGHT LOG</text>"
      + "<path d='M40 52.5 h48' stroke='" + shade(base, -20) + "' stroke-width='1.6' stroke-linecap='round'/>"
      // checklist ticking down the page
      + check(58, f >= 1) + "<path d='M52 61.5 h32' stroke='#aeb6d4' stroke-width='2.6' stroke-linecap='round'/>"
      + check(69, f >= 3) + "<path d='M52 72.5 h26' stroke='#aeb6d4' stroke-width='2.6' stroke-linecap='round'/>"
      + check(80, false) + "<path d='M52 83.5 h" + w + "' stroke='" + EMBER + "' stroke-width='2.6' stroke-linecap='round'/>"
      + "<circle cx='" + (52 + w) + "' cy='83.5' r='1.8' fill='#ffedc2'/>";
    return { defs, art, stars: [[20, 34, 0.85, 1], [108, 22, 0.75, 3], [110, 94, 0.6, 5]] };
  };

  // Calc — mission computer: chrome shell, amber CRT cycling constants.
  ART.calc = (a, f) => {
    const base = bright(a);
    const cg = grad(), sh = grad();
    const defs = chrome(cg, a) + sheen(sh);
    const digits = ['3.14159', '2.71828', '1.61803', '6.62607', '9.80665', '2.99792'][f];
    const lit = [0, 4, 8, 7, 5, 1][f];
    let keys = '';
    let i = 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++, i++) {
      const on = i === lit;
      keys += "<rect x='" + (41 + c * 16.5) + "' y='" + (63 + r * 12) + "' width='13' height='8.6' rx='2.6' fill='" + (on ? EMBER : '#39415e') + "'/>"
        + "<rect x='" + (41 + c * 16.5) + "' y='" + (63 + r * 12) + "' width='13' height='3.6' rx='1.8' fill='#fff' opacity='" + (on ? 0.5 : 0.18) + "'/>"
        + (on ? "<rect x='" + (41 + c * 16.5) + "' y='" + (63 + r * 12) + "' width='13' height='8.6' rx='2.6' fill='" + EMBER + "' opacity='.5' filter='url(#fglow)'/>" : '');
    }
    const art =
      "<path d='" + rr(33, 25, 62, 78, 11) + "' fill='url(#" + cg + ")'/>"
      + "<path d='" + rr(33, 25, 62, 78, 11) + "' fill='none' stroke='" + INK + "' stroke-width='1.2' opacity='.3'/>"
      + "<circle cx='39.5' cy='31' r='1.3' fill='#39415e'/><circle cx='88.5' cy='31' r='1.3' fill='#39415e'/>"
      + "<circle cx='39.5' cy='97' r='1.3' fill='#39415e'/><circle cx='88.5' cy='97' r='1.3' fill='#39415e'/>"
      // CRT display
      + "<path d='" + rr(40, 35, 48, 19, 4) + "' fill='#070a20'/>"
      + "<path d='" + rr(40, 35, 48, 19, 4) + "' fill='none' stroke='#4a5480' stroke-width='1.2'/>"
      + "<text x='85' y='48' font-family='ui-monospace,monospace' font-size='9' font-weight='700' fill='#ffb45c' text-anchor='end'>" + digits + '</text>'
      + "<text x='85' y='48' font-family='ui-monospace,monospace' font-size='9' font-weight='700' fill='#ffb45c' text-anchor='end' opacity='.5' filter='url(#fglow)'>" + digits + '</text>'
      + "<path d='M40 40 h48' stroke='#fff' stroke-width='4' opacity='.05'/>"
      + keys
      + "<path d='" + rr(33, 25, 62, 22, 11) + "' fill='url(#" + sh + ")'/>";
    return { defs, art, stars: [[22, 30, 0.85, 2], [106, 20, 0.7, 0], [108, 98, 0.65, 4]] };
  };

  // Tic-Tac-Toe — a star-chart tactics board: glowing ember X, violet O.
  ART.tictactoe = (a, f) => {
    const cg = grad(), gl = grad();
    const on = f % 2 === 0, xs = on ? 1.14 : 1, os = on ? 1 : 1.14;
    const defs = chrome(cg, a) + glassG(gl);
    const grid = "<path d='M52 36 v56 M76 36 v56 M36 52 h56 M36 76 h56' stroke='#4a5480' stroke-width='2.6' stroke-linecap='round'/>"
      + "<path d='M52 36 v56 M76 36 v56 M36 52 h56 M36 76 h56' stroke='" + VIOLET + "' stroke-width='1' stroke-linecap='round' opacity='.6'/>";
    const art =
      "<path d='" + rr(24, 24, 80, 80, 14) + "' fill='url(#" + cg + ")'/>"
      + "<path d='" + rr(29, 29, 70, 70, 10) + "' fill='" + INK + "'/>"
      + "<path d='" + rr(29, 29, 70, 70, 10) + "' fill='url(#" + gl + ")' opacity='.4'/>"
      + "<circle cx='26.8' cy='26.8' r='1.2' fill='#39415e'/><circle cx='101.2' cy='26.8' r='1.2' fill='#39415e'/>"
      + "<circle cx='26.8' cy='101.2' r='1.2' fill='#39415e'/><circle cx='101.2' cy='101.2' r='1.2' fill='#39415e'/>"
      + grid
      // faint star-chart dots in empty cells
      + "<circle cx='64' cy='44' r='1' fill='#8fa0ff' opacity='.5'/><circle cx='44' cy='64' r='1' fill='#8fa0ff' opacity='.5'/><circle cx='64' cy='84' r='1' fill='#8fa0ff' opacity='.5'/>"
      // ember X
      + "<g transform='translate(44,44) scale(" + xs + ")'>"
      + "<path d='M-5.5 -5.5 L5.5 5.5 M5.5 -5.5 L-5.5 5.5' stroke='" + EMBER + "' stroke-width='5' stroke-linecap='round'/>"
      + "<path d='M-5.5 -5.5 L5.5 5.5 M5.5 -5.5 L-5.5 5.5' stroke='" + EMBER + "' stroke-width='5' stroke-linecap='round' opacity='.5' filter='url(#fglow)'/></g>"
      // violet O
      + "<g transform='translate(84,84) scale(" + os + ")'>"
      + "<circle r='6.5' fill='none' stroke='" + VIOLET + "' stroke-width='4.6'/>"
      + "<circle r='6.5' fill='none' stroke='" + VIOLET + "' stroke-width='4.6' opacity='.5' filter='url(#fglow)'/></g>"
      // ghost move
      + "<circle cx='84' cy='44' r='6.5' fill='none' stroke='#4a5480' stroke-width='4'/>";
    return { defs, art, stars: [[16, 18, 0.8, 1], [112, 16, 0.7, 3], [14, 108, 0.6, 5]] };
  };

  // Connect 4 — the launch status board: an ember cell drops into the console.
  ART.connect4 = (a, f) => {
    const cg = grad(), em = grad(), vi = grad();
    const dropY = [30, 37, 45, 52, 57, 57][f];
    const landed = f >= 4;
    const defs = chrome(cg, a) + emberG(em)
      + rg(vi, [[0, '#e6dcff'], [0.5, VIOLET], [1, '#6a4ee0']], 0.4, 0.35);
    const hole = (cx, cy, fill) => fill
      ? "<circle cx='" + cx + "' cy='" + cy + "' r='7.4' fill='url(#" + fill + ")'/>"
        + "<circle cx='" + cx + "' cy='" + cy + "' r='7.4' fill='url(#" + fill + ")' opacity='.4' filter='url(#fglow)'/>"
        + "<circle cx='" + (cx - 2.2) + "' cy='" + (cy - 2.6) + "' r='1.8' fill='#fff' opacity='.8'/>"
      : "<circle cx='" + cx + "' cy='" + cy + "' r='7.4' fill='#060920'/>"
        + "<circle cx='" + cx + "' cy='" + cy + "' r='7.4' fill='none' stroke='url(#" + cg + ")' stroke-width='2'/>";
    const disc = "<g transform='translate(46," + dropY + ")'><circle r='7' fill='url(#" + em + ")'/>"
      + "<circle r='7' fill='url(#" + em + ")' opacity='.4' filter='url(#fglow)'/>"
      + "<circle cx='-2' cy='-2.4' r='1.7' fill='#fff' opacity='.85'/></g>";
    const art = (landed ? '' : disc)
      + "<path d='" + rr(28, 38, 72, 58, 10) + "' fill='url(#" + cg + ")'/>"
      + "<path d='M40 38.5 h12 v3 h-12 z' fill='" + INK + "' opacity='.7'/>"
      + "<path d='" + rr(33, 44, 62, 47, 7) + "' fill='" + HULL + "'/>"
      + "<circle cx='32' cy='42' r='1.3' fill='#39415e'/><circle cx='96' cy='42' r='1.3' fill='#39415e'/>"
      + "<circle cx='32' cy='93' r='1.3' fill='#39415e'/><circle cx='96' cy='93' r='1.3' fill='#39415e'/>"
      + hole(46, 57, landed ? em : null) + hole(64, 57, null) + hole(82, 57, null)
      + hole(46, 79, vi) + hole(64, 79, null) + hole(82, 79, vi);
    return { defs, art, stars: [[18, 26, 0.9, 0], [110, 24, 0.7, 2], [112, 104, 0.6, 4]] };
  };

  // Paint — a chrome artist palette with glowing nebula wells + comet brush.
  ART.paint = (a, f) => {
    const cg = grad(), hg = grad();
    const dip = Math.abs(Math.sin((f / FR) * Math.PI * 2)) * 5;
    const defs = chrome(cg, a) + chrome(hg, null, false);
    const well = (x, y, c, ph) => {
      const o = 0.45 + TW[(f + ph) % 6] * 0.55;
      return "<circle cx='" + x + "' cy='" + y + "' r='6.4' fill='" + INK + "'/>"
        + "<circle cx='" + x + "' cy='" + y + "' r='5' fill='" + c + "' opacity='" + o.toFixed(2) + "'/>"
        + "<circle cx='" + x + "' cy='" + y + "' r='5' fill='" + c + "' opacity='" + (o * 0.55).toFixed(2) + "' filter='url(#fglow)'/>"
        + "<circle cx='" + (x - 1.6) + "' cy='" + (y - 1.8) + "' r='1.3' fill='#fff' opacity='.8'/>";
    };
    const art =
      "<path d='M64 38 c-26 0 -40 14 -40 30 c0 16 14 26 34 26 c8 0 8 -7 4 -11 c-4 -4 -1 -10 6 -10 c8 0 22 2 30 -6 c6 -6 2 -29 -34 -29 z' fill='url(#" + cg + ")'/>"
      + "<path d='M64 38 c-26 0 -40 14 -40 30 c0 16 14 26 34 26 c8 0 8 -7 4 -11 c-4 -4 -1 -10 6 -10 c8 0 22 2 30 -6 c6 -6 2 -29 -34 -29 z' fill='none' stroke='" + INK + "' stroke-width='1.2' opacity='.3'/>"
      + well(46, 56, EMBER, 0) + well(64, 50, VIOLET, 2) + well(82, 58, '#5cd6ff', 4) + well(42, 74, '#ffd76a', 3)
      // comet brush dipping
      + "<g transform='translate(88," + (32 + dip) + ") rotate(35)'>"
      + "<rect x='-3.2' y='-2' width='6.4' height='24' rx='3' fill='url(#" + hg + ")'/>"
      + "<rect x='-4' y='-9' width='8' height='8' rx='2' fill='#39415e'/>"
      + "<path d='M-4 -9 q4 -11 8 0 z' fill='" + EMBER + "'/>"
      + "<path d='M-4 -9 q4 -11 8 0 z' fill='" + EMBER + "' opacity='.5' filter='url(#fglow)'/></g>";
    return { defs, art, stars: [[24, 30, 0.9, 1], [104, 88, 0.65, 3], [30, 100, 0.6, 5]] };
  };

  // Fortune — the golden cookie under mission lights, slip sliding out.
  ART.fortune = (a, f) => {
    const c1 = grad(), c2 = grad(), pp = grad();
    const slide = [0, 3, 6, 7, 5, 2][f];
    const defs = lg(c1, [[0, '#ffe4a6'], [0.45, '#f0ab48'], [1, '#a4650f']])
      + lg(c2, [[0, '#e0973a'], [1, '#7c4a0c']])
      + lg(pp, [[0, '#ffffff'], [1, '#d8dff2']]);
    const art =
      // cookie: golden dome, flat-ish base, folded lip dipping at the middle
      "<path d='M22 74 A42 38 0 0 1 106 74 L104 76 Q83 64 64 80 Q45 64 24 76 Z' fill='url(#" + c1 + ")'/>"
      + "<path d='M24 76 Q45 64 64 80 Q83 64 104 76 Q84 72 64 87 Q44 72 24 76 Z' fill='url(#" + c2 + ")'/>"
      + "<path d='M64 41 Q59 60 64 80' stroke='#7c4a0c' stroke-width='2.4' fill='none' opacity='.45'/>"
      + "<ellipse cx='44' cy='54' rx='10' ry='6.5' fill='#fff' opacity='.55' filter='url(#fsoft)'/>"
      + "<ellipse cx='85' cy='56' rx='6' ry='4' fill='#fff' opacity='.35' filter='url(#fsoft)'/>"
      // warm ember rim light (launch-pad glow)
      + "<path d='M25 70 A41 37 0 0 1 41 47' stroke='" + EMBER + "' stroke-width='2.2' fill='none' opacity='.55' stroke-linecap='round'/>"
      // the slip, sliding out of the fold IN FRONT of the cookie
      + "<g transform='translate(" + slide + ',' + (slide * 0.55) + ") rotate(20 76 88)'>"
      + "<path d='" + rr(58, 80, 38, 16, 3) + "' fill='url(#" + pp + ")'/>"
      + "<path d='M64 86 l16 3.8 M63 91 l11 2.6' stroke='#8b93b8' stroke-width='1.8' stroke-linecap='round'/>"
      + "<path d='M88 89.5 l.9 1.9 2.1 .3 -1.5 1.5 .4 2.1 -1.9 -1 -1.9 1 .4 -2.1 -1.5 -1.5 2.1 -.3 z' fill='" + EMBERD + "'/>"
      + '</g>';
    return { defs, art, stars: [[24, 32, 0.9, 0], [104, 30, 0.7, 2], [110, 96, 0.65, 4]] };
  };

  // Guestbook — the ship's logbook: hull covers, pale pages, ember heart beat.
  ART.guestbook = (a, f) => {
    const pl = grad(), pr = grad(), em = grad(), cv = grad();
    const hs = f % 2 ? 1.15 : 1;
    const defs = lg(pl, [[0, '#f4f7ff'], [1, '#c9d1ec']])
      + lg(pr, [[0, '#eef2fe'], [1, '#c0c9e6']])
      + emberG(em)
      + lg(cv, [[0, '#3c4468'], [1, '#20264a']]);
    const art =
      // hull covers
      "<path d='M20 44 Q42 32 64 44 L64 96 Q42 84 20 96 Z' fill='url(#" + cv + ")' transform='translate(-1.5,2.5)'/>"
      + "<path d='M108 44 Q86 32 64 44 L64 96 Q86 84 108 96 Z' fill='url(#" + cv + ")' transform='translate(1.5,2.5)'/>"
      // pages
      + "<path d='M22 44 Q42 32 64 44 L64 94 Q42 82 22 94 Z' fill='url(#" + pl + ")'/>"
      + "<path d='M106 44 Q86 32 64 44 L64 94 Q86 82 106 94 Z' fill='url(#" + pr + ")'/>"
      + "<path d='M64 44 V94' stroke='#9aa3c6' stroke-width='2.2'/>"
      + "<path d='M74 56 h20 M74 64 h16 M74 72 h18 M74 80 h12' stroke='#b8c0dc' stroke-width='2.4' stroke-linecap='round'/>"
      // ember heart, beating with a glow
      + "<g transform='translate(43,64) scale(" + hs + ")'>"
      + "<path d='M0 9 C-11 0 -8 -10 0 -6 C8 -10 11 0 0 9 Z' fill='url(#" + em + ")'/>"
      + "<path d='M0 9 C-11 0 -8 -10 0 -6 C8 -10 11 0 0 9 Z' fill='" + EMBER + "' opacity='.45' filter='url(#fglow)'/>"
      + "<ellipse cx='-3.5' cy='-4' rx='2.4' ry='1.7' fill='#fff' opacity='.85'/></g>"
      // page-corner star doodle
      + "<path d='M96 84 l.9 1.9 2.1 .3 -1.5 1.5 .4 2.1 -1.9 -1 -1.9 1 .4 -2.1 -1.5 -1.5 2.1 -.3 z' fill='" + VIOLET + "' opacity='.9'/>";
    return { defs, art, stars: [[18, 26, 0.85, 1], [110, 22, 0.7, 3], [64, 18, 0.6, 5]] };
  };

  // Chat — two transmitter bubbles trading rippling radio waves.
  ART.chat = (a, f) => {
    const base = bright(a);
    const cg = grad(), bg = grad(), sh = grad();
    const defs = chrome(cg) + panelG(bg, base) + sheen(sh);
    // ripples radiating up from the transmitter antenna into open sky
    const ripple = (i) => {
      const r = 5 + ((f * 3.2 + i * 6.5) % 19.5);
      const o = Math.max(0, 1.05 - r / 20);
      return "<path d='" + arcP(46, 30, r, -52, 52) + "' stroke='" + VIOLET + "' stroke-width='2.4' fill='none' stroke-linecap='round' opacity='" + o.toFixed(2) + "'/>";
    };
    const art =
      ripple(0) + ripple(1) + ripple(2)
      // chrome transmitter bubble
      + "<path d='M28 40 h44 a10 10 0 0 1 10 10 v16 a10 10 0 0 1 -10 10 h-26 l-12 12 v-12 h-6 a10 10 0 0 1 -10 -10 v-16 a10 10 0 0 1 10 -10 z' fill='url(#" + cg + ")'/>"
      + "<path d='M28 40 h44 a10 10 0 0 1 10 10 v4 h-64 v-4 a10 10 0 0 1 10 -10 z' fill='url(#" + sh + ")'/>"
      // antenna
      + "<path d='M46 40 V32' stroke='url(#" + cg + ")' stroke-width='2.6' stroke-linecap='round'/>"
      + "<circle cx='46' cy='30' r='2.4' fill='" + (f % 2 ? EMBER : '#7a3618') + "'/>"
      + (f % 2 ? "<circle cx='46' cy='30' r='4' fill='" + EMBER + "' opacity='.5' filter='url(#fglow)'/>" : '')
      // signal dots typing
      + [40, 50, 60].map((x, i) => "<circle cx='" + x + "' cy='58' r='3.4' fill='" + ((f % 3) === i ? EMBERD : '#39415e') + "'/>").join('')
      // accent reply bubble
      + "<g transform='translate(0," + (-FLOAT[f] * 0.9) + ")'>"
      + "<path d='M78 72 h22 a8 8 0 0 1 8 8 v8 a8 8 0 0 1 -8 8 h-4 v9 l-9 -9 h-9 a8 8 0 0 1 -8 -8 v-8 a8 8 0 0 1 8 -8 z' fill='url(#" + bg + ")'/>"
      + "<path d='M78 72 h22 a8 8 0 0 1 8 8 v3 h-38 v-3 a8 8 0 0 1 8 -8 z' fill='#fff' opacity='.28'/>"
      + "<path d='M84 84 h16' stroke='#fff' stroke-width='2.6' stroke-linecap='round' opacity='.9'/>"
      + "<path d='M100 72 V66' stroke='" + shade(base, -40) + "' stroke-width='2.2' stroke-linecap='round'/>"
      + "<circle cx='100' cy='64.5' r='1.8' fill='" + VIOLET + "'/></g>";
    return { defs, art, stars: [[16, 60, 0.75, 1], [112, 40, 0.7, 3], [104, 18, 0.8, 5]] };
  };

  // Chest — a cargo pod cracking open, ember payload light spilling out.
  ART.chest = (a, f) => {
    const base = bright(a);
    const cg = grad(), lid = grad(), em = grad();
    const lift = [0, 2, 4.5, 5.5, 3.5, 1][f];
    const defs = chrome(cg, a) + panelG(lid, base) + emberG(em);
    const orbs = lift > 2
      ? range(3).map((i) => {
        const oy = 52 - lift * (1.5 + i * 0.8), ox = 52 + i * 12;
        return "<circle cx='" + ox + "' cy='" + oy.toFixed(1) + "' r='" + (2.4 - i * 0.4) + "' fill='#ffd9a0' opacity='" + (0.9 - i * 0.22) + "'/>";
      }).join('') : '';
    const art =
      // glow spilling from the crack
      "<ellipse cx='64' cy='" + (57 - lift / 2) + "' rx='28' ry='7' fill='" + EMBER + "' opacity='" + (lift / 9).toFixed(2) + "' filter='url(#fglow)'/>"
      + orbs
      // lid (accent metal cap with hazard chevrons)
      + "<g transform='translate(64," + (53 - lift) + ") rotate(" + (-lift * 1.1) + ")'>"
      + "<path d='M-33 5 v-5 q0 -15 33 -15 q33 0 33 15 v5 z' fill='url(#" + lid + ")'/>"
      + "<path d='M-33 0 q0 -13 33 -13 q33 0 33 13' fill='none' stroke='#fff' stroke-width='1.6' opacity='.4'/>"
      + "<path d='M-12 -1 l6 -6 h6 l-6 6 z M4 -1 l6 -6 h6 l-6 6 z' fill='" + INK + "' opacity='.55'/>"
      + "<path d='" + rr(-6, -4, 12, 8, 2.5) + "' fill='url(#" + cg + ")'/></g>"
      // pod body: chrome cargo capsule
      + "<path d='M30 58 h68 v22 q0 14 -14 14 h-40 q-14 0 -14 -14 z' fill='url(#" + cg + ")'/>"
      + "<path d='M30 58 h68 v5 h-68 z' fill='" + EMBER + "' opacity='" + (0.3 + lift / 14).toFixed(2) + "'/>"
      + "<path d='M40 63 v29 M88 63 v29' stroke='" + INK + "' stroke-width='2.4' opacity='.4'/>"
      // latch plate
      + "<path d='" + rr(56, 60, 16, 13, 3) + "' fill='" + HULL + "'/>"
      + "<circle cx='64' cy='66' r='3.2' fill='" + EMBER + "'/>"
      + "<circle cx='64' cy='66' r='3.2' fill='" + EMBER + "' opacity='.5' filter='url(#fglow)'/>"
      // stencil
      + "<text x='64' y='89' font-family='ui-monospace,monospace' font-size='5' fill='" + INK + "' text-anchor='middle' opacity='.65' letter-spacing='1.2'>CARGO</text>";
    return { defs, art, stars: [[20, 34, 0.9, 0], [108, 28, 0.7, 2], [112, 92, 0.6, 4]] };
  };

  // Imposter — three little astronauts on deck; one visor burns ember.
  ART.imposter = (a, f) => {
    const base = bright(a);
    const cg = grad(), sg = grad(), em = grad();
    const px = [-2.5, 0, 2.5, 0, -2.5, 0][f];
    const q = TW[(f + 1) % 6];
    const defs = chrome(cg) + panelG(sg, base) + emberG(em);
    const naut = (x, y, s, sus) =>
      "<g transform='translate(" + x + ',' + y + ") scale(" + s + ")'>"
      + "<path d='" + rr(-11, 8, 22, 18, 8) + "' fill='" + (sus ? "url(#" + sg + ")" : "url(#" + cg + ")") + "'/>"
      + "<circle cx='0' cy='0' r='12' fill='" + (sus ? "url(#" + sg + ")" : "url(#" + cg + ")") + "'/>"
      + "<path d='" + rr(-8, -5, 16, 9.5, 4.75) + "' fill='" + INK + "'/>"
      + (sus
        ? "<ellipse cx='" + px + "' cy='-0.5' rx='4.5' ry='2.6' fill='" + EMBER + "'/>"
          + "<ellipse cx='" + px + "' cy='-0.5' rx='4.5' ry='2.6' fill='" + EMBER + "' opacity='.6' filter='url(#fglow)'/>"
          + "<ellipse cx='" + (px - 1.3) + "' cy='-1.3' rx='1.4' ry='.8' fill='#fff' opacity='.9'/>"
        : "<path d='M-6 -1.5 q6 3 12 0' stroke='#5cd6ff' stroke-width='1.6' fill='none' opacity='.8'/>")
      + "<ellipse cx='-4.5' cy='-8' rx='3.4' ry='2' fill='#fff' opacity='.55'/>"
      + '</g>';
    const art =
      naut(34, 66, 0.86, false) + naut(94, 68, 0.8, false) + naut(64, 60, 1.12, true)
      + "<text x='86' y='38' font-family='ui-monospace,monospace' font-size='17' font-weight='800' fill='" + EMBER + "' opacity='" + q.toFixed(2) + "'>?</text>";
    return { defs, art, stars: [[18, 28, 0.9, 0], [108, 22, 0.7, 2], [16, 92, 0.6, 4]] };
  };

  // Spy — a chrome magnifier sweeping a star chart, catching a violet star.
  ART.spy = (a, f) => {
    const cg = grad(), gl = grad();
    const mx = [0, 5, 10, 13, 8, 3][f];
    const defs = chrome(cg, a)
      + rg(gl, [[0, '#cfe6ff', 0.4], [0.7, '#8fb4e8', 0.28], [1, '#5c7cc0', 0.2]], 0.35, 0.3);
    const art =
      // star chart panel
      "<path d='" + rr(24, 32, 72, 56, 8) + "' fill='url(#" + cg + ")'/>"
      + "<path d='" + rr(28, 36, 64, 48, 5) + "' fill='" + INK + "'/>"
      + "<path d='M36 74 L50 58 L64 66 L80 46' stroke='" + VIOLET + "' stroke-width='1.4' fill='none' opacity='.6' stroke-dasharray='2.5 2.5'/>"
      + "<circle cx='36' cy='74' r='1.4' fill='#8fa0ff'/><circle cx='50' cy='58' r='1.4' fill='#8fa0ff'/>"
      + "<circle cx='64' cy='66' r='1.4' fill='#8fa0ff'/><circle cx='80' cy='46' r='1.7' fill='#cfd8ff'/>"
      + "<circle cx='42' cy='44' r='1' fill='#8fa0ff' opacity='.7'/><circle cx='72' cy='78' r='1' fill='#8fa0ff' opacity='.7'/>"
      // magnifier sweeping; the lens reveals a bright violet star
      + "<g transform='translate(" + (48 + mx) + ",62)'>"
      + "<circle r='15' fill='url(#" + gl + ")'/>"
      + twk(0, 0, 1.5, f, 2, VIOLET)
      + "<circle r='15' fill='none' stroke='url(#" + cg + ")' stroke-width='4.4'/>"
      + "<circle r='15' fill='none' stroke='" + INK + "' stroke-width='1' opacity='.4'/>"
      + "<path d='M10.8 10.8 l11 11' stroke='url(#" + cg + ")' stroke-width='6.5' stroke-linecap='round'/>"
      + "<path d='M-8.5 -6.5 a10.5 10.5 0 0 1 7.5 -4.5' stroke='#fff' stroke-width='2.6' fill='none' stroke-linecap='round' opacity='.85'/></g>";
    return { defs, art, stars: [[18, 22, 0.85, 1], [110, 20, 0.7, 3], [112, 100, 0.6, 5]] };
  };

  // Tilt — a chrome handheld rocking; the ember ball rolls toward the star.
  ART.tilt = (a, f) => {
    const cg = grad(), gl = grad(), em = grad();
    const rot = [-11, -4, 5, 11, 4, -5][f];
    const bx = -rot * 0.9;
    const defs = chrome(cg, a) + glassG(gl) + emberG(em);
    const art =
      "<g transform='rotate(" + rot + " 64 92)'>"
      + "<path d='" + rr(42, 26, 44, 68, 10) + "' fill='url(#" + cg + ")'/>"
      + "<path d='" + rr(46, 32, 36, 50, 5) + "' fill='" + INK + "'/>"
      + "<path d='" + rr(46, 32, 36, 50, 5) + "' fill='url(#" + gl + ")' opacity='.5'/>"
      // maze walls
      + "<path d='M46 48 h22 M60 64 h22' stroke='#4a5480' stroke-width='3.4' stroke-linecap='round'/>"
      // goal star + rolling ball
      + twk(74, 40, 0.8, f, 2, '#ffd76a')
      + "<circle cx='" + (64 + bx * 0.55) + "' cy='73' r='4.6' fill='url(#" + em + ")'/>"
      + "<circle cx='" + (64 + bx * 0.55) + "' cy='73' r='4.6' fill='" + EMBER + "' opacity='.4' filter='url(#fglow)'/>"
      + "<circle cx='" + (62.6 + bx * 0.55) + "' cy='71.4' r='1.3' fill='#fff' opacity='.9'/>"
      + "<circle cx='64' cy='88' r='2.4' fill='#39415e'/><circle cx='63.4' cy='87.4' r='.8' fill='#fff' opacity='.5'/>"
      + '</g>'
      // motion arcs
      + "<path d='M30 64 q-5 -9 1 -18 M98 64 q5 -9 -1 -18' stroke='" + VIOLET + "' stroke-width='3' fill='none' stroke-linecap='round' opacity='" + (0.3 + TW[f] * 0.55).toFixed(2) + "'/>";
    return { defs, art, stars: [[20, 24, 0.85, 0], [108, 26, 0.7, 2], [16, 96, 0.6, 4]] };
  };

  // Dial — mission-control thrust gauge: chrome housing, ember needle hunting.
  ART.dial = (a, f) => {
    const cg = grad(), gl = grad();
    const ang = [-56, -24, 8, 38, 12, -22][f];
    const defs = chrome(cg, a) + glassG(gl);
    const art =
      "<path d='M22 84 a42 42 0 0 1 84 0 l-5 9 h-74 z' fill='url(#" + cg + ")'/>"
      + "<path d='M30 82 a34 34 0 0 1 68 0 l-4 7 h-60 z' fill='" + INK + "'/>"
      + "<path d='M30 82 a34 34 0 0 1 68 0 l-4 7 h-60 z' fill='url(#" + gl + ")' opacity='.4'/>"
      // zone arcs violet → ember
      + "<path d='" + arcP(64, 80, 27, -62, -14) + "' stroke='" + VIOLET + "' stroke-width='6' fill='none' stroke-linecap='round'/>"
      + "<path d='" + arcP(64, 80, 27, -8, 18) + "' stroke='#ffd76a' stroke-width='6' fill='none' stroke-linecap='round'/>"
      + "<path d='" + arcP(64, 80, 27, 24, 62) + "' stroke='" + EMBER + "' stroke-width='6' fill='none' stroke-linecap='round'/>"
      + "<path d='" + arcP(64, 80, 27, 24, 62) + "' stroke='" + EMBER + "' stroke-width='6' fill='none' stroke-linecap='round' opacity='.4' filter='url(#fglow)'/>"
      // ticks
      + [-60, -30, 0, 30, 60].map((t) => {
        const r1 = 21, r2 = 18, rad = (t - 90) * Math.PI / 180;
        return "<line x1='" + (64 + Math.cos(rad) * r1).toFixed(1) + "' y1='" + (80 + Math.sin(rad) * r1).toFixed(1) + "' x2='" + (64 + Math.cos(rad) * r2).toFixed(1) + "' y2='" + (80 + Math.sin(rad) * r2).toFixed(1) + "' stroke='#7f89ad' stroke-width='1.8' stroke-linecap='round'/>";
      }).join('')
      + "<text x='64' y='91.5' font-family='ui-monospace,monospace' font-size='5' fill='" + INK + "' text-anchor='middle' letter-spacing='1.4' opacity='.75'>THRUST</text>"
      // needle
      + "<g transform='rotate(" + ang + " 64 80)'>"
      + "<path d='M64 80 L64 54' stroke='" + EMBERD + "' stroke-width='3.6' stroke-linecap='round'/>"
      + "<path d='M64 80 L64 56' stroke='#ffd9a0' stroke-width='1.4' stroke-linecap='round'/></g>"
      + "<circle cx='64' cy='80' r='6' fill='url(#" + cg + ")'/><circle cx='62.6' cy='78.6' r='1.8' fill='#fff' opacity='.85'/>"
      + "<circle cx='30' cy='87' r='1.4' fill='#39415e'/><circle cx='98' cy='87' r='1.4' fill='#39415e'/>";
    return { defs, art, stars: [[18, 30, 0.9, 1], [110, 28, 0.7, 3], [64, 16, 0.6, 5]] };
  };

  // Roulette — mission dare cards fanned; the top card fires its rocket sigil.
  ART.roulette = (a, f) => {
    const base = bright(a);
    const cg = grad(), fc = grad();
    const pop = [0, -2.5, -5, -6, -4, -1.5][f];
    const defs = chrome(cg) + panelG(fc, base);
    const cardBack = (tf) =>
      "<g transform='" + tf + "'>"
      + "<path d='" + rr(0, 0, 38, 52, 7) + "' fill='" + HULL + "'/>"
      + "<path d='" + rr(0, 0, 38, 52, 7) + "' fill='none' stroke='url(#" + cg + ")' stroke-width='2.6'/>"
      + '</g>';
    const art =
      cardBack("rotate(-12 50 72) translate(30 44)")
      + cardBack("rotate(7 74 72) translate(56 42)")
      // top card
      + "<g transform='translate(0," + pop + ")'>"
      + "<path d='" + rr(43, 34, 42, 56, 8) + "' fill='url(#" + fc + ")'/>"
      + "<path d='" + rr(46.5, 37.5, 35, 49, 5.5) + "' fill='" + HULL + "'/>"
      + "<path d='" + rr(46.5, 37.5, 35, 49, 5.5) + "' fill='none' stroke='#fff' stroke-width='.8' opacity='.3'/>"
      // rocket sigil with a pulsing mini-flame
      + "<g transform='translate(64,58)'>"
      + "<path d='M0 -12 C4 -8 5.5 -3 5.5 2 L5.5 8 Q0 10.5 -5.5 8 L-5.5 2 C-5.5 -3 -4 -8 0 -12 Z' fill='#e8edf8'/>"
      + "<path d='M-5.5 3 Q-10 7 -9.5 13 L-5.5 9.5 Z M5.5 3 Q10 7 9.5 13 L5.5 9.5 Z' fill='" + VIOLET + "'/>"
      + "<circle cx='0' cy='-1' r='2.6' fill='" + INK + "'/><circle cx='-.8' cy='-1.8' r='.9' fill='#9fd8ff'/>"
      + flame(0, 10, 0.42, f)
      + '</g>'
      + twk(64, 80, 0.62, f, 3, '#ffd76a')
      + '</g>';
    return { defs, art, stars: [[20, 28, 0.9, 0], [108, 24, 0.75, 2], [112, 98, 0.6, 4]] };
  };

  // Fake Facts — a helmeted fibber; the ember nose stretches out of the visor.
  ART.fakefacts = (a, f) => {
    const cg = grad(), fcg = grad(), ng = grad();
    const nose = [12, 19, 27, 34, 25, 16][f];
    const defs = chrome(cg, a)
      + rg(fcg, [[0, '#ffe9d4'], [0.6, '#ffd2ae'], [1, '#e8a878']], 0.38, 0.32)
      + lg(ng, [[0, '#ffc49a'], [1, EMBERD]], false);
    const art =
      // helmet shell
      "<circle cx='48' cy='62' r='26' fill='url(#" + cg + ")'/>"
      + "<circle cx='48' cy='62' r='26' fill='none' stroke='" + INK + "' stroke-width='1.2' opacity='.3'/>"
      + "<path d='" + rr(40, 84, 16, 8, 4) + "' fill='url(#" + cg + ")'/>"
      // open visor ring + face
      + "<circle cx='50' cy='63' r='17.5' fill='" + HULL + "'/>"
      + "<circle cx='50' cy='63' r='15' fill='url(#" + fcg + ")'/>"
      // shifty eyes + worried brow
      + "<circle cx='45' cy='58' r='2.6' fill='" + INK + "'/><circle cx='56' cy='58' r='2.6' fill='" + INK + "'/>"
      + "<circle cx='45.9' cy='57.2' r='.9' fill='#fff'/><circle cx='56.9' cy='57.2' r='.9' fill='#fff'/>"
      + "<path d='M41 52 q3 -2.5 6 -1 M60 51 q-3 -2.5 -6 -1' stroke='" + INK + "' stroke-width='1.6' fill='none' stroke-linecap='round'/>"
      + "<path d='M44 73 q5 -3.5 10 0' stroke='" + INK + "' stroke-width='2' fill='none' stroke-linecap='round'/>"
      + spec(38, 48, 6, 4, 0.55)
      // the growing nose, stretching out past the visor ring
      + "<rect x='58' y='60.5' width='" + nose + "' height='8.5' rx='4.25' fill='url(#" + ng + ")'/>"
      + "<rect x='58' y='61.8' width='" + nose + "' height='2.6' rx='1.3' fill='#fff' opacity='.4'/>"
      + "<circle cx='" + (58 + nose) + "' cy='64.75' r='4.25' fill='" + EMBERD + "'/>"
      + "<circle cx='" + (58 + nose) + "' cy='64.75' r='4.25' fill='" + EMBER + "' opacity='.4' filter='url(#fglow)'/>"
      + "<circle cx='" + (57 + nose) + "' cy='63.4' r='1.2' fill='#fff' opacity='.75'/>"
      + "<circle cx='48' cy='38.5' r='2' fill='" + (f % 2 ? EMBER : '#7a3618') + "'/>";
    return { defs, art, stars: [[18, 28, 0.85, 1], [106, 26, 0.75, 3], [104, 96, 0.6, 5]] };
  };

  // One Clue — a hand-blown glass bulb holding a captured star.
  ART.oneclue = (a, f) => {
    const cg = grad(), gg = grad(), hg = grad();
    const on = TW[(f + 2) % 6];
    const defs = chrome(cg)
      + rg(gg, [[0, '#ffffff', 0.28], [0.62, '#bcd0ff', 0.12], [0.88, '#9db4f0', 0.3], [1, '#8ba4e8', 0.5]], 0.4, 0.32)
      + rg(hg, [[0, '#ffe9c2', 0.85], [0.55, EMBER, 0.4], [1, EMBER, 0]]);
    const art =
      // halo when bright
      "<circle cx='64' cy='52' r='30' fill='url(#" + hg + ")' opacity='" + (0.25 + on * 0.75).toFixed(2) + "'/>"
      // filament wires cradling the star
      + "<path d='M58 74 Q56 62 61 55 M70 74 Q72 62 67 55' stroke='#c9a24a' stroke-width='1.6' fill='none'/>"
      // the captured star
      + twk(64, 52, 2.1 + on * 0.55, f, 2, '#ffd9a0')
      + "<circle cx='64' cy='52' r='3' fill='#fff8e8' opacity='" + (0.5 + on * 0.5).toFixed(2) + "'/>"
      // hand-blown glass envelope
      + "<path d='M64 28 C77 28 85 38 85 50 C85 60 79 65 76 70 C74 73 74 76 74 78 L54 78 C54 76 54 73 52 70 C49 65 43 60 43 50 C43 38 51 28 64 28 Z' fill='url(#" + gg + ")'/>"
      + "<path d='M64 28 C77 28 85 38 85 50 C85 60 79 65 76 70 C74 73 74 76 74 78 L54 78 C54 76 54 73 52 70 C49 65 43 60 43 50 C43 38 51 28 64 28 Z' fill='none' stroke='#dfe8ff' stroke-width='1.4' opacity='.7'/>"
      + "<path d='M50 38 a16 16 0 0 1 9 -6' stroke='#fff' stroke-width='2.6' fill='none' stroke-linecap='round' opacity='.85'/>"
      + "<ellipse cx='76' cy='58' rx='2' ry='5' fill='#fff' opacity='.3'/>"
      // chrome screw base
      + "<path d='" + rr(53, 79, 22, 5, 2.5) + "' fill='url(#" + cg + ")'/>"
      + "<path d='" + rr(54, 85, 20, 5, 2.5) + "' fill='url(#" + cg + ")'/>"
      + "<path d='" + rr(57, 91, 14, 5, 5) + "' fill='url(#" + cg + ")'/>";
    return { defs, art, stars: [[26, 26, 0.9, 0], [102, 24, 0.75, 3], [104, 82, 0.6, 5]] };
  };

  // Same Brain — two astronauts sharing ONE star-thought, dotted think-trails
  // rising from both helmets to the same star, pulsing in perfect sync.
  ART.samebrain = (a, f) => {
    const base = bright(a);
    const cg = grad(), bg = grad(), sg = grad();
    const wob = TW[(f + 2) % 6];
    const defs = chrome(cg) + panelG(bg, base) + panelG(sg, shade(base, -25));
    const head = (x, tint, flip) =>
      "<g transform='translate(" + x + ",68)'>"
      + "<path d='" + rr(-12, 10, 24, 18, 8) + "' fill='" + (tint ? "url(#" + bg + ")" : "url(#" + cg + ")") + "'/>"
      + "<circle cx='0' cy='0' r='13.5' fill='" + (tint ? "url(#" + bg + ")" : "url(#" + cg + ")") + "'/>"
      // visor angled toward the middle
      + "<path d='" + rr(flip ? -9.5 : -6.5, -6, 16, 10, 5) + "' fill='" + INK + "'/>"
      + "<path d='M" + (flip ? -6 : -2) + " -2 q4 3 8 0' stroke='#5cd6ff' stroke-width='1.7' fill='none' opacity='.85' transform='translate(" + (flip ? -1 : -3) + ",0)'/>"
      + "<ellipse cx='" + (flip ? 5 : -5) + "' cy='-9' rx='3.6' ry='2.2' fill='#fff' opacity='.55'/>"
      + '</g>';
    // dotted think-trails converging on the one shared star
    const dot = (x, y, r, ph) => "<circle cx='" + x + "' cy='" + y + "' r='" + r + "' fill='" + VIOLET + "' opacity='" + (0.3 + TW[(f + ph) % 6] * 0.7).toFixed(2) + "'/>";
    const art =
      dot(48, 54, 1.6, 4) + dot(55, 44, 2.2, 3)
      + dot(80, 54, 1.6, 4) + dot(73, 44, 2.2, 3)
      // the shared star-thought
      + "<circle cx='64' cy='32' r='" + (8 + wob * 5).toFixed(1) + "' fill='" + EMBER + "' opacity='" + (0.14 + wob * 0.2).toFixed(2) + "' filter='url(#fglow)'/>"
      + twk(64, 32, 2 + wob * 0.7, f, 2, '#ffd9a0')
      + "<circle cx='64' cy='32' r='2.6' fill='#fff8e8' opacity='" + (0.5 + wob * 0.5).toFixed(2) + "'/>"
      + head(42, false, false) + head(86, true, true);
    return { defs, art, stars: [[16, 26, 0.85, 0], [112, 26, 0.85, 0], [64, 106, 0.6, 4]] };
  };

  // Wolves — a wolf on a crater ridge howling at a big detailed moon.
  ART.wolves = (a, f) => {
    const mg = grad(), wg = grad(), rg2 = grad();
    const howl = [0, -2, -4, -5, -3, -1][f];
    const glow = [0.3, 0.45, 0.62, 0.72, 0.55, 0.4][f];
    const defs = rg(mg, [[0, '#fff9e4'], [0.55, '#ffe9b4'], [0.85, '#eec86e'], [1, '#d0a548']], 0.42, 0.38)
      + lg(wg, [[0, '#3a3560'], [0.6, '#262148'], [1, '#181534']])
      + lg(rg2, [[0, '#2e2a52'], [1, '#151230']]);
    const art =
      // the moon, big and cratered
      "<circle cx='86' cy='38' r='24' fill='#ffe9b4' opacity='" + glow + "' filter='url(#fglow)'/>"
      + "<circle cx='86' cy='38' r='19' fill='url(#" + mg + ")'/>"
      + "<circle cx='79' cy='32' r='3.6' fill='#e0b95e' opacity='.75'/><circle cx='79.6' cy='31.4' r='3' fill='#eecb78' opacity='.8'/>"
      + "<circle cx='92' cy='43' r='2.6' fill='#e0b95e' opacity='.7'/><circle cx='92.5' cy='42.6' r='2' fill='#eecb78' opacity='.75'/>"
      + "<circle cx='88' cy='29' r='1.6' fill='#e0b95e' opacity='.6'/>"
      + "<circle cx='81' cy='45' r='1.8' fill='#e0b95e' opacity='.6'/>"
      + "<path d='M69 31 a19 19 0 0 1 10 -10' stroke='#fff8e0' stroke-width='2.4' fill='none' stroke-linecap='round' opacity='.85'/>"
      // howl ripples drifting from the muzzle toward the moon
      + range(3).map((i) => {
        const r = 5 + ((f * 3 + i * 7) % 21);
        return "<path d='" + arcP(58, 46, r, 15, 75) + "' stroke='#ffe9b4' stroke-width='2' fill='none' stroke-linecap='round' opacity='" + Math.max(0, 0.9 - r / 24).toFixed(2) + "'/>";
      }).join('')
      // crater ridge
      + "<path d='M14 96 Q30 88 44 91 Q50 84 60 86 Q78 82 92 88 Q104 86 114 92 L114 104 L14 104 Z' fill='url(#" + rg2 + ")'/>"
      + "<ellipse cx='80' cy='92' rx='7' ry='2' fill='#0c0a22'/>"
      + "<ellipse cx='28' cy='96' rx='5' ry='1.6' fill='#0c0a22'/>"
      // the wolf: sitting silhouette, head thrown back mid-howl
      + "<g transform='rotate(" + howl + " 40 90)'>"
      // tail
      + "<path d='M28 88 q-9 -2 -11 -11 q7 -1 11 4 z' fill='url(#" + wg + ")'/>"
      // body, neck up, ear, raised muzzle
      + "<path d='M26 91 Q24 74 36 65 Q38 57 45 52 L42 41 Q48 43 50.5 47.5 Q52 44.5 55 42.5 L64 34 Q64.5 40 61 44.5 L55 51 Q57 57 55 65 L50 78 L52 91 Z' fill='url(#" + wg + ")'/>"
      // front leg
      + "<path d='M46 78 L44 91 L50 91 L50 78 Z' fill='url(#" + wg + ")'/>"
      + "<circle cx='49' cy='50' r='1.3' fill='#ffe9b4'/>"
      + '</g>';
    return { defs, art, stars: [[22, 24, 0.9, 1], [110, 66, 0.7, 3], [58, 20, 0.65, 5]] };
  };

  // ---- fallback: the letter embroidered on a mission patch -------------------
  function fallbackArt(letter, a, f) {
    const base = bright(a);
    const cg = grad(), fg = grad();
    const defs = chrome(cg) + lg(fg, [[0, shade(base, -20)], [0.5, shade(base, -55)], [1, shade(base, -85)]]);
    const pent = 'M64 24 L99.5 50 L86 92 L42 92 L28.5 50 Z';
    const art =
      // chrome embroidered border (rounded pentagon patch)
      "<path d='" + pent + "' fill='url(#" + fg + ")' stroke='url(#" + cg + ")' stroke-width='7' stroke-linejoin='round'/>"
      + "<path d='" + pent + "' fill='none' stroke='" + shade(base, 20) + "' stroke-width='1.4' stroke-dasharray='3 2.6' stroke-linejoin='round' opacity='.85'/>"
      // patch star + orbit stitch
      + "<path d='" + arcP(64, 62, 22, 120, 300) + "' stroke='" + VIOLET + "' stroke-width='1.6' fill='none' opacity='.6' stroke-dasharray='2.5 2.5'/>"
      + twk(80, 46, 0.9, f, 2, '#ffd76a')
      + "<text x='64' y='74' font-family='ui-monospace,monospace' font-size='30' font-weight='800' fill='#f2f5ff' text-anchor='middle'>" + letter + '</text>'
      + "<text x='64' y='74' font-family='ui-monospace,monospace' font-size='30' font-weight='800' fill='" + EMBER + "' text-anchor='middle' opacity='.35' filter='url(#fglow)'>" + letter + '</text>';
    return { defs, art, stars: [[18, 26, 0.9, 0], [110, 32, 0.7, 2], [22, 100, 0.6, 4]] };
  }

  GifOS.iconPacks.register('countdown', {
    size: SIZE, frames: FR, delayCs: DELAY, dither: 12,
    draw(subject, accent) {
      const builder = ART[subject];
      if (!builder) return null;
      return range(FR).map((f) => { const r = builder(accent, f); return shell(r.defs, r.art, f, r.stars); });
    },
    fallback(letter, accent) {
      return range(FR).map((f) => { const r = fallbackArt(letter, accent, f); return shell(r.defs, r.art, f, r.stars); });
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
