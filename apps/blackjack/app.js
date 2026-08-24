// Blackjack table. Dealer in the host browser. Invite is extra seats.
// Toy chips, no cash. The sample API stays behind.
(function () {
  'use strict';
  var BJ = window.BJ;
  var $ = function (id) { return document.getElementById(id); };
  var STAKE = 10, START = 200;
  var chips = START;
  var saveDb = null, roomDb = null;
  var me = { id: 'local', name: 'you' };
  var owner = true;
  var mp = false;
  var local = null; // {shoe, dealer, player, phase}
  var items = [];
  var PRES_TTL = 12000, HB_MS = 3000, hb = 0;

  try {
    if (window.gifos) {
      saveDb = gifos.db('save');
      roomDb = gifos.db('room');
    }
  } catch (e) {}

  function nowMs() { return Date.now ? Date.now() : 0; }
  function live(list) {
    var t = nowMs();
    return (list || []).filter(function (it) {
      return it && it.kind === 'seat' && it.t && (t - it.t) < PRES_TTL;
    });
  }
  function tableRec(list) {
    var i, it;
    for (i = 0; i < (list || []).length; i++) {
      it = list[i];
      if (it && it.kind === 'table') return it;
    }
    return null;
  }
  function isHost(people) {
    if (!people.length) return owner;
    people = people.slice().sort(function (a, b) { return (a.joined || 0) - (b.joined || 0); });
    return people[0].id === me.id;
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
    saveDb.put({ id: 'last', chips: chips }).catch(function () {});
  }
  function settle(result) {
    if (result.winner === 1) chips += result.bj ? Math.floor(STAKE * 1.5) : STAKE;
    else if (result.winner === 0) chips = Math.max(0, chips - STAKE);
    showChips(); persistChips();
  }

  function setButtons(phase, myTurn) {
    $('deal').hidden = phase === 'play';
    $('hit').hidden = !myTurn;
    $('stand').hidden = !myTurn;
  }

  function renderLocal() {
    if (!local) {
      paintHand($('dCards'), []);
      paintHand($('pCards'), []);
      $('dTotal').textContent = '~';
      $('pTotal').textContent = '~';
      setButtons('idle', false);
      return;
    }
    var hide = local.phase === 'play';
    paintHand($('dCards'), local.dealer, hide);
    paintHand($('pCards'), local.player, false);
    $('pTotal').textContent = String(BJ.total(local.player));
    $('dTotal').textContent = hide ? String(local.dealer[0] ? BJ.total([local.dealer[0]]) : '~') : String(BJ.total(local.dealer));
    setButtons(local.phase, local.phase === 'play');
  }

  function startLocal() {
    var shoe = BJ.shuffle(BJ.makeDeck());
    var player = BJ.draw(shoe, 2);
    var dealer = BJ.draw(shoe, 2);
    local = { shoe: shoe, dealer: dealer, player: player, phase: 'play' };
    var nat = BJ.decide(dealer, player);
    if (BJ.isBj(player) || BJ.isBj(dealer)) {
      local.phase = 'done';
      $('msg').textContent = nat.msg;
      settle(nat);
    } else $('msg').textContent = 'Hit or stand.';
    renderLocal();
  }
  function hitLocal() {
    if (!local || local.phase !== 'play') return;
    local.player.push(BJ.draw(local.shoe, 1)[0]);
    if (BJ.total(local.player) > 21) {
      local.phase = 'done';
      var r = BJ.decide(local.dealer, local.player);
      $('msg').textContent = r.msg;
      settle(r);
    }
    renderLocal();
  }
  function standLocal() {
    if (!local || local.phase !== 'play') return;
    BJ.dealerPlay(local.dealer, local.shoe);
    local.phase = 'done';
    var r = BJ.decide(local.dealer, local.player);
    $('msg').textContent = r.msg;
    settle(r);
    renderLocal();
  }

  async function putSeat(extra) {
    extra = extra || {};
    if (!roomDb || !mp) return;
    var rec = { id: me.id, kind: 'seat', name: me.name || 'player', t: nowMs(), joined: extra.joined };
    var k;
    for (k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) rec[k] = extra[k];
    try { await roomDb.put(rec); } catch (e) {}
  }
  async function putTable(rec) {
    if (!roomDb || !mp) return;
    rec.id = 'table';
    rec.kind = 'table';
    rec.t = nowMs();
    rec.host = me.id;
    try { await roomDb.put(rec); } catch (e) {}
  }

  function renderTable(tab, people) {
    if (!tab) {
      renderLocal();
      return;
    }
    var hide = tab.phase === 'play';
    paintHand($('dCards'), tab.dealer || [], hide);
    var mine = (tab.hands && tab.hands[me.id]) || { cards: [] };
    paintHand($('pCards'), mine.cards || [], false);
    $('pTotal').textContent = mine.cards && mine.cards.length ? String(BJ.total(mine.cards)) : '~';
    $('dTotal').textContent = hide && tab.dealer && tab.dealer[0]
      ? String(BJ.total([tab.dealer[0]]))
      : (tab.dealer ? String(BJ.total(tab.dealer)) : '~');
    var myTurn = tab.phase === 'play' && mine.cards && !mine.stood && !mine.bust;
    setButtons(tab.phase === 'play' ? 'play' : 'idle', myTurn);
    $('msg').textContent = tab.msg || (myTurn ? 'Hit or stand.' : 'Waiting.');
    var box = $('seats');
    box.innerHTML = '';
    people.forEach(function (p) {
      if (p.id === me.id) return;
      var h = tab.hands && tab.hands[p.id];
      var row = document.createElement('div');
      row.className = 'seat';
      row.innerHTML = '<div class="name">' + (p.name || 'player') + (h && h.stood ? ' · stand' : '') + '</div>';
      var cards = document.createElement('div');
      cards.className = 'cards';
      paintHand(cards, (h && h.cards) || [], false);
      row.appendChild(cards);
      box.appendChild(row);
    });
  }

  function dealTable(people) {
    var shoe = BJ.shuffle(BJ.makeDeck());
    var dealer = BJ.draw(shoe, 2);
    var hands = {}, i, p;
    for (i = 0; i < people.length; i++) {
      p = people[i];
      hands[p.id] = { cards: BJ.draw(shoe, 2), stood: false, bust: false };
    }
    var tab = { phase: 'play', dealer: dealer, hands: hands, shoe: shoe, msg: 'Hit or stand.' };
    var mine = hands[me.id];
    if (mine && BJ.isBj(mine.cards)) {
      mine.stood = true;
    }
    maybeFinish(tab, people);
    putTable(tab);
  }

  function maybeFinish(tab, people) {
    var ids = Object.keys(tab.hands || {});
    var allDone = ids.every(function (id) {
      var h = tab.hands[id];
      return h.stood || h.bust;
    });
    if (!allDone) return;
    BJ.dealerPlay(tab.dealer, tab.shoe);
    tab.phase = 'done';
    var mine = tab.hands[me.id];
    if (mine) {
      var r = BJ.decide(tab.dealer, mine.cards);
      tab.msg = r.msg;
      settle(r);
    } else tab.msg = 'Dealer ' + BJ.total(tab.dealer);
  }

  function applyAction(tab, people, actorId, action) {
    var h = tab.hands[actorId];
    if (!h || h.stood || h.bust || tab.phase !== 'play') return;
    if (action === 'hit') {
      h.cards.push(BJ.draw(tab.shoe, 1)[0]);
      if (BJ.total(h.cards) > 21) { h.bust = true; h.stood = true; }
    } else if (action === 'stand') {
      h.stood = true;
    }
    maybeFinish(tab, people);
    putTable(tab);
  }

  $('deal').onclick = function () {
    if (mp) {
      var people = live(items);
      if (!isHost(people) && people.length) {
        $('msg').textContent = 'The host deals.';
        return;
      }
      local = null;
      dealTable(people.length ? people : [{ id: me.id, name: me.name }]);
      return;
    }
    startLocal();
  };
  $('hit').onclick = function () {
    if (mp) {
      var tab = tableRec(items);
      var people = live(items);
      if (tab && isHost(people)) applyAction(tab, people, me.id, 'hit');
      else putSeat({ action: 'hit', actionT: nowMs() });
      return;
    }
    hitLocal();
  };
  $('stand').onclick = function () {
    if (mp) {
      var tab = tableRec(items);
      var people = live(items);
      if (tab && isHost(people)) applyAction(tab, people, me.id, 'stand');
      else putSeat({ action: 'stand', actionT: nowMs() });
      return;
    }
    standLocal();
  };

  var lastAct = {};
  function onRoom(list) {
    items = list || [];
    var people = live(items);
    var tab = tableRec(items);
    if (isHost(people) && tab && tab.phase === 'play') {
      people.forEach(function (p) {
        if (p.id === me.id) return;
        if (p.action && p.actionT && lastAct[p.id] !== p.actionT) {
          lastAct[p.id] = p.actionT;
          applyAction(tab, people, p.id, p.action);
        }
      });
    }
    renderTable(tab, people);
  }

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
        if (rec && typeof rec.chips === 'number') chips = rec.chips;
      } catch (e) {}
    }
    showChips();
    if (roomDb) {
      mp = true;
      roomDb.subscribe(onRoom);
      await putSeat({ joined: nowMs() });
      hb = setInterval(function () { putSeat(); }, HB_MS);
    }
    renderLocal();
  }
  boot();
})();
