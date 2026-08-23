/*
 * Snake — boot, paint, input, persistence, and the room.
 *
 * Each player writes ONLY their own row on gifos.db('snakes') (heading + head
 * + body). The elected host (lowest present id) writes gifos.db('arena') —
 * seed, apple, tick — and never anyone else's snake. Guests never write arena.
 * Invite is OS chrome; this file has no Invite button.
 */
(function () {
  'use strict';

  var G = window.SnakeGame;
  var STALE_MS = 8000, HOLD_MS = 2500, HB_MS = 1500;
  var FIELD = '#00008c', FOOD = '#ff3030', FOOD_HI = '#ffd24a', LEAF = '#3cb85a';

  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  var lenEl = document.getElementById('len');
  var hiEl = document.getElementById('hi');
  var rosterEl = document.getElementById('roster');
  var dialog = document.getElementById('dialog');
  var dlgTitle = document.getElementById('dlg-title');
  var dlgBody = document.getElementById('dlg-body');
  var dlgGo = document.getElementById('dlg-go');
  var dlgNew = document.getElementById('dlg-new');
  var modeSel = document.getElementById('mode');
  var modesEl = document.getElementById('modes');
  var pad = document.getElementById('pad');
  var stageEl = document.getElementById('stage');
  var playEl = document.getElementById('play');

  var me = { id: 'local', name: 'You' };
  var snake = G.freshSnake(4, (G.ROWS / 2) | 0, G.RIGHT);
  var apple = G.randomApple([snake]);
  var ateGen = -1;
  var high = 0;
  var view = 'welcome';          // welcome | play | over
  var paused = false;
  var mp = false;
  var myTick = -1;
  var myIndex = 0;
  var others = {};               // id -> {id,name,body,alive,len,d,x,y,at,color}
  var arena = null;
  var snakesDb = null, arenaDb = null, prefsDb = null;
  var soloTimer = 0, hostTimer = 0, hbTimer = 0;
  var lastPublish = 0;
  var cell = 20, dpr = 1;
  var swipe = null;
  var touchy = false;
  var flashUntil = 0;
  var savedRun = null;

  function now() { return Date.now(); }
  function speedMs() {
    var v = parseInt(modeSel.value, 10);
    if (isNaN(v) || v < 25) v = 75;
    if (!mp && touchy) v = Math.round(v * 2);
    return v;
  }
  function isHost() {
    var ids = presentIds();
    if (!ids.length) return true;
    var h = ids[0];
    for (var i = 1; i < ids.length; i++) if (ids[i] < h) h = ids[i];
    return h === me.id;
  }
  function presentIds() {
    var t = now(), ids = [me.id];
    for (var id in others) {
      if (others[id] && t - others[id].at < STALE_MS && ids.indexOf(id) < 0) ids.push(id);
    }
    return ids.sort();
  }
  function presentCount() { return presentIds().length; }

  function snakesList() {
    var list = [snake];
    for (var id in others) {
      var o = others[id];
      if (o && o.body) list.push(o);
    }
    return list;
  }

  /* ------------------------------------------------------------------ */
  /* persistence                                                        */
  /* ------------------------------------------------------------------ */

  function loadHi() {
    if (!prefsDb) return Promise.resolve();
    return Promise.resolve(prefsDb.get('hi')).then(function (row) {
      if (row && row.n > high) high = row.n;
      paintHud();
    }).catch(function () {});
  }
  function saveHi(n) {
    if (n > high) {
      high = n;
      if (prefsDb) prefsDb.put({ id: 'hi', n: high }).catch(function () {});
    }
  }
  function savePrefs() {
    if (!prefsDb) return;
    prefsDb.put({ id: 'mode', v: modeSel.value }).catch(function () {});
    if (mp || view !== 'play' || !snake.alive) {
      prefsDb.put({ id: 'run', gone: true }).catch(function () {});
      return;
    }
    prefsDb.put({
      id: 'run',
      gone: false,
      body: G.packBody(snake.body),
      d: snake.d, last: snake.last, grow: snake.grow, pre: snake.pre,
      ax: apple.x, ay: apple.y,
      mode: modeSel.value
    }).catch(function () {});
  }
  function loadPrefs() {
    if (!prefsDb) return Promise.resolve();
    return Promise.all([
      Promise.resolve(prefsDb.get('mode')).catch(function () { return null; }),
      Promise.resolve(prefsDb.get('run')).catch(function () { return null; }),
      loadHi()
    ]).then(function (rows) {
      if (rows[0] && rows[0].v && modeSel.querySelector('option[value="' + rows[0].v + '"]')) {
        modeSel.value = rows[0].v;
      }
      if (rows[1] && rows[1].gone === false && rows[1].body) savedRun = rows[1];
    }).catch(function () {});
  }

  /* ------------------------------------------------------------------ */
  /* net — own row only                                                 */
  /* ------------------------------------------------------------------ */

  function publish(force) {
    if (!snakesDb || me.id === 'local') return;
    var t = now();
    if (!force && t - lastPublish < 40) return;
    lastPublish = t;
    snakesDb.put({
      id: me.id,
      name: me.name,
      d: snake.d,
      x: snake.x,
      y: snake.y,
      body: G.packBody(snake.body),
      alive: !!snake.alive,
      len: G.lengthOf(snake),
      grow: snake.grow,
      moving: !!snake.moving,
      at: t,
      tick: myTick
    }).catch(function () {});
  }

  function putArena(a) {
    if (!arenaDb || !isHost()) return;
    arena = a;
    arenaDb.put(a).catch(function () {});
  }

  function ingestSnakes(list) {
    var t = now(), seen = {};
    for (var i = 0; i < (list || []).length; i++) {
      var p = list[i];
      if (!p || !p.id || p.id === me.id) continue;
      seen[p.id] = 1;
      var body = G.unpackBody(p.body);
      var prev = others[p.id];
      var packed = p.body || '';
      var moved = !prev || prev.packed !== packed;
      others[p.id] = {
        id: p.id,
        name: p.name || 'Player',
        d: p.d,
        last: p.d,
        x: p.x, y: p.y,
        body: body.length ? body : [{ x: p.x, y: p.y }],
        prev: moved && prev && prev.body ? prev.body : (prev && prev.prev) || body,
        stepAt: moved ? t : (prev && prev.stepAt) || t,
        packed: packed,
        alive: p.alive !== false,
        len: p.len || body.length || 1,
        grow: p.grow || 0,
        moving: !!p.moving,
        at: t,
        stamp: p.at
      };
    }
    for (var id in others) if (!seen[id] || t - others[id].at > STALE_MS) delete others[id];
    var n = presentCount();
    if (n >= 2 && !mp) enterMp();
    if (n < 2 && mp && view === 'play') leaveMpToSolo();
    paintHud();
  }

  function ingestArena(list) {
    var a = null;
    for (var i = 0; i < (list || []).length; i++) if (list[i] && list[i].id === 'a') a = list[i];
    if (!a) {
      if (mp && isHost() && view === 'play') hostStartRound();
      return;
    }
    var prevTick = arena && arena.tick;
    var prevRound = arena && arena.round;
    arena = a;
    if (a.speed && modeSel.value !== String(a.speed) && mp) {
      // arena.speed is milliseconds; the select holds the pre-touch values.
    }
    if (mp && a.round !== prevRound) onNewRound(a);
    if (mp && view === 'play' && a.playing && a.tick !== prevTick) catchUp(a.tick);
    if (mp && a.winner && view === 'play') showWinner(a);
  }

  function enterMp() {
    mp = true;
    modesEl.hidden = true;
    rosterEl.hidden = false;
    savedRun = null;
    if (soloTimer) { clearInterval(soloTimer); soloTimer = 0; }
    paused = false;
    if (view === 'welcome') {
      if (arena && arena.playing) { onNewRound(arena); }
      else {
        dlgBody.innerHTML = 'A friend is here. Both snakes share one board. Do not hit the other. Last one moving wins.';
        dlgGo.textContent = 'Play together';
      }
    } else {
      if (isHost()) hostStartRound();
      else if (arena && arena.playing) onNewRound(arena);
    }
    if (isHost() && !hostTimer) hostTimer = setInterval(hostTick, speedMs());
  }

  function leaveMpToSolo() {
    mp = false;
    modesEl.hidden = false;
    rosterEl.hidden = true;
    if (hostTimer) { clearInterval(hostTimer); hostTimer = 0; }
    apple = (arena && arena.ax != null) ? { x: arena.ax, y: arena.ay } : G.randomApple([snake]);
    if (view === 'play' && snake.alive) ensureSoloLoop();
  }

  function onNewRound(a) {
    var ids = presentIds();
    myIndex = ids.indexOf(me.id);
    if (myIndex < 0) myIndex = 0;
    var sp = G.spawn(myIndex);
    snake = G.freshSnake(sp.x, sp.y, sp.d);
    ateGen = 0;
    myTick = a.tick || 0;
    view = 'play';
    paused = false;
    hideDialog();
    publish(true);
  }

  function catchUp(target) {
    if (view !== 'play' || paused) return;
    var guard = 0;
    while (myTick < target && guard++ < 8) {
      myTick++;
      if (snake.alive && snake.d >= 0) {
        var ap = null;
        if (arena && arena.ax != null && ateGen !== arena.gen) ap = { x: arena.ax, y: arena.ay };
        G.snapshot(snake);
        snake.stepAt = now();
        var r = G.stepSnake(snake, snakesList(), ap);
        if (r.ate) { ateGen = arena.gen; flashUntil = now() + 140; }
        if (r.died) publish(true);
      }
    }
    publish(false);
    saveHi(G.lengthOf(snake));
    paintHud();
  }

  function hostStartRound() {
    if (!isHost()) return;
    var seed = (Math.random() * 0xffffffff) >>> 0;
    var ids = presentIds();
    myIndex = ids.indexOf(me.id);
    if (myIndex < 0) myIndex = 0;
    var sp = G.spawn(myIndex);
    snake = G.freshSnake(sp.x, sp.y, sp.d);
    var ap = G.placeApple(seed, 1, [snake]);
    ateGen = 0;
    myTick = 0;
    view = 'play';
    hideDialog();
    putArena({
      id: 'a',
      seed: seed,
      ax: ap.x, ay: ap.y,
      gen: 1,
      tick: 0,
      round: ((arena && arena.round) || 0) + 1,
      playing: true,
      winner: null,
      winnerName: null,
      speed: speedMs(),
      t: now()
    });
    publish(true);
    if (hostTimer) clearInterval(hostTimer);
    hostTimer = setInterval(hostTick, speedMs());
  }

  function hostTick() {
    if (!mp || !isHost() || !arena || !arena.playing || view !== 'play') return;
    arena.tick = (arena.tick || 0) + 1;
    catchUp(arena.tick);

    var list = snakesList();
    var ap = { x: arena.ax, y: arena.ay };
    var eater = null;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (s.alive && s.x === ap.x && s.y === ap.y) { eater = s; break; }
    }
    if (eater) {
      var next = G.placeApple(arena.seed, (arena.gen || 1) + 1, list);
      if (next) { arena.ax = next.x; arena.ay = next.y; arena.gen = (arena.gen || 1) + 1; }
    }

    var live = [];
    var t = now();
    var anyDead = !snake.alive;
    if (snake.alive) live.push({ id: me.id, name: me.name });
    for (var id in others) {
      var o = others[id];
      if (!o || t - o.at > STALE_MS) continue;
      if (!o.alive) anyDead = true;
      else live.push({ id: o.id, name: o.name });
    }
    // Do not crown a winner on the first ticks of a round — a guest may not
    // have published the new spawn yet. Someone has to have crashed.
    if (anyDead && presentCount() >= 2 && live.length <= 1) {
      arena.playing = false;
      if (live.length === 1) { arena.winner = live[0].id; arena.winnerName = live[0].name; }
      else { arena.winner = 'draw'; arena.winnerName = null; }
      arena.endedAt = t;
    }
    putArena(arena);
    if (!arena.playing) showWinner(arena);
  }

  function showWinner(a) {
    if (view === 'over') return;
    view = 'over';
    var msg;
    if (a.winner === 'draw') msg = 'No one left moving.';
    else if (a.winner === me.id) msg = 'You win — last one moving.';
    else msg = escapeHtml(a.winnerName || 'Someone') + ' wins — last one moving.';
    showDialog('JavaScript Snake', msg, isHost() ? 'Play again' : 'Wait for next');
    if (isHost()) {
      setTimeout(function () {
        if (mp && isHost() && view === 'over') hostStartRound();
      }, HOLD_MS);
    }
  }

  /* ------------------------------------------------------------------ */
  /* solo                                                               */
  /* ------------------------------------------------------------------ */

  function startSolo() {
    mp = false;
    modesEl.hidden = false;
    var sp = G.spawn(0);
    snake = G.freshSnake(sp.x, sp.y, sp.d);
    apple = G.randomApple([snake]);
    ateGen = -1;
    myTick = 0;
    view = 'play';
    paused = false;
    savedRun = null;
    hideDialog();
    if (soloTimer) { clearInterval(soloTimer); soloTimer = 0; }
    paintHud();
    savePrefs();
  }

  function resumeSolo(run) {
    var body = G.unpackBody(run.body);
    if (!body.length) { startSolo(); return; }
    snake = G.freshSnake(body[0].x, body[0].y, run.last >= 0 ? run.last : G.RIGHT);
    snake.body = body;
    snake.x = body[0].x; snake.y = body[0].y;
    snake.d = run.d; snake.last = run.last; snake.grow = run.grow || 0;
    snake.pre = run.pre >= 0 ? run.pre : -1;
    snake.alive = true; snake.moving = snake.d >= 0; snake.first = snake.d < 0;
    apple = { x: run.ax, y: run.ay };
    if (run.mode && modeSel.querySelector('option[value="' + run.mode + '"]')) modeSel.value = run.mode;
    view = 'play';
    paused = false;
    savedRun = null;
    hideDialog();
    paintHud();
    if (snake.d >= 0) ensureSoloLoop();
  }

  function soloTick() {
    if (view !== 'play' || paused || mp) return;
    if (snake.d < 0) return;
    G.snapshot(snake);
    snake.stepAt = now();
    var r = G.stepSnake(snake, [snake], apple);
    if (r.ate) {
      apple = G.randomApple([snake]) || apple;
      flashUntil = now() + 140;
      saveHi(G.lengthOf(snake));
    }
    if (r.died) {
      if (soloTimer) { clearInterval(soloTimer); soloTimer = 0; }
      saveHi(G.lengthOf(snake));
      view = 'over';
      savePrefs();
      showDialog('JavaScript Snake', 'You died :(', 'Play Again?');
    } else {
      savePrefs();
    }
    paintHud();
  }

  function ensureSoloLoop() {
    if (mp || soloTimer || view !== 'play') return;
    soloTimer = setInterval(soloTick, speedMs());
  }

  /* ------------------------------------------------------------------ */
  /* input                                                              */
  /* ------------------------------------------------------------------ */

  function applyDir(dir) {
    if (dir < 0) return;
    if (view === 'welcome' || view === 'over') {
      dlgGo.click();
      G.setDir(snake, dir);
      if (!mp) ensureSoloLoop();
      publish(true);
      return;
    }
    if (view !== 'play') return;
    G.setDir(snake, dir);
    if (!mp) ensureSoloLoop();
    publish(true);
  }

  function togglePause() {
    if (view !== 'play' || mp) return;
    paused = !paused;
    if (paused) {
      savePrefs();
      showDialog('[Paused]', 'Press space or the pad to unpause.', 'Resume');
    } else hideDialog();
  }

  window.addEventListener('keydown', function (ev) {
    var code = ev.keyCode || ev.which;
    var dir = G.keyToDir(code);
    if (dir >= 0) { ev.preventDefault(); applyDir(dir); return; }
    if (code === 32 || code === 13) {
      ev.preventDefault();
      if (view === 'welcome' || view === 'over') dlgGo.click();
      else togglePause();
    }
  }, { passive: false });

  pad.addEventListener('pointerdown', function (ev) {
    var btn = ev.target.closest('button');
    if (!btn) return;
    ev.preventDefault();
    noteTouch();
    var d = btn.getAttribute('data-dir');
    if (d === 'p') togglePause();
    else applyDir(+d);
  });

  function noteTouch() {
    if (touchy) return;
    touchy = true;
    document.body.classList.add('touch');
    pad.hidden = false;
    layout();
  }

  function swipeDir(dx, dy) {
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return -1;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? G.RIGHT : G.LEFT;
    return dy > 0 ? G.DOWN : G.UP;
  }

  function onSwipeDown(ev) {
    if (ev.target && ev.target.closest && ev.target.closest('#pad')) return;
    if (ev.pointerType === 'touch' || ev.pointerType === 'pen') noteTouch();
    swipe = { x: ev.clientX, y: ev.clientY, id: ev.pointerId, last: -1 };
    try { (playEl || stageEl).setPointerCapture(ev.pointerId); } catch (e) {}
  }
  function onSwipeMove(ev) {
    if (!swipe || swipe.id !== ev.pointerId) return;
    var dir = swipeDir(ev.clientX - swipe.x, ev.clientY - swipe.y);
    if (dir < 0 || dir === swipe.last) return;
    applyDir(dir);
    swipe.last = dir;
    swipe.x = ev.clientX; swipe.y = ev.clientY;
  }
  function onSwipeUp(ev) {
    if (!swipe || swipe.id !== ev.pointerId) return;
    var dx = ev.clientX - swipe.x, dy = ev.clientY - swipe.y;
    var had = swipe.last;
    swipe = null;
    if (had >= 0) return;
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) {
      if (view !== 'play') dlgGo.click();
      return;
    }
    applyDir(swipeDir(dx, dy));
  }
  var swipeRoot = playEl || stageEl;
  swipeRoot.addEventListener('pointerdown', onSwipeDown);
  swipeRoot.addEventListener('pointermove', onSwipeMove);
  swipeRoot.addEventListener('pointerup', onSwipeUp);
  swipeRoot.addEventListener('pointercancel', function () { swipe = null; });

  modeSel.addEventListener('change', function () {
    if (!mp && soloTimer) {
      clearInterval(soloTimer);
      soloTimer = setInterval(soloTick, speedMs());
    }
    savePrefs();
  });

  dlgGo.addEventListener('click', function () {
    if (view === 'play' && paused) { paused = false; hideDialog(); return; }
    if (presentCount() >= 2) {
      mp = true;
      if (arena && arena.playing) { onNewRound(arena); return; }
      if (isHost()) hostStartRound();
      else {
        dlgBody.textContent = 'Waiting for the next round…';
        dlgGo.textContent = 'Wait';
        if (dlgNew) dlgNew.hidden = true;
      }
      return;
    }
    if (savedRun && view === 'welcome') { resumeSolo(savedRun); return; }
    startSolo();
  });
  if (dlgNew) dlgNew.addEventListener('click', function () {
    savedRun = null;
    startSolo();
  });

  function onBack() {
    if (view === 'play' && !mp && !paused) { togglePause(); return true; }
    if (view === 'over' || (view === 'play' && paused)) {
      view = 'welcome';
      paused = false;
      if (soloTimer) { clearInterval(soloTimer); soloTimer = 0; }
      welcome();
      return true;
    }
    return false;
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && view === 'play' && !mp && !paused) togglePause();
  });

  /* ------------------------------------------------------------------ */
  /* paint                                                              */
  /* ------------------------------------------------------------------ */

  function hideDialog() {
    dialog.hidden = true;
    if (dlgNew) dlgNew.hidden = true;
  }
  function showDialog(title, body, go, extra) {
    dlgTitle.textContent = title;
    dlgBody.innerHTML = body;
    dlgGo.textContent = go || 'Play Game';
    if (dlgNew) {
      dlgNew.hidden = !extra;
      if (extra) dlgNew.textContent = extra;
    }
    dialog.hidden = false;
  }
  function welcome() {
    view = 'welcome';
    var touch = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || touchy;
    var how = touch
      ? 'Swipe the board, or use the <strong>pad</strong> under it.'
      : 'Use the <strong>arrow keys</strong> (or WASD) to play.';
    if (presentCount() >= 2) {
      how = 'A friend is here. Both snakes share one board. Last one moving wins.';
      showDialog('JavaScript Snake', how, 'Play together');
      return;
    }
    if (savedRun) {
      how = 'You have a game in this file. Pick up where you left off, or start a new one.';
      showDialog('JavaScript Snake', how, 'Resume', 'New game');
      return;
    }
    showDialog('JavaScript Snake', how, 'Play Game');
  }

  function layout() {
    var box = (playEl || stageEl).getBoundingClientRect();
    var padH = 0;
    if (pad && (document.body.classList.contains('touch') || (!pad.hidden && pad.offsetParent))) {
      var ph = pad.getBoundingClientRect().height;
      padH = (ph > 0 ? ph : 162) + 10;
    }
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    cell = Math.max(8, Math.floor(Math.min(box.width / G.COLS, Math.max(40, box.height - padH) / G.ROWS)));
    canvas.width = (G.COLS * cell * dpr) | 0;
    canvas.height = (G.ROWS * cell * dpr) | 0;
    canvas.style.width = (G.COLS * cell) + 'px';
    canvas.style.height = (G.ROWS * cell) + 'px';
  }

  function mix(a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t)
    ];
  }
  function rgb(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  function interpT(s) {
    if (!s || !s.prev || !s.stepAt) return 1;
    var ms = (mp && arena && arena.speed) ? arena.speed : speedMs();
    var t = (now() - s.stepAt) / (ms || 75);
    if (t >= 1) return 1;
    if (t <= 0) return 0;
    return t * t * (3 - 2 * t);
  }
  function lerpSeg(s, i, t) {
    var cur = s.body[i];
    if (!s.prev || t >= 1) return { x: cur.x, y: cur.y };
    var prev = i < s.prev.length ? s.prev[i] : s.prev[s.prev.length - 1];
    return { x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t };
  }

  function colorOf(id, index) {
    if (id === me.id) return G.colorForIndex(myIndex);
    var ids = presentIds();
    var ix = ids.indexOf(id);
    if (ix < 0) ix = index || 1;
    return G.colorForIndex(ix);
  }

  function strokeBody(pts, width, color) {
    if (pts.length < 1) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    var s = cell * dpr;
    ctx.moveTo(pts[0].x * s + s / 2, pts[0].y * s + s / 2);
    for (var i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x * s + s / 2, pts[i].y * s + s / 2);
    }
    if (pts.length === 1) {
      ctx.lineTo(pts[0].x * s + s / 2 + 0.01, pts[0].y * s + s / 2);
    }
    ctx.stroke();
  }

  function drawEyes(head, dir, s, mine) {
    var px = head.x * s + s / 2, py = head.y * s + s / 2;
    var fx = G.DX[dir], fy = G.DY[dir];
    var pxp = -fy, pyp = fx;
    var dist = s * 0.18, side = s * 0.16, r = Math.max(1.4, s * 0.09);
    ctx.fillStyle = mine ? '#0b1a10' : '#141414';
    ctx.beginPath();
    ctx.arc(px + fx * dist + pxp * side, py + fy * dist + pyp * side, r, 0, Math.PI * 2);
    ctx.arc(px + fx * dist - pxp * side, py + fy * dist - pyp * side, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    var gl = r * 0.4;
    ctx.beginPath();
    ctx.arc(px + fx * dist + pxp * side - gl, py + fy * dist + pyp * side - gl, Math.max(0.6, r * 0.35), 0, Math.PI * 2);
    ctx.arc(px + fx * dist - pxp * side - gl, py + fy * dist - pyp * side - gl, Math.max(0.6, r * 0.35), 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSnake(s, id, index, dead) {
    if (!s || !s.body || !s.body.length) return;
    var col = colorOf(id, index);
    var mine = id === me.id;
    if (dead || s.alive === false) col = mix(col, [20, 20, 50], 0.62);
    var t = (dead || s.alive === false) ? 1 : interpT(s);
    var pts = [];
    for (var i = s.body.length - 1; i >= 0; i--) pts.push(lerpSeg(s, i, t));
    var w = cell * dpr;
    var thick = w * (mine ? 0.86 : 0.8);
    strokeBody(pts, thick + 2.2 * dpr, rgba(mix(col, [0, 0, 0], 0.45), 0.95));
    strokeBody(pts, thick, rgb(col));
    var hi = mix(col, [255, 255, 255], mine ? 0.38 : 0.22);
    strokeBody(pts, thick * 0.42, rgba(hi, 0.55));
    var head = pts[pts.length - 1];
    var hs = w;
    var hx = head.x * hs + hs / 2, hy = head.y * hs + hs / 2;
    var flash = mine && now() < flashUntil;
    ctx.beginPath();
    ctx.fillStyle = rgb(flash ? mix(col, [255, 255, 255], 0.55) : mix(col, [255, 255, 255], 0.18));
    ctx.arc(hx, hy, thick * 0.58, 0, Math.PI * 2);
    ctx.fill();
    if (mine) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = Math.max(1, dpr);
      ctx.stroke();
    }
    var dir = G.facing(s);
    if (dead || s.alive === false) {
      var ssz = hs;
      var hx2 = head.x * ssz + ssz / 2, hy2 = head.y * ssz + ssz / 2;
      var r = Math.max(2, ssz * 0.16);
      ctx.strokeStyle = 'rgba(20,20,30,0.85)';
      ctx.lineWidth = Math.max(1.5, dpr);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx2 - r, hy2 - r); ctx.lineTo(hx2 + r, hy2 + r);
      ctx.moveTo(hx2 + r, hy2 - r); ctx.lineTo(hx2 - r, hy2 + r);
      ctx.stroke();
    } else {
      drawEyes(head, dir, hs, mine);
    }
  }

  function drawApple(ap) {
    if (!ap) return;
    var s = cell * dpr;
    var cx = ap.x * s + s / 2, cy = ap.y * s + s / 2;
    var r = s * 0.38;
    ctx.fillStyle = FOOD;
    ctx.beginPath();
    ctx.arc(cx, cy + s * 0.04, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = FOOD_HI;
    ctx.beginPath();
    ctx.arc(cx - r * 0.28, cy - r * 0.18, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = LEAF;
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.35, cy - r * 0.7, r * 0.34, r * 0.2, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a7a38';
    ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.7);
    ctx.lineTo(cx, cy - r * 1.05);
    ctx.stroke();
  }

  function paint() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = FIELD;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    var s = cell * dpr;
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = Math.max(1, dpr * 0.6);
    ctx.beginPath();
    for (var gx = 1; gx < G.COLS; gx++) {
      ctx.moveTo(gx * s, 0); ctx.lineTo(gx * s, canvas.height);
    }
    for (var gy = 1; gy < G.ROWS; gy++) {
      ctx.moveTo(0, gy * s); ctx.lineTo(canvas.width, gy * s);
    }
    ctx.stroke();

    var ap = mp && arena && arena.ax != null ? { x: arena.ax, y: arena.ay } : apple;
    drawApple(ap);

    var n = 0;
    for (var id in others) { n++; drawSnake(others[id], id, n, !others[id].alive); }
    drawSnake(snake, me.id, myIndex, !snake.alive);
  }

  function paintHud() {
    var n = G.lengthOf(snake);
    lenEl.textContent = 'Length: ' + n;
    hiEl.textContent = 'Highscore: ' + high;
    if (mp) {
      rosterEl.hidden = false;
      var bits = [];
      var ids = presentIds();
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i], col = G.colorForIndex(i);
        var name, alive, len;
        if (id === me.id) { name = me.name; alive = snake.alive; len = G.lengthOf(snake); }
        else { var o = others[id]; name = (o && o.name) || 'Player'; alive = o && o.alive; len = (o && o.len) || 1; }
        var sw = '<span style="color:rgb(' + col[0] + ',' + col[1] + ',' + col[2] + ')">●</span> ';
        bits.push('<span class="' + (id === me.id ? 'me ' : '') + (alive ? '' : 'dead') + '">' + sw +
          escapeHtml(name) + ' · ' + len + '</span>');
      }
      rosterEl.innerHTML = bits.join('');
    } else {
      rosterEl.hidden = true;
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function frame() {
    paint();
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', layout);

  /* ------------------------------------------------------------------ */
  /* boot                                                               */
  /* ------------------------------------------------------------------ */

  function boot() {
    layout();
    welcome();
    paintHud();
    requestAnimationFrame(frame);
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) noteTouch();

    var api = window.gifos;
    if (api && api.db) {
      try { prefsDb = api.db('prefs'); } catch (e) {}
      try { snakesDb = api.db('snakes'); } catch (e) {}
      try { arenaDb = api.db('arena'); } catch (e) {}
      loadPrefs().then(function () {
        if (view === 'welcome') welcome();
      });
      var who = api.me ? api.me() : Promise.resolve({ id: 'local', name: 'You' });
      Promise.resolve(who).then(function (id) {
        me.id = (id && id.id) || 'local';
        me.name = (id && id.name) || 'You';
        if (snakesDb) snakesDb.subscribe(function (list) { ingestSnakes(list || []); });
        if (arenaDb) arenaDb.subscribe(function (list) { ingestArena(list || []); });
        publish(true);
        if (hbTimer) clearInterval(hbTimer);
        hbTimer = setInterval(function () { publish(true); }, HB_MS);
      }).catch(function () {});
    }
    if (api && api.onBack) {
      api.onBack(function () { return onBack(); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
