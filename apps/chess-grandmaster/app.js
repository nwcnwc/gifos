// Chess Grandmaster — play a full-strength Stockfish (NNUE) that runs entirely
// on your device, offline, inside the GifOS sandbox. Pick a level from club
// player to full engine, and watch the live win/draw/loss read as it thinks.
(function () {
  const C = window.GM.Chess;
  const GLYPH = { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' };

  // Strength ladder. Below top, we cap Stockfish's calibrated Elo; the top rung
  // is the unshackled engine — objectively stronger than any human alive.
  const LEVELS = [
    { name: 'Beginner', elo: 1320, note: 'Just learning — blunders like a new player.' },
    { name: 'Casual', elo: 1500, note: 'Knows the pieces, misses tactics.' },
    { name: 'Club player', elo: 1750, note: 'Solid amateur. Punishes loose moves.' },
    { name: 'Strong club', elo: 2000, note: 'Sharp tactics, real endgame technique.' },
    { name: 'Expert', elo: 2250, note: 'Very few free gifts. Bring a plan.' },
    { name: 'Master', elo: 2500, note: 'Master strength. Precise and unforgiving.' },
    { name: 'Grandmaster', elo: 2850, note: 'GM level. You will need to be perfect.' },
    { name: 'Stockfish (full)', elo: null, skill: 20, note: 'The engine at full strength. Unbeatable.' },
  ];

  const $ = (id) => document.getElementById(id);
  const board = $('board'), statusLine = $('statusLine');
  const engineChip = $('engineChip'), engineState = $('engineState');

  const state = {
    s: null, hist: [], uci: [],
    playerColor: 'w', orient: 'w', levelIx: 3, movetime: 800,
    coach: true, recorded: false, startedAt: 0,
    over: false, result: '', lastMove: null, sel: null, legalFromSel: [],
    hint: null, thinking: false, token: 0,
    evalWhite: 0, mate: null, wdlWhite: null, pv: [],
  };
  let review = null; // an independent replay session: { game, hist, ix, orient }
  const nowMs = () => (window.Date ? Date.now() : 0);
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  const engine = new window.GM.Engine();
  let db = null; try { db = window.gifos ? gifos.db('chess-gm') : null; } catch (e) {}

  // ---- boot the engine ----
  (function populateLevels() {
    LEVELS.forEach((l, i) => { const o = document.createElement('option'); o.value = i; o.textContent = l.name + (l.elo ? ' · ~' + l.elo : ' · max'); $('levelSel').appendChild(o); });
    $('levelSel').value = state.levelIx;
    $('lvlNote').textContent = LEVELS[state.levelIx].note;
  })();
  $('levelSel').onchange = function () { state.levelIx = +this.value; $('lvlNote').textContent = LEVELS[state.levelIx].note; };
  $('timeSel').onchange = function () { state.movetime = +this.value; };
  $('sideSeg').addEventListener('click', function (e) {
    const b = e.target.closest('button'); if (!b) return;
    Array.from(this.children).forEach((c) => c.classList.remove('on')); b.classList.add('on');
    state.playerColor = b.dataset.side;
  });

  engine.start().then(function () {
    setChip('ready', 'Stockfish ready');
    $('startBtn').disabled = false; $('startBtn').textContent = 'Start game';
    // Resume a saved game if one exists.
    if (db) db.get('game').then(function (g) { if (g && g.uci) resume(g); }).catch(function () {});
  }).catch(function (err) {
    setChip('', 'Engine failed'); $('startBtn').textContent = 'Engine unavailable';
    statusLine.textContent = 'Could not start the engine: ' + (err && err.message || err);
  });

  function setChip(cls, text) { engineChip.className = 'engine-chip' + (cls ? ' ' + cls : ''); engineState.textContent = text; }

  // ---- start / resume ----
  $('startBtn').onclick = function () { newGame(); };
  $('newBtn').onclick = function () { $('game').hidden = true; $('setup').hidden = false; };
  $('resignBtn').onclick = function () { if (state.over) return; endGame('You resigned. ' + (state.playerColor === 'w' ? 'Black' : 'White') + ' wins.', 'warn', 'loss'); };
  $('undoBtn').onclick = takeBack;
  $('hintBtn').onclick = showHint;
  $('coachChk').onchange = function () { state.coach = this.checked; };
  $('coachBtn').onclick = function () { state.coach = !state.coach; $('coachChk').checked = state.coach; applyCoach(); };
  $('historyBtn').onclick = openHistory;

  // Show/hide all the coaching surfaces (eval bar, W/D/L, best line, Hint).
  function applyCoach() {
    const on = state.coach;
    $('evalWrap').hidden = !on;
    $('wdl').hidden = !on;
    $('bestLine').style.display = on ? '' : 'none';
    $('hintBtn').style.display = on ? '' : 'none';
    $('coachBtn').textContent = on ? '👁 Coaching: on' : '👁 Coaching: off';
    if (on) { if (!state.over && state.s && state.s.turn === state.playerColor) evalNow(); }
    else { state.hint = null; renderBoard(); }
  }

  function newGame() {
    let pc = state.playerColor; if (pc === 'r') pc = Math.random() < 0.5 ? 'w' : 'b';
    state.playerColor = pc; state.orient = pc;
    state.coach = $('coachChk').checked;
    state.s = C.fresh(); state.hist = [state.s]; state.uci = [];
    state.over = false; state.recorded = false; state.result = ''; state.lastMove = null; state.sel = null;
    state.hint = null; state.evalWhite = 0; state.mate = null; state.wdlWhite = null; state.pv = [];
    state.startedAt = nowMs(); state.token++;
    $('setup').hidden = true; $('history').hidden = true; $('review').hidden = true; $('game').hidden = false;
    engine.newGame();
    engine.configure(LEVELS[state.levelIx].elo != null ? { elo: LEVELS[state.levelIx].elo } : { skill: LEVELS[state.levelIx].skill });
    render(); applyCoach(); save();
    if (state.s.turn !== state.playerColor) engineMove(); else evalNow();
  }

  function resume(g) {
    try {
      state.playerColor = g.playerColor || 'w'; state.orient = state.playerColor;
      state.levelIx = g.levelIx != null ? g.levelIx : state.levelIx; state.movetime = g.movetime || state.movetime;
      $('levelSel').value = state.levelIx; $('lvlNote').textContent = LEVELS[state.levelIx].note; $('timeSel').value = state.movetime;
      let s = C.fresh(); const hist = [s];
      for (const u of g.uci) { const mv = C.uciToMove(s, u); if (!mv) break; s = C.make(s, mv); hist.push(s); }
      state.s = s; state.hist = hist; state.uci = g.uci.slice(); state.over = !!g.over; state.result = g.result || '';
      state.recorded = !!g.over; state.startedAt = g.startedAt || nowMs();
      state.lastMove = lastMoveFromUci(state.uci[state.uci.length - 1]);
      state.token++;
      engine.newGame();
      engine.configure(LEVELS[state.levelIx].elo != null ? { elo: LEVELS[state.levelIx].elo } : { skill: LEVELS[state.levelIx].skill });
      $('setup').hidden = true; $('game').hidden = false;
      render(); applyCoach();
      if (!state.over) { if (state.s.turn !== state.playerColor) engineMove(); else evalNow(); }
      statusLine.textContent = state.over ? state.result : (state.s.turn === state.playerColor ? 'Your move.' : 'Stockfish is thinking…');
    } catch (e) {}
  }

  function lastMoveFromUci(u) { if (!u) return null; const f = 'abcdefgh'.indexOf(u[0]), fy = 8 - +u[1], t = 'abcdefgh'.indexOf(u[2]), ty = 8 - +u[3]; return { from: [f, fy], to: [t, ty] }; }

  // ---- the engine's move ----
  function engineMove() {
    if (state.over) return;
    const tok = state.token; setThinking(true);
    engine.search(C.toFEN(state.s), { movetime: state.movetime }, function (info) {
      if (tok === state.token) { applyEval(info, state.s.turn); renderEvalOnly(); }
    }).then(function (r) {
      if (tok !== state.token) return;
      applyEval(r, state.s.turn);
      const mv = r.bestmove && C.uciToMove(state.s, r.bestmove);
      setThinking(false);
      if (!mv) { checkEnd(); return; }
      pushMove(mv); render(); save();
      if (!checkEnd()) evalNow();
    }).catch(function () { if (tok === state.token) setThinking(false); });
  }

  // A short, non-committal search while it's the human's turn: keeps the eval
  // bar and probabilities live. It does NOT populate the on-board hint — a hint
  // only ever appears when the player presses Hint. Skipped entirely when
  // coaching is off (no eval, no probabilities, no wasted search).
  function evalNow() {
    if (!state.coach || state.over || state.s.turn !== state.playerColor) return;
    const tok = state.token;
    engine.search(C.toFEN(state.s), { movetime: Math.min(500, state.movetime) }, function (info) {
      if (tok === state.token) { applyEval(info, state.s.turn); renderEvalOnly(); }
    }).then(function (r) {
      if (tok !== state.token) return;
      applyEval(r, state.s.turn);
      renderEvalOnly();
    }).catch(function () {});
  }

  // Convert a search result (side-to-move relative) to White's perspective.
  function applyEval(info, sideToMove) {
    const sgn = sideToMove === 'w' ? 1 : -1;
    if (info.mate != null) { state.mate = sgn * info.mate; state.evalWhite = sgn * (info.mate > 0 ? 100 : -100); }
    else if (info.score != null) { state.mate = null; state.evalWhite = sgn * info.score / 100; }
    if (info.wdl) state.wdlWhite = sideToMove === 'w' ? info.wdl : [info.wdl[2], info.wdl[1], info.wdl[0]];
    if (info.pv && info.pv.length) state.pv = info.pv.slice(0, 6);
  }

  // ---- moves ----
  function pushMove(mv) {
    state.s = C.make(state.s, mv); state.hist.push(state.s); state.uci.push(C.moveToUci(mv));
    state.lastMove = { from: mv.from, to: mv.to }; state.sel = null; state.hint = null;
  }

  function takeBack() {
    if (state.thinking || state.over) return;
    // remove the engine's reply + your move, so it's your turn again
    let removed = 0;
    while (state.uci.length && removed < 2) {
      state.uci.pop(); state.hist.pop(); removed++;
      if (state.hist[state.hist.length - 1] && state.hist[state.hist.length - 1].turn === state.playerColor) break;
    }
    state.s = state.hist[state.hist.length - 1] || C.fresh();
    state.over = false; state.result = ''; state.sel = null; state.hint = null;
    state.lastMove = lastMoveFromUci(state.uci[state.uci.length - 1]);
    state.token++;
    render(); save(); evalNow();
  }

  function checkEnd() {
    const st = C.status(state.s);
    if (st === 'checkmate') { const winner = state.s.turn === 'w' ? 'Black' : 'White'; const won = isPlayerWinner(winner); endGame('Checkmate — ' + winner + ' wins.', won ? 'good' : 'warn', won ? 'win' : 'loss'); return true; }
    if (st === 'stalemate') { endGame('Stalemate — it’s a draw.', '', 'draw'); return true; }
    if (state.s.half >= 100) { endGame('Draw by the fifty-move rule.', '', 'draw'); return true; }
    return false;
  }
  function isPlayerWinner(winner) { return (winner === 'White') === (state.playerColor === 'w'); }

  function endGame(msg, cls, code) {
    state.over = true; state.result = msg; state.token++; setThinking(false);
    statusLine.className = 'statusline' + (cls ? ' ' + cls : ''); statusLine.textContent = msg;
    recordGame(code || 'draw');
    render(); save();
  }

  // ---- game history (each finished game saved as its own db record) ----
  function recordGame(code) {
    if (!db || state.recorded || !state.uci.length) return;
    state.recorded = true;
    const lvl = LEVELS[state.levelIx];
    db.put({
      id: 'game_' + nowMs() + '_' + Math.random().toString(36).slice(2, 6),
      kind: 'history', when: state.startedAt || nowMs(),
      opponent: 'Stockfish · ' + lvl.name, mode: 'solo',
      playerColor: state.playerColor, levelIx: state.levelIx,
      result: code, resultText: state.result, moves: state.uci.slice(),
    }).catch(function () {});
  }

  function setThinking(on) {
    state.thinking = on;
    if (on) { setChip('thinking', 'Stockfish is thinking…'); }
    else if (engineChip.className.indexOf('thinking') > -1 || engineState.textContent.indexOf('thinking') > -1) setChip('ready', 'Stockfish ready');
    $('hintBtn').disabled = on; $('undoBtn').disabled = on;
    if (!state.over) statusLine.className = 'statusline';
    if (!state.over) statusLine.textContent = on ? 'Stockfish is thinking…' : (state.s && state.s.turn === state.playerColor ? (C.inCheck(state.s, state.playerColor === 'w') ? 'You’re in check.' : 'Your move.') : '');
  }

  // ---- board rendering ----
  function bxy(r, c) { return state.orient === 'w' ? [c, r] : [7 - c, 7 - r]; }

  function render() { renderBoard(); renderEvalOnly(); renderMoves(); }

  function renderBoard() {
    board.innerHTML = '';
    const s = state.s; if (!s) return;
    const chkKing = (C.status(s) === 'check' || C.status(s) === 'checkmate') ? kingSq(s.board, s.turn === 'w') : null;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const [x, y] = bxy(r, c); const sq = document.createElement('div');
      sq.className = 'sq ' + (((x + y) % 2) ? 'd' : 'l');
      const p = s.board[y * 8 + x];
      if (p !== '.') { sq.textContent = GLYPH[p.toLowerCase()]; sq.classList.add(p >= 'A' && p <= 'Z' ? 'pw' : 'pb'); }
      if (state.lastMove && ((state.lastMove.from[0] === x && state.lastMove.from[1] === y) || (state.lastMove.to[0] === x && state.lastMove.to[1] === y))) sq.classList.add('last');
      if (state.sel && state.sel[0] === x && state.sel[1] === y) sq.classList.add('sel');
      if (state.legalFromSel.some((m) => m.to[0] === x && m.to[1] === y)) { const d = document.createElement('span'); d.className = (p !== '.') ? 'ring' : 'dotm'; sq.appendChild(d); }
      if (state.hint && ((state.hint.from[0] === x && state.hint.from[1] === y))) sq.classList.add('hintf');
      if (state.hint && ((state.hint.to[0] === x && state.hint.to[1] === y))) sq.classList.add('hintt');
      if (chkKing && chkKing[0] === x && chkKing[1] === y) sq.classList.add('chk');
      // edge coordinates
      if (c === 0) { const rc = document.createElement('span'); rc.className = 'coord r'; rc.textContent = 8 - y; sq.appendChild(rc); }
      if (r === 7) { const fc = document.createElement('span'); fc.className = 'coord f'; fc.textContent = 'abcdefgh'[x]; sq.appendChild(fc); }
      sq.onclick = (function (cx, cy) { return function () { onSquare(cx, cy); }; })(x, y);
      board.appendChild(sq);
    }
  }
  function kingSq(bd, w) { const i = bd.indexOf(w ? 'K' : 'k'); return i < 0 ? null : [i % 8, (i / 8) | 0]; }

  function renderEvalOnly() {
    // eval bar: map White-relative eval to a 0..100 split with a soft sigmoid
    let wPct, dPct, bPct;
    if (state.wdlWhite) { const t = state.wdlWhite[0] + state.wdlWhite[1] + state.wdlWhite[2] || 1; wPct = state.wdlWhite[0] / t * 100; dPct = state.wdlWhite[1] / t * 100; bPct = state.wdlWhite[2] / t * 100; }
    else { const adv = 1 / (1 + Math.exp(-state.evalWhite / 2.5)); wPct = adv * 100; dPct = 0; bPct = 100 - wPct; }
    const bar = $('evalBar'); bar.querySelector('.w').style.width = wPct + '%'; bar.querySelector('.d').style.width = dPct + '%'; bar.querySelector('.b').style.width = bPct + '%';
    $('evalNum').textContent = state.mate != null ? ('M' + Math.abs(state.mate)) : (state.evalWhite >= 0 ? '+' : '') + state.evalWhite.toFixed(1);
    $('pw').textContent = state.wdlWhite ? Math.round(state.wdlWhite[0] / 10) + '%' : '–';
    $('pd').textContent = state.wdlWhite ? Math.round(state.wdlWhite[1] / 10) + '%' : '–';
    $('pb').textContent = state.wdlWhite ? Math.round(state.wdlWhite[2] / 10) + '%' : '–';
    $('bestLine').textContent = state.pv.length ? 'Best line: ' + state.pv.join(' ') : '';
  }

  function renderMoves() {
    const el = $('moveList'); el.innerHTML = '';
    for (let i = 0; i < state.uci.length; i += 2) {
      const n = document.createElement('span'); n.className = 'n'; n.textContent = (i / 2 + 1) + '.'; el.appendChild(n);
      const w = document.createElement('span'); w.className = 'mv'; w.textContent = state.uci[i]; el.appendChild(w);
      if (state.uci[i + 1]) { const b = document.createElement('span'); b.className = 'mv'; b.textContent = state.uci[i + 1]; el.appendChild(b); }
    }
    el.scrollTop = el.scrollHeight;
  }

  // ---- interaction ----
  function onSquare(x, y) {
    if (state.over || state.thinking) return;
    if (state.s.turn !== state.playerColor) return;
    const legal = C.legal(state.s);
    if (state.sel) {
      const opts = legal.filter((m) => m.from[0] === state.sel[0] && m.from[1] === state.sel[1] && m.to[0] === x && m.to[1] === y);
      if (opts.length) { chooseAndPlay(opts); return; }
      state.sel = null; state.legalFromSel = [];
    }
    const p = state.s.board[y * 8 + x];
    if (p !== '.' && ((state.playerColor === 'w') === (p >= 'A' && p <= 'Z'))) {
      state.sel = [x, y]; state.legalFromSel = legal.filter((m) => m.from[0] === x && m.from[1] === y);
    } else { state.sel = null; state.legalFromSel = []; }
    renderBoard();
  }

  function chooseAndPlay(opts) {
    if (opts.length === 1) { play(opts[0]); return; }
    // promotion: several moves share from/to, differ by promo piece
    const box = $('promoChoices'); box.innerHTML = '';
    ['q', 'r', 'b', 'n'].forEach(function (pr) {
      const mv = opts.find((m) => m.promo === pr); if (!mv) return;
      const b = document.createElement('button'); b.textContent = GLYPH[pr];
      b.className = state.playerColor === 'w' ? 'pw' : 'pb';
      b.onclick = function () { $('promo').hidden = true; play(mv); };
      box.appendChild(b);
    });
    $('promo').hidden = false;
  }

  function play(mv) {
    state.legalFromSel = []; pushMove(mv); render(); save();
    if (!checkEnd()) engineMove();
  }

  function showHint() {
    if (state.over || state.thinking || state.s.turn !== state.playerColor) return;
    if (state.hint) { renderBoard(); return; }
    const tok = state.token; $('hintBtn').disabled = true; statusLine.textContent = 'Looking for your best move…';
    engine.search(C.toFEN(state.s), { movetime: Math.max(600, state.movetime) }, null).then(function (r) {
      if (tok !== state.token) return;
      applyEval(r, state.s.turn);
      state.hint = r.bestmove ? lastMoveFromUci(r.bestmove) : null;
      $('hintBtn').disabled = false; statusLine.textContent = 'Your move.'; render();
    }).catch(function () { $('hintBtn').disabled = false; });
  }

  // ---- persistence ----
  function save() {
    if (!db) return;
    db.put({ id: 'game', uci: state.uci, playerColor: state.playerColor, levelIx: state.levelIx, movetime: state.movetime, over: state.over, result: state.result }).catch(function () {});
  }

  // ---- history list ----
  const RESULT = { win: ['Win', 'win'], loss: ['Loss', 'loss'], draw: ['Draw', 'draw'] };
  function fmtDate(ts) { try { const d = new Date(ts); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }

  function openHistory() {
    $('setup').hidden = true; $('game').hidden = true; $('review').hidden = true; $('history').hidden = false;
    const el = $('histList'); el.innerHTML = '<p class="lvlnote">Loading…</p>';
    if (!db) { el.innerHTML = '<p class="lvlnote">No storage available.</p>'; return; }
    db.getAll().then(function (items) {
      const games = (items || []).filter(function (x) { return x && x.kind === 'history'; }).sort(function (a, b) { return b.when - a.when; });
      if (!games.length) { el.innerHTML = '<p class="lvlnote">No games yet. Finish a game and it lands here — then you can replay it move by move.</p>'; return; }
      el.innerHTML = '';
      games.forEach(function (g) {
        const meta = RESULT[g.result] || ['Done', ''];
        const row = document.createElement('div'); row.className = 'hrow';
        const info = document.createElement('div'); info.className = 'hinfo';
        info.innerHTML = '<div class="hopp"><span class="badge ' + meta[1] + '">' + meta[0] + '</span> ' + esc(g.opponent) + '</div>' +
          '<div class="hmeta">' + (g.playerColor === 'w' ? '♔ White' : '♚ Black') + ' · ' + Math.ceil(g.moves.length / 2) + ' moves · ' + fmtDate(g.when) + '</div>';
        info.onclick = function () { openReview(g); };
        const del = document.createElement('button'); del.className = 'hdel'; del.textContent = '✕'; del.title = 'Delete this game';
        del.onclick = function (ev) { ev.stopPropagation(); db.delete(g.id).then(openHistory).catch(openHistory); };
        row.appendChild(info); row.appendChild(del); el.appendChild(row);
      });
    }).catch(function () { el.innerHTML = '<p class="lvlnote">Could not load history.</p>'; });
  }
  $('histBack').onclick = function () { $('history').hidden = true; $('setup').hidden = false; };

  // ---- replay / review a finished game ----
  function drawStatic(container, s, orient, lastMove) {
    container.innerHTML = '';
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const x = orient === 'w' ? c : 7 - c, y = orient === 'w' ? r : 7 - r;
      const sq = document.createElement('div'); sq.className = 'sq ' + (((x + y) % 2) ? 'd' : 'l');
      const p = s.board[y * 8 + x];
      if (p !== '.') { sq.textContent = GLYPH[p.toLowerCase()]; sq.classList.add(p >= 'A' && p <= 'Z' ? 'pw' : 'pb'); }
      if (lastMove && ((lastMove.from[0] === x && lastMove.from[1] === y) || (lastMove.to[0] === x && lastMove.to[1] === y))) sq.classList.add('last');
      if (c === 0) { const rc = document.createElement('span'); rc.className = 'coord r'; rc.textContent = 8 - y; sq.appendChild(rc); }
      if (r === 7) { const fc = document.createElement('span'); fc.className = 'coord f'; fc.textContent = 'abcdefgh'[x]; sq.appendChild(fc); }
      container.appendChild(sq);
    }
  }

  function openReview(g) {
    const hist = [C.fresh()]; let s = hist[0];
    for (const u of g.moves) { const mv = C.uciToMove(s, u); if (!mv) break; s = C.make(s, mv); hist.push(s); }
    review = { game: g, hist: hist, ix: hist.length - 1, orient: g.playerColor || 'w' };
    $('history').hidden = true; $('setup').hidden = true; $('game').hidden = true; $('review').hidden = false;
    const meta = RESULT[g.result] || ['Done', ''];
    $('revTitle').innerHTML = '<span class="badge ' + meta[1] + '">' + meta[0] + '</span> vs ' + esc(g.opponent);
    renderReview();
  }

  function renderReview() {
    if (!review) return;
    const s = review.hist[review.ix];
    const lm = review.ix > 0 ? lastMoveFromUci(review.game.moves[review.ix - 1]) : null;
    drawStatic($('revBoard'), s, review.orient, lm);
    $('revCount').textContent = review.ix + ' / ' + (review.hist.length - 1);
    const el = $('revMoves'); el.innerHTML = ''; const mv = review.game.moves;
    for (let i = 0; i < mv.length; i += 2) {
      const n = document.createElement('span'); n.className = 'n'; n.textContent = (i / 2 + 1) + '.'; el.appendChild(n);
      [i, i + 1].forEach(function (j) {
        if (mv[j] === undefined) return;
        const w = document.createElement('span'); w.className = 'mv' + (j === review.ix - 1 ? ' cur' : ''); w.textContent = mv[j];
        w.onclick = function () { review.ix = j + 1; renderReview(); };
        el.appendChild(w);
      });
    }
    const cur = el.querySelector('.mv.cur'); if (cur) cur.scrollIntoView({ block: 'nearest' });
  }
  function revGo(ix) { if (!review) return; review.ix = Math.max(0, Math.min(review.hist.length - 1, ix)); renderReview(); }
  $('revFirst').onclick = function () { revGo(0); };
  $('revPrev').onclick = function () { revGo(review.ix - 1); };
  $('revNext').onclick = function () { revGo(review.ix + 1); };
  $('revLast').onclick = function () { revGo(review.hist.length - 1); };
  $('revBack').onclick = function () { $('review').hidden = true; openHistory(); };

  if (window.gifos && gifos.onBack) gifos.onBack(function () {
    if (!$('review').hidden) { $('review').hidden = true; openHistory(); }
    else if (!$('history').hidden) { $('history').hidden = true; $('setup').hidden = false; }
    else if (!$('game').hidden) { $('game').hidden = true; $('setup').hidden = false; }
  });
})();
