// Spider UI. Tap a run, tap a pile. Tableau is a private save.
(function () {
  'use strict';
  var S = window.Spider;
  var NAMES = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  function rankName(n) { return NAMES[n] || String(n); }
  var $ = function (id) { return document.getElementById(id); };
  var saveDb = null;
  try { if (window.gifos) saveDb = gifos.db('save'); } catch (e) {}

  var board = S.createBoardState(S.randomSeed());
  var stats = { played: 0, won: 0 };
  var sel = null;
  var hint = null;

  function persist() {
    if (!saveDb) return;
    saveDb.put({
      id: 'game', board: board, stats: stats
    }).catch(function () {});
  }

  function render() {
    $('score').textContent = String(board.score);
    $('found').textContent = String(board.foundation);
    $('stockN').textContent = String(board.stock.length);
    $('undo').disabled = board.history.length === 0;
    $('stock').disabled = board.stock.length === 0;
    var root = $('tableau');
    root.innerHTML = '';
    board.tableau.forEach(function (pile, pi) {
      var col = document.createElement('div');
      col.className = 'pile' + (pile.length ? '' : ' empty');
      col.dataset.pile = String(pi);
      pile.forEach(function (card, ci) {
        var el = document.createElement('div');
        el.className = 'card' + (card.faceUp ? '' : ' back');
        el.style.top = (ci * (card.faceUp ? 16 : 8)) + 'px';
        el.textContent = card.faceUp ? rankName(card.rank) : '';
        el.dataset.pile = String(pi);
        el.dataset.card = String(ci);
        if (sel && sel.pile === pi && ci >= sel.card) el.classList.add('sel');
        if (hint && hint.fromPileIndex === pi && ci >= hint.cardIndex) el.classList.add('hint');
        col.appendChild(el);
      });
      root.appendChild(col);
    });
    if (board.gameWon) $('msg').textContent = 'You win. New game?';
  }

  function onPile(pi, ci) {
    if (board.gameWon) return;
    if (sel && (ci == null || pi !== sel.pile)) {
      var next = S.applyMoveEvent(board, { fromPileIndex: sel.pile, toPileIndex: pi, cardIndex: sel.card });
      sel = null; hint = null;
      if (next) {
        board = next;
        if (board.gameWon) { stats.won++; $('msg').textContent = 'You win.'; }
        persist();
      }
      render();
      return;
    }
    if (ci == null) { sel = null; render(); return; }
    var pile = board.tableau[pi];
    var card = pile[ci];
    if (!card || !card.faceUp) return;
    if (!S.isValidMoveGroup(pile.slice(ci))) return;
    if (sel && sel.pile === pi && sel.card === ci) {
      var auto = S.pickAutoMoveTarget(board.tableau, pi, ci);
      if (auto >= 0) {
        var moved = S.applyMoveEvent(board, { fromPileIndex: pi, toPileIndex: auto, cardIndex: ci });
        if (moved) { board = moved; persist(); }
      }
      sel = null;
    } else sel = { pile: pi, card: ci };
    hint = null;
    render();
  }

  $('tableau').addEventListener('click', function (e) {
    var t = e.target.closest('[data-pile]');
    if (!t) return;
    var pi = +t.dataset.pile;
    var ci = t.dataset.card != null ? +t.dataset.card : null;
    onPile(pi, ci);
  });
  $('undo').onclick = function () {
    var next = S.applyUndoEvent(board);
    if (!next) return;
    board = next; sel = null; hint = null; persist(); render();
  };
  $('hint').onclick = function () {
    hint = S.pickHintMove(board.tableau);
    $('msg').textContent = hint ? 'Try that gold run.' : (board.stock.length ? 'Deal from the stock.' : 'No moves.');
    render();
  };
  $('stock').onclick = function () {
    var next = S.applyDealEvent(board);
    if (!next) { $('msg').textContent = 'Fill every pile first.'; return; }
    board = next; sel = null; hint = null; persist(); render();
  };
  $('new').onclick = function () {
    stats.played++;
    board = S.createBoardState(S.randomSeed());
    sel = null; hint = null; $('msg').textContent = '';
    persist(); render();
  };

  async function boot() {
    if (saveDb) {
      try {
        var rec = await saveDb.get('game');
        if (rec && rec.board && rec.board.tableau) {
          board = rec.board;
          if (rec.stats) stats = rec.stats;
        }
      } catch (e) {}
    }
    render();
  }
  boot();
})();
