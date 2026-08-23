/*
 * Emoji Minesweeper — the board.
 *
 * Port of muan/emoji-minesweeper game.js (MIT). Same rules, same emoji
 * sets, same first-click-is-safe restart in solo. Changes for GifOS:
 *
 *   - Native emoji only (upstream's twemoji path fetched images).
 *   - Long-press flags on every touch device, not just iPhone. Upstream
 *     listed Mobile as a TODO; Android happened to fire contextmenu, iOS
 *     did not, and a finger had no flag at all on many phones.
 *   - Optional seed, so a race can deal the same mines to everyone.
 *     Seeded games are NOT first-click-safe: that restart would reshuffle
 *     and the two boards would diverge.
 *   - onChange after a move / flag / tick-end, so the race can publish
 *     times from this player's own row.
 *   - The 'r' restart key and the leaked keydown listener moved to app.js.
 *   - Neighbour lookup uses rows, not cols, for the Y bound (non-square
 *     boards were wrong).
 */
(function (root) {
  'use strict';

  var NUMBERS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];
  var HOLD_MS = 500;
  var HOLD_MOVE = 12;
  var FLAG_DEBOUNCE_MS = 400;

  function mulberry(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function textNode(emoji) {
    if (emoji && emoji.nodeType === 3) return emoji.cloneNode();
    return document.createTextNode(emoji && emoji.alt ? emoji.alt : String(emoji));
  }

  function Game(cols, rows, numberOfBombs, set, opts) {
    opts = opts || {};
    if (typeof opts === 'boolean') opts = {};
    this.number_of_cells = cols * rows;
    this.map = document.getElementById('map');
    this.cols = Number(cols);
    this.rows = Number(rows);
    this.number_of_bombs = Number(numberOfBombs);
    this.rate = this.number_of_bombs / this.number_of_cells;
    this.emojiset = set;
    this.numbermoji = [this.emojiset[0]].concat(NUMBERS);
    this.seed = opts.seed ? (opts.seed >>> 0) : 0;
    this.firstClickSafe = !this.seed && opts.firstClickSafe !== false;
    this.onChange = opts.onChange || null;
    this.result = false;
    this.timer = false;
    this.startTime = 0;
    this.endTime = 0;
    this.moves = 0;
    this.feedbackToggle = false;
    this.lastFlagAt = 0;
    this.init();
  }

  Game.prototype.init = function () {
    this.prepareEmoji();
    if (this.number_of_cells > 2500) {
      window.alert('too big, go away, have less than 2500 cells');
      return false;
    }
    if (this.number_of_cells <= this.number_of_bombs) {
      window.alert("more bombs than cells, can't do it");
      return false;
    }
    var that = this;
    this.moveIt(true);
    this.map.innerHTML = '';
    var gridData = this.bomb_array();

    function getIndex(x, y) {
      if (x > that.cols || x <= 0) return -1;
      if (y > that.rows || y <= 0) return -1;
      return that.cols * (y - 1) + x - 1;
    }

    var row = document.createElement('div');
    row.setAttribute('role', 'row');
    gridData.forEach(function (isBomb, i) {
      var cell = document.createElement('span');
      cell.setAttribute('role', 'gridcell');
      var mine = that.mine(isBomb);
      var x = Math.floor((i + 1) % that.cols) || that.cols;
      var y = Math.ceil((i + 1) / that.cols);
      var neighborCords = [
        [x, y - 1], [x, y + 1],
        [x - 1, y - 1], [x - 1, y], [x - 1, y + 1],
        [x + 1, y - 1], [x + 1, y], [x + 1, y + 1]
      ];
      if (!isBomb) {
        var neighbors = neighborCords.map(function (xy) { return gridData[getIndex(xy[0], xy[1])]; });
        mine.mine_count = neighbors.filter(function (n) { return n; }).length;
      }
      mine.classList.add('x' + x, 'y' + y);
      mine.neighbors = neighborCords.map(function (xy) { return '.x' + xy[0] + '.y' + xy[1]; });
      cell.appendChild(mine);
      row.appendChild(cell);
      if (x === that.cols) {
        that.map.appendChild(row);
        row = document.createElement('div');
        row.setAttribute('role', 'row');
      }
    });

    this.resetMetadata();
    this.bindEvents();
    this.updateBombsLeft();
    this.emit();
  };

  Game.prototype.bindEvents = function () {
    var that = this;
    var cells = document.getElementsByClassName('cell');

    Array.prototype.forEach.call(cells, function (target) {
      target.addEventListener('click', function (evt) {
        if (target._holdFired) {
          target._holdFired = false;
          if (evt) { evt.preventDefault(); evt.stopPropagation(); }
          return;
        }
        if (!target.isMasked || target.isFlagged) return;
        if (document.getElementsByClassName('unmasked').length === 0) {
          that.startTimer();
          if (target.isBomb && that.firstClickSafe) {
            that.restart();
            var targetClasses = target.className.replace('unmasked', '');
            var again = document.getElementsByClassName(targetClasses)[0];
            if (again) again.click();
            return;
          }
        }
        if (!evt || evt.view) that.moveIt();
        target.reveal();
        that.updateFeedback(target.getAttribute('aria-label'));
        if (target.mine_count === 0 && !target.isBomb) that.revealNeighbors(target);
        that.game();
        that.emit();
      });

      target.addEventListener('dblclick', function () {
        if (target.isFlagged) return;
        that.moveIt();
        target.reveal();
        that.revealNeighbors(target);
        that.game();
        that.emit();
      });

      target.addEventListener('contextmenu', function (evt) {
        if (evt) evt.preventDefault();
        var now = Date.now();
        if (now - that.lastFlagAt < FLAG_DEBOUNCE_MS) return;
        that.lastFlagAt = now;
        if (!target.isMasked) return;
        var emoji;
        if (target.isFlagged) {
          target.setAttribute('aria-label', 'Field');
          that.updateFeedback('Unflagged as potential bomb');
          emoji = that.emojiset[3].cloneNode();
          target.isFlagged = false;
        } else {
          target.setAttribute('aria-label', 'Flagged as potential bomb');
          that.updateFeedback('Flagged as potential bomb');
          emoji = that.emojiset[2].cloneNode();
          target.isFlagged = true;
        }
        if (target.childNodes[0]) target.childNodes[0].remove();
        target.appendChild(emoji);
        that.updateBombsLeft();
        that.emit();
      });

      // Long-press to flag. Upstream only did this on iPhone; Android often
      // fired a native contextmenu, everyone else had nothing. HOLD on any
      // coarse pointer, and swallow the click that follows so a flag is not
      // also a step.
      var holdTimer = 0;
      var startX = 0, startY = 0;
      function cancelHold() {
        if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; }
      }
      target.addEventListener('pointerdown', function (evt) {
        if (evt.pointerType === 'mouse' && evt.button !== 0) return;
        target._holdFired = false;
        startX = evt.clientX; startY = evt.clientY;
        cancelHold();
        holdTimer = setTimeout(function () {
          holdTimer = 0;
          target._holdFired = true;
          try { target.setPointerCapture(evt.pointerId); } catch (e) {}
          target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
        }, HOLD_MS);
      });
      target.addEventListener('pointermove', function (evt) {
        if (!holdTimer) return;
        var dx = evt.clientX - startX, dy = evt.clientY - startY;
        if (dx * dx + dy * dy > HOLD_MOVE * HOLD_MOVE) cancelHold();
      });
      target.addEventListener('pointerup', cancelHold);
      target.addEventListener('pointercancel', cancelHold);
      target.addEventListener('pointerleave', cancelHold);
    });
  };

  Game.prototype.game = function () {
    if (this.result) return;
    var cells = document.getElementsByClassName('cell');
    var masked = Array.prototype.filter.call(cells, function (cell) { return cell.isMasked; });
    var bombs = Array.prototype.filter.call(cells, function (cell) { return cell.isBomb && !cell.isMasked; });

    if (bombs.length > 0) {
      Array.prototype.forEach.call(masked, function (cell) { cell.reveal(); });
      this.result = 'lost';
      this.showMessage();
    } else if (masked.length === this.number_of_bombs) {
      Array.prototype.forEach.call(masked, function (cell) { cell.reveal(true); });
      this.result = 'won';
      this.showMessage();
    }
  };

  Game.prototype.restart = function () {
    this.stopTimer();
    this.result = false;
    this.timer = false;
    this.startTime = 0;
    this.endTime = 0;
    this.init();
  };

  Game.prototype.stopTimer = function () {
    if (this.timer) { clearInterval(this.timer); this.timer = false; }
  };

  Game.prototype.resetMetadata = function () {
    var timer = document.getElementById('timer');
    if (timer) timer.textContent = '0.00';
    var wrap = document.querySelector('.wrapper');
    if (wrap) wrap.classList.remove('won', 'lost');
    var result = document.querySelector('.result-emoji');
    if (result) result.textContent = '';
    var face = document.querySelector('.default-emoji');
    if (face) face.textContent = '😀';
    var gear = document.querySelector('.js-settings');
    if (gear) gear.textContent = '🔧';
  };

  Game.prototype.startTimer = function () {
    if (this.timer) return;
    var that = this;
    this.startTime = Date.now();
    this.timer = setInterval(function () {
      var el = document.getElementById('timer');
      var seconds = ((Date.now() - that.startTime) / 1000).toFixed(2);
      if (el) el.textContent = seconds;
    }, 100);
  };

  Game.prototype.mine = function (bomb) {
    var that = this;
    var base = document.createElement('button');
    base.type = 'button';
    base.setAttribute('aria-label', 'Field');
    base.className = 'cell';
    base.appendChild(this.emojiset[3].cloneNode());
    base.isMasked = true;
    if (bomb) base.isBomb = true;
    base.reveal = function (won) {
      var emoji = base.isBomb ? (won ? that.emojiset[2] : that.emojiset[1]) : that.numbermoji[base.mine_count];
      var text = base.isBomb
        ? (won ? 'Bomb discovered' : 'Boom!')
        : (base.mine_count === 0 ? 'Empty field' : base.mine_count + ' bombs nearby');
      if (this.childNodes[0]) this.childNodes[0].remove();
      this.setAttribute('aria-label', text);
      this.appendChild(emoji.cloneNode());
      this.isMasked = false;
      this.classList.add('unmasked');
    };
    return base;
  };

  Game.prototype.revealNeighbors = function (mine) {
    var neighbors = document.querySelectorAll(mine.neighbors);
    for (var i = 0; i < neighbors.length; i++) {
      if (neighbors[i].isMasked && !neighbors[i].isFlagged) {
        neighbors[i].reveal();
        if (neighbors[i].mine_count === 0 && !neighbors[i].isBomb) {
          this.revealNeighbors(neighbors[i]);
        }
      }
    }
  };

  Game.prototype.prepareEmoji = function () {
    this.emojiset = this.emojiset.map(textNode);
    this.numbermoji = this.numbermoji.map(textNode);
  };

  Game.prototype.bomb_array = function () {
    var chance = Math.floor(this.rate * this.number_of_cells);
    var arr = [];
    var i;
    for (i = 0; i < chance; i++) arr.push(true);
    for (i = 0; i < (this.number_of_cells - chance); i++) arr.push(false);
    return this.shuffle(arr);
  };

  Game.prototype.shuffle = function (array) {
    var currentIndex = array.length, temporaryValue, randomIndex;
    var rand = this.seed ? mulberry(this.seed) : Math.random;
    while (currentIndex !== 0) {
      randomIndex = Math.floor(rand() * currentIndex);
      currentIndex -= 1;
      temporaryValue = array[currentIndex];
      array[currentIndex] = array[randomIndex];
      array[randomIndex] = temporaryValue;
    }
    return array;
  };

  Game.prototype.moveIt = function (zero) {
    zero ? this.moves = 0 : this.moves++;
    var el = document.getElementById('moves');
    if (el) el.textContent = this.moves;
  };

  Game.prototype.updateBombsLeft = function () {
    var flagged = Array.prototype.filter.call(document.getElementsByClassName('cell'), function (target) {
      return target.isFlagged;
    });
    var el = document.getElementById('bombs-left');
    if (el) el.textContent = (this.number_of_bombs - flagged.length) + '/' + this.number_of_bombs;
  };

  Game.prototype.updateFeedback = function (text) {
    var feedback = document.querySelector('.feedback');
    if (!feedback) return;
    feedback.textContent = text;
    if (this.feedbackToggle) feedback.textContent += '.';
    this.feedbackToggle = !this.feedbackToggle;
  };

  Game.prototype.showMessage = function () {
    this.stopTimer();
    this.endTime = Date.now();
    var seconds = ((this.endTime - this.startTime) / 1000).toFixed(2);
    var winner = this.result === 'won';
    var emoji = winner ? '😎' : '😵';
    this.updateFeedback(winner ? 'Yay, you won!' : 'Boom! you lost.');
    var wrap = document.querySelector('.wrapper');
    if (wrap) wrap.classList.add(this.result);
    var timer = document.getElementById('timer');
    if (timer) timer.textContent = seconds;
    var result = document.getElementById('result');
    if (result) result.textContent = emoji;
  };

  Game.prototype.snapshot = function () {
    var cells = document.getElementsByClassName('cell');
    var opened = 0, flagged = 0, i;
    for (i = 0; i < cells.length; i++) {
      if (cells[i].isFlagged) flagged++;
      if (!cells[i].isMasked && !cells[i].isBomb) opened++;
    }
    var time = 0;
    if (this.startTime) {
      var end = this.endTime || Date.now();
      time = (end - this.startTime) / 1000;
    }
    return {
      seed: this.seed || 0,
      cols: this.cols,
      rows: this.rows,
      bombs: this.number_of_bombs,
      opened: opened,
      safe: this.number_of_cells - this.number_of_bombs,
      moves: this.moves || 0,
      time: time,
      result: this.result || '',
      flagged: flagged
    };
  };

  Game.prototype.emit = function () {
    if (this.onChange) {
      try { this.onChange(this.snapshot()); } catch (e) {}
    }
  };

  root.Game = Game;
})(window);
