/*
 * Crossword — GifOS shell around dwmkerr/crosswords-js.
 * Invite is OS chrome. Letters save in the file. A room shares the grid.
 * The phone keyboard is a real <input inputmode="text"> plus a QWERTY pad
 * that advances like a desktop keypress.
 */
(function (root) {
  'use strict';

  var puzzles = (root.CROSSWORD_PUZZLES && root.CROSSWORD_PUZZLES.length)
    ? root.CROSSWORD_PUZZLES
    : (root.CROSSWORD_PUZZLE ? [root.CROSSWORD_PUZZLE] : []);
  var api = typeof gifos !== 'undefined' ? gifos : null;
  var saveDb = null, roomDb = null;
  try {
    if (api && api.db) {
      saveDb = api.db('save');
      roomDb = api.db('room');
    }
  } catch (e) {}

  var statusEl = document.getElementById('status');
  var gridEl = document.getElementById('grid');
  var cluesEl = document.getElementById('clues');
  var keysEl = document.getElementById('keys');
  var kbEl = document.getElementById('kb');
  var puzzlesEl = document.getElementById('puzzles');
  var clueIdEl = document.getElementById('clueId');
  var clueTextEl = document.getElementById('clueText');
  var ctrl = null;
  var me = { id: 'local', name: 'You' };
  var started = false;
  var applying = false;
  var saveTimer = 0;
  var currentId = (puzzles[0] && (puzzles[0].id || 'heart')) || 'heart';
  var byId = {};
  var i;
  for (i = 0; i < puzzles.length; i++) {
    byId[puzzles[i].id || ('p' + i)] = puzzles[i];
  }
  if (!byId.heart && puzzles[0]) currentId = puzzles[0].id || currentId;

  function puzzleOf(id) {
    return byId[id] || puzzles[0] || null;
  }

  function letterOf(c) {
    var ch;
    if (c.acrossClue && c.acrossClue.answer) {
      ch = c.acrossClue.answer.charAt(c.acrossClueLetterIndex);
      if (ch && ch.trim()) return ch.toUpperCase();
    }
    if (c.downClue && c.downClue.answer) {
      ch = c.downClue.answer.charAt(c.downClueLetterIndex);
      if (ch && ch.trim()) return ch.toUpperCase();
    }
    ch = (c.answer || '').trim();
    return ch ? ch.toUpperCase() : '';
  }

  function snapshot() {
    if (!ctrl || !ctrl.model) return {};
    var cells = {}, list = ctrl.model.lightCells || [];
    for (var n = 0; n < list.length; n++) {
      var c = list[n];
      cells[c.x + ',' + c.y] = letterOf(c);
    }
    return cells;
  }

  function setCell(cell, ch) {
    if (!ctrl || !cell || !cell.light) return;
    /* setGridCell wants the DOM node (dataset.xy), not the model cell. */
    var el = ctrl.cellElement(cell);
    if (el) ctrl.setGridCell(el, ch);
    cell.answer = ch;
  }

  function applyCells(cells) {
    if (!ctrl || !cells) return;
    applying = true;
    Object.keys(cells).forEach(function (k) {
      var p = k.split(',');
      var col = ctrl.model.cells[+p[0]];
      var cell = col && col[+p[1]];
      if (cell && cell.light) {
        var ch = cells[k];
        setCell(cell, ch && ch.trim() ? String(ch).charAt(0).toUpperCase() : ' ');
      }
    });
    applying = false;
  }

  function persist() {
    if (applying || !saveDb) return;
    var cells = snapshot();
    saveDb.put({ id: 'progress', puzzle: currentId, cells: cells }).catch(function () {});
    saveDb.put({ id: currentId, puzzle: currentId, cells: cells }).catch(function () {});
    if (started && roomDb && me.id && me.id !== 'local') {
      roomDb.put({ id: me.id, name: me.name, puzzle: currentId, cells: cells, t: Date.now() }).catch(function () {});
    }
  }
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 280);
  }

  function paintClue() {
    if (!ctrl || !ctrl.currentClue) {
      clueIdEl.textContent = '';
      clueTextEl.textContent = 'Tap a square, then type a letter.';
      return;
    }
    var c = ctrl.currentClue.headSegment || ctrl.currentClue;
    var dir = c.isAcross ? 'Across' : 'Down';
    clueIdEl.textContent = (c.labelText || c.headNumber || '') + ' ' + dir;
    clueTextEl.textContent = (c.clueText || '') + ' ' + (c.lengthText || '');
  }

  function focusKb() {
    if (!kbEl) return;
    try { kbEl.focus(); } catch (e) {}
  }

  /* Type a letter into the current cell and walk along the current clue.
     The pad and the phone <input> both come through here so a thumb does
     what a keyboard does: fill, then the next square lights. */
  function enterLetter(ch) {
    if (!ctrl || !ctrl.currentCell) return false;
    ch = String(ch || '');
    if (ch === 'Backspace' || ch === 'Delete' || ch === 'DEL') {
      setCell(ctrl.currentCell, ' ');
      var clueDel = ctrl.currentClue;
      var cellsDel = clueDel && clueDel.cells;
      if (cellsDel) {
        var di = cellsDel.indexOf(ctrl.currentCell);
        if (di > 0) ctrl.currentCell = cellsDel[di - 1];
      }
      scheduleSave();
      paintClue();
      return true;
    }
    ch = ch.toUpperCase();
    if (!/^[A-Z]$/.test(ch)) return false;
    var cell = ctrl.currentCell;
    setCell(cell, ch);
    var clue = ctrl.currentClue;
    var cells = clue && clue.cells;
    if (cells) {
      var idx = cells.indexOf(cell);
      if (idx >= 0 && idx < cells.length - 1) ctrl.currentCell = cells[idx + 1];
    }
    scheduleSave();
    paintClue();
    return true;
  }

  function buildKeys() {
    var rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
    keysEl.innerHTML = '';
    rows.forEach(function (row, ri) {
      var wrap = document.createElement('div');
      wrap.className = 'keyrow';
      row.split('').forEach(function (ch) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = ch;
        b.addEventListener('pointerdown', function (ev) { ev.preventDefault(); enterLetter(ch); focusKb(); });
        wrap.appendChild(b);
      });
      if (ri === 2) {
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'wide';
        del.textContent = 'DEL';
        del.addEventListener('pointerdown', function (ev) { ev.preventDefault(); enterLetter('DEL'); focusKb(); });
        wrap.appendChild(del);
      }
      keysEl.appendChild(wrap);
    });
  }

  function buildPicker() {
    puzzlesEl.innerHTML = '';
    puzzles.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = p.title || p.id;
      b.setAttribute('data-id', p.id);
      if (p.id === currentId) b.className = 'on';
      b.addEventListener('click', function () { selectPuzzle(p.id); });
      puzzlesEl.appendChild(b);
    });
  }

  function bindCtrl() {
    if (!ctrl) return;
    ctrl.addEventsListener(['clueSelected'], function () {
      paintClue();
      focusKb();
    });
    ctrl.addEventsListener(['crosswordSolved'], function () {
      statusEl.textContent = 'Filled.';
      persist();
    });
    paintClue();
  }
  gridEl.addEventListener('pointerup', focusKb);
  gridEl.addEventListener('click', focusKb);
  gridEl.addEventListener('keyup', function () { scheduleSave(); paintClue(); });
  gridEl.addEventListener('keypress', function () { scheduleSave(); paintClue(); });

  function bootController(def, cells) {
    var lib = root.crosswords;
    if (!lib || typeof lib.newCrosswordController !== 'function') {
      statusEl.textContent = 'The player did not load.';
      return null;
    }
    if (ctrl && typeof ctrl.destroy === 'function') {
      try { ctrl.destroy(); } catch (e) {}
    }
    gridEl.innerHTML = '';
    cluesEl.innerHTML = '';
    ctrl = lib.newCrosswordController(def, gridEl, cluesEl);
    if (!ctrl) {
      statusEl.textContent = 'The puzzle did not load.';
      return null;
    }
    if (cells) applyCells(cells);
    bindCtrl();
    return ctrl;
  }

  function selectPuzzle(id, cells, fromSave) {
    var def = puzzleOf(id);
    if (!def) return;
    if (ctrl && id !== currentId && !fromSave) persist();
    currentId = def.id || id;
    buildPicker();
    var title = (def.source && def.source.title) || def.title || 'Crossword';
    statusEl.textContent = title;
    var go = function (saved) {
      bootController(def, saved || cells || null);
    };
    if (cells) go(cells);
    else if (saveDb) {
      saveDb.get(currentId).then(function (row) {
        go(row && row.cells);
      }).catch(function () { go(null); });
    } else go(null);
  }

  document.addEventListener('touchstart', function reveal() {
    document.body.classList.add('touch');
    document.removeEventListener('touchstart', reveal);
  }, { passive: true });

  document.getElementById('check').addEventListener('click', function () {
    if (ctrl) ctrl.testCurrentClue();
  });
  document.getElementById('checkAll').addEventListener('click', function () {
    if (!ctrl) return;
    var r = ctrl.testCrossword();
    statusEl.textContent = r === 0 ? 'Filled.' : (r === 1 ? 'Something is off.' : 'Still open squares.');
  });
  document.getElementById('reveal').addEventListener('click', function () {
    if (ctrl) { ctrl.revealCurrentCell(); scheduleSave(); }
  });
  document.getElementById('reset').addEventListener('click', function () {
    if (ctrl) { ctrl.resetCrossword(); scheduleSave(); paintClue(); }
  });

  if (kbEl) {
    kbEl.addEventListener('input', function () {
      var v = kbEl.value || '';
      kbEl.value = '';
      var ch = v.slice(-1);
      if (ch) enterLetter(ch);
    });
    kbEl.addEventListener('keydown', function (ev) {
      if (ev.key === 'Backspace' || ev.key === 'Delete') {
        ev.preventDefault();
        enterLetter('DEL');
      }
    });
  }

  if (!puzzles.length) {
    statusEl.textContent = 'No puzzle in this file.';
    clueTextEl.textContent = 'This copy has no grid.';
    return;
  }

  buildKeys();
  buildPicker();

  if (api && api.onBack) api.onBack(function () { return true; });

  function bootNet() {
    if (!api || !roomDb) return Promise.resolve();
    return api.me().then(function (id) {
      me.id = (id && id.id) || 'local';
      me.name = (id && id.name) || 'You';
      if (me.id === 'local') return;
      started = true;
      roomDb.subscribe(function (list) {
        (list || []).forEach(function (p) {
          if (!p || p.id === me.id || !p.cells) return;
          if (p.puzzle && p.puzzle !== currentId) return;
          applyCells(p.cells);
        });
      });
    }).catch(function () {});
  }

  var load = saveDb
    ? saveDb.get('progress').then(function (row) {
      if (row && row.puzzle && puzzleOf(row.puzzle)) {
        selectPuzzle(row.puzzle, row.cells, true);
      } else if (row && row.cells && puzzleOf('sand')) {
        /* v1.0 wrote only Sand into progress, with no puzzle id. */
        selectPuzzle('sand', row.cells, true);
      } else {
        selectPuzzle(currentId);
      }
    }).catch(function () { selectPuzzle(currentId); })
    : Promise.resolve(selectPuzzle(currentId));
  load.then(bootNet);

  root.CrosswordApp = {
    puzzles: puzzles,
    snapshot: snapshot,
    applyCells: applyCells,
    enterLetter: enterLetter,
    selectPuzzle: selectPuzzle,
    puzzleOf: puzzleOf,
    get currentId() { return currentId; },
    get ctrl() { return ctrl; }
  };
})(window);
