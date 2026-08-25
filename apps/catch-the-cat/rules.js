/*
 * Catch the Cat — the rules, and the three shapes a round can take.
 *
 *   solo   one player, one cat, one board. The original game.
 *   race   everyone gets the SAME starting walls and plays their own copy.
 *          Your walls are yours; my cat never sees them. Fewest taps takes
 *          the round. (net.js scores it; this file only plays it.)
 *   co-op  ONE board, one cat per player, all of it shared. Your wall pens my
 *          cat as well as yours. Nobody takes turns — each player's taps move
 *          only their own cat, and they move whenever they are made. The room
 *          wins when every cat is walled in; it loses the moment ANY cat
 *          reaches the rim.
 *
 * ONLY YOUR OWN CAT IS SIMULATED HERE, in every mode. In co-op the others are
 * mirrored from the positions their own clients publish — the same rule net.js
 * already lives by, that a player owns exactly one row and nobody computes
 * anybody else's. A client that guessed where your cat would go would drift the
 * moment a wall landed in a different order on the two screens, and then two
 * players would be looking at different games.
 *
 * Cats do not block each other. Walls do. Two cats may stand on the same hex,
 * and that is deliberate: my client cannot know where your cat is going, so a
 * rule that made your cat an obstacle would be a rule my cat could not obey the
 * same way on your screen.
 *
 * The seeded shuffle is mulberry32, kept from the 1.1.0 vendor patch, so the
 * board is a pure function of the seed and every player in a room lays out the
 * same starting walls without anyone sending them.
 */
(function (root) {
  'use strict';

  var GifCat = root.GifCat = root.GifCat || {};
  var E = null;

  // Where co-op cats start. A FIXED set, not one per player: the wall shuffle
  // skips every seat whether or not anyone is sitting in it, so the board is
  // decided by the seed alone and a late joiner cannot change the walls that
  // are already under everyone else's cats.
  var SEATS = [[5, 5], [3, 3], [7, 3], [3, 7], [7, 7], [2, 5], [8, 5]];
  var TONES = ['#e8b05a', '#7dce9a', '#8fb8ff', '#f28ab2', '#c39bff', '#5fd0d8', '#ffb27a'];

  var mode = 'solo';
  var seed = 1;
  var initialWalls = 8;
  var seedSet = {};          // key -> true, the starting walls
  var mine = [];             // keys I have walled, in order
  var theirs = {};           // id -> [key, ...], co-op only
  var history = [];          // my undo stack
  var clicks = 0;
  var myCat = null;          // an upstream Cat — the only one we think for
  var myState = 'chasing';
  var mySeat = 0;
  var remotes = {};          // id -> { name, i, j, dir, state, seat }
  var me = { id: 'me', name: 'You' };

  function key(i, j) { return i * 100 + j; }
  function ki(k) { return Math.floor(k / 100); }
  function kj(k) { return k % 100; }

  function mulberry32(s) {
    s = (s >>> 0) || 1;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Upstream's randomWall, with the excluded hexes generalised from "the cat"
  // to "every seat". Same loop order, same partial shuffle, so a board still
  // has upstream's character.
  function scatter(s, count, skip) {
    var rnd = mulberry32(s);
    var pool = [];
    for (var j = 0; j < E.h; j++) {
      for (var i = 0; i < E.w; i++) {
        if (!skip[key(i, j)]) pool.push(key(i, j));
      }
    }
    var out = {};
    for (var n = 0; n < pool.length && n < count; n++) {
      var p = n + Math.floor(rnd() * (pool.length - n));
      var tmp = pool[n]; pool[n] = pool[p]; pool[p] = tmp;
      out[pool[n]] = true;
    }
    return out;
  }

  function seatOf(n) { return SEATS[n % SEATS.length]; }

  // Every wall anyone has laid, plus the seeded ones, pushed into the engine.
  function paint() {
    E.clearWalls();
    var k;
    for (k in seedSet) E.setWall(ki(k), kj(k), true);
    for (var n = 0; n < mine.length; n++) E.setWall(ki(mine[n]), kj(mine[n]), true);
    if (mode === 'coop') {
      for (var id in theirs) {
        var list = theirs[id] || [];
        for (var m = 0; m < list.length; m++) E.setWall(ki(list[m]), kj(list[m]), true);
      }
    }
  }

  function reset(opts) {
    E = GifCat.engine;
    opts = opts || {};
    mode = opts.mode || 'solo';
    seed = (opts.seed >>> 0) || 1;
    if (opts.me) me = opts.me;
    mySeat = opts.seat || 0;
    mine = []; theirs = {}; history = []; clicks = 0;
    remotes = {};
    myState = 'chasing';

    var skip = {};
    var start;
    if (mode === 'coop') {
      for (var s = 0; s < SEATS.length; s++) skip[key(SEATS[s][0], SEATS[s][1])] = true;
      start = seatOf(mySeat);
    } else {
      start = [Math.floor(E.w / 2), Math.floor(E.h / 2)];
      skip[key(start[0], start[1])] = true;
    }
    seedSet = scatter(seed, initialWalls, skip);
    if (!myCat) myCat = E.makeCat();
    E.place(myCat, start[0], start[1], 5);
    paint();
    return { i: start[0], j: start[1] };
  }

  function catAt(i, j) {
    if (myState === 'chasing' && myCat.i === i && myCat.j === j) return true;
    if (mode !== 'coop') return false;
    for (var id in remotes) {
      var rc = remotes[id];
      if (rc.state === 'chasing' && rc.i === i && rc.j === j) return true;
    }
    return false;
  }

  // A tap. Returns why it did nothing, so the shell can say so.
  function tap(i, j) {
    if (!E.inside(i, j)) return { ok: false, why: 'off' };
    if (E.isWall(i, j)) return { ok: false, why: 'wall' };
    if (catAt(i, j)) return { ok: false, why: 'cat' };

    var from = { i: myCat.i, j: myCat.j, dir: myCat.direction };
    mine.push(key(i, j));
    E.setWall(i, j, true);
    clicks++;
    history.push({ k: key(i, j), from: from, state: myState });

    // Upstream's order, and it matters: a wall that completes the pen wins
    // BEFORE the cat gets its step.
    var moved = false;
    if (myState === 'chasing') {
      if (E.isCaught(myCat)) {
        myState = 'caught';
      } else if (E.step(myCat) === 'caught') {
        myState = 'caught';
      } else {
        moved = true;
        if (E.isEscaped(myCat)) myState = 'gone';
        else if (E.isCaught(myCat)) myState = 'caught';
      }
    }
    return { ok: true, clicks: clicks, state: myState, moved: moved };
  }

  function undo() {
    if (!history.length) return false;
    var h = history.pop();
    var at = mine.lastIndexOf(h.k);
    if (at >= 0) mine.splice(at, 1);
    E.setWall(ki(h.k), kj(h.k), false);
    paint();                       // someone else may have walled the same hex
    if (clicks > 0) clicks--;
    E.place(myCat, h.from.i, h.from.j, h.from.dir);
    myState = h.state;
    return true;
  }

  // Co-op only: what another player's client says about their own cat and
  // their own walls. Their walls join the board; their cat is drawn where they
  // put it and is never stepped here.
  function mirror(list) {
    if (mode !== 'coop') return;
    var seen = {};
    theirs = {};
    (list || []).forEach(function (p) {
      if (!p || !p.id || p.id === me.id) return;
      seen[p.id] = 1;
      theirs[p.id] = p.walls || [];
      var was = remotes[p.id] || {};
      remotes[p.id] = {
        id: p.id, name: p.name || 'Player',
        i: typeof p.ci === 'number' ? p.ci : (was.i || 0),
        j: typeof p.cj === 'number' ? p.cj : (was.j || 0),
        dir: typeof p.cd === 'number' ? p.cd : (was.dir || 5),
        state: p.cstate || 'chasing',
        seat: p.seat || 0
      };
    });
    Object.keys(remotes).forEach(function (id) { if (!seen[id]) delete remotes[id]; });
    paint();
  }

  function cats() {
    var out = [{
      id: me.id, name: me.name, mine: true,
      i: myCat.i, j: myCat.j, dir: myCat.direction, state: myState,
      tone: TONES[mySeat % TONES.length],
      tag: mode === 'coop' ? 'You' : ''
    }];
    if (mode === 'coop') {
      for (var id in remotes) {
        var rc = remotes[id];
        out.push({
          id: id, name: rc.name, mine: false,
          i: rc.i, j: rc.j, dir: rc.dir, state: rc.state,
          tone: TONES[rc.seat % TONES.length], tag: rc.name
        });
      }
    }
    return out;
  }

  GifCat.rules = {
    SEATS: SEATS, TONES: TONES,
    reset: reset,
    tap: tap,
    undo: undo,
    mirror: mirror,
    cats: cats,
    isWall: function (i, j) { return E.isWall(i, j); },
    walls: function () { return mine.slice(); },
    clicks: function () { return clicks; },
    state: function () { return myState; },
    myCat: function () { return { i: myCat.i, j: myCat.j, dir: myCat.direction }; },
    mode: function () { return mode; },
    seat: function () { return mySeat; },
    canUndo: function () { return history.length > 0; },
    // Exposed for the unit suite: the board must be a pure function of the seed.
    _scatter: function (s, count, skip) { return scatter(s, count, skip || {}); },
    _key: key
  };
})(window);
