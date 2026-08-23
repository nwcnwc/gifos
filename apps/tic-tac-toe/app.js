// Tic-Tac-Toe. Computer is a tiny CPU on this device. A friend sits the
// other mark on a shared board. Invite is OS chrome — this file never
// draws a share button.
//
// One collection. Each person writes ONLY their own row (id = me).
// The board row is written by whoever is host (first seated / lowest id).
// A player publishes an intended move; the host applies it if it is legal.
(function () {
  'use strict';
  var T = window.TTT;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]; });
  };

  var state = { mode: 'cpu', mark: 'x', s: null, over: false };
  var cpuTok = 0;
  var db = null;
  try { if (window.gifos) db = gifos.db('ttt'); } catch (e) {}
  var stats = { win: 0, draw: 0, loss: 0 };

  function setChip(cls, text) {
    $('aiChip').className = 'engine-chip' + (cls ? ' ' + cls : '');
    $('aiState').textContent = text;
  }
  function setStatus(el, text, cls) {
    el.className = 'statusline' + (cls ? ' ' + cls : '');
    el.textContent = text;
  }
  function showStats() {
    $('statsLine').textContent = 'Win ' + stats.win + ' · Draw ' + stats.draw + ' · Loss ' + stats.loss;
  }

  function bindSeg(id, key, attr, onChange) {
    $(id).addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      Array.prototype.forEach.call(this.children, function (c) { c.classList.remove('on'); });
      b.classList.add('on');
      state[key] = b.getAttribute(attr);
      if (onChange) onChange();
    });
  }
  bindSeg('modeSeg', 'mode', 'data-mode', function () {
    var cpu = state.mode === 'cpu';
    $('cpuOpts').hidden = !cpu;
    $('hotseatNote').hidden = cpu;
  });
  bindSeg('markSeg', 'mark', 'data-mark');

  function paint(boardEl, s) {
    var i, cell, mark, win = {};
    if (!boardEl) return;
    if (s && s.winLine) for (i = 0; i < s.winLine.length; i++) win[s.winLine[i]] = 1;
    for (i = 0; i < 9; i++) {
      cell = boardEl.children[i];
      if (!cell) continue;
      mark = s ? s.cells[i] : 0;
      cell.className = 'cell' + (mark === T.X ? ' x' : mark === T.O ? ' o' : '') + (win[i] ? ' win' : '');
      cell.setAttribute('aria-label', mark === T.X ? 'X' : mark === T.O ? 'O' : 'empty');
    }
  }
  function makeBoard(el, onPlay) {
    var i, b;
    el.innerHTML = '';
    for (i = 0; i < 9; i++) {
      b = document.createElement('button');
      b.type = 'button';
      b.className = 'cell';
      b.setAttribute('data-i', String(i));
      b.addEventListener('click', function () {
        var n = parseInt(this.getAttribute('data-i'), 10);
        onPlay((n / T.N) | 0, n % T.N);
      });
      el.appendChild(b);
    }
  }

  function isHumanTurn() {
    if (!state.s || state.over) return false;
    if (state.mode === 'hotseat') return true;
    return T.colorName(state.s.turn) === state.mark;
  }
  function localStatus() {
    if (!state.s) return;
    if (state.s.winner === -1) { setStatus($('statusLine'), 'Draw.', ''); return; }
    if (state.s.winner) {
      var w = T.colorName(state.s.winner);
      var you = state.mode === 'cpu' && w === state.mark;
      var msg = state.mode === 'hotseat'
        ? (w.toUpperCase() + ' wins.')
        : (you ? 'You win.' : 'The computer wins.');
      setStatus($('statusLine'), msg, you ? 'good' : (state.mode === 'cpu' ? 'warn' : ''));
      return;
    }
    if (state.mode === 'hotseat') {
      setStatus($('statusLine'), T.colorName(state.s.turn).toUpperCase() + ' to play.', '');
    } else {
      setStatus($('statusLine'), T.colorName(state.s.turn) === state.mark ? 'Your turn.' : 'Computer to play.', '');
    }
  }
  function saveLocal() {
    if (!db) return;
    db.put({
      id: 'game', mode: state.mode, mark: state.mark,
      cells: state.s ? state.s.cells.slice() : null,
      over: state.over, at: nowMs()
    }).catch(function () {});
  }
  function saveStats() {
    if (!db) return;
    db.put({ id: 'stats', win: stats.win, draw: stats.draw, loss: stats.loss }).catch(function () {});
    showStats();
  }
  function recordResult(s, myMark) {
    if (!s || !s.winner) return;
    if (s.winner === -1) stats.draw++;
    else if (T.colorName(s.winner) === myMark) stats.win++;
    else stats.loss++;
    saveStats();
  }
  var lastMpStat = -1;
  function maybeRecordMp(b, seat) {
    if (!b || !b.winner || !seat || b.seq === lastMpStat) return;
    lastMpStat = b.seq;
    var fake = { winner: b.winner === 'draw' ? -1 : T.colorNum(b.winner) };
    recordResult(fake, seat);
  }
  function playLocal(r, c) {
    if (!state.s || state.over) return false;
    if (!isHumanTurn() && state.mode === 'cpu') return false;
    var ns = T.place(state.s, r, c);
    if (!ns) return false;
    state.s = ns;
    paint($('board'), state.s);
    if (ns.winner) {
      state.over = true;
      if (state.mode === 'cpu') recordResult(ns, state.mark);
      localStatus();
      saveLocal();
      return true;
    }
    localStatus();
    saveLocal();
    if (state.mode === 'cpu' && T.colorName(state.s.turn) !== state.mark) cpuMove();
    return true;
  }
  function cpuMove() {
    if (!state.s || state.over || state.mode !== 'cpu') return;
    var tok = ++cpuTok;
    setChip('thinking', 'Thinking…');
    setTimeout(function () {
      if (tok !== cpuTok || !state.s || state.over) return;
      var p = T.cpuPick(state.s);
      setChip('ready', 'Ready');
      if (!p) return;
      var ns = T.place(state.s, p.r, p.c);
      if (!ns) return;
      state.s = ns;
      paint($('board'), state.s);
      if (ns.winner) {
        state.over = true;
        recordResult(ns, state.mark);
      }
      localStatus();
      saveLocal();
    }, 280);
  }
  function newLocal() {
    cpuTok++;
    state.s = T.fresh(); state.over = false;
    setChip('ready', state.mode === 'cpu' ? 'Ready' : 'Two players');
    $('setup').hidden = true; $('friend').hidden = true; $('game').hidden = false;
    paint($('board'), state.s);
    localStatus();
    saveLocal();
    if (state.mode === 'cpu' && state.mark === 'o') cpuMove();
  }

  $('startBtn').onclick = function () { newLocal(); };
  $('newBtn').onclick = function () {
    cpuTok++;
    $('game').hidden = true; $('setup').hidden = false; setChip('ready', 'Ready');
  };

  makeBoard($('board'), function (r, c) { playLocal(r, c); });

  // ---- multiplayer ----
  var PRES_TTL = 9000, HB_MS = 3000, END_HOLD = 4000;
  var mpDb = null;
  try { if (window.gifos) mpDb = gifos.db('ttt-mp'); } catch (e) {}
  var mp = { on: false, id: null, name: 'You', row: null, board: null, people: [], hb: 0, sub: false };
  var _items = [];

  function mySeat(b) {
    if (!b || !b.seats) return null;
    if (b.seats.x === mp.id) return 'x';
    if (b.seats.o === mp.id) return 'o';
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
      id: 'board', host: hostId, seats: { x: null, o: null }, names: {},
      cells: [0, 0, 0, 0, 0, 0, 0, 0, 0], turn: 'x', winner: null, result: '',
      last: null, seq: 0, startedAt: nowMs()
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

  function boardToState(b) {
    return T.fromCells(b && b.cells);
  }

  $('friendBtn').onclick = mpEnter;
  function mpEnter() {
    if (!mpDb) { setStatus($('statusLine'), 'Play a friend needs storage.', 'warn'); return; }
    (window.gifos ? gifos.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (me) {
      mp.id = me.id; mp.name = me.name || 'You'; mp.on = true; mp.row = null;
      cpuTok++;
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
    people.forEach(function (p) {
      ids[p.id] = p;
      if (b.names[p.id] !== p.name) { b.names[p.id] = p.name; ch = true; }
    });
    ['x', 'o'].forEach(function (s) {
      if (b.seats[s] && !ids[b.seats[s]]) { b.seats[s] = null; ch = true; }
    });
    var filled = 0, k;
    for (k = 0; k < 9; k++) if (b.cells[k]) filled++;
    if ((!b.seats.x || !b.seats.o) && filled && !b.winner) {
      b.winner = b.seats.x ? 'x' : (b.seats.o ? 'o' : 'draw');
      b.result = 'Opponent left';
      b.endedAt = nowMs();
      ch = true;
    }
    var seated = {};
    seated[b.seats.x] = 1; seated[b.seats.o] = 1;
    var queue = people.map(function (p) { return p.id; }).filter(function (id) { return !seated[id]; });
    queue.sort();
    if (!b.seats.x && queue.length) { b.seats.x = queue.shift(); ch = true; }
    if (!b.seats.o && queue.length) { b.seats.o = queue.shift(); ch = true; }
    if (b.winner && b.endedAt && nowMs() - b.endedAt > END_HOLD) {
      b.cells = [0, 0, 0, 0, 0, 0, 0, 0, 0]; b.turn = 'x'; b.winner = null; b.result = '';
      b.last = null; b.seq = (b.seq || 0) + 1; b.endedAt = 0; b.startedAt = nowMs();
      ch = true;
    }
    people.forEach(function (p) {
      var intent = p.intent;
      if (!intent || intent.seq !== b.seq) return;
      var seat = b.seats.x === p.id ? 'x' : (b.seats.o === p.id ? 'o' : null);
      if (intent.kind !== 'place') return;
      if (!seat || b.winner || b.turn !== seat) return;
      if (typeof intent.r !== 'number' || typeof intent.c !== 'number') return;
      var s = boardToState(b);
      var ns = T.place(s, intent.r, intent.c);
      if (!ns) return;
      b.cells = ns.cells.slice();
      b.last = { r: intent.r, c: intent.c };
      b.seq = (b.seq || 0) + 1;
      if (ns.winner === -1) { b.winner = 'draw'; b.result = 'Draw'; b.endedAt = nowMs(); }
      else if (ns.winner) { b.winner = T.colorName(ns.winner); b.result = 'Three in a row'; b.endedAt = nowMs(); }
      else b.turn = T.colorName(ns.turn);
      ch = true;
    });
    if (b.host !== mp.id) { b.host = mp.id; ch = true; }
    return ch ? b : null;
  }

  function mpPlay(r, c) {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner || b.turn !== seat) return false;
    var s = boardToState(b);
    if (!T.place(s, r, c)) return false;
    putMe({ intent: { kind: 'place', r: r, c: c, seq: b.seq } });
    return true;
  }

  function mpRender() {
    if (!mp.on) return;
    var b = mp.board, status = $('fStatus');
    if (!b) { $('fSeats').innerHTML = ''; status.textContent = 'Setting up the board…'; return; }
    var s = boardToState(b);
    var seat = mySeat(b);
    var nameOf = function (id) { return id ? esc(b.names[id] || 'Player') : '<span class="open">open</span>'; };
    $('fSeats').innerHTML =
      '<div class="seat' + (seat === 'x' ? ' me' : '') + (b.turn === 'x' && !b.winner ? ' turn' : '') + '">X ' + nameOf(b.seats.x) + '</div>' +
      '<div class="seat' + (seat === 'o' ? ' me' : '') + (b.turn === 'o' && !b.winner ? ' turn' : '') + '">O ' + nameOf(b.seats.o) + '</div>';
    var waiting = mp.people.filter(function (p) { return p.id !== b.seats.x && p.id !== b.seats.o; });
    $('fQueue').textContent = waiting.length ? ('Watching: ' + waiting.map(function (p) { return p.name || 'Player'; }).join(', ')) : '';
    var both = b.seats.x && b.seats.o;
    if (b.winner && seat) maybeRecordMp(b, seat);
    if (!both) {
      status.innerHTML = 'Waiting for another player… press <b>Invite</b> (top bar) to bring a friend.';
    } else if (b.winner) {
      var wname = b.winner === 'draw' ? '' : nameOf(b.winner === 'x' ? b.seats.x : b.seats.o);
      status.innerHTML = b.winner === 'draw'
        ? (esc(b.result || 'Draw') + ' — next game starting…')
        : ((esc(b.result || 'Three in a row') + ' — ') + wname + ' wins. Next game starting…');
    } else if (!seat) {
      status.textContent = 'Spectating.';
    } else if (b.turn === seat) {
      status.textContent = 'Your turn (' + seat.toUpperCase() + ').';
    } else {
      status.textContent = 'Waiting for ' + (b.turn === 'x' ? 'X' : 'O') + '…';
    }
    paint($('fBoard'), s);
  }

  makeBoard($('fBoard'), function (r, c) { mpPlay(r, c); });

  window.addEventListener('resize', function () {
    if (!$('game').hidden && state.s) paint($('board'), state.s);
    if (!$('friend').hidden && mp.board) paint($('fBoard'), boardToState(mp.board));
  });

  if (window.gifos && gifos.onBack) gifos.onBack(function () {
    if (!$('friend').hidden) mpLeave();
    else if (!$('game').hidden) { cpuTok++; $('game').hidden = true; $('setup').hidden = false; setChip('ready', 'Ready'); }
  });

  setChip('ready', 'Ready');
  showStats();
  if (db) {
    db.get('stats').then(function (st) {
      if (!st) return;
      stats.win = st.win | 0; stats.draw = st.draw | 0; stats.loss = st.loss | 0;
      showStats();
    }).catch(function () {});
    db.get('game').then(function (g) {
      if (!g || !g.cells || g.over) return;
      state.mode = g.mode || 'cpu';
      state.mark = g.mark || 'x';
      var s = T.fromCells(g.cells);
      if (!s.n) return;
      state.s = s; state.over = !!s.winner;
      if (state.mode === 'cpu') {
        $('modeSeg').querySelector('[data-mode="cpu"]').click();
        Array.prototype.forEach.call($('markSeg').children, function (c) {
          c.classList.toggle('on', c.getAttribute('data-mark') === state.mark);
        });
      } else {
        $('modeSeg').querySelector('[data-mode="hotseat"]').click();
      }
      $('setup').hidden = true; $('friend').hidden = true; $('game').hidden = false;
      paint($('board'), state.s);
      localStatus();
      if (!state.over && state.mode === 'cpu' && T.colorName(state.s.turn) !== state.mark) cpuMove();
    }).catch(function () {});
  }
})();
