// Jungle / Dou Shou Qi rules. 7×9, dens, traps, two rivers.
// Public-domain animal chess: our engine, not a wrap of anyone's.
// Blue sits the top of the array and moves first. Red sits the bottom.
(function (root) {
  'use strict';
  var COLS = 7, ROWS = 9;
  var EMPTY = 0, RED = 1, BLUE = 2;
  var RAT = 1, CAT = 2, DOG = 3, WOLF = 4, LEOPARD = 5, TIGER = 6, LION = 7, ELEPHANT = 8;
  var DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var LETTER = ['', 'R', 'C', 'D', 'W', 'P', 'T', 'L', 'E'];
  var NAME = ['', 'Rat', 'Cat', 'Dog', 'Wolf', 'Leopard', 'Tiger', 'Lion', 'Elephant'];
  var EMOJI = ['', '🐀', '🐈', '🐕', '🐺', '🐆', '🐯', '🦁', '🐘'];

  function pack(side, rank) { return (side << 4) | rank; }
  function sideOf(p) { return p >> 4; }
  function rankOf(p) { return p & 15; }

  function cloneMap(map) {
    var arr = [], i;
    for (i = 0; i < map.length; i++) arr[i] = map[i].slice();
    return arr;
  }

  function onBoard(r, c) {
    return r >= 0 && r < ROWS && c >= 0 && c < COLS;
  }

  // Two 3×2 water rectangles: rows 3–5, columns 1–2 and 4–5.
  function isWater(r, c) {
    if (r < 3 || r > 5) return false;
    return c === 1 || c === 2 || c === 4 || c === 5;
  }

  function denOf(side) {
    return side === RED ? { r: 8, c: 3 } : { r: 0, c: 3 };
  }

  function isDenOf(r, c, side) {
    var d = denOf(side);
    return d.r === r && d.c === c;
  }

  function trapsOf(side) {
    return side === RED
      ? [{ r: 8, c: 2 }, { r: 8, c: 4 }, { r: 7, c: 3 }]
      : [{ r: 0, c: 2 }, { r: 0, c: 4 }, { r: 1, c: 3 }];
  }

  function isTrapOf(r, c, side) {
    var t = trapsOf(side), i;
    for (i = 0; i < t.length; i++) if (t[i].r === r && t[i].c === c) return true;
    return false;
  }

  function isTrap(r, c) {
    return isTrapOf(r, c, RED) || isTrapOf(r, c, BLUE);
  }

  function isDen(r, c) {
    return isDenOf(r, c, RED) || isDenOf(r, c, BLUE);
  }

  // A piece in an *opponent* trap has rank 0. Own traps do nothing.
  function effectiveRank(p, r, c) {
    var s = sideOf(p);
    if (isTrapOf(r, c, s === RED ? BLUE : RED)) return 0;
    return rankOf(p);
  }

  function countSide(map, side) {
    var n = 0, r, c, p;
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
      p = map[r][c];
      if (p && sideOf(p) === side) n++;
    }
    return n;
  }

  // Attacker on (ar,ac) taking defender on (dr,dc). Defender 0 = empty.
  function canCapture(attacker, ar, ac, defender, dr, dc) {
    if (!defender) return true;
    if (sideOf(attacker) === sideOf(defender)) return false;
    var aw = isWater(ar, ac), dw = isWater(dr, dc);
    // Land and water cannot take each other. A rat in water is only
    // taken by a rat in water; a rat cannot take the elephant from water.
    if (aw !== dw) return false;
    var drank = effectiveRank(defender, dr, dc);
    if (drank === 0) return true;
    var aR = rankOf(attacker), dR = rankOf(defender);
    if (aR === ELEPHANT && dR === RAT) return false;
    if (aR === RAT && dR === ELEPHANT) return !aw;
    return effectiveRank(attacker, ar, ac) >= drank;
  }

  function jumpLand(map, r, c, dr, dc) {
    var nr = r + dr, nc = c + dc;
    if (!onBoard(nr, nc) || !isWater(nr, nc)) return null;
    while (onBoard(nr, nc) && isWater(nr, nc)) {
      if (map[nr][nc]) {
        if (rankOf(map[nr][nc]) === RAT) return null;
        return null;
      }
      nr += dr;
      nc += dc;
    }
    if (!onBoard(nr, nc) || isWater(nr, nc)) return null;
    if (nr === r + dr && nc === c + dc) return null;
    return { r: nr, c: nc };
  }

  function legalMoves(s) {
    if (!s || s.winner) return [];
    var map = s.map, player = s.turn, out = [], r, c, p, i, nr, nc, dest, rk, d;
    for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
      p = map[r][c];
      if (!p || sideOf(p) !== player) continue;
      rk = rankOf(p);
      for (i = 0; i < 4; i++) {
        nr = r + DIRS[i][0];
        nc = c + DIRS[i][1];
        if (!onBoard(nr, nc)) continue;
        if (isDenOf(nr, nc, player)) continue;
        if (isWater(nr, nc) && rk !== RAT) continue;
        dest = map[nr][nc];
        if (dest && sideOf(dest) === player) continue;
        if (!canCapture(p, r, c, dest, nr, nc)) continue;
        out.push({
          fr: r, fc: c, tr: nr, tc: nc,
          capture: dest ? 1 : 0, jump: 0
        });
      }
      if (rk === LION || rk === TIGER) {
        for (i = 0; i < 4; i++) {
          d = jumpLand(map, r, c, DIRS[i][0], DIRS[i][1]);
          if (!d) continue;
          if (isDenOf(d.r, d.c, player)) continue;
          dest = map[d.r][d.c];
          if (dest && sideOf(dest) === player) continue;
          if (!canCapture(p, r, c, dest, d.r, d.c)) continue;
          out.push({
            fr: r, fc: c, tr: d.r, tc: d.c,
            capture: dest ? 1 : 0, jump: 1
          });
        }
      }
    }
    return out;
  }

  function emptyMap() {
    var map = [], r, c;
    for (r = 0; r < ROWS; r++) {
      map[r] = [];
      for (c = 0; c < COLS; c++) map[r][c] = EMPTY;
    }
    return map;
  }

  // Standard Jungle start. Red at the bottom of the array; Blue is the
  // 180° rotation, so each animal faces its counterpart.
  function placeStart(map) {
    map[8][0] = pack(RED, LION);
    map[8][6] = pack(RED, TIGER);
    map[7][1] = pack(RED, DOG);
    map[7][5] = pack(RED, CAT);
    map[6][0] = pack(RED, RAT);
    map[6][2] = pack(RED, LEOPARD);
    map[6][4] = pack(RED, WOLF);
    map[6][6] = pack(RED, ELEPHANT);
    map[0][6] = pack(BLUE, LION);
    map[0][0] = pack(BLUE, TIGER);
    map[1][5] = pack(BLUE, DOG);
    map[1][1] = pack(BLUE, CAT);
    map[2][6] = pack(BLUE, RAT);
    map[2][4] = pack(BLUE, LEOPARD);
    map[2][2] = pack(BLUE, WOLF);
    map[2][0] = pack(BLUE, ELEPHANT);
  }

  function fresh() {
    var map = emptyMap();
    placeStart(map);
    return {
      map: map, n: 0, turn: BLUE, last: null, winner: EMPTY,
      reds: 8, blues: 8
    };
  }

  function play(s, fr, fc, tr, tc) {
    if (!s || s.winner) return null;
    var moves = legalMoves(s), i, m = null;
    for (i = 0; i < moves.length; i++) {
      if (moves[i].fr === fr && moves[i].fc === fc && moves[i].tr === tr && moves[i].tc === tc) {
        m = moves[i];
        break;
      }
    }
    if (!m) return null;
    var map = cloneMap(s.map);
    var piece = map[fr][fc];
    var captured = map[tr][tc];
    map[fr][fc] = EMPTY;
    map[tr][tc] = piece;
    var other = s.turn === RED ? BLUE : RED;
    var reds = countSide(map, RED), blues = countSide(map, BLUE);
    var next = {
      map: map,
      n: s.n + 1,
      turn: other,
      last: { fr: fr, fc: fc, tr: tr, tc: tc, capture: captured || 0, jump: m.jump, color: s.turn },
      winner: EMPTY,
      reds: reds,
      blues: blues
    };
    if (isDenOf(tr, tc, other)) {
      next.winner = s.turn;
      next.turn = s.turn;
      return next;
    }
    if ((other === RED ? reds : blues) === 0) {
      next.winner = s.turn;
      next.turn = s.turn;
      return next;
    }
    var probe = { map: map, turn: other, winner: EMPTY };
    if (legalMoves(probe).length === 0) {
      next.winner = s.turn;
      next.turn = s.turn;
    }
    return next;
  }

  function replay(moves) {
    var s = fresh(), i, ns, m;
    for (i = 0; i < (moves || []).length; i++) {
      m = moves[i];
      ns = play(s, m.fr, m.fc, m.tr, m.tc);
      if (!ns) break;
      s = ns;
    }
    return s;
  }

  function colorName(n) {
    if (n === RED) return 'red';
    if (n === BLUE) return 'blue';
    return '';
  }
  function colorNum(name) {
    if (name === 'red') return RED;
    if (name === 'blue') return BLUE;
    return EMPTY;
  }

  function squareKind(r, c) {
    if (isDenOf(r, c, RED)) return 'den red';
    if (isDenOf(r, c, BLUE)) return 'den blue';
    if (isTrapOf(r, c, RED)) return 'trap red';
    if (isTrapOf(r, c, BLUE)) return 'trap blue';
    if (isWater(r, c)) return 'water';
    return 'land';
  }

  root.JG = {
    COLS: COLS, ROWS: ROWS,
    EMPTY: EMPTY, RED: RED, BLUE: BLUE,
    RAT: RAT, CAT: CAT, DOG: DOG, WOLF: WOLF,
    LEOPARD: LEOPARD, TIGER: TIGER, LION: LION, ELEPHANT: ELEPHANT,
    LETTER: LETTER, NAME: NAME, EMOJI: EMOJI,
    pack: pack, sideOf: sideOf, rankOf: rankOf,
    cloneMap: cloneMap, onBoard: onBoard,
    isWater: isWater, isTrap: isTrap, isDen: isDen,
    isDenOf: isDenOf, isTrapOf: isTrapOf, denOf: denOf, trapsOf: trapsOf,
    effectiveRank: effectiveRank, canCapture: canCapture,
    legalMoves: legalMoves, emptyMap: emptyMap,
    fresh: fresh, play: play, replay: replay,
    colorName: colorName, colorNum: colorNum,
    countSide: countSide, squareKind: squareKind
  };
})(typeof window !== 'undefined' ? window : this);
