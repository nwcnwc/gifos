/*
 * gifos-pack-aurora.js — "Aurora", the flagship icon pack (gifos.app default).
 *
 * Premium holographic glass: every app is a floating glass slab with an
 * iridescent sheen, a soft accent aura, a light-band that sweeps across the
 * surface, and a clean white line-glyph for the app itself. Folders are glass
 * folder silhouettes. Six frames of slow shimmer — expensive-feeling motion,
 * demographically unmarked, made to look like a product, not a toy.
 *
 * Procedural SVG throughout, so the whole pack is a single small file. The
 * pack contract (see gifos-icons.js) means this can later be swapped for
 * baked AI renders without touching anything else.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  if (!GifOS.iconPacks) return;

  const FR = 6, SIZE = 96, DELAY = 12;
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const clamp = (n) => Math.max(0, Math.min(255, n | 0));
  const rgb = (a) => 'rgb(' + a[0] + ',' + a[1] + ',' + a[2] + ')';
  const light = (a, d) => 'rgb(' + clamp(a[0] + d) + ',' + clamp(a[1] + d) + ',' + clamp(a[2] + d) + ')';

  // Motion tables — one entry per frame. Gentle float, breathing aura, a light
  // band that traverses the slab, and a glint that pops mid-loop.
  const FLOAT = [0, -0.6, -1.1, -1.3, -1.0, -0.4];
  const AURA = [0.40, 0.46, 0.52, 0.55, 0.50, 0.44];
  const SWEEP = [-38, -12, 14, 40, 66, 92];
  const GLINT = [0, 0.35, 1, 0.7, 0.25, 0];

  // The two glass silhouettes: the app slab and the folder. (Path form so the
  // same 'd' can be filled, stroked, clipped and blurred for the aura.)
  const SLAB = 'M38 20 h20 a18 18 0 0 1 18 18 v20 a18 18 0 0 1 -18 18 h-20 a18 18 0 0 1 -18 -18 v-20 a18 18 0 0 1 18 -18 z';
  const FOLDER = 'M27 30 h13 l6 6 h23 a7 7 0 0 1 7 7 v24 a7 7 0 0 1 -7 7 h-42 a7 7 0 0 1 -7 -7 v-30 a7 7 0 0 1 7 -7 z';

  // ---- glyphs: white line art, centered on the slab ------------------------
  // Stroke attributes are applied by the frame composer; glyphs only add
  // fill='#fff' stroke='none' for the few solid marks (dots, flags, sparkles).
  const SOLID = "fill='#fff' stroke='none'";
  const GLYPHS = {
    notes: "<path d='M39 58.5 L56.5 41 l4.5 4.5 L43.5 63 l-7.5 3 z'/><path d='M37 69 h22'/>",
    tictactoe: "<path d='M42.5 36.5 v23 M53.5 36.5 v23 M37 42.5 h22 M37 53.5 h22'/><path d='M38.5 38 l3.4 3.4 m0 -3.4 l-3.4 3.4'/><circle cx='58.2' cy='58.2' r='2.6'/>",
    connect4: "<circle cx='38' cy='43.5' r='3.2'/><circle cx='48' cy='43.5' r='3.2'/><circle cx='58' cy='43.5' r='3.2'/><circle cx='48' cy='55.5' r='3.2'/><circle cx='58' cy='55.5' r='3.2'/><circle cx='38' cy='55.5' r='3.2' " + SOLID + "/>",
    minesweeper: "<path d='M45 65 V36'/><path d='M45 37.5 l12.5 4.6 -12.5 4.6 z' " + SOLID + "/><path d='M38.5 65 h13'/>",
    chess: "<circle cx='48' cy='40' r='5.6'/><path d='M44.6 45.6 q-1 9 -4.6 13.4 h16 q-3.6 -4.4 -4.6 -13.4'/><path d='M40 63.5 h16'/>",
    paint: "<ellipse cx='48' cy='50.5' rx='14.5' ry='11'/><circle cx='53' cy='54.5' r='2.5'/><circle cx='42' cy='45.5' r='1.8' " + SOLID + "/><circle cx='49.5' cy='43.8' r='1.8' " + SOLID + "/><circle cx='56' cy='47.5' r='1.8' " + SOLID + "/>",
    calc: "<path d='M42 37.5 v8 M38 41.5 h8'/><path d='M54.5 41.5 h8'/><path d='M38.8 55.3 l6.4 6.4 m0 -6.4 l-6.4 6.4'/><path d='M54.5 58.5 h8'/><circle cx='58.5' cy='54.4' r='1.4' " + SOLID + "/><circle cx='58.5' cy='62.6' r='1.4' " + SOLID + "/>",
    timer: "<circle cx='48' cy='52' r='12.5'/><path d='M48 52 V44.5'/><path d='M48 39.5 v-4 M44.5 35.5 h7'/><path d='M57.4 42.6 l3 -3'/>",
    fortune: "<path d='M35.5 54 q12.5 -16 25 0'/><path d='M35.5 54 q12.5 11.5 25 0'/><path d='M45 34.5 h6 v8.5 h-6 z'/>",
    guestbook: "<path d='M33.5 41 q7.2 -4.4 14.5 0 v21 q-7.3 -4.4 -14.5 0 z'/><path d='M62.5 41 q-7.2 -4.4 -14.5 0 v21 q7.3 -4.4 14.5 0 z'/>",
    chat: "<path d='M35 37.5 h26 q4 0 4 4 v9.5 q0 4 -4 4 h-15.5 l-8 7 v-7 h-2.5 q-4 0 -4 -4 v-9.5 q0 -4 4 -4 z'/><circle cx='42.5' cy='46.2' r='1.7' " + SOLID + "/><circle cx='48' cy='46.2' r='1.7' " + SOLID + "/><circle cx='53.5' cy='46.2' r='1.7' " + SOLID + "/>",
    folder: "<path d='M38 52.5 h20 M38 59.5 h14'/>",
    chest: "<path d='M35.5 49 h25 v14.5 h-25 z'/><path d='M35.5 49 a12.5 8.5 0 0 1 25 0'/><path d='M45.6 52.6 h4.8 v4.8 h-4.8 z'/>",
    video: "<path d='M31.5 42 h20 q3 0 3 3 v13.5 q0 3 -3 3 h-20 q-3 0 -3 -3 v-13.5 q0 -3 3 -3 z'/><path d='M57.5 48 l9.5 -4.8 v17 l-9.5 -4.8'/><circle cx='38' cy='47.4' r='1.8' " + SOLID + "/>",
    imposter: "<path d='M38 39 h20 v8.6 q0 11 -10 14.4 q-10 -3.4 -10 -14.4 z'/><path d='M42.6 46 h4 M49.4 46 h4'/>",
    spy: "<circle cx='45' cy='46' r='9'/><path d='M51.6 52.6 l8.4 8.4'/>",
    tilt: "<rect x='40.5' y='36' width='15' height='25' rx='3' transform='rotate(10 48 48.5)'/><path d='M33.5 60 q-3.6 -6.5 0.8 -12 M62.5 60 q3.6 -6.5 -0.8 -12'/>",
    dial: "<path d='M35.5 58 a12.5 12.5 0 0 1 25 0'/><path d='M48 58 L56 48'/><circle cx='48' cy='58' r='2.2' " + SOLID + "/><path d='M37.8 49.8 l-2.4 -2 M58.2 49.8 l2.4 -2'/>",
    roulette: "<rect x='36' y='42' width='16.5' height='23' rx='3'/><rect x='42' y='37.5' width='16.5' height='23' rx='3'/><path d='M50.2 44.5 v7'/><circle cx='50.2' cy='56' r='1.4' " + SOLID + "/>",
    fakefacts: "<circle cx='43' cy='48' r='9.5'/><path d='M52.8 48 h12.5'/><circle cx='40' cy='45.8' r='1.5' " + SOLID + "/>",
    oneclue: "<circle cx='48' cy='45' r='8.5'/><path d='M44.5 53.8 v3.7 h7 v-3.7'/><path d='M48 32.5 v-3.5 M37.4 36.4 l-2.6 -2.6 M58.6 36.4 l2.6 -2.6'/>",
    samebrain: "<circle cx='42.5' cy='49' r='9'/><circle cx='53.5' cy='49' r='9'/>",
    wolves: "<path d='M53 34.5 a13 13 0 1 0 8.6 22 a10.5 10.5 0 1 1 -8.6 -22 z' " + SOLID + " opacity='.95'/><circle cx='37.5' cy='40' r='1.4' " + SOLID + "/><circle cx='42' cy='58' r='1.1' " + SOLID + "/>",
    welcome: "<path d='M48 35.5 l3.3 9.2 9.2 3.3 -9.2 3.3 -3.3 9.2 -3.3 -9.2 -9.2 -3.3 9.2 -3.3 z' " + SOLID + "/><circle cx='61.5' cy='38.5' r='1.6' " + SOLID + "/><circle cx='35.5' cy='58.5' r='1.3' " + SOLID + "/>",
  };

  // Compose ONE frame: shape silhouette + glass layers + glyph + motion.
  function frame(shapeD, glyph, accent, f) {
    // The iridescent gradient's axis slowly rotates — the holographic shimmer.
    const ang = (135 + f * 10) * Math.PI / 180;
    const gx1 = 0.5 - 0.5 * Math.cos(ang), gy1 = 0.5 - 0.5 * Math.sin(ang);
    const gx2 = 0.5 + 0.5 * Math.cos(ang), gy2 = 0.5 + 0.5 * Math.sin(ang);
    return "<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'>"
      + '<defs>'
      + "<linearGradient id='glass' x1='0' y1='0' x2='0' y2='1'>"
      + "<stop offset='0' stop-color='#ffffff' stop-opacity='.32'/><stop offset='1' stop-color='#ffffff' stop-opacity='.06'/></linearGradient>"
      + "<linearGradient id='iri' x1='" + gx1 + "' y1='" + gy1 + "' x2='" + gx2 + "' y2='" + gy2 + "'>"
      + "<stop offset='0' stop-color='#8f6bff' stop-opacity='.5'/>"
      + "<stop offset='.5' stop-color='#4dd6ff' stop-opacity='.32'/>"
      + "<stop offset='1' stop-color='#ff5cc8' stop-opacity='.45'/></linearGradient>"
      + "<linearGradient id='band' x1='0' y1='0' x2='1' y2='0'>"
      + "<stop offset='0' stop-color='#fff' stop-opacity='0'/><stop offset='.5' stop-color='#fff' stop-opacity='.5'/>"
      + "<stop offset='1' stop-color='#fff' stop-opacity='0'/></linearGradient>"
      + "<clipPath id='clip'><path d='" + shapeD + "'/></clipPath>"
      + "<filter id='aura' x='-40%' y='-40%' width='180%' height='180%'><feGaussianBlur stdDeviation='5'/></filter>"
      + "<filter id='soft' x='-40%' y='-40%' width='180%' height='180%'><feGaussianBlur stdDeviation='2.4'/></filter>"
      + '</defs>'
      + "<g transform='translate(0," + FLOAT[f] + ")'>"
      // accent aura — the app's color, breathing
      + "<path d='" + shapeD + "' fill='" + rgb(accent) + "' filter='url(#aura)' opacity='" + AURA[f] + "'/>"
      // the glass: base gradient + rotating iridescent sheen
      + "<path d='" + shapeD + "' fill='url(#glass)'/>"
      + "<path d='" + shapeD + "' fill='url(#iri)'/>"
      + "<g clip-path='url(#clip)'>"
      + "<ellipse cx='39' cy='26' rx='21' ry='8' fill='#fff' opacity='.42' filter='url(#soft)'/>"
      + "<rect x='" + SWEEP[f] + "' y='2' width='15' height='92' fill='url(#band)' opacity='.55' transform='rotate(-24 48 48)'/>"
      + "<rect x='18' y='56' width='60' height='22' fill='#fff' opacity='.05'/>"
      + '</g>'
      // crisp rim
      + "<path d='" + shapeD + "' fill='none' stroke='rgba(255,255,255,.62)' stroke-width='1.6'/>"
      // glyph: accent under-glow, then clean white lines
      + "<g stroke='" + light(accent, 70) + "' stroke-width='6.5' fill='none' stroke-linecap='round' stroke-linejoin='round' filter='url(#soft)' opacity='.55'>" + glyph + '</g>'
      + "<g stroke='#fff' stroke-width='3.6' fill='none' stroke-linecap='round' stroke-linejoin='round'>" + glyph + '</g>'
      // corner glint
      + "<path d='M71 18.5 l1.8 4.7 4.7 1.8 -4.7 1.8 -1.8 4.7 -1.8 -4.7 -4.7 -1.8 4.7 -1.8 z' fill='#fff' opacity='" + GLINT[f] + "'/>"
      + '</g></svg>';
  }

  GifOS.iconPacks.register('aurora', {
    size: SIZE, frames: FR, delayCs: DELAY,
    draw(subject, accent) {
      const glyph = GLYPHS[subject];
      if (!glyph) return null;
      const shape = subject === 'folder' ? FOLDER : SLAB;
      return range(FR).map((f) => frame(shape, glyph, accent, f));
    },
    fallback(letter, accent) {
      const glyph = "<text x='48' y='59.5' font-family='system-ui,sans-serif' font-size='30' font-weight='700' fill='#fff' stroke='none' text-anchor='middle'>" + letter + '</text>';
      return range(FR).map((f) => frame(SLAB, glyph, accent, f));
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
