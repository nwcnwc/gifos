// Boot the original Dices / Player, with three seams:
//   1. Save — best score and the solo game in progress live in the file.
//   2. Table — friend-mode publishes the row and swallows a mid-round New
//      Game (Play again starts the next round once every card is full).
//   3. Rules — official box values, tap-to-keep, three rolls (rules.js).
(function (root) {
  'use strict';

  var Y = root.Yahtzee = root.Yahtzee || {};
  Y.mp = false;
  Y.best = 0;
  Y.player = null;
  Y.dices = null;

  var $ = function (id) { return document.getElementById(id); };

  function paintBest() {
    var el = $('best');
    if (el) el.textContent = 'Best: ' + (Y.best || 0);
  }

  Y.total = function () { return Y.player ? Y.player.total : 0; };
  Y.filled = function () {
    return (Y.Rules && Y.Rules.filledOf) ? Y.Rules.filledOf(Y.player) : 0;
  };
  Y.gameover = function () { return !!(Y.player && Y.player.gameover); };

  function applySavedClasses(player) {
    ['multi', 'yams'].forEach(function (type) {
      var nodes = document.querySelectorAll('.result.' + type);
      (player[type] || []).forEach(function (h, i) {
        var node = nodes[i];
        if (!node) return;
        if (h.isSaved != null) node.classList.add('saved');
        else node.classList.remove('saved');
      });
    });
    if (player.gameover) {
      player.endgame();
      var total = document.querySelector('#total');
      if (total) total.classList.add('endgame');
      if (typeof resultShow === 'function') resultShow();
    }
  }

  function restore(player, state) {
    if (!state) return false;
    if (state.dices && state.dices.length === 5) player.dices = state.dices;
    if (state.multi && state.multi.length === player.multi.length) {
      state.multi.forEach(function (h, i) {
        player.multi[i].isSaved = h.isSaved;
        player.multi[i].isTrue = h.isTrue;
        player.multi[i].scoreNow = h.scoreNow;
      });
    }
    if (state.yams && state.yams.length === player.yams.length) {
      state.yams.forEach(function (h, i) {
        player.yams[i].isSaved = h.isSaved;
        player.yams[i].isTrue = h.isTrue;
        player.yams[i].scoreNow = h.scoreNow;
      });
    }
    if (typeof state.counter === 'number') player.counter = state.counter;
    player.gameover = !!state.gameover;
    player.yahtzeeBonus = state.yahtzeeBonus || 0;
    if (typeof state.rolledThisTurn === 'boolean') player.rolledThisTurn = state.rolledThisTurn;
    else player.rolledThisTurn = !player.gameover;
    applySavedClasses(player);
    player.writeResult();
    return true;
  }

  function afterMove() {
    if (!Y.player) return;
    if (Y.player.total > Y.best) {
      Y.best = Y.player.total;
      if (root.YahtzeeStore) root.YahtzeeStore.setBest(Y.best);
      paintBest();
    }
    if (root.YahtzeeStore) {
      if (Y.player.gameover) root.YahtzeeStore.clearGame();
      else root.YahtzeeStore.setGame(Y.player, Y.dices);
    }
    if (Y.Mp) Y.Mp.onChange();
    if (Y.Rules) Y.Rules.paintTurn();
  }
  Y.afterMove = afterMove;

  // Live table only — does not touch the solo save. Friend-mode must not
  // overwrite the game you were in the middle of; leave() puts it back.
  Y.resetGame = function () {
    var player = Y.player, dices = Y.dices;
    if (!player || !dices) return;
    if (typeof resultHide === 'function') resultHide();
    if (typeof removeClass === 'function') {
      removeClass('.dice', 'selected');
      removeClass('.dice', 'held');
      removeClass('.multi', 'saved');
      removeClass('.yams', 'saved');
      removeClass('.multi', 'must');
      removeClass('.yams', 'locked');
    }
    var sum = document.querySelector('#sum');
    if (sum) sum.style = '';
    var total = document.querySelector('#total');
    if (total) total.classList.remove('endgame');
    player.reset();
    if (Y.Rules) Y.Rules.afterResetVisual();
    else {
      dices.parkInAll();
      dices.display(player.dices);
    }
  };

  Y.restoreSolo = function () {
    var saved = root.YahtzeeStore && root.YahtzeeStore.getGame();
    Y.resetGame();
    if (saved && restore(Y.player, saved)) {
      if (Y.player.rolledThisTurn && !Y.player.gameover) {
        if (Y.Rules && Y.Rules.setWaiting) Y.Rules.setWaiting(false);
        Y.dices.display(Y.player.dices);
        if (saved.held && Y.dices) {
          Y.dices.selected = saved.held.slice();
          if (Y.Rules) Y.Rules.paintHeld(Y.dices);
        }
      } else if (Y.Rules) {
        Y.Rules.afterResetVisual();
      }
    }
  };

  function wire() {
    var player = Y.player, dices = Y.dices;
    var R = Y.Rules;
    dices.$dices.forEach(function (el) {
      el.addEventListener('click', function (e) { R.hold(e); });
    });
    document.querySelectorAll('.die-hit').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        var i = el.getAttribute('data-i');
        var die = dices.$dices[+i];
        if (die) R.hold({ currentTarget: die });
      });
    });
    ['multi', 'yams'].forEach(function (type) {
      document.querySelectorAll('.result.' + type).forEach(function (el, i) {
        el.addEventListener('click', function (e) {
          R.scoreLine(type, i, e);
        });
      });
    });
    function doRoll() {
      if (Y.mp && player.gameover) {
        if (Y.Mp) Y.Mp.playAgain();
        return;
      }
      R.roll();
      afterMove();
    }
    $('play').addEventListener('click', doRoll);
    var rollBtn = $('rollBtn');
    if (rollBtn) rollBtn.addEventListener('click', function (e) {
      e.preventDefault();
      doRoll();
    });
    var show = $('showScores');
    if (show) show.addEventListener('click', resultToggle);
  }

  function whenArtReady(fn) {
    var imgs = [$('colors'), $('nb')];
    var left = imgs.length;
    function one() { if (--left <= 0) fn(); }
    imgs.forEach(function (img) {
      if (!img || img.complete) one();
      else {
        img.addEventListener('load', one);
        img.addEventListener('error', one);
      }
    });
  }

  function start() {
    if (Y.Rules && Y.Rules.patchPlayer) Y.Rules.patchPlayer();
    Y.dices = new Dices();
    Y.player = new Player();
    var saved = root.YahtzeeStore && root.YahtzeeStore.getGame();
    if (saved && restore(Y.player, saved)) {
      if (Y.player.rolledThisTurn && !Y.player.gameover) {
        if (Y.Rules && Y.Rules.setWaiting) Y.Rules.setWaiting(false);
        Y.dices.display(Y.player.dices);
        if (saved.held) {
          Y.dices.selected = saved.held.slice();
          if (Y.Rules) Y.Rules.paintHeld(Y.dices);
        }
      } else if (Y.Rules) {
        Y.Rules.afterResetVisual();
      }
    } else if (Y.Rules) {
      Y.Rules.afterResetVisual();
    } else {
      Y.player.writeResult();
      Y.dices.display(Y.player.dices);
    }
    Y.best = (root.YahtzeeStore && root.YahtzeeStore.getBest()) || 0;
    if (Y.player.total > Y.best) Y.best = Y.player.total;
    paintBest();
    wire();
    if (Y.Rules) Y.Rules.paintTurn();
    if (Y.Mp && Y.Mp.watch) Y.Mp.watch();
  }

  if (root.gifos && root.gifos.onBack) {
    root.gifos.onBack(function () {
      if (Y.mp && Y.Mp) Y.Mp.leave();
    });
  }

  var ready = root.YahtzeeStore ? root.YahtzeeStore.load() : Promise.resolve();
  ready.then(function () { whenArtReady(start); }).catch(function () { whenArtReady(start); });
})(window);
