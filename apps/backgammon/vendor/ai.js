// Computer for the table. Upstream has none — this searches the same legal
// moves RuleBgCasual already enumerates, then scores the resulting board.
(function (root) {
  'use strict';
  var B = root.Backgammon;
  var M = root.BG;
  var rule = B.rule;

  function pipsOf(state, type) {
    var n = state.bar[type].length * 25;
    var i, k;
    for (i = 0; i < 24; i++) {
      for (k = 0; k < state.points[i].length; k++) {
        if (state.points[i][k].type === type) n += rule.normPos(i, type) + 1;
      }
    }
    return n;
  }

  function backIndex(state, type) {
    var i, best;
    if (state.bar[type].length) return type === 0 ? 24 : -1;
    best = type === 0 ? -1 : 24;
    for (i = 0; i < 24; i++) {
      if (!state.points[i].length || state.points[i][0].type !== type) continue;
      if (type === 0) { if (i > best) best = i; }
      else if (i < best) best = i;
    }
    return best;
  }

  function score(state, type) {
    var opp = 1 - type;
    var s = 0, i, k, mine, np, run = 0, bestPrime = 0, homeMade = 0;
    var pips = pipsOf(state, type), oppPips = pipsOf(state, opp);
    var wBack = backIndex(state, 0), bBack = backIndex(state, 1);
    var racing = wBack >= 0 && bBack <= 23 && wBack < bBack;
    s -= pips * (racing ? 16 : 10);
    s += oppPips * (racing ? 6 : 8);
    s += state.outside[type].length * 140;
    s -= state.outside[opp].length * 110;
    s += state.bar[opp].length * (racing ? 20 : 90);
    s -= state.bar[type].length * 140;
    if (racing) return s;
    for (np = 0; np < 24; np++) {
      i = rule.denormPos(np, type);
      mine = 0;
      for (k = 0; k < state.points[i].length; k++) {
        if (state.points[i][k].type === type) mine++;
      }
      if (mine >= 2) {
        run++;
        if (run > bestPrime) bestPrime = run;
        s += 22;
        if (np < 6) { s += 18; homeMade++; }
        else if (np >= 18) s += 12;
      } else {
        run = 0;
        if (mine === 1) {
          s -= 20;
          if (np >= 18) s -= 30;
          else if (np >= 12) s -= 8;
        }
      }
    }
    s += bestPrime * 24;
    if (bestPrime >= 6) s += 90;
    if (state.bar[opp].length) s += homeMade * 28;
    return s;
  }

  function tops(state, type) {
    var out, i, top;
    if (M.State.havePiecesOnBar(state, type)) {
      top = M.State.getBarTopPiece(state, type);
      return top ? [top] : [];
    }
    out = [];
    for (i = 0; i < 24; i++) {
      top = M.State.getTopPiece(state, i);
      if (top && top.type === type) out.push(top);
    }
    return out;
  }

  function uniqueSteps(moves) {
    var seen = {}, out = [], i;
    for (i = 0; i < moves.length; i++) {
      if (seen[moves[i]]) continue;
      seen[moves[i]] = 1;
      out.push(moves[i]);
    }
    return out;
  }

  function without(moves, steps) {
    var i, out = moves.slice();
    for (i = 0; i < out.length; i++) {
      if (out[i] === steps) { out.splice(i, 1); return out; }
    }
    return out;
  }

  function choose(game) {
    var type, startMoves, best, bestPips, bestScore;
    if (!game || !game.turnDice) return [];
    type = game.turnPlayer.currentPieceType;
    startMoves = (game.turnDice.movesLeft || []).slice();
    if (!startMoves.length) return [];
    best = [];
    bestPips = -1;
    bestScore = -1e9;

    function walk(state, left, seq) {
      var used = 0, i, steps, pieces, p, actions, next, st;
      for (i = 0; i < seq.length; i++) used += seq[i].steps;
      if (!left.length) {
        st = score(state, type);
        if (used > bestPips || (used === bestPips && st > bestScore)) {
          bestPips = used;
          bestScore = st;
          best = seq.slice();
        }
        return;
      }
      var any = false;
      var uniq = uniqueSteps(left);
      for (i = 0; i < uniq.length; i++) {
        steps = uniq[i];
        pieces = tops(state, type);
        for (p = 0; p < pieces.length; p++) {
          actions = rule.getMoveActions(state, pieces[p], steps);
          if (!actions.length) continue;
          any = true;
          next = M.State.clone(state);
          rule.applyMoveActions(next, actions);
          seq.push({ pieceId: pieces[p].id, steps: steps });
          walk(next, without(left, steps), seq);
          seq.pop();
        }
      }
      if (!any) {
        st = score(state, type);
        if (used > bestPips || (used === bestPips && st > bestScore)) {
          bestPips = used;
          bestScore = st;
          best = seq.slice();
        }
      }
    }

    walk(M.State.clone(game.state), startMoves, []);
    return best;
  }

  function play(game) {
    var seq = choose(game);
    var i, ok;
    for (i = 0; i < seq.length; i++) {
      ok = B.applyMove(game, seq[i].pieceId, seq[i].steps);
      if (!ok) break;
    }
    return seq;
  }

  B.aiChoose = choose;
  B.aiPlay = play;
  B.aiScore = score;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : this));
