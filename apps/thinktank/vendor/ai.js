// On-device Thinktank computer. The original has no computer player (it
// needed a match server). This search only plays legal moves — it never
// cheats. Classic script; board.js must load first.
(function (root) {
  'use strict';
  var T = root.TT;
  if (!T) throw new Error('board.js must load before vendor/ai.js');

  var VALUE = {};
  VALUE[T.BLOCKER] = 6;
  VALUE[T.TANK_U] = 8; VALUE[T.TANK_D] = 8; VALUE[T.TANK_L] = 8; VALUE[T.TANK_R] = 8;
  VALUE[T.INF_O] = 7; VALUE[T.INF_X] = 7;
  VALUE[T.MINE] = 11;
  VALUE[T.BASE] = 0;

  function chebyshev(a, b) {
    var dx = T.ix(a) - T.ix(b), dy = T.iy(a) - T.iy(b);
    if (dx < 0) dx = -dx; if (dy < 0) dy = -dy;
    return dx > dy ? dx : dy;
  }

  function facesToward(token, src, dest) {
    var sx = T.ix(src), sy = T.iy(src), dx = T.ix(dest), dy = T.iy(dest);
    if (token === T.TANK_U) return sx === dx && sy > dy;
    if (token === T.TANK_D) return sx === dx && sy < dy;
    if (token === T.TANK_L) return sy === dy && sx > dx;
    if (token === T.TANK_R) return sy === dy && sx < dx;
    return false;
  }

  function enemyBlockerBetween(cells, src, dest) {
    var destP = cells[dest] ? cells[dest].player : null;
    var sx = T.ix(src), sy = T.iy(src), dx = T.ix(dest), dy = T.iy(dest);
    var stepX = dx === sx ? 0 : (dx > sx ? 1 : -1);
    var stepY = dy === sy ? 0 : (dy > sy ? 1 : -1);
    var x = sx + stepX, y = sy + stepY, i, p;
    while (x !== dx || y !== dy) {
      i = T.coordsToIndex(x, y);
      p = cells[i];
      if (p && destP && p.player === destP && p.token === T.BLOCKER) return true;
      x += stepX; y += stepY;
    }
    return false;
  }

  function score(s, me) {
    if (s.winner === me) return 100000;
    if (s.winner) return -100000;
    var opp = T.opponent(me);
    var myBase = T.findBase(s.cells, me);
    var oppBase = T.findBase(s.cells, opp);
    var v = 0, i, p, val, d, toward;
    v += T.tankCount(s.hands[me]) * 2;
    v -= T.tankCount(s.hands[opp]) * 2;
    v += T.handCount(s.hands[me], T.BLOCKER);
    v -= T.handCount(s.hands[opp], T.BLOCKER);
    for (i = 0; i < T.SIZE; i++) {
      p = s.cells[i];
      if (!p) continue;
      val = VALUE[p.token] || 0;
      if (p.player === me) v += val; else v -= val;
      if (p.token === T.BASE) continue;
      if (T.isTank(p.token)) {
        toward = p.player === me ? oppBase : myBase;
        if (facesToward(p.token, i, toward)) {
          if (p.player === me) {
            v += 28;
            if (!enemyBlockerBetween(s.cells, i, toward)) v += 90;
          } else {
            v -= 28;
            if (!enemyBlockerBetween(s.cells, i, toward)) v -= 90;
          }
        }
        d = chebyshev(i, toward);
        if (p.player === me) v += (20 - d) * 2;
        else v -= (20 - d) * 2;
      } else if (p.token === T.INF_O || p.token === T.INF_X || p.token === T.MINE) {
        toward = p.player === me ? oppBase : myBase;
        d = chebyshev(i, toward);
        if (p.player === me) v += (20 - d);
        else v -= (20 - d);
      } else if (p.token === T.BLOCKER && p.player === me) {
        toward = myBase;
        if (T.ix(i) === T.ix(toward) || T.iy(i) === T.iy(toward)) v += 6;
      }
    }
    return v;
  }

  function preferFacing(player, token) {
    if (player === T.RED) return token === T.TANK_D || token === T.TANK_R ? 3 : 0;
    return token === T.TANK_U || token === T.TANK_L ? 3 : 0;
  }

  function actTie(act) {
    if (act.k === 'place') return act.i + (act.t ? act.t.length : 0);
    if (act.k === 'move') return act.s * 400 + act.d;
    if (act.k === 'rotate') return act.i * 10;
    return 0;
  }

  function aiMove(s) {
    var acts = T.legalActions(s);
    if (!acts.length) return null;
    var me = s.turn, best = -1e15, pick = acts[0], i, ns, sc, act;
    for (i = 0; i < acts.length; i++) {
      act = acts[i];
      ns = T.play(s, act);
      if (!ns) continue;
      sc = score(ns, me);
      if (act.k === 'place') {
        sc += preferFacing(me, act.t);
        sc += (me === T.RED ? (T.ix(act.i) + T.iy(act.i)) : ((T.W - T.ix(act.i)) + (T.H - T.iy(act.i)))) * 0.15;
      }
      if (act.k === 'move') sc += 1;
      if (sc > best || (sc === best && actTie(act) < actTie(pick))) {
        best = sc;
        pick = act;
      }
    }
    return pick;
  }

  T.aiMove = aiMove;
  T.score = score;
})(typeof window !== 'undefined' ? window : this);
