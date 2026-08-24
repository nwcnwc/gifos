// Texas Hold'em engine. Destack of Pobermeier/vintage-poker Table.js (MIT).
// Their Node hall, the wallet, and the React SPA stay behind.
(function (g) {
  'use strict';

  var SUITS = ['s', 'h', 'd', 'c'];
  var GLYPH = { s: '♠', h: '♥', d: '♦', c: '♣' };
  var RED = { h: 1, d: 1 };
  var RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
  var RANK_CH = { 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  var CAT_NAME = [
    'high card', 'pair', 'two pair', 'three of a kind', 'straight',
    'flush', 'full house', 'four of a kind', 'straight flush', 'royal flush'
  ];
  var SB = 5, BB = 10, START = 1000, MAX = 6;

  function rankCh(r) { return RANK_CH[r] || String(r); }
  function label(c) { return rankCh(c.r) + GLYPH[c.s]; }
  function cloneCard(c) { return { r: c.r, s: c.s }; }
  function actMsg(s, they, you) {
    return (s && s.name === 'You') ? ('You ' + you) : ((s && s.name || 'Player') + ' ' + they);
  }

  function makeDeck() {
    var d = [], s, r;
    for (s = 0; s < SUITS.length; s++) {
      for (r = 0; r < RANKS.length; r++) d.push({ r: RANKS[r], s: SUITS[s] });
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
  function draw(deck) { return deck.length ? deck.pop() : null; }

  function combos5(cards) {
    var out = [], n = cards.length, a, b, c, d, e;
    for (a = 0; a < n - 4; a++) for (b = a + 1; b < n - 3; b++)
      for (c = b + 1; c < n - 2; c++) for (d = c + 1; d < n - 1; d++)
        for (e = d + 1; e < n; e++) out.push([cards[a], cards[b], cards[c], cards[d], cards[e]]);
    return out;
  }

  // 5-card score: category in the high nibble-group, then kickers.
  function eval5(cards) {
    var ranks = [cards[0].r, cards[1].r, cards[2].r, cards[3].r, cards[4].r];
    ranks.sort(function (a, b) { return b - a; });
    var flush = cards[0].s === cards[1].s && cards[1].s === cards[2].s &&
      cards[2].s === cards[3].s && cards[3].s === cards[4].s;
    var counts = {}, i, r;
    for (i = 0; i < 5; i++) { r = ranks[i]; counts[r] = (counts[r] || 0) + 1; }
    var uniq = [];
    for (i = 0; i < 5; i++) if (uniq.indexOf(ranks[i]) < 0) uniq.push(ranks[i]);
    var straight = false, top = 0;
    if (uniq.length === 5) {
      if (uniq[0] - uniq[4] === 4) { straight = true; top = uniq[0]; }
      else if (uniq[0] === 14 && uniq[1] === 5 && uniq[2] === 4 && uniq[3] === 3 && uniq[4] === 2) {
        straight = true; top = 5;
      }
    }
    var groups = Object.keys(counts).map(Number);
    groups.sort(function (a, b) { return counts[b] - counts[a] || b - a; });
    var cat, kick;
    if (straight && flush) {
      cat = top === 14 ? 9 : 8;
      kick = [top, 0, 0, 0, 0];
    } else if (counts[groups[0]] === 4) {
      cat = 7; kick = [groups[0], groups[1], 0, 0, 0];
    } else if (counts[groups[0]] === 3 && counts[groups[1]] === 2) {
      cat = 6; kick = [groups[0], groups[1], 0, 0, 0];
    } else if (flush) {
      cat = 5; kick = ranks;
    } else if (straight) {
      cat = 4; kick = [top, 0, 0, 0, 0];
    } else if (counts[groups[0]] === 3) {
      cat = 3; kick = [groups[0], groups[1], groups[2], 0, 0];
    } else if (counts[groups[0]] === 2 && counts[groups[1]] === 2) {
      cat = 2; kick = [groups[0], groups[1], groups[2], 0, 0];
    } else if (counts[groups[0]] === 2) {
      cat = 1; kick = [groups[0], groups[1], groups[2], groups[3], 0];
    } else {
      cat = 0; kick = ranks;
    }
    var score = cat;
    for (i = 0; i < 5; i++) score = score * 16 + (kick[i] || 0);
    return { score: score, cat: cat, name: CAT_NAME[cat], kick: kick };
  }

  function eval7(hole, board) {
    var all = (hole || []).concat(board || []).filter(function (c) { return c && c.r; });
    if (all.length < 5) {
      while (all.length < 5) all.push({ r: 0, s: 's' });
      return eval5(all.slice(0, 5));
    }
    if (all.length === 5) return eval5(all);
    var sets = [], i, set, e, best = null;
    if (all.length === 6) {
      for (i = 0; i < 6; i++) { set = all.slice(); set.splice(i, 1); sets.push(set); }
    } else {
      sets = combos5(all);
    }
    for (i = 0; i < sets.length; i++) {
      e = eval5(sets[i]);
      if (!best || e.score > best.score) best = e;
    }
    return best;
  }

  function emptySeat(i) {
    return {
      i: i, id: null, name: '', stack: 0, bet: 0, contrib: 0,
      folded: true, allIn: false, sittingOut: true, hand: [],
      lastAction: null, acted: false, isBot: false
    };
  }

  function newTable() {
    var seats = [], i;
    for (i = 0; i < MAX; i++) seats.push(emptySeat(i));
    return {
      phase: 'idle', board: [], pot: 0, toAct: null, dealer: 0,
      streetBet: 0, minRaise: BB, deck: [], seats: seats,
      winners: [], msg: 'Toy chips. No cash.', handNo: 0, sb: SB, bb: BB
    };
  }

  function liveSeats(t) {
    return t.seats.filter(function (s) { return s.id && !s.sittingOut && s.stack > 0; });
  }
  function unfolded(t) {
    return t.seats.filter(function (s) { return s.id && !s.sittingOut && !s.folded; });
  }
  function canActSeats(t) {
    return t.seats.filter(function (s) {
      return s.id && !s.sittingOut && !s.folded && !s.allIn;
    });
  }
  function nextLive(t, from, pred) {
    var i, n = MAX, idx;
    from = from == null ? MAX - 1 : from;
    for (i = 1; i <= n; i++) {
      idx = (from + i) % n;
      if (pred(t.seats[idx])) return idx;
    }
    return -1;
  }
  function seatById(t, id) {
    var i;
    for (i = 0; i < t.seats.length; i++) if (t.seats[i].id === id) return i;
    return -1;
  }
  function rebuy(t, id, amt) {
    var i = seatById(t, id), s;
    if (i < 0) return false;
    s = t.seats[i];
    amt = amt | 0;
    if (amt <= 0) return false;
    s.stack += amt;
    if (s.stack > 0) s.sittingOut = false;
    return true;
  }

  function sit(t, id, name, stack, isBot) {
    var i, s;
    for (i = 0; i < MAX; i++) if (t.seats[i].id === id) return t.seats[i].i;
    for (i = 0; i < MAX; i++) {
      s = t.seats[i];
      if (!s.id) {
        s.id = id; s.name = name || 'Player'; s.stack = stack == null ? START : stack;
        s.sittingOut = false; s.folded = true; s.isBot = !!isBot;
        s.bet = 0; s.contrib = 0; s.hand = []; s.allIn = false; s.lastAction = null;
        return i;
      }
    }
    return -1;
  }

  function stand(t, id) {
    var i, s;
    for (i = 0; i < MAX; i++) {
      s = t.seats[i];
      if (s.id === id) {
        t.seats[i] = emptySeat(i);
        if (t.phase !== 'idle' && t.phase !== 'showdown') {
          if (unfolded(t).length <= 1) endWithoutShowdown(t);
        }
        return;
      }
    }
  }

  function post(s, amt) {
    var n = Math.min(amt, s.stack);
    s.stack -= n; s.bet += n; s.contrib += n;
    if (s.stack === 0) s.allIn = true;
    return n;
  }

  function startHand(t, rand) {
    var live = liveSeats(t);
    if (live.length < 2) {
      t.msg = 'Need two seats to deal.';
      return false;
    }
    t.handNo++;
    t.board = []; t.pot = 0; t.winners = []; t.streetBet = 0; t.minRaise = BB;
    t.deck = shuffle(makeDeck(), rand);
    t.seats.forEach(function (s) {
      s.bet = 0; s.contrib = 0; s.folded = !s.id || s.sittingOut || s.stack <= 0;
      s.allIn = false; s.hand = []; s.lastAction = null; s.acted = false;
      if (s.stack <= 0 && s.id) s.sittingOut = true;
    });
    live = liveSeats(t);
    if (live.length < 2) { t.phase = 'idle'; t.msg = 'Need two stacks.'; return false; }
    // First hand: button on the first live seat. Later hands: it moves.
    t.dealer = nextLive(t, t.handNo === 1 ? MAX - 1 : t.dealer, function (s) {
      return s.id && !s.sittingOut && s.stack > 0;
    });
    var heads = live.length === 2;
    var sbI, bbI;
    if (heads) {
      sbI = t.dealer;
      bbI = nextLive(t, t.dealer, function (s) { return s.id && !s.sittingOut && s.stack > 0; });
    } else {
      sbI = nextLive(t, t.dealer, function (s) { return s.id && !s.sittingOut && s.stack > 0; });
      bbI = nextLive(t, sbI, function (s) { return s.id && !s.sittingOut && s.stack > 0; });
    }
    t.pot += post(t.seats[sbI], SB);
    t.pot += post(t.seats[bbI], BB);
    t.seats[sbI].lastAction = 'SB';
    t.seats[bbI].lastAction = 'BB';
    t.streetBet = BB;
    // deal 2 cards, starting left of dealer
    var k, idx;
    for (k = 0; k < 2; k++) {
      idx = t.dealer;
      do {
        idx = nextLive(t, idx, function (s) { return s.id && !s.sittingOut && !s.folded; });
        if (idx < 0) break;
        t.seats[idx].hand.push(draw(t.deck));
      } while (idx !== t.dealer);
    }
    t.phase = 'preflop';
    // first to act: left of BB (UTG); heads-up: the SB/dealer
    t.toAct = heads ? sbI : nextLive(t, bbI, function (s) {
      return s.id && !s.sittingOut && !s.folded && !s.allIn;
    });
    t.seats.forEach(function (s) { s.acted = false; });
    t.msg = 'Preflop. Blinds ' + SB + '/' + BB + '.';
    return true;
  }

  function canAct(t, seatI) {
    return t.phase !== 'idle' && t.phase !== 'showdown' && t.toAct === seatI;
  }

  function legal(t, seatI) {
    var s = t.seats[seatI];
    if (!s || !canAct(t, seatI)) return { fold: false, check: false, call: 0, raiseTo: 0, minRaiseTo: 0 };
    var toCall = t.streetBet - s.bet;
    var check = toCall <= 0;
    var call = toCall > 0 ? Math.min(toCall, s.stack) : 0;
    var minRaiseTo = t.streetBet + t.minRaise;
    if (minRaiseTo < t.streetBet + BB) minRaiseTo = t.streetBet + BB;
    var raiseTo = s.stack + s.bet;
    var canRaise = raiseTo > t.streetBet && s.stack > toCall;
    return {
      fold: true,
      check: check,
      call: call,
      raiseTo: canRaise ? raiseTo : 0,
      minRaiseTo: canRaise ? Math.min(minRaiseTo, raiseTo) : 0,
      toCall: toCall
    };
  }

  function applyAction(t, seatI, kind, amount) {
    var s = t.seats[seatI];
    var L = legal(t, seatI);
    if (!L.fold) return false;
    kind = String(kind || '').toLowerCase();
    if (kind === 'fold') {
      s.folded = true; s.lastAction = 'fold'; s.acted = true;
      t.msg = actMsg(s, 'folds.', 'fold.');
    } else if (kind === 'check') {
      if (!L.check) return false;
      s.lastAction = 'check'; s.acted = true;
      t.msg = actMsg(s, 'checks.', 'check.');
    } else if (kind === 'call') {
      if (L.toCall <= 0) {
        if (!L.check) return false;
        s.lastAction = 'check'; s.acted = true;
        t.msg = actMsg(s, 'checks.', 'check.');
      } else {
        t.pot += post(s, L.toCall);
        s.lastAction = s.allIn ? 'all-in' : 'call';
        s.acted = true;
        t.msg = s.allIn ? actMsg(s, 'is all-in.', 'are all-in.') : actMsg(s, 'calls.', 'call.');
      }
    } else if (kind === 'raise') {
      amount = amount | 0;
      if (!L.raiseTo) return false;
      if (amount < L.minRaiseTo) amount = L.minRaiseTo;
      if (amount > L.raiseTo) amount = L.raiseTo;
      var add = amount - s.bet;
      if (add <= 0) return false;
      var raiseBy = amount - t.streetBet;
      t.pot += post(s, add);
      if (amount > t.streetBet) {
        t.minRaise = Math.max(BB, raiseBy);
        t.streetBet = amount;
        t.seats.forEach(function (o) {
          if (o.i !== s.i && o.id && !o.folded && !o.allIn) o.acted = false;
        });
      }
      s.lastAction = s.allIn ? 'all-in' : 'raise';
      s.acted = true;
      t.msg = s.allIn
        ? actMsg(s, 'is all-in for ' + amount + '.', 'are all-in for ' + amount + '.')
        : actMsg(s, 'raises to ' + amount + '.', 'raise to ' + amount + '.');
    } else {
      return false;
    }
    advance(t);
    return true;
  }

  function stillToAct(t) {
    return t.seats.filter(function (s) {
      return s.id && !s.sittingOut && !s.folded && !s.allIn && !s.acted;
    });
  }

  function dealBoard(t, n) {
    var i;
    draw(t.deck); // burn
    for (i = 0; i < n; i++) t.board.push(draw(t.deck));
  }

  function nextStreet(t) {
    t.seats.forEach(function (s) { s.bet = 0; s.acted = false; s.lastAction = s.folded ? s.lastAction : null; });
    t.streetBet = 0;
    t.minRaise = BB;
    if (t.phase === 'preflop') { dealBoard(t, 3); t.phase = 'flop'; t.msg = 'Flop.'; }
    else if (t.phase === 'flop') { dealBoard(t, 1); t.phase = 'turn'; t.msg = 'Turn.'; }
    else if (t.phase === 'turn') { dealBoard(t, 1); t.phase = 'river'; t.msg = 'River.'; }
    else { showdown(t); return; }
    // One player left with chips against all-ins: no more betting, run it out.
    if (canActSeats(t).length < 2) {
      nextStreet(t);
      return;
    }
    var first = nextLive(t, t.dealer, function (s) {
      return s.id && !s.sittingOut && !s.folded && !s.allIn;
    });
    t.toAct = first;
  }

  function endWithoutShowdown(t) {
    var u = unfolded(t);
    t.toAct = null;
    t.phase = 'showdown';
    if (u.length === 1) {
      u[0].stack += t.pot;
      t.winners = [{ i: u[0].i, name: u[0].name, amount: t.pot, nameHand: 'uncontested' }];
      t.msg = actMsg(u[0], 'wins ' + t.pot + '.', 'win ' + t.pot + '.');
    } else {
      t.winners = [];
      t.msg = 'Hand over.';
    }
    t.pot = 0;
    t.seats.forEach(function (s) { s.bet = 0; });
  }

  function showdown(t) {
    t.phase = 'showdown';
    t.toAct = null;
    var contribs = t.seats.filter(function (s) { return s.contrib > 0; });
    var levels = [], seen = {}, i, s, lvl, prev = 0, layerPot, eligible, ranked, best, champs, share, rem;
    for (i = 0; i < contribs.length; i++) {
      lvl = contribs[i].contrib;
      if (!seen[lvl]) { seen[lvl] = 1; levels.push(lvl); }
    }
    levels.sort(function (a, b) { return a - b; });
    t.winners = [];
    for (i = 0; i < levels.length; i++) {
      lvl = levels[i];
      layerPot = 0;
      t.seats.forEach(function (seat) { if (seat.contrib >= lvl) layerPot += (lvl - prev); });
      prev = lvl;
      eligible = t.seats.filter(function (seat) {
        return seat.id && !seat.folded && !seat.sittingOut && seat.contrib >= lvl;
      });
      if (!eligible.length || layerPot <= 0) continue;
      if (eligible.length === 1) {
        eligible[0].stack += layerPot;
        if (t.seats.filter(function (seat) { return seat.contrib >= lvl; }).length > 1) {
          t.winners.push({
            i: eligible[0].i, name: eligible[0].name, amount: layerPot,
            nameHand: 'uncontested', score: 0
          });
        }
        continue;
      }
      ranked = eligible.map(function (seat) {
        return { seat: seat, eval: eval7(seat.hand, t.board) };
      });
      ranked.sort(function (a, b) { return b.eval.score - a.eval.score; });
      best = ranked[0].eval.score;
      champs = ranked.filter(function (x) { return x.eval.score === best; });
      share = Math.floor(layerPot / champs.length);
      rem = layerPot - share * champs.length;
      champs.forEach(function (c, n) {
        var amt = share + (n === 0 ? rem : 0);
        c.seat.stack += amt;
        t.winners.push({
          i: c.seat.i, name: c.seat.name, amount: amt,
          nameHand: c.eval.name, score: c.eval.score
        });
      });
    }
    // Merge side-pot slices per seat so the banner names each winner once.
    var merged = {}, key, w, list = [];
    for (i = 0; i < t.winners.length; i++) {
      w = t.winners[i];
      key = String(w.i);
      if (!merged[key]) merged[key] = { i: w.i, name: w.name, amount: 0, nameHand: w.nameHand, score: w.score };
      merged[key].amount += w.amount;
    }
    for (key in merged) if (Object.prototype.hasOwnProperty.call(merged, key)) list.push(merged[key]);
    t.winners = list;
    t.msg = t.winners.length
      ? t.winners.map(function (win) {
        var they = 'wins ' + win.amount + ' with ' + win.nameHand;
        var you = 'win ' + win.amount + ' with ' + win.nameHand;
        return win.name === 'You' ? ('You ' + you) : (win.name + ' ' + they);
      }).join('. ') + '.'
      : 'Hand over.';
    t.pot = 0;
    t.seats.forEach(function (s) { s.bet = 0; });
  }

  function advance(t) {
    var u = unfolded(t);
    if (u.length <= 1) { endWithoutShowdown(t); return; }
    var pending = stillToAct(t);
    if (pending.length === 0) {
      if (t.phase === 'river') showdown(t);
      else nextStreet(t);
      return;
    }
    var nxt = nextLive(t, t.toAct, function (s) {
      return s.id && !s.sittingOut && !s.folded && !s.allIn && !s.acted;
    });
    t.toAct = nxt;
  }

  function botKind(t, seatI) {
    var s = t.seats[seatI];
    var L = legal(t, seatI);
    if (!L.fold) return null;
    var hole = s.hand || [];
    var board = t.board || [];
    var score = 0;
    if (hole.length === 2) {
      var a = hole[0].r, b = hole[1].r;
      var pair = a === b;
      var suited = hole[0].s === hole[1].s;
      var hi = Math.max(a, b), lo = Math.min(a, b);
      if (pair && a >= 11) score = 4;
      else if (pair) score = 3;
      else if (hi >= 13 && lo >= 11) score = 3;
      else if (suited && hi >= 12) score = 2;
      else if (hi >= 12) score = 2;
      else if (hi >= 10) score = 1;
    }
    if (board.length >= 3 && hole.length === 2) {
      var e = eval7(hole, board);
      if (e.cat >= 3) score = 4;
      else if (e.cat >= 1) score = 3;
      else score = Math.max(score, 1);
    }
    if (L.toCall > 0) {
      if (score <= 0 && L.toCall >= BB * 2) return { kind: 'fold' };
      if (score <= 1 && L.toCall > s.stack / 4) return { kind: 'fold' };
      if (score >= 4 && L.raiseTo) {
        return { kind: 'raise', amount: Math.min(L.raiseTo, L.minRaiseTo + BB * 2) };
      }
      return { kind: 'call' };
    }
    if (score >= 3 && L.raiseTo) {
      return { kind: 'raise', amount: L.minRaiseTo };
    }
    return { kind: 'check' };
  }

  function publicTable(t, viewerId, showAll) {
    var out = {
      phase: t.phase, board: t.board.map(cloneCard), pot: t.pot,
      toAct: t.toAct, dealer: t.dealer, streetBet: t.streetBet,
      minRaise: t.minRaise, winners: t.winners, msg: t.msg, handNo: t.handNo,
      sb: t.sb, bb: t.bb,
      seats: t.seats.map(function (s) {
        var show = showAll || t.phase === 'showdown' || s.id === viewerId;
        return {
          i: s.i, id: s.id, name: s.name, stack: s.stack, bet: s.bet,
          folded: s.folded, allIn: s.allIn, sittingOut: s.sittingOut,
          lastAction: s.lastAction, isBot: s.isBot,
          hand: (show && s.hand) ? s.hand.map(cloneCard) : (s.hand && s.hand.length ? [{}, {}] : [])
        };
      })
    };
    return out;
  }

  g.PK = {
    SUITS: SUITS, GLYPH: GLYPH, RED: RED, SB: SB, BB: BB, START: START, MAX: MAX,
    makeDeck: makeDeck, shuffle: shuffle, draw: draw,
    eval5: eval5, eval7: eval7, label: label, rankCh: rankCh,
    newTable: newTable, sit: sit, stand: stand, startHand: startHand,
    legal: legal, applyAction: applyAction, botKind: botKind,
    liveSeats: liveSeats, unfolded: unfolded, publicTable: publicTable,
    canAct: canAct, cloneCard: cloneCard, seatById: seatById, rebuy: rebuy,
    canActSeats: canActSeats
  };
})(typeof window !== 'undefined' ? window : globalThis);
