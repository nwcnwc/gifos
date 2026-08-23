/*
 * Super Sudoku engine — classic-script port of TN1ck/super-sudoku's
 * parse / backtracking solver / conflict + note helpers.
 *
 * Upstream is React/Vite modules. GifOS inlines <script src> and drops
 * type=module, so this file is ordinary IIFE JavaScript.
 */
(function (root) {
  'use strict';

  var NUMS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  var DIFFS = ['easy', 'medium', 'hard', 'expert', 'evil'];

  function parse(s) {
    var g = [], y, x;
    s = String(s || '').replace(/\s/g, '');
    if (s.length !== 81) throw new Error('bad puzzle length ' + s.length);
    for (y = 0; y < 9; y++) {
      g[y] = [];
      for (x = 0; x < 9; x++) g[y][x] = s.charCodeAt(y * 9 + x) - 48;
    }
    return g;
  }

  function stringify(g) {
    var s = '', y, x;
    for (y = 0; y < 9; y++) for (x = 0; x < 9; x++) s += String(g[y][x] || 0);
    return s;
  }

  function cloneGrid(g) {
    return g.map(function (r) { return r.slice(); });
  }

  function validAt(b, r, c, n) {
    var i, sr, sc, y, x;
    for (i = 0; i < 9; i++) {
      if (i !== c && b[r][i] === n) return false;
      if (i !== r && b[i][c] === n) return false;
    }
    sr = (r / 3 | 0) * 3;
    sc = (c / 3 | 0) * 3;
    for (y = sr; y < sr + 3; y++) for (x = sc; x < sc + 3; x++) {
      if ((y !== r || x !== c) && b[y][x] === n) return false;
    }
    return true;
  }

  function candidates(b, r, c) {
    return NUMS.filter(function (n) { return validAt(b, r, c, n); });
  }

  function findBest(b) {
    var best = null, r, c, cand;
    for (r = 0; r < 9; r++) for (c = 0; c < 9; c++) {
      if (b[r][c]) continue;
      cand = candidates(b, r, c);
      if (!best || cand.length < best.cand.length) best = { r: r, c: c, cand: cand };
      if (best.cand.length <= 1) return best;
    }
    return best;
  }

  function solveIn(b) {
    var cell = findBest(b), i, n;
    if (!cell) return true;
    if (!cell.cand.length) return false;
    for (i = 0; i < cell.cand.length; i++) {
      n = cell.cand[i];
      b[cell.r][cell.c] = n;
      if (solveIn(b)) return true;
      b[cell.r][cell.c] = 0;
    }
    return false;
  }

  function solve(g) {
    var b = cloneGrid(g), r, c;
    for (r = 0; r < 9; r++) for (c = 0; c < 9; c++) {
      if (b[r][c] && !validAt(b, r, c, b[r][c])) return null;
    }
    return solveIn(b) ? b : null;
  }

  function idx(x, y) { return y * 9 + x; }

  function squareIndex(x, y) {
    return (y / 3 | 0) * 3 + (x / 3 | 0);
  }

  function cloneCells(cells) {
    return cells.map(function (c) {
      return {
        x: c.x, y: c.y, number: c.number, initial: c.initial,
        notes: c.notes.slice(), solution: c.solution
      };
    });
  }

  function makeCells(str) {
    var g = parse(str), sol = solve(g), cells = [], y, x, n;
    if (!sol) throw new Error('unsolvable puzzle');
    for (y = 0; y < 9; y++) for (x = 0; x < 9; x++) {
      n = g[y][x];
      cells.push({ x: x, y: y, number: n, initial: n !== 0, notes: [], solution: sol[y][x] });
    }
    return cells;
  }

  function list(diff) {
    var p = root.SS_PUZZLES;
    return (p && p[diff]) || [];
  }

  function pick(diff, index) {
    var L = list(diff);
    if (!L.length) throw new Error('no puzzles for ' + diff);
    var i = ((index % L.length) + L.length) % L.length;
    return { diff: diff, index: i, str: L[i], total: L.length };
  }

  function cellAt(cells, x, y) { return cells[idx(x, y)]; }

  function conflicting(cells) {
    return cells.map(function (cell, i) {
      var row = [], col = [], sq = [], all = [], seen = {}, k, c, n;
      for (k = 0; k < 81; k++) {
        c = cells[k];
        if (c.y === cell.y) row.push(c);
        if (c.x === cell.x) col.push(c);
        if (squareIndex(c.x, c.y) === squareIndex(cell.x, cell.y)) sq.push(c);
      }
      [row, col, sq].forEach(function (group) {
        group.forEach(function (c) {
          if (c === cell || !c.number) return;
          if (seen[c.x + ',' + c.y]) return;
          seen[c.x + ',' + c.y] = 1;
          all.push(c);
        });
      });
      var taken = {};
      for (k = 0; k < all.length; k++) taken[all[k].number] = 1;
      var poss = [];
      for (n = 1; n <= 9; n++) if (!taken[n]) poss.push(n);
      return { cell: cell, index: i, conflicting: all, possibilities: poss };
    });
  }

  function friends(cell, cells) {
    return cells.filter(function (c) {
      return c.x === cell.x || c.y === cell.y ||
        squareIndex(c.x, c.y) === squareIndex(cell.x, cell.y);
    });
  }

  function isSolved(cells) {
    if (!cells || cells.length !== 81) return false;
    var k;
    for (k = 0; k < 81; k++) if (!cells[k].number) return false;
    var conf = conflicting(cells);
    for (k = 0; k < 81; k++) {
      var hits = conf[k].conflicting;
      var i;
      for (i = 0; i < hits.length; i++) {
        if (hits[i].number === cells[k].number) return false;
      }
    }
    return true;
  }

  function stripNotes(cells, x, y, n) {
    var si = squareIndex(x, y);
    return cells.map(function (c) {
      if (c.x !== x && c.y !== y && squareIndex(c.x, c.y) !== si) return c;
      if (!c.notes.length) return c;
      return {
        x: c.x, y: c.y, number: c.number, initial: c.initial,
        notes: c.notes.filter(function (v) { return v !== n; }),
        solution: c.solution
      };
    });
  }

  function setNumber(cells, x, y, n) {
    var cur = cellAt(cells, x, y);
    if (!cur || cur.initial) return cells;
    var next = cells.map(function (c) {
      if (c.x !== x || c.y !== y) return c;
      return { x: c.x, y: c.y, number: n, initial: false, notes: [], solution: c.solution };
    });
    if (n) next = stripNotes(next, x, y, n);
    return next;
  }

  function setNotes(cells, x, y, notes) {
    var cur = cellAt(cells, x, y);
    if (!cur || cur.initial) return cells;
    var uniq = [];
    (notes || []).forEach(function (n) {
      n = +n;
      if (n >= 1 && n <= 9 && uniq.indexOf(n) < 0) uniq.push(n);
    });
    uniq.sort(function (a, b) { return a - b; });
    return cells.map(function (c) {
      if (c.x !== x || c.y !== y) return c;
      return { x: c.x, y: c.y, number: 0, initial: false, notes: uniq, solution: c.solution };
    });
  }

  function clearCell(cells, x, y) {
    var cur = cellAt(cells, x, y);
    if (!cur || cur.initial) return cells;
    return cells.map(function (c) {
      if (c.x !== x || c.y !== y) return c;
      return { x: c.x, y: c.y, number: 0, initial: false, notes: [], solution: c.solution };
    });
  }

  function getHint(cells, x, y) {
    var cur = cellAt(cells, x, y);
    if (!cur || cur.initial) return cells;
    return setNumber(cells, x, y, cur.solution);
  }

  function filled(cells) {
    var n = 0, i;
    for (i = 0; i < cells.length; i++) if (cells[i].number) n++;
    return n;
  }

  function empties(cells) {
    var n = 0, i;
    for (i = 0; i < cells.length; i++) if (!cells[i].initial && !cells[i].number) n++;
    return n;
  }

  function countOf(cells, n) {
    var c = 0, i;
    for (i = 0; i < cells.length; i++) if (cells[i].number === n) c++;
    return c;
  }

  function applyState(cells, nums, notes) {
    var next = cloneCells(cells), i, k, list;
    nums = String(nums || '');
    if (nums.length === 81) {
      for (i = 0; i < 81; i++) {
        if (next[i].initial) continue;
        next[i].number = nums.charCodeAt(i) - 48;
        if (next[i].number < 0 || next[i].number > 9) next[i].number = 0;
      }
    }
    notes = notes || {};
    for (k in notes) {
      if (!Object.prototype.hasOwnProperty.call(notes, k)) continue;
      i = +k;
      if (i < 0 || i > 80 || next[i].initial) continue;
      list = notes[k];
      if (!list || !list.length) continue;
      next[i].notes = list.filter(function (n) { return n >= 1 && n <= 9; }).slice();
    }
    return next;
  }

  function dumpState(cells) {
    var nums = '', notes = {}, i;
    for (i = 0; i < 81; i++) {
      nums += String(cells[i].number || 0);
      if (cells[i].notes && cells[i].notes.length) notes[i] = cells[i].notes.slice();
    }
    return { nums: nums, notes: notes };
  }

  root.SS = {
    NUMS: NUMS,
    DIFFS: DIFFS,
    parse: parse,
    stringify: stringify,
    solve: solve,
    makeCells: makeCells,
    cloneCells: cloneCells,
    pick: pick,
    list: list,
    idx: idx,
    cellAt: cellAt,
    conflicting: conflicting,
    friends: friends,
    isSolved: isSolved,
    setNumber: setNumber,
    setNotes: setNotes,
    clearCell: clearCell,
    getHint: getHint,
    filled: filled,
    empties: empties,
    countOf: countOf,
    applyState: applyState,
    dumpState: dumpState
  };
})(window);
