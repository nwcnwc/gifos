/*
 * Pong — GifOS shell around Jake Gordon's canvas Pong.
 *
 * vendor/game.js and vendor/pong.js are the unmodified upstream. Everything
 * GifOS-specific lives here: no PNG menu, Web Audio instead of wav files,
 * touch, and two-device play over gifos.db.
 *
 * MULTIPLAYER. Invite is OS chrome — this app never draws a share button.
 * Left paddle is the host (the person who opened the app). Right paddle is
 * the friend who opened the invite. Each player writes ONLY their own row:
 * paddle y, and (host only) the ball and the score. The host simulates the
 * ball; the guest sends a paddle and otherwise paints what the host published.
 */
(function (root) {
  'use strict';

  var PUBLISH_HZ = 20;
  var STALE_MS = 2500;
  var KEY = Game.KEY;
  var W = 87, S = 83; // WASD extras (Game.KEY has no W/S)

  var COARSE = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
  var IS_TOUCH = (navigator.maxTouchPoints || 0) > 0 && COARSE;

  var api = root.gifos || null;
  var me = { id: 'local', name: 'You' };
  var owner = true;
  var others = {};
  var opponent = null;
  var hadOpponent = false;
  var acc = 0;
  var pong = null;
  var actx = null;
  var soundOn = true;
  var dragging = false;
  var netReady = !api; // outside GifOS we are solo; inside, wait for me()+info()

  var court = document.getElementById('court');
  var canvas = document.getElementById('game');
  var leftName = document.getElementById('leftName');
  var rightName = document.getElementById('rightName');
  var hint = document.getElementById('hint');
  var soundBtn = document.getElementById('soundBtn');
  var pads = document.getElementById('pads');
  var padL = document.getElementById('padL');
  var padR = document.getElementById('padR');

  function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }
  function db(n) { return api && api.db ? api.db(n) : null; }
  function now() { return Date.now(); }
  function isMp() { return !!(opponent && (now() - opponent.seen) < STALE_MS); }
  function myPaddle() { return (!isMp() || owner) ? pong.leftPaddle : pong.rightPaddle; }

  /* ------------------------------------------------------------------ */
  /* sounds — original loads wav files we do not ship; square-wave beeps */
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

  function beep(freq, dur) {
    if (!actx || !soundOn) return;
    try {
      var o = actx.createOscillator();
      var g = actx.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.07, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
      o.connect(g); g.connect(actx.destination);
      o.start();
      o.stop(actx.currentTime + dur);
    } catch (e) {}
  }

  Pong.Sounds.initialize = function (g) { this.game = g; };
  Pong.Sounds.play = function (name) {
    if (!this.game.cfg.sound) return;
    resumeAudio();
    if (name === 'ping') beep(880, 0.07);
    else if (name === 'pong') beep(440, 0.07);
    else if (name === 'wall') beep(220, 0.05);
    else if (name === 'goal') { beep(330, 0.1); setTimeout(function () { beep(196, 0.16); }, 90); }
  };
  Pong.Sounds.ping = function () { this.play('ping'); };
  Pong.Sounds.pong = function () { this.play('pong'); };
  Pong.Sounds.wall = function () { this.play('wall'); };
  Pong.Sounds.goal = function () { this.play('goal'); };

  /* ------------------------------------------------------------------ */
  /* menu — original draws press1.png / press2.png / winner.png          */
  /* ------------------------------------------------------------------ */

  Pong.Images = [];
  Pong.Menu.initialize = function (g) { this.pong = g; this.winner = null; };
  Pong.Menu.declareWinner = function (playerNo) { this.winner = playerNo; };
  Pong.Menu.draw = function (ctx) {
    var g = this.pong;
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (this.winner === 0 || this.winner === 1) {
      ctx.font = 'bold 36px monospace';
      ctx.fillText('WINNER', this.winner === 0 ? g.width * 0.25 : g.width * 0.75, g.height * 0.48);
    } else {
      ctx.font = 'bold 28px monospace';
      ctx.fillText(IS_TOUCH ? 'TAP TO PLAY' : 'PRESS 1  OR  TAP', g.width / 2, g.height * 0.48);
      ctx.font = '16px monospace';
      ctx.fillStyle = '#888';
      ctx.fillText(isMp() ? 'Friend is on the other paddle' : 'Q/A left  ·  P/L right  ·  first to 9', g.width / 2, g.height * 0.48 + 36);
    }
    ctx.restore();
  };

  /* ------------------------------------------------------------------ */
  /* start the original game                                             */
  /* ------------------------------------------------------------------ */

  pong = Game.start('game', Pong, {
    sound: true,
    stats: false,
    footprints: false,
    predictions: false
  });
  if (!pong) return;

  var origUpdate = pong.update;

  pong.update = function (dt) {
    if (isMp() && !owner) guestUpdate(this, dt);
    else {
      if (isMp() && owner && opponent) {
        this.rightPaddle.setAuto(false);
        this.rightPaddle.setdir(0);
        this.rightPaddle.setpos(this.rightPaddle.x, clamp(opponent.y, this.rightPaddle.minY, this.rightPaddle.maxY));
      }
      origUpdate.call(this, dt);
    }
    publish(this, dt);
  };

  pong.onkeydown = function (code) {
    resumeAudio();
    if (!this.playing) {
      if (code === KEY.ONE || code === KEY.SPACE || code === KEY.RETURN) {
        startPlay();
        return;
      }
      if (owner && !isMp() && code === KEY.TWO) { this.startDoublePlayer(); setHint(); return; }
      if (owner && !isMp() && code === KEY.ZERO) { this.startDemo(); setHint(); return; }
    }
    if (code === KEY.ESC) { this.stop(true); setHint(); return; }
    steer(this, code, true);
  };

  pong.onkeyup = function (code) {
    steer(this, code, false);
  };

  function steer(g, code, down) {
    var left = !isMp() || owner;
    var fn;
    if (left) {
      if (!g.leftPaddle.auto) {
        if (code === KEY.Q || code === KEY.UP || code === W) fn = down ? 'moveUp' : 'stopMovingUp';
        else if (code === KEY.A || code === KEY.DOWN || code === S) fn = down ? 'moveDown' : 'stopMovingDown';
        if (fn) g.leftPaddle[fn]();
      }
      if (!isMp() && !g.rightPaddle.auto) {
        if (down) {
          if (code === KEY.P) g.rightPaddle.moveUp();
          else if (code === KEY.L) g.rightPaddle.moveDown();
        } else {
          if (code === KEY.P) g.rightPaddle.stopMovingUp();
          else if (code === KEY.L) g.rightPaddle.stopMovingDown();
        }
      }
    } else if (!g.rightPaddle.auto) {
      if (code === KEY.P || code === KEY.Q || code === KEY.UP || code === W) fn = down ? 'moveUp' : 'stopMovingUp';
      else if (code === KEY.L || code === KEY.A || code === KEY.DOWN || code === S) fn = down ? 'moveDown' : 'stopMovingDown';
      if (fn) g.rightPaddle[fn]();
    }
  }

  function startPlay() {
    if (pong.playing) return;
    if (isMp()) pong.startDoublePlayer();
    else pong.startSinglePlayer();
    pong.menu.winner = null;
    setHint();
  }

  /* ------------------------------------------------------------------ */
  /* guest: paint host ball, move own paddle, never simulate a goal      */
  /* ------------------------------------------------------------------ */

  function guestUpdate(g, dt) {
    g.rightPaddle.update(dt, g.ball);
    if (!opponent) return;
    g.leftPaddle.setAuto(false);
    g.leftPaddle.setdir(0);
    g.leftPaddle.setpos(g.leftPaddle.x, clamp(opponent.y, g.leftPaddle.minY, g.leftPaddle.maxY));
    if (opponent.bx != null) {
      var age = Math.max(0, Math.min(0.12, (now() - opponent.seen) / 1000));
      g.ball.setpos(opponent.bx + (opponent.bdx || 0) * age,
                    opponent.by + (opponent.bdy || 0) * age);
      g.ball.setdir(opponent.bdx || 0, opponent.bdy || 0);
    }
    if (opponent.sl != null) g.scores[0] = opponent.sl;
    if (opponent.sr != null) g.scores[1] = opponent.sr;
    if (opponent.playing) {
      if (!g.playing) {
        g.playing = true;
        g.menu.winner = null;
        g.runner.hideCursor();
      }
    } else if (g.playing) {
      if (opponent.win === 0 || opponent.win === 1) g.menu.declareWinner(opponent.win);
      g.playing = false;
      g.runner.showCursor();
    }
  }

  /* ------------------------------------------------------------------ */
  /* net — each player owns exactly one row                              */
  /* ------------------------------------------------------------------ */

  function ingest(list) {
    var t = now(), seen = {};
    opponent = null;
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || !p.id || p.id === me.id) continue;
      seen[p.id] = 1;
      var cur = others[p.id];
      var moved = !cur || cur.y !== p.y || cur.stamp !== p.t || cur.host !== p.host;
      others[p.id] = {
        id: p.id,
        name: p.name || 'Friend',
        y: p.y,
        stamp: p.t,
        seen: moved ? t : cur.seen,
        host: p.host,
        bx: p.bx, by: p.by, bdx: p.bdx, bdy: p.bdy,
        sl: p.sl, sr: p.sr,
        playing: !!p.playing,
        win: p.win
      };
    }
    for (var id in others) if (!seen[id] || t - others[id].seen > STALE_MS) delete others[id];

    var ids = Object.keys(others).sort();
    if (!owner) {
      for (var j = 0; j < ids.length; j++) {
        if (others[ids[j]].host) { opponent = others[ids[j]]; break; }
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
      pong.scores = [0, 0];
      pong.menu.winner = null;
      if (pong.playing) {
        pong.leftPaddle.setAuto(false);
        pong.rightPaddle.setAuto(false);
        pong.ball.reset();
      } else {
        pong.startDoublePlayer();
      }
    } else if (!want && hadOpponent) {
      hadOpponent = false;
      if (owner && pong.playing) pong.rightPaddle.setAuto(true, pong.level(1));
    }
    setNames();
    setHint();
    layoutPads();
  }

  function publish(g, dt) {
    var players = db('players');
    if (!netReady || !players || !me.id || me.id === 'local') return;
    acc += dt;
    if (acc < 1 / PUBLISH_HZ) return;
    acc = 0;
    var paddle = myPaddle();
    var rec = {
      id: me.id,
      name: me.name,
      y: Math.round(paddle.y),
      t: now()
    };
    if (owner) {
      rec.host = 1;
      rec.bx = Math.round(g.ball.x * 10) / 10;
      rec.by = Math.round(g.ball.y * 10) / 10;
      rec.bdx = Math.round(g.ball.dx);
      rec.bdy = Math.round(g.ball.dy);
      rec.sl = g.scores[0];
      rec.sr = g.scores[1];
      rec.playing = g.playing ? 1 : 0;
      rec.win = (g.menu && (g.menu.winner === 0 || g.menu.winner === 1)) ? g.menu.winner : null;
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
      layoutPads();
    });
  }

  /* ------------------------------------------------------------------ */
  /* touch: drag your half; on-screen arrows on phones                   */
  /* ------------------------------------------------------------------ */

  function canvasPos(ev) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) * (canvas.width / r.width),
      y: (ev.clientY - r.top) * (canvas.height / r.height)
    };
  }

  function pointerToPaddle(ev) {
    if (!pong) return;
    var pos = canvasPos(ev);
    var half = pong.width / 2;
    var paddle;
    if (isMp()) {
      if (owner) {
        if (pos.x > half) return;
        paddle = pong.leftPaddle;
      } else {
        if (pos.x < half) return;
        paddle = pong.rightPaddle;
      }
    } else {
      paddle = pos.x < half ? pong.leftPaddle : (pong.rightPaddle.auto ? pong.leftPaddle : pong.rightPaddle);
    }
    var y = pos.y - paddle.height / 2;
    paddle.setpos(paddle.x, clamp(y, paddle.minY, paddle.maxY));
    paddle.setdir(0);
  }

  court.addEventListener('pointerdown', function (ev) {
    if (ev.target && ev.target.closest && ev.target.closest('#pads, #soundBtn')) return;
    resumeAudio();
    if (!pong.playing) startPlay();
    dragging = true;
    try { court.setPointerCapture(ev.pointerId); } catch (e) {}
    pointerToPaddle(ev);
    ev.preventDefault();
  }, { passive: false });

  court.addEventListener('pointermove', function (ev) {
    if (!dragging) return;
    pointerToPaddle(ev);
    ev.preventDefault();
  }, { passive: false });

  function endDrag(ev) {
    dragging = false;
    try { court.releasePointerCapture(ev.pointerId); } catch (e) {}
  }
  court.addEventListener('pointerup', endDrag);
  court.addEventListener('pointercancel', endDrag);

  function bindPad(btn) {
    var side = btn.getAttribute('data-side');
    var dir = btn.getAttribute('data-dir');
    function paddle() {
      return side === 'L' ? pong.leftPaddle : pong.rightPaddle;
    }
    function go() {
      resumeAudio();
      if (!pong.playing) startPlay();
      if (dir === 'up') paddle().moveUp();
      else paddle().moveDown();
    }
    function stop() {
      if (dir === 'up') paddle().stopMovingUp();
      else paddle().stopMovingDown();
    }
    btn.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      go();
    });
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
  }
  var padBtns = pads.querySelectorAll('button');
  for (var i = 0; i < padBtns.length; i++) bindPad(padBtns[i]);

  function layoutPads() {
    if (!IS_TOUCH) { pads.hidden = true; return; }
    pads.hidden = false;
    if (isMp()) {
      padL.hidden = !owner;
      padR.hidden = owner;
    } else {
      padL.hidden = false;
      padR.hidden = !(pong && pong.rightPaddle && !pong.rightPaddle.auto);
    }
  }

  /* ------------------------------------------------------------------ */
  /* chrome                                                              */
  /* ------------------------------------------------------------------ */

  function setNames() {
    leftName.textContent = owner || !isMp() ? (me.name || 'You') : (opponent && opponent.name) || 'Host';
    if (isMp()) {
      rightName.textContent = owner ? ((opponent && opponent.name) || 'Friend') : (me.name || 'You');
    } else {
      rightName.textContent = pong && pong.rightPaddle && !pong.rightPaddle.auto ? 'P2' : 'CPU';
    }
  }

  function setHint() {
    if (!pong) return;
    if (isMp()) {
      hint.textContent = owner ? 'You are left · drag your half' : 'You are right · drag your half';
    } else if (pong.playing) {
      hint.textContent = IS_TOUCH ? 'Drag to move · first to 9' : 'Q/A left  ·  P/L right  ·  Esc to quit';
    } else {
      hint.textContent = IS_TOUCH ? 'Tap to play · drag your paddle' : 'Press 1 or tap  ·  Q/A left  ·  P/L right';
    }
  }

  function setSound(on) {
    soundOn = !!on;
    if (pong) pong.enableSound(soundOn);
    soundBtn.classList.toggle('off', !soundOn);
    soundBtn.textContent = soundOn ? '♪' : '×';
    var prefs = db('prefs');
    if (prefs) prefs.put({ id: 'sound', on: soundOn }).catch(function () {});
  }
  soundBtn.addEventListener('click', function (ev) {
    ev.stopPropagation();
    setSound(!soundOn);
  });

  var prefs = db('prefs');
  if (prefs && prefs.get) {
    Promise.resolve(prefs.get('sound')).then(function (r) {
      if (r && r.on === false) setSound(false);
    }).catch(function () {});
  }

  layoutPads();
  setNames();
  setHint();
  bootNet();
})(window);
