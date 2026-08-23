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
    hover: -1, dropping: false, pulse: 0, cover: false
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
  // Rail above the grid holds the preview disc. Extra canvas height (phone)
  // is still the column's hit target — not just the hole.
  function layout(cssW, cssH) {
    var padX = Math.min(cssW * 0.03, 14);
    var padBot = Math.min(cssH * 0.025, 10);
    // rail is 2.2R (preview disc), not 2.2×width-based R — a wide canvas
    // used to steal height and shrink the grid.
    var maxR = Math.min(
      Math.max(80, cssW - 2 * padX) / (3 * C.COLUMNS + 1),
      Math.max(80, cssH - padBot) / (3 * C.ROWS + 1 + 2.2)
    );
    var R = Math.max(8, maxR);
    var boardW = (3 * C.COLUMNS + 1) * R;
    var boardH = (3 * C.ROWS + 1) * R;
    var rail = 2.2 * R;
    var leftover = cssH - padBot - boardH - rail;
    var y0 = rail + Math.max(0, leftover * 0.12);
    return {
      radius: R,
      x0: (cssW - boardW) / 2,
      y0: y0,
      x1: (cssW - boardW) / 2 + boardW,
      y1: y0 + boardH
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
    ctx.beginPath(); ctx.arc(x - r * 0.22, y - r * 0.28, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fill();
  }
  function dropY(t, fromY, toY) {
    var fallEnd = 0.72;
    if (t <= fallEnd) {
      var u = t / fallEnd;
      return fromY + (toY - fromY) * (u * u);
    }
    var b = (t - fallEnd) / (1 - fallEnd);
    var amp = (toY - fromY) * 0.1;
    return toY - Math.sin(b * Math.PI) * amp;
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
        var fromY = g.y0 - g.radius * 1.15;
        disc(ctx, p.x, dropY(opts.drop.t, fromY, p.y), g.radius * 0.92, opts.drop.color);
      }
    }
    // mask with holes — discs show through the plastic
    ctx.save();
    ctx.fillStyle = C.MASK;
    ctx.beginPath();
    var rr = Math.min(14, g.radius * 0.7);
    if (ctx.roundRect) ctx.roundRect(g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0, rr);
    else ctx.rect(g.x0, g.y0, g.x1 - g.x0, g.y1 - g.y0);
    for (r = 0; r < C.ROWS; r++) for (c = 0; c < C.COLUMNS; c++) {
      p = cellCenter(g, r, c);
      ctx.moveTo(p.x + g.radius, p.y);
      ctx.arc(p.x, p.y, g.radius, 0, Math.PI * 2, true);
    }
    ctx.fill('evenodd');
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,.22)';
    ctx.lineWidth = Math.max(1, g.radius * 0.07);
    for (r = 0; r < C.ROWS; r++) for (c = 0; c < C.COLUMNS; c++) {
      p = cellCenter(g, r, c);
      ctx.beginPath(); ctx.arc(p.x, p.y, g.radius * 0.98, 0, Math.PI * 2); ctx.stroke();
    }
    if (opts.hover >= 0 && s && !s.winner && C.canDrop(s, opts.hover) && !opts.drop) {
      var hoverColor = opts.hoverColor || s.turn;
      p = cellCenter(g, 0, opts.hover);
      ctx.fillStyle = hoverColor === C.P1 ? 'rgba(239,69,59,.14)' : 'rgba(0,89,255,.14)';
      ctx.fillRect(g.x0 + opts.hover * (g.x1 - g.x0) / C.COLUMNS, g.y0,
        (g.x1 - g.x0) / C.COLUMNS, g.y1 - g.y0);
      ctx.globalAlpha = 0.95;
      disc(ctx, p.x, g.y0 - g.radius * 1.12, g.radius * 0.92, hoverColor);
      ctx.globalAlpha = 1;
    }
    if (s && s.winLine && !opts.drop) {
      var pulse = 0.5 + 0.5 * Math.sin((opts.pulse || nowMs()) / 260);
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 214, 70, ' + (0.78 + 0.22 * pulse) + ')';
      ctx.lineWidth = Math.max(5, g.radius * (0.28 + 0.1 * pulse));
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      s.winLine.forEach(function (pt, i) {
        p = cellCenter(g, pt.r, pt.c);
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.lineWidth = Math.max(3, g.radius * 0.16);
      s.winLine.forEach(function (pt) {
        p = cellCenter(g, pt.r, pt.c);
        ctx.beginPath();
        ctx.arc(p.x, p.y, g.radius * (1.04 + 0.08 * pulse), 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.restore();
    }
  }
  function hitColumn(canvas, ev) {
    var rect = canvas.getBoundingClientRect();
    var t = ev.changedTouches && ev.changedTouches[0] ? ev.changedTouches[0]
          : (ev.touches && ev.touches[0] ? ev.touches[0] : ev);
    var x = t.clientX - rect.left;
    var g = layout(rect.width, rect.height);
    var colW = (g.x1 - g.x0) / C.COLUMNS;
    var col = Math.floor((x - g.x0) / colW);
    if (x < g.x0) col = 0;
    if (x >= g.x1) col = C.COLUMNS - 1;
    if (col < 0 || col >= C.COLUMNS) return -1;
    return col;
  }

  function animateDrop(canvas, s, col, done) {
    if (!s || !s.last || s.last.c !== col) { done(); return; }
    var row = s.last.r, color = s.map[row][col];
    var t0 = nowMs();
    var duration = 95 + row * 62 + 170;
    state.dropping = true;
    function frame() {
      var t = Math.min(1, (nowMs() - t0) / duration);
      paint(canvas, s, { drop: { r: row, c: col, t: t, color: color }, hover: -1 });
      if (t < 1) requestAnimationFrame(frame);
      else { state.dropping = false; paint(canvas, s, { hover: -1 }); done(); }
    }
    requestAnimationFrame(frame);
  }

  var pulseOn = false;
  function pulseLoop() {
    if (!pulseOn) return;
    var local = !$('game').hidden && state.s && state.s.winLine;
    var friend = !$('friend').hidden && mp.board;
    if (local) paint($('board'), state.s, { hover: -1, pulse: nowMs() });
    else if (friend) {
      var fs = C.replay(mp.board.moves || []);
      if (fs.winLine) paint($('fBoard'), fs, { hover: -1, pulse: nowMs() });
      else { pulseOn = false; return; }
    } else { pulseOn = false; return; }
    requestAnimationFrame(pulseLoop);
  }
  function startPulse() {
    if (pulseOn) return;
    pulseOn = true;
    requestAnimationFrame(pulseLoop);
  }

  // ---- local game ----
  function isHumanTurn() {
    if (!state.s || state.over || state.thinking || state.dropping) return false;
    if (state.mode === 'hotseat') return true;
    return state.s.turn === C.P1;
  }
  function paintTurn() {
    var red = $('whoRed'), blue = $('whoBlue');
    if (!red || !blue) return;
    $('whoRedName').textContent = state.mode === 'cpu' ? 'You' : 'Red';
    $('whoBlueName').textContent = state.mode === 'cpu' ? 'Computer' : 'Blue';
    var s = state.s;
    var redOn = false, blueOn = false;
    if (s && s.winner && s.winner !== C.DRAW) {
      redOn = s.winner === C.P1;
      blueOn = s.winner === C.P2;
    } else if (s && !s.winner) {
      if (state.thinking) { redOn = false; blueOn = true; }
      else {
        redOn = s.turn === C.P1;
        blueOn = s.turn === C.P2;
      }
    }
    red.className = 'who red' + (redOn ? (s && s.winner ? ' on win' : ' on') : '');
    blue.className = 'who blue' + (blueOn ? (s && s.winner ? ' on win' : ' on') : '');
  }
  function paintBanner() {
    var el = $('banner');
    if (!el) return;
    if (!state.s || !state.s.winner) { el.hidden = true; return; }
    el.hidden = false;
    if (state.s.winner === C.DRAW) {
      el.className = 'banner'; el.textContent = 'Draw — the board is full'; return;
    }
    if (state.mode === 'hotseat') {
      el.className = 'banner good';
      el.textContent = (state.s.winner === C.P1 ? 'Red' : 'Blue') + ' wins';
      return;
    }
    var you = state.s.winner === C.P1;
    el.className = 'banner ' + (you ? 'good' : 'bad');
    el.textContent = you ? 'You win — four in a row' : 'The computer wins';
  }
  function localStatus() {
    if (!state.s) return;
    paintTurn();
    paintBanner();
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
    if (!db || state.cover) return;
    db.put({
      id: 'game', mode: state.mode, moves: state.hist.slice(),
      over: state.over, at: nowMs()
    }).catch(function () {});
  }
  function afterLocal() {
    paint($('board'), state.s, { hover: isHumanTurn() ? state.hover : -1 });
    localStatus();
    saveLocal();
    if (state.s && state.s.winLine) startPulse();
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
    if (state.s && state.s.winLine) startPulse();
    if (!state.over && state.mode === 'cpu' && state.s.turn === C.P2) aiMove();
  }
  function newLocal() {
    state.s = C.fresh(); state.hist = []; state.over = false; state.hover = -1;
    state.thinking = false; state.dropping = false; state.cover = false;
    setChip('ready', state.mode === 'cpu' ? 'Ready' : 'Two players');
    $('setup').hidden = true; $('friend').hidden = true; $('game').hidden = false;
    paint($('board'), state.s);
    localStatus();
    saveLocal();
    requestAnimationFrame(function () {
      if (state.s && !$('game').hidden) paint($('board'), state.s, { hover: state.hover });
    });
  }

  $('startBtn').onclick = function () { newLocal(); };
  $('newBtn').onclick = function () {
    $('game').hidden = true; $('setup').hidden = false; setChip('ready', 'Ready');
  };
  $('undoBtn').onclick = undoLocal;

  function bindBoard(canvas, canPlay, onPlay, hoverOf) {
    canvas.addEventListener('pointerdown', function (e) {
      if (e.button && e.button !== 0) return;
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
  var mp = { on: false, id: null, name: 'You', row: null, board: null, people: [], hb: 0, sub: false, hover: -1, seen: -1 };
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
      mp.id = me.id; mp.name = me.name || 'You'; mp.on = true; mp.row = null; mp.seen = -1;
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

  function mpPaintBoard(s, b, seat) {
    paint($('fBoard'), s, {
      hover: (seat && b.turn === seat && !b.winner) ? mp.hover : -1,
      hoverColor: seat ? C.colorNum(seat) : 0
    });
    if (s.winLine) startPulse();
  }
  function mpRender() {
    if (!mp.on) return;
    var b = mp.board, status = $('fStatus');
    if (!b) { $('fSeats').innerHTML = ''; status.textContent = 'Setting up the board…'; return; }
    var s = C.replay(b.moves || []);
    var seat = mySeat(b);
    var nameOf = function (id) { return id ? esc(b.names[id] || 'Player') : '<span class="open">open</span>'; };
    var disc = function (color) { return '<i class="disc ' + color + '" aria-hidden="true"></i>'; };
    $('fSeats').innerHTML =
      '<div class="seat' + (seat === 'red' ? ' me' : '') + (b.turn === 'red' && !b.winner ? ' turn' : '') + '">' + disc('red') + nameOf(b.seats.red) + '</div>' +
      '<div class="seat blue' + (seat === 'blue' ? ' me' : '') + (b.turn === 'blue' && !b.winner ? ' turn' : '') + '">' + disc('blue') + nameOf(b.seats.blue) + '</div>';
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
    var seq = b.seq || 0;
    var prev = mp.seen;
    mp.seen = seq;
    if (prev >= 0 && seq !== prev && b.last && !state.dropping) {
      animateDrop($('fBoard'), s, b.last.c, function () { mpPaintBoard(s, b, seat); });
    } else {
      mpPaintBoard(s, b, seat);
    }
    $('fResign').hidden = !(seat && (b.moves || []).length && !b.winner);
  }

  bindBoard($('fBoard'), function () {
    var b = mp.board, seat = mySeat(b);
    return !!(b && seat && !b.winner && b.turn === seat && !state.dropping);
  }, function (col) { return mpPlay(col); }, function (col) {
    mp.hover = col;
    var b = mp.board; if (!b) return;
    var seat = mySeat(b);
    paint($('fBoard'), C.replay(b.moves || []), {
      hover: (seat && b.turn === seat && !b.winner) ? mp.hover : -1,
      hoverColor: seat ? C.colorNum(seat) : 0
    });
  });

  window.addEventListener('resize', function () {
    if (!$('game').hidden && state.s) paint($('board'), state.s, { hover: state.hover });
    if (!$('friend').hidden && mp.board) paint($('fBoard'), C.replay(mp.board.moves || []), { hover: mp.hover });
  });

  if (window.gifos && gifos.onBack) gifos.onBack(function () {
    if (!$('friend').hidden) mpLeave();
    else if (!$('game').hidden) { $('game').hidden = true; $('setup').hidden = false; setChip('ready', 'Ready'); }
  });

  C.coverShot = function () {
    document.body.classList.add('cover');
    state.cover = true;
    state.mode = 'cpu';
    state.hist = C.COVER_MOVES.concat([0]);
    state.s = C.replay(state.hist);
    state.over = true;
    state.thinking = false;
    state.dropping = false;
    state.hover = -1;
    $('setup').hidden = true; $('friend').hidden = true; $('game').hidden = false;
    setChip('ready', 'Ready');
    localStatus();
    setStatus($('statusLine'), 'No game server.', '');
    paint($('board'), state.s, { hover: -1, pulse: nowMs() });
    startPulse();
    requestAnimationFrame(function () {
      if (state.s) paint($('board'), state.s, { hover: -1, pulse: nowMs() });
    });
  };

  setChip('ready', 'Ready');
  if (db) {
    db.get('game').then(function (g) {
      if (state.cover) return;
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
      if (state.s && state.s.winLine) startPulse();
      if (!state.over && state.mode === 'cpu' && state.s.turn === C.P2) aiMove();
    }).catch(function () {});
  }
})();
