/*
 * Maze — ten maps from Blockly Games. Pegman walks; blocks are interpreted
 * by walking the tree (no eval). Maps and block limits match upstream.
 */
(function (root) {
  'use strict';

  var WALL = 0, OPEN = 1, START = 2, FINISH = 3;
  var N = 0, E = 1, S = 2, W = 3;
  var MAX_BLOCKS = [Infinity, Infinity, 2, 5, 5, 5, 5, 10, 7, 10];
  var MAPS = [
    [[0,0,0,0,0,0,0],[0,0,0,0,0,0,0],[0,0,0,0,0,0,0],[0,0,0,0,0,0,0],[0,0,2,1,3,0,0],[0,0,0,0,0,0,0],[0,0,0,0,0,0,0]],
    [[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,1,3,0,0,0],[0,0,2,1,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],
    [[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,2,1,1,1,1,3,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0]],
    [[0,0,0,0,0,0,0,1],[0,0,0,0,0,0,1,1],[0,0,0,0,0,3,1,0],[0,0,0,0,1,1,0,0],[0,0,0,1,1,0,0,0],[0,0,1,1,0,0,0,0],[0,2,1,0,0,0,0,0],[1,1,0,0,0,0,0,0]],
    [[0,0,0,0,0,0,0,0],[0,0,0,0,0,3,0,0],[0,0,0,0,0,1,0,0],[0,0,0,0,0,1,0,0],[0,0,0,0,0,1,0,0],[0,0,0,0,0,1,0,0],[0,0,0,2,1,1,0,0],[0,0,0,0,0,0,0,0]],
    [[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,1,1,1,1,1,0,0],[0,1,0,0,0,1,0,0],[0,1,1,3,0,1,0,0],[0,0,0,0,0,1,0,0],[0,2,1,1,1,1,0,0],[0,0,0,0,0,0,0,0]],
    [[0,0,0,0,0,0,0,0],[0,0,0,0,0,1,1,0],[0,2,1,1,1,1,0,0],[0,0,0,0,0,1,1,0],[0,1,1,3,0,1,0,0],[0,1,0,1,0,1,0,0],[0,1,1,1,1,1,1,0],[0,0,0,0,0,0,0,0]],
    [[0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0],[0,1,1,1,1,0,0,0],[0,1,0,0,1,1,0,0],[0,1,1,1,0,1,0,0],[0,0,0,1,0,1,0,0],[0,2,1,1,0,3,0,0],[0,0,0,0,0,0,0,0]],
    [[0,0,0,0,0,0,0,0],[0,1,1,1,1,1,0,0],[0,0,1,0,0,0,0,0],[3,1,1,1,1,1,1,0],[0,1,0,1,0,1,1,0],[1,1,1,1,1,0,1,0],[0,1,0,1,0,2,1,0],[0,0,0,0,0,0,0,0]],
    [[0,0,0,0,0,0,0,0],[0,1,1,0,3,0,1,0],[0,1,1,0,1,1,1,0],[0,1,0,1,0,1,0,0],[0,1,1,1,1,1,1,0],[0,0,0,1,0,0,1,0],[0,2,1,1,1,0,1,0],[0,0,0,0,0,0,0,0]]
  ];
  var HINTS = [
    'Stack a couple of “move forward” blocks together to help me reach the goal.',
    'Run, then Reset if you miss. Stack turn and move.',
    'Reach the end using only two blocks. Use “repeat until” to run a block more than once.',
    'You can fit more than one block inside a “repeat” block.',
    'A longer corridor — a loop still does it.',
    'An “if” block does something only if the condition is true. Try turning left if there is a path to the left.',
    'Click the menu on the “if” block to change its condition.',
    'If there is a path ahead, keep going. If not, look around.',
    'If-else blocks will do one thing or the other.',
    'Can you solve this maze? Try following the left-hand wall.'
  ];

  var canvas, ctx, pegImg, markImg, map, rows, cols, start, finish;
  var px, py, pd, log, timers = [], running = false, level = 1, workspace;
  var SIZE = 50, PW = 49, PH = 52;

  function loadImg(src) {
    var im = new Image();
    im.src = src || '';
    return im;
  }

  function cell(x, y) {
    if (y < 0 || x < 0 || y >= rows || x >= cols) return WALL;
    return map[y][x];
  }
  function isOpen(rel) {
    var d = (pd + rel) & 3;
    var x = px, y = py;
    if (d === N) y--; else if (d === E) x++; else if (d === S) y++; else x--;
    return cell(x, y) !== WALL;
  }
  function notDone() { return px !== finish.x || py !== finish.y; }

  function paint(wx, wy, wd) {
    var w = canvas.width, h = canvas.height;
    var n = Math.max(rows, cols);
    var s = Math.min(w, h) / n;
    ctx.fillStyle = '#1c2330';
    ctx.fillRect(0, 0, w, h);
    var ox = (w - cols * s) / 2, oy = (h - rows * s) / 2;
    var y, x, v, cx, cy;
    for (y = 0; y < rows; y++) {
      for (x = 0; x < cols; x++) {
        v = map[y][x];
        cx = ox + x * s; cy = oy + y * s;
        if (v === WALL) {
          ctx.fillStyle = '#141822';
          ctx.fillRect(cx, cy, s + 0.5, s + 0.5);
        } else {
          ctx.fillStyle = '#d9d2c5';
          ctx.fillRect(cx + s * 0.12, cy + s * 0.12, s * 0.76, s * 0.76);
          if (v === FINISH && markImg && markImg.complete) {
            ctx.drawImage(markImg, cx + s * 0.3, cy + s * 0.12, s * 0.4, s * 0.64);
          }
        }
      }
    }
    var gx = ox + (wx + 0.5) * s, gy = oy + (wy + 0.5) * s;
    var frame = ((wd & 3) * 4);
    if (pegImg && pegImg.complete && pegImg.width) {
      ctx.drawImage(pegImg, frame * PW, 0, PW, PH, gx - s * 0.48, gy - s * 0.62, s * 0.96, s * 1.02);
    } else {
      ctx.fillStyle = '#f5d76e';
      ctx.beginPath(); ctx.arc(gx, gy, s * 0.28, 0, Math.PI * 2); ctx.fill();
      var ang = (wd * Math.PI) / 2;
      ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + Math.sin(ang) * s * 0.32, gy - Math.cos(ang) * s * 0.32);
      ctx.stroke();
    }
  }

  function locate() {
    var y, x;
    start = finish = { x: 0, y: 0 };
    for (y = 0; y < rows; y++) {
      for (x = 0; x < cols; x++) {
        if (map[y][x] === START) start = { x: x, y: y };
        if (map[y][x] === FINISH) finish = { x: x, y: y };
      }
    }
  }

  function resetPos() {
    px = start.x; py = start.y; pd = E;
    paint(px, py, pd);
  }

  function stepTo(d) {
    if (d === N) py--; else if (d === E) px++; else if (d === S) py++; else px--;
  }

  function compile(block) {
    var ops = [], t, body, els;
    while (block) {
      t = block.type;
      if (t === 'maze_moveForward') ops.push({ op: 'fwd', id: block.id });
      else if (t === 'maze_turn') ops.push({ op: block.getFieldValue('DIR'), id: block.id });
      else if (t === 'maze_forever') {
        body = compile(block.getInputTargetBlock('DO'));
        ops.push({ op: 'forever', body: body, id: block.id });
      } else if (t === 'maze_if' || t === 'maze_ifElse') {
        body = compile(block.getInputTargetBlock('DO'));
        els = t === 'maze_ifElse' ? compile(block.getInputTargetBlock('ELSE')) : [];
        ops.push({ op: t === 'maze_ifElse' ? 'ifelse' : 'if', dir: block.getFieldValue('DIR'), body: body, els: els, id: block.id });
      }
      block = block.getNextBlock();
    }
    return ops;
  }

  function relOf(dir) {
    if (dir === 'isPathForward') return 0;
    if (dir === 'isPathRight') return 1;
    if (dir === 'isPathLeft') return 3;
    return 0;
  }

  function runOps(ops, budget) {
    var i, op, ok;
    for (i = 0; i < ops.length; i++) {
      if (budget.n-- <= 0) return 'timeout';
      if (!notDone() && ops[i].op === 'forever') return 'win';
      op = ops[i];
      log.push(op);
      if (op.op === 'fwd') {
        if (!isOpen(0)) {
          log.pop();
          log.push({ op: 'crash', id: op.id });
          return 'crash';
        }
        stepTo(pd);
        if (!notDone()) return 'win';
      } else if (op.op === 'turnLeft') pd = (pd + 3) & 3;
      else if (op.op === 'turnRight') pd = (pd + 1) & 3;
      else if (op.op === 'forever') {
        while (notDone()) {
          if (budget.n-- <= 0) return 'timeout';
          if (!op.body.length) return 'fail';
          ok = runOps(op.body, budget);
          if (ok && ok !== 'ok') return ok;
        }
        return 'win';
      } else if (op.op === 'if' || op.op === 'ifelse') {
        if (isOpen(relOf(op.dir))) {
          ok = runOps(op.body, budget);
        } else if (op.els) {
          ok = runOps(op.els, budget);
        }
        if (ok && ok !== 'ok') return ok;
      }
    }
    return notDone() ? 'ok' : 'win';
  }

  function clearTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }

  function highlight(id) {
    if (workspace && workspace.highlightBlock) workspace.highlightBlock(id || null);
  }

  function animate(i, result, onDone) {
    if (i >= log.length) {
      highlight(null);
      paint(px, py, pd);
      running = false;
      onDone(result);
      return;
    }
    var op = log[i];
    highlight(op.id);
    if (op.op === 'fwd') stepTo(pd);
    else if (op.op === 'turnLeft') pd = (pd + 3) & 3;
    else if (op.op === 'turnRight') pd = (pd + 1) & 3;
    paint(px, py, pd);
    var delay = 80 + (100 - (root.BG && root.BG.speed ? root.BG.speed() : 50)) * 4;
    if (op.op === 'crash') delay = 280;
    timers.push(setTimeout(function () { animate(i + 1, result, onDone); }, delay));
  }

  function toolboxFor(lv) {
    var c = [
      { kind: 'block', type: 'maze_moveForward' },
      { kind: 'block', type: 'maze_turn', fields: { DIR: 'turnLeft' } },
      { kind: 'block', type: 'maze_turn', fields: { DIR: 'turnRight' } }
    ];
    if (lv > 2) c.push({ kind: 'block', type: 'maze_forever' });
    if (lv === 6) c.push({ kind: 'block', type: 'maze_if', fields: { DIR: 'isPathLeft' } });
    else if (lv > 6) {
      c.push({ kind: 'block', type: 'maze_if' });
      if (lv > 8) c.push({ kind: 'block', type: 'maze_ifElse' });
    }
    return { kind: 'flyoutToolbox', contents: c };
  }

  function defaultXml(lv) {
    return '<xml xmlns="https://developers.google.com/blockly/xml"><block type="maze_moveForward" x="70" y="70" movable="' + (lv !== 1) + '"></block></xml>';
  }

  root.MazeGame = {
    maxLevel: 10,
    maxBlocks: function (lv) { return MAX_BLOCKS[lv - 1]; },
    toolbox: toolboxFor,
    defaultXml: defaultXml,
    hint: function (lv) { return HINTS[lv - 1]; },
    mount: function (ws, canvasEl, lv) {
      workspace = ws;
      canvas = canvasEl;
      level = lv;
      map = MAPS[lv - 1];
      rows = map.length; cols = map[0].length;
      pegImg = loadImg(root.BG_ASSETS && root.BG_ASSETS.pegman);
      markImg = loadImg(root.BG_ASSETS && root.BG_ASSETS.marker);
      locate();
      resetPos();
      pegImg.onload = function () { paint(px, py, pd); };
      markImg.onload = function () { paint(px, py, pd); };
    },
    run: function (onDone) {
      if (running) return;
      clearTimers();
      resetPos();
      var tops = workspace.getTopBlocks(true);
      if (level === 1 && tops.length > 1) {
        onDone('stack');
        return;
      }
      log = [];
      var ops = compile(tops[0] || null);
      var result = runOps(ops, { n: 10000 });
      px = start.x; py = start.y; pd = E;
      running = true;
      animate(0, result, onDone);
    },
    reset: function () {
      clearTimers();
      running = false;
      highlight(null);
      resetPos();
    },
    resize: function () { if (map) paint(px, py, pd); }
  };
})(window);
