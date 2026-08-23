// Private save for the original Yahtzee game. Upstream wrote nothing; the
// sandbox has no localStorage anyway. Best score and the game in progress go
// into a private `save` collection. Friend-mode never touches gameState — a
// table must not overwrite the solo game you were in the middle of.
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

  function snapshot(player, dices) {
    if (!player) return null;
    return {
      dices: (player.dices || []).map(function (d) {
        return { number: d.number, color: d.color };
      }),
      multi: (player.multi || []).map(function (h) {
        return { isSaved: h.isSaved, isTrue: h.isTrue, scoreNow: h.scoreNow };
      }),
      yams: (player.yams || []).map(function (h) {
        return { isSaved: h.isSaved, isTrue: h.isTrue, scoreNow: h.scoreNow, score: h.score, nom: h.nom };
      }),
      counter: player.counter,
      gameover: !!player.gameover,
      yahtzeeBonus: player.yahtzeeBonus || 0,
      rolledThisTurn: !!player.rolledThisTurn,
      held: (dices && dices.selected) ? dices.selected.slice() : [0, 0, 0, 0, 0]
    };
  }

  var Store = {
    getBest: function () { return mem.bestScore || 0; },
    setBest: function (score) {
      var n = +score || 0;
      if (n > (mem.bestScore || 0)) {
        mem.bestScore = n;
        persist();
      }
    },
    getGame: function () {
      if (root.Yahtzee && root.Yahtzee.mp) return null;
      return mem.gameState || null;
    },
    setGame: function (player, dices) {
      if (root.Yahtzee && root.Yahtzee.mp) return;
      mem.gameState = snapshot(player, dices);
      persist();
    },
    clearGame: function () {
      if (root.Yahtzee && root.Yahtzee.mp) return;
      mem.gameState = null;
      persist();
    },
    load: function () {
      if (!db) return Promise.resolve();
      return db.getAll().then(function (rows) {
        (rows || []).forEach(function (r) {
          if (!r || !r.id) return;
          if (r.id === 'best' && r.score) mem.bestScore = +r.score || 0;
          if (r.id === 'game' && r.state) mem.gameState = r.state;
        });
      }).catch(function () {});
    }
  };

  root.addEventListener('pagehide', function () {
    if (timer) { clearTimeout(timer); timer = 0; }
    persist();
  });
  root.YahtzeeStore = Store;
})(window);
