// Backgammon — a table of checkers and dice. Computer uses the same legal
// moves. A friend sits the other colour. Invite is OS chrome.
(function () {
  'use strict';
  var B = window.Backgammon;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var esc = function (s) {
    return String(s).replace(/[&<>]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch];
    });
  };

  var state = {
    mode: 'cpu', color: 'white',
    g: null, over: false, thinking: false,
    die: 0
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
  function setScore(el, g) {
    if (!el || !g) return;
    var w = g.state.whiteOutside.length, b = g.state.blackOutside.length;
    el.innerHTML = '<span class="wht">White ' + w + ' off</span><span class="blk">Black ' + b + ' off</span>';
  }

  $('modeSeg').addEventListener('click', function (e) {
    var btn = e.target.closest('button'); if (!btn) return;
    Array.prototype.forEach.call(this.children, function (c) { c.classList.remove('on'); });
    btn.classList.add('on');
    state.mode = btn.getAttribute('data-mode');
    var cpu = state.mode === 'cpu';
    $('cpuOpts').hidden = !cpu;
    $('hotseatNote').hidden = cpu;
  });
  $('colorSeg').addEventListener('click', function (e) {
    var btn = e.target.closest('button'); if (!btn) return;
    Array.prototype.forEach.call(this.children, function (c) { c.classList.remove('on'); });
    btn.classList.add('on');
    state.color = btn.getAttribute('data-color');
    $('cpuNote').textContent = state.color === 'white'
      ? 'You play white and go first. The computer plays black. It thinks on this device.'
      : 'You play black. The computer plays white, and goes first.';
  });

  // ---- board geometry / paint ----
  var WOOD = '#5c2e1a', FRAME = '#3a1c10', FELT = '#4a2418';
  var LIGHT = '#d4b896', DARK = '#8b3a2a';
  var IVORY = '#f3ead8', INK = '#1a1210';
  var BARC = '#2a140e';

  function geom(W, H) {
    var frame = Math.min(W, H) * 0.045;
    var bear = W * 0.075;
    var x0 = frame, x1 = W - frame - bear, y0 = frame, y1 = H - frame;
    var barW = (x1 - x0) * 0.09;
    var play = x1 - x0 - barW;
    var quad = play / 2;
    var pw = quad / 6;
    var ph = (y1 - y0) * 0.42;
    return { W: W, H: H, frame: frame, bear: bear, x0: x0, x1: x1, y0: y0, y1: y1,
      barW: barW, quad: quad, pw: pw, ph: ph, barX: x0 + quad, bearX: x1 };
  }
  function pointBox(g, pos) {
    var col, top, left;
    if (pos >= 12 && pos <= 17) { col = pos - 12; top = true; left = true; }
    else if (pos >= 18) { col = pos - 18; top = true; left = false; }
    else if (pos >= 6) { col = 11 - pos; top = false; left = true; }
    else { col = 5 - pos; top = false; left = false; }
    var x = g.x0 + (left ? 0 : g.quad + g.barW) + col * g.pw;
    var y = top ? g.y0 : g.y1 - g.ph;
    return { x: x, y: y, w: g.pw, h: g.ph, top: top };
  }
  function resizeCanvas(canvas) {
    var cssW = canvas.clientWidth || 520;
    var cssH = canvas.clientHeight || Math.round(cssW * 2 / 3);
    var dpr = window.devicePixelRatio || 1;
    var w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return { cssW: cssW, cssH: cssH };
  }
  function checker(ctx, x, y, r, type) {
    var g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    if (type === B.WHITE) { g.addColorStop(0, '#fff8ee'); g.addColorStop(1, '#c8b498'); }
    else { g.addColorStop(0, '#4a3a34'); g.addColorStop(1, INK); }
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = Math.max(1, r * 0.06); ctx.stroke();
  }
  function pipAt(ctx, cx, cy, r, n, color) {
    var spots = {
      1: [[0, 0]],
      2: [[-0.32, -0.32], [0.32, 0.32]],
      3: [[-0.32, -0.32], [0, 0], [0.32, 0.32]],
      4: [[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32]],
      5: [[-0.32, -0.32], [0.32, -0.32], [0, 0], [-0.32, 0.32], [0.32, 0.32]],
      6: [[-0.32, -0.32], [0.32, -0.32], [-0.32, 0], [0.32, 0], [-0.32, 0.32], [0.32, 0.32]]
    };
    var list = spots[n] || spots[1], i;
    ctx.fillStyle = color;
    for (i = 0; i < list.length; i++) {
      ctx.beginPath();
      ctx.arc(cx + list[i][0] * r * 2, cy + list[i][1] * r * 2, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function dieFace(ctx, x, y, s, n, on) {
    var r = s * 0.16;
    ctx.save();
    ctx.fillStyle = on ? IVORY : '#8a7460';
    ctx.strokeStyle = on ? '#3a1c10' : '#5a4030';
    ctx.lineWidth = Math.max(1, s * 0.06);
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, s, s, r); ctx.fill(); ctx.stroke(); }
    else { ctx.fillRect(x, y, s, s); ctx.strokeRect(x, y, s, s); }
    pipAt(ctx, x + s / 2, y + s / 2, s * 0.42, n, on ? INK : '#3a2a20');
    ctx.restore();
  }
  function stackCheckers(ctx, g, box, pieces) {
    var r = Math.min(box.w * 0.42, box.h / 6.4);
    var n = pieces.length, show = Math.min(n, 5), i, y, gap;
    gap = show <= 1 ? 0 : Math.min(r * 1.85, (box.h - 2 * r) / Math.max(1, show - 1));
    for (i = 0; i < show; i++) {
      y = box.top ? (box.y + r + 2 + i * gap) : (box.y + box.h - r - 2 - i * gap);
      checker(ctx, box.x + box.w / 2, y, r, pieces[i].type);
    }
    if (n > 5) {
      y = box.top ? (box.y + r + 2 + 4 * gap) : (box.y + box.h - r - 2 - 4 * gap);
      ctx.fillStyle = pieces[show - 1].type === B.WHITE ? INK : IVORY;
      ctx.font = 'bold ' + Math.round(r * 0.9) + 'px system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(n), box.x + box.w / 2, y);
    }
  }
  function paint(canvas, g, opts) {
    opts = opts || {};
    var sz = resizeCanvas(canvas);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    var W = sz.cssW, H = sz.cssH, geo = geom(W, H), pos, box, i, left, s, x, on, val;
    ctx.fillStyle = FRAME; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = FELT; ctx.fillRect(geo.x0, geo.y0, geo.x1 - geo.x0, geo.y1 - geo.y0);
    ctx.fillStyle = BARC; ctx.fillRect(geo.barX, geo.y0, geo.barW, geo.y1 - geo.y0);
    ctx.fillStyle = WOOD; ctx.fillRect(geo.bearX, geo.y0, W - geo.frame - geo.bearX, geo.y1 - geo.y0);
    for (pos = 0; pos < 24; pos++) {
      box = pointBox(geo, pos);
      ctx.beginPath();
      if (box.top) {
        ctx.moveTo(box.x + 1, box.y);
        ctx.lineTo(box.x + box.w - 1, box.y);
        ctx.lineTo(box.x + box.w / 2, box.y + box.h);
      } else {
        ctx.moveTo(box.x + 1, box.y + box.h);
        ctx.lineTo(box.x + box.w - 1, box.y + box.h);
        ctx.lineTo(box.x + box.w / 2, box.y);
      }
      ctx.closePath();
      ctx.fillStyle = (pos % 2 === 0) ? LIGHT : DARK;
      ctx.fill();
    }
    if (g) {
      for (pos = 0; pos < 24; pos++) stackCheckers(ctx, geo, pointBox(geo, pos), g.state.points[pos]);
      stackCheckers(ctx, geo, {
        x: geo.barX, y: geo.y0, w: geo.barW, h: geo.ph, top: true
      }, g.state.bar[B.BLACK]);
      stackCheckers(ctx, geo, {
        x: geo.barX, y: geo.y1 - geo.ph, w: geo.barW, h: geo.ph, top: false
      }, g.state.bar[B.WHITE]);
      stackCheckers(ctx, geo, {
        x: geo.bearX, y: geo.y0, w: W - geo.frame - geo.bearX, h: geo.ph, top: true
      }, g.state.outside[B.BLACK]);
      stackCheckers(ctx, geo, {
        x: geo.bearX, y: geo.y1 - geo.ph, w: W - geo.frame - geo.bearX, h: geo.ph, top: false
      }, g.state.outside[B.WHITE]);
    }
    left = (g && g.turnDice) ? (g.turnDice.movesLeft || []) : [];
    s = Math.min(36, geo.barW * 0.85);
    if (g && g.turnDice && g.turnDice.values) {
      x = geo.barX + geo.barW + geo.pw * 0.4;
      var midY = (geo.y0 + geo.y1) / 2 - s / 2;
      for (i = 0; i < g.turnDice.values.length; i++) {
        val = g.turnDice.values[i];
        on = left.indexOf(val) >= 0;
        dieFace(ctx, x + i * (s + 8), midY, s, val, on);
      }
      if (left.length) {
        var sel = Math.max(0, Math.min(opts.die || 0, left.length - 1));
        var hx = x + geo.quad * 0.55;
        dieFace(ctx, hx, midY, s, left[sel], true);
        ctx.strokeStyle = '#f3ead8';
        ctx.lineWidth = 2;
        ctx.strokeRect(hx - 2, midY - 2, s + 4, s + 4);
      }
    }
  }
  function hit(canvas, ev) {
    var rect = canvas.getBoundingClientRect();
    var t = ev.changedTouches && ev.changedTouches[0] ? ev.changedTouches[0]
          : (ev.touches && ev.touches[0] ? ev.touches[0] : ev);
    var x = t.clientX - rect.left, y = t.clientY - rect.top;
    var geo = geom(rect.width, rect.height), pos, box;
    if (x >= geo.barX && x <= geo.barX + geo.barW && y >= geo.y0 && y <= geo.y1) {
      return { kind: 'bar', type: y < (geo.y0 + geo.y1) / 2 ? B.BLACK : B.WHITE };
    }
    for (pos = 0; pos < 24; pos++) {
      box = pointBox(geo, pos);
      if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
        return { kind: 'point', pos: pos };
      }
    }
    return null;
  }

  function selectedSteps(g, die) {
    var left = (g && g.turnDice && g.turnDice.movesLeft) ? g.turnDice.movesLeft : [];
    if (!left.length) return 0;
    var i = Math.max(0, Math.min(die || 0, left.length - 1));
    return left[i];
  }
  function pieceFromHit(g, h) {
    if (!g || !h) return null;
    if (h.kind === 'bar') return B.barTop(g, h.type);
    if (h.kind === 'point') return B.topAt(g, h.pos);
    return null;
  }

  // ---- local game ----
  function isHumanTurn() {
    if (!state.g || state.over || state.thinking) return false;
    if (state.mode === 'hotseat') return true;
    return B.colorName(state.g.turnPlayer.currentPieceType) === state.color;
  }
  function localStatus() {
    var g = state.g;
    if (!g) return;
    setScore($('scoreLine'), g);
    $('rollBtn').disabled = !isHumanTurn() || !B.canRoll(g);
    $('undoBtn').disabled = !isHumanTurn() || !B.canUndo(g);
    $('confirmBtn').disabled = !isHumanTurn() || !B.canConfirm(g);
    if (g.isOver) {
      var you = state.mode === 'cpu' && g.winner === B[state.color.toUpperCase()];
      var who = B.colorName(g.winner);
      who = who.charAt(0).toUpperCase() + who.slice(1);
      var msg = state.mode === 'hotseat'
        ? (who + ' bears all fifteen.')
        : (you ? 'You bear all fifteen.' : 'The computer bears all fifteen.');
      setStatus($('statusLine'), msg, you ? 'good' : 'warn');
      return;
    }
    if (state.thinking) { setStatus($('statusLine'), 'Computer is thinking…', ''); return; }
    var turn = B.colorName(g.turnPlayer.currentPieceType);
    turn = turn.charAt(0).toUpperCase() + turn.slice(1);
    if (B.canRoll(g)) {
      setStatus($('statusLine'), (state.mode === 'hotseat' ? turn + ' to play. ' : (isHumanTurn() ? 'Your turn. ' : 'Computer to play. ')) + 'Roll.', '');
      return;
    }
    if (B.canConfirm(g)) {
      setStatus($('statusLine'), 'No more moves. Confirm the turn.', '');
      return;
    }
    if (state.mode === 'hotseat') {
      setStatus($('statusLine'), turn + ' to play. Tap a point to move with the highlighted die.', '');
    } else {
      setStatus($('statusLine'), isHumanTurn()
        ? 'Your turn. Tap a point to move with the highlighted die. Tap the die to cycle.'
        : 'Computer to play.', '');
    }
  }
  function saveLocal() {
    if (!db || !state.g) return;
    db.put({
      id: 'game', mode: state.mode, color: state.color,
      snap: B.snapshot(state.g), over: state.over, at: nowMs()
    }).catch(function () {});
  }
  function paintLocal() {
    paint($('board'), state.g, { die: state.die });
    localStatus();
  }
  function afterHuman() {
    paintLocal();
    saveLocal();
    if (state.g && B.canConfirm(state.g) && !(state.g.turnDice.movesPlayed || []).length) {
      // nothing was playable — confirm is the only act
    }
  }
  function maybeCpu() {
    if (!state.g || state.over || state.mode !== 'cpu' || state.thinking) return;
    if (B.colorName(state.g.turnPlayer.currentPieceType) === state.color) return;
    cpuTurn();
  }
  function cpuTurn() {
    if (!state.g || state.over) return;
    state.thinking = true;
    setChip('thinking', 'Thinking…');
    paintLocal();
    setTimeout(function () {
      if (!state.g || state.over || state.mode !== 'cpu') { state.thinking = false; return; }
      if (B.canRoll(state.g)) B.roll(state.g);
      paintLocal();
      setTimeout(function () {
        if (!state.g || state.over) { state.thinking = false; return; }
        B.aiPlay(state.g);
        B.confirm(state.g);
        if (state.g.isOver) state.over = true;
        state.thinking = false;
        state.die = 0;
        setChip('ready', 'Ready');
        paintLocal();
        saveLocal();
        if (!state.over) maybeCpu();
      }, 280);
    }, 180);
  }
  function playHit(h) {
    var g = state.g, piece, steps;
    if (!g || !isHumanTurn() || !h) return;
    if (B.canRoll(g)) { B.roll(g); state.die = 0; afterHuman(); maybeCpu(); return; }
    steps = selectedSteps(g, state.die);
    if (!steps) return;
    piece = pieceFromHit(g, h);
    if (!piece || piece.type !== g.turnPlayer.currentPieceType) {
      state.die = (state.die + 1) % Math.max(1, (g.turnDice.movesLeft || []).length);
      paintLocal();
      return;
    }
    if (B.tryMove(g, piece.id, steps)) {
      state.die = 0;
      afterHuman();
    } else {
      state.die = (state.die + 1) % Math.max(1, (g.turnDice.movesLeft || []).length);
      paintLocal();
    }
  }
  function newLocal() {
    state.g = B.fresh(); state.over = false; state.thinking = false; state.die = 0;
    setChip('ready', state.mode === 'cpu' ? 'Ready' : 'Two players');
    $('setup').hidden = true; $('friend').hidden = true; $('game').hidden = false;
    paintLocal();
    saveLocal();
    maybeCpu();
  }

  $('board').addEventListener('click', function (e) { playHit(hit(this, e)); });
  $('startBtn').onclick = function () { newLocal(); };
  $('newBtn').onclick = function () {
    $('game').hidden = true; $('setup').hidden = false; setChip('ready', 'Ready');
  };
  $('rollBtn').onclick = function () {
    if (!isHumanTurn() || !state.g || !B.canRoll(state.g)) return;
    B.roll(state.g); state.die = 0; afterHuman(); maybeCpu();
  };
  $('undoBtn').onclick = function () {
    if (!isHumanTurn() || !state.g) return;
    B.undo(state.g); state.die = 0; afterHuman();
  };
  $('confirmBtn').onclick = function () {
    if (!isHumanTurn() || !state.g || !B.canConfirm(state.g)) return;
    B.confirm(state.g);
    if (state.g.isOver) state.over = true;
    state.die = 0;
    afterHuman();
    maybeCpu();
  };
  window.addEventListener('resize', function () {
    if (!$('game').hidden) paintLocal();
    if (!$('friend').hidden) mpRender(true);
  });

  // ---- multiplayer ----
  var PRES_TTL = 9000, HB_MS = 3000, END_HOLD = 4000;
  var mpDb = null;
  try { if (window.gifos) mpDb = gifos.db('room'); } catch (e) {}
  var mp = { on: false, id: null, name: 'You', row: null, board: null, people: [], hb: 0, sub: false, die: 0 };
  var _items = [];
  var _mpSeqPaint = -1;

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
  function gameOf(b) {
    return B.restore(b && b.snap);
  }
  function packBoard(hostId, seats, names, game, extra) {
    extra = extra || {};
    return {
      id: 'board', host: hostId, seats: seats, names: names || {},
      snap: B.snapshot(game), seq: extra.seq || 0,
      turn: B.colorName(game.turnPlayer.currentPieceType),
      winner: game.isOver ? B.colorName(game.winner) : null,
      result: extra.result || '', last: extra.last || null,
      startedAt: extra.startedAt || nowMs(), endedAt: extra.endedAt || 0
    };
  }
  function freshBoard(hostId) {
    return packBoard(hostId, { white: null, black: null }, {}, B.fresh(), { seq: 0 });
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
      mp.id = me.id; mp.name = me.name || 'You'; mp.on = true; mp.row = null; mp.die = 0;
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

  function mpReconcile(Brow, people) {
    var b = JSON.parse(JSON.stringify(Brow));
    var ch = false;
    var ids = {};
    var game = gameOf(b);
    people.forEach(function (p) {
      ids[p.id] = p;
      if (b.names[p.id] !== p.name) { b.names[p.id] = p.name; ch = true; }
    });
    ['white', 'black'].forEach(function (s) {
      if (b.seats[s] && !ids[b.seats[s]]) { b.seats[s] = null; ch = true; }
    });
    if ((!b.seats.white || !b.seats.black) && (game.turnNumber > 1 || (game.turnDice && (game.turnDice.movesPlayed || []).length)) && !game.isOver) {
      game.isOver = true;
      game.winner = b.seats.white ? B.WHITE : (b.seats.black ? B.BLACK : B.WHITE);
      b.winner = B.colorName(game.winner);
      b.result = 'Opponent left';
      b.endedAt = nowMs();
      b.snap = B.snapshot(game);
      ch = true;
    }
    var seated = {};
    seated[b.seats.white] = 1; seated[b.seats.black] = 1;
    var queue = people.map(function (p) { return p.id; }).filter(function (id) { return !seated[id]; });
    queue.sort();
    if (!b.seats.white && queue.length) { b.seats.white = queue.shift(); ch = true; }
    if (!b.seats.black && queue.length) { b.seats.black = queue.shift(); ch = true; }
    if (b.winner && b.endedAt && nowMs() - b.endedAt > END_HOLD) {
      game = B.fresh();
      b.snap = B.snapshot(game);
      b.turn = 'white'; b.winner = null; b.result = ''; b.last = null;
      b.seq = (b.seq || 0) + 1; b.endedAt = 0; b.startedAt = nowMs();
      ch = true;
    }
    people.forEach(function (p) {
      var intent = p.intent;
      if (!intent || intent.seq !== b.seq) return;
      var seat = b.seats.white === p.id ? 'white' : (b.seats.black === p.id ? 'black' : null);
      if (!seat || game.isOver) return;
      var turnName = B.colorName(game.turnPlayer.currentPieceType);
      if (intent.kind === 'roll') {
        if (turnName !== seat || game.turnDice) return;
        B.roll(game);
        b.last = { kind: 'roll' };
        b.seq = (b.seq || 0) + 1;
        b.snap = B.snapshot(game);
        b.turn = B.colorName(game.turnPlayer.currentPieceType);
        ch = true;
      } else if (intent.kind === 'move') {
        if (turnName !== seat || !game.turnDice) return;
        if (typeof intent.pieceId !== 'number' || typeof intent.steps !== 'number') return;
        if (!B.tryMove(game, intent.pieceId, intent.steps)) return;
        b.last = { kind: 'move', pieceId: intent.pieceId, steps: intent.steps };
        b.seq = (b.seq || 0) + 1;
        b.snap = B.snapshot(game);
        ch = true;
      } else if (intent.kind === 'confirm') {
        if (turnName !== seat || !B.canConfirm(game)) return;
        B.confirm(game);
        if (game.isOver) {
          b.winner = B.colorName(game.winner);
          b.result = 'All fifteen off';
          b.endedAt = nowMs();
        }
        b.last = { kind: 'confirm' };
        b.seq = (b.seq || 0) + 1;
        b.snap = B.snapshot(game);
        b.turn = B.colorName(game.turnPlayer.currentPieceType);
        ch = true;
      } else if (intent.kind === 'undo') {
        if (turnName !== seat || !B.canUndo(game)) return;
        B.undo(game);
        b.last = { kind: 'undo' };
        b.seq = (b.seq || 0) + 1;
        b.snap = B.snapshot(game);
        ch = true;
      } else if (intent.kind === 'resign') {
        game.isOver = true;
        game.winner = seat === 'white' ? B.BLACK : B.WHITE;
        b.winner = B.colorName(game.winner);
        b.result = 'Resigned';
        b.endedAt = nowMs();
        b.seq = (b.seq || 0) + 1;
        b.snap = B.snapshot(game);
        ch = true;
      }
    });
    if (b.host !== mp.id) { b.host = mp.id; ch = true; }
    return ch ? b : null;
  }

  function mpIntent(intent) {
    var b = mp.board;
    if (!b) return;
    intent.seq = b.seq;
    putMe({ intent: intent });
  }
  function mpMyTurn() {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner) return false;
    var g = gameOf(b);
    return B.colorName(g.turnPlayer.currentPieceType) === seat;
  }
  $('fRoll').onclick = function () {
    if (!mpMyTurn()) return;
    var g = gameOf(mp.board);
    if (!B.canRoll(g)) return;
    mpIntent({ kind: 'roll' });
  };
  $('fUndo').onclick = function () {
    if (!mpMyTurn()) return;
    mpIntent({ kind: 'undo' });
  };
  $('fConfirm').onclick = function () {
    if (!mpMyTurn()) return;
    mpIntent({ kind: 'confirm' });
  };
  $('fResign').onclick = function () {
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner) return;
    mpIntent({ kind: 'resign' });
  };
  $('fBoard').addEventListener('click', function (e) {
    var b = mp.board, h, g, piece, steps;
    if (!mpMyTurn()) return;
    g = gameOf(b);
    h = hit(this, e);
    if (B.canRoll(g)) { mpIntent({ kind: 'roll' }); return; }
    steps = selectedSteps(g, mp.die);
    if (!steps || !h) return;
    piece = pieceFromHit(g, h);
    if (!piece || piece.type !== g.turnPlayer.currentPieceType) {
      mp.die = (mp.die + 1) % Math.max(1, (g.turnDice.movesLeft || []).length);
      mpRender(true);
      return;
    }
    if (!B.tryMove(B.restore(b.snap), piece.id, steps)) {
      mp.die = (mp.die + 1) % Math.max(1, (g.turnDice.movesLeft || []).length);
      mpRender(true);
      return;
    }
    mp.die = 0;
    mpIntent({ kind: 'move', pieceId: piece.id, steps: steps });
  });

  function mpRender(snap) {
    if (!mp.on) return;
    var b = mp.board, status = $('fStatus');
    if (!b) { $('fSeats').innerHTML = ''; status.textContent = 'Setting up the board…'; return; }
    var g = gameOf(b);
    var seat = mySeat(b);
    var nameOf = function (id) { return id ? esc(b.names[id] || 'Player') : '<span class="open">open</span>'; };
    $('fSeats').innerHTML =
      '<div class="seat' + (seat === 'white' ? ' me' : '') + (b.turn === 'white' && !b.winner ? ' turn' : '') + '">White · ' + nameOf(b.seats.white) + '</div>' +
      '<div class="seat' + (seat === 'black' ? ' me' : '') + (b.turn === 'black' && !b.winner ? ' turn' : '') + '">Black · ' + nameOf(b.seats.black) + '</div>';
    var waiting = mp.people.filter(function (p) { return p.id !== b.seats.white && p.id !== b.seats.black; });
    $('fQueue').textContent = waiting.length ? ('Watching: ' + waiting.map(function (p) { return p.name || 'Player'; }).join(', ')) : '';
    setScore($('fScore'), g);
    var both = b.seats.white && b.seats.black;
    var mine = mpMyTurn();
    $('fRoll').disabled = !(mine && B.canRoll(g));
    $('fUndo').disabled = !(mine && B.canUndo(g));
    $('fConfirm').disabled = !(mine && B.canConfirm(g));
    if (!both) {
      status.innerHTML = 'Waiting for another player… press <b>Invite</b> (top bar) to bring a friend.';
    } else if (b.winner) {
      var wname = nameOf(b.winner === 'white' ? b.seats.white : b.seats.black);
      status.innerHTML = (esc(b.result || 'All fifteen off') + ' — ') + wname + ' wins. Next game starting…';
    } else if (!seat) {
      status.textContent = 'Spectating.';
    } else if (mine) {
      if (B.canRoll(g)) status.textContent = 'Your turn. Roll.';
      else if (B.canConfirm(g)) status.textContent = 'No more moves. Confirm the turn.';
      else status.textContent = 'Your turn. Tap a point to move with the highlighted die.';
    } else {
      status.textContent = 'Waiting for ' + b.turn + '…';
    }
    paint($('fBoard'), g, { die: mp.die });
    _mpSeqPaint = b.seq || 0;
    $('fResign').hidden = !(seat && g.turnNumber > 1 && !b.winner);
  }

  if (window.gifos && gifos.onBack) gifos.onBack(function () {
    if (!$('friend').hidden) mpLeave();
    else if (!$('game').hidden) { $('game').hidden = true; $('setup').hidden = false; setChip('ready', 'Ready'); }
  });

  setChip('ready', 'Ready');
  if (db) {
    db.get('game').then(function (row) {
      if (!row || !row.snap || row.over) return;
      state.mode = row.mode || 'cpu';
      state.color = row.color || 'white';
      state.g = B.restore(row.snap);
      state.over = !!state.g.isOver;
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
      paintLocal();
      maybeCpu();
    }).catch(function () {});
  }
})();
