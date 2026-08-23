// Private save for the original 2048 game. Upstream wrote two localStorage
// keys (bestScore, gameState). The sandbox has no localStorage, so this is a
// LocalStorageManager with the same methods, backed by a memory map flushed
// into the private `save` collection. Friend-mode never touches gameState —
// a race must not overwrite the solo game you were in the middle of.
(function (root) {
  'use strict';

  var mem = { bestScore: 0, gameState: null };
  var db = null;
  var timer = 0;
  try { if (root.gifos && root.gifos.db) db = root.gifos.db('save'); } catch (e) {}

  function persist() {
    if (!db) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = 0;
      db.put({ id: 'best', score: mem.bestScore || 0 }).catch(function () {});
      if (mem.gameState) db.put({ id: 'game', state: mem.gameState }).catch(function () {});
      else db.delete('game').catch(function () {});
    }, 200);
  }

  function LocalStorageManager() {}

  LocalStorageManager.prototype.getBestScore = function () {
    return mem.bestScore || 0;
  };
  LocalStorageManager.prototype.setBestScore = function (score) {
    var n = +score || 0;
    if (n > (mem.bestScore || 0)) mem.bestScore = n;
    persist();
  };
  LocalStorageManager.prototype.getGameState = function () {
    if (root.G2048 && root.G2048.mp) return null;
    return mem.gameState || null;
  };
  LocalStorageManager.prototype.setGameState = function (gameState) {
    if (root.G2048 && root.G2048.mp) return;
    mem.gameState = gameState || null;
    persist();
  };
  LocalStorageManager.prototype.clearGameState = function () {
    if (root.G2048 && root.G2048.mp) return;
    mem.gameState = null;
    persist();
  };

  LocalStorageManager.load = function () {
    if (!db) return Promise.resolve();
    return db.getAll().then(function (rows) {
      (rows || []).forEach(function (r) {
        if (!r || !r.id) return;
        if (r.id === 'best' && r.score) mem.bestScore = +r.score || 0;
        if (r.id === 'game' && r.state) mem.gameState = r.state;
      });
    }).catch(function () {});
  };

  root.addEventListener('pagehide', function () { if (timer) { clearTimeout(timer); timer = 0; } persist(); });
  root.LocalStorageManager = LocalStorageManager;
})(window);
