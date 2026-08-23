// Gomoku — five in a row. Computer is yyjhao's HTML5-Gomoku AI (MIT),
// running on this device. A friend sits the other colour on a shared board.
(function () {
  'use strict';
  var G = window.Gomoku;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]; });
  };

  var LEVELS = {
    novice: 'A gentle opponent. It notices the obvious.',
    medium: 'A fair game. It looks a couple of moves ahead.',
    expert: 'It thinks hard. Give it a moment on its turn.'
  };

  var state = {
    mode: 'cpu', color: 'black', level: 'medium',
    s: null, hist: [], over: false, thinking: false, hover: null
  };
  var aiPort = null, aiColor = null, aiCancel = 0;
  var db = null;
  try { if (window.gifos) db = gifos.db('gomoku'); } catch (e) {}

  function setChip(cls, text) {
    $('aiChip').className = 'engine-chip' + (cls ? ' ' + cls : '');
    $('aiState').textContent = text;
  }
  function setStatus(el, text, cls) {
    el.className = 'statusline' + (cls ? ' ' + cls : '');
    el.textContent = text;
  }

  // ---- setup ----
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
  bindSeg('colorSeg', 'color', 'data-color');
  bindSeg('levelSeg', 'level', 'data-level', function () {
    $('lvlNote').textContent = LEVELS[state.level] || '';
  });

  // ---- board paint ----
  function resizeCanvas(canvas) {
    var css = canvas.clientWidth || 448;
    var dpr = window.devicePixelRatio || 1;
    var w = Math.round(css * dpr);
    if (canvas.width !== w || canvas.height !== w) { canvas.width = w; canvas.height = w; }
    return css;
  }
  function stoneGradient(ctx, x, y, r, color) {
    var g = ctx.createRadialGradient(x - r * 0.32, y - r * 0.38, r * 0.08, x, y, r);
    if (color === G.BLACK) { g.addColorStop(0, '#6a6a6a'); g.addColorStop(1, '#111'); }
    else { g.addColorStop(0, '#fff'); g.addColorStop(1, '#b8b8c0'); }
    return g;
  }
  function paint(canvas, s, opts) {
    opts = opts || {};
    var css = resizeCanvas(canvas);
    var ctx = canvas.getContext('2d');
    ctx.setTransform((window.devicePixelRatio || 1), 0, 0, (window.devicePixelRatio || 1), 0, 0);
    var W = css;
    var wood = ctx.createLinearGradient(0, 0, W, W);
    wood.addColorStop(0, '#e0b078');
    wood.addColorStop(0.5, '#c9955a');
    wood.addColorStop(1, '#a8743c');
    ctx.fillStyle = wood;
    ctx.fillRect(0, 0, W, W);
    ctx.fillStyle = 'rgba(80,40,10,.07)';
    for (var i = 0; i < 12; i++) {
      ctx.fillRect(0, (i / 12) * W, W, 1.2);
    }
    var N = G.N, pad = W * 0.065, span = W - 2 * pad, step = span / (N - 1);
    ctx.strokeStyle = 'rgba(48,28,10,.78)';
    ctx.lineWidth = Math.max(1, W / 420);
    var k, p;
    for (k = 0; k < N; k++) {
      p = pad + k * step;
      ctx.beginPath(); ctx.moveTo(pad, p); ctx.lineTo(pad + span, p); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p, pad); ctx.lineTo(p, pad + span); ctx.stroke();
    }
    ctx.fillStyle = '#2a1808';
    [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]].forEach(function (xy) {
      ctx.beginPath();
      ctx.arc(pad + xy[1] * step, pad + xy[0] * step, Math.max(2.2, step * 0.12), 0, Math.PI * 2);
      ctx.fill();
    });
    if (!s) return;
    var r, c, x, y, rad = step * 0.44, col;
    var win = {};
    if (s.winLine) s.winLine.forEach(function (pt) { win[pt.r + ',' + pt.c] = 1; });
    for (r = 0; r < N; r++) for (c = 0; c < N; c++) {
      col = s.cells[r * N + c];
      if (!col) continue;
      x = pad + c * step; y = pad + r * step;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle = stoneGradient(ctx, x, y, rad, col);
      ctx.fill();
      ctx.strokeStyle = col === G.BLACK ? 'rgba(0,0,0,.45)' : 'rgba(0,0,0,.22)';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (win[r + ',' + c]) {
        ctx.beginPath(); ctx.arc(x, y, rad * 1.08, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(220,40,30,.85)';
        ctx.lineWidth = 2.4;
        ctx.stroke();
      }
    }
    if (s.last && G.at(s, s.last.r, s.last.c)) {
      x = pad + s.last.c * step; y = pad + s.last.r * step;
      ctx.beginPath(); ctx.arc(x, y, rad * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = G.at(s, s.last.r, s.last.c) === G.BLACK ? '#f2f2f2' : '#222';
      ctx.fill();
    }
    if (opts.hover && !s.winner && G.at(s, opts.hover.r, opts.hover.c) === G.EMPTY) {
      x = pad + opts.hover.c * step; y = pad + opts.hover.r * step;
      ctx.globalAlpha = 0.38;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle = stoneGradient(ctx, x, y, rad, opts.hover.color || s.turn);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  function hitCell(canvas, ev) {
    var rect = canvas.getBoundingClientRect();
    var t = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
    var x = t.clientX - rect.left, y = t.clientY - rect.top, W = rect.width;
    var pad = W * 0.065, span = W - 2 * pad, step = span / (G.N - 1);
    var c = Math.round((x - pad) / step), r = Math.round((y - pad) / step);
    if (r < 0 || c < 0 || r >= G.N || c >= G.N) return null;
    var dx = x - (pad + c * step), dy = y - (pad + r * step);
    if (dx * dx + dy * dy > (step * 0.55) * (step * 0.55)) return null;
    return { r: r, c: c };
  }

  // ---- AI (worker if the sandbox allows, otherwise the same code on this thread) ----
  function makeAi(onmessage) {
    try {
      if (window.GOMOKU_AI_SRC && typeof Worker === 'function') {
        var w = new Worker(URL.createObjectURL(new Blob([window.GOMOKU_AI_SRC], { type: 'text/javascript' })));
        w.onmessage = onmessage;
        return w;
      }
    } catch (e) {}
    if (typeof window.createGomokuAi !== 'function') throw new Error('AI did not load');
    return window.createGomokuAi(onmessage);
  }
  function killAi() {
    if (aiPort) { try { aiPort.terminate(); } catch (e) {} aiPort = null; }
    aiColor = null; state.thinking = false; aiCancel++;
  }
  function startAi(level, color) {
    killAi();
    aiColor = color;
    var tok = aiCancel;
    aiPort = makeAi(function (e) {
      if (tok !== aiCancel) return;
      var d = e.data || {};
      if (d.type === 'starting') {
        state.thinking = true; setChip('thinking', 'Thinking…');
      } else if (d.type === 'decision') {
        state.thinking = false; setChip('ready', 'Ready');
        if (state.over || !state.s) return;
        playLocal(d.r, d.c);
      }
    });
    aiPort.postMessage({ type: 'ini', color: color, mode: level });
  }
  function aiWatch(r, c, color) {
    if (aiPort) aiPort.postMessage({ type: 'watch', r: r, c: c, color: color });
  }
  function aiMove() {
    if (!aiPort || state.over) return;
    var n = state.s.n;
    if (n === 0) { playLocal(7, 7); return; }
    if (n === 1) {
      var spots = [[6, 6], [6, 7], [6, 8], [7, 6], [7, 8], [8, 6], [8, 7], [8, 8]];
      var i, pick;
      for (i = spots.length - 1; i > 0; i--) {
        var j = (Math.random() * (i + 1)) | 0; pick = spots[i]; spots[i] = spots[j]; spots[j] = pick;
      }
      for (i = 0; i < spots.length; i++) {
        if (G.at(state.s, spots[i][0], spots[i][1]) === G.EMPTY) { playLocal(spots[i][0], spots[i][1]); return; }
      }
    }
    state.thinking = true; setChip('thinking', 'Thinking…');
    aiPort.postMessage({ type: 'compute' });
  }

  // ---- local game ----
  function humanColor() {
    if (state.mode === 'hotseat') return state.s ? G.colorName(state.s.turn) : 'black';
    return state.color;
  }
  function isHumanTurn() {
    if (!state.s || state.over || state.thinking) return false;
    if (state.mode === 'hotseat') return true;
    return G.colorName(state.s.turn) === state.color;
  }
  function showGame() {
    $('setup').hidden = true; $('friend').hidden = true; $('game').hidden = false;
    paint($('board'), state.s, { hover: isHumanTurn() ? state.hover : null });
  }
  function localStatus() {
    if (!state.s) return;
    if (state.s.winner === -1) { setStatus($('statusLine'), 'Draw — the board is full.', ''); return; }
    if (state.s.winner) {
      var w = G.colorName(state.s.winner);
      var you = state.mode === 'cpu' && w === state.color;
      var msg = state.mode === 'hotseat'
        ? (w.charAt(0).toUpperCase() + w.slice(1) + ' wins.')
        : (you ? 'You win.' : 'The computer wins.');
      setStatus($('statusLine'), msg, you ? 'good' : 'warn');
      return;
    }
    if (state.thinking) { setStatus($('statusLine'), 'Computer is thinking…', ''); return; }
    if (state.mode === 'hotseat') {
      var t = G.colorName(state.s.turn);
      setStatus($('statusLine'), t.charAt(0).toUpperCase() + t.slice(1) + ' to play.', '');
    } else {
      setStatus($('statusLine'), G.colorName(state.s.turn) === state.color ? 'Your turn.' : 'Computer to play.', '');
    }
  }
  function saveLocal() {
    if (!db) return;
    db.put({
      id: 'game', mode: state.mode, color: state.color, level: state.level,
      stones: state.hist.map(function (h) { return { r: h.r, c: h.c, color: h.color }; }),
      over: state.over, at: nowMs()
    }).catch(function () {});
  }
  function replayStones(stones) {
    var s = G.fresh(), hist = [];
    for (var i = 0; i < stones.length; i++) {
      var st = stones[i];
      var ns = G.place(s, st.r, st.c);
      if (!ns) break;
      hist.push({ r: st.r, c: st.c, color: G.colorName(atBefore(s, st)) });
      s = ns;
    }
    return { s: s, hist: hist };
  }
  function atBefore(s, st) { return s.turn; }
  function playLocal(r, c) {
    if (!state.s || state.over) return false;
    var ns = G.place(state.s, r, c);
    if (!ns) return false;
    var color = G.colorName(state.s.turn);
    state.hist.push({ r: r, c: c, color: color });
    state.s = ns;
    state.hover = null;
    if (aiPort) aiWatch(r, c, color);
    if (ns.winner) {
      state.over = true; state.thinking = false; setChip('ready', 'Ready');
    }
    paint($('board'), state.s);
    localStatus();
    saveLocal();
    if (!state.over && state.mode === 'cpu' && G.colorName(state.s.turn) !== state.color) aiMove();
    return true;
  }
  function resyncAi() {
    if (state.mode !== 'cpu') return;
    var other = state.color === 'black' ? 'white' : 'black';
    startAi(state.level, other);
    state.hist.forEach(function (h) { aiWatch(h.r, h.c, h.color); });
  }
  function undoLocal() {
    if (!state.hist.length) return;
    function popOne() { return state.hist.pop() || null; }
    if (state.over) popOne();
    else if (state.mode === 'cpu') {
      var last = popOne();
      if (last && last.color !== state.color && state.hist.length) popOne();
    } else popOne();
    var rebuilt = replayStones(state.hist);
    state.s = rebuilt.s; state.hist = rebuilt.hist;
    state.over = !!state.s.winner;
    state.thinking = false;
    paint($('board'), state.s);
    localStatus();
    saveLocal();
    if (state.mode === 'cpu') {
      resyncAi();
      if (!state.over && G.colorName(state.s.turn) !== state.color) aiMove();
    }
  }
  function newLocal() {
    killAi();
    state.s = G.fresh(); state.hist = []; state.over = false; state.hover = null;
    if (state.mode === 'cpu') {
      var other = state.color === 'black' ? 'white' : 'black';
      startAi(state.level, other);
    } else setChip('ready', 'Two players');
    $('setup').hidden = true; $('friend').hidden = true; $('game').hidden = false;
    paint($('board'), state.s);
    localStatus();
    saveLocal();
    if (state.mode === 'cpu' && state.color === 'white') aiMove();
  }

  $('startBtn').onclick = function () { newLocal(); };
  $('newBtn').onclick = function () {
    killAi();
    $('game').hidden = true; $('setup').hidden = false; setChip('ready', 'Ready');
  };
  $('undoBtn').onclick = undoLocal;

  function bindBoard(canvas, canPlay, onPlay) {
    canvas.addEventListener('click', function (e) {
      var cell = hitCell(canvas, e); if (!cell) return;
      if (canPlay() && onPlay(cell.r, cell.c)) { /* placed */ }
    });
    canvas.addEventListener('mousemove', function (e) {
      var cell = hitCell(canvas, e);
      state.hover = cell;
      if (canPlay()) paint(canvas, onPlay.board ? onPlay.board() : state.s, { hover: cell && { r: cell.r, c: cell.c, color: onPlay.color ? onPlay.color() : G.colorNum(humanColor()) } });
    });
    canvas.addEventListener('mouseleave', function () {
      state.hover = null;
      paint(canvas, onPlay.board ? onPlay.board() : state.s);
    });
  }
  bindBoard($('board'), isHumanTurn, function (r, c) { return playLocal(r, c); });

  // ---- multiplayer ----
  // One collection. Each person writes ONLY their own row (id = me).
  // The board row is written by whoever is host (first seated / lowest id).
  // A player publishes an intended move; the host applies it if it is legal.
  var PRES_TTL = 9000, HB_MS = 3000, END_HOLD = 4000;
  var mpDb = null;
  try { if (window.gifos) mpDb = gifos.db('gomoku-mp'); } catch (e) {}
  var mp = { on: false, id: null, name: 'You', row: null, board: null, people: [], hb: 0, sub: false, hover: null };
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
      stones: [], turn: 'black', winner: null, result: '', last: null, seq: 0,
      undoAsk: null, startedAt: nowMs()
    };
  }
  function putMe(extra) {
    var row = { id: mp.id, name: mp.name, at: nowMs(), intent: null };
    if (mp.row && mp.row.intent) row.intent = mp.row.intent;
    if (extra) {
      if (extra.intent !== undefined) row.intent = extra.intent;
    }
    mp.row = row;
    mpDb.put(row).catch(function () {});
  }
  function putBoard(b) { mp.board = b; mpDb.put(b).catch(function () {}); }

  function boardToState(b) {
    var s = G.fresh();
    for (var i = 0; i < (b.stones || []).length; i++) {
      var st = b.stones[i];
      var ns = G.place(s, st.r, st.c);
      if (!ns) break;
      s = ns;
    }
    return s;
  }

  $('friendBtn').onclick = mpEnter;
  function mpEnter() {
    if (!mpDb) { setStatus($('statusLine'), 'Play a friend needs storage.', 'warn'); return; }
    (window.gifos ? gifos.me() : Promise.resolve({ id: 'local', name: 'You' })).then(function (me) {
      mp.id = me.id; mp.name = me.name || 'You'; mp.on = true; mp.row = null;
      killAi();
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
    // drop a spent intent from MY row only
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
    ['black', 'white'].forEach(function (s) {
      if (b.seats[s] && !ids[b.seats[s]]) { b.seats[s] = null; ch = true; }
    });
    if ((!b.seats.black || !b.seats.white) && b.stones.length && !b.winner) {
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
      b.stones = []; b.turn = 'black'; b.winner = null; b.result = ''; b.last = null;
      b.seq = (b.seq || 0) + 1; b.undoAsk = null; b.endedAt = 0; b.startedAt = nowMs();
      ch = true;
    }
    people.forEach(function (p) {
      var intent = p.intent;
      if (!intent || intent.seq !== b.seq) return;
      var seat = b.seats.black === p.id ? 'black' : (b.seats.white === p.id ? 'white' : null);
      if (intent.kind === 'place') {
        if (!seat || b.winner || b.turn !== seat) return;
        if (typeof intent.r !== 'number' || typeof intent.c !== 'number') return;
        var s = boardToState(b);
        var ns = G.place(s, intent.r, intent.c);
        if (!ns) return;
        b.stones = b.stones.concat([{ r: intent.r, c: intent.c, color: seat }]);
        b.last = { r: intent.r, c: intent.c };
        b.seq = (b.seq || 0) + 1;
        b.undoAsk = null;
        if (ns.winner === -1) { b.winner = 'draw'; b.result = 'Draw'; b.endedAt = nowMs(); }
        else if (ns.winner) { b.winner = G.colorName(ns.winner); b.result = 'Five in a row'; b.endedAt = nowMs(); }
        else b.turn = G.colorName(ns.turn);
        ch = true;
      } else if (intent.kind === 'undo') {
        if (!seat || !b.stones.length) return;
        var last = b.stones[b.stones.length - 1];
        var lastIsMine = last.color === seat;
        var both = b.undoAsk && b.undoAsk.id && b.undoAsk.id !== p.id && b.undoAsk.seq === b.seq;
        if (lastIsMine || both) {
          b.stones = b.stones.slice(0, -1);
          var rebuilt = boardToState(b);
          b.last = rebuilt.last ? { r: rebuilt.last.r, c: rebuilt.last.c } : null;
          b.winner = null; b.result = ''; b.endedAt = 0;
          b.turn = G.colorName(rebuilt.turn) || 'black';
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

  function mpPlay(r, c) {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner || b.turn !== seat) return false;
    var s = boardToState(b);
    if (!G.place(s, r, c)) return false;
    putMe({ intent: { kind: 'place', r: r, c: c, seq: b.seq } });
    return true;
  }
  $('fUndo').onclick = function () {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || !b.stones.length) return;
    putMe({ intent: { kind: 'undo', seq: b.seq } });
  };
  $('fResign').onclick = function () {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner) return;
    putMe({ intent: { kind: 'resign', seq: b.seq } });
  };

  function mpRender() {
    if (!mp.on) return;
    var b = mp.board, status = $('fStatus');
    if (!b) { $('fSeats').innerHTML = ''; status.textContent = 'Setting up the board…'; return; }
    var s = boardToState(b);
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
      status.innerHTML = b.winner === 'draw' ? (esc(b.result || 'Draw') + ' — next game starting…') : ((esc(b.result || 'Five in a row') + ' — ') + wname + ' wins. Next game starting…');
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
    paint($('fBoard'), s, {
      hover: (seat && b.turn === seat && !b.winner && mp.hover) ? { r: mp.hover.r, c: mp.hover.c, color: G.colorNum(seat) } : null
    });
    $('fUndo').hidden = !(seat && b.stones.length && !b.winner);
    $('fResign').hidden = !(seat && b.stones.length && !b.winner);
  }

  (function bindFriendBoard() {
    var canvas = $('fBoard');
    canvas.addEventListener('click', function (e) {
      var cell = hitCell(canvas, e); if (!cell) return;
      mpPlay(cell.r, cell.c);
    });
    canvas.addEventListener('mousemove', function (e) {
      mp.hover = hitCell(canvas, e);
      var b = mp.board; if (!b) return;
      var seat = mySeat(b);
      paint(canvas, boardToState(b), {
        hover: (seat && b.turn === seat && !b.winner && mp.hover) ? { r: mp.hover.r, c: mp.hover.c, color: G.colorNum(seat) } : null
      });
    });
    canvas.addEventListener('mouseleave', function () { mp.hover = null; if (mp.board) paint(canvas, boardToState(mp.board)); });
  })();

  window.addEventListener('resize', function () {
    if (!$('game').hidden && state.s) paint($('board'), state.s);
    if (!$('friend').hidden && mp.board) paint($('fBoard'), boardToState(mp.board));
  });

  if (window.gifos && gifos.onBack) gifos.onBack(function () {
    if (!$('friend').hidden) mpLeave();
    else if (!$('game').hidden) { killAi(); $('game').hidden = true; $('setup').hidden = false; setChip('ready', 'Ready'); }
  });

  setChip('ready', 'Ready');
  if (db) {
    db.get('game').then(function (g) {
      if (!g || !g.stones || !g.stones.length || g.over) return;
      state.mode = g.mode || 'cpu';
      state.color = g.color || 'black';
      state.level = g.level || 'medium';
      var rebuilt = replayStones(g.stones);
      state.s = rebuilt.s; state.hist = rebuilt.hist; state.over = !!state.s.winner;
      if (state.mode === 'cpu') {
        $('modeSeg').querySelector('[data-mode="cpu"]').click();
        Array.prototype.forEach.call($('colorSeg').children, function (c) { c.classList.toggle('on', c.getAttribute('data-color') === state.color); });
        Array.prototype.forEach.call($('levelSeg').children, function (c) { c.classList.toggle('on', c.getAttribute('data-level') === state.level); });
        $('lvlNote').textContent = LEVELS[state.level] || '';
        var other = state.color === 'black' ? 'white' : 'black';
        startAi(state.level, other);
        state.hist.forEach(function (h) { aiWatch(h.r, h.c, h.color); });
      } else {
        $('modeSeg').querySelector('[data-mode="hotseat"]').click();
      }
      showGame(); localStatus();
      if (!state.over && state.mode === 'cpu' && G.colorName(state.s.turn) !== state.color) aiMove();
    }).catch(function () {});
  }
})();
