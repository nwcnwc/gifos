/* Phone: tap ≡ to open hidden menus; pointer drag; bottom bar. */
(function (root) {
  'use strict';

  function closeMenus(except) {
    var open = document.querySelectorAll('.menu.open, .ops.open, .logo.open, .config.open');
    for (var i = 0; i < open.length; i++) {
      if (open[i] !== except) open[i].classList.remove('open');
    }
  }

  function teaserOf(el) {
    return el.closest('.menu, .ops, .logo, .config');
  }

  function onDocClick(ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    if (t.closest('#phone-bar')) return;
    var box = teaserOf(t);
    if (t.closest('.teaser') && box) {
      var willOpen = !box.classList.contains('open');
      closeMenus(box);
      box.classList.toggle('open', willOpen);
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    if (box && box.classList.contains('open') && t.closest('.bulk')) return;
    closeMenus(null);
  }

  function wirePointers() {
    if (!root.NB || !root.NB.noteDrag) return;
    document.addEventListener('pointermove', function (ev) {
      if (!root.NB) return;
      if (root.NB.noteDrag) root.NB.noteDrag.onMouseMove(ev);
      if (root.NB.loadDrag) root.NB.loadDrag.onMouseMove(ev);
      if (root.NB.varAdjust) root.NB.varAdjust.onMouseMove(ev);
    }, { passive: true });
    document.addEventListener('pointerup', function () {
      if (!root.NB) return;
      if (root.NB.noteDrag) root.NB.noteDrag.end();
      if (root.NB.loadDrag) root.NB.loadDrag.end();
      if (root.NB.varAdjust) root.NB.varAdjust.end();
    });
    document.addEventListener('pointercancel', function () {
      if (!root.NB) return;
      if (root.NB.noteDrag) root.NB.noteDrag.end();
      if (root.NB.loadDrag) root.NB.loadDrag.end();
      if (root.NB.varAdjust) root.NB.varAdjust.end();
    });
  }

  function wireBar() {
    var bar = document.getElementById('phone-bar');
    if (!bar) return;
    bar.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button[data-act]');
      if (!btn || !root.NBApp) return;
      var act = btn.getAttribute('data-act');
      if (act === 'note') root.NBApp.addNote();
      else if (act === 'list') root.NBApp.addList();
      else if (act === 'undo') root.NBApp.undo();
      else if (act === 'boards') {
        closeMenus(null);
        root.NBApp.toggleBoards();
      }
    });
  }

  function start() {
    document.addEventListener('click', onDocClick, true);
    wireBar();
    wirePointers();
  }

  root.NBTouch = { start: start, closeMenus: closeMenus };
})(typeof window !== 'undefined' ? window : this);
