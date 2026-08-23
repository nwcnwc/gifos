// Boot the original Dices / Player, with two seams:
//   1. Save — best score and the solo game in progress live in gifos.db.
//   2. Table — friend-mode publishes the row and swallows a mid-round New
//      Game (Play again starts the next round once every card is full).
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

  function filledOf(p) {
    var n = 0;
    if (!p) return 0;
    (p.multi || []).forEach(function (h) { if (h.isSaved != null) n++; });
    (p.yams || []).forEach(function (h) { if (h.isSaved != null) n++; });
    return n;
  }

  Y.total = function () { return Y.player ? Y.player.total : 0; };
  Y.filled = function () { return filledOf(Y.player); };
  Y.gameover = function () { return !!(Y.player && Y.player.gameover); };

  function applySavedClasses(player) {
    ['multi', 'yams'].forEach(function (type) {
      var nodes = document.querySelectorAll('.result.' + type);
      (player[type] || []).forEach(function (h, i) {
        var node = nodes[i];
        if (!node) return;
        if (h.isSaved != null) {
          node.classList.add('saved');
          var val = node.querySelector('.score');
          if (val) val.textContent = h.isSaved;
        } else {
          node.classList.remove('saved');
        }
      });
    });
    var sum = document.querySelector('#sum');
    var multiSaved = document.querySelectorAll('.multi.saved').length;
    if (sum && multiSaved === document.querySelectorAll('.multi').length) {
      sum.style.opacity = '0';
    }
    if (player.gameover) {
      player.endgame();
      var total = document.querySelector('#total');
      if (total) total.classList.add('endgame');
      var divs = document.querySelectorAll('.results>div');
      if (divs[0]) divs[0].style.display = 'none';
      if (divs[1]) divs[1].style.display = 'none';
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
      else root.YahtzeeStore.setGame(Y.player);
    }
    if (Y.Mp) Y.Mp.onChange();
  }

  // Live table only — does not touch the solo save. Friend-mode must not
  // overwrite the game you were in the middle of; leave() puts it back.
  Y.resetGame = function () {
    var player = Y.player, dices = Y.dices;
    if (!player || !dices) return;
    dices.parkInAll();
    if (typeof resultHide === 'function') resultHide();
    var paquet = document.querySelector('.paquet');
    if (paquet) paquet.style.transform = '';
    if (typeof removeClass === 'function') {
      removeClass('.dice', 'selected');
      removeClass('.multi', 'saved');
      removeClass('.yams', 'saved');
    }
    var sum = document.querySelector('#sum');
    if (sum) sum.style = '';
    var total = document.querySelector('#total');
    if (total) total.classList.remove('endgame');
    var divs = document.querySelectorAll('.results>div');
    if (divs[0]) divs[0].style = '';
    if (divs[1]) divs[1].style = '';
    player.reset();
    dices.display(player.dices);
  };

  Y.restoreSolo = function () {
    var saved = root.YahtzeeStore && root.YahtzeeStore.getGame();
    Y.resetGame();
    if (saved && restore(Y.player, saved)) Y.dices.display(Y.player.dices);
  };

  function wire() {
    var player = Y.player, dices = Y.dices;
    dices.$dices.forEach(function (el) {
      el.addEventListener('click', clickDices({ player: player, dices: dices }));
    });
    ['multi', 'yams'].forEach(function (type) {
      document.querySelectorAll('.result.' + type).forEach(function (el, i) {
        el.addEventListener('click', function (e) {
          clickResult({ dices: dices, player: player, type: type, i: i })(e);
          afterMove();
        });
      });
    });
    $('play').addEventListener('click', function () {
      if (Y.mp && player.gameover) {
        if (Y.Mp) Y.Mp.playAgain();
        return;
      }
      clickTurn({ player: player, dices: dices })();
      afterMove();
    });
    $('showScores').addEventListener('click', resultToggle);
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
    Y.dices = new Dices();
    Y.player = new Player();
    var saved = root.YahtzeeStore && root.YahtzeeStore.getGame();
    if (saved && restore(Y.player, saved)) {
      Y.dices.display(Y.player.dices);
    } else {
      Y.player.writeResult();
      Y.dices.display(Y.player.dices);
    }
    Y.best = (root.YahtzeeStore && root.YahtzeeStore.getBest()) || 0;
    if (Y.player.total > Y.best) Y.best = Y.player.total;
    paintBest();
    wire();
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
