/*
 * Sokoban engine — classic-script port of klevze/sokoban's fifty warehouses.
 *
 * Upstream is Vite modules, a tileset, Firebase and a service worker. GifOS
 * inlines <script src> and drops type=module, so this file is ordinary IIFE
 * JavaScript. The puzzles are the original Tiled maps, compacted.
 *
 * Map alphabet: ' ' void, '#' wall, '-' floor, '.' goal, '@' keeper,
 * '+' keeper on goal, '$' box, '*' box on goal.
 */
(function (root) {
  'use strict';

  var SK = root.SK || (root.SK = {});

  function findPlayer(map, w) {
    var i = map.indexOf('@');
    if (i < 0) i = map.indexOf('+');
    if (i < 0) return null;
    return { x: i % w, y: (i / w) | 0 };
  }

  function at(map, w, x, y) {
    if (x < 0 || y < 0 || x >= w) return ' ';
    var i = y * w + x;
    if (i < 0 || i >= map.length) return ' ';
    return map.charAt(i);
  }

  function put(map, w, x, y, ch) {
    var i = y * w + x;
    return map.slice(0, i) + ch + map.slice(i + 1);
  }

  function isBox(ch) { return ch === '$' || ch === '*'; }
  function blocked(ch) { return ch === '#' || ch === ' '; }

  function floorUnder(ch) {
    if (ch === '.' || ch === '*' || ch === '+') return '.';
    return '-';
  }

  function withPlayer(base) { return base === '.' ? '+' : '@'; }
  function withBox(base) { return base === '.' ? '*' : '$'; }

  function boxesOnGoal(map) {
    var n = 0, i;
    for (i = 0; i < map.length; i++) if (map.charAt(i) === '*') n++;
    return n;
  }

  function won(map) {
    return map.indexOf('$') < 0 && map.indexOf('*') >= 0;
  }

  function byId(id) {
    var list = SK.levels || [], i;
    for (i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0] || null;
  }

  function loadLevel(id) {
    var lv = byId(id);
    if (!lv) throw new Error('no such warehouse');
    var player = findPlayer(lv.map, lv.w);
    if (!player) throw new Error('warehouse ' + lv.id + ' has no keeper');
    return {
      id: lv.id,
      w: lv.w,
      h: lv.h,
      start: lv.map,
      map: lv.map,
      player: player,
      moves: 0,
      pushes: 0,
      history: [],
      solved: false,
      total: lv.boxes
    };
  }

  function restore(id, map, moves, pushes) {
    var state = loadLevel(id);
    if (map && map.length === state.start.length && findPlayer(map, state.w)) {
      state.map = map;
      state.player = findPlayer(map, state.w);
      state.moves = moves || 0;
      state.pushes = pushes || 0;
      state.solved = won(map);
    }
    return state;
  }

  function tryMove(state, dx, dy) {
    if (!state || state.solved) return false;
    if ((dx !== 0 && dy !== 0) || (dx === 0 && dy === 0)) return false;
    var w = state.w, map = state.map;
    var px = state.player.x, py = state.player.y;
    var nx = px + dx, ny = py + dy;
    var dest = at(map, w, nx, ny);
    if (blocked(dest)) return false;
    var next = map;
    var pushed = false;
    if (isBox(dest)) {
      var bx = nx + dx, by = ny + dy;
      var beyond = at(map, w, bx, by);
      if (blocked(beyond) || isBox(beyond)) return false;
      next = put(next, w, bx, by, withBox(floorUnder(beyond)));
      next = put(next, w, nx, ny, floorUnder(dest));
      dest = at(next, w, nx, ny);
      pushed = true;
    }
    next = put(next, w, px, py, floorUnder(at(next, w, px, py)));
    next = put(next, w, nx, ny, withPlayer(floorUnder(dest)));
    state.history.push({
      map: map,
      x: px,
      y: py,
      moves: state.moves,
      pushes: state.pushes
    });
    if (state.history.length > 400) state.history.shift();
    state.map = next;
    state.player = { x: nx, y: ny };
    state.moves += 1;
    if (pushed) state.pushes += 1;
    state.solved = won(next);
    return pushed ? 'push' : 'step';
  }

  function undo(state) {
    if (!state || !state.history.length) return false;
    var prev = state.history.pop();
    state.map = prev.map;
    state.player = { x: prev.x, y: prev.y };
    state.moves = prev.moves;
    state.pushes = prev.pushes;
    state.solved = false;
    return true;
  }

  function restart(state) {
    if (!state) return false;
    state.map = state.start;
    state.player = findPlayer(state.start, state.w);
    state.moves = 0;
    state.pushes = 0;
    state.history = [];
    state.solved = false;
    return true;
  }

  function nextId(id) {
    var list = SK.levels || [], i;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[(i + 1) % list.length].id;
    }
    return list.length ? list[0].id : 1;
  }

  function prevId(id) {
    var list = SK.levels || [], i;
    for (i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[(i - 1 + list.length) % list.length].id;
    }
    return list.length ? list[0].id : 1;
  }

  SK.findPlayer = findPlayer;
  SK.at = at;
  SK.boxesOnGoal = boxesOnGoal;
  SK.won = won;
  SK.byId = byId;
  SK.loadLevel = loadLevel;
  SK.restore = restore;
  SK.tryMove = tryMove;
  SK.undo = undo;
  SK.restart = restart;
  SK.nextId = nextId;
  SK.prevId = prevId;
  SK.isBox = isBox;
})(window);
