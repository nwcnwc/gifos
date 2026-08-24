// Destack of hanhaechi/blackjack casino.js + blackjack.js (MIT).
// One 52-card shoe. Toy chips, never cash. Dealer stands on 17 (S17).
(function (g) {
  'use strict';
  var SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
  var VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k', 'a'];
  var GLYPH = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  var RED = { hearts: 1, diamonds: 1 };
  var START = 200, STAKE = 10, REFILL = 200, PRES_TTL = 12000;

  function gameValue(v) {
    if (v === 'a') return 11;
    if (v === 'j' || v === 'q' || v === 'k') return 10;
    return parseInt(v, 10);
  }
  function card(value, suit) {
    return { value: value, suit: suit, game_value: gameValue(value) };
  }
  function makeDeck() {
    var d = [], s, v;
    for (s = 0; s < SUITS.length; s++) {
      for (v = 0; v < VALUES.length; v++) d.push(card(VALUES[v], SUITS[s]));
    }
    return d;
  }
  function shuffle(list, rand) {
    rand = rand || Math.random;
    var a = list.slice(), i, j, t;
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(rand() * (i + 1));
      t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function draw(shoe, n) {
    n = n || 1;
    return shoe.splice(0, n);
  }
  function total(hand) {
    var t = 0, aces = 0, i, v;
    for (i = 0; i < (hand || []).length; i++) {
      v = hand[i].game_value;
      t += v;
      if (v === 11) aces++;
    }
    while (t > 21 && aces > 0) { t -= 10; aces--; }
    return t;
  }
  function isSoft(hand) {
    var t = 0, aces = 0, i, v;
    for (i = 0; i < (hand || []).length; i++) {
      v = hand[i].game_value;
      t += v;
      if (v === 11) aces++;
    }
    while (t > 21 && aces > 0) { t -= 10; aces--; }
    return aces > 0 && t <= 21;
  }
  function isBj(hand) { return hand && hand.length === 2 && total(hand) === 21; }
  function isPair(hand) {
    return !!(hand && hand.length === 2 && hand[0].value === hand[1].value);
  }
  function totalLabel(hand) {
    if (!hand || !hand.length) return '~';
    var t = total(hand);
    if (t >= 21) return String(t);
    return isSoft(hand) ? 'soft ' + t : String(t);
  }
  function label(c) {
    var v = c.value === '10' ? '10' : String(c.value).toUpperCase();
    return v + GLYPH[c.suit];
  }

  // winner: 0 dealer, 1 player, 2 push. Natural 21 only (two cards) is bj.
  function decide(dealer, player) {
    var dt = total(dealer), pt = total(player);
    if (pt > 21) return { winner: 0, tag: 'bust', pt: pt, dt: dt };
    if (dt > 21) return { winner: 1, tag: 'dealer-bust', pt: pt, dt: dt };
    var pbj = isBj(player), dbj = isBj(dealer);
    if (pbj && !dbj) return { winner: 1, tag: 'bj', bj: true, pt: pt, dt: dt };
    if (dbj && !pbj) return { winner: 0, tag: 'dealer-bj', pt: pt, dt: dt };
    if (pbj && dbj) return { winner: 2, tag: 'push-bj', pt: pt, dt: dt };
    if (dt > pt) return { winner: 0, tag: 'lose', pt: pt, dt: dt };
    if (pt > dt) return { winner: 1, tag: 'win', pt: pt, dt: dt };
    return { winner: 2, tag: 'push', pt: pt, dt: dt };
  }
  // 3:2 on a natural. Even money otherwise. Push is 0. Loss is −bet.
  function chipDelta(bet, r) {
    bet = bet || STAKE;
    if (r.winner === 1) return r.bj ? Math.floor(bet * 3 / 2) : bet;
    if (r.winner === 0) return -bet;
    return 0;
  }
  function applyDeltas(chips, deltas) {
    var n = chips, i;
    for (i = 0; i < (deltas || []).length; i++) n += deltas[i];
    return n < 0 ? 0 : n;
  }
  function dealerPlay(dealer, shoe) {
    while (total(dealer) <= 16) dealer.push(draw(shoe, 1)[0]);
    return dealer;
  }

  function canDeal(chips, stake) {
    stake = stake == null ? STAKE : stake;
    return chips >= stake;
  }
  function myHands(tab, pid) {
    return (tab.hands || []).filter(function (h) { return h.pid === pid; });
  }
  function myExposure(tab, pid) {
    return myHands(tab, pid).reduce(function (s, h) { return s + (h.bet || 0); }, 0);
  }
  function activeHand(tab, pid) {
    var i, h;
    if (!tab || tab.phase !== 'play') return null;
    for (i = 0; i < (tab.hands || []).length; i++) {
      h = tab.hands[i];
      if (h.pid === pid && !h.stood && !h.bust) return h;
    }
    return null;
  }
  function canDouble(tab, pid, chips) {
    var h = activeHand(tab, pid);
    if (!h || h.cards.length !== 2 || h.doubled) return false;
    return chips >= myExposure(tab, pid) + h.bet;
  }
  function canSplit(tab, pid, chips) {
    var hs = myHands(tab, pid);
    if (hs.length !== 1) return false;
    var h = hs[0];
    if (!h || h.cards.length !== 2 || h.doubled || h.fromSplit || !isPair(h.cards)) return false;
    if (h.stood || h.bust) return false;
    return chips >= myExposure(tab, pid) + h.bet;
  }

  function emptyHand(p, stake) {
    return {
      pid: p.id, name: p.name || 'player', cards: [],
      stood: false, bust: false, doubled: false, fromSplit: false,
      bet: stake
    };
  }

  function finishIfDone(tab) {
    if (!tab || tab.phase !== 'play') return;
    var all = (tab.hands || []).every(function (h) { return h.stood || h.bust; });
    if (!all) return;
    var needDealer = tab.hands.some(function (h) { return !h.bust && !isBj(h.cards); });
    if (needDealer && !isBj(tab.dealer)) dealerPlay(tab.dealer, tab.shoe);
    tab.phase = 'done';
    tab.msg = summarize(tab);
  }

  function createTable(opts) {
    opts = opts || {};
    var stake = opts.stake == null ? STAKE : opts.stake;
    var players = opts.players && opts.players.length
      ? opts.players
      : [{ id: 'you', name: 'you' }];
    var shoe = opts.shoe ? opts.shoe.slice() : shuffle(makeDeck(), opts.rand || Math.random);
    var hands = [], dealer = [], i;
    for (i = 0; i < players.length; i++) hands.push(emptyHand(players[i], stake));
    for (i = 0; i < hands.length; i++) hands[i].cards.push(draw(shoe, 1)[0]);
    dealer.push(draw(shoe, 1)[0]);
    for (i = 0; i < hands.length; i++) hands[i].cards.push(draw(shoe, 1)[0]);
    dealer.push(draw(shoe, 1)[0]);
    var tab = {
      handId: opts.handId || 1,
      phase: 'play',
      dealer: dealer,
      shoe: shoe,
      hands: hands,
      stake: stake,
      msg: 'Hit, stand, or double.'
    };
    var dbj = isBj(dealer);
    for (i = 0; i < hands.length; i++) {
      if (isBj(hands[i].cards) || dbj) hands[i].stood = true;
    }
    finishIfDone(tab);
    if (tab.phase === 'play' && !tab.msg) tab.msg = 'Hit, stand, or double.';
    return tab;
  }

  function hit(tab, pid) {
    var h = activeHand(tab, pid);
    if (!h) return false;
    h.cards.push(draw(tab.shoe, 1)[0]);
    if (total(h.cards) > 21) { h.bust = true; h.stood = true; }
    finishIfDone(tab);
    return true;
  }
  function stand(tab, pid) {
    var h = activeHand(tab, pid);
    if (!h) return false;
    h.stood = true;
    finishIfDone(tab);
    return true;
  }
  function double(tab, pid, chips) {
    var h = activeHand(tab, pid);
    if (!canDouble(tab, pid, chips)) return false;
    h.bet *= 2;
    h.doubled = true;
    h.cards.push(draw(tab.shoe, 1)[0]);
    if (total(h.cards) > 21) h.bust = true;
    h.stood = true;
    finishIfDone(tab);
    return true;
  }
  function split(tab, pid, chips) {
    if (!canSplit(tab, pid, chips)) return false;
    var h = activeHand(tab, pid);
    var card2 = h.cards.pop();
    var h2 = emptyHand({ id: h.pid, name: h.name }, h.bet);
    h2.cards = [card2];
    h2.fromSplit = true;
    h.fromSplit = true;
    h.cards.push(draw(tab.shoe, 1)[0]);
    h2.cards.push(draw(tab.shoe, 1)[0]);
    var idx = tab.hands.indexOf(h);
    tab.hands.splice(idx + 1, 0, h2);
    if (h.cards[0].value === 'a') {
      h.stood = true;
      h2.stood = true;
    }
    finishIfDone(tab);
    return true;
  }
  function applyAction(tab, pid, action, chips) {
    if (action === 'hit') return hit(tab, pid);
    if (action === 'stand') return stand(tab, pid);
    if (action === 'double') return double(tab, pid, chips);
    if (action === 'split') return split(tab, pid, chips);
    return false;
  }

  function resultForHand(tab, h) {
    var r = decide(tab.dealer, h.cards);
    if (h.fromSplit && r.bj) {
      r = { winner: 1, tag: 'win', pt: r.pt, dt: r.dt };
    } else if (h.fromSplit && r.tag === 'push-bj') {
      r = { winner: 2, tag: 'push', pt: r.pt, dt: r.dt };
    }
    r.bet = h.bet;
    r.delta = chipDelta(h.bet, r);
    r.doubled = !!h.doubled;
    r.fromSplit = !!h.fromSplit;
    return r;
  }
  function resultsFor(tab, pid) {
    return myHands(tab, pid).map(function (h) { return resultForHand(tab, h); });
  }
  function netFor(tab, pid) {
    return resultsFor(tab, pid).reduce(function (s, r) { return s + r.delta; }, 0);
  }
  function say(r) {
    if (r.tag === 'bust') return 'You busted.';
    if (r.tag === 'dealer-bust') return 'Dealer busted. You ' + r.pt + ':' + r.dt;
    if (r.tag === 'bj') return 'Blackjack. Pays 3:2.';
    if (r.tag === 'dealer-bj') return 'Dealer blackjack.';
    if (r.tag === 'push-bj') return 'Two blackjacks. Push.';
    if (r.tag === 'win') return 'You ' + r.pt + ':' + r.dt;
    if (r.tag === 'lose') return 'Dealer ' + r.dt + ':' + r.pt;
    return 'Push ' + r.pt;
  }
  function summarize(tab) {
    if (!tab.hands || tab.hands.length === 1) {
      return say(resultForHand(tab, tab.hands[0]));
    }
    return 'Dealer ' + total(tab.dealer) + '.';
  }

  function liveSeats(list, now, ttl) {
    now = now == null ? (Date.now ? Date.now() : 0) : now;
    ttl = ttl == null ? PRES_TTL : ttl;
    return (list || []).filter(function (it) {
      return it && it.kind === 'seat' && it.id && it.at && (now - it.at) < ttl;
    }).slice().sort(function (a, b) { return (a.joined || 0) - (b.joined || 0); });
  }
  function hostId(people, fallback) {
    if (!people || !people.length) return fallback || null;
    return people[0].id;
  }
  function publicTable(tab) {
    if (!tab) return null;
    return {
      handId: tab.handId,
      phase: tab.phase,
      dealer: tab.dealer,
      hands: tab.hands,
      stake: tab.stake,
      msg: tab.msg
    };
  }

  g.BJ = {
    SUITS: SUITS, VALUES: VALUES, GLYPH: GLYPH, RED: RED,
    START: START, STAKE: STAKE, REFILL: REFILL, PRES_TTL: PRES_TTL,
    card: card, makeDeck: makeDeck, shuffle: shuffle, draw: draw,
    total: total, isSoft: isSoft, isBj: isBj, isPair: isPair,
    totalLabel: totalLabel, label: label,
    decide: decide, chipDelta: chipDelta, applyDeltas: applyDeltas,
    dealerPlay: dealerPlay,
    canDeal: canDeal, canDouble: canDouble, canSplit: canSplit,
    createTable: createTable, activeHand: activeHand, myHands: myHands,
    myExposure: myExposure,
    hit: hit, stand: stand, double: double, split: split, applyAction: applyAction,
    finishIfDone: finishIfDone, resultForHand: resultForHand,
    resultsFor: resultsFor, netFor: netFor, say: say, summarize: summarize,
    liveSeats: liveSeats, hostId: hostId, publicTable: publicTable
  };
})(typeof window !== 'undefined' ? window : globalThis);
