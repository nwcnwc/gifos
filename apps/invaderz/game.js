/*
 * InvaderZ — the GifOS loop.
 *
 * Vendor files are the original classes (Invader, Player, Genetics). They
 * expect a handful of globals (c, w, h, dt, player, lives). This file is
 * that environment: it owns the canvas, the generation counter, extra
 * cannons, and the host-sim of the swarm. Original main.js is not loaded —
 * it registered a service worker and an appcache, and it owns a single
 * cannon. Multiplayer hooks live on InvaderZ; the original had none.
 */
var canvas, c, w, h, dt, player, lives, invaders, generation, lastUpdate;

(function (root) {
  'use strict';

  var GW = 240, GH = 480;
  var raf = 0;
  var kills = 0;
  var over = false;
  var sim = true;
  var roomy = false;
  var showScores = false;
  var high = 0;
  var dpr = 1;
  var hooks = {};
  var patched = false;

  function r1(n) { return Math.round(n * 10) / 10; }

  function patchClasses() {
    if (patched) return;
    patched = true;
    Invader.prototype.draw = function () {
      if (!this.isAlive) return;
      c.fillStyle = this.color || 'black';
      for (var i = 0; i < this.shape.length; i++) {
        if (this.shape[i]) {
          c.fillRect((this.x + (i % 4)) * this.s, (this.y + (i >> 2)) * this.s, this.s, this.s);
        }
      }
    };
    Invader.prototype.update = function () {
      if (this.y >= (h >> 2)) {
        lives++;
        this.isAlive = false;
        return;
      }
      if (!this.shape[this.i]) {
        var value = this.dir * this.speed * dt;
        if (this.x + value > 0 && (this.x + value) * this.s < w - this.s * this.s) {
          this.x += value;
        }
      }
      this.y += this.speed * dt;
      if (this.frame == this.maxFrame) {
        this.dir = -this.dir;
        this.frame = 0;
        this.maxFrame = Math.floor(Math.random() * 32) + 16;
        this.i = ++this.i % this.shape.length;
      }
      this.frame++;
      this.fit = Math.round(this.y);
      Game.hitTest(this);
    };
    Invader.prototype.show = function () {
      if (!this.isAlive) return;
      this.draw();
      if (Game.sim) this.update();
      else Game.localHit(this);
    };
  }

  function shapeHit(inv, bx, by) {
    if (bx == null || by == null || !isFinite(bx) || !isFinite(by)) return false;
    var dx = bx - (inv.x + 2);
    var dy = by - inv.y;
    if (dx * dx + dy * dy >= 2.5 * 2.5) return false;
    for (var i = 0; i < inv.shape.length; i++) {
      if (!inv.shape[i]) continue;
      var cx = inv.x + (i % 4) + 0.5;
      var cy = inv.y + (i >> 2) + 0.5;
      var ddx = bx - cx, ddy = by - cy;
      if (ddx * ddx + ddy * ddy < 2.2 * 2.2) return true;
    }
    return false;
  }

  function invIndex(inv) {
    if (!invaders || !invaders.population) return -1;
    for (var i = 0; i < invaders.population.length; i++) {
      if (invaders.population[i] === inv) return i;
    }
    return -1;
  }

  function killMine(inv) {
    inv.isAlive = false;
    if (player) {
      player.isShooting = false;
      player.bullet = {};
    }
    kills++;
    Game.kills = kills;
  }

  function hitTest(inv) {
    if (player && player.isShooting && shapeHit(inv, player.bullet.x, player.bullet.y)) {
      killMine(inv);
      if (hooks.onKill) hooks.onKill(invIndex(inv));
      return;
    }
    var others = root.Net && root.Net.others();
    if (!others) return;
    for (var id in others) {
      var o = others[id];
      if (!o.shooting) continue;
      if (shapeHit(inv, o.bx, o.by)) {
        inv.isAlive = false;
        return;
      }
    }
  }

  function localHit(inv) {
    if (player && player.isShooting && shapeHit(inv, player.bullet.x, player.bullet.y)) {
      killMine(inv);
      if (hooks.onKill) hooks.onKill(invIndex(inv));
    }
  }

  function getBestOfGeneration() {
    var index = 0, best = 0;
    for (var i = 0; i < invaders.population.length; i++) {
      if (invaders.population[i].fit > best) {
        best = invaders.population[i].fit;
        index = i;
      }
    }
    if (!invaders.bestOfGeneration || invaders.population[index].fit > invaders.bestOfGeneration.fit) {
      invaders.bestOfGeneration = invaders.population[index];
    }
  }

  function drawShape(ctx, shape, x, y, s, color) {
    ctx.fillStyle = color;
    for (var i = 0; i < shape.length; i++) {
      if (shape[i]) ctx.fillRect((x + (i % 4)) * s, (y + (i >> 2)) * s, s, s);
    }
  }

  function drawHud() {
    c.fillStyle = 'black';
    c.font = '10px Arial';
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillText('Generation: ' + generation, 5, 10);
    c.fillText('Invaders: ' + lives, 5, 20);
    if (kills) c.fillText('Kills: ' + kills, 5, 30);
    if (high) c.fillText('Best: ' + high, w - 52, 10);
    if (roomy && !sim) c.fillText('Host holds the wave', 5, h - 14);
  }

  function drawOver() {
    c.fillStyle = 'black';
    var txt = 'Game Over!';
    c.font = '30px Arial';
    c.textAlign = 'left';
    c.fillText(txt, (w - c.measureText(txt).width) / 2, h / 2);
    c.font = '10px Arial';
    var hint = (roomy && !sim) ? 'Host restarts' : 'ENTER / FIRE to restart';
    c.fillText(hint, (w - c.measureText(hint).width) / 2, h / 2 + 18);
  }

  function fit() {
    if (!canvas) return;
    var stage = document.getElementById('stage') || document.body;
    var aw = stage.clientWidth || window.innerWidth;
    var ah = stage.clientHeight || window.innerHeight;
    var s = Math.min(aw / GW, ah / GH);
    if (!isFinite(s) || s <= 0) s = 1;
    canvas.style.width = (GW * s) + 'px';
    canvas.style.height = (GH * s) + 'px';
  }

  function mount(el) {
    canvas = el;
    w = GW;
    h = GH;
    dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = GW * dpr;
    canvas.height = GH * dpr;
    c = canvas.getContext('2d', { alpha: false });
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    fit();
    patchClasses();
    window.addEventListener('resize', fit);
  }

  function spawnCannon() {
    player = new Player(w / 4 / 2, h / 4 - 4);
  }

  function restart() {
    if (roomy && !sim) {
      if (!player) spawnCannon();
      return;
    }
    lives = 0;
    generation = 1;
    kills = 0;
    Game.kills = 0;
    over = false;
    Game.over = false;
    dt = 16;
    lastUpdate = Date.now();
    invaders = new Genetics();
    invaders.createPopulation();
    spawnCannon();
    if (hooks.onStart) hooks.onStart();
  }

  function exportWorld() {
    var pop = [];
    if (invaders && invaders.population) {
      for (var i = 0; i < invaders.population.length; i++) {
        var inv = invaders.population[i];
        pop.push({
          x: r1(inv.x), y: r1(inv.y),
          sh: inv.shape.slice(),
          sp: +inv.speed.toFixed(4),
          d: inv.dir, i: inv.i,
          f: inv.frame | 0, m: inv.maxFrame | 0,
          a: inv.isAlive ? 1 : 0,
          fit: inv.fit | 0
        });
      }
    }
    var best = invaders && invaders.bestOfGeneration;
    return {
      gen: generation,
      lives: lives,
      over: over || lives > 4 ? 1 : 0,
      pop: pop,
      best: best && best.shape ? best.shape.slice() : null,
      bestFit: best ? best.fit | 0 : 0
    };
  }

  function importWorld(rec) {
    if (!rec || sim) return;
    if ((rec.gen | 0) === 1 && generation > 1) {
      kills = 0;
      Game.kills = 0;
      if (player) { player.isShooting = false; player.bullet = {}; }
    }
    generation = rec.gen | 0;
    lives = rec.lives | 0;
    over = !!rec.over || lives > 4;
    Game.over = over;
    if (!invaders) invaders = new Genetics();
    var pop = rec.pop || [];
    var next = [];
    for (var i = 0; i < pop.length; i++) {
      var row = pop[i];
      var inv = new Invader(row.x, row.y, (row.sh && row.sh.slice()) || [], 'black', row.sp);
      inv.dir = row.d || 1;
      inv.i = row.i | 0;
      inv.frame = row.f | 0;
      inv.maxFrame = row.m || 16;
      inv.isAlive = !!row.a;
      inv.fit = row.fit | 0;
      next.push(inv);
    }
    invaders.population = next;
    if (rec.best) {
      invaders.bestOfGeneration = new Invader(0, 0, rec.best.slice());
      invaders.bestOfGeneration.fit = rec.bestFit | 0;
    }
  }

  function honor(idx) {
    if (!sim || !invaders || !invaders.population) return;
    var inv = invaders.population[idx];
    if (inv && inv.isAlive) inv.isAlive = false;
  }

  function tick() {
    raf = requestAnimationFrame(tick);
    var now = Date.now();
    dt = now - lastUpdate;
    if (dt < 0) dt = 0;
    if (dt > 50) dt = 50;
    lastUpdate = now;

    c.fillStyle = 'white';
    c.fillRect(0, 0, w, h);

    if (over || lives > 4) {
      over = true;
      Game.over = true;
      if (player) player.show();
      if (invaders && invaders.population) {
        for (var d = 0; d < invaders.population.length; d++) invaders.population[d].draw();
      }
      if (root.Net && root.Net.live()) {
        root.Net.tick();
        root.Net.drawCannons(c);
      }
      drawHud();
      drawOver();
      if (generation > high) {
        high = generation;
        if (hooks.onHigh) hooks.onHigh(high);
      }
      return;
    }

    if (invaders && invaders.population) {
      for (var i = 0; i < invaders.population.length; i++) {
        invaders.population[i].show();
      }
    }
    if (player) player.show();
    if (root.Net && root.Net.live()) {
      root.Net.tick();
      root.Net.drawCannons(c);
    }

    if (sim && invaders && invaders.population) {
      var allDead = true;
      for (i = 0; i < invaders.population.length; i++) {
        if (invaders.population[i].isAlive) { allDead = false; break; }
      }
      if (allDead) {
        getBestOfGeneration();
        if (generation % 7) invaders.evolve();
        else invaders.elitism();
        generation++;
      }
      if (lives > 4) {
        over = true;
        Game.over = true;
      }
    }

    drawHud();
    if (generation > high) {
      high = generation;
      if (hooks.onHigh) hooks.onHigh(high);
    }
    if (hooks.afterFrame) hooks.afterFrame();
  }

  function start() {
    patchClasses();
    if (sim) {
      if (!player) restart();
    } else {
      if (!player) spawnCannon();
      if (!invaders) {
        invaders = new Genetics();
        invaders.population = [];
        lives = 0;
        generation = 1;
      }
    }
    lastUpdate = Date.now();
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function onKey(e, down) {
    if (!player) return;
    var code = e.keyCode;
    var key = e.key;
    var used = false;
    if (code === 13 || key === 'Enter') {
      used = true;
      if (down && over) restart();
    } else if (code === 32 || key === ' ' || key === 'Spacebar') {
      used = true;
      if (down) {
        if (over) restart();
        else player.shoot();
      }
    } else if (code === 37 || code === 65 || key === 'ArrowLeft' || key === 'a' || key === 'A') {
      used = true;
      player.isMovingLeft = down;
    } else if (code === 39 || code === 68 || key === 'ArrowRight' || key === 'd' || key === 'D') {
      used = true;
      player.isMovingRight = down;
    } else if (code === 9 || key === 'Tab') {
      used = true;
      if (down) {
        showScores = !showScores;
        Game.showScores = showScores;
      }
    }
    if (used) e.preventDefault();
  }

  document.addEventListener('keydown', function (e) { onKey(e, true); });
  document.addEventListener('keyup', function (e) { onKey(e, false); });
  window.addEventListener('focus', function () { lastUpdate = Date.now(); });

  var Game = {
    hooks: hooks,
    mount: mount,
    start: start,
    restart: restart,
    fit: fit,
    exportWorld: exportWorld,
    importWorld: importWorld,
    honor: honor,
    hitTest: hitTest,
    localHit: localHit,
    drawShape: drawShape,
    shapeHit: shapeHit,
    get sim() { return sim; },
    set sim(v) { sim = !!v; },
    get roomy() { return roomy; },
    set roomy(v) { roomy = !!v; },
    get over() { return over; },
    set over(v) { over = !!v; },
    get kills() { return kills; },
    set kills(v) { kills = v | 0; },
    get high() { return high; },
    set high(v) { high = v | 0; },
    get showScores() { return showScores; },
    set showScores(v) { showScores = !!v; }
  };

  root.InvaderZ = Game;
})(window);
