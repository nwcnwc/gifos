// BesoGo — a Go board. Engine and display are yewang's BesoGo (MIT),
// running on this device. A friend sits the other colour on a shared board.
// Invite is OS chrome — this file never draws a share button.
//
// One collection. Each person writes ONLY their own row (id = me).
// The board row is written by whoever is host (first seated / lowest id).
// A player publishes an intended move; the host applies it if it is legal.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]; });
  };
  var BLACK = -1, WHITE = 1;
  var colorNum = function (name) { return name === 'white' ? WHITE : BLACK; };
  var colorName = function (n) { return n === WHITE ? 'white' : 'black'; };

  var state = { size: 19, hist: [], over: false, result: '' };
  var localEditor = null;
  var db = null;
  try { if (window.gifos) db = gifos.db('save'); } catch (e) {}

  function setChip(cls, text) {
    $('aiChip').className = 'engine-chip' + (cls ? ' ' + cls : '');
    $('aiState').textContent = text;
  }
  function setStatus(el, text, cls) {
    el.className = 'statusline' + (cls ? ' ' + cls : '');
    el.textContent = text;
  }

  $('sizeSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    Array.prototype.forEach.call(this.children, function (c) { c.classList.remove('on'); });
    b.classList.add('on');
    state.size = parseInt(b.getAttribute('data-size'), 10) || 19;
  });

  // Replay a move list onto a fresh tree. Returns the last node (or root).
  function replay(size, hist) {
    var root = besogo.makeGameRoot(size, size);
    var node = root, i, child, color;
    for (i = 0; i < hist.length; i++) {
      child = node.makeChild();
      color = colorNum(hist[i].color);
      if (!child.playMove(hist[i].x, hist[i].y, color, false)) return null;
      node.addChild(child);
      node = child;
    }
    return node;
  }
  function legalPlace(size, hist, x, y, seat) {
    var node = replay(size, hist);
    if (!node) return false;
    if (colorName(node.nextMove()) !== seat) return false;
    var child = node.makeChild();
    return !!child.playMove(x, y, colorNum(seat), false);
  }
  function twoPasses(hist) {
    if (hist.length < 2) return false;
    var a = hist[hist.length - 1], b = hist[hist.length - 2];
    return a.x === 0 && a.y === 0 && b.x === 0 && b.y === 0;
  }
  function capsOf(node) {
    if (!node) return { black: 0, white: 0 };
    return { black: node.blackCaps || 0, white: node.whiteCaps || 0 };
  }
  function turnOf(hist) {
    if (!hist.length) return 'black';
    return hist[hist.length - 1].color === 'black' ? 'white' : 'black';
  }

  // Tap on the SVG is a click. On a phone the delayed click is flaky, so
  // a touchend synthesises one click and cancels the later ghost.
  function enableTouchPlace(container) {
    var last = 0;
    container.addEventListener('touchend', function (e) {
      if (!e.changedTouches || !e.changedTouches.length) return;
      var t = e.changedTouches[0];
      var el = document.elementFromPoint(t.clientX, t.clientY);
      if (!el || !container.contains(el)) return;
      last = nowMs();
      e.preventDefault();
      el.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, view: window,
        clientX: t.clientX, clientY: t.clientY
      }));
    }, { passive: false });
    container.addEventListener('click', function (e) {
      if (last && nowMs() - last < 500) {
        last = 0;
        // The synthetic click from touchend is the one we want; a leftover
        // browser click arriving later is dropped by the timestamp. This
        // listener only exists to eat that leftover — BesoGo binds click
        // on the rects themselves, so we do not stopPropagation here.
        void e;
      }
    }, true);
  }

  function mountBoard(el, size, onPlace) {
    el.innerHTML = '';
    besogo.create(el, {
      size: String(size),
      panels: '',
      tool: 'auto',
      coord: 'none',
      resize: 'auto',
      orient: 'landscape',
      nowheel: true,
      nokeys: true,
      shadows: true
    });
    var editor = el.besogoEditor;
    var orig = editor.click;
    editor.click = function (i, j) {
      onPlace(i, j);
    };
    enableTouchPlace(el);
    return { editor: editor, orig: orig };
  }
  function loadHist(editor, size, hist) {
    var node = replay(size, hist);
    if (!node) return;
    var root = node;
    while (root.parent) root = root.parent;
    editor.loadRoot(root);
    if (hist.length) editor.nextNode(-1);
  }

  // ---- local (two here) ----
  function localCapsText() {
    var node = localEditor ? localEditor.getCurrent() : null;
    var c = capsOf(node);
    return 'Taken · black ' + c.black + ' · white ' + c.white;
  }
  function localStatus() {
    if (state.over) {
      if (state.result === 'Both passed') {
        setStatus($('statusLine'), 'Both passed — the game is over.', '');
      } else {
        setStatus($('statusLine'), state.result || 'Game over.', '');
      }
    } else {
      var t = turnOf(state.hist);
      setStatus($('statusLine'), (t === 'black' ? 'Black' : 'White') + ' to play.', '');
    }
    $('localBlack').className = 'seat' + (!state.over && turnOf(state.hist) === 'black' ? ' turn' : '');
    $('localWhite').className = 'seat' + (!state.over && turnOf(state.hist) === 'white' ? ' turn' : '');
    $('localCaps').textContent = localCapsText();
  }
  function saveLocal() {
    if (!db) return;
    db.put({
      id: 'game', size: state.size,
      hist: state.hist.slice(),
      over: state.over, result: state.result, at: nowMs()
    }).catch(function () {});
  }
  function playLocal(x, y) {
    if (state.over) return false;
    var seat = turnOf(state.hist);
    if (!legalPlace(state.size, state.hist, x, y, seat)) return false;
    state.hist.push({ x: x, y: y, color: seat });
    if (twoPasses(state.hist)) { state.over = true; state.result = 'Both passed'; }
    if (localEditor) loadHist(localEditor, state.size, state.hist);
    localStatus();
    saveLocal();
    return true;
  }
  function undoLocal() {
    if (!state.hist.length) return;
    state.hist.pop();
    state.over = false;
    state.result = '';
    if (localEditor) loadHist(localEditor, state.size, state.hist);
    localStatus();
    saveLocal();
  }
  function newLocal() {
    state.hist = []; state.over = false; state.result = '';
    $('setup').hidden = true; $('friend').hidden = true; $('game').hidden = false;
    setChip('ready', 'Two here');
    var mounted = mountBoard($('board'), state.size, function (i, j) { playLocal(i, j); });
    localEditor = mounted.editor;
    localStatus();
    saveLocal();
  }

  $('startBtn').onclick = function () { newLocal(); };
  $('newBtn').onclick = function () {
    localEditor = null;
    $('board').innerHTML = '';
    $('game').hidden = true; $('setup').hidden = false; setChip('ready', 'Ready');
  };
  $('undoBtn').onclick = undoLocal;
  $('passBtn').onclick = function () { playLocal(0, 0); };

  // ---- multiplayer ----
  var PRES_TTL = 9000, HB_MS = 3000, END_HOLD = 4000;
  var mpDb = null;
  try { if (window.gifos) mpDb = gifos.db('room'); } catch (e) {}
  var mp = { on: false, id: null, name: 'You', row: null, board: null, people: [], hb: 0, sub: false, editor: null, shown: '' };
  var _items = [];

  function mySeat(b) {
    if (!b || !b.seats) return null;
    if (b.seats.black === mp.id) return 'black';
    if (b.seats.white === mp.id) return 'white';
    return null;
  }
  function isHost(people) {
    if (!people.length) return true;
    var m = people[0].id;
    for (var i = 0; i < people.length; i++) if (people[i].id < m) m = people[i].id;
    return mp.id === m;
  }
  function freshBoard(hostId) {
    return {
      id: 'board', host: hostId, seats: { black: null, white: null }, names: {},
      size: state.size, hist: [], turn: 'black', winner: null, result: '',
      seq: 0, undoAsk: null, startedAt: nowMs()
    };
  }
  function putMe(extra) {
    var row = { id: mp.id, name: mp.name, at: nowMs(), intent: null };
    if (mp.row && mp.row.intent) row.intent = mp.row.intent;
    if (extra && extra.intent !== undefined) row.intent = extra.intent;
    mp.row = row;
    mpDb.put(row).catch(function () {});
  }
  function putBoard(b) { mp.board = b; mpDb.put(b).catch(function () {}); }

  $('friendBtn').onclick = mpEnter;
  function mpEnter() {
    if (!mpDb) { setStatus($('statusLine'), 'Play a friend needs storage.', 'warn'); return; }
    (window.gifos ? gifos.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (me) {
      mp.id = me.id; mp.name = me.name || 'You'; mp.on = true; mp.row = null; mp.editor = null; mp.shown = '';
      $('fBoard').innerHTML = '';
      $('setup').hidden = true; $('game').hidden = true; $('friend').hidden = false;
      setChip('ready', 'A friend');
      if (!mp.sub) {
        mp.sub = true;
        mpDb.subscribe(function (items) { _items = items || []; mpRefresh(); });
      }
      putMe();
      if (mp.hb) clearInterval(mp.hb);
      mp.hb = setInterval(function () { if (mp.on) putMe(); }, HB_MS);
      mpRender();
    });
  }
  function mpLeave() {
    mp.on = false;
    if (mp.hb) clearInterval(mp.hb); mp.hb = 0;
    if (mpDb && mp.id) mpDb.delete(mp.id).catch(function () {});
    mp.editor = null; mp.shown = '';
    $('fBoard').innerHTML = '';
    $('friend').hidden = true; $('setup').hidden = false; setChip('ready', 'Ready');
  }
  $('fLeave').onclick = mpLeave;

  function mpRefresh() {
    if (!mp.on) return;
    var t = nowMs();
    var people = [], board = null, i, it;
    for (i = 0; i < _items.length; i++) {
      it = _items[i];
      if (!it || !it.id) continue;
      if (it.id === 'board') { board = it; continue; }
      if (it.at && t - it.at < PRES_TTL) people.push(it);
    }
    if (!people.some(function (p) { return p.id === mp.id; })) {
      people.push(mp.row || { id: mp.id, name: mp.name, at: t });
    }
    mp.people = people;
    mp.board = board;
    if (mp.row) {
      for (i = 0; i < people.length; i++) if (people[i].id === mp.id) mp.row = people[i];
    }
    if (!board) {
      if (isHost(people)) putBoard(freshBoard(mp.id));
      mpRender();
      return;
    }
    if (isHost(people)) {
      var next = mpReconcile(board, people);
      if (next) { putBoard(next); return; }
    }
    if (mp.row && mp.row.intent && board.seq !== mp.row.intent.seq) {
      putMe({ intent: null });
    }
    mpRender();
  }

  function mpReconcile(B, people) {
    var b = JSON.parse(JSON.stringify(B));
    var ch = false;
    var ids = {};
    if (!b.size) { b.size = 19; ch = true; }
    if (!b.hist) { b.hist = []; ch = true; }
    people.forEach(function (p) {
      ids[p.id] = p;
      if (b.names[p.id] !== p.name) { b.names[p.id] = p.name; ch = true; }
    });
    ['black', 'white'].forEach(function (s) {
      if (b.seats[s] && !ids[b.seats[s]]) { b.seats[s] = null; ch = true; }
    });
    if ((!b.seats.black || !b.seats.white) && b.hist.length && !b.winner) {
      b.winner = b.seats.black ? 'black' : (b.seats.white ? 'white' : 'draw');
      b.result = 'Opponent left';
      b.endedAt = nowMs();
      ch = true;
    }
    var seated = {};
    seated[b.seats.black] = 1; seated[b.seats.white] = 1;
    var queue = people.map(function (p) { return p.id; }).filter(function (id) { return !seated[id]; });
    queue.sort();
    if (!b.seats.black && queue.length) { b.seats.black = queue.shift(); ch = true; }
    if (!b.seats.white && queue.length) { b.seats.white = queue.shift(); ch = true; }
    if (b.winner && b.endedAt && nowMs() - b.endedAt > END_HOLD) {
      b.hist = []; b.turn = 'black'; b.winner = null; b.result = '';
      b.seq = (b.seq || 0) + 1; b.undoAsk = null; b.endedAt = 0; b.startedAt = nowMs();
      ch = true;
    }
    people.forEach(function (p) {
      var intent = p.intent;
      if (!intent || intent.seq !== b.seq) return;
      var seat = b.seats.black === p.id ? 'black' : (b.seats.white === p.id ? 'white' : null);
      if (intent.kind === 'place') {
        if (!seat || b.winner || b.turn !== seat) return;
        var x = intent.x, y = intent.y;
        if (typeof x !== 'number' || typeof y !== 'number') return;
        if (!legalPlace(b.size, b.hist, x, y, seat)) return;
        b.hist = b.hist.concat([{ x: x, y: y, color: seat }]);
        b.seq = (b.seq || 0) + 1;
        b.undoAsk = null;
        if (twoPasses(b.hist)) {
          b.winner = 'draw'; b.result = 'Both passed'; b.endedAt = nowMs();
        } else {
          b.turn = turnOf(b.hist);
        }
        ch = true;
      } else if (intent.kind === 'undo') {
        if (!seat || !b.hist.length) return;
        var last = b.hist[b.hist.length - 1];
        var lastIsMine = last.color === seat;
        var both = b.undoAsk && b.undoAsk.id && b.undoAsk.id !== p.id && b.undoAsk.seq === b.seq;
        if (lastIsMine || both) {
          b.hist = b.hist.slice(0, -1);
          b.winner = null; b.result = ''; b.endedAt = 0;
          b.turn = turnOf(b.hist);
          b.seq = (b.seq || 0) + 1;
          b.undoAsk = null;
          ch = true;
        } else if (!b.undoAsk || b.undoAsk.id !== p.id) {
          b.undoAsk = { id: p.id, seq: b.seq };
          ch = true;
        }
      } else if (intent.kind === 'resign') {
        if (!seat || b.winner) return;
        b.winner = seat === 'black' ? 'white' : 'black';
        b.result = 'Resigned';
        b.endedAt = nowMs();
        b.seq = (b.seq || 0) + 1;
        ch = true;
      }
    });
    if (b.host !== mp.id) { b.host = mp.id; ch = true; }
    return ch ? b : null;
  }

  function mpPlay(x, y) {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner || b.turn !== seat) return false;
    if (!legalPlace(b.size, b.hist || [], x, y, seat)) return false;
    putMe({ intent: { kind: 'place', x: x, y: y, seq: b.seq } });
    return true;
  }
  $('fPass').onclick = function () { mpPlay(0, 0); };
  $('fUndo').onclick = function () {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || !(b.hist && b.hist.length)) return;
    putMe({ intent: { kind: 'undo', seq: b.seq } });
  };
  $('fResign').onclick = function () {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner) return;
    putMe({ intent: { kind: 'resign', seq: b.seq } });
  };

  function mpEnsureBoard(b) {
    var key = b.size + ':' + b.seq + ':' + (b.hist ? b.hist.length : 0);
    if (mp.editor && mp.shown === key) return;
    if (!mp.editor || mp.shown.split(':')[0] !== String(b.size)) {
      var mounted = mountBoard($('fBoard'), b.size, function (i, j) { mpPlay(i, j); });
      mp.editor = mounted.editor;
    }
    loadHist(mp.editor, b.size, b.hist || []);
    mp.shown = key;
  }

  function mpRender() {
    if (!mp.on) return;
    var b = mp.board, status = $('fStatus');
    if (!b) { $('fSeats').innerHTML = ''; status.textContent = 'Setting up the board…'; return; }
    var seat = mySeat(b);
    var nameOf = function (id) { return id ? esc(b.names[id] || 'Player') : '<span class="open">open</span>'; };
    $('fSeats').innerHTML =
      '<div class="seat' + (seat === 'black' ? ' me' : '') + (b.turn === 'black' && !b.winner ? ' turn' : '') + '">● ' + nameOf(b.seats.black) + '</div>' +
      '<div class="seat' + (seat === 'white' ? ' me' : '') + (b.turn === 'white' && !b.winner ? ' turn' : '') + '">○ ' + nameOf(b.seats.white) + '</div>';
    var waiting = mp.people.filter(function (p) { return p.id !== b.seats.black && p.id !== b.seats.white; });
    $('fQueue').textContent = waiting.length ? ('Watching: ' + waiting.map(function (p) { return p.name || 'Player'; }).join(', ')) : '';
    var both = b.seats.black && b.seats.white;
    if (!both) {
      status.innerHTML = 'Waiting for another player… press <b>Invite</b> (top bar) to bring a friend.';
    } else if (b.winner) {
      var wname = b.winner === 'draw' ? '' : nameOf(b.winner === 'black' ? b.seats.black : b.seats.white);
      status.innerHTML = b.winner === 'draw'
        ? (esc(b.result || 'Both passed') + ' — next game starting…')
        : ((esc(b.result || 'Game over') + ' — ') + wname + ' wins. Next game starting…');
    } else if (!seat) {
      status.textContent = 'Spectating.';
    } else if (b.turn === seat) {
      status.textContent = 'Your turn (' + seat + ').';
    } else {
      status.textContent = 'Waiting for ' + (b.turn === 'black' ? 'black' : 'white') + '…';
    }
    if (b.undoAsk && !b.winner && seat && b.undoAsk.id !== mp.id) {
      status.textContent = (b.names[b.undoAsk.id] || 'The other player') + ' wants to take back a stone. Press Undo if you agree.';
    }
    var node = replay(b.size, b.hist || []);
    var c = capsOf(node);
    $('fCaps').textContent = 'Taken · black ' + c.black + ' · white ' + c.white;
    mpEnsureBoard(b);
    var playing = !!(seat && both && !b.winner);
    $('fPass').hidden = !playing;
    $('fUndo').hidden = !(playing && b.hist && b.hist.length);
    $('fResign').hidden = !(playing && b.hist && b.hist.length);
  }

  window.addEventListener('resize', function () {
    // BesoGo's own auto-resizer listens too; nothing extra to do.
  });

  if (window.gifos && gifos.onBack) gifos.onBack(function () {
    if (!$('friend').hidden) mpLeave();
    else if (!$('game').hidden) {
      localEditor = null;
      $('board').innerHTML = '';
      $('game').hidden = true; $('setup').hidden = false; setChip('ready', 'Ready');
    }
  });

  setChip('ready', 'Ready');
  if (db) {
    db.get('game').then(function (g) {
      if (!g || !g.hist || !g.hist.length || g.over) return;
      state.size = g.size || 19;
      state.hist = g.hist;
      state.over = !!g.over;
      state.result = g.result || '';
      Array.prototype.forEach.call($('sizeSeg').children, function (c) {
        c.classList.toggle('on', parseInt(c.getAttribute('data-size'), 10) === state.size);
      });
      $('setup').hidden = true; $('friend').hidden = true; $('game').hidden = false;
      setChip('ready', 'Two here');
      var mounted = mountBoard($('board'), state.size, function (i, j) { playLocal(i, j); });
      localEditor = mounted.editor;
      loadHist(localEditor, state.size, state.hist);
      localStatus();
    }).catch(function () {});
  }
})();
