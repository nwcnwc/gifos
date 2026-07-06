/*
 * gifos-icons.js — Custom, hand-designed animated artwork for each app,
 * rasterized (canvas) into GIF frames with an adaptive palette so the real
 * colors survive. This is NOT a procedural icon generator — each app has its
 * own drawn SVG. The result is packed into the app's GIF and displayed as-is.
 *
 * Style: cute outlined "sticker" characters — thick ink outlines, kawaii
 * faces, a little grass mound to stand on, a cream die-cut rim, and a fully
 * TRANSPARENT background (the GIF's palette index 0 is transparent), so the
 * icons float on any wallpaper like stickers.
 *
 * Browser-only (needs canvas). Attaches to `GifOS.icons`.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  const S = 64;            // icon size (matches the desktop's default icon px)
  const FR = 4;            // animation frames — small, to keep App GIFs light
  const DELAY = 13;        // centiseconds per frame

  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const clamp = (n) => Math.max(0, Math.min(255, n | 0));
  const rgb = (a) => 'rgb(' + a[0] + ',' + a[1] + ',' + a[2] + ')';
  const dark = (a, d) => 'rgb(' + clamp(a[0] - d) + ',' + clamp(a[1] - d) + ',' + clamp(a[2] - d) + ')';

  const INK = '#2b2440';   // outline ink
  const PAPER = '#fffdf2'; // warm white bodies
  const RIM = '#f4f0e6';   // die-cut sticker rim

  // No background tile: art floats on transparency. A feMorphology dilate
  // paints the cream die-cut rim around whatever is drawn, so stickers read
  // on any wallpaper — light, dark, or a photo.
  function sticker(inner) {
    return "<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'>"
      + "<defs><filter id='die' x='-12%' y='-12%' width='124%' height='124%'>"
      + "<feMorphology in='SourceAlpha' operator='dilate' radius='2.2' result='fat'/>"
      + "<feFlood flood-color='" + RIM + "'/><feComposite in2='fat' operator='in' result='rim'/>"
      + "<feMerge><feMergeNode in='rim'/><feMergeNode in='SourceGraphic'/></feMerge>"
      + "</filter></defs><g filter='url(#die)'>"
      // fill the canvas: scale up around the ground line so stickers sit big
      + "<g transform='translate(48,91) scale(1.18) translate(-48,-91)'>" + inner + "</g></g></svg>";
  }

  // The little grass mound every character stands on.
  function ground() {
    return "<ellipse cx='48' cy='83' rx='27' ry='7' fill='#8edc73' stroke='" + INK + "' stroke-width='3'/>"
      + "<path d='M33 80 q1.5 -4.5 3 0 M60 81 q1.5 -4.5 3 0' stroke='#4f9e43' stroke-width='2.4' fill='none' stroke-linecap='round'/>";
  }

  // A kawaii face: dot eyes (curved shut when blinking), a smile, pink cheeks.
  function face(x, y, blink, col, cheekDx) {
    col = col || INK; cheekDx = cheekDx || 9;
    const eyes = blink
      ? "<path d='M" + (x - 7.5) + " " + y + " q3 2.4 6 0 M" + (x + 1.5) + " " + y + " q3 2.4 6 0' stroke='" + col + "' stroke-width='2.4' fill='none' stroke-linecap='round'/>"
      : "<circle cx='" + (x - 4.5) + "' cy='" + y + "' r='2.3' fill='" + col + "'/><circle cx='" + (x + 4.5) + "' cy='" + y + "' r='2.3' fill='" + col + "'/>";
    return eyes
      + "<path d='M" + (x - 3) + " " + (y + 5.5) + " q3 3.4 6 0' stroke='" + col + "' stroke-width='2.2' fill='none' stroke-linecap='round'/>"
      + "<circle cx='" + (x - cheekDx) + "' cy='" + (y + 4) + "' r='2.2' fill='#ff9eb0' opacity='.75'/>"
      + "<circle cx='" + (x + cheekDx) + "' cy='" + (y + 4) + "' r='2.2' fill='#ff9eb0' opacity='.75'/>";
  }

  const bob = (f) => [0, -2, -3, -2][f % 4]; // gentle idle hop
  const blinkAt = (f) => f === 3;            // everyone blinks on the last frame

  // ---- per-app art: (accent) => [svg frame strings] -----------------------
  const ART = {
    // A happy spiral notepad; a pencil hops along as the accent line is written.
    notes: (a) => range(FR).map((f) => { const dy = bob(f), w = 6 + 16 * (f / (FR - 1));
      return sticker(ground()
        + "<g transform='translate(0," + dy + ")'>"
        + "<rect x='30' y='30' width='36' height='46' rx='6' fill='" + PAPER + "' stroke='" + INK + "' stroke-width='3'/>"
        + "<circle cx='38' cy='30' r='2.6' fill='#e8e4f5' stroke='" + INK + "' stroke-width='2'/>"
        + "<circle cx='48' cy='30' r='2.6' fill='#e8e4f5' stroke='" + INK + "' stroke-width='2'/>"
        + "<circle cx='58' cy='30' r='2.6' fill='#e8e4f5' stroke='" + INK + "' stroke-width='2'/>"
        + "<rect x='37' y='40' width='22' height='3.5' rx='1.75' fill='#ddd8ec'/>"
        + "<rect x='37' y='47' width='" + w + "' height='3.5' rx='1.75' fill='" + rgb(a) + "'/>"
        + face(48, 62, blinkAt(f))
        + "</g>"
        + "<g transform='translate(" + (39 + w) + "," + (46 + dy) + ") rotate(38)'>"
        + "<rect x='-2.5' y='-16' width='5' height='13' rx='1.5' fill='#ffd23c' stroke='" + INK + "' stroke-width='2'/>"
        + "<path d='M-2.5 -3 L2.5 -3 L0 2 Z' fill='" + INK + "'/></g>");
    }),

    // A board where the X and the O take turns bouncing with excitement.
    tictactoe: (a) => range(FR).map((f) => { const dy = bob(f), on = f % 2 === 0;
      const px = on ? 1.25 : 1, po = on ? 1 : .45, ox = !on ? 1.25 : 1, oo = !on ? 1 : .45;
      return sticker(ground()
        + "<g transform='translate(0," + dy + ")'>"
        + "<rect x='28' y='36' width='40' height='40' rx='9' fill='" + PAPER + "' stroke='" + INK + "' stroke-width='3'/>"
        + "<g stroke='" + INK + "' stroke-width='2.6' stroke-linecap='round' opacity='.9'>"
        + "<line x1='41.3' y1='41' x2='41.3' y2='71'/><line x1='54.6' y1='41' x2='54.6' y2='71'/>"
        + "<line x1='33' y1='49.3' x2='63' y2='49.3'/><line x1='33' y1='62.6' x2='63' y2='62.6'/></g>"
        + "<g transform='translate(35,43) scale(" + px + ")' stroke='#ff6b6b' stroke-width='3.4' stroke-linecap='round' opacity='" + po + "'>"
        + "<line x1='-3.6' y1='-3.6' x2='3.6' y2='3.6'/><line x1='3.6' y1='-3.6' x2='-3.6' y2='3.6'/></g>"
        + "<circle cx='48' cy='56' r='" + (4 * ox) + "' fill='none' stroke='#4dabf7' stroke-width='3.4' opacity='" + oo + "'/>"
        + "</g>");
    }),

    // A smiling red disc drops into the board and settles in the top hole.
    connect4: (a) => range(FR).map((f) => { const dropY = [25, 33, 42, 52][f]; const landed = f === 3;
      const holes = [];
      for (const cx of [36, 48, 60]) holes.push("<circle cx='" + cx + "' cy='52' r='5' fill='" + PAPER + "' stroke='" + INK + "' stroke-width='2.2'/>");
      for (const cx of [48, 60]) holes.push("<circle cx='" + cx + "' cy='66' r='5' fill='" + PAPER + "' stroke='" + INK + "' stroke-width='2.2'/>");
      holes.push("<circle cx='36' cy='66' r='5' fill='#ffd23c' stroke='" + INK + "' stroke-width='2.2'/>");
      const disc = landed
        ? "<circle cx='36' cy='52' r='5' fill='#ff6b6b' stroke='" + INK + "' stroke-width='2.2'/>"
        : "<g transform='translate(36," + dropY + ")'><circle r='7' fill='#ff6b6b' stroke='" + INK + "' stroke-width='2.6'/>"
          + "<circle cx='-2.6' cy='-1' r='1.5' fill='" + INK + "'/><circle cx='2.6' cy='-1' r='1.5' fill='" + INK + "'/>"
          + "<path d='M-2 2.2 q2 2.2 4 0' stroke='" + INK + "' stroke-width='1.8' fill='none' stroke-linecap='round'/></g>";
      return sticker(ground()
        + (landed ? '' : disc)
        + "<rect x='26' y='42' width='44' height='34' rx='7' fill='" + rgb(a) + "' stroke='" + INK + "' stroke-width='3'/>"
        + holes.join('') + (landed ? disc : ''));
    }),

    // A round bomb buddy, totally unbothered, spark fizzing on its fuse.
    minesweeper: (a) => range(FR).map((f) => { const dy = bob(f), s = f % 2 ? 5 : 3, o = f % 2 ? 1 : .55;
      return sticker(ground()
        + "<g transform='translate(0," + dy + ")'>"
        + "<circle cx='46' cy='59' r='17' fill='#443d63' stroke='" + INK + "' stroke-width='3'/>"
        + "<circle cx='39' cy='51' r='3.4' fill='rgba(255,255,255,.35)'/>"
        + "<path d='M56 46 q6 -8 12 -6' stroke='" + INK + "' stroke-width='3' fill='none' stroke-linecap='round'/>"
        + face(46, 58, blinkAt(f), PAPER, 10)
        + "</g>"
        + "<g transform='translate(69," + (39 + dy) + ")' opacity='" + o + "'>"
        + "<circle r='" + (s + 2) + "' fill='#ff8f3c' opacity='.5'/><circle r='" + s + "' fill='#ffd23c'/>"
        + "<path d='M-" + (s + 4) + " 0 H" + (s + 4) + " M0 -" + (s + 4) + " V" + (s + 4) + "' stroke='#ffd23c' stroke-width='2' stroke-linecap='round'/></g>");
    }),

    // A pawn pal with a proper base, hopping in place.
    chess: (a) => range(FR).map((f) => { const dy = bob(f);
      return sticker(ground()
        + "<g transform='translate(0," + dy + ")'>"
        + "<path d='M43 51 L39.5 70 h17 L52.5 51 Z' fill='" + PAPER + "' stroke='" + INK + "' stroke-width='3' stroke-linejoin='round'/>"
        + "<rect x='40' y='47' width='16' height='5' rx='2.5' fill='" + PAPER + "' stroke='" + INK + "' stroke-width='2.4'/>"
        + "<circle cx='48' cy='38' r='9.5' fill='" + PAPER + "' stroke='" + INK + "' stroke-width='3'/>"
        + face(48, 37, blinkAt(f), INK, 8)
        + "</g>"
        + "<rect x='34' y='70' width='28' height='8' rx='3.5' fill='" + rgb(a) + "' stroke='" + INK + "' stroke-width='3'/>");
    }),

    // A palette on the grass; a brush bounces above, flicking a paint drop.
    paint: (a) => range(FR).map((f) => { const bdy = Math.abs(Math.sin((f / FR) * 6.28)) * 4;
      const drip = f > 0 ? "<circle cx='71' cy='" + (40 + f * 8) + "' r='2.4' fill='" + rgb(a) + "' opacity='" + (1 - f * .22) + "'/>" : '';
      return sticker(ground()
        + "<ellipse cx='46' cy='60' rx='22' ry='16' fill='" + PAPER + "' stroke='" + INK + "' stroke-width='3'/>"
        + "<circle cx='54' cy='65' r='4' fill='none' stroke='" + INK + "' stroke-width='2.4'/>"
        + "<circle cx='36' cy='53' r='3.4' fill='#ff6b6b' stroke='" + INK + "' stroke-width='1.8'/>"
        + "<circle cx='46' cy='50' r='3.4' fill='#4dabf7' stroke='" + INK + "' stroke-width='1.8'/>"
        + "<circle cx='56' cy='53' r='3.4' fill='#ffd23c' stroke='" + INK + "' stroke-width='1.8'/>"
        + "<circle cx='36' cy='63' r='3.4' fill='#7bd96a' stroke='" + INK + "' stroke-width='1.8'/>"
        + "<g transform='translate(66," + (36 - bdy) + ") rotate(32)'>"
        + "<rect x='-2.5' y='-4' width='5' height='16' rx='2' fill='#e8a34e' stroke='" + INK + "' stroke-width='2'/>"
        + "<rect x='-3' y='-9' width='6' height='5' rx='1' fill='#c9c9d9' stroke='" + INK + "' stroke-width='1.8'/>"
        + "<path d='M-3 -9 q3 -8 6 0 Z' fill='" + rgb(a) + "' stroke='" + INK + "' stroke-width='1.8' stroke-linejoin='round'/></g>"
        + drip);
    }),

    // A calculator whose screen IS its face; buttons twinkle below.
    calc: (a) => range(FR).map((f) => { const dy = bob(f), lit = f % FR;
      const btn = []; let i = 0;
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++, i++)
        btn.push("<rect x='" + (37.5 + c * 7.5) + "' y='" + (52 + r * 7.5) + "' width='5.5' height='5.5' rx='1.8' fill='" + (i === lit * 2 % 9 ? '#ffd23c' : PAPER) + "' stroke='" + INK + "' stroke-width='1.6'/>");
      const blink = blinkAt(f);
      const eyes = blink
        ? "<path d='M42 40 q2.4 2 4.8 0 M49.2 40 q2.4 2 4.8 0' stroke='" + INK + "' stroke-width='2' fill='none' stroke-linecap='round'/>"
        : "<circle cx='44.5' cy='40' r='1.9' fill='" + INK + "'/><circle cx='51.5' cy='40' r='1.9' fill='" + INK + "'/>";
      return sticker(ground()
        + "<g transform='translate(0," + dy + ")'>"
        + "<rect x='32' y='28' width='32' height='48' rx='7' fill='" + rgb(a) + "' stroke='" + INK + "' stroke-width='3'/>"
        + "<rect x='37' y='33' width='22' height='14' rx='3.5' fill='#d6f5c3' stroke='" + INK + "' stroke-width='2.4'/>"
        + eyes
        + "<path d='M45.5 43.5 q2.5 2.4 5 0' stroke='" + INK + "' stroke-width='1.8' fill='none' stroke-linecap='round'/>"
        + btn.join('') + "</g>");
    }),

    // A classic twin-bell alarm clock, ringing so hard it wiggles.
    timer: (a) => range(FR).map((f) => { const wig = [-4, 4, -4, 4][f], ang = f * 90;
      return sticker(ground()
        + "<g transform='rotate(" + wig + " 48 74)'>"
        + "<path d='M39 71 L34 78 M57 71 L62 78' stroke='" + INK + "' stroke-width='3.4' stroke-linecap='round'/>"
        + "<circle cx='36' cy='34' r='5.5' fill='#ffd23c' stroke='" + INK + "' stroke-width='2.6'/>"
        + "<circle cx='60' cy='34' r='5.5' fill='#ffd23c' stroke='" + INK + "' stroke-width='2.6'/>"
        + "<circle cx='48' cy='55' r='19' fill='" + PAPER + "' stroke='" + INK + "' stroke-width='3'/>"
        + "<line x1='48' y1='55' x2='48' y2='44' stroke='#ff6b6b' stroke-width='3' stroke-linecap='round' transform='rotate(" + ang + " 48 55)'/>"
        + "<circle cx='48' cy='55' r='2.4' fill='" + INK + "'/>"
        + face(48, 62, blinkAt(f), INK, 8)
        + "</g>");
    }),

    // An open book with a beating heart on the page; a pen hops as it signs.
    guestbook: (a) => range(FR).map((f) => { const pdy = Math.abs(Math.sin((f / FR) * 6.28)) * 4;
      const hs = f % 2 ? 1.18 : 1;
      return sticker(ground()
        + "<path d='M26 44 Q37 38 48 44 V76 Q37 70 26 76 Z' fill='" + PAPER + "' stroke='" + INK + "' stroke-width='3' stroke-linejoin='round'/>"
        + "<path d='M70 44 Q59 38 48 44 V76 Q59 70 70 76 Z' fill='#f1ecdf' stroke='" + INK + "' stroke-width='3' stroke-linejoin='round'/>"
        + "<line x1='48' y1='44' x2='48' y2='76' stroke='" + INK + "' stroke-width='2'/>"
        + "<g transform='translate(37,56) scale(" + hs + ")'>"
        + "<path d='M0 6 C-6 1 -5 -5 0 -3 C5 -5 6 1 0 6 Z' fill='#ff6b6b' stroke='" + INK + "' stroke-width='2' stroke-linejoin='round'/></g>"
        + "<path d='M54 55 h10 M54 61 h8' stroke='#ddd8ec' stroke-width='2.6' stroke-linecap='round'/>"
        + "<g transform='translate(62," + (44 - pdy) + ") rotate(35)'>"
        + "<rect x='-2' y='-14' width='4' height='12' rx='1.5' fill='" + rgb(a) + "' stroke='" + INK + "' stroke-width='2'/>"
        + "<path d='M-2 -2 L2 -2 L0 3 Z' fill='" + INK + "'/></g>");
    }),

    // Two bubble buddies chatting — the typing dots do the wave.
    chat: (a) => range(FR).map((f) => { const dy = bob(f);
      const dots = [36, 44, 52].map((x, i) =>
        "<circle cx='" + x + "' cy='45' r='3' fill='" + ((f % 3) === i ? rgb(a) : '#d8d2ea') + "'/>").join('');
      return sticker(ground()
        + "<g transform='translate(0," + dy + ")'>"
        + "<rect x='24' y='32' width='40' height='26' rx='10' fill='" + PAPER + "' stroke='" + INK + "' stroke-width='3'/>"
        + "<path d='M33 56 l-3 9 l10 -7' fill='" + PAPER + "' stroke='" + INK + "' stroke-width='2.6' stroke-linejoin='round'/>"
        + "<rect x='31' y='55' width='12' height='3' fill='" + PAPER + "'/>"
        + dots + "</g>"
        + "<g transform='translate(0," + (-dy) + ")'>"
        + "<rect x='52' y='56' width='26' height='18' rx='8' fill='" + rgb(a) + "' stroke='" + INK + "' stroke-width='3'/>"
        + "<circle cx='61' cy='63' r='1.8' fill='" + PAPER + "'/><circle cx='69' cy='63' r='1.8' fill='" + PAPER + "'/>"
        + "<path d='M62.5 67 q2.5 2.4 5 0' stroke='" + PAPER + "' stroke-width='2' fill='none' stroke-linecap='round'/>"
        + "</g>");
    }),

    // A folder friend hugging its papers — they peek out to look around.
    folder: (a) => range(FR).map((f) => { const lift = Math.abs(Math.sin((f / FR) * 6.28)) * 5;
      return sticker(ground()
        + "<path d='M26 44 q0 -5 5 -5 h11 l5 5 h18 q5 0 5 5 v4 h-44 Z' fill='" + dark(a, 60) + "' stroke='" + INK + "' stroke-width='3'/>"
        + "<g transform='translate(0," + (-lift) + ")'>"
        + "<rect x='33' y='40' width='28' height='14' rx='2.5' fill='" + PAPER + "' stroke='" + INK + "' stroke-width='2.4'/>"
        + "<path d='M38 45 h14 M38 49 h10' stroke='#ddd8ec' stroke-width='2' stroke-linecap='round'/></g>"
        + "<rect x='24' y='50' width='48' height='27' rx='6' fill='" + rgb(a) + "' stroke='" + INK + "' stroke-width='3'/>"
        + face(48, 61, blinkAt(f)));
    }),

    // A camcorder with one big curious eye — it looks around, REC light blinking.
    video: (a) => range(FR).map((f) => { const dy = bob(f), px = [-2, 0, 2, 0][f], on = f % 2 === 0;
      return sticker(ground()
        + "<g transform='translate(0," + dy + ")'>"
        + "<path d='M58 51 L72 43 V71 L58 63 Z' fill='" + PAPER + "' stroke='" + INK + "' stroke-width='3' stroke-linejoin='round'/>"
        + "<rect x='22' y='48' width='36' height='28' rx='8' fill='" + rgb(a) + "' stroke='" + INK + "' stroke-width='3'/>"
        + "<rect x='28' y='42' width='18' height='7' rx='3.5' fill='" + dark(a, 60) + "' stroke='" + INK + "' stroke-width='2.4'/>"
        + "<circle cx='38' cy='59' r='8.5' fill='" + PAPER + "' stroke='" + INK + "' stroke-width='3'/>"
        + "<circle cx='" + (38 + px) + "' cy='59' r='3.6' fill='" + INK + "'/>"
        + "<circle cx='" + (39.4 + px) + "' cy='57.6' r='1.1' fill='" + PAPER + "'/>"
        + "<path d='M35 70 q3 2.6 6 0' stroke='" + INK + "' stroke-width='2.2' fill='none' stroke-linecap='round'/>"
        + "<circle cx='52' cy='54' r='3' fill='" + (on ? '#ff5252' : '#7a3a3a') + "' stroke='" + INK + "' stroke-width='2'/>"
        + "</g>");
    }),

    // Three matching buddies and one imposter whose eyes dart around.
    imposter: (a) => range(FR).map((f) => { const dy = bob(f), px = [-2, 0, 2, 0][f];
      const buddy = (cx, col) => "<circle cx='" + cx + "' cy='62' r='9' fill='" + col + "' stroke='" + INK + "' stroke-width='2.6'/>"
        + "<circle cx='" + (cx - 3) + "' cy='60' r='1.6' fill='" + INK + "'/><circle cx='" + (cx + 3) + "' cy='60' r='1.6' fill='" + INK + "'/>"
        + "<path d='M" + (cx - 2) + " 65 q2 2 4 0' stroke='" + INK + "' stroke-width='1.8' fill='none' stroke-linecap='round'/>";
      return sticker(ground()
        + "<g transform='translate(0," + dy + ")'>"
        + buddy(28, PAPER) + buddy(48, PAPER)
        + "<circle cx='68' cy='62' r='9' fill='" + rgb(a) + "' stroke='" + INK + "' stroke-width='2.6'/>"
        + "<circle cx='" + (65 + px) + "' cy='60' r='1.8' fill='" + INK + "'/><circle cx='" + (71 + px) + "' cy='60' r='1.8' fill='" + INK + "'/>"
        + "<path d='M66 66 h4' stroke='" + INK + "' stroke-width='1.8' stroke-linecap='round'/>"
        + "<path d='M22 40 q6 -6 12 0 M42 36 q6 -6 12 0' stroke='" + INK + "' stroke-width='2.4' fill='none' stroke-linecap='round' opacity='.35'/>"
        + "<text x='62' y='44' font-family='system-ui' font-size='15' font-weight='800' fill='" + INK + "'>?</text>"
        + "</g>");
    }),

    // A shifty spy in a fedora; the magnifying glass sweeps back and forth.
    spy: (a) => range(FR).map((f) => { const dy = bob(f), mx = [0, 6, 12, 6][f];
      return sticker(ground()
        + "<g transform='translate(0," + dy + ")'>"
        + "<path d='M34 58 q0 -18 14 -18 q14 0 14 18 l-4 18 h-20 Z' fill='#5a6475' stroke='" + INK + "' stroke-width='3' stroke-linejoin='round'/>"
        + "<circle cx='48' cy='46' r='12' fill='" + PAPER + "' stroke='" + INK + "' stroke-width='3'/>"
        + "<rect x='38' y='42' width='20' height='6' rx='3' fill='" + INK + "'/>"
        + "<path d='M32 38 h32 l-4 -7 h-24 Z' fill='" + rgb(a) + "' stroke='" + INK + "' stroke-width='2.6' stroke-linejoin='round'/>"
        + "<path d='M44 53 q4 3 8 0' stroke='" + INK + "' stroke-width='2' fill='none' stroke-linecap='round'/>"
        + "</g>"
        + "<g transform='translate(" + (58 + mx) + "," + (60 + dy) + ")'>"
        + "<circle r='7.5' fill='rgba(180,220,255,.55)' stroke='" + INK + "' stroke-width='3'/>"
        + "<line x1='5' y1='5' x2='11' y2='11' stroke='" + INK + "' stroke-width='4' stroke-linecap='round'/></g>");
    }),

    // A giggling face with a phone stuck to its forehead, tilting to score.
    tilt: (a) => range(FR).map((f) => { const rot = [-14, 0, 14, 0][f];
      return sticker(ground()
        + "<circle cx='48' cy='60' r='16' fill='" + PAPER + "' stroke='" + INK + "' stroke-width='3'/>"
        + "<circle cx='42.5' cy='60' r='2.2' fill='" + INK + "'/><circle cx='53.5' cy='60' r='2.2' fill='" + INK + "'/>"
        + "<path d='M43 66 q5 4.5 10 0' stroke='" + INK + "' stroke-width='2.2' fill='none' stroke-linecap='round'/>"
        + "<circle cx='38' cy='65' r='2.2' fill='#ff9eb0' opacity='.75'/><circle cx='58' cy='65' r='2.2' fill='#ff9eb0' opacity='.75'/>"
        + "<g transform='rotate(" + rot + " 48 34)'>"
        + "<rect x='34' y='24' width='28' height='18' rx='4' fill='" + rgb(a) + "' stroke='" + INK + "' stroke-width='3'/>"
        + "<text x='48' y='37' font-family='system-ui' font-size='11' font-weight='800' fill='" + PAPER + "' text-anchor='middle'>?!</text></g>");
    }),

    // A radio-dial gauge whose needle hunts for the group's wavelength.
    dial: (a) => range(FR).map((f) => { const ang = [-52, -15, 30, -15][f];
      return sticker(ground()
        + "<path d='M22 70 a26 26 0 0 1 52 0 Z' fill='" + PAPER + "' stroke='" + INK + "' stroke-width='3' stroke-linejoin='round'/>"
        + "<path d='M60 51 a26 26 0 0 1 8 12 l-12 7 Z' fill='" + rgb(a) + "' opacity='.85'/>"
        + "<g transform='rotate(" + ang + " 48 70)'><line x1='48' y1='70' x2='48' y2='48' stroke='" + INK + "' stroke-width='4' stroke-linecap='round'/></g>"
        + "<circle cx='48' cy='70' r='4.5' fill='" + INK + "'/>"
        + "<circle cx='30' cy='64' r='1.6' fill='" + INK + "' opacity='.4'/><circle cx='48' cy='52' r='1.6' fill='" + INK + "' opacity='.4'/><circle cx='66' cy='64' r='1.6' fill='" + INK + "' opacity='.4'/>");
    }),

    // A deck of party cards; the top one pops up, bossy as ever.
    roulette: (a) => range(FR).map((f) => { const pop = [0, -5, -8, -5][f];
      return sticker(ground()
        + "<rect x='30' y='52' width='36' height='24' rx='5' fill='#e5ddf2' stroke='" + INK + "' stroke-width='2.6'/>"
        + "<rect x='27' y='58' width='42' height='18' rx='5' fill='" + PAPER + "' stroke='" + INK + "' stroke-width='2.6'/>"
        + "<g transform='translate(0," + pop + ")'>"
        + "<rect x='33' y='30' width='30' height='24' rx='5' fill='" + rgb(a) + "' stroke='" + INK + "' stroke-width='3'/>"
        + "<text x='48' y='47' font-family='system-ui' font-size='16' font-weight='900' fill='" + PAPER + "' text-anchor='middle'>!</text></g>");
    }),

    // Home sweet home — a cozy cottage with smoke puffing from the chimney.
    welcome: (a) => range(FR).map((f) => {
      const puffs = range(2).map((i) => {
        const t = (f + i * 2) % 4;
        return "<circle cx='" + (61.5 + t * 1.2) + "' cy='" + (30 - t * 3) + "' r='" + (2 + t * .7) + "' fill='#e8e4f5' stroke='" + INK + "' stroke-width='1.6' opacity='" + (.95 - t * .22) + "'/>";
      }).join('');
      return sticker(ground()
        + puffs
        + "<rect x='57' y='34' width='8' height='13' fill='#c96f4a' stroke='" + INK + "' stroke-width='2.4'/>"
        + "<rect x='33' y='52' width='30' height='24' fill='" + PAPER + "' stroke='" + INK + "' stroke-width='3'/>"
        + "<path d='M28 53 L48 32 L68 53 Z' fill='" + rgb(a) + "' stroke='" + INK + "' stroke-width='3' stroke-linejoin='round'/>"
        + "<rect x='44' y='62' width='10' height='14' rx='4' fill='" + dark(a, 30) + "' stroke='" + INK + "' stroke-width='2.4'/>"
        + "<circle cx='52' cy='70' r='1.2' fill='" + INK + "'/>"
        + "<circle cx='38.5' cy='59' r='3.4' fill='" + (f % 2 ? '#ffe9a8' : '#ffd23c') + "' stroke='" + INK + "' stroke-width='2.4'/>");
    }),
  };

  // ---- render SVG frames → animated GIF preview (adaptive palette) ----------
  function loadSvg(svg) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error('svg load failed'));
      img.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
    });
  }

  // Palette index 0 is reserved as the TRANSPARENT color; visible colors live
  // in 1..255. Transparent pixels never influence the adaptive palette.
  function buildPalette(rgbFrames) {
    const key = (r, g, b) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const counts = new Map();
    for (const data of rgbFrames) {
      for (let p = 0; p < data.length; p += 4) {
        if (data[p + 3] < 128) continue; // transparent → reserved index 0
        const k = key(data[p], data[p + 1], data[p + 2]);
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    const top = Array.from(counts.keys()).sort((x, y) => counts.get(y) - counts.get(x)).slice(0, 255);
    const centers = top.map((k) => [(((k >> 10) & 31) << 3) | 4, (((k >> 5) & 31) << 3) | 4, ((k & 31) << 3) | 4]);
    const palette = new Array(256 * 3).fill(0);
    for (let i = 0; i < centers.length; i++) { palette[(i + 1) * 3] = centers[i][0]; palette[(i + 1) * 3 + 1] = centers[i][1]; palette[(i + 1) * 3 + 2] = centers[i][2]; }
    const cache = new Map();
    const map = (r, g, b, a) => {
      if (a < 128) return 0;
      const k = key(r, g, b);
      let idx = cache.get(k);
      if (idx === undefined) {
        let best = 0, bd = 1e12;
        for (let i = 0; i < centers.length; i++) { const dr = r - centers[i][0], dg = g - centers[i][1], db = b - centers[i][2]; const d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; best = i; } }
        idx = best + 1; cache.set(k, idx);
      }
      return idx;
    };
    return { palette, map };
  }

  function renderFrames(svgFrames) {
    const canvas = document.createElement('canvas');
    canvas.width = S; canvas.height = S;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    return Promise.all(svgFrames.map(loadSvg)).then((imgs) => {
      const rgbFrames = imgs.map((img) => { ctx.clearRect(0, 0, S, S); ctx.drawImage(img, 0, 0, S, S); return ctx.getImageData(0, 0, S, S).data; });
      const { palette, map } = buildPalette(rgbFrames);
      const frames = rgbFrames.map((data) => { const idx = new Uint8Array(S * S); for (let p = 0; p < S * S; p++) idx[p] = map(data[p * 4], data[p * 4 + 1], data[p * 4 + 2], data[p * 4 + 3]); return idx; });
      return { width: S, height: S, palette, numColors: 256, minCodeSize: 8, frames, delayCs: DELAY, transparentIndex: 0 };
    });
  }

  // Render an app's custom icon as an animated GIF preview. Falls back to a
  // lettered blob buddy for unknown apps.
  function renderApp(appId, accent) {
    accent = accent || [123, 92, 255];
    const art = ART[appId];
    if (art) return renderFrames(art(accent));
    const letter = (appId || '?')[0].toUpperCase();
    const svgs = range(FR).map((f) => sticker(ground()
      + "<g transform='translate(0," + bob(f) + ")'>"
      + "<rect x='28' y='36' width='40' height='40' rx='13' fill='" + rgb(accent) + "' stroke='" + INK + "' stroke-width='3'/>"
      + "<text x='48' y='66' font-family='system-ui,sans-serif' font-size='26' font-weight='800' fill='" + PAPER + "' text-anchor='middle'>" + letter + "</text>"
      + "</g>"));
    return renderFrames(svgs);
  }

  GifOS.icons = { renderApp, renderFrames, has: (id) => !!ART[id] };
})(typeof window !== 'undefined' ? window : globalThis);
