// Destack of mminer/hexahedral (MIT). The webpack store and vdom shell stay behind.
// Tap an adjacent tile, swipe, or use arrows. Progress is a private save.
(function () {
  'use strict';
  var LEVELS = window.HEX_LEVELS;
  var PRESSED = '_', UNPRESSED = '0', BROKEN = 'x';
  var $ = function (id) { return document.getElementById(id); };
  var saveDb = null;
  try { if (window.gifos) saveDb = gifos.db('save'); } catch (e) {}

  var state = {
    view: 'menu',
    level: 0,
    maxReached: 0,
    tiles: [],
    player: { row: 0, column: 0 },
    moves: 0,
    maxMoves: 0,
    status: 'playing'
  };

  function cloneTiles(src) {
    return src.map(function (row) { return row.slice(); });
  }
  function persist() {
    if (!saveDb) return;
    saveDb.put({
      id: 'progress',
      level: state.level,
      maxReached: state.maxReached
    }).catch(function () {});
  }
  function canMoveTo(row, col) {
    if (row < 0 || col < 0 || row >= state.tiles.length || col >= state.tiles[0].length) return false;
    var t = state.tiles[row][col];
    return t === PRESSED || t === UNPRESSED;
  }
  function dist(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.column - b.column);
  }
  function won() {
    return !state.tiles.some(function (row) {
      return row.some(function (t) { return t === UNPRESSED; });
    });
  }

  function loadLevel(n) {
    if (n < 0 || n >= LEVELS.length) n = 0;
    var L = LEVELS[n];
    state.view = 'play';
    state.level = n;
    state.maxReached = Math.max(state.maxReached, n);
    state.tiles = cloneTiles(L.tiles);
    state.player = { row: L.playerPosition.row, column: L.playerPosition.column };
    state.moves = 0;
    state.maxMoves = L.maxMoves;
    state.status = 'playing';
    persist();
    render();
  }
  function moveTo(row, col) {
    if (state.status !== 'playing') return;
    if (!canMoveTo(row, col)) return;
    if (dist(state.player, { row: row, column: col }) !== 1) return;
    var cur = state.tiles[row][col];
    state.tiles[row][col] = cur === PRESSED ? UNPRESSED : PRESSED;
    state.player = { row: row, column: col };
    state.moves++;
    if (won()) {
      state.status = 'won';
      $('msg').textContent = 'Cleared in ' + state.moves + '.';
      setTimeout(function () { loadLevel(state.level + 1); }, 1400);
    } else if (state.moves >= state.maxMoves) {
      state.status = 'lost';
      $('msg').textContent = 'Out of moves.';
      setTimeout(function () { loadLevel(state.level); }, 1400);
    }
    render();
  }

  function renderMenu() {
    $('menu').hidden = false;
    $('level').hidden = true;
    $('nav').innerHTML = '';
    $('hud').hidden = true;
    document.body.className = '';
    $('msg').textContent = 'Tap a neighbour, swipe, or use arrows.';
  }
  function render() {
    document.body.className = state.status === 'won' ? 'won' : state.status === 'lost' ? 'lost' : '';
    if (state.view === 'menu') { renderMenu(); return; }
    $('menu').hidden = true;
    $('level').hidden = false;
    $('hud').hidden = false;
    $('progress').style.width = (100 * state.moves / state.maxMoves) + '%';
    var nav = $('nav');
    nav.innerHTML = '';
    var start = state.level < 10 ? 0 : state.level < 20 ? 10 : 20;
    var i;
    for (i = start; i < start + 10; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = String(i + 1);
      if (i === state.level) b.className = 'now';
      else if (i <= state.maxReached) b.className = 'done';
      b.disabled = i > state.maxReached;
      b.dataset.n = String(i);
      nav.appendChild(b);
    }
    var field = $('level');
    var rows = state.tiles.length, cols = state.tiles[0].length;
    field.style.width = 'calc(' + cols + ' * var(--square))';
    field.style.height = 'calc(' + rows + ' * var(--square))';
    field.innerHTML = '';
    var r, c;
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
      var cell = document.createElement('div');
      var t = state.tiles[r][c];
      cell.className = 'cell ' + (t === UNPRESSED ? 'unpressed' : t === PRESSED ? 'pressed' : 'broken');
      cell.style.top = 'calc(' + r + ' * var(--square))';
      cell.style.left = 'calc(' + c + ' * var(--square))';
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
      field.appendChild(cell);
    }
    var pl = document.createElement('div');
    pl.className = 'player';
    pl.style.top = 'calc(' + state.player.row + ' * var(--square))';
    pl.style.left = 'calc(' + state.player.column + ' * var(--square))';
    field.appendChild(pl);
    if (state.status === 'playing') {
      $('msg').textContent = (state.maxMoves - state.moves) + ' left · level ' + (state.level + 1);
    }
  }

  $('menu').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-diff]');
    if (!b) return;
    loadLevel(+b.dataset.diff);
  });
  $('nav').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-n]');
    if (!b || b.disabled) return;
    loadLevel(+b.dataset.n);
  });
  $('level').addEventListener('click', function (e) {
    var c = e.target.closest('.cell');
    if (!c) return;
    moveTo(+c.dataset.row, +c.dataset.col);
  });

  var keysDown = {};
  document.addEventListener('keydown', function (e) {
    if (state.view !== 'play' || state.status !== 'playing') return;
    if (keysDown[e.keyCode]) return;
    var p = state.player;
    if (e.keyCode === 37) moveTo(p.row, p.column - 1);
    else if (e.keyCode === 38) moveTo(p.row - 1, p.column);
    else if (e.keyCode === 39) moveTo(p.row, p.column + 1);
    else if (e.keyCode === 40) moveTo(p.row + 1, p.column);
    else if (e.keyCode === 82) loadLevel(state.level);
    else return;
    keysDown[e.keyCode] = 1;
    e.preventDefault();
  });
  document.addEventListener('keyup', function (e) { delete keysDown[e.keyCode]; });

  var touch0 = null;
  document.addEventListener('touchstart', function (e) {
    if (state.view !== 'play') return;
    var t = e.changedTouches[0];
    touch0 = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (!touch0 || state.view !== 'play') return;
    var t = e.changedTouches[0];
    var dx = t.clientX - touch0.x, dy = t.clientY - touch0.y;
    touch0 = null;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
    var p = state.player;
    if (Math.abs(dx) > Math.abs(dy)) moveTo(p.row, p.column + (dx > 0 ? 1 : -1));
    else moveTo(p.row + (dy > 0 ? 1 : -1), p.column);
  }, { passive: true });

  if (window.gifos && gifos.onBack) {
    gifos.onBack(function () {
      if (state.view === 'play') { state.view = 'menu'; render(); return true; }
      return false;
    });
  }

  async function boot() {
    if (saveDb) {
      try {
        var rec = await saveDb.get('progress');
        if (rec) {
          state.maxReached = rec.maxReached || 0;
          if (typeof rec.level === 'number') loadLevel(rec.level);
        }
      } catch (e) {}
    }
    if (state.view === 'menu') render();
  }
  window.HEX = {
    PRESSED: PRESSED, UNPRESSED: UNPRESSED, BROKEN: BROKEN,
    count: LEVELS.length,
    first: LEVELS[0],
    last: LEVELS[LEVELS.length - 1]
  };
  render();
  boot();
})();
