// Destack of lklynet/spider-solitaire engine (deck.ts, moves.ts, replay.ts). MIT.
// 1/2/4-suit deals are Microsoft Spider: build down in rank regardless of suit;
// only a same-suit descending run moves as a group; K–A same-suit leaves.
(function (g) {
  'use strict';
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function normSuits(n) { n = n | 0; return (n === 2 || n === 4) ? n : 1; }

  function seededRandom(seed) {
    var state = 0xdeadbeef, index;
    seed = String(seed == null ? '' : seed);
    for (index = 0; index < seed.length; index++) {
      state = Math.imul(state ^ seed.charCodeAt(index), 2654435761);
    }
    state = (state ^ (state >>> 16)) >>> 0;
    return function () {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  function createDeck(suits) {
    suits = normSuits(suits);
    var copies = 104 / (13 * suits);
    var deck = [], suit, copy, rank;
    for (suit = 0; suit < suits; suit++) {
      for (copy = 0; copy < copies; copy++) {
        for (rank = 1; rank <= 13; rank++) {
          deck.push({
            id: rank + '-' + suit + '-' + copy,
            rank: rank, suit: suit, faceUp: false
          });
        }
      }
    }
    return deck;
  }

  function shuffleDeck(deck, seed) {
    var next = seededRandom(seed);
    var shuffled = deck.slice();
    var index, swapIndex, tmp;
    for (index = shuffled.length - 1; index > 0; index--) {
      swapIndex = Math.floor(next() * (index + 1));
      tmp = shuffled[index]; shuffled[index] = shuffled[swapIndex]; shuffled[swapIndex] = tmp;
    }
    return shuffled;
  }

  function createInitialGameLayout(seed, suits) {
    var deck = shuffleDeck(createDeck(suits), seed);
    var tableau = [];
    var pileIndex, cardCount, index, cardIndex = 0;
    for (pileIndex = 0; pileIndex < 10; pileIndex++) tableau.push([]);
    for (pileIndex = 0; pileIndex < 10; pileIndex++) {
      cardCount = pileIndex < 4 ? 6 : 5;
      for (index = 0; index < cardCount; index++) {
        var card = deck[cardIndex++];
        card.faceUp = index === cardCount - 1;
        tableau[pileIndex].push(card);
      }
    }
    return { tableau: tableau, stock: deck.slice(cardIndex) };
  }

  function createBoardState(seed, suits) {
    suits = normSuits(suits);
    seed = String(seed == null ? '' : seed);
    var layout = createInitialGameLayout(seed, suits);
    return {
      tableau: layout.tableau, stock: layout.stock, foundation: 0,
      score: 500, moves: 0, gameWon: false, history: [],
      seed: seed, suits: suits
    };
  }

  function hydrateBoard(raw) {
    if (!raw || !raw.tableau || raw.tableau.length !== 10) return null;
    var board = clone(raw);
    board.suits = normSuits(board.suits);
    board.stock = board.stock || [];
    board.foundation = board.foundation | 0;
    board.score = board.score == null ? 500 : board.score | 0;
    board.moves = board.moves | 0;
    board.gameWon = !!board.gameWon;
    board.history = Array.isArray(board.history) ? board.history : [];
    board.seed = board.seed == null ? '' : String(board.seed);
    var pi, ci, card, n = 0;
    for (pi = 0; pi < 10; pi++) {
      if (!Array.isArray(board.tableau[pi])) board.tableau[pi] = [];
      for (ci = 0; ci < board.tableau[pi].length; ci++) {
        card = board.tableau[pi][ci];
        if (!card || card.rank == null) return null;
        if (card.suit == null) card.suit = 0;
        card.suit = card.suit | 0;
        card.rank = card.rank | 0;
        card.faceUp = !!card.faceUp;
        n++;
      }
    }
    for (ci = 0; ci < board.stock.length; ci++) {
      card = board.stock[ci];
      if (!card || card.rank == null) return null;
      if (card.suit == null) card.suit = 0;
      n++;
    }
    if (n + board.foundation * 13 !== 104) return null;
    return board;
  }

  function isValidMoveGroup(cards) {
    if (!cards || cards.length === 0) return false;
    var index;
    for (index = 0; index < cards.length - 1; index++) {
      if (cards[index].rank !== cards[index + 1].rank + 1) return false;
      if ((cards[index].suit | 0) !== (cards[index + 1].suit | 0)) return false;
    }
    return true;
  }

  function canDropOn(toPile, movingCard) {
    if (!toPile || toPile.length === 0) return true;
    return toPile[toPile.length - 1].rank === movingCard.rank + 1;
  }

  function enumerateMoves(tableau) {
    var moves = [], fromPileIndex, cardIndex, toPileIndex;
    for (fromPileIndex = 0; fromPileIndex < tableau.length; fromPileIndex++) {
      var fromPile = tableau[fromPileIndex];
      for (cardIndex = 0; cardIndex < fromPile.length; cardIndex++) {
        if (!fromPile[cardIndex].faceUp) continue;
        var cardsToMove = fromPile.slice(cardIndex);
        if (!isValidMoveGroup(cardsToMove)) continue;
        var movingCard = cardsToMove[0];
        for (toPileIndex = 0; toPileIndex < tableau.length; toPileIndex++) {
          if (toPileIndex === fromPileIndex) continue;
          var toPile = tableau[toPileIndex];
          if (toPile.length === 0) {
            if (cardIndex > 0) moves.push({ fromPileIndex: fromPileIndex, toPileIndex: toPileIndex, cardIndex: cardIndex });
          } else if (canDropOn(toPile, movingCard)) {
            moves.push({ fromPileIndex: fromPileIndex, toPileIndex: toPileIndex, cardIndex: cardIndex });
          }
        }
      }
    }
    return moves;
  }

  function scoreHintMove(tableau, move) {
    var fromPile = tableau[move.fromPileIndex];
    var cardAbove = move.cardIndex > 0 ? fromPile[move.cardIndex - 1] : null;
    var toPile = tableau[move.toPileIndex];
    var moving = fromPile[move.cardIndex];
    var score = 0;
    if (toPile.length === 0) {
      if (move.cardIndex === 0) return -1;
      if (cardAbove && cardAbove.faceUp) return -1;
      score = 10;
    } else {
      var targetCard = toPile[toPile.length - 1];
      if (cardAbove && cardAbove.faceUp && cardAbove.rank === targetCard.rank) return -1;
      score = 60;
      if ((targetCard.suit | 0) === (moving.suit | 0)) score += 40;
    }
    if (cardAbove && !cardAbove.faceUp) score += 60;
    if (move.cardIndex === 0 && fromPile.length > 0) score += 15;
    return score;
  }

  function pickHintMove(tableau) {
    var bestMove = null, bestScore = -1;
    enumerateMoves(tableau).forEach(function (move) {
      var score = scoreHintMove(tableau, move);
      if (score > bestScore) { bestScore = score; bestMove = move; }
    });
    return bestMove;
  }

  function targetRunLength(pile) {
    var runLength = 1, index;
    for (index = pile.length - 2; index >= 0; index--) {
      if (pile[index].rank === pile[index + 1].rank + 1 &&
          (pile[index].suit | 0) === (pile[index + 1].suit | 0) &&
          pile[index].faceUp) runLength++;
      else break;
    }
    return runLength;
  }

  function pickAutoMoveTarget(tableau, fromPileIndex, cardIndex) {
    var candidates = enumerateMoves(tableau).filter(function (move) {
      return move.fromPileIndex === fromPileIndex && move.cardIndex === cardIndex;
    });
    if (candidates.length === 0) return -1;
    var bestTargetIndex = -1, bestScore = -1, moving = tableau[fromPileIndex][cardIndex];
    candidates.forEach(function (move) {
      var pile = tableau[move.toPileIndex];
      var score = pile.length === 0 ? 0 : 1000 + targetRunLength(pile);
      if (pile.length > 0 && moving && (pile[pile.length - 1].suit | 0) === (moving.suit | 0)) score += 50;
      if (score > bestScore) { bestScore = score; bestTargetIndex = move.toPileIndex; }
    });
    return bestTargetIndex;
  }

  function checkCompletedRun(pile) {
    if (!pile || pile.length < 13) return false;
    var lastThirteen = pile.slice(-13);
    if (lastThirteen[0].rank !== 13) return false;
    if (lastThirteen.some(function (card) { return !card.faceUp; })) return false;
    return isValidMoveGroup(lastThirteen);
  }

  function cloneStateForHistory(state) {
    return {
      tableau: clone(state.tableau), stock: clone(state.stock),
      foundation: state.foundation, score: state.score, gameWon: !!state.gameWon
    };
  }

  function applyCompletedRun(tableau, pileIndex, foundation, score) {
    var pile = tableau[pileIndex];
    if (!checkCompletedRun(pile)) return { foundation: foundation, score: score };
    tableau[pileIndex] = pile.slice(0, pile.length - 13);
    var remaining = tableau[pileIndex];
    if (remaining.length > 0) {
      var lastCard = remaining[remaining.length - 1];
      if (!lastCard.faceUp) remaining[remaining.length - 1] = {
        id: lastCard.id, rank: lastCard.rank, suit: lastCard.suit | 0, faceUp: true
      };
    }
    return { foundation: foundation + 1, score: score + 100 };
  }

  function applyMoveEvent(state, event) {
    var fromPile = state.tableau[event.fromPileIndex];
    var toPile = state.tableau[event.toPileIndex];
    if (!fromPile || !toPile) return null;
    if (event.fromPileIndex === event.toPileIndex) return null;
    var cardsToMove = fromPile.slice(event.cardIndex);
    if (cardsToMove.length === 0) return null;
    if (!cardsToMove[0].faceUp) return null;
    if (cardsToMove.some(function (card) { return !card.faceUp; })) return null;
    if (!isValidMoveGroup(cardsToMove)) return null;
    if (!canDropOn(toPile, cardsToMove[0])) return null;
    var nextState = {
      tableau: clone(state.tableau), stock: state.stock, foundation: state.foundation,
      score: state.score, moves: state.moves, gameWon: state.gameWon,
      history: state.history.concat([cloneStateForHistory(state)]),
      seed: state.seed, suits: state.suits
    };
    if (nextState.history.length > 200) nextState.history = nextState.history.slice(-200);
    nextState.tableau[event.fromPileIndex] = nextState.tableau[event.fromPileIndex].slice(0, event.cardIndex);
    nextState.tableau[event.toPileIndex] = nextState.tableau[event.toPileIndex].concat(clone(cardsToMove));
    var fromRemaining = nextState.tableau[event.fromPileIndex];
    if (fromRemaining.length > 0) {
      var lastCard = fromRemaining[fromRemaining.length - 1];
      if (!lastCard.faceUp) fromRemaining[fromRemaining.length - 1] = {
        id: lastCard.id, rank: lastCard.rank, suit: lastCard.suit | 0, faceUp: true
      };
    }
    var completion = applyCompletedRun(nextState.tableau, event.toPileIndex, state.foundation, state.score - 1);
    nextState.foundation = completion.foundation;
    nextState.score = completion.score;
    nextState.moves = state.moves + 1;
    nextState.gameWon = completion.foundation === 8;
    return nextState;
  }

  function applyDealEvent(state) {
    if (state.stock.length === 0) return null;
    var pileIndex;
    for (pileIndex = 0; pileIndex < 10; pileIndex++) {
      if (state.tableau[pileIndex].length === 0) return null;
    }
    var nextState = {
      tableau: clone(state.tableau), stock: clone(state.stock),
      foundation: state.foundation, score: state.score - 1, moves: state.moves + 1,
      gameWon: false, history: state.history.concat([cloneStateForHistory(state)]),
      seed: state.seed, suits: state.suits
    };
    if (nextState.history.length > 200) nextState.history = nextState.history.slice(-200);
    for (pileIndex = 0; pileIndex < 10; pileIndex++) {
      if (nextState.stock.length === 0) break;
      var card = nextState.stock.pop();
      card.faceUp = true;
      nextState.tableau[pileIndex].push(card);
      var completion = applyCompletedRun(nextState.tableau, pileIndex, nextState.foundation, nextState.score);
      nextState.foundation = completion.foundation;
      nextState.score = completion.score;
    }
    nextState.gameWon = nextState.foundation === 8;
    return nextState;
  }

  function applyUndoEvent(state) {
    if (!state.history || state.history.length === 0) return null;
    var previous = state.history[state.history.length - 1];
    return {
      tableau: clone(previous.tableau), stock: clone(previous.stock),
      foundation: previous.foundation,
      score: previous.score == null ? state.score : previous.score,
      history: state.history.slice(0, -1),
      moves: state.moves, gameWon: !!previous.gameWon,
      seed: state.seed, suits: state.suits
    };
  }

  function canDeal(state) {
    if (!state || !state.stock || state.stock.length === 0) return false;
    var pileIndex;
    for (pileIndex = 0; pileIndex < 10; pileIndex++) {
      if (!state.tableau[pileIndex] || state.tableau[pileIndex].length === 0) return false;
    }
    return true;
  }

  g.Spider = {
    createDeck: createDeck,
    createBoardState: createBoardState,
    hydrateBoard: hydrateBoard,
    isValidMoveGroup: isValidMoveGroup,
    canDropOn: canDropOn,
    canDeal: canDeal,
    enumerateMoves: enumerateMoves,
    pickHintMove: pickHintMove,
    pickAutoMoveTarget: pickAutoMoveTarget,
    checkCompletedRun: checkCompletedRun,
    applyMoveEvent: applyMoveEvent,
    applyDealEvent: applyDealEvent,
    applyUndoEvent: applyUndoEvent,
    normSuits: normSuits,
    randomSeed: function () { return Math.random().toString(36).slice(2, 9); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
