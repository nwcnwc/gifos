/*
 * Boot the original SkiFree engine, with two seams:
 *   1. Sprites — hidden <img> tags (vendor PNGs) so a srcdoc iframe can
 *      rewrite them to data URLs. A path assigned from JS would 404.
 *   2. High score — upstream used localStorage; we keep it in prefs.
 *
 * Keyboard is here. Finger on the piste is touch.js. Invite is OS chrome.
 */
(function (root) {
  'use strict';

  var PIXELS_PER_METRE = 18;
  var MONSTER_DISTANCE_THRESHOLD = 2000;
  var DROP = { smallTree: 4, tallTree: 2, jump: 1, thickSnow: 1, rock: 1 };

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('skifree-canvas');
  var camera = null;
  var player = null;
  var game = null;
  var startSign = null;
  var prefsDb = null;
  var best = 0;
  var lives = 5;
  var dist = 0;
  var over = false;
  var hintTimer = 0;
  var tape = [];
  var lastTape = 0;
  var savedTape = null;

  var Ski = root.Ski || (root.Ski = {});

  function sprites() { return Ski.sprites; }

  function skierPart() {
    if (!player) return 'south';
    if (player.isBeingEaten) return 'blank';
    if (player.isJumping) {
      if (player.isPerformingTrick) {
        if (player._trickStep === 1) return 'somersault1';
        if (player._trickStep === 2) return 'somersault2';
        return 'jumping';
      }
      return 'jumping';
    }
    if (player.isOuching) return 'ouch';
    if (player.hasBeenHit) return 'hit';
    return player._getDiscreteDirection ? player._getDiscreteDirection() : 'south';
  }

  function metres() {
    if (!player) return 0;
    return player.getPixelsTravelledDownMountain() / PIXELS_PER_METRE;
  }

  function paintHud() {
    var m = metres();
    dist = m;
    $('meters').textContent = m.toFixed(1) + ' m';
    $('lives').textContent = lives + (lives === 1 ? ' skier' : ' skiers');
    $('bestLine').textContent = best ? ('Best ' + best.toFixed(1) + ' m') : '';
  }

  function saveBest() {
    if (!prefsDb) return;
    try { prefsDb.put({ id: 'best', n: best }).catch(function () {}); } catch (e) {}
  }

  function saveTape(samples) {
    if (!prefsDb) return;
    savedTape = samples;
    try { prefsDb.put({ id: 'ghost', samples: samples }).catch(function () {}); } catch (e) {}
  }

  function loadBest() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve();
    try { prefsDb = root.gifos.db('prefs'); } catch (e) { return Promise.resolve(); }
    return Promise.all([
      prefsDb.get('best').then(function (row) {
        if (row && row.n > best) best = +row.n;
      }).catch(function () {}),
      prefsDb.get('ghost').then(function (row) {
        if (row && row.samples && row.samples.length) savedTape = row.samples;
      }).catch(function () {})
    ]).then(function () {
      paintHud();
      if (root.SkiMp && root.SkiMp.setTape) root.SkiMp.setTape(savedTape);
    });
  }

  function recordTape() {
    if (!player || over) return;
    var t = Date.now();
    if (t - lastTape < 125) return;
    lastTape = t;
    tape.push([
      Math.round(player.mapPosition[0] || 0),
      Math.round(player.mapPosition[1] || 0),
      skierPart(),
      Math.round(metres() * 10) / 10
    ]);
    if (tape.length > 480) tape.shift();
  }

  function dropMod() {
    var w = camera.logicalWidth();
    // Original tuned a 800px window. A phone is a thin strip of the same
    // mountain, so the modifier that THINNED a small window leaves it empty.
    if (w < 520) return 0;
    return Math.max(800 - w, 0);
  }

  function seedSlope() {
    if (!game || !player || !camera) return;
    var spr = sprites();
    var types = [spr.smallTree, spr.tallTree, spr.smallTree, spr.rock, spr.tallTree];
    var w = camera.logicalWidth();
    var h = camera.logicalHeight();
    var n = w < 520 ? 28 : 24;
    var placed = 0, guard = 0;
    while (placed < n && guard < n * 8) {
      guard++;
      var info = types[placed % types.length];
      var x = (Math.random() - 0.5) * w * 0.92;
      var y = 40 + Math.random() * (h * 0.62);
      if (Math.abs(x) < 110 && y < 200) continue;
      var s = new Ski.Sprite(info);
      s.setMapPosition(x, y);
      var canv = camera.mapPositionToCanvasPosition([x, y]);
      s.canvasX = canv[0];
      s.canvasY = canv[1];
      if (info.hitBehaviour && info.hitBehaviour.skier) {
        s.onHitting(player, info.hitBehaviour.skier);
      }
      game.addStaticObject(s);
      placed++;
    }
    if (player && camera) {
      var centre = camera.getCentralPosition().canvas;
      player.canvasX = centre[0];
      player.canvasY = centre[1];
    }
  }

  function monsterHitsSkier(monster, skier) {
    skier.isEatenBy(monster, function () {
      lives -= 1;
      if (lives < 0) lives = 0;
      monster.isFull = true;
      monster.isEating = false;
      skier.isBeingEaten = false;
      monster.setSpeed(skier.getSpeed());
      monster.stopFollowing();
      var above = camera.getRandomMapPositionAboveViewport();
      monster.setMapPositionTarget(above[0], above[1]);
      if (root.SkiMp) root.SkiMp.publish(true);
    });
  }

  function spawnMonster() {
    var neu = new Ski.Monster(sprites().monster);
    var pos = camera.getRandomMapPositionAboveViewport();
    neu.setMapPosition(pos[0], pos[1]);
    neu.follow(player);
    neu.setSpeed(player.getStandardSpeed());
    neu.onHitting(player, monsterHitsSkier);
    game.addMovingObject(neu, 'monster');
  }

  function spawnBoarder() {
    var neu = new Ski.Snowboarder(sprites().snowboarder);
    var above = camera.getRandomMapPositionAboveViewport();
    var below = camera.getRandomMapPositionBelowViewport();
    neu.setMapPosition(above[0], above[1]);
    neu.setMapPositionTarget(below[0], below[1]);
    neu.onHitting(player, sprites().snowboarder.hitBehaviour.skier);
    game.addMovingObject(neu);
  }

  function randomlySpawn(fn, rate) {
    var mod = dropMod();
    if (Math.floor(Math.random() * (1001 + mod)) <= rate) fn();
  }

  function spawnTerrain() {
    if (!player.isMoving) return [];
    var phone = camera.logicalWidth() < 520;
    return Ski.Sprite.createObjects([
      { sprite: sprites().smallTree, dropRate: phone ? 9 : DROP.smallTree },
      { sprite: sprites().tallTree, dropRate: phone ? 5 : DROP.tallTree },
      { sprite: sprites().jump, dropRate: DROP.jump },
      { sprite: sprites().thickSnow, dropRate: DROP.thickSnow },
      { sprite: sprites().rock, dropRate: phone ? 2 : DROP.rock }
    ], {
      rateModifier: dropMod(),
      position: function () { return camera.getRandomMapPositionBelowViewport(); },
      player: player
    });
  }

  function showOver() {
    if (over) return;
    over = true;
    var m = metres();
    if (m > best) {
      best = m;
      saveBest();
      if (tape.length) saveTape(tape.slice());
    }
    paintHud();
    $('overDist').textContent = m.toFixed(1) + ' m';
    $('over').hidden = false;
    if (root.SkiMp) root.SkiMp.onOver();
    game.pause();
    game.cycle();
    game.draw();
  }

  function resetGame() {
    if (!game) return;
    if (root.SkiMp && !root.SkiMp.canRetry()) return;
    lives = 5;
    dist = 0;
    over = false;
    tape = [];
    lastTape = 0;
    $('over').hidden = true;
    if (root.SkiMp) root.SkiMp.onRetry();
    game.reset();
    player.isBeingEaten = false;
    startSign = new Ski.Sprite(sprites().signStart);
    startSign.setMapPosition(-50, 0);
    game.addStaticObject(startSign);
    seedSlope();
    player.isMoving = false;
    player.setDirection(270);
    if (root.SkiMp) {
      if (root.SkiMp.setTape) root.SkiMp.setTape(savedTape);
      root.SkiMp.onBegin();
    }
    paintHud();
    if (root.SkiMp) root.SkiMp.publish(true);
  }

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    if (camera) {
      camera.scale(dpr, dpr);
      camera.imageSmoothingEnabled = false;
    }
  }

  function bindKeys() {
    document.addEventListener('keydown', function (e) {
      var k = e.key || e.code;
      if (k === ' ' || k === 'Spacebar' || k === 'Space') {
        e.preventDefault();
        if (over) resetGame();
        return;
      }
      if (!player || over) return;
      if (k === 'f' || k === 'F') { player.speedBoost(); return; }
      if (k === 't' || k === 'T') { player.attemptTrick(); return; }
      if (k === 'w' || k === 'W' || k === 'ArrowUp' || k === 'Up') { player.stop(); return; }
      if (k === 's' || k === 'S' || k === 'ArrowDown' || k === 'Down') {
        player.setDirection(180);
        player.startMovingIfPossible();
        return;
      }
      if (k === 'a' || k === 'A' || k === 'ArrowLeft' || k === 'Left') {
        if (player.direction === 270) player.stepWest();
        else player.turnWest();
        return;
      }
      if (k === 'd' || k === 'D' || k === 'ArrowRight' || k === 'Right') {
        if (player.direction === 90) player.stepEast();
        else player.turnEast();
        return;
      }
    }, false);
  }

  function fadeHint() {
    hintTimer = setTimeout(function () {
      var el = $('hint');
      if (el) el.classList.add('gone');
    }, 5000);
  }

  function startGame() {
    player = new Ski.Skier(sprites().skier);
    player.setMapPosition(0, 0);
    player.setMapPositionTarget(0, -10);
    player.isMoving = false;
    player.setDirection(270);

    game = new Ski.Game(camera, player);

    startSign = new Ski.Sprite(sprites().signStart);
    startSign.setMapPosition(-50, 0);
    game.addStaticObject(startSign);
    seedSlope();

    game.beforeCycle(function () {
      game.addStaticObjects(spawnTerrain());
      if (!game.isPaused()) {
        randomlySpawn(spawnBoarder, 0.1);
        if (metres() > MONSTER_DISTANCE_THRESHOLD) randomlySpawn(spawnMonster, 0.001);
        recordTape();
        paintHud();
        if (root.SkiMp) root.SkiMp.publish(false);
      }
    });
    game.afterCycle(function () {
      if (lives <= 0) showOver();
    });

    var origDraw = game.draw.bind(game);
    game.draw = function () {
      origDraw();
      if (root.SkiMp) root.SkiMp.drawGhosts(camera);
    };

    player.isMoving = false;
    player.setDirection(270);
    var centre = camera.getCentralPosition().canvas;
    player.canvasX = centre[0];
    player.canvasY = centre[1];

    Ski.player = player;
    Ski.game = game;
    Ski.camera = camera;

    if (root.Touch) root.Touch.init(canvas, game, player);
    bindKeys();
    fadeHint();
    if (root.SkiMp) root.SkiMp.onBegin();
    game.start();
    paintHud();
    canvas.focus();
  }

  function waitImg(img) {
    return new Promise(function (resolve) {
      if (img && img.complete && img.naturalWidth) { resolve(); return; }
      if (!img) { resolve(); return; }
      img.onload = function () { resolve(); };
      img.onerror = function () { resolve(); };
    });
  }

  function boot() {
    if (!Ski.Game || !Ski.Skier || !Ski.sprites) {
      $('meters').textContent = 'Error';
      return;
    }
    camera = Ski.Camera.create(canvas.getContext('2d'));
    Ski.camera = camera;
    resize();
    window.addEventListener('resize', resize, false);

    var chars = $('img-characters');
    var objs = $('img-objects');
    Promise.all([waitImg(chars), waitImg(objs)]).then(function () {
      camera.storeLoadedImage('sprite-characters.png', chars);
      camera.storeLoadedImage('skifree-objects.png', objs);
      startGame();
    });
  }

  Ski.snap = function () {
    return {
      x: player ? player.mapPosition[0] : 0,
      y: player ? player.mapPosition[1] : 0,
      part: skierPart(),
      dist: metres(),
      lives: lives,
      over: over,
      jumping: !!(player && player.isJumping),
      hit: !!(player && player.hasBeenHit)
    };
  };
  Ski.resetGame = resetGame;
  Ski.isOver = function () { return over; };

  loadBest().then(boot, boot);
})(window);
