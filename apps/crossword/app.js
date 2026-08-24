/*
 * Crossword — GifOS shell around dwmkerr/crosswords-js.
 * Invite is OS chrome. Letters save in gifos.db. A room shares the grid.
 */
(function (root) {
  'use strict';

  var puzzle = root.CROSSWORD_PUZZLE;
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
  var ctrl = null;
  var me = { id: 'local', name: 'You' };
  var started = false;
  var applying = false;
  var saveTimer = 0;

  function snapshot() {
    if (!ctrl || !ctrl.model) return {};
    var cells = {}, list = ctrl.model.lightCells || [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var ch = (c.answer || ' ').trim();
      if (ch) cells[c.x + ',' + c.y] = ch;
    }
    return cells;
  }

  function applyCells(cells) {
    if (!ctrl || !cells) return;
    applying = true;
    Object.keys(cells).forEach(function (k) {
      var p = k.split(',');
      var col = ctrl.model.cells[+p[0]];
      var cell = col && col[+p[1]];
      if (cell && cell.light && cells[k]) ctrl.setGridCell(cell, cells[k]);
    });
    applying = false;
  }

  function persist() {
    if (applying || !saveDb) return;
    var cells = snapshot();
    saveDb.put({ id: 'progress', cells: cells }).catch(function () {});
    if (started && roomDb && me.id && me.id !== 'local') {
      roomDb.put({ id: me.id, name: me.name, cells: cells, t: Date.now() }).catch(function () {});
    }
  }
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 350);
  }

  function typeLetter(ch) {
    if (!ctrl || !ctrl.currentCell) return;
    ctrl.setGridCell(ctrl.currentCell, ch);
    scheduleSave();
  }

  function buildKeys() {
    var rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
    keysEl.innerHTML = '';
    rows.forEach(function (row, ri) {
      row.split('').forEach(function (ch) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = ch;
        b.addEventListener('click', function () { typeLetter(ch); });
        keysEl.appendChild(b);
      });
      if (ri === 2) {
        var del = document.createElement('button');
        del.type = 'button';
        del.className = 'wide';
        del.textContent = 'DEL';
        del.addEventListener('click', function () { typeLetter(' '); });
        keysEl.appendChild(del);
      }
    });
  }

  document.addEventListener('touchstart', function reveal() {
    document.body.classList.add('touch');
    document.removeEventListener('touchstart', reveal);
  }, { passive: true });

  document.getElementById('check').addEventListener('click', function () {
    if (ctrl) ctrl.testCurrentClue();
  });
  document.getElementById('reveal').addEventListener('click', function () {
    if (ctrl) { ctrl.revealCurrentCell(); scheduleSave(); }
  });
  document.getElementById('reset').addEventListener('click', function () {
    if (ctrl) { ctrl.resetCrossword(); scheduleSave(); }
  });

  var lib = root.crosswords;
  if (!lib || typeof lib.newCrosswordController !== 'function') {
    statusEl.textContent = 'The player did not load.';
    return;
  }
  ctrl = lib.newCrosswordController(puzzle, gridEl, cluesEl);
  if (!ctrl) {
    statusEl.textContent = 'The puzzle did not load.';
    return;
  }
  statusEl.textContent = (puzzle.source && puzzle.source.title) || 'Crossword';
  gridEl.addEventListener('keyup', scheduleSave);
  gridEl.addEventListener('keypress', scheduleSave);
  buildKeys();
  ctrl.addEventsListener(['crosswordSolved'], function () {
    statusEl.textContent = 'Filled.';
    persist();
  });

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
          applyCells(p.cells);
        });
      });
    }).catch(function () {});
  }

  var load = saveDb
    ? saveDb.get('progress').then(function (row) {
      if (row && row.cells) applyCells(row.cells);
    }).catch(function () {})
    : Promise.resolve();
  load.then(bootNet);
})(window);
