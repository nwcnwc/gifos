/*
 * Parable of the Polygons — one Schelling town, many instances.
 *
 * Upstream ran each board in its own iframe with a pile of globals
 * (BIAS, draggables, Mouse, canvas). GifOS mounts one srcdoc, so this
 * is a factory around the same rules from play/automatic/automatic.js,
 * play/mini/mini.js and play/manual/manual.js:
 *
 *   neighbour = anyone inside (tile+5)²+(tile+5)²  (8-neighbourhood)
 *   sameness  = same/neighbours, or 1 if none
 *   shaking   if sameness < bias OR sameness > nonconform
 *   bored     if sameness > 0.99
 *   0 neighbours → not shaking (automatic.js; mini has no extra case
 *                 but the same outcome at nonconform=1)
 *   step: pick a random shaker, send them to a random empty cell
 *
 * Pickup is only allowed while shaking, unless pickAnyone (the sandbox).
 */
(function (root) {
  'use strict';

  var SPRITE_KEYS = [
    'yayTriangle', 'yayTriangleBlink', 'mehTriangle', 'sadTriangle',
    'yaySquare', 'yaySquareBlink', 'mehSquare', 'sadSquare',
    'yayPentagon'
  ];
  var images = {};
  var assetsLeft = 0;
  var assetsReady = false;
  var waiters = [];
  var towns = [];
  var looping = false;

  function loadSprites() {
    var src = root.POLYGON_SPRITES || {};
    assetsLeft = 0;
    for (var i = 0; i < SPRITE_KEYS.length; i++) {
      var k = SPRITE_KEYS[i];
      if (!src[k]) continue;
      assetsLeft++;
      var img = new Image();
      images[k] = img;
      img.onload = img.onerror = function () {
        assetsLeft--;
        if (assetsLeft <= 0) {
          assetsReady = true;
          for (var w = 0; w < waiters.length; w++) waiters[w]();
          waiters = [];
        }
      };
      img.src = src[k];
    }
    if (assetsLeft === 0) assetsReady = true;
  }

  function whenReady(fn) {
    if (assetsReady) fn();
    else waiters.push(fn);
  }

  function loop() {
    looping = true;
    root.requestAnimationFrame(loop);
    for (var i = 0; i < towns.length; i++) towns[i].tick();
  }

  function localXY(ev, canvas, offsetY) {
    var r = canvas.getBoundingClientRect();
    var sx = r.width ? canvas.width / r.width : 1;
    var sy = r.height ? canvas.height / r.height : 1;
    var x, y;
    if (ev.touches && ev.touches.length) {
      x = ev.touches[0].clientX;
      y = ev.touches[0].clientY;
    } else if (ev.changedTouches && ev.changedTouches.length) {
      x = ev.changedTouches[0].clientX;
      y = ev.changedTouches[0].clientY;
    } else {
      x = ev.clientX;
      y = ev.clientY;
    }
    return { x: (x - r.left) * sx, y: (y - r.top) * sy - (offsetY || 0) };
  }

  function parseGrid(src) {
    if (typeof src === 'string') {
      var rows = src.trim().split(/\n+/);
      var g = [];
      for (var y = 0; y < rows.length; y++) {
        var line = rows[y].replace(/\s+/g, '');
        var row = [];
        for (var x = 0; x < line.length; x++) row.push(line.charCodeAt(x) - 48);
        g.push(row);
      }
      return g;
    }
    return src;
  }

  function samenessOf(self, list, diag2) {
    var neighbors = 0, same = 0;
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (d === self) continue;
      var dx = d.x - self.x, dy = d.y - self.y;
      if (dx * dx + dy * dy < diag2) {
        neighbors++;
        if (d.color === self.color) same++;
      }
    }
    return {
      neighbors: neighbors,
      sameness: neighbors > 0 ? same / neighbors : 1
    };
  }

  function isShaking(sam, neighbors, bias, nonconform, lonelyShakes) {
    if (neighbors === 0 && !lonelyShakes) return false;
    return sam < bias || sam > nonconform;
  }

  function Peep(town, x, y, color) {
    this.town = town;
    this.x = x;
    this.y = y;
    this.gotoX = x;
    this.gotoY = y;
    this.color = color;
    this.shaking = false;
    this.bored = false;
    this.sameness = 1;
    this.dragged = false;
    this.frame = Math.random() * 10;
    this.blinking = 0;
    this.dangle = 0;
    this.dangleVel = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.pickupX = x;
    this.pickupY = y;
  }

  Peep.prototype.mood = function () {
    var n = samenessOf(this, this.town.peeps, this.town.diag2);
    this.sameness = n.sameness;
    this.bored = n.sameness > 0.99;
    this.shaking = isShaking(
      n.sameness, n.neighbors,
      this.town.bias, this.town.nonconform,
      this.town.lonelyShakes
    );
  };

  Peep.prototype.pickup = function () {
    var t = this.town;
    t.picking = true;
    this.pickupX = (Math.floor(this.x / t.tile) + 0.5) * t.tile;
    this.pickupY = (Math.floor(this.y / t.tile) + 0.5) * t.tile;
    this.offsetX = t.mouse.x - this.x;
    this.offsetY = t.mouse.y - this.y;
    this.dragged = true;
    this.dangle = 0;
    this.dangleVel = 0;
    var i = t.peeps.indexOf(this);
    if (i >= 0) {
      t.peeps.splice(i, 1);
      t.peeps.push(this);
    }
  };

  Peep.prototype.drop = function () {
    var t = this.town;
    t.picking = false;
    var px = Math.floor(t.mouse.x / t.tile);
    var py = Math.floor(t.mouse.y / t.tile);
    if (px < 0) px = 0;
    if (px >= t.gw) px = t.gw - 1;
    if (py < 0) py = 0;
    if (py >= t.gh) py = t.gh - 1;
    var nx = (px + 0.5) * t.tile;
    var ny = (py + 0.5) * t.tile;
    var taken = false;
    for (var i = 0; i < t.peeps.length; i++) {
      var d = t.peeps[i];
      if (d === this) continue;
      var dx = d.gotoX - nx, dy = d.gotoY - ny;
      if (dx * dx + dy * dy < 10) { taken = true; break; }
    }
    if (taken) {
      this.gotoX = this.pickupX;
      this.gotoY = this.pickupY;
    } else {
      this.gotoX = nx;
      this.gotoY = ny;
      t.steps++;
      if (t.onMoved) t.onMoved(this);
    }
    this.dragged = false;
  };

  Peep.prototype.draw = function (ctx) {
    var t = this.town;
    var size = t.peep;
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.shaking) {
      this.frame += 0.07;
      ctx.translate(0, 20);
      ctx.rotate(Math.sin(this.frame - (this.x + this.y) / 200) * Math.PI * 0.05);
      ctx.translate(0, -20);
    }
    if (Math.random() < 0.01) this.blinking = 10;
    var img = spriteFor(this);
    if (this.dragged) {
      this.dangle += (t.lastMX - t.mouse.x) / 100;
      ctx.rotate(-this.dangle);
      this.dangleVel += this.dangle * (-0.02);
      this.dangle += this.dangleVel;
      this.dangle *= 0.9;
    }
    if (img && img.width) {
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
    } else {
      drawFallback(ctx, this, size);
    }
    ctx.restore();
  };

  function spriteFor(p) {
    var tri = p.color === 'triangle';
    if (p.shaking) return images[tri ? 'sadTriangle' : 'sadSquare'];
    if (p.bored) return images[tri ? 'mehTriangle' : 'mehSquare'];
    if (p.blinking > 0) {
      p.blinking--;
      return images[tri ? 'yayTriangleBlink' : 'yaySquareBlink'];
    }
    return images[tri ? 'yayTriangle' : 'yaySquare'];
  }

  function drawFallback(ctx, p, size) {
    var s = size * 0.42;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, size * 0.07);
    ctx.strokeStyle = '#3d2b1f';
    if (p.color === 'triangle') {
      ctx.fillStyle = p.shaking ? '#e8b43a' : '#f5c318';
      ctx.beginPath();
      ctx.moveTo(0, -s * 1.15);
      ctx.lineTo(s, s * 0.85);
      ctx.lineTo(-s, s * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillStyle = p.shaking ? '#3d6adf' : '#567dff';
      roundRect(ctx, -s, -s, s * 2, s * 2, s * 0.18);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#3d2b1f';
    if (p.shaking) {
      ctx.beginPath();
      ctx.arc(-s * 0.28, -s * 0.05, size * 0.035, 0, Math.PI * 2);
      ctx.arc(s * 0.28, -s * 0.05, size * 0.035, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, size * 0.045);
      ctx.beginPath();
      ctx.arc(0, s * 0.28, size * 0.08, Math.PI * 0.15, Math.PI - Math.PI * 0.15);
      ctx.stroke();
    } else if (p.bored) {
      ctx.beginPath();
      ctx.arc(-s * 0.28, -s * 0.08, size * 0.035, 0, Math.PI * 2);
      ctx.arc(s * 0.28, -s * 0.08, size * 0.035, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, size * 0.05);
      ctx.beginPath();
      ctx.moveTo(-s * 0.18, s * 0.28);
      ctx.lineTo(s * 0.18, s * 0.28);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(-s * 0.28, -s * 0.08, size * 0.035, 0, Math.PI * 2);
      ctx.arc(s * 0.28, -s * 0.08, size * 0.035, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, size * 0.05);
      ctx.beginPath();
      ctx.arc(0, s * 0.12, size * 0.12, Math.PI * 0.15, Math.PI - Math.PI * 0.15, true);
      ctx.stroke();
    }
    ctx.lineWidth = Math.max(2, size * 0.07);
    ctx.beginPath();
    ctx.moveTo(-s * 0.22, s * 0.85);
    ctx.lineTo(-s * 0.22, s * 1.15);
    ctx.moveTo(s * 0.22, s * 0.85);
    ctx.lineTo(s * 0.22, s * 1.15);
    ctx.stroke();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function Town(opts) {
    opts = opts || {};
    var self = this;
    this.canvas = opts.canvas;
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.statsCanvas = opts.statsCanvas || null;
    this.statsCtx = this.statsCanvas ? this.statsCanvas.getContext('2d') : null;
    this.statsText = opts.statsText || null;
    this.tile = opts.tile || 30;
    this.peep = opts.peep || this.tile;
    this.gw = opts.gw || 20;
    this.gh = opts.gh || 20;
    this.bias = opts.bias == null ? 0.33 : opts.bias;
    this.nonconform = opts.nonconform == null ? 1 : opts.nonconform;
    this.emptiness = opts.emptiness == null ? 0.2 : opts.emptiness;
    this.ratioT = opts.ratioT == null ? 0.5 : opts.ratioT;
    this.pickAnyone = !!opts.pickAnyone;
    this.lonelyShakes = !!opts.lonelyShakes;
    this.auto = !!opts.auto;
    this.box = opts.box || null;
    this.confettiOn = !!opts.confetti;
    this.pad = opts.pad == null ? 5 : opts.pad;
    this.offsetY = opts.offsetY || 0;
    this.onMoved = opts.onMoved || null;
    this.onDone = opts.onDone || null;
    this.onTickStats = opts.onTickStats || null;
    this.diag2 = (this.tile + 5) * (this.tile + 5) * 2;
    this.peeps = [];
    this.mouse = { x: 0, y: 0, pressed: false };
    this.lastMX = 0;
    this.lastMY = 0;
    this.picking = false;
    this.lastPressed = false;
    this.running = false;
    this.inSight = true;
    this.steps = 0;
    this.offset = 0;
    this.doneBuf = 30;
    this.doneFlash = 0;
    this.confetti = [];
    this.confettiOnce = false;
    this.frozen = !!opts.frozen;
    this.startKind = opts.start || 'random';
    this.grid = opts.grid ? parseGrid(opts.grid) : null;
    if (this.grid) {
      this.gh = this.grid.length;
      this.gw = this.grid[0].length;
    }
    this._tmpStats = null;
    if (this.canvas) {
      this.canvas.width = this.gw * this.tile + 10;
      this.canvas.height = this.gh * this.tile + 10 + this.offsetY;
      bindMouse(this);
      watchSight(this);
    }
    towns.push(this);
    if (!looping && this.canvas) loop();
    var selfTown = this;
    whenReady(function () { selfTown.reset(); });
  }

  Town.prototype.setBias = function (b, nc) {
    if (b != null) this.bias = b;
    if (nc != null) this.nonconform = nc;
    this.running = false;
    this.writeStats();
  };

  Town.prototype.setMix = function (ratioT, emptiness) {
    if (ratioT != null) this.ratioT = ratioT;
    if (emptiness != null) this.emptiness = emptiness;
  };

  Town.prototype.reset = function (cells) {
    this.running = false;
    this.steps = 0;
    this.offset = 0;
    this.doneBuf = 30;
    this.doneFlash = 0;
    this.confetti = [];
    this.confettiOnce = false;
    this.picking = false;
    this.peeps = [];
    if (this.statsCtx && this.statsCanvas) {
      this.statsCtx.clearRect(0, 0, this.statsCanvas.width, this.statsCanvas.height);
    }
    if (cells && cells.length) {
      this.importCells(cells);
    } else if (this.grid) {
      this._fromGrid(this.grid);
    } else if (this.startKind === 'segregated') {
      this._fromGrid(parseGrid(root.POLYGON_SEGREGATED || ''));
    } else {
      this._randomFill();
    }
    for (var i = 0; i < this.peeps.length; i++) this.peeps[i].mood();
    this.writeStats();
    if (this.onMoved) this.onMoved(null);
  };

  Town.prototype._fromGrid = function (grid) {
    this.gh = grid.length;
    this.gw = grid[0].length;
    for (var y = 0; y < grid.length; y++) {
      for (var x = 0; x < grid[y].length; x++) {
        var v = grid[y][x];
        if (!v) continue;
        var xx = this.tile * (x + 0.5);
        var yy = this.tile * (y + 0.5);
        this.peeps.push(new Peep(this, xx, yy, v === 2 ? 'triangle' : 'square'));
      }
    }
  };

  Town.prototype._randomFill = function () {
    for (var x = 0; x < this.gw; x++) {
      for (var y = 0; y < this.gh; y++) {
        if (Math.random() < (1 - this.emptiness)) {
          var xx = (x + 0.5) * this.tile;
          var yy = (y + 0.5) * this.tile;
          var c = Math.random() < this.ratioT ? 'triangle' : 'square';
          this.peeps.push(new Peep(this, xx, yy, c));
        }
      }
    }
  };

  Town.prototype.exportCells = function () {
    var out = [];
    for (var i = 0; i < this.peeps.length; i++) {
      var p = this.peeps[i];
      out.push({
        x: Math.round(p.gotoX / this.tile - 0.5),
        y: Math.round(p.gotoY / this.tile - 0.5),
        c: p.color === 'triangle' ? 2 : 1
      });
    }
    return out;
  };

  Town.prototype.importCells = function (cells) {
    this.peeps = [];
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      var xx = (c.x + 0.5) * this.tile;
      var yy = (c.y + 0.5) * this.tile;
      this.peeps.push(new Peep(this, xx, yy, c.c === 2 ? 'triangle' : 'square'));
    }
  };

  Town.prototype.avgSameness = function () {
    if (!this.peeps.length) return 0;
    var t = 0;
    for (var i = 0; i < this.peeps.length; i++) t += this.peeps[i].sameness || 0;
    return t / this.peeps.length;
  };

  Town.prototype.segregation = function () {
    var s = (this.avgSameness() - 0.5) * 2;
    return s < 0 ? 0 : s;
  };

  Town.prototype.isDone = function () {
    if (this.picking || this.mouse.pressed) return false;
    if (this.box) {
      for (var i = 0; i < this.peeps.length; i++) {
        var p = this.peeps[i];
        if (p.x < this.box[0] || p.x > this.box[1]) return false;
      }
      return true;
    }
    for (var j = 0; j < this.peeps.length; j++) {
      if (this.peeps[j].shaking) return false;
    }
    return true;
  };

  Town.prototype.step = function () {
    var shaking = [];
    for (var i = 0; i < this.peeps.length; i++) {
      if (this.peeps[i].shaking) shaking.push(this.peeps[i]);
    }
    if (!shaking.length) return;
    var shaker = shaking[(Math.random() * shaking.length) | 0];
    var empties = [];
    for (var x = 0; x < this.gw; x++) {
      for (var y = 0; y < this.gh; y++) {
        var spot = {
          x: (x + 0.5) * this.tile,
          y: (y + 0.5) * this.tile
        };
        var taken = false;
        for (var k = 0; k < this.peeps.length; k++) {
          var d = this.peeps[k];
          var dx = d.gotoX - spot.x, dy = d.gotoY - spot.y;
          if (dx * dx + dy * dy < 10) { taken = true; break; }
        }
        if (!taken) empties.push(spot);
      }
    }
    if (!empties.length) return;
    var spot2 = empties[(Math.random() * empties.length) | 0];
    shaker.gotoX = spot2.x;
    shaker.gotoY = spot2.y;
  };

  Town.prototype.writeStats = function () {
    if (!this.peeps.length) return;
    var seg = this.segregation();
    if (this.statsCtx && this.statsCanvas) {
      var W = this.statsCanvas.width, H = this.statsCanvas.height;
      if (this.steps > (W - 50) + this.offset) {
        this.offset += 120;
        if (!this._tmpStats) {
          this._tmpStats = document.createElement('canvas');
          this._tmpStats.width = W;
          this._tmpStats.height = H;
        }
        var tctx = this._tmpStats.getContext('2d');
        tctx.clearRect(0, 0, W, H);
        tctx.drawImage(this.statsCanvas, 0, 0);
        this.statsCtx.clearRect(0, 0, W, H);
        this.statsCtx.drawImage(this._tmpStats, -119, 0);
      }
      var x = this.steps - this.offset;
      var y = H - seg * (H - 30) - 10;
      this.statsCtx.fillStyle = '#cc2727';
      this.statsCtx.fillRect(x, y, 1, 5);
      if (this.statsText) {
        this.statsText.textContent = Math.floor(seg * 100) + '%';
        this.statsText.style.top = Math.round(y - 8) + 'px';
        this.statsText.style.left = Math.round(x + 8) + 'px';
      }
    }
    if (this.onTickStats) this.onTickStats(seg, this.running);
  };

  Town.prototype.tick = function () {
    if (!this.ctx) return;
    if (!this.inSight && !this.picking) return;
    if (this.running) this.step();

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.offsetY) {
      this.ctx.save();
      this.ctx.translate(0, this.offsetY);
    }
    if (this.box) drawBox(this);

    var over = this.picking;
    for (var i = 0; i < this.peeps.length; i++) {
      var p = this.peeps[i];
      if (!p.dragged) p.mood();
      if (!this.frozen) {
        if (!p.dragged) {
          if ((p.shaking || this.pickAnyone) && this.mouse.pressed && !this.lastPressed) {
            var dx = this.mouse.x - p.x, dy = this.mouse.y - p.y;
            if (Math.abs(dx) < this.peep / 2 && Math.abs(dy) < this.peep / 2) p.pickup();
          }
        } else {
          p.gotoX = this.mouse.x - p.offsetX;
          p.gotoY = this.mouse.y - p.offsetY;
          if (!this.mouse.pressed) p.drop();
        }
        p.x = p.x * 0.5 + p.gotoX * 0.5;
        p.y = p.y * 0.5 + p.gotoY * 0.5;
      }
      if (p.shaking || this.pickAnyone) {
        var hx = this.mouse.x - p.x, hy = this.mouse.y - p.y;
        if (Math.abs(hx) < this.peep / 2 && Math.abs(hy) < this.peep / 2) over = true;
      }
    }
    this.canvas.style.cursor = over ? (this.mouse.pressed ? 'grabbing' : 'grab') : '';
    for (var j = 0; j < this.peeps.length; j++) this.peeps[j].draw(this.ctx);

    if (this.confettiOn) {
      for (var c = 0; c < this.confetti.length; c++) {
        this.confetti[c].y += this.confetti[c].vy;
        this.confetti[c].tick += this.confetti[c].tv;
        if (this.confetti[c].y > this.canvas.height) this.confetti[c].y -= this.canvas.height + 80;
        var cf = this.confetti[c];
        this.ctx.save();
        this.ctx.translate(cf.x - Math.sin(cf.tick) * cf.w, cf.y);
        this.ctx.rotate(Math.sin(cf.tick) * 0.2);
        this.ctx.fillStyle = cf.color;
        this.ctx.fillRect(-10, -5, 20, 10);
        this.ctx.restore();
      }
    }

    if (this.offsetY) this.ctx.restore();
    // confetti already drawn in translated space when offsetY is set

    this.lastMX = this.mouse.x;
    this.lastMY = this.mouse.y;
    this.lastPressed = this.mouse.pressed;

    if (this.isDone()) {
      this.doneBuf--;
      if (this.doneBuf === 0) {
        this.doneFlash = 30;
        this.running = false;
        if (this.confettiOn && !this.confettiOnce) {
          this.confettiOnce = true;
          for (var n = 0; n < 100; n++) {
            this.confetti.push({
              x: Math.random() * this.canvas.width,
              y: -40 - Math.random() * 250,
              tick: Math.random() * Math.PI * 2,
              tv: Math.random() * 0.2,
              vy: Math.random() + 1,
              w: Math.random() * 5 + 2,
              color: 'hsl(' + ((Math.random() * 360) | 0) + ',80%,80%)'
            });
          }
        }
        this.writeStats();
        if (this.onDone) this.onDone();
      }
    } else if (this.running) {
      this.steps++;
      this.doneBuf = 30;
      this.writeStats();
    } else {
      this.doneBuf = 30;
    }
    if (this.doneFlash > 0) {
      this.doneFlash--;
      var op = ((this.doneFlash % 15) / 15) * 0.2;
      this.canvas.style.background = 'rgba(255,255,255,' + op + ')';
    } else {
      this.canvas.style.background = 'transparent';
    }
  };

  function drawBox(town) {
    var ctx = town.ctx;
    var x0 = town.box[0], x1 = town.box[1];
    var y0 = -6;
    var y1 = town.gh * town.tile + 8;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,220,80,.85)';
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(x0 - 40, y0, (x1 - x0) + 80, y1 - y0);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,220,80,.12)';
    ctx.fillRect(x0 - 40, y0, (x1 - x0) + 80, y1 - y0);
    ctx.fillStyle = '#ffe27a';
    ctx.font = '700 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BOX OF FRIENDSHIP', (x0 + x1) / 2, y0 + 16);
    ctx.restore();
  }

  function bindMouse(town) {
    var c = town.canvas;
    function down(ev) {
      var p = localXY(ev, c, town.offsetY);
      town.mouse.x = p.x;
      town.mouse.y = p.y;
      var hit = hitPeep(town);
      if (hit) {
        town.mouse.pressed = true;
        if (c.setPointerCapture && ev.pointerId != null) {
          try { c.setPointerCapture(ev.pointerId); } catch (e) {}
        }
        if (ev.cancelable) ev.preventDefault();
      }
    }
    function move(ev) {
      var p = localXY(ev, c, town.offsetY);
      town.mouse.x = p.x;
      town.mouse.y = p.y;
      if (town.picking && ev.cancelable) ev.preventDefault();
    }
    function up(ev) {
      town.mouse.pressed = false;
      if (ev && ev.cancelable && town.picking) ev.preventDefault();
    }
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('lostpointercapture', up);
  }

  function hitPeep(town) {
    for (var i = town.peeps.length - 1; i >= 0; i--) {
      var p = town.peeps[i];
      if (!(p.shaking || town.pickAnyone)) continue;
      var dx = town.mouse.x - p.x, dy = town.mouse.y - p.y;
      if (Math.abs(dx) < town.peep / 2 && Math.abs(dy) < town.peep / 2) return p;
    }
    return null;
  }

  function watchSight(town) {
    if (typeof IntersectionObserver !== 'function') {
      town.inSight = true;
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        town.inSight = entries[i].isIntersecting;
      }
    }, { root: null, threshold: 0.05 });
    io.observe(town.canvas);
  }

  Town.samenessOf = samenessOf;
  Town.isShaking = isShaking;
  Town.parseGrid = parseGrid;
  Town.SPRITE_KEYS = SPRITE_KEYS;
  Town.images = images;
  Town.towns = towns;
  Town.loadSprites = loadSprites;

  root.Town = Town;
  loadSprites();
})(window);
