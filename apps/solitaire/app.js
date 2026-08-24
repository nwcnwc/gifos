// Destack of rjanjic/js-solitaire (MIT). Sprite is gone; cards are CSS.
// Tap-to-move is the original click path. Pointer events add finger drag.
// The tableau is a private gifos.db save.
(function () {
  'use strict';
  var gameEl = document.getElementById('js-solitaire');
  var dealPileEl = document.getElementById('js-deck-pile');
  var dealEl = document.getElementById('js-deck-deal');
  var finishContainerEl = document.getElementById('js-finish');
  var deskContainerEl = document.getElementById('js-board');
  var resetEl = document.getElementById('js-reset');
  var winEl = document.getElementById('win');
  var SUITS = { c: '♣', d: '♦', h: '♥', s: '♠' };
  var NAMES = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  var saveDb = null;
  try { if (window.gifos) saveDb = gifos.db('save'); } catch (e) {}

  var state = {
    types: ['c', 'd', 'h', 's'],
    colors: { c: 0, d: 1, h: 1, s: 0 },
    cards: [],
    deal: { pile: { el: null, cards: [] }, deal: { el: null, cards: [] } },
    finish: [],
    desk: [],
    moving: {
      card: {}, element: null, index: -1, capture: false,
      container: { cards: [] }, target: null, origin: {},
      offset: { x: 0, y: 0 }, destinations: []
    }
  };

  function rankName(n) { return NAMES[n] || String(n); }
  function getCard(index) { return state.cards[index]; }

  function paintCard(card) {
    var el = state.cards[card].el;
    var c = state.cards[card];
    el.classList.toggle('card--front', c.facingUp);
    el.classList.toggle('card--back', !c.facingUp);
  }
  function faceUp(card) {
    state.cards[card].facingUp = true;
    paintCard(card);
  }
  function faceDown(card) {
    state.cards[card].facingUp = false;
    paintCard(card);
  }
  function faceUpLastOnDesk(index) {
    var card = getLastOnDesk(index);
    if (card !== null) faceUp(card);
  }
  function appendToCard(target, card) {
    state.cards[target].el.appendChild(state.cards[card].el);
  }
  function appendToDesk(desk, card) {
    state.desk[desk].el.appendChild(state.cards[card].el);
  }
  function getLastOnDesk(desk) {
    var l = state.desk[desk].cards.length;
    return l > 0 ? state.desk[desk].cards[l - 1] : null;
  }
  function getLastOnPile(pile, index) {
    var l = state[pile][index].cards.length;
    if (l > 0) return state.cards[state[pile][index].cards[l - 1]];
    return {};
  }
  function getCardLocation(card) {
    var i, index;
    for (i = 0; i < 7; i++) {
      index = state.desk[i].cards.indexOf(card);
      if (index > -1) return { location: 'desk', pile: i, index: index };
    }
    for (i = 0; i < 4; i++) {
      index = state.finish[i].cards.indexOf(card);
      if (index > -1) return { location: 'finish', pile: i, index: index };
    }
    for (i = 0; i < 2; i++) {
      var name = i === 0 ? 'deal' : 'pile';
      index = state.deal[name].cards.indexOf(card);
      if (index > -1) return { location: 'deal', pile: name, index: index };
    }
    return { location: 'deal', pile: 'pile', index: -1 };
  }
  function getSubCards(card) {
    var loc = getCardLocation(card);
    return state[loc.location][loc.pile].cards.filter(function (elem, i, array) {
      return array.indexOf(elem) > loc.index;
    });
  }
  function getPile(pile, index) { return state[pile][index]; }
  function moveCardTo(dest, i, card) {
    var loc = getCardLocation(card);
    var moving = state[loc.location][loc.pile].cards.filter(function (elem, idx, array) {
      return array.indexOf(elem) >= loc.index;
    });
    state[loc.location][loc.pile].cards = state[loc.location][loc.pile].cards.filter(function (elem) {
      return moving.indexOf(elem) === -1;
    });
    state[dest][i].cards = state[dest][i].cards.concat(moving);
  }
  function canBePlacedOnCard(child, parent) {
    var c = getCard(child), p = getCard(parent);
    return (p.number - 1) === c.number && state.colors[p.type] !== state.colors[c.type];
  }
  function placeCardTo(dest, index, card) {
    state[dest][index].cards.push(card);
    var p = state.deal.pile.cards.indexOf(card);
    if (p !== -1) state.deal.pile.cards.splice(p, 1);
  }

  function snapshot() {
    return {
      id: 'game',
      cards: state.cards.map(function (c) {
        return { type: c.type, number: c.number, facingUp: c.facingUp };
      }),
      desk: state.desk.map(function (d) { return d.cards.slice(); }),
      finish: state.finish.map(function (d) { return d.cards.slice(); }),
      pile: state.deal.pile.cards.slice(),
      waste: state.deal.deal.cards.slice()
    };
  }
  function persist() {
    if (!saveDb) return;
    saveDb.put(snapshot()).catch(function () {});
  }

  function dealCards() {
    var card = 0, i, j, last;
    for (i = 0; i < 7; i++) {
      for (j = i; j < 7; j++) {
        last = getLastOnDesk(j);
        if (last !== null) appendToCard(last, card);
        else appendToDesk(j, card);
        placeCardTo('desk', j, card);
        if (j === i) faceUp(card);
        card++;
      }
    }
  }

  function bindCard(i) {
    var el = state.cards[i].el;
    el.onpointerdown = captureMove(i);
    el.onclick = handleClick(i);
  }

  function resetGame() {
    var i;
    for (i = 0; i < 7; i++) state.desk[i].cards = [];
    for (i = 0; i < 4; i++) state.finish[i].cards = [];
    state.deal.pile.cards = [];
    state.deal.deal.cards = [];
    winEl.hidden = true;
    state.cards.sort(function () { return Math.random() < 0.5 ? -1 : 1; });
    for (i = 0; i < state.cards.length; i++) {
      state.deal.pile.cards.push(i);
      bindCard(i);
      if (state.cards[i].facingUp) faceDown(i);
      dealPileEl.appendChild(state.cards[i].el);
    }
    dealCards();
    persist();
  }

  function restore(rec) {
    if (!rec || !rec.cards || rec.cards.length !== 52) return false;
    var i, el;
    for (i = 0; i < 52; i++) {
      state.cards[i].type = rec.cards[i].type;
      state.cards[i].number = rec.cards[i].number;
      state.cards[i].facingUp = !!rec.cards[i].facingUp;
      el = state.cards[i].el;
      el.className = 'card card--' + (state.cards[i].type === 'h' ? 'hearts' : state.cards[i].type === 'd' ? 'diamonds' : state.cards[i].type === 'c' ? 'clubs' : 'spades');
      el.querySelector('.rank').textContent = rankName(state.cards[i].number);
      el.querySelectorAll('.suit-ch').forEach(function (n) { n.textContent = SUITS[state.cards[i].type]; });
      paintCard(i);
    }
    state.desk.forEach(function (d) { d.cards = []; });
    state.finish.forEach(function (d) { d.cards = []; });
    state.deal.pile.cards = rec.pile ? rec.pile.slice() : [];
    state.deal.deal.cards = rec.waste ? rec.waste.slice() : [];
    function mount(list, parent, nest) {
      var prev = null;
      list.forEach(function (idx) {
        var node = state.cards[idx].el;
        if (nest && prev !== null) state.cards[prev].el.appendChild(node);
        else parent.appendChild(node);
        prev = idx;
      });
    }
    rec.desk.forEach(function (col, i) {
      state.desk[i].cards = col.slice();
      mount(col, state.desk[i].el, true);
    });
    rec.finish.forEach(function (col, i) {
      state.finish[i].cards = col.slice();
      mount(col, state.finish[i].el, true);
    });
    mount(state.deal.pile.cards, dealPileEl, false);
    mount(state.deal.deal.cards, dealEl, false);
    for (i = 0; i < 52; i++) bindCard(i);
    return true;
  }

  var handleClick = function (index) {
    return function (event) {
      event.stopPropagation();
      var c = getCard(index);
      if (state.moving.capture) return;
      releaseMove(event);
      if (c.facingUp) {
        var loc = getCardLocation(index);
        if (loc.location === 'deal' && loc.pile === 'deal') {
          var last = getLastOnPile('deal', 'deal');
          if (c.el !== last.el) return;
        }
        var destinations = getAvailableDestinations(index, true);
        if (destinations.length > 0) {
          var dest = destinations[0];
          moveCardTo(dest.target.dest, dest.target.pile, dest.target.card);
          if (loc.location === 'desk') faceUpLastOnDesk(loc.pile);
          dest.el.appendChild(c.el);
          persist();
        } else return;
        gameFinish();
      } else {
        var loc2 = getCardLocation(index);
        if (loc2.location === 'deal' && loc2.pile === 'pile') {
          var max = state.deal.pile.cards.length - 1;
          var min = Math.max(-1, max - 3);
          var i;
          for (i = max; i > min; i--) {
            var card = state.deal.pile.cards[i];
            faceUp(card);
            moveCardTo('deal', 'deal', card);
            dealEl.appendChild(getCard(card).el);
          }
          persist();
        }
      }
    };
  };

  function restartDeal() {
    state.deal.pile.cards = state.deal.deal.cards;
    state.deal.deal.cards = [];
    state.deal.pile.cards.forEach(function (card) {
      faceDown(card);
      dealPileEl.appendChild(getCard(card).el);
    });
    persist();
  }

  function point(event) {
    var t = event.touches && event.touches[0] ? event.touches[0] :
      (event.changedTouches && event.changedTouches[0] ? event.changedTouches[0] : event);
    return { x: t.clientX, y: t.clientY };
  }

  function handleMove(event) {
    if (!state.moving.capture) return;
    var p = point(event);
    var el = state.moving.element;
    el.style.left = (p.x - state.moving.offset.x) + 'px';
    el.style.top = (p.y - state.moving.offset.y) + 'px';
    event.preventDefault();
  }

  function startMovingPosition(event) {
    var el = state.moving.element;
    var p = point(event);
    var box = el.getBoundingClientRect();
    el.classList.add('card--moving');
    state.moving.offset = { x: p.x - box.left, y: p.y - box.top };
    el.style.left = (p.x - state.moving.offset.x) + 'px';
    el.style.top = (p.y - state.moving.offset.y - 5) + 'px';
  }

  var movingTimer;
  var captureMove = function (index) {
    return function (event) {
      if (event.button != null && event.button !== 0) return;
      event.stopPropagation();
      var c = getCard(index);
      if (!c.facingUp) return;
      var loc = getCardLocation(index);
      if (loc.location === 'deal' && loc.pile === 'deal') {
        var last = getLastOnPile('deal', 'deal');
        if (c.el !== last.el) return;
      }
      movingTimer = setTimeout(function () {
        state.moving.element = c.el;
        state.moving.capture = true;
        state.moving.index = index;
        state.moving.card = c;
        state.moving.origin = getCardLocation(index);
        startMovingPosition(event);
        var destinations = getAvailableDestinations(index);
        state.moving.destinations = destinations;
        destinations.forEach(function (dest) {
          dest.el.classList.add('finish-dest');
          var b = dest.el.getBoundingClientRect();
          dest.offset = { top: b.top, left: b.left, width: b.width, height: b.height };
        });
      }, 180);
    };
  };

  function dropCard(x, y) {
    var dropped = false;
    state.moving.destinations.forEach(function (destination) {
      var o = destination.offset;
      destination.el.classList.remove('finish-dest');
      if (o && x > o.left && x < o.left + o.width && y > o.top && y < o.top + o.height) {
        moveCardTo(destination.target.dest, destination.target.pile, destination.target.card);
        destination.el.appendChild(state.moving.element);
        dropped = true;
        gameFinish();
        var origin = state.moving.origin;
        if (origin.location === 'desk') faceUpLastOnDesk(origin.pile);
      }
    });
    if (dropped) persist();
  }

  var releaseTimer;
  function releaseMove(event) {
    clearTimeout(movingTimer);
    clearTimeout(releaseTimer);
    if (!state.moving.capture) return;
    var p = event ? point(event) : { x: 0, y: 0 };
    releaseTimer = setTimeout(function () {
      dropCard(p.x, p.y);
      if (state.moving.element) {
        state.moving.element.classList.remove('card--moving');
        state.moving.element.style.left = '';
        state.moving.element.style.top = '';
      }
      state.moving.element = null;
      state.moving.capture = false;
    }, 40);
  }

  function getAvailableDestinations(index, first) {
    var c = getCard(index);
    var destinations = [];
    var i;
    if (c.number === 1) {
      for (i = 0; i < 4; i++) {
        var pile = getPile('finish', i);
        if (pile.cards.length === 0) {
          destinations.push({ el: pile.el, target: { dest: 'finish', pile: i, card: index } });
          if (first) return destinations;
        }
      }
    }
    var subCards = getSubCards(index);
    if (!subCards.length) {
      for (i = 0; i < 4; i++) {
        var l = state.finish[i].cards.length;
        if (l + 1 === c.number) {
          var last = getLastOnPile('finish', i);
          if (last.type === c.type) {
            destinations.push({ el: state.finish[i].el, target: { dest: 'finish', pile: i, card: index } });
            if (first) return destinations;
            break;
          }
        }
      }
    }
    for (i = 0; i < 7; i++) {
      var lastDesk = getLastOnDesk(i);
      if (lastDesk !== null) {
        if (canBePlacedOnCard(index, lastDesk)) {
          destinations.push({ el: state.cards[lastDesk].el, target: { dest: 'desk', pile: i, card: index } });
          if (first) return destinations;
        }
      } else if (c.number === 13) {
        destinations.push({ el: state.desk[i].el, target: { dest: 'desk', pile: i, card: index } });
        if (first) return destinations;
      }
    }
    return destinations;
  }

  function gameFinish() {
    var i;
    for (i = 0; i < 4; i++) if (state.finish[i].cards.length < 13) return;
    winEl.hidden = false;
  }

  function makeCardEl(type, number) {
    var el = document.createElement('div');
    var suitName = type === 'h' ? 'hearts' : type === 'd' ? 'diamonds' : type === 'c' ? 'clubs' : 'spades';
    el.className = 'card card--' + suitName + ' card--back';
    el.innerHTML = '<span class="pip tl"><span class="rank">' + rankName(number) + '</span><span class="suit-ch">' + SUITS[type] + '</span></span>' +
      '<span class="pip center suit-ch">' + SUITS[type] + '</span>' +
      '<span class="pip br"><span class="rank">' + rankName(number) + '</span><span class="suit-ch">' + SUITS[type] + '</span></span>';
    return el;
  }

  function initSolitaire() {
    var i, j, el;
    for (i = 0; i < 4; i++) {
      for (j = 1; j <= 13; j++) {
        el = makeCardEl(state.types[i], j);
        state.cards.push({ el: el, type: state.types[i], number: j, facingUp: false });
      }
    }
    for (i = 0; i < 4; i++) {
      el = document.createElement('div');
      el.className = 'aces aces--' + i;
      state.finish.push({ el: el, cards: [] });
      finishContainerEl.appendChild(el);
    }
    for (i = 0; i < 7; i++) {
      el = document.createElement('div');
      el.className = 'seven seven--' + i;
      state.desk.push({ el: el, cards: [] });
      deskContainerEl.appendChild(el);
    }
    dealPileEl.onclick = restartDeal;
    resetEl.onclick = resetGame;
    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', releaseMove);
    window.addEventListener('pointercancel', releaseMove);
    winEl.onclick = resetGame;
  }

  async function boot() {
    initSolitaire();
    var rec = null;
    if (saveDb) {
      try { rec = await saveDb.get('game'); } catch (e) {}
    }
    if (!rec || !restore(rec)) resetGame();
  }
  window.Klondike = {
    colors: state.colors,
    canPlace: function (childNum, childType, parentNum, parentType) {
      return (parentNum - 1) === childNum && state.colors[parentType] !== state.colors[childType];
    },
    kingOnEmpty: function (n) { return n === 13; },
    aceOnFoundation: function (n) { return n === 1; }
  };
  boot();
})();
