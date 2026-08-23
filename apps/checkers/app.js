// Checkers — jump, crown a king. Computer is stroibot's random-legal AI.
// A friend sits the other colour on a shared board. Invite is OS chrome.
(function () {
  'use strict';
  var C = window.CK;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch];
    });
  };

  var state = {
    mode: 'cpu', color: 'white',
    s: null, hist: [], over: false, thinking: false, sel: null
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
    el.innerHTML = '<span class="wht">○ ' + s.whites + '</span><span class="blk">● ' + s.blacks + '</span>';
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
    $('cpuNote').textContent = state.color === 'white'
      ? 'You play white and go first. The computer plays black. It thinks on this device.'
      : 'You play black. The computer plays white, and goes first.';
  });

  function makeBoard(el, onTap) {
    el.innerHTML = '';
    var r, c, sq;
    for (r = 0; r < C.SIZE; r++) for (c = 0; c < C.SIZE; c++) {
      sq = document.createElement('div');
      sq.className = 'square' + (C.isDark(r, c) ? ' dark' : ' light');
      sq.setAttribute('data-r', String(r));
      sq.setAttribute('data-c', String(c));
      sq.addEventListener('click', function () {
        onTap(+this.getAttribute('data-r'), +this.getAttribute('data-c'));
      });
      el.appendChild(sq);
    }
  }

  function paint(boardEl, s, opts) {
    opts = opts || {};
    if (!boardEl) return;
    var r, c, sq, piece, val, key, legal = {}, help = {}, i, ms, m;
    var selected = opts.selected;
    if (opts.hints && s && !s.winner) {
      ms = C.legalMoves(s);
      if (selected) {
        for (i = 0; i < ms.length; i++) {
          m = ms[i];
          if (m.fr === selected.r && m.fc === selected.c) legal[m.tr + ',' + m.tc] = 1;
        }
      }
      for (i = 0; i < ms.length; i++) {
        if (ms[i].capture) help[ms[i].fr + ',' + ms[i].fc] = 1;
      }
    }
    for (r = 0; r < C.SIZE; r++) for (c = 0; c < C.SIZE; c++) {
      sq = boardEl.children[r * C.SIZE + c];
      if (!sq) continue;
      key = r + ',' + c;
      sq.className = 'square' + (C.isDark(r, c) ? ' dark' : ' light');
      if (s && s.last && ((s.last.fr === r && s.last.fc === c) || (s.last.tr === r && s.last.tc === c))) {
        sq.classList.add('last');
      }
      if (legal[key]) sq.classList.add('hint');
      sq.innerHTML = '';
      val = s ? s.map[r][c] : 0;
      if (!val) continue;
      piece = document.createElement('div');
      piece.className = 'piece ' + (C.owner(val) === C.BLACK ? 'black' : 'white');
      if (C.isKing(val)) piece.classList.add('king');
      if (selected && selected.r === r && selected.c === c) piece.classList.add('selected');
      if (help[key] && !(selected && selected.r === r && selected.c === c)) piece.classList.add('help');
      sq.appendChild(piece);
    }
  }

  function isHumanTurn() {
    if (!state.s || state.over || state.thinking) return false;
    if (state.mode === 'hotseat') return true;
    return C.colorName(state.s.turn) === state.color;
  }
  function localStatus() {
    if (!state.s) return;
    setScore($('scoreLine'), state.s);
    if (state.s.winner) {
      var you = state.mode === 'cpu' && state.s.winner === C.colorNum(state.color);
      var msg = state.mode === 'hotseat'
        ? (C.colorName(state.s.winner).charAt(0).toUpperCase() + C.colorName(state.s.winner).slice(1) + ' wins.')
        : (you ? 'You win.' : 'The computer wins.');
      setStatus($('statusLine'), msg, you ? 'good' : 'warn');
      return;
    }
    if (state.thinking) { setStatus($('statusLine'), 'Computer is thinking…', ''); return; }
    var must = C.legalMoves(state.s).some(function (m) { return m.capture; });
    var jump = must ? (state.s.locked ? 'Keep jumping. ' : 'You must jump. ') : '';
    if (state.mode === 'hotseat') {
      var t = C.colorName(state.s.turn);
      setStatus($('statusLine'), jump + t.charAt(0).toUpperCase() + t.slice(1) + ' to play. Tap a piece, then a square.', '');
    } else {
      setStatus($('statusLine'), jump + (C.colorName(state.s.turn) === state.color
        ? 'Your turn. Tap a piece, then a square.' : 'Computer to play.'), '');
    }
  }
  function saveLocal() {
    if (!db) return;
    db.put({
      id: 'game', mode: state.mode, color: state.color,
      moves: state.hist.map(function (m) { return { fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc }; }),
      over: state.over, at: nowMs()
    }).catch(function () {});
  }
  function autoSelect() {
    if (!state.s || state.over || !isHumanTurn()) { state.sel = null; return; }
    if (state.s.locked) { state.sel = { r: state.s.locked.r, c: state.s.locked.c }; return; }
    var ms = C.legalMoves(state.s), keys = {}, i, k, only = null, n = 0;
    for (i = 0; i < ms.length; i++) {
      k = ms[i].fr + ',' + ms[i].fc;
      if (!keys[k]) { keys[k] = 1; n++; only = { r: ms[i].fr, c: ms[i].fc }; }
    }
    if (n === 1) state.sel = only;
    else if (state.sel && !keys[state.sel.r + ',' + state.sel.c]) state.sel = null;
  }
  function afterLocal() {
    autoSelect();
    paint($('board'), state.s, { hints: isHumanTurn(), selected: state.sel });
    localStatus();
    saveLocal();
    if (!state.over && !state.thinking && state.mode === 'cpu' && C.colorName(state.s.turn) !== state.color) aiMove();
  }
  function applyLocal(fr, fc, tr, tc) {
    if (!state.s || state.over) return false;
    var ns = C.play(state.s, fr, fc, tr, tc);
    if (!ns) return false;
    state.hist.push({ fr: fr, fc: fc, tr: tr, tc: tc, color: state.s.turn });
    state.s = ns;
    if (ns.winner) { state.over = true; state.thinking = false; setChip('ready', 'Ready'); }
    return true;
  }
  function playLocal(fr, fc, tr, tc) {
    if (!state.s || state.over) return false;
    if (state.mode === 'cpu' && state.thinking && C.colorName(state.s.turn) === state.color) return false;
    if (!applyLocal(fr, fc, tr, tc)) return false;
    afterLocal();
    return true;
  }
  function tapLocal(r, c) {
    if (!isHumanTurn()) return;
    var s = state.s;
    if (state.sel && (state.sel.r !== r || state.sel.c !== c)) {
      if (playLocal(state.sel.r, state.sel.c, r, c)) return;
    }
    if (s.locked) {
      state.sel = { r: s.locked.r, c: s.locked.c };
      paint($('board'), s, { hints: true, selected: state.sel });
      return;
    }
    if (C.owner(s.map[r][c]) === s.turn) {
      var has = C.legalMoves(s).some(function (m) { return m.fr === r && m.fc === c; });
      if (has) {
        state.sel = (state.sel && state.sel.r === r && state.sel.c === c) ? null : { r: r, c: c };
        paint($('board'), s, { hints: true, selected: state.sel });
      }
    }
  }
  function aiMove() {
    if (!state.s || state.over || state.mode !== 'cpu' || state.thinking) return;
    if (C.colorName(state.s.turn) === state.color) return;
    state.thinking = true;
    state.sel = null;
    setChip('thinking', 'Thinking…');
    localStatus();
    paint($('board'), state.s, { hints: false });
    setTimeout(function step() {
      if (!state.s || state.over || state.mode !== 'cpu') { state.thinking = false; return; }
      if (C.colorName(state.s.turn) === state.color) {
        state.thinking = false; setChip('ready', 'Ready'); afterLocal(); return;
      }
      var move = C.aiMove(state.s);
      if (!move || !applyLocal(move.fr, move.fc, move.tr, move.tc)) {
        state.thinking = false; setChip('ready', 'Ready'); localStatus(); return;
      }
      paint($('board'), state.s, { hints: false });
      if (state.s.locked && C.colorName(state.s.turn) !== state.color) {
        setTimeout(step, 280);
        return;
      }
      state.thinking = false;
      setChip('ready', 'Ready');
      afterLocal();
    }, 280);
  }
  function popTurn(hist) {
    if (!hist.length) return;
    var color = hist[hist.length - 1].color;
    while (hist.length && hist[hist.length - 1].color === color) hist.pop();
  }
  function undoLocal() {
    if (!state.hist.length || state.thinking) return;
    popTurn(state.hist);
    if (state.mode === 'cpu' && state.hist.length) popTurn(state.hist);
    state.s = C.replay(state.hist);
    state.over = !!state.s.winner;
    state.thinking = false;
    setChip('ready', state.mode === 'cpu' ? 'Ready' : 'Two players');
    afterLocal();
  }
  function newLocal() {
    state.s = C.fresh(); state.hist = []; state.over = false;
    state.thinking = false; state.sel = null;
    setChip('ready', state.mode === 'cpu' ? 'Ready' : 'Two players');
    $('setup').hidden = true; $('friend').hidden = true; $('game').hidden = false;
    afterLocal();
  }

  makeBoard($('board'), tapLocal);
  $('startBtn').onclick = function () { newLocal(); };
  $('newBtn').onclick = function () {
    $('game').hidden = true; $('setup').hidden = false; setChip('ready', 'Ready');
  };
  $('undoBtn').onclick = undoLocal;

  // ---- multiplayer ----
  // One collection. Each person writes ONLY their own row (id = me).
  // The board row is written by whoever is host (lowest live id).
  // A player publishes an intended move; the host applies it if it is legal.
  var PRES_TTL = 9000, HB_MS = 3000, END_HOLD = 4000;
  var mpDb = null;
  try { if (window.gifos) mpDb = gifos.db('room'); } catch (e) {}
  var mp = { on: false, id: null, name: 'You', row: null, board: null, people: [], hb: 0, sub: false, sel: null };
  var _items = [];

  function mySeat(b) {
    if (!b || !b.seats) return null;
    if (b.seats.white === mp.id) return 'white';
    if (b.seats.black === mp.id) return 'black';
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
      id: 'board', host: hostId, seats: { white: null, black: null }, names: {},
      moves: [], turn: 'white', winner: null, result: '', last: null, seq: 0,
      whites: 20, blacks: 20, startedAt: nowMs()
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
      mp.id = me.id; mp.name = me.name || 'You'; mp.on = true; mp.row = null; mp.sel = null;
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
    ['white', 'black'].forEach(function (s) {
      if (b.seats[s] && !ids[b.seats[s]]) { b.seats[s] = null; ch = true; }
    });
    if ((!b.seats.white || !b.seats.black) && (b.moves || []).length && !b.winner) {
      b.winner = b.seats.white ? 'white' : (b.seats.black ? 'black' : 'draw');
      b.result = 'Opponent left';
      b.endedAt = nowMs();
      ch = true;
    }
    var seated = {};
    seated[b.seats.white] = 1; seated[b.seats.black] = 1;
    var queue = people.map(function (p) { return p.id; }).filter(function (id) { return !seated[id]; });
    queue.sort();
    if (!b.seats.white && queue.length) { b.seats.white = queue.shift(); ch = true; }
    if (!b.seats.black && queue.length) { b.seats.black = queue.shift(); ch = true; }
    if (b.winner && b.endedAt && nowMs() - b.endedAt > END_HOLD) {
      b.moves = []; b.turn = 'white'; b.winner = null; b.result = ''; b.last = null;
      b.seq = (b.seq || 0) + 1; b.endedAt = 0; b.startedAt = nowMs();
      b.whites = 20; b.blacks = 20;
      ch = true;
    }
    people.forEach(function (p) {
      var intent = p.intent;
      if (!intent || intent.seq !== b.seq) return;
      var seat = b.seats.white === p.id ? 'white' : (b.seats.black === p.id ? 'black' : null);
      if (intent.kind === 'move') {
        if (!seat || b.winner || b.turn !== seat) return;
        if (typeof intent.fr !== 'number' || typeof intent.fc !== 'number') return;
        if (typeof intent.tr !== 'number' || typeof intent.tc !== 'number') return;
        var s = C.replay(b.moves || []);
        var ns = C.play(s, intent.fr, intent.fc, intent.tr, intent.tc);
        if (!ns) return;
        b.moves = (b.moves || []).concat([{ fr: intent.fr, fc: intent.fc, tr: intent.tr, tc: intent.tc }]);
        b.last = { fr: intent.fr, fc: intent.fc, tr: intent.tr, tc: intent.tc };
        b.seq = (b.seq || 0) + 1;
        b.whites = ns.whites; b.blacks = ns.blacks;
        if (ns.winner) { b.winner = C.colorName(ns.winner); b.result = 'No pieces left'; b.endedAt = nowMs(); }
        else b.turn = C.colorName(ns.turn);
        ch = true;
      } else if (intent.kind === 'resign') {
        if (!seat || b.winner) return;
        b.winner = seat === 'white' ? 'black' : 'white';
        b.result = 'Resigned';
        b.endedAt = nowMs();
        b.seq = (b.seq || 0) + 1;
        ch = true;
      }
    });
    if (b.host !== mp.id) { b.host = mp.id; ch = true; }
    return ch ? b : null;
  }

  function mpPlay(fr, fc, tr, tc) {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner || b.turn !== seat) return false;
    var s = C.replay(b.moves || []);
    if (!C.play(s, fr, fc, tr, tc)) return false;
    putMe({ intent: { kind: 'move', fr: fr, fc: fc, tr: tr, tc: tc, seq: b.seq } });
    return true;
  }
  $('fResign').onclick = function () {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner) return;
    putMe({ intent: { kind: 'resign', seq: b.seq } });
  };

  function mpSelOf(s, seat) {
    if (!s || s.winner || !seat || C.colorName(s.turn) !== seat) return null;
    if (s.locked) return { r: s.locked.r, c: s.locked.c };
    return mp.sel;
  }
  function mpRender() {
    if (!mp.on) return;
    var b = mp.board, status = $('fStatus');
    if (!b) { $('fSeats').innerHTML = ''; status.textContent = 'Setting up the board…'; return; }
    var s = C.replay(b.moves || []);
    var seat = mySeat(b);
    var nameOf = function (id) { return id ? esc(b.names[id] || 'Player') : '<span class="open">open</span>'; };
    $('fSeats').innerHTML =
      '<div class="seat' + (seat === 'white' ? ' me' : '') + (b.turn === 'white' && !b.winner ? ' turn' : '') + '">○ ' + nameOf(b.seats.white) + '</div>' +
      '<div class="seat' + (seat === 'black' ? ' me' : '') + (b.turn === 'black' && !b.winner ? ' turn' : '') + '">● ' + nameOf(b.seats.black) + '</div>';
    var waiting = mp.people.filter(function (p) { return p.id !== b.seats.white && p.id !== b.seats.black; });
    $('fQueue').textContent = waiting.length ? ('Watching: ' + waiting.map(function (p) { return p.name || 'Player'; }).join(', ')) : '';
    setScore($('fScore'), s);
    var both = b.seats.white && b.seats.black;
    if (!both) {
      status.innerHTML = 'Waiting for another player… press <b>Invite</b> (top bar) to bring a friend.';
    } else if (b.winner) {
      var wname = b.winner === 'draw' ? '' : nameOf(b.winner === 'white' ? b.seats.white : b.seats.black);
      status.innerHTML = b.winner === 'draw'
        ? (esc(b.result || 'Draw') + ' — next game starting…')
        : ((esc(b.result || 'No pieces left') + ' — ') + wname + ' wins. Next game starting…');
    } else if (!seat) {
      status.textContent = 'Spectating.';
    } else if (b.turn === seat) {
      var must = C.legalMoves(s).some(function (m) { return m.capture; });
      status.textContent = (must ? (s.locked ? 'Keep jumping. ' : 'You must jump. ') : '') + 'Your turn. Tap a piece, then a square.';
    } else {
      status.textContent = 'Waiting for ' + b.turn + '…';
    }
    var hints = !!(seat && b.turn === seat && !b.winner);
    if (s.locked && seat && b.turn === seat) mp.sel = { r: s.locked.r, c: s.locked.c };
    paint($('fBoard'), s, { hints: hints, selected: mpSelOf(s, seat) });
    $('fResign').hidden = !(seat && (b.moves || []).length && !b.winner);
  }

  makeBoard($('fBoard'), function (r, c) {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner || b.turn !== seat) return;
    var s = C.replay(b.moves || []);
    if (mp.sel && (mp.sel.r !== r || mp.sel.c !== c)) {
      if (mpPlay(mp.sel.r, mp.sel.c, r, c)) { mp.sel = null; return; }
    }
    if (s.locked) { mp.sel = { r: s.locked.r, c: s.locked.c }; mpRender(); return; }
    if (C.owner(s.map[r][c]) === s.turn) {
      var has = C.legalMoves(s).some(function (m) { return m.fr === r && m.fc === c; });
      if (has) {
        mp.sel = (mp.sel && mp.sel.r === r && mp.sel.c === c) ? null : { r: r, c: c };
        mpRender();
      }
    }
  });

  if (window.gifos && gifos.onBack) gifos.onBack(function () {
    if (!$('friend').hidden) mpLeave();
    else if (!$('game').hidden) { $('game').hidden = true; $('setup').hidden = false; setChip('ready', 'Ready'); }
  });

  setChip('ready', 'Ready');
  if (db) {
    db.get('game').then(function (g) {
      if (!g || !g.moves || !g.moves.length || g.over) return;
      state.mode = g.mode || 'cpu';
      state.color = g.color || 'white';
      state.hist = g.moves.slice();
      state.s = C.replay(state.hist);
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
      afterLocal();
    }).catch(function () {});
  }
})();
