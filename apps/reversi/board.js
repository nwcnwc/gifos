// Reversi / Othello rules. 8×8, place, flip a line, pass if you cannot.
// Transcribed from alex-berson/reversi js/reversi.js (MIT).
(function (root) {
  'use strict';
  var SIZE = 8;
  var EMPTY = 0, BLACK = 1, WHITE = 2, DRAW = -1;
  var DIRS = [[-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1]];

  function cloneMap(map) {
    var arr = [], i;
    for (i = 0; i < map.length; i++) arr[i] = map[i].slice();
    return arr;
  }

  function validCoords(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function shuffle(array) {
    var i, j, t;
    for (i = array.length - 1; i > 0; i--) {
      j = Math.trunc(Math.random() * (i + 1));
      t = array[i]; array[i] = array[j]; array[j] = t;
    }
    return array;
  }

  function validMove(board, color, r, c) {
    var opponent = color == BLACK ? WHITE : BLACK;
    var d, dir, i, rr, cc;
    if (!validCoords(r, c) || board[r][c] != EMPTY) return false;
    for (d = 0; d < DIRS.length; d++) {
      dir = DIRS[d];
      if (validCoords(r + dir[0], c + dir[1]) && board[r + dir[0]][c + dir[1]] == opponent) {
        for (i = 2; i < SIZE; i++) {
          rr = r + dir[0] * i;
          cc = c + dir[1] * i;
          if (validCoords(rr, cc) && board[rr][cc] == EMPTY) break;
          if (validCoords(rr, cc) && board[rr][cc] == color) return true;
        }
      }
    }
    return false;
  }

  function availableMoves(board, color) {
    var moves = [], r, c;
    for (r = 0; r < SIZE; r++) {
      for (c = 0; c < SIZE; c++) {
        if (validMove(board, color, r, c)) moves.push({ r: r, c: c });
      }
    }
    return moves;
  }

  function randomMove(board, color) {
    var rows = shuffle([0, 1, 2, 3, 4, 5, 6, 7]);
    var cols = shuffle([0, 1, 2, 3, 4, 5, 6, 7]);
    var i, j, r, c;
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      for (j = 0; j < cols.length; j++) {
        c = cols[j];
        if (validMove(board, color, r, c)) return { r: r, c: c };
      }
    }
    return null;
  }

  // Mutates board. Returns the placed disk plus every disk that flipped.
  function makeMove(board, color, move) {
    var r = move.r, c = move.c;
    var flippedDisks = [move];
    var opponent = color == BLACK ? WHITE : BLACK;
    var d, dir, i, rr, cc, tempFlipped;
    for (d = 0; d < DIRS.length; d++) {
      dir = DIRS[d];
      tempFlipped = [];
      if (validCoords(r + dir[0], c + dir[1]) && board[r + dir[0]][c + dir[1]] == opponent) {
        tempFlipped.push({ r: r + dir[0], c: c + dir[1] });
        for (i = 2; i < SIZE; i++) {
          rr = r + dir[0] * i;
          cc = c + dir[1] * i;
          if (validCoords(rr, cc) && board[rr][cc] == EMPTY) break;
          if (validCoords(rr, cc) && board[rr][cc] == opponent) {
            tempFlipped.push({ r: rr, c: cc });
          }
          if (validCoords(rr, cc) && board[rr][cc] == color) {
            flippedDisks = flippedDisks.concat(tempFlipped);
            break;
          }
        }
      }
    }
    for (i = 0; i < flippedDisks.length; i++) board[flippedDisks[i].r][flippedDisks[i].c] = color;
    return flippedDisks;
  }

  function boardFull(board) {
    var r, c;
    for (r = 0; r < SIZE; r++) {
      for (c = 0; c < SIZE; c++) {
        if (board[r][c] == EMPTY) return false;
      }
    }
    return true;
  }

  // Original winner(): [black|white|0, blacks, whites]. 0 is a draw.
  function winner(board) {
    var whites = 0, blacks = 0, r, c;
    for (r = 0; r < SIZE; r++) {
      for (c = 0; c < SIZE; c++) {
        if (board[r][c] == WHITE) whites++;
        if (board[r][c] == BLACK) blacks++;
      }
    }
    var diff = blacks - whites;
    return [diff > 0 ? BLACK : diff < 0 ? WHITE : 0, blacks, whites];
  }

  function bothStuck(board) {
    return availableMoves(board, BLACK).length == 0 && availableMoves(board, WHITE).length == 0;
  }

  function fresh() {
    var map = [
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 2, 1, 0, 0, 0],
      [0, 0, 0, 1, 2, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0, 0, 0]
    ];
    return {
      map: map, n: 0, turn: BLACK, last: null, flipped: null,
      winner: EMPTY, blacks: 2, whites: 2, passed: false
    };
  }

  function place(s, r, c) {
    if (!s || s.winner) return null;
    if (!validMove(s.map, s.turn, r, c)) return null;
    var map = cloneMap(s.map);
    var flipped = makeMove(map, s.turn, { r: r, c: c });
    var nextTurn = s.turn == BLACK ? WHITE : BLACK;
    var passed = false;
    var over = boardFull(map) || bothStuck(map);
    if (!over) {
      if (availableMoves(map, nextTurn).length == 0) {
        if (availableMoves(map, s.turn).length == 0) over = true;
        else { passed = true; nextTurn = s.turn; }
      }
    }
    var w = winner(map);
    var who = EMPTY;
    if (over) who = w[0] === 0 ? DRAW : w[0];
    return {
      map: map,
      n: s.n + 1,
      turn: nextTurn,
      last: { r: r, c: c, color: s.turn },
      flipped: flipped,
      winner: who,
      blacks: w[1],
      whites: w[2],
      passed: passed
    };
  }

  function replay(moves) {
    var s = fresh(), i, ns, m;
    for (i = 0; i < (moves || []).length; i++) {
      m = moves[i];
      ns = place(s, m.r, m.c);
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

  root.RV = {
    SIZE: SIZE, EMPTY: EMPTY, BLACK: BLACK, WHITE: WHITE, DRAW: DRAW,
    cloneMap: cloneMap, validCoords: validCoords, shuffle: shuffle,
    validMove: validMove, availableMoves: availableMoves, randomMove: randomMove,
    makeMove: makeMove, boardFull: boardFull, winner: winner,
    fresh: fresh, place: place, replay: replay,
    colorName: colorName, colorNum: colorNum
  };
})(typeof window !== 'undefined' ? window : this);
