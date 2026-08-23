// Connect Four rules. 6×7, drop in a column, four in a line.
// Transcribed from kenrick95/c4 core/src/board/base.ts + core/src/utils.ts (MIT).
(function (root) {
  'use strict';
  var ROWS = 6, COLUMNS = 7;
  var EMPTY = 0, P1 = 1, P2 = 2, DRAW = -1;
  var COLOR1 = '#ef453b', COLOR2 = '#0059ff', MASK = '#d8d8d8';

  function cloneMap(map) {
    var arr = [], i;
    for (i = 0; i < map.length; i++) arr[i] = map[i].slice();
    return arr;
  }

  // kenrick95/c4 getMockPlayerAction — row 0 is the TOP of the board.
  function mockDrop(map, piece, column) {
    var cloned = cloneMap(map);
    if (column < 0 || column >= COLUMNS || cloned[0][column] !== EMPTY) {
      return { success: false, map: cloned, row: -1 };
    }
    var filled = false, row = 0, i;
    for (i = 0; i < ROWS - 1; i++) {
      if (cloned[i + 1][column] !== EMPTY) {
        filled = true;
        row = i;
        break;
      }
    }
    if (!filled) row = ROWS - 1;
    cloned[row][column] = piece;
    return { success: true, map: cloned, row: row };
  }

  // kenrick95/c4 BoardBase.getWinner — walk one ray of 4 from each disc.
  function getWinner(map) {
    var direction = [
      [0, -1], [0, 1], [-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]
    ];
    function walk(i, j, piece, dir, count, cells) {
      if (count >= 4) return true;
      if (i < 0 || j < 0 || i >= ROWS || j >= COLUMNS || map[i][j] !== piece) return false;
      cells.push({ r: i, c: j });
      return walk(i + dir[0], j + dir[1], piece, dir, count + 1, cells);
    }
    var empty = 0, i, j, k, piece, cells;
    for (i = 0; i < ROWS; i++) {
      for (j = 0; j < COLUMNS; j++) {
        piece = map[i][j];
        if (piece === EMPTY) { empty++; continue; }
        for (k = 0; k < direction.length; k++) {
          cells = [{ r: i, c: j }];
          if (walk(i + direction[k][0], j + direction[k][1], piece, direction[k], 1, cells)) {
            return { winner: piece, line: cells.slice(0, 4) };
          }
        }
      }
    }
    if (empty === 0) return { winner: DRAW, line: null };
    return { winner: EMPTY, line: null };
  }

  function fresh() {
    var map = [], i, j;
    for (i = 0; i < ROWS; i++) {
      map[i] = [];
      for (j = 0; j < COLUMNS; j++) map[i][j] = EMPTY;
    }
    return { map: map, n: 0, turn: P1, last: null, winner: EMPTY, winLine: null };
  }

  function drop(s, col) {
    if (!s || s.winner) return null;
    var next = mockDrop(s.map, s.turn, col);
    if (!next.success) return null;
    var ns = {
      map: next.map,
      n: s.n + 1,
      turn: s.turn === P1 ? P2 : P1,
      last: { r: next.row, c: col },
      winner: EMPTY,
      winLine: null
    };
    var w = getWinner(ns.map);
    if (w.winner) {
      ns.winner = w.winner;
      ns.winLine = w.line;
    }
    return ns;
  }

  function replay(moves) {
    var s = fresh(), i, ns;
    for (i = 0; i < (moves || []).length; i++) {
      ns = drop(s, moves[i]);
      if (!ns) break;
      s = ns;
    }
    return s;
  }

  function canDrop(s, col) {
    return !!(s && !s.winner && col >= 0 && col < COLUMNS && s.map[0][col] === EMPTY);
  }

  function colorName(n) {
    if (n === P1) return 'red';
    if (n === P2) return 'blue';
    if (n === DRAW) return 'draw';
    return '';
  }
  function colorNum(name) {
    if (name === 'red') return P1;
    if (name === 'blue') return P2;
    return EMPTY;
  }
  function hex(n) {
    if (n === P1) return COLOR1;
    if (n === P2) return COLOR2;
    return 'transparent';
  }

  // Mid-game that leaves three red in a row on the bottom; red to play
  // column 0 completes four. Used by the store cover (and its self-test).
  var COVER_MOVES = [3, 3, 2, 4, 4, 2, 1, 5, 5, 1];

  root.C4 = {
    ROWS: ROWS, COLUMNS: COLUMNS,
    EMPTY: EMPTY, P1: P1, P2: P2, DRAW: DRAW,
    COLOR1: COLOR1, COLOR2: COLOR2, MASK: MASK,
    COVER_MOVES: COVER_MOVES,
    cloneMap: cloneMap, mockDrop: mockDrop, getWinner: getWinner,
    fresh: fresh, drop: drop, replay: replay, canDrop: canDrop,
    colorName: colorName, colorNum: colorNum, hex: hex
  };
})(typeof window !== 'undefined' ? window : this);
