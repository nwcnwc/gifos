// Jungle — animal chess. Computer is minimax on this device.
// A friend sits the other colour on a shared board. Invite is OS chrome.
(function () {
  'use strict';
  var J = window.JG;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch];
    });
  };

  var state = {
    mode: 'cpu', color: 'blue',
    s: null, hist: [], over: false, thinking: false, sel: null
  };
  var db = null;
  try { if (window.gifos) db = gifos.db('save'); } catch (e) {}

  function setChip(cls, text) {
    $('aiChip').className = 'engine-chip' + (cls ? ' ' + cls : '');
    $('aiState').textContent = text;
  }
  function setTurn(el, text, cls) {
    el.className = 'turnpill' + (cls ? ' ' + cls : '');
    el.innerHTML = text;
  }
  function fillRankRow() {
    var el = $('rankRow');
    if (!el) return;
    el.innerHTML = '';
    var k, b;
    for (k = 8; k >= 1; k--) {
      b = document.createElement('span');
      b.className = 'rankchip';
      b.title = J.NAME[k] + ' · rank ' + k;
      b.innerHTML = J.GLYPH[k] + '<i>' + k + '</i>';
      el.appendChild(b);
    }
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
    $('cpuNote').textContent = state.color === 'blue'
      ? 'You play blue and go first. The computer plays red. It thinks on this device.'
      : 'You play red. The computer plays blue, and goes first.';
  });

  function makeBoard(el, onTap) {
    el.innerHTML = '';
    var r, c, sq, kind;
    for (r = 0; r < J.ROWS; r++) for (c = 0; c < J.COLS; c++) {
      sq = document.createElement('div');
      kind = J.squareKind(r, c);
      sq.className = 'square ' + kind + (((r + c) & 1) ? ' alt' : '');
      sq.setAttribute('data-r', String(r));
      sq.setAttribute('data-c', String(c));
      if (kind.indexOf('den') === 0) sq.title = 'Den';
      else if (kind.indexOf('trap') === 0) sq.title = 'Trap';
      else if (kind === 'water') sq.title = 'River';
      sq.addEventListener('click', function () {
        onTap(+this.getAttribute('data-r'), +this.getAttribute('data-c'));
      });
      el.appendChild(sq);
    }
  }

  function pieceEl(val, mine) {
    var d = document.createElement('div');
    var rk = J.rankOf(val);
    d.className = 'piece ' + (J.sideOf(val) === J.BLUE ? 'blue' : 'red') + (mine ? ' mine' : '');
    d.innerHTML = J.GLYPH[rk] + '<span class="rk">' + rk + '</span>';
    d.title = J.NAME[rk] + ' ' + rk;
    return d;
  }

  function paint(boardEl, s, opts) {
    opts = opts || {};
    if (!boardEl) return;
    boardEl.classList.toggle('flip', !!opts.flip);
    boardEl.classList.toggle('busy', !!opts.busy);
    var r, c, sq, val, key, legal = {}, cap = {}, from = {}, i, ms, m;
    var selected = opts.selected;
    var mineSide = 0;
    if (opts.hints && s && !s.winner) {
      ms = J.legalMoves(s);
      mineSide = s.turn;
      for (i = 0; i < ms.length; i++) from[ms[i].fr + ',' + ms[i].fc] = 1;
      if (selected) {
        for (i = 0; i < ms.length; i++) {
          m = ms[i];
          if (m.fr === selected.r && m.fc === selected.c) {
            legal[m.tr + ',' + m.tc] = 1;
            if (m.capture) cap[m.tr + ',' + m.tc] = 1;
          }
        }
      }
    }
    for (r = 0; r < J.ROWS; r++) for (c = 0; c < J.COLS; c++) {
      sq = boardEl.children[r * J.COLS + c];
      if (!sq) continue;
      key = r + ',' + c;
      sq.className = 'square ' + J.squareKind(r, c) + (((r + c) & 1) ? ' alt' : '');
      if (s && s.last && ((s.last.fr === r && s.last.fc === c) || (s.last.tr === r && s.last.tc === c))) {
        sq.classList.add('last');
      }
      if (legal[key]) {
        sq.classList.add('hint');
        if (cap[key]) sq.classList.add('cap');
      }
      while (sq.lastChild && sq.lastChild.classList && sq.lastChild.classList.contains('piece')) {
        sq.removeChild(sq.lastChild);
      }
      val = s ? s.map[r][c] : 0;
      if (!val) continue;
      var piece = pieceEl(val, !!(mineSide && J.sideOf(val) === mineSide && from[key]));
      if (selected && selected.r === r && selected.c === c) piece.classList.add('selected');
      sq.appendChild(piece);
    }
  }

  function takenHtml(s) {
    if (!s) return '';
    function missing(side) {
      var have = {}, r, c, p, out = [], k;
      for (r = 0; r < J.ROWS; r++) for (c = 0; c < J.COLS; c++) {
        p = s.map[r][c];
        if (p && J.sideOf(p) === side) have[J.rankOf(p)] = 1;
      }
      for (k = 8; k >= 1; k--) if (!have[k]) {
        out.push('<span class="lost" title="' + J.NAME[k] + '">' + J.GLYPH[k] + '</span>');
      }
      return out;
    }
    var b = missing(J.BLUE), rd = missing(J.RED);
    if (!b.length && !rd.length) return '';
    return '<span class="side blue">Blue</span> ' + (b.length ? b.join('') : '—') +
      '<span class="dot">·</span>' +
      '<span class="side red">Red</span> ' + (rd.length ? rd.join('') : '—');
  }
  function showTaken(el, s) {
    var html = takenHtml(s);
    if (!html) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = html;
  }

  function shouldFlip() {
    if (state.mode === 'cpu') return state.color === 'blue';
    return false;
  }
  function isHumanTurn() {
    if (!state.s || state.over || state.thinking) return false;
    if (state.mode === 'hotseat') return true;
    return J.colorName(state.s.turn) === state.color;
  }
  function localStatus() {
    if (!state.s) return;
    showTaken($('takenLine'), state.s);
    if (state.s.winner) {
      var you = state.mode === 'cpu' && state.s.winner === J.colorNum(state.color);
      var wname = J.colorName(state.s.winner);
      var msg = state.mode === 'hotseat'
        ? (wname.charAt(0).toUpperCase() + wname.slice(1) + ' wins')
        : (you ? 'You win' : 'The computer wins');
      setTurn($('turnPill'), msg, (you ? 'good ' : 'warn ') + wname);
      return;
    }
    if (state.thinking) {
      setTurn($('turnPill'), 'Computer is thinking…', 'think');
      return;
    }
    var t = J.colorName(state.s.turn);
    if (state.mode === 'hotseat') {
      setTurn($('turnPill'), t.charAt(0).toUpperCase() + t.slice(1) + ' to play · tap a piece', t);
    } else if (t === state.color) {
      setTurn($('turnPill'), 'Your turn · tap a piece', t);
    } else {
      setTurn($('turnPill'), 'Computer to play', t);
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
  function afterLocal() {
    paint($('board'), state.s, { hints: isHumanTurn(), selected: state.sel, flip: shouldFlip() });
    localStatus();
    saveLocal();
    if (!state.over && !state.thinking && state.mode === 'cpu' && J.colorName(state.s.turn) !== state.color) aiMove();
  }
  function applyLocal(fr, fc, tr, tc) {
    if (!state.s || state.over) return false;
    var ns = J.play(state.s, fr, fc, tr, tc);
    if (!ns) return false;
    state.hist.push({ fr: fr, fc: fc, tr: tr, tc: tc, color: state.s.turn });
    state.s = ns;
    state.sel = null;
    if (ns.winner) { state.over = true; state.thinking = false; setChip('ready', 'Ready'); }
    return true;
  }
  function playLocal(fr, fc, tr, tc) {
    if (!state.s || state.over) return false;
    if (state.mode === 'cpu' && state.thinking && J.colorName(state.s.turn) === state.color) return false;
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
    if (J.sideOf(s.map[r][c]) === s.turn) {
      var has = J.legalMoves(s).some(function (m) { return m.fr === r && m.fc === c; });
      if (has) {
        state.sel = (state.sel && state.sel.r === r && state.sel.c === c) ? null : { r: r, c: c };
        paint($('board'), s, { hints: true, selected: state.sel, flip: shouldFlip() });
      }
    }
  }
  function aiMove() {
    if (!state.s || state.over || state.mode !== 'cpu' || state.thinking) return;
    if (J.colorName(state.s.turn) === state.color) return;
    state.thinking = true;
    state.sel = null;
    setChip('thinking', 'Thinking…');
    localStatus();
    paint($('board'), state.s, { hints: false, flip: shouldFlip(), busy: true });
    // Paint the thinking chip, search in slices, hold the pill long enough
    // that the last-move flash is not invisible.
    var t0 = nowMs();
    requestAnimationFrame(function () {
      setTimeout(function () {
        if (!state.s || state.over || state.mode !== 'cpu') { state.thinking = false; return; }
        if (J.colorName(state.s.turn) === state.color) {
          state.thinking = false; setChip('ready', 'Ready'); afterLocal(); return;
        }
        var finish = function (move) {
          var wait = Math.max(0, 280 - (nowMs() - t0));
          setTimeout(function () {
            if (!state.s || state.over || state.mode !== 'cpu') { state.thinking = false; return; }
            if (!move || !applyLocal(move.fr, move.fc, move.tr, move.tc)) {
              state.thinking = false; setChip('ready', 'Ready'); localStatus();
              paint($('board'), state.s, { hints: isHumanTurn(), selected: state.sel, flip: shouldFlip() });
              return;
            }
            state.thinking = false;
            setChip('ready', 'Ready');
            afterLocal();
          }, wait);
        };
        if (J.aiMoveAsync) J.aiMoveAsync(state.s, finish);
        else finish(J.aiMove(state.s));
      }, 40);
    });
  }
  function undoLocal() {
    if (!state.hist.length || state.thinking) return;
    state.hist.pop();
    if (state.mode === 'cpu' && state.hist.length) state.hist.pop();
    state.s = J.replay(state.hist);
    state.over = !!state.s.winner;
    state.thinking = false;
    state.sel = null;
    setChip('ready', state.mode === 'cpu' ? 'Ready' : 'Two players');
    afterLocal();
  }
  function newLocal() {
    state.s = J.fresh(); state.hist = []; state.over = false;
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
    if (b.seats.blue === mp.id) return 'blue';
    if (b.seats.red === mp.id) return 'red';
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
      id: 'board', host: hostId, seats: { blue: null, red: null }, names: {},
      moves: [], turn: 'blue', winner: null, result: '', last: null, seq: 0,
      reds: 8, blues: 8, startedAt: nowMs()
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
    if (!mpDb) { setTurn($('turnPill'), 'Play a friend needs storage.', 'warn'); return; }
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
    ['blue', 'red'].forEach(function (s) {
      if (b.seats[s] && !ids[b.seats[s]]) { b.seats[s] = null; ch = true; }
    });
    if ((!b.seats.blue || !b.seats.red) && (b.moves || []).length && !b.winner) {
      b.winner = b.seats.blue ? 'blue' : (b.seats.red ? 'red' : 'draw');
      b.result = 'Opponent left';
      b.endedAt = nowMs();
      ch = true;
    }
    var seated = {};
    seated[b.seats.blue] = 1; seated[b.seats.red] = 1;
    var queue = people.map(function (p) { return p.id; }).filter(function (id) { return !seated[id]; });
    queue.sort();
    if (!b.seats.blue && queue.length) { b.seats.blue = queue.shift(); ch = true; }
    if (!b.seats.red && queue.length) { b.seats.red = queue.shift(); ch = true; }
    if (b.winner && b.endedAt && nowMs() - b.endedAt > END_HOLD) {
      b.moves = []; b.turn = 'blue'; b.winner = null; b.result = ''; b.last = null;
      b.seq = (b.seq || 0) + 1; b.endedAt = 0; b.startedAt = nowMs();
      b.reds = 8; b.blues = 8;
      ch = true;
    }
    people.forEach(function (p) {
      var intent = p.intent;
      if (!intent || intent.seq !== b.seq) return;
      var seat = b.seats.blue === p.id ? 'blue' : (b.seats.red === p.id ? 'red' : null);
      if (intent.kind === 'move') {
        if (!seat || b.winner || b.turn !== seat) return;
        if (typeof intent.fr !== 'number' || typeof intent.fc !== 'number') return;
        if (typeof intent.tr !== 'number' || typeof intent.tc !== 'number') return;
        var s = J.replay(b.moves || []);
        var ns = J.play(s, intent.fr, intent.fc, intent.tr, intent.tc);
        if (!ns) return;
        b.moves = (b.moves || []).concat([{ fr: intent.fr, fc: intent.fc, tr: intent.tr, tc: intent.tc }]);
        b.last = { fr: intent.fr, fc: intent.fc, tr: intent.tr, tc: intent.tc };
        b.seq = (b.seq || 0) + 1;
        b.reds = ns.reds; b.blues = ns.blues;
        if (ns.winner) { b.winner = J.colorName(ns.winner); b.result = 'Den or last animal'; b.endedAt = nowMs(); }
        else b.turn = J.colorName(ns.turn);
        ch = true;
      } else if (intent.kind === 'resign') {
        if (!seat || b.winner) return;
        b.winner = seat === 'blue' ? 'red' : 'blue';
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
    var s = J.replay(b.moves || []);
    if (!J.play(s, fr, fc, tr, tc)) return false;
    putMe({ intent: { kind: 'move', fr: fr, fc: fc, tr: tr, tc: tc, seq: b.seq } });
    return true;
  }
  $('fResign').onclick = function () {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner) return;
    putMe({ intent: { kind: 'resign', seq: b.seq } });
  };

  function mpRender() {
    if (!mp.on) return;
    var b = mp.board, status = $('fStatus');
    if (!b) { $('fSeats').innerHTML = ''; setTurn(status, 'Setting up the board…', ''); return; }
    var s = J.replay(b.moves || []);
    var seat = mySeat(b);
    var nameOf = function (id) { return id ? esc(b.names[id] || 'Player') : '<span class="open">open</span>'; };
    $('fSeats').innerHTML =
      '<div class="seat' + (seat === 'blue' ? ' me' : '') + (b.turn === 'blue' && !b.winner ? ' turn' : '') + '">Blue ' + nameOf(b.seats.blue) + '</div>' +
      '<div class="seat red' + (seat === 'red' ? ' me' : '') + (b.turn === 'red' && !b.winner ? ' turn' : '') + '">Red ' + nameOf(b.seats.red) + '</div>';
    var waiting = mp.people.filter(function (p) { return p.id !== b.seats.blue && p.id !== b.seats.red; });
    $('fQueue').textContent = waiting.length ? ('Watching: ' + waiting.map(function (p) { return p.name || 'Player'; }).join(', ')) : '';
    showTaken($('fTaken'), s);
    var both = b.seats.blue && b.seats.red;
    if (!both) {
      setTurn(status, 'Waiting for another player… press <b>Invite</b> (top bar) to bring a friend.', '');
    } else if (b.winner) {
      var wname = b.winner === 'draw' ? '' : nameOf(b.winner === 'blue' ? b.seats.blue : b.seats.red);
      setTurn(status, b.winner === 'draw'
        ? (esc(b.result || 'Draw') + ' — next game starting…')
        : ((esc(b.result || 'Den or last animal') + ' — ') + wname + ' wins. Next game starting…'),
        b.winner === 'draw' ? '' : b.winner);
    } else if (!seat) {
      setTurn(status, 'Spectating', b.turn);
    } else if (b.turn === seat) {
      setTurn(status, 'Your turn · tap a piece', b.turn);
    } else {
      setTurn(status, 'Waiting for ' + b.turn + '…', b.turn);
    }
    var hints = !!(seat && b.turn === seat && !b.winner);
    paint($('fBoard'), s, { hints: hints, selected: mp.sel, flip: seat === 'blue' });
    $('fResign').hidden = !(seat && (b.moves || []).length && !b.winner);
  }

  makeBoard($('fBoard'), function (r, c) {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner || b.turn !== seat) return;
    var s = J.replay(b.moves || []);
    if (mp.sel && (mp.sel.r !== r || mp.sel.c !== c)) {
      if (mpPlay(mp.sel.r, mp.sel.c, r, c)) { mp.sel = null; return; }
    }
    if (J.sideOf(s.map[r][c]) === s.turn) {
      var has = J.legalMoves(s).some(function (m) { return m.fr === r && m.fc === c; });
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
  fillRankRow();
  if (db) {
    db.get('game').then(function (g) {
      if (!g || !g.moves || !g.moves.length || g.over) return;
      state.mode = g.mode || 'cpu';
      state.color = g.color || 'blue';
      state.hist = g.moves.slice();
      state.s = J.replay(state.hist);
      state.over = !!state.s.winner;
      if (state.mode === 'hotseat') {
        $('modeSeg').querySelector('[data-mode="hotseat"]').click();
        setChip('ready', 'Two players');
      } else {
        $('modeSeg').querySelector('[data-mode="cpu"]').click();
        Array.prototype.forEach.call($('colorSeg').children, function (c) {
          c.classList.toggle('on', c.getAttribute('data-color') === state.color);
        });
        $('cpuNote').textContent = state.color === 'blue'
          ? 'You play blue and go first. The computer plays red. It thinks on this device.'
          : 'You play red. The computer plays blue, and goes first.';
      }
      $('setup').hidden = true; $('friend').hidden = true; $('game').hidden = false;
      afterLocal();
    }).catch(function () {});
  }
})();
