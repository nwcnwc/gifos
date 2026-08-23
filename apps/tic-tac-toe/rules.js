// 3×3 three-in-a-row. Pure rules + a perfect-play CPU — no DOM, no network.
(function (root) {
  'use strict';
  var N = 3;
  var EMPTY = 0, X = 1, O = 2;
  var LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

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

  function empties(cells) {
    var out = [], i;
    for (i = 0; i < 9; i++) if (!cells[i]) out.push(i);
    return out;
  }

  function terminal(s, me, depth) {
    if (s.winner === me) return 10 - depth;
    if (s.winner === -1) return 0;
    if (s.winner) return depth - 10;
    return null;
  }

  // Perfect play. Faster wins beat slower ones; slower losses beat faster.
  function minimax(s, me, depth, alpha, beta) {
    var v0 = terminal(s, me, depth);
    if (v0 !== null) return v0;
    var maxing = s.turn === me;
    var best = maxing ? -99 : 99;
    var moves = empties(s.cells), i, ns, v;
    for (i = 0; i < moves.length; i++) {
      ns = placeI(s, moves[i]);
      if (!ns) continue;
      v = minimax(ns, me, depth + 1, alpha, beta);
      if (maxing) {
        if (v > best) best = v;
        if (v > alpha) alpha = v;
      } else {
        if (v < best) best = v;
        if (v < beta) beta = v;
      }
      if (beta <= alpha) break;
    }
    return best;
  }

  function cpuMoves(s) {
    if (!s || s.winner) return [];
    var me = s.turn, moves = empties(s.cells), i, ns, v, best = -99, out = [];
    for (i = 0; i < moves.length; i++) {
      ns = placeI(s, moves[i]);
      if (!ns) continue;
      v = minimax(ns, me, 1, -99, 99);
      if (v > best) {
        best = v;
        out = [{ r: (moves[i] / N) | 0, c: moves[i] % N, v: v }];
      } else if (v === best) {
        out.push({ r: (moves[i] / N) | 0, c: moves[i] % N, v: v });
      }
    }
    return out;
  }

  function cpuPick(s, rng) {
    var m = cpuMoves(s);
    if (!m.length) return null;
    var roll = rng || Math.random;
    return m[(roll() * m.length) | 0];
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
    fromCells: fromCells, cpuPick: cpuPick, cpuMoves: cpuMoves,
    colorName: colorName, colorNum: colorNum, idx: idx
  };
})(typeof window !== 'undefined' ? window : this);
