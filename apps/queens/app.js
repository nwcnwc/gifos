// Queens — tap board. Invite is OS chrome. Progress lives in the file.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var LEVELS = window.QUEENS_LEVELS || [];
  var saveDb = null, roomDb = null;
  try {
    if (window.gifos) {
      saveDb = gifos.db('save');
      roomDb = gifos.db('room');
    }
  } catch (e) {}

  var save = { done: {}, auto: true, cur: 0, board: null };
  var state = { idx: 0, board: null, hist: [], regions: null, level: null, mp: false };
  var me = { id: 'solo', name: 'you' };

  function setChip(cls, text) {
    $('chip').className = 'engine-chip' + (cls ? ' ' + cls : '');
    $('chipText').textContent = text;
  }
  function persist() {
    if (!saveDb) return;
    saveDb.put({
      id: 'save', done: save.done, auto: save.auto, cur: save.cur,
      board: state.board, idx: state.idx
    }).catch(function () {});
  }
  function show(id) {
    $('home').hidden = id !== 'home';
    $('play').hidden = id !== 'play';
  }

  function paintLevels() {
    var el = $('levelGrid'), i, b, lv;
    el.innerHTML = '';
    for (i = 0; i < LEVELS.length; i++) {
      lv = LEVELS[i];
      b = document.createElement('button');
      b.type = 'button';
      b.className = 'lv' + (save.done[lv.id] ? ' done' : '');
      b.textContent = String(lv.id);
      b.setAttribute('data-i', String(i));
      el.appendChild(b);
    }
  }

  function openLevel(i) {
    i = Math.max(0, Math.min(LEVELS.length - 1, i | 0));
    var lv = LEVELS[i];
    state.idx = i;
    state.level = lv;
    state.regions = QNS.regionsOf(lv);
    state.board = QNS.emptyBoard(lv.size);
    state.hist = [];
    save.cur = lv.id;
    $('playTitle').textContent = 'Level ' + lv.id + ' · ' + lv.size + '×' + lv.size;
    $('win').hidden = true;
    $('status').textContent = '';
    renderBoard();
    show('play');
    persist();
    if (state.mp && roomDb) {
      roomDb.put({ id: me.id, name: me.name, level: lv.id, t: Date.now() }).catch(function () {});
    }
  }

  function renderBoard() {
    var el = $('board'), n = state.level.size, r, c, cell, v, clash;
    clash = QNS.clashes(state.board, state.regions);
    el.style.setProperty('--n', n);
    if (el.children.length !== n * n) {
      el.innerHTML = '';
      for (r = 0; r < n; r++) for (c = 0; c < n; c++) {
        cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.setAttribute('data-r', String(r));
        cell.setAttribute('data-c', String(c));
        el.appendChild(cell);
      }
    }
    var nodes = el.children, k = 0, letter, col;
    for (r = 0; r < n; r++) for (c = 0; c < n; c++) {
      cell = nodes[k++];
      letter = state.level.r[r].charAt(c);
      col = state.level.c[letter] || '#888';
      v = state.board[r][c];
      cell.style.background = col;
      cell.className = 'cell' + (v === 'Q' ? ' q' : '') + (v === 'X' ? ' x' : '') +
        (clash[r + ',' + c] ? ' clash' : '');
      cell.textContent = v === 'Q' ? '♛' : (v === 'X' ? '×' : '');
    }
  }

  function applyBoard(next, pushHist) {
    if (pushHist) state.hist.push(QNS.clone(state.board));
    state.board = next;
    renderBoard();
    if (QNS.checkWin(state.board, state.regions)) {
      save.done[state.level.id] = 1;
      $('win').hidden = false;
      $('status').textContent = 'All queens placed.';
      setChip('win', 'Solved');
    } else {
      $('win').hidden = true;
      $('status').textContent = '';
      setChip('play', 'Level ' + state.level.id);
    }
    persist();
  }

  $('board').addEventListener('click', function (ev) {
    var t = ev.target.closest ? ev.target.closest('.cell') : ev.target;
    if (!t || !t.getAttribute) return;
    var r = +t.getAttribute('data-r'), c = +t.getAttribute('data-c');
    applyBoard(QNS.tap(state.board, state.regions, r, c, save.auto), true);
  });

  var drag = null;
  $('board').addEventListener('pointerdown', function (ev) {
    var t = ev.target.closest ? ev.target.closest('.cell') : ev.target;
    if (!t || !t.getAttribute) return;
    drag = [];
    this.setPointerCapture(ev.pointerId);
  });
  $('board').addEventListener('pointermove', function (ev) {
    if (!drag) return;
    var t = document.elementFromPoint(ev.clientX, ev.clientY);
    t = t && t.closest ? t.closest('.cell') : t;
    if (!t || !t.getAttribute) return;
    var r = +t.getAttribute('data-r'), c = +t.getAttribute('data-c');
    var key = r + ',' + c, i;
    for (i = 0; i < drag.length; i++) if (drag[i][0] === r && drag[i][1] === c) return;
    if (state.board[r][c] === 'Q') return;
    drag.push([r, c]);
    if (drag.length > 1) applyBoard(QNS.paintX(state.board, [[r, c]]), drag.length === 2);
  });
  $('board').addEventListener('pointerup', function () { drag = null; });
  $('board').addEventListener('pointercancel', function () { drag = null; });

  $('undoBtn').onclick = function () {
    if (!state.hist.length) return;
    state.board = state.hist.pop();
    renderBoard();
    $('win').hidden = true;
    persist();
  };
  $('clearBtn').onclick = function () {
    applyBoard(QNS.emptyBoard(state.level.size), true);
  };
  $('nextBtn').onclick = $('winNext').onclick = function () { openLevel(state.idx + 1); };
  $('prevBtn').onclick = function () { openLevel(state.idx - 1); };
  $('backBtn').onclick = function () { show('home'); paintLevels(); persist(); };
  $('playBtn').onclick = function () {
    state.mp = false;
    openLevel(indexOfId(save.cur) || 0);
  };
  $('friendBtn').onclick = function () {
    state.mp = true;
    setChip('play', 'Press Invite');
    openLevel(indexOfId(save.cur) || 0);
    $('status').textContent = 'Press Invite in the bar above to send the link. You each mark your own board.';
  };
  $('autoX').onchange = function () { save.auto = this.checked; persist(); };
  $('levelGrid').onclick = function (ev) {
    var t = ev.target;
    if (!t || !t.getAttribute || t.getAttribute('data-i') == null) return;
    openLevel(+t.getAttribute('data-i'));
  };

  function indexOfId(id) {
    var i;
    for (i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return i;
    return 0;
  }

  function boot() {
    paintLevels();
    setChip('ready', LEVELS.length + ' puzzles');
    if (!saveDb) return;
    saveDb.get('save').then(function (row) {
      if (!row) return;
      if (row.done) save.done = row.done;
      if (row.auto != null) { save.auto = !!row.auto; $('autoX').checked = save.auto; }
      if (row.cur != null) save.cur = row.cur;
      paintLevels();
    }).catch(function () {});
    if (gifos.me) gifos.me().then(function (who) { if (who && who.id) me = who; }).catch(function () {});
  }
  boot();
})();
