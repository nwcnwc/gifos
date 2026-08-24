// Klondike UI. Tap-to-move, drag, undo. The tableau is a private gifos.db save.
(function () {
  'use strict';
  var K = window.Klondike;
  var $ = function (id) { return document.getElementById(id); };
  var pileEl = $('js-deck-pile');
  var wasteEl = $('js-deck-deal');
  var finishEl = $('js-finish');
  var deskEl = $('js-board');
  var winEl = $('win');
  var askEl = $('ask');
  var saveDb = null;
  try { if (window.gifos) saveDb = gifos.db('save'); } catch (e) {}

  var s = K.newGame();
  var els = [];
  var finishSlots = [];
  var deskSlots = [];
  var selected = null;
  var hintOn = null;
  var dragging = null;
  var justDragged = false;
  var autoTimer = 0;
  var tickTimer = 0;
  var persistTimer = 0;

  function persist() {
    if (!saveDb) return;
    var snap = K.snapshot(s);
    saveDb.put(snap).catch(function () {});
  }
  function persistSoon() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(function () { persistTimer = 0; persist(); }, 400);
  }

  function fmtTime(sec) {
    sec = Math.max(0, sec | 0);
    var m = (sec / 60) | 0, r = sec % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  function hud() {
    $('score').textContent = String(s.score);
    $('moves').textContent = String(s.moves);
    $('clock').textContent = fmtTime(s.elapsed);
    $('stockN').textContent = s.pile.length ? String(s.pile.length) : '';
    $('undo').disabled = s.history.length === 0 || s.won;
    $('hint').disabled = s.won;
    $('auto').hidden = !K.allFaceUp(s) || s.won;
    $('drawN').textContent = s.draw === 1 ? 'Draw 1' : 'Draw 3';
    pileEl.classList.toggle('empty', s.pile.length === 0);
    pileEl.classList.toggle('recycle', s.pile.length === 0 && s.waste.length > 0);
  }

  function paint(i) {
    var c = s.cards[i], el = els[i];
    var suit = K.SUIT_CLASS[c.type] || 'spades';
    el.className = 'card card--' + suit + (c.facingUp ? ' card--front' : ' card--back') +
      (c.number === 10 ? ' card--ten' : '');
    el.classList.toggle('sel', selected === i);
    el.classList.toggle('hint', !!(hintOn && hintOn.card === i));
    el.querySelector('.rank').textContent = K.rankName(c.number);
    var nodes = el.querySelectorAll('.suit-ch');
    var k;
    for (k = 0; k < nodes.length; k++) nodes[k].textContent = K.SUITS[c.type];
  }

  function mount(list, parent, nest) {
    var i, el, prev = null;
    for (i = 0; i < list.length; i++) {
      el = els[list[i]];
      el.style.left = '';
      el.style.top = '';
      el.classList.remove('card--moving');
      paint(list[i]);
      if (nest && prev) prev.appendChild(el);
      else parent.appendChild(el);
      prev = el;
    }
  }

  function render() {
    var i;
    for (i = 0; i < 7; i++) {
      deskSlots[i].innerHTML = '';
      mount(s.desk[i], deskSlots[i], true);
    }
    for (i = 0; i < 4; i++) {
      finishSlots[i].innerHTML = '';
      mount(s.finish[i], finishSlots[i], true);
    }
    var cards = pileEl.querySelectorAll('.card'), ci;
    for (ci = 0; ci < cards.length; ci++) cards[ci].parentNode.removeChild(cards[ci]);
    wasteEl.innerHTML = '';
    mount(s.pile, pileEl, false);
    if ($('stockN')) pileEl.appendChild($('stockN'));
    mount(s.waste, wasteEl, false);
    hud();
    if (s.won) {
      winEl.hidden = false;
      $('winStats').textContent = s.score + ' · ' + s.moves + ' moves · ' + fmtTime(s.elapsed);
    } else winEl.hidden = true;
  }

  function afterMove() {
    selected = null;
    hintOn = null;
    render();
    persistSoon();
    if (s.won) stopTick();
  }

  function tryTap(card) {
    if (s.won) return;
    if (selected != null && selected !== card) {
      var dests = K.tapDests(s, selected);
      var L = K.loc(s, card);
      var i, d;
      for (i = 0; i < dests.length; i++) {
        d = dests[i];
        if (d.dest === 'desk' && L && L.location === 'desk' && L.pile === d.pile) {
          if (K.applyMove(s, selected, d)) { afterMove(); return; }
        }
        if (d.dest === 'finish' && L && L.location === 'finish' && L.pile === d.pile) {
          if (K.applyMove(s, selected, d)) { afterMove(); return; }
        }
      }
    }
    if (selected === card) { selected = null; hintOn = null; render(); return; }
    var homes = K.tapDests(s, card);
    if (!homes.length) {
      if (K.playable(s, card)) { selected = card; render(); }
      return;
    }
    var foundations = homes.filter(function (h) { return h.dest === 'finish'; });
    if (foundations.length === 1 && homes.length === 1) {
      K.applyMove(s, card, foundations[0] || homes[0]);
      afterMove();
      return;
    }
    if (homes.length === 1) {
      K.applyMove(s, card, homes[0]);
      afterMove();
      return;
    }
    if (foundations.length) {
      K.applyMove(s, card, foundations[0]);
      afterMove();
      return;
    }
    selected = card;
    hintOn = { card: card, dest: homes[0] };
    render();
  }

  function onStock() {
    if (s.won) return;
    if (K.stockTap(s)) afterMove();
  }

  function newGame(force) {
    if (!force && s.moves > 0 && !s.won) {
      askEl.hidden = false;
      return;
    }
    askEl.hidden = true;
    stopAuto();
    var draw = s.draw;
    s = K.newGame(null, draw);
    selected = null;
    hintOn = null;
    startTick();
    render();
    persist();
  }

  function doUndo() {
    if (!K.undo(s)) return;
    selected = null;
    hintOn = null;
    render();
    persistSoon();
  }

  function doHint() {
    hintOn = K.hint(s);
    if (!hintOn) return;
    if (hintOn.draw || hintOn.recycle) {
      pileEl.classList.add('hint');
      setTimeout(function () { pileEl.classList.remove('hint'); }, 900);
      return;
    }
    render();
    setTimeout(function () { hintOn = null; render(); }, 1200);
  }

  function stopAuto() {
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = 0; }
  }
  function runAuto() {
    stopAuto();
    if (s.won) return;
    if (!K.autoStep(s)) { afterMove(); return; }
    render();
    persistSoon();
    autoTimer = setTimeout(runAuto, 140);
  }

  function startTick() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(function () {
      if (s.won) return;
      s.elapsed += 1;
      $('clock').textContent = fmtTime(s.elapsed);
      if (s.elapsed % 8 === 0) persistSoon();
    }, 1000);
  }
  function stopTick() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = 0; }
  }

  function makeCard(i) {
    var el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = '<span class="pip tl"><span class="rank"></span><span class="suit-ch"></span></span>' +
      '<span class="pip center suit-ch"></span>' +
      '<span class="pip br"><span class="rank"></span><span class="suit-ch"></span></span>';
    el.addEventListener('pointerdown', onDown(i));
    el.addEventListener('click', onClick(i));
    return el;
  }

  function onClick(i) {
    return function (e) {
      e.stopPropagation();
      if (justDragged) return;
      if (dragging) return;
      var L = K.loc(s, i);
      if (L && L.location === 'pile') { onStock(); return; }
      tryTap(i);
    };
  }

  function point(e) {
    var t = e.touches && e.touches[0] ? e.touches[0] :
      (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : e);
    return { x: t.clientX, y: t.clientY };
  }

  function destHitList(card) {
    var dests = K.destinations(s, card, false);
    return dests.map(function (d) {
      var el = d.dest === 'finish' ? finishSlots[d.pile] :
        (s.desk[d.pile].length ? els[s.desk[d.pile][s.desk[d.pile].length - 1]] : deskSlots[d.pile]);
      var b = el.getBoundingClientRect();
      el.classList.add('finish-dest');
      return { d: d, el: el, b: b };
    });
  }

  function clearHits(list) {
    (list || []).forEach(function (h) { h.el.classList.remove('finish-dest'); });
  }

  function onDown(i) {
    return function (e) {
      if (e.button != null && e.button !== 0) return;
      if (s.won) return;
      if (!K.playable(s, i)) return;
      e.stopPropagation();
      var start = point(e);
      var armed = false;
      var hits = [];
      function arm() {
        if (armed) return;
        armed = true;
        dragging = {
          card: i,
          el: els[i],
          dx: start.x - els[i].getBoundingClientRect().left,
          dy: start.y - els[i].getBoundingClientRect().top
        };
        hits = destHitList(i);
        els[i].classList.add('card--moving');
        moveAt(start);
      }
      function moveAt(p) {
        els[i].style.left = (p.x - dragging.dx) + 'px';
        els[i].style.top = (p.y - dragging.dy) + 'px';
      }
      function onMove(ev) {
        var p = point(ev);
        if (!armed) {
          var dx = p.x - start.x, dy = p.y - start.y;
          if (dx * dx + dy * dy > 64) arm();
          else return;
        }
        moveAt(p);
        ev.preventDefault();
      }
      function onUp(ev) {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        if (!armed) return;
        var p = point(ev);
        var dropped = false, h;
        for (h = 0; h < hits.length; h++) {
          var b = hits[h].b;
          if (p.x > b.left && p.x < b.left + b.width && p.y > b.top && p.y < b.top + b.height) {
            if (K.applyMove(s, i, hits[h].d)) dropped = true;
            break;
          }
        }
        clearHits(hits);
        dragging = null;
        justDragged = true;
        setTimeout(function () { justDragged = false; }, 80);
        if (dropped) afterMove();
        else {
          els[i].classList.remove('card--moving');
          els[i].style.left = '';
          els[i].style.top = '';
        }
      }
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };
  }

  function initDom() {
    var i, el;
    for (i = 0; i < 4; i++) {
      el = document.createElement('div');
      el.className = 'aces aces--' + i;
      (function (pile) {
        el.addEventListener('click', function () {
          if (selected == null) return;
          var dests = K.tapDests(s, selected);
          var k;
          for (k = 0; k < dests.length; k++) {
            if (dests[k].dest === 'finish' && dests[k].pile === pile) {
              if (K.applyMove(s, selected, dests[k])) afterMove();
              return;
            }
          }
        });
      })(i);
      finishSlots.push(el);
      finishEl.appendChild(el);
    }
    for (i = 0; i < 7; i++) {
      el = document.createElement('div');
      el.className = 'seven seven--' + i;
      (function (pile) {
        el.addEventListener('click', function (e) {
          if (e.target !== el) return;
          if (selected == null) return;
          var dests = K.tapDests(s, selected);
          var k;
          for (k = 0; k < dests.length; k++) {
            if (dests[k].dest === 'desk' && dests[k].pile === pile) {
              if (K.applyMove(s, selected, dests[k])) afterMove();
              return;
            }
          }
        });
      })(i);
      deskSlots.push(el);
      deskEl.appendChild(el);
    }
    for (i = 0; i < 52; i++) els[i] = makeCard(i);
    pileEl.addEventListener('click', function (e) {
      if (e.target === pileEl || (e.target.classList && e.target.classList.contains('card--back'))) onStock();
    });
    $('js-reset').addEventListener('click', function () { newGame(false); });
    $('undo').addEventListener('click', doUndo);
    $('hint').addEventListener('click', doHint);
    $('auto').addEventListener('click', runAuto);
    $('drawN').addEventListener('click', function () {
      s.draw = s.draw === 3 ? 1 : 3;
      hud();
      persistSoon();
    });
    $('askYes').addEventListener('click', function () { newGame(true); });
    $('askNo').addEventListener('click', function () { askEl.hidden = true; });
    winEl.addEventListener('click', function () { newGame(true); });
    document.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      var k = e.key || '';
      if (k === 'u' || k === 'U') doUndo();
      else if (k === 'h' || k === 'H') doHint();
      else if (k === 'n' || k === 'N') newGame(false);
      else if (k === ' ' || k === 'Spacebar' || k === 'd' || k === 'D') {
        e.preventDefault();
        onStock();
      }
    });
  }

  async function boot() {
    initDom();
    var rec = null;
    if (saveDb) {
      try { rec = await saveDb.get('game'); } catch (e) {}
    }
    var loaded = rec && K.restore(rec);
    if (loaded) s = loaded;
    else s = K.newGame();
    render();
    if (!s.won) startTick();
    if (window.gifos && gifos.onBack) {
      gifos.onBack(function () {
        if (!askEl.hidden) { askEl.hidden = true; return true; }
        if (selected != null) { selected = null; hintOn = null; render(); return true; }
        if (s.history.length && !s.won) { doUndo(); return true; }
        return false;
      });
    }
  }
  boot();
})();
