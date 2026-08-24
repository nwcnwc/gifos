// Hexahedral rules. Destack of mminer/hexahedral (MIT).
// Toggle the tile you step onto. Pink (0) is up, blue (_) is down, beige (x)
// is broken. Win when no pinks remain. Screen swipes map through the
// isometric projection so a phone drag follows the cube faces.
(function (root) {
  'use strict';
  var LEVELS = root.HEX_LEVELS;
  var PRESSED = '_', UNPRESSED = '0', BROKEN = 'x';

  function cloneTiles(src) {
    return src.map(function (row) { return row.slice(); });
  }

  function create() {
    return {
      view: 'menu',
      level: 0,
      maxReached: 0,
      tiles: [],
      player: { row: 0, column: 0 },
      moves: 0,
      maxMoves: 0,
      status: 'playing',
      history: [],
      bests: new Array(LEVELS.length)
    };
  }

  function remaining(s) {
    var n = 0, r, c;
    for (r = 0; r < s.tiles.length; r++) {
      for (c = 0; c < s.tiles[r].length; c++) {
        if (s.tiles[r][c] === UNPRESSED) n++;
      }
    }
    return n;
  }

  function canMoveTo(s, row, col) {
    if (row < 0 || col < 0 || row >= s.tiles.length || col >= s.tiles[0].length) return false;
    var t = s.tiles[row][col];
    return t === PRESSED || t === UNPRESSED;
  }

  function snapBoard(s) {
    return {
      tiles: cloneTiles(s.tiles),
      player: { row: s.player.row, column: s.player.column },
      moves: s.moves
    };
  }

  function loadLevel(s, n) {
    n = n | 0;
    if (n < 0) n = 0;
    if (n >= LEVELS.length) {
      s.view = 'cleared';
      s.status = 'cleared';
      s.level = LEVELS.length - 1;
      s.tiles = [];
      s.history = [];
      return s;
    }
    var L = LEVELS[n];
    s.view = 'play';
    s.level = n;
    s.maxReached = Math.max(s.maxReached, n);
    s.tiles = cloneTiles(L.tiles);
    s.player = { row: L.playerPosition.row, column: L.playerPosition.column };
    s.moves = 0;
    s.maxMoves = L.maxMoves;
    s.status = 'playing';
    s.history = [];
    return s;
  }

  function moveTo(s, row, col) {
    if (s.status !== 'playing' || s.view !== 'play') return { ok: false };
    if (!canMoveTo(s, row, col)) return { ok: false };
    if (Math.abs(s.player.row - row) + Math.abs(s.player.column - col) !== 1) return { ok: false };
    s.history.push(snapBoard(s));
    var cur = s.tiles[row][col];
    s.tiles[row][col] = cur === PRESSED ? UNPRESSED : PRESSED;
    s.player = { row: row, column: col };
    s.moves++;
    if (remaining(s) === 0) {
      s.status = 'won';
      var prev = s.bests[s.level];
      var isBest = !(typeof prev === 'number') || s.moves < prev;
      if (isBest) s.bests[s.level] = s.moves;
      return {
        ok: true,
        won: true,
        lost: false,
        best: isBest,
        cleared: s.level === LEVELS.length - 1
      };
    }
    if (s.moves >= s.maxMoves) {
      s.status = 'lost';
      return { ok: true, won: false, lost: true };
    }
    return { ok: true, won: false, lost: false };
  }

  function move(s, dRow, dCol) {
    return moveTo(s, s.player.row + dRow, s.player.column + dCol);
  }

  function undo(s) {
    if (!s.history.length || s.view !== 'play') return false;
    var h = s.history.pop();
    s.tiles = h.tiles;
    s.player = h.player;
    s.moves = h.moves;
    s.status = 'playing';
    return true;
  }

  // CSS field is rotateX(45deg) rotateZ(45deg), Y-down.
  // +column projects down-right; +row projects down-left.
  function isoDir(dx, dy, dead) {
    dead = dead == null ? 24 : dead;
    var sy = dy * Math.SQRT2;
    var alongCol = dx + sy;
    var alongRow = sy - dx;
    if (Math.abs(alongCol) < dead && Math.abs(alongRow) < dead) return null;
    if (Math.abs(alongCol) >= Math.abs(alongRow)) {
      return { dRow: 0, dCol: alongCol > 0 ? 1 : -1 };
    }
    return { dRow: alongRow > 0 ? 1 : -1, dCol: 0 };
  }

  function isoDrag(dx, dy, cellPx) {
    cellPx = cellPx || 48;
    var sy = dy * Math.SQRT2;
    var col = (dx + sy) / (Math.SQRT2 * cellPx);
    var row = (sy - dx) / (Math.SQRT2 * cellPx);
    if (Math.abs(col) >= Math.abs(row)) {
      return { dRow: 0, dCol: Math.max(-1, Math.min(1, col)) };
    }
    return { dRow: Math.max(-1, Math.min(1, row)), dCol: 0 };
  }

  function applySave(s, rec) {
    if (!rec || typeof rec !== 'object') return s;
    if (typeof rec.maxReached === 'number' && rec.maxReached >= 0) {
      s.maxReached = rec.maxReached | 0;
    }
    if (Array.isArray(rec.bests)) {
      var i;
      for (i = 0; i < s.bests.length && i < rec.bests.length; i++) {
        if (typeof rec.bests[i] === 'number') s.bests[i] = rec.bests[i];
      }
    }
    var level = typeof rec.level === 'number' ? rec.level | 0 : 0;
    if (level < 0) level = 0;
    if (level >= LEVELS.length) level = LEVELS.length - 1;
    s.level = level;
    if (rec.view === 'menu' || rec.view === 'cleared') {
      s.view = rec.view === 'cleared' ? 'cleared' : 'menu';
      if (s.view === 'cleared') s.status = 'cleared';
      return s;
    }
    if (typeof rec.level === 'number') loadLevel(s, level);
    return s;
  }

  function toSave(s) {
    var view = s.view;
    if (view !== 'play' && view !== 'cleared') view = 'menu';
    return {
      id: 'progress',
      level: s.level,
      maxReached: s.maxReached,
      bests: s.bests.slice(),
      view: view
    };
  }

  function bestCount(s) {
    var n = 0, i;
    for (i = 0; i < s.bests.length; i++) if (typeof s.bests[i] === 'number') n++;
    return n;
  }

  root.HEX = {
    PRESSED: PRESSED,
    UNPRESSED: UNPRESSED,
    BROKEN: BROKEN,
    count: LEVELS.length,
    first: LEVELS[0],
    last: LEVELS[LEVELS.length - 1],
    LEVELS: LEVELS,
    create: create,
    loadLevel: loadLevel,
    moveTo: moveTo,
    move: move,
    undo: undo,
    isoDir: isoDir,
    isoDrag: isoDrag,
    remaining: remaining,
    canMoveTo: canMoveTo,
    applySave: applySave,
    toSave: toSave,
    bestCount: bestCount
  };
})(typeof window !== 'undefined' ? window : globalThis);
