// Checkers / draughts rules. 10×10, dark squares, must jump, men forward,
// kings any diagonal. Transcribed from stroibot/Checkers (MIT).
// White sits the bottom and goes first — same as upstream.
(function (root) {
  'use strict';
  var SIZE = 10;
  var EMPTY = 0, BLACK = 1, WHITE = 2, DRAW = -1;
  var KING = 4;
  var DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

  function owner(p) { return p & 3; }
  function isKing(p) { return !!(p & KING); }
  function withKing(p) { return p | KING; }
  function isDark(r, c) { return ((r + c) & 1) === 1; }

  function cloneMap(map) {
    var arr = [], i;
    for (i = 0; i < map.length; i++) arr[i] = map[i].slice();
    return arr;
  }

  function onBoard(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function dirsOf(piece) {
    if (isKing(piece)) return DIAG;
    if (owner(piece) === BLACK) return [[1, 1], [1, -1]];
    return [[-1, 1], [-1, -1]];
  }

  function countPieces(map) {
    var blacks = 0, whites = 0, r, c, p;
    for (r = 0; r < SIZE; r++) for (c = 0; c < SIZE; c++) {
      p = map[r][c];
      if (owner(p) === BLACK) blacks++;
      else if (owner(p) === WHITE) whites++;
    }
    return { blacks: blacks, whites: whites };
  }

  // Dark squares in row-major order, matching Board.GetAllPosibleTiles.
  function darkSquares() {
    var out = [], r, c;
    for (r = 0; r < SIZE; r++) for (c = 0; c < SIZE; c++) {
      if (isDark(r, c)) out.push({ r: r, c: c });
    }
    return out;
  }

  function piecesOf(map, player) {
    var out = [], r, c;
    for (r = 0; r < SIZE; r++) for (c = 0; c < SIZE; c++) {
      if (owner(map[r][c]) === player) out.push({ r: r, c: c, piece: map[r][c] });
    }
    return out;
  }

  function jumpTo(map, fr, fc, tr, tc) {
    var piece = map[fr][fc];
    if (!piece || !onBoard(tr, tc) || map[tr][tc] !== EMPTY) return null;
    var dr = tr - fr, dc = tc - fc;
    if (Math.abs(dr) !== 2 || Math.abs(dc) !== 2) return null;
    var sr = dr < 0 ? -1 : 1, sc = dc < 0 ? -1 : 1;
    var dirs = dirsOf(piece), ok = false, i;
    for (i = 0; i < dirs.length; i++) {
      if (dirs[i][0] === sr && dirs[i][1] === sc) { ok = true; break; }
    }
    if (!ok) return null;
    var mr = fr + sr, mc = fc + sc;
    var mid = map[mr][mc];
    if (!mid || owner(mid) === owner(piece)) return null;
    return { fr: fr, fc: fc, tr: tr, tc: tc, capture: { r: mr, c: mc } };
  }

  function quietTo(map, fr, fc, tr, tc) {
    var piece = map[fr][fc];
    if (!piece || !onBoard(tr, tc) || map[tr][tc] !== EMPTY) return null;
    var dr = tr - fr, dc = tc - fc;
    if (Math.abs(dr) !== 1 || Math.abs(dc) !== 1) return null;
    var dirs = dirsOf(piece), i;
    for (i = 0; i < dirs.length; i++) {
      if (dirs[i][0] === dr && dirs[i][1] === dc) {
        return { fr: fr, fc: fc, tr: tr, tc: tc, capture: null };
      }
    }
    return null;
  }

  function capturesFrom(map, r, c) {
    var out = [], dark = darkSquares(), i, m;
    for (i = 0; i < dark.length; i++) {
      if (map[dark[i].r][dark[i].c] !== EMPTY) continue;
      m = jumpTo(map, r, c, dark[i].r, dark[i].c);
      if (m) out.push(m);
    }
    return out;
  }

  // Dest-major, then piece-major — same walk as Board.GetPossibleMoves / AI.DoJump.
  function legalMoves(s) {
    if (!s || s.winner) return [];
    var map = s.map, player = s.turn;
    var dark = darkSquares();
    var pieces = s.locked
      ? piecesOf(map, player).filter(function (p) { return p.r === s.locked.r && p.c === s.locked.c; })
      : piecesOf(map, player);
    var caps = [], quiets = [], i, j, m, tile, piece;
    for (i = 0; i < dark.length; i++) {
      tile = dark[i];
      if (map[tile.r][tile.c] !== EMPTY) continue;
      for (j = 0; j < pieces.length; j++) {
        piece = pieces[j];
        m = jumpTo(map, piece.r, piece.c, tile.r, tile.c);
        if (m) caps.push(m);
      }
    }
    if (s.locked) return caps;
    if (caps.length) return caps;
    for (i = 0; i < dark.length; i++) {
      tile = dark[i];
      if (map[tile.r][tile.c] !== EMPTY) continue;
      for (j = 0; j < pieces.length; j++) {
        piece = pieces[j];
        m = quietTo(map, piece.r, piece.c, tile.r, tile.c);
        if (m) quiets.push(m);
      }
    }
    return quiets;
  }

  // PlaceCheckers: skip-toggle on (r+c) odd, rows [start, end).
  function placeMen(map, player, start, end) {
    var skip = true, i, j;
    for (i = start; i < end; i++) {
      for (j = 0; j < SIZE; j++) {
        if (skip) skip = !skip;
        else { map[i][j] = player; skip = !skip; }
      }
      skip = !skip;
    }
  }

  function fresh() {
    var map = [], i, j;
    for (i = 0; i < SIZE; i++) {
      map[i] = [];
      for (j = 0; j < SIZE; j++) map[i][j] = EMPTY;
    }
    placeMen(map, BLACK, 0, Math.floor(SIZE / 2) - 1);
    placeMen(map, WHITE, SIZE - (Math.floor(SIZE / 2) - 1), SIZE);
    var n = countPieces(map);
    return {
      map: map, n: 0, turn: WHITE, last: null, locked: null,
      winner: EMPTY, blacks: n.blacks, whites: n.whites
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
    map[fr][fc] = EMPTY;
    if (m.capture) map[m.capture.r][m.capture.c] = EMPTY;
    var crowned = false;
    if (!isKing(piece) && (tr === 0 || tr === SIZE - 1)) {
      piece = withKing(piece);
      crowned = true;
    }
    map[tr][tc] = piece;
    var n = countPieces(map);
    var next = {
      map: map,
      n: s.n + 1,
      turn: s.turn,
      last: {
        fr: fr, fc: fc, tr: tr, tc: tc,
        capture: m.capture ? { r: m.capture.r, c: m.capture.c } : null,
        crowned: crowned, color: s.turn
      },
      locked: null,
      winner: EMPTY,
      blacks: n.blacks,
      whites: n.whites
    };
    if (m.capture && capturesFrom(map, tr, tc).length) {
      next.locked = { r: tr, c: tc };
      return next;
    }
    if (n.blacks === 0) { next.winner = WHITE; next.turn = s.turn; return next; }
    if (n.whites === 0) { next.winner = BLACK; next.turn = s.turn; return next; }
    var other = s.turn === BLACK ? WHITE : BLACK;
    next.turn = other;
    var probe = { map: map, turn: other, locked: null, winner: EMPTY };
    if (legalMoves(probe).length === 0) next.winner = s.turn;
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
    if (n === BLACK) return 'black';
    if (n === WHITE) return 'white';
    if (n === DRAW) return 'draw';
    return '';
  }
  function colorNum(name) {
    if (name === 'black') return BLACK;
    if (name === 'white') return WHITE;
    return EMPTY;
  }

  root.CK = {
    SIZE: SIZE, EMPTY: EMPTY, BLACK: BLACK, WHITE: WHITE, DRAW: DRAW, KING: KING,
    owner: owner, isKing: isKing, isDark: isDark, cloneMap: cloneMap,
    legalMoves: legalMoves, capturesFrom: capturesFrom,
    fresh: fresh, play: play, replay: replay,
    colorName: colorName, colorNum: colorNum, countPieces: countPieces
  };
})(typeof window !== 'undefined' ? window : this);
