// Boot the original GameManager, with two seams:
//   1. RNG — Math.random in addRandomTile / randomAvailableCell, swapped for a
//      seeded generator when a race is on so both boards spawn the same tiles.
//   2. actuate / restart — friend-mode publishes the row and swallows New Game
//      mid-race (Play again starts the next round once the current one is over).
(function (root) {
  'use strict';

  root.G2048 = root.G2048 || {};

  function rnd() {
    return (root.G2048.random) ? root.G2048.random() : Math.random();
  }

  Grid.prototype.randomAvailableCell = function () {
    var cells = this.availableCells();
    if (cells.length) return cells[Math.floor(rnd() * cells.length)];
  };

  GameManager.prototype.addRandomTile = function () {
    if (this.grid.cellsAvailable()) {
      var value = rnd() < 0.9 ? 2 : 4;
      var tile = new Tile(this.grid.randomAvailableCell(), value);
      this.grid.insertTile(tile);
    }
  };

  GameManager.prototype.resetBoard = function () {
    this.grid = new Grid(this.size);
    this.score = 0;
    this.over = false;
    this.won = false;
    this.keepPlaying = false;
    this.addStartTiles();
    this.actuator.continueGame();
    this.actuate();
  };

  var origMove = GameManager.prototype.move;
  GameManager.prototype.move = function (direction) {
    if (root.G2048.frozen) return;
    origMove.call(this, direction);
  };

  var origActuate = GameManager.prototype.actuate;
  GameManager.prototype.actuate = function () {
    origActuate.call(this);
    if (root.G2048.Mp) root.G2048.Mp.onActuate(this);
  };

  var origRestart = GameManager.prototype.restart;
  GameManager.prototype.restart = function () {
    if (root.G2048.Mp && root.G2048.Mp.onRestart()) return;
    origRestart.call(this);
  };

  var origKeep = GameManager.prototype.keepPlaying;
  GameManager.prototype.keepPlaying = function () {
    if (root.G2048.mp) return;
    origKeep.call(this);
  };

  function chromeEl(el) {
    return el && el.closest && el.closest('a, button, input, textarea, .restart-button, .friend-button, .retry-button, .keep-playing-button, #friend-bar');
  }

  // Original only swipes on .game-container. In this iframe the heading and
  // empty cream are most of the thumb's landing zone, so a swipe there has
  // to move tiles too. Skip the board itself — vendor already handles it —
  // so one swipe cannot fire twice.
  function bindAnywhereSwipe(game) {
    var input = game && game.inputManager;
    if (!input || !input.emit) return;
    var sx, sy, tracking = false;
    document.addEventListener('touchstart', function (e) {
      if (!e.changedTouches || !e.changedTouches.length) return;
      if (chromeEl(e.target)) return;
      if (e.target.closest && e.target.closest('.game-container')) return;
      sx = e.changedTouches[0].clientX;
      sy = e.changedTouches[0].clientY;
      tracking = true;
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (!tracking) return;
      tracking = false;
      if (!e.changedTouches || !e.changedTouches.length) return;
      var dx = e.changedTouches[0].clientX - sx;
      var dy = e.changedTouches[0].clientY - sy;
      var absDx = Math.abs(dx), absDy = Math.abs(dy);
      if (Math.max(absDx, absDy) > 24) {
        input.emit('move', absDx > absDy ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
      }
    }, { passive: true });
  }

  function start() {
    root.requestAnimationFrame(function () {
      root.G2048.game = new GameManager(4, KeyboardInputManager, HTMLActuator, LocalStorageManager);
      bindAnywhereSwipe(root.G2048.game);
      try { root.focus(); } catch (e) {}
    });
  }

  document.addEventListener('pointerdown', function () {
    try { root.focus(); } catch (e) {}
  });

  if (root.gifos && root.gifos.onBack) {
    root.gifos.onBack(function () {
      if (root.G2048.mp && root.G2048.Mp) root.G2048.Mp.leave();
    });
  }

  LocalStorageManager.load().then(start);
})(window);
