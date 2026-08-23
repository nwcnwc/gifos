/*
 * Finger Pool — GifOS shell around victorqribeiro/fingerPool.
 *
 * vendor/Vec2.js and vendor/Sphere.js are the bounce. game.js is the
 * table and the flick. This file is the menu, the finger, the sounds,
 * and wiring the meeting.
 *
 * MULTIPLAYER. Invite is OS chrome — this app never draws a share button.
 * Players take turns. Each writes only their own score on their own row.
 */
(function (root) {
  'use strict';

  var G = root.FingerPool;
  var Mp = root.FingerMp;

  var api = root.gifos || null;
  var mode = 'solo';
  var hot = [{ name: 'You', score: 0, shots: 0 }, { name: 'Player 2', score: 0, shots: 0 }];
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
  var bannerT = 0;
  var mpStarted = false;
  var adoptedSeq = -1;
  var shotOpen = false;

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('table');
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

  G.setOnHit(function (d) {
    resumeAudio();
    tone(clamp(180 + d * 80, 140, 420), 0.05, 'triangle', clamp(0.04 + d * 0.04, 0.04, 0.12));
  });
  G.setOnHole(function () {
    resumeAudio();
    tone(220, 0.16, 'sine', 0.1);
    setTimeout(function () { tone(140, 0.2, 'sine', 0.08); }, 80);
  });

  function resize() {
    var W = canvas.clientWidth || root.innerWidth;
    var H = canvas.clientHeight || root.innerHeight;
    G.layout(canvas, W, H);
    return { w: W, h: H };
  }

  function showBanner(text, ms) {
    banner.hidden = false;
    banner.textContent = text;
    bannerT = now() + (ms || 1400);
  }

  function paintSheet() {
    var rows = [];
    function add(name, score, mine, turn) {
      rows.push('<div class="prow' + (mine ? ' me' : '') + (turn ? ' turn' : '') + '">' +
        '<span class="who">' + name + '</span>' +
        '<span class="tot">' + score + '</span></div>');
    }
    if (mode === 'hot') {
      add(hot[0].name, hot[0].score, hotI === 0, hotI === 0);
      add(hot[1].name, hot[1].score, hotI === 1, hotI === 1);
    } else if (mode === 'mp' && Mp.on()) {
      var players = Mp.live().slice().sort(function (a, b) {
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
      var turn = Mp.turn();
      if (!players.length) {
        add(Mp.me().name || 'You', G.score(), true, true);
      } else {
        players.forEach(function (p) {
          var mine = p.id === Mp.me().id;
          var nm = mine ? (Mp.me().name || 'You') : Mp.esc(p.name || 'Friend');
          add(nm, mine ? G.score() : (p.score || 0), mine, !!(turn && turn.id === p.id));
        });
      }
    } else {
      add(Mp.me().name || 'You', G.score(), true, true);
    }
    sheet.innerHTML = rows.join('');
  }

  function setHint() {
    if (menuOn) return;
    if (mode === 'mp' && Mp.on() && Mp.others().length && !Mp.myTurn()) {
      var w = Mp.turn();
      hint.textContent = w ? ((w.name || 'They') + ' is shooting') : 'Their turn';
      return;
    }
    if (G.moving()) {
      hint.textContent = 'Balls are rolling…';
      return;
    }
    if (G.over()) {
      hint.textContent = 'Rack is clear';
      return;
    }
    hint.textContent = IS_TOUCH
      ? 'Touch a ball · flick to send it'
      : 'Click a ball · flick to send it';
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
    if (G.moving()) return false;
    if (G.over()) return false;
    if (mode === 'mp' && Mp.on() && Mp.others().length) return Mp.myTurn();
    return true;
  }

  function maybeWinner() {
    if (mode === 'hot') {
      if (!G.over()) return;
      if (hot[0].score === hot[1].score) showBanner('Tie at ' + hot[0].score, 2400);
      else showBanner((hot[0].score > hot[1].score ? hot[0].name : hot[1].name) + ' wins', 2400);
      return;
    }
    if (mode === 'mp') {
      var players = Mp.live();
      if (players.length < 2) {
        if (G.over()) showBanner(G.score() + ' in', 2200);
        return;
      }
      var unfinished = players.filter(function (p) { return !p.done; });
      if (unfinished.length) return;
      var ranked = players.slice().sort(function (a, b) {
        var as = a.id === Mp.me().id ? G.score() : (a.score || 0);
        var bs = b.id === Mp.me().id ? G.score() : (b.score || 0);
        return bs - as;
      });
      var top = ranked[0].id === Mp.me().id ? G.score() : (ranked[0].score || 0);
      var second = ranked[1] ? (ranked[1].id === Mp.me().id ? G.score() : (ranked[1].score || 0)) : -1;
      if (top === second) showBanner('Tie at ' + top, 2600);
      else showBanner(ranked[0].id === Mp.me().id ? 'You win' : ((ranked[0].name || 'They') + ' wins'), 2600);
      return;
    }
    if (G.over()) showBanner(G.score() + ' in', 2200);
  }

  function onSettled() {
    if (!shotOpen) return;
    shotOpen = false;
    var n = G.finishShot();
    if (mode === 'hot') {
      hot[hotI].score = G.score();
      hot[hotI].shots = G.shots();
      if (!G.over()) {
        hotI = 1 - hotI;
        G.setScore(hot[hotI].score);
        G.setShots(hot[hotI].shots);
        showBanner(hot[hotI].name, 900);
      }
    }
    if (n) showBanner(n === 1 ? '1 in' : (n + ' in'), 900);
    if (mode === 'mp') Mp.publish(G, true);
    if (G.over()) maybeWinner();
  }

  function adoptRemote() {
    var turn = Mp.turn();
    var src = (turn && turn.table) ? turn : Mp.bestTable();
    if (!src || !src.table || src.id === Mp.me().id) return;
    G.applyPack(src.table);
    adoptedSeq = src.seq || 0;
    G.setSeq(Math.max(G.seq(), adoptedSeq));
  }

  function adoptIfNewer() {
    var best = Mp.bestTable();
    if (!best || !best.table || best.id === Mp.me().id) return;
    if ((best.seq || 0) < adoptedSeq) return;
    G.applyPack(best.table);
    adoptedSeq = best.seq || 0;
    G.setSeq(adoptedSeq);
  }

  function loop() {
    requestAnimationFrame(loop);
    if (!menuOn) {
      if (mode === 'mp' && Mp.on() && Mp.others().length) {
        if (Mp.myTurn()) {
          if (!shotOpen && !pulling && G.still()) adoptIfNewer();
          if (G.moving()) G.step();
          if (shotOpen && G.still()) onSettled();
          Mp.publish(G, false);
        } else {
          adoptRemote();
        }
      } else if (G.moving()) {
        G.step();
        if (shotOpen && G.still()) onSettled();
      }
    }
    resize();
    G.draw();
    if (pulling) G.drawAim(dragX, dragY, lastX, lastY);
    if (bannerT && now() > bannerT) { banner.hidden = true; bannerT = 0; }
    $('againBtn').hidden = menuOn || !G.over();
    paintSheet();
    setHint();
  }

  function tablePos(ev) {
    var rect = canvas.getBoundingClientRect();
    return G.fromScreen(ev.clientX - rect.left, ev.clientY - rect.top);
  }

  function fireFromDrag(ev) {
    var pos = tablePos(ev);
    var dt = now() - dragT;
    var dist, power = 0;
    dist = Math.sqrt((dragX - pos.x) * (dragX - pos.x) + (dragY - pos.y) * (dragY - pos.y));
    power = clamp((dist / Math.max(dt, 1) * 12) / 40, 0, 1);
    if (G.flick(dragX, dragY, pos.x, pos.y, dt)) {
      shotOpen = true;
      tone(90, 0.08, 'sine', 0.08);
      if (mode === 'mp') Mp.publish(G, true);
    }
    setPower(0);
    return power;
  }

  function bindPointer() {
    canvas.addEventListener('pointerdown', function (ev) {
      var pos;
      if (ev.target && ev.target.closest && ev.target.closest('#menu, #soundBtn')) return;
      resumeAudio();
      if (!myTurnNow()) return;
      pos = tablePos(ev);
      if (!G.grab(pos.x, pos.y)) return;
      pulling = true;
      dragX = pos.x; dragY = pos.y; lastX = pos.x; lastY = pos.y; dragT = now();
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
      ev.preventDefault();
    }, { passive: false });
    canvas.addEventListener('pointermove', function (ev) {
      var pos, dist, dt;
      if (!pulling) return;
      pos = tablePos(ev);
      lastX = pos.x;
      lastY = pos.y;
      dt = now() - dragT;
      dist = Math.sqrt((dragX - lastX) * (dragX - lastX) + (dragY - lastY) * (dragY - lastY));
      setPower(clamp((dist / Math.max(dt, 1) * 12) / 40, 0, 1));
      ev.preventDefault();
    }, { passive: false });
    function endPtr(ev) {
      if (!pulling) return;
      pulling = false;
      fireFromDrag(ev);
      G.dropGrab();
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
    shotOpen = false;
  }

  function startSolo() {
    mode = 'solo';
    G.reset();
    adoptedSeq = -1;
    shotOpen = false;
    hideMenu();
    if (api) Mp.enter(G);
  }
  function startHot() {
    mode = 'hot';
    hot = [{ name: 'You', score: 0, shots: 0 }, { name: 'Player 2', score: 0, shots: 0 }];
    hotI = 0;
    G.reset();
    shotOpen = false;
    hideMenu();
  }

  function startMpGame() {
    mode = 'mp';
    G.reset();
    adoptedSeq = -1;
    shotOpen = false;
    hideMenu();
    mpStarted = true;
    Mp.enter(G);
    Mp.publish(G, true);
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
      G.reset();
      adoptedSeq = -1;
      shotOpen = false;
    }
    if (!mpStarted || menuOn || mode !== 'mp') {
      Mp.setRound(Math.max(Mp.round(), ad));
      startMpGame();
      menuStatus.textContent = '';
    }
    maybeWinner();
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
      G.reset();
      adoptedSeq = -1;
      shotOpen = false;
      Mp.publish(G, true);
      return;
    }
    G.reset();
    shotOpen = false;
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

  if (api && api.db) Mp.enter(G);

  G.reset();
  bindPointer();
  showMenu();
  requestAnimationFrame(loop);
})(window);
