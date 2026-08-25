// The save. Upstream wrote two localStorage keys (bestScore, gameState); the
// sandbox has no localStorage, so this is a LocalStorageManager with the same
// methods over the private `save` collection.
//
// The gameState half is no longer a single slot. It is a pointer into the
// archive in hist.js, so New Game opens a new game instead of erasing the last
// one. Best score stays exactly what it was: one all-time number, unaffected
// by deleting a game out of history.
//
// Friend-mode never touches any of it — a race must not overwrite the solo
// game you were in the middle of, and a race is not a game you played alone.
(function (root) {
  'use strict';

  var mem = { bestScore: 0 };
  var db = null;
  var timer = 0;
  var allRows = null;
  try { if (root.gifos && root.gifos.db) db = root.gifos.db('save'); } catch (e) {}

  // ONE read of the collection at boot, shared with the archive: best score and
  // every game row arrive in the same round trip.
  function readAll() {
    if (!allRows) allRows = db ? db.getAll() : Promise.resolve([]);
    return allRows;
  }

  var histDb = db ? {
    getAll: readAll,
    put: function (rec) { return db.put(rec); },
    'delete': function (id) { return db['delete'](id); }
  } : null;

  var hist = root.G2048.Hist.create(histDb || {
    getAll: function () { return Promise.resolve([]); },
    put: function () { return Promise.resolve(); },
    'delete': function () { return Promise.resolve(); }
  });
  root.G2048.hist = hist;

  function writeBest() {
    if (!db) return;
    db.put({ id: 'best', score: mem.bestScore || 0 })['catch'](function () {});
  }

  // Debounced while playing; immediate on the way out, because a timer armed
  // during pagehide never fires.
  function persistBest(immediate) {
    if (!db) return;
    if (timer) { clearTimeout(timer); timer = 0; }
    if (immediate) { writeBest(); return; }
    timer = setTimeout(function () { timer = 0; writeBest(); }, 200);
  }

  function racing() { return !!(root.G2048 && root.G2048.mp); }

  function LocalStorageManager() {}

  LocalStorageManager.prototype.getBestScore = function () {
    return mem.bestScore || 0;
  };
  LocalStorageManager.prototype.setBestScore = function (score) {
    var n = +score || 0;
    if (n > (mem.bestScore || 0)) mem.bestScore = n;
    persistBest();
  };
  LocalStorageManager.prototype.getGameState = function () {
    if (racing()) return null;
    return hist.state();
  };
  LocalStorageManager.prototype.setGameState = function (gameState) {
    if (racing()) return;
    hist.save(gameState);
  };
  // Upstream's "forget the game": New Game, and the game-over inside actuate.
  // Here it only lets go of the row — the board stays in history.
  LocalStorageManager.prototype.clearGameState = function () {
    if (racing()) return;
    hist.detach();
  };

  // The final board of a lost game. Upstream never writes it: actuate() calls
  // clearGameState() instead of setGameState() the moment `over` is true, so
  // the last thing you saw was the one position never saved. app.js calls this
  // first, so the archived game ends on the board that actually killed it.
  LocalStorageManager.finalize = function (gameState) {
    if (racing()) return;
    hist.save(gameState);
    hist.flush();
  };

  LocalStorageManager.load = function () {
    return readAll().then(function (rows) {
      (rows || []).forEach(function (r) {
        if (r && r.id === 'best' && r.score) mem.bestScore = +r.score || 0;
      });
    })['catch'](function () {}).then(function () { return hist.load(); });
  };

  root.addEventListener('pagehide', function () {
    persistBest(true);
    hist.flush();
  });
  root.LocalStorageManager = LocalStorageManager;
})(window);
