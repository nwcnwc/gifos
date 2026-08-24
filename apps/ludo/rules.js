/*
 * Generic Ludo. Rules kept honest with chukwumaijem/ludo-game:
 * 6 to leave the yard, 56 steps to home, extra turn on 6 (max three),
 * landing on an opponent (not on a start square) sends them back.
 * The killer stays. Exact count to enter home.
 */
(function (root) {
  'use strict';

  var COLORS = ['red', 'green', 'yellow', 'blue'];
  var NAMES = ['Red', 'Green', 'Yellow', 'Blue'];
  var START = [0, 13, 26, 39];
  var LOOP = [];
  var HOME = [[], [], [], []];
  var YARD = [
    [[10, 1], [10, 3], [12, 1], [12, 3]],
    [[1, 1], [1, 3], [3, 1], [3, 3]],
    [[1, 10], [1, 12], [3, 10], [3, 12]],
    [[10, 10], [10, 12], [12, 10], [12, 12]]
  ];

  (function build() {
    function push(r, c) { LOOP.push({ r: r, c: c }); }
    var r, c;
    for (r = 13; r >= 9; r--) push(r, 6);
    for (c = 5; c >= 0; c--) push(8, c);
    push(7, 0); push(6, 0);
    for (c = 1; c <= 5; c++) push(6, c);
    for (r = 5; r >= 0; r--) push(r, 6);
    push(0, 7); push(0, 8);
    for (r = 1; r <= 5; r++) push(r, 8);
    for (c = 9; c <= 14; c++) push(6, c);
    push(7, 14); push(8, 14);
    for (c = 13; c >= 9; c--) push(8, c);
    for (r = 9; r <= 13; r++) push(r, 8);
    push(14, 8); push(14, 7); push(14, 6);
    if (LOOP.length !== 52) throw new Error('loop ' + LOOP.length);
    for (r = 13; r >= 9; r--) HOME[0].push({ r: r, c: 7 });
    HOME[0].push({ r: 8, c: 7 });
    for (c = 1; c <= 5; c++) HOME[1].push({ r: 7, c: c });
    HOME[1].push({ r: 7, c: 6 });
    for (r = 1; r <= 5; r++) HOME[2].push({ r: r, c: 7 });
    HOME[2].push({ r: 6, c: 7 });
    for (c = 13; c >= 9; c--) HOME[3].push({ r: 7, c: c });
    HOME[3].push({ r: 7, c: 8 });
  })();

  function cellOf(p, steps, slot) {
    if (steps < 0) {
      var y = YARD[p][slot];
      return { r: y[0], c: y[1] };
    }
    if (steps <= 50) return LOOP[(START[p] + steps) % 52];
    if (steps < 56) return HOME[p][steps - 51];
    return { r: 7, c: 7 };
  }

  function isSafe(p, steps) {
    return steps === 0;
  }

  function fresh(n) {
    n = n || 4;
    var tokens = [], p, t;
    for (p = 0; p < 4; p++) {
      tokens[p] = [];
      for (t = 0; t < 4; t++) tokens[p][t] = -1;
    }
    var playing = [true, true, true, true];
    if (n === 2) { playing[1] = false; playing[3] = false; }
    if (n === 3) playing[3] = false;
    return {
      n: n, turn: 0, sixes: 0, die: 0, rolled: false,
      tokens: tokens, playing: playing, winner: -1, log: ''
    };
  }

  function clone(s) {
    return JSON.parse(JSON.stringify(s));
  }

  function nextTurn(s) {
    var i, p = s.turn, found = false;
    for (i = 0; i < 4; i++) {
      p = (p + 1) % 4;
      if (s.playing[p] && !allHome(s, p)) { s.turn = p; found = true; break; }
    }
    if (!found) s.turn = s.turn;
    s.sixes = 0; s.die = 0; s.rolled = false;
  }

  /* Live people sit Red, Green, Yellow, Blue in join order. Existing
     assignments stick while that id is still in the room, so two guests
     never both sit Green. */
  function seatPeople(seats, liveIds) {
    var out = [null, null, null, null], taken = {}, i, id;
    seats = seats || [];
    liveIds = liveIds || [];
    for (i = 0; i < 4; i++) {
      id = seats[i];
      if (id && liveIds.indexOf(id) !== -1 && !taken[id]) {
        out[i] = id;
        taken[id] = 1;
      }
    }
    for (i = 0; i < liveIds.length; i++) {
      id = liveIds[i];
      if (!id || taken[id]) continue;
      var s;
      for (s = 0; s < 4; s++) if (!out[s]) { out[s] = id; taken[id] = 1; break; }
    }
    return out;
  }

  function playingFromSeats(seats) {
    return [
      !!(seats && seats[0]),
      !!(seats && seats[1]),
      !!(seats && seats[2]),
      !!(seats && seats[3])
    ];
  }

  function allHome(s, p) {
    var t;
    for (t = 0; t < 4; t++) if (s.tokens[p][t] !== 56) return false;
    return true;
  }

  function occupant(s, r, c, skipP, skipT) {
    var p, t, cell;
    for (p = 0; p < 4; p++) {
      if (!s.playing[p]) continue;
      for (t = 0; t < 4; t++) {
        if (p === skipP && t === skipT) continue;
        if (s.tokens[p][t] < 0 || s.tokens[p][t] >= 56) continue;
        cell = cellOf(p, s.tokens[p][t], t);
        if (cell.r === r && cell.c === c) return { p: p, t: t };
      }
    }
    return null;
  }

  function dest(s, p, t, die) {
    var cur = s.tokens[p][t];
    if (cur < 0) {
      if (die !== 6) return null;
      return 0;
    }
    if (cur >= 56) return null;
    var next = cur + die;
    if (next > 56) return null;
    return next;
  }

  function moves(s, die) {
    var p = s.turn, t, out = [], d, cell, hit;
    die = die || s.die;
    for (t = 0; t < 4; t++) {
      d = dest(s, p, t, die);
      if (d == null) continue;
      cell = cellOf(p, d, t);
      hit = occupant(s, cell.r, cell.c, p, t);
      if (hit && hit.p === p) continue;
      out.push({ t: t, dest: d, capture: hit && hit.p !== p && !isSafe(hit.p, s.tokens[hit.p][hit.t]) ? hit : null });
    }
    return out;
  }

  function apply(s, t, die) {
    s = clone(s);
    die = die || s.die;
    var p = s.turn, list = moves(s, die), i, mv = null, cell;
    for (i = 0; i < list.length; i++) if (list[i].t === t) mv = list[i];
    if (!mv) return s;
    if (mv.capture) s.tokens[mv.capture.p][mv.capture.t] = -1;
    s.tokens[p][t] = mv.dest;
    s.log = NAMES[p] + ' moved';
    if (mv.capture) s.log += ', sent ' + NAMES[mv.capture.p] + ' back';
    if (allHome(s, p)) { s.winner = p; s.log = NAMES[p] + ' finished.'; return s; }
    s.rolled = false; s.die = 0;
    if (die === 6 && s.sixes < 3) {
      /* extra turn — already counted in roll() */
    } else nextTurn(s);
    return s;
  }

  function roll(s, forced) {
    s = clone(s);
    if (s.rolled) return s;
    var die = (forced >= 1 && forced <= 6) ? (forced | 0) : (1 + Math.floor(Math.random() * 6));
    s.die = die;
    s.rolled = true;
    s.log = NAMES[s.turn] + ' rolled ' + die;
    if (die === 6) s.sixes++;
    if (s.sixes >= 3 && die === 6) {
      s.log += ' — three sixes, turn skipped';
      nextTurn(s);
      return s;
    }
    if (!moves(s, die).length) {
      s.log += ' — no move';
      if (die === 6 && s.sixes < 3) { s.rolled = false; s.die = 0; }
      else nextTurn(s);
    }
    return s;
  }

  function passIfStuck(s) {
    if (s.rolled && !moves(s).length) {
      s = clone(s);
      nextTurn(s);
    }
    return s;
  }

  root.LUDO = {
    COLORS: COLORS, NAMES: NAMES, LOOP: LOOP, HOME: HOME, YARD: YARD,
    START: START, cellOf: cellOf, fresh: fresh, clone: clone,
    moves: moves, apply: apply, roll: roll, allHome: allHome,
    passIfStuck: passIfStuck, occupant: occupant,
    nextTurn: nextTurn, seatPeople: seatPeople, playingFromSeats: playingFromSeats
  };
})(window);
