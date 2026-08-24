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
  function bankFromSeat(t, id) {
    var i = PK.seatById(t, id);
    if (i < 0) return chips;
    return t.seats[i].stack;
  }
  function saveBank(t) {
    if (!t) return;
    if (t.phase !== 'showdown' && t.phase !== 'idle') return;
    var n = bankFromSeat(t, me.id);
    if (typeof n === 'number') { chips = n; persistChips(); showChips(); }
  }

  function paintCard(c, hide) {
    var d = document.createElement('div');
    if (!c || !c.r) {
      d.className = 'pcard ghost';
      return d;
    }
    if (hide) { d.className = 'pcard back'; return d; }
    d.className = 'pcard' + (PK.RED[c.s] ? ' red' : '');
    d.innerHTML = '<span class="tl">' + PK.label(c) + '</span><span class="c">' + PK.GLYPH[c.s] + '</span>';
    return d;
  }
  function paintBoard(el, cards) {
    el.innerHTML = '';
    var i;
    for (i = 0; i < 5; i++) el.appendChild(paintCard(cards && cards[i], false));
  }
  function paintHole(el, cards, hideAll) {
    el.innerHTML = '';
    if (!cards || !cards.length) {
      el.appendChild(paintCard(null));
      el.appendChild(paintCard(null));
      return;
    }
    cards.forEach(function (c) { el.appendChild(paintCard(c, hideAll)); });
  }

  function seatEl(s, t) {
    var d = document.createElement('div');
    var toAct = t && t.toAct;
    var won = t && t.winners && t.winners.some(function (w) { return w.i === s.i; });
    d.className = 'seat' + (s.i === toAct ? ' on' : '') + (s.id === me.id ? ' me' : '') + (!s.id ? ' empty' : '') + (won ? ' win' : '');
    if (!s.id) {
      d.innerHTML = '<div class="name">Empty seat</div>';
      return d;
    }
    var tags = [];
    if (t && s.i === t.dealer) tags.push('D');
    if (s.lastAction) tags.push(s.lastAction);
    else if (s.folded) tags.push('fold');
    else if (s.allIn) tags.push('all-in');
    var hole = '';
    if (t && t.phase === 'showdown' && s.hand && s.hand.length && s.hand[0] && s.hand[0].r) {
      hole = '<div class="mini">' + s.hand.map(function (c) { return PK.label(c); }).join(' ') + '</div>';
    }
    d.innerHTML = '<div class="name">' + esc(s.name || 'Player') +
      (s.isBot ? ' <span class="tag">bot</span>' : '') +
      (s.id === me.id && s.name !== 'You' ? ' <span class="tag">you</span>' : '') + '</div>' +
      '<div class="meta">' + s.stack + ' chips' + (s.bet ? ' · bet ' + s.bet : '') + '</div>' +
      (tags.length ? '<div class="tag">' + tags.join(' · ') + '</div>' : '') +
      hole;
    return d;
  }

  function paintSeats(t) {
    var el = $('seats');
    el.innerHTML = '';
    var seats = (t && t.seats) || [];
    var live = 0, i, s;
    for (i = 0; i < seats.length; i++) {
      s = seats[i];
      if (s && s.id) { el.appendChild(seatEl(s, t)); live++; }
    }
    if (live < PK.MAX) {
      var empty = document.createElement('div');
      empty.className = 'seat empty';
      empty.innerHTML = '<div class="name">' + (PK.MAX - live) + ' empty seat' + (PK.MAX - live === 1 ? '' : 's') + '</div>';
      el.appendChild(empty);
    }
    if (!live) {
      var none = document.createElement('div');
      none.className = 'seat empty';
      none.innerHTML = '<div class="name">Empty table</div><div class="meta">Waiting for someone to sit.</div>';
      el.innerHTML = '';
      el.appendChild(none);
    }
  }

  function setAct(t, mySeat) {
    var idle = !t || t.phase === 'idle' || t.phase === 'showdown';
    var mine = mySeat >= 0 && t && PK.canAct(t, mySeat);
    var L = mine ? PK.legal(t, mySeat) : null;
    var hostDeal = idle && (!mp.on || owner);
    $('dealBtn').hidden = !hostDeal;
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
      $('raiseMin').onclick = function () { setRaise(L.minRaiseTo); };
      $('raisePot').onclick = function () { setRaise(Math.min(L.raiseTo, Math.max(L.minRaiseTo, (t.pot || 0) + L.toCall))); };
      $('raiseAll').onclick = function () { setRaise(L.raiseTo); };
    }
    var wait = $('waitPill');
    if (!mine && !idle && t && t.toAct != null && t.seats[t.toAct]) {
      wait.hidden = false;
      wait.textContent = (t.seats[t.toAct].name || 'Player') + ' to act.';
    } else {
      wait.hidden = true;
    }
    if (mine) $('legalHint').textContent = L && L.toCall > 0 ? ('Your turn — ' + L.call + ' to call.') : 'Your turn.';
    else if (idle) $('legalHint').textContent = '';
    else $('legalHint').textContent = '';
    var broke = mySeat >= 0 && t && t.seats[mySeat] && t.seats[mySeat].stack < PK.BB;
    $('topupBtn').hidden = !(idle && broke);
  }
  function setRaise(n) {
    n = n | 0;
    $('raiseRange').value = String(n);
    $('raiseAmt').textContent = String(n);
  }

  function renderTable(t, viewerId) {
    if (!t) return;
    $('pot').textContent = t.phase === 'showdown' ? 'Showdown' : ('Pot ' + t.pot + (t.phase && t.phase !== 'idle' ? ' · ' + t.phase : ''));
    paintBoard($('board'), t.board);
    paintSeats(t);
    var si = PK.seatById(t, viewerId);
    var hole = si >= 0 ? t.seats[si].hand : [];
    paintHole($('hole'), hole);
    $('playStatus').textContent = t.msg || '';
    if (si >= 0) {
      $('chips').textContent = String(t.seats[si].stack);
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
    }, 450);
  }
  function afterLocal() {
    renderTable(local, me.id);
    saveBank(local);
    kickBots();
  }

  function startLocal() {
    mp.on = false;
    local = PK.newTable();
    if (chips < PK.BB) { chips = PK.START; persistChips(); }
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
      if (chips < PK.BB) { chips = PK.START; persistChips(); showChips(); }
      var si = PK.seatById(local, me.id);
      if (si >= 0 && local.seats[si].stack < PK.BB) PK.rebuy(local, me.id, PK.START);
      PK.startHand(local);
      afterLocal();
      return;
    }
    if (mp.on && owner) hostDeal();
  };
  $('topupBtn').onclick = function () {
    chips = PK.START;
    persistChips();
    showChips();
    if (local) {
      PK.rebuy(local, me.id, PK.START);
      afterLocal();
    }
    if (mp.on) putMe({ chips: chips });
  };
  $('foldBtn').onclick = function () { doAct('fold'); };
  $('checkBtn').onclick = function () { doAct('check'); };
  $('callBtn').onclick = function () { doAct('call'); };
  $('raiseBtn').onclick = function () { doAct('raise', parseInt($('raiseRange').value, 10)); };
  $('raiseRange').oninput = function () { $('raiseAmt').textContent = this.value; };

  function doAct(kind, amount) {
    if (local) {
      var si = PK.seatById(local, me.id);
      if (si < 0) return;
      PK.applyAction(local, si, kind, amount);
      afterLocal();
      return;
    }
    if (!mp.on || !mp.id) return;
    lastActSeq++;
    if (owner && table) {
      var hs = PK.seatById(table, mp.id);
      if (hs >= 0 && PK.canAct(table, hs)) {
        PK.applyAction(table, hs, kind, amount);
        putTable(table);
        renderTable(table, mp.id);
        saveBank(table);
      }
    }
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
  function isHost() { return owner; }
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
      $('lobbyStatus').textContent = 'This table is empty. Press Invite in the GifOS menu — the link is a seat.';
      $('lobbyEmpty').hidden = false;
      return;
    }
    table = table ? hydrate(PK.publicTable(table, null, true)) : PK.newTable();
    var stacks = {};
    table.seats.forEach(function (s) { if (s.id) stacks[s.id] = s.stack; });
    table.seats = PK.newTable().seats;
    people.sort(function (a, b) { return (a.joined || 0) - (b.joined || 0); });
    people.forEach(function (p) {
      var buy = stacks[p.id] != null ? stacks[p.id] : (p.chips || PK.START);
      if (buy < PK.BB) buy = PK.START;
      PK.sit(table, p.id, p.name, buy, false);
    });
    if (!PK.startHand(table)) return;
    putTable(table);
    show('play');
    renderTable(table, mp.id);
  }

  function hostIngest(people) {
    if (!table || table.phase === 'idle' || table.phase === 'showdown') return;
    var i, p, key, si;
    for (i = 0; i < people.length; i++) {
      p = people[i];
      if (!p.act || !p.seq) continue;
      key = p.id + ':' + p.seq;
      if (applied[key]) continue;
      si = PK.seatById(table, p.id);
      if (si < 0 || !PK.canAct(table, si)) continue;
      applied[key] = 1;
      PK.applyAction(table, si, p.act, p.amt);
      putTable(table);
    }
  }

  function renderLobby(people) {
    var ul = $('lobbyList');
    ul.innerHTML = '';
    if (!people.length) {
      var empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = 'Empty table — nobody is seated yet.';
      ul.appendChild(empty);
    } else {
      people.forEach(function (p) {
        var li = document.createElement('li');
        li.textContent = (p.name || 'Player') + (p.id === mp.id ? ' (you)' : '');
        ul.appendChild(li);
      });
    }
    var host = isHost();
    var n = people.length;
    $('dealLobby').hidden = !(host && n >= 2);
    $('lobbyEmpty').hidden = n >= 2;
    if (!roomDb) {
      $('lobbyStatus').textContent = 'Open this inside GifOS. Press Invite in the bar — the link is a seat.';
      $('dealLobby').hidden = true;
      $('lobbyEmpty').hidden = true;
    } else if (n < 2) {
      $('lobbyStatus').textContent = 'This table is empty. Press Invite in the GifOS menu — the link is a seat.';
    } else {
      $('lobbyStatus').textContent = host
        ? (n + ' seated. Deal when you are ready.')
        : 'Waiting for the host to deal.';
    }
  }

  function visForMe(pub) {
    var vis = JSON.parse(JSON.stringify(pub || {}));
    (vis.seats || []).forEach(function (s) {
      if (s && s.id !== mp.id && vis.phase !== 'showdown' && s.hand && s.hand.length) {
        s.hand = [{}, {}];
      }
    });
    return vis;
  }

  function onRoom(list) {
    _items = list || [];
    var people = livePeople(_items);
    var rec = tableRec(_items);
    if (view === 'lobby') renderLobby(people);
    if (owner) {
      if (table && rec && rec.host === mp.id) hostIngest(people);
    }
    if (rec && rec.t) {
      var vis = visForMe(rec.t);
      if (view !== 'play' && vis.phase && vis.phase !== 'idle') show('play');
      if (view === 'play') {
        var fake = hydrate(vis);
        renderTable(fake, mp.id);
        if (vis.phase === 'showdown' || vis.phase === 'idle') {
          var mine = (vis.seats || []).filter(function (s) { return s.id === mp.id; })[0];
          if (mine && typeof mine.stack === 'number') {
            chips = mine.stack;
            persistChips();
            showChips();
          }
        }
      }
    }
  }

  function mpEnter() {
    mp.on = true;
    mp.joined = nowMs();
    local = null;
    show('lobby');
    if (!roomDb) {
      renderLobby([]);
      return;
    }
    putMe();
    if (!hb) {
      hb = setInterval(function () { if (mp.on) putMe(); }, HB_MS);
    }
    roomDb.subscribe(onRoom);
  }
  $('friendBtn').onclick = mpEnter;
  $('dealLobby').onclick = function () { if (owner) hostDeal(); };

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
    renderLobby(livePeople(_items));
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
      return saveDb.get('last').then(function (rec) {
        if (rec && rec.chips > 0) chips = rec.chips | 0;
        showChips();
      }).catch(function () { showChips(); });
    }).then(function () {
      // Guests arrived through Invite — they sit. The home screen would
      // leave them standing in the hall while the host waits on an empty table.
      if (roomDb && !owner) mpEnter();
    });
  }
  boot();
})();
