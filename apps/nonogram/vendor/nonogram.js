/*
 * Classic-script port of HandsomeOne/Nonogram Game + Nonogram canvas
 * (src/Game.ts, src/Nonogram.ts, src/colors.ts, src/status.ts).
 *
 * Upstream is TypeScript modules. GifOS inlines <script src> and drops
 * type=module, so this file is ordinary IIFE JavaScript. Touch listeners
 * are added: upstream only wired mouse. Editor and Solver are omitted.
 */
(function (root) {
  'use strict';

  var Status = {
    EMPTY: 0,
    FILLED: 1,
    UNSET: 2,
    TEMP_FILLED: 3,
    TEMP_EMPTY: 4,
    INCONSTANT: 5
  };

  var $ = {
    greyVeryLight: '#ccc',
    grey: '#555',
    greyVeryDark: '#111',
    blue: '#0ebeff',
    green: '#47cf73',
    violet: '#ae63e4',
    yellow: '#fcd000',
    red: '#ff3c41'
  };

  function eekwall(arr1, arr2) {
    return arr1.length === arr2.length &&
      arr1.every(function (e, i) { return e === arr2[i]; });
  }

  function Nonogram() {
    this.theme = {
      filledColor: $.grey,
      unsetColor: $.greyVeryLight,
      correctColor: $.green,
      wrongColor: $.red,
      meshColor: $.yellow,
      isMeshed: false,
      isBoldMeshOnly: false,
      isMeshOnTop: false,
      boldMeshGap: 5
    };
    this.listeners = [];
  }

  Nonogram.prototype.initCanvas = function (canvas) {
    var _canvas = canvas && canvas.nodeType === 1 ? canvas : document.getElementById(canvas);
    if (!_canvas || _canvas.tagName !== 'CANVAS') {
      _canvas = document.createElement('canvas');
    }
    this.canvas = _canvas;
    if (this.canvas.nonogram && this.canvas.nonogram.listeners) {
      this.canvas.nonogram.listeners.forEach(function (pair) {
        this.canvas.removeEventListener(pair[0], pair[1]);
      }, this);
    }
    this.canvas.nonogram = this;
    var cssW = this.theme.width || this.canvas.clientWidth || 320;
    this.canvas.width = cssW;
    this.canvas.height = cssW * (this.m + 1) / (this.n + 1);

    this.ctx = this.canvas.getContext('2d');

    this.initListeners();
    this.listeners.forEach(function (pair) {
      var type = pair[0], listener = pair[1];
      if (type.indexOf('touch') === 0) {
        this.canvas.addEventListener(type, listener, { passive: false });
      } else {
        this.canvas.addEventListener(type, listener);
      }
    }, this);
    this.canvas.oncontextmenu = function (e) { e.preventDefault(); };
  };

  Nonogram.prototype.initListeners = function () {
    this.listeners = [];
  };

  Nonogram.prototype.resize = function (width) {
    var w = width || this.theme.width || this.canvas.clientWidth || 320;
    this.theme.width = w;
    this.canvas.width = w;
    this.canvas.height = w * (this.m + 1) / (this.n + 1);
    this.print();
  };

  Nonogram.prototype.removeNonPositiveHints = function () {
    function removeNonPositiveElement(array, j, self) {
      self[j] = array.filter(function (v) { return v > 0; });
    }
    this.hints.row.forEach(removeNonPositiveElement);
    this.hints.column.forEach(removeNonPositiveElement);
  };

  Nonogram.prototype.getSingleLine = function (direction, i) {
    var g = [], j;
    if (direction === 'row') {
      for (j = 0; j < this.n; j += 1) g[j] = this.grid[i][j];
    } else if (direction === 'column') {
      for (j = 0; j < this.m; j += 1) g[j] = this.grid[j][i];
    }
    return g;
  };

  Nonogram.prototype.calculateHints = function (direction, i) {
    var hints = [];
    var line = this.getSingleLine(direction, i);
    line.reduce(function (lastIsFilled, cell) {
      if (cell === Status.FILLED) {
        hints.push(lastIsFilled ? hints.pop() + 1 : 1);
      } else if (cell !== Status.EMPTY) {
        throw new Error();
      }
      return cell === Status.FILLED;
    }, false);
    return hints;
  };

  Nonogram.prototype.isLineCorrect = function (direction, i) {
    try {
      return eekwall(this.calculateHints(direction, i), this.hints[direction][i]);
    } catch (e) {
      return false;
    }
  };

  Nonogram.prototype.getLocation = function (x, y) {
    var rect = this.canvas.getBoundingClientRect();
    var w = rect.width;
    var h = rect.height;
    var w23 = w * 2 / 3;
    var h23 = h * 2 / 3;
    var d = w23 / (this.n + 1);

    if (x < 0 || x >= w || y < 0 || y >= h) return 'outside';
    if (x >= 0 && x <= w23 && y >= 0 && y < h23) {
      if (d / 2 <= x && x < w23 - d / 2 && d / 2 <= y && y < h23 - d / 2) {
        return 'grid';
      }
      return 'limbo';
    }
    if (w23 <= x && x < w && h23 <= y && y < h) {
      return 'controller';
    }
    return 'hints';
  };

  Nonogram.prototype.print = function () {
    this.printGrid();
    this.printHints();
    this.printController();
  };

  Nonogram.prototype.printGrid = function () {
    var ctx = this.ctx;
    var w = this.canvas.width;
    var h = this.canvas.height;
    var d = w * 2 / 3 / (this.n + 1);
    var i, j;

    ctx.clearRect(-1, -1, w * 2 / 3 + 1, h * 2 / 3 + 1);
    if (this.theme.isMeshed && !this.theme.isMeshOnTop) this.printMesh();
    ctx.save();
    ctx.translate(d / 2, d / 2);
    for (i = 0; i < this.m; i += 1) {
      for (j = 0; j < this.n; j += 1) {
        ctx.save();
        ctx.translate(d * j, d * i);
        this.printCell(this.grid[i][j]);
        ctx.restore();
      }
    }
    ctx.restore();
    if (this.theme.isMeshed && this.theme.isMeshOnTop) this.printMesh();
  };

  Nonogram.prototype.printCell = function (status) {
    var ctx = this.ctx;
    var d = this.canvas.width * 2 / 3 / (this.n + 1);
    switch (status) {
      case Status.UNSET:
        ctx.fillStyle = this.theme.unsetColor;
        ctx.fillRect(d * 0.05, d * 0.05, d * 0.9, d * 0.9);
        break;
      case Status.FILLED:
        ctx.fillStyle = this.theme.filledColor;
        ctx.fillRect(-d * 0.05, -d * 0.05, d * 1.1, d * 1.1);
        break;
    }
  };

  Nonogram.prototype.printMesh = function () {
    var ctx = this.ctx;
    var d = this.canvas.width * 2 / 3 / (this.n + 1);
    var i, j;

    ctx.save();
    ctx.translate(d / 2, d / 2);
    ctx.beginPath();
    for (i = 1; i < this.m; i += 1) {
      if (!this.theme.isBoldMeshOnly) {
        ctx.moveTo(0, i * d);
        ctx.lineTo(this.n * d, i * d);
      }
      if (i % this.theme.boldMeshGap === 0) {
        ctx.moveTo(0, i * d);
        ctx.lineTo(this.n * d, i * d);
        if (!this.theme.isBoldMeshOnly) {
          ctx.moveTo(0, i * d - 1);
          ctx.lineTo(this.n * d, i * d - 1);
          ctx.moveTo(0, i * d + 1);
          ctx.lineTo(this.n * d, i * d + 1);
        }
      }
    }
    for (j = 1; j < this.n; j += 1) {
      if (!this.theme.isBoldMeshOnly) {
        ctx.moveTo(j * d, 0);
        ctx.lineTo(j * d, this.m * d);
      }
      if (j % this.theme.boldMeshGap === 0) {
        ctx.moveTo(j * d, 0);
        ctx.lineTo(j * d, this.m * d);
        if (!this.theme.isBoldMeshOnly) {
          ctx.moveTo(j * d - 1, 0);
          ctx.lineTo(j * d - 1, this.m * d);
          ctx.moveTo(j * d + 1, 0);
          ctx.lineTo(j * d + 1, this.m * d);
        }
      }
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = this.theme.meshColor;
    ctx.stroke();
    ctx.restore();
  };

  Nonogram.prototype.printHints = function () {
    var ctx = this.ctx;
    var w = this.canvas.width;
    var h = this.canvas.height;
    var d = w * 2 / 3 / (this.n + 1);
    var i, j;

    ctx.clearRect(w * 2 / 3 - 1, -1, w * 3 + 1, h * 2 / 3 + 1);
    ctx.clearRect(-1, h * 2 / 3 - 1, w * 2 / 3 + 1, h / 3 + 1);
    ctx.save();
    ctx.translate(d / 2, d / 2);
    for (i = 0; i < this.m; i += 1) {
      for (j = 0; j < this.hints.row[i].length; j += 1) {
        this.printSingleHint('row', i, j);
      }
      if (this.hints.row[i].length === 0) this.printSingleHint('row', i, 0);
    }
    for (j = 0; j < this.n; j += 1) {
      for (i = 0; i < this.hints.column[j].length; i += 1) {
        this.printSingleHint('column', j, i);
      }
      if (this.hints.column[j].length === 0) this.printSingleHint('column', j, 0);
    }
    ctx.restore();
  };

  Nonogram.prototype.printSingleHint = function (direction, i, j) {
    var ctx = this.ctx;
    var w = this.canvas.width;
    var h = this.canvas.height;
    var d = w * 2 / 3 / (this.n + 1);
    var line = this.hints[direction][i];

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = d + 'pt "Courier New", Inconsolata, Consolas, monospace';
    ctx.fillStyle = line.isCorrect ? this.theme.correctColor : this.theme.wrongColor;
    ctx.globalAlpha = (!line.isCorrect && line.unchanged) ? 0.5 : 1;
    if (direction === 'row') {
      ctx.fillText(String(this.hints.row[i][j] || 0),
        w * 2 / 3 + d * j, d * (i + 0.5), d * 0.8);
    } else if (direction === 'column') {
      ctx.fillText(String(this.hints.column[i][j] || 0),
        d * (i + 0.5), h * 2 / 3 + d * j, d * 0.8);
    }
    ctx.globalAlpha = 1;
  };

  Nonogram.prototype.printController = function () {};

  function Game(row, column, canvas, config) {
    Nonogram.call(this);
    config = config || {};
    var theme = config.theme || {};

    this.theme.filledColor = $.blue;
    this.theme.wrongColor = $.grey;
    this.theme.isMeshed = true;
    Object.assign(this.theme, theme);

    this.handleSuccess = config.onSuccess || function () {};
    this.handleAnimationEnd = config.onAnimationEnd || function () {};
    this.handleChange = config.onChange || function () {};

    this.hints = {
      row: row.slice(),
      column: column.slice()
    };
    this.removeNonPositiveHints();
    this.m = this.hints.row.length;
    this.n = this.hints.column.length;
    this.grid = new Array(this.m);
    var i;
    for (i = 0; i < this.m; i += 1) {
      this.grid[i] = new Array(this.n);
      for (var j = 0; j < this.n; j += 1) this.grid[i][j] = Status.UNSET;
    }
    this.hints.row.forEach(function (r, ri) {
      r.isCorrect = this.isLineCorrect('row', ri);
    }, this);
    this.hints.column.forEach(function (c, cj) {
      c.isCorrect = this.isLineCorrect('column', cj);
    }, this);

    this._onDown = this.mousedown.bind(this);
    this._onMove = this.mousemove.bind(this);
    this._onUp = this.brushUp.bind(this);
    this._onTouchStart = this.touchStart.bind(this);
    this._onTouchMove = this.touchMove.bind(this);
    this._onTouchEnd = this.touchEnd.bind(this);

    this.initCanvas(canvas);

    this.brush = Status.FILLED;
    this.draw = {};
    this.isPressed = false;
    this._touching = false;
    this.locked = false;
    this.print();
  }

  Game.prototype = Object.create(Nonogram.prototype);
  Game.prototype.constructor = Game;

  Game.prototype.calculateHints = function (direction, i) {
    var hints = [];
    var line = this.getSingleLine(direction, i);
    line.reduce(function (lastIsFilled, cell) {
      if (cell === Status.FILLED) {
        hints.push(lastIsFilled ? hints.pop() + 1 : 1);
      }
      return cell === Status.FILLED;
    }, false);
    return hints;
  };

  Game.prototype.initListeners = function () {
    this.listeners = [
      ['mousedown', this._onDown],
      ['mousemove', this._onMove],
      ['mouseup', this._onUp],
      ['mouseleave', this._onUp],
      ['touchstart', this._onTouchStart],
      ['touchmove', this._onTouchMove],
      ['touchend', this._onTouchEnd],
      ['touchcancel', this._onTouchEnd]
    ];
  };

  Game.prototype._pos = function (e) {
    var t = (e.touches && e.touches[0]) ||
      (e.changedTouches && e.changedTouches[0]) || e;
    return { clientX: t.clientX, clientY: t.clientY, button: e.button || 0 };
  };

  Game.prototype.touchStart = function (e) {
    e.preventDefault();
    var p = this._pos(e);
    p._fromTouch = true;
    this.mousedown(p);
    this._touching = true;
  };

  Game.prototype.touchMove = function (e) {
    e.preventDefault();
    var p = this._pos(e);
    p._fromTouch = true;
    this.mousemove(p);
  };

  Game.prototype.touchEnd = function (e) {
    e.preventDefault();
    this.brushUp();
    var self = this;
    setTimeout(function () { self._touching = false; }, 400);
  };

  Game.prototype.mousedown = function (e) {
    if (this.locked) return;
    if (this._touching && !e._fromTouch) return;
    var rect = this.canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var d = rect.width * 2 / 3 / (this.n + 1);
    var location = this.getLocation(x, y);
    if (location === 'controller') {
      this.switchBrush();
    } else if (location === 'grid') {
      this.draw.firstI = Math.floor(y / d - 0.5);
      this.draw.firstJ = Math.floor(x / d - 0.5);
      if (this.draw.firstI < 0 || this.draw.firstI >= this.m ||
          this.draw.firstJ < 0 || this.draw.firstJ >= this.n) return;
      this.draw.inverted = e.button === 2;
      var cell = this.grid[this.draw.firstI][this.draw.firstJ];
      var brush = this.brush;
      if (this.draw.inverted) {
        brush = this.brush === Status.FILLED ? Status.EMPTY : Status.FILLED;
      }
      if (cell === Status.UNSET || brush === cell) {
        this.draw.mode = (brush === cell) ? 'empty' : 'filling';
        this.isPressed = true;
        this.switchCell(this.draw.firstI, this.draw.firstJ);
      }
      this.draw.lastI = this.draw.firstI;
      this.draw.lastJ = this.draw.firstJ;
    }
  };

  Game.prototype.mousemove = function (e) {
    if (this.locked || !this.isPressed) return;
    if (this._touching && !e._fromTouch) return;
    var rect = this.canvas.getBoundingClientRect();
    var x = e.clientX - rect.left;
    var y = e.clientY - rect.top;
    var d = rect.width * 2 / 3 / (this.n + 1);
    if (this.getLocation(x, y) === 'grid') {
      var i = Math.floor(y / d - 0.5);
      var j = Math.floor(x / d - 0.5);
      if (i < 0 || i >= this.m || j < 0 || j >= this.n) return;
      if (i !== this.draw.lastI || j !== this.draw.lastJ) {
        if (this.draw.direction === undefined) {
          if (i === this.draw.firstI) this.draw.direction = 'row';
          else if (j === this.draw.firstJ) this.draw.direction = 'column';
        }
        if ((this.draw.direction === 'row' && i === this.draw.firstI) ||
            (this.draw.direction === 'column' && j === this.draw.firstJ)) {
          this.switchCell(i, j);
          this.draw.lastI = i;
          this.draw.lastJ = j;
        }
      }
    }
  };

  Game.prototype.switchBrush = function () {
    this.brush = (this.brush === Status.EMPTY) ? Status.FILLED : Status.EMPTY;
    this.printController();
    this.handleChange({ brush: this.brush });
  };

  Game.prototype.setBrush = function (status) {
    this.brush = status;
    this.printController();
    this.handleChange({ brush: this.brush });
  };

  Game.prototype.brushUp = function () {
    this.isPressed = false;
    this.draw = {};
  };

  Game.prototype.switchCell = function (i, j) {
    if (this.locked) return;
    var brush = this.brush;
    if (this.draw.inverted) {
      brush = this.brush === Status.FILLED ? Status.EMPTY : Status.FILLED;
    }
    if (brush === Status.FILLED && this.grid[i][j] !== Status.EMPTY) {
      this.grid[i][j] = (this.draw.mode === 'filling') ? Status.FILLED : Status.UNSET;
      this.hints.row[i].isCorrect = this.isLineCorrect('row', i);
      this.hints.column[j].isCorrect = this.isLineCorrect('column', j);
      this.print();
      this.handleChange({ i: i, j: j });
      if (this.isSolved()) this.succeed();
    } else if (brush === Status.EMPTY && this.grid[i][j] !== Status.FILLED) {
      this.grid[i][j] = (this.draw.mode === 'filling') ? Status.EMPTY : Status.UNSET;
      this.print();
      this.handleChange({ i: i, j: j });
    }
  };

  Game.prototype.isSolved = function () {
    return this.hints.row.every(function (r) { return !!r.isCorrect; }) &&
      this.hints.column.every(function (c) { return !!c.isCorrect; });
  };

  Game.prototype.dumpGrid = function () {
    return this.grid.map(function (row) { return row.slice(); });
  };

  Game.prototype.applyGrid = function (grid, opts) {
    opts = opts || {};
    var i, j;
    if (!grid || grid.length !== this.m) return;
    for (i = 0; i < this.m; i += 1) {
      if (!grid[i] || grid[i].length !== this.n) return;
      for (j = 0; j < this.n; j += 1) this.grid[i][j] = grid[i][j];
    }
    for (i = 0; i < this.m; i += 1) this.hints.row[i].isCorrect = this.isLineCorrect('row', i);
    for (j = 0; j < this.n; j += 1) this.hints.column[j].isCorrect = this.isLineCorrect('column', j);
    this.print();
    if (this.isSolved() && !opts.silent) this.succeed();
  };

  Game.prototype.printCell = function (status) {
    var ctx = this.ctx;
    var d = this.canvas.width * 2 / 3 / (this.n + 1);
    switch (status) {
      case Status.FILLED:
        ctx.fillStyle = this.theme.filledColor;
        ctx.fillRect(-d * 0.05, -d * 0.05, d * 1.1, d * 1.1);
        break;
      case Status.EMPTY:
        ctx.strokeStyle = $.red;
        ctx.lineWidth = d / 15;
        ctx.beginPath();
        ctx.moveTo(d * 0.3, d * 0.3);
        ctx.lineTo(d * 0.7, d * 0.7);
        ctx.moveTo(d * 0.3, d * 0.7);
        ctx.lineTo(d * 0.7, d * 0.3);
        ctx.stroke();
        break;
    }
  };

  Game.prototype.printController = function () {
    var ctx = this.ctx;
    var w = this.canvas.width;
    var h = this.canvas.height;
    var controllerSize = Math.min(w, h) / 4;
    var outerSize = controllerSize * 3 / 4;
    var offset = controllerSize / 4;
    var borderWidth = controllerSize / 20;
    var innerSize = outerSize - 2 * borderWidth;
    var self = this;

    function printFillingBrush() {
      ctx.save();
      ctx.translate(offset, 0);
      ctx.fillStyle = self.theme.meshColor;
      ctx.fillRect(0, 0, outerSize, outerSize);
      ctx.fillStyle = self.theme.filledColor;
      ctx.fillRect(borderWidth, borderWidth, innerSize, innerSize);
      ctx.restore();
    }

    function printEmptyBrush() {
      ctx.save();
      ctx.translate(0, offset);
      ctx.fillStyle = self.theme.meshColor;
      ctx.fillRect(0, 0, outerSize, outerSize);
      ctx.clearRect(borderWidth, borderWidth, innerSize, innerSize);
      ctx.strokeStyle = $.red;
      ctx.lineWidth = borderWidth;
      ctx.beginPath();
      ctx.moveTo(outerSize * 0.3, outerSize * 0.3);
      ctx.lineTo(outerSize * 0.7, outerSize * 0.7);
      ctx.moveTo(outerSize * 0.3, outerSize * 0.7);
      ctx.lineTo(outerSize * 0.7, outerSize * 0.3);
      ctx.stroke();
      ctx.restore();
    }

    ctx.clearRect(w * 2 / 3 - 1, h * 2 / 3 - 1, w / 3 + 1, h / 3 + 1);
    ctx.save();
    ctx.translate(w * 0.7, h * 0.7);
    if (this.brush === Status.FILLED) {
      printEmptyBrush();
      printFillingBrush();
    } else if (this.brush === Status.EMPTY) {
      printFillingBrush();
      printEmptyBrush();
    }
    ctx.restore();
  };

  Game.prototype.succeed = function () {
    if (this.locked) return;
    this.locked = true;
    this.handleSuccess();
    this.listeners.forEach(function (pair) {
      this.canvas.removeEventListener(pair[0], pair[1]);
    }, this);
    var ctx = this.ctx;
    var w = this.canvas.width;
    var h = this.canvas.height;
    var controllerSize = Math.min(w, h) / 4;
    var background = ctx.getImageData(0, 0, w, h);

    function getTick() {
      var size = controllerSize * 2;
      var borderWidth = size / 10;
      var tick = document.createElement('canvas');
      tick.width = size;
      tick.height = size;
      var c = tick.getContext('2d');
      c.translate(size / 3, size * 5 / 6);
      c.rotate(-Math.PI / 4);
      c.fillStyle = $.green;
      c.fillRect(0, 0, borderWidth, -size * Math.SQRT2 / 3);
      c.fillRect(0, 0, size * Math.SQRT2 * 2 / 3, -borderWidth);
      return tick;
    }

    var tick = getTick();
    var t = 0;
    var self = this;

    function f(_) {
      return 1 + Math.pow(_ - 1, 3);
    }

    function fadeTickIn() {
      ctx.putImageData(background, 0, 0);
      t += 0.03;
      ctx.globalAlpha = f(t);
      ctx.clearRect(w * 2 / 3, h * 2 / 3, w / 3, h / 3);
      ctx.drawImage(tick,
        w * 0.7 - (1 - f(t)) * controllerSize / 2,
        h * 0.7 - (1 - f(t)) * controllerSize / 2,
        (2 - f(t)) * controllerSize,
        (2 - f(t)) * controllerSize);
      ctx.globalAlpha = 1;
      if (t <= 1) requestAnimationFrame(fadeTickIn);
      else self.handleAnimationEnd();
    }

    fadeTickIn();
  };

  root.nonogram = {
    Game: Game,
    Status: Status,
    colors: $
  };
})(this);
