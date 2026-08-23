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
      return '<svg viewBox="0 0 24 24"><rect ' + a + ' x="8" y="12" width="8" height="9" rx="1"/><path ' + a + ' d="M12 2l7 11H5z"/></svg>';
    }
    if (token === T.TANK_D) {
      return '<svg viewBox="0 0 24 24"><rect ' + a + ' x="8" y="3" width="8" height="9" rx="1"/><path ' + a + ' d="M12 22L5 11h14z"/></svg>';
    }
    if (token === T.TANK_L) {
      return '<svg viewBox="0 0 24 24"><rect ' + a + ' x="12" y="8" width="9" height="8" rx="1"/><path ' + a + ' d="M2 12l11-7v14z"/></svg>';
    }
    if (token === T.TANK_R) {
      return '<svg viewBox="0 0 24 24"><rect ' + a + ' x="3" y="8" width="9" height="8" rx="1"/><path ' + a + ' d="M22 12L11 5v14z"/></svg>';
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

  function legalMaps(s, selToken, selIndex) {
    var place = {}, rot = {}, list, i;
    if (!s || s.winner) return { place: place, rot: rot };
    if (selIndex >= 0) {
      list = T.possibleMovements(s.cells, s.turn, selIndex);
      for (i = 0; i < list.length; i++) place[list[i]] = 1;
    } else if (selToken) {
      list = T.possiblePlacements(s.cells, s.hands[s.turn], s.turn, selToken);
      for (i = 0; i < list.length; i++) place[list[i]] = 1;
      if (T.isTank(selToken)) {
        list = T.possibleRotations(s.cells, s.turn, selToken);
        for (i = 0; i < list.length; i++) rot[list[i]] = 1;
      }
    }
    return { place: place, rot: rot };
  }

  function shooterIndex(s, opts) {
    var i = -1;
    if (opts.fireFrom >= 0) i = opts.fireFrom;
    else if (opts.selected >= 0 && s && s.cells[opts.selected] && T.isTank(s.cells[opts.selected].token)) {
      i = opts.selected;
    } else if (s && s.last) {
      if ((s.last.k === 'place' || s.last.k === 'rotate') && s.last.i >= 0) i = s.last.i;
      else if (s.last.k === 'move' && s.last.d >= 0) i = s.last.d;
    }
    if (i < 0 || !s || !s.cells[i] || !T.isTank(s.cells[i].token)) return -1;
    return i;
  }

  function paint(boardEl, s, opts) {
    opts = opts || {};
    if (!boardEl) return;
    var i, sq, p, cls, maps, fire, k, dest, src, shooter;
    var selected = opts.selected;
    var selToken = opts.selToken;
    maps = opts.hints ? legalMaps(s, selToken, selected) : { place: {}, rot: {} };
    src = shooterIndex(s, opts);
    shooter = src >= 0 ? s.cells[src].player : null;
    fire = {};
    dest = src >= 0 ? T.fireLine(s.cells, src) : [];
    for (k = 0; k < dest.length; k++) fire[dest[k]] = 1;
    boardEl.classList.toggle('coach', !!(opts.coach && s && !s.n && opts.hints && !selToken && !(selected >= 0)));
    for (i = 0; i < T.SIZE; i++) {
      sq = boardEl.children[i];
      if (!sq) continue;
      cls = 'cell';
      if (T.isRedHome(i)) cls += ' home-red';
      else if (T.isBlueHome(i)) cls += ' home-blue';
      else if (T.isRedSpawn(i)) cls += ' spawn-red';
      else if (T.isBlueSpawn(i)) cls += ' spawn-blue';
      if (maps.place[i]) cls += ' hint';
      if (maps.rot[i]) cls += ' turnhint';
      if (selected === i) cls += ' sel';
      if (s && s.last) {
        if ((s.last.k === 'place' || s.last.k === 'rotate') && s.last.i === i) cls += ' last';
        if (s.last.k === 'move' && (s.last.s === i || s.last.d === i)) cls += ' last';
      }
      p = s ? s.cells[i] : null;
      if (fire[i]) {
        cls += ' fire';
        if (src >= 0) {
          var tok = s.cells[src].token;
          cls += (tok === T.TANK_U || tok === T.TANK_D) ? ' fire-v' : ' fire-h';
        }
        if (p && shooter && p.player !== shooter) cls += ' hot';
      }
      sq.className = cls;
      if (!p) { sq.innerHTML = ''; continue; }
      sq.innerHTML = '<div class="piece ' + p.player + '">' + glyph(p.token) + '</div>';
    }
  }

  function tokBtn(player, token, n, label, on, enabled, group) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tok ' + player + (on ? ' on' : '') + (!enabled || n === 0 ? ' dim' : '');
    btn.disabled = !enabled || n === 0;
    btn.setAttribute('data-t', token);
    if (group) btn.setAttribute('data-g', group);
    btn.innerHTML = glyph(token) + '<span class="lab">' + label + '</span><span class="n">' + n + '</span>';
    btn.title = label;
    return btn;
  }

  function paintHand(el, s, player, selToken, enabled) {
    if (!el) return;
    el.innerHTML = '';
    if (!s) return;
    var hand = s.hands[player] || [];
    var tanks = T.tankCount(hand);
    var face = T.isTank(selToken) ? selToken : T.preferFacing(player);
    el.appendChild(tokBtn(player, T.BLOCKER, T.handCount(hand, T.BLOCKER), 'Shield', selToken === T.BLOCKER, enabled, ''));
    el.appendChild(tokBtn(player, face, tanks, 'Tank', T.isTank(selToken), enabled, 'tank'));
    el.appendChild(tokBtn(player, T.INF_O, T.handCount(hand, T.INF_O), 'Infil +', selToken === T.INF_O, enabled, ''));
    el.appendChild(tokBtn(player, T.INF_X, T.handCount(hand, T.INF_X), 'Infil ×', selToken === T.INF_X, enabled, ''));
    el.appendChild(tokBtn(player, T.MINE, T.handCount(hand, T.MINE), 'Mine', selToken === T.MINE, enabled, ''));
    el.classList.toggle('nudge', !!(enabled && !selToken && s.n === 0));
  }

  function paintFaces(el, s, player, selToken, selIndex, enabled) {
    if (!el) return;
    var show = !!(enabled && s && (T.isTank(selToken) || (selIndex >= 0 && s.cells[selIndex] && T.isTank(s.cells[selIndex].token))));
    el.hidden = !show;
    if (!show) { el.innerHTML = ''; return; }
    var cur = T.isTank(selToken) ? selToken : (s.cells[selIndex] ? s.cells[selIndex].token : T.preferFacing(player));
    var faces = [T.TANK_U, T.TANK_R, T.TANK_D, T.TANK_L];
    var words = ['Up', 'Right', 'Down', 'Left'];
    var i, btn;
    el.innerHTML = '';
    for (i = 0; i < faces.length; i++) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'face ' + player + (cur === faces[i] ? ' on' : '');
      btn.setAttribute('data-t', faces[i]);
      btn.innerHTML = glyph(faces[i]) + '<span>' + words[i] + '</span>';
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
    if (T.isTank(e.token)) {
      if (e.kind === 'rotate') return who + ' turned a tank to face ' + T.faceWord(e.token) + '.';
      if (e.kind === 'place') return who + ' placed a tank facing ' + T.faceWord(e.token) + '.';
      return who + ' ' + verb + ' a tank.';
    }
    return who + ' ' + verb + ' a ' + T.shortName(e.token).toLowerCase() + '.';
  }

  function isHumanTurn() {
    if (!state.s || state.over || state.thinking) return false;
    if (state.mode === 'hotseat') return true;
    return state.s.turn === state.color;
  }

  function setTurnBar(el, text, cls) {
    if (!el) return;
    el.className = 'turnbar' + (cls ? ' ' + cls : '');
    el.textContent = text;
  }

  function coachFor(s, mode, color, selToken, selIndex, thinking, over) {
    if (!s) return { bar: 'Ready', barCls: '', line: '', lineCls: '', chip: 'Ready', chipCls: 'ready' };
    var turnName = s.turn === T.RED ? 'Red' : 'Blue';
    var you = mode === 'cpu' && s.turn === color;
    if (s.winner || over) {
      var winYou = mode === 'cpu' && s.winner === color;
      var msg = mode === 'hotseat'
        ? (s.winner === T.RED ? 'Red destroyed the blue base.' : 'Blue destroyed the red base.')
        : (winYou ? 'You destroyed their base.' : 'The computer destroyed your base.');
      return {
        bar: winYou || (mode === 'hotseat' && s.winner) ? (s.winner === T.RED ? 'Red wins' : 'Blue wins') : (winYou ? 'You win' : 'Computer wins'),
        barCls: winYou ? 'good' : 'warn',
        line: msg, lineCls: winYou ? 'good' : 'warn',
        chip: 'Over', chipCls: winYou ? 'ready' : 'thinking'
      };
    }
    if (thinking) {
      return { bar: 'Computer', barCls: 'wait', line: 'Computer is thinking…', lineCls: '', chip: 'Thinking…', chipCls: 'thinking' };
    }
    if (mode === 'cpu' && !you) {
      return { bar: 'Computer to play', barCls: s.turn, line: 'Waiting on the computer.', lineCls: '', chip: 'Computer', chipCls: 'thinking' };
    }
    var bar = mode === 'hotseat' ? (turnName + ' to play') : 'Your turn — ' + turnName;
    if (selIndex >= 0 && s.cells[selIndex]) {
      var p = s.cells[selIndex];
      if (T.isTank(p.token)) {
        return { bar: bar, barCls: s.turn, line: 'Gold: move this tank. Or tap a facing below to turn it — it shoots the way it points.', lineCls: '', chip: bar, chipCls: 'turn' };
      }
      return { bar: bar, barCls: s.turn, line: 'Tap a gold square to move this ' + T.shortName(p.token).toLowerCase() + '.', lineCls: '', chip: bar, chipCls: 'turn' };
    }
    if (selToken) {
      if (T.isTank(selToken)) {
        return { bar: bar, barCls: s.turn, line: 'Gold around your home: place this tank facing ' + T.faceWord(selToken) + '. Cyan: turn a tank already out this way.', lineCls: '', chip: bar, chipCls: 'turn' };
      }
      return { bar: bar, barCls: s.turn, line: 'Tap a gold square around your home to place this ' + T.shortName(selToken).toLowerCase() + '. ' + T.blurb(selToken), lineCls: '', chip: bar, chipCls: 'turn' };
    }
    if (!s.n) {
      return { bar: bar, barCls: s.turn, line: 'Tap a piece below, then a gold square around your home. Destroy the other house to win.', lineCls: '', chip: bar, chipCls: 'turn' };
    }
    return { bar: bar, barCls: s.turn, line: 'Place a piece, move one already out, or turn a tank. One action.', lineCls: '', chip: bar, chipCls: 'turn' };
  }

  function localStatus() {
    if (!state.s) return;
    $('logLine').textContent = lastLog(state.s);
    var c = coachFor(state.s, state.mode, state.color, isHumanTurn() ? state.selToken : null, isHumanTurn() ? state.selIndex : -1, state.thinking, state.over);
    setTurnBar($('turnBar'), c.bar, c.barCls);
    setStatus($('statusLine'), c.line, c.lineCls);
    setChip(c.chipCls, c.chip);
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
    var human = isHumanTurn();
    paint($('board'), state.s, {
      hints: human,
      coach: human,
      selToken: human ? state.selToken : null,
      selected: human ? state.selIndex : -1,
      fireFrom: -1
    });
    paintHand($('hand'), state.s, handPlayer(), human ? state.selToken : null, human);
    paintFaces($('faces'), state.s, handPlayer(), human ? state.selToken : null, human ? state.selIndex : -1, human);
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
      state.selToken = T.isTank(p.token) ? p.token : null;
      afterLocal();
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
    state.selToken = null;
    state.selIndex = -1;
    afterLocal();
  }
  function pickToken(t, group) {
    if (!isHumanTurn()) return;
    if (state.selIndex >= 0 && T.isTank(t) && T.canRotate(state.s.cells, state.s.turn, t, state.selIndex)) {
      playLocal({ k: 'rotate', t: t, i: state.selIndex });
      return;
    }
    if (group === 'tank') {
      if (T.isTank(state.selToken)) {
        state.selToken = null;
      } else {
        state.selToken = T.preferFacing(state.s.turn);
      }
      state.selIndex = -1;
    } else {
      state.selToken = state.selToken === t ? null : t;
      state.selIndex = -1;
    }
    afterLocal();
  }
  function pickFace(t) {
    if (!isHumanTurn()) return;
    if (state.selIndex >= 0 && T.canRotate(state.s.cells, state.s.turn, t, state.selIndex)) {
      playLocal({ k: 'rotate', t: t, i: state.selIndex });
      return;
    }
    state.selToken = t;
    state.selIndex = -1;
    afterLocal();
  }
  $('hand').addEventListener('click', function (e) {
    var b = e.target.closest('[data-t]'); if (!b) return;
    pickToken(b.getAttribute('data-t'), b.getAttribute('data-g') || '');
  });
  $('faces').addEventListener('click', function (e) {
    var b = e.target.closest('[data-t]'); if (!b) return;
    pickFace(b.getAttribute('data-t'));
  });

  function aiMove() {
    if (!state.s || state.over || state.mode !== 'cpu' || state.thinking) return;
    if (state.s.turn === state.color) return;
    state.thinking = true;
    state.selToken = null; state.selIndex = -1;
    localStatus();
    paint($('board'), state.s, { hints: false, coach: false, selected: -1, selToken: null, fireFrom: -1 });
    paintHand($('hand'), state.s, state.color, null, false);
    paintFaces($('faces'), state.s, state.color, null, -1, false);
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
    var mine = mpMyTurn(b, s, seat);
    var turnName = s.turn === T.RED ? 'Red' : 'Blue';
    var coach = coachFor(s, 'hotseat', seat, mine ? mp.selToken : null, mine ? mp.selIndex : -1, false, !!b.winner);
    if (!both) {
      status.innerHTML = 'Waiting for another player… press <b>Invite</b> (top bar) to bring a friend.';
      setTurnBar($('fTurnBar'), 'Waiting for a friend', 'wait');
    } else if (b.winner) {
      var wname = b.winner === 'draw' ? '' : nameOf(b.winner === 'red' ? b.seats.red : b.seats.blue);
      status.innerHTML = b.winner === 'draw'
        ? (esc(b.result || 'Draw') + ' — next game starting…')
        : ((esc(b.result || 'Base destroyed') + ' — ') + wname + ' wins. Next game starting…');
      setTurnBar($('fTurnBar'), coach.bar, coach.barCls);
    } else if (!seat) {
      status.textContent = 'Spectating. ' + turnName + ' to play.';
      setTurnBar($('fTurnBar'), turnName + ' to play', s.turn);
    } else if (b.turn === seat) {
      status.textContent = coach.line;
      setTurnBar($('fTurnBar'), 'Your turn — ' + turnName, seat);
    } else {
      status.textContent = 'Waiting for ' + turnName + '…';
      setTurnBar($('fTurnBar'), 'Waiting for ' + turnName, 'wait');
    }
    paint($('fBoard'), s, {
      hints: mine,
      coach: mine,
      selToken: mine ? mp.selToken : null,
      selected: mine ? mp.selIndex : -1,
      fireFrom: -1
    });
    paintHand($('fHand'), s, seat || s.turn, mine ? mp.selToken : null, mine);
    paintFaces($('fFaces'), s, seat || s.turn, mine ? mp.selToken : null, mine ? mp.selIndex : -1, mine);
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
      mp.selToken = T.isTank(p.token) ? p.token : null;
      mpRender();
      return;
    }
    if (mp.selToken && T.canPlace(s.cells, s.hands[s.turn], s.turn, mp.selToken, i)) {
      mpPlay({ k: 'place', t: mp.selToken, i: i });
      return;
    }
    if (mp.selIndex >= 0 && T.canMove(s.cells, s.turn, mp.selIndex, i)) {
      mpPlay({ k: 'move', s: mp.selIndex, d: i });
      return;
    }
    mp.selToken = null;
    mp.selIndex = -1;
    mpRender();
  });
  $('fHand').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-t]'); if (!btn) return;
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner || b.turn !== seat) return;
    var t = btn.getAttribute('data-t');
    var g = btn.getAttribute('data-g') || '';
    var s = T.replay(b.moves || []);
    if (mp.selIndex >= 0 && T.isTank(t) && T.canRotate(s.cells, s.turn, t, mp.selIndex)) {
      mpPlay({ k: 'rotate', t: t, i: mp.selIndex });
      return;
    }
    if (g === 'tank') {
      mp.selToken = T.isTank(mp.selToken) ? null : T.preferFacing(s.turn);
      mp.selIndex = -1;
    } else {
      mp.selToken = mp.selToken === t ? null : t;
      mp.selIndex = -1;
    }
    mpRender();
  });
  $('fFaces').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-t]'); if (!btn) return;
    var b = mp.board, seat = mySeat(b);
    if (!b || !seat || b.winner || b.turn !== seat) return;
    var t = btn.getAttribute('data-t');
    var s = T.replay(b.moves || []);
    if (mp.selIndex >= 0 && T.canRotate(s.cells, s.turn, t, mp.selIndex)) {
      mpPlay({ k: 'rotate', t: t, i: mp.selIndex });
      return;
    }
    mp.selToken = t;
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
