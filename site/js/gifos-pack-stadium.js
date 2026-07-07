/*
 * gifos-pack-stadium.js — "Stadium", the sports fans' computer (4.gifos.app).
 *
 * Varsity sports material world under floodlit night: stitched leather,
 * felt pennants and letterman patches with embroidered borders, glowing
 * scoreboard bulbs, chalk lines on turf, jersey numbers. Every subject is
 * re-imagined as a piece of game-day kit — the referee's stopwatch, the
 * coach's whiteboard, the sideline broadcast camera — floating over its own
 * floodlight contact shadow.
 *
 * Fully procedural SVG. 160px raster, 6 frames, ordered dithering.
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
  // Normalize an accent into a rich team-felt color.
  const team = (a) => { const m = Math.max(a[0], a[1], a[2]) || 1, s = 215 / m; return toHex([a[0] * s, a[1] * s, a[2] * s]); };

  // The varsity palette.
  const TURF = '#1d7a3e';    // turf green
  const GOLD = '#ffd23c';    // floodlight gold
  const RED = '#d94141';     // jersey red
  const NAVY = '#1e3a6e';    // jersey navy
  const CHALK = '#f2ead6';   // chalk cream
  const LEATHER = '#a5713d'; // mitt leather
  const INK = '#08140c';     // floodlit-night shadow ink

  // ---- gradient / material helpers -----------------------------------------
  let uid = 0;
  const grad = () => 'sg' + (uid++);
  function lg(id, stops, vert) {
    const s = stops.map((st) => "<stop offset='" + st[0] + "' stop-color='" + st[1] + "'" + (st[2] != null ? " stop-opacity='" + st[2] + "'" : '') + '/>').join('');
    return "<linearGradient id='" + id + "' x1='0' y1='0' x2='" + (vert === false ? 1 : 0) + "' y2='" + (vert === false ? 0 : 1) + "'>" + s + '</linearGradient>';
  }
  function rg(id, stops, fx, fy) {
    const s = stops.map((st) => "<stop offset='" + st[0] + "' stop-color='" + st[1] + "'" + (st[2] != null ? " stop-opacity='" + st[2] + "'" : '') + '/>').join('');
    return "<radialGradient id='" + id + "'" + (fx != null ? " fx='" + fx + "' fy='" + fy + "'" : '') + '>' + s + '</radialGradient>';
  }
  // Felt: a soft top-lit 3-stop body — less glassy than aurora, more fabric.
  function feltGrad(id, base) {
    return lg(id, [[0, shade(base, 30)], [0.55, base], [1, shade(base, -34)]]);
  }
  // Leather: warm, deeper falloff.
  function leatherGrad(id, base) {
    return lg(id, [[0, shade(base, 38)], [0.5, base], [1, shade(base, -48)]]);
  }
  // Brushed metal (whistle chrome / clipboard clip).
  function metalGrad(id) {
    return lg(id, [[0, '#f4f2ec'], [0.45, '#c9c4b4'], [0.7, '#98937f'], [1, '#6e6a58']]);
  }
  // Trophy gold — cylindrical (horizontal) sheen.
  function trophyGrad(id) {
    return lg(id, [[0, '#8a5f14'], [0.22, '#f6cf62'], [0.5, '#fff0b8'], [0.78, '#e0a92e'], [1, '#7c5510']], false);
  }
  // Soft top-sheen overlay.
  function sheenGrad(id) {
    return lg(id, [[0, '#ffffff', 0.42], [0.4, '#ffffff', 0.12], [0.6, '#ffffff', 0]]);
  }

  // Motion tables — heavier, sports-gear bob (gentler than aurora's float).
  const FLOAT = [0, -1.5, -2.5, -3, -2, -1];
  const PULSE = [0, 0.35, 0.85, 1, 0.6, 0.2];

  // Contact shadow under the floodlights.
  function shadow(f, rx, cy) {
    const t = -FLOAT[f] / 3;
    return "<ellipse cx='64' cy='" + (cy || 108) + "' rx='" + (rx - t * 3) + "' ry='" + (6.5 - t * 1.2) + "' fill='" + INK + "' opacity='" + (0.42 - t * 0.1) + "' filter='url(#sblur)'/>";
  }
  // Embroidered stitch border (dashed cream running stitch).
  function stitch(d, color, w) {
    return "<path d='" + d + "' fill='none' stroke='" + (color || CHALK) + "' stroke-width='" + (w || 2) + "' stroke-dasharray='3.6 3' stroke-linecap='round' opacity='.85'/>";
  }
  // Chalk line: cream stroke + a soft white overdraw so it reads dusty.
  function chalkLine(d, w) {
    return "<path d='" + d + "' stroke='" + CHALK + "' stroke-width='" + w + "' fill='none' stroke-linecap='round' stroke-linejoin='round' opacity='.92'/>"
      + "<path d='" + d + "' stroke='#ffffff' stroke-width='" + (w * 0.45) + "' fill='none' stroke-linecap='round' stroke-linejoin='round' opacity='.4' transform='translate(.5,-.5)'/>";
  }
  // Scoreboard bulb: warm glowing dot, or a dead socket.
  function bulb(x, y, r, on, glow) {
    if (!on) return "<circle cx='" + x + "' cy='" + y + "' r='" + r + "' fill='#26221a'/>"
      + "<circle cx='" + x + "' cy='" + y + "' r='" + (r * 0.5) + "' fill='#453d28' opacity='.9'/>";
    return "<circle cx='" + x + "' cy='" + y + "' r='" + (r * (glow || 2)) + "' fill='" + GOLD + "' opacity='.32' filter='url(#sglow)'/>"
      + "<circle cx='" + x + "' cy='" + y + "' r='" + r + "' fill='" + GOLD + "'/>"
      + "<circle cx='" + (x - r * 0.3) + "' cy='" + (y - r * 0.32) + "' r='" + (r * 0.4) + "' fill='#fff8dd'/>";
  }
  // Soft specular.
  function spec(x, y, rx, ry, op) {
    return "<ellipse cx='" + x + "' cy='" + y + "' rx='" + rx + "' ry='" + ry + "' fill='#fff' opacity='" + (op || 0.5) + "' filter='url(#ssoft)'/>";
  }
  // Sample a quadratic bezier into a partial polyline (for self-drawing plays).
  function qpts(p0, p1, p2, n) {
    return range(n + 1).map((i) => {
      const t = i / n, u = 1 - t;
      return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
    });
  }
  function polyd(pts, k) {
    let d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (let i = 1; i <= k; i++) d += ' L' + pts[i][0].toFixed(1) + ' ' + pts[i][1].toFixed(1);
    return d;
  }
  // Arrowhead oriented along the last polyline segment.
  function arrowHead(pts, k, color, s) {
    const p = pts[k], q = pts[Math.max(0, k - 1)];
    const ang = Math.atan2(p[1] - q[1], p[0] - q[0]) * 180 / Math.PI;
    return "<g transform='translate(" + p[0].toFixed(1) + ',' + p[1].toFixed(1) + ") rotate(" + ang.toFixed(1) + ")'>"
      + "<path d='M0 0 L-" + s * 1.5 + ' -' + s + ' M0 0 L-' + s * 1.5 + ' ' + s + "' stroke='" + color + "' stroke-width='" + (s * 0.75) + "' stroke-linecap='round' fill='none'/></g>";
  }

  // Frame wrapper: defs + shadow + bobbed art. All subjects share this shell.
  function shell(defs, art, f, shadowRx) {
    return "<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'>"
      + '<defs>'
      + "<filter id='sblur' x='-60%' y='-60%' width='220%' height='220%'><feGaussianBlur stdDeviation='4.2'/></filter>"
      + "<filter id='ssoft' x='-60%' y='-60%' width='220%' height='220%'><feGaussianBlur stdDeviation='2'/></filter>"
      + "<filter id='sglow' x='-90%' y='-90%' width='280%' height='280%'><feGaussianBlur stdDeviation='3.4'/></filter>"
      + defs + '</defs>'
      + shadow(f, shadowRx || 34)
      + "<g transform='translate(0," + FLOAT[f] + ")'>" + art + '</g></svg>';
  }

  // Rounded-rect path.
  const rr = (x, y, w, h, r) => 'M' + (x + r) + ' ' + y + ' h' + (w - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r
    + ' v' + (h - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 -' + r + ' ' + r + ' h-' + (w - 2 * r)
    + ' a' + r + ' ' + r + ' 0 0 1 -' + r + ' -' + r + ' v-' + (h - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' -' + r + ' z';

  // ---- subjects -------------------------------------------------------------
  const ART = {};

  // Video Call — the sideline broadcast camera (hero app). Boxy navy body with
  // an accent livery stripe, hooded lens, viewfinder, handle, blinking tally
  // light and a LIVE plate. The whole rig pans gently like it's tracking play.
  ART.video = (a, f) => {
    const acc = team(a);
    const g1 = grad(), g2 = grad(), g3 = grad(), g4 = grad(), sh = grad();
    const pan = [-2.5, -1, 1, 2.5, 1, -1][f];
    const rec = f % 2 === 0;
    const defs = feltGrad(g1, NAVY)
      + feltGrad(g2, acc)
      + rg(g3, [[0, '#9db8d8'], [0.4, '#3a5a8c'], [0.75, '#16233f'], [1, '#0b1424']], 0.36, 0.34)
      + metalGrad(g4)
      + sheenGrad(sh);
    const art = "<g transform='rotate(" + pan + " 64 66)'>"
      // handle
      + "<path d='" + rr(52, 30, 38, 8, 4) + "' fill='url(#" + g4 + ")'/>"
      + "<rect x='58' y='36' width='6' height='10' fill='url(#" + g4 + ")'/><rect x='80' y='36' width='6' height='10' fill='url(#" + g4 + ")'/>"
      // viewfinder
      + "<path d='" + rr(88, 40, 18, 13, 3) + "' fill='" + shade(NAVY, -22) + "'/>"
      + "<rect x='91' y='43' width='12' height='7' rx='1.5' fill='#7fd4ff' opacity='.9'/>"
      + "<rect x='91' y='43' width='12' height='3' rx='1.5' fill='#d8f2ff' opacity='.7'/>"
      // body
      + "<path d='" + rr(42, 44, 56, 44, 8) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='M42 64 h56 v9 h-56 z' fill='url(#" + g2 + ")'/>"
      + "<path d='M42 64 h56 v2 h-56 z' fill='#fff' opacity='.25'/>"
      // vents + knob
      + "<path d='M76 78 h14 M76 82 h14' stroke='" + shade(NAVY, -34) + "' stroke-width='2' stroke-linecap='round'/>"
      + "<circle cx='90' cy='55' r='4' fill='url(#" + g4 + ")'/><circle cx='89' cy='54' r='1.2' fill='#fff' opacity='.8'/>"
      // lens hood + barrel + glass
      + "<path d='M42 50 L26 44 V88 L42 82 Z' fill='" + shade(NAVY, -30) + "'/>"
      + "<path d='M42 50 L26 44 V54 L42 58 Z' fill='" + shade(NAVY, -8) + "'/>"
      + "<ellipse cx='26' cy='66' rx='6' ry='22' fill='" + shade(NAVY, -44) + "'/>"
      + "<ellipse cx='26' cy='66' rx='4.6' ry='18.5' fill='url(#" + g3 + ")'/>"
      + "<ellipse cx='24.6' cy='58' rx='1.7' ry='5' fill='#dff0ff' opacity='.85'/>"
      // tally + LIVE plate
      + "<circle cx='50' cy='38' r='3.6' fill='" + (rec ? '#ff5a5a' : '#5c2020') + "'/>"
      + (rec ? "<circle cx='50' cy='38' r='3.6' fill='#ff5a5a' opacity='.6' filter='url(#sglow)'/>" : '')
      + "<path d='" + rr(50, 50, 26, 10, 2.5) + "' fill='#101a2e'/>"
      + "<text x='63' y='58' font-family='system-ui,sans-serif' font-size='7.5' font-weight='800' letter-spacing='1' fill='" + (rec ? GOLD : '#8a7a3a') + "' text-anchor='middle'>LIVE</text>"
      + "<path d='" + rr(42, 44, 56, 12, 8) + "' fill='url(#" + sh + ")'/>"
      + '</g>';
    return { defs, art, shadowRx: 42 };
  };

  // Folder — the kit-bag folder: team-felt panels, stitched edges, and a
  // circular jersey-number patch sewn on the front. Papers lift like a roster.
  ART.folder = (a, f) => {
    const acc = team(a);
    const g1 = grad(), g2 = grad(), g3 = grad(), sh = grad();
    const lift = [0, 1.5, 3, 3.5, 2.5, 1][f];
    const defs = feltGrad(g1, shade(acc, -40))
      + feltGrad(g2, acc)
      + lg(g3, [[0, '#fffdf4'], [1, '#e2d8bd']])
      + sheenGrad(sh);
    const art =
      "<path d='M20 38 a8 8 0 0 1 8 -8 h20 a8 8 0 0 1 6.4 3.2 l4.8 6.4 h41 a8 8 0 0 1 8 8 v40 a10 10 0 0 1 -10 10 h-68 a10 10 0 0 1 -10 -10 z' fill='url(#" + g1 + ")'/>"
      + "<g transform='translate(0," + (-lift) + ")'>"
      + "<path d='" + rr(32, 34, 62, 30, 4) + "' fill='url(#" + g3 + ")'/>"
      + "<path d='M40 42 h36 M40 49 h26' stroke='#b8ab88' stroke-width='3' stroke-linecap='round' fill='none'/></g>"
      + "<path d='M18 56 a8 8 0 0 1 8 -8 h76 a8 8 0 0 1 8 8 l-2 32 a10 10 0 0 1 -10 9.8 h-68 a10 10 0 0 1 -10 -9.8 z' fill='url(#" + g2 + ")'/>"
      + stitch('M22.5 54 a5 5 0 0 1 4 -2 h75 a5 5 0 0 1 4 2', CHALK, 2)
      + stitch('M23.4 92 h81', CHALK, 2)
      // jersey-number patch
      + "<circle cx='64' cy='72' r='12.5' fill='" + CHALK + "'/>"
      + "<circle cx='64' cy='72' r='12.5' fill='none' stroke='" + RED + "' stroke-width='2.4' stroke-dasharray='3.2 2.6' stroke-linecap='round'/>"
      + "<text x='64' y='78.5' font-family='Georgia,serif' font-size='17' font-weight='700' fill='" + NAVY + "' text-anchor='middle'>7</text>"
      + "<path d='M18 56 a8 8 0 0 1 8 -8 h76 a8 8 0 0 1 8 8 l-.6 8 h-90.8 z' fill='url(#" + sh + ")'/>";
    return { defs, art, shadowRx: 42 };
  };

  // Notes — the clipboard playbook: leather board, chrome clamp, and a play
  // sheet where the red route arrow draws itself between the O's and the X.
  ART.notes = (a, f) => {
    const acc = team(a);
    const g1 = grad(), g2 = grad(), sh = grad();
    const defs = leatherGrad(g1, LEATHER) + metalGrad(g2) + sheenGrad(sh);
    const pts = qpts([44, 84], [58, 60], [86, 74], 18);
    const k = Math.min(18, 3 + f * 3);
    const done = k >= 18;
    const art =
      // board
      "<path d='" + rr(32, 30, 66, 70, 8) + "' fill='" + shade(LEATHER, -60) + "' transform='translate(2,3)'/>"
      + "<path d='" + rr(30, 28, 66, 70, 8) + "' fill='url(#" + g1 + ")'/>"
      + stitch(rr(33.5, 31.5, 59, 63, 5.5), '#e8cf9e', 1.8)
      // paper
      + "<path d='" + rr(37, 42, 52, 50, 3) + "' fill='#fffdf2'/>"
      + "<path d='" + rr(37, 42, 52, 50, 3) + "' fill='" + INK + "' opacity='.06' transform='translate(1,1.5)'/>"
      + "<path d='" + rr(37, 42, 52, 50, 3) + "' fill='#fffdf2'/>"
      + "<path d='M42 50 h30' stroke='#c9bd97' stroke-width='2.4' stroke-linecap='round'/>"
      // the play: O's, X, and the self-drawing route
      + "<circle cx='47' cy='62' r='4' fill='none' stroke='" + NAVY + "' stroke-width='2.6'/>"
      + "<circle cx='60' cy='58' r='4' fill='none' stroke='" + NAVY + "' stroke-width='2.6'/>"
      + "<path d='M78 58 l7 7 M85 58 l-7 7' stroke='" + NAVY + "' stroke-width='2.8' stroke-linecap='round'/>"
      + "<path d='" + polyd(pts, k) + "' stroke='" + RED + "' stroke-width='2.8' fill='none' stroke-linecap='round' stroke-linejoin='round' stroke-dasharray='5 3.4'/>"
      + (done ? arrowHead(pts, 18, RED, 3.4) : '')
      // clamp
      + "<path d='" + rr(50, 22, 28, 12, 4) + "' fill='url(#" + g2 + ")'/>"
      + "<path d='" + rr(46, 31, 36, 7, 3) + "' fill='url(#" + g2 + ")'/>"
      + "<circle cx='64' cy='27' r='2.4' fill='#6e6a58'/>"
      + "<path d='" + rr(30, 28, 66, 16, 8) + "' fill='url(#" + sh + ")'/>";
    return { defs, art, shadowRx: 38 };
  };

  // Calculator — a pocket scoreboard: navy shell with gold trim, black bulb
  // display flipping scores, chunky cream buttons with a chasing gold key.
  ART.calc = (a, f) => {
    const acc = team(a);
    const g1 = grad(), g2 = grad(), sh = grad();
    const defs = feltGrad(g1, NAVY) + feltGrad(g2, acc) + sheenGrad(sh);
    const score = ['21', '24', '28', '35', '42', '99'][f];
    let btns = '';
    for (let r0 = 0; r0 < 3; r0++) for (let c = 0; c < 3; c++) {
      const i = r0 * 3 + c, on = i === (f * 2 + 1) % 9;
      btns += "<rect x='" + (40 + c * 17) + "' y='" + (63 + r0 * 12.5) + "' width='13' height='9' rx='3' fill='" + (on ? GOLD : CHALK) + "'/>"
        + "<rect x='" + (40 + c * 17) + "' y='" + (63 + r0 * 12.5) + "' width='13' height='4' rx='2' fill='#fff' opacity='.5'/>"
        + (on ? "<rect x='" + (40 + c * 17) + "' y='" + (63 + r0 * 12.5) + "' width='13' height='9' rx='3' fill='" + GOLD + "' opacity='.5' filter='url(#sglow)'/>" : '');
    }
    const art =
      "<path d='" + rr(30, 26, 68, 76, 12) + "' fill='" + shade(NAVY, -40) + "' transform='translate(1.5,2.5)'/>"
      + "<path d='" + rr(30, 26, 68, 76, 12) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(30, 26, 68, 76, 12) + "' fill='none' stroke='url(#" + g2 + ")' stroke-width='2.6'/>"
      // scoreboard display
      + "<path d='" + rr(38, 34, 52, 20, 4) + "' fill='#0a0d12'/>"
      + "<text x='64' y='50' font-family='ui-monospace,monospace' font-size='16' font-weight='700' fill='" + GOLD + "' text-anchor='middle' letter-spacing='2'>" + score + "</text>"
      + "<text x='64' y='50' font-family='ui-monospace,monospace' font-size='16' font-weight='700' fill='" + GOLD + "' text-anchor='middle' letter-spacing='2' opacity='.55' filter='url(#sglow)'>" + score + "</text>"
      + "<path d='M40 44 h48' stroke='#0a0d12' stroke-width='1.6' opacity='.85'/>"
      + bulb(43, 38, 1.7, f % 2 === 0, 1.6) + bulb(85, 38, 1.7, f % 2 === 1, 1.6)
      + btns
      + "<path d='" + rr(30, 26, 68, 20, 12) + "' fill='url(#" + sh + ")'/>";
    return { defs, art, shadowRx: 36 };
  };

  // Timer — the referee's stopwatch: chrome case, cream face, red sweep hand,
  // and the lanyard cord swaying with each tick.
  ART.timer = (a, f) => {
    const acc = team(a);
    const g1 = grad(), g2 = grad(), g3 = grad();
    const ang = f * 60;
    const sway = [0, 2, 3.5, 3, 1, -1][f];
    const defs = metalGrad(g1)
      + rg(g2, [[0, '#fffdf4'], [0.72, '#f4ecd6'], [1, '#d8ccab']], 0.4, 0.3)
      + feltGrad(g3, acc);
    const ticks = range(12).map((i) => {
      const t = i * 30 * Math.PI / 180, r1 = 24, r2 = i % 3 === 0 ? 19.5 : 21.5;
      return "<line x1='" + (64 + Math.sin(t) * r1).toFixed(1) + "' y1='" + (68 - Math.cos(t) * r1).toFixed(1) + "' x2='" + (64 + Math.sin(t) * r2).toFixed(1) + "' y2='" + (68 - Math.cos(t) * r2).toFixed(1) + "' stroke='" + NAVY + "' stroke-width='" + (i % 3 === 0 ? 3 : 1.8) + "' stroke-linecap='round'/>";
    }).join('');
    const art =
      // lanyard cord
      "<path d='M60 24 C" + (42 + sway) + ' 26, ' + (30 + sway) + ' 44, ' + (26 + sway * 1.6) + " 62' stroke='" + NAVY + "' stroke-width='3.4' fill='none' stroke-linecap='round'/>"
      + "<circle cx='" + (26 + sway * 1.6) + "' cy='64' r='3.4' fill='url(#" + g3 + ")'/>"
      // crown + shoulders
      + "<rect x='59' y='22' width='10' height='11' rx='2.5' fill='url(#" + g1 + ")'/>"
      + "<rect x='55' y='20' width='18' height='6.5' rx='3' fill='url(#" + g3 + ")'/>"
      + "<g transform='rotate(42 64 68)'><rect x='58.5' y='32' width='11' height='8' rx='3' fill='url(#" + g1 + ")'/></g>"
      + "<g transform='rotate(-42 64 68)'><rect x='58.5' y='32' width='11' height='8' rx='3' fill='url(#" + g1 + ")'/></g>"
      // case + face
      + "<circle cx='64' cy='68' r='33' fill='url(#" + g1 + ")'/>"
      + "<circle cx='64' cy='68' r='33' fill='" + INK + "' opacity='.08'/>"
      + "<circle cx='64' cy='68' r='27.5' fill='" + shade(LEATHER, -55) + "'/>"
      + "<circle cx='64' cy='68' r='26' fill='url(#" + g2 + ")'/>"
      + ticks
      + "<text x='64' y='84' font-family='Georgia,serif' font-size='7' font-weight='700' fill='" + NAVY + "' text-anchor='middle' opacity='.65'>REF</text>"
      // sweep hand
      + "<g transform='rotate(" + ang + " 64 68)'>"
      + "<line x1='64' y1='73' x2='64' y2='48' stroke='" + RED + "' stroke-width='3.6' stroke-linecap='round'/>"
      + "<circle cx='64' cy='48' r='2.2' fill='" + RED + "'/></g>"
      + "<circle cx='64' cy='68' r='3.6' fill='" + GOLD + "'/><circle cx='63' cy='67' r='1.2' fill='#fff8dd'/>"
      + "<path d='M44 54 a26 26 0 0 1 30 -8 a29 29 0 0 0 -30 8 z' fill='#fff' opacity='.6' filter='url(#ssoft)'/>";
    return { defs, art, shadowRx: 36 };
  };

  // Welcome — the home pennant: a team-felt triangle on a pole, waving, with
  // an embroidered star and stitched edge.
  ART.welcome = (a, f) => {
    const acc = team(a);
    const g1 = grad(), g2 = grad();
    const w1 = [0, 3, 5, 3, 0, -3][f], w2 = -w1 * 0.75, ty = [0, 2, 3, 2, 0, -2][f];
    const defs = feltGrad(g1, acc) + metalGrad(g2);
    const pen = 'M36 34 Q68 ' + (32 + w1) + ' 102 ' + (52 + ty) + ' Q68 ' + (72 + w2) + ' 36 70 Z';
    const inner = 'M41 39 Q68 ' + (37.4 + w1 * 0.8) + ' 93.5 ' + (52 + ty * 0.9) + ' Q68 ' + (66.4 + w2 * 0.8) + ' 41 65 Z';
    const star = "<path d='M0 -7 L2 -2.2 L7 -2.2 L3 1 L4.6 6 L0 3 L-4.6 6 L-3 1 L-7 -2.2 L-2 -2.2 Z' fill='" + CHALK + "'/>";
    const art =
      // pole
      "<rect x='31' y='26' width='5' height='74' rx='2.5' fill='url(#" + g2 + ")'/>"
      + "<circle cx='33.5' cy='24' r='4' fill='" + GOLD + "'/><circle cx='32.4' cy='22.9' r='1.3' fill='#fff8dd'/>"
      // pennant
      + "<path d='" + pen + "' fill='" + INK + "' opacity='.3' transform='translate(1.5,3)'/>"
      + "<path d='" + pen + "' fill='url(#" + g1 + ")'/>"
      + stitch(inner, CHALK, 2)
      + "<g transform='translate(54," + (51 + w1 * 0.55) + ") rotate(" + (w1 * 1.2) + ")'>" + star + '</g>'
      + "<path d='M36 34 Q68 " + (32 + w1) + " 102 " + (52 + ty) + " Q68 " + (42 + w1 * 0.6) + " 36 43 Z' fill='#fff' opacity='.16'/>";
    return { defs, art, shadowRx: 40 };
  };

  // Tic-Tac-Toe — the locker-room chalkboard: wooden frame, deep green slate,
  // chalk grid, cream X's and a gold-chalk O popping in turn.
  ART.tictactoe = (a, f) => {
    const g1 = grad(), g2 = grad();
    const on = f % 2 === 0, xs = on ? 1.14 : 1, os = on ? 1 : 1.14;
    const defs = leatherGrad(g1, '#8a5c30')
      + lg(g2, [[0, '#1b5232'], [0.55, '#123b24'], [1, '#0c2b1a']]);
    const art =
      "<path d='" + rr(26, 26, 80, 80, 7) + "' fill='" + shade('#8a5c30', -55) + "' transform='translate(1.5,3)'/>"
      + "<path d='" + rr(24, 24, 80, 80, 7) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(31, 31, 66, 66, 3) + "' fill='url(#" + g2 + ")'/>"
      + "<path d='" + rr(31, 31, 66, 66, 3) + "' fill='none' stroke='" + INK + "' stroke-width='1.6' opacity='.5'/>"
      + chalkLine('M53.5 37 v54 M74.5 37 v54 M37 53.5 h54 M37 74.5 h54', 2.4)
      + "<g transform='translate(43,43) scale(" + xs + ")'>" + chalkLine('M-5.5 -5.5 L5.5 5.5 M5.5 -5.5 L-5.5 5.5', 3) + '</g>'
      + "<g transform='translate(64,64) scale(" + os + ")'><circle r='6.2' fill='none' stroke='" + GOLD + "' stroke-width='3.4' opacity='.95'/><circle r='6.2' fill='none' stroke='#fff' stroke-width='1.4' opacity='.35' transform='translate(.5,-.5)'/></g>"
      + "<g transform='translate(85,43)'>" + chalkLine('M-5.5 -5.5 L5.5 5.5 M5.5 -5.5 L-5.5 5.5', 3) + '</g>'
      + "<g transform='translate(43,85)' opacity='.45'><circle r='6' fill='none' stroke='" + CHALK + "' stroke-width='2.6'/></g>"
      + "<g transform='translate(85,85)'>" + chalkLine('M-5.5 -5.5 L5.5 5.5 M5.5 -5.5 L-5.5 5.5', 3) + '</g>'
      // chalk stub on the frame
      + "<rect x='60' y='97.5' width='12' height='4' rx='2' fill='" + CHALK + "' transform='rotate(-4 66 99)'/>"
      + spec(38, 30, 10, 2.5, 0.35);
    return { defs, art, shadowRx: 42 };
  };

  // Connect Four — the scoreboard grid: navy cabinet with gold trim and chase
  // bulbs; a red bulb-disc drops down a column and lights up on landing.
  ART.connect4 = (a, f) => {
    const g1 = grad(), g2 = grad(), sh = grad();
    const defs = feltGrad(g1, NAVY) + feltGrad(g2, RED) + sheenGrad(sh);
    const dropY = [22, 34, 48, 60, 60, 60][f];
    const landed = f >= 3;
    const cell = (cx, cy, kind) => {
      if (kind === 'red') return "<circle cx='" + cx + "' cy='" + cy + "' r='7' fill='url(#" + g2 + ")'/><circle cx='" + (cx - 2.2) + "' cy='" + (cy - 2.4) + "' r='2' fill='#ffd9d9' opacity='.9'/>";
      if (kind === 'gold') return "<circle cx='" + cx + "' cy='" + cy + "' r='7' fill='" + GOLD + "'/><circle cx='" + (cx - 2.2) + "' cy='" + (cy - 2.4) + "' r='2' fill='#fff8dd'/>";
      return "<circle cx='" + cx + "' cy='" + cy + "' r='7' fill='#0d1626'/><path d='M" + (cx - 7) + ' ' + cy + ' a7 7 0 0 0 14 0' + "' fill='none' stroke='#4a6db0' stroke-width='1.4' opacity='.55'/>";
    };
    const disc = "<g transform='translate(64," + dropY + ")'><circle r='7.4' fill='url(#" + g2 + ")'/><circle cx='-2.2' cy='-2.4' r='2.1' fill='#ffd9d9' opacity='.9'/></g>";
    const art = (landed ? '' : disc)
      + "<path d='" + rr(28, 42.5, 76, 58, 9) + "' fill='" + shade(NAVY, -44) + "' transform='translate(0,2.5)'/>"
      // legs
      + "<path d='M32 98 l-4 8 M96 98 l4 8' stroke='" + shade(NAVY, -30) + "' stroke-width='5' stroke-linecap='round'/>"
      + "<path d='" + rr(26, 40.5, 76, 58, 9) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(26, 40.5, 76, 58, 9) + "' fill='none' stroke='" + mixc(GOLD, '#8a6a10', 0.35) + "' stroke-width='2.4'/>"
      // drop slot above the middle column
      + "<path d='M56 39 h16' stroke='#0d1626' stroke-width='4' stroke-linecap='round'/>"
      + cell(46, 53, 'empty') + cell(64, 53, 'empty') + cell(82, 53, 'empty')
      + cell(46, 71, 'red') + cell(64, 71, landed ? 'red' : 'empty') + cell(82, 71, 'gold')
      + cell(46, 89, 'gold') + cell(64, 89, 'gold') + cell(82, 89, 'red')
      + "<path d='" + rr(26, 40.5, 76, 13, 9) + "' fill='url(#" + sh + ")'/>";
    return { defs, art, shadowRx: 42 };
  };

  // Minesweeper — the baseball bomb: white stitched-leather ball, brass fuse
  // cap, rope fuse, and a fizzing gold spark.
  ART.minesweeper = (a, f) => {
    const g1 = grad(), g2 = grad(), g3 = grad();
    const defs = rg(g1, [[0, '#fffef6'], [0.45, '#f2ead2'], [0.8, '#d8cba4'], [1, '#a8996e']], 0.36, 0.3)
      + lg(g2, [[0, '#ffe9a8'], [0.5, '#e0b34c'], [1, '#8f6a1c']])
      + rg(g3, [[0, '#fff7cf'], [0.5, GOLD], [1, '#ff8f3c', 0]]);
    const s = f % 2 ? 1.25 : 0.9;
    // a seam arc + clean chevron stitches placed along the curve
    const seamArt = (p0, p1, p2) => {
      const pts = qpts(p0, p1, p2, 6);
      let out = "<path d='M" + p0[0] + ' ' + p0[1] + ' Q' + p1[0] + ' ' + p1[1] + ' ' + p2[0] + ' ' + p2[1] + "' fill='none' stroke='" + RED + "' stroke-width='2.2' stroke-linecap='round'/>";
      for (let i = 1; i < 6; i++) {
        const p = pts[i], q = pts[i + 1];
        const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1;
        const tx = dx / L, ty = dy / L, nx = -ty, ny = tx;
        const a = [p[0] + nx * 3.6 - tx * 2.4, p[1] + ny * 3.6 - ty * 2.4];
        const b = [p[0] - nx * 3.6 - tx * 2.4, p[1] - ny * 3.6 - ty * 2.4];
        out += "<path d='M" + a[0].toFixed(1) + ' ' + a[1].toFixed(1) + ' L' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ' L' + b[0].toFixed(1) + ' ' + b[1].toFixed(1) + "' stroke='" + RED + "' stroke-width='1.7' stroke-linecap='round' fill='none'/>";
      }
      return out;
    };
    const art =
      "<circle cx='60' cy='70' r='27' fill='url(#" + g1 + ")'/>"
      + "<circle cx='60' cy='70' r='27' fill='none' stroke='#a8996e' stroke-width='1.4' opacity='.6'/>"
      + seamArt([48, 46.5], [38.5, 70], [51, 92])
      + seamArt([73, 47], [82.5, 70], [70, 92.5])
      + spec(51, 57, 8, 6, 0.6)
      // brass cap + fuse + spark
      + "<path d='" + rr(66, 39, 15, 12, 3.5) + "' fill='url(#" + g2 + ")' transform='rotate(38 73 45)'/>"
      + "<path d='M78 41 q9 -10 16 -6' stroke='#c9b184' stroke-width='3.8' fill='none' stroke-linecap='round'/>"
      + "<path d='M78 41 q9 -10 16 -6' stroke='#8f6a1c' stroke-width='1.3' fill='none' stroke-linecap='round' stroke-dasharray='2.5 2.5'/>"
      + "<g transform='translate(95,33) scale(" + s + ")'>"
      + "<circle r='8.5' fill='url(#" + g3 + ")' filter='url(#sglow)'/>"
      + "<path d='M-7 0 H7 M0 -7 V7 M-5 -5 L5 5 M5 -5 L-5 5' stroke='#fff2ad' stroke-width='2' stroke-linecap='round'/></g>";
    return { defs, art, shadowRx: 34 };
  };

  // Chess — the championship pawn: solid trophy gold on a navy plinth with an
  // engraved plaque; a bright polish gleam sweeps across each cycle.
  ART.chess = (a, f) => {
    const acc = team(a);
    const g1 = grad(), g2 = grad(), cp = grad();
    const defs = trophyGrad(g1) + feltGrad(g2, NAVY)
      + "<clipPath id='" + cp + "'><circle cx='64' cy='38' r='12'/><path d='" + rr(51, 50, 26, 6.5, 3) + "'/><path d='M56 56 q1 14 -7 26 h30 q-8 -12 -7 -26 z'/></clipPath>";
    const gx = -40 + f * 22;
    const art =
      "<circle cx='64' cy='38' r='12' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(51, 50, 26, 6.5, 3) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='M56 56 q1 14 -7 26 h30 q-8 -12 -7 -26 z' fill='url(#" + g1 + ")'/>"
      + "<ellipse cx='59' cy='33' rx='4' ry='3' fill='#fffbe2' opacity='.9'/>"
      // polish gleam sweeping across the gold
      + "<g clip-path='url(#" + cp + ")'><rect x='" + (56 + gx) + "' y='20' width='9' height='66' fill='#fff' opacity='.55' transform='rotate(18 64 56)'/><rect x='" + (70 + gx) + "' y='20' width='3.5' height='66' fill='#fff' opacity='.4' transform='rotate(18 64 56)'/></g>"
      // plinth + plaque
      + "<path d='" + rr(44, 82, 40, 7, 2.5) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(40, 89, 48, 11, 3) + "' fill='url(#" + g2 + ")'/>"
      + "<path d='" + rr(55, 91.5, 18, 6, 1.5) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='M58 94.5 h12' stroke='#8a5f14' stroke-width='1.4' stroke-linecap='round'/>"
      + bulb(36, 88, 1.6, f % 3 === 0, 1.6) + bulb(92, 88, 1.6, f % 3 === 1, 1.6);
    return { defs, art, shadowRx: 32 };
  };

  // Paint — the face-paint kit: a stitched leather palette with team-color
  // pots and a game-brush dipping for the next stripe.
  ART.paint = (a, f) => {
    const acc = team(a);
    const g1 = grad(), g2 = grad(), g3 = grad();
    const dip = Math.abs(Math.sin((f / FR) * Math.PI * 2)) * 6;
    const defs = leatherGrad(g1, LEATHER) + metalGrad(g2) + feltGrad(g3, acc);
    const well = (x, y, c) => "<circle cx='" + x + "' cy='" + y + "' r='6.6' fill='" + shade(c, -55) + "'/>"
      + "<circle cx='" + x + "' cy='" + (y - 0.8) + "' r='5.8' fill='" + c + "'/>"
      + "<ellipse cx='" + (x - 1.8) + "' cy='" + (y - 3) + "' rx='2' ry='1.3' fill='#fff' opacity='.6'/>";
    const art =
      "<path d='M64 38 c-26 0 -40 14 -40 30 c0 16 14 26 34 26 c8 0 8 -7 4 -11 c-4 -4 -1 -10 6 -10 c8 0 22 2 30 -6 c6 -6 2 -29 -34 -29 z' fill='" + shade(LEATHER, -58) + "' transform='translate(1.5,3)'/>"
      + "<path d='M62 36 c-26 0 -40 14 -40 30 c0 16 14 26 34 26 c8 0 8 -7 4 -11 c-4 -4 -1 -10 6 -10 c8 0 22 2 30 -6 c6 -6 2 -29 -34 -29 z' fill='url(#" + g1 + ")'/>"
      + stitch('M62 41 c-22 0 -34 12 -34 25 c0 13 11 21 28 21', '#e8cf9e', 1.8)
      + well(46, 56, RED) + well(64, 50, NAVY) + well(82, 58, GOLD) + well(42, 74, CHALK)
      + "<g transform='translate(88," + (34 + dip) + ") rotate(35)'>"
      + "<rect x='-3.5' y='-2' width='7' height='26' rx='3' fill='url(#" + g3 + ")'/>"
      + "<rect x='-4.5' y='-10' width='9' height='9' rx='2' fill='url(#" + g2 + ")'/>"
      + "<path d='M-4.5 -10 q4.5 -12 9 0 z' fill='" + mixc(RED, '#7a1f1f', 0.3) + "'/></g>";
    return { defs, art, shadowRx: 40 };
  };

  // Fortune — the golden game-day cookie, a raffle-ticket fortune sliding out
  // of the fold.
  ART.fortune = (a, f) => {
    const g1 = grad(), g2 = grad();
    const slide = [0, 3, 6, 7, 5, 2][f];
    const defs = lg(g1, [[0, '#ffe9b0'], [0.45, '#f2b854'], [1, '#a86d18']])
      + lg(g2, [[0, '#e8a53f'], [1, '#8f5c12']]);
    const art =
      // raffle-ticket fortune sliding out of the fold
      "<g transform='translate(" + slide + ',' + (slide * 0.35) + ") rotate(10 92 74)'>"
      + "<path d='" + rr(72, 66, 40, 17, 2.5) + "' fill='#fffdf0'/>"
      + "<path d='" + rr(72, 66, 40, 17, 2.5) + "' fill='none' stroke='#d8c9a0' stroke-width='1.2'/>"
      + "<path d='M77.5 66 v17 M106.5 66 v17' stroke='" + RED + "' stroke-width='2.4' opacity='.9'/>"
      + "<text x='92' y='77.5' font-family='Georgia,serif' font-size='7' font-weight='700' fill='" + NAVY + "' text-anchor='middle' letter-spacing='.4'>WIN</text>"
      + '</g>'
      // cookie dome + folded lip
      + "<path d='M22 74 A42 36 0 0 1 106 74 L96 71 Q80 64 66 80 Q48 64 32 71 Z' fill='url(#" + g1 + ")'/>"
      + "<path d='M22 74 A42 36 0 0 1 106 74 L96 71 Q88 68 80 70 Q70 60 66 80 Q48 64 32 71 Z' fill='url(#" + g1 + ")'/>"
      + "<path d='M32 71 Q48 64 66 80 Q80 64 96 71' fill='none' stroke='url(#" + g2 + ")' stroke-width='4.5' stroke-linecap='round' opacity='.8'/>"
      + "<path d='M22 74 A42 36 0 0 1 106 74' fill='none' stroke='#8f5c12' stroke-width='1.6' opacity='.35'/>"
      + "<ellipse cx='44' cy='52' rx='10' ry='6' fill='#fff' opacity='.55' filter='url(#ssoft)'/>"
      + "<ellipse cx='84' cy='54' rx='6' ry='4' fill='#fff' opacity='.35' filter='url(#ssoft)'/>";
    return { defs, art, shadowRx: 44 };
  };

  // Guestbook — the team scrapbook: navy felt covers, cream pages, and a red
  // felt heart patch (stitched border) beating on the left page.
  ART.guestbook = (a, f) => {
    const g1 = grad(), g2 = grad(), g3 = grad();
    const hs = f % 2 ? 1.15 : 1;
    const defs = lg(g1, [[0, '#fffdf2'], [0.6, '#f6efdb'], [1, '#d5c8a5']])
      + lg(g2, [[0, '#fffef8'], [1, '#e5dabc']])
      + feltGrad(g3, RED);
    const art =
      "<path d='M20 44 Q42 32 64 44 L64 96 Q42 84 20 96 Z' fill='" + shade(NAVY, -18) + "' transform='translate(0,3)'/>"
      + "<path d='M108 44 Q86 32 64 44 L64 96 Q86 84 108 96 Z' fill='" + shade(NAVY, -18) + "' transform='translate(0,3)'/>"
      + "<path d='M22 44 Q42 32 64 44 L64 94 Q42 82 22 94 Z' fill='url(#" + g1 + ")'/>"
      + "<path d='M106 44 Q86 32 64 44 L64 94 Q86 82 106 94 Z' fill='url(#" + g2 + ")'/>"
      + "<path d='M64 44 V94' stroke='#b8a888' stroke-width='2.5'/>"
      + "<path d='M74 56 h20 M74 64 h16 M74 72 h18 M74 80 h12' stroke='#cfc09a' stroke-width='2.6' stroke-linecap='round'/>"
      + "<g transform='translate(43,64) scale(" + hs + ")'>"
      + "<path d='M0 10 C-12 0 -9 -11 0 -6.5 C9 -11 12 0 0 10 Z' fill='url(#" + g3 + ")'/>"
      + "<path d='M0 7.6 C-9.4 -0.5 -7 -8.6 0 -4.9 C7 -8.6 9.4 -0.5 0 7.6 Z' fill='none' stroke='" + CHALK + "' stroke-width='1.5' stroke-dasharray='2.6 2.2' stroke-linecap='round' opacity='.9'/>"
      + '</g>';
    return { defs, art, shadowRx: 46 };
  };

  // Chat — the coach's whiteboard bubble: X's and O's, and a red play arrow
  // that draws itself; a small accent bubble answers with a whistle-toot dot.
  ART.chat = (a, f) => {
    const acc = team(a);
    const g1 = grad(), g2 = grad(), sh = grad();
    const defs = lg(g1, [[0, '#ffffff'], [0.6, '#f6f3ea'], [1, '#d8d2bd']])
      + feltGrad(g2, acc) + sheenGrad(sh);
    const pts = qpts([44, 66], [58, 44], [84, 58], 18);
    const k = Math.min(18, 3 + f * 3);
    const done = k >= 18;
    const art =
      "<path d='M30 32 h68 a12 12 0 0 1 12 12 v22 a12 12 0 0 1 -12 12 h-44 l-14 14 v-14 h-10 a12 12 0 0 1 -12 -12 v-22 a12 12 0 0 1 12 -12 z' fill='" + shade(NAVY, -20) + "' transform='translate(1.5,3)'/>"
      + "<path d='M30 30 h68 a12 12 0 0 1 12 12 v22 a12 12 0 0 1 -12 12 h-44 l-14 14 v-14 h-10 a12 12 0 0 1 -12 -12 v-22 a12 12 0 0 1 12 -12 z' fill='url(#" + g1 + ")'/>"
      + "<path d='M30 30 h68 a12 12 0 0 1 12 12 v22 a12 12 0 0 1 -12 12 h-44 l-14 14 v-14 h-10 a12 12 0 0 1 -12 -12 v-22 a12 12 0 0 1 12 -12 z' fill='none' stroke='" + NAVY + "' stroke-width='2.2' opacity='.35'/>"
      // the play
      + "<circle cx='42' cy='47' r='3.6' fill='none' stroke='" + NAVY + "' stroke-width='2.4'/>"
      + "<circle cx='44' cy='66' r='3.6' fill='none' stroke='" + NAVY + "' stroke-width='2.4'/>"
      + "<path d='M82 63 l6 6 M88 63 l-6 6' stroke='" + NAVY + "' stroke-width='2.6' stroke-linecap='round'/>"
      + "<path d='M60 64 l5 5 M65 64 l-5 5' stroke='" + NAVY + "' stroke-width='2.6' stroke-linecap='round'/>"
      + "<path d='" + polyd(pts, k) + "' stroke='" + RED + "' stroke-width='2.8' fill='none' stroke-linecap='round' stroke-linejoin='round' stroke-dasharray='5 3.2'/>"
      + (done ? arrowHead(pts, 18, RED, 3.2) : '')
      // answering bubble
      + "<g transform='translate(0," + (-FLOAT[f] * 0.9) + ")'>"
      + "<path d='" + rr(78, 76, 30, 18, 9) + "' fill='url(#" + g2 + ")'/>"
      + "<circle cx='87' cy='85' r='1.9' fill='" + CHALK + "'/><circle cx='93.5' cy='85' r='1.9' fill='" + CHALK + "'/><circle cx='100' cy='85' r='1.9' fill='" + CHALK + "'/>"
      + "<path d='" + rr(78, 76, 30, 8, 4) + "' fill='#fff' opacity='.3'/></g>";
    return { defs, art, shadowRx: 44 };
  };

  // Stolen Apps — the equipment trunk: navy chest, leather straps, riveted
  // metal corners, a stenciled star, lid creaking open over gold floodglow.
  ART.chest = (a, f) => {
    const g1 = grad(), g2 = grad(), g3 = grad(), sh = grad();
    const lift = [0, 2, 5, 6, 4, 1][f];
    const defs = feltGrad(g1, shade(NAVY, -8))
      + leatherGrad(g2, LEATHER)
      + lg(g3, [[0, '#fff3c4'], [0.5, GOLD], [1, '#c9971b']])
      + sheenGrad(sh);
    const art =
      "<ellipse cx='64' cy='" + (56 - lift / 2) + "' rx='30' ry='8' fill='" + GOLD + "' opacity='" + (lift / 12) + "' filter='url(#sglow)'/>"
      // lid
      + "<g transform='translate(64," + (52 - lift) + ") rotate(" + (-lift * 1.2) + ")'>"
      + "<path d='M-34 6 v-6 q0 -16 34 -16 q34 0 34 16 v6 z' fill='url(#" + g1 + ")'/>"
      + "<path d='M-26 5 v-4 q0 -11 -3 -14 M26 5 v-4 q0 -11 3 -14' stroke='url(#" + g2 + ")' stroke-width='6' fill='none'/>"
      + "<path d='" + rr(-7, -4, 14, 10, 3) + "' fill='url(#" + g3 + ")'/></g>"
      // gear peeking out
      + "<circle cx='47' cy='" + (55 - lift / 2) + "' r='6' fill='#e07b28'/><path d='M41.5 " + (53.5 - lift / 2) + " q5.5 3 11 0 M47 " + (49 - lift / 2) + " v12' stroke='#8f4a12' stroke-width='1.4' fill='none'/>"
      + "<circle cx='80' cy='" + (55.5 - lift / 2) + "' r='5.4' fill='#f6f0dc'/><path d='M76.5 " + (51.5 - lift / 2) + " q-2 4 0 8 M83.5 " + (51.5 - lift / 2) + " q2 4 0 8' stroke='" + RED + "' stroke-width='1.3' fill='none'/>"
      // base
      + "<path d='" + rr(30, 58, 68, 36, 6) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='M40 58 v36 M88 58 v36' stroke='url(#" + g2 + ")' stroke-width='6'/>"
      + "<path d='M40 58 v36 M88 58 v36' stroke='" + INK + "' stroke-width='6' opacity='.14' transform='translate(2,0)'/>"
      // stencil star + label
      + "<path d='M64 66 L65.8 71 L71 71 L67 74 L68.6 79 L64 76 L59.4 79 L61 74 L57 71 L62.2 71 Z' fill='" + CHALK + "' opacity='.9'/>"
      + "<path d='M56 85 h16' stroke='" + CHALK + "' stroke-width='2.6' stroke-linecap='round' opacity='.75'/>"
      // metal corners
      + "<path d='M30 88 h7 M30 88 v-7 M98 88 h-7 M98 88 v-7' stroke='#c9c4b4' stroke-width='3.4' stroke-linecap='round' transform='translate(0,3)'/>"
      + "<path d='" + rr(55, 56, 18, 14, 3) + "' fill='url(#" + g3 + ")'/>"
      + "<circle cx='64' cy='61.5' r='2' fill='#7d5a10'/><path d='M64 61.5 v4.5' stroke='#7d5a10' stroke-width='2.2' stroke-linecap='round'/>"
      + "<path d='" + rr(30, 58, 68, 10, 5) + "' fill='url(#" + sh + ")'/>";
    return { defs, art, shadowRx: 42 };
  };

  // Imposter — team photo, odd one out: two navy number-7 jerseys flanking a
  // fidgeting accent jersey wearing a question mark.
  ART.imposter = (a, f) => {
    const acc = team(a);
    const g1 = grad(), g2 = grad();
    const wob = [-3, 0, 3, 0, -3, 0][f];
    const defs = feltGrad(g1, NAVY) + feltGrad(g2, acc);
    const tee = (x, y, s, fill, num, stroke) =>
      "<g transform='translate(" + x + ',' + y + ") scale(" + s + ")'>"
      + "<path d='M-13 -6 L-6 -12 Q0 -8 6 -12 L13 -6 L9 0 L6.5 -2 V18 Q0 20 -6.5 18 V-2 L-9 0 Z' fill='" + fill + "'/>"
      + "<path d='M-6 -12 Q0 -8 6 -12 L4.5 -9.5 Q0 -6.5 -4.5 -9.5 Z' fill='" + INK + "' opacity='.3'/>"
      + stitch('M-6.5 15.4 Q0 17.2 6.5 15.4', CHALK, 1.6)
      + "<text x='0' y='11' font-family='Georgia,serif' font-size='13' font-weight='700' fill='" + CHALK + "' text-anchor='middle'>" + num + '</text>'
      + '</g>';
    const art =
      tee(38, 62, 1, "url(#" + g1 + ")", '7')
      + tee(90, 62, 1, "url(#" + g1 + ")", '7')
      + "<g transform='rotate(" + wob + " 64 74)'>" + tee(64, 58, 1.28, "url(#" + g2 + ")", '?') + '</g>'
      + "<text x='92' y='34' font-family='Georgia,serif' font-size='17' font-weight='700' fill='" + GOLD + "' opacity='" + PULSE[f] + "' transform='rotate(12 92 34)'>?</text>";
    return { defs, art, shadowRx: 44 };
  };

  // Spy — the scout's magnifier sweeping a turf play-card, the play magnified
  // under the glass.
  ART.spy = (a, f) => {
    const acc = team(a);
    const g1 = grad(), g2 = grad(), cp = grad();
    const mx = [0, 5, 10, 12, 7, 2][f];
    const cx = 50 + mx, cy = 64;
    const defs = lg(g1, [[0, '#268a4a'], [0.55, TURF], [1, '#125228']])
      + rg(g2, [[0, '#eafff2', 0.5], [0.75, '#bfe8cf', 0.25], [1, '#8fd0a8', 0.15]], 0.35, 0.3)
      + "<clipPath id='" + cp + "'><circle cx='" + cx + "' cy='" + cy + "' r='15'/></clipPath>";
    const plays =
      "<circle cx='44' cy='54' r='4' fill='none' stroke='" + CHALK + "' stroke-width='2.4' opacity='.92'/>"
      + chalkLine('M74 70 l6.5 6.5 M80.5 70 l-6.5 6.5', 2.6)
      + "<path d='M48 57 Q62 62 72 70' stroke='" + GOLD + "' stroke-width='2.2' fill='none' stroke-dasharray='4 3' stroke-linecap='round' opacity='.95'/>";
    const art =
      // turf card ruled like the field: yard lines + hash marks
      "<path d='" + rr(28, 36, 72, 56, 7) + "' fill='" + shade(TURF, -60) + "' transform='translate(1.5,3)'/>"
      + "<path d='" + rr(28, 36, 72, 56, 7) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='M34 50 h60 M34 64 h60 M34 78 h60' stroke='" + CHALK + "' stroke-width='1.8' opacity='.32'/>"
      + "<path d='M46 43 v3 M64 43 v3 M82 43 v3 M46 85 v3 M64 85 v3 M82 85 v3' stroke='" + CHALK + "' stroke-width='1.6' opacity='.32'/>"
      + plays
      // magnified view under the lens
      + "<g clip-path='url(#" + cp + ")'><circle cx='" + cx + "' cy='" + cy + "' r='15' fill='" + mixc(TURF, '#268a4a', 0.5) + "'/>"
      + "<g transform='translate(" + cx + ',' + cy + ") scale(1.65) translate(" + (-cx) + ',' + (-cy) + ")'>"
      + "<path d='M34 50 h60 M34 64 h60 M34 78 h60' stroke='" + CHALK + "' stroke-width='1.8' opacity='.3'/>" + plays + '</g></g>'
      // magnifier
      + "<g transform='translate(" + cx + ',' + cy + ")'>"
      + "<circle r='15' fill='url(#" + g2 + ")'/>"
      + "<circle r='15' fill='none' stroke='#e0b34c' stroke-width='4.6'/>"
      + "<circle r='15' fill='none' stroke='#8f6a1c' stroke-width='1.4'/>"
      + "<path d='M10.6 10.6 l12 12' stroke='#5a3618' stroke-width='8' stroke-linecap='round'/>"
      + "<path d='M10.6 10.6 l12 12' stroke='" + LEATHER + "' stroke-width='5' stroke-linecap='round'/>"
      + "<path d='M-8.5 -6.5 a10.5 10.5 0 0 1 7.5 -5' stroke='#fff' stroke-width='2.6' fill='none' stroke-linecap='round' opacity='.9'/></g>";
    return { defs, art, shadowRx: 42 };
  };

  // Tilt — the halftime phone game: a phone in a grippy team case rocking on
  // its corner while a gold ball rolls the other way across the screen.
  ART.tilt = (a, f) => {
    const acc = team(a);
    const g1 = grad(), g2 = grad(), sh = grad();
    const rot = [-12, -4, 6, 12, 4, -6][f];
    const bx = -rot * 0.9;
    const defs = feltGrad(g1, acc)
      + lg(g2, [[0, '#16241c'], [0.5, '#0d1812'], [1, '#091009']]) + sheenGrad(sh);
    const art =
      "<g transform='rotate(" + rot + " 64 90)'>"
      + "<path d='" + rr(42, 26, 44, 68, 10) + "' fill='url(#" + g1 + ")'/>"
      + stitch(rr(44.5, 28.5, 39, 63, 8), CHALK, 1.7)
      + "<path d='" + rr(47, 34, 34, 50, 4) + "' fill='url(#" + g2 + ")'/>"
      // a tiny turf lane with the ball rolling opposite the tilt
      + "<path d='M50 72 h28' stroke='" + TURF + "' stroke-width='7' stroke-linecap='round'/>"
      + "<path d='M50 72 h28' stroke='" + CHALK + "' stroke-width='1' stroke-dasharray='3 3' opacity='.7'/>"
      + "<g transform='translate(" + (64 + bx) + ",68) rotate(" + (bx * 14) + ")'><circle r='4.4' fill='" + GOLD + "'/><path d='M-4.4 0 h8.8 M0 -4.4 v8.8' stroke='#a87a10' stroke-width='1.1' opacity='.8'/><circle cx='-1.3' cy='-1.4' r='1.2' fill='#fff8dd' opacity='.9'/></g>"
      + "<path d='M52 40 h24' stroke='#2c4a38' stroke-width='3' stroke-linecap='round' opacity='.8'/>"
      + "<circle cx='64' cy='89' r='2.4' fill='" + CHALK + "' opacity='.5'/>"
      + "<path d='" + rr(42, 26, 44, 18, 10) + "' fill='url(#" + sh + ")'/></g>"
      + "<path d='M28 64 q-6 -10 1 -20 M100 64 q6 -10 -1 -20' stroke='" + GOLD + "' stroke-width='3.6' fill='none' stroke-linecap='round' opacity='" + (0.35 + PULSE[f] * 0.55) + "'/>";
    return { defs, art, shadowRx: 30 };
  };

  // The Dial — the hype gauge off the big scoreboard: black panel in a navy
  // cabinet, an arc of chase bulbs that light up to the needle.
  ART.dial = (a, f) => {
    const acc = team(a);
    const g1 = grad(), g2 = grad(), sh = grad();
    const need = [-58, -26, 8, 44, 60, -8][f];
    const defs = feltGrad(g1, NAVY) + feltGrad(g2, acc) + sheenGrad(sh);
    const bulbs = range(7).map((i) => {
      const ba = -63 + i * 21, t = ba * Math.PI / 180;
      return bulb(64 + Math.sin(t) * 25, 82 - Math.cos(t) * 25, 3, ba <= need + 4, 1.8);
    }).join('');
    const art =
      "<path d='" + rr(26, 38, 76, 56, 10) + "' fill='" + shade(NAVY, -44) + "' transform='translate(1.5,3)'/>"
      + "<path d='" + rr(26, 38, 76, 56, 10) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(26, 38, 76, 56, 10) + "' fill='none' stroke='" + mixc(GOLD, '#8a6a10', 0.35) + "' stroke-width='2.4'/>"
      + "<path d='" + rr(32, 44, 64, 44, 5) + "' fill='#0a0d12'/>"
      + bulbs
      + "<text x='40' y='90' font-family='Georgia,serif' font-size='6.5' font-weight='700' fill='" + CHALK + "' opacity='.7'>COLD</text>"
      + "<text x='73' y='90' font-family='Georgia,serif' font-size='6.5' font-weight='700' fill='" + GOLD + "'>HOT</text>"
      + "<g transform='rotate(" + need + " 64 82)'>"
      + "<path d='M64 82 L64 62' stroke='" + RED + "' stroke-width='4' stroke-linecap='round'/>"
      + "<path d='M64 82 L64 64' stroke='#ff8f8f' stroke-width='1.6' stroke-linecap='round'/></g>"
      + "<circle cx='64' cy='82' r='5.5' fill='url(#" + g2 + ")'/><circle cx='62.6' cy='80.6' r='1.7' fill='#fff' opacity='.8'/>"
      + "<path d='" + rr(26, 38, 76, 14, 10) + "' fill='url(#" + sh + ")'/>";
    return { defs, art, shadowRx: 44 };
  };

  // Party Roulette — the referee's pocket: yellow and red penalty cards fan
  // out and the red one pops up, whistle hanging alongside.
  ART.roulette = (a, f) => {
    const g1 = grad(), g2 = grad(), g3 = grad(), sh = grad();
    const pop = [0, -3, -6, -7, -5, -2][f];
    const defs = feltGrad(g1, '#f2c018') + feltGrad(g2, RED)
      + lg(g3, [[0, '#ffe9a8'], [0.5, '#e0b34c'], [1, '#8f6a1c']]) + sheenGrad(sh);
    const art =
      // yellow card behind
      "<g transform='rotate(-18 46 68)'><path d='" + rr(26, 40, 38, 52, 6) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(26, 40, 38, 20, 6) + "' fill='#fff' opacity='.25'/>"
      + "<path d='M45 58 v14' stroke='#8a6a10' stroke-width='5' stroke-linecap='round' opacity='.5'/></g>"
      // red card pops
      + "<g transform='translate(0," + pop + ") rotate(7 74 66)'>"
      + "<path d='" + rr(54, 36, 40, 54, 6) + "' fill='" + shade(RED, -60) + "' transform='translate(1.5,2.5)'/>"
      + "<path d='" + rr(54, 36, 40, 54, 6) + "' fill='url(#" + g2 + ")'/>"
      + "<path d='" + rr(54, 36, 40, 22, 6) + "' fill='url(#" + sh + ")'/>"
      + "<path d='M74 48 v18' stroke='#fff' stroke-width='6' stroke-linecap='round'/>"
      + "<circle cx='74' cy='78' r='3.6' fill='#fff'/></g>"
      // brass pea whistle on a navy lanyard: one-piece silhouette
      + "<g transform='translate(33,86) rotate(" + [-8, -3, 3, 6, 1, -5][f] + ")'>"
      + "<path d='M-14 -10 q-7 -7 -6 -16' stroke='" + NAVY + "' stroke-width='2.6' fill='none' stroke-linecap='round'/>"
      + "<path d='M-17 -7 H2 A9.5 9.5 0 1 1 -6 6.5 L-14 2.5 Q-17 1 -17 -2 Z' fill='url(#" + g3 + ")'/>"
      + "<path d='M-17 -7 H2 A9.5 9.5 0 1 1 -6 6.5 L-14 2.5 Q-17 1 -17 -2 Z' fill='none' stroke='#8f6a1c' stroke-width='1.4'/>"
      + "<rect x='-8' y='-7' width='5.5' height='3.2' rx='1.2' fill='#3a3020'/>"
      + "<circle cx='3.5' cy='2.5' r='3' fill='#3a3020'/>"
      + "<path d='M-14.5 -4.5 h13' stroke='#fff8dd' stroke-width='1.6' stroke-linecap='round' opacity='.6'/>"
      + "<circle cx='-14' cy='-8.5' r='2.2' fill='none' stroke='#8f6a1c' stroke-width='1.7'/>"
      + '</g>';
    return { defs, art, shadowRx: 40 };
  };

  // Fake Facts — the tall-tale fan: team cap pulled low, and the nose growing
  // with every retelling of the final score.
  ART.fakefacts = (a, f) => {
    const acc = team(a);
    const g1 = grad(), g2 = grad(), g3 = grad();
    const nose = [10, 16, 24, 30, 22, 14][f];
    const defs = rg(g1, [[0, '#ffe2b8'], [0.6, '#f2c99a'], [1, '#c08a52']], 0.38, 0.32)
      + feltGrad(g2, acc)
      + lg(g3, [[0, '#d9a05a'], [1, '#a5713d']], false);
    const art =
      "<circle cx='52' cy='64' r='25' fill='url(#" + g1 + ")'/>"
      // cap: accent crown + navy brim so it pops off any skin tone
      + "<path d='M28 52 a25 22 0 0 1 48 -6 l-50 12 a25 25 0 0 1 2 -6 z' fill='url(#" + g2 + ")'/>"
      + "<path d='M27 57 q24 -12 49 -11 l14 4 q-2 4 -8 3 l-7 -1.5 q-24 -1 -46 10 z' fill='" + NAVY + "'/>"
      + "<path d='M27 57 q24 -12 49 -11 l7 2 q-26 -2 -52 11 z' fill='" + shade(NAVY, 26) + "'/>"
      + stitch('M33 49 q19 -10 40 -6', CHALK, 1.6)
      + "<circle cx='53' cy='38' r='2.4' fill='" + CHALK + "'/>"
      // face
      + "<circle cx='46' cy='62' r='3' fill='" + INK + "'/><circle cx='60' cy='60' r='3' fill='" + INK + "'/>"
      + "<circle cx='47' cy='61' r='1' fill='#fff'/><circle cx='61' cy='59' r='1' fill='#fff'/>"
      + "<path d='M44 77 q8 " + (f >= 2 ? -4 : 4) + " 15 1' stroke='#8a5a2a' stroke-width='2.6' fill='none' stroke-linecap='round'/>"
      + "<circle cx='42' cy='71' r='4' fill='" + RED + "' opacity='.25'/>"
      // the growing nose
      + "<rect x='66' y='62' width='" + nose + "' height='8.5' rx='4.2' fill='url(#" + g3 + ")'/>"
      + "<rect x='66' y='63.4' width='" + nose + "' height='2.6' rx='1.3' fill='#fff' opacity='.35'/>"
      + "<circle cx='" + (66 + nose) + "' cy='66.2' r='4.6' fill='url(#" + g3 + ")'/>"
      + "<circle cx='" + (64.5 + nose) + "' cy='64.8' r='1.4' fill='#fff' opacity='.5'/>";
    return { defs, art, shadowRx: 38 };
  };

  // One Clue — the floodlight itself: a tilted lamp panel of chasing bulbs on
  // a mast, throwing a beam across the night.
  ART.oneclue = (a, f) => {
    const g1 = grad(), g2 = grad();
    const beam = 0.2 + PULSE[f] * 0.2;
    const defs = feltGrad(g1, shade(NAVY, -10)) + metalGrad(g2);
    let lamps = '';
    for (let r0 = 0; r0 < 2; r0++) for (let c = 0; c < 3; c++) {
      const i = r0 * 3 + c;
      lamps += bulb(-17 + c * 17, -7 + r0 * 14, 5, (i + f) % 6 !== 0, 1.7);
    }
    const art =
      // beam
      "<path d='M40 46 L104 74 L86 102 L34 60 Z' fill='" + GOLD + "' opacity='" + beam + "' filter='url(#sglow)'/>"
      // mast + brace
      + "<path d='M46 58 L38 100 M52 62 L58 100' stroke='url(#" + g2 + ")' stroke-width='4.5' stroke-linecap='round'/>"
      + "<path d='M41 84 h15' stroke='url(#" + g2 + ")' stroke-width='3' stroke-linecap='round'/>"
      // lamp head, tilted toward the field
      + "<g transform='translate(52,40) rotate(14)'>"
      + "<path d='" + rr(-26, -16, 52, 32, 6) + "' fill='" + shade(NAVY, -30) + "' transform='translate(1.5,2.5)'/>"
      + "<path d='" + rr(-26, -16, 52, 32, 6) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(-26, -16, 52, 32, 6) + "' fill='none' stroke='#c9c4b4' stroke-width='2'/>"
      + lamps
      + "<path d='M-26 -16 h52' stroke='#fff' stroke-width='1.6' opacity='.3' transform='translate(0,1.5)'/>"
      + '</g>';
    return { defs, art, shadowRx: 34, shadowCy: 106 };
  };

  // Same Brain — two helmets, one thought: facing football helmets in team
  // colors, both wearing the same star decal, one gold spark between them.
  ART.samebrain = (a, f) => {
    const acc = team(a);
    const g1 = grad(), g2 = grad();
    const ss = 0.8 + PULSE[f] * 0.5;
    const defs = feltGrad(g1, NAVY) + feltGrad(g2, acc);
    const helmet = (fill, dark) =>
      // shell with jaw flap
      "<path d='M-18 4 a18 18 0 0 1 36 -1 l.5 8 h-5 l-2 8.5 h-8.5 l-2.5 -7.5 h-11 q-6 -1 -7.5 -8 z' fill='" + fill + "'/>"
      + "<path d='M-13 -9 a17 17 0 0 1 14 -6.5 l1 4.5 a20 20 0 0 0 -12 5.5 z' fill='#fff' opacity='.25'/>"
      + "<circle cx='1' cy='5.5' r='2.6' fill='" + dark + "' opacity='.6'/>"
      // star decal on the shell
      + "<path d='M-6 -5 L-4.7 -1.8 L-1.5 -1.8 L-4 .3 L-3.1 3.5 L-6 1.6 L-8.9 3.5 L-8 .3 L-10.5 -1.8 L-7.3 -1.8 Z' fill='" + CHALK + "' opacity='.9'/>"
      // facemask: two short bars
      + "<path d='M18.5 2.5 q6.5 .5 7 6.5 M10.5 11.5 l14.5 -1.5 M14 3.5 l-1.5 8.5' stroke='#e5dfc8' stroke-width='2.8' fill='none' stroke-linecap='round' stroke-linejoin='round'/>";
    const art =
      "<g transform='translate(33,66)'>" + helmet("url(#" + g1 + ")", shade(NAVY, -40)) + '</g>'
      + "<g transform='translate(95,66) scale(-1,1)'>" + helmet("url(#" + g2 + ")", shade(acc, -60)) + '</g>'
      // one thought, shared: dotted arcs meeting at the star
      + "<path d='M42 42 Q48 30 57 27 M86 42 Q80 30 71 27' stroke='" + CHALK + "' stroke-width='2.4' fill='none' stroke-linecap='round' stroke-dasharray='.5 5.5' opacity='.9'/>"
      + "<g transform='translate(64,22) scale(" + ss + ")'>"
      + "<circle r='9' fill='" + GOLD + "' opacity='.3' filter='url(#sglow)'/>"
      + "<path d='M0 -8 L2.2 -2.6 L8 -2.6 L3.4 1 L5.2 6.6 L0 3.4 L-5.2 6.6 L-3.4 1 L-8 -2.6 L-2.2 -2.6 Z' fill='" + GOLD + "'/></g>";
    return { defs, art, shadowRx: 46 };
  };

  // One Night Wolves — the mascot wolf howling under the floodlight moon: a
  // glowing stadium lamp disc standing in for the moon, confetti drifting.
  ART.wolves = (a, f) => {
    const acc = team(a);
    const g1 = grad(), g2 = grad(), g3 = grad();
    const howl = [0, -2, -4, -5, -3, -1][f];
    const glow = [0.35, 0.5, 0.7, 0.8, 0.6, 0.45][f];
    const defs = rg(g1, [[0, '#fff8dc'], [0.6, '#ffe9a8'], [1, '#e0b34c']], 0.4, 0.35)
      + lg(g2, [[0, '#31456e'], [0.6, '#1e3050'], [1, '#141f38']])
      + feltGrad(g3, acc);
    const art =
      // floodlight moon: a glowing lamp disc, high and clear of the wolf
      "<circle cx='96' cy='30' r='19' fill='#ffe9a8' opacity='" + glow + "' filter='url(#sglow)'/>"
      + "<circle cx='96' cy='30' r='13.5' fill='url(#" + g1 + ")'/>"
      + "<circle cx='96' cy='30' r='13.5' fill='none' stroke='#c9971b' stroke-width='1.6'/>"
      + "<path d='M87.5 25.8 h17 M86.5 30 h19 M87.5 34.2 h17' stroke='#c9971b' stroke-width='.9' opacity='.35'/>"
      // confetti drifting in the beam
      + "<rect x='30' y='30' width='3' height='3' rx='.8' fill='" + GOLD + "' opacity='.85' transform='rotate(20 31 31)'/>"
      + "<rect x='44' y='22' width='2.6' height='2.6' rx='.8' fill='" + RED + "' opacity='.7' transform='rotate(-15 45 23)'/>"
      + "<rect x='106' y='70' width='2.8' height='2.8' rx='.8' fill='" + CHALK + "' opacity='.7' transform='rotate(30 107 71)'/>"
      // the mascot wolf: seated body, head thrown back toward the moon
      + "<g transform='rotate(" + howl + " 52 94)'>"
      // tail
      + "<path d='M32 90 q-10 -2 -12 -12' stroke='#1e3050' stroke-width='6' fill='none' stroke-linecap='round'/>"
      // body
      + "<path d='M34 94 q-5 -18 6 -28 q5 -5 13 -6 l16 11 q5 11 3 23 z' fill='url(#" + g2 + ")'/>"
      // neck bridge + head + ears + snout aimed at the moon
      + "<path d='M46 72 L50 52 L70 50 L70 68 Z' fill='url(#" + g2 + ")'/>"
      + "<circle cx='57' cy='51' r='9.5' fill='url(#" + g2 + ")'/>"
      + "<path d='M51 45 L45 32 L56 40 Z' fill='url(#" + g2 + ")'/>"
      + "<path d='M59 41 L58 29 L67 40 Z' fill='url(#" + g2 + ")'/>"
      + "<path d='M52 46 L75 37 L65 56 Z' fill='url(#" + g2 + ")'/>"
      + "<circle cx='73' cy='38.5' r='2' fill='#0d1626'/>"
      + "<path d='M64 52 q7 -3 10 -9' stroke='#0d1626' stroke-width='1.6' fill='none' stroke-linecap='round' opacity='.6'/>"
      // chest highlight
      + "<path d='M44 90 q0 -12 7 -18' stroke='#4a5f8c' stroke-width='4' fill='none' stroke-linecap='round' opacity='.7'/>"
      // team collar with a gold tag
      + "<path d='M47 70 q9 5 20 1' stroke='url(#" + g3 + ")' stroke-width='5' fill='none' stroke-linecap='round'/>"
      + "<circle cx='58' cy='75' r='2.6' fill='" + GOLD + "'/><circle cx='57.3' cy='74.3' r='.9' fill='#fff8dd'/>"
      + '</g>';
    return { defs, art, shadowRx: 40 };
  };

  // ---- letter fallback: the varsity letter patch -----------------------------
  function fallbackArt(letter, a, f) {
    const acc = team(a);
    const g1 = grad(), sh = grad();
    const rot = [-2, -0.7, 0.7, 2, 0.7, -0.7][f];
    const defs = feltGrad(g1, acc) + sheenGrad(sh);
    const art = "<g transform='rotate(" + rot + " 64 64)'>"
      + "<path d='" + rr(31.5, 31.5, 68, 68, 16) + "' fill='" + INK + "' opacity='.35' transform='translate(1,2.5)'/>"
      + "<path d='" + rr(30, 30, 68, 68, 16) + "' fill='url(#" + g1 + ")'/>"
      + stitch(rr(34.5, 34.5, 59, 59, 12), CHALK, 2.2)
      + "<text x='64' y='80' font-family='Georgia,serif' font-size='42' font-weight='700' fill='" + shade(acc, -70) + "' text-anchor='middle' transform='translate(2,2)'>" + letter + '</text>'
      + "<text x='64' y='80' font-family='Georgia,serif' font-size='42' font-weight='700' fill='" + CHALK + "' text-anchor='middle'>" + letter + '</text>'
      + "<path d='" + rr(30, 30, 68, 26, 16) + "' fill='url(#" + sh + ")'/>"
      + '</g>';
    return { defs, art, shadowRx: 36 };
  }

  GifOS.iconPacks.register('stadium', {
    size: SIZE, frames: FR, delayCs: DELAY, dither: 10,
    draw(subject, accent) {
      const builder = ART[subject];
      if (!builder) return null;
      return range(FR).map((f) => { const r = builder(accent, f); return shell(r.defs, r.art, f, r.shadowRx); });
    },
    fallback(letter, accent) {
      return range(FR).map((f) => { const r = fallbackArt(letter, accent, f); return shell(r.defs, r.art, f, r.shadowRx); });
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
