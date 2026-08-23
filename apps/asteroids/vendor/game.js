/*
 * HTML5 Asteroids — Doug McInnes, 2010, MIT.
 * Source: https://github.com/dmcinnes/HTML5-Asteroids  (master @ aedcbb2)
 *
 * GifOS port, still classic scripts:
 *   - no jQuery (original used 1.4.1)
 *   - no typeface.js Vector Battle (HUD is canvas text)
 *   - no WAV fetch (sandbox has no files); shots/explosions are Web Audio
 * Gameplay, sprites, grid, wrap, saucer and scoring follow the original.
 * Multiplayer hooks live on Game.hooks; the original had none.
 */
(function (root) {
  'use strict';

  var KEY_CODES = {
    32: 'space', 37: 'left', 38: 'up', 39: 'right', 40: 'down',
    65: 'left', 87: 'up', 68: 'right', 83: 'down',
    70: 'f', 71: 'g', 77: 'm', 80: 'p', 9: 'tab'
  };

  var KEY_STATUS = { keyDown: false };
  (function () {
    for (var code in KEY_CODES) KEY_STATUS[KEY_CODES[code]] = false;
  })();

  function onKey(e, down) {
    var name = KEY_CODES[e.keyCode];
    if (!name && e.key) {
      var k = e.key;
      if (k === ' ' || k === 'Spacebar') name = 'space';
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') name = 'left';
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') name = 'right';
      else if (k === 'ArrowUp' || k === 'w' || k === 'W') name = 'up';
      else if (k === 'ArrowDown' || k === 's' || k === 'S') name = 'down';
      else if (k === 'p' || k === 'P') name = 'p';
      else if (k === 'm' || k === 'M') name = 'm';
      else if (k === 'f' || k === 'F') name = 'f';
      else if (k === 'g' || k === 'G') name = 'g';
      else if (k === 'Tab') name = 'tab';
    }
    if (!name) return;
    e.preventDefault();
    KEY_STATUS.keyDown = down;
    KEY_STATUS[name] = down;
  }
  window.addEventListener('keydown', function (e) { onKey(e, true); });
  window.addEventListener('keyup', function (e) { onKey(e, false); });

  var GRID_SIZE = 60;

  function Matrix(rows, columns) {
    var i, j;
    this.data = new Array(rows);
    for (i = 0; i < rows; i++) this.data[i] = new Array(columns);

    this.configure = function (rot, scale, transx, transy) {
      var rad = (rot * Math.PI) / 180;
      var sin = Math.sin(rad) * scale;
      var cos = Math.cos(rad) * scale;
      this.set(cos, -sin, transx, sin, cos, transy);
    };

    this.set = function () {
      var k = 0;
      for (i = 0; i < rows; i++) {
        for (j = 0; j < columns; j++) {
          this.data[i][j] = arguments[k];
          k++;
        }
      }
    };

    this.multiply = function () {
      var vector = new Array(rows);
      for (i = 0; i < rows; i++) {
        vector[i] = 0;
        for (j = 0; j < columns; j++) vector[i] += this.data[i][j] * arguments[j];
      }
      return vector;
    };
  }

  function Sprite() {
    this.init = function (name, points) {
      this.name = name;
      this.points = points;
      this.vel = { x: 0, y: 0, rot: 0 };
      this.acc = { x: 0, y: 0, rot: 0 };
    };

    this.children = {};
    this.visible = false;
    this.reap = false;
    this.bridgesH = true;
    this.bridgesV = true;
    this.collidesWith = [];
    this.x = 0;
    this.y = 0;
    this.rot = 0;
    this.scale = 1;
    this.currentNode = null;
    this.nextSprite = null;
    this.preMove = null;
    this.postMove = null;
    this.strokeStyle = null;
    this.ownerId = null;
    this.rid = 0;

    this.run = function (delta) {
      this.move(delta);
      this.updateGrid();

      this.context.save();
      this.configureTransform();
      this.draw();

      var candidates = this.findCollisionCandidates();

      this.matrix.configure(this.rot, this.scale, this.x, this.y);
      this.checkCollisionsAgainst(candidates);

      this.context.restore();

      if (this.bridgesH && this.currentNode && this.currentNode.dupe.horizontal) {
        this.x += this.currentNode.dupe.horizontal;
        this.context.save();
        this.configureTransform();
        this.draw();
        this.checkCollisionsAgainst(candidates);
        this.context.restore();
        if (this.currentNode) this.x -= this.currentNode.dupe.horizontal;
      }
      if (this.bridgesV && this.currentNode && this.currentNode.dupe.vertical) {
        this.y += this.currentNode.dupe.vertical;
        this.context.save();
        this.configureTransform();
        this.draw();
        this.checkCollisionsAgainst(candidates);
        this.context.restore();
        if (this.currentNode) this.y -= this.currentNode.dupe.vertical;
      }
      if (this.bridgesH && this.bridgesV && this.currentNode &&
          this.currentNode.dupe.vertical && this.currentNode.dupe.horizontal) {
        this.x += this.currentNode.dupe.horizontal;
        this.y += this.currentNode.dupe.vertical;
        this.context.save();
        this.configureTransform();
        this.draw();
        this.checkCollisionsAgainst(candidates);
        this.context.restore();
        if (this.currentNode) {
          this.x -= this.currentNode.dupe.horizontal;
          this.y -= this.currentNode.dupe.vertical;
        }
      }
    };

    this.move = function (delta) {
      if (!this.visible) return;
      this.transPoints = null;
      if (typeof this.preMove === 'function') this.preMove(delta);
      this.vel.x += this.acc.x * delta;
      this.vel.y += this.acc.y * delta;
      this.x += this.vel.x * delta;
      this.y += this.vel.y * delta;
      this.rot += this.vel.rot * delta;
      if (this.rot > 360) this.rot -= 360;
      else if (this.rot < 0) this.rot += 360;
      if (typeof this.postMove === 'function') this.postMove(delta);
    };

    this.updateGrid = function () {
      if (!this.visible) return;
      var gridx = Math.floor(this.x / GRID_SIZE);
      var gridy = Math.floor(this.y / GRID_SIZE);
      if (!this.grid || !this.grid.length) return;
      gridx = (gridx >= this.grid.length) ? 0 : gridx;
      gridy = (gridy >= this.grid[0].length) ? 0 : gridy;
      gridx = (gridx < 0) ? this.grid.length - 1 : gridx;
      gridy = (gridy < 0) ? this.grid[0].length - 1 : gridy;
      var newNode = this.grid[gridx][gridy];
      if (newNode !== this.currentNode) {
        if (this.currentNode) this.currentNode.leave(this);
        newNode.enter(this);
        this.currentNode = newNode;
      }
      if (KEY_STATUS.g && this.currentNode) {
        this.context.lineWidth = 3.0;
        this.context.strokeStyle = '#0f0';
        this.context.strokeRect(gridx * GRID_SIZE + 2, gridy * GRID_SIZE + 2, GRID_SIZE - 4, GRID_SIZE - 4);
        this.context.strokeStyle = Game.ink;
        this.context.lineWidth = 1.0;
      }
    };

    this.configureTransform = function () {
      if (!this.visible) return;
      var rad = (this.rot * Math.PI) / 180;
      this.context.translate(this.x, this.y);
      this.context.rotate(rad);
      this.context.scale(this.scale, this.scale);
    };

    this.draw = function () {
      if (!this.visible) return;
      this.context.lineWidth = 1.0 / this.scale;
      if (this.strokeStyle) this.context.strokeStyle = this.strokeStyle;
      for (var child in this.children) {
        if (this.children[child].visible !== false) this.children[child].draw();
      }
      if (!this.points || this.points.length < 2) return;
      this.context.beginPath();
      this.context.moveTo(this.points[0], this.points[1]);
      for (var i = 1; i < this.points.length / 2; i++) {
        var xi = i * 2;
        this.context.lineTo(this.points[xi], this.points[xi + 1]);
      }
      this.context.closePath();
      this.context.stroke();
    };

    this.findCollisionCandidates = function () {
      if (!this.visible || !this.currentNode) return [];
      var cn = this.currentNode;
      var candidates = [];
      if (cn.nextSprite) candidates.push(cn.nextSprite);
      if (cn.north.nextSprite) candidates.push(cn.north.nextSprite);
      if (cn.south.nextSprite) candidates.push(cn.south.nextSprite);
      if (cn.east.nextSprite) candidates.push(cn.east.nextSprite);
      if (cn.west.nextSprite) candidates.push(cn.west.nextSprite);
      if (cn.north.east.nextSprite) candidates.push(cn.north.east.nextSprite);
      if (cn.north.west.nextSprite) candidates.push(cn.north.west.nextSprite);
      if (cn.south.east.nextSprite) candidates.push(cn.south.east.nextSprite);
      if (cn.south.west.nextSprite) candidates.push(cn.south.west.nextSprite);
      return candidates;
    };

    this.checkCollisionsAgainst = function (candidates) {
      for (var i = 0; i < candidates.length; i++) {
        var ref = candidates[i];
        do {
          this.checkCollision(ref);
          ref = ref.nextSprite;
        } while (ref);
      }
    };

    this.checkCollision = function (other) {
      if (!other.visible || this === other || this.collidesWith.indexOf(other.name) === -1) return;
      var trans = other.transformedPoints();
      var count = trans.length / 2;
      for (var i = 0; i < count; i++) {
        var px = trans[i * 2];
        var py = trans[i * 2 + 1];
        if (this.pointInPolygon(px, py)) {
          other.collision(this);
          this.collision(other);
          return;
        }
      }
    };

    this.pointInPolygon = function (x, y) {
      var points = this.transformedPoints();
      var j = 2;
      var oddNodes = false;
      for (var i = 0; i < points.length; i += 2) {
        var y0 = points[i + 1];
        var y1 = points[j + 1];
        if ((y0 < y && y1 >= y) || (y1 < y && y0 >= y)) {
          if (points[i] + (y - y0) / (y1 - y0) * (points[j] - points[i]) < x) oddNodes = !oddNodes;
        }
        j += 2;
        if (j === points.length) j = 0;
      }
      return oddNodes;
    };

    this.collision = function () {};

    this.die = function () {
      this.visible = false;
      this.reap = true;
      if (this.currentNode) {
        this.currentNode.leave(this);
        this.currentNode = null;
      }
    };

    this.transformedPoints = function () {
      if (this.transPoints) return this.transPoints;
      var trans = new Array(this.points.length);
      this.matrix.configure(this.rot, this.scale, this.x, this.y);
      for (var i = 0; i < this.points.length / 2; i++) {
        var xi = i * 2;
        var pts = this.matrix.multiply(this.points[xi], this.points[xi + 1], 1);
        trans[xi] = pts[0];
        trans[xi + 1] = pts[1];
      }
      this.transPoints = trans;
      return trans;
    };

    this.isClear = function () {
      if (this.collidesWith.length === 0) return true;
      var cn = this.currentNode;
      if (cn == null) {
        if (!this.grid || !this.grid.length) return true;
        var gridx = Math.floor(this.x / GRID_SIZE);
        var gridy = Math.floor(this.y / GRID_SIZE);
        gridx = (gridx >= this.grid.length) ? 0 : gridx;
        gridy = (gridy >= this.grid[0].length) ? 0 : gridy;
        if (gridx < 0) gridx = this.grid.length - 1;
        if (gridy < 0) gridy = this.grid[0].length - 1;
        cn = this.grid[gridx][gridy];
      }
      return (cn.isEmpty(this.collidesWith) &&
              cn.north.isEmpty(this.collidesWith) &&
              cn.south.isEmpty(this.collidesWith) &&
              cn.east.isEmpty(this.collidesWith) &&
              cn.west.isEmpty(this.collidesWith) &&
              cn.north.east.isEmpty(this.collidesWith) &&
              cn.north.west.isEmpty(this.collidesWith) &&
              cn.south.east.isEmpty(this.collidesWith) &&
              cn.south.west.isEmpty(this.collidesWith));
    };

    this.wrapPostMove = function () {
      if (this.x > Game.canvasWidth) this.x = 0;
      else if (this.x < 0) this.x = Game.canvasWidth;
      if (this.y > Game.canvasHeight) this.y = 0;
      else if (this.y < 0) this.y = Game.canvasHeight;
    };
  }

  function Ship() {
    this.init('ship', [-5, 4, 0, -12, 5, 4]);
    this.children.exhaust = new Sprite();
    this.children.exhaust.init('exhaust', [-3, 6, 0, 11, 3, 6]);
    this.bulletCounter = 0;
    this.postMove = this.wrapPostMove;
    this.collidesWith = ['asteroid', 'bigalien', 'alienbullet', 'enemybullet'];
    this.preMove = function (delta) {
      if (this.remote) return;
      if (KEY_STATUS.left) this.vel.rot = -6;
      else if (KEY_STATUS.right) this.vel.rot = 6;
      else this.vel.rot = 0;

      if (KEY_STATUS.up) {
        var rad = ((this.rot - 90) * Math.PI) / 180;
        this.acc.x = 0.5 * Math.cos(rad);
        this.acc.y = 0.5 * Math.sin(rad);
        this.children.exhaust.visible = Math.random() > 0.1;
      } else {
        this.acc.x = 0;
        this.acc.y = 0;
        this.children.exhaust.visible = false;
      }

      if (this.bulletCounter > 0) this.bulletCounter -= delta;
      if (KEY_STATUS.space) {
        if (this.bulletCounter <= 0) {
          this.bulletCounter = 10;
          for (var i = 0; i < this.bullets.length; i++) {
            if (!this.bullets[i].visible) {
              SFX.laser();
              var bullet = this.bullets[i];
              var r2 = ((this.rot - 90) * Math.PI) / 180;
              var vx = Math.cos(r2);
              var vy = Math.sin(r2);
              bullet.x = this.x + vx * 4;
              bullet.y = this.y + vy * 4;
              bullet.vel.x = 6 * vx + this.vel.x;
              bullet.vel.y = 6 * vy + this.vel.y;
              bullet.visible = true;
              bullet.ownerId = Game.localId || 'me';
              if (Game.hooks && Game.hooks.onFire) Game.hooks.onFire();
              break;
            }
          }
        }
      }

      var spd = Math.sqrt(this.vel.x * this.vel.x + this.vel.y * this.vel.y);
      if (spd > 8) {
        this.vel.x *= 0.95;
        this.vel.y *= 0.95;
      }
    };
    this.collision = function (other) {
      if (this.remote) return;
      if (other.name === 'enemybullet' && !Game.friendlyFire) return;
      SFX.explosion();
      Game.explosionAt(other.x, other.y);
      this.visible = false;
      if (this.currentNode) {
        this.currentNode.leave(this);
        this.currentNode = null;
      }
      Game.lives--;
      if (Game.hooks && Game.hooks.onDied) Game.hooks.onDied(other);
      Game.FSM.state = 'player_died';
    };
  }
  Ship.prototype = new Sprite();

  function BigAlien() {
    this.init('bigalien', [-20, 0, -12, -4, 12, -4, 20, 0, 12, 4, -12, 4, -20, 0, 20, 0]);
    this.children.top = new Sprite();
    this.children.top.init('bigalien_top', [-8, -4, -6, -6, 6, -6, 8, -4]);
    this.children.top.visible = true;
    this.children.bottom = new Sprite();
    this.children.bottom.init('bigalien_top', [8, 4, 6, 6, -6, 6, -8, 4]);
    this.children.bottom.visible = true;
    this.collidesWith = ['asteroid', 'ship', 'bullet'];
    this.bridgesH = false;
    this.bullets = [];
    this.bulletCounter = 0;

    this.newPosition = function () {
      if (Math.random() < 0.5) {
        this.x = -20;
        this.vel.x = 1.5;
      } else {
        this.x = Game.canvasWidth + 20;
        this.vel.x = -1.5;
      }
      this.y = Math.random() * Game.canvasHeight;
    };

    this.setup = function () {
      this.newPosition();
      for (var i = 0; i < 3; i++) {
        var bull = new AlienBullet();
        this.bullets.push(bull);
        Game.sprites.push(bull);
      }
    };

    this.preMove = function (delta) {
      if (Game.roomy && !Game.isHost) return;
      var cn = this.currentNode;
      if (cn == null) return;
      var topCount = 0;
      if (cn.north.nextSprite) topCount++;
      if (cn.north.east.nextSprite) topCount++;
      if (cn.north.west.nextSprite) topCount++;
      var bottomCount = 0;
      if (cn.south.nextSprite) bottomCount++;
      if (cn.south.east.nextSprite) bottomCount++;
      if (cn.south.west.nextSprite) bottomCount++;
      if (topCount > bottomCount) this.vel.y = 1;
      else if (topCount < bottomCount) this.vel.y = -1;
      else if (Math.random() < 0.01) this.vel.y = -this.vel.y;

      this.bulletCounter -= delta;
      if (this.bulletCounter <= 0) {
        this.bulletCounter = 22;
        for (var i = 0; i < this.bullets.length; i++) {
          if (!this.bullets[i].visible) {
            var bullet = this.bullets[i];
            var rad = 2 * Math.PI * Math.random();
            var vx = Math.cos(rad);
            var vy = Math.sin(rad);
            bullet.x = this.x;
            bullet.y = this.y;
            bullet.vel.x = 6 * vx;
            bullet.vel.y = 6 * vy;
            bullet.visible = true;
            SFX.laser();
            break;
          }
        }
      }
    };

    this.collision = function (other) {
      if (Game.roomy && !Game.isHost && other.name === 'bullet') {
        if (Game.hooks && Game.hooks.claimAlien) Game.hooks.claimAlien();
        return;
      }
      if (other.name === 'bullet') Game.score += 200;
      SFX.explosion();
      Game.explosionAt(other.x, other.y);
      this.visible = false;
      this.newPosition();
    };

    this.postMove = function () {
      if (this.y > Game.canvasHeight) this.y = 0;
      else if (this.y < 0) this.y = Game.canvasHeight;
      if ((this.vel.x > 0 && this.x > Game.canvasWidth + 20) ||
          (this.vel.x < 0 && this.x < -20)) {
        this.visible = false;
        this.newPosition();
      }
    };
  }
  BigAlien.prototype = new Sprite();

  function Bullet() {
    this.init('bullet', [0, 0]);
    this.time = 0;
    this.bridgesH = false;
    this.bridgesV = false;
    this.postMove = this.wrapPostMove;
    this.configureTransform = function () {};
    this.draw = function () {
      if (!this.visible) return;
      this.context.save();
      this.context.lineWidth = 2;
      if (this.strokeStyle) this.context.strokeStyle = this.strokeStyle;
      this.context.beginPath();
      this.context.moveTo(this.x - 1, this.y - 1);
      this.context.lineTo(this.x + 1, this.y + 1);
      this.context.moveTo(this.x + 1, this.y - 1);
      this.context.lineTo(this.x - 1, this.y + 1);
      this.context.stroke();
      this.context.restore();
    };
    this.preMove = function (delta) {
      if (this.visible) this.time += delta;
      if (this.time > 50) {
        this.visible = false;
        this.time = 0;
      }
    };
    this.collision = function () {
      this.time = 0;
      this.visible = false;
      if (this.currentNode) {
        this.currentNode.leave(this);
        this.currentNode = null;
      }
    };
    this.transformedPoints = function () {
      return [this.x, this.y];
    };
  }
  Bullet.prototype = new Sprite();

  function AlienBullet() {
    this.init('alienbullet');
    this.draw = function () {
      if (!this.visible) return;
      this.context.save();
      this.context.lineWidth = 2;
      this.context.beginPath();
      this.context.moveTo(this.x, this.y);
      this.context.lineTo(this.x - this.vel.x, this.y - this.vel.y);
      this.context.stroke();
      this.context.restore();
    };
  }
  AlienBullet.prototype = new Bullet();

  function EnemyBullet() {
    this.init('enemybullet', [0, 0]);
    this.time = 0;
    this.bridgesH = false;
    this.bridgesV = false;
    this.remote = true;
    this.postMove = this.wrapPostMove;
    this.configureTransform = Bullet.prototype.configureTransform;
    this.draw = Bullet.prototype.draw;
    this.preMove = Bullet.prototype.preMove;
    this.collision = Bullet.prototype.collision;
    this.transformedPoints = Bullet.prototype.transformedPoints;
  }
  EnemyBullet.prototype = new Sprite();

  var ROCK_POINTS = [-10, 0, -5, 7, -3, 4, 1, 10, 5, 4, 10, 0, 5, -6, 2, -10, -4, -10, -4, -5];

  function Asteroid() {
    this.init('asteroid', ROCK_POINTS.slice());
    this.visible = true;
    this.scale = 6;
    this.postMove = this.wrapPostMove;
    this.collidesWith = ['ship', 'bullet', 'bigalien', 'alienbullet', 'enemybullet'];
    this.collision = function (other) {
      var guest = Game.roomy && !Game.isHost;
      if (guest) {
        if (other.name === 'bullet' && other.ownerId === (Game.localId || 'me')) {
          Game.score += 120 / this.scale;
          if (Game.hooks && Game.hooks.claimRock) Game.hooks.claimRock(this.rid);
        }
        SFX.explosion();
        Game.explosionAt(other.x, other.y);
        other.collision(this);
        this.visible = false;
        if (this.currentNode) {
          this.currentNode.leave(this);
          this.currentNode = null;
        }
        return;
      }
      SFX.explosion();
      if (other.name === 'bullet' || other.name === 'enemybullet') {
        var pts = 120 / this.scale;
        var mine = !other.ownerId || other.ownerId === (Game.localId || 'me');
        if (mine) Game.score += pts;
        if (Game.hooks && Game.hooks.onRockScore) Game.hooks.onRockScore(other.ownerId, pts, this.rid);
      }
      this.scale /= 3;
      if (this.scale > 0.5) {
        for (var i = 0; i < 3; i++) {
          var roid = Game.makeRock();
          roid.x = this.x;
          roid.y = this.y;
          roid.scale = this.scale;
          roid.rot = this.rot;
          roid.points = this.points.slice();
          roid.vel.x = Math.random() * 6 - 3;
          roid.vel.y = Math.random() * 6 - 3;
          if (Math.random() > 0.5) roid.points.reverse();
          roid.vel.rot = Math.random() * 2 - 1;
          roid.visible = true;
          roid.move(roid.scale * 3);
          Game.sprites.push(roid);
        }
      }
      Game.explosionAt(other.x, other.y);
      this.die();
    };
  }
  Asteroid.prototype = new Sprite();

  function Explosion() {
    this.init('explosion');
    this.bridgesH = false;
    this.bridgesV = false;
    this.lines = [];
    for (var i = 0; i < 5; i++) {
      var rad = 2 * Math.PI * Math.random();
      var x = Math.cos(rad);
      var y = Math.sin(rad);
      this.lines.push([x, y, x * 2, y * 2]);
    }
    this.draw = function () {
      if (!this.visible) return;
      this.context.save();
      this.context.lineWidth = 1.0 / this.scale;
      this.context.beginPath();
      for (var i = 0; i < 5; i++) {
        var line = this.lines[i];
        this.context.moveTo(line[0], line[1]);
        this.context.lineTo(line[2], line[3]);
      }
      this.context.stroke();
      this.context.restore();
    };
    this.preMove = function (delta) {
      if (this.visible) this.scale += delta;
      if (this.scale > 8) this.die();
    };
  }
  Explosion.prototype = new Sprite();

  function GridNode() {
    this.north = null;
    this.south = null;
    this.east = null;
    this.west = null;
    this.nextSprite = null;
    this.dupe = { horizontal: null, vertical: null };

    this.enter = function (sprite) {
      sprite.nextSprite = this.nextSprite;
      this.nextSprite = sprite;
    };

    this.leave = function (sprite) {
      var ref = this;
      while (ref && (ref.nextSprite !== sprite)) ref = ref.nextSprite;
      if (ref) {
        ref.nextSprite = sprite.nextSprite;
        sprite.nextSprite = null;
      }
    };

    this.isEmpty = function (collidables) {
      var empty = true;
      var ref = this;
      while (ref.nextSprite) {
        ref = ref.nextSprite;
        empty = !ref.visible || collidables.indexOf(ref.name) === -1;
        if (!empty) break;
      }
      return empty;
    };
  }

  var Text = {
    context: null,
    renderText: function (text, size, x, y, align) {
      var ctx = this.context;
      ctx.save();
      ctx.font = 'bold ' + Math.max(10, size | 0) + 'px "Courier New", Courier, monospace';
      ctx.textAlign = align || 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = Game.ink;
      ctx.fillText(text, x, y);
      ctx.restore();
    }
  };

  var actx = null;
  function audioCtx() {
    if (!actx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }

  var SFX = {
    muted: true,
    laser: function () {
      if (this.muted) return;
      var ctx = audioCtx();
      if (!ctx) return;
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.08);
      g.gain.setValueAtTime(0.06, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.1);
    },
    explosion: function () {
      if (this.muted) return;
      var ctx = audioCtx();
      if (!ctx) return;
      var n = 0.28;
      var frames = Math.floor(ctx.sampleRate * n);
      var buf = ctx.createBuffer(1, frames, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < frames; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / frames);
      var src = ctx.createBufferSource();
      var g = ctx.createGain();
      var f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(900, ctx.currentTime);
      f.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + n);
      src.buffer = buf;
      g.gain.setValueAtTime(0.22, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n);
      src.connect(f); f.connect(g); g.connect(ctx.destination);
      src.start();
    },
    unlock: function () { audioCtx(); }
  };

  var Game = {
    score: 0,
    totalAsteroids: 5,
    lives: 0,
    canvasWidth: 800,
    canvasHeight: 600,
    sprites: [],
    ship: null,
    bigAlien: null,
    nextBigAlienTime: null,
    nextRockId: 1,
    ink: '#e8f0ff',
    bg: '#05060a',
    roomy: false,
    isHost: true,
    friendlyFire: false,
    localId: 'me',
    hooks: {},
    extraDude: null,
    canvasNode: null,
    context: null,
    grid: null,
    paused: false,
    showFramerate: false,
    showScores: false,
    hudNote: '',
    highScore: 0,

    makeRock: function () {
      var roid = new Asteroid();
      roid.rid = this.nextRockId++;
      return roid;
    },

    spawnAsteroids: function (count) {
      if (!count) count = this.totalAsteroids;
      for (var i = 0; i < count; i++) {
        var roid = this.makeRock();
        roid.x = Math.random() * this.canvasWidth;
        roid.y = Math.random() * this.canvasHeight;
        while (!roid.isClear()) {
          roid.x = Math.random() * this.canvasWidth;
          roid.y = Math.random() * this.canvasHeight;
        }
        roid.vel.x = Math.random() * 4 - 2;
        roid.vel.y = Math.random() * 4 - 2;
        if (Math.random() > 0.5) roid.points.reverse();
        roid.vel.rot = Math.random() * 2 - 1;
        this.sprites.push(roid);
      }
    },

    explosionAt: function (x, y) {
      var splosion = new Explosion();
      splosion.x = x;
      splosion.y = y;
      splosion.visible = true;
      this.sprites.push(splosion);
    },

    asteroidCount: function () {
      var n = 0;
      for (var i = 0; i < this.sprites.length; i++) {
        if (this.sprites[i].name === 'asteroid' && this.sprites[i].visible) n++;
      }
      return n;
    },

    exportRocks: function () {
      var out = [];
      for (var i = 0; i < this.sprites.length; i++) {
        var s = this.sprites[i];
        if (s.name !== 'asteroid' || !s.visible) continue;
        out.push([s.rid, r1(s.x), r1(s.y), r1(s.rot), r2(s.scale), r2(s.vel.x), r2(s.vel.y), r2(s.vel.rot), s.points[0] > 0 ? 1 : 0]);
      }
      return out;
    },

    importRocks: function (rows) {
      var byId = {};
      var i, s;
      for (i = 0; i < this.sprites.length; i++) {
        s = this.sprites[i];
        if (s.name === 'asteroid') byId[s.rid] = s;
      }
      var seen = {};
      for (i = 0; i < rows.length; i++) {
        var r = rows[i];
        var id = r[0];
        seen[id] = 1;
        s = byId[id];
        if (!s) {
          s = new Asteroid();
          s.rid = id;
          if (id >= this.nextRockId) this.nextRockId = id + 1;
          this.sprites.push(s);
        }
        s.x = r[1]; s.y = r[2]; s.rot = r[3]; s.scale = r[4];
        s.vel.x = r[5]; s.vel.y = r[6]; s.vel.rot = r[7];
        s.visible = true;
        s.reap = false;
        if (r[8]) s.points = ROCK_POINTS.slice().reverse();
        else s.points = ROCK_POINTS.slice();
      }
      for (i = 0; i < this.sprites.length; i++) {
        s = this.sprites[i];
        if (s.name === 'asteroid' && s.visible && !seen[s.rid]) s.die();
      }
    },

    exportAlien: function () {
      var a = this.bigAlien;
      if (!a || !a.visible) return null;
      var b = [];
      for (var i = 0; i < a.bullets.length; i++) {
        var u = a.bullets[i];
        if (u.visible) b.push([r1(u.x), r1(u.y), r2(u.vel.x), r2(u.vel.y)]);
      }
      return [r1(a.x), r1(a.y), r2(a.vel.x), r2(a.vel.y), b];
    },

    importAlien: function (row) {
      var a = this.bigAlien;
      if (!a) return;
      if (!row) {
        a.visible = false;
        for (var i = 0; i < a.bullets.length; i++) a.bullets[i].visible = false;
        return;
      }
      a.visible = true;
      a.x = row[0]; a.y = row[1];
      a.vel.x = row[2]; a.vel.y = row[3];
      var shots = row[4] || [];
      for (var j = 0; j < a.bullets.length; j++) {
        var u = a.bullets[j];
        if (j < shots.length) {
          u.x = shots[j][0]; u.y = shots[j][1];
          u.vel.x = shots[j][2]; u.vel.y = shots[j][3];
          u.visible = true; u.time = 0;
        } else {
          u.visible = false;
        }
      }
    },

    localShots: function () {
      var out = [];
      if (!this.ship || !this.ship.bullets) return out;
      for (var i = 0; i < this.ship.bullets.length; i++) {
        var b = this.ship.bullets[i];
        if (b.visible) out.push([r1(b.x), r1(b.y), r2(b.vel.x), r2(b.vel.y)]);
      }
      return out;
    },

    ghosts: [],
    ghostPool: [],

    syncGhosts: function () {
      var g = this.ghosts || [];
      while (this.ghostPool.length < g.length) {
        var sh = new Ship();
        sh.remote = true;
        sh.name = 'ghost';
        sh.visible = false;
        sh.collidesWith = [];
        sh.preMove = function () {};
        sh.collision = function () {};
        sh.bullets = [];
        this.sprites.push(sh);
        this.ghostPool.push(sh);
      }
      for (var i = 0; i < this.ghostPool.length; i++) {
        var ship = this.ghostPool[i];
        var src = g[i];
        if (!src || !src.alive) {
          ship.visible = false;
          continue;
        }
        ship.visible = true;
        ship.x = src.x; ship.y = src.y; ship.rot = src.rot;
        ship.strokeStyle = src.color || '#8cf';
        ship.children.exhaust.visible = !!src.thrust;
        ship.ownerId = src.id;
      }
    },

    FSM: {
      boot: function () {
        Game.spawnAsteroids(5);
        this.state = 'waiting';
      },
      waiting: function () {
        var msg = Game.touchy ? 'TOUCH TO START' : 'PRESS SPACE TO START';
        Text.renderText(msg, 28, Game.canvasWidth / 2, Game.canvasHeight / 2, 'center');
        if (Game.hudNote) {
          Text.renderText(Game.hudNote, 16, Game.canvasWidth / 2, Game.canvasHeight / 2 + 36, 'center');
        }
        if (KEY_STATUS.space || root.gameStart) {
          KEY_STATUS.space = false;
          root.gameStart = false;
          this.state = 'start';
        }
      },
      start: function () {
        for (var i = 0; i < Game.sprites.length; i++) {
          if (Game.sprites[i].name === 'asteroid') Game.sprites[i].die();
          else if (Game.sprites[i].name === 'bullet' || Game.sprites[i].name === 'bigalien') {
            Game.sprites[i].visible = false;
          }
        }
        Game.score = 0;
        Game.lives = 2;
        Game.totalAsteroids = 2;
        if (!Game.roomy || Game.isHost) Game.spawnAsteroids();
        Game.nextBigAlienTime = Date.now() + 30000 + (30000 * Math.random());
        this.state = 'spawn_ship';
        if (Game.hooks && Game.hooks.onStart) Game.hooks.onStart();
      },
      spawn_ship: function () {
        Game.ship.x = Game.canvasWidth / 2;
        Game.ship.y = Game.canvasHeight / 2;
        if (Game.ship.isClear()) {
          Game.ship.rot = 0;
          Game.ship.vel.x = 0;
          Game.ship.vel.y = 0;
          Game.ship.visible = true;
          this.state = 'run';
        }
      },
      run: function () {
        if (!Game.roomy || Game.isHost) {
          if (Game.asteroidCount() === 0) this.state = 'new_level';
          if (Game.bigAlien && !Game.bigAlien.visible && Date.now() > Game.nextBigAlienTime) {
            Game.bigAlien.visible = true;
            Game.nextBigAlienTime = Date.now() + (30000 * Math.random());
          }
        }
      },
      new_level: function () {
        if (Game.roomy && !Game.isHost) {
          this.state = 'run';
          return;
        }
        if (this.timer == null) this.timer = Date.now();
        if (Date.now() - this.timer > 1000) {
          this.timer = null;
          Game.totalAsteroids++;
          if (Game.totalAsteroids > 12) Game.totalAsteroids = 12;
          Game.spawnAsteroids();
          this.state = 'run';
        }
      },
      player_died: function () {
        if (Game.lives < 0) this.state = 'end_game';
        else {
          if (this.timer == null) this.timer = Date.now();
          if (Date.now() - this.timer > 1000) {
            this.timer = null;
            this.state = 'spawn_ship';
          }
        }
      },
      end_game: function () {
        Text.renderText('GAME OVER', 48, Game.canvasWidth / 2, Game.canvasHeight / 2, 'center');
        if (Game.score > Game.highScore) Game.highScore = Game.score;
        if (this.timer == null) this.timer = Date.now();
        if (Date.now() - this.timer > 5000) {
          this.timer = null;
          this.state = 'waiting';
        }
        root.gameStart = false;
      },
      execute: function () { this[this.state](); },
      state: 'boot'
    }
  };

  function r1(n) { return Math.round(n * 10) / 10; }
  function r2(n) { return Math.round(n * 100) / 100; }

  function buildGrid(w, h) {
    var gridWidth = Math.max(1, Math.round(w / GRID_SIZE));
    var gridHeight = Math.max(1, Math.round(h / GRID_SIZE));
    var grid = new Array(gridWidth);
    var i, j;
    for (i = 0; i < gridWidth; i++) {
      grid[i] = new Array(gridHeight);
      for (j = 0; j < gridHeight; j++) grid[i][j] = new GridNode();
    }
    for (i = 0; i < gridWidth; i++) {
      for (j = 0; j < gridHeight; j++) {
        var node = grid[i][j];
        node.north = grid[i][(j === 0) ? gridHeight - 1 : j - 1];
        node.south = grid[i][(j === gridHeight - 1) ? 0 : j + 1];
        node.west = grid[(i === 0) ? gridWidth - 1 : i - 1][j];
        node.east = grid[(i === gridWidth - 1) ? 0 : i + 1][j];
      }
    }
    for (i = 0; i < gridWidth; i++) {
      grid[i][0].dupe.vertical = h;
      grid[i][gridHeight - 1].dupe.vertical = -h;
    }
    for (j = 0; j < gridHeight; j++) {
      grid[0][j].dupe.horizontal = w;
      grid[gridWidth - 1][j].dupe.horizontal = -w;
    }
    return grid;
  }

  Game.rebuildGrid = function () {
    var sprites = this.sprites;
    for (var i = 0; i < sprites.length; i++) {
      if (sprites[i].currentNode) {
        sprites[i].currentNode.leave(sprites[i]);
        sprites[i].currentNode = null;
      }
    }
    var grid = buildGrid(this.canvasWidth, this.canvasHeight);
    this.grid = grid;
    Sprite.prototype.grid = grid;
    for (i = 0; i < sprites.length; i++) {
      if (sprites[i].visible) sprites[i].updateGrid();
    }
  };

  Game.mount = function (canvas) {
    this.canvasNode = canvas;
    this.fit();
    var context = canvas.getContext('2d');
    this.context = context;
    Text.context = context;
    var grid = buildGrid(this.canvasWidth, this.canvasHeight);
    this.grid = grid;
    Sprite.prototype.context = context;
    Sprite.prototype.grid = grid;
    Sprite.prototype.matrix = new Matrix(2, 3);

    var sprites = [];
    this.sprites = sprites;

    var ship = new Ship();
    ship.x = this.canvasWidth / 2;
    ship.y = this.canvasHeight / 2;
    sprites.push(ship);
    ship.bullets = [];
    for (var i = 0; i < 10; i++) {
      var bull = new Bullet();
      ship.bullets.push(bull);
      sprites.push(bull);
    }
    this.ship = ship;

    var bigAlien = new BigAlien();
    bigAlien.setup();
    sprites.push(bigAlien);
    this.bigAlien = bigAlien;

    var extraDude = new Ship();
    extraDude.scale = 0.6;
    extraDude.visible = true;
    extraDude.preMove = null;
    extraDude.children = {};
    extraDude.collidesWith = [];
    this.extraDude = extraDude;

    var self = this;
    var lastFrame = Date.now();
    var frameCount = 0, elapsedCounter = 0, avgFramerate = 0;

    var mainLoop = function () {
      var ctx = self.context;
      var dpr = self.dpr || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = self.bg;
      ctx.fillRect(0, 0, self.canvasWidth, self.canvasHeight);
      ctx.strokeStyle = self.ink;
      ctx.fillStyle = self.ink;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      self.FSM.execute();

      var thisFrame = Date.now();
      var elapsed = thisFrame - lastFrame;
      lastFrame = thisFrame;
      var delta = elapsed / 30;

      self.syncGhosts();

      for (var i = 0; i < sprites.length; i++) {
        if (self.paused) {
          ctx.save();
          sprites[i].configureTransform();
          sprites[i].draw();
          ctx.restore();
        } else {
          sprites[i].run(delta);
          if (sprites[i].reap) {
            sprites[i].reap = false;
            sprites.splice(i, 1);
            i--;
          }
        }
      }
      if (self.paused) {
        Text.renderText('PAUSED', 56, self.canvasWidth / 2, 120, 'center');
      }

      var score_text = '' + Math.floor(self.score);
      Text.renderText(score_text, 22, self.canvasWidth - 16, 28, 'right');
      if (self.highScore) {
        Text.renderText('HI ' + Math.floor(self.highScore), 12, self.canvasWidth - 16, 46, 'right');
      }

      for (i = 0; i < self.lives; i++) {
        ctx.save();
        extraDude.x = self.canvasWidth - (14 * (i + 1));
        extraDude.y = 62;
        extraDude.configureTransform();
        extraDude.draw();
        ctx.restore();
      }

      if (self.roomy && self.friendlyFire) {
        Text.renderText('FF ON', 12, 16, 28, 'left');
      }

      if (self.hooks && self.hooks.afterFrame) self.hooks.afterFrame(delta, elapsed);

      if (self.showFramerate) {
        Text.renderText('' + avgFramerate, 18, self.canvasWidth - 16, self.canvasHeight - 10, 'right');
      }

      frameCount++;
      elapsedCounter += elapsed;
      if (elapsedCounter > 1000) {
        elapsedCounter -= 1000;
        avgFramerate = frameCount;
        frameCount = 0;
      }

      requestAnimationFrame(mainLoop);
    };

    this._kick = function () {
      lastFrame = Date.now();
      mainLoop();
    };

    window.addEventListener('keydown', function (e) {
      var name = KEY_CODES[e.keyCode];
      if (name === 'p') {
        self.paused = !self.paused;
      } else if (name === 'm') {
        SFX.muted = !SFX.muted;
        if (!SFX.muted) SFX.unlock();
      } else if (name === 'f' && self.roomy && self.isHost) {
        self.friendlyFire = !self.friendlyFire;
        if (self.hooks && self.hooks.onFF) self.hooks.onFF(self.friendlyFire);
      } else if (name === 'tab') {
        self.showScores = true;
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', function (e) {
      if (KEY_CODES[e.keyCode] === 'tab') {
        self.showScores = false;
        e.preventDefault();
      }
    });
  };

  Game.fit = function () {
    var canvas = this.canvasNode;
    if (!canvas) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(320, window.innerWidth || 800);
    var h = Math.max(240, window.innerHeight || 600);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    this.dpr = dpr;
    var wasW = this.canvasWidth;
    this.canvasWidth = w;
    this.canvasHeight = h;
    if (this.grid && wasW) this.rebuildGrid();
    if (this.context) this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  Game.start = function () {
    SFX.unlock();
    this._kick();
  };

  root.AsteroidsGame = Game;
  root.KEY_STATUS = KEY_STATUS;
  root.KEY_CODES = KEY_CODES;
  root.SFX = SFX;
  root.Text = Text;
  root.ROCK_POINTS = ROCK_POINTS;
})(window);
