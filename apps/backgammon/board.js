// Backgammon table on top of quasoft's RuleBgCasual (MIT). Classic script.
// Snapshot / roll / move / confirm / undo — no socket, no server.
(function (root) {
  'use strict';
  var M = root.BG;
  var rule = M.casual;
  var WHITE = M.PieceType.WHITE;
  var BLACK = M.PieceType.BLACK;

  function player(type) {
    return { id: type === WHITE ? 'white' : 'black', currentPieceType: type };
  }

  function fresh() {
    var game = M.Game.createNew(rule);
    game.hasStarted = true;
    game.isOver = false;
    game.winner = null;
    game.turnPlayer = player(WHITE);
    game.turnNumber = 1;
    game.turnDice = null;
    game.turnConfirmed = false;
    game.moveSequence = 0;
    game.previousState = null;
    game.previousTurnDice = null;
    return game;
  }

  function rebuild(game) {
    if (game.state) M.State.rebuildRefs(game.state);
    if (game.previousState) M.State.rebuildRefs(game.previousState);
    if (game.turnPlayer && typeof game.turnPlayer === 'number') {
      game.turnPlayer = player(game.turnPlayer);
    } else if (game.turnPlayer && game.turnPlayer.currentPieceType != null) {
      game.turnPlayer = player(game.turnPlayer.currentPieceType);
    }
    return game;
  }

  function snapshot(game) {
    return {
      state: M.State.clone(game.state),
      previousState: game.previousState ? M.State.clone(game.previousState) : null,
      turnDice: game.turnDice ? M.Utils.deepCopy(game.turnDice) : null,
      previousTurnDice: game.previousTurnDice ? M.Utils.deepCopy(game.previousTurnDice) : null,
      turn: game.turnPlayer ? game.turnPlayer.currentPieceType : WHITE,
      hasStarted: !!game.hasStarted,
      isOver: !!game.isOver,
      winner: game.winner == null ? null : game.winner,
      turnNumber: game.turnNumber || 1,
      turnConfirmed: !!game.turnConfirmed,
      moveSequence: game.moveSequence || 0
    };
  }

  function restore(snap) {
    if (!snap || !snap.state) return fresh();
    var game = new M.Game();
    game.state = M.State.clone(snap.state);
    game.previousState = snap.previousState ? M.State.clone(snap.previousState) : null;
    game.turnDice = snap.turnDice ? M.Utils.deepCopy(snap.turnDice) : null;
    game.previousTurnDice = snap.previousTurnDice ? M.Utils.deepCopy(snap.previousTurnDice) : null;
    game.turnPlayer = player(snap.turn == null ? WHITE : snap.turn);
    game.hasStarted = snap.hasStarted !== false;
    game.isOver = !!snap.isOver;
    game.winner = snap.winner == null ? null : snap.winner;
    game.turnNumber = snap.turnNumber || 1;
    game.turnConfirmed = !!snap.turnConfirmed;
    game.moveSequence = snap.moveSequence || 0;
    rebuild(game);
    return game;
  }

  function findPiece(game, id) {
    var t, i, list;
    if (!game || !game.state) return null;
    for (t = 0; t < 2; t++) {
      list = game.state.pieces[t];
      for (i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    }
    return null;
  }

  function topAt(game, pos) {
    return M.State.getTopPiece(game.state, pos);
  }

  function barTop(game, type) {
    return M.State.getBarTopPiece(game.state, type);
  }

  function colorName(type) {
    return type === WHITE ? 'white' : 'black';
  }

  function roll(game, values) {
    if (!game || game.isOver || game.turnDice) return null;
    game.turnDice = rule.rollDice(game, values);
    M.Game.snapshotState(game);
    return game.turnDice;
  }

  function tryMove(game, pieceId, steps) {
    if (!game || game.isOver || !game.turnDice) return false;
    var piece = findPiece(game, pieceId);
    if (!piece) return false;
    if (!rule.validateMove(game, game.turnPlayer, piece, steps)) return false;
    var actions = rule.getMoveActions(game.state, piece, steps);
    if (!actions.length) return false;
    rule.applyMoveActions(game.state, actions);
    rule.markAsPlayed(game, steps);
    game.moveSequence = (game.moveSequence || 0) + 1;
    return true;
  }

  function applyMove(game, pieceId, steps) {
    if (!game || game.isOver || !game.turnDice) return false;
    var piece = findPiece(game, pieceId);
    if (!piece) return false;
    if (piece.type !== game.turnPlayer.currentPieceType) return false;
    if (!M.Game.hasMove(game, steps)) return false;
    var actions = rule.getMoveActions(game.state, piece, steps);
    if (!actions.length) return false;
    rule.applyMoveActions(game.state, actions);
    rule.markAsPlayed(game, steps);
    game.moveSequence = (game.moveSequence || 0) + 1;
    return true;
  }

  function confirm(game) {
    if (!game || game.isOver) return false;
    if (!rule.validateConfirm(game, game.turnPlayer)) return false;
    if (rule.hasWon(game.state, game.turnPlayer)) {
      game.isOver = true;
      game.winner = game.turnPlayer.currentPieceType;
      game.turnConfirmed = true;
      return true;
    }
    game.turnConfirmed = false;
    game.turnDice = null;
    game.previousState = null;
    game.previousTurnDice = null;
    game.turnPlayer = player(1 - game.turnPlayer.currentPieceType);
    game.turnNumber += 1;
    return true;
  }

  function undo(game) {
    if (!game || game.isOver) return false;
    if (!rule.validateUndo(game, game.turnPlayer)) return false;
    if (!game.previousState) return false;
    M.Game.restoreState(game);
    return true;
  }

  function canConfirm(game) {
    if (!game || game.isOver || !game.turnDice) return false;
    return !M.Game.hasMoreMoves(game) && !game.turnConfirmed;
  }

  function canUndo(game) {
    if (!game || game.isOver || !game.turnDice) return false;
    return (game.turnDice.movesPlayed || []).length > 0 && !game.turnConfirmed;
  }

  function canRoll(game) {
    return !!(game && !game.isOver && !game.turnDice);
  }

  function movable(game) {
    var type, out, i, top;
    if (!game || !game.state) return [];
    type = game.turnPlayer.currentPieceType;
    if (M.State.havePiecesOnBar(game.state, type)) {
      top = M.State.getBarTopPiece(game.state, type);
      return top ? [top] : [];
    }
    out = [];
    for (i = 0; i < 24; i++) {
      top = M.State.getTopPiece(game.state, i);
      if (top && top.type === type) out.push(top);
    }
    return out;
  }

  function destFor(game, piece, steps) {
    var actions, i, a;
    if (!piece) return null;
    actions = rule.getMoveActions(game.state, piece, steps);
    if (!actions.length) return null;
    for (i = 0; i < actions.length; i++) {
      a = actions[i];
      if (a.type === M.MoveActionType.BEAR) return { kind: 'bear', pos: a.from };
      if (a.type === M.MoveActionType.RECOVER) return { kind: 'point', pos: a.position };
      if (a.type === M.MoveActionType.MOVE) return { kind: 'point', pos: a.to };
    }
    return { kind: 'ok' };
  }

  root.Backgammon = {
    WHITE: WHITE,
    BLACK: BLACK,
    rule: rule,
    model: M,
    fresh: fresh,
    snapshot: snapshot,
    restore: restore,
    rebuild: rebuild,
    findPiece: findPiece,
    topAt: topAt,
    barTop: barTop,
    colorName: colorName,
    roll: roll,
    tryMove: tryMove,
    applyMove: applyMove,
    confirm: confirm,
    undo: undo,
    canConfirm: canConfirm,
    canUndo: canUndo,
    canRoll: canRoll,
    movable: movable,
    destFor: destFor
  };
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : this));
