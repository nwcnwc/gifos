// Connect Four — drop a disc, connect four. Computer is kenrick95's c4 AI.
// A friend sits the other colour on a shared board. Invite is OS chrome.
(function () {
  'use strict';
  var C = window.C4;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch];
    });
  };

  var state = {
    mode: 'cpu', s: null, hist: [], over: false, thinking: false,
    hover: -1, dropping: false
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
    $('cpuNote').hidden = !cpu;
    $('hotseatNote').hidden = cpu;
  });

  // ---- canvas ----
  function layout(cssW, cssH) {
    var pad = Math.min(cssW, cssH) * 0.05;
    var innerW = cssW - 2 * pad, innerH = cssH - 2 * pad;
    var Rw = innerW / (3 * C.COLUMNS + 1);
    var Rh = innerH / (3 * C.ROWS + 1);
    var R = Math.min(Rw, Rh);
    var boardW = (3 * C.COLUMNS + 1) * R;
    var boardH = (3 * C.ROWS + 1) * R;
    return {
      radius: R,
      x0: (cssW - boardW) / 2,
      y0: (cssH - boardH) / 2,
      x1: (cssW - boardW) / 2 + boardW,
      y1: (cssH - boardH) / 2 + boardH
    };
  }
  function cellCenter(g, r, c) {
    return {
      x: 3 * g.radius * c + g.x0 + 2 * g.radius,
      y: 3 * g.radius * r + g.y0 + 2 * g.radius
    };
  }
  function resizeCanvas(canvas) {
    var cssW = canvas.clientWidth || 448;
    var cssH = canvas.clientHeight || Math.round(cssW * 6 / 7);
    var dpr = window.devicePixelRatio || 1;
    var w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return { cssW: cssW, cssH: cssH };
  }
  function disc(ctx, x, y, r, color) {
    var g = ctx.createRadialGradient(x - r * 0.32, y - r * 0.38, r * 0.08, x, y, r);
    if (color === C.P1) { g.addColorStop(0, '#ff8a7a'); g.addColorStop(1, C.COLOR1); }
    else { g.addColorStop(0, '#6ea4ff'); g.addColorStop(1, C.COLOR2); }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = Math.max(1, r * 0.08); ctx.stroke();
  }
  function paint(canvas, s, opts) {
    opts = opts || {};
    var sz = resizeCanvas(canvas);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    var W = sz.cssW, H = sz.cssH;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0c1018';
    ctx.fillRect(0, 0, W, H);
    var g = layout(W, H);
    var skip = opts.drop ? (opts.drop.r + ',' + opts.drop.c) : '';
    var r, c, p, col;
    if (s) {
      for (r = 0; r < C.ROWS; r++) for (c = 0; c < C.COLUMNS; c++) {
        col = s.map[r][c];
        if (!col) continue;
        if (skip === r + ',' + c) continue;
        p = cellCenter(g, r, c);
        disc(ctx, p.x, p.y, g.radius * 0.92, col);
      }
      if (opts.drop) {
        p = cellCenter(g, opts.drop.r, opts.drop.c);
        var topY = cellCenter(g, 0, opts.drop.c).y - g.radius * 2;
        disc(ctx, p.x, topY + (p.y - topY) * opts.drop.t, g.radius * 0.92, opts.drop.color);
      }
    }
    if (opts.hover >= 0 && s && !s.winner && C.canDrop(s, opts.hover)) {
      var hoverColor = opts.hoverColor || s.turn;
      p = cellCenter(g, 0, opts.hover);
      ctx.globalAlpha = 0.38;
      disc(ctx, p.x, p.y - g.radius * 0.15, g.radius * 0.92, hoverColor);
      ctx.globalAlpha = 1;
      ctx.fillStyle = hoverColor === C.P1 ? 'rgba(239,69,59,.18)' : 'rgba(0,89,255,.18)';
      ctx.fillRect(g.x0 + opts.hover * (g.x1 - g.x0) / C.COLUMNS, g.y0,
        (g.x1 - g.x0) / C.COLUMNS, g.y1 - g.y0);
    }
    // mask with holes — discs show through
    ctx.save();
    ctx.fillStyle = C.MASK;
    ctx.beginPath();
    var rr = 10;
    if (ctx.roundRect) ctx.roundRect(g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0, rr);
    else ctx.rect(g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0);
    for (r = 0; r < C.ROWS; r++) for (c = 0; c < C.COLUMNS; c++) {
      p = cellCenter(g, r, c);
      ctx.moveTo(p.x + g.radius, p.y);
      ctx.arc(p.x, p.y, g.radius, 0, Math.PI * 2, true);
    }
    ctx.fill('evenodd');
    ctx.restore();
    if (s && s.winLine) {
      ctx.strokeStyle = 'rgba(255, 220, 80, .95)';
      ctx.lineWidth = Math.max(3, g.radius * 0.18);
      s.winLine.forEach(function (pt) {
        p = cellCenter(g, pt.r, pt.c);
        ctx.beginPath(); ctx.arc(p.x, p.y, g.radius * 1.08, 0, Math.PI * 2); ctx.stroke();
      });
    }
  }
  function hitColumn(canvas, ev) {
    var rect = canvas.getBoundingClientRect();
    var t = ev.changedTouches && ev.changedTouches[0] ? ev.changedTouches[0]
          : (ev.touches && ev.touches[0] ? ev.touches[0] : ev);
    var x = t.clientX - rect.left, y = t.clientY - rect.top;
    var g = layout(rect.width, rect.height);
    if (x < g.x0 || x > g.x1 || y < g.y0 - 8 || y > g.y1) return -1;
    var col = Math.floor((x - g.x0) / ((g.x1 - g.x0) / C.COLUMNS));
    if (col < 0 || col >= C.COLUMNS) return -1;
    return col;
  }

  function animateDrop(canvas, s, col, done) {
    if (!s || !s.last || s.last.c !== col) { done(); return; }
    var row = s.last.r, color = s.map[row][col];
    var t0 = nowMs();
    var duration = 70 + row * 55;
    state.dropping = true;
    function frame() {
      var t = Math.min(1, (nowMs() - t0) / duration);
      var ease = t * t;
      paint(canvas, s, { drop: { r: row, c: col, t: ease, color: color }, hover: -1 });
      if (t < 1) requestAnimationFrame(frame);
      else { state.dropping = false; paint(canvas, s, { hover: -1 }); done(); }
    }
    requestAnimationFrame(frame);
  }

  // ---- local game ----
  function isHumanTurn() {
    if (!state.s || state.over || state.thinking || state.dropping) return false;
    if (state.mode === 'hotseat') return true;
    return state.s.turn === C.P1;
  }
  function localStatus() {
    if (!state.s) return;
    if (state.s.winner === C.DRAW) { setStatus($('statusLine'), 'Draw — the board is full.', ''); return; }
    if (state.s.winner) {
      var you = state.mode === 'cpu' && state.s.winner === C.P1;
      var msg = state.mode === 'hotseat'
        ? (C.colorName(state.s.winner).charAt(0).toUpperCase() + C.colorName(state.s.winner).slice(1) + ' wins.')
        : (you ? 'You win.' : 'The computer wins.');
      setStatus($('statusLine'), msg, you ? 'good' : 'warn');
      return;
    }
    if (state.thinking) { setStatus($('statusLine'), 'Computer is thinking…', ''); return; }
    if (state.mode === 'hotseat') {
      var t = C.colorName(state.s.turn);
      setStatus($('statusLine'), t.charAt(0).toUpperCase() + t.slice(1) + ' to play. Tap a column.', '');
    } else {
      setStatus($('statusLine'), state.s.turn === C.P1 ? 'Your turn. Tap a column.' : 'Computer to play.', '');
    }
  }
  function saveLocal() {
    if (!db) return;
    db.put({
      id: 'game', mode: state.mode, moves: state.hist.slice(),
      over: state.over, at: nowMs()
    }).catch(function () {});
  }
  function afterLocal() {
    paint($('board'), state.s, { hover: isHumanTurn() ? state.hover : -1 });
    localStatus();
    saveLocal();
    if (!state.over && state.mode === 'cpu' && state.s.turn === C.P2) aiMove();
  }
  function playLocal(col) {
    if (!state.s || state.over || state.dropping) return false;
    if (state.mode === 'cpu' && state.thinking && state.s.turn === C.P1) return false;
    if (!C.canDrop(state.s, col)) return false;
    var ns = C.drop(state.s, col);
    if (!ns) return false;
    state.hist.push(col);
    state.s = ns;
    state.hover = -1;
    if (ns.winner) { state.over = true; state.thinking = false; setChip('ready', 'Ready'); }
    animateDrop($('board'), state.s, col, afterLocal);
    return true;
  }
  function aiMove() {
    if (!state.s || state.over || state.mode !== 'cpu') return;
    state.thinking = true;
    setChip('thinking', 'Thinking…');
    localStatus();
    setTimeout(function () {
      if (!state.s || state.over || state.mode !== 'cpu') { state.thinking = false; return; }
      var col = C.aiColumn(state.s.map, C.P2);
      state.thinking = false;
      setChip('ready', 'Ready');
      playLocal(col);
    }, 50);
  }
  function undoLocal() {
    if (!state.hist.length || state.dropping) return;
    if (state.over) state.hist.pop();
    else if (state.mode === 'cpu') {
      state.hist.pop();
      if (state.hist.length) state.hist.pop();
    } else state.hist.pop();
    state.s = C.replay(state.hist);
    state.over = !!state.s.winner;
    state.thinking = false;
    setChip('ready', state.mode === 'cpu' ? 'Ready' : 'Two players');
    paint($('board'), state.s);
    localStatus();
    saveLocal();
    if (!state.over && state.mode === 'cpu' && state.s.turn === C.P2) aiMove();
  }
  function newLocal() {
    state.s = C.fresh(); state.hist = []; state.over = false; state.hover = -1;
    state.thinking = false; state.dropping = false;
    setChip('ready', state.mode === 'cpu' ? 'Ready' : 'Two players');
    $('setup').hidden = true; $('friend').hidden = true; $('game').hidden = false;
    paint($('board'), state.s);
    localStatus();
    saveLocal();
  }

  $('startBtn').onclick = function () { newLocal(); };
  $('newBtn').onclick = function () {
    $('game').hidden = true; $('setup').hidden = false; setChip('ready', 'Ready');
  };
  $('undoBtn').onclick = undoLocal;

  function bindBoard(canvas, canPlay, onPlay, hoverOf) {
    canvas.addEventListener('click', function (e) {
      var col = hitColumn(canvas, e); if (col < 0) return;
      if (canPlay()) onPlay(col);
    });
    canvas.addEventListener('pointermove', function (e) {
      var col = hitColumn(canvas, e);
      if (hoverOf) hoverOf(col);
      else {
        state.hover = col;
        if (canPlay() && state.s) paint(canvas, state.s, { hover: col, hoverColor: state.s.turn });
      }
    });
    canvas.addEventListener('pointerleave', function () {
      if (hoverOf) hoverOf(-1);
      else { state.hover = -1; if (state.s) paint(canvas, state.s, { hover: -1 }); }
    });
  }
  bindBoard($('board'), isHumanTurn, function (col) { return playLocal(col); });

  window.addEventListener('keydown', function (e) {
    if ($('game').hidden) return;
    var n = e.key ? e.key.charCodeAt(0) - 49 : -1;
    if (n >= 0 && n < C.COLUMNS && isHumanTurn()) playLocal(n);
  });

  // ---- multiplayer ----
  // One collection. Each person writes ONLY their own row (id = me).
  // The board row is written by whoever is host (lowest live id).
  // A player publishes an intended drop; the host applies it if it is legal.
  var PRES_TTL = 9000, HB_MS = 3000, END_HOLD = 4000;
  var mpDb = null;
  try { if (window.gifos) mpDb = gifos.db('room'); } catch (e) {}
  var mp = { on: false, id: null, name: 'You', row: null, board: null, people: [], hb: 0, sub: false, hover: -1 };
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
      if (intent.kind === 'drop') {
        if (!seat || b.winner || b.turn !== seat) return;
        if (typeof intent.col !== 'number') return;
        var s = C.replay(b.moves || []);
        var ns = C.drop(s, intent.col);
        if (!ns) return;
        b.moves = (b.moves || []).concat([intent.col]);
        b.last = ns.last ? { r: ns.last.r, c: ns.last.c } : { c: intent.col };
        b.seq = (b.seq || 0) + 1;
        if (ns.winner === C.DRAW) { b.winner = 'draw'; b.result = 'Draw'; b.endedAt = nowMs(); }
        else if (ns.winner) { b.winner = C.colorName(ns.winner); b.result = 'Four in a row'; b.endedAt = nowMs(); }
        else b.turn = C.colorName(ns.turn);
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

  function mpPlay(col) {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner || b.turn !== seat) return false;
    var s = C.replay(b.moves || []);
    if (!C.drop(s, col)) return false;
    putMe({ intent: { kind: 'drop', col: col, seq: b.seq } });
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
    if (!b) { $('fSeats').innerHTML = ''; status.textContent = 'Setting up the board…'; return; }
    var s = C.replay(b.moves || []);
    var seat = mySeat(b);
    var nameOf = function (id) { return id ? esc(b.names[id] || 'Player') : '<span class="open">open</span>'; };
    $('fSeats').innerHTML =
      '<div class="seat' + (seat === 'red' ? ' me' : '') + (b.turn === 'red' && !b.winner ? ' turn' : '') + '">🔴 ' + nameOf(b.seats.red) + '</div>' +
      '<div class="seat blue' + (seat === 'blue' ? ' me' : '') + (b.turn === 'blue' && !b.winner ? ' turn' : '') + '">🔵 ' + nameOf(b.seats.blue) + '</div>';
    var waiting = mp.people.filter(function (p) { return p.id !== b.seats.red && p.id !== b.seats.blue; });
    $('fQueue').textContent = waiting.length ? ('Watching: ' + waiting.map(function (p) { return p.name || 'Player'; }).join(', ')) : '';
    var both = b.seats.red && b.seats.blue;
    if (!both) {
      status.innerHTML = 'Waiting for another player… press <b>Invite</b> (top bar) to bring a friend.';
    } else if (b.winner) {
      var wname = b.winner === 'draw' ? '' : nameOf(b.winner === 'red' ? b.seats.red : b.seats.blue);
      status.innerHTML = b.winner === 'draw'
        ? (esc(b.result || 'Draw') + ' — next game starting…')
        : ((esc(b.result || 'Four in a row') + ' — ') + wname + ' wins. Next game starting…');
    } else if (!seat) {
      status.textContent = 'Spectating.';
    } else if (b.turn === seat) {
      status.textContent = 'Your turn. Tap a column.';
    } else {
      status.textContent = 'Waiting for ' + b.turn + '…';
    }
    paint($('fBoard'), s, {
      hover: (seat && b.turn === seat && !b.winner) ? mp.hover : -1,
      hoverColor: seat ? C.colorNum(seat) : 0
    });
    $('fResign').hidden = !(seat && (b.moves || []).length && !b.winner);
  }

  (function bindFriendBoard() {
    var canvas = $('fBoard');
    canvas.addEventListener('click', function (e) {
      var col = hitColumn(canvas, e); if (col < 0) return;
      mpPlay(col);
    });
    canvas.addEventListener('pointermove', function (e) {
      mp.hover = hitColumn(canvas, e);
      var b = mp.board; if (!b) return;
      var seat = mySeat(b);
      paint(canvas, C.replay(b.moves || []), {
        hover: (seat && b.turn === seat && !b.winner) ? mp.hover : -1,
        hoverColor: seat ? C.colorNum(seat) : 0
      });
    });
    canvas.addEventListener('pointerleave', function () {
      mp.hover = -1;
      if (mp.board) paint(canvas, C.replay(mp.board.moves || []), { hover: -1 });
    });
  })();

  window.addEventListener('resize', function () {
    if (!$('game').hidden && state.s) paint($('board'), state.s, { hover: state.hover });
    if (!$('friend').hidden && mp.board) paint($('fBoard'), C.replay(mp.board.moves || []), { hover: mp.hover });
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
      state.hist = g.moves.slice();
      state.s = C.replay(state.hist);
      state.over = !!state.s.winner;
      if (state.mode === 'hotseat') {
        $('modeSeg').querySelector('[data-mode="hotseat"]').click();
        setChip('ready', 'Two players');
      } else {
        $('modeSeg').querySelector('[data-mode="cpu"]').click();
      }
      $('setup').hidden = true; $('friend').hidden = true; $('game').hidden = false;
      paint($('board'), state.s);
      localStatus();
      if (!state.over && state.mode === 'cpu' && state.s.turn === C.P2) aiMove();
    }).catch(function () {});
  }
})();
