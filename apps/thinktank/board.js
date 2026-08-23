// Thinktank rules. 15×18, place / move / rotate, no-suicide, destroy the base.
// Transcribed from averycrespi/thinktank src/logic/*.ts (MIT). Classic script.
(function (root) {
  'use strict';

  var W = 15, H = 18, SIZE = W * H;
  var RED = 'red', BLUE = 'blue';
  var BLOCKER = 'Blocker';
  var TANK_U = 'Upwards Tank', TANK_D = 'Downwards Tank';
  var TANK_L = 'Leftwards Tank', TANK_R = 'Rightwards Tank';
  var INF_O = 'Infiltrator (+)', INF_X = 'Infiltrator (X)';
  var MINE = 'Mine', BASE = 'Base';
  var TANKS = [TANK_U, TANK_D, TANK_L, TANK_R];
  var HAND_TYPES = [BLOCKER, TANK_U, TANK_D, TANK_L, TANK_R, INF_O, INF_X, MINE];

  var HOME_OFF = 2, HOME_W = 3, HOME_H = 4;
  var SPAWN_OFF = 1, SPAWN_W = 5, SPAWN_H = 6;
  var RED_HOME_CENTER = 3 * W + 3;           // (3, 3)
  var BLUE_HOME_CENTER = 14 * W + 11;        // (11, 14)

  function isTank(t) {
    return t === TANK_U || t === TANK_D || t === TANK_L || t === TANK_R;
  }
  function opponent(p) { return p === RED ? BLUE : RED; }
  function colorName(p) { return p === RED ? 'red' : (p === BLUE ? 'blue' : ''); }
  function coordsToIndex(x, y) { return y * W + x; }
  function ix(i) { return i % W; }
  function iy(i) { return (i / W) | 0; }
  function inGrid(x, y) { return x >= 0 && x < W && y >= 0 && y < H; }

  function inRect(i, x0, y0, x1, y1) {
    var x = ix(i), y = iy(i);
    return x >= x0 && x < x1 && y >= y0 && y < y1;
  }
  function isRedHome(i) {
    return inRect(i, HOME_OFF, HOME_OFF, HOME_OFF + HOME_W, HOME_OFF + HOME_H);
  }
  function isBlueHome(i) {
    return inRect(i,
      W - HOME_OFF - HOME_W, H - HOME_OFF - HOME_H,
      W - HOME_OFF, H - HOME_OFF);
  }
  function isHome(i) { return isRedHome(i) || isBlueHome(i); }
  function isRedSpawn(i) {
    return inRect(i, SPAWN_OFF, SPAWN_OFF, SPAWN_OFF + SPAWN_W, SPAWN_OFF + SPAWN_H) && !isRedHome(i);
  }
  function isBlueSpawn(i) {
    return inRect(i,
      W - SPAWN_OFF - SPAWN_W, H - SPAWN_OFF - SPAWN_H,
      W - SPAWN_OFF, H - SPAWN_OFF) && !isBlueHome(i);
  }
  function isOwnSpawn(p, i) { return p === RED ? isRedSpawn(i) : isBlueSpawn(i); }
  function isOwnHome(p, i) { return p === RED ? isRedHome(i) : isBlueHome(i); }

  var ORTHO = [[-1, 0], [0, -1], [0, 1], [1, 0]];
  var DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  var BOTH = ORTHO.concat(DIAG);

  function withOffsets(index, offsets) {
    var x = ix(index), y = iy(index), out = [], k, nx, ny, n;
    for (k = 0; k < offsets.length; k++) {
      nx = x + offsets[k][0]; ny = y + offsets[k][1];
      if (inGrid(nx, ny)) {
        n = coordsToIndex(nx, ny);
        if (out.indexOf(n) < 0) out.push(n);
      }
    }
    return out;
  }
  function orthoAdj(i) { return withOffsets(i, ORTHO); }
  function diagAdj(i) { return withOffsets(i, DIAG); }
  function adjacentTo(i) { return withOffsets(i, BOTH); }
  function dualAdj(i) {
    var out = [], seen = {}, a = adjacentTo(i), k, m, b, j;
    for (k = 0; k < a.length; k++) {
      if (!seen[a[k]]) { seen[a[k]] = 1; out.push(a[k]); }
      b = adjacentTo(a[k]);
      for (m = 0; m < b.length; m++) {
        j = b[m];
        if (j === i || seen[j]) continue;
        seen[j] = 1; out.push(j);
      }
    }
    return out;
  }

  function cloneCells(cells) {
    var out = new Array(cells.length), i, c;
    for (i = 0; i < cells.length; i++) {
      c = cells[i];
      out[i] = c ? { player: c.player, token: c.token } : null;
    }
    return out;
  }
  function cloneHand(h) { return h.slice(); }
  function cloneState(s) {
    return {
      cells: cloneCells(s.cells),
      hands: { red: cloneHand(s.hands.red), blue: cloneHand(s.hands.blue) },
      turn: s.turn,
      winner: s.winner,
      last: s.last ? { k: s.last.k, i: s.last.i, s: s.last.s, d: s.last.d, t: s.last.t } : null,
      events: s.events.slice(),
      n: s.n
    };
  }

  function createHand() {
    var h = [], i;
    for (i = 0; i < 3; i++) h.push(BLOCKER);
    for (i = 0; i < 5; i++) { h.push(TANK_U); h.push(TANK_D); h.push(TANK_L); h.push(TANK_R); }
    h.push(INF_O, INF_O, INF_X, INF_X, MINE);
    return h;
  }
  function addToHand(hand, token) {
    if (isTank(token)) { hand.push(TANK_U, TANK_D, TANK_L, TANK_R); }
    else hand.push(token);
  }
  function removeFromHand(hand, token) {
    var i;
    if (isTank(token)) {
      i = hand.indexOf(TANK_U); if (i >= 0) hand.splice(i, 1);
      i = hand.indexOf(TANK_D); if (i >= 0) hand.splice(i, 1);
      i = hand.indexOf(TANK_L); if (i >= 0) hand.splice(i, 1);
      i = hand.indexOf(TANK_R); if (i >= 0) hand.splice(i, 1);
    } else {
      i = hand.indexOf(token); if (i >= 0) hand.splice(i, 1);
    }
  }
  function handHas(hand, token) { return hand.indexOf(token) >= 0; }
  function handCount(hand, token) {
    var n = 0, i;
    for (i = 0; i < hand.length; i++) if (hand[i] === token) n++;
    return n;
  }
  function tankCount(hand) { return handCount(hand, TANK_U); }

  var SHOOTABLE = {};
  SHOOTABLE[TANK_U] = 1; SHOOTABLE[TANK_D] = 1; SHOOTABLE[TANK_L] = 1; SHOOTABLE[TANK_R] = 1;
  SHOOTABLE[INF_O] = 1; SHOOTABLE[INF_X] = 1; SHOOTABLE[MINE] = 1; SHOOTABLE[BASE] = 1;
  var INFILTRATABLE = {};
  INFILTRATABLE[BLOCKER] = 1; INFILTRATABLE[TANK_U] = 1; INFILTRATABLE[TANK_D] = 1;
  INFILTRATABLE[TANK_L] = 1; INFILTRATABLE[TANK_R] = 1;
  var EXPLODABLE = {};
  EXPLODABLE[TANK_U] = 1; EXPLODABLE[TANK_D] = 1; EXPLODABLE[TANK_L] = 1; EXPLODABLE[TANK_R] = 1;
  EXPLODABLE[INF_O] = 1; EXPLODABLE[INF_X] = 1; EXPLODABLE[MINE] = 1; EXPLODABLE[BASE] = 1;

  function inLineOfFire(cells, destIndex, srcIndices, tank) {
    var dest = cells[destIndex], k, src;
    if (!dest || !SHOOTABLE[dest.token]) return false;
    for (k = 0; k < srcIndices.length; k++) {
      src = cells[srcIndices[k]];
      if (!src) continue;
      if (src.player !== dest.player && src.token === tank) return true;
      if (src.player === dest.player && src.token === BLOCKER) return false;
    }
    return false;
  }
  function canBeShotFromBelow(cells, index) {
    var x = ix(index), y = iy(index), src = [], yy;
    for (yy = y + 1; yy < H; yy++) src.push(coordsToIndex(x, yy));
    return inLineOfFire(cells, index, src, TANK_U);
  }
  function canBeShotFromAbove(cells, index) {
    var x = ix(index), y = iy(index), src = [], yy;
    for (yy = y - 1; yy >= 0; yy--) src.push(coordsToIndex(x, yy));
    return inLineOfFire(cells, index, src, TANK_D);
  }
  function canBeShotFromRight(cells, index) {
    var x = ix(index), y = iy(index), src = [], xx;
    for (xx = x + 1; xx < W; xx++) src.push(coordsToIndex(xx, y));
    return inLineOfFire(cells, index, src, TANK_L);
  }
  function canBeShotFromLeft(cells, index) {
    var x = ix(index), y = iy(index), src = [], xx;
    for (xx = x - 1; xx >= 0; xx--) src.push(coordsToIndex(xx, y));
    return inLineOfFire(cells, index, src, TANK_R);
  }
  function canBeShot(cells, index) {
    return canBeShotFromBelow(cells, index) || canBeShotFromAbove(cells, index) ||
           canBeShotFromRight(cells, index) || canBeShotFromLeft(cells, index);
  }
  function canBeInfiltrated(cells, index) {
    var dest = cells[index], adj, k, src;
    if (!dest || !INFILTRATABLE[dest.token]) return false;
    adj = adjacentTo(index);
    for (k = 0; k < adj.length; k++) {
      src = cells[adj[k]];
      if (src && src.player !== dest.player && (src.token === INF_O || src.token === INF_X)) return true;
    }
    return false;
  }
  function canBeExploded(cells, index) {
    var dest = cells[index], adj, k, src;
    if (!dest || !EXPLODABLE[dest.token]) return false;
    adj = adjacentTo(index);
    for (k = 0; k < adj.length; k++) {
      src = cells[adj[k]];
      if (src && src.player !== dest.player && src.token === MINE) return true;
    }
    return false;
  }
  function canExplodeEnemy(cells, index) {
    var mine = cells[index], adj, k, a;
    if (!mine || mine.token !== MINE) return false;
    adj = adjacentTo(index);
    for (k = 0; k < adj.length; k++) {
      a = cells[adj[k]];
      if (a && a.player !== mine.player && a.token !== BLOCKER) return true;
    }
    return false;
  }
  function canExplodeFriendly(cells, index) {
    var mine = cells[index], adj, k, a;
    if (!mine || !canExplodeEnemy(cells, index)) return false;
    adj = adjacentTo(index);
    for (k = 0; k < adj.length; k++) {
      a = cells[adj[k]];
      if (a && a.player === mine.player && EXPLODABLE[a.token]) return true;
    }
    return false;
  }
  function inDanger(cells, index) {
    var piece = cells[index];
    if (piece && piece.token === MINE) return canExplodeFriendly(cells, index);
    return canBeShot(cells, index) || canBeInfiltrated(cells, index) || canBeExploded(cells, index);
  }
  function anyOwnInDanger(cells, player) {
    var i, p;
    for (i = 0; i < cells.length; i++) {
      p = cells[i];
      if (p && p.player === player && inDanger(cells, i)) return true;
    }
    return false;
  }

  function reachableFrom(token, index) {
    var raw, k, out = [];
    if (token === BLOCKER) raw = adjacentTo(index);
    else if (isTank(token) || token === INF_O) raw = orthoAdj(index);
    else if (token === INF_X) raw = diagAdj(index);
    else if (token === MINE) raw = dualAdj(index);
    else if (token === BASE) raw = adjacentTo(index);
    else return out;
    for (k = 0; k < raw.length; k++) {
      if (token === BASE) { if (isHome(raw[k])) out.push(raw[k]); }
      else if (!isHome(raw[k])) out.push(raw[k]);
    }
    return out;
  }

  function canPlace(cells, hand, player, token, index) {
    if (!handHas(hand, token)) return false;
    if (cells[index]) return false;
    if (!isOwnSpawn(player, index)) return false;
    var sim = cloneCells(cells);
    sim[index] = { player: player, token: token };
    return !anyOwnInDanger(sim, player);
  }
  function canMove(cells, player, srcIndex, destIndex) {
    var src = cells[srcIndex], dest = cells[destIndex], sim;
    if (!src) return false;
    if (src.player !== player) return false;
    if (dest) return false;
    if (reachableFrom(src.token, srcIndex).indexOf(destIndex) < 0) return false;
    sim = cloneCells(cells);
    sim[destIndex] = sim[srcIndex];
    sim[srcIndex] = null;
    return !anyOwnInDanger(sim, player);
  }
  function canRotate(cells, player, token, index) {
    var src = cells[index];
    if (!src) return false;
    if (src.player !== player) return false;
    if (!isTank(src.token) || !isTank(token)) return false;
    if (src.token === token) return false;
    return true;
  }

  function possiblePlacements(cells, hand, player, token) {
    var out = [], i;
    if (!handHas(hand, token)) return out;
    for (i = 0; i < SIZE; i++) if (canPlace(cells, hand, player, token, i)) out.push(i);
    return out;
  }
  function possibleMovements(cells, player, srcIndex) {
    var src = cells[srcIndex], reach, k, out = [];
    if (!src) return out;
    reach = reachableFrom(src.token, srcIndex);
    for (k = 0; k < reach.length; k++) {
      if (canMove(cells, player, srcIndex, reach[k])) out.push(reach[k]);
    }
    return out;
  }
  function possibleRotations(cells, player, token) {
    var out = [], i;
    if (!isTank(token)) return out;
    for (i = 0; i < SIZE; i++) if (canRotate(cells, player, token, i)) out.push(i);
    return out;
  }

  function pushEvent(s, kind, player, piece) {
    s.events.push({ kind: kind, player: player, token: piece.token, owner: piece.player });
    if (s.events.length > 24) s.events = s.events.slice(-24);
  }

  function resolve(s) {
    var i, piece, destroyed = {}, idx;
    for (i = 0; i < s.cells.length; i++) {
      piece = s.cells[i];
      if (piece && canBeInfiltrated(s.cells, i)) {
        pushEvent(s, 'capture', opponent(piece.player), { token: piece.token, player: piece.player });
        piece.player = opponent(piece.player);
      }
    }
    for (i = 0; i < s.cells.length; i++) {
      piece = s.cells[i];
      if (!piece) continue;
      if (canBeShot(s.cells, i)) {
        pushEvent(s, 'shoot', opponent(piece.player), piece);
        destroyed[i] = 1;
      } else if (canBeExploded(s.cells, i)) {
        pushEvent(s, 'explode', opponent(piece.player), piece);
        destroyed[i] = 1;
      } else if (canExplodeEnemy(s.cells, i)) {
        pushEvent(s, 'explode', piece.player, piece);
        destroyed[i] = 1;
      }
    }
    for (idx in destroyed) {
      if (!destroyed.hasOwnProperty(idx)) continue;
      i = +idx;
      piece = s.cells[i];
      if (piece) {
        addToHand(s.hands[piece.player], piece.token);
        s.cells[i] = null;
      }
    }
    if (s.hands[RED].indexOf(BASE) >= 0) s.winner = BLUE;
    else if (s.hands[BLUE].indexOf(BASE) >= 0) s.winner = RED;
  }

  function fresh() {
    var cells = new Array(SIZE), i;
    for (i = 0; i < SIZE; i++) cells[i] = null;
    cells[RED_HOME_CENTER] = { player: RED, token: BASE };
    cells[BLUE_HOME_CENTER] = { player: BLUE, token: BASE };
    return {
      cells: cells,
      hands: { red: createHand(), blue: createHand() },
      turn: RED,
      winner: null,
      last: null,
      events: [],
      n: 0
    };
  }

  function play(s, act) {
    if (!s || !act || s.winner) return null;
    var ns = cloneState(s);
    var player = ns.turn;
    if (act.k === 'place') {
      if (!canPlace(ns.cells, ns.hands[player], player, act.t, act.i)) return null;
      pushEvent(ns, 'place', player, { token: act.t, player: player });
      ns.cells[act.i] = { player: player, token: act.t };
      removeFromHand(ns.hands[player], act.t);
      ns.last = { k: 'place', i: act.i, t: act.t };
    } else if (act.k === 'move') {
      if (!canMove(ns.cells, player, act.s, act.d)) return null;
      pushEvent(ns, 'move', player, ns.cells[act.s]);
      ns.cells[act.d] = ns.cells[act.s];
      ns.cells[act.s] = null;
      ns.last = { k: 'move', s: act.s, d: act.d };
    } else if (act.k === 'rotate') {
      if (!canRotate(ns.cells, player, act.t, act.i)) return null;
      pushEvent(ns, 'rotate', player, ns.cells[act.i]);
      ns.cells[act.i] = { player: player, token: act.t };
      ns.last = { k: 'rotate', i: act.i, t: act.t };
    } else return null;
    ns.n = (ns.n || 0) + 1;
    resolve(ns);
    if (!ns.winner) ns.turn = opponent(player);
    return ns;
  }

  function legalActions(s) {
    var out = [], player, hand, i, k, t, dests, d;
    if (!s || s.winner) return out;
    player = s.turn;
    hand = s.hands[player];
    for (k = 0; k < HAND_TYPES.length; k++) {
      t = HAND_TYPES[k];
      dests = possiblePlacements(s.cells, hand, player, t);
      for (i = 0; i < dests.length; i++) out.push({ k: 'place', t: t, i: dests[i] });
    }
    for (i = 0; i < SIZE; i++) {
      if (!s.cells[i] || s.cells[i].player !== player) continue;
      dests = possibleMovements(s.cells, player, i);
      for (d = 0; d < dests.length; d++) out.push({ k: 'move', s: i, d: dests[d] });
    }
    for (k = 0; k < TANKS.length; k++) {
      t = TANKS[k];
      dests = possibleRotations(s.cells, player, t);
      for (i = 0; i < dests.length; i++) out.push({ k: 'rotate', t: t, i: dests[i] });
    }
    return out;
  }

  function replay(moves) {
    var s = fresh(), i, ns;
    if (!moves) return s;
    for (i = 0; i < moves.length; i++) {
      ns = play(s, moves[i]);
      if (!ns) return s;
      s = ns;
      if (s.winner) break;
    }
    return s;
  }

  function findBase(cells, player) {
    var i, p;
    for (i = 0; i < cells.length; i++) {
      p = cells[i];
      if (p && p.player === player && p.token === BASE) return i;
    }
    return player === RED ? RED_HOME_CENTER : BLUE_HOME_CENTER;
  }

  function shortName(t) {
    if (t === BLOCKER) return 'Shield';
    if (t === TANK_U) return 'Tank ↑';
    if (t === TANK_D) return 'Tank ↓';
    if (t === TANK_L) return 'Tank ←';
    if (t === TANK_R) return 'Tank →';
    if (t === INF_O) return 'Infil +';
    if (t === INF_X) return 'Infil ×';
    if (t === MINE) return 'Mine';
    if (t === BASE) return 'Base';
    return t;
  }
  function faceWord(t) {
    if (t === TANK_U) return 'up';
    if (t === TANK_D) return 'down';
    if (t === TANK_L) return 'left';
    if (t === TANK_R) return 'right';
    return '';
  }
  function blurb(t) {
    if (t === BLOCKER) return 'Stops the other side\'s shots. Friendly tanks fire through it.';
    if (isTank(t)) return 'Shoots in a straight line the way it faces, all the way to the edge.';
    if (t === INF_O) return 'Steals a tank or shield standing next to it. Moves one space across or down.';
    if (t === INF_X) return 'Steals a tank or shield standing next to it. Moves one space on the diagonal.';
    if (t === MINE) return 'Blows up anything next to it except a shield — including itself.';
    if (t === BASE) return 'If this house is destroyed, that side loses.';
    return '';
  }
  function preferFacing(player) { return player === RED ? TANK_D : TANK_U; }

  // Cells a tank at `index` would fire through, nearest first. Stops at an
  // enemy shield (shots pass through your own). Used to paint the beam.
  function fireLine(cells, index) {
    var p = cells[index], x, y, dx = 0, dy = 0, out = [], i, c;
    if (!p || !isTank(p.token)) return out;
    x = ix(index); y = iy(index);
    if (p.token === TANK_U) dy = -1;
    else if (p.token === TANK_D) dy = 1;
    else if (p.token === TANK_L) dx = -1;
    else dx = 1;
    x += dx; y += dy;
    while (inGrid(x, y)) {
      i = coordsToIndex(x, y);
      out.push(i);
      c = cells[i];
      if (c && c.token === BLOCKER && c.player !== p.player) break;
      x += dx; y += dy;
    }
    return out;
  }

  root.TT = {
    W: W, H: H, SIZE: SIZE,
    RED: RED, BLUE: BLUE,
    BLOCKER: BLOCKER, TANK_U: TANK_U, TANK_D: TANK_D, TANK_L: TANK_L, TANK_R: TANK_R,
    INF_O: INF_O, INF_X: INF_X, MINE: MINE, BASE: BASE,
    TANKS: TANKS, HAND_TYPES: HAND_TYPES,
    RED_HOME_CENTER: RED_HOME_CENTER, BLUE_HOME_CENTER: BLUE_HOME_CENTER,
    isTank: isTank, opponent: opponent, colorName: colorName,
    coordsToIndex: coordsToIndex, ix: ix, iy: iy,
    isRedHome: isRedHome, isBlueHome: isBlueHome, isHome: isHome,
    isRedSpawn: isRedSpawn, isBlueSpawn: isBlueSpawn,
    isOwnSpawn: isOwnSpawn, isOwnHome: isOwnHome,
    adjacentTo: adjacentTo,
    cloneCells: cloneCells, cloneState: cloneState,
    createHand: createHand, handHas: handHas, handCount: handCount, tankCount: tankCount,
    canPlace: canPlace, canMove: canMove, canRotate: canRotate,
    canBeShot: canBeShot, canBeInfiltrated: canBeInfiltrated,
    canBeExploded: canBeExploded, canExplodeEnemy: canExplodeEnemy, inDanger: inDanger,
    possiblePlacements: possiblePlacements,
    possibleMovements: possibleMovements,
    possibleRotations: possibleRotations,
    reachableFrom: reachableFrom,
    fresh: fresh, play: play, legalActions: legalActions, replay: replay,
    resolve: resolve, findBase: findBase, shortName: shortName,
    faceWord: faceWord, blurb: blurb, preferFacing: preferFacing, fireLine: fireLine
  };
})(typeof window !== 'undefined' ? window : this);
