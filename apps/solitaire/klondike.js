// Klondike rules, no DOM. Snapshot shape matches the 1.0 save
// ({ id, cards, desk, finish, pile, waste }) so an in-progress tableau still loads.
(function (g) {
  'use strict';
  var TYPES = ['c', 'd', 'h', 's'];
  var COLORS = { c: 0, d: 1, h: 1, s: 0 };
  var SUITS = { c: '♣', d: '♦', h: '♥', s: '♠' };
  var NAMES = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  var SUIT_CLASS = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };

  function rankName(n) { return NAMES[n] || String(n); }

  function fisherYates(arr, rand) {
    rand = rand || Math.random;
    var i, j, t;
    for (i = arr.length - 1; i > 0; i--) {
      j = Math.floor(rand() * (i + 1));
      t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function freshCards() {
    var cards = [], t, n;
    for (t = 0; t < 4; t++) {
      for (n = 1; n <= 13; n++) {
        cards.push({ type: TYPES[t], number: n, facingUp: false });
      }
    }
    return cards;
  }

  function empty() {
    return {
      cards: freshCards(),
      desk: [[], [], [], [], [], [], []],
      finish: [[], [], [], []],
      pile: [],
      waste: [],
      draw: 3,
      score: 0,
      moves: 0,
      elapsed: 0,
      won: false,
      history: []
    };
  }

  function copyCards(cards) {
    return cards.map(function (c) {
      return { type: c.type, number: c.number, facingUp: !!c.facingUp };
    });
  }

  function clonePlay(s) {
    return {
      cards: copyCards(s.cards),
      desk: s.desk.map(function (d) { return d.slice(); }),
      finish: s.finish.map(function (d) { return d.slice(); }),
      pile: s.pile.slice(),
      waste: s.waste.slice(),
      draw: s.draw,
      score: s.score,
      moves: s.moves,
      elapsed: s.elapsed,
      won: !!s.won
    };
  }

  function snapshot(s) {
    var o = clonePlay(s);
    o.id = 'game';
    return o;
  }

  function restore(rec) {
    if (!rec || !rec.cards || rec.cards.length !== 52) return null;
    var s = empty();
    var i;
    for (i = 0; i < 52; i++) {
      s.cards[i].type = rec.cards[i].type;
      s.cards[i].number = rec.cards[i].number;
      s.cards[i].facingUp = !!rec.cards[i].facingUp;
    }
    s.desk = (rec.desk || []).map(function (d) { return (d || []).slice(); });
    while (s.desk.length < 7) s.desk.push([]);
    s.desk = s.desk.slice(0, 7);
    s.finish = (rec.finish || []).map(function (d) { return (d || []).slice(); });
    while (s.finish.length < 4) s.finish.push([]);
    s.finish = s.finish.slice(0, 4);
    s.pile = rec.pile ? rec.pile.slice() : [];
    s.waste = rec.waste ? rec.waste.slice() : [];
    s.draw = rec.draw === 1 ? 1 : 3;
    s.score = rec.score | 0;
    s.moves = rec.moves | 0;
    s.elapsed = rec.elapsed | 0;
    s.won = !!rec.won;
    s.history = [];
    return s;
  }

  function deal(s) {
    var card = 0, i, j;
    s.desk = [[], [], [], [], [], [], []];
    s.finish = [[], [], [], []];
    s.pile = [];
    s.waste = [];
    s.score = 0;
    s.moves = 0;
    s.elapsed = 0;
    s.won = false;
    s.history = [];
    for (i = 0; i < 52; i++) s.cards[i].facingUp = false;
    for (i = 0; i < 7; i++) {
      for (j = i; j < 7; j++) {
        s.desk[j].push(card);
        if (j === i) s.cards[card].facingUp = true;
        card++;
      }
    }
    for (i = card; i < 52; i++) s.pile.push(i);
    return s;
  }

  function newGame(rand, draw) {
    var s = empty();
    s.draw = draw === 1 ? 1 : 3;
    fisherYates(s.cards, rand);
    return deal(s);
  }

  function loc(s, card) {
    var i, index;
    for (i = 0; i < 7; i++) {
      index = s.desk[i].indexOf(card);
      if (index > -1) return { location: 'desk', pile: i, index: index };
    }
    for (i = 0; i < 4; i++) {
      index = s.finish[i].indexOf(card);
      if (index > -1) return { location: 'finish', pile: i, index: index };
    }
    index = s.waste.indexOf(card);
    if (index > -1) return { location: 'waste', pile: 0, index: index };
    index = s.pile.indexOf(card);
    if (index > -1) return { location: 'pile', pile: 0, index: index };
    return null;
  }

  function arr(s, location, pile) {
    if (location === 'desk') return s.desk[pile];
    if (location === 'finish') return s.finish[pile];
    if (location === 'waste') return s.waste;
    return s.pile;
  }

  function lastOf(a) { return a.length ? a[a.length - 1] : null; }

  function canPlaceTableau(child, parent) {
    return (parent.number - 1) === child.number && COLORS[parent.type] !== COLORS[child.type];
  }

  function pushHistory(s) {
    s.history.push(clonePlay(s));
    if (s.history.length > 80) s.history.shift();
  }

  function playable(s, card) {
    var c = s.cards[card];
    if (!c || !c.facingUp) return false;
    var L = loc(s, card);
    if (!L || L.location === 'pile') return false;
    if (L.location === 'waste') return L.index === s.waste.length - 1;
    return true;
  }

  function destinations(s, card, first) {
    var dests = [];
    if (!playable(s, card)) return dests;
    var c = s.cards[card];
    var L = loc(s, card);
    var sub = (L.location === 'desk') ? s.desk[L.pile].slice(L.index + 1) : [];
    var i, last, p;
    if (sub.length === 0) {
      if (c.number === 1) {
        for (i = 0; i < 4; i++) {
          if (s.finish[i].length === 0) {
            dests.push({ dest: 'finish', pile: i });
            if (first) return dests;
          }
        }
      } else {
        for (i = 0; i < 4; i++) {
          last = lastOf(s.finish[i]);
          if (last !== null) {
            p = s.cards[last];
            if (p.type === c.type && p.number + 1 === c.number) {
              dests.push({ dest: 'finish', pile: i });
              if (first) return dests;
            }
          }
        }
      }
    }
    for (i = 0; i < 7; i++) {
      if (L.location === 'desk' && L.pile === i) continue;
      last = lastOf(s.desk[i]);
      if (last !== null) {
        if (canPlaceTableau(c, s.cards[last])) {
          dests.push({ dest: 'desk', pile: i });
          if (first) return dests;
        }
      } else if (c.number === 13) {
        dests.push({ dest: 'desk', pile: i });
        if (first) return dests;
      }
    }
    return dests;
  }

  function pointlessKingShuffle(s, card, d) {
    if (d.dest !== 'desk' || s.desk[d.pile].length !== 0) return false;
    var L = loc(s, card);
    return !!(L && L.location === 'desk' && L.index === 0);
  }

  function tapDests(s, card) {
    return destinations(s, card, false).filter(function (d) {
      return !pointlessKingShuffle(s, card, d);
    });
  }

  function scoreMove(s, fromLoc, toLoc) {
    if (toLoc === 'finish') s.score += 10;
    else if (fromLoc === 'waste' && toLoc === 'desk') s.score += 5;
    else if (fromLoc === 'finish' && toLoc === 'desk') s.score -= 15;
  }

  function flipLast(s, deskIndex) {
    var last = lastOf(s.desk[deskIndex]);
    if (last !== null && !s.cards[last].facingUp) {
      s.cards[last].facingUp = true;
      s.score += 5;
      return true;
    }
    return false;
  }

  function checkWin(s) {
    var i;
    for (i = 0; i < 4; i++) {
      if (s.finish[i].length < 13) { s.won = false; return false; }
    }
    s.won = true;
    return true;
  }

  function applyMove(s, card, dest) {
    if (!dest) return false;
    var L = loc(s, card);
    if (!L) return false;
    var legal = destinations(s, card, false);
    var ok = false, i;
    for (i = 0; i < legal.length; i++) {
      if (legal[i].dest === dest.dest && legal[i].pile === dest.pile) { ok = true; break; }
    }
    if (!ok) return false;
    pushHistory(s);
    var src = arr(s, L.location, L.pile);
    var moving = src.splice(L.index);
    arr(s, dest.dest, dest.pile).push.apply(arr(s, dest.dest, dest.pile), moving);
    scoreMove(s, L.location, dest.dest);
    if (L.location === 'desk') flipLast(s, L.pile);
    s.moves += 1;
    checkWin(s);
    return true;
  }

  function tap(s, card) {
    var dests = tapDests(s, card);
    if (!dests.length) return null;
    var d = dests[0];
    return applyMove(s, card, d) ? d : null;
  }

  function draw(s) {
    if (!s.pile.length) return false;
    pushHistory(s);
    var n = Math.min(s.draw, s.pile.length), i, card;
    for (i = 0; i < n; i++) {
      card = s.pile.pop();
      s.cards[card].facingUp = true;
      s.waste.push(card);
    }
    s.moves += 1;
    return true;
  }

  function recycle(s) {
    if (s.pile.length || !s.waste.length) return false;
    pushHistory(s);
    if (s.draw === 3) s.score = Math.max(0, s.score - 20);
    var w = s.waste, i;
    s.waste = [];
    // Flip: oldest waste becomes the next draw (end of pile).
    for (i = 0; i < w.length; i++) s.cards[w[i]].facingUp = false;
    s.pile = w.slice().reverse();
    s.moves += 1;
    return true;
  }

  function stockTap(s) {
    if (s.pile.length) return draw(s);
    return recycle(s);
  }

  function undo(s) {
    if (!s.history.length) return false;
    var prev = s.history.pop();
    s.cards = prev.cards;
    s.desk = prev.desk;
    s.finish = prev.finish;
    s.pile = prev.pile;
    s.waste = prev.waste;
    s.draw = prev.draw;
    s.score = prev.score;
    s.moves = prev.moves;
    s.elapsed = prev.elapsed;
    s.won = prev.won;
    return true;
  }

  function allFaceUp(s) {
    var i, j;
    if (s.pile.length) return false;
    for (i = 0; i < 7; i++) {
      for (j = 0; j < s.desk[i].length; j++) {
        if (!s.cards[s.desk[i][j]].facingUp) return false;
      }
    }
    return true;
  }

  function autoStep(s) {
    var i, idx, dests, k;
    function foundation(card) {
      dests = destinations(s, card, false);
      for (k = 0; k < dests.length; k++) if (dests[k].dest === 'finish') return dests[k];
      return null;
    }
    if (s.waste.length) {
      idx = s.waste[s.waste.length - 1];
      i = foundation(idx);
      if (i && applyMove(s, idx, i)) return true;
    }
    for (i = 0; i < 7; i++) {
      if (!s.desk[i].length) continue;
      idx = s.desk[i][s.desk[i].length - 1];
      k = foundation(idx);
      if (k && applyMove(s, idx, k)) return true;
    }
    return false;
  }

  function hint(s) {
    var i, k, idx, dests, d, L;
    for (i = 0; i < 7; i++) {
      for (k = 0; k < s.desk[i].length; k++) {
        idx = s.desk[i][k];
        dests = tapDests(s, idx);
        if (!dests.length) continue;
        return { card: idx, dest: dests[0], loc: loc(s, idx) };
      }
    }
    if (s.waste.length) {
      idx = s.waste[s.waste.length - 1];
      dests = tapDests(s, idx);
      if (dests.length) return { card: idx, dest: dests[0], loc: loc(s, idx) };
    }
    if (s.pile.length) return { draw: true };
    if (s.waste.length) return { recycle: true };
    return null;
  }

  g.Klondike = {
    TYPES: TYPES,
    COLORS: COLORS,
    SUITS: SUITS,
    SUIT_CLASS: SUIT_CLASS,
    rankName: rankName,
    fisherYates: fisherYates,
    newGame: newGame,
    deal: deal,
    restore: restore,
    snapshot: snapshot,
    loc: loc,
    destinations: destinations,
    tapDests: tapDests,
    applyMove: applyMove,
    tap: tap,
    draw: draw,
    recycle: recycle,
    stockTap: stockTap,
    undo: undo,
    hint: hint,
    autoStep: autoStep,
    allFaceUp: allFaceUp,
    checkWin: checkWin,
    playable: playable,
    canPlaceTableau: canPlaceTableau,
    kingOnEmpty: function (n) { return n === 13; },
    aceOnFoundation: function (n) { return n === 1; },
    canPlace: function (childNum, childType, parentNum, parentType) {
      return (parentNum - 1) === childNum && COLORS[parentType] !== COLORS[childType];
    },
    empty: empty
  };
})(typeof window !== 'undefined' ? window : globalThis);
