// Vintage Poker — host is the dealer. Their game server stays behind.
// Each player writes ONLY their own row. Invite is OS chrome.
(function () {
  'use strict';
  var PK = window.PK;
  var $ = function (id) { return document.getElementById(id); };
  var nowMs = function () { return Date.now ? Date.now() : 0; };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch];
    });
  };

  var PRES_TTL = 9000, HB_MS = 3000;
  var view = 'home';
  var chips = PK.START;
  var saveDb = null, roomDb = null;
  var owner = true;
  var me = { id: 'local', name: 'You' };
  var local = null;
  var botTimer = 0;
  var lastActSeq = 0;

  try {
    if (window.gifos) {
      saveDb = gifos.db('save');
      roomDb = gifos.db('room');
    }
  } catch (e) {}

  function show(id) {
    view = id;
    ['home', 'lobby', 'play'].forEach(function (k) { $(k).hidden = k !== id; });
    document.body.classList.toggle('play-on', id === 'play');
  }
  function showChips() { $('chips').textContent = String(chips); }
  function persistChips() {
    if (!saveDb) return;
    saveDb.put({ id: 'last', chips: chips }).catch(function () {});
  }

  function paintCard(c, hide) {
    var d = document.createElement('div');
    if (!c || !c.r) {
      d.className = 'card back';
      return d;
    }
    if (hide) { d.className = 'card back'; return d; }
    d.className = 'card' + (PK.RED[c.s] ? ' red' : '');
    d.innerHTML = '<span class="tl">' + PK.label(c) + '</span><span class="c">' + PK.GLYPH[c.s] + '</span>';
    return d;
  }
  function paintList(el, cards, hideAll) {
    el.innerHTML = '';
    if (!cards || !cards.length) {
      var e = document.createElement('div');
      e.className = 'card empty';
      el.appendChild(e);
      return;
    }
    cards.forEach(function (c) { el.appendChild(paintCard(c, hideAll)); });
  }

  function seatEl(s, toAct, dealer) {
    var d = document.createElement('div');
    d.className = 'seat' + (s.i === toAct ? ' on' : '');
    if (!s.id) {
      d.innerHTML = '<div class="name">Empty seat</div>';
      return d;
    }
    var tags = [];
    if (s.i === dealer) tags.push('D');
    if (s.lastAction) tags.push(s.lastAction);
    if (s.folded) tags.push('fold');
    if (s.allIn) tags.push('all-in');
    d.innerHTML = '<div class="name">' + esc(s.name || 'Player') +
      (s.isBot ? ' <span class="tag">bot</span>' : '') + '</div>' +
      '<div class="meta">' + s.stack + ' chips' + (s.bet ? ' · bet ' + s.bet : '') + '</div>' +
      (tags.length ? '<div class="tag">' + tags.join(' · ') + '</div>' : '');
    return d;
  }

  function paintSeats(seats, toAct, dealer) {
    var el = $('seats');
    el.innerHTML = '';
    (seats || []).forEach(function (s) { el.appendChild(seatEl(s, toAct, dealer)); });
  }

  function setAct(t, mySeat) {
    var idle = !t || t.phase === 'idle' || t.phase === 'showdown';
    var mine = mySeat >= 0 && t && PK.canAct(t, mySeat);
    var L = mine ? PK.legal(t, mySeat) : null;
    $('dealBtn').hidden = !idle;
    $('foldBtn').hidden = !mine;
    $('checkBtn').hidden = !(mine && L.check);
    $('callBtn').hidden = !(mine && L.toCall > 0);
    $('raiseBtn').hidden = !(mine && L.raiseTo);
    $('raiseRow').hidden = !(mine && L.raiseTo);
    if (mine && L.toCall > 0) $('callBtn').textContent = 'Call ' + L.call;
    else $('callBtn').textContent = 'Call';
    if (mine && L.raiseTo) {
      $('raiseRange').min = L.minRaiseTo;
      $('raiseRange').max = L.raiseTo;
      $('raiseRange').value = L.minRaiseTo;
      $('raiseAmt').textContent = String(L.minRaiseTo);
    }
    $('legalHint').textContent = mine ? 'Your turn.' : (idle ? '' : 'Waiting.');
  }

  function mySeatOf(t, id) {
    var i;
    for (i = 0; i < t.seats.length; i++) if (t.seats[i].id === id) return i;
    return -1;
  }

  function renderTable(t, viewerId) {
    if (!t) return;
    $('pot').textContent = 'Pot ' + t.pot + (t.phase && t.phase !== 'idle' ? ' · ' + t.phase : '');
    paintList($('board'), t.board);
    paintSeats(t.seats, t.toAct, t.dealer);
    var si = mySeatOf(t, viewerId);
    var hole = si >= 0 ? t.seats[si].hand : [];
    paintList($('hole'), hole);
    $('playStatus').textContent = t.msg || '';
    if (si >= 0) {
      chips = t.seats[si].stack;
      showChips();
    }
    setAct(t, si);
  }

  function stopBots() {
    if (botTimer) { clearTimeout(botTimer); botTimer = 0; }
  }
  function kickBots() {
    stopBots();
    if (!local) return;
    if (local.phase === 'idle' || local.phase === 'showdown') return;
    var s = local.seats[local.toAct];
    if (!s || !s.isBot) return;
    botTimer = setTimeout(function () {
      botTimer = 0;
      if (!local) return;
      var seat = local.seats[local.toAct];
      if (!seat || !seat.isBot) return;
      var a = PK.botKind(local, seat.i);
      if (!a) return;
      PK.applyAction(local, seat.i, a.kind, a.amount);
      afterLocal();
    }, 700);
  }
  function afterLocal() {
    renderTable(local, me.id);
    if (local.phase === 'showdown' || local.phase === 'idle') {
      var si = mySeatOf(local, me.id);
      if (si >= 0) { chips = local.seats[si].stack; persistChips(); showChips(); }
    }
    kickBots();
  }

  function startLocal() {
    mp.on = false;
    local = PK.newTable();
    PK.sit(local, me.id, me.name || 'You', chips, false);
    PK.sit(local, 'bot-ada', 'Ada', PK.START, true);
    PK.sit(local, 'bot-chip', 'Chip', PK.START, true);
    PK.startHand(local);
    show('play');
    afterLocal();
  }
  $('soloBtn').onclick = startLocal;

  $('dealBtn').onclick = function () {
    if (local) {
      PK.startHand(local);
      afterLocal();
      return;
    }
    if (mp.on && isHost(livePeople(_items))) hostDeal();
  };
  $('foldBtn').onclick = function () { doAct('fold'); };
  $('checkBtn').onclick = function () { doAct('check'); };
  $('callBtn').onclick = function () { doAct('call'); };
  $('raiseBtn').onclick = function () { doAct('raise', parseInt($('raiseRange').value, 10)); };
  $('raiseRange').oninput = function () { $('raiseAmt').textContent = this.value; };

  function doAct(kind, amount) {
    if (local) {
      var si = mySeatOf(local, me.id);
      if (si < 0) return;
      PK.applyAction(local, si, kind, amount);
      afterLocal();
      return;
    }
    if (!mp.on || !mp.id) return;
    lastActSeq++;
    putMe({ act: kind, amt: amount || 0, seq: lastActSeq });
  }

  // ---- multiplayer ----
  var mp = { on: false, id: null, name: 'You', row: null };
  var _items = [];
  var table = null;
  var applied = {};
  var hb = 0;

  function livePeople(items, t) {
    t = t || nowMs();
    return (items || []).filter(function (it) {
      return it && it.kind === 'seat' && it.id && it.at && (t - it.at) < PRES_TTL;
    });
  }
  function isHost(people) {
    if (!people.length) return owner;
    people = people.slice().sort(function (a, b) { return (a.joined || 0) - (b.joined || 0); });
    return people[0].id === mp.id;
  }
  function tableRec(items) {
    var i, it;
    for (i = 0; i < (items || []).length; i++) {
      it = items[i];
      if (it && it.kind === 'table') return it;
    }
    return null;
  }

  function putMe(extra) {
    if (!roomDb || !mp.id) return;
    var row = {
      id: mp.id, kind: 'seat', name: mp.name, at: nowMs(),
      joined: mp.joined || nowMs(), chips: chips
    };
    if (mp.row) {
      ['act', 'amt', 'seq', 'seat'].forEach(function (k) {
        if (mp.row[k] !== undefined) row[k] = mp.row[k];
      });
    }
    if (extra) Object.keys(extra).forEach(function (k) { row[k] = extra[k]; });
    mp.row = row;
    roomDb.put(row).catch(function () {});
  }

  function putTable(t) {
    if (!roomDb || !mp.id) return;
    var pub = PK.publicTable(t, null, true);
    roomDb.put({
      id: 'table', kind: 'table', at: nowMs(), host: mp.id, t: pub
    }).catch(function () {});
  }

  function hydrate(pub) {
    var t = PK.newTable();
    if (!pub) return t;
    t.phase = pub.phase; t.board = pub.board || []; t.pot = pub.pot || 0;
    t.toAct = pub.toAct; t.dealer = pub.dealer || 0; t.streetBet = pub.streetBet || 0;
    t.minRaise = pub.minRaise || PK.BB; t.winners = pub.winners || [];
    t.msg = pub.msg || ''; t.handNo = pub.handNo || 0;
    (pub.seats || []).forEach(function (s, i) {
      var d = t.seats[i];
      if (!d || !s) return;
      d.id = s.id; d.name = s.name; d.stack = s.stack; d.bet = s.bet;
      d.folded = !!s.folded; d.allIn = !!s.allIn; d.sittingOut = !!s.sittingOut;
      d.lastAction = s.lastAction; d.isBot = !!s.isBot;
      d.hand = (s.hand || []).map(function (c) { return c && c.r ? PK.cloneCard(c) : { r: 0, s: 's' }; });
    });
    return t;
  }

  function hostDeal() {
    var people = livePeople(_items);
    if (people.length < 2) {
      $('lobbyStatus').textContent = 'Need two people. Press Invite in the GifOS menu.';
      return;
    }
    table = table ? hydrate(PK.publicTable(table, null, true)) : PK.newTable();
    // rebuild seats from live people, keep stacks if we have them
    var stacks = {};
    table.seats.forEach(function (s) { if (s.id) stacks[s.id] = s.stack; });
    table.seats = PK.newTable().seats;
    people.sort(function (a, b) { return (a.joined || 0) - (b.joined || 0); });
    people.forEach(function (p) {
      PK.sit(table, p.id, p.name, stacks[p.id] != null ? stacks[p.id] : (p.chips || PK.START), false);
    });
    if (!PK.startHand(table)) return;
    putTable(table);
    show('play');
    renderTable(table, mp.id);
  }

  function hostIngest(people) {
    if (!table || table.phase === 'idle' || table.phase === 'showdown') return;
    var i, p, key;
    for (i = 0; i < people.length; i++) {
      p = people[i];
      if (!p.act || !p.seq) continue;
      key = p.id + ':' + p.seq;
      if (applied[key]) continue;
      var si = mySeatOf(table, p.id);
      if (si < 0 || !PK.canAct(table, si)) continue;
      applied[key] = 1;
      PK.applyAction(table, si, p.act, p.amt);
      putTable(table);
    }
  }

  function renderLobby(people) {
    var ul = $('lobbyList');
    ul.innerHTML = '';
    people.forEach(function (p) {
      var li = document.createElement('li');
      li.textContent = (p.name || 'Player') + (p.id === mp.id ? ' (you)' : '');
      ul.appendChild(li);
    });
    var host = isHost(people);
    $('dealLobby').hidden = !host;
    $('lobbyStatus').textContent = people.length < 2
      ? 'Waiting for friends… press Invite in the GifOS menu to send the link.'
      : (host ? 'Deal when you are ready.' : 'Waiting for the host to deal.');
  }

  function onRoom(list) {
    _items = list || [];
    var people = livePeople(_items);
    var rec = tableRec(_items);
    if (view === 'lobby') renderLobby(people);
    if (isHost(people)) {
      if (table && rec && rec.host === mp.id) hostIngest(people);
    }
    if (rec && rec.t) {
      var vis = rec.t;
      // hide others' hole cards unless showdown
      vis = JSON.parse(JSON.stringify(vis));
      (vis.seats || []).forEach(function (s) {
        if (s && s.id !== mp.id && vis.phase !== 'showdown' && s.hand && s.hand.length) {
          s.hand = [{}, {}];
        }
      });
      if (view !== 'play' && vis.phase && vis.phase !== 'idle') show('play');
      if (view === 'play') {
        $('pot').textContent = 'Pot ' + (vis.pot || 0) + (vis.phase ? ' · ' + vis.phase : '');
        paintList($('board'), vis.board);
        paintSeats(vis.seats, vis.toAct, vis.dealer);
        var mine = (vis.seats || []).filter(function (s) { return s.id === mp.id; })[0];
        paintList($('hole'), mine ? mine.hand : []);
        $('playStatus').textContent = vis.msg || '';
        if (mine) { chips = mine.stack; showChips(); persistChips(); }
        var fake = hydrate(rec.t);
        setAct(fake, mySeatOf(fake, mp.id));
      }
    }
  }

  function mpEnter() {
    if (!roomDb) {
      $('home').querySelector('.lvlnote').textContent = 'Open this inside GifOS to sit with friends. Invite is in the bar.';
      return;
    }
    mp.on = true;
    mp.joined = nowMs();
    local = null;
    show('lobby');
    putMe();
    if (!hb) {
      hb = setInterval(function () { if (mp.on) putMe(); }, HB_MS);
    }
    roomDb.subscribe(onRoom);
  }
  $('friendBtn').onclick = mpEnter;

  function leave() {
    stopBots();
    mp.on = false;
    local = null;
    table = null;
    show('home');
  }
  $('lobbyLeave').onclick = leave;
  $('playLeave').onclick = function () {
    if (local) { leave(); return; }
    show('lobby');
  };

  if (window.gifos && gifos.onBack) {
    gifos.onBack(function () {
      if (view === 'play') { $('playLeave').onclick(); return true; }
      if (view === 'lobby') { leave(); return true; }
      return false;
    });
  }

  function boot() {
    var p = Promise.resolve();
    if (window.gifos && gifos.me) {
      p = gifos.me().then(function (id) {
        me.id = id && id.id ? id.id : 'local';
        me.name = (id && id.name) || 'You';
        mp.id = me.id; mp.name = me.name;
      }).catch(function () {});
    } else {
      mp.id = me.id; mp.name = me.name;
    }
    p.then(function () {
      if (window.gifos && gifos.info) {
        return gifos.info().then(function (inf) { owner = !!(inf && inf.owner); }).catch(function () {});
      }
    }).then(function () {
      if (!saveDb) { showChips(); return; }
      saveDb.get('last').then(function (rec) {
        if (rec && rec.chips > 0) chips = rec.chips | 0;
        showChips();
      }).catch(function () { showChips(); });
    });
  }
  boot();
})();
