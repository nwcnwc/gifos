// Destack of mminer/hexahedral (MIT). The webpack store and vdom shell stay behind.
// Drag the green cube (isometric) or tap a neighbour. Progress + bests are a private save.
(function () {
  'use strict';
  var HEX = window.HEX;
  var $ = function (id) { return document.getElementById(id); };
  var saveDb = null;
  try { if (window.gifos) saveDb = gifos.db('save'); } catch (e) {}

  var state = HEX.create();
  var drag = null;
  var afterTimer = 0;
  var touchSeen = false;

  function persist() {
    if (!saveDb) return;
    saveDb.put(HEX.toSave(state)).catch(function () {});
  }

  function clearTimer() {
    if (afterTimer) { clearTimeout(afterTimer); afterTimer = 0; }
  }

  function band() {
    if (state.level < 10) return 'easy';
    if (state.level < 20) return 'medium';
    return 'hard';
  }

  function squarePx() {
    var cell = document.querySelector('#level .cell');
    if (cell && cell.offsetWidth) return cell.offsetWidth * 1.12;
    return 48;
  }

  function placePlayer() {
    var pl = document.querySelector('#level .player');
    if (!pl) return;
    pl.classList.remove('drag');
    pl.style.top = 'calc(' + state.player.row + ' * var(--square))';
    pl.style.left = 'calc(' + state.player.column + ' * var(--square))';
  }

  function slidePlayer(dRow, dCol) {
    var pl = document.querySelector('#level .player');
    if (!pl) return;
    pl.classList.add('drag');
    pl.style.top = 'calc(' + (state.player.row + dRow) + ' * var(--square))';
    pl.style.left = 'calc(' + (state.player.column + dCol) + ' * var(--square))';
  }

  function clearAim() {
    var aimed = document.querySelectorAll('#level .aim');
    var i;
    for (i = 0; i < aimed.length; i++) aimed[i].classList.remove('aim');
  }

  function aimAt(dRow, dCol) {
    clearAim();
    var stepR = dRow === 0 ? 0 : (dRow > 0 ? 1 : -1);
    var stepC = dCol === 0 ? 0 : (dCol > 0 ? 1 : -1);
    if (Math.abs(dRow) < 0.28 && Math.abs(dCol) < 0.28) return;
    var r = state.player.row + stepR;
    var c = state.player.column + stepC;
    var el = document.querySelector('#level .cell[data-row="' + r + '"][data-col="' + c + '"]');
    if (el) el.classList.add('aim');
  }

  function overlayHtml(kind) {
    var box = $('overlay');
    if (kind === 'hide' || !kind) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.hidden = false;
    if (kind === 'won') {
      var best = state.bests[state.level];
      var line = 'Cleared in ' + state.moves + '.';
      if (typeof best === 'number') line += ' Best ' + best + '.';
      box.innerHTML = '<div class="card">' +
        '<p>' + line + '</p>' +
        '<button type="button" data-act="next">Next</button>' +
        '<button type="button" data-act="retry" class="ghost">Retry</button>' +
        '</div>';
      return;
    }
    if (kind === 'lost') {
      box.innerHTML = '<div class="card">' +
        '<p>Out of moves. The pinks went back up.</p>' +
        '<button type="button" data-act="retry">Retry</button>' +
        '<button type="button" data-act="undo" class="ghost">Undo</button>' +
        '</div>';
      return;
    }
    if (kind === 'cleared') {
      box.innerHTML = '<div class="card">' +
        '<p>Every block is down. Thirty levels, your bests are in this file.</p>' +
        '<button type="button" data-act="menu">Menu</button>' +
        '</div>';
    }
  }

  function applyResult(res) {
    if (!res || !res.ok) {
      placePlayer();
      return;
    }
    persist();
    render();
    if (res.won && res.cleared) {
      clearTimer();
      afterTimer = setTimeout(function () {
        HEX.loadLevel(state, state.level + 1);
        persist();
        render();
      }, 1600);
      return;
    }
    if (res.won) {
      clearTimer();
      afterTimer = setTimeout(function () {
        HEX.loadLevel(state, state.level + 1);
        persist();
        render();
      }, 1600);
      return;
    }
    if (res.lost) {
      clearTimer();
      afterTimer = setTimeout(function () {
        HEX.loadLevel(state, state.level);
        persist();
        render();
      }, 1800);
    }
  }

  function goLevel(n) {
    clearTimer();
    HEX.loadLevel(state, n);
    persist();
    render();
  }

  function renderMenu() {
    $('menu').hidden = false;
    $('level').hidden = true;
    $('nav').innerHTML = '';
    $('hud').hidden = true;
    $('tools').hidden = true;
    $('pad').hidden = true;
    overlayHtml('hide');
    document.body.className = '';
    var resume = $('resume');
    var sub = $('menu-sub');
    var nBests = HEX.bestCount(state);
    if (state.view === 'cleared' || nBests === HEX.count) {
      resume.hidden = true;
      sub.textContent = 'All thirty are down. Bests stay in this file.';
      $('msg').textContent = nBests + ' bests on file.';
    } else if (state.maxReached > 0 || nBests > 0) {
      resume.hidden = false;
      resume.textContent = 'Resume level ' + (state.level + 1);
      sub.textContent = nBests
        ? (nBests + ' best' + (nBests === 1 ? '' : 's') + ' on file.')
        : 'The level you reached is still in this file.';
      $('msg').textContent = 'Drag the green cube, or tap a neighbour.';
    } else {
      resume.hidden = true;
      sub.textContent = 'Thirty jam levels. Your best stays in this file.';
      $('msg').textContent = 'Drag the green cube, or tap a neighbour.';
    }
  }

  function renderCleared() {
    $('menu').hidden = true;
    $('level').hidden = true;
    $('nav').innerHTML = '';
    $('hud').hidden = true;
    $('tools').hidden = true;
    document.body.className = 'won';
    overlayHtml('cleared');
    $('msg').textContent = HEX.bestCount(state) + ' bests on file.';
  }

  function render() {
    if (state.view === 'menu') { renderMenu(); return; }
    if (state.view === 'cleared') { renderCleared(); return; }
    document.body.className = (state.status === 'won' ? 'won ' : state.status === 'lost' ? 'lost ' : '') + band();
    $('menu').hidden = true;
    $('level').hidden = false;
    $('hud').hidden = false;
    $('tools').hidden = false;
    $('undo').disabled = !state.history.length;
    $('progress').style.width = (100 * state.moves / state.maxMoves) + '%';
    var nav = $('nav');
    nav.innerHTML = '';
    var start = state.level < 10 ? 0 : state.level < 20 ? 10 : 20;
    var i;
    for (i = start; i < start + 10; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = String(i + 1);
      if (i === state.level) b.className = 'now';
      else if (i <= state.maxReached) b.className = 'done';
      b.disabled = i > state.maxReached;
      b.dataset.n = String(i);
      if (typeof state.bests[i] === 'number') b.title = 'best ' + state.bests[i];
      nav.appendChild(b);
    }
    var field = $('level');
    var rows = state.tiles.length, cols = state.tiles[0].length;
    field.style.width = 'calc(' + cols + ' * var(--square))';
    field.style.height = 'calc(' + rows + ' * var(--square))';
    field.innerHTML = '';
    var r, c;
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) {
      var cell = document.createElement('div');
      var t = state.tiles[r][c];
      cell.className = 'cell ' + (t === HEX.UNPRESSED ? 'unpressed' : t === HEX.PRESSED ? 'pressed' : 'broken');
      cell.style.top = 'calc(' + r + ' * var(--square))';
      cell.style.left = 'calc(' + c + ' * var(--square))';
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
      if (state.status === 'playing' && HEX.canMoveTo(state, r, c) &&
          Math.abs(state.player.row - r) + Math.abs(state.player.column - c) === 1) {
        cell.className += ' neighbour';
      }
      field.appendChild(cell);
    }
    var pl = document.createElement('div');
    pl.className = 'player';
    pl.style.top = 'calc(' + state.player.row + ' * var(--square))';
    pl.style.left = 'calc(' + state.player.column + ' * var(--square))';
    field.appendChild(pl);
    if (state.status === 'won') overlayHtml('won');
    else if (state.status === 'lost') overlayHtml('lost');
    else overlayHtml('hide');
    if (state.status === 'playing') {
      var left = state.maxMoves - state.moves;
      var best = state.bests[state.level];
      var msg = left + ' left · level ' + (state.level + 1);
      if (typeof best === 'number') msg += ' · best ' + best;
      $('msg').textContent = msg;
    } else if (state.status === 'won') {
      $('msg').textContent = 'Cleared in ' + state.moves + '.';
    } else if (state.status === 'lost') {
      $('msg').textContent = 'Out of moves.';
    }
    if (touchSeen && state.status === 'playing') $('pad').hidden = false;
    else if (state.status !== 'playing') $('pad').hidden = true;
  }

  $('menu').addEventListener('click', function (e) {
    if (e.target.id === 'resume') {
      goLevel(state.level);
      return;
    }
    var b = e.target.closest('button[data-diff]');
    if (!b) return;
    goLevel(+b.dataset.diff);
  });
  $('nav').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-n]');
    if (!b || b.disabled) return;
    goLevel(+b.dataset.n);
  });
  $('undo').addEventListener('click', function () {
    clearTimer();
    if (HEX.undo(state)) { persist(); render(); }
  });
  $('retry').addEventListener('click', function () {
    goLevel(state.level);
  });
  $('overlay').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (!b) return;
    var act = b.dataset.act;
    if (act === 'next') goLevel(state.level + 1);
    else if (act === 'retry') goLevel(state.level);
    else if (act === 'undo') {
      clearTimer();
      if (HEX.undo(state)) { persist(); render(); }
    } else if (act === 'menu') {
      clearTimer();
      state.view = 'menu';
      persist();
      render();
    }
  });
  $('pad').addEventListener('pointerdown', function (e) {
    var b = e.target.closest('button[data-dr]');
    if (!b || state.status !== 'playing') return;
    e.preventDefault();
    applyResult(HEX.move(state, +b.dataset.dr, +b.dataset.dc));
  });

  var keysDown = {};
  document.addEventListener('keydown', function (e) {
    if (state.view !== 'play' || state.status !== 'playing') return;
    if (keysDown[e.keyCode]) return;
    var code = e.keyCode;
    var res = null;
    if (code === 37) res = HEX.move(state, 0, -1);
    else if (code === 38) res = HEX.move(state, -1, 0);
    else if (code === 39) res = HEX.move(state, 0, 1);
    else if (code === 40) res = HEX.move(state, 1, 0);
    else if (code === 82) { goLevel(state.level); return; }
    else if (code === 85) {
      if (HEX.undo(state)) { persist(); render(); }
      keysDown[code] = 1;
      e.preventDefault();
      return;
    } else return;
    keysDown[code] = 1;
    e.preventDefault();
    applyResult(res);
  });
  document.addEventListener('keyup', function (e) { delete keysDown[e.keyCode]; });

  function revealPad() {
    if (touchSeen) return;
    touchSeen = true;
    document.body.classList.add('touch');
    if (state.view === 'play' && state.status === 'playing') $('pad').hidden = false;
  }
  window.addEventListener('touchstart', revealPad, { passive: true });

  var stage = $('stage');
  stage.addEventListener('pointerdown', function (e) {
    if (state.view !== 'play' || state.status !== 'playing') return;
    if (e.button) return;
    if (e.target.closest('#overlay') || e.target.closest('#menu')) return;
    if (e.pointerType === 'touch' || e.pointerType === 'pen') revealPad();
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId, mode: 'tap' };
    try { stage.setPointerCapture(e.pointerId); } catch (err) {}
  });
  stage.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (drag.mode === 'tap' && (dx * dx + dy * dy) < 144) return;
    if (e.cancelable) e.preventDefault();
    drag.mode = 'slide';
    var off = HEX.isoDrag(dx, dy, squarePx());
    drag.dRow = off.dRow;
    drag.dCol = off.dCol;
    slidePlayer(off.dRow, off.dCol);
    aimAt(off.dRow, off.dCol);
  });
  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    var d = drag;
    drag = null;
    clearAim();
    if (d.mode === 'slide') {
      var dx = (e && e.clientX || 0) - d.x;
      var dy = (e && e.clientY || 0) - d.y;
      if (e && e.type === 'pointercancel') { placePlayer(); return; }
      var dir = HEX.isoDir(dx, dy, squarePx() * 0.32);
      if (dir) applyResult(HEX.move(state, dir.dRow, dir.dCol));
      else placePlayer();
      return;
    }
    var x = d.x, y = d.y;
    var hit = document.elementFromPoint(x, y);
    var cell = hit && hit.closest ? hit.closest('#level .cell') : null;
    if (cell) applyResult(HEX.moveTo(state, +cell.dataset.row, +cell.dataset.col));
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  if (window.gifos && gifos.onBack) {
    gifos.onBack(function () {
      if (state.view === 'play' || state.view === 'cleared') {
        clearTimer();
        state.view = 'menu';
        persist();
        render();
        return true;
      }
      return false;
    });
  }

  async function boot() {
    if (saveDb) {
      try {
        var rec = await saveDb.get('progress');
        if (rec) HEX.applySave(state, rec);
      } catch (e) {}
    }
    render();
  }
  render();
  boot();
})();
