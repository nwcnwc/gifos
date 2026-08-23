/*
 * Battleboat — fleet, shots, and Bill Mei's probability AI.
 *
 * Port of https://github.com/billmei/battleboat (MIT, 2014) with the DOM,
 * browser storage, images, and tutorial stripped out. Coordinates match
 * upstream: cells[x][y] with x the row (down) and y the column (across).
 * Vertical = increasing x; horizontal = increasing y.
 */
(function (root) {
  'use strict';

  var SIZE = 10;
  var EMPTY = 0, SHIP = 1, MISS = 2, HIT = 3, SUNK = 4;
  var VERTICAL = 0, HORIZONTAL = 1;
  var TYPES = [
    { id: 'carrier', name: 'Aircraft Carrier', len: 5 },
    { id: 'battleship', name: 'Battleship', len: 4 },
    { id: 'destroyer', name: 'Destroyer', len: 3 },
    { id: 'submarine', name: 'Submarine', len: 3 },
    { id: 'patrolboat', name: 'Patrol Boat', len: 2 }
  ];

  var PROB_WEIGHT = 5000;
  var OPEN_HIGH_MIN = 20, OPEN_HIGH_MAX = 30;
  var OPEN_MED_MIN = 15, OPEN_MED_MAX = 25;
  var OPEN_LOW_MIN = 10, OPEN_LOW_MAX = 20;
  var RANDOMNESS = 0.1;

  function rnd(min, max) { return Math.random() * (max - min) + min; }
  function typeById(id) {
    var i;
    for (i = 0; i < TYPES.length; i++) if (TYPES[i].id === id) return TYPES[i];
    return null;
  }

  function Grid() {
    this.size = SIZE;
    this.cells = [];
    var x, y, row;
    for (x = 0; x < SIZE; x++) {
      row = [];
      for (y = 0; y < SIZE; y++) row.push(EMPTY);
      this.cells[x] = row;
    }
  }
  Grid.prototype.at = function (x, y) { return this.cells[x][y]; };
  Grid.prototype.set = function (x, y, t) { this.cells[x][y] = t; };
  Grid.prototype.clear = function () {
    var x, y;
    for (x = 0; x < SIZE; x++) for (y = 0; y < SIZE; y++) this.cells[x][y] = EMPTY;
  };
  Grid.prototype.encode = function (fog) {
    var s = '', x, y, t;
    for (x = 0; x < SIZE; x++) for (y = 0; y < SIZE; y++) {
      t = this.cells[x][y];
      if (fog && t === SHIP) t = EMPTY;
      s += String(t);
    }
    return s;
  };

  function Ship(type) {
    var spec = typeof type === 'string' ? typeById(type) : type;
    this.type = spec.id;
    this.shipLength = spec.len;
    this.maxDamage = spec.len;
    this.damage = 0;
    this.sunk = false;
    this.xPosition = 0;
    this.yPosition = 0;
    this.direction = VERTICAL;
    this.placed = false;
  }
  Ship.prototype.cells = function () {
    var out = [], i;
    for (i = 0; i < this.shipLength; i++) {
      if (this.direction === VERTICAL) out.push({ x: this.xPosition + i, y: this.yPosition });
      else out.push({ x: this.xPosition, y: this.yPosition + i });
    }
    return out;
  };
  Ship.prototype.withinBounds = function (x, y, dir) {
    if (dir === VERTICAL) return x + this.shipLength <= SIZE;
    return y + this.shipLength <= SIZE;
  };
  Ship.prototype.fits = function (grid, x, y, dir) {
    if (!this.withinBounds(x, y, dir)) return false;
    var i, cx, cy, t;
    for (i = 0; i < this.shipLength; i++) {
      cx = dir === VERTICAL ? x + i : x;
      cy = dir === VERTICAL ? y : y + i;
      t = grid.at(cx, cy);
      if (t === SHIP || t === MISS || t === SUNK) return false;
    }
    return true;
  };
  Ship.prototype.place = function (grid, x, y, dir, virtual) {
    this.xPosition = x;
    this.yPosition = y;
    this.direction = dir;
    this.placed = !virtual;
    if (virtual) return;
    var cells = this.cells(), i;
    for (i = 0; i < cells.length; i++) grid.set(cells[i].x, cells[i].y, SHIP);
  };
  Ship.prototype.covers = function (x, y) {
    if (!this.placed) return false;
    var cells = this.cells(), i;
    for (i = 0; i < cells.length; i++) {
      if (cells[i].x === x && cells[i].y === y) return true;
    }
    return false;
  };
  Ship.prototype.hit = function (grid) {
    this.damage++;
    if (this.damage >= this.maxDamage) this.sink(grid);
  };
  Ship.prototype.sink = function (grid) {
    this.damage = this.maxDamage;
    this.sunk = true;
    var cells = this.cells(), i;
    for (i = 0; i < cells.length; i++) grid.set(cells[i].x, cells[i].y, SUNK);
  };
  Ship.prototype.dump = function () {
    return { type: this.type, x: this.xPosition, y: this.yPosition, dir: this.direction };
  };

  function Fleet(grid) {
    this.grid = grid;
    this.roster = [];
    var i;
    for (i = 0; i < TYPES.length; i++) this.roster.push(new Ship(TYPES[i]));
  }
  Fleet.prototype.findByType = function (id) {
    var i;
    for (i = 0; i < this.roster.length; i++) if (this.roster[i].type === id) return this.roster[i];
    return null;
  };
  Fleet.prototype.findByCoords = function (x, y) {
    var i;
    for (i = 0; i < this.roster.length; i++) if (this.roster[i].covers(x, y)) return this.roster[i];
    return null;
  };
  Fleet.prototype.allPlaced = function () {
    var i;
    for (i = 0; i < this.roster.length; i++) if (!this.roster[i].placed) return false;
    return true;
  };
  Fleet.prototype.allSunk = function () {
    var i;
    for (i = 0; i < this.roster.length; i++) if (!this.roster[i].sunk) return false;
    return true;
  };
  Fleet.prototype.sunkCount = function () {
    var n = 0, i;
    for (i = 0; i < this.roster.length; i++) if (this.roster[i].sunk) n++;
    return n;
  };
  Fleet.prototype.placeShip = function (x, y, dir, type) {
    var ship = this.findByType(type);
    if (!ship || ship.placed) return false;
    if (!ship.fits(this.grid, x, y, dir)) return false;
    ship.place(this.grid, x, y, dir, false);
    return true;
  };
  Fleet.prototype.placeRandomly = function (skipPlaced) {
    var i, ship, x, y, dir, guard;
    for (i = 0; i < this.roster.length; i++) {
      ship = this.roster[i];
      if (skipPlaced && ship.placed) continue;
      guard = 0;
      while (guard++ < 400) {
        x = (Math.random() * SIZE) | 0;
        y = (Math.random() * SIZE) | 0;
        dir = (Math.random() * 2) | 0;
        if (ship.fits(this.grid, x, y, dir)) {
          ship.place(this.grid, x, y, dir, false);
          break;
        }
      }
    }
    return this.allPlaced();
  };
  Fleet.prototype.dump = function () {
    var out = [], i, s;
    for (i = 0; i < this.roster.length; i++) {
      s = this.roster[i];
      if (s.placed) out.push(s.dump());
    }
    return out;
  };
  Fleet.prototype.load = function (list) {
    var i, rec, ship;
    if (!list || !list.length) return false;
    for (i = 0; i < list.length; i++) {
      rec = list[i];
      ship = this.findByType(rec.type);
      if (!ship) return false;
      if (!ship.fits(this.grid, rec.x, rec.y, rec.dir)) return false;
      ship.place(this.grid, rec.x, rec.y, rec.dir, false);
    }
    return this.allPlaced();
  };

  function shoot(grid, fleet, x, y) {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null;
    var t = grid.at(x, y);
    if (t === HIT || t === SUNK || t === MISS) return null;
    if (t === SHIP) {
      grid.set(x, y, HIT);
      var ship = fleet.findByCoords(x, y);
      if (ship) ship.hit(grid);
      return grid.at(x, y) === SUNK ? SUNK : HIT;
    }
    grid.set(x, y, MISS);
    return MISS;
  }

  /* ---- Bill Mei's probability AI (battleboat.js, adapted, no DOM) ---- */

  function openings() {
    return [
      { x: 7, y: 3, weight: rnd(OPEN_LOW_MIN, OPEN_LOW_MAX) },
      { x: 6, y: 2, weight: rnd(OPEN_LOW_MIN, OPEN_LOW_MAX) },
      { x: 3, y: 7, weight: rnd(OPEN_LOW_MIN, OPEN_LOW_MAX) },
      { x: 2, y: 6, weight: rnd(OPEN_LOW_MIN, OPEN_LOW_MAX) },
      { x: 6, y: 6, weight: rnd(OPEN_LOW_MIN, OPEN_LOW_MAX) },
      { x: 3, y: 3, weight: rnd(OPEN_LOW_MIN, OPEN_LOW_MAX) },
      { x: 5, y: 5, weight: rnd(OPEN_LOW_MIN, OPEN_LOW_MAX) },
      { x: 4, y: 4, weight: rnd(OPEN_LOW_MIN, OPEN_LOW_MAX) },
      { x: 0, y: 8, weight: rnd(OPEN_MED_MIN, OPEN_MED_MAX) },
      { x: 1, y: 9, weight: rnd(OPEN_HIGH_MIN, OPEN_HIGH_MAX) },
      { x: 8, y: 0, weight: rnd(OPEN_MED_MIN, OPEN_MED_MAX) },
      { x: 9, y: 1, weight: rnd(OPEN_HIGH_MIN, OPEN_HIGH_MAX) },
      { x: 9, y: 9, weight: rnd(OPEN_HIGH_MIN, OPEN_HIGH_MAX) },
      { x: 0, y: 0, weight: rnd(OPEN_HIGH_MIN, OPEN_HIGH_MAX) }
    ];
  }

  function AI(humanGrid, humanFleet) {
    this.humanGrid = humanGrid;
    this.humanFleet = humanFleet;
    this.virtualGrid = new Grid();
    this.virtualFleet = new Fleet(this.virtualGrid);
    this.probGrid = [];
    this.book = openings();
    var x, y, row;
    for (x = 0; x < SIZE; x++) {
      row = [];
      for (y = 0; y < SIZE; y++) row.push(0);
      this.probGrid[x] = row;
    }
    this.updateProbs();
  }
  AI.prototype.resetProbs = function () {
    var x, y;
    for (x = 0; x < SIZE; x++) for (y = 0; y < SIZE; y++) this.probGrid[x][y] = 0;
  };
  AI.prototype.passesThroughHit = function (cells) {
    var i;
    for (i = 0; i < cells.length; i++) {
      if (this.virtualGrid.at(cells[i].x, cells[i].y) === HIT) return true;
    }
    return false;
  };
  AI.prototype.numHitCovered = function (cells) {
    var n = 0, i;
    for (i = 0; i < cells.length; i++) {
      if (this.virtualGrid.at(cells[i].x, cells[i].y) === HIT) n++;
    }
    return n;
  };
  AI.prototype.updateProbs = function () {
    var roster = this.virtualFleet.roster;
    var k, x, y, d, ship, coords, i;
    this.resetProbs();
    for (k = 0; k < roster.length; k++) {
      ship = roster[k];
      for (x = 0; x < SIZE; x++) {
        for (y = 0; y < SIZE; y++) {
          for (d = 0; d < 2; d++) {
            if (!ship.fits(this.virtualGrid, x, y, d)) continue;
            ship.place(this.virtualGrid, x, y, d, true);
            coords = ship.cells();
            if (this.passesThroughHit(coords)) {
              for (i = 0; i < coords.length; i++) {
                this.probGrid[coords[i].x][coords[i].y] += PROB_WEIGHT * this.numHitCovered(coords);
              }
            } else {
              for (i = 0; i < coords.length; i++) this.probGrid[coords[i].x][coords[i].y]++;
            }
          }
          if (this.virtualGrid.at(x, y) === HIT) this.probGrid[x][y] = 0;
        }
      }
    }
  };
  AI.prototype.shoot = function () {
    var x, y, i, cell, tries = 0, pick, result, humanShip, types, idx, sunkCells;
    for (i = 0; i < this.book.length; i++) {
      cell = this.book[i];
      if (this.virtualGrid.at(cell.x, cell.y) === EMPTY && this.probGrid[cell.x][cell.y] !== 0) {
        this.probGrid[cell.x][cell.y] += cell.weight;
      }
    }
    while (tries++ < 120) {
      var maxP = -1, maxes = [];
      for (x = 0; x < SIZE; x++) for (y = 0; y < SIZE; y++) {
        if (this.virtualGrid.at(x, y) !== EMPTY) continue;
        if (this.probGrid[x][y] > maxP) {
          maxP = this.probGrid[x][y];
          maxes = [{ x: x, y: y }];
        } else if (this.probGrid[x][y] === maxP) {
          maxes.push({ x: x, y: y });
        }
      }
      if (!maxes.length) return null;
      pick = Math.random() < RANDOMNESS
        ? maxes[(Math.random() * maxes.length) | 0]
        : maxes[0];
      result = shoot(this.humanGrid, this.humanFleet, pick.x, pick.y);
      if (result == null) {
        this.probGrid[pick.x][pick.y] = 0;
        continue;
      }
      this.virtualGrid.set(pick.x, pick.y, result === SUNK ? SUNK : result);
      if (result === HIT || result === SUNK) {
        humanShip = this.humanFleet.findByCoords(pick.x, pick.y);
        if (humanShip && humanShip.sunk) {
          types = [];
          for (i = 0; i < this.virtualFleet.roster.length; i++) types.push(this.virtualFleet.roster[i].type);
          idx = types.indexOf(humanShip.type);
          if (idx >= 0) this.virtualFleet.roster.splice(idx, 1);
          sunkCells = humanShip.cells();
          for (i = 0; i < sunkCells.length; i++) this.virtualGrid.set(sunkCells[i].x, sunkCells[i].y, SUNK);
        }
      }
      this.updateProbs();
      return { x: pick.x, y: pick.y, result: result };
    }
    return null;
  };

  function emptyBoard() {
    var s = '', i;
    for (i = 0; i < SIZE * SIZE; i++) s += '0';
    return s;
  }

  function Solo() {
    this.humanGrid = new Grid();
    this.computerGrid = new Grid();
    this.humanFleet = new Fleet(this.humanGrid);
    this.computerFleet = new Fleet(this.computerGrid);
    this.computerFleet.placeRandomly(false);
    this.robot = null;
    this.ready = false;
    this.over = false;
    this.winner = null;
    this.shots = 0;
    this.hits = 0;
  }
  Solo.prototype.start = function () {
    if (!this.humanFleet.allPlaced()) return false;
    this.robot = new AI(this.humanGrid, this.humanFleet);
    this.ready = true;
    return true;
  };
  Solo.prototype.fire = function (x, y) {
    if (!this.ready || this.over) return null;
    var result = shoot(this.computerGrid, this.computerFleet, x, y);
    if (result == null) return null;
    this.shots++;
    if (result === HIT || result === SUNK) this.hits++;
    if (this.computerFleet.allSunk()) {
      this.over = true;
      this.winner = 'human';
      return { result: result, reply: null };
    }
    var reply = this.robot.shoot();
    if (this.humanFleet.allSunk()) {
      this.over = true;
      this.winner = 'computer';
    }
    return { result: result, reply: reply };
  };

  root.BB = {
    SIZE: SIZE,
    EMPTY: EMPTY,
    SHIP: SHIP,
    MISS: MISS,
    HIT: HIT,
    SUNK: SUNK,
    VERTICAL: VERTICAL,
    HORIZONTAL: HORIZONTAL,
    TYPES: TYPES,
    Grid: Grid,
    Fleet: Fleet,
    Ship: Ship,
    AI: AI,
    Solo: Solo,
    shoot: shoot,
    emptyBoard: emptyBoard,
    typeById: typeById
  };
})(window);
