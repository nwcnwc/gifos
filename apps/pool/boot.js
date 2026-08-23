/*
 * Pool — GifOS shell around henshmi's Classic Pool Game.
 *
 * vendor/* is the unmodified upstream (physics, 8-ball rules, stick, AI).
 * Everything GifOS-specific lives here: HTML menu, Web Audio, touch pull-back
 * aim, and two-device turns over gifos.db.
 *
 * MULTIPLAYER. Invite is OS chrome — this app never draws a share button.
 * Host (the person who opened the app) is player 1 and simulates the balls.
 * The friend writes only their own shot (and, after a foul, where they put
 * the white). Nobody writes anybody else's row.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 20;
  var STALE_MS = 3500;
  var PULL_DEAD = 40;
  var PULL_SCALE = 6;
  var MIN_SHOT = 8;

  var COARSE = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
  var IS_TOUCH = (navigator.maxTouchPoints || 0) > 0 && COARSE;

  var api = root.gifos || null;
  var me = { id: 'local', name: 'You' };
  var owner = true;
  var others = {};
  var opponent = null;
  var hadOpponent = false;
  var acc = 0;
  var netReady = !api;
  var soundOn = true;
  var actx = null;
  var pulling = false;
  var placing = false;
  var loopGen = 0;
  var shotSeq = 0;
  var placeSeq = 0;
  var lastShotSeq = 0;
  var lastPlaceSeq = 0;
  var localLock = false;
  var pendingShot = null;
  var pendingPlace = null;
  var menuOn = true;

  var menu = document.getElementById('menu');
  var hint = document.getElementById('hint');
  var names0 = document.getElementById('name0');
  var names1 = document.getElementById('name1');
  var soundBtn = document.getElementById('soundBtn');
  var powerBar = document.getElementById('power');
  var powerFill = document.getElementById('powerFill');
  var diff = document.getElementById('diff');
  var menuStatus = document.getElementById('menuStatus');

  function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }
  function db(n) { return api && api.db ? api.db(n) : null; }
  function now() { return Date.now(); }
  function isMp() { return !!(opponent && (now() - opponent.seen) < STALE_MS); }
  function myTurn() {
    if (!Game.policy) return true;
    if (!isMp()) return !AI_ON || Game.policy.turn !== AI_PLAYER_NUM;
    if (!owner && !opponent) return false;
    return Game.policy.turn === (owner ? 0 : 1);
  }

  /* ------------------------------------------------------------------ */
  /* sounds — original loads wav/mp3 we do not ship; short Web Audio     */
  /* ------------------------------------------------------------------ */

  function resumeAudio() {
    try {
      if (!actx) {
        var AC = root.AudioContext || root.webkitAudioContext;
        if (AC) actx = new AC();
      }
      if (actx && actx.state === 'suspended') actx.resume();
    } catch (e) {}
  }

  function tone(freq, dur, type, vol) {
    if (!actx || !soundOn) return;
    try {
      var o = actx.createOscillator();
      var g = actx.createGain();
      o.type = type || 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.08, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
      o.connect(g); g.connect(actx.destination);
      o.start();
      o.stop(actx.currentTime + dur);
    } catch (e) {}
  }

  function playKind(kind, vol) {
    resumeAudio();
    vol = vol == null ? 1 : vol;
    if (kind === 'strike') tone(90, 0.12, 'sine', 0.12 * vol);
    else if (kind === 'collide') tone(420, 0.05, 'triangle', 0.07 * vol);
    else if (kind === 'hole') { tone(220, 0.18, 'sine', 0.1 * vol); setTimeout(function () { tone(140, 0.22, 'sine', 0.08 * vol); }, 80); }
    else if (kind === 'side') tone(180, 0.04, 'square', 0.04 * vol);
  }

  function pad(kind) {
    return {
      volume: 1,
      currentTime: 0,
      cloneNode: function () { return pad(kind); },
      play: function () { playKind(kind, this.volume); return Promise.resolve(); },
      pause: function () {}
    };
  }

  sounds.side = pad('side');
  sounds.ballsCollide = pad('collide');
  sounds.strike = pad('strike');
  sounds.hole = pad('hole');
  sounds.jazzTune = pad('silence');
  sounds.fadeOut = function () {};

  /* ------------------------------------------------------------------ */
  /* assets from the static <img> tags (runtime rewrites those srcs)     */
  /* ------------------------------------------------------------------ */

  Game.loadAssets = function () {
    var map = {
      background: 'spr-bg',
      ball: 'spr-ball',
      redBall: 'spr-red',
      yellowBall: 'spr-yellow',
      blackBall: 'spr-black',
      stick: 'spr-stick'
    };
    Game.spritesStillLoading = 0;
    Object.keys(map).forEach(function (key) {
      var img = document.getElementById(map[key]);
      sprites[key] = img;
      if (img && !img.complete) {
        Game.spritesStillLoading += 1;
        img.onload = function () { Game.spritesStillLoading -= 1; };
        img.onerror = function () { Game.spritesStillLoading -= 1; };
      }
    });
  };

  Game.initMenus = function () {};

  Game.assetLoadingLoop = function () {
    if (Game.spritesStillLoading > 0) requestAnimationFrame(Game.assetLoadingLoop);
    else {
      Game.initialize();
      showMenu();
    }
  };

  Game.handleInput = function () {
    if (Keyboard.down(Keys.escape)) goMenu();
  };

  GamePolicy.prototype.drawScores = function () {
    var label;
    if (isMp()) {
      label = this.turn === 0
        ? (owner ? (me.name || 'You') : ((opponent && opponent.name) || 'Host'))
        : (owner ? ((opponent && opponent.name) || 'Friend') : (me.name || 'You'));
    } else {
      label = 'PLAYER ' + (this.turn + 1);
    }
    Canvas2D.drawText(label, new Vector2(Game.size.x / 2 + 40, 200), new Vector2(150, 0), '#096834', 'top', 'Impact', '70px');
    this.players[0].totalScore.draw();
    this.players[1].totalScore.draw();
    this.players[0].matchScore.drawLines(this.players[0].color);
    this.players[1].matchScore.drawLines(this.players[1].color);
  };

  var origShoot = Stick.prototype.shoot;

  Stick.prototype.handleInput = function () {
    if (AI_ON && Game.policy.turn === AI_PLAYER_NUM) return;
    if (Game.policy.turnPlayed || localLock) return;
    if (isMp() && !myTurn()) return;
    if (Game.policy.foul) return;
    if (Game.gameWorld.ballsMoving()) return;

    if (Keyboard.down(Keys.W) && KEYBOARD_INPUT_ON) {
      if (this.power < 75) {
        this.origin.x += 2;
        this.power += 1.2;
      }
    }
    if (Keyboard.down(Keys.S) && KEYBOARD_INPUT_ON) {
      if (this.power > 0) {
        this.origin.x -= 2;
        this.power -= 1.2;
      }
    }

    if (pulling) {
      var ball = Game.gameWorld.whiteBall.position;
      var dx = ball.x - Mouse.position.x;
      var dy = ball.y - Mouse.position.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > PULL_DEAD) {
        this.rotation = Math.atan2(dy, dx);
        this.power = clamp((dist - PULL_DEAD) / PULL_SCALE, 0, 75);
        this.origin.x = 970 + this.power * (2 / 1.2);
      }
      return;
    }

    if (this.power > 0 && Mouse.left.pressed) {
      fire(this);
      return;
    }
    if (this.trackMouse) {
      var opposite = Mouse.position.y - this.position.y;
      var adjacent = Mouse.position.x - this.position.x;
      this.rotation = Math.atan2(opposite, adjacent);
    }
  };

  function fire(stick) {
    if (!stick || stick.power < MIN_SHOT) return;
    if (isMp() && !owner) {
      if (localLock) return;
      localLock = true;
      shotSeq += 1;
      pendingShot = { seq: shotSeq, power: stick.power, rotation: stick.rotation };
      stick.shooting = true;
      Game.policy.turnPlayed = true;
      stick.origin = stick.shotOrigin.copy();
      Game.gameWorld.whiteBall.moving = true;
      setTimeout(function () { stick.visible = false; }, 500);
      playKind('strike', clamp(stick.power / 10, 0, 1));
      publish(true);
      return;
    }
    origShoot.call(stick, stick.power, stick.rotation);
  }

  function canPlaceAt(pos) {
    if (Game.policy.isOutsideBorder(pos, Game.gameWorld.whiteBall.origin)) return false;
    if (Game.policy.isInsideHole(pos)) return false;
    var i, b, balls = Game.gameWorld.balls;
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (b === Game.gameWorld.whiteBall || b.inHole) continue;
      if (pos.distanceFrom(b.position) < BALL_SIZE) return false;
    }
    return true;
  }

  function finishPlace(pos) {
    if (!canPlaceAt(pos)) return false;
    if (isMp() && !owner) {
      placeSeq += 1;
      pendingPlace = { seq: placeSeq, x: pos.x, y: pos.y };
      Game.gameWorld.whiteBall.position = pos.copy();
      publish(true);
      return true;
    }
    KEYBOARD_INPUT_ON = true;
    Keyboard.reset();
    Mouse.reset();
    Game.gameWorld.whiteBall.position = pos.copy();
    Game.gameWorld.whiteBall.inHole = false;
    Game.gameWorld.whiteBall.visible = true;
    Game.policy.foul = false;
    Game.gameWorld.stick.position = Game.gameWorld.whiteBall.position;
    Game.gameWorld.stick.visible = true;
    return true;
  }

  GameWorld.prototype.ballInHand = function () {
    if (AI_ON && Game.policy.turn === AI_PLAYER_NUM) return;
    if (isMp() && !myTurn()) return;
    KEYBOARD_INPUT_ON = false;
    this.stick.visible = false;
    if (Mouse.left.down) {
      this.whiteBall.position = Mouse.position.copy();
      this.whiteBall.visible = true;
      placing = true;
    } else if (placing) {
      placing = false;
      finishPlace(Mouse.position.copy());
    } else if (!IS_TOUCH) {
      this.whiteBall.position = Mouse.position.copy();
      this.whiteBall.visible = true;
    }
  };

  GameWorld.prototype.whiteBallOverlapsBalls = function () {
    var ballsOverlap = false;
    for (var i = 0; i < this.balls.length; i++) {
      if (this.whiteBall !== this.balls[i] && !this.balls[i].inHole) {
        if (this.whiteBall.position.distanceFrom(this.balls[i].position) < BALL_SIZE) {
          ballsOverlap = true;
        }
      }
    }
    return ballsOverlap;
  };

  /* ------------------------------------------------------------------ */
  /* main loop — host simulates; guest paints the host snapshot          */
  /* ------------------------------------------------------------------ */

  function drawAimGuide() {
    var world = Game.gameWorld, stick, ctx, scale, ball, len;
    if (!world || !world.stick || !world.stick.visible) return;
    stick = world.stick;
    if (stick.power <= 0 || !myTurn()) return;
    ctx = Canvas2D._canvasContext;
    scale = Canvas2D.scale;
    ball = world.whiteBall;
    ctx.save();
    ctx.scale(scale.x, scale.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    if (ctx.setLineDash) ctx.setLineDash([10, 8]);
    len = 70 + stick.power * 3;
    ctx.beginPath();
    ctx.moveTo(ball.position.x, ball.position.y);
    ctx.lineTo(ball.position.x + Math.cos(stick.rotation) * len,
               ball.position.y + Math.sin(stick.rotation) * len);
    ctx.stroke();
    ctx.restore();
  }

  function setPowerUi() {
    var p = Game.gameWorld && Game.gameWorld.stick ? Game.gameWorld.stick.power : 0;
    if (p > 1 && myTurn() && !(Game.gameWorld && Game.gameWorld.ballsMoving())) {
      powerBar.classList.add('on');
      powerFill.style.width = clamp(p / 75, 0, 1) * 100 + '%';
    } else {
      powerBar.classList.remove('on');
    }
  }

  Game.mainLoop = function () {
    var gen = loopGen;
    function frame() {
      if (gen !== loopGen || GAME_STOPPED || menuOn) return;
      if (DISPLAY) {
        if (isMp() && !owner) guestTick();
        else {
          maybeApplyRemote();
          Game.gameWorld.handleInput(DELTA);
          Game.gameWorld.update(DELTA);
          Canvas2D.clear();
          Game.gameWorld.draw();
          drawAimGuide();
          Mouse.reset();
          Game.handleInput();
          publish(false);
        }
        setPowerUi();
        setHint();
        setNames();
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  Game.startNewGame = function () {
    Canvas2D._canvas.style.cursor = 'auto';
    loopGen += 1;
    GAME_STOPPED = false;
    menuOn = false;
    localLock = false;
    pendingShot = null;
    pendingPlace = null;
    Game.gameWorld = new GameWorld();
    Game.policy = new GamePolicy();
    AI.init(Game.gameWorld, Game.policy);
    if (AI_ON && AI_PLAYER_NUM === 0) AI.startSession();
    hideMenu();
    Game.mainLoop();
    publish(true);
  };

  function goMenu() {
    loopGen += 1;
    GAME_STOPPED = true;
    menuOn = true;
    AI_ON = false;
    showMenu();
  }

  /* ------------------------------------------------------------------ */
  /* guest: paint host balls, aim locally, never simulate a shot         */
  /* ------------------------------------------------------------------ */

  function applyHost(h) {
    if (!h || !Game.gameWorld) return;
    var balls = Game.gameWorld.balls, i, p;
    if (h.balls) {
      for (i = 0; i < h.balls.length && i < balls.length; i++) {
        p = h.balls[i];
        balls[i].position.x = p[0];
        balls[i].position.y = p[1];
        balls[i].visible = !!p[2];
        balls[i].inHole = !!p[3];
        balls[i].moving = !!p[4];
        balls[i].velocity = Vector2.zero;
      }
    }
    var pol = Game.policy;
    pol.turn = h.turn | 0;
    pol.foul = !!h.foul;
    pol.turnPlayed = !!h.tp;
    pol.won = !!h.won;
    pol.scored = !!h.scored;
    pol.firstCollision = h.fc !== 0;
    if (h.p0m != null) pol.players[0].matchScore.value = h.p0m;
    if (h.p1m != null) pol.players[1].matchScore.value = h.p1m;
    if (h.p0t != null) pol.players[0].totalScore.value = h.p0t;
    if (h.p1t != null) pol.players[1].totalScore.value = h.p1t;
    pol.players[0].color = h.p0c || undefined;
    pol.players[1].color = h.p1c || undefined;
    var aiming = myTurn() && !h.moving && !pol.turnPlayed;
    if (!aiming) {
      Game.gameWorld.stick.rotation = h.sr || 0;
      Game.gameWorld.stick.power = h.sp || 0;
      Game.gameWorld.stick.visible = h.sv !== 0;
      Game.gameWorld.stick.position.x = Game.gameWorld.whiteBall.position.x;
      Game.gameWorld.stick.position.y = Game.gameWorld.whiteBall.position.y;
      if (!h.moving) localLock = false;
    } else {
      Game.gameWorld.stick.position.x = Game.gameWorld.whiteBall.position.x;
      Game.gameWorld.stick.position.y = Game.gameWorld.whiteBall.position.y;
      if (!Game.policy.foul) Game.gameWorld.stick.visible = true;
    }
  }

  function guestTick() {
    if (opponent) applyHost(opponent);
    if (myTurn() && Game.policy && !Game.policy.turnPlayed && !(opponent && opponent.moving)) {
      Game.gameWorld.handleInput(DELTA);
      if (Game.policy.foul) Game.gameWorld.ballInHand();
    }
    Canvas2D.clear();
    Game.gameWorld.draw();
    drawAimGuide();
    Mouse.reset();
    Game.handleInput();
    publish(false);
  }

  function maybeApplyRemote() {
    if (!isMp() || !owner || !opponent || !Game.gameWorld) return;
    if (Game.gameWorld.ballsMoving()) return;
    if (Game.policy.turn !== 1) return;
    if (Game.policy.foul && opponent.place && opponent.place.seq !== lastPlaceSeq) {
      var pos = new Vector2(opponent.place.x, opponent.place.y);
      if (finishPlace(pos)) lastPlaceSeq = opponent.place.seq;
    }
    if (!Game.policy.foul && opponent.shot && opponent.shot.seq !== lastShotSeq && !Game.policy.turnPlayed) {
      lastShotSeq = opponent.shot.seq;
      origShoot.call(Game.gameWorld.stick, opponent.shot.power, opponent.shot.rotation);
    }
  }

  /* ------------------------------------------------------------------ */
  /* net — each player owns exactly one row                              */
  /* ------------------------------------------------------------------ */

  function packBalls() {
    var balls = Game.gameWorld.balls, out = [], i, b;
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      out.push([
        Math.round(b.position.x),
        Math.round(b.position.y),
        b.visible ? 1 : 0,
        b.inHole ? 1 : 0,
        b.moving ? 1 : 0
      ]);
    }
    return out;
  }

  function ingest(list) {
    var t = now(), seen = {}, i, p;
    opponent = null;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (!p || !p.id || p.id === me.id) continue;
      seen[p.id] = 1;
      var cur = others[p.id];
      var moved = !cur || cur.stamp !== p.at || cur.host !== p.host;
      others[p.id] = {
        id: p.id,
        name: p.name || 'Friend',
        stamp: p.at,
        seen: moved ? t : cur.seen,
        host: p.host,
        balls: p.balls,
        turn: p.turn, foul: p.foul, tp: p.tp, won: p.won, scored: p.scored, fc: p.fc,
        p0m: p.p0m, p1m: p.p1m, p0t: p.p0t, p1t: p.p1t, p0c: p.p0c, p1c: p.p1c,
        sr: p.sr, sp: p.sp, sv: p.sv, moving: p.moving,
        shot: p.shot, place: p.place
      };
    }
    for (var id in others) if (!seen[id] || t - others[id].seen > STALE_MS) delete others[id];

    var ids = Object.keys(others).sort();
    if (!owner) {
      for (i = 0; i < ids.length; i++) {
        if (others[ids[i]].host) { opponent = others[ids[i]]; break; }
      }
      if (!opponent && ids.length) opponent = others[ids[0]];
    } else if (ids.length) {
      opponent = others[ids[0]];
    }
    maybeSwitchMode();
  }

  function maybeSwitchMode() {
    var want = isMp();
    if (want && !hadOpponent) {
      hadOpponent = true;
      AI_ON = false;
      lastShotSeq = 0;
      lastPlaceSeq = 0;
      shotSeq = 0;
      placeSeq = 0;
      pendingShot = null;
      pendingPlace = null;
      Game.startNewGame();
      menuStatus.textContent = '';
    } else if (!want && hadOpponent) {
      hadOpponent = false;
      goMenu();
      menuStatus.textContent = 'Friend left.';
    }
    setNames();
    setHint();
  }

  function publish(force) {
    var players = db('players');
    if (!netReady || !players || !me.id || me.id === 'local') return;
    if (!Game.gameWorld) return;
    if (!force) {
      acc += DELTA;
      if (acc < 1 / PUBLISH_HZ) return;
    }
    acc = 0;
    var rec = {
      id: me.id,
      name: me.name,
      at: now()
    };
    if (pendingShot) rec.shot = pendingShot;
    if (pendingPlace) rec.place = pendingPlace;
    if (owner) {
      var pol = Game.policy;
      var stick = Game.gameWorld.stick;
      rec.host = 1;
      rec.balls = packBalls();
      rec.turn = pol.turn;
      rec.foul = pol.foul ? 1 : 0;
      rec.tp = pol.turnPlayed ? 1 : 0;
      rec.won = pol.won ? 1 : 0;
      rec.scored = pol.scored ? 1 : 0;
      rec.fc = pol.firstCollision ? 1 : 0;
      rec.p0m = pol.players[0].matchScore.value;
      rec.p1m = pol.players[1].matchScore.value;
      rec.p0t = pol.players[0].totalScore.value;
      rec.p1t = pol.players[1].totalScore.value;
      rec.p0c = pol.players[0].color || '';
      rec.p1c = pol.players[1].color || '';
      rec.sr = Math.round(stick.rotation * 1000) / 1000;
      rec.sp = Math.round(stick.power * 10) / 10;
      rec.sv = stick.visible ? 1 : 0;
      rec.moving = Game.gameWorld.ballsMoving() ? 1 : 0;
    }
    players.put(rec).catch(function () {});
  }

  function bootNet() {
    if (!api || !api.db) return;
    var ready = [];
    if (api.me) ready.push(api.me().then(function (m) {
      me.id = (m && m.id) || 'local';
      me.name = (m && m.name) || 'You';
    }).catch(function () {}));
    if (api.info) ready.push(api.info().then(function (i) {
      owner = !!(i && i.owner);
    }).catch(function () {}));
    Promise.all(ready).then(function () {
      netReady = true;
      db('players').subscribe(function (list) { ingest(list || []); });
      setNames();
      heartbeat();
      setInterval(heartbeat, 1000);
    });
  }

  function heartbeat() {
    var players = db('players');
    if (!netReady || !players || !me.id || me.id === 'local') return;
    if (!menuOn && Game.gameWorld) return;
    var rec = { id: me.id, name: me.name, at: now() };
    if (owner) rec.host = 1;
    players.put(rec).catch(function () {});
  }

  /* ------------------------------------------------------------------ */
  /* pointer — pull back to aim; drag the white after a foul             */
  /* ------------------------------------------------------------------ */

  function pointerToGame(ev) {
    var c = Canvas2D._canvas;
    if (!c) return;
    var r = c.getBoundingClientRect();
    var x = (ev.clientX - r.left) / r.width * Game.size.x;
    var y = (ev.clientY - r.top) / r.height * Game.size.y;
    Mouse._position = new Vector2(x, y);
  }

  function bindPointer() {
    var canvas = Canvas2D._canvas;
    document.onmousemove = null;
    document.onmousedown = null;
    document.onmouseup = null;
    canvas.addEventListener('pointerdown', function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest('#menu, #soundBtn')) return;
      resumeAudio();
      pointerToGame(ev);
      Mouse._left.down = true;
      Mouse._left.pressed = true;
      pulling = !!(Game.gameWorld && Game.policy && !Game.policy.foul && myTurn() &&
                   !Game.gameWorld.ballsMoving() && !menuOn);
      placing = !!(Game.gameWorld && Game.policy && Game.policy.foul && myTurn() && !menuOn);
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
      ev.preventDefault();
    }, { passive: false });
    canvas.addEventListener('pointermove', function (ev) {
      pointerToGame(ev);
      if (ev.buttons) ev.preventDefault();
    }, { passive: false });
    function endPtr(ev) {
      pointerToGame(ev);
      if (pulling && Game.gameWorld && Game.gameWorld.stick.power >= MIN_SHOT) fire(Game.gameWorld.stick);
      pulling = false;
      Mouse._left.down = false;
      Mouse.reset();
    }
    canvas.addEventListener('pointerup', endPtr);
    canvas.addEventListener('pointercancel', endPtr);
  }

  document.addEventListener('keydown', function (e) {
    resumeAudio();
    if (e.key === 'w' || e.key === 'W' || e.key === 's' || e.key === 'S' || e.key === 'Escape') {
      e.preventDefault();
    }
  });

  /* ------------------------------------------------------------------ */
  /* chrome                                                              */
  /* ------------------------------------------------------------------ */

  function colorWord(c) {
    if (c === Color.red) return 'red';
    if (c === Color.yellow) return 'yellow';
    return '';
  }

  function setNames() {
    var n0, n1;
    if (isMp()) {
      n0 = owner ? (me.name || 'You') : ((opponent && opponent.name) || 'Host');
      n1 = owner ? ((opponent && opponent.name) || 'Friend') : (me.name || 'You');
    } else {
      n0 = me.name || 'You';
      n1 = AI_ON ? 'Computer' : 'Player 2';
    }
    names0.textContent = n0;
    names1.textContent = n1;
  }

  function setHint() {
    if (!Game.gameWorld || menuOn) return;
    if (isMp() && !myTurn()) {
      hint.textContent = Game.gameWorld.ballsMoving() ? 'Balls moving…' : 'Their turn';
      return;
    }
    if (Game.policy && Game.policy.foul && myTurn()) {
      hint.textContent = IS_TOUCH ? 'Drag the white ball, then let go' : 'Move the white ball, then click to place';
      return;
    }
    if (Game.gameWorld.ballsMoving()) {
      hint.textContent = 'Balls moving…';
      return;
    }
    var col = Game.policy && Game.policy.players[Game.policy.turn] && colorWord(Game.policy.players[Game.policy.turn].color);
    var who = col ? ('You are ' + col + '. ') : '';
    hint.textContent = who + (IS_TOUCH ? 'Pull back to aim · let go to shoot' : 'Aim with the mouse · W/S power · click to shoot');
  }

  function showMenu() {
    menu.hidden = false;
    menuOn = true;
    GAME_STOPPED = true;
    document.getElementById('hud').hidden = true;
  }
  function hideMenu() {
    menu.hidden = true;
    menuOn = false;
    document.getElementById('hud').hidden = false;
  }

  document.getElementById('btnCpu').addEventListener('click', function () {
    diff.hidden = !diff.hidden;
  });
  diff.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    AI_ON = true;
    AI_PLAYER_NUM = 1;
    TRAIN_ITER = parseInt(b.getAttribute('data-iter'), 10) || 50;
    Game.startNewGame();
  });
  document.getElementById('btnHot').addEventListener('click', function () {
    AI_ON = false;
    Game.startNewGame();
  });

  function setSound(on) {
    soundOn = !!on;
    SOUND_ON = soundOn;
    Game.sound = soundOn;
    soundBtn.classList.toggle('off', !soundOn);
    soundBtn.textContent = soundOn ? '♪' : '×';
    var prefs = db('prefs');
    if (prefs) prefs.put({ id: 'sound', on: soundOn }).catch(function () {});
  }
  soundBtn.addEventListener('click', function (ev) {
    ev.stopPropagation();
    resumeAudio();
    setSound(!soundOn);
  });

  var prefs = db('prefs');
  if (prefs && prefs.get) {
    Promise.resolve(prefs.get('sound')).then(function (r) {
      if (r && r.on === false) setSound(false);
    }).catch(function () {});
  }

  if (api && api.onBack) {
    api.onBack(function () { goMenu(); });
  }

  Game.sound = true;
  SOUND_ON = true;
  AI_ON = false;
  GAME_STOPPED = true;

  Game.start('gameArea', 'screen', 1500, 825);
  bindPointer();
  setNames();
  bootNet();
})(window);
