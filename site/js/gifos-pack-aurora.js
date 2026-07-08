/*
 * gifos-pack-aurora.js — "Desktop", the flagship icon pack (gifos.app).
 *
 * System-native squircle tiles: confident colour fields, crisp white symbols,
 * soft contact shadows, no holographic garnish. Reads like a real OS launcher
 * — legible at 64–72px, calm in motion, built to stay.
 *
 * Procedural SVG. 128px raster, 4 frames, light ordered dithering.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  if (!GifOS.iconPacks) return;

  const FR = 4, SIZE = 128, DELAY = 22;
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const hx = (n) => clamp(n).toString(16).padStart(2, '0');
  const toHex = (a) => '#' + hx(a[0]) + hx(a[1]) + hx(a[2]);
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const shade = (c, d) => {
    const a = typeof c === 'string'
      ? [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
      : c;
    return toHex([a[0] + d, a[1] + d, a[2] + d]);
  };

  // Tile body from accent — rich but restrained, not candy-neon.
  function tileColor(a) {
    const peak = Math.max(a[0], a[1], a[2], 1);
    const s = Math.min(1.05, 210 / peak);
    return toHex(mix([a[0] * s, a[1] * s, a[2] * s], [255, 255, 255], 0.08));
  }

  const TILE = 'M42 24 h44 a18 18 0 0 1 18 18 v44 a18 18 0 0 1 -18 18 h-44 a18 18 0 0 1 -18 -18 v-44 a18 18 0 0 1 18 -18 z';
  const FLOAT = [0, -0.6, -1.1, -0.5];
  const GLOW = [0.42, 0.5, 0.56, 0.48];

  let uid = 0;
  const gid = () => 'd' + (uid++);

  const W = "stroke='#fff' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round' fill='none'";
  const F = "fill='#fff' stroke='none'";

  function shell(defs, art, f) {
    const lift = FLOAT[f];
    const shOp = 0.22 - (-lift / 1.1) * 0.04;
    return "<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'>"
      + '<defs>' + defs
      + "<filter id='sh' x='-30%' y='-20%' width='160%' height='160%'><feGaussianBlur stdDeviation='3.2'/></filter>"
      + "<filter id='gl' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur stdDeviation='1.4'/></filter>"
      + '</defs>'
      + "<ellipse cx='64' cy='104' rx='34' ry='7' fill='#1a1f2b' opacity='" + shOp.toFixed(2) + "' filter='url(#sh)'/>"
      + "<g transform='translate(0," + lift + ")'>" + art + '</g></svg>';
  }

  function tileFrame(base, glyph, f, opts) {
    opts = opts || {};
    const g1 = gid(), g2 = gid(), g3 = gid();
    const top = shade(base, 28), bot = shade(base, -32);
    const defs = "<linearGradient id='" + g1 + "' x1='0' y1='0' x2='0' y2='1'>"
      + "<stop offset='0' stop-color='" + top + "'/><stop offset='1' stop-color='" + bot + "'/></linearGradient>"
      + "<linearGradient id='" + g2 + "' x1='0' y1='0' x2='0' y2='1'>"
      + "<stop offset='0' stop-color='#fff' stop-opacity='" + GLOW[f] + "'/>"
      + "<stop offset='.45' stop-color='#fff' stop-opacity='0'/></linearGradient>"
      + (opts.glow ? "<radialGradient id='" + g3 + "' cx='.5' cy='.35' r='.55'>"
        + "<stop offset='0' stop-color='#fff' stop-opacity='.35'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></radialGradient>" : '');
    const art = "<path d='" + TILE + "' fill='url(#" + g1 + ")'/>"
      + "<path d='" + TILE + "' fill='url(#" + g2 + ")'/>"
      + (opts.glow ? "<path d='" + TILE + "' fill='url(#" + g3 + ")'/>" : '')
      + "<path d='" + TILE + "' fill='none' stroke='rgba(255,255,255,.22)' stroke-width='1.2'/>"
      + "<g transform='translate(64,64)'>" + glyph + '</g>';
    return shell(defs, art, f);
  }

  const ART = {};

  ART.notes = (a, f) => {
    const w = 8 + 22 * (f / (FR - 1));
    return tileFrame(tileColor(a),
      "<path d='M-22 -24 h36 a5 5 0 0 1 5 5 v38 a5 5 0 0 1 -5 5 h-36 a5 5 0 0 1 -5 -5 v-38 a5 5 0 0 1 5 -5 z' " + W + "/>"
      + "<path d='M-14 -30 v-6 M-2 -30 v-6 M10 -30 v-6' " + W + "/>"
      + "<path d='M-14 -8 h28 M-14 2 h28 M-14 12 h18' stroke='#fff' stroke-width='2.2' stroke-linecap='round' opacity='.55'/>"
      + "<path d='M-14 2 h" + w + "' stroke='#fff' stroke-width='3.4' stroke-linecap='round'/>", f);
  };

  ART.video = (a, f) => tileFrame('#3a3f4b',
    "<path d='M-24 -16 h32 a4 4 0 0 1 4 4 v24 a4 4 0 0 1 -4 4 h-32 a4 4 0 0 1 -4 -4 v-24 a4 4 0 0 1 4 -4 z' " + W + "/>"
    + "<path d='M14 -6 l16 -8 v28 l-16 -8 z' " + W + "/>"
    + "<circle cx='-18' cy='-20' r='" + (f % 2 ? 3.2 : 2.2) + "' fill='#ff453a'/>", f);

  ART.folder = (a, f) => {
    const lift = [0, 1, 2, 1][f];
    return tileFrame('#5ac8fa',
      "<path d='M-26 -10 a6 6 0 0 1 6 -6 h14 l6 8 h26 a6 6 0 0 1 6 6 v2' " + W + "/>"
      + "<g transform='translate(0," + (-lift) + ")'><path d='M-28 -2 h52 a5 5 0 0 1 5 5 v26 a5 5 0 0 1 -5 5 h-52 a5 5 0 0 1 -5 -5 v-26 a5 5 0 0 1 5 -5 z' " + W + "/>"
      + "<path d='M-16 8 h30' stroke='#fff' stroke-width='2.4' stroke-linecap='round' opacity='.7'/></g>", f);
  };

  ART.welcome = (a, f) => tileFrame(tileColor(a),
    "<path d='M0 -22 L20 -8 L20 12 L0 26 L-20 12 L-20 -8 Z' " + W + "/>"
    + "<path d='M0 -22 L20 -8 M0 26 L0 -2 M-20 -8 L20 -8' stroke='#fff' stroke-width='2.2' opacity='.55' stroke-linecap='round'/>"
    + "<circle cx='0' cy='2' r='" + (5 + GLOW[f] * 4) + "' fill='#fff' opacity='.35'/>", f, { glow: 1 });

  ART.calc = (a, f) => {
    const kx = [-10, 10, -10, 10][f], ky = [6, 6, 18, 18][f];
    return tileFrame(tileColor(a),
      "<path d='M-22 -28 h44 a6 6 0 0 1 6 6 v40 a6 6 0 0 1 -6 6 h-44 a6 6 0 0 1 -6 -6 v-40 a6 6 0 0 1 6 -6 z' " + W + "/>"
      + "<path d='M-14 -18 h28 v10 h-28 z' " + W + "/>"
      + "<circle cx='" + kx + "' cy='" + ky + "' r='5' fill='#fff' opacity='.9'/>"
      + "<path d='M-6 6 h12 M6 6 h12 M-6 18 h12 M6 18 h12' stroke='#fff' stroke-width='2.6' stroke-linecap='round' opacity='.75'/>", f);
  };

  ART.timer = (a, f) => {
    const ang = f * 90;
    return tileFrame(tileColor(a),
      "<circle cx='0' cy='4' r='24' " + W + "/>"
      + "<path d='M-6 -20 v-8 M6 -20 v-8 M-2 -28 h4' " + W + "/>"
      + "<g transform='rotate(" + ang + ")'><path d='M0 4 V-14' " + W + "/></g>"
      + "<circle cx='0' cy='4' r='3' " + F + "/>", f);
  };

  ART.tictactoe = (a, f) => {
    const s = 1 + (f === 2 ? 0.12 : 0);
    return tileFrame(tileColor(a),
      "<path d='M-8 -20 v40 M8 -20 v40 M-20 -8 h40 M-20 8 h40' " + W + "/>"
      + "<g transform='scale(" + s + ")'><path d='M-16 -16 L-4 -4 M-4 -16 L-16 -4' stroke='#fff' stroke-width='4' stroke-linecap='round'/></g>"
      + "<circle cx='16' cy='16' r='7' " + W + "/>", f);
  };

  ART.connect4 = (a, f) => {
    const dy = [-18, -8, 2, 2][f];
    return tileFrame(tileColor(a),
      "<path d='M-24 -8 h48 a5 5 0 0 1 5 5 v28 a5 5 0 0 1 -5 5 h-48 a5 5 0 0 1 -5 -5 v-28 a5 5 0 0 1 5 -5 z' " + W + "/>"
      + "<circle cx='-12' cy='10' r='5' " + F + " opacity='.85'/><circle cx='12' cy='10' r='5' " + F + " opacity='.85'/>"
      + "<circle cx='-12' cy='" + dy + "' r='6' fill='#ffd60a' stroke='#fff' stroke-width='2'/>", f);
  };

  ART.minesweeper = (a, f) => {
    const sp = f % 2 ? 1 : 0.5;
    return tileFrame(tileColor(a),
      "<circle cx='-2' cy='6' r='18' " + W + "/>"
      + "<path d='M12 -8 q6 -10 14 -6' " + W + "/>"
      + "<g transform='translate(22,-16) scale(" + sp + ")'><circle r='5' fill='#ffd60a'/>"
      + "<path d='M-8 0 H8 M0 -8 V8' stroke='#fff' stroke-width='2' stroke-linecap='round'/></g>", f);
  };

  ART.chess = (a, f) => {
    const dy = FLOAT[f];
    return tileFrame(tileColor(a),
      "<g transform='translate(0," + dy + ")'>"
      + "<circle cx='0' cy='-10' r='9' " + W + "/>"
      + "<path d='M-10 2 q-2 14 -6 22 h24 q-4 -8 -6 -22' " + W + "/>"
      + "<path d='M-14 28 h28' " + W + "/></g>", f);
  };

  ART.paint = (a, f) => {
    const dip = Math.sin((f / FR) * Math.PI * 2) * 5;
    return tileFrame(tileColor(a),
      "<path d='M-20 8 c-16 0 -24 8 -24 18 c0 10 10 16 22 16 c6 0 6 -6 2 -10 c-4 -4 0 -10 6 -10 c8 0 18 2 24 -6 c4 -6 0 -18 -30 -18 z' " + W + "/>"
      + "<circle cx='-6' cy='14' r='3' " + F + "/><circle cx='6' cy='6' r='3' " + F + "/><circle cx='14' cy='14' r='3' " + F + "/>"
      + "<g transform='translate(20," + (-8 + dip) + ") rotate(35)'>"
      + "<path d='M0 -14 v16 M-3 -2 h6 l-1 4 h-4 z' " + W + "/></g>", f);
  };

  ART.fortune = (a, f) => {
    const o = [0, 4, 8, 6][f];
    return tileFrame('#ff9f0a',
      "<path d='M-22 10 a22 18 0 0 1 44 0 l-6 6 a16 14 0 0 0 -32 0 z' " + W + "/>"
      + "<g transform='translate(" + o + ",0)'><path d='M8 -6 h18 v8 l-18 4 z' " + W + "/></g>", f);
  };

  ART.guestbook = (a, f) => tileFrame(tileColor(a),
    "<path d='M-22 -12 Q-4 -22 0 -12 L0 18 Q-18 8 -22 -12 Z' " + W + "/>"
    + "<path d='M22 -12 Q4 -22 0 -12 L0 18 Q18 8 22 -12 Z' " + W + "/>"
    + "<path d='M-4 0 C-10 -4 -6 -12 0 -8 C6 -12 10 -4 4 0 C0 4 -4 0 Z' fill='#ff453a' opacity='.9'/>", f);

  ART.chat = (a, f) => {
    const dot = f % 3;
    return tileFrame(tileColor(a),
      "<path d='M-24 -18 h40 a5 5 0 0 1 5 5 v16 a5 5 0 0 1 -5 5 h-24 l-10 8 v-8 h-6 a5 5 0 0 1 -5 -5 v-16 a5 5 0 0 1 5 -5 z' " + W + "/>"
      + [0, 1, 2].map((i) => "<circle cx='" + (-10 + i * 10) + "' cy='-6' r='" + (dot === i ? 3.5 : 2) + "' " + F + "/>").join('')
      + "<path d='M8 10 h22 a4 4 0 0 1 4 4 v10 a4 4 0 0 1 -4 4 h-6 l6 6 v-6 h-4 a4 4 0 0 1 -4 -4 v-10 a4 4 0 0 1 4 -4 z' " + W + " opacity='.85'/>", f);
  };

  ART.chest = (a, f) => {
    const lift = [0, 2, 4, 3][f];
    return tileFrame('#bf8f4a',
      "<g transform='translate(0," + (-lift) + ")'><path d='M-22 -6 v-10 q0 -14 22 -14 q22 0 22 14 v10' " + W + "/></g>"
      + "<path d='M-24 -2 h48 v24 a4 4 0 0 1 -4 4 h-40 a4 4 0 0 1 -4 -4 z' " + W + "/>"
      + "<path d='M-6 -2 v10' " + W + "/>", f);
  };

  ART.imposter = (a, f) => {
    const hop = [0, -2, 0, -1][f];
    return tileFrame(tileColor(a),
      "<path d='M-26 14 q0 -12 10 -12 q10 0 10 12 v8 h-20 z' " + W + " opacity='.8'/>"
      + "<g transform='translate(0," + hop + ")'><path d='M-8 14 q0 -14 8 -14 q8 0 8 14 v10 h-16 z' " + W + "/>"
      + "<circle cx='-3' cy='2' r='2' " + F + "/><circle cx='3' cy='2' r='2' " + F + "/></g>"
      + "<path d='M10 14 q0 -11 9 -11 q9 0 9 11 v7 h-18 z' " + W + " opacity='.8'/>", f);
  };

  ART.spy = (a, f) => {
    const mx = [-4, 0, 4, 2][f];
    return tileFrame(tileColor(a),
      "<g transform='translate(" + mx + ",0)'>"
      + "<circle cx='0' cy='0' r='16' " + W + "/>"
      + "<path d='M10 10 L24 24' " + W + "/>"
      + "<path d='M-6 -4 a10 10 0 0 1 8 -6' stroke='#fff' stroke-width='2.2' stroke-linecap='round' opacity='.65'/></g>", f);
  };

  ART.tilt = (a, f) => {
    const rot = [-14, -6, 6, 12][f];
    return tileFrame(tileColor(a),
      "<g transform='rotate(" + rot + ")'>"
      + "<path d='M-14 -26 h28 a5 5 0 0 1 5 5 v44 a5 5 0 0 1 -5 5 h-28 a5 5 0 0 1 -5 -5 v-44 a5 5 0 0 1 5 -5 z' " + W + "/>"
      + "<path d='M-6 -20 h12' " + W + "/></g>"
      + "<circle cx='0' cy='18' r='5' fill='#ffd60a' stroke='#fff' stroke-width='2'/>", f);
  };

  ART.dial = (a, f) => {
    const ang = [-50, -15, 20, 45][f];
    return tileFrame(tileColor(a),
      "<path d='M-24 14 a24 24 0 0 1 48 0' " + W + "/>"
      + "<g transform='rotate(" + ang + ")'><path d='M0 14 V-16' " + W + "/></g>"
      + "<circle cx='0' cy='14' r='4' " + F + "/>", f);
  };

  ART.roulette = (a, f) => {
    const pop = [0, -3, -6, -4][f];
    return tileFrame(tileColor(a),
      "<g transform='rotate(-8)'><path d='M-14 -20 h24 a3 3 0 0 1 3 3 v34 a3 3 0 0 1 -3 3 h-24 a3 3 0 0 1 -3 -3 v-34 a3 3 0 0 1 3 -3 z' " + W + " opacity='.75'/></g>"
      + "<g transform='translate(0," + pop + ") rotate(6)'>"
      + "<path d='M-2 -24 h24 a3 3 0 0 1 3 3 v34 a3 3 0 0 1 -3 3 h-24 a3 3 0 0 1 -3 -3 v-34 a3 3 0 0 1 3 -3 z' " + W + "/>"
      + "<path d='M10 -8 v14' stroke='#fff' stroke-width='4' stroke-linecap='round'/></g>", f);
  };

  ART.fakefacts = (a, f) => {
    const nose = [8, 14, 22, 16][f];
    return tileFrame(tileColor(a),
      "<circle cx='-6' cy='0' r='18' " + W + "/>"
      + "<circle cx='-12' cy='-4' r='2.5' " + F + "/><circle cx='0' cy='-4' r='2.5' " + F + "/>"
      + "<path d='M8 0 h" + nose + "' stroke='#fff' stroke-width='4' stroke-linecap='round'/>", f);
  };

  ART.oneclue = (a, f) => tileFrame(tileColor(a),
    "<path d='M0 -22 a18 18 0 0 1 8 34 q-2 2 -2 8 h-12 q0 -6 -2 -8 a18 18 0 0 1 8 -34 z' " + W + "/>"
    + "<path d='M-6 28 h12 M-4 34 h8' " + W + "/>"
    + (f < 3 ? "<path d='M-18 -18 l6 6 M18 -18 l-6 6 M0 -30 v8' " + W + " opacity='.7'/>" : ''), f, { glow: f < 3 ? 1 : 0 });

  ART.samebrain = (a, f) => tileFrame(tileColor(a),
    "<circle cx='-14' cy='4' r='14' " + W + "/>"
    + "<circle cx='14' cy='4' r='14' " + W + "/>"
    + "<circle cx='0' cy='-18' r='" + (5 + f) + "' fill='#ffd60a' opacity='.85'/>"
    + "<path d='M-20 6 a3 3 0 1 0 6 0 M-8 6 a3 3 0 1 0 6 0 M8 6 a3 3 0 1 0 6 0 M20 6 a3 3 0 1 0 6 0' " + F + "/>", f);

  ART.wolves = (a, f) => {
    const tilt = [-4, -6, -8, -5][f];
    return tileFrame('#5856d6',
      "<g transform='rotate(" + tilt + "  -8 10)'>"
      + "<path d='M-20 16 q-2 -18 10 -26 l-4 -10 8 6 q6 -4 12 -4 l6 -8 4 10 q12 8 10 24 l-6 14 z' fill='#fff' opacity='.95'/>"
      + "<path d='M4 -6 q8 -6 12 -14' stroke='#2b2b3a' stroke-width='2.5' stroke-linecap='round' fill='none'/></g>"
      + "<circle cx='22' cy='-20' r='8' fill='#ffd60a' opacity='.75'/>", f);
  };

  function fallbackArt(letter, a, f) {
    return tileFrame(tileColor(a),
      "<text x='0' y='10' font-family='-apple-system,BlinkMacSystemFont,system-ui,sans-serif' font-size='38' font-weight='600' fill='#fff' text-anchor='middle'>" + letter + '</text>', f);
  }

  GifOS.iconPacks.register('aurora', {
    size: SIZE, frames: FR, delayCs: DELAY, dither: 6,
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