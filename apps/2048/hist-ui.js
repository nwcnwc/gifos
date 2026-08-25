// The Games panel: every game you have played, newest first, with the board
// as it stands. Tap one to sit back down at it. The only way a game leaves
// this list is the trash button, and that asks first.
(function (root) {
  'use strict';

  var H = root.G2048.Hist;
  var DEL = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

  var $ = function (id) { return document.getElementById(id); };
  var confirming = null;
  var open = false;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  function fmt(n) {
    return String(n || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function chipClass(max) {
    if (!max) return 'chip';
    if (max >= 4096) return 'chip chip-super';
    return 'chip chip-' + max;
  }

  function preview(state) {
    var cells = H.previewCells(state), html = '', i, v;
    for (i = 0; i < cells.length; i++) {
      v = cells[i];
      html += '<i class="pv' + (v ? ' pv-' + (v >= 4096 ? 'super' : v) : '') + '"></i>';
    }
    return '<span class="prev" aria-hidden="true">' + html + '</span>';
  }

  function hist() { return root.G2048.hist; }

  function label() {
    var btn = $('histBtn');
    if (!btn) return;
    var n = hist() ? hist().count() : 0;
    btn.textContent = n ? 'Games · ' + n : 'Games';
  }

  function rowHtml(row, curId, now) {
    var mine = row.id === curId;
    var st = H.status(row);
    var moves = row.moves | 0;
    return '<li class="hg' + (mine ? ' now' : '') + '" data-id="' + esc(row.id) + '">' +
      '<button type="button" class="hg-open" data-open="' + esc(row.id) + '">' +
        preview(row.state) +
        '<span class="hg-meta">' +
          '<span class="hg-top">' +
            '<span class="' + chipClass(row.max | 0) + '">' + (row.max | 0) + '</span>' +
            '<span class="hg-score">' + fmt(row.score | 0) + '</span>' +
            (mine ? '<span class="hg-now">playing now</span>' : '<span class="hg-state">' + st + '</span>') +
          '</span>' +
          '<span class="hg-sub">' + H.relTime(row.updatedAt, now) + ' · ' +
            moves + (moves === 1 ? ' move' : ' moves') + '</span>' +
        '</span>' +
      '</button>' +
      (confirming === row.id
        ? '<span class="hg-confirm"><b>Delete?</b>' +
          '<button type="button" class="hg-yes" data-yes="' + esc(row.id) + '">Delete</button>' +
          '<button type="button" class="hg-no" data-no="1">Keep</button></span>'
        : '<button type="button" class="row-del" data-del="' + esc(row.id) + '" title="Delete this game" aria-label="Delete this game">' + DEL + '</button>') +
      '</li>';
  }

  function render() {
    label();
    if (!open) return;
    var list = $('hist-list');
    var h = hist();
    var rows = h ? h.games() : [];
    var curId = h ? h.currentId() : null;
    var now = Date.now();
    $('hist-count').textContent = rows.length
      ? rows.length + (rows.length === 1 ? ' game' : ' games') + ' kept'
      : '';
    if (!rows.length) {
      list.innerHTML = '<li class="hg-empty">No games yet. Every game you play is kept here — ' +
        'starting a new one never erases the last.</li>';
      return;
    }
    list.innerHTML = rows.map(function (r) { return rowHtml(r, curId, now); }).join('');
  }

  function show() {
    open = true;
    confirming = null;
    $('hist-panel').hidden = false;
    document.body.classList.add('hist-open');
    render();
  }

  function hide() {
    open = false;
    confirming = null;
    $('hist-panel').hidden = true;
    document.body.classList.remove('hist-open');
  }

  function resume(id) {
    var h = hist();
    var game = root.G2048.game;
    if (!h || !game) return;
    if (id === h.currentId()) { hide(); return; }
    if (!h.resume(id)) return;
    game.actuator.continueGame();
    game.setup();
    hide();
  }

  function remove(id) {
    var h = hist();
    if (!h) return;
    var wasCurrent = id === h.currentId();
    h.remove(id);
    confirming = null;
    // Deleting the game under your hands cannot leave it on the board — the
    // next move would file it straight back into history as a new row.
    if (wasCurrent && root.G2048.game) root.G2048.game.restart();
    render();
  }

  function mount() {
    var btn = $('histBtn');
    var panel = $('hist-panel');
    if (!btn || !panel) return;

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (open) hide(); else show();
    });
    $('hist-close').addEventListener('click', function (e) { e.preventDefault(); hide(); });
    panel.addEventListener('click', function (e) {
      if (e.target === panel) hide();
    });
    $('hist-list').addEventListener('click', function (e) {
      var t = e.target;
      var el = t.closest ? t.closest('[data-open],[data-del],[data-yes],[data-no]') : null;
      if (!el) return;
      e.preventDefault();
      if (el.hasAttribute('data-open')) return resume(el.getAttribute('data-open'));
      if (el.hasAttribute('data-del')) { confirming = el.getAttribute('data-del'); return render(); }
      if (el.hasAttribute('data-yes')) return remove(el.getAttribute('data-yes'));
      confirming = null;
      render();
    });
    // Capture, so the panel eats the keys before the game's own document
    // listener does: arrows must not slide tiles you cannot see, and R must
    // not deal a new game out from under the list you are reading.
    document.addEventListener('keydown', function (e) {
      if (!open) return;
      if (e.key === 'Escape' || e.keyCode === 27) { e.preventDefault(); hide(); }
      e.stopPropagation();
    }, true);

    root.G2048.HistUI = { show: show, hide: hide, render: render, isOpen: function () { return open; } };
    render();
  }

  root.G2048.mountHistUI = mount;
})(window);
