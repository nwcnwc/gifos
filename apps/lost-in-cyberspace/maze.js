// Maze helpers on top of vendor/network.js (the original generator).
// Doors, sectors, the four codes on terminals, timer, win/lose.
// Classic IIFE. No fetch, no sockets.
(function (root) {
  'use strict';

  var GAME_TIME = 256;
  var TRAP_COST = 32;
  var WRONG_HACK = 16;

  function sectorOf(x, y) {
    if (y < 4) return x < 4 ? 0 : 1;
    return x < 4 ? 2 : 3;
  }

  function oppositeSector(x, y) {
    if (y < 4) return x < 4 ? 3 : 2;
    return x < 4 ? 1 : 0;
  }

  function canGo(net, x, y, dx, dy) {
    var nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx > 7 || ny > 7) return false;
    var walls = net.walls;
    if (dx === 1) return walls.rowWalls[y].indexOf(nx) === -1;
    if (dx === -1) return walls.rowWalls[y].indexOf(x) === -1;
    if (dy === 1) return walls.colWalls[x].indexOf(ny) === -1;
    if (dy === -1) return walls.colWalls[x].indexOf(y) === -1;
    return false;
  }

  function isTrap(net, x, y) {
    var list = (net.traps && net.traps.trapsXY) || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i][0] === x && list[i][1] === y) return true;
    }
    return false;
  }

  function isTarget(net, x, y) {
    return net.target && net.target[0] === x && net.target[1] === y;
  }

  function fmtTime(t) {
    var m = Math.floor(t / 60);
    var s = t % 60;
    return '0' + m + ':' + (s < 10 ? '0' : '') + s;
  }

  // Place the four access codes on the four sector terminals the way
  // upstream does: shuffle colours/walls/traps, put the TARGET code in
  // the sector opposite the target node.
  function placeCodes(net) {
    var all = getNetworkCodes(net);
    var targetCode = all[3];
    var rest = all.slice(0, 3);
    var shuffled = [];
    var pick;
    while (rest.length) {
      pick = randomInt(rest.length);
      shuffled.push(rest.splice(pick, 1)[0]);
    }
    var opp = oppositeSector(net.target[0], net.target[1]);
    shuffled.splice(opp, 0, targetCode);
    return shuffled;
  }

  function fresh() {
    var net = randomNetwork();
    var codes = placeCodes(net);
    return {
      net: net,
      codes: codes,
      x: 0,
      y: 0,
      facing: 0, // 0 N, 1 E, 2 S, 3 W
      time: GAME_TIME,
      moves: -1,
      ticking: false,
      over: false,
      win: false,
      visited: { '0,0': true },
      hacked: {},
      sent: []
    };
  }

  function enter(state) {
    var key = state.x + ',' + state.y;
    state.visited[key] = true;
    state.moves += 1;
    if (isTrap(state.net, state.x, state.y)) {
      state.time = Math.max(0, state.time - TRAP_COST);
    }
    if (state.time <= 0) lose(state);
  }

  function tryMove(state, dx, dy) {
    if (state.over || state.win) return false;
    if (!canGo(state.net, state.x, state.y, dx, dy)) return false;
    state.x += dx;
    state.y += dy;
    if (!state.ticking) state.ticking = true;
    enter(state);
    return true;
  }

  function turnLeft(state) { state.facing = (state.facing + 3) % 4; }
  function turnRight(state) { state.facing = (state.facing + 1) % 4; }

  var DIR = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }];

  function walkForward(state) {
    var d = DIR[state.facing];
    return tryMove(state, d.dx, d.dy);
  }

  function doorAhead(state) {
    var d = DIR[state.facing];
    return canGo(state.net, state.x, state.y, d.dx, d.dy);
  }

  function doors(state) {
    return {
      n: canGo(state.net, state.x, state.y, 0, -1),
      e: canGo(state.net, state.x, state.y, 1, 0),
      s: canGo(state.net, state.x, state.y, 0, 1),
      w: canGo(state.net, state.x, state.y, -1, 0)
    };
  }

  function here(state) {
    var s = sectorOf(state.x, state.y);
    return {
      x: state.x,
      y: state.y,
      sector: s,
      code: state.codes[s],
      color: COLOR_VALUES[state.net.colors[s]],
      trap: isTrap(state.net, state.x, state.y),
      target: isTarget(state.net, state.x, state.y),
      hacked: !!state.hacked[state.x + ',' + state.y]
    };
  }

  function hack(state) {
    if (state.over || state.win) return 'dead';
    var node = here(state);
    if (node.target) {
      state.win = true;
      state.ticking = false;
      state.scoreCode = scoreToCode(state.time, Math.max(0, state.moves));
      return 'win';
    }
    if (!state.ticking) state.ticking = true;
    state.hacked[state.x + ',' + state.y] = true;
    state.time = Math.max(0, state.time - WRONG_HACK);
    if (state.time <= 0) { lose(state); return 'dead'; }
    return 'denied';
  }

  function lose(state) {
    state.over = true;
    state.ticking = false;
    state.time = 0;
  }

  function tick(state) {
    if (!state.ticking || state.over || state.win) return;
    var step = isTrap(state.net, state.x, state.y) ? 2 : 1;
    state.time = Math.max(0, state.time - step);
    if (state.time <= 0) lose(state);
  }

  root.LIC = {
    GAME_TIME: GAME_TIME,
    sectorOf: sectorOf,
    canGo: canGo,
    isTrap: isTrap,
    isTarget: isTarget,
    fmtTime: fmtTime,
    fresh: fresh,
    tryMove: tryMove,
    turnLeft: turnLeft,
    turnRight: turnRight,
    walkForward: walkForward,
    doorAhead: doorAhead,
    doors: doors,
    here: here,
    hack: hack,
    tick: tick,
    DIR: DIR
  };
})(window);
