/*
 * Queens — one queen per row, column, and region, and none may touch
 * diagonally. Logic from samimsu/queens-game (MIT).
 */
(function (root) {
  'use strict';

  function emptyBoard(n) {
    var b = [], r, c;
    for (r = 0; r < n; r++) {
      b[r] = [];
      for (c = 0; c < n; c++) b[r][c] = null;
    }
    return b;
  }

  function clone(board) {
    var n = board.length, b = [], r, c;
    for (r = 0; r < n; r++) {
      b[r] = [];
      for (c = 0; c < n; c++) b[r][c] = board[r][c];
    }
    return b;
  }

  function hasAdjacent(rows) {
    rows.sort(function (a, b) { return a - b; });
    var i;
    for (i = 0; i < rows.length - 1; i++) if (rows[i + 1] - rows[i] === 1) return true;
    return false;
  }

  function checkWin(board, regions) {
    var n = board.length;
    var rowC = Array(n).fill(0), colC = Array(n).fill(0), regC = {};
    var mainD = {}, antiD = {};
    var r, c, region, k;
    for (r = 0; r < n; r++) for (c = 0; c < n; c++) {
      if (board[r][c] !== 'Q') continue;
      rowC[r]++; colC[c]++;
      region = regions[r][c];
      regC[region] = (regC[region] || 0) + 1;
      k = r - c; (mainD[k] || (mainD[k] = [])).push(r);
      k = r + c; (antiD[k] || (antiD[k] = [])).push(r);
    }
    for (r = 0; r < n; r++) if (rowC[r] !== 1 || colC[r] !== 1) return false;
    var regs = {};
    for (r = 0; r < n; r++) for (c = 0; c < n; c++) regs[regions[r][c]] = 1;
    for (k in regs) if (regC[k] !== 1) return false;
    for (k in mainD) if (hasAdjacent(mainD[k].slice())) return false;
    for (k in antiD) if (hasAdjacent(antiD[k].slice())) return false;
    return true;
  }

  function clashes(board, regions) {
    var n = board.length;
    var rowC = Array(n).fill(0), colC = Array(n).fill(0), regC = {};
    var mainD = {}, antiD = {};
    var r, c, region, k, out = {}, mark;
    mark = function (rr, cc) { out[rr + ',' + cc] = 1; };
    for (r = 0; r < n; r++) for (c = 0; c < n; c++) {
      if (board[r][c] !== 'Q') continue;
      rowC[r]++; colC[c]++;
      region = regions[r][c];
      regC[region] = (regC[region] || 0) + 1;
      k = r - c; (mainD[k] || (mainD[k] = [])).push({ r: r, c: c });
      k = r + c; (antiD[k] || (antiD[k] = [])).push({ r: r, c: c });
    }
    for (r = 0; r < n; r++) if (rowC[r] > 1) for (c = 0; c < n; c++) if (board[r][c] === 'Q') mark(r, c);
    for (c = 0; c < n; c++) if (colC[c] > 1) for (r = 0; r < n; r++) if (board[r][c] === 'Q') mark(r, c);
    for (k in regC) if (regC[k] > 1) {
      for (r = 0; r < n; r++) for (c = 0; c < n; c++) {
        if (regions[r][c] === k && board[r][c] === 'Q') mark(r, c);
      }
    }
    function diag(map) {
      var key, pos, i;
      for (key in map) {
        pos = map[key];
        pos.sort(function (a, b) { return a.r - b.r; });
        for (i = 0; i < pos.length - 1; i++) {
          if (Math.abs(pos[i].r - pos[i + 1].r) === 1) {
            mark(pos[i].r, pos[i].c); mark(pos[i + 1].r, pos[i + 1].c);
          }
        }
      }
    }
    diag(mainD); diag(antiD);
    return out;
  }

  function autoXs(board, regions, row, col) {
    var n = board.length, r, c, region = regions[row][col];
    var dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
    var i, nr, nc;
    for (i = 0; i < dirs.length; i++) {
      nr = row + dirs[i][0]; nc = col + dirs[i][1];
      if (nr >= 0 && nr < n && nc >= 0 && nc < n && board[nr][nc] == null) board[nr][nc] = 'X';
    }
    for (c = 0; c < n; c++) if (board[row][c] == null) board[row][c] = 'X';
    for (r = 0; r < n; r++) if (board[r][col] == null) board[r][col] = 'X';
    for (r = 0; r < n; r++) for (c = 0; c < n; c++) {
      if (regions[r][c] === region && board[r][c] == null) board[r][c] = 'X';
    }
  }

  function tap(board, regions, row, col, doAuto) {
    var next = clone(board);
    var cur = next[row][col];
    if (cur == null) next[row][col] = 'X';
    else if (cur === 'X') {
      next[row][col] = 'Q';
      if (doAuto) autoXs(next, regions, row, col);
    } else if (cur === 'Q') next[row][col] = null;
    return next;
  }

  function regionsOf(level) {
    var n = level.size, r, rows = [];
    for (r = 0; r < n; r++) rows.push(level.r[r].split(''));
    return rows;
  }

  root.QNS = {
    emptyBoard: emptyBoard,
    clone: clone,
    checkWin: checkWin,
    clashes: clashes,
    tap: tap,
    paintX: function (board, squares) {
      var next = clone(board), i, r, c;
      for (i = 0; i < squares.length; i++) {
        r = squares[i][0]; c = squares[i][1];
        if (next[r][c] !== 'Q') next[r][c] = 'X';
      }
      return next;
    },
    regionsOf: regionsOf
  };
})(window);
