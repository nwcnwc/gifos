/*
 * Bowling — GifOS shell around tincoats/bowling.
 *
 * vendor/layout.js is the alley numbers and the throw. game.js is the canvas
 * alley and the ten-pin sheet. This file is the menu, the finger, the sounds,
 * and wiring the meeting.
 *
 * MULTIPLAYER. Invite is OS chrome — this app never draws a share button.
 * Players take turns. Each writes only their own score on their own row.
 */
(function (root) {
  'use strict';

  var L = root.BowlLayout;
  var Score = root.Bowl.Score;
  var Game = root.Bowl.Game;
  var Mp = root.BowlMp;

  var api = root.gifos || null;
  var game = new Game();
  var mode = 'solo';
  var hot = [{ name: 'You', frames: [], cur: [] }, { name: 'Player 2', frames: [], cur: [] }];
  var hotI = 0;
  var menuOn = true;
  var pulling = false;
  var dragX = 0;
  var dragY = 0;
  var dragT = 0;
  var lastX = 0;
  var lastY = 0;
  var soundOn = true;
  var actx = null;
  var last = 0;
  var bannerT = 0;
  var watching = null;
  var ghost = new Game();
  var mpStarted = false;

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('lane');
  var ctx = canvas.getContext('2d');
  var hint = $('hint');
  var powerBar = $('power');
  var powerFill = $('powerFill');
  var banner = $('banner');
  var menu = $('menu');
  var menuStatus = $('menuStatus');
  var sheet = $('sheet');
  var soundBtn = $('soundBtn');

  var COARSE = !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches);
  var IS_TOUCH = (navigator.maxTouchPoints || 0) > 0 && COARSE;

  function now() { return Date.now(); }
  function clamp(n, a, b) { return n < a ? a : n > b ? b : n; }
  function db(n) { return api && api.db ? api.db(n) : null; }

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

  function playResult(r) {
    resumeAudio();
    if (!r) return;
    if (r.strike) {
      tone(220, 0.12, 'sine', 0.1);
      setTimeout(function () { tone(330, 0.14, 'sine', 0.1); }, 90);
      setTimeout(function () { tone(440, 0.22, 'triangle', 0.12); }, 180);
    } else if (r.spare) {
      tone(260, 0.1, 'sine', 0.09);
      setTimeout(function () { tone(390, 0.16, 'sine', 0.1); }, 80);
    } else if (r.gutter) {
      tone(90, 0.2, 'sine', 0.06);
    } else {
      tone(180 + r.knocked * 18, 0.12, 'triangle', 0.08);
    }
  }

  function resize() {
    var dpr = root.devicePixelRatio || 1;
    var w = canvas.clientWidth || root.innerWidth;
    var h = canvas.clientHeight || root.innerHeight;
    var pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w: w, h: h };
  }

  function showBanner(text, ms) {
    banner.hidden = false;
    banner.textContent = text;
    bannerT = now() + (ms || 1400);
  }

  function paintSheet() {
    var rows = [];
    function add(name, frames, cur, mine, turn, total) {
      var fs = frames.slice();
      if (cur && cur.length && fs.length < 10) fs = fs.concat([cur]);
      var run = Score.running(frames);
      var cells = '', i, m, f, t = (total != null) ? total : Score.total(frames);
      for (i = 0; i < 10; i++) {
        f = fs[i] || [];
        m = Score.marks(f, i === 9);
        cells += '<span class="fr"><i>' + (i + 1) + '</i><b>' +
          (m[0] || '&nbsp;') + '</b><b>' + (m[1] || '&nbsp;') + '</b>' +
          (i === 9 ? '<b>' + (m[2] || '&nbsp;') + '</b>' : '') +
          '<em>' + (run[i] != null ? run[i] : '') + '</em></span>';
      }
      rows.push('<div class="prow' + (mine ? ' me' : '') + (turn ? ' turn' : '') + '">' +
        '<span class="who">' + name + '</span>' +
        '<span class="frs">' + cells + '</span>' +
        '<span class="tot">' + t + '</span></div>');
    }

    if (mode === 'hot') {
      add(hot[0].name, hot[0].frames, hotI === 0 ? game.cur : hot[0].cur, hotI === 0, hotI === 0, Score.total(hot[0].frames));
      add(hot[1].name, hot[1].frames, hotI === 1 ? game.cur : hot[1].cur, hotI === 1, hotI === 1, Score.total(hot[1].frames));
    } else if (mode === 'mp' && Mp.on()) {
      var players = Mp.live().slice().sort(function (a, b) {
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      var turn = Mp.turn();
      if (!players.length) {
        add(Mp.me().name || 'You', game.frames, game.cur, true, true, Score.total(game.frames));
      } else {
        players.forEach(function (p) {
          var mine = p.id === Mp.me().id;
          var fr = mine ? game.frames : (p.frames || []);
          var cu = mine ? game.cur : (p.cur || []);
          var nm = mine ? (Mp.me().name || 'You') : Mp.esc(p.name || 'Friend');
          add(nm, fr, cu, mine, !!(turn && turn.id === p.id), mine ? Score.total(game.frames) : (p.total || 0));
        });
      }
    } else {
      add(Mp.me().name || 'You', game.frames, game.cur, true, true, Score.total(game.frames));
    }
    sheet.innerHTML = rows.join('');
  }

  function setHint() {
    if (menuOn) return;
    if (mode === 'mp' && Mp.on() && Mp.others().length && !Mp.myTurn()) {
      var w = Mp.turn();
      hint.textContent = w ? ((w.name || 'They') + ' is bowling') : 'Their turn';
      return;
    }
    if (game.rolling) {
      hint.textContent = 'Ball’s rolling…';
      return;
    }
    if (Score.gameOver(game.frames) && (mode !== 'hot' || (Score.gameOver(hot[0].frames) && Score.gameOver(hot[1].frames)))) {
      hint.textContent = 'Game over';
      return;
    }
    hint.textContent = IS_TOUCH
      ? 'Slide to aim · flick up the lane to throw'
      : 'Move to aim · flick up the lane to throw';
  }

  function setPower(p) {
    if (p > 0.04 && pulling) {
      powerBar.classList.add('on');
      powerFill.style.width = clamp(p, 0, 1) * 100 + '%';
    } else {
      powerBar.classList.remove('on');
    }
  }

  function myTurnNow() {
    if (menuOn) return false;
    if (game.rolling) return false;
    if (Score.gameOver(game.frames) && mode !== 'hot') return false;
    if (mode === 'mp' && Mp.on() && Mp.others().length) return Mp.myTurn();
    return true;
  }

  function applyHotFromGame() {
    hot[hotI].frames = game.frames;
    hot[hotI].cur = game.cur.slice();
  }

  function loadHot() {
    var h = hot[hotI];
    game.frames = h.frames;
    game.cur = h.cur.slice();
    var needReset = true;
    if (h.cur && h.cur.length && h.cur[0] !== 10) needReset = false;
    game.resetRack(needReset);
    game.resetBall();
  }

  function afterThrow(r) {
    if (!r) return;
    playResult(r);
    if (r.strike) showBanner('Strike!', 1600);
    else if (r.spare) showBanner('Spare!', 1400);
    else if (r.gutter) showBanner('Gutter', 1100);
    else showBanner(String(r.knocked), 900);

    if (mode === 'hot') {
      applyHotFromGame();
      if (r.close || r.done) {
        var other = 1 - hotI;
        if (!Score.gameOver(hot[other].frames)) {
          hotI = other;
          loadHot();
          showBanner(hot[hotI].name, 900);
        } else if (Score.gameOver(hot[0].frames) && Score.gameOver(hot[1].frames)) {
          var a = Score.total(hot[0].frames), b = Score.total(hot[1].frames);
          if (a === b) showBanner('Tie at ' + a, 2400);
          else showBanner((a > b ? hot[0].name : hot[1].name) + ' wins', 2400);
        }
      }
    }
    if (mode === 'mp') Mp.publish(game, true);
    if (r.done && mode === 'solo') showBanner(r.total + ' for the game', 2200);
    if (r.done && mode === 'mp') maybeMpWinner();
  }

  function maybeMpWinner() {
    var players = Mp.live();
    if (players.length < 2) return;
    var unfinished = players.filter(function (p) { return !p.done; });
    if (unfinished.length) return;
    var ranked = players.slice().sort(function (a, b) { return (b.total || 0) - (a.total || 0); });
    if ((ranked[0].total || 0) === (ranked[1].total || 0)) showBanner('Tie at ' + (ranked[0].total || 0), 2600);
    else {
      var mine = ranked[0].id === Mp.me().id;
      showBanner(mine ? 'You win' : ((ranked[0].name || 'They') + ' wins'), 2600);
    }
  }

  function loop(t) {
    requestAnimationFrame(loop);
    var dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
    last = t;
    if (!menuOn && (myTurnNow() || game.rolling)) {
      var before = game.lastResult;
      if (game.rolling) game.step(dt);
      if (game.lastResult && game.lastResult !== before) afterThrow(game.lastResult);
    }
    if (mode === 'mp' && Mp.on()) {
      var turn = Mp.turn();
      watching = null;
      if (turn && turn.id !== Mp.me().id && turn.lane) {
        watching = turn;
      }
      Mp.publish(game, false);
    }
    var sz = resize();
    if (watching) {
      ghost.applyPack(watching.lane);
      ghost.draw(ctx, sz.w, sz.h);
    } else {
      game.draw(ctx, sz.w, sz.h);
    }
    if (bannerT && now() > bannerT) { banner.hidden = true; bannerT = 0; }
    var over = !menuOn && !game.rolling && Score.gameOver(game.frames);
    if (mode === 'hot') over = Score.gameOver(hot[0].frames) && Score.gameOver(hot[1].frames);
    $('againBtn').hidden = !over;
    paintSheet();
    setHint();
  }

  function fireFromDrag(ev) {
    var dy = dragY - ev.clientY;
    var dx = dragX - ev.clientX;
    var dur = now() - dragT;
    var power = 0;
    if (dy > L.minFlickY && dur < L.maxFlickMs && Math.abs(dy) > Math.abs(dx) * L.verticalBias) {
      var iz = L.impulseOf(dy);
      var ix = clamp(-dx * 0.12, -12, 12);
      power = clamp((iz - 20) / 20, 0, 1);
      if (game.throwImpulse(iz, ix)) {
        tone(90, 0.1, 'sine', 0.1);
        if (mode === 'mp') Mp.publish(game, true);
      }
    }
    setPower(0);
    return power;
  }

  function bindPointer() {
    canvas.addEventListener('pointerdown', function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest('#menu, #soundBtn')) return;
      resumeAudio();
      if (!myTurnNow() || !game.canAim()) return;
      pulling = true;
      dragX = ev.clientX; dragY = ev.clientY; lastX = dragX; lastY = dragY; dragT = now();
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
      ev.preventDefault();
    }, { passive: false });
    canvas.addEventListener('pointermove', function (ev) {
      if (!pulling) return;
      var dx = ev.clientX - lastX;
      game.nudgeX(dx);
      lastX = ev.clientX;
      lastY = ev.clientY;
      var dy = dragY - ev.clientY;
      var iz = dy > 0 ? L.impulseOf(dy) : 20;
      setPower(dy > L.minFlickY ? clamp((iz - 20) / 20, 0, 1) : 0);
      if (mode === 'mp') Mp.publish(game, false);
      ev.preventDefault();
    }, { passive: false });
    function endPtr(ev) {
      if (!pulling) return;
      pulling = false;
      fireFromDrag(ev);
    }
    canvas.addEventListener('pointerup', endPtr);
    canvas.addEventListener('pointercancel', endPtr);
  }

  function hideMenu() {
    menu.hidden = true;
    menuOn = false;
    $('hud').hidden = false;
  }
  function showMenu() {
    menu.hidden = false;
    menuOn = true;
    $('hud').hidden = true;
    pulling = false;
  }

  function startSolo() {
    mode = 'solo';
    game.reset();
    hideMenu();
    if (api) Mp.enter(game);
  }
  function startHot() {
    mode = 'hot';
    hot = [{ name: 'You', frames: [], cur: [] }, { name: 'Player 2', frames: [], cur: [] }];
    hotI = 0;
    game.reset();
    hideMenu();
  }

  function startMpGame(keepRound) {
    mode = 'mp';
    if (!keepRound) {
      game.reset();
    }
    hideMenu();
    mpStarted = true;
    Mp.enter(game);
    Mp.publish(game, true);
  }

  Mp.onList = function (players, hasFriend) {
    if (!hasFriend) {
      if (mpStarted && mode === 'mp') {
        mpStarted = false;
        mode = 'solo';
        showMenu();
        menuStatus.textContent = 'Friend left.';
      }
      return;
    }
    var ad = Mp.adoptedRound();
    if (ad > Mp.round()) {
      Mp.setRound(ad);
      game.reset();
    }
    if (!mpStarted || menuOn || mode !== 'mp') {
      Mp.setRound(Math.max(Mp.round(), ad));
      startMpGame(false);
      menuStatus.textContent = '';
    }
    maybeMpWinner();
  };

  $('btnSolo').addEventListener('click', function () {
    resumeAudio();
    startSolo();
  });
  $('btnHot').addEventListener('click', function () {
    resumeAudio();
    startHot();
  });
  $('againBtn').addEventListener('click', function () {
    resumeAudio();
    if (mode === 'hot') {
      startHot();
      return;
    }
    if (mode === 'mp' && Mp.on()) {
      Mp.setRound(Mp.round() + 1);
      game.reset();
      Mp.publish(game, true);
      return;
    }
    game.reset();
  });

  function setSound(on) {
    soundOn = !!on;
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
    api.onBack(function () { showMenu(); });
  }

  if (api && api.db) Mp.enter(game);

  bindPointer();
  showMenu();
  requestAnimationFrame(loop);
})(window);
