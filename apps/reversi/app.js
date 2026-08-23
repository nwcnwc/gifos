// Reversi — flip a line, get more of your colour. Computer is Berson's MCTS.
// A friend sits the other colour on a shared board. Invite is OS chrome.
(function () {
  'use strict';
  var R = window.RV;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch];
    });
  };

  var state = {
    mode: 'cpu', color: 'black',
    s: null, hist: [], over: false, thinking: false, animating: false
  };
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
  function setScore(el, s) {
    if (!el || !s) return;
    el.innerHTML = '<span class="blk">● ' + s.blacks + '</span><span class="wht">○ ' + s.whites + '</span>';
  }

  $('modeSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    Array.prototype.forEach.call(this.children, function (c) { c.classList.remove('on'); });
    b.classList.add('on');
    state.mode = b.getAttribute('data-mode');
    var cpu = state.mode === 'cpu';
    $('cpuOpts').hidden = !cpu;
    $('hotseatNote').hidden = cpu;
  });
  $('colorSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    Array.prototype.forEach.call(this.children, function (c) { c.classList.remove('on'); });
    b.classList.add('on');
    state.color = b.getAttribute('data-color');
    $('cpuNote').textContent = state.color === 'black'
      ? 'You place black. The computer places white. It thinks on this device.'
      : 'You place white. The computer places black, and goes first.';
  });

  function diskAt(boardEl, r, c) {
    var sq = boardEl.children[r * R.SIZE + c];
    return sq ? sq.firstChild : null;
  }
  function paint(boardEl, s, opts) {
    opts = opts || {};
    if (!boardEl) return;
    var r, c, disk, col, key, legal = {};
    var hintColor = opts.hintColor || (s ? s.turn : R.BLACK);
    if (opts.hints && s && !s.winner) {
      R.availableMoves(s.map, hintColor).forEach(function (m) { legal[m.r + ',' + m.c] = 1; });
    }
    for (r = 0; r < R.SIZE; r++) for (c = 0; c < R.SIZE; c++) {
      disk = diskAt(boardEl, r, c);
      if (!disk) continue;
      disk.classList.remove('hint-b', 'hint-w', 'black', 'white', 'visible', 'inversion');
      disk.textContent = '';
      col = s ? s.map[r][c] : 0;
      key = r + ',' + c;
      if (col === R.BLACK) disk.classList.add('black', 'visible');
      else if (col === R.WHITE) disk.classList.add('white', 'visible');
      else if (legal[key]) disk.classList.add(hintColor === R.BLACK ? 'hint-b' : 'hint-w', 'visible');
    }
  }
  function animatePlace(boardEl, prev, ns, done) {
    paint(boardEl, prev, { hints: false });
    if (!ns || !ns.last) { paint(boardEl, ns); if (done) done(); return; }
    var placed = diskAt(boardEl, ns.last.r, ns.last.c);
    if (placed) {
      placed.classList.remove('hint-b', 'hint-w');
      placed.classList.add(ns.last.color === R.BLACK ? 'black' : 'white', 'visible');
    }
    var rest = (ns.flipped || []).slice(1);
    if (!rest.length) { if (done) done(); return; }
    var left = rest.length, finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      if (done) done();
    }
    rest.forEach(function (d) {
      var disk = diskAt(boardEl, d.r, d.c);
      if (!disk) { left--; if (left <= 0) finish(); return; }
      disk.classList.add('inversion');
      disk.addEventListener('animationend', function () {
        disk.classList.toggle('black');
        disk.classList.toggle('white');
        disk.classList.remove('inversion');
        left--;
        if (left <= 0) finish();
      }, { once: true });
    });
    setTimeout(finish, 1100);
  }
  function makeBoard(el, onPlay) {
    el.innerHTML = '';
    var r, c, sq, disk;
    for (r = 0; r < R.SIZE; r++) for (c = 0; c < R.SIZE; c++) {
      sq = document.createElement('div');
      sq.className = 'square';
      sq.setAttribute('data-r', String(r));
      sq.setAttribute('data-c', String(c));
      disk = document.createElement('div');
      disk.className = 'disk';
      sq.appendChild(disk);
      sq.addEventListener('click', function () {
        onPlay(+this.getAttribute('data-r'), +this.getAttribute('data-c'));
      });
      el.appendChild(sq);
    }
  }

  function isHumanTurn() {
    if (!state.s || state.over || state.thinking || state.animating) return false;
    if (state.mode === 'hotseat') return true;
    return R.colorName(state.s.turn) === state.color;
  }
  function localStatus() {
    if (!state.s) return;
    setScore($('scoreLine'), state.s);
    if (state.s.winner === R.DRAW) {
      setStatus($('statusLine'), 'Draw — ' + state.s.blacks + ' apiece.', '');
      return;
    }
    if (state.s.winner) {
      var you = state.mode === 'cpu' && state.s.winner === R.colorNum(state.color);
      var msg = state.mode === 'hotseat'
        ? (R.colorName(state.s.winner).charAt(0).toUpperCase() + R.colorName(state.s.winner).slice(1) +
           ' wins, ' + state.s.blacks + '–' + state.s.whites + '.')
        : (you ? 'You win, ' + state.s.blacks + '–' + state.s.whites + '.'
               : 'The computer wins, ' + state.s.blacks + '–' + state.s.whites + '.');
      setStatus($('statusLine'), msg, you ? 'good' : 'warn');
      return;
    }
    if (state.thinking) { setStatus($('statusLine'), 'Computer is thinking…', ''); return; }
    var pass = state.s.passed ? 'No move for the other side. ' : '';
    if (state.mode === 'hotseat') {
      var t = R.colorName(state.s.turn);
      setStatus($('statusLine'), pass + t.charAt(0).toUpperCase() + t.slice(1) + ' to play. Tap a square.', '');
    } else {
      setStatus($('statusLine'), pass + (R.colorName(state.s.turn) === state.color
        ? 'Your turn. Tap a square.' : 'Computer to play.'), '');
    }
  }
  function saveLocal() {
    if (!db) return;
    db.put({
      id: 'game', mode: state.mode, color: state.color,
      moves: state.hist.map(function (m) { return { r: m.r, c: m.c }; }),
      over: state.over, at: nowMs()
    }).catch(function () {});
  }
  function afterLocal() {
    state.animating = false;
    paint($('board'), state.s, { hints: isHumanTurn(), hintColor: state.s ? state.s.turn : R.BLACK });
    localStatus();
    saveLocal();
    if (!state.over && state.mode === 'cpu' && R.colorName(state.s.turn) !== state.color) aiMove();
  }
  function playLocal(r, c) {
    if (!state.s || state.over || state.animating) return false;
    if (state.mode === 'cpu' && state.thinking && R.colorName(state.s.turn) === state.color) return false;
    var prev = state.s;
    var ns = R.place(state.s, r, c);
    if (!ns) return false;
    state.hist.push({ r: r, c: c });
    state.s = ns;
    if (ns.winner) { state.over = true; state.thinking = false; setChip('ready', 'Ready'); }
    state.animating = true;
    animatePlace($('board'), prev, ns, afterLocal);
    return true;
  }
  function aiMove() {
    if (!state.s || state.over || state.mode !== 'cpu') return;
    if (R.colorName(state.s.turn) === state.color) return;
    state.thinking = true;
    setChip('thinking', 'Thinking…');
    localStatus();
    paint($('board'), state.s, { hints: false });
    setTimeout(function () {
      if (!state.s || state.over || state.mode !== 'cpu') { state.thinking = false; return; }
      var move;
      if (state.s.n === 0) {
        var book = R.OPENING;
        move = book[Math.trunc(Math.random() * book.length)];
      } else {
        move = R.aiMove(state.s.map, state.s.turn, R.TIME_LIMIT);
      }
      state.thinking = false;
      setChip('ready', 'Ready');
      if (!move) { localStatus(); return; }
      playLocal(move.r, move.c);
    }, 50);
  }
  function undoLocal() {
    if (!state.hist.length || state.animating) return;
    if (state.over) state.hist.pop();
    else if (state.mode === 'cpu') {
      state.hist.pop();
      if (state.hist.length) state.hist.pop();
    } else state.hist.pop();
    state.s = R.replay(state.hist);
    state.over = !!state.s.winner;
    state.thinking = false;
    setChip('ready', state.mode === 'cpu' ? 'Ready' : 'Two players');
    paint($('board'), state.s, { hints: isHumanTurn(), hintColor: state.s.turn });
    localStatus();
    saveLocal();
    if (!state.over && state.mode === 'cpu' && R.colorName(state.s.turn) !== state.color) aiMove();
  }
  function newLocal() {
    state.s = R.fresh(); state.hist = []; state.over = false;
    state.thinking = false; state.animating = false;
    setChip('ready', state.mode === 'cpu' ? 'Ready' : 'Two players');
    $('setup').hidden = true; $('friend').hidden = true; $('game').hidden = false;
    paint($('board'), state.s, { hints: isHumanTurn(), hintColor: state.s.turn });
    localStatus();
    saveLocal();
    if (state.mode === 'cpu' && state.color === 'white') aiMove();
  }

  makeBoard($('board'), function (r, c) { if (isHumanTurn()) playLocal(r, c); });
  $('startBtn').onclick = function () { newLocal(); };
  $('newBtn').onclick = function () {
    $('game').hidden = true; $('setup').hidden = false; setChip('ready', 'Ready');
  };
  $('undoBtn').onclick = undoLocal;

  // ---- multiplayer ----
  // One collection. Each person writes ONLY their own row (id = me).
  // The board row is written by whoever is host (lowest live id).
  // A player publishes an intended place; the host applies it if it is legal.
  var PRES_TTL = 9000, HB_MS = 3000, END_HOLD = 4000;
  var mpDb = null;
  try { if (window.gifos) mpDb = gifos.db('room'); } catch (e) {}
  var mp = { on: false, id: null, name: 'You', row: null, board: null, people: [], hb: 0, sub: false };
  var _items = [];
  var _mpSeqPaint = -1;

  function mySeat(b) {
    if (!b || !b.seats) return null;
    if (b.seats.black === mp.id) return 'black';
    if (b.seats.white === mp.id) return 'white';
    return null;
  }
  function isHost(people) {
    if (!people.length) return true;
    var m = people[0].id, i;
    for (i = 0; i < people.length; i++) if (people[i].id < m) m = people[i].id;
    return mp.id === m;
  }
  function freshBoard(hostId) {
    return {
      id: 'board', host: hostId, seats: { black: null, white: null }, names: {},
      moves: [], turn: 'black', winner: null, result: '', last: null, seq: 0,
      blacks: 2, whites: 2, passed: false, startedAt: nowMs()
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
      mp.id = me.id; mp.name = me.name || 'You'; mp.on = true; mp.row = null;
      _mpSeqPaint = -1;
      $('setup').hidden = true; $('game').hidden = true; $('friend').hidden = false;
      setChip('ready', 'A friend');
      if (!mp.sub) {
        mp.sub = true;
        mpDb.subscribe(function (items) { _items = items || []; mpRefresh(); });
      }
      putMe();
      if (mp.hb) clearInterval(mp.hb);
      mp.hb = setInterval(function () { if (mp.on) putMe(); }, HB_MS);
      mpRender(true);
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
      mpRender(true);
      return;
    }
    if (isHost(people)) {
      var next = mpReconcile(board, people);
      if (next) { putBoard(next); return; }
    }
    if (mp.row && mp.row.intent && board.seq !== mp.row.intent.seq) {
      putMe({ intent: null });
    }
    mpRender(false);
  }

  function mpReconcile(B, people) {
    var b = JSON.parse(JSON.stringify(B));
    var ch = false;
    var ids = {};
    people.forEach(function (p) {
      ids[p.id] = p;
      if (b.names[p.id] !== p.name) { b.names[p.id] = p.name; ch = true; }
    });
    ['black', 'white'].forEach(function (s) {
      if (b.seats[s] && !ids[b.seats[s]]) { b.seats[s] = null; ch = true; }
    });
    if ((!b.seats.black || !b.seats.white) && (b.moves || []).length && !b.winner) {
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
      b.moves = []; b.turn = 'black'; b.winner = null; b.result = ''; b.last = null;
      b.seq = (b.seq || 0) + 1; b.endedAt = 0; b.startedAt = nowMs();
      b.blacks = 2; b.whites = 2; b.passed = false;
      ch = true;
    }
    people.forEach(function (p) {
      var intent = p.intent;
      if (!intent || intent.seq !== b.seq) return;
      var seat = b.seats.black === p.id ? 'black' : (b.seats.white === p.id ? 'white' : null);
      if (intent.kind === 'place') {
        if (!seat || b.winner || b.turn !== seat) return;
        if (typeof intent.r !== 'number' || typeof intent.c !== 'number') return;
        var s = R.replay(b.moves || []);
        var ns = R.place(s, intent.r, intent.c);
        if (!ns) return;
        b.moves = (b.moves || []).concat([{ r: intent.r, c: intent.c }]);
        b.last = { r: intent.r, c: intent.c };
        b.seq = (b.seq || 0) + 1;
        b.blacks = ns.blacks; b.whites = ns.whites; b.passed = !!ns.passed;
        if (ns.winner === R.DRAW) { b.winner = 'draw'; b.result = 'Draw'; b.endedAt = nowMs(); }
        else if (ns.winner) { b.winner = R.colorName(ns.winner); b.result = 'Most disks'; b.endedAt = nowMs(); }
        else b.turn = R.colorName(ns.turn);
        ch = true;
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

  function mpPlay(r, c) {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner || b.turn !== seat) return false;
    var s = R.replay(b.moves || []);
    if (!R.place(s, r, c)) return false;
    putMe({ intent: { kind: 'place', r: r, c: c, seq: b.seq } });
    return true;
  }
  $('fResign').onclick = function () {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner) return;
    putMe({ intent: { kind: 'resign', seq: b.seq } });
  };

  function mpRender(snap) {
    if (!mp.on) return;
    var b = mp.board, status = $('fStatus');
    if (!b) { $('fSeats').innerHTML = ''; status.textContent = 'Setting up the board…'; return; }
    var s = R.replay(b.moves || []);
    var seat = mySeat(b);
    var nameOf = function (id) { return id ? esc(b.names[id] || 'Player') : '<span class="open">open</span>'; };
    $('fSeats').innerHTML =
      '<div class="seat' + (seat === 'black' ? ' me' : '') + (b.turn === 'black' && !b.winner ? ' turn' : '') + '">● ' + nameOf(b.seats.black) + '</div>' +
      '<div class="seat' + (seat === 'white' ? ' me' : '') + (b.turn === 'white' && !b.winner ? ' turn' : '') + '">○ ' + nameOf(b.seats.white) + '</div>';
    var waiting = mp.people.filter(function (p) { return p.id !== b.seats.black && p.id !== b.seats.white; });
    $('fQueue').textContent = waiting.length ? ('Watching: ' + waiting.map(function (p) { return p.name || 'Player'; }).join(', ')) : '';
    setScore($('fScore'), s);
    var both = b.seats.black && b.seats.white;
    if (!both) {
      status.innerHTML = 'Waiting for another player… press <b>Invite</b> (top bar) to bring a friend.';
    } else if (b.winner) {
      var wname = b.winner === 'draw' ? '' : nameOf(b.winner === 'black' ? b.seats.black : b.seats.white);
      status.innerHTML = b.winner === 'draw'
        ? (esc(b.result || 'Draw') + ' — next game starting…')
        : ((esc(b.result || 'Most disks') + ' — ') + wname + ' wins. Next game starting…');
    } else if (!seat) {
      status.textContent = 'Spectating.';
    } else if (b.turn === seat) {
      status.textContent = (b.passed ? 'No move for the other side. ' : '') + 'Your turn. Tap a square.';
    } else {
      status.textContent = 'Waiting for ' + b.turn + '…';
    }
    var seq = b.seq || 0;
    var hints = !!(seat && b.turn === seat && !b.winner);
    if (snap || seq === _mpSeqPaint || !s.last || seq === 0) {
      paint($('fBoard'), s, { hints: hints, hintColor: seat ? R.colorNum(seat) : s.turn });
      _mpSeqPaint = seq;
    } else {
      var prev = R.replay((b.moves || []).slice(0, -1));
      _mpSeqPaint = seq;
      animatePlace($('fBoard'), prev, s, function () {
        paint($('fBoard'), s, { hints: hints, hintColor: seat ? R.colorNum(seat) : s.turn });
      });
    }
    $('fResign').hidden = !(seat && (b.moves || []).length && !b.winner);
  }

  makeBoard($('fBoard'), function (r, c) { mpPlay(r, c); });

  if (window.gifos && gifos.onBack) gifos.onBack(function () {
    if (!$('friend').hidden) mpLeave();
    else if (!$('game').hidden) { $('game').hidden = true; $('setup').hidden = false; setChip('ready', 'Ready'); }
  });

  setChip('ready', 'Ready');
  if (db) {
    db.get('game').then(function (g) {
      if (!g || !g.moves || !g.moves.length || g.over) return;
      state.mode = g.mode || 'cpu';
      state.color = g.color || 'black';
      state.hist = g.moves.slice();
      state.s = R.replay(state.hist);
      state.over = !!state.s.winner;
      if (state.mode === 'hotseat') {
        $('modeSeg').querySelector('[data-mode="hotseat"]').click();
        setChip('ready', 'Two players');
      } else {
        $('modeSeg').querySelector('[data-mode="cpu"]').click();
        Array.prototype.forEach.call($('colorSeg').children, function (c) {
          c.classList.toggle('on', c.getAttribute('data-color') === state.color);
        });
      }
      $('setup').hidden = true; $('friend').hidden = true; $('game').hidden = false;
      paint($('board'), state.s, { hints: isHumanTurn(), hintColor: state.s.turn });
      localStatus();
      if (!state.over && state.mode === 'cpu' && R.colorName(state.s.turn) !== state.color) aiMove();
    }).catch(function () {});
  }
})();
