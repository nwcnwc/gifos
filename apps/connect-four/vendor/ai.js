// kenrick95/c4 PlayerAi — minimax + alpha-beta, MAX_DEPTH 4.
// Transcribed from core/src/player/player-ai.ts (MIT). Classic script; do not
// turn this into a module. The evaluation is hard-coded, same as upstream.
(function (root) {
  'use strict';
  var C = root.C4;
  if (!C) throw new Error('board.js must load before vendor/ai.js');

  var MAX_DEPTH = 4;
  var BIG_POSITIVE_NUMBER = Math.pow(10, 9) + 7;
  var BIG_NEGATIVE_NUMBER = -BIG_POSITIVE_NUMBER;

  function choose(choice) {
    if (!choice || !choice.length) return -1;
    return choice[Math.floor(Math.random() * choice.length)];
  }

  function aiColumn(map, boardPiece) {
    var own = boardPiece;
    var enemy = boardPiece === C.P1 ? C.P2 : C.P1;

    function pieceValue(p) {
      return p === C.EMPTY ? 0 : p === own ? 1 : -1;
    }

    function getStateValue(state) {
      var winnerBoardPiece = C.EMPTY;
      var chainValue = 0;
      var i, j, k, tempRight, tempBottom, tempBottomRight, tempTopRight;
      for (i = 0; i < C.ROWS; i++) {
        for (j = 0; j < C.COLUMNS; j++) {
          tempRight = 0;
          tempBottom = 0;
          tempBottomRight = 0;
          tempTopRight = 0;
          for (k = 0; k <= 3; k++) {
            if (j + k < C.COLUMNS) tempRight += pieceValue(state[i][j + k]);
            if (i + k < C.ROWS) tempBottom += pieceValue(state[i + k][j]);
            if (i + k < C.ROWS && j + k < C.COLUMNS) tempBottomRight += pieceValue(state[i + k][j + k]);
            // original hard-codes 7 here, not COLUMNS
            if (i - k >= 0 && j + k < 7) tempTopRight += pieceValue(state[i - k][j + k]);
          }
          chainValue += tempRight * tempRight * tempRight;
          chainValue += tempBottom * tempBottom * tempBottom;
          chainValue += tempBottomRight * tempBottomRight * tempBottomRight;
          chainValue += tempTopRight * tempTopRight * tempTopRight;
          if (Math.abs(tempRight) === 4) {
            winnerBoardPiece = tempRight > 0 ? own : enemy;
          } else if (Math.abs(tempBottom) === 4) {
            winnerBoardPiece = tempBottom > 0 ? own : enemy;
          } else if (Math.abs(tempBottomRight) === 4) {
            winnerBoardPiece = tempBottomRight > 0 ? own : enemy;
          } else if (Math.abs(tempTopRight) === 4) {
            winnerBoardPiece = tempTopRight > 0 ? own : enemy;
          }
        }
      }
      return { winnerBoardPiece: winnerBoardPiece, chain: chainValue };
    }

    // Prefer a win in fewer steps, a loss in more, a reward sooner.
    function transformValues(returnValue, winnerBoardPiece, depth) {
      var isWon = winnerBoardPiece === own;
      var isLost = winnerBoardPiece === enemy;
      returnValue -= depth * depth;
      if (isWon) returnValue = BIG_POSITIVE_NUMBER - 100 - depth * depth;
      else if (isLost) returnValue = BIG_NEGATIVE_NUMBER + 100 + depth * depth;
      return returnValue;
    }

    function getMove(state, depth, alpha, beta) {
      var stateValue = getStateValue(state);
      var isWon = stateValue.winnerBoardPiece === own;
      var isLost = stateValue.winnerBoardPiece === enemy;
      if (depth >= MAX_DEPTH || isWon || isLost) {
        return {
          value: transformValues(stateValue.chain, stateValue.winnerBoardPiece, depth),
          move: -1
        };
      }
      return depth % 2 === 0
        ? minState(state, depth + 1, alpha, beta)
        : maxState(state, depth + 1, alpha, beta);
    }

    function maxState(state, depth, alpha, beta) {
      var value = BIG_NEGATIVE_NUMBER;
      var moveQueue = [];
      var column, next, nextValue;
      for (column = 0; column < C.COLUMNS; column++) {
        next = C.mockDrop(state, own, column);
        if (!next.success) continue;
        nextValue = getMove(next.map, depth, alpha, beta).value;
        if (nextValue > value) {
          value = nextValue;
          moveQueue = [column];
        } else if (nextValue === value) {
          moveQueue.push(column);
        }
        if (value > beta) return { value: value, move: choose(moveQueue) };
        alpha = Math.max(alpha, value);
      }
      return { value: value, move: choose(moveQueue) };
    }

    function minState(state, depth, alpha, beta) {
      var value = BIG_POSITIVE_NUMBER;
      var moveQueue = [];
      var column, next, nextValue;
      for (column = 0; column < C.COLUMNS; column++) {
        next = C.mockDrop(state, enemy, column);
        if (!next.success) continue;
        nextValue = getMove(next.map, depth, alpha, beta).value;
        if (nextValue < value) {
          value = nextValue;
          moveQueue = [column];
        } else if (nextValue === value) {
          moveQueue.push(column);
        }
        if (value < alpha) return { value: value, move: choose(moveQueue) };
        beta = Math.min(beta, value);
      }
      return { value: value, move: choose(moveQueue) };
    }

    var action = maxState(C.cloneMap(map), 0, BIG_NEGATIVE_NUMBER, BIG_POSITIVE_NUMBER);
    var m = action.move;
    if (typeof m !== 'number' || m < 0) {
      for (var c = 0; c < C.COLUMNS; c++) {
        if (C.mockDrop(map, boardPiece, c).success) return c;
      }
      return 0;
    }
    return m;
  }

  C.MAX_DEPTH = MAX_DEPTH;
  C.aiColumn = aiColumn;
})(typeof window !== 'undefined' ? window : this);
