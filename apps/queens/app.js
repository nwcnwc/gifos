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

  var save = { done: {}, auto: true, cur: 0, board: null, idx: 0 };
  var state = { idx: 0, board: null, hist: [], regions: null, level: null };
  var me = { id: 'solo', name: 'you' };
  var others = {};
  var filterSize = 0;
  var hideDone = false;
  var saveWarned = false;
  var sharedLevel = null;

  function setChip(cls, text) {
    $('chip').className = 'engine-chip' + (cls ? ' ' + cls : '');
    $('chipText').textContent = text;
  }
  function persist() {
    if (!saveDb) return;
    saveDb.put({
      id: 'save',
      done: save.done,
      auto: save.auto,
      cur: save.cur,
      board: state.board,
      idx: state.idx
    }).catch(function () {
      if (!saveWarned) {
        saveWarned = true;
        setChip('err', 'Couldn’t save');
      }
    });
  }
  function show(id) {
    $('home').hidden = id !== 'home';
    $('play').hidden = id !== 'play';
  }

  function doneCount() {
    var n = 0, i, id;
    for (i = 0; i < LEVELS.length; i++) {
      id = LEVELS[i].id;
      if (save.done[id]) n++;
    }
    return n;
  }

  function firstUnsolved() {
    var i;
    for (i = 0; i < LEVELS.length; i++) if (!save.done[LEVELS[i].id]) return i;
    return Math.max(0, indexOfId(save.cur));
  }

  function resumeIndex() {
    if (state.board && state.level) return state.idx;
    if (save.board && save.idx != null && LEVELS[save.idx] &&
        save.board.length === LEVELS[save.idx].size) return save.idx | 0;
    return firstUnsolved();
  }

  function paintProgress() {
    var n = LEVELS.length;
    $('progress').textContent = n
      ? (doneCount() + ' of ' + n + ' solved')
      : 'No puzzles loaded.';
    var i = resumeIndex();
    var lv = LEVELS[i];
    var mid = !!(save.board && save.idx === i && !isEmpty(save.board));
    if (!lv) {
      $('playBtn').textContent = 'Play';
      return;
    }
    $('playBtn').textContent = mid
      ? ('Resume level ' + lv.id)
      : (save.done[lv.id] ? ('Replay level ' + lv.id) : ('Play level ' + lv.id));
  }

  function isEmpty(board) {
    var r, c;
    if (!board || !board.length) return true;
    for (r = 0; r < board.length; r++) for (c = 0; c < board[r].length; c++) {
      if (board[r][c]) return false;
    }
    return true;
  }

  function paintSizes() {
    var el = $('sizeRow'), seen = {}, i, s, order = [];
    el.innerHTML = '';
    for (i = 0; i < LEVELS.length; i++) {
      s = LEVELS[i].size;
      if (!seen[s]) { seen[s] = 1; order.push(s); }
    }
    order.sort(function (a, b) { return a - b; });
    function add(label, val) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'size' + (filterSize === val ? ' on' : '');
      b.textContent = label;
      b.setAttribute('data-size', String(val));
      el.appendChild(b);
    }
    add('All', 0);
    for (i = 0; i < order.length; i++) add(order[i] + '×' + order[i], order[i]);
  }

  function paintLevels() {
    var el = $('levelGrid'), i, b, lv, n = 0;
    el.innerHTML = '';
    for (i = 0; i < LEVELS.length; i++) {
      lv = LEVELS[i];
      if (filterSize && lv.size !== filterSize) continue;
      if (hideDone && save.done[lv.id]) continue;
      b = document.createElement('button');
      b.type = 'button';
      b.className = 'lv' + (save.done[lv.id] ? ' done' : '') + (save.cur === lv.id ? ' cur' : '');
      b.textContent = String(lv.id);
      b.setAttribute('data-i', String(i));
      b.setAttribute('aria-label', 'Level ' + lv.id + ', ' + lv.size + ' by ' + lv.size);
      el.appendChild(b);
      n++;
    }
    $('emptyFilter').hidden = n !== 0;
    paintProgress();
  }

  function openLevel(i, opts) {
    opts = opts || {};
    i = Math.max(0, Math.min(LEVELS.length - 1, i | 0));
    var lv = LEVELS[i];
    if (!lv) return;
    var keep = opts.keep && save.board && save.idx === i &&
      save.board.length === lv.size;
    state.idx = i;
    state.level = lv;
    state.regions = QNS.regionsOf(lv);
    state.board = keep ? QNS.clone(save.board) : QNS.emptyBoard(lv.size);
    state.hist = [];
    save.cur = lv.id;
    save.idx = i;
    save.board = state.board;
    $('playTitle').textContent = 'Level ' + lv.id + ' · ' + lv.size + '×' + lv.size;
    $('win').hidden = true;
    setChip('play', 'Level ' + lv.id);
    renderBoard();
    show('play');
    persist();
    if (!opts.follow) publishPuzzle();
    publishMe();
  }

  function queenCount(board) {
    var n = 0, r, c;
    for (r = 0; r < board.length; r++) for (c = 0; c < board[r].length; c++) {
      if (board[r][c] === 'Q') n++;
    }
    return n;
  }

  function clashCount(clash) {
    var k, n = 0;
    for (k in clash) if (Object.prototype.hasOwnProperty.call(clash, k)) n++;
    return n;
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
        cell.setAttribute('role', 'gridcell');
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
      cell.setAttribute('aria-label', 'Row ' + (r + 1) + ' column ' + (c + 1) +
        (v === 'Q' ? ', queen' : v === 'X' ? ', marked' : ', empty'));
    }
    var qn = queenCount(state.board);
    var cn = clashCount(clash);
    var won = QNS.checkWin(state.board, state.regions);
    if (won) {
      save.done[state.level.id] = 1;
      $('win').hidden = false;
      $('status').textContent = 'All queens placed.';
      setChip('win', 'Solved');
    } else {
      $('win').hidden = true;
      $('status').textContent = qn + ' / ' + n + ' queens' + (cn ? (' · ' + cn + ' clash') : '');
      setChip('play', 'Level ' + state.level.id);
    }
  }

  function applyBoard(next, pushHist) {
    if (pushHist) state.hist.push(QNS.clone(state.board));
    state.board = next;
    save.board = state.board;
    renderBoard();
    persist();
    publishMe();
  }

  var painted = false;
  var drag = null;
  $('board').addEventListener('click', function (ev) {
    if (painted) { ev.preventDefault(); painted = false; return; }
    var t = ev.target.closest ? ev.target.closest('.cell') : ev.target;
    if (!t || !t.getAttribute) return;
    var r = +t.getAttribute('data-r'), c = +t.getAttribute('data-c');
    applyBoard(QNS.tap(state.board, state.regions, r, c, save.auto), true);
  });

  $('board').addEventListener('pointerdown', function (ev) {
    var t = ev.target.closest ? ev.target.closest('.cell') : ev.target;
    if (!t || !t.getAttribute) return;
    drag = [[+t.getAttribute('data-r'), +t.getAttribute('data-c')]];
    painted = false;
    try { this.setPointerCapture(ev.pointerId); } catch (err) {}
  });
  $('board').addEventListener('pointermove', function (ev) {
    if (!drag) return;
    var t = document.elementFromPoint(ev.clientX, ev.clientY);
    t = t && t.closest ? t.closest('.cell') : t;
    if (!t || !t.getAttribute) return;
    var r = +t.getAttribute('data-r'), c = +t.getAttribute('data-c');
    var i;
    for (i = 0; i < drag.length; i++) if (drag[i][0] === r && drag[i][1] === c) return;
    /* A finger jiggle on one cell is a tap, not a drag. */
    if (drag.length === 1 && r === drag[0][0] && c === drag[0][1]) return;
    drag.push([r, c]);
    if (state.board[r][c] === 'Q') return;
    var squares = [[r, c]];
    if (drag.length === 2 && state.board[drag[0][0]][drag[0][1]] !== 'Q') {
      squares.unshift(drag[0]);
    }
    applyBoard(QNS.paintX(state.board, squares), !painted);
    painted = true;
  });
  function endDrag() { drag = null; }
  $('board').addEventListener('pointerup', endDrag);
  $('board').addEventListener('pointercancel', endDrag);

  $('undoBtn').onclick = function () {
    if (!state.hist.length) return;
    state.board = state.hist.pop();
    save.board = state.board;
    renderBoard();
    persist();
    publishMe();
  };
  $('clearBtn').onclick = function () {
    applyBoard(QNS.emptyBoard(state.level.size), true);
  };
  $('nextBtn').onclick = $('winNext').onclick = function () { openLevel(state.idx + 1); };
  $('prevBtn').onclick = function () { openLevel(state.idx - 1); };
  function goHome() {
    show('home');
    paintLevels();
    persist();
  }
  $('backBtn').onclick = goHome;
  $('playBtn').onclick = function () {
    var i = sharedLevel ? indexOfId(sharedLevel) : resumeIndex();
    openLevel(i, { keep: !sharedLevel || LEVELS[i] && LEVELS[i].id === save.cur });
  };
  $('autoX').onchange = function () { save.auto = this.checked; persist(); };
  $('levelGrid').onclick = function (ev) {
    var t = ev.target;
    if (!t || !t.getAttribute || t.getAttribute('data-i') == null) return;
    openLevel(+t.getAttribute('data-i'));
  };
  $('sizeRow').onclick = function (ev) {
    var t = ev.target;
    if (!t || !t.getAttribute || t.getAttribute('data-size') == null) return;
    filterSize = +t.getAttribute('data-size');
    paintSizes();
    paintLevels();
  };
  $('hideDone').onchange = function () { hideDone = this.checked; paintLevels(); };
  function jumpTo() {
    var id = parseInt($('jump').value, 10);
    if (!id) return;
    var i = indexOfId(id);
    if (LEVELS[i] && LEVELS[i].id === id) openLevel(i);
    else setChip('err', 'No level ' + id);
  }
  $('jumpBtn').onclick = jumpTo;
  $('jump').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); jumpTo(); }
  });

  document.addEventListener('keydown', function (ev) {
    if ($('play').hidden) return;
    var t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (ev.key === 'z' && (ev.metaKey || ev.ctrlKey)) {
      ev.preventDefault();
      $('undoBtn').onclick();
    }
  });

  function indexOfId(id) {
    var i;
    for (i = 0; i < LEVELS.length; i++) if (LEVELS[i].id === id) return i;
    return 0;
  }

  function publishPuzzle() {
    if (!roomDb || me.id === 'solo' || !state.level) return;
    roomDb.put({ id: 'puzzle', level: state.level.id, by: me.id, t: Date.now() })
      .catch(function () {});
  }
  function publishMe() {
    if (!roomDb || me.id === 'solo' || !state.level) return;
    roomDb.put({
      id: me.id, name: me.name, level: state.level.id,
      solved: !!save.done[state.level.id], t: Date.now()
    }).catch(function () {});
  }
  function paintRoom() {
    var el = $('room'), ids = Object.keys(others), i, p, parts = [];
    if (!ids.length) { el.hidden = true; return; }
    el.hidden = false;
    parts.push('<div class="row me"><span>' + esc(me.name || 'You') +
      '</span><span>' + (save.done[state.level.id] ? 'solved' : 'marking') + '</span></div>');
    for (i = 0; i < ids.length; i++) {
      p = others[ids[i]];
      parts.push('<div class="row"><span>' + esc(p.name || 'Player') + '</span><span>' +
        (p.level === state.level.id
          ? (p.solved ? 'solved' : 'marking')
          : ('level ' + p.level)) + '</span></div>');
    }
    el.innerHTML = parts.join('');
  }
  function esc(s) {
    return String(s).replace(/[&<>]/g, function (ch) {
      return ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : '&gt;';
    });
  }

  function bootRoom() {
    if (!roomDb || !window.gifos || !gifos.me) return;
    gifos.me().then(function (who) {
      if (who && who.id) me = who;
      roomDb.subscribe(function (list) {
        var seen = {}, i, p;
        for (i = 0; i < (list || []).length; i++) {
          p = list[i];
          if (!p || !p.id) continue;
          if (p.id === 'puzzle') {
            sharedLevel = p.level;
            if (p.by !== me.id && p.level && state.level && p.level !== state.level.id &&
                !$('play').hidden) {
              openLevel(indexOfId(p.level), { follow: true, keep: true });
            }
            continue;
          }
          if (p.id === me.id) continue;
          seen[p.id] = 1;
          others[p.id] = p;
        }
        Object.keys(others).forEach(function (id) { if (!seen[id]) delete others[id]; });
        if (state.level) paintRoom();
        if (Object.keys(others).length) {
          setChip('play', Object.keys(others).length + 1 + ' in room');
        }
      });
    }).catch(function () {});
  }

  function boot() {
    if (!LEVELS.length) {
      setChip('err', 'No puzzles');
      $('progress').textContent = 'No puzzles loaded.';
      $('playBtn').disabled = true;
      return;
    }
    paintSizes();
    paintLevels();
    setChip('ready', LEVELS.length + ' puzzles');
    if (window.gifos && gifos.onBack) {
      gifos.onBack(function () {
        if (!$('play').hidden) { goHome(); return true; }
        return false;
      });
    }
    if (!saveDb) {
      bootRoom();
      return;
    }
    saveDb.get('save').then(function (row) {
      if (!row) return;
      if (row.done) save.done = row.done;
      if (row.auto != null) { save.auto = !!row.auto; $('autoX').checked = save.auto; }
      if (row.cur != null) save.cur = row.cur;
      if (row.idx != null) save.idx = row.idx | 0;
      if (row.board && row.board.length) save.board = row.board;
      paintLevels();
    }).catch(function () {
      setChip('err', 'Couldn’t load save');
    }).then(function () { bootRoom(); });
  }
  boot();
})();
