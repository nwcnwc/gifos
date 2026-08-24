// Destack of hanhaechi/blackjack casino.js + blackjack.js (MIT).
// One 52-card shoe (not the original 5-deck shoe — same ranks, smaller).
(function (g) {
  'use strict';
  var SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
  var VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k', 'a'];
  var GLYPH = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  var RED = { hearts: 1, diamonds: 1 };

  function gameValue(v) {
    if (v === 'a') return 11;
    if (v === 'j' || v === 'q' || v === 'k') return 10;
    return parseInt(v, 10);
  }
  function makeDeck() {
    var d = [], s, v;
    for (s = 0; s < SUITS.length; s++) {
      for (v = 0; v < VALUES.length; v++) {
        d.push({ value: VALUES[v], suit: SUITS[s], game_value: gameValue(VALUES[v]) });
      }
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
    for (i = 0; i < hand.length; i++) {
      v = hand[i].game_value;
      t += v;
      if (v === 11) aces++;
    }
    while (t > 21 && aces > 0) { t -= 10; aces--; }
    return t;
  }
  function isBj(hand) { return hand.length === 2 && total(hand) === 21; }

  // winner: 0 dealer, 1 player, 2 push
  function decide(dealer, player) {
    var dt = total(dealer), pt = total(player);
    if (pt > 21) return { winner: 0, msg: 'You busted. Dealer ' + dt + ':' + pt };
    if (dt > 21) return { winner: 1, msg: 'Dealer busted. You ' + pt + ':' + dt };
    if (isBj(player) && !isBj(dealer)) return { winner: 1, msg: 'Blackjack.', bj: true };
    if (isBj(dealer) && !isBj(player)) return { winner: 0, msg: 'Dealer blackjack.' };
    if (isBj(player) && isBj(dealer)) return { winner: 2, msg: 'Two blackjacks. Push.' };
    if (dt > pt) return { winner: 0, msg: 'Dealer ' + dt + ':' + pt };
    if (pt > dt) return { winner: 1, msg: 'You ' + pt + ':' + dt };
    return { winner: 2, msg: 'Push ' + pt };
  }
  function dealerPlay(dealer, shoe) {
    while (total(dealer) <= 16) dealer.push(draw(shoe, 1)[0]);
    return dealer;
  }

  g.BJ = {
    SUITS: SUITS, GLYPH: GLYPH, RED: RED,
    makeDeck: makeDeck, shuffle: shuffle, draw: draw,
    total: total, isBj: isBj, decide: decide, dealerPlay: dealerPlay,
    label: function (c) {
      var v = c.value === '10' ? '10' : String(c.value).toUpperCase();
      return v + GLYPH[c.suit];
    }
  };
})(window);
