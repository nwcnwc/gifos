// 3×3 three-in-a-row. Pure rules + a tiny CPU — no DOM, no network.
(function (root) {
  'use strict';
  var N = 3;
  var EMPTY = 0, X = 1, O = 2;
  var LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  var CORNERS = [0, 2, 6, 8];
  var SIDES = [1, 3, 5, 7];

  function fresh() {
    return { cells: [0, 0, 0, 0, 0, 0, 0, 0, 0], n: 0, turn: X, last: null, winner: 0, winLine: null };
  }

  function idx(r, c) { return r * N + c; }

  function at(s, r, c) {
    if (r < 0 || c < 0 || r >= N || c >= N) return -1;
    return s.cells[idx(r, c)];
  }

  function clone(s) {
    return {
      cells: s.cells.slice(),
      n: s.n,
      turn: s.turn,
      last: s.last ? { r: s.last.r, c: s.last.c } : null,
      winner: s.winner,
      winLine: s.winLine ? s.winLine.slice() : null
    };
  }

  function lineOf(cells, mark) {
    var i, L;
    for (i = 0; i < LINES.length; i++) {
      L = LINES[i];
      if (cells[L[0]] === mark && cells[L[1]] === mark && cells[L[2]] === mark) return L.slice();
    }
    return null;
  }

  function fromCells(cells) {
    var s = fresh();
    if (!cells || cells.length !== 9) return s;
    s.cells = cells.slice();
    var n = 0, i;
    for (i = 0; i < 9; i++) if (s.cells[i]) n++;
    s.n = n;
    s.turn = (n % 2 === 0) ? X : O;
    var line = lineOf(s.cells, X) || lineOf(s.cells, O);
    if (line) {
      s.winner = s.cells[line[0]];
      s.winLine = line;
    } else if (n === 9) {
      s.winner = -1;
    }
    return s;
  }

  function place(s, r, c) {
    if (s.winner || at(s, r, c) !== EMPTY) return null;
    var ns = clone(s);
    ns.cells[idx(r, c)] = s.turn;
    ns.n++;
    ns.last = { r: r, c: c };
    var line = lineOf(ns.cells, s.turn);
    if (line) {
      ns.winner = s.turn;
      ns.winLine = line;
    } else if (ns.n === N * N) {
      ns.winner = -1;
    } else {
      ns.turn = s.turn === X ? O : X;
    }
    return ns;
  }

  function placeI(s, i) { return place(s, (i / N) | 0, i % N); }

  function wouldWin(cells, i, mark) {
    if (cells[i]) return false;
    var c = cells.slice();
    c[i] = mark;
    return !!lineOf(c, mark);
  }

  // Tiny CPU: win, else block, else centre, else a corner, else a side.
  function cpuPick(s) {
    if (!s || s.winner) return null;
    var me = s.turn, them = me === X ? O : X, cells = s.cells, i;
    for (i = 0; i < 9; i++) if (wouldWin(cells, i, me)) return { r: (i / N) | 0, c: i % N };
    for (i = 0; i < 9; i++) if (wouldWin(cells, i, them)) return { r: (i / N) | 0, c: i % N };
    if (!cells[4]) return { r: 1, c: 1 };
    for (i = 0; i < CORNERS.length; i++) if (!cells[CORNERS[i]]) {
      return { r: (CORNERS[i] / N) | 0, c: CORNERS[i] % N };
    }
    for (i = 0; i < SIDES.length; i++) if (!cells[SIDES[i]]) {
      return { r: (SIDES[i] / N) | 0, c: SIDES[i] % N };
    }
    return null;
  }

  function colorName(n) {
    if (n === X) return 'x';
    if (n === O) return 'o';
    return '';
  }
  function colorNum(name) {
    if (name === 'x') return X;
    if (name === 'o') return O;
    return EMPTY;
  }

  root.TTT = {
    N: N, EMPTY: EMPTY, X: X, O: O, LINES: LINES,
    fresh: fresh, at: at, clone: clone, place: place, placeI: placeI,
    fromCells: fromCells, cpuPick: cpuPick, colorName: colorName, colorNum: colorNum, idx: idx
  };
})(typeof window !== 'undefined' ? window : this);
