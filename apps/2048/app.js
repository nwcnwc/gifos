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

  function start() {
    root.requestAnimationFrame(function () {
      root.G2048.game = new GameManager(4, KeyboardInputManager, HTMLActuator, LocalStorageManager);
    });
  }

  if (root.gifos && root.gifos.onBack) {
    root.gifos.onBack(function () {
      if (root.G2048.mp && root.G2048.Mp) root.G2048.Mp.leave();
    });
  }

  LocalStorageManager.load().then(start);
})(window);
