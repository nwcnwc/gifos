/* Battle City — shell: input, resize, host/guest loop. Invite is OS chrome. */
(function (root) {
  'use strict';

  var BC = root.BattleCity, Net = root.BCNet, Sfx = root.BCSound;
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  var keys = { up: 0, down: 0, left: 0, right: 0, fire: 0, start: 0, pause: 0 };
  var fireEdge = false, startEdge = false, pauseEdge = false;
  var dirStack = [];
  var slot = 0;
  var host = true;
  var lastWorldAt = 0;
  var guestFireN = 0;
  var touchOn = false;
  var startBtn = null, pauseBtn = null;
  var g = BC.create();

  /* The board is 256x240. Fill the screen with it: an integer-only scale threw
     away half a phone (390x844 floors to 1x — a postage stamp in the corner
     with the pad marooned 500px below it). Quarter steps keep the pixels even
     enough at any sane density and never waste more than 8%. */
  function fit() {
    var w = root.innerWidth, h = root.innerHeight;
    var padH = touchOn ? Math.min(300, Math.max(226, h * 0.30)) : 0; /* pad + the button slot above it */
    var availH = Math.max(120, h - padH);
    var scale = Math.min(w / 256, availH / 240);
    if (scale >= 1) scale = Math.floor(scale * 4) / 4;
    canvas.style.width = Math.round(256 * scale) + 'px';
    canvas.style.height = Math.round(240 * scale) + 'px';
    document.body.style.paddingBottom = padH + 'px';
  }
  fit();
  root.addEventListener('resize', fit);
  if (root.visualViewport) root.visualViewport.addEventListener('resize', fit);

  /* A tap is shorter than a frame, so press+release used to land in the same
     gap between two ticks and the tank never saw it — a d-pad tap did nothing
     at all, and neither did a tap on the menu. Hold a direction for a beat
     after release so a tap is always worth one turn and a short nudge. */
  var MIN_HOLD = 120;
  var holdUntil = {}, holdTok = {};

  function dropDir(d) { var i = dirStack.indexOf(d); if (i >= 0) dirStack.splice(i, 1); }
  function pushDir(d) {
    if (dirStack.indexOf(d) < 0) dirStack.push(d);
    holdUntil[d] = Date.now() + MIN_HOLD;
    holdTok[d] = (holdTok[d] || 0) + 1;
  }
  function pullDir(d) {
    var left = (holdUntil[d] || 0) - Date.now();
    if (left > 0) {
      var tok = holdTok[d];
      root.setTimeout(function () { if (holdTok[d] === tok) dropDir(d); }, left);
      return;
    }
    dropDir(d);
  }
  function currentDir() { return dirStack.length ? dirStack[dirStack.length - 1] : null; }

  function onKey(e, down) {
    var c = e.code;
    var map = {
      KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
      KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right'
    };
    if (map[c]) {
      if (down) pushDir(map[c]); else pullDir(map[c]);
      e.preventDefault();
    }
    if (c === 'KeyJ' || c === 'Space' || c === 'KeyK' || c === 'Enter') {
      if (down && !keys.fire) fireEdge = true;
      keys.fire = down ? 1 : 0;
      e.preventDefault();
    }
    if (c === 'KeyP' || c === 'Escape') {
      if (down && !keys.pause) pauseEdge = true;
      keys.pause = down ? 1 : 0;
      e.preventDefault();
    }
    if (c === 'Enter' || c === 'KeyJ' || c === 'Space') {
      if (down && g.phase === 'title') startEdge = true;
    }
  }
  document.addEventListener('keydown', function (e) { onKey(e, true); });
  document.addEventListener('keyup', function (e) { onKey(e, false); });

  /* on-screen pad — revealed on a real finger, never on a touchscreen laptop's mouse */
  (function () {
    var wrap = document.getElementById('touch');
    function reveal() {
      if (touchOn) return;
      touchOn = true;
      document.body.classList.add('touch');
      wrap.hidden = false;
      fit(); /* the pad now owns the bottom strip — re-fit the board above it */
      document.removeEventListener('touchstart', reveal);
    }
    document.addEventListener('touchstart', reveal, { passive: true });

    function bindHold(el, on, off) {
      if (!el) return;
      var hold = function (e) { e.preventDefault(); on(e); };
      var rel = function (e) { e.preventDefault(); off(e); };
      el.addEventListener('pointerdown', hold);
      el.addEventListener('pointerup', rel);
      el.addEventListener('pointercancel', rel);
      el.addEventListener('pointerleave', rel);
    }
    var pad = document.getElementById('dpad');
    if (pad) {
      [].forEach.call(pad.querySelectorAll('button[data-dir]'), function (btn) {
        var d = btn.getAttribute('data-dir');
        bindHold(btn, function () { pushDir(d); }, function () { pullDir(d); });
      });
    }
    bindHold(document.getElementById('t-fire'), function () { fireEdge = true; keys.fire = 1; }, function () { keys.fire = 0; });
    bindHold(document.getElementById('t-start'), function () { startEdge = true; }, function () {});
    bindHold(document.getElementById('t-pause'), function () { pauseEdge = true; }, function () {});
    startBtn = document.getElementById('t-start');
    pauseBtn = document.getElementById('t-pause');
  })();

  /* START belongs to the title and the game-over screen; PAUSE belongs to the
     fight. Showing both always put two chrome buttons over the board. */
  function syncPad() {
    if (!touchOn) return;
    var titleish = g.phase === 'title' || g.phase === 'over' || g.phase === 'win';
    if (startBtn) startBtn.style.display = titleish ? '' : 'none';
    if (pauseBtn) pauseBtn.style.display = titleish ? 'none' : '';
  }

  function playSfx(list) {
    if (!list || !Sfx) return;
    for (var i = 0; i < list.length; i++) Sfx.play(list[i]);
  }

  function localInput() {
    return { dir: currentDir(), fire: fireEdge, fireN: guestFireN };
  }

  function beginGame(two) {
    var n = g.stagePick || 0;
    BC.start(g, two, n);
    playSfx(g.sfx); g.sfx = [];
  }

  function stepTitle() {
    var dir = currentDir();
    if (dir === 'down' && fireEdge === false) {
      /* move choice on edge of down - handled below via startEdge/keys */
    }
    if (startEdge || fireEdge) {
      var id = (g.menu[g.choice] || {}).id;
      if (id === '2p') beginGame(true);
      else beginGame(false);
      startEdge = false; fireEdge = false;
      return;
    }
  }

  var lastChoiceAt = 0;
  function titleNav() {
    var t = Date.now();
    var dir = currentDir();
    if (t - lastChoiceAt < 180) return;
    if (dir === 'down') { g.choice = (g.choice + 1) % g.menu.length; lastChoiceAt = t; }
    if (dir === 'up') { g.choice = (g.choice + g.menu.length - 1) % g.menu.length; lastChoiceAt = t; }
  }

  var lastPub = 0;
  function publishMine(force) {
    var pose = BC.poseOf(g, slot);
    var inp = localInput();
    if (fireEdge) { guestFireN = Net.bumpFire(); force = true; }
    Net.publish({
      x: pose.x, y: pose.y, dir: pose.dir,
      keys: { dir: inp.dir, fire: keys.fire ? 1 : 0 },
      fireN: guestFireN, fireDir: pose.dir
    }, force);
  }

  function inputsFromNet() {
    var arr = [{ dir: null, fire: false }, { dir: null, fire: false }];
    arr[slot] = localInput();
    var others = Net.others();
    for (var i = 0; i < others.length; i++) {
      var o = others[i];
      var os = (o.id === Net.me().id) ? slot : (slot === 0 ? 1 : 0);
      /* host is always slot 0; the other living player is slot 1 */
      os = 1;
      arr[os] = {
        dir: (o.keys && o.keys.dir) || null,
        fire: false,
        fireN: o.fireN,
        pose: { x: o.x, y: o.y, dir: o.dir }
      };
    }
    if (slot === 1) arr[0] = arr[0]; /* host keys come from world, not here — host is us only if slot 0 */
    return arr;
  }

  var last = (root.performance && performance.now()) || Date.now();
  function frame(now) {
    var dt = Math.min(48, now - last); last = now;
    var room = Net.count() > 1;
    g.roomNote = room ? 'A FRIEND IS IN THE ROOM' : (host ? 'SEND THE INVITE FOR 2P' : 'WAITING FOR THE HOST');
    if (g.menu && g.menu[1]) g.menu[1].label = room ? '2 PLAYERS' : '2 PLAYERS  (INVITE)';

    if (g.phase === 'title') {
      titleNav();
      if (startEdge || fireEdge) {
        var two = (g.menu[g.choice] || {}).id === '2p' && (room || !host);
        if ((g.menu[g.choice] || {}).id === '2p' && !room && host) {
          /* still start 1p-shaped until a guest arrives — 2p flag on, second tank waits */
          two = true;
        }
        if (host) beginGame(two);
        startEdge = false; fireEdge = false;
      }
    } else if (g.phase === 'over' || g.phase === 'win') {
      if ((startEdge || fireEdge) && (g.overT || 0) > 1600 && host) {
        g.phase = 'title'; g.choice = 0;
        startEdge = false; fireEdge = false;
      }
    } else if (pauseEdge && g.phase === 'play' && host) {
      g.paused = !g.paused;
      Sfx.play('pause');
    }

    if (host) {
      if (g.phase !== 'title') {
        var ins = inputsFromNet();
        if (!g.twoPlayer) ins[1] = { dir: null, fire: false };
        BC.tick(g, dt, ins);
        playSfx(g.sfx); g.sfx = [];
        if (now - lastPub > 120 || g.sfx.length) {
          lastPub = now;
          Net.putWorld(BC.snapshot(g));
        }
      } else {
        BC.tick(g, dt, []);
      }
    } else {
      /* guest: paint the host's world, still tick title locally if waiting */
      if (g.phase === 'title') BC.tick(g, dt, []);
      else {
        /* keep time moving for blink/animation */
        g.time += dt;
      }
    }

    publishMine(fireEdge);
    fireEdge = false; startEdge = false; pauseEdge = false;
    syncPad();
    BC.render(ctx, g);
    root.requestAnimationFrame(frame);
  }

  function onWorld(rec) {
    if (host) return;
    var prev = g.phase;
    BC.applySnap(g, rec);
    if (rec.ph === 'stage' && prev !== 'stage') Sfx.play('stage_start');
    if (rec.ph === 'over' && prev !== 'over') Sfx.play('game_over');
    lastWorldAt = Date.now();
  }

  Sfx.load();
  Net.onWorld(onWorld);
  Net.onRoster(function () {
    if (host && g.phase === 'play' && Net.count() > 1 && !g.twoPlayer) {
      /* a friend joined mid-fight: they become the green tank next stage */
    }
  });

  Promise.resolve()
    .then(function () { return Net.init(); })
    .then(function (info) {
      host = !!(info && info.owner) || (info && info.owner !== false && Net.isOwner());
      if (info && info.me) slot = host ? 0 : 1;
      if (!root.gifos) { host = true; slot = 0; }
      return Net.loadPrefs();
    })
    .then(function (prefs) {
      if (prefs && prefs.hi) g.hi = prefs.hi;
      root.requestAnimationFrame(frame);
    })
    .catch(function () { host = true; slot = 0; root.requestAnimationFrame(frame); });

  /* persist hi-score occasionally */
  setInterval(function () {
    if (g.hi) Net.savePrefs({ hi: g.hi });
  }, 8000);
})(typeof globalThis !== 'undefined' ? globalThis : this);
