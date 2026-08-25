// Every game you play is kept. Nothing but you deletes one.
//
// Upstream 2048 holds ONE game state, and "New Game" overwrites it — the board
// you were on is gone the moment you start the next one. That is the bug this
// file exists to fix: a board you reached 4096 on should still be there years
// later, and you should be able to sit back down at it.
//
// So the current game is not a singleton any more, it is a ROW in an archive.
// Playing writes to that row; New Game opens a NEW row and leaves the old one
// alone; resuming an old game just moves the pointer. Because the game you are
// leaving was already saved on its last move, switching is lossless in both
// directions — the archive is a game SWITCHER, not just a graveyard.
//
// Pure: no DOM, no gifos. The db is injected ({getAll, put, delete} promises),
// which is what lets test/unit/2048.js play whole games against it in a vm.
(function (root) {
  'use strict';

  root.G2048 = root.G2048 || {};

  var VER = 1;
  var KIND = 'game';       // rows in the `save` collection that are games
  var CUR = 'cur';         // the one-row pointer at the game being played
  var LEGACY = 'game';     // the pre-archive singleton, migrated once

  function cellsOf(state) {
    return (state && state.grid && state.grid.cells) || null;
  }

  // Cells as they READ: row-major, y outer. grid.cells is cells[x][y] with x
  // the column, so a naive flatten transposes the board.
  function previewCells(state) {
    var c = cellsOf(state);
    var size = (state && state.grid && state.grid.size) || (c ? c.length : 4);
    var out = [], x, y, t;
    for (y = 0; y < size; y++) {
      for (x = 0; x < size; x++) {
        t = c && c[x] ? c[x][y] : null;
        out.push(t ? t.value : 0);
      }
    }
    return out;
  }

  function cellsSig(state) {
    return previewCells(state).join(',');
  }

  // Everything a repaint could have changed. Two actuates with the same
  // signature are the same game in the same place — booting, or re-opening an
  // archived board — and must not cost a write or a move.
  function signature(state) {
    if (!state) return '';
    return cellsSig(state) + '|' + (state.score | 0) + '|' +
      (state.over ? 1 : 0) + (state.won ? 1 : 0) + (state.keepPlaying ? 1 : 0);
  }

  function maxTile(state) {
    var cells = previewCells(state), m = 0, i;
    for (i = 0; i < cells.length; i++) if (cells[i] > m) m = cells[i];
    return m;
  }

  function tileCount(state) {
    var cells = previewCells(state), n = 0, i;
    for (i = 0; i < cells.length; i++) if (cells[i]) n++;
    return n;
  }

  var MIN = 60000, HOUR = 3600000, DAY = 86400000;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // A migrated pre-archive game has no timestamp at all. Say so instead of
  // inventing one — "earlier" is honest, 1970 is a lie.
  function relTime(ts, nowMs) {
    if (!ts) return 'earlier';
    var d = (nowMs || Date.now()) - ts;
    if (d < 0) d = 0;
    if (d < MIN) return 'just now';
    if (d < HOUR) return Math.floor(d / MIN) + ' min ago';
    if (d < DAY) { var h = Math.floor(d / HOUR); return h + (h === 1 ? ' hour ago' : ' hours ago'); }
    if (d < 2 * DAY) return 'yesterday';
    if (d < 7 * DAY) return Math.floor(d / DAY) + ' days ago';
    var t = new Date(ts), n = new Date(nowMs || Date.now());
    var stamp = MONTHS[t.getMonth()] + ' ' + t.getDate();
    return t.getFullYear() === n.getFullYear() ? stamp : stamp + ', ' + t.getFullYear();
  }

  function status(row) {
    if (!row || !row.state) return '';
    if (row.state.over) return 'finished';
    if (row.state.won && !row.state.keepPlaying) return 'won';
    return 'in play';
  }

  // What actually goes on disk. sig/cellsSig are derived on load, and moves is
  // the only thing here that cannot be recomputed from the board.
  function persistable(row) {
    return {
      id: row.id, kind: KIND, v: VER, state: row.state,
      score: row.score | 0, max: row.max | 0, moves: row.moves | 0,
      startedAt: row.startedAt || null, updatedAt: row.updatedAt || null
    };
  }

  function create(db, opts) {
    opts = opts || {};
    var clock = opts.now || function () { return Date.now(); };
    var rand = opts.random || Math.random;
    var flushMs = opts.flushMs == null ? 200 : opts.flushMs;
    var later = opts.setTimeout || function (fn, ms) { return root.setTimeout(fn, ms); };
    var cancel = opts.clearTimeout || function (t) { return root.clearTimeout(t); };

    var rows = {};
    var cur = null;
    var dirty = {};
    var curDirty = false;
    var timer = 0;
    var loaded = false;
    var onChange = opts.onChange || function () {};

    function noop() {}

    function newId() {
      var r = Math.floor(rand() * 0x1000000).toString(36);
      return 'g-' + clock().toString(36) + '-' + r;
    }

    function adopt(rec) {
      var row = {
        id: rec.id, kind: KIND, v: rec.v || VER, state: rec.state || null,
        score: rec.score | 0, max: rec.max | 0, moves: rec.moves | 0,
        startedAt: rec.startedAt || null, updatedAt: rec.updatedAt || null
      };
      if (!row.max && row.state) row.max = maxTile(row.state);
      if (!row.score && row.state) row.score = row.state.score | 0;
      row.sig = signature(row.state);
      row.cellsSig = cellsSig(row.state);
      rows[row.id] = row;
      return row;
    }

    function mark(row) { dirty[row.id] = 1; schedule(); }
    function markCur() { curDirty = true; schedule(); }

    function schedule() {
      if (!flushMs) { flush(); return; }
      if (timer) return;
      timer = later(function () { timer = 0; flush(); }, flushMs);
    }

    // Fired on every leave/delete/resume as well as on the timer: a New Game
    // must never be the reason the board before it failed to reach disk.
    function flush() {
      if (timer) { cancel(timer); timer = 0; }
      var ids = Object.keys(dirty);
      dirty = {};
      ids.forEach(function (id) {
        if (rows[id]) db.put(persistable(rows[id]))['catch'](noop);
      });
      if (curDirty) {
        curDirty = false;
        db.put({ id: CUR, gameId: cur })['catch'](noop);
      }
    }

    function load() {
      if (!db) { loaded = true; return Promise.resolve(); }
      return db.getAll().then(function (list) {
        var legacy = null, pointer = null;
        (list || []).forEach(function (r) {
          if (!r || !r.id) return;
          if (r.kind === KIND) { adopt(r); return; }
          if (r.id === CUR) { pointer = r; return; }
          if (r.id === LEGACY && r.state) legacy = r;
        });
        if (legacy) {
          // The one game the old build kept. It is somebody's board in
          // progress — it becomes the first row of the archive, not a
          // casualty of the upgrade.
          var row = adopt({
            id: newId(), state: legacy.state, moves: 0,
            startedAt: null, updatedAt: clock()
          });
          mark(row);
          if (!pointer) pointer = { gameId: row.id };
          db['delete'](LEGACY)['catch'](noop);
        }
        cur = (pointer && rows[pointer.gameId]) ? pointer.gameId : null;
        // A finished board is a memento, not a seat: reopening the app deals a
        // fresh game, and the old one waits in the list.
        if (cur && rows[cur].state && rows[cur].state.over) { cur = null; markCur(); }
        loaded = true;
      })['catch'](function () { loaded = true; });
    }

    function state() {
      var row = cur && rows[cur];
      return row ? row.state : null;
    }

    // Called on every actuate. Creates the row on the first one, so a game is
    // in the archive from its opening tiles — close the tab mid-game and it is
    // still there.
    function save(gameState) {
      if (!gameState) return null;
      var sig = signature(gameState);
      var row = cur && rows[cur];
      var t = clock();
      if (row) {
        if (row.sig === sig) return row;
        var cs = cellsSig(gameState);
        if (cs !== row.cellsSig) row.moves = (row.moves | 0) + 1;
        row.state = gameState;
        row.sig = sig;
        row.cellsSig = cs;
        row.score = gameState.score | 0;
        row.max = maxTile(gameState);
        row.updatedAt = t;
        mark(row);
        onChange();
        return row;
      }
      row = adopt({
        id: newId(), state: gameState, moves: 0,
        startedAt: t, updatedAt: t
      });
      cur = row.id;
      mark(row);
      markCur();
      onChange();
      return row;
    }

    // Leave the current game WITHOUT losing it — New Game, and the game-over
    // that upstream used to clear. The one row that goes is a board nobody
    // ever moved: that is a deal, not a game, and littering the list with them
    // would bury the games that matter.
    function detach() {
      var row = cur && rows[cur];
      cur = null;
      if (row && !(row.moves | 0)) {
        delete rows[row.id];
        delete dirty[row.id];
        if (db) db['delete'](row.id)['catch'](noop);
      }
      markCur();
      flush();
      onChange();
    }

    function resume(id) {
      var row = rows[id];
      if (!row) return null;
      cur = id;
      markCur();
      flush();
      onChange();
      return row.state;
    }

    function remove(id) {
      if (!rows[id]) return false;
      delete rows[id];
      delete dirty[id];
      if (cur === id) { cur = null; markCur(); }
      if (db) db['delete'](id)['catch'](noop);
      flush();
      onChange();
      return true;
    }

    function games() {
      return Object.keys(rows).map(function (id) { return rows[id]; })
        .sort(function (a, b) {
          var av = a.updatedAt || a.startedAt || 0;
          var bv = b.updatedAt || b.startedAt || 0;
          if (bv !== av) return bv - av;
          return a.id < b.id ? 1 : -1;
        });
    }

    return {
      load: load,
      loaded: function () { return loaded; },
      state: state,
      save: save,
      detach: detach,
      resume: resume,
      remove: remove,
      games: games,
      count: function () { return Object.keys(rows).length; },
      get: function (id) { return rows[id] || null; },
      currentId: function () { return cur; },
      flush: flush
    };
  }

  root.G2048.Hist = {
    create: create,
    signature: signature,
    cellsSig: cellsSig,
    previewCells: previewCells,
    maxTile: maxTile,
    tileCount: tileCount,
    relTime: relTime,
    status: status,
    persistable: persistable,
    VER: VER,
    KIND: KIND
  };
})(window);
