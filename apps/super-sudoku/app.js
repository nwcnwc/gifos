/*
 * Super Sudoku — shell: board, number pad, save, race wiring.
 *
 * Solo is the original game. When someone else is in the room (Invite is
 * OS chrome, in the GifOS menu), a puzzle is dealt and both boards are
 * the same. First to finish wins; times ride on each player's own row.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var SS = window.SS;
  var cellEls = [];
  var padEls = [];
  var saveDb = null, prefsDb = null;
  var saveTimer = 0;
  var tickTimer = 0;
  var raceMode = false;
  var appliedAt = 0;
  var autoDealt = false;
  var skipSave = false;

  var prefs = {
    showHints: false,
    showWrong: false,
    showConflicts: true,
    showOcc: true,
    dark: false
  };

  var G = {
    cells: [],
    hist: [],
    hi: 0,
    active: null,
    notesMode: false,
    diff: 'easy',
    index: 0,
    seconds: 0,
    running: true,
    won: false,
    hints: 0,
    clipboard: null
  };

  function now() { return Date.now(); }

  function fmtTime(s) {
    s = Math.max(0, s | 0);
    var m = (s / 60) | 0, r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function puzzleOf(diff, index) {
    return SS.pick(diff, index);
  }

  function newIndex(diff, avoid) {
    var L = SS.list(diff);
    if (!L.length) return 0;
    var i, tries = 0;
    do {
      i = (Math.random() * L.length) | 0;
      tries++;
    } while (i === avoid && L.length > 1 && tries < 8);
    return i;
  }

  function snapshot(next) {
    G.hist = G.hist.slice(0, G.hi + 1);
    G.hist.push(SS.cloneCells(next));
    G.hi = G.hist.length - 1;
  }

  function loadPuzzle(diff, index, state) {
    var p = puzzleOf(diff, index);
    G.diff = p.diff;
    G.index = p.index;
    G.cells = SS.makeCells(p.str);
    if (state && state.nums) G.cells = SS.applyState(G.cells, state.nums, state.notes);
    G.hist = [SS.cloneCells(G.cells)];
    G.hi = 0;
    G.won = SS.isSolved(G.cells);
    G.seconds = (state && state.seconds) || 0;
    G.hints = (state && state.hints) || 0;
    G.running = !G.won;
    G.active = G.active || { x: 0, y: 0 };
    $('diff').value = G.diff;
    persist(true);
    publish(true);
    render();
  }

  function persist(force) {
    if (skipSave || raceMode || !saveDb) return;
    if (saveTimer) clearTimeout(saveTimer);
    var write = function () {
      saveTimer = 0;
      var dump = SS.dumpState(G.cells);
      saveDb.put({
        id: 'game',
        diff: G.diff,
        index: G.index,
        nums: dump.nums,
        notes: dump.notes,
        seconds: G.seconds,
        won: G.won,
        hints: G.hints
      }).catch(function () {});
    };
    if (force) write();
    else saveTimer = setTimeout(write, 250);
  }

  function savePrefs() {
    if (!prefsDb) return;
    prefsDb.put({
      id: 'settings',
      showHints: prefs.showHints,
      showWrong: prefs.showWrong,
      showConflicts: prefs.showConflicts,
      showOcc: prefs.showOcc,
      dark: prefs.dark,
      lastDiff: G.diff
    }).catch(function () {});
  }

  function applyDark() {
    document.documentElement.classList.toggle('dark', !!prefs.dark);
  }

  function snap() {
    return {
      diff: G.diff,
      index: G.index,
      filled: SS.filled(G.cells),
      empty: SS.empties(G.cells),
      time: G.seconds,
      won: G.won,
      hints: G.hints
    };
  }

  function publish(force) {
    if (window.SSNet && SSNet.ready()) SSNet.publish(snap(), !!force);
  }

  function setCells(next, record) {
    if (record) snapshot(next);
    G.cells = next;
    if (SS.isSolved(G.cells)) {
      G.won = true;
      G.running = false;
    }
    persist();
    publish();
    render();
  }

  function activeCell() {
    if (!G.active) return null;
    return SS.cellAt(G.cells, G.active.x, G.active.y);
  }

  function place(n) {
    var c = activeCell();
    if (!c || c.initial || G.won) return;
    if (!G.running) { G.running = true; }
    if (G.notesMode) {
      var conf = SS.conflicting(G.cells);
      var user = c.notes.slice();
      var auto = prefs.showHints ? (conf[SS.idx(c.x, c.y)].possibilities || []) : [];
      var start = user.length === 0 && auto.length ? auto : user;
      var nextNotes = start.indexOf(n) >= 0
        ? start.filter(function (v) { return v !== n; })
        : user.concat([n]);
      setCells(SS.setNotes(G.cells, c.x, c.y, nextNotes), true);
    } else {
      setCells(SS.setNumber(G.cells, c.x, c.y, n), true);
    }
  }

  function erase() {
    var c = activeCell();
    if (!c || c.initial || G.won) return;
    setCells(SS.clearCell(G.cells, c.x, c.y), true);
  }

  function hint() {
    var c = activeCell();
    if (!c || c.initial || G.won) return;
    G.hints++;
    setCells(SS.getHint(G.cells, c.x, c.y), true);
  }

  function undo() {
    if (G.hi <= 0) return;
    G.hi--;
    G.cells = SS.cloneCells(G.hist[G.hi]);
    G.won = SS.isSolved(G.cells);
    persist();
    publish();
    render();
  }

  function redo() {
    if (G.hi >= G.hist.length - 1) return;
    G.hi++;
    G.cells = SS.cloneCells(G.hist[G.hi]);
    G.won = SS.isSolved(G.cells);
    persist();
    publish();
    render();
  }

  function select(x, y, notes) {
    G.active = { x: x, y: y };
    if (notes) G.notesMode = true;
    render();
  }

  function toggleNotes() {
    G.notesMode = !G.notesMode;
    render();
  }

  function pause(on) {
    if (G.won) return;
    G.running = !on;
    render();
  }

  function dealRace() {
    var index = newIndex(G.diff, G.index);
    window.SSNet.deal({ diff: G.diff, index: index });
  }

  function enterRace(rec) {
    if (!rec || rec.diff == null) return;
    raceMode = true;
    skipSave = true;
    appliedAt = rec.at;
    loadPuzzle(rec.diff, rec.index, null);
    G.seconds = 0;
    G.hints = 0;
    G.won = SS.isSolved(G.cells);
    G.running = !G.won;
    $('race').hidden = false;
  }

  function winnerOf(list, rec) {
    var best = null, i, p;
    for (i = 0; i < list.length; i++) {
      p = list[i];
      if (!p || !p.won) continue;
      if (rec && (p.diff !== rec.diff || p.index !== rec.index)) continue;
      if (!best || p.time < best.time || (p.time === best.time && p.mine)) best = p;
    }
    return best;
  }

  function isManager(list) {
    var id = window.SSNet.me().id;
    if (!id) return true;
    var min = id, i;
    for (i = 0; i < list.length; i++) if (list[i] && list[i].id && list[i].id < min) min = list[i].id;
    return id === min;
  }

  function renderRace(list) {
    list = list || [];
    var others = 0, i;
    for (i = 0; i < list.length; i++) if (!list[i].mine) others++;
    var rec = window.SSNet.race();
    var inRoom = others > 0 || !!rec;
    var hintEl = $('invite-hint');
    if (hintEl) hintEl.hidden = !window.SSNet.ready();
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
      var pct = Math.max(0, Math.min(100, Math.round((p.filled || 0) / 81 * 100)));
      fill.style.width = pct + '%';
      fill.style.background = 'hsl(' + (p.hue || 170) + ' 70% 45%)';
      bar.appendChild(fill);
      var st = document.createElement('span');
      st.className = 'state';
      if (p.won) st.textContent = 'done';
      else if (p.hints) st.textContent = pct + '% · ' + p.hints + ' hint' + (p.hints === 1 ? '' : 's');
      else st.textContent = pct + '%';
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

  function buildBoard() {
    var board = $('board'), x, y, cell, num, notes, n, sp;
    board.innerHTML = '';
    cellEls = [];
    for (y = 0; y < 9; y++) for (x = 0; x < 9; x++) {
      cell = document.createElement('div');
      cell.className = 'cell';
      cell.setAttribute('role', 'gridcell');
      cell.dataset.x = String(x);
      cell.dataset.y = String(y);
      num = document.createElement('span');
      num.className = 'num';
      notes = document.createElement('span');
      notes.className = 'notes';
      for (n = 1; n <= 9; n++) {
        sp = document.createElement('span');
        notes.appendChild(sp);
      }
      cell.appendChild(num);
      cell.appendChild(notes);
      board.appendChild(cell);
      cellEls.push(cell);
    }
    board.addEventListener('click', function (e) {
      var t = e.target.closest('.cell');
      if (!t) return;
      select(+t.dataset.x, +t.dataset.y, false);
    });
    board.addEventListener('contextmenu', function (e) {
      var t = e.target.closest('.cell');
      if (!t) return;
      e.preventDefault();
      select(+t.dataset.x, +t.dataset.y, true);
    });
  }

  function buildPad() {
    var pad = $('pad'), n, b, occ;
    pad.innerHTML = '';
    padEls = [];
    for (n = 1; n <= 9; n++) {
      b = document.createElement('button');
      b.type = 'button';
      b.dataset.n = String(n);
      b.setAttribute('aria-label', 'Set ' + n);
      b.appendChild(document.createTextNode(String(n)));
      occ = document.createElement('span');
      occ.className = 'occ';
      b.appendChild(occ);
      pad.appendChild(b);
      padEls.push(b);
    }
    pad.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      place(+t.dataset.n);
    });
  }

  function render() {
    var conf = SS.conflicting(G.cells);
    var act = G.active ? SS.cellAt(G.cells, G.active.x, G.active.y) : null;
    var pals = act ? SS.friends(act, G.cells) : [];
    var palSet = {};
    pals.forEach(function (c) { palSet[c.x + ',' + c.y] = 1; });
    var i, c, el, notes, n, auto, showNotes, inConflict, wrong;

    for (i = 0; i < 81; i++) {
      c = G.cells[i];
      el = cellEls[i];
      inConflict = false;
      if (prefs.showConflicts && c.number) {
        conf[i].conflicting.forEach(function (o) {
          if (o.number === c.number) inConflict = true;
        });
      }
      wrong = prefs.showWrong && c.number && c.number !== c.solution;
      el.className = 'cell'
        + (c.initial ? ' given' : '')
        + (act && act.x === c.x && act.y === c.y ? ' active' : '')
        + (G.notesMode ? ' notes' : '')
        + (palSet[c.x + ',' + c.y] && !(act && act.x === c.x && act.y === c.y) ? ' hl' : '')
        + (act && act.number && c.number === act.number && !(act.x === c.x && act.y === c.y) ? ' hl-num' : '')
        + (inConflict || wrong ? ' conflict' : '');
      el.querySelector('.num').textContent = c.number ? String(c.number) : '';
      notes = el.querySelector('.notes');
      auto = (prefs.showHints && !c.notes.length) ? (conf[i].possibilities || []) : [];
      showNotes = !c.number && !c.initial ? (c.notes.length ? c.notes : auto) : [];
      for (n = 1; n <= 9; n++) {
        notes.children[n - 1].textContent = showNotes.indexOf(n) >= 0 ? String(n) : '';
      }
    }

    var userNotes = act && !act.number ? act.notes : [];
    for (n = 1; n <= 9; n++) {
      var count = SS.countOf(G.cells, n);
      var btn = padEls[n - 1];
      btn.className = (count >= 9 ? 'full' : '') + (count > 9 ? ' over' : '')
        + (G.notesMode && userNotes.indexOf(n) >= 0 ? ' on-note' : '');
      var occ = btn.querySelector('.occ');
      occ.textContent = prefs.showOcc ? String(count) : '';
      occ.hidden = !prefs.showOcc;
    }

    $('puz').textContent = '#' + (G.index + 1);
    $('timer').textContent = fmtTime(G.seconds);
    $('undo').disabled = G.hi <= 0;
    $('notes').setAttribute('aria-pressed', G.notesMode ? 'true' : 'false');
    $('notes-st').textContent = G.notesMode ? 'ON' : 'OFF';
    $('overlay').hidden = G.running || G.won;
    $('won').hidden = !G.won || raceMode;
    if (G.won && !raceMode) {
      $('won-msg').textContent = 'You finished.';
      $('won-time').textContent = fmtTime(G.seconds);
    }
    $('diff').disabled = raceMode;
  }

  function tick() {
    if (!G.running || G.won) return;
    if (document.hidden) return;
    G.seconds++;
    $('timer').textContent = fmtTime(G.seconds);
    persist();
    publish();
  }

  function newGame() {
    if (raceMode) { dealRace(); return; }
    loadPuzzle(G.diff, newIndex(G.diff, G.index), null);
    G.seconds = 0;
    G.hints = 0;
    G.won = false;
    G.running = true;
    persist(true);
    render();
  }

  function openSettings(on) {
    $('settings').hidden = !on;
  }

  function onKey(e) {
    if (e.defaultPrevented) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (!$('settings').hidden) {
      if (e.key === 'Escape') { openSettings(false); e.preventDefault(); }
      return;
    }
    var k = e.key;
    if (k === 'Escape') {
      pause(G.running);
      e.preventDefault();
      return;
    }
    if (!G.running && !G.won && k !== 'Escape') return;
    if (k === 'n' || k === 'N') { toggleNotes(); e.preventDefault(); return; }
    if (k === 'h' || k === 'H') { hint(); e.preventDefault(); return; }
    if ((k === 'z' || k === 'Z') && (e.ctrlKey || e.metaKey)) { undo(); e.preventDefault(); return; }
    if ((k === 'y' || k === 'Y') && (e.ctrlKey || e.metaKey)) { redo(); e.preventDefault(); return; }
    if ((k === 'c' || k === 'C') && (e.ctrlKey || e.metaKey)) {
      var c = activeCell();
      if (c && c.notes.length) G.clipboard = c.notes.slice();
      e.preventDefault();
      return;
    }
    if ((k === 'v' || k === 'V') && (e.ctrlKey || e.metaKey)) {
      var a = activeCell();
      if (a && !a.initial && G.clipboard) setCells(SS.setNotes(G.cells, a.x, a.y, G.clipboard), true);
      e.preventDefault();
      return;
    }
    if (k === 'Backspace' || k === 'Delete' || k === '-') { erase(); e.preventDefault(); return; }
    if (k >= '1' && k <= '9') { place(+k); e.preventDefault(); return; }
    if (!G.active) return;
    var x = G.active.x, y = G.active.y;
    if (k === 'ArrowUp') y = Math.max(0, y - 1);
    else if (k === 'ArrowDown') y = Math.min(8, y + 1);
    else if (k === 'ArrowLeft') x = Math.max(0, x - 1);
    else if (k === 'ArrowRight') x = Math.min(8, x + 1);
    else return;
    select(x, y, false);
    e.preventDefault();
  }

  buildBoard();
  buildPad();
  try { loadPuzzle('easy', 0, null); } catch (e) {}

  $('undo').addEventListener('click', undo);
  $('erase').addEventListener('click', erase);
  $('notes').addEventListener('click', toggleNotes);
  $('hint').addEventListener('click', hint);
  $('new').addEventListener('click', newGame);
  $('timer').addEventListener('click', function () { if (!G.won) pause(G.running); });
  $('continueBtn').addEventListener('click', function () { pause(false); });
  $('won-next').addEventListener('click', newGame);
  $('againBtn').addEventListener('click', function () { if (raceMode) dealRace(); });
  $('settingsBtn').addEventListener('click', function () { openSettings(true); });
  $('settingsClose').addEventListener('click', function () { openSettings(false); });
  $('diff').addEventListener('change', function () {
    G.diff = $('diff').value;
    savePrefs();
    if (!raceMode) newGame();
  });

  function bindOpt(id, key) {
    var el = $(id);
    el.checked = !!prefs[key];
    el.addEventListener('change', function () {
      prefs[key] = el.checked;
      if (key === 'dark') applyDark();
      savePrefs();
      render();
    });
  }
  bindOpt('opt-hints', 'showHints');
  bindOpt('opt-wrong', 'showWrong');
  bindOpt('opt-conflicts', 'showConflicts');
  bindOpt('opt-occ', 'showOcc');
  bindOpt('opt-dark', 'dark');

  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && G.running && !G.won) pause(true);
  });
  window.addEventListener('pagehide', function () { persist(true); });

  if (window.gifos && gifos.onBack) {
    gifos.onBack(function () {
      if (!$('settings').hidden) { openSettings(false); return true; }
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
      var rec = pair[0], game = pair[1];
      if (rec) {
        if (rec.showHints != null) prefs.showHints = !!rec.showHints;
        if (rec.showWrong != null) prefs.showWrong = !!rec.showWrong;
        if (rec.showConflicts != null) prefs.showConflicts = !!rec.showConflicts;
        if (rec.showOcc != null) prefs.showOcc = !!rec.showOcc;
        if (rec.dark != null) prefs.dark = !!rec.dark;
        if (rec.lastDiff && SS.DIFFS.indexOf(rec.lastDiff) >= 0) G.diff = rec.lastDiff;
        $('opt-hints').checked = prefs.showHints;
        $('opt-wrong').checked = prefs.showWrong;
        $('opt-conflicts').checked = prefs.showConflicts;
        $('opt-occ').checked = prefs.showOcc;
        $('opt-dark').checked = prefs.dark;
        applyDark();
      }
      if (game && game.diff && game.nums) {
        loadPuzzle(game.diff, game.index || 0, game);
      } else {
        loadPuzzle(G.diff, 0, null);
      }
    }).catch(function () {
      loadPuzzle(G.diff, 0, null);
    }).then(function () {
      if (!window.SSNet) return;
      return window.SSNet.init({
        onRace: function (rec) {
          if (!rec || rec.at === appliedAt) return;
          enterRace(rec);
        },
        onRoster: function (list) {
          var rec = window.SSNet.race();
          var others = window.SSNet.others();
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
