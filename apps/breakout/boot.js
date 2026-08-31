/*
 * Breakout — GifOS shell around Jake Gordon's canvas Breakout.
 *
 * vendor/game.js, vendor/breakout.js and vendor/levels.js are the unmodified
 * upstream. Everything GifOS-specific lives here: no paving.jpg, Web Audio
 * instead of soundmanager MP3s, a paddle you can drag, a high score in
 * gifos.db, and a second paddle when someone opens the invite.
 *
 * Invite is OS chrome — this file never draws an Invite button.
 */
(function (root) {
  'use strict';

  var KEY = Game.KEY;
  var mem = { sound: 'true', highscore: '1000', level: '0' };
  var game = null;
  var paddle2 = null;
  var mpLive = false;
  var roomy = false;
  var actx = null;
  var lastDx = 0;
  var lastHits = 0;
  var lastLives = 3;

  var leftName = document.getElementById('leftName');
  var rightName = document.getElementById('rightName');
  var hint = document.getElementById('hint');
  var soundBtn = document.getElementById('soundBtn');
  var bestEl = document.getElementById('best');

  function db(n) { return root.gifos && root.gifos.db ? root.gifos.db(n) : null; }

  function localPaddle() {
    if (roomy && root.Net && !root.Net.owner() && !mpLive) return null;
    if (mpLive && root.Net && !root.Net.owner() && paddle2) return paddle2;
    return game ? game.paddle : null;
  }

  function resumeAudio() {
    try {
      if (!actx) {
        var AC = root.AudioContext || root.webkitAudioContext;
        if (AC) actx = new AC();
      }
      if (actx && actx.state === 'suspended') actx.resume();
    } catch (e) {}
  }

  function beep(freq, dur, vol, type) {
    if (!actx || !game || !game.sound) return;
    try {
      var o = actx.createOscillator();
      var g = actx.createGain();
      o.type = type || 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.07, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
      o.connect(g); g.connect(actx.destination);
      o.start();
      o.stop(actx.currentTime + dur);
    } catch (e) {}
  }

  function playSfx(id) {
    resumeAudio();
    if (id === 'brick') beep(920, 0.05, 0.08);
    else if (id === 'paddle') beep(220, 0.07, 0.08);
    else if (id === 'levelup') {
      beep(523, 0.08, 0.08);
      setTimeout(function () { beep(659, 0.08, 0.08); }, 90);
      setTimeout(function () { beep(784, 0.16, 0.09); }, 180);
    } else if (id === 'loselife') {
      beep(330, 0.1, 0.09);
      setTimeout(function () { beep(220, 0.16, 0.08); }, 110);
    } else if (id === 'gameover') {
      beep(330, 0.12, 0.09);
      setTimeout(function () { beep(247, 0.16, 0.08); }, 140);
      setTimeout(function () { beep(165, 0.28, 0.07); }, 300);
    }
  }

  function loadPrefs() {
    var prefs = db('prefs');
    if (!prefs) return Promise.resolve();
    return prefs.get('prefs').then(function (row) {
      if (!row) return;
      if (row.high != null) mem.highscore = String(row.high | 0);
      if (row.sound === false) mem.sound = 'false';
      if (row.level != null) mem.level = String(row.level | 0);
    }).catch(function () {});
  }

  function savePrefs() {
    var prefs = db('prefs');
    if (!prefs) return;
    prefs.put({
      id: 'prefs',
      high: parseInt(mem.highscore, 10) || 0,
      sound: mem.sound !== 'false',
      level: parseInt(mem.level, 10) || 0
    }).catch(function () {});
  }

  function setSoundBtn() {
    var on = game ? !!game.sound : mem.sound !== 'false';
    soundBtn.classList.toggle('off', !on);
    soundBtn.textContent = on ? '♪' : '×';
    var box = document.getElementById('sound');
    if (box) box.checked = on;
  }

  function setBest() {
    var n = parseInt(mem.highscore, 10) || 0;
    bestEl.textContent = n > 1000 ? ('best ' + n) : '';
  }

  function setNames() {
    var net = root.Net;
    var me = net && net.me ? net.me() : { name: 'You' };
    var opp = net && net.opponent ? net.opponent() : null;
    if (roomy && opp) {
      if (net.owner()) {
        leftName.textContent = me.name || 'You';
        rightName.textContent = opp.name || 'Friend';
      } else {
        leftName.textContent = opp.name || 'Host';
        rightName.textContent = me.name || 'You';
      }
    } else {
      leftName.textContent = me.name || 'You';
      rightName.textContent = '';
    }
  }

  function setHint() {
    if (!game) return;
    var touch = document.body.classList.contains('touch');
    if (roomy) {
      hint.textContent = !mpLive
        ? 'Watching · two paddles on this wall'
        : (root.Net.owner()
          ? 'You are orange · drag your paddle'
          : 'You are cyan · drag your paddle');
    } else if (game.is('game')) {
      hint.textContent = touch ? 'Drag to move · keep the ball up' : '← → move  ·  Esc menu';
    } else {
      hint.textContent = touch ? 'Tap to play · drag your paddle' : 'Space to play  ·  ← → paddle  ·  ↑ ↓ level';
    }
  }

  function paintPaddle2(ctx) {
    var p = Object.construct(Breakout.Paddle, game, game.cfg.paddle);
    p.render = function (c) {
      var gradient = c.createLinearGradient(0, this.h, 0, 0);
      gradient.addColorStop(0.36, 'rgb(37,160,245)');
      gradient.addColorStop(0.68, 'rgb(63,196,255)');
      gradient.addColorStop(0.84, 'rgb(95,214,255)');
      var r = this.h / 2;
      c.fillStyle = gradient;
      c.strokeStyle = this.game.color.border;
      c.beginPath();
      c.moveTo(r, 0);
      c.lineTo(this.w - r, 0);
      c.arcTo(this.w, 0, this.w, r, r);
      c.lineTo(this.w, this.h - r);
      c.arcTo(this.w, this.h, this.w - r, this.h, r);
      c.lineTo(r, this.h);
      c.arcTo(0, this.h, 0, this.h - r, r);
      c.lineTo(0, r);
      c.arcTo(0, 0, r, 0, r);
      c.fill();
      c.stroke();
      c.closePath();
    };
    return p;
  }

  function ensurePaddle2() {
    if (paddle2) return paddle2;
    paddle2 = paintPaddle2();
    paddle2.reset();
    var host = game.paddle;
    var x = host.x + host.w + 10;
    if (x > paddle2.maxX) x = Math.max(paddle2.minX, host.x - host.w - 10);
    paddle2.place(x);
    return paddle2;
  }

  function syncHitTargets() {
    if (!game || !game.ball) return;
    var t = game.ball.hitTargets;
    if (!t) return;
    if (roomy && root.Net && root.Net.owner()) {
      ensurePaddle2();
      if (t.indexOf(paddle2) < 0) t.push(paddle2);
    } else if (paddle2) {
      var i = t.indexOf(paddle2);
      if (i >= 0) t.splice(i, 1);
    }
  }

  function applyRemotePaddle() {
    if (!roomy || !game || !root.Net) return;
    var others = root.Net.others();
    var hostP = null, guestP = null;
    for (var id in others) {
      var o = others[id];
      if (o.host) hostP = o;
      else if (!guestP) guestP = o;
    }
    if (!guestP && !hostP) {
      var opp = root.Net.opponent();
      if (root.Net.owner()) guestP = opp;
      else hostP = opp;
    }
    if (root.Net.owner()) {
      if (paddle2 && guestP && guestP.x != null) { paddle2.setdir(0); paddle2.place(guestP.x); }
    } else if (mpLive) {
      if (hostP && hostP.x != null) { game.paddle.setdir(0); game.paddle.place(hostP.x); }
    } else {
      ensurePaddle2();
      if (hostP && hostP.x != null) { game.paddle.setdir(0); game.paddle.place(hostP.x); }
      if (paddle2 && guestP && guestP.x != null) { paddle2.setdir(0); paddle2.place(guestP.x); }
    }
  }

  function guestSounds() {
    if (!game || !game.ball) return;
    if (game.ball.dx && lastDx && game.ball.dx * lastDx < 0) playSfx('paddle');
    lastDx = game.ball.dx;
    var hits = game.court ? game.court.numhits : 0;
    if (hits > lastHits) playSfx('brick');
    lastHits = hits;
    var lives = game.score ? game.score.lives : 0;
    if (lives < lastLives) playSfx(lives === 0 ? 'gameover' : 'loselife');
    lastLives = lives;
  }

  function kickoff() {
    resumeAudio();
    if (!game) return;
    if (roomy && root.Net && !root.Net.owner()) {
      root.Net.askPlay();
      return;
    }
    if (game.is('menu')) {
      try { game.play(); } catch (e) {}
    } else if (game.ball && !game.ball.moving) {
      game.ball.launchNow();
    }
  }

  function setPlayingClass() {
    document.body.classList.toggle('playing', !!(game && game.is && game.is('game')));
  }

  function onRoster() {
    roomy = !!(root.Net && root.Net.live());
    var seated = !!(roomy && (root.Net.owner() || (root.Net.seated && root.Net.seated())));
    if (roomy) ensurePaddle2();
    if (seated && !mpLive) {
      mpLive = true;
      syncHitTargets();
    } else if (!seated && mpLive) {
      mpLive = false;
      syncHitTargets();
    }
    setNames();
    setHint();
    setPlayingClass();
  }

  function boot() {
    Game.loadSounds = function () {};
    Game.loadScript = function () {};
    Game.Runner.storage = function () { return this.localStorage = mem; };
    Game.ua.hasTouch = !!root.Touch.phoneish();

    Breakout.playSound = function (id) { if (this.sound) playSfx(id); };
    Breakout.onbeforeabandon = function () { return true; };

    var court = document.getElementById('court');
    var canvas = document.getElementById('canvas');
    var w = Math.max(320, court.clientWidth || canvas.offsetWidth || 640);
    var h = Math.max(240, court.clientHeight || canvas.offsetHeight || 480);

    game = Game.start('canvas', Breakout, { sound: mem.sound === 'true', stats: false, width: w, height: h });
    if (!game) return;

    game.sound = mem.sound === 'true';
    setSoundBtn();
    setBest();

    var origSave = game.score.save;
    game.score.save = function () {
      origSave.call(this);
      mem.highscore = String(this.highscore);
      savePrefs();
      setBest();
    };

    game.toggleSound = function () {
      this.sound = !this.sound;
      mem.sound = this.sound ? 'true' : 'false';
      savePrefs();
      setSoundBtn();
    };

    var origSetLevel = game.setLevel;
    game.setLevel = function (level) {
      origSetLevel.call(this, level);
      mem.level = String(this.level);
      savePrefs();
    };

    var origBallReset = game.ball.reset;
    game.ball.reset = function (options) {
      origBallReset.call(this, options);
      syncHitTargets();
    };

    var origUpdate = game.update;
    game.update = function (dt) {
      if (roomy && root.Net && !root.Net.owner()) {
        if (mpLive && paddle2) paddle2.update(dt);
        applyRemotePaddle();
        guestSounds();
        if (this.score) this.score.update(dt);
      } else {
        applyRemotePaddle();
        origUpdate.call(this, dt);
      }
      setPlayingClass();
      if (root.Net) root.Net.tick();
    };

    var origDraw = game.draw;
    game.draw = function (ctx) {
      origDraw.call(this, ctx);
      if (roomy && paddle2) {
        paddle2.draw(ctx);
        ctx.save();
        ctx.font = '11px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        var opp = root.Net && root.Net.opponent();
        var me = root.Net && root.Net.me();
        if (root.Net && root.Net.owner()) {
          ctx.fillStyle = '#c85018';
          ctx.fillText((me && me.name) || 'You', this.paddle.x + this.paddle.w / 2, this.paddle.y - 4);
          ctx.fillStyle = '#1a88c8';
          ctx.fillText((opp && opp.name) || 'Friend', paddle2.x + paddle2.w / 2, paddle2.y - 4);
        } else {
          ctx.fillStyle = '#c85018';
          ctx.fillText((opp && opp.name) || 'Host', this.paddle.x + this.paddle.w / 2, this.paddle.y - 4);
          ctx.fillStyle = '#1a88c8';
          ctx.fillText((me && me.name) || 'You', paddle2.x + paddle2.w / 2, paddle2.y - 4);
        }
        ctx.restore();
      }
    };

    game.onkeydown = function (code) {
      resumeAudio();
      var paddle = localPaddle();
      if (this.is('menu')) {
        if (code === KEY.SPACE || code === KEY.RETURN || code === KEY.ONE) { kickoff(); return; }
        if (code === KEY.UP) { this.nextLevel(); return; }
        if (code === KEY.DOWN) { this.prevLevel(); return; }
      }
      if (this.is('game')) {
        if (code === KEY.ESC) { this.abandon(); setHint(); return; }
        if (code === KEY.SPACE || code === KEY.RETURN) { this.ball.launchNow(); return; }
      }
      if (!paddle) return;
      if (code === KEY.LEFT || code === KEY.A) paddle.moveLeft();
      else if (code === KEY.RIGHT || code === KEY.D) paddle.moveRight();
    };
    game.onkeyup = function (code) {
      var paddle = localPaddle();
      if (!paddle) return;
      if (code === KEY.LEFT || code === KEY.A) paddle.stopMovingLeft();
      else if (code === KEY.RIGHT || code === KEY.D) paddle.stopMovingRight();
    };

    game.runner.confirm = function () { return true; };

    game.onbeforeplay = function () {
      if (mpLive && root.Net && !root.Net.owner()) {
        root.Net.askPlay();
        return false;
      }
    };

    var origOnresize = game.onresize;
    game.onresize = function (width, height) {
      origOnresize.call(this, width, height);
      if (paddle2) {
        paddle2.reset();
        syncHitTargets();
      }
    };

    soundBtn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      game.toggleSound();
    });
    hint.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      kickoff();
    });

    root.Touch.init({
      canvas: canvas,
      court: court,
      getPaddle: localPaddle,
      onTap: kickoff
    });

    root.BreakoutApp = {
      game: game,
      localPaddle: localPaddle,
      paddle2: function () { return paddle2; }
    };

    var origRefresh = game.refreshDOM;
    game.refreshDOM = function () {
      origRefresh.call(this);
      setHint();
      setPlayingClass();
    };

    if (root.Net) {
      root.Net.attach(game);
      root.Net.onRoster(onRoster);
      root.Net.init().then(function () {
        onRoster();
        setNames();
        setHint();
      }).catch(function () {
        setNames();
        setHint();
      });
    } else {
      setNames();
      setHint();
    }

    requestAnimationFrame(function () {
      if (game && game.runner && game.runner.resize) game.runner.resize();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      loadPrefs().then(boot);
    });
  } else {
    loadPrefs().then(boot);
  }
})(window);
