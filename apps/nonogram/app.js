/*
 * Nonogram — shell: canvas, fill/cross pad, save, race wiring.
 *
 * Solo is the original game. When someone else is in the room (Invite is
 * OS chrome, in the GifOS menu), a puzzle is dealt and both boards are
 * the same. First to finish wins; times ride on each player's own row.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var Status = window.nonogram && nonogram.Status;
  var Game = window.nonogram && nonogram.Game;
  var NGP = window.NGPuzzles;
  var canvas = $('board');
  var saveDb = null, prefsDb = null;
  var saveTimer = 0;
  var tickTimer = 0;
  var raceMode = false;
  var appliedAt = 0;
  var autoDealt = false;
  var skipSave = false;
  var game = null;
  var puzzle = null;

  var G = {
    size: 5,
    index: 0,
    seconds: 0,
    running: true,
    won: false,
    hist: [],
    hi: -1
  };

  function fmtTime(s) {
    s = Math.max(0, s | 0);
    var m = (s / 60) | 0, r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function newIndex(size, avoid) {
    var i, tries = 0;
    var span = Math.max(24, NGP.bankCount(size) + 16);
    do {
      i = (Math.random() * span) | 0;
      tries++;
    } while (i === avoid && span > 1 && tries < 8);
    return i;
  }

  function snapGrid() {
    return game ? game.dumpGrid() : null;
  }

  function progressOf() {
    return NGP.progress(snapGrid(), puzzle && puzzle.grid);
  }

  function snap() {
    var p = progressOf();
    return {
      size: G.size,
      index: G.index,
      filled: p.filled,
      total: p.total,
      time: G.seconds,
      won: G.won
    };
  }

  function publish(force) {
    if (window.NGNet && NGNet.ready()) NGNet.publish(snap(), !!force);
  }

  function persist(force) {
    if (skipSave || raceMode || !saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    var write = function () {
      saveTimer = 0;
      saveDb.put({
        id: 'game',
        size: G.size,
        index: G.index,
        grid: snapGrid(),
        seconds: G.seconds,
        won: G.won
      }).catch(function () {});
    };
    if (force) write();
    else saveTimer = setTimeout(write, 250);
  }

  function savePrefs() {
    if (!prefsDb) return;
    prefsDb.put({ id: 'settings', lastSize: G.size }).catch(function () {});
  }

  function recordHist() {
    var g = snapGrid();
    if (!g) return;
    G.hist = G.hist.slice(0, G.hi + 1);
    G.hist.push(g.map(function (row) { return row.slice(); }));
    G.hi = G.hist.length - 1;
    $('undo').disabled = G.hi <= 0;
  }

  function paintBrush() {
    var fill = game && game.brush === Status.FILLED;
    $('fillBtn').setAttribute('aria-pressed', fill ? 'true' : 'false');
    $('crossBtn').setAttribute('aria-pressed', fill ? 'false' : 'true');
  }

  function fitCanvas() {
    if (!game) return;
    var w = canvas.clientWidth || 320;
    game.resize(w);
  }

  function onWon() {
    G.won = true;
    G.running = false;
    if (game) game.locked = true;
    persist(true);
    publish(true);
    renderChrome();
  }

  function mountGame(state) {
    puzzle = NGP.pick(G.size, G.index);
    if (game && game.canvas) {
      game.listeners.forEach(function (pair) {
        canvas.removeEventListener(pair[0], pair[1]);
      });
    }
    game = new Game(puzzle.row, puzzle.column, canvas, {
      theme: { width: canvas.clientWidth || 320, boldMeshGap: G.size >= 10 ? 5 : 0 },
      onSuccess: onWon,
      onChange: function (info) {
        paintBrush();
        if (G.won) return;
        if (!info || info.i == null) return;
        if (!G.running) G.running = true;
        recordHist();
        persist();
        publish();
      }
    });
    G.won = false;
    G.running = true;
    if (state && state.grid) {
      game.applyGrid(state.grid, { silent: true });
      G.won = game.isSolved();
      G.running = !G.won;
      G.seconds = state.seconds || 0;
    } else {
      G.seconds = 0;
    }
    G.hist = [game.dumpGrid()];
    G.hi = 0;
    if (G.won) game.locked = true;
    $('size').value = String(G.size);
    $('puz').textContent = '#' + (G.index + 1);
    $('undo').disabled = true;
    paintBrush();
    fitCanvas();
    persist(true);
    publish(true);
    renderChrome();
  }

  function renderChrome() {
    $('timer').textContent = fmtTime(G.seconds);
    $('overlay').hidden = G.running || G.won;
    $('won').hidden = !G.won || raceMode;
    if (G.won && !raceMode) {
      $('won-msg').textContent = 'You finished.';
      $('won-time').textContent = fmtTime(G.seconds);
    }
    $('size').disabled = raceMode;
    $('undo').disabled = G.hi <= 0 || G.won;
  }

  function undo() {
    if (G.won || G.hi <= 0 || !game) return;
    G.hi--;
    game.locked = false;
    game.applyGrid(G.hist[G.hi], { silent: true });
    G.won = game.isSolved();
    persist();
    publish();
    renderChrome();
  }

  function hint() {
    if (!game || G.won || !puzzle) return;
    var i, j, found = null;
    for (i = 0; i < puzzle.m && !found; i++) {
      for (j = 0; j < puzzle.n; j++) {
        if (puzzle.grid[i][j] === NGP.FILLED && game.grid[i][j] !== Status.FILLED) {
          found = { i: i, j: j, v: Status.FILLED };
          break;
        }
      }
    }
    if (!found) {
      for (i = 0; i < puzzle.m && !found; i++) {
        for (j = 0; j < puzzle.n; j++) {
          if (puzzle.grid[i][j] !== NGP.FILLED && game.grid[i][j] === Status.UNSET) {
            found = { i: i, j: j, v: Status.EMPTY };
            break;
          }
        }
      }
    }
    if (!found) return;
    if (!G.running) G.running = true;
    var next = game.dumpGrid();
    next[found.i][found.j] = found.v;
    game.applyGrid(next, { silent: true });
    recordHist();
    if (game.isSolved()) onWon();
    else {
      persist();
      publish();
      renderChrome();
    }
  }

  function dealRace() {
    var index = newIndex(G.size, G.index);
    window.NGNet.deal({ size: G.size, index: index });
  }

  function enterRace(rec) {
    if (!rec || rec.size == null) return;
    raceMode = true;
    skipSave = true;
    appliedAt = rec.at;
    G.size = rec.size | 0;
    G.index = rec.index | 0;
    mountGame(null);
    G.seconds = 0;
    G.won = false;
    G.running = true;
    $('race').hidden = false;
    renderChrome();
  }

  function winnerOf(list, rec) {
    var best = null, i, p;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (!p || !p.won) continue;
      if (rec && (p.size !== rec.size || p.index !== rec.index)) continue;
      if (!best || p.time < best.time || (p.time === best.time && p.mine)) best = p;
    }
    return best;
  }

  function isManager(list) {
    var id = window.NGNet.me().id;
    if (!id) return true;
    var min = id, i;
    for (i = 0; i < list.length; i++) if (list[i] && list[i].id && list[i].id < min) min = list[i].id;
    return id === min;
  }

  function renderRace(list) {
    list = list || [];
    var others = 0, i;
    for (i = 0; i < list.length; i++) if (!list[i].mine) others++;
    var rec = window.NGNet.race();
    var inRoom = others > 0 || !!rec;
    var hintEl = $('invite-hint');
    if (hintEl) hintEl.hidden = !window.NGNet.ready();
    if (!inRoom) {
      if (raceMode) {
        raceMode = false;
        skipSave = false;
        persist(true);
      }
      $('race').hidden = true;
      return;
    }
    $('race').hidden = false;
    var rows = $('race-rows');
    if (!rows) return;
    var win = winnerOf(list, rec);
    rows.innerHTML = '';
    list.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'race-row' + (p.mine ? ' me' : '') + (win && win.id === p.id ? ' win' : '');
      var name = document.createElement('span');
      name.className = 'who';
      name.textContent = p.mine ? (p.name || 'You') : (p.name || 'Player');
      var time = document.createElement('span');
      time.className = 'when';
      time.textContent = fmtTime(p.time);
      var bar = document.createElement('span');
      bar.className = 'bar-track';
      var fill = document.createElement('span');
      fill.className = 'bar-fill';
      var pct = p.total ? Math.max(0, Math.min(100, Math.round((p.filled || 0) / p.total * 100))) : 0;
      fill.style.width = pct + '%';
      fill.style.background = 'hsl(' + (p.hue || 190) + ' 70% 45%)';
      bar.appendChild(fill);
      var st = document.createElement('span');
      st.className = 'state';
      st.textContent = p.won ? 'done' : (pct + '%');
      row.appendChild(name);
      row.appendChild(time);
      row.appendChild(bar);
      row.appendChild(st);
      rows.appendChild(row);
    });
    var note = $('race-note');
    var again = $('againBtn');
    if (win) {
      note.textContent = (win.mine ? 'You' : win.name) + ' wins in ' + fmtTime(win.time) + '.';
      again.hidden = false;
    } else if (others === 0) {
      note.textContent = 'Waiting — Invite (top bar) to race a friend. Same puzzle, first to finish.';
      again.hidden = true;
    } else {
      note.textContent = 'Same puzzle. First to finish wins.';
      again.hidden = true;
    }
  }

  function pause(on) {
    if (G.won) return;
    G.running = !on;
    renderChrome();
  }

  function newGame() {
    if (raceMode) { dealRace(); return; }
    G.index = newIndex(G.size, G.index);
    mountGame(null);
  }

  function tick() {
    if (!G.running || G.won) return;
    if (document.hidden) return;
    G.seconds++;
    $('timer').textContent = fmtTime(G.seconds);
    persist();
    publish();
  }

  $('fillBtn').addEventListener('click', function () {
    if (!game || G.won) return;
    game.setBrush(Status.FILLED);
    paintBrush();
  });
  $('crossBtn').addEventListener('click', function () {
    if (!game || G.won) return;
    game.setBrush(Status.EMPTY);
    paintBrush();
  });
  $('undo').addEventListener('click', undo);
  $('hint').addEventListener('click', hint);
  $('new').addEventListener('click', newGame);
  $('timer').addEventListener('click', function () { if (!G.won) pause(G.running); });
  $('continueBtn').addEventListener('click', function () { pause(false); });
  $('won-next').addEventListener('click', newGame);
  $('againBtn').addEventListener('click', function () { if (raceMode) dealRace(); });
  $('size').addEventListener('change', function () {
    G.size = +$('size').value || 5;
    savePrefs();
    if (!raceMode) newGame();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && G.running && !G.won) pause(true);
  });
  window.addEventListener('pagehide', function () { persist(true); });
  window.addEventListener('resize', fitCanvas);

  if (window.gifos && gifos.onBack) {
    gifos.onBack(function () {
      if (G.running && !G.won) { pause(true); return true; }
    });
  }

  tickTimer = setInterval(tick, 1000);

  function boot() {
    var api = window.gifos;
    try {
      if (api && api.db) {
        saveDb = api.db('save');
        prefsDb = api.db('prefs');
      }
    } catch (e) {}

    var loadPrefs = prefsDb ? prefsDb.get('settings') : Promise.resolve(null);
    var loadSave = saveDb ? saveDb.get('game') : Promise.resolve(null);

    return Promise.all([loadPrefs, loadSave]).then(function (pair) {
      var rec = pair[0], saved = pair[1];
      if (rec && rec.lastSize && NGP.SIZES.indexOf(rec.lastSize) >= 0) G.size = rec.lastSize;
      if (saved && saved.size && saved.grid) {
        G.size = saved.size;
        G.index = saved.index || 0;
        mountGame(saved);
      } else {
        mountGame(null);
      }
    }).catch(function () {
      mountGame(null);
    }).then(function () {
      if (!window.NGNet) return;
      return window.NGNet.init({
        onRace: function (rec) {
          if (!rec || rec.at === appliedAt) return;
          enterRace(rec);
        },
        onRoster: function (list) {
          var rec = window.NGNet.race();
          var others = window.NGNet.others();
          if (others > 0 && !rec && !autoDealt && isManager(list)) {
            autoDealt = true;
            dealRace();
          } else if (rec && !raceMode) enterRace(rec);
          renderRace(list);
        }
      });
    }).then(function (st) {
      if (st && st.ok && $('invite-hint')) $('invite-hint').hidden = false;
      publish(true);
    });
  }

  boot();
})();
