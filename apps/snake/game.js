/*
 * Snake rules. A GifOS port of patorjk's JavaScript Snake (MIT):
 *   https://github.com/patorjk/JavaScript-Snake
 * Same grid, growth, no-180, one queued turn. Multiplayer is extra: several
 * snakes share one board; each body is owned by its player.
 *
 * Palette never uses apple-red for a snake — two snakes plus a red apple have
 * to read at a glance. Collision treats a moving neighbour's tail as vacating
 * and their next cell as occupied, so a head-on or a same-cell lunge is a
 * double KO instead of a host-wins ghost.
 */
(function (root) {
  'use strict';

  var COLS = 28, ROWS = 18, GROW = 5;
  var UP = 0, RIGHT = 1, DOWN = 2, LEFT = 3;
  var DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  // Lime, gold, cyan, magenta, orange, periwinkle — none is apple red.
  var PAL = [
    [48, 220, 72],
    [255, 210, 48],
    [48, 196, 255],
    [255, 96, 210],
    [255, 152, 40],
    [170, 170, 255]
  ];

  function opposite(a, b) { return a >= 0 && b >= 0 && Math.abs(a - b) === 2; }

  function spawn(index) {
    var spots = [
      { x: 4, y: (ROWS / 2) | 0, d: RIGHT },
      { x: COLS - 5, y: (ROWS / 2) | 0, d: LEFT },
      { x: (COLS / 2) | 0, y: 3, d: DOWN },
      { x: (COLS / 2) | 0, y: ROWS - 4, d: UP }
    ];
    var s = spots[index % spots.length];
    var extra = (index / spots.length) | 0;
    var y = s.y + (extra ? (extra % 2 === 0 ? extra : -extra) : 0);
    if (y < 1) y = 1;
    if (y > ROWS - 2) y = ROWS - 2;
    return { x: s.x, y: y, d: s.d };
  }

  function colorForIndex(i) { return PAL[i % PAL.length]; }

  function facing(s) {
    if (!s) return RIGHT;
    if (s.d >= 0) return s.d;
    if (s.last >= 0) return s.last;
    return RIGHT;
  }

  function freshSnake(x, y, face) {
    // Four cells, not one: a 1-cell snake paints as a ball, and two balls on
    // one grid do not read as two snakes. Tail stacks behind `face`.
    var body = [];
    for (var i = 0; i < 4; i++) {
      body.push({ x: x - DX[face] * i, y: y - DY[face] * i });
    }
    return {
      x: x, y: y,
      d: -1,            // heading used on the next step; -1 = not yet moving
      last: face,       // last completed step (original starts facing right)
      pre: -1,          // one queued turn
      first: true,
      body: body,
      grow: 0,
      alive: true,
      moving: false
    };
  }

  function lengthOf(s) { return s.body.length + (s.grow || 0); }

  // Original: if already turning this tick, queue one premove; refuse 180
  // except on the first key of a life.
  function setDir(s, dir) {
    if (!s || !s.alive || dir < 0 || dir > 3) return;
    if (s.d !== s.last && s.d >= 0) s.pre = dir;
    if (!opposite(dir, s.last) || s.first) {
      s.d = dir;
      s.first = false;
      s.moving = true;
    }
  }

  function keyToDir(code) {
    if (code === 37 || code === 65) return LEFT;
    if (code === 38 || code === 87) return UP;
    if (code === 39 || code === 68) return RIGHT;
    if (code === 40 || code === 83) return DOWN;
    return -1;
  }

  function packBody(body) {
    var out = [];
    for (var i = 0; i < body.length; i++) out.push(body[i].x + ':' + body[i].y);
    return out.join(',');
  }

  function unpackBody(str) {
    if (!str) return [];
    var parts = String(str).split(','), body = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].split(':');
      if (p.length === 2) body.push({ x: +p[0], y: +p[1] });
    }
    return body;
  }

  function occupied(snakes, self, nx, ny) {
    for (var i = 0; i < snakes.length; i++) {
      var s = snakes[i];
      if (!s || !s.body) continue;
      var end = s.body.length;
      var growing = (s.grow || 0) > 0;
      // A moving snake's tail vacates this tick. A 1-cell neighbour that is
      // NOT moving still occupies its only cell — do not skip that.
      var moving = s === self || s.moving;
      if (!growing && moving && end > 0) end -= 1;
      for (var k = 0; k < end; k++) {
        if (s.body[k].x === nx && s.body[k].y === ny) return true;
      }
      // Predicted next of a living neighbour: two lunges at one empty cell
      // are a double KO, not a stack.
      if (s !== self && s.alive !== false && s.moving && s.d >= 0) {
        var px = s.x + DX[s.d], py = s.y + DY[s.d];
        if (px === nx && py === ny) return true;
      }
    }
    return false;
  }

  // Advance one cell. `apple` is {x,y} or null. Mutates `s`.
  function stepSnake(s, others, apple) {
    var result = { died: false, ate: false };
    if (!s.alive) return result;
    if (s.d < 0) return result;

    s.last = s.d;
    if (s.pre >= 0) {
      if (!opposite(s.pre, s.last)) s.d = s.pre;
      s.pre = -1;
    }

    var nx = s.x + DX[s.last], ny = s.y + DY[s.last];
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
      s.alive = false;
      result.died = true;
      return result;
    }
    var all = others.slice();
    if (all.indexOf(s) < 0) all.push(s);
    if (occupied(all, s, nx, ny)) {
      s.alive = false;
      result.died = true;
      return result;
    }
    // Land on a living neighbour's current head (they have not stepped yet
    // from our point of view) — both lose that cell.
    for (var i = 0; i < all.length; i++) {
      var o = all[i];
      if (!o || o === s || o.alive === false) continue;
      if (o.x === nx && o.y === ny) {
        s.alive = false;
        result.died = true;
        return result;
      }
    }

    s.x = nx; s.y = ny;
    s.body.unshift({ x: nx, y: ny });
    var onApple = apple && apple.x === nx && apple.y === ny;
    if (onApple) {
      s.grow += GROW;
      result.ate = true;
    }
    if (s.grow > 0) s.grow--;
    else s.body.pop();
    s.moving = true;
    return result;
  }

  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function placeApple(seed, gen, snakes) {
    var occ = {};
    for (var i = 0; i < snakes.length; i++) {
      var b = snakes[i] && snakes[i].body;
      if (!b) continue;
      for (var k = 0; k < b.length; k++) occ[b[k].x + ',' + b[k].y] = 1;
    }
    var r = rng((seed >>> 0) + ((gen * 99991) >>> 0));
    for (var n = 0; n < 4000; n++) {
      var x = (r() * COLS) | 0, y = (r() * ROWS) | 0;
      if (!occ[x + ',' + y]) return { x: x, y: y };
    }
    return null;
  }

  function randomApple(snakes) {
    return placeApple((Math.random() * 0xffffffff) >>> 0, 1, snakes);
  }

  function snapshot(s) {
    if (!s || !s.body) return;
    var prev = [];
    for (var i = 0; i < s.body.length; i++) prev.push({ x: s.body[i].x, y: s.body[i].y });
    s.prev = prev;
  }

  root.SnakeGame = {
    COLS: COLS, ROWS: ROWS, GROW: GROW,
    UP: UP, RIGHT: RIGHT, DOWN: DOWN, LEFT: LEFT,
    DX: DX, DY: DY, PAL: PAL,
    spawn: spawn,
    colorForIndex: colorForIndex,
    facing: facing,
    freshSnake: freshSnake,
    lengthOf: lengthOf,
    setDir: setDir,
    keyToDir: keyToDir,
    packBody: packBody,
    unpackBody: unpackBody,
    occupied: occupied,
    stepSnake: stepSnake,
    placeApple: placeApple,
    randomApple: randomApple,
    snapshot: snapshot,
    rng: rng
  };
})(window);
