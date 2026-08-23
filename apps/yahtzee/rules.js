// Overlay on the original Dices / Player:
//   - official box values (scores.js)
//   - tap a die to KEEP it; Roll throws the rest
//   - three rolls a turn, first roll from the deck
//   - extra Yahtzee +100 and the joker (must upper if that face is open)
// Invite and the table stay in mp.js. This file never draws a share button.
(function (root) {
  'use strict';

  var S = root.YahtzeeScores;
  var Y = root.Yahtzee = root.Yahtzee || {};
  var $ = function (id) { return document.getElementById(id); };

  var YAMS = [
    { key: 'three', nom: '3 of a kind' },
    { key: 'four', nom: '4 of a kind' },
    { key: 'sm', nom: 'Sm. straight' },
    { key: 'lg', nom: 'Lg. straight' },
    { key: 'fh', nom: 'Full house' },
    { key: 'chance', nom: 'Chance' },
    { key: 'yahtzee', nom: 'Yahtzee' }
  ];

  function filledOf(p) {
    var n = 0;
    if (!p) return 0;
    (p.multi || []).forEach(function (h) { if (h.isSaved != null) n++; });
    (p.yams || []).forEach(function (h) { if (h.isSaved != null) n++; });
    return n;
  }

  function isYahtzee(player) {
    var p = S.preview(player.dices);
    return p.face > 0;
  }

  function paintTurn() {
    var player = Y.player;
    var hint = $('turn-hint');
    var rolls = $('rolls-left');
    var btn = $('rollBtn');
    if (!player || !hint) return;
    var left = player.counter;
    var mp = !!(Y.mp);
    if (player.gameover) {
      hint.textContent = mp
        ? 'Your card is full. Waiting on the others.'
        : 'Card full. Roll starts a new game.';
      if (rolls) rolls.textContent = '';
      if (btn) btn.textContent = 'New game';
      return;
    }
    if (!player.rolledThisTurn) {
      hint.textContent = 'Roll to throw the dice. Tap a die to keep it.';
      if (rolls) rolls.textContent = '3 rolls';
      if (btn) btn.textContent = 'Roll';
      return;
    }
    if (left > 0) {
      hint.textContent = 'Tap a die to keep it. Roll throws the rest.';
      if (rolls) rolls.textContent = left === 1 ? '1 roll left' : (left + ' rolls left');
      if (btn) btn.textContent = 'Roll';
    } else {
      hint.textContent = 'Pick a line on your card.';
      if (rolls) rolls.textContent = '0 left';
      if (btn) btn.textContent = 'Roll';
    }
  }

  function paintHeld(dices) {
    if (!dices || !dices.$dices) return;
    dices.$dices.forEach(function (el, i) {
      if (dices.selected[i]) el.classList.add('held');
      else el.classList.remove('held');
    });
  }

  function applyPreview(player) {
    if (!S || !player || !player.rolledThisTurn) {
      if (player) {
        (player.multi || []).forEach(function (h) { if (h.isSaved == null) { h.isTrue = 0; h.scoreNow = 0; } });
        (player.yams || []).forEach(function (h, i) {
          if (h.isSaved == null) {
            h.isTrue = (i === 5);
            h.scoreNow = 0;
          }
        });
      }
      return;
    }
    var p = S.preview(player.dices);
    var yBox = player.yams[6] && player.yams[6].isSaved;
    var joker = p.face > 0 && (yBox === S.YAHTZEE || yBox === 0);
    var mustUpper = -1;
    if (joker) {
      if (player.multi[p.face - 1].isSaved == null) mustUpper = p.face - 1;
    }
    player.mustUpper = mustUpper;
    player.multi.forEach(function (h, i) {
      if (h.isSaved != null) return;
      h.isTrue = p.upper[i];
      h.scoreNow = p.upper[i];
    });
    player.yams.forEach(function (h, i) {
      if (h.isSaved != null) return;
      var v = p[YAMS[i].key];
      if (joker && mustUpper < 0 && i !== 6) {
        // Upper for this face is already filled: any open lower box is legal.
        if (i === 0 || i === 1 || i === 5) v = p.sum;
        else if (i === 2) v = S.SMALL_STRAIGHT;
        else if (i === 3) v = S.LARGE_STRAIGHT;
        else if (i === 4) v = S.FULL_HOUSE;
      }
      h.isTrue = !!v || i === 5;
      h.scoreNow = (i === 5) ? p.sum : v;
    });
  }

  function displayScores(player) {
    var node, val, i, h;
    var counter = document.querySelector('.counter');
    if (counter) {
      var n = player.rolledThisTurn ? player.counter : 3;
      counter.style.backgroundPosition = 'left -' + (27 * Math.max(0, 3 - n)) + 'px top 0';
    }
    var multi = document.querySelectorAll('.result.multi');
    for (i = 0; i < player.multi.length; i++) {
      h = player.multi[i];
      node = multi[i];
      if (!node) continue;
      val = node.querySelector('.score');
      if (h.isSaved != null) {
        node.classList.add('saved');
        if (val) val.textContent = h.isSaved;
      } else {
        node.classList.remove('saved');
        if (val) val.textContent = player.rolledThisTurn ? (h.scoreNow || 0) : '';
      }
    }
    var yams = document.querySelectorAll('.result.yams');
    for (i = 0; i < player.yams.length; i++) {
      h = player.yams[i];
      node = yams[i];
      if (!node) continue;
      val = node.querySelector('.score');
      if (h.isSaved != null) {
        node.classList.add('saved');
        if (val) val.textContent = h.isSaved;
      } else {
        node.classList.remove('saved');
        if (val) val.textContent = player.rolledThisTurn ? (h.scoreNow || 0) : '';
      }
    }
    var sum = document.querySelector('#sum .score');
    var upperFilled = player.multi.every(function (h) { return h.isSaved != null; });
    var upperTotal = player.sums.multi;
    if (sum) {
      if (upperFilled) sum.textContent = player.bonus;
      else sum.textContent = upperTotal + '/' + S.UPPER_AT;
    }
    var yb = $('ybonus');
    if (yb) {
      if (player.yahtzeeBonus) {
        yb.hidden = false;
        yb.textContent = '+' + player.yahtzeeBonus;
      } else {
        yb.hidden = true;
      }
    }
    var total = document.querySelector('#total .score');
    if (total) total.textContent = player.total;
    var must = player.mustUpper;
    multi.forEach(function (el, idx) {
      if (must >= 0 && player.multi[idx].isSaved == null) {
        el.classList.toggle('must', idx === must);
      } else {
        el.classList.remove('must');
      }
    });
    yams.forEach(function (el) { el.classList.toggle('locked', must >= 0); });
    paintTurn();
  }

  function patchPlayer() {
    if (typeof Player === 'undefined') return;
    Object.defineProperty(Player.prototype, 'bonus', {
      configurable: true,
      get: function () { return S.upperBonus(this.sums.multi); }
    });
    Object.defineProperty(Player.prototype, 'total', {
      configurable: true,
      get: function () {
        return this.sums.multi + this.sums.yams + this.bonus + (this.yahtzeeBonus || 0);
      }
    });
    var origReset = Player.prototype.reset;
    Player.prototype.reset = function () {
      origReset.call(this);
      this.yahtzeeBonus = 0;
      this.rolledThisTurn = false;
      this.mustUpper = -1;
      this.yams.forEach(function (h, i) {
        h.nom = YAMS[i].nom;
        h.score = 0;
      });
      this.yams[2].score = S.SMALL_STRAIGHT;
      this.yams[3].score = S.LARGE_STRAIGHT;
      this.yams[4].score = S.FULL_HOUSE;
      this.yams[6].score = S.YAHTZEE;
    };
    Player.prototype.scoreYams = function (i) {
      if (!this.rolledThisTurn) return 0;
      var p = S.preview(this.dices);
      if (i === 5) return p.chance;
      if (i === 0) return p.three;
      if (i === 1) return p.four;
      if (i === 2) return p.sm;
      if (i === 3) return p.lg;
      if (i === 4) return p.fh;
      if (i === 6) return p.yahtzee;
      return 0;
    };
    Player.prototype.scoreMulti = function (i) {
      if (!this.rolledThisTurn) return 0;
      return S.preview(this.dices).upper[i] || 0;
    };
    Player.prototype.writeResult = function () {
      applyPreview(this);
      displayScores(this);
    };
    Player.prototype.displayScores = function () { displayScores(this); };
  }

  function roll() {
    var player = Y.player, dices = Y.dices;
    if (!player || !dices) return;
    if (player.gameover) {
      Y.resetGame();
      if (Y.Mp) Y.Mp.onChange();
      return;
    }
    if (player.counter <= 0) return;
    var first = !player.rolledThisTurn;
    var toRoll = [];
    var i;
    if (first) {
      toRoll = [0, 1, 2, 3, 4];
      player.dices = player.randomAll();
      dices.selected = [0, 0, 0, 0, 0];
    } else {
      for (i = 0; i < 5; i++) {
        if (!dices.selected[i]) {
          toRoll.push(i);
          player.random(i);
        }
      }
      if (!toRoll.length) return;
    }
    var held = dices.selected.slice();
    dices.parkIn(toRoll);
    player.counter -= 1;
    player.rolledThisTurn = true;
    setWaiting(false);
    applyPreview(player);
    displayScores(player);
    setTimeout(function () {
      dices.display(player.dices);
      setTimeout(function () {
        dices.selected = held;
        paintHeld(dices);
      }, (dices.timing || 75) + 40);
    }, first ? 80 : 400);
    if (player.counter === 0 && typeof endturn === 'function') endturn();
    if (Y.Mp) Y.Mp.onChange();
  }

  function hold(ev) {
    var player = Y.player, dices = Y.dices;
    if (!player || !dices || player.gameover) return;
    if (!player.rolledThisTurn) return;
    var nb = Number(ev.currentTarget.id[1]);
    if (dices.selected[nb]) {
      dices.selected[nb] = 0;
    } else {
      dices.selected[nb] = 1;
    }
    paintHeld(dices);
  }

  function scoreLine(type, i, ev) {
    var player = Y.player, dices = Y.dices;
    if (!player || !dices) return;
    if (!player.rolledThisTurn || player.gameover) return;
    var hand = player[type][i];
    if (!hand || hand.isSaved != null) return;
    if (player.mustUpper >= 0) {
      if (!(type === 'multi' && i === player.mustUpper)) {
        var hint = $('turn-hint');
        if (hint) hint.textContent = 'Joker: score it in ' + ['Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes'][player.mustUpper] + '.';
        return;
      }
    }
    if (isYahtzee(player) && player.yams[6].isSaved === S.YAHTZEE) {
      player.yahtzeeBonus = (player.yahtzeeBonus || 0) + S.EXTRA_YAHTZEE;
    }
    hand.isSaved = hand.scoreNow || 0;
    if (ev && ev.currentTarget) ev.currentTarget.classList.add('saved');
    player.mustUpper = -1;

    if (filledOf(player) >= 13) {
      if (typeof endturn === 'function') endturn();
      player.endgame();
      var total = document.querySelector('#total');
      if (total) total.classList.add('endgame');
    } else {
      player.counter = 3;
      player.rolledThisTurn = false;
      player.mustUpper = -1;
      dices.selected = [0, 0, 0, 0, 0];
      dices.parkInAll();
      paintHeld(dices);
      setWaiting(true);
      if (typeof resultHide === 'function') resultHide();
      var paquet = document.querySelector('.paquet');
      if (paquet) paquet.style.transform = '';
      var counter = document.querySelector('.counter');
      if (counter) counter.style.opacity = 1;
    }
    player.writeResult();
    if (root.Yahtzee && root.Yahtzee.afterMove) root.Yahtzee.afterMove();
    else if (Y.Mp) Y.Mp.onChange();
  }

  function setWaiting(on) {
    document.body.classList.toggle('waiting-roll', !!on);
  }

  function afterResetVisual() {
    var player = Y.player, dices = Y.dices;
    if (!player || !dices) return;
    player.rolledThisTurn = false;
    player.mustUpper = -1;
    if (dices.pos) dices.pos[5] = 'translate(125%, 8%) rotate(-8deg)';
    dices.selected = [0, 0, 0, 0, 0];
    dices.parkInAll(0);
    paintHeld(dices);
    setWaiting(true);
    var paquet = document.querySelector('.paquet');
    if (paquet) paquet.style.transform = 'translate(125%, 8%) rotate(-8deg)';
    var counter = document.querySelector('.counter');
    if (counter) counter.style.opacity = 1;
    applyPreview(player);
    displayScores(player);
  }

  Y.Rules = {
    patchPlayer: patchPlayer,
    roll: roll,
    hold: hold,
    scoreLine: scoreLine,
    paintTurn: paintTurn,
    paintHeld: paintHeld,
    afterResetVisual: afterResetVisual,
    setWaiting: setWaiting,
    applyPreview: applyPreview,
    displayScores: displayScores,
    filledOf: filledOf
  };
})(window);
