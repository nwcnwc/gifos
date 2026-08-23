// Jungle computer. Minimax + alpha-beta on this device. Depth 3.
// Never cheats: every candidate is a legalMoves() entry, applied with play().
(function (root) {
  'use strict';
  var J = root.JG;
  if (!J) throw new Error('board.js must load before ai.js');

  var MAX_DEPTH = 3;
  var INF = 1000000;
  // Rat is priced up: it swims, it takes the elephant, it blocks a jump.
  var VAL = [0, 120, 80, 90, 100, 140, 220, 250, 270];

  function otherSide(s) { return s === J.RED ? J.BLUE : J.RED; }

  function evaluate(s, me) {
    var them = otherSide(me);
    if (s.winner === me) return INF - s.n;
    if (s.winner === them) return -INF + s.n;
    var score = 0, r, c, p, sd, rk, sign, opp, dist, den;
    for (r = 0; r < J.ROWS; r++) for (c = 0; c < J.COLS; c++) {
      p = s.map[r][c];
      if (!p) continue;
      sd = J.sideOf(p);
      rk = J.rankOf(p);
      sign = sd === me ? 1 : -1;
      score += sign * VAL[rk];
      opp = otherSide(sd);
      den = J.denOf(opp);
      dist = Math.abs(r - den.r) + Math.abs(c - den.c);
      score += sign * (16 - dist) * 7;
      if (dist === 1) score += sign * 80;
      if (J.isTrapOf(r, c, opp)) score -= sign * 50;
      if (rk === J.RAT && J.isWater(r, c)) score += sign * 28;
    }
    return score;
  }

  function orderMoves(s, moves) {
    var den = J.denOf(otherSide(s.turn));
    var i, m, from, to, scored = [];
    for (i = 0; i < moves.length; i++) {
      m = moves[i];
      from = Math.abs(m.fr - den.r) + Math.abs(m.fc - den.c);
      to = Math.abs(m.tr - den.r) + Math.abs(m.tc - den.c);
      scored.push({
        m: m,
        k: (m.capture ? 1000 : 0) + (m.jump ? 40 : 0) + (from - to) * 20 - to
      });
    }
    scored.sort(function (a, b) { return b.k - a.k; });
    for (i = 0; i < scored.length; i++) moves[i] = scored[i].m;
    return moves;
  }

  function alphabeta(s, depth, alpha, beta, me) {
    if (s.winner || depth <= 0) return evaluate(s, me);
    var moves = orderMoves(s, J.legalMoves(s));
    if (!moves.length) return evaluate(s, me);
    var i, ns, v;
    if (s.turn === me) {
      v = -INF;
      for (i = 0; i < moves.length; i++) {
        ns = J.play(s, moves[i].fr, moves[i].fc, moves[i].tr, moves[i].tc);
        if (!ns) continue;
        v = Math.max(v, alphabeta(ns, depth - 1, alpha, beta, me));
        if (v > alpha) alpha = v;
        if (beta <= alpha) break;
      }
      return v;
    }
    v = INF;
    for (i = 0; i < moves.length; i++) {
      ns = J.play(s, moves[i].fr, moves[i].fc, moves[i].tr, moves[i].tc);
      if (!ns) continue;
      v = Math.min(v, alphabeta(ns, depth - 1, alpha, beta, me));
      if (v < beta) beta = v;
      if (beta <= alpha) break;
    }
    return v;
  }

  function pickBest(s) {
    if (!s || s.winner) return null;
    var me = s.turn;
    var moves = orderMoves(s, J.legalMoves(s));
    if (!moves.length) return null;
    var best = moves[0], bestV = -INF, i, ns, v, depth;
    depth = (s.reds + s.blues) >= 14 ? 2 : MAX_DEPTH;
    for (i = 0; i < moves.length; i++) {
      ns = J.play(s, moves[i].fr, moves[i].fc, moves[i].tr, moves[i].tc);
      if (!ns) continue;
      v = alphabeta(ns, depth - 1, -INF, INF, me);
      if (v > bestV) { bestV = v; best = moves[i]; }
    }
    if (!J.play(s, best.fr, best.fc, best.tr, best.tc)) return null;
    return best;
  }

  // Blocking pick — used by the pack-time rule tests.
  function aiMove(s) { return pickBest(s); }

  // Time-sliced so the thinking chip can pulse and a tap is not frozen.
  // Each root move is one slice; alphabeta itself is still sync per candidate.
  function aiMoveAsync(s, cb) {
    if (!s || s.winner) { cb(null); return; }
    var me = s.turn;
    var moves = orderMoves(s, J.legalMoves(s));
    if (!moves.length) { cb(null); return; }
    var best = moves[0], bestV = -INF, i = 0;
    var depth = (s.reds + s.blues) >= 14 ? 2 : MAX_DEPTH;
    function slice() {
      var t0 = Date.now ? Date.now() : 0, ns, v;
      while (i < moves.length && ((Date.now ? Date.now() : t0) - t0) < 12) {
        ns = J.play(s, moves[i].fr, moves[i].fc, moves[i].tr, moves[i].tc);
        if (ns) {
          v = alphabeta(ns, depth - 1, -INF, INF, me);
          if (v > bestV) { bestV = v; best = moves[i]; }
        }
        i++;
      }
      if (i < moves.length) {
        setTimeout(slice, 0);
        return;
      }
      if (!J.play(s, best.fr, best.fc, best.tr, best.tc)) cb(null);
      else cb(best);
    }
    setTimeout(slice, 0);
  }

  J.aiMove = aiMove;
  J.aiMoveAsync = aiMoveAsync;
  J.MAX_DEPTH = MAX_DEPTH;
})(typeof window !== 'undefined' ? window : this);
