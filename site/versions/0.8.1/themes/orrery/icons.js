/*
 * icons.js — "Orrery", a spaceship-and-alien icon pack (orrery.gifos.app).
 *
 * Every app is a little sci-fi scene: flying saucers, big-eyed green aliens,
 * ringed planets, rockets, tractor beams and radar dishes, each floating over
 * its own contact shadow in a faint starfield. Tech wears the app's accent
 * colour; the aliens stay Roswell-green, so a stolen app keeps its birthplace's
 * accent wherever it travels (the palette is baked into the GIF).
 *
 * Fully procedural SVG (128 viewBox, rasterised at 192px, 6 frames, ordered
 * dither — see gifos-icons.js). Packs draw SUBJECTS, so any future app or Easter
 * egg still gets art; unknown subjects fall back to a glowing saucer tile with
 * the app's initial. Registers as the 'orrery' pack; the theme selects it.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  if (!GifOS.iconPacks) return;

  const FR = 6, SIZE = 192, DELAY = 16;
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const R = (v) => Math.round(v * 100) / 100;

  // ---- colour utilities -----------------------------------------------------
  const hx = (n) => n.toString(16).padStart(2, '0');
  const toHex = (a) => '#' + hx(clamp(a[0])) + hx(clamp(a[1])) + hx(clamp(a[2]));
  const fromHex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const shade = (c, amt) => { const a = typeof c === 'string' ? fromHex(c) : c; return toHex([a[0] + amt, a[1] + amt, a[2] + amt]); };
  const mixc = (c1, c2, t) => { const a = typeof c1 === 'string' ? fromHex(c1) : c1, b = typeof c2 === 'string' ? fromHex(c2) : c2; return toHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); };
  // Saturate + brighten an accent into a rich hull colour.
  const candy = (a) => { const m = Math.max(a[0], a[1], a[2]) || 1, s = 232 / m; return [a[0] * s, a[1] * s, a[2] * s]; };

  const INK = '#060411';            // deepest space ink (shadows)
  const SKIN = '#8fe6a3';           // Roswell green
  const GLASS = ['#dff6ff', '#7fd0ff', '#2f6fb0']; // canopy glass trio

  // ---- gradient helpers (per-icon ids, so frames stay small) ----------------
  let uid = 0;
  const gid = () => 'o' + (uid++);
  function lg(id, stops, horiz) {
    const s = stops.map((st) => "<stop offset='" + st[0] + "' stop-color='" + st[1] + "'" + (st[2] != null ? " stop-opacity='" + st[2] + "'" : '') + '/>').join('');
    return "<linearGradient id='" + id + "' x1='0' y1='0' x2='" + (horiz ? 1 : 0) + "' y2='" + (horiz ? 0 : 1) + "'>" + s + '</linearGradient>';
  }
  function rg(id, stops, fx, fy) {
    const s = stops.map((st) => "<stop offset='" + st[0] + "' stop-color='" + st[1] + "'" + (st[2] != null ? " stop-opacity='" + st[2] + "'" : '') + '/>').join('');
    return "<radialGradient id='" + id + "'" + (fx != null ? " fx='" + fx + "' fy='" + fy + "'" : '') + '>' + s + '</radialGradient>';
  }
  function bodyGrad(id, base) { return lg(id, [[0, shade(base, 54)], [0.45, base], [1, shade(base, -48)]]); }
  function sheen(id) { return lg(id, [[0, '#ffffff', 0.55], [0.4, '#ffffff', 0.12], [0.6, '#ffffff', 0]]); }
  const rr = (x, y, w, h, r) => 'M' + (x + r) + ' ' + y + ' h' + (w - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r
    + ' v' + (h - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 -' + r + ' ' + r + ' h-' + (w - 2 * r)
    + ' a' + r + ' ' + r + ' 0 0 1 -' + r + ' -' + r + ' v-' + (h - 2 * r) + ' a' + r + ' ' + r + ' 0 0 1 ' + r + ' -' + r + ' z';

  // ---- motion + shared bits -------------------------------------------------
  const FLOAT = [0, -2, -3.5, -4, -3, -1.5];
  const TW = [0.35, 0.7, 1, 0.85, 0.55, 0.25];  // twinkle envelope

  function shadow(f, rx, cy) {
    const t = -FLOAT[f] / 4;
    return "<ellipse cx='64' cy='" + (cy || 110) + "' rx='" + (rx - t * 4) + "' ry='" + (7 - t * 1.5) + "' fill='" + INK + "' opacity='" + (0.36 - t * 0.1) + "' filter='url(#fblur)'/>";
  }
  // a 4-point twinkling star
  function star(x, y, s, f, ph, col) {
    const o = TW[(f + (ph || 0)) % 6];
    const sc = s * (0.6 + 0.4 * o);
    return "<g transform='translate(" + R(x) + ',' + R(y) + ') scale(' + R(sc) + ")' opacity='" + R(o) + "'>"
      + "<path d='M0 -6 L1.3 -1.3 L6 0 L1.3 1.3 L0 6 L-1.3 1.3 L-6 0 L-1.3 -1.3 Z' fill='" + (col || '#fff') + "'/></g>";
  }
  // faint background starfield shared by every icon — ties the pack together
  const STARS = [[18, 26, 0], [110, 22, 2], [30, 96, 4], [102, 100, 1], [16, 62, 3], [116, 58, 5], [58, 14, 2], [72, 114, 4]];
  const starfield = (f) => STARS.map((s) => star(s[0], s[1], 0.7, f, s[2], '#cfe0ff')).join('');

  // classic saucer: metallic disc, glass canopy, cycling under-lights
  function saucer(push, cx, cy, r, base, f, domeFill) {
    const hull = gid(), dm = gid(), sh = gid();
    push(lg(hull, [[0, shade(base, 62)], [0.5, base], [1, shade(base, -52)]]));
    push(rg(dm, domeFill || [[0, GLASS[0], 0.95], [0.6, GLASS[1], 0.5], [1, GLASS[2], 0.2]], 0.4, 0.3));
    push(sheen(sh));
    const dr = r * 0.5, domeBaseY = cy - r * 0.05;
    let li = ''; const n = 5;
    for (let i = 0; i < n; i++) {
      const on = i === f % n, lx = cx - r * 0.7 + i * (r * 1.4 / (n - 1));
      li += "<circle cx='" + R(lx) + "' cy='" + R(cy + r * 0.33) + "' r='" + R(r * 0.1) + "' fill='" + (on ? '#fff2a8' : '#ffd23c') + "'" + (on ? " filter='url(#fglow)'" : '') + '/>';
    }
    return "<ellipse cx='" + R(cx) + "' cy='" + R(cy) + "' rx='" + R(r) + "' ry='" + R(r * 0.42) + "' fill='url(#" + hull + ")'/>"
      + "<ellipse cx='" + R(cx) + "' cy='" + R(cy - r * 0.07) + "' rx='" + R(r * 0.98) + "' ry='" + R(r * 0.32) + "' fill='url(#" + sh + ")' opacity='.5'/>"
      + "<path d='M" + R(cx - dr) + ' ' + R(domeBaseY) + ' a' + R(dr) + ' ' + R(r * 0.62) + ' 0 0 1 ' + R(dr * 2) + " 0 z' fill='url(#" + dm + ")'/>"
      + "<ellipse cx='" + R(cx - dr * 0.35) + "' cy='" + R(domeBaseY - r * 0.28) + "' rx='" + R(dr * 0.28) + "' ry='" + R(r * 0.16) + "' fill='#fff' opacity='.6'/>"
      + li;
  }

  // big-eyed alien head (light-bulb skull, almond eyes, tiny mouth). Blinks and
  // glances around; skin defaults to Roswell green.
  function alien(push, cx, cy, s, f, skin, opts) {
    skin = skin || SKIN; opts = opts || {};
    const g = gid(), sh = gid();
    push(rg(g, [[0, shade(skin, 46)], [0.6, skin], [1, shade(skin, -46)]], 0.4, 0.32));
    push(sheen(sh));
    const blink = (f % 4 === 3) && !opts.noBlink;
    const eyeRy = s * (blink ? 0.03 : 0.24);
    const look = [0, -1, 1, 0, 1, -1][f] * s * 0.05;
    const grin = opts.grin;
    const head = "<path d='M" + R(cx) + ' ' + R(cy - s * 0.98) + ' C' + R(cx + s * 0.9) + ' ' + R(cy - s * 0.95) + ' ' + R(cx + s * 0.74) + ' ' + R(cy + s * 0.72) + ' ' + R(cx) + ' ' + R(cy + s * 0.98)
      + ' C' + R(cx - s * 0.74) + ' ' + R(cy + s * 0.72) + ' ' + R(cx - s * 0.9) + ' ' + R(cy - s * 0.95) + ' ' + R(cx) + ' ' + R(cy - s * 0.98) + " Z' fill='url(#" + g + ")'/>";
    const sheenTop = "<path d='M" + R(cx) + ' ' + R(cy - s * 0.9) + ' C' + R(cx - s * 0.55) + ' ' + R(cy - s * 0.8) + ' ' + R(cx - s * 0.5) + ' ' + R(cy - s * 0.1) + ' ' + R(cx - s * 0.18) + ' ' + R(cy - s * 0.05)
      + ' C' + R(cx - s * 0.4) + ' ' + R(cy - s * 0.4) + ' ' + R(cx - s * 0.25) + ' ' + R(cy - s * 0.75) + ' ' + R(cx) + ' ' + R(cy - s * 0.9) + " Z' fill='url(#" + sh + ")' opacity='.55'/>";
    const eye = (dx, rot) => "<ellipse cx='" + R(cx + dx + look) + "' cy='" + R(cy + s * 0.04) + "' rx='" + R(s * 0.2) + "' ry='" + R(eyeRy) + "' fill='#0a0a16' transform='rotate(" + rot + ' ' + R(cx + dx) + ' ' + R(cy) + ")'/>"
      + (blink ? '' : "<circle cx='" + R(cx + dx + look - s * 0.05) + "' cy='" + R(cy - s * 0.04) + "' r='" + R(s * 0.045) + "' fill='#fff'/>");
    const mouth = grin
      ? "<path d='M" + R(cx - s * 0.16) + ' ' + R(cy + s * 0.5) + ' q' + R(s * 0.16) + ' ' + R(s * 0.22) + ' ' + R(s * 0.32) + " 0' stroke='#0a0a16' stroke-width='" + R(s * 0.06) + "' fill='none' stroke-linecap='round'/>"
      : "<path d='M" + R(cx - s * 0.09) + ' ' + R(cy + s * 0.52) + ' q' + R(s * 0.09) + ' ' + R(s * 0.07) + ' ' + R(s * 0.18) + " 0' stroke='#0a0a16' stroke-width='" + R(s * 0.05) + "' fill='none' stroke-linecap='round'/>";
    return head + sheenTop + eye(-s * 0.32, 20) + eye(s * 0.32, -20) + mouth;
  }

  // a planet, optionally ringed; simple lit sphere
  function planet(push, cx, cy, r, col, ring) {
    const g = gid();
    push(rg(g, [[0, shade(col, 55)], [0.55, col], [1, shade(col, -55)]], 0.34, 0.3));
    const back = ring ? "<path d='M" + R(cx - r * 1.75) + ' ' + R(cy) + ' a' + R(r * 1.75) + ' ' + R(r * 0.52) + ' 0 0 1 ' + R(r * 3.5) + " 0' fill='none' stroke='" + shade(col, 34) + "' stroke-width='" + R(r * 0.16) + "' opacity='.85' transform='rotate(-16 " + R(cx) + ' ' + R(cy) + ")'/>" : '';
    const front = ring ? "<path d='M" + R(cx - r * 1.75) + ' ' + R(cy) + ' a' + R(r * 1.75) + ' ' + R(r * 0.52) + ' 0 0 0 ' + R(r * 3.5) + " 0' fill='none' stroke='" + shade(col, 20) + "' stroke-width='" + R(r * 0.16) + "' opacity='.95' transform='rotate(-16 " + R(cx) + ' ' + R(cy) + ")'/>" : '';
    return back
      + "<circle cx='" + R(cx) + "' cy='" + R(cy) + "' r='" + R(r) + "' fill='url(#" + g + ")'/>"
      + "<ellipse cx='" + R(cx - r * 0.34) + "' cy='" + R(cy - r * 0.36) + "' rx='" + R(r * 0.3) + "' ry='" + R(r * 0.2) + "' fill='#fff' opacity='.3'/>"
      + front;
  }

  // a rocket standing upright; flame flickers
  function rocket(push, cx, cy, s, base, f, tilt) {
    const g = gid(), win = gid(), fin = gid(), sh = gid();
    push(lg(g, [[0, '#ffffff'], [0.5, '#eef1fb'], [1, '#c4cbe2']], true));
    push(rg(win, [[0, GLASS[0]], [1, GLASS[2]]], 0.4, 0.35));
    push(bodyGrad(fin, base));
    push(sheen(sh));
    const flame = [0.7, 1, 0.8, 1, 0.85, 0.95][f], fl = s * (0.55 + 0.4 * flame);
    const nose = toHex(candy(base));
    const g2 = gid(); push(lg(g2, [[0, shade(nose, 40)], [1, shade(nose, -30)]]));
    const body =
      // flame
      "<path d='M" + R(cx - s * 0.24) + ' ' + R(cy + s * 0.95) + ' Q' + R(cx) + ' ' + R(cy + 0.95 * s + fl) + ' ' + R(cx + s * 0.24) + ' ' + R(cy + s * 0.95) + " Z' fill='#ffb020'/>"
      + "<path d='M" + R(cx - s * 0.13) + ' ' + R(cy + s * 0.95) + ' Q' + R(cx) + ' ' + R(cy + 0.95 * s + fl * 0.6) + ' ' + R(cx + s * 0.13) + ' ' + R(cy + s * 0.95) + " Z' fill='#fff1b0'/>"
      // fins
      + "<path d='M" + R(cx - s * 0.28) + ' ' + R(cy + s * 0.45) + ' L' + R(cx - s * 0.62) + ' ' + R(cy + s * 0.95) + ' L' + R(cx - s * 0.28) + ' ' + R(cy + s * 0.95) + " Z' fill='url(#" + fin + ")'/>"
      + "<path d='M" + R(cx + s * 0.28) + ' ' + R(cy + s * 0.45) + ' L' + R(cx + s * 0.62) + ' ' + R(cy + s * 0.95) + ' L' + R(cx + s * 0.28) + ' ' + R(cy + s * 0.95) + " Z' fill='url(#" + fin + ")'/>"
      // hull
      + "<path d='M" + R(cx) + ' ' + R(cy - s) + ' C' + R(cx + s * 0.42) + ' ' + R(cy - s * 0.5) + ' ' + R(cx + s * 0.34) + ' ' + R(cy + s * 0.6) + ' ' + R(cx + s * 0.26) + ' ' + R(cy + s * 0.95)
      + ' L' + R(cx - s * 0.26) + ' ' + R(cy + s * 0.95) + ' C' + R(cx - s * 0.34) + ' ' + R(cy + s * 0.6) + ' ' + R(cx - s * 0.42) + ' ' + R(cy - s * 0.5) + ' ' + R(cx) + ' ' + R(cy - s) + " Z' fill='url(#" + g + ")'/>"
      // nose band
      + "<path d='M" + R(cx) + ' ' + R(cy - s) + ' C' + R(cx + s * 0.42) + ' ' + R(cy - s * 0.5) + ' ' + R(cx + s * 0.36) + ' ' + R(cy - s * 0.18) + ' ' + R(cx + s * 0.3) + ' ' + R(cy - s * 0.1)
      + ' L' + R(cx - s * 0.3) + ' ' + R(cy - s * 0.1) + ' C' + R(cx - s * 0.36) + ' ' + R(cy - s * 0.18) + ' ' + R(cx - s * 0.42) + ' ' + R(cy - s * 0.5) + ' ' + R(cx) + ' ' + R(cy - s) + " Z' fill='url(#" + g2 + ")'/>"
      // window
      + "<circle cx='" + R(cx) + "' cy='" + R(cy + s * 0.1) + "' r='" + R(s * 0.17) + "' fill='url(#" + win + ")' stroke='" + shade(base, -20) + "' stroke-width='" + R(s * 0.05) + "'/>"
      + "<circle cx='" + R(cx - s * 0.06) + "' cy='" + R(cy + s * 0.04) + "' r='" + R(s * 0.05) + "' fill='#fff' opacity='.8'/>"
      + "<path d='M" + R(cx - s * 0.16) + ' ' + R(cy - s * 0.9) + ' Q' + R(cx - s * 0.05) + ' ' + R(cy - s * 0.2) + ' ' + R(cx - s * 0.1) + ' ' + R(cy + s * 0.5) + "' stroke='#fff' stroke-width='" + R(s * 0.06) + "' opacity='.4' fill='none' stroke-linecap='round'/>";
    return tilt ? "<g transform='rotate(" + tilt + ' ' + R(cx) + ' ' + R(cy) + ")'>" + body + '</g>' : body;
  }

  // a downward tractor beam under an object
  function beam(cx, topY, topW, botY, botW, col, f) {
    const o = [0.5, 0.7, 0.85, 0.7, 0.55, 0.4][f];
    const g = 'b' + (uid++);
    return "<defs><linearGradient id='" + g + "' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='" + col + "' stop-opacity='" + (0.55 * o) + "'/><stop offset='1' stop-color='" + col + "' stop-opacity='0'/></linearGradient></defs>"
      + "<path d='M" + R(cx - topW) + ' ' + R(topY) + ' L' + R(cx + topW) + ' ' + R(topY) + ' L' + R(cx + botW) + ' ' + R(botY) + ' L' + R(cx - botW) + ' ' + R(botY) + " Z' fill='url(#" + g + ")'/>";
  }

  // radar / satellite dish, sweep rotates
  function dish(push, cx, cy, s, base, f) {
    const g = gid(); push(rg(g, [[0, '#eef3ff'], [0.7, shade(base, 20)], [1, shade(base, -40)]], 0.4, 0.35));
    const sweep = f * 60;
    return "<ellipse cx='" + R(cx) + "' cy='" + R(cy) + "' rx='" + R(s) + "' ry='" + R(s * 0.7) + "' fill='url(#" + g + ")' transform='rotate(-30 " + R(cx) + ' ' + R(cy) + ")'/>"
      + "<ellipse cx='" + R(cx) + "' cy='" + R(cy) + "' rx='" + R(s * 0.6) + "' ry='" + R(s * 0.42) + "' fill='none' stroke='" + shade(base, -30) + "' stroke-width='1.5' opacity='.5' transform='rotate(-30 " + R(cx) + ' ' + R(cy) + ")'/>"
      + "<line x1='" + R(cx) + "' y1='" + R(cy) + "' x2='" + R(cx + Math.cos(sweep * Math.PI / 180) * s * 0.55) + "' y2='" + R(cy + Math.sin(sweep * Math.PI / 180) * s * 0.4) + "' stroke='#7dffb0' stroke-width='2.5' stroke-linecap='round'/>"
      + "<circle cx='" + R(cx) + "' cy='" + R(cy) + "' r='" + R(s * 0.1) + "' fill='#fff'/>";
  }

  const shellDefs =
    "<filter id='fblur' x='-60%' y='-60%' width='220%' height='220%'><feGaussianBlur stdDeviation='4.5'/></filter>"
    + "<filter id='fsoft' x='-60%' y='-60%' width='220%' height='220%'><feGaussianBlur stdDeviation='2.2'/></filter>"
    + "<filter id='fglow' x='-90%' y='-90%' width='280%' height='280%'><feGaussianBlur stdDeviation='3.2'/></filter>";

  function shell(defs, art, f, shadowRx) {
    return "<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'><defs>"
      + shellDefs + defs + '</defs>'
      + starfield(f)
      + shadow(f, shadowRx || 40)
      + "<g transform='translate(0," + FLOAT[f] + ")'>" + art + '</g></svg>';
  }

  // ===========================================================================
  //  SUBJECTS
  // ===========================================================================
  const ART = {};

  // Meeting (hero) — a mothership: wide saucer, glass dome holding a little alien
  // crew; the speaking crewmate glows, cycling frame to frame. Under-lights run.
  ART.video = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const disc = saucer(push, 64, 74, 40, base, f);
    const crew = [[50, 58], [64, 54], [78, 58]].map((p, i) => {
      const on = i === f % 3;
      return (on ? "<circle cx='" + p[0] + "' cy='" + (p[1] + 2) + "' r='11' fill='" + base + "' opacity='.55' filter='url(#fglow)'/>" : '')
        + "<g transform='translate(" + (p[0] - 32) + "," + (p[1] - 30) + ") scale(.5)'>" + alien(push, 64, 60, 16, on ? f : (f + 2) % 6) + "</g>";
    }).join('');
    const art = disc + crew;
    return { defs: D.join(''), art, shadowRx: 46 };
  };

  // Files — a cargo/docking pod: rounded hull, round hatch window onto stars,
  // a saucer decal; hatch light pulses.
  ART.folder = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const g1 = gid(), sh = gid(), win = gid();
    push(bodyGrad(g1, base)); push(sheen(sh));
    push(rg(win, [[0, '#132043'], [1, '#0a1024']], 0.4, 0.4));
    const glow = [0.4, 0.7, 1, 0.8, 0.55, 0.35][f];
    const art =
      "<path d='" + rr(24, 40, 80, 60, 16) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(24, 40, 80, 24, 16) + "' fill='url(#" + sh + ")'/>"
      + "<path d='M28 92 h72' stroke='" + shade(base, -40) + "' stroke-width='2' opacity='.5'/>"
      + "<circle cx='64' cy='70' r='19' fill='url(#" + win + ")' stroke='" + shade(base, -30) + "' stroke-width='3'/>"
      + star(58, 64, 0.7, f, 0) + star(70, 72, 0.6, f, 2) + star(64, 78, 0.5, f, 4)
      + "<circle cx='36' cy='50' r='3' fill='#ffd23c' opacity='" + glow + "' filter='url(#fglow)'/>"
      + "<circle cx='36' cy='50' r='2.4' fill='#fff2a8' opacity='" + glow + "'/>"
      // little saucer decal
      + "<g transform='translate(92,52) scale(.42)'>" + saucer(push, 0, 0, 22, shade(base, 30), f) + '</g>';
    return { defs: D.join(''), art, shadowRx: 44 };
  };

  // Notes — an alien data-slate: dark screen with glowing glyph lines being
  // written, and a light-stylus.
  ART.notes = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const g1 = gid(), scr = gid(), sh = gid();
    push(bodyGrad(g1, shade(base, -10)));
    push(rg(scr, [[0, '#153055'], [1, '#0a1730']], 0.4, 0.3));
    push(sheen(sh));
    const w = 10 + 30 * (f / (FR - 1));
    const glyph = (y, len, lit) => "<path d='M40 " + y + ' h' + len + "' stroke='" + (lit ? '#7dffe0' : shade(base, 30)) + "' stroke-width='3.5' stroke-linecap='round' opacity='" + (lit ? 1 : 0.7) + "'" + (lit ? " filter='url(#fglow)'" : '') + '/>';
    const art =
      "<path d='" + rr(30, 26, 68, 76, 12) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(37, 33, 54, 62, 6) + "' fill='url(#" + scr + ")'/>"
      + glyph(46, 44, false) + glyph(58, 34, false) + glyph(70, w, true) + glyph(82, 26, false)
      + "<path d='" + rr(30, 26, 68, 22, 12) + "' fill='url(#" + sh + ")'/>"
      // light-stylus
      + "<g transform='translate(96,92) rotate(40)'><rect x='-3.5' y='-30' width='7' height='26' rx='3' fill='" + base + "'/><path d='M-3.5 -4 L3.5 -4 L0 6 Z' fill='#7dffe0'/><circle cx='0' cy='4' r='2.5' fill='#fff' filter='url(#fglow)'/></g>"
      + star(24, 34, 0.7, f, 1, base);
    return { defs: D.join(''), art, shadowRx: 40 };
  };

  // Calculator — a navigation console: dark panel, green numeric readout that
  // cycles, a grid of glowing keys with one lit.
  ART.calc = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const g1 = gid(), scr = gid(), key = gid(), sh = gid();
    push(bodyGrad(g1, shade(base, -18)));
    push(lg(scr, [[0, '#0c2a1c'], [1, '#07160f']]));
    push(rg(key, [[0, shade(base, 40)], [1, shade(base, -30)]], 0.4, 0.35));
    push(sheen(sh));
    const lit = f % 4;
    let btns = ''; let i = 0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++, i++) {
      const on = i === (lit * 3 + 1) % 9;
      btns += "<rect x='" + (40 + c * 17) + "' y='" + (64 + r * 12) + "' width='13' height='9' rx='4' fill='" + (on ? '#7dffb0' : "url(#" + key + ")") + "'" + (on ? " filter='url(#fglow)'" : '') + '/>';
    }
    const art =
      "<path d='" + rr(30, 26, 68, 76, 14) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + rr(38, 33, 52, 22, 6) + "' fill='url(#" + scr + ")'/>"
      + "<text x='85' y='49' font-family='ui-monospace,monospace' font-size='15' font-weight='700' fill='#6dffa0' text-anchor='end'>" + [42, 137, 404, 1024, 88, 7][f] + '</text>'
      + btns
      + "<path d='" + rr(30, 26, 68, 20, 14) + "' fill='url(#" + sh + ")'/>"
      + star(22, 40, 0.6, f, 3, base);
    return { defs: D.join(''), art, shadowRx: 40 };
  };

  // Stopwatch → launch countdown: a round warp-core gauge, a glowing sweep arc,
  // a shrinking countdown number.
  ART.timer = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const ring = gid(), core = gid();
    push(rg(core, [[0, '#12305a'], [1, '#0a1122']], 0.4, 0.35));
    push(lg(ring, [[0, shade(base, 50)], [1, shade(base, -40)]]));
    const frac = 1 - f / FR;
    const ang = -90 + 360 * (1 - frac);
    const rad = 30, cx = 64, cy = 66;
    const ex = cx + rad * Math.cos(ang * Math.PI / 180), ey = cy + rad * Math.sin(ang * Math.PI / 180);
    const large = (360 * (1 - frac)) > 180 ? 1 : 0;
    const arc = "<path d='M" + cx + ' ' + (cy - rad) + ' A' + rad + ' ' + rad + ' 0 ' + large + " 1 " + R(ex) + ' ' + R(ey) + "' fill='none' stroke='#7dffe0' stroke-width='6' stroke-linecap='round' filter='url(#fglow)'/>";
    const art =
      "<circle cx='" + cx + "' cy='" + cy + "' r='38' fill='url(#" + ring + ")'/>"
      + "<circle cx='" + cx + "' cy='" + cy + "' r='30' fill='url(#" + core + ")'/>"
      + "<circle cx='" + cx + "' cy='" + cy + "' r='38' fill='none' stroke='" + shade(base, -55) + "' stroke-width='3'/>"
      + arc
      + "<text x='" + cx + "' y='" + (cy + 8) + "' font-family='ui-monospace,monospace' font-size='24' font-weight='800' fill='#fff' text-anchor='middle'>" + [5, 4, 3, 2, 1, 0][f] + '</text>'
      + "<rect x='" + (cx - 6) + "' y='22' width='12' height='7' rx='2' fill='" + base + "'/>"
      + star(100, 44, 0.7, f, 2, base) + star(28, 92, 0.6, f, 4, '#fff');
    return { defs: D.join(''), art, shadowRx: 42 };
  };

  // Welcome — a friendly alien waving hello over a little world.
  ART.welcome = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const wave = [10, -8, -18, -8, 6, 14][f];
    const art =
      planet(push, 64, 108, 30, shade(base, -6), false)
      + "<g transform='translate(64,96) scale(.62)'>"
      // torso
      + "<path d='M-14 22 Q-16 -2 0 -2 Q16 -2 14 22 Z' fill='" + mixc(SKIN, '#ffffff', 0.05) + "'/>"
      // waving arm
      + "<g transform='rotate(" + wave + " -12 6)'><path d='M-12 6 Q-26 -2 -26 -18' stroke='" + SKIN + "' stroke-width='6' fill='none' stroke-linecap='round'/><circle cx='-26' cy='-20' r='4.5' fill='" + shade(SKIN, 12) + "'/></g>"
      + "<path d='M12 6 Q22 2 22 14' stroke='" + SKIN + "' stroke-width='6' fill='none' stroke-linecap='round'/>"
      + '</g>'
      + "<g transform='translate(64,66) scale(.8)'>" + alien(push, 64, 60, 20, f) + '</g>'
      + star(100, 30, 0.9, f, 0, base) + star(24, 40, 0.7, f, 3, '#fff');
    return { defs: D.join(''), art, shadowRx: 40 };
  };

  // Tic-Tac-Toe — an alien grid: X-team saucers, O-team ringed planets, one
  // piece popping in per frame.
  ART.tictactoe = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const gx = 36, gy = 38, cell = 19;
    const grid = "<path d='M" + (gx + cell) + ' ' + gy + ' v' + (cell * 3) + ' M' + (gx + cell * 2) + ' ' + gy + ' v' + (cell * 3)
      + ' M' + gx + ' ' + (gy + cell) + ' h' + (cell * 3) + ' M' + gx + ' ' + (gy + cell * 2) + ' h' + (cell * 3) + "' stroke='" + shade(base, 20) + "' stroke-width='3' stroke-linecap='round' opacity='.8'/>";
    const cellsPlan = [[0, 0, 'x'], [1, 1, 'o'], [2, 0, 'x'], [0, 2, 'o'], [2, 2, 'x'], [1, 0, 'o']];
    let marks = '';
    for (let i = 0; i <= f && i < cellsPlan.length; i++) {
      const [c, r, k] = cellsPlan[i];
      const mx = gx + c * cell + cell / 2, my = gy + r * cell + cell / 2;
      const pop = i === f ? 0.6 : 1;
      marks += "<g transform='translate(" + mx + ',' + my + ') scale(' + pop + ")'>"
        + (k === 'x' ? saucer(push, 0, 0, 8, base, f) : planet(push, 0, 0, 6, mixc(base, '#ffffff', 0.3), true)) + '</g>';
    }
    return { defs: D.join(''), art: grid + marks + star(102, 30, 0.7, f, 2, base), shadowRx: 42 };
  };

  // Connect Four → dropping glowing star-orbs into a slotted hull.
  ART.connect4 = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const g1 = gid(); push(bodyGrad(g1, base));
    const bx = 32, by = 40, cols = 4, rows = 4, cell = 15;
    let holes = '';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      holes += "<circle cx='" + (bx + 8 + c * cell) + "' cy='" + (by + 8 + r * cell) + "' r='5.5' fill='#0a1024'/>";
    }
    const dropY = by + 8 + Math.min(f, 3) * cell;
    const art =
      "<path d='" + rr(bx, by, cols * cell + 4, rows * cell + 4, 8) + "' fill='url(#" + g1 + ")'/>"
      + holes
      + "<circle cx='" + (bx + 8 + cell) + "' cy='" + dropY + "' r='5.5' fill='#ffe27a' filter='url(#fglow)'/>"
      + "<circle cx='" + (bx + 8) + "' cy='" + (by + 8 + 3 * cell) + "' r='5.5' fill='#7dd0ff'/>"
      + "<circle cx='" + (bx + 8 + 2 * cell) + "' cy='" + (by + 8 + 3 * cell) + "' r='5.5' fill='#ff8fb0'/>"
      + star(100, 34, 0.7, f, 1, base);
    return { defs: D.join(''), art, shadowRx: 42 };
  };

  // Minesweeper → a field with a floating spiky space-mine, light blinking; a
  // little rocket "flag".
  ART.minesweeper = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const g1 = gid(); push(bodyGrad(g1, shade(base, -6)));
    let cells = '';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      cells += "<path d='" + rr(34 + c * 20, 38 + r * 20, 18, 18, 4) + "' fill='" + ((r + c) % 2 ? shade(base, -20) : shade(base, 8)) + "'/>";
    }
    const blink = [0.5, 1, 0.6, 1, 0.7, 0.9][f];
    const mine = "<g transform='translate(64,68)'>"
      + range(8).map((i) => { const an = i * 45 * Math.PI / 180; return "<line x1='0' y1='0' x2='" + R(Math.cos(an) * 15) + "' y2='" + R(Math.sin(an) * 15) + "' stroke='#2a2a3f' stroke-width='3.5' stroke-linecap='round'/>"; }).join('')
      + "<circle r='10' fill='#1a1a28'/><circle r='10' fill='none' stroke='#3a3a55' stroke-width='2'/>"
      + "<circle cx='-3' cy='-3' r='2.5' fill='#8a8aa5'/>"
      + "<circle cx='0' cy='-2' r='3' fill='#ff5a5a' opacity='" + blink + "' filter='url(#fglow)'/></g>";
    const flag = "<g transform='translate(96,44) scale(.32)'>" + rocket(push, 0, 0, 20, base, f) + '</g>';
    return { defs: D.join(''), art: cells + mine + flag, shadowRx: 42 };
  };

  // Chess → a starfleet board: 2-tone squares, a hero rocket "king" and a
  // saucer "pawn"; the board rocks gently.
  ART.chess = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const rock = [0, -1.5, -2.5, -2, -1, 0][f];
    let sq = '';
    const bx = 34, by = 52, cell = 15;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      sq += "<rect x='" + (bx + c * cell) + "' y='" + (by + r * cell) + "' width='" + cell + "' height='" + cell + "' fill='" + ((r + c) % 2 ? shade(base, 34) : shade(base, -34)) + "'/>";
    }
    const art = "<g transform='rotate(" + rock + " 64 70)'>"
      + "<path d='M" + (bx - 3) + ' ' + (by - 3) + ' h' + (cell * 4 + 6) + ' v' + (cell * 4 + 6) + ' h-' + (cell * 4 + 6) + " z' fill='none' stroke='" + shade(base, -50) + "' stroke-width='3'/>"
      + sq + '</g>'
      + "<g transform='translate(50,54) scale(.34)'>" + rocket(push, 0, 0, 20, base, f) + '</g>'
      + "<g transform='translate(80,64) scale(.5)'>" + saucer(push, 0, 0, 16, shade(base, 20), f) + '</g>'
      + star(102, 32, 0.7, f, 3, base);
    return { defs: D.join(''), art, shadowRx: 42 };
  };

  // Paint → a ray-sprayer painting a nebula; cosmic-colour dabs.
  ART.paint = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const neb = gid();
    push(rg(neb, [[0, '#ff8fd0', 0.9], [0.5, '#9a6bff', 0.6], [1, '#5ad0ff', 0]], 0.5, 0.4));
    const puff = [0.6, 0.8, 1, 0.9, 0.75, 0.65][f];
    const dabs = ['#ff6bb0', '#ffd23c', '#6bd0ff', '#9a7bff'].map((c, i) =>
      "<circle cx='" + (40 + i * 14) + "' cy='96' r='" + (i === f % 4 ? 6 : 4.5) + "' fill='" + c + "'" + (i === f % 4 ? " filter='url(#fglow)'" : '') + '/>').join('');
    const art =
      "<ellipse cx='58' cy='54' rx='" + (30 * puff) + "' ry='" + (26 * puff) + "' fill='url(#" + neb + ")'/>"
      + star(50, 46, 0.8, f, 0) + star(66, 60, 0.7, f, 2) + star(58, 40, 0.5, f, 4)
      // sprayer
      + "<g transform='translate(90,74) rotate(-30)'>"
      + "<path d='" + rr(-6, -10, 12, 26, 4) + "' fill='" + base + "'/><path d='M-6 -10 h12 v6 h-12 z' fill='#fff' opacity='.4'/>"
      + "<path d='M-4 -10 L0 -20 L4 -10 Z' fill='" + shade(base, 30) + "'/>"
      + "<rect x='-3' y='14' width='6' height='6' rx='2' fill='" + shade(base, -30) + "'/></g>"
      + dabs;
    return { defs: D.join(''), art, shadowRx: 42 };
  };

  // Fortune → a cosmic crystal orb: a swirling ringed planet in a glow, reading.
  ART.fortune = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const orb = gid(), sw = gid();
    push(rg(orb, [[0, '#fff6d0'], [0.4, '#ffd23c'], [0.75, mixc(base, '#ff8f3c', 0.4)], [1, shade(base, -50)]], 0.4, 0.35));
    const pulse = [0.4, 0.6, 0.85, 1, 0.7, 0.5][f];
    const swirl = f * 30;
    const art =
      "<circle cx='64' cy='60' r='34' fill='" + base + "' opacity='" + (0.4 * pulse) + "' filter='url(#fglow)'/>"
      + "<circle cx='64' cy='60' r='28' fill='url(#" + orb + ")'/>"
      + "<g transform='rotate(" + swirl + " 64 60)' opacity='.5'><path d='M64 60 q14 -10 20 4 q-10 14 -22 6' fill='none' stroke='#fff' stroke-width='2.5' stroke-linecap='round'/></g>"
      + "<ellipse cx='56' cy='50' rx='9' ry='6' fill='#fff' opacity='.5'/>"
      // base stand
      + "<path d='M46 90 h36 l-6 -8 h-24 z' fill='" + shade(base, -30) + "'/>"
      + star(98, 34, 0.9, f, 1, '#fff') + star(30, 40, 0.7, f, 3, base) + star(96, 78, 0.6, f, 4, base);
    return { defs: D.join(''), art, shadowRx: 40 };
  };

  // Guestbook → a visitor log-slate with a glowing alien-glyph signature + a
  // saucer stamp.
  ART.guestbook = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const g1 = gid(), sh = gid();
    push(lg(g1, [[0, '#f2eefb'], [1, '#d3cce6']]));
    push(sheen(sh));
    const w = 8 + 30 * (f / (FR - 1));
    const art =
      "<path d='" + rr(28, 30, 62, 70, 8) + "' fill='#b8b0d2'/>"
      + "<path d='" + rr(26, 28, 62, 70, 8) + "' fill='url(#" + g1 + ")'/>"
      + "<path d='M34 44 h46 M34 54 h46' stroke='" + shade(base, 10) + "' stroke-width='2.5' opacity='.4'/>"
      // glowing signature glyph being written
      + "<path d='M34 72 q6 -12 12 0 t12 0' stroke='" + base + "' stroke-width='3' fill='none' stroke-linecap='round' stroke-dasharray='" + w + " 80' filter='url(#fglow)'/>"
      + "<path d='M34 84 h" + (w * 0.7) + "' stroke='" + shade(base, 20) + "' stroke-width='2.5' stroke-linecap='round'/>"
      + "<path d='" + rr(26, 28, 62, 16, 8) + "' fill='url(#" + sh + ")'/>"
      // saucer stamp top-right
      + "<g transform='translate(94,40) scale(.44)'>" + saucer(push, 0, 0, 22, base, f) + '</g>'
      + star(22, 92, 0.6, f, 2, base);
    return { defs: D.join(''), art, shadowRx: 40 };
  };

  // Chat → alien comm bubbles trading glyphs, with an antenna.
  ART.chat = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const g1 = gid(); push(bodyGrad(g1, base));
    const which = f % 2;
    const bub = (x, y, w, h, fill, tailLeft, on) =>
      "<path d='" + rr(x, y, w, h, 9) + "' fill='" + fill + "'" + (on ? " filter='url(#fglow)'" : '') + '/>'
      + (tailLeft ? "<path d='M" + (x + 8) + " " + (y + h - 2) + " l-6 9 l14 -5 z' fill='" + fill + "'/>"
        : "<path d='M" + (x + w - 8) + " " + (y + h - 2) + " l6 9 l-14 -5 z' fill='" + fill + "'/>")
      + "<g transform='translate(" + (x + w / 2) + "," + (y + h / 2) + ")'><circle cx='-6' r='2.2' fill='#fff'/><circle r='2.2' fill='#fff'/><circle cx='6' r='2.2' fill='#fff'/></g>";
    const art =
      bub(28, 34, 52, 26, "url(#" + g1 + ")", true, which === 0)
      + bub(48, 66, 52, 26, shade(base, -18), false, which === 1)
      // little antenna
      + "<g transform='translate(96,30)'><line x1='0' y1='0' x2='0' y2='-12' stroke='" + shade(base, 20) + "' stroke-width='2.5'/><circle cy='-14' r='3' fill='#7dffe0' filter='url(#fglow)'/></g>"
      + star(22, 96, 0.7, f, 3, base);
    return { defs: D.join(''), art, shadowRx: 42 };
  };

  // Chest → an alien artifact pod opening to reveal glowing crystals; lid lifts
  // and sparks escape.
  ART.chest = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const g1 = gid(), lid = gid(), gl = gid();
    push(bodyGrad(g1, base)); push(lg(lid, [[0, shade(base, 44)], [1, base]]));
    push(rg(gl, [[0, '#eafff0'], [0.5, '#7dffb0'], [1, '#2f9a6a']], 0.5, 0.4));
    const open = [2, 8, 16, 22, 18, 10][f], glow = [0.3, 0.6, 1, 1, 0.8, 0.5][f];
    const art =
      // glow from inside
      "<ellipse cx='64' cy='66' rx='26' ry='14' fill='#7dffb0' opacity='" + (0.5 * glow) + "' filter='url(#fglow)'/>"
      // crystals
      + "<g opacity='" + glow + "'><path d='M54 70 l6 -18 l6 18 z' fill='url(#" + gl + ")'/><path d='M64 72 l5 -12 l5 12 z' fill='url(#" + gl + ")'/></g>"
      // body
      + "<path d='" + rr(34, 60, 60, 34, 8) + "' fill='url(#" + g1 + ")'/>"
      + "<rect x='34' y='72' width='60' height='6' fill='" + shade(base, -40) + "'/>"
      // lid (lifted)
      + "<g transform='translate(0," + (-open) + ")'><path d='M34 60 a30 14 0 0 1 60 0 z' fill='url(#" + lid + ")'/>"
      + "<ellipse cx='64' cy='54' rx='28' ry='7' fill='#fff' opacity='.25'/></g>"
      + "<rect x='58' y='" + (66 - open) + "' width='12' height='9' rx='2' fill='#ffd23c'/>"
      + star(58, 40, 0.8, f, 0) + star(72, 44, 0.7, f, 3) + star(64, 34, 0.6, f, 5);
    return { defs: D.join(''), art, shadowRx: 44 };
  };

  // Imposter → a shifty accent-coloured alien with a sneaky grin and a "sus"
  // red glow; eyes dart.
  ART.imposter = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const sus = [0.3, 0.5, 0.8, 1, 0.7, 0.45][f];
    const art =
      "<circle cx='64' cy='62' r='34' fill='#ff3a3a' opacity='" + (0.35 * sus) + "' filter='url(#fglow)'/>"
      // body
      + "<path d='M40 100 Q38 66 64 66 Q90 66 88 100 Z' fill='" + base + "'/>"
      + "<path d='M40 100 Q38 66 64 66 Q68 66 70 68 Q50 74 50 100 Z' fill='#fff' opacity='.18'/>"
      // backpack
      + "<path d='" + rr(84, 74, 12, 20, 5) + "' fill='" + shade(base, -30) + "'/>"
      + "<g transform='translate(64,58) scale(.9)'>" + alien(push, 64, 60, 18, f, mixc(base, SKIN, 0.35), { grin: true }) + '</g>'
      + star(26, 34, 0.7, f, 2, '#ff6a6a') + star(102, 40, 0.6, f, 4, base);
    return { defs: D.join(''), art, shadowRx: 42 };
  };

  // Spy → a scanning eye in a targeting scope, sweeping side to side.
  ART.spy = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const scope = gid(), iris = gid();
    push(rg(scope, [[0, '#0e1c38'], [1, '#060c1c']], 0.4, 0.4));
    push(rg(iris, [[0, '#eafff6'], [0.4, '#7dffe0'], [1, shade(base, -20)]], 0.4, 0.35));
    const look = [-6, -3, 0, 3, 6, 0][f];
    const art =
      "<circle cx='64' cy='64' r='40' fill='url(#" + scope + ")' stroke='" + base + "' stroke-width='4'/>"
      + "<circle cx='64' cy='64' r='40' fill='none' stroke='" + shade(base, 30) + "' stroke-width='1.5' stroke-dasharray='4 6' opacity='.6'/>"
      // reticle
      + "<path d='M64 30 v10 M64 88 v10 M30 64 h10 M88 64 h10' stroke='" + base + "' stroke-width='2.5'/>"
      // eye
      + "<ellipse cx='64' cy='64' rx='24' ry='16' fill='#fff'/>"
      + "<circle cx='" + (64 + look) + "' cy='64' r='11' fill='url(#" + iris + ")'/>"
      + "<circle cx='" + (64 + look) + "' cy='64' r='5' fill='#0a0a16'/>"
      + "<circle cx='" + (60 + look) + "' cy='60' r='2.5' fill='#fff'/>"
      + star(100, 30, 0.7, f, 3, base);
    return { defs: D.join(''), art, shadowRx: 42 };
  };

  // Tilt → a saucer balancing on a gyro pivot, rocking, with a level bubble.
  ART.tilt = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const t = [-12, -7, 0, 7, 12, 4][f];
    const art =
      "<g transform='rotate(" + t + " 64 60)'>" + saucer(push, 64, 58, 34, base, f) + '</g>'
      // pivot
      + "<path d='M56 92 L64 74 L72 92 Z' fill='" + shade(base, -30) + "'/>"
      + "<circle cx='64' cy='74' r='4' fill='" + shade(base, 30) + "'/>"
      // level tube
      + "<g transform='rotate(" + (t * 0.4) + " 64 100)'><rect x='40' y='96' width='48' height='9' rx='4.5' fill='#0e1c38'/>"
      + "<circle cx='" + (64 + t * 0.8) + "' cy='100.5' r='3.5' fill='#7dffb0' filter='url(#fglow)'/></g>"
      + star(24, 34, 0.7, f, 2, base);
    return { defs: D.join(''), art, shadowRx: 40 };
  };

  // Dial → a rotating radar dish with a sweep and a blip.
  ART.dial = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const art =
      dish(push, 64, 62, 34, base, f)
      + "<rect x='60' y='84' width='8' height='16' rx='3' fill='" + shade(base, -20) + "'/>"
      + "<circle cx='" + (64 + Math.cos(f * 60 * Math.PI / 180) * 18) + "' cy='" + (62 + Math.sin(f * 60 * Math.PI / 180) * 12) + "' r='3' fill='#7dffb0' filter='url(#fglow)'/>"
      + star(102, 32, 0.7, f, 3, base) + star(24, 44, 0.6, f, 1, '#fff');
    return { defs: D.join(''), art, shadowRx: 40 };
  };

  // Roulette → a spinning orbital ring; planets as pockets, a comet ball
  // settling, a pointer.
  ART.roulette = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const g1 = gid(); push(rg(g1, [[0, shade(base, 30)], [1, shade(base, -40)]], 0.4, 0.35));
    const spin = f * 40;
    let pockets = '';
    for (let i = 0; i < 8; i++) {
      const an = (spin + i * 45) * Math.PI / 180;
      pockets += "<circle cx='" + R(64 + Math.cos(an) * 26) + "' cy='" + R(62 + Math.sin(an) * 26) + "' r='4' fill='" + (i % 2 ? '#ff8fb0' : '#7dd0ff') + "'/>";
    }
    const ballAn = (spin * 2 + 20) * Math.PI / 180;
    const art =
      "<circle cx='64' cy='62' r='36' fill='url(#" + g1 + ")'/>"
      + "<circle cx='64' cy='62' r='36' fill='none' stroke='" + shade(base, -50) + "' stroke-width='3'/>"
      + "<circle cx='64' cy='62' r='18' fill='" + shade(base, -30) + "'/>"
      + pockets
      + "<circle cx='" + R(64 + Math.cos(ballAn) * 32) + "' cy='" + R(62 + Math.sin(ballAn) * 32) + "' r='3.5' fill='#fff' filter='url(#fglow)'/>"
      + "<path d='M64 20 l-5 -8 h10 z' fill='#ffd23c'/>"
      + star(102, 92, 0.6, f, 4, base);
    return { defs: D.join(''), art, shadowRx: 42 };
  };

  // Fake Facts → a broadcast satellite firing signal waves, with a glitchy "?!"
  ART.fakefacts = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const waves = range(3).map((i) => {
      const on = ((f + i) % 3) === 0;
      return "<path d='M92 40 a" + (10 + i * 9) + ' ' + (10 + i * 9) + " 0 0 1 0 " + (20 + i * 18) + "' fill='none' stroke='#7dffe0' stroke-width='2.5' opacity='" + (on ? 0.9 : 0.3) + "'" + (on ? " filter='url(#fglow)'" : '') + '/>';
    }).join('');
    const glitch = [0, 2, -2, 1, -1, 0][f];
    const art =
      dish(push, 44, 58, 26, base, f)
      + "<rect x='40' y='76' width='8' height='18' rx='3' fill='" + shade(base, -20) + "'/>"
      + waves
      + "<text x='" + (96 + glitch) + "' y='84' font-family='system-ui,sans-serif' font-size='26' font-weight='800' fill='" + base + "' text-anchor='middle'>?!</text>"
      + "<text x='" + (96 - glitch) + "' y='84' font-family='system-ui,sans-serif' font-size='26' font-weight='800' fill='#ff5a8a' text-anchor='middle' opacity='.5'>?!</text>"
      + star(24, 34, 0.7, f, 2, base);
    return { defs: D.join(''), art, shadowRx: 40 };
  };

  // One Clue → a targeting reticle locking onto ONE star among many; crosshair
  // pulses, the chosen star flares.
  ART.oneclue = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const pulse = [0.85, 0.95, 1.05, 1, 0.9, 0.8][f];
    const flare = [0.4, 0.7, 1, 0.9, 0.6, 0.45][f];
    const art =
      // scattered dim stars
      star(38, 42, 0.7, f, 1, '#8fa0c8') + star(92, 50, 0.7, f, 4, '#8fa0c8') + star(46, 92, 0.6, f, 2, '#8fa0c8') + star(96, 88, 0.6, f, 5, '#8fa0c8')
      // the chosen star
      + "<circle cx='64' cy='64' r='16' fill='" + base + "' opacity='" + (0.4 * flare) + "' filter='url(#fglow)'/>"
      + star(64, 64, 1.7, f, 0, '#fff2a8')
      // reticle
      + "<g transform='rotate(" + (f * 8) + " 64 64)'><circle cx='64' cy='64' r='" + (26 * pulse) + "' fill='none' stroke='" + base + "' stroke-width='3' stroke-dasharray='10 8'/></g>"
      + "<path d='M64 30 v10 M64 88 v10 M30 64 h10 M88 64 h10' stroke='" + base + "' stroke-width='3' stroke-linecap='round'/>";
    return { defs: D.join(''), art, shadowRx: 40 };
  };

  // Same Brain → two alien heads sharing a telepathic link; the link pulses.
  ART.samebrain = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const pulse = [0.3, 0.6, 1, 0.8, 0.5, 0.35][f];
    const art =
      "<g transform='translate(40,60) scale(.62)'>" + alien(push, 64, 60, 20, f, SKIN, { noBlink: f % 2 === 0 }) + '</g>'
      + "<g transform='translate(88,60) scale(.62) scale(-1,1)'>" + alien(push, 64, 60, 20, (f + 1) % 6, SKIN, { noBlink: f % 2 === 1 }) + '</g>'
      // telepathy link
      + range(3).map((i) => "<circle cx='64' cy='44' r='" + (5 + i * 5) + "' fill='none' stroke='" + base + "' stroke-width='2.5' opacity='" + (pulse * (1 - i * 0.25)) + "'" + (i === 0 ? " filter='url(#fglow)'" : '') + '/>').join('')
      + "<path d='M50 52 Q64 40 78 52' stroke='" + base + "' stroke-width='2.5' fill='none' opacity='" + pulse + "' stroke-dasharray='3 4'/>"
      + star(24, 92, 0.6, f, 3, base) + star(104, 92, 0.6, f, 1, base);
    return { defs: D.join(''), art, shadowRx: 44 };
  };

  // Werewolves → a fanged space-predator under twin moons; eyes glow, it looms.
  ART.wolves = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const g1 = gid(); push(rg(g1, [[0, shade(base, 30)], [0.6, shade(base, -20)], [1, shade(base, -55)]], 0.4, 0.3));
    const loom = [0, -1.5, -3, -3.5, -2, -0.5][f];
    const eye = [0.6, 0.85, 1, 0.9, 0.7, 0.55][f];
    const art =
      // twin moons
      planet(push, 34, 34, 10, '#d8dce8', false) + planet(push, 96, 30, 7, '#c8ccd8', false)
      + star(64, 24, 0.7, f, 2, '#fff') + star(112, 60, 0.6, f, 4, '#fff')
      + "<g transform='translate(0," + loom + ")'>"
      // head/mane
      + "<path d='M64 96 Q34 92 36 60 Q36 44 50 40 L46 28 L58 40 Q64 38 70 40 L82 28 L78 40 Q92 44 92 60 Q94 92 64 96 Z' fill='url(#" + g1 + ")'/>"
      // snout
      + "<path d='M56 74 Q64 84 72 74 Q68 82 64 82 Q60 82 56 74 Z' fill='" + shade(base, -50) + "'/>"
      + "<circle cx='64' cy='72' r='3.5' fill='#1a1420'/>"
      // glowing eyes
      + "<circle cx='54' cy='60' r='4.5' fill='#ffe27a' opacity='" + eye + "' filter='url(#fglow)'/>"
      + "<circle cx='74' cy='60' r='4.5' fill='#ffe27a' opacity='" + eye + "' filter='url(#fglow)'/>"
      + "<circle cx='54' cy='60' r='2' fill='#1a1420'/><circle cx='74' cy='60' r='2' fill='#1a1420'/>"
      // fangs
      + "<path d='M58 78 l2 6 l2 -5 z M68 78 l-2 6 l-2 -5 z' fill='#fff'/></g>";
    return { defs: D.join(''), art, shadowRx: 42 };
  };

  // Rocket Lander (egg) — a rocket easing down onto a lit pad on a tractor beam.
  ART.lander = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const drop = [0, 1.5, 3, 3.5, 2, 0.5][f];
    const art =
      beam(64, 40, 4, 96, 20, base, f)
      + "<g transform='translate(0," + drop + ")'>" + rocket(push, 64, 56, 22, base, f) + '</g>'
      // landing pad
      + "<rect x='40' y='96' width='48' height='6' rx='2' fill='" + shade(base, -20) + "'/>"
      + "<rect x='40' y='94' width='48' height='3' rx='1.5' fill='" + base + "' filter='url(#fglow)'/>"
      + "<rect x='40' y='90' width='4' height='6' fill='#ffd23c'/><rect x='84' y='90' width='4' height='6' fill='#ffd23c'/>"
      + star(24, 34, 0.7, f, 2, base) + star(104, 40, 0.6, f, 4, '#fff');
    return { defs: D.join(''), art, shadowRx: 34 };
  };

  // Alien Translator (egg) — a big-eyed green alien beside a glowing glyph.
  ART.aliens = (a, f) => {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const gl = [0.5, 0.8, 1, 0.85, 0.6, 0.45][f];
    const art =
      alien(push, 50, 62, 26, f)
      // a transmitted glyph
      + "<g transform='translate(96,58)' opacity='" + gl + "'>"
      + "<path d='M-8 -12 Q4 -4 -6 4 Q6 8 -2 16' fill='none' stroke='" + base + "' stroke-width='3' stroke-linecap='round' filter='url(#fglow)'/>"
      + "<circle cx='4' cy='-8' r='2' fill='" + base + "'/></g>"
      + star(24, 34, 0.7, f, 1, base) + star(104, 96, 0.6, f, 4, base);
    return { defs: D.join(''), art, shadowRx: 40 };
  };

  // ---- themed fallback: a glowing saucer tile with the app's initial ---------
  function fallbackArt(letter, a, f) {
    const base = toHex(candy(a));
    const D = []; const push = (d) => D.push(d);
    const g1 = gid(), sh = gid();
    push(rg(g1, [[0, '#132043'], [1, '#0a1024']], 0.4, 0.35));
    push(sheen(sh));
    const art =
      "<path d='" + rr(28, 28, 72, 72, 20) + "' fill='url(#" + g1 + ")' stroke='" + base + "' stroke-width='2.5'/>"
      + "<g transform='translate(64,44) scale(.6)'>" + saucer(push, 0, 0, 26, base, f) + '</g>'
      + "<text x='64' y='92' font-family='system-ui,sans-serif' font-size='26' font-weight='800' fill='#fff' text-anchor='middle'>" + letter + '</text>'
      + "<path d='" + rr(28, 28, 72, 30, 20) + "' fill='url(#" + sh + ")'/>";
    return { defs: D.join(''), art, shadowRx: 38 };
  }

  GifOS.iconPacks.register('orrery', {
    size: SIZE, frames: FR, delayCs: DELAY, dither: 14,
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
