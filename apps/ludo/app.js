// Ludo — four seats. Invite is OS chrome. The file is the save.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var L = window.LUDO;
  var saveDb = null, roomDb = null;
  var me = { id: 'solo', name: 'you' };
  var mode = 'local';
  var mySeat = 0;
  var game = L.fresh(4);
  var nPlayers = 4;

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
  function publish() {
    if (!roomDb || mode !== 'mp') return;
    roomDb.put({
      id: 'game', game: game, n: nPlayers, t: Date.now()
    }).catch(function () {});
    roomDb.put({
      id: me.id, name: me.name, seat: mySeat, t: Date.now()
    }).catch(function () {});
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
    $('status').textContent = game.log || (L.NAMES[game.turn] + ' to play');
    $('die').textContent = game.die ? String(game.die) : '·';
    $('rollBtn').disabled = !!game.rolled || game.winner >= 0;
    document.body.className = 'play ' + L.COLORS[game.turn];
    if (game.winner >= 0) {
      setChip('win', L.NAMES[game.winner] + ' wins');
      $('status').textContent = L.NAMES[game.winner] + ' got all four home.';
    } else {
      setChip('play', L.NAMES[game.turn] + (game.rolled ? ' — pick a token' : ' — roll'));
    }
    var legal = game.rolled ? L.moves(game) : [];
    for (i = 0; i < legal.length; i++) {
      var btn = el.querySelector('[data-p="' + game.turn + '"][data-t="' + legal[i].t + '"]');
      if (btn) btn.classList.add('lit');
    }
  }

  function canAct() {
    if (game.winner >= 0) return false;
    if (mode === 'local') return true;
    return mySeat === game.turn;
  }

  $('rollBtn').onclick = function () {
    if (!canAct() || game.rolled) return;
    game = L.roll(game);
    paintBoard(); persist(); publish();
  };
  $('board').onclick = function (ev) {
    var t = ev.target;
    if (!t || !t.getAttribute) return;
    if (t.getAttribute('data-p') == null) return;
    if (!canAct() || !game.rolled) return;
    if (+t.getAttribute('data-p') !== game.turn) return;
    game = L.apply(game, +t.getAttribute('data-t'));
    paintBoard(); persist(); publish();
  };
  $('newBtn').onclick = function () {
    game = L.fresh(nPlayers);
    paintBoard(); persist(); publish();
  };

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
    mode = 'local';
    game = L.fresh(nPlayers);
    mySeat = 0;
    show('play');
    paintBoard(); persist();
  };
  $('friendBtn').onclick = function () {
    mode = 'mp';
    nPlayers = 4;
    game = L.fresh(4);
    mySeat = 0;
    show('play');
    paintBoard();
    $('status').textContent = 'Press Invite in the bar above. Seats fill as people open the link — you are Red.';
    setChip('play', 'Press Invite');
    publish();
  };
  $('backBtn').onclick = function () { show('home'); };

  function onRoom(rows) {
    if (mode !== 'mp') return;
    var i, g, seats = {}, n = 0;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].id === 'game' && rows[i].game) g = rows[i].game;
      if (rows[i].seat != null && rows[i].id !== 'game') {
        seats[rows[i].id] = rows[i].seat;
        n++;
      }
    }
    if (g) game = g;
    if (seats[me.id] != null) mySeat = seats[me.id];
    else {
      var taken = {};
      for (i in seats) taken[seats[i]] = 1;
      for (i = 0; i < 4; i++) if (!taken[i]) { mySeat = i; break; }
    }
    paintBoard();
  }

  function boot() {
    setChip('ready', 'Four seats');
    if (saveDb) {
      saveDb.get('save').then(function (row) {
        if (row && row.game) { game = row.game; nPlayers = row.n || 4; }
      }).catch(function () {});
    }
    if (window.gifos && gifos.me) gifos.me().then(function (who) { if (who && who.id) me = who; }).catch(function () {});
    if (roomDb) roomDb.subscribe(onRoom);
  }
  boot();
})();
