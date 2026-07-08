/*
 * gifos-pack-eightbit.js — "8-Bit", the retro-arcade pack (8.gifos.app).
 *
 * TRUE pixel art: every frame is a painter function that fills 4×4 blocks on
 * a 32×32 logical grid (128px raster), PICO-8 palette only, 1px #1d2b53
 * outlines, 2-tone shading, checker dither — SNES-era item sprites.
 *
 * Sprites are authored as string rows ('.'=transparent) through a tiny DSL;
 * 'A'/'a'/'h' resolve to the accent's nearest PICO-8 color + its dark/light
 * companions, so every app keeps its own body color. Animation is authentic
 * low-fps sprite cycling: 2 alternating poses plus the occasional 3rd
 * (the chest creaks open, the bomb fuse fizzes, the cursor blinks).
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  if (!GifOS.iconPacks) return;

  const SIZE = 128, FR = 4, DELAY = 20, GRID = 32;

  // ---- PICO-8 palette ------------------------------------------------------
  const HEX = {
    K: '#1d2b53', P: '#7e2553', G: '#008751', B: '#ab5236', D: '#5f574f',
    L: '#c2c3c7', W: '#fff1e8', R: '#ff004d', O: '#ffa300', Y: '#ffec27',
    E: '#00e436', C: '#29adff', V: '#83769c', F: '#ff77a8', T: '#ffccaa',
  };
  // Accent candidates + each one's classic PICO-8 shade / highlight partner.
  const ACC = ['R', 'O', 'Y', 'E', 'C', 'F', 'T', 'V', 'G'];
  const DARK = { R: 'P', O: 'B', Y: 'O', E: 'G', C: 'K', F: 'P', T: 'B', V: 'K', G: 'K' };
  const LITE = { R: 'F', O: 'Y', Y: 'W', E: 'Y', C: 'W', F: 'T', T: 'W', V: 'L', G: 'E' };
  const rgbOf = (k) => [parseInt(HEX[k].slice(1, 3), 16), parseInt(HEX[k].slice(3, 5), 16), parseInt(HEX[k].slice(5, 7), 16)];
  function accentMap(accent) {
    let best = 'C', bd = Infinity;
    for (const k of ACC) {
      const c = rgbOf(k);
      const d = (accent[0] - c[0]) ** 2 + (accent[1] - c[1]) ** 2 + (accent[2] - c[2]) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    const m = Object.assign({}, HEX);
    m.A = HEX[best]; m.a = HEX[DARK[best]]; m.h = HEX[LITE[best]];
    return m;
  }

  // ---- the sprite DSL ------------------------------------------------------
  // A layer is [rows, ox, oy]; blit() bakes layers into one painter function.
  // Integer grid only: each cell is one crisp (size/32)² block.
  function blit(map, layers) {
    return function (ctx, size) {
      const s = size / GRID;
      for (const L of layers) {
        const rows = L[0], ox = L[1] | 0, oy = L[2] | 0;
        for (let y = 0; y < rows.length; y++) {
          const row = rows[y];
          for (let x = 0; x < row.length; x++) {
            const col = map[row[x]];
            if (col) { ctx.fillStyle = col; ctx.fillRect((x + ox) * s, (y + oy) * s, s, s); }
          }
        }
      }
    };
  }
  // Most subjects: base sprite + per-frame overlay layers.
  function anim(map, base, frames) {
    return frames.map((extra) => blit(map, base.concat(extra || [])));
  }

  const SPARK1 = ['.W.', 'WYW', '.W.'];         // little pickup twinkle
  const SPARK2 = ['Y.Y', '.W.', 'Y.Y'];

  // ---- subjects ------------------------------------------------------------
  const ART = {};

  // Notes — spiral notepad, accent header band, a fat cursor blinking at the
  // end of the half-written line.
  ART.notes = (m) => {
    const pad = [
      '..L..L..L..L..L..L..',
      '..D..D..D..D..D..D..',
      'KKDKKDKKDKKDKKDKKDKK',
      'KAAAAAAAAAAAAAAAAAAK',
      'KhAAAAAAAAAAAAAAAAAK',
      'KaaaaaaaaaaaaaaaaaaK',
      'KWWWWWWWWWWWWWWWWWWK',
      'KWWWWWWWWWWWWWWWWWWK',
      'KW.VVVVVVVVVVVVVV.WK',
      'KWWWWWWWWWWWWWWWWWWK',
      'KW.VVVVVVVVVVVVVV.WK',
      'KWWWWWWWWWWWWWWWWWWK',
      'KW.VVVVVVVVVVVVVV.WK',
      'KWWWWWWWWWWWWWWWWWWK',
      'KW.VVVVVVV........WK',
      'KWWWWWWWWWWWWWWWWWWK',
      'KWWWWWWWWWWWWWWWWWWK',
      'KLLLLLLLLLLLLLLLLLLK',
      'KKKKKKKKKKKKKKKKKKKK',
    ];
    const cursor = [['AA', 'AA', 'AA'], 17, 17];
    return anim(m, [[pad, 6, 5]], [[cursor], [cursor], [], []]);
  };

  // Tic-Tac-Toe — accent-framed paper board; X and O played, a third X being
  // placed in the corner (ghost preview, then committed).
  ART.tictactoe = (m) => {
    const cell = 'WWWWW';
    const mid = 'KA' + cell + 'K' + cell + 'K' + cell + 'AK';
    const grid = 'KA' + 'KKKKKKKKKKKKKKKKK' + 'AK';
    const board = [
      '.KKKKKKKKKKKKKKKKKKK.',
      'KhAAAAAAAAAAAAAAAAAAK',
      mid, mid, mid, mid, mid,
      grid,
      mid, mid, mid, mid, mid,
      grid,
      mid, mid, mid, mid, mid,
      'KAAAAAAAAAAAAAAAAAAaK',
      '.KKKKKKKKKKKKKKKKKKK.',
    ];
    const X = ['R...R', '.R.R.', '..R..', '.R.R.', 'R...R'];
    const O = ['.CCC.', 'C...C', 'C...C', 'C...C', '.CCC.'];
    const X2g = ['F...F', '.F.F.', '..F..', '.F.F.', 'F...F'];
    const X2 = X;
    const base = [[board, 5, 5], [X, 7, 7], [O, 13, 13]];
    return anim(m, base, [[], [], [[X2g, 19, 19]], [[X2, 19, 19]]]);
  };

  // Connect 4 — accent board, yellow/red discs seated, a red disc drops into
  // the middle column and lands with a blink.
  ART.connect4 = (m) => {
    const hole = 'KAA....AA....AA....AAK';
    const solid = 'KAAAAAAAAAAAAAAAAAAAAK';
    const board = [
      'KKKKKKKKKKKKKKKKKKKKKK',
      'KhAAAAAAAAAAAAAAAAAAAK',
      hole, hole, hole, hole,
      solid, solid,
      hole, hole, hole, hole,
      'KaaaaaaaaaaaaaaaaaaaaK',
      'KKKKKKKKKKKKKKKKKKKKKK',
    ];
    const discR = ['.RR.', 'RFRR', 'RRRR', '.RR.'];
    const discC = ['.CC.', 'CWCC', 'CCCC', '.CC.'];
    // pre-seated discs in the bottom row of holes (left + right columns)
    const seated = [[discC, 8, 21], [discR, 20, 21]];
    const bx = 5, drop = 14; // board x, dropping column x
    const base = [[board, bx, 13]].concat(seated);
    return anim(m, base, [
      [[discR, drop, 4]],
      [[discR, drop, 9]],
      [[discR, drop, 21]],
      [[discR, drop, 21], [SPARK1, 12, 17]],
    ]);
  };

  // Minesweeper — the classic round bomb, brass cap, fizzing spark that
  // flickers between two shapes.
  ART.minesweeper = (m) => {
    const bomb = [
      '....KKKKKK....',
      '..KKDDDDDDKK..',
      '.KDLWLDDDDDDK.',
      '.KDLLDDDDDDDK.',
      'KDLLDDDDDDDDDK',
      'KDDDDDDDDDDDDK',
      'KDDDDDDDDDKDKK',
      'KDDDDDDDDKDKDK',
      '.KDDDDDDDKDKK.',
      '.KDDDDDDKDKDK.',
      '..KKDDDDDDKK..',
      '....KKKKKK....',
    ];
    const cap = ['.KKK.', 'KLDLK', '.KKK.'];
    const fuse = ['...BB', '..BB.', '.BB..', 'BB...'];
    const sA = ['.Y.', 'YWY', '.Y.'];
    const sB = ['O.O', '.W.', 'O.O'];
    const base = [[bomb, 7, 12], [cap, 14, 9], [fuse, 17, 5]];
    return anim(m, base, [[[sA, 20, 2]], [[sB, 20, 2]], [[sA, 20, 2]], [[sB, 20, 2]]]);
  };

  // Chess — porcelain pawn on an accent base; a twinkle rolls off its head.
  ART.chess = (m) => {
    const pawn = [
      '....KKKKKK....',
      '...KWWWWWWK...',
      '...KWWWWLWK...',
      '...KWWWWWWK...',
      '....KWWWWK....',
      '..KKKKKKKKKK..',
      '..KWWWWWWLWK..',
      '...KKKKKKKK...',
      '....KWWWWK....',
      '....KWWLWK....',
      '....KWWWWK....',
      '...KWWWWWWK...',
      '...KWWWWLWK...',
      '..KWWWWWWLWK..',
      '..KWWWWWLLWK..',
      '.KKKKKKKKKKKK.',
      '.KAAAAAAAAAAK.',
      'KAhAAAAAAAAAAK',
      'KaaaaaaaaaaaaK',
      'KKKKKKKKKKKKKK',
    ];
    const base = [[pawn, 9, 6]];
    return anim(m, base, [[], [[SPARK1, 19, 5]], [[SPARK2, 19, 5]], []]);
  };

  // Paint — accent artist palette, four paint dabs, a brush that dips.
  ART.paint = (m) => {
    const pal = [
      '.......KKKKKKKKK.......',
      '.....KKAAAAAAAAAKK.....',
      '...KKAAAAAAAAAAAAAKK...',
      '..KAAAAAAAAAAAAAAAAAK..',
      '.KAAAAAAAAAAAAAAAAAAAK.',
      '.KAAAAAAAAAAAAAAAAAAAK.',
      'KAAAAAAAAAAAAAAAAKKAAK.',
      'KAAAAAAAAAAAAAAAK..KAK.',
      'KAAAAAAAAAAAAAAAK..KAK.',
      'KAAAAAAAAAAAAAAAAKKAAK.',
      '.KaAAAAAAAAAAAAAAAAAK..',
      '..KKaaaaaaaaaaaaaaKK...',
      '....KKKKKKKKKKKKKK.....',
    ];
    const dab = (c) => ['.' + c + '.', c + c + c, '.' + c + '.'];
    const brushA = [
      '......KK.',
      '.....KOOK',
      '....KOOK.',
      '...KOOK..',
      '..KLLK...',
      '.KLLK....',
      '.KBK.....',
      '.KK......',
    ];
    const base = [
      [pal, 4, 10],
      [dab('R'), 8, 12], [dab('Y'), 13, 11], [dab('C'), 18, 12], [dab('E'), 10, 16],
    ];
    return anim(m, base, [
      [[brushA, 20, 4]],
      [[brushA, 20, 5], [dab('F'), 8, 12]],
      [[brushA, 20, 6]],
      [[brushA, 20, 5], [dab('F'), 8, 12]],
    ]);
  };

  // Calculator — accent shell, green LCD whose readout flips, chunky keys.
  ART.calc = (m) => {
    const keys = 'KAWWWAWWWAWWWAK';
    const keyb = 'KALLLALLLALLLAK';
    const body = [
      '.KKKKKKKKKKKKK.',
      'KhAAAAAAAAAAAAK',
      'KAAAAAAAAAAAAAK',
      'KAKKKKKKKKKKKAK',
      'KAKGGGGGGGGGKAK',
      'KAKGGGGGGGGGKAK',
      'KAKGGGGGGGGGKAK',
      'KAKGGGGGGGGGKAK',
      'KAKGGGGGGGGGKAK',
      'KAKKKKKKKKKKKAK',
      'KAAAAAAAAAAAAAK',
      keys, keys, keyb,
      'KAAAAAAAAAAAAAK',
      'KAWWWAWWWAYYYAK',
      'KAWWWAWWWAYYYAK',
      'KALLLALLLAOOOAK',
      'KaaaaaaaaaaaaaK',
      'KKKKKKKKKKKKKKK',
    ];
    const d4 = ['E.E', 'E.E', 'EEE', '..E', '..E'];
    const d2 = ['EEE', '..E', 'EEE', 'E..', 'EEE'];
    const d1 = ['.E.', 'EE.', '.E.', '.E.', 'EEE'];
    const d7 = ['EEE', '..E', '.E.', '.E.', '.E.'];
    const ox = 8, oy = 6;
    const base = [[body, ox, oy]];
    const a = [[d4, ox + 4, oy + 4], [d2, ox + 8, oy + 4]];
    const b = [[d1, ox + 4, oy + 4], [d7, ox + 8, oy + 4]];
    return anim(m, base, [a, a, b, b]);
  };

  // Timer — stopwatch with accent bezel; the hand ticks a full lap, one
  // quarter per frame. Four frames = one revolution.
  ART.timer = (m) => {
    const watch = [
      '......KKKK......',
      '.....KAhAAK.....',
      '......KKKK......',
      '....KKKKKKKK....',
      '..KKAAAAAAAAKK..',
      '.KAAWWWKKWWWAAK.',
      '.KAWWWWKKWWWWAK.',
      'KAWWWWWWWWWWWWAK',
      'KAWWWWWWWWWWWWAK',
      'KAKWWWWWWWWWWKAK',
      'KAWWWWWWWWWWWWAK',
      'KAWWWWWWWWWWWWAK',
      'KAWWWWWWWWWWWWAK',
      '.KAWWWWKKWWWLAK.',
      '.KAAWWWKKWWLAAK.',
      '..KKAAAAAAAAKK..',
      '....KKKKKKKK....',
    ];
    const ox = 8, oy = 7;
    // hub at grid (15..16, 16..17); a chunky 2px hand ticks a full lap
    const vert = ['RR', 'RR', 'RR'];
    const horz = ['RRR', 'RRR'];
    const hub = [['KK', 'KK'], 15, 16];
    const base = [[watch, ox, oy]];
    return anim(m, base, [
      [[vert, 15, 13], hub],
      [[horz, 17, 16], hub],
      [[vert, 15, 18], hub],
      [[horz, 12, 16], hub],
    ]);
  };

  // Fortune — golden folded cookie, the white slip wiggling out of the fold.
  ART.fortune = (m) => {
    const cookie = [
      '.......KKKKKKKK.......',
      '.....KKOOOOOOOOKK.....',
      '....KOTTOOOOOOOOOK....',
      '...KOTTTOOOOOOOOBOK...',
      '..KOTTOOOOOOOOOOBOK...',
      '..KOOOOOOOBBOOOOOBOK..',
      '.KOOOOOOOBBBBOOOOBOK..',
      '.KOOOOOOBBKKBBOOBOBOK.',
      '.KOOOOOKK....KKOOOOOK.',
      '..KKKKK........KKKKK..',
    ];
    const slipA = ['KWWWWK', 'KWVVWK', 'KWWWWK', '.KKKK.'];
    const slipB = ['KWWWWK', 'KWWWWK', 'KWVVWK', '.KKKK.'];
    const ox = 5, oy = 8;
    const base = [[cookie, ox, oy]];
    return anim(m, base, [
      [[slipA, 13, 15]],
      [[slipA, 13, 15]],
      [[slipB, 13, 16]],
      [[slipB, 13, 16]],
    ]);
  };

  // Guestbook — open book, accent cover lip, a heart beating on the left page.
  ART.guestbook = (m) => {
    const left = 'KWWWWWWWWWW', spine = 'K', right = 'WWWWWWWWWWK';
    const lined = 'KWWWWWWWWWW' + 'K' + 'W.VVVVVV.WK';
    const plain = left + spine + right;
    const book = [
      '.KKKKKKKKKK.KKKKKKKKKK.',
      plain,
      lined,
      plain,
      lined,
      plain,
      lined,
      plain,
      plain,
      '.KAAAAAAAAAKAAAAAAAAAK.',
      '..KKKKKKKKKKKKKKKKKKK..',
    ];
    const hSmall = ['.R.R.', 'RFRRR', '.RRR.', '..R..'];
    const hBig = ['.RR.RR.', 'RFRRRRR', 'RFRRRRR', '.RRRRR.', '..RRR..', '...R...'];
    const ox = 4, oy = 10;
    const base = [[book, ox, oy]];
    return anim(m, base, [
      [[hSmall, ox + 4, oy + 3]],
      [[hSmall, ox + 4, oy + 3]],
      [[hBig, ox + 3, oy + 2]],
      [[hBig, ox + 3, oy + 2]],
    ]);
  };

  // Chat — big white bubble typing dot by dot, small accent bubble replying.
  ART.chat = (m) => {
    const big = [
      '.KKKKKKKKKKKKK.',
      'KWWWWWWWWWWWWWK',
      'KWWWWWWWWWWWWWK',
      'KWWWWWWWWWWWWWK',
      'KWWWWWWWWWWWWWK',
      'KWWWWWWWWWWWWWK',
      '.KKKKKKKKKKKKK.',
      '..KWWK.........',
      '..KWK..........',
      '..KK...........',
    ];
    const small = [
      '.KKKKKKKKKKK.',
      'KhAAAAAAAAAAK',
      'KAAAAAAAAAAAK',
      'KAAAAAAAAAAAK',
      'KaaaaaaaaaaaK',
      '.KKKKKKKKKKK.',
      '.......KaaK..',
      '........KaK..',
      '.........KK..',
    ];
    const dot = ['VV', 'VV'];
    const ox = 4, oy = 7;
    const base = [[big, ox, oy], [small, 14, 18]];
    const d1 = [[dot, ox + 3, oy + 3]];
    const d2 = d1.concat([[dot, ox + 6, oy + 3]]);
    const d3 = d2.concat([[dot, ox + 9, oy + 3]]);
    return anim(m, base, [d1, d2, d3, d3]);
  };

  // Folder — accent file folder; a ruled paper peeks up out of it.
  ART.folder = (m) => {
    const back = [
      '.KKKKKKKK.............',
      'KAAAAAAAAK............',
      'KAAAAAAAAKKKKKKKKKKKK.',
      'KaAAAAAAAAAAAAAAAAAAAK',
      'KaaaaaaaaaaaaaaaaaaaaK',
      'KaaaaaaaaaaaaaaaaaaaaK',
    ];
    const paper = [
      'KWWWWWWWWWWWWK',
      'KW.VVVVVVVV.WK',
      'KWWWWWWWWWWWWK',
      'KW.VVVVVVVV.WK',
    ];
    const front = [
      'KKKKKKKKKKKKKKKKKKKKKK',
      'KhAAAAAAAAAAAAAAAAAAAK',
      'KAAAAAAAAAAAAAAAAAAAAK',
      'KAAAAAAAAAAAAAAAAAAAAK',
      'KAAAAAAAAAAAAAAAAAAAAK',
      'KAAAAAAAAAAAAAAAAAAAAK',
      'KAAAAAAAAAAAAAAAAAAAaK',
      'KaAAAAAAAAAAAAAAAAAaaK',
      'KKKKKKKKKKKKKKKKKKKKKK',
    ];
    const ox = 5, oy = 7;
    const up = [[back, ox, oy], [paper, ox + 4, oy + 2], [front, ox, oy + 7]];
    const dn = [[back, ox, oy], [paper, ox + 4, oy + 4], [front, ox, oy + 7]];
    return [blit(m, dn), blit(m, dn), blit(m, up), blit(m, up.concat([[SPARK1, 24, 6]]))];
  };

  // Stolen Apps — a Zelda-ish treasure chest that creaks open with a sparkle.
  ART.chest = (m) => {
    const bodyRows = [
      'KBBBBBBBOYYOBBBBBBBK',
      'KBBBBBBBYKKYBBBBBBBK',
      'KBBBBBBBOYYOBBBBBBBK',
      'KBBBBBBBBOOBBBBBBBBK',
      'KBPBPBPBPBPBPBPBPBPK',
      'KPPPPPPPPPPPPPPPPPPK',
      'KKKKKKKKKKKKKKKKKKKK',
    ];
    const closedLid = [
      '..KKKKKKKKKKKKKKKK..',
      '.KBTTBBBBBBBBBBBBBK.',
      'KBTBBBBBBBBBBBBBBBBK',
      'KBBBBBBBBBBBBBBBBBBK',
      'KOOOOOOOOYYOOOOOOOOK',
      'KKKKKKKKKKKKKKKKKKKK',
    ];
    const openLid = [
      '.KKKKKKKKKKKKKKKKKK.',
      'KBTBBBBBBBBBBBBBBBBK',
      'KOOOOOOOOYYOOOOOOOOK',
      'KKKKKKKKKKKKKKKKKKKK',
      'KKKYKKYKKKYYKKYKKKKK',
      'KKKKKKKKKKKKKKKKKKKK',
    ];
    const ox = 6, oy = 8;
    const closed = [[closedLid, ox, oy + 3], [bodyRows, ox, oy + 9]];
    const open = [[openLid, ox, oy + 3], [bodyRows, ox, oy + 9]];
    const glow = [['..Y....Y..', 'Y...YY...Y'], ox + 5, oy + 1];
    return [
      blit(m, closed), blit(m, closed),
      blit(m, open.concat([glow])),
      blit(m, open.concat([glow, [SPARK1, 22, 5], [['W'], 9, 7]])),
    ];
  };

  // Meeting (hero) — the hero: a chunky camcorder, glass lens, blinking REC lamp,
  // spinning tape reel window.
  ART.video = (m) => {
    // Meeting: a chunky monitor holding a 2x2 grid of pixel friends; the
    // accent-lit "speaking" face hops one tile per frame.
    const bezel = ['K'.repeat(24)]
      .concat(Array(19).fill('K' + 'D'.repeat(22) + 'K'))
      .concat(['K'.repeat(24)]);
    const face = (c) => [
      c.repeat(9),
      c.repeat(3) + 'WWW' + c.repeat(3),
      c.repeat(2) + 'WWWWW' + c.repeat(2),
      c.repeat(2) + 'WKWKW' + c.repeat(2),
      c.repeat(2) + 'WWWWW' + c.repeat(2),
      c.repeat(3) + 'WWW' + c.repeat(3),
      c + 'WWWWWWW' + c,
      c.repeat(9),
    ];
    const pos = [[5, 8], [16, 8], [5, 17], [16, 17]];
    const base = [[bezel, 4, 6]].concat(pos.map((p) => [face('A'), p[0], p[1]]));
    return anim(m, base, pos.map((p) => [[face('h'), p[0], p[1]]]));
  };

  // Imposter — three little crew beans; the accent one is taller, shiftier,
  // and grows a blinking question mark.
  ART.imposter = (m) => {
    const bean = (c, d) => [
      '.KKKKK.',
      'K' + c + c + c + c + c + 'K',
      'K' + c + 'CWC' + c + 'K',
      'K' + c + c + c + c + c + 'K',
      'K' + c + c + c + c + c + 'K',
      'K' + d + d + d + d + d + 'K',
      'K' + c + c + 'K' + c + c + 'K',
      '.KK.KK.',
    ];
    const sus = [
      '..KKKKK..',
      '.KAAAAAK.',
      'KAACCWAAK',
      'KAACCCAAK',
      'KAAAAAAAK',
      'KAAAAAAAK',
      'KAAAAAAAK',
      'KaaaaaaaK',
      'KAAKKKAAK',
      '.KK...KK.',
    ];
    const susB = sus.map((r) => r.replace('KAACCWAAK', 'KAAWCCAAK').replace('KAACCCAAK', 'KAACCCAAK'));
    const q = ['YYYY', '...Y', '..YY', '..Y.', '....', '..Y.'];
    return [
      blit(m, [[bean('L', 'D'), 4, 19], [bean('T', 'B'), 21, 20], [sus, 11, 15]]),
      blit(m, [[bean('L', 'D'), 4, 19], [bean('T', 'B'), 21, 20], [susB, 11, 15]]),
      blit(m, [[bean('L', 'D'), 4, 19], [bean('T', 'B'), 21, 20], [sus, 11, 15], [q, 14, 7]]),
      blit(m, [[bean('L', 'D'), 4, 19], [bean('T', 'B'), 21, 20], [susB, 11, 15], [q, 14, 7]]),
    ];
  };

  // Spy — a chunky magnifying glass, accent handle, glint sweeping the lens.
  ART.spy = (m) => {
    const lens = [
      '....KKKKK....',
      '..KKDDDDDKK..',
      '.KDCCCCCCCDK.',
      '.KDCCCCCCCDK.',
      'KDCCCCCCCCCDK',
      'KDCCCCCCCCCDK',
      'KDCCCCCCCCCDK',
      'KDCCCCCCCCCDK',
      'KDCCCCCCCCCDK',
      '.KDCCCCCCCDK.',
      '.KDCCCCCCCDK.',
      '..KKDDDDDKK..',
      '....KKKKK....',
    ];
    const handle = [
      'KKK....',
      'KAAK...',
      'KAAAK..',
      '.KAAAK.',
      '..KAAAK',
      '...KaaK',
      '....KKK',
    ];
    const glintA = ['...W', '..W.', '.W..', 'W...'];
    const glintB = ['...WW', '..WW.', '.WW..', 'WW...'];
    const ox = 5, oy = 5;
    const base = [[lens, ox, oy], [handle, ox + 10, oy + 10]];
    return anim(m, base, [
      [[glintA, ox + 4, oy + 3]],
      [[glintB, ox + 5, oy + 3]],
      [[glintA, ox + 7, oy + 4]],
      [[glintB, ox + 5, oy + 3]],
    ]);
  };

  // Tilt — an accent phone rocking side to side, ball rolling across the
  // screen toward the goal star.
  ART.tilt = (m) => {
    const phone = [
      '.KKKKKKKKKKKK.',
      'KhAAAAAAAAAAAK',
      'KAKKKKKKKKKKAK',
      'KAKPPPPPPPPKAK',
      'KAKPPPPPPPPKAK',
      'KAKPPVVPPPPKAK',
      'KAKPPPPPPPPKAK',
      'KAKPPPPVVPPKAK',
      'KAKPPPPPPPPKAK',
      'KAKPPPPPPPPKAK',
      'KAKPPPPPPYPKAK',
      'KAKPPPPPPPPKAK',
      'KAKKKKKKKKKKAK',
      'KAAAAALLAAAAAK',
      'KaaaaaaaaaaaaK',
      '.KKKKKKKKKKKK.',
    ];
    const ball = ['EE', 'EE'];
    const oy = 8;
    return [
      blit(m, [[phone, 8, oy], [ball, 11, oy + 9], [['W'], 11, oy + 9]]),
      blit(m, [[phone, 9, oy], [ball, 14, oy + 10], [['W'], 14, oy + 10]]),
      blit(m, [[phone, 10, oy], [ball, 17, oy + 9], [['W'], 17, oy + 9]]),
      blit(m, [[phone, 9, oy], [ball, 14, oy + 10], [['W'], 14, oy + 10]]),
    ];
  };

  // The Dial — arcade gauge; green→yellow→red band, needle hunting.
  ART.dial = (m) => {
    const gauge = [
      '........KKKKKK........',
      '......KKYYYYYYKK......',
      '.....KEEYYYYYYRRK.....',
      '....KEEYWWWWWWYRRK....',
      '...KEEWWWWWWWWWWRRK...',
      '..KEEWWWWWWWWWWWWRRK..',
      '..KEWWWWWWWWWWWWWWRK..',
      '.KWWWWWWWWWWWWWWWWWWK.',
      '.KWWWWWWWWWWWWWWWWWWK.',
      'KWWWWWWWWWKKKKWWWWWWWK',
      'KWWWWWWWWWKAAKWWWWWWWK',
      'KKKKKKKKKKKKKKKKKKKKKK',
      '.KAAAAAAAAAAAAAAAAAAK.',
      '.KKKKKKKKKKKKKKKKKKK.',
    ];
    const nUp = ['KK', 'KK', 'KK', 'KK'];
    const nL = ['KK....', '.KK...', '..KKK.'];
    const nR = ['....KK', '...KK.', '.KKK..'];
    const ox = 5, oy = 10;
    const base = [[gauge, ox, oy]];
    return anim(m, base, [
      [[nL, ox + 5, oy + 5]],
      [[nUp, ox + 10, oy + 5]],
      [[nR, ox + 11, oy + 5]],
      [[nUp, ox + 10, oy + 5]],
    ]);
  };

  // Party Roulette — a stack of dare cards; the accent one pops with a "!".
  ART.roulette = (m) => {
    const backCard = [
      'KKKKKKKKKKKK',
      'KLLLLLLLLLLK',
      'KLWWWWWWWWLK',
      'KLWWWWWWWWLK',
      'KLWWWWWWWWLK',
      'KLWWWWWWWWLK',
      'KLWWWWWWWWLK',
      'KLWWWWWWWWLK',
      'KLWWWWWWWWLK',
      'KLWWWWWWWWLK',
      'KLWWWWWWWWLK',
      'KLLLLLLLLLLK',
      'KKKKKKKKKKKK',
    ];
    const front = [
      'KKKKKKKKKKKK',
      'KhhhhhhhhhhK',
      'KhAAAAAAAAhK',
      'KhAAAWWAAAhK',
      'KhAAAWWAAAhK',
      'KhAAAWWAAAhK',
      'KhAAAWWAAAhK',
      'KhAAAAAAAAhK',
      'KhAAAWWAAAhK',
      'KhAAAWWAAAhK',
      'KhAAAAAAAAhK',
      'KhhhhhhhhhhK',
      'KKKKKKKKKKKK',
    ];
    const upPos = [[backCard, 13, 6], [front, 6, 10]];
    const dnPos = [[backCard, 13, 6], [front, 6, 11]];
    return [
      blit(m, dnPos), blit(m, dnPos),
      blit(m, upPos.concat([[SPARK1, 20, 21]])),
      blit(m, upPos),
    ];
  };

  // Fake Facts — the growing nose. Accent cap, peach face, brown pixel nose
  // stretching longer and longer.
  ART.fakefacts = (m) => {
    const face = [
      '...KKKKKKKK...',
      '..KAAAAAAAAK..',
      '.KAhAAAAAAAAK.',
      '.KKKKKKKKKKKK.',
      '.KTTTTTTTTTTK.',
      'KTTTTTTTTTTTTK',
      'KTTKKTTTTKKTTK',
      'KTTKKTTTTKKTTK',
      'KTTTTTTTTTTTTK',
      'KTFFTTTTTTFFTK',
      'KTTTTTTTTTTTTK',
      '.KTTKKKKKKTTK.',
      '.KTTTTTTTTTTK.',
      '..KTTTTTTTTK..',
      '...KKKKKKKK...',
    ];
    const nose = (len) => {
      const t = 'T'.repeat(len) + 'K';
      const b = 'B'.repeat(len) + 'K';
      return ['K'.repeat(len + 1), t, b, 'K'.repeat(len + 1)];
    };
    const ox = 5, oy = 8;
    const base = [[face, ox, oy]];
    return anim(m, base, [
      [[nose(3), ox + 12, oy + 7]],
      [[nose(6), ox + 12, oy + 7]],
      [[nose(10), ox + 12, oy + 7]],
      [[nose(10), ox + 12, oy + 7], [SPARK2, 28, 12]],
    ]);
  };

  // One Clue — the idea bulb flicks on: dark bulb, lit bulb, blazing rays.
  ART.oneclue = (m) => {
    const bulbOn = [
      '....KKKKKK....',
      '..KKYYYYYYKK..',
      '.KYYWWYYYYYYK.',
      '.KYWWYYYYYYYK.',
      'KYYWYYYYYYYYYK',
      'KYYYYYYYYYYYYK',
      'KYYYYYYYYYYYYK',
      'KYYYYKYYKYYYYK',
      '.KYYYKYYKYYYK.',
      '.KYYYYKKYYYYK.',
      '..KKYYYYYYKK..',
      '...KYYYYYYK...',
      '....KKKKKK....',
      '....KLLLLK....',
      '....KDDDDK....',
      '....KLLLLK....',
      '.....KDDK.....',
      '......KK......',
    ];
    const bulbOff = bulbOn.map((r) => r.replace(/Y/g, 'V').replace(/W/g, 'L'));
    const raysA = [
      '.Y....YY....Y.',
      '..Y...YY...Y..',
    ];
    const raysB = [
      'Y.....YY.....Y',
      '.Y....YY....Y.',
    ];
    const sideA = [['Y..', 'Y..'], 3, 12];
    const sideR = [['..Y', '..Y'], 26, 12];
    const ox = 9, oy = 7;
    return [
      blit(m, [[bulbOff, ox, oy]]),
      blit(m, [[bulbOn, ox, oy], [raysA, ox, oy - 3]]),
      blit(m, [[bulbOn, ox, oy], [raysB, ox, oy - 4], sideA, sideR]),
      blit(m, [[bulbOn, ox, oy], [raysA, ox, oy - 3]]),
    ];
  };

  // Same Brain — two profile heads face to face, one shared thought-bolt.
  ART.samebrain = (m) => {
    const headL = [
      '..KKKKK..',
      '.KAAAAAK.',
      'KAAAAAAAK',
      'KAAAAAAAK',
      'KAAAKAAAKK',
      'KAAAAAAAAK',
      'KAAAAAAAKK',
      'KAAAAAAAK.',
      '.KAAAAAAK.',
      '.KAAAAAK..',
      '.KAAAAK...',
      '.KAAAAK...',
    ];
    const headR = headL.map((r) => r.split('').reverse().join('')).map((r) => r.replace(/A/g, 'C'));
    const boltY = ['..YY', '.YY.', 'YYYY', '..YY', '.YY.', '.Y..'];
    const boltW = ['..WW', '.WW.', 'WWWW', '..WW', '.WW.', '.W..'];
    const ox = 3, oy = 10;
    const base = [[headL, ox, oy], [headR, ox + 16, oy]];
    return anim(m, base, [
      [[boltY, 14, 8]],
      [[boltW, 14, 8]],
      [[boltY, 14, 8]],
      [[boltW, 14, 8]],
    ]);
  };

  // One Night Wolves — tiny night scene: full moon, howling wolf on a hill,
  // twinkling stars.
  ART.wolves = (m) => {
    const moon = [
      '..KKKK..',
      '.KYYYYK.',
      'KYYWYYYK',
      'KYYYYYYK',
      'KYYYTYYK',
      'KYTYYYYK',
      '.KYYYYK.',
      '..KKKK..',
    ];
    const wolf = [
      '..........KK..',
      '.........KKKV.',
      '........KKKKV.',
      '..KV....KKKV..',
      '..KKV..KKKKV..',
      '..KKKKKKKKKV..',
      '...KKKKKKKV...',
      '...KKKKKK.....',
      '..KKKKKKK.....',
      '.KKKKKKKKK.KV.',
      'KKKKKKKKKKKKV.',
      'KKKKKKKKKKKK..',
      '.KKKKKKKKKK...',
    ];
    const hill = [
      '...VVVVVVVVVVVVVVVV...',
      '..KKKKKKKKKKKKKKKKKK..',
      '.KKKKKKKKKKKKKKKKKKKK.',
      'KKKKKKKKKKKKKKKKKKKKKK',
      'KKKKKKKKKKKKKKKKKKKKKK',
      'KKKKKKKKKKKKKKKKKKKKKK',
    ];
    const stars1 = [[['W'], 6, 6], [['W'], 11, 11], [['W'], 27, 16]];
    const stars2 = [[['W'], 8, 14], [['W'], 14, 5], [['W'], 4, 17]];
    const howl = [['.V', 'V.'], 17, 5];
    const base = [[moon, 20, 4], [hill, 5, 21]];
    const wolfUp = [wolf, 8, 8];
    const wolfDn = [wolf, 8, 9];
    return [
      blit(m, base.concat([wolfDn], stars1)),
      blit(m, base.concat([wolfUp], stars1, [howl])),
      blit(m, base.concat([wolfUp], stars2, [howl])),
      blit(m, base.concat([wolfDn], stars2)),
    ];
  };

  // Welcome — a heart pickup pulsing like a health drop.
  ART.welcome = (m) => {
    const big = [
      '.KKKK...KKKK.',
      'KAAAAK.KAAAAK',
      'KAhAAAKAAAAAK',
      'KAhhAAAAAAAAK',
      'KAAAAAAAAAAAK',
      '.KAAAAAAAAAK.',
      '..KAAAAAAAK..',
      '...KAAAAAK...',
      '....KAAAK....',
      '.....KAK.....',
      '......K......',
    ];
    const small = [
      '.KKK..KKK.',
      'KAAAKKAAAK',
      'KAhAAAAAAK',
      'KAAAAAAAAK',
      '.KAAAAAAK.',
      '..KAAAAK..',
      '...KAAK...',
      '....KK....',
    ];
    return [
      blit(m, [[big, 9, 10], [SPARK1, 24, 8]]),
      blit(m, [[big, 9, 10], [SPARK2, 24, 8], [['W'], 6, 19]]),
      blit(m, [[small, 11, 12]]),
      blit(m, [[small, 11, 12], [SPARK1, 24, 8]]),
    ];
  };

  // ---- lettered fallback: arcade tile + 5×7 pixel font ----------------------
  const FONT = {
    A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
    B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
    C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
    D: ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
    E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
    F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
    G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
    H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
    I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
    J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
    K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
    L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
    M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
    N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
    O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
    P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
    R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
    S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
    T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
    U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
    W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
    X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
    Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
    Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
    '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
    '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
    '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
    '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
  };
  // Scale a 5×7 glyph ×2 → 10×14 rows of 'W' pixels (with a 'K' drop shadow
  // baked separately at blit time via an offset copy).
  function glyphRows(letter, ch) {
    const g = FONT[letter] || FONT['?'];
    const out = [];
    for (const row of g) {
      const wide = row.split('').map((b) => (b === '1' ? ch + ch : '..')).join('');
      out.push(wide, wide);
    }
    return out;
  }
  function fallbackFrames(letter, m) {
    const tile = [];
    tile.push('.KKKKKKKKKKKKKKKKKKKK.');
    tile.push('K' + 'h'.repeat(20) + 'K');
    for (let i = 0; i < 18; i++) tile.push('Kh' + 'A'.repeat(17) + 'a' + 'K');
    tile.push('K' + 'a'.repeat(20) + 'K');
    tile.push('.KKKKKKKKKKKKKKKKKKKK.');
    const shadow = glyphRows(letter, 'K');
    const face = glyphRows(letter, 'W');
    const base = [[tile, 5, 5], [shadow, 12, 10], [face, 11, 9]];
    const corners = [[SPARK1, 7, 7], [SPARK1, 22, 7], [SPARK1, 22, 22], [SPARK1, 7, 22]];
    return [0, 1, 2, 3].map((f) => blit(m, base.concat([corners[f]])));
  }

  GifOS.iconPacks.register('eightbit', {
    size: SIZE, frames: FR, delayCs: DELAY,
    draw(subject, accent) {
      const builder = ART[subject];
      if (!builder) return null;
      return builder(accentMap(accent));
    },
    fallback(letter, accent) {
      return fallbackFrames(letter, accentMap(accent));
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
