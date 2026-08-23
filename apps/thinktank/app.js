// Thinktank — place, move, rotate. Destroy the other base.
// Computer thinks on this device. A friend sits the other colour.
// Invite is OS chrome.
(function () {
  'use strict';
  var T = window.TT;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch];
    });
  };

  function glyph(token) {
    var a = 'fill="currentColor"';
    if (token === T.BLOCKER) {
      return '<svg viewBox="0 0 24 24"><path ' + a + ' d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/></svg>';
    }
    if (token === T.TANK_U) {
      return '<svg viewBox="0 0 24 24"><path ' + a + ' d="M12 3l8 12h-5v6H9v-6H4z"/></svg>';
    }
    if (token === T.TANK_D) {
      return '<svg viewBox="0 0 24 24"><path ' + a + ' d="M12 21L4 9h5V3h6v6h5z"/></svg>';
    }
    if (token === T.TANK_L) {
      return '<svg viewBox="0 0 24 24"><path ' + a + ' d="M3 12L15 4v5h6v6h-6v5z"/></svg>';
    }
    if (token === T.TANK_R) {
      return '<svg viewBox="0 0 24 24"><path ' + a + ' d="M21 12L9 20v-5H3V9h6V4z"/></svg>';
    }
    if (token === T.INF_O) {
      return '<svg viewBox="0 0 24 24"><path ' + a + ' d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z"/></svg>';
    }
    if (token === T.INF_X) {
      return '<svg viewBox="0 0 24 24"><path ' + a + ' d="M5.5 3.5L12 10l6.5-6.5 2 2L14 12l6.5 6.5-2 2L12 14l-6.5 6.5-2-2L10 12 3.5 5.5z"/></svg>';
    }
    if (token === T.MINE) {
      return '<svg viewBox="0 0 24 24"><circle ' + a + ' cx="12" cy="13" r="7"/><path ' + a + ' d="M11 2h2v4h-2zM4.2 6.1l1.4-1.4 2.8 2.8-1.4 1.4zM17 4.7l1.4 1.4-2.8 2.8-1.4-1.4z"/></svg>';
    }
    if (token === T.BASE) {
      return '<svg viewBox="0 0 24 24"><path ' + a + ' d="M3 11l9-8 9 8v10h-7v-6H10v6H3z"/></svg>';
    }
    return '';
  }

  var state = {
    mode: 'cpu', color: 'red',
    s: null, hist: [], over: false, thinking: false,
    selToken: null, selIndex: -1
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
    $('cpuNote').textContent = state.color === 'red'
      ? 'You play red and go first. The computer plays blue. It thinks on this device.'
      : 'You play blue. The computer plays red, and goes first.';
  });

  function makeBoard(el, onTap) {
    el.innerHTML = '';
    var i, sq;
    for (i = 0; i < T.SIZE; i++) {
      sq = document.createElement('div');
      sq.setAttribute('data-i', String(i));
      sq.addEventListener('click', function () {
        onTap(+this.getAttribute('data-i'));
      });
      el.appendChild(sq);
    }
  }

  function legalMap(s, selToken, selIndex) {
    var map = {}, list, i;
    if (!s || s.winner) return map;
    if (selIndex >= 0) {
      list = T.possibleMovements(s.cells, s.turn, selIndex);
      for (i = 0; i < list.length; i++) map[list[i]] = 1;
    } else if (selToken) {
      list = T.possiblePlacements(s.cells, s.hands[s.turn], s.turn, selToken);
      for (i = 0; i < list.length; i++) map[list[i]] = 1;
      list = T.possibleRotations(s.cells, s.turn, selToken);
      for (i = 0; i < list.length; i++) map[list[i]] = 1;
    }
    return map;
  }

  function paint(boardEl, s, opts) {
    opts = opts || {};
    if (!boardEl) return;
    var i, sq, p, cls, legal;
    var selected = opts.selected;
    var selToken = opts.selToken;
    legal = opts.hints ? legalMap(s, selToken, selected) : {};
    for (i = 0; i < T.SIZE; i++) {
      sq = boardEl.children[i];
      if (!sq) continue;
      cls = 'cell';
      if (T.isRedHome(i)) cls += ' home-red';
      else if (T.isBlueHome(i)) cls += ' home-blue';
      else if (T.isRedSpawn(i)) cls += ' spawn-red';
      else if (T.isBlueSpawn(i)) cls += ' spawn-blue';
      if (legal[i]) cls += ' hint';
      if (selected === i) cls += ' sel';
      if (s && s.last) {
        if ((s.last.k === 'place' || s.last.k === 'rotate') && s.last.i === i) cls += ' last';
        if (s.last.k === 'move' && (s.last.s === i || s.last.d === i)) cls += ' last';
      }
      sq.className = cls;
      p = s ? s.cells[i] : null;
      if (!p) { sq.innerHTML = ''; continue; }
      sq.innerHTML = '<div class="piece ' + p.player + '">' + glyph(p.token) + '</div>';
    }
  }

  function paintHand(el, s, player, selToken, enabled) {
    if (!el) return;
    el.innerHTML = '';
    if (!s) return;
    var hand = s.hands[player] || [];
    var k, t, n, btn, show;
    for (k = 0; k < T.HAND_TYPES.length; k++) {
      t = T.HAND_TYPES[k];
      n = T.handCount(hand, t);
      show = n > 0 || (enabled && T.isTank(t) && T.tankCount(hand) >= 0);
      if (!show && n === 0 && !T.isTank(t)) continue;
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tok ' + player + (selToken === t ? ' on' : '') + (!enabled || (n === 0 && !T.isTank(t)) ? ' dim' : '');
      btn.disabled = !enabled;
      btn.setAttribute('data-t', t);
      btn.innerHTML = glyph(t) + '<span class="n">' + n + '</span>';
      btn.title = T.shortName(t);
      el.appendChild(btn);
    }
  }

  function lastLog(s) {
    if (!s || !s.events || !s.events.length) return '';
    var e = s.events[s.events.length - 1];
    var who = e.player === T.RED ? 'Red' : 'Blue';
    var verb = e.kind === 'place' ? 'placed' : e.kind === 'move' ? 'moved'
      : e.kind === 'rotate' ? 'turned' : e.kind === 'shoot' ? 'shot'
      : e.kind === 'capture' ? 'captured' : e.kind === 'explode' ? 'blew up' : e.kind;
    return who + ' ' + verb + ' a ' + T.shortName(e.token).toLowerCase() + '.';
  }

  function isHumanTurn() {
    if (!state.s || state.over || state.thinking) return false;
    if (state.mode === 'hotseat') return true;
    return state.s.turn === state.color;
  }
  function localStatus() {
    if (!state.s) return;
    $('logLine').textContent = lastLog(state.s);
    if (state.s.winner) {
      var you = state.mode === 'cpu' && state.s.winner === state.color;
      var msg = state.mode === 'hotseat'
        ? (state.s.winner === T.RED ? 'Red wins.' : 'Blue wins.')
        : (you ? 'You win.' : 'The computer wins.');
      setStatus($('statusLine'), msg, you ? 'good' : 'warn');
      return;
    }
    if (state.thinking) { setStatus($('statusLine'), 'Computer is thinking…', ''); return; }
    if (state.mode === 'hotseat') {
      setStatus($('statusLine'), (state.s.turn === T.RED ? 'Red' : 'Blue') + ' to play. Place, move, or turn a tank.', '');
    } else {
      setStatus($('statusLine'), state.s.turn === state.color
        ? 'Your turn. Place, move, or turn a tank.' : 'Computer to play.', '');
    }
  }
  function saveLocal() {
    if (!db) return;
    db.put({
      id: 'game', mode: state.mode, color: state.color,
      moves: state.hist.slice(), over: state.over, at: nowMs()
    }).catch(function () {});
  }
  function handPlayer() {
    if (!state.s) return T.RED;
    if (state.mode === 'cpu') return state.color;
    return state.s.turn;
  }
  function afterLocal() {
    paint($('board'), state.s, {
      hints: isHumanTurn(),
      selToken: isHumanTurn() ? state.selToken : null,
      selected: isHumanTurn() ? state.selIndex : -1
    });
    paintHand($('hand'), state.s, handPlayer(), isHumanTurn() ? state.selToken : null, isHumanTurn());
    localStatus();
    saveLocal();
    if (!state.over && !state.thinking && state.mode === 'cpu' && state.s.turn !== state.color) aiMove();
  }
  function applyLocal(act) {
    if (!state.s || state.over) return false;
    var ns = T.play(state.s, act);
    if (!ns) return false;
    state.hist.push({ k: act.k, t: act.t, i: act.i, s: act.s, d: act.d });
    state.s = ns;
    state.selToken = null;
    state.selIndex = -1;
    if (ns.winner) { state.over = true; state.thinking = false; setChip('ready', 'Ready'); }
    return true;
  }
  function playLocal(act) {
    if (!state.s || state.over) return false;
    if (state.mode === 'cpu' && state.thinking && state.s.turn === state.color) return false;
    if (!applyLocal(act)) return false;
    afterLocal();
    return true;
  }
  function tapLocal(i) {
    if (!isHumanTurn()) return;
    var s = state.s, p = s.cells[i];
    if (state.selToken && T.canRotate(s.cells, s.turn, state.selToken, i)) {
      playLocal({ k: 'rotate', t: state.selToken, i: i });
      return;
    }
    if (p && p.player === s.turn && i !== state.selIndex) {
      state.selIndex = i;
      state.selToken = null;
      paint($('board'), s, { hints: true, selected: i, selToken: null });
      paintHand($('hand'), s, handPlayer(), null, true);
      return;
    }
    if (state.selToken && T.canPlace(s.cells, s.hands[s.turn], s.turn, state.selToken, i)) {
      playLocal({ k: 'place', t: state.selToken, i: i });
      return;
    }
    if (state.selIndex >= 0 && T.canMove(s.cells, s.turn, state.selIndex, i)) {
      playLocal({ k: 'move', s: state.selIndex, d: i });
      return;
    }
  }
  function pickToken(t) {
    if (!isHumanTurn()) return;
    state.selToken = state.selToken === t ? null : t;
    state.selIndex = -1;
    paint($('board'), state.s, { hints: true, selToken: state.selToken, selected: -1 });
    paintHand($('hand'), state.s, handPlayer(), state.selToken, true);
  }
  $('hand').addEventListener('click', function (e) {
    var b = e.target.closest('[data-t]'); if (!b) return;
    pickToken(b.getAttribute('data-t'));
  });

  function aiMove() {
    if (!state.s || state.over || state.mode !== 'cpu' || state.thinking) return;
    if (state.s.turn === state.color) return;
    state.thinking = true;
    state.selToken = null; state.selIndex = -1;
    setChip('thinking', 'Thinking…');
    localStatus();
    paint($('board'), state.s, { hints: false });
    paintHand($('hand'), state.s, state.color, null, false);
    setTimeout(function () {
      if (!state.s || state.over || state.mode !== 'cpu') { state.thinking = false; return; }
      if (state.s.turn === state.color) {
        state.thinking = false; setChip('ready', 'Ready'); afterLocal(); return;
      }
      var act = T.aiMove(state.s);
      state.thinking = false;
      setChip('ready', 'Ready');
      if (!act || !applyLocal(act)) { localStatus(); return; }
      afterLocal();
    }, 140);
  }
  function undoLocal() {
    if (!state.hist.length || state.thinking) return;
    state.hist.pop();
    if (state.mode === 'cpu' && state.hist.length) state.hist.pop();
    state.s = T.replay(state.hist);
    state.over = !!state.s.winner;
    state.thinking = false;
    state.selToken = null; state.selIndex = -1;
    setChip('ready', state.mode === 'cpu' ? 'Ready' : 'Two players');
    afterLocal();
  }
  function newLocal() {
    state.s = T.fresh(); state.hist = []; state.over = false;
    state.thinking = false; state.selToken = null; state.selIndex = -1;
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

  function showHelp() { $('help').hidden = false; }
  function hideHelp() { $('help').hidden = true; }
  $('helpBtn').onclick = showHelp;
  $('helpGameBtn').onclick = showHelp;
  $('fHelp').onclick = showHelp;
  $('helpClose').onclick = hideHelp;
  $('help').addEventListener('click', function (e) { if (e.target === $('help')) hideHelp(); });

  // ---- multiplayer ----
  // One collection. Each person writes ONLY their own row (id = me).
  // The board row is written by whoever is host (lowest live id).
  // A player publishes an intended action; the host applies it if it is legal.
  var PRES_TTL = 9000, HB_MS = 3000, END_HOLD = 4000;
  var mpDb = null;
  try { if (window.gifos) mpDb = gifos.db('room'); } catch (e) {}
  var mp = { on: false, id: null, name: 'You', row: null, board: null, people: [], hb: 0, sub: false, selToken: null, selIndex: -1 };
  var _items = [];

  function mySeat(b) {
    if (!b || !b.seats) return null;
    if (b.seats.red === mp.id) return 'red';
    if (b.seats.blue === mp.id) return 'blue';
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
      id: 'board', host: hostId, seats: { red: null, blue: null }, names: {},
      moves: [], turn: 'red', winner: null, result: '', last: null, seq: 0,
      startedAt: nowMs()
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
      mp.selToken = null; mp.selIndex = -1;
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

  function compactAct(act) {
    return { k: act.k, t: act.t, i: act.i, s: act.s, d: act.d };
  }
  function mpReconcile(B, people) {
    var b = JSON.parse(JSON.stringify(B));
    var ch = false;
    var ids = {};
    people.forEach(function (p) {
      ids[p.id] = p;
      if (b.names[p.id] !== p.name) { b.names[p.id] = p.name; ch = true; }
    });
    ['red', 'blue'].forEach(function (s) {
      if (b.seats[s] && !ids[b.seats[s]]) { b.seats[s] = null; ch = true; }
    });
    if ((!b.seats.red || !b.seats.blue) && (b.moves || []).length && !b.winner) {
      b.winner = b.seats.red ? 'red' : (b.seats.blue ? 'blue' : 'draw');
      b.result = 'Opponent left';
      b.endedAt = nowMs();
      ch = true;
    }
    var seated = {};
    seated[b.seats.red] = 1; seated[b.seats.blue] = 1;
    var queue = people.map(function (p) { return p.id; }).filter(function (id) { return !seated[id]; });
    queue.sort();
    if (!b.seats.red && queue.length) { b.seats.red = queue.shift(); ch = true; }
    if (!b.seats.blue && queue.length) { b.seats.blue = queue.shift(); ch = true; }
    if (b.winner && b.endedAt && nowMs() - b.endedAt > END_HOLD) {
      b.moves = []; b.turn = 'red'; b.winner = null; b.result = ''; b.last = null;
      b.seq = (b.seq || 0) + 1; b.endedAt = 0; b.startedAt = nowMs();
      ch = true;
    }
    people.forEach(function (p) {
      var intent = p.intent;
      if (!intent || intent.seq !== b.seq) return;
      var seat = b.seats.red === p.id ? 'red' : (b.seats.blue === p.id ? 'blue' : null);
      if (intent.kind === 'act') {
        if (!seat || b.winner || b.turn !== seat) return;
        var act = intent.act;
        if (!act || !act.k) return;
        var s = T.replay(b.moves || []);
        var ns = T.play(s, act);
        if (!ns) return;
        b.moves = (b.moves || []).concat([compactAct(act)]);
        b.last = ns.last;
        b.seq = (b.seq || 0) + 1;
        if (ns.winner) { b.winner = ns.winner; b.result = 'Base destroyed'; b.endedAt = nowMs(); }
        else b.turn = ns.turn;
        ch = true;
      } else if (intent.kind === 'resign') {
        if (!seat || b.winner) return;
        b.winner = seat === 'red' ? 'blue' : 'red';
        b.result = 'Resigned';
        b.endedAt = nowMs();
        b.seq = (b.seq || 0) + 1;
        ch = true;
      }
    });
    if (b.host !== mp.id) { b.host = mp.id; ch = true; }
    return ch ? b : null;
  }

  function mpPlay(act) {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner || b.turn !== seat) return false;
    var s = T.replay(b.moves || []);
    if (!T.play(s, act)) return false;
    putMe({ intent: { kind: 'act', act: compactAct(act), seq: b.seq } });
    mp.selToken = null; mp.selIndex = -1;
    return true;
  }
  $('fResign').onclick = function () {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner) return;
    putMe({ intent: { kind: 'resign', seq: b.seq } });
  };

  function mpMyTurn(b, s, seat) {
    return !!(seat && b && !b.winner && s && s.turn === seat);
  }
  function mpRender() {
    if (!mp.on) return;
    var b = mp.board, status = $('fStatus');
    if (!b) { $('fSeats').innerHTML = ''; status.textContent = 'Setting up the board…'; return; }
    var s = T.replay(b.moves || []);
    var seat = mySeat(b);
    var nameOf = function (id) { return id ? esc(b.names[id] || 'Player') : '<span class="open">open</span>'; };
    $('fSeats').innerHTML =
      '<div class="seat red' + (seat === 'red' ? ' me' : '') + (b.turn === 'red' && !b.winner ? ' turn' : '') + '">Red ' + nameOf(b.seats.red) + '</div>' +
      '<div class="seat blue' + (seat === 'blue' ? ' me' : '') + (b.turn === 'blue' && !b.winner ? ' turn' : '') + '">Blue ' + nameOf(b.seats.blue) + '</div>';
    var waiting = mp.people.filter(function (p) { return p.id !== b.seats.red && p.id !== b.seats.blue; });
    $('fQueue').textContent = waiting.length ? ('Watching: ' + waiting.map(function (p) { return p.name || 'Player'; }).join(', ')) : '';
    $('fLog').textContent = lastLog(s);
    var both = b.seats.red && b.seats.blue;
    if (!both) {
      status.innerHTML = 'Waiting for another player… press <b>Invite</b> (top bar) to bring a friend.';
    } else if (b.winner) {
      var wname = b.winner === 'draw' ? '' : nameOf(b.winner === 'red' ? b.seats.red : b.seats.blue);
      status.innerHTML = b.winner === 'draw'
        ? (esc(b.result || 'Draw') + ' — next game starting…')
        : ((esc(b.result || 'Base destroyed') + ' — ') + wname + ' wins. Next game starting…');
    } else if (!seat) {
      status.textContent = 'Spectating.';
    } else if (b.turn === seat) {
      status.textContent = 'Your turn. Place, move, or turn a tank.';
    } else {
      status.textContent = 'Waiting for ' + b.turn + '…';
    }
    var mine = mpMyTurn(b, s, seat);
    paint($('fBoard'), s, {
      hints: mine,
      selToken: mine ? mp.selToken : null,
      selected: mine ? mp.selIndex : -1
    });
    paintHand($('fHand'), s, seat || s.turn, mine ? mp.selToken : null, mine);
    $('fResign').hidden = !(seat && (b.moves || []).length && !b.winner);
  }

  makeBoard($('fBoard'), function (i) {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner || b.turn !== seat) return;
    var s = T.replay(b.moves || []);
    var p = s.cells[i];
    if (mp.selToken && T.canRotate(s.cells, s.turn, mp.selToken, i)) {
      mpPlay({ k: 'rotate', t: mp.selToken, i: i });
      return;
    }
    if (p && p.player === s.turn && i !== mp.selIndex) {
      mp.selIndex = i;
      mp.selToken = null;
      mpRender();
      return;
    }
    if (mp.selToken && T.canPlace(s.cells, s.hands[s.turn], s.turn, mp.selToken, i)) {
      mpPlay({ k: 'place', t: mp.selToken, i: i });
      return;
    }
    if (mp.selIndex >= 0 && T.canMove(s.cells, s.turn, mp.selIndex, i)) {
      mpPlay({ k: 'move', s: mp.selIndex, d: i });
    }
  });
  $('fHand').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-t]'); if (!btn) return;
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner || b.turn !== seat) return;
    var t = btn.getAttribute('data-t');
    mp.selToken = mp.selToken === t ? null : t;
    mp.selIndex = -1;
    mpRender();
  });

  if (window.gifos && gifos.onBack) gifos.onBack(function () {
    if (!$('help').hidden) { hideHelp(); return; }
    if (!$('friend').hidden) mpLeave();
    else if (!$('game').hidden) { $('game').hidden = true; $('setup').hidden = false; setChip('ready', 'Ready'); }
  });

  setChip('ready', 'Ready');
  if (db) {
    db.get('game').then(function (g) {
      if (!g || !g.moves || !g.moves.length || g.over) return;
      state.mode = g.mode || 'cpu';
      state.color = g.color || 'red';
      state.hist = g.moves.slice();
      state.s = T.replay(state.hist);
      state.over = !!state.s.winner;
      if (state.mode === 'hotseat') {
        $('modeSeg').querySelector('[data-mode="hotseat"]').click();
        setChip('ready', 'Two players');
      } else {
        $('modeSeg').querySelector('[data-mode="cpu"]').click();
        Array.prototype.forEach.call($('colorSeg').children, function (c) {
          c.classList.toggle('on', c.getAttribute('data-color') === state.color);
        });
        $('cpuNote').textContent = state.color === 'red'
          ? 'You play red and go first. The computer plays blue. It thinks on this device.'
          : 'You play blue. The computer plays red, and goes first.';
      }
      $('setup').hidden = true; $('friend').hidden = true; $('game').hidden = false;
      afterLocal();
    }).catch(function () {});
  }
})();
