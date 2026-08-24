// Ludo — four seats. Invite is OS chrome. The file is the save.
// Guests publish presence on join; the host (lowest live id) assigns
// Red, Green, Yellow, Blue so two people never sit the same colour.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var L = window.LUDO;
  var saveDb = null, roomDb = null;
  var PRES_TTL = 9000, HB_MS = 3000;
  var me = { id: 'solo', name: 'You' };
  var mode = 'local';
  var mySeat = 0;
  var game = L.fresh(4);
  var nPlayers = 4;
  var seats = [null, null, null, null];
  var names = {};
  var mpOn = false;
  var seq = 0;
  var hb = 0;
  var subbed = false;
  var people = [];
  var boardRow = null;
  var myRow = null;
  var items = [];

  try {
    if (window.gifos) {
      saveDb = gifos.db('save');
      roomDb = gifos.db('room');
    }
  } catch (e) {}

  function setChip(cls, text) {
    $('chip').className = 'engine-chip' + (cls ? ' ' + cls : '');
    $('chipText').textContent = text;
  }
  function persist() {
    if (!saveDb || mode !== 'local') return;
    saveDb.put({ id: 'save', game: game, n: nPlayers }).catch(function () {});
  }
  function nowMs() { return Date.now(); }
  function isHost(list) {
    list = list || people;
    if (!list.length) return true;
    var m = list[0].id, i;
    for (i = 0; i < list.length; i++) if (list[i].id < m) m = list[i].id;
    return me.id === m;
  }
  function putMe(extra) {
    if (!roomDb || !mpOn || !me.id || me.id === 'solo') return;
    var row = { id: me.id, name: me.name, at: nowMs(), intent: null, seat: mySeat };
    if (myRow && myRow.intent) row.intent = myRow.intent;
    if (extra && extra.intent !== undefined) row.intent = extra.intent;
    myRow = row;
    roomDb.put(row).catch(function () {});
  }
  function putBoard(b) {
    boardRow = b;
    if (!roomDb || !mpOn) return;
    roomDb.put(b).catch(function () {});
  }
  function freshBoard(hostId) {
    return {
      id: 'game', host: hostId, seats: [null, null, null, null], names: {},
      game: L.fresh(4), seq: 0, t: nowMs()
    };
  }

  function paintRoster() {
    var el = $('roster');
    if (!el) return;
    if (mode !== 'mp') { el.innerHTML = ''; return; }
    var html = '', p;
    for (p = 0; p < 4; p++) {
      var who = seats[p] ? (names[seats[p]] || 'Player') : 'waiting';
      var mine = seats[p] === me.id;
      html += '<li class="' + L.COLORS[p] + (mine ? ' me' : '') + (game.turn === p && game.winner < 0 ? ' turn' : '') + '">'
        + '<span class="swatch"></span>' + L.NAMES[p] + ' — ' + (mine ? 'you' : who) + '</li>';
    }
    el.innerHTML = html;
  }

  function paintBoard() {
    var el = $('board');
    if (el.children.length !== 225) {
      el.innerHTML = '';
      var r, c, d;
      for (r = 0; r < 15; r++) for (c = 0; c < 15; c++) {
        d = document.createElement('div');
        d.className = 'sq';
        d.setAttribute('data-r', String(r));
        d.setAttribute('data-c', String(c));
        el.appendChild(d);
      }
    }
    var i, p, t, cell, kind;
    for (i = 0; i < 225; i++) {
      el.children[i].className = 'sq';
      el.children[i].innerHTML = '';
    }
    function at(r, c) { return el.children[r * 15 + c]; }
    function paintPath(list, cls) {
      for (i = 0; i < list.length; i++) at(list[i].r, list[i].c).classList.add(cls);
    }
    paintPath(L.LOOP, 'path');
    for (p = 0; p < 4; p++) paintPath(L.HOME[p], L.COLORS[p]);
    for (r = 9; r <= 14; r++) for (c = 0; c <= 5; c++) at(r, c).classList.add('red', 'yard');
    for (r = 0; r <= 5; r++) for (c = 0; c <= 5; c++) at(r, c).classList.add('green', 'yard');
    for (r = 0; r <= 5; r++) for (c = 9; c <= 14; c++) at(r, c).classList.add('yellow', 'yard');
    for (r = 9; r <= 14; r++) for (c = 9; c <= 14; c++) at(r, c).classList.add('blue', 'yard');
    at(7, 7).classList.add('home');
    for (p = 0; p < 4; p++) {
      if (!game.playing[p]) continue;
      for (t = 0; t < 4; t++) {
        cell = L.cellOf(p, game.tokens[p][t], t);
        kind = document.createElement('button');
        kind.type = 'button';
        kind.className = 'tok ' + L.COLORS[p];
        kind.setAttribute('data-p', String(p));
        kind.setAttribute('data-t', String(t));
        at(cell.r, cell.c).appendChild(kind);
      }
    }
    var legal = game.rolled ? L.moves(game) : [];
    for (i = 0; i < legal.length; i++) {
      var btn = el.querySelector('[data-p="' + game.turn + '"][data-t="' + legal[i].t + '"]');
      if (btn) btn.classList.add('lit');
    }
    $('status').textContent = game.log || (L.NAMES[game.turn] + ' to play');
    $('die').textContent = game.die ? String(game.die) : '·';
    var myTurn = canAct();
    $('rollBtn').disabled = !myTurn || !!game.rolled || game.winner >= 0;
    $('die').disabled = $('rollBtn').disabled;
    document.body.className = 'play ' + L.COLORS[game.turn];
    if (game.winner >= 0) {
      setChip('win', L.NAMES[game.winner] + ' wins');
      $('status').textContent = L.NAMES[game.winner] + ' got all four home.';
    } else if (mode === 'mp' && mySeat >= 0) {
      var label = L.NAMES[mySeat];
      if (myTurn) setChip('play', 'You (' + label + ') — ' + (game.rolled ? 'pick a token' : 'roll'));
      else setChip('play', L.NAMES[game.turn] + (game.rolled ? ' — picking' : ' — rolling'));
    } else {
      setChip('play', L.NAMES[game.turn] + (game.rolled ? ' — pick a token' : ' — roll'));
    }
    paintRoster();
  }

  function canAct() {
    if (game.winner >= 0) return false;
    if (mode === 'local') return true;
    return mySeat === game.turn && mySeat >= 0;
  }

  function doRoll() {
    if (!canAct() || game.rolled) return;
    if (mode === 'mp') {
      putMe({ intent: { kind: 'roll', seq: seq } });
      return;
    }
    game = L.roll(game);
    paintBoard(); persist();
  }
  function doMove(t) {
    if (!canAct() || !game.rolled) return;
    if (mode === 'mp') {
      putMe({ intent: { kind: 'move', t: t, seq: seq } });
      return;
    }
    game = L.apply(game, t);
    paintBoard(); persist();
  }
  function doNew() {
    if (mode === 'mp') {
      putMe({ intent: { kind: 'new', seq: seq } });
      return;
    }
    game = L.fresh(nPlayers);
    paintBoard(); persist();
  }

  $('rollBtn').onclick = doRoll;
  $('die').onclick = doRoll;
  $('board').onclick = function (ev) {
    var t = ev.target;
    if (!t || !t.getAttribute) return;
    if (t.getAttribute('data-p') == null) return;
    if (+t.getAttribute('data-p') !== game.turn) return;
    doMove(+t.getAttribute('data-t'));
  };
  $('newBtn').onclick = doNew;

  function show(id) {
    $('home').hidden = id !== 'home';
    $('play').hidden = id !== 'play';
  }
  $('nSeg').onclick = function (ev) {
    var b = ev.target.closest ? ev.target.closest('button') : ev.target;
    if (!b || !b.getAttribute('data-n')) return;
    Array.prototype.forEach.call(this.children, function (c) { c.classList.remove('on'); });
    b.classList.add('on');
    nPlayers = +b.getAttribute('data-n');
  };
  $('soloBtn').onclick = function () {
    leaveMp();
    mode = 'local';
    game = L.fresh(nPlayers);
    mySeat = 0;
    show('play');
    paintBoard(); persist();
  };
  $('contBtn').onclick = function () {
    leaveMp();
    mode = 'local';
    mySeat = 0;
    show('play');
    paintBoard();
  };
  $('friendBtn').onclick = function () {
    if (!roomDb) {
      $('homeErr').hidden = false;
      $('homeErr').textContent = 'Play with friends needs the room. You can still play on this device.';
      return;
    }
    mpEnter();
  };
  $('backBtn').onclick = function () { show('home'); };

  function leaveMp() {
    mpOn = false;
    if (hb) clearInterval(hb); hb = 0;
    if (roomDb && me.id && me.id !== 'solo') roomDb.delete(me.id).catch(function () {});
  }

  function mpEnter() {
    var start = function (who) {
      if (who && who.id) { me.id = who.id; me.name = who.name || 'You'; }
      mpOn = true;
      mode = 'mp';
      nPlayers = 4;
      mySeat = -1;
      seats = [null, null, null, null];
      names = {};
      game = L.fresh(4);
      show('play');
      $('status').textContent = 'Press Invite in the bar above. Seats fill as people open the link.';
      setChip('play', 'Press Invite');
      paintBoard();
      putMe();
      if (hb) clearInterval(hb);
      hb = setInterval(function () { if (mpOn) putMe(); }, HB_MS);
      if (!subbed && roomDb) {
        subbed = true;
        roomDb.subscribe(function (rows) { items = rows || []; mpRefresh(); });
      } else mpRefresh();
    };
    if (window.gifos && gifos.me) {
      gifos.me().then(start).catch(function () { start({ id: 'local', name: 'You' }); });
    } else start({ id: 'local', name: 'You' });
  }

  function mpRefresh() {
    if (!mpOn) return;
    var t = nowMs();
    var live = [], board = null, i, it;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (!it || !it.id) continue;
      if (it.id === 'game') { board = it; continue; }
      if (it.at && t - it.at < PRES_TTL) live.push(it);
    }
    if (!live.some(function (p) { return p.id === me.id; })) {
      live.push(myRow || { id: me.id, name: me.name, at: t });
    }
    people = live;
    boardRow = board;
    if (myRow) {
      for (i = 0; i < live.length; i++) if (live[i].id === me.id) myRow = live[i];
    }
    if (!board) {
      if (isHost(live)) putBoard(freshBoard(me.id));
      paintBoard();
      return;
    }
    if (isHost(live)) {
      var next = reconcile(board, live);
      if (next) { putBoard(next); return; }
    }
    applyBoard(board);
    if (myRow && myRow.intent && board.seq !== myRow.intent.seq) putMe({ intent: null });
  }

  function applyBoard(b) {
    seats = (b.seats || [null, null, null, null]).slice();
    names = b.names || {};
    seq = b.seq || 0;
    if (b.game) game = b.game;
    mySeat = -1;
    var p;
    for (p = 0; p < 4; p++) if (seats[p] === me.id) mySeat = p;
    paintBoard();
  }

  function reconcile(B, live) {
    var b = JSON.parse(JSON.stringify(B));
    var ch = false;
    var ids = {}, list = [], i, p;
    live.forEach(function (row) {
      ids[row.id] = row;
      if (b.names[row.id] !== row.name) { b.names[row.id] = row.name; ch = true; }
    });
    live = live.slice().sort(function (a, b) {
      var da = a.at || 0, db = b.at || 0;
      if (da !== db) return da - db;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });
    live.forEach(function (row) { list.push(row.id); });
    var seated = L.seatPeople(b.seats, list);
    for (i = 0; i < 4; i++) if (seated[i] !== (b.seats && b.seats[i])) { b.seats = seated; ch = true; break; }
    var playing = L.playingFromSeats(b.seats);
    if (!b.game) { b.game = L.fresh(4); ch = true; }
    for (p = 0; p < 4; p++) if (b.game.playing[p] !== playing[p]) { b.game.playing = playing; ch = true; break; }
    if (b.game.winner < 0 && !b.game.playing[b.game.turn]) {
      L.nextTurn(b.game);
      ch = true;
    }
    live.forEach(function (row) {
      var intent = row.intent;
      if (!intent || intent.seq !== b.seq) return;
      var seat = -1;
      for (p = 0; p < 4; p++) if (b.seats[p] === row.id) seat = p;
      if (seat < 0) return;
      if (intent.kind === 'roll') {
        if (b.game.winner >= 0 || b.game.turn !== seat || b.game.rolled) return;
        b.game = L.roll(b.game);
        b.seq = (b.seq || 0) + 1;
        ch = true;
      } else if (intent.kind === 'move') {
        if (b.game.winner >= 0 || b.game.turn !== seat || !b.game.rolled) return;
        if (typeof intent.t !== 'number') return;
        var legal = L.moves(b.game), ok = false, mi;
        for (mi = 0; mi < legal.length; mi++) if (legal[mi].t === intent.t) ok = true;
        if (!ok) return;
        b.game = L.apply(b.game, intent.t);
        b.seq = (b.seq || 0) + 1;
        ch = true;
      } else if (intent.kind === 'new') {
        b.game = L.fresh(4);
        b.game.playing = L.playingFromSeats(b.seats);
        b.seq = (b.seq || 0) + 1;
        ch = true;
      }
    });
    if (b.host !== me.id) { b.host = me.id; ch = true; }
    b.t = nowMs();
    return ch ? b : null;
  }

  function onBack() {
    if (!$('play').hidden) { show('home'); return true; }
    return true;
  }

  function boot() {
    setChip('ready', 'Four seats');
    if (!L) {
      $('homeErr').hidden = false;
      $('homeErr').textContent = 'The board did not load.';
      return;
    }
    if (window.gifos && gifos.onBack) gifos.onBack(onBack);
    if (saveDb) {
      saveDb.get('save').then(function (row) {
        if (row && row.game) {
          game = row.game;
          nPlayers = row.n || 4;
          $('contBtn').hidden = false;
        }
      }).catch(function () {});
    }
    if (window.gifos && gifos.me) gifos.me().then(function (who) { if (who && who.id) me = who; }).catch(function () {});
  }
  boot();

  window.LudoApp = {
    seatPeople: L.seatPeople, canAct: canAct,
    get game() { return game; }, get seats() { return seats; }, get mode() { return mode; }
  };
})();
