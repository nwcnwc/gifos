// Blackjack table. Dealer in the host browser. Invite is extra seats.
// Toy chips, no cash. The sample API stays behind.
(function () {
  'use strict';
  var BJ = window.BJ;
  var $ = function (id) { return document.getElementById(id); };
  var chips = BJ.START;
  var saveDb = null, roomDb = null;
  var me = { id: 'local', name: 'you' };
  var owner = true;
  var mp = { on: false, joined: 0, seq: 0, row: null };
  var local = null;
  var hostTable = null;
  var items = [];
  var lastSettled = null;
  var applied = {};
  var handSeq = 0;
  var hb = 0;
  var HB_MS = 3000;

  try {
    if (window.gifos) {
      saveDb = gifos.db('save');
      roomDb = gifos.db('room');
    }
  } catch (e) {}

  function nowMs() { return Date.now ? Date.now() : 0; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch];
    });
  }
  function peopleNow() { return BJ.liveSeats(items, nowMs()); }
  function tableRec(list) {
    var i, it;
    for (i = 0; i < (list || []).length; i++) {
      it = list[i];
      if (it && it.kind === 'table') return it;
    }
    return null;
  }
  function amHost(people) {
    var hid = BJ.hostId(people, owner ? me.id : null);
    return hid === me.id;
  }
  function tabNow() {
    if (mp.on && hostTable && amHost(peopleNow())) return hostTable;
    if (mp.on) {
      var rec = tableRec(items);
      if (rec && rec.phase) return rec;
    }
    return local;
  }

  function paintHand(el, hand, hideHole) {
    el.innerHTML = '';
    (hand || []).forEach(function (c, i) {
      var d = document.createElement('div');
      var hide = hideHole && i === 1;
      d.className = 'card' + (hide ? ' back' : (BJ.RED[c.suit] ? ' red' : ''));
      if (!hide) {
        d.innerHTML = '<span class="tl">' + BJ.label(c) + '</span><span class="c">' + BJ.GLYPH[c.suit] + '</span>';
      }
      el.appendChild(d);
    });
  }
  function showChips() { $('chips').textContent = String(chips); }
  function persistChips() {
    if (!saveDb) return;
    saveDb.put({ id: 'last', chips: chips, settled: lastSettled }).catch(function () {});
  }
  function persistShoe(tab) {
    if (!saveDb || !owner || !tab) return;
    saveDb.put({
      id: 'shoe',
      handId: tab.handId,
      shoe: tab.shoe,
      dealer: tab.dealer,
      hands: tab.hands,
      phase: tab.phase,
      stake: tab.stake,
      msg: tab.msg
    }).catch(function () {});
  }

  function setButtons(tab) {
    var phase = tab ? tab.phase : 'idle';
    var people = peopleNow();
    var host = !mp.on || amHost(people);
    var mine = tab ? BJ.activeHand(tab, me.id) : null;
    var myTurn = !!(tab && phase === 'play' && mine);
    var broke = !BJ.canDeal(chips, BJ.STAKE);
    $('deal').hidden = phase === 'play' || !host || broke;
    $('hit').hidden = !myTurn;
    $('stand').hidden = !myTurn;
    $('double').hidden = !(myTurn && BJ.canDouble(tab, me.id, chips));
    $('split').hidden = !(myTurn && BJ.canSplit(tab, me.id, chips));
    $('refill').hidden = !(broke && phase !== 'play');
  }

  function paintMine(tab) {
    var mine = tab ? BJ.myHands(tab, me.id) : [];
    var box = $('pHands');
    box.innerHTML = '';
    if (!mine.length) {
      var row = document.createElement('div');
      row.className = 'hand';
      row.innerHTML = '<h2>You <span>~</span></h2>';
      var cards = document.createElement('div');
      cards.className = 'cards';
      row.appendChild(cards);
      box.appendChild(row);
      return;
    }
    var acting = tab.phase === 'play' ? BJ.activeHand(tab, me.id) : null;
    mine.forEach(function (h, i) {
      var row = document.createElement('div');
      row.className = 'hand' + (acting && acting === h ? ' on' : '');
      var lab = mine.length > 1 ? 'You · ' + (i + 1) : 'You';
      if (h.doubled) lab += ' · double';
      if (h.stood && !h.bust && tab.phase === 'play') lab += ' · stand';
      if (h.bust) lab += ' · bust';
      var tot = BJ.totalLabel(h.cards);
      row.innerHTML = '<h2>' + esc(lab) + ' <span>' + tot + '</span></h2>';
      var cards = document.createElement('div');
      cards.className = 'cards';
      paintHand(cards, h.cards, false);
      row.appendChild(cards);
      box.appendChild(row);
    });
  }

  function paintSeats(tab, people) {
    var box = $('seats');
    box.innerHTML = '';
    (people || []).forEach(function (p) {
      if (p.id === me.id) return;
      var hs = tab ? BJ.myHands(tab, p.id) : [];
      var row = document.createElement('div');
      var acting = tab && tab.phase === 'play' && BJ.activeHand(tab, p.id);
      row.className = 'seat' + (acting ? ' on' : '');
      var name = (p.name || 'player') + (hs[0] && hs[0].stood && tab && tab.phase === 'play' ? ' · stand' : '');
      row.innerHTML = '<div class="name">' + esc(name) + '</div>';
      hs.forEach(function (h) {
        var cards = document.createElement('div');
        cards.className = 'cards';
        paintHand(cards, h.cards || [], false);
        row.appendChild(cards);
        if (h.cards && h.cards.length) {
          var t = document.createElement('div');
          t.className = 'tot';
          t.textContent = h.bust ? 'bust' : BJ.totalLabel(h.cards);
          row.appendChild(t);
        }
      });
      box.appendChild(row);
    });
    var who = $('who');
    if (!mp.on || !people || people.length < 2) {
      who.textContent = '';
      who.hidden = true;
    } else {
      who.hidden = false;
      who.textContent = people.map(function (p) {
        return (p.name || 'player') + (p.id === me.id ? ' (you)' : '');
      }).join(' · ');
    }
  }

  function render() {
    var tab = tabNow();
    var people = peopleNow();
    var hide = !!(tab && tab.phase === 'play');
    paintHand($('dCards'), tab ? tab.dealer : [], hide);
    if (!tab || !tab.dealer || !tab.dealer.length) {
      $('dTotal').textContent = '~';
    } else if (hide) {
      $('dTotal').textContent = BJ.totalLabel([tab.dealer[0]]);
    } else {
      $('dTotal').textContent = BJ.totalLabel(tab.dealer);
    }
    paintMine(tab);
    paintSeats(tab, people);
    setButtons(tab);
    var hasCards = !!(tab && tab.dealer && tab.dealer.length);
    var idle = $('feltIdle');
    if (idle) idle.hidden = hasCards;
    if ($('dealer')) $('dealer').hidden = !hasCards;
    if ($('pHands')) $('pHands').hidden = !hasCards;
    var msg = $('msg');
    if (!tab) {
      if (mp.on && people.length && !amHost(people)) msg.textContent = 'Waiting for the host to deal.';
      else if (!BJ.canDeal(chips, BJ.STAKE)) msg.textContent = 'You are out of chips. They are toys — restock 200.';
      else msg.textContent = 'Deal when you are ready.';
    } else if (tab.phase === 'play') {
      var mine = BJ.activeHand(tab, me.id);
      if (mine) {
        if (BJ.canSplit(tab, me.id, chips)) msg.textContent = 'Hit, stand, double, or split.';
        else if (BJ.canDouble(tab, me.id, chips)) msg.textContent = 'Hit, stand, or double.';
        else msg.textContent = 'Hit or stand.';
      } else if (mp.on) msg.textContent = 'Waiting on the table.';
      else msg.textContent = 'Hit or stand.';
    } else {
      msg.textContent = tab.msg || '';
    }
    showChips();
  }

  function settleFrom(tab) {
    if (!tab || tab.phase !== 'done') return;
    if (tab.handId === lastSettled) return;
    if (!BJ.myHands(tab, me.id).length) return;
    lastSettled = tab.handId;
    var net = BJ.netFor(tab, me.id);
    chips = BJ.applyDeltas(chips, [net]);
    showChips();
    persistChips();
  }

  function startLocal() {
    if (!BJ.canDeal(chips, BJ.STAKE)) {
      $('msg').textContent = 'You are out of chips. They are toys — restock 200.';
      render();
      return;
    }
    handSeq += 1;
    local = BJ.createTable({
      players: [{ id: me.id, name: me.name || 'you' }],
      stake: BJ.STAKE,
      handId: handSeq
    });
    if (local.phase === 'done') settleFrom(local);
    render();
  }

  function dealTable(people) {
    if (!BJ.canDeal(chips, BJ.STAKE)) return;
    handSeq += 1;
    var seats = (people && people.length) ? people : [{ id: me.id, name: me.name || 'you' }];
    hostTable = BJ.createTable({
      players: seats.map(function (p) { return { id: p.id, name: p.name || 'player' }; }),
      stake: BJ.STAKE,
      handId: 'h' + nowMs() + '-' + handSeq
    });
    local = null;
    persistShoe(hostTable);
    putTable(hostTable);
    if (hostTable.phase === 'done') settleFrom(hostTable);
    render();
  }

  async function putSeat(extra) {
    extra = extra || {};
    if (!roomDb || !mp.on) return;
    var rec = {
      id: me.id,
      kind: 'seat',
      name: me.name || 'player',
      at: nowMs(),
      joined: mp.joined,
      t: nowMs()
    };
    if (mp.row) {
      ['action', 'actionT', 'seq'].forEach(function (k) {
        if (mp.row[k] !== undefined) rec[k] = mp.row[k];
      });
    }
    var k;
    for (k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) rec[k] = extra[k];
    mp.row = rec;
    try { await roomDb.put(rec); } catch (e) {}
  }
  async function putTable(tab) {
    if (!roomDb || !mp.on) return;
    var pub = BJ.publicTable(tab) || {};
    pub.id = 'table';
    pub.kind = 'table';
    pub.at = nowMs();
    pub.t = nowMs();
    pub.host = me.id;
    try { await roomDb.put(pub); } catch (e) {}
  }

  function act(action) {
    var tab = tabNow();
    var people = peopleNow();
    if (mp.on) {
      if (tab && amHost(people)) {
        BJ.applyAction(tab, me.id, action, chips);
        persistShoe(tab);
        putTable(tab);
        if (tab.phase === 'done') settleFrom(tab);
        render();
      } else {
        mp.seq += 1;
        putSeat({ action: action, actionT: nowMs(), seq: mp.seq });
      }
      return;
    }
    if (!local) return;
    BJ.applyAction(local, me.id, action, chips);
    if (local.phase === 'done') settleFrom(local);
    render();
  }

  $('deal').onclick = function () {
    if (mp.on) {
      var people = peopleNow();
      if (!amHost(people) && people.length) {
        $('msg').textContent = 'The host deals.';
        return;
      }
      dealTable(people.length ? people : [{ id: me.id, name: me.name }]);
      return;
    }
    startLocal();
  };
  $('hit').onclick = function () { act('hit'); };
  $('stand').onclick = function () { act('stand'); };
  $('double').onclick = function () { act('double'); };
  $('split').onclick = function () { act('split'); };
  $('refill').onclick = function () {
    chips = chips + BJ.REFILL;
    showChips();
    persistChips();
    $('msg').textContent = '200 toy chips. Nothing is paid out.';
    render();
  };

  function onRoom(list) {
    items = list || [];
    var people = peopleNow();
    var rec = tableRec(items);
    if (amHost(people) && hostTable && hostTable.phase === 'play') {
      people.forEach(function (p) {
        if (p.id === me.id) return;
        if (!p.action || !p.seq) return;
        var key = p.id + ':' + p.seq;
        if (applied[key]) return;
        applied[key] = 1;
        BJ.applyAction(hostTable, p.id, p.action, 1e9);
        persistShoe(hostTable);
        putTable(hostTable);
      });
      if (hostTable.phase === 'done') settleFrom(hostTable);
    }
    if (!amHost(people) && rec && rec.phase === 'done') settleFrom(rec);
    render();
  }

  document.addEventListener('keydown', function (e) {
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    var k = e.key;
    if ((k === 'Enter' || k === ' ') && !$('deal').hidden) {
      e.preventDefault();
      $('deal').click();
    } else if ((k === 'h' || k === 'H') && !$('hit').hidden) {
      e.preventDefault();
      $('hit').click();
    } else if ((k === 's' || k === 'S') && !$('stand').hidden) {
      e.preventDefault();
      $('stand').click();
    } else if ((k === 'd' || k === 'D') && !$('double').hidden) {
      e.preventDefault();
      $('double').click();
    } else if ((k === 'p' || k === 'P') && !$('split').hidden) {
      e.preventDefault();
      $('split').click();
    }
  });

  async function boot() {
    if (window.gifos) {
      try {
        var info = await gifos.info();
        owner = !!(info && info.owner);
        var who = await gifos.me();
        if (who) me = who;
      } catch (e) {}
    }
    if (saveDb) {
      try {
        var rec = await saveDb.get('last');
        if (rec && typeof rec.chips === 'number' && rec.chips >= 0) chips = rec.chips;
        if (rec && rec.settled != null) lastSettled = rec.settled;
      } catch (e) {}
      try {
        var sh = await saveDb.get('shoe');
        if (owner && sh && sh.phase === 'play' && sh.shoe && sh.dealer) {
          hostTable = {
            handId: sh.handId, phase: sh.phase, dealer: sh.dealer,
            shoe: sh.shoe, hands: sh.hands, stake: sh.stake || BJ.STAKE, msg: sh.msg
          };
          local = null;
        }
      } catch (e) {}
    }
    showChips();
    if (roomDb) {
      mp.on = true;
      mp.joined = nowMs();
      roomDb.subscribe(onRoom);
      await putSeat();
      hb = setInterval(function () { putSeat(); }, HB_MS);
    }
    render();
  }
  boot();
})();
