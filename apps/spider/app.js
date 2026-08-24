// Spider UI. Tap a run, tap a pile — or drag. Tableau is a private save.
(function () {
  'use strict';
  var S = window.Spider;
  var NAMES = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  var SUIT_CH = ['♠', '♥', '♦', '♣'];
  var SUIT_RED = { 1: 1, 2: 1 };
  function rankName(n) { return NAMES[n] || String(n); }
  var $ = function (id) { return document.getElementById(id); };
  var saveDb = null;
  try { if (window.gifos) saveDb = gifos.db('save'); } catch (e) {}

  var board = S.createBoardState(S.randomSeed(), 1);
  var stats = { played: 0, won: 0, suits: 1 };
  var sel = null;
  var hint = null;
  var overlayMode = null;
  var persistErr = '';
  var drag = null;

  function persist() {
    if (!saveDb) return;
    saveDb.put({ id: 'game', board: board, stats: stats }).catch(function (err) {
      persistErr = (err && err.message) ? err.message : 'Could not save.';
      $('msg').textContent = persistErr;
    });
  }

  function fanFor(pile) {
    var n = pile.length;
    if (n < 2) return { up: 18, dn: 9 };
    var budget = Math.max(220, (window.innerHeight || 600) - 280);
    var ups = 0, dns = 0, i;
    for (i = 0; i < n - 1; i++) { if (pile[i].faceUp) ups++; else dns++; }
    var up = 18, dn = 9;
    var need = ups * up + dns * dn;
    if (need > budget) {
      var s = budget / need;
      up = Math.max(14, Math.floor(up * s));
      dn = Math.max(7, Math.floor(dn * s));
    }
    document.documentElement.style.setProperty('--fan-up', up + 'px');
    document.documentElement.style.setProperty('--fan-dn', dn + 'px');
    return { up: up, dn: dn };
  }

  function paintCard(el, card) {
    el.className = 'card' + (card.faceUp ? '' : ' back') + (SUIT_RED[card.suit] ? ' red' : '');
    el.innerHTML = '';
    if (!card.faceUp) return;
    var suit = SUIT_CH[card.suit | 0];
    function pip(cls, text) {
      var s = document.createElement('span');
      s.className = 'pip ' + cls;
      s.textContent = text;
      el.appendChild(s);
    }
    pip('tl', rankName(card.rank) + suit);
    pip('center', suit);
  }

  function legalTargets(pi, ci) {
    var out = {}, moves = S.enumerateMoves(board.tableau), i;
    for (i = 0; i < moves.length; i++) {
      if (moves[i].fromPileIndex === pi && moves[i].cardIndex === ci) out[moves[i].toPileIndex] = 1;
    }
    return out;
  }

  function renderFoundations() {
    var root = $('foundations');
    root.innerHTML = '';
    var i;
    for (i = 0; i < 8; i++) {
      var slot = document.createElement('div');
      slot.className = 'slot' + (i < board.foundation ? ' full' : '');
      if (i < board.foundation) {
        var pip = document.createElement('span');
        pip.className = 'pip';
        pip.textContent = 'K' + SUIT_CH[board.suits === 1 ? 0 : (i % board.suits)];
        if (board.suits !== 1 && (i % board.suits === 1 || i % board.suits === 2)) slot.classList.add('red');
        slot.appendChild(pip);
      }
      root.appendChild(slot);
    }
  }

  function renderStock() {
    var n = board.stock.length;
    var deals = Math.ceil(n / 10);
    $('stockN').textContent = String(deals);
    $('stock').disabled = n === 0 || board.gameWon;
    var stack = $('stockStack');
    stack.innerHTML = '';
    var show = Math.min(5, deals);
    var i;
    for (i = 0; i < show; i++) {
      var el = document.createElement('div');
      el.className = 'card back';
      el.style.left = (i * 3) + 'px';
      el.style.top = (i * 2) + 'px';
      stack.appendChild(el);
    }
  }

  function render() {
    $('score').textContent = String(board.score);
    $('found').textContent = String(board.foundation);
    $('record').textContent = (stats.won | 0) ? ((stats.won | 0) + 'W') : '';
    $('undo').disabled = !board.history || board.history.length === 0;
    var i;
    for (i = 0; i < 3; i++) {
      var b = document.querySelector('.diff [data-suits="' + [1, 2, 4][i] + '"]');
      if (b) b.classList.toggle('on', (board.suits | 0) === [1, 2, 4][i]);
    }
    renderFoundations();
    renderStock();
    var root = $('tableau');
    root.innerHTML = '';
    var targets = sel ? legalTargets(sel.pile, sel.card) : {};
    board.tableau.forEach(function (pile, pi) {
      var fan = fanFor(pile);
      var col = document.createElement('div');
      col.className = 'pile' + (pile.length ? '' : ' empty') + (targets[pi] ? ' drop' : '');
      col.dataset.pile = String(pi);
      var y = 0;
      pile.forEach(function (card, ci) {
        var el = document.createElement('div');
        paintCard(el, card);
        el.style.top = y + 'px';
        el.dataset.pile = String(pi);
        el.dataset.card = String(ci);
        if (sel && sel.pile === pi && ci >= sel.card) el.classList.add('sel');
        if (hint && hint.fromPileIndex === pi && ci >= hint.cardIndex) el.classList.add('hint');
        col.appendChild(el);
        y += card.faceUp ? fan.up : fan.dn;
      });
      col.style.height = Math.max(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-h')) || 90, y + 8) + 'px';
      root.appendChild(col);
    });
    if (board.gameWon && overlayMode !== 'win') {
      showOverlay('win', 'You win.', board.score + ' · ' + board.moves + ' moves. New game?');
    } else if (!persistErr && !board.gameWon) {
      if (!S.enumerateMoves(board.tableau).length && !S.canDeal(board)) {
        $('msg').textContent = board.stock.length ? 'Fill every pile, then deal.' : 'No moves left. Undo, or New.';
      } else if (!$('msg').textContent || $('msg').textContent.indexOf('Could not') === -1) {
        /* keep a hint message if one is showing */
      }
    }
  }

  function showOverlay(mode, title, sub) {
    overlayMode = mode;
    $('ov-title').textContent = title;
    $('ov-sub').textContent = sub || '';
    $('ov-no').textContent = mode === 'win' ? 'Look' : 'Keep playing';
    $('ov-yes').textContent = 'New game';
    $('overlay').hidden = false;
  }
  function hideOverlay() {
    overlayMode = null;
    $('overlay').hidden = true;
  }

  function dealNew(suits, seed) {
    suits = S.normSuits(suits == null ? stats.suits : suits);
    stats.suits = suits;
    stats.played++;
    board = S.createBoardState(seed || S.randomSeed(), suits);
    sel = null; hint = null; persistErr = '';
    $('msg').textContent = '';
    hideOverlay();
    persist();
    render();
  }

  function apply(next) {
    if (!next) return false;
    var wasWon = board.gameWon;
    board = next;
    sel = null; hint = null;
    if (next.gameWon && !wasWon) {
      stats.won++;
      $('msg').textContent = 'You win.';
    }
    persist();
    render();
    return true;
  }

  function onPile(pi, ci) {
    if (board.gameWon) return;
    if (sel && (ci == null || pi !== sel.pile)) {
      var next = S.applyMoveEvent(board, { fromPileIndex: sel.pile, toPileIndex: pi, cardIndex: sel.card });
      if (next) { apply(next); return; }
      sel = null; hint = null;
      if (ci == null) { render(); return; }
    }
    if (ci == null) { sel = null; render(); return; }
    var pile = board.tableau[pi];
    var card = pile[ci];
    if (!card || !card.faceUp) return;
    if (!S.isValidMoveGroup(pile.slice(ci))) return;
    if (sel && sel.pile === pi && sel.card === ci) {
      var auto = S.pickAutoMoveTarget(board.tableau, pi, ci);
      if (auto >= 0) {
        apply(S.applyMoveEvent(board, { fromPileIndex: pi, toPileIndex: auto, cardIndex: ci }));
        return;
      }
      sel = null;
    } else sel = { pile: pi, card: ci };
    hint = null;
    $('msg').textContent = '';
    render();
  }

  function pileAtPoint(x, y) {
    var cols = document.querySelectorAll('.pile');
    var i, r;
    for (i = 0; i < cols.length; i++) {
      r = cols[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom + 24) return i;
    }
    return -1;
  }

  function startDrag(pi, ci, x, y) {
    var pile = board.tableau[pi];
    if (!pile || !pile[ci] || !pile[ci].faceUp) return;
    if (!S.isValidMoveGroup(pile.slice(ci))) return;
    drag = { pile: pi, card: ci, x: x, y: y, started: false };
  }

  function moveDrag(x, y) {
    if (!drag) return;
    var dx = x - drag.x, dy = y - drag.y;
    if (!drag.started && dx * dx + dy * dy < 64) return;
    if (!drag.started) {
      drag.started = true;
      sel = { pile: drag.pile, card: drag.card };
      hint = null;
      var g = $('ghost');
      g.innerHTML = '';
      g.hidden = false;
      board.tableau[drag.pile].slice(drag.card).forEach(function (card) {
        var el = document.createElement('div');
        paintCard(el, card);
        g.appendChild(el);
      });
      render();
    }
    var g = $('ghost');
    g.style.left = (x - 20) + 'px';
    g.style.top = (y - 12) + 'px';
  }

  function endDrag(x, y) {
    if (!drag) return;
    var started = drag.started, pi = drag.pile, ci = drag.card;
    drag = null;
    $('ghost').hidden = true;
    $('ghost').innerHTML = '';
    if (started) {
      var dest = pileAtPoint(x, y);
      if (dest >= 0 && dest !== pi) {
        apply(S.applyMoveEvent(board, { fromPileIndex: pi, toPileIndex: dest, cardIndex: ci }));
      } else render();
      return;
    }
    onPile(pi, ci);
  }

  $('tableau').addEventListener('pointerdown', function (e) {
    if (e.button != null && e.button !== 0) return;
    var t = e.target.closest('[data-pile]');
    if (!t) return;
    var pi = +t.dataset.pile;
    var ci = t.dataset.card != null ? +t.dataset.card : null;
    if (ci == null) {
      startDrag(pi, 0, e.clientX, e.clientY);
      drag = { pile: pi, card: null, x: e.clientX, y: e.clientY, started: false, empty: true };
      return;
    }
    e.preventDefault();
    try { t.setPointerCapture(e.pointerId); } catch (err) {}
    startDrag(pi, ci, e.clientX, e.clientY);
  });
  $('tableau').addEventListener('pointermove', function (e) {
    if (drag) moveDrag(e.clientX, e.clientY);
  });
  function pointerUp(e) {
    if (!drag) return;
    if (drag.empty) {
      var destPi = drag.pile;
      drag = null;
      onPile(destPi, null);
      return;
    }
    endDrag(e.clientX, e.clientY);
  }
  $('tableau').addEventListener('pointerup', pointerUp);
  $('tableau').addEventListener('pointercancel', function () {
    drag = null; $('ghost').hidden = true;
  });

  $('undo').onclick = function () {
    var next = S.applyUndoEvent(board);
    if (!next) return;
    board = next; sel = null; hint = null; $('msg').textContent = ''; persist(); render();
  };
  $('hint').onclick = function () {
    hint = S.pickHintMove(board.tableau);
    $('msg').textContent = hint ? 'Try that gold run.' : (S.canDeal(board) ? 'Deal from the stock.' : (board.stock.length ? 'Fill every pile first.' : 'No moves.'));
    render();
  };
  $('stock').onclick = function () {
    if (board.gameWon) return;
    var next = S.applyDealEvent(board);
    if (!next) { $('msg').textContent = 'Fill every pile first.'; return; }
    apply(next);
  };
  function askNew(suits) {
    if (board.moves > 0 && !board.gameWon) {
      overlayMode = { kind: 'new', suits: suits };
      showOverlay('new', 'Leave this deal?', 'The tableau is saved until you confirm.');
      return;
    }
    dealNew(suits == null ? board.suits : suits);
  }
  $('new').onclick = function () { askNew(board.suits); };
  document.querySelector('.diff').addEventListener('click', function (e) {
    var b = e.target.closest('[data-suits]');
    if (!b) return;
    var suits = +b.dataset.suits;
    if (suits === (board.suits | 0)) return;
    askNew(suits);
  });
  $('ov-no').onclick = hideOverlay;
  $('ov-yes').onclick = function () {
    var suits = board.suits;
    if (overlayMode && overlayMode.kind === 'new' && overlayMode.suits) suits = overlayMode.suits;
    dealNew(suits);
  };

  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    var k = e.key;
    if (k === 'Escape') {
      if (overlayMode) { hideOverlay(); e.preventDefault(); return; }
      if (sel) { sel = null; hint = null; render(); e.preventDefault(); }
      return;
    }
    if (overlayMode) return;
    if (k === 'u' || k === 'U' || k === 'z' || k === 'Z' || k === 'Backspace') { $('undo').click(); e.preventDefault(); }
    else if (k === 'h' || k === 'H') { $('hint').click(); e.preventDefault(); }
    else if (k === 'd' || k === 'D' || k === ' ') { $('stock').click(); e.preventDefault(); }
    else if (k === 'n' || k === 'N') { $('new').click(); e.preventDefault(); }
    else if (k === '1' || k === '2' || k === '4') askNew(+k);
  });

  if (window.gifos && gifos.onBack) {
    gifos.onBack(function () {
      if (overlayMode) { hideOverlay(); return true; }
      if (sel) { sel = null; hint = null; render(); return true; }
      return false;
    });
  }

  function applyLaunch(go) {
    if (!go || go.deal == null || go.deal === '') return false;
    var parts = String(go.deal).split('@');
    var seed = parts[0];
    var suits = parts[1] ? S.normSuits(+parts[1]) : (stats.suits || 1);
    dealNew(suits, seed);
    $('msg').textContent = 'This deal.';
    return true;
  }

  async function boot() {
    if (saveDb) {
      try {
        var rec = await saveDb.get('game');
        if (rec && rec.stats) stats = rec.stats;
        if (rec && rec.board) {
          var loaded = S.hydrateBoard(rec.board);
          if (loaded) board = loaded;
        }
      } catch (e) {}
    }
    render();
    if (window.gifos && gifos.launch) {
      try {
        var go = await gifos.launch();
        applyLaunch(go);
      } catch (e) {}
    }
  }
  boot();
})();
