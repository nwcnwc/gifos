// Destack of lklynet/spider-solitaire engine (deck.ts, moves.ts, replay.ts). MIT.
(function (g) {
  'use strict';
  function clone(v) { return JSON.parse(JSON.stringify(v)); }

  function seededRandom(seed) {
    var state = 0xdeadbeef, index;
    for (index = 0; index < seed.length; index++) {
      state = Math.imul(state ^ seed.charCodeAt(index), 2654435761);
    }
    state = (state ^ (state >>> 16)) >>> 0;
    return function () {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }
  function createDeck() {
    var deck = [], deckIndex, rankIndex;
    for (deckIndex = 0; deckIndex < 8; deckIndex++) {
      for (rankIndex = 0; rankIndex < 13; rankIndex++) {
        deck.push({ id: (rankIndex + 1) + '-' + deckIndex, rank: rankIndex + 1, faceUp: false });
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
  function createInitialGameLayout(seed) {
    var deck = shuffleDeck(createDeck(), seed);
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
  function createBoardState(seed) {
    var layout = createInitialGameLayout(seed);
    return {
      tableau: layout.tableau, stock: layout.stock, foundation: 0,
      score: 500, moves: 0, gameWon: false, history: []
    };
  }

  function isValidMoveGroup(cards) {
    var index;
    for (index = 0; index < cards.length - 1; index++) {
      if (cards[index].rank !== cards[index + 1].rank + 1) return false;
    }
    return true;
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
          } else if (toPile[toPile.length - 1].rank === movingCard.rank + 1) {
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
    var score = 0;
    if (toPile.length === 0) {
      if (move.cardIndex === 0) return -1;
      if (cardAbove && cardAbove.faceUp) return -1;
      score = 10;
    } else {
      var targetCard = toPile[toPile.length - 1];
      if (cardAbove && cardAbove.faceUp && cardAbove.rank === targetCard.rank) return -1;
      score = 60;
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
      if (pile[index].rank === pile[index + 1].rank + 1) runLength++;
      else break;
    }
    return runLength;
  }
  function pickAutoMoveTarget(tableau, fromPileIndex, cardIndex) {
    var candidates = enumerateMoves(tableau).filter(function (move) {
      return move.fromPileIndex === fromPileIndex && move.cardIndex === cardIndex;
    });
    if (candidates.length === 0) return -1;
    var bestTargetIndex = -1, bestScore = -1;
    candidates.forEach(function (move) {
      var pile = tableau[move.toPileIndex];
      var score = pile.length === 0 ? 0 : 1000 + targetRunLength(pile);
      if (score > bestScore) { bestScore = score; bestTargetIndex = move.toPileIndex; }
    });
    return bestTargetIndex;
  }

  function checkCompletedRun(pile) {
    if (pile.length < 13) return false;
    var lastThirteen = pile.slice(-13);
    if (lastThirteen[0].rank !== 13) return false;
    if (lastThirteen.some(function (card) { return !card.faceUp; })) return false;
    return isValidMoveGroup(lastThirteen);
  }
  function cloneStateForHistory(state) {
    return { tableau: clone(state.tableau), stock: clone(state.stock), foundation: state.foundation };
  }
  function applyCompletedRun(tableau, pileIndex, foundation, score) {
    var pile = tableau[pileIndex];
    if (!checkCompletedRun(pile)) return { foundation: foundation, score: score };
    tableau[pileIndex] = pile.slice(0, pile.length - 13);
    var remaining = tableau[pileIndex];
    if (remaining.length > 0) {
      var lastCard = remaining[remaining.length - 1];
      if (!lastCard.faceUp) remaining[remaining.length - 1] = { id: lastCard.id, rank: lastCard.rank, faceUp: true };
    }
    return { foundation: foundation + 1, score: score + 100 };
  }
  function applyMoveEvent(state, event) {
    var fromPile = state.tableau[event.fromPileIndex];
    var toPile = state.tableau[event.toPileIndex];
    if (!fromPile || !toPile) return null;
    var cardsToMove = fromPile.slice(event.cardIndex);
    if (cardsToMove.length === 0) return null;
    if (!cardsToMove[0].faceUp) return null;
    if (cardsToMove.some(function (card) { return !card.faceUp; })) return null;
    if (!isValidMoveGroup(cardsToMove)) return null;
    if (toPile.length > 0 && toPile[toPile.length - 1].rank !== cardsToMove[0].rank + 1) return null;
    var nextState = {
      tableau: clone(state.tableau), stock: state.stock, foundation: state.foundation,
      score: state.score, moves: state.moves, gameWon: state.gameWon,
      history: state.history.concat([cloneStateForHistory(state)])
    };
    nextState.tableau[event.fromPileIndex] = nextState.tableau[event.fromPileIndex].slice(0, event.cardIndex);
    nextState.tableau[event.toPileIndex] = nextState.tableau[event.toPileIndex].concat(clone(cardsToMove));
    var fromRemaining = nextState.tableau[event.fromPileIndex];
    if (fromRemaining.length > 0) {
      var lastCard = fromRemaining[fromRemaining.length - 1];
      if (!lastCard.faceUp) fromRemaining[fromRemaining.length - 1] = { id: lastCard.id, rank: lastCard.rank, faceUp: true };
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
      gameWon: false, history: state.history.concat([cloneStateForHistory(state)])
    };
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
    if (state.history.length === 0) return null;
    var previous = state.history[state.history.length - 1];
    return {
      tableau: clone(previous.tableau), stock: clone(previous.stock),
      foundation: previous.foundation, score: state.score - 1,
      history: state.history.slice(0, -1), moves: state.moves + 1, gameWon: false
    };
  }

  g.Spider = {
    createBoardState: createBoardState,
    isValidMoveGroup: isValidMoveGroup,
    enumerateMoves: enumerateMoves,
    pickHintMove: pickHintMove,
    pickAutoMoveTarget: pickAutoMoveTarget,
    applyMoveEvent: applyMoveEvent,
    applyDealEvent: applyDealEvent,
    applyUndoEvent: applyUndoEvent,
    randomSeed: function () { return Math.random().toString(36).slice(2, 9); }
  };
})(window);
