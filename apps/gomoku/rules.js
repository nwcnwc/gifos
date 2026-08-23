// 15×15 five-in-a-row. Pure rules — no DOM, no AI.
(function (root) {
  'use strict';
  var N = 15;
  var EMPTY = 0, BLACK = 1, WHITE = 2;
  var DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

  function fresh() {
    var b = new Array(N * N);
    for (var i = 0; i < b.length; i++) b[i] = EMPTY;
    return { cells: b, n: 0, turn: BLACK, last: null, winner: 0, winLine: null };
  }

  function at(s, r, c) {
    if (r < 0 || c < 0 || r >= N || c >= N) return -1;
    return s.cells[r * N + c];
  }

  function clone(s) {
    return {
      cells: s.cells.slice(),
      n: s.n,
      turn: s.turn,
      last: s.last ? { r: s.last.r, c: s.last.c } : null,
      winner: s.winner,
      winLine: s.winLine ? s.winLine.map(function (p) { return { r: p.r, c: p.c }; }) : null
    };
  }

  function lineThrough(s, r, c, color) {
    for (var d = 0; d < 4; d++) {
      var dr = DIRS[d][0], dc = DIRS[d][1];
      var cells = [{ r: r, c: c }];
      var i, rr, cc;
      for (i = 1; i < 5; i++) {
        rr = r + dr * i; cc = c + dc * i;
        if (at(s, rr, cc) !== color) break;
        cells.push({ r: rr, c: cc });
      }
      for (i = 1; i < 5; i++) {
        rr = r - dr * i; cc = c - dc * i;
        if (at(s, rr, cc) !== color) break;
        cells.unshift({ r: rr, c: cc });
      }
      if (cells.length >= 5) return cells.slice(0, 5);
    }
    return null;
  }

  function place(s, r, c) {
    if (s.winner || at(s, r, c) !== EMPTY) return null;
    var ns = clone(s);
    ns.cells[r * N + c] = s.turn;
    ns.n++;
    ns.last = { r: r, c: c };
    var line = lineThrough(ns, r, c, s.turn);
    if (line) {
      ns.winner = s.turn;
      ns.winLine = line;
    } else if (ns.n === N * N) {
      ns.winner = -1;
    } else {
      ns.turn = s.turn === BLACK ? WHITE : BLACK;
    }
    return ns;
  }

  function undo(s) {
    if (!s.last) return null;
    var ns = clone(s);
    ns.cells[s.last.r * N + s.last.c] = EMPTY;
    ns.n--;
    ns.winner = 0;
    ns.winLine = null;
    ns.turn = at(s, s.last.r, s.last.c);
    ns.last = null;
    return ns;
  }

  function colorName(n) {
    if (n === BLACK) return 'black';
    if (n === WHITE) return 'white';
    return '';
  }
  function colorNum(name) {
    if (name === 'black') return BLACK;
    if (name === 'white') return WHITE;
    return EMPTY;
  }

  root.Gomoku = {
    N: N, EMPTY: EMPTY, BLACK: BLACK, WHITE: WHITE,
    fresh: fresh, at: at, clone: clone, place: place, undo: undo,
    lineThrough: lineThrough, colorName: colorName, colorNum: colorNum
  };
})(typeof window !== 'undefined' ? window : this);
