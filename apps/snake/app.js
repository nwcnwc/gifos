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
  var FIELD = '#0000a8', FOOD = '#ff3030', FOOD_HI = '#ffd24a';

  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  var lenEl = document.getElementById('len');
  var hiEl = document.getElementById('hi');
  var rosterEl = document.getElementById('roster');
  var dialog = document.getElementById('dialog');
  var dlgTitle = document.getElementById('dlg-title');
  var dlgBody = document.getElementById('dlg-body');
  var dlgGo = document.getElementById('dlg-go');
  var modeSel = document.getElementById('mode');
  var modesEl = document.getElementById('modes');
  var pad = document.getElementById('pad');

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
      others[p.id] = {
        id: p.id,
        name: p.name || 'Player',
        d: p.d,
        x: p.x, y: p.y,
        body: body.length ? body : [{ x: p.x, y: p.y }],
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
    if (a.speed && modeSel.value !== String(a.speed) && mp) modeSel.value = String(a.speed);
    if (mp && a.round !== prevRound) onNewRound(a);
    if (mp && view === 'play' && a.playing && a.tick !== prevTick) catchUp(a.tick);
    if (mp && a.winner && view === 'play') showWinner(a);
  }

  function enterMp() {
    mp = true;
    modesEl.hidden = true;
    rosterEl.hidden = false;
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
        var r = G.stepSnake(snake, snakesList(), ap);
        if (r.ate) ateGen = arena.gen;
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
    hideDialog();
    if (soloTimer) { clearInterval(soloTimer); soloTimer = 0; }
    paintHud();
  }

  function soloTick() {
    if (view !== 'play' || paused || mp) return;
    if (snake.d < 0) return;
    var r = G.stepSnake(snake, [snake], apple);
    if (r.ate) {
      apple = G.randomApple([snake]) || apple;
      saveHi(G.lengthOf(snake));
    }
    if (r.died) {
      if (soloTimer) { clearInterval(soloTimer); soloTimer = 0; }
      saveHi(G.lengthOf(snake));
      view = 'over';
      showDialog('JavaScript Snake', 'You died :(', 'Play Again?');
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
    if (view === 'welcome') { dlgGo.click(); return; }
    if (view === 'over') { dlgGo.click(); return; }
    if (view !== 'play') return;
    G.setDir(snake, dir);
    if (!mp) ensureSoloLoop();
    publish(true);
  }

  function togglePause() {
    if (view !== 'play' || mp) return;
    paused = !paused;
    if (paused) showDialog('[Paused]', 'Press space or the pad to unpause.', 'Resume');
    else hideDialog();
  }

  window.addEventListener('keydown', function (ev) {
    var dir = G.keyToDir(ev.keyCode || ev.which);
    if (dir >= 0) { ev.preventDefault(); applyDir(dir); return; }
    if ((ev.keyCode || ev.which) === 32) { ev.preventDefault(); togglePause(); }
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
  }

  canvas.addEventListener('pointerdown', function (ev) {
    if (ev.pointerType === 'touch' || ev.pointerType === 'pen') noteTouch();
    swipe = { x: ev.clientX, y: ev.clientY, id: ev.pointerId };
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
  });
  canvas.addEventListener('pointerup', function (ev) {
    if (!swipe || swipe.id !== ev.pointerId) return;
    var dx = ev.clientX - swipe.x, dy = ev.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) < 24 && Math.abs(dy) < 24) {
      if (view !== 'play') dlgGo.click();
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) applyDir(dx > 0 ? G.RIGHT : G.LEFT);
    else applyDir(dy > 0 ? G.DOWN : G.UP);
  });
  canvas.addEventListener('pointercancel', function () { swipe = null; });

  modeSel.addEventListener('change', function () {
    if (!mp && soloTimer) {
      clearInterval(soloTimer);
      soloTimer = setInterval(soloTick, speedMs());
    }
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
      }
      return;
    }
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

  /* ------------------------------------------------------------------ */
  /* paint                                                              */
  /* ------------------------------------------------------------------ */

  function hideDialog() { dialog.hidden = true; }
  function showDialog(title, body, go) {
    dlgTitle.textContent = title;
    dlgBody.innerHTML = body;
    dlgGo.textContent = go || 'Play Game';
    dialog.hidden = false;
  }
  function welcome() {
    view = 'welcome';
    var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    var how = touch
      ? 'Use the <strong>on-screen pad</strong> or swipe the board.'
      : 'Use the <strong>arrow keys</strong> (or WASD) to play.';
    if (presentCount() >= 2) {
      how = 'A friend is here. Both snakes share one board. Last one moving wins.';
    }
    showDialog('JavaScript Snake', how, presentCount() >= 2 ? 'Play together' : 'Play Game');
  }

  function layout() {
    var stage = document.getElementById('stage').getBoundingClientRect();
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    cell = Math.max(8, Math.floor(Math.min(stage.width / G.COLS, stage.height / G.ROWS)));
    canvas.width = (G.COLS * cell * dpr) | 0;
    canvas.height = (G.ROWS * cell * dpr) | 0;
    canvas.style.width = (G.COLS * cell) + 'px';
    canvas.style.height = (G.ROWS * cell) + 'px';
  }

  function paintCell(x, y, rgb, head) {
    var s = cell * dpr, px = x * s, py = y * s;
    var r = rgb[0], g = rgb[1], b = rgb[2];
    if (head) { r = Math.min(255, r + 50); g = Math.min(255, g + 50); b = Math.min(255, b + 40); }
    ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
    ctx.fillRect(px + 1, py + 1, s - 2, s - 2);
    ctx.fillStyle = 'rgba(255,255,255,' + (head ? 0.28 : 0.12) + ')';
    ctx.fillRect(px + 1, py + 1, s - 2, Math.max(2, s * 0.28));
  }

  function colorOf(id, index) {
    if (id === me.id) return G.colorForIndex(myIndex);
    var ids = presentIds();
    var ix = ids.indexOf(id);
    if (ix < 0) ix = index || 1;
    return G.colorForIndex(ix);
  }

  function paint() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = FIELD;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    var ap = mp && arena && arena.ax != null ? { x: arena.ax, y: arena.ay } : apple;
    if (ap) {
      var s = cell * dpr, px = ap.x * s, py = ap.y * s;
      ctx.fillStyle = FOOD;
      ctx.fillRect(px + 1, py + 1, s - 2, s - 2);
      ctx.fillStyle = FOOD_HI;
      ctx.fillRect(px + s * 0.28, py + s * 0.28, s * 0.32, s * 0.32);
    }

    var n = 0;
    function drawSnake(s, id, index, dead) {
      if (!s || !s.body) return;
      var col = colorOf(id, index);
      if (dead || s.alive === false) col = [Math.round(col[0] * 0.35), Math.round(col[1] * 0.35), Math.round(col[2] * 0.4)];
      for (var i = s.body.length - 1; i >= 0; i--) {
        paintCell(s.body[i].x, s.body[i].y, col, i === 0);
      }
    }
    drawSnake(snake, me.id, myIndex, !snake.alive);
    for (var id in others) { n++; drawSnake(others[id], id, n, !others[id].alive); }
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
      loadHi();
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
