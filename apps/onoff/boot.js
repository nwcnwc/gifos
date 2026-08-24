(function (root) {
  'use strict';
  var api = root.gifos || null;
  var best = 0;
  var dbErr = '';
  var resumeAt = 0;
  var fromStart = false;

  function el(id) { return document.getElementById(id); }

  function paint() {
    var b = el('best');
    if (b) b.textContent = best ? ('room ' + best + ' of 25') : '';
    var err = el('db-err');
    if (err) {
      err.hidden = !dbErr;
      if (dbErr) err.textContent = dbErr;
    }
    var fs = el('from-start');
    var g = root.ONOFF_GAME;
    if (fs) fs.hidden = !(best > 1 && (!g || g.state === 'title' || !g.state));
  }

  function prefs() {
    try {
      return api && api.db && api.db('prefs');
    } catch (e) {
      dbErr = (e && e.message) ? e.message : 'Could not open the save in this file.';
      paint();
      return null;
    }
  }

  function saveBest(n) {
    if (n <= best) { paint(); return; }
    best = n;
    var d = prefs();
    if (d) d.put({ id: 'best', level: best }).catch(function (e) {
      dbErr = (e && e.message) ? e.message : 'Could not save in this file.';
      paint();
    });
    paint();
  }

  function saveEdit(data) {
    var d = prefs();
    if (!d || !data) return;
    d.put({ id: 'edit', level: data }).catch(function () {});
  }

  function resumeIndex(g) {
    if (fromStart || best <= 1) return 0;
    var max = (g.scene && g.scene.levels && g.scene.levels.length) ? g.scene.levels.length - 1 : 24;
    return Math.min(max, Math.max(0, best - 1));
  }

  function wireMenu() {
    var g = root.ONOFF_GAME;
    if (!g || !g.title) return;
    var items = document.querySelectorAll('#title .menu .item');
    var rows = [290, 322, 354];
    for (var i = 0; i < items.length; i++) {
      (function (node, n) {
        var hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        hit.setAttribute('x', '250');
        hit.setAttribute('y', String(rows[n] || 290));
        hit.setAttribute('width', '270');
        hit.setAttribute('height', '30');
        hit.setAttribute('fill', 'transparent');
        hit.style.cursor = 'pointer';
        node.appendChild(hit);
        var pick = function (e) {
          if (e && e.preventDefault) e.preventDefault();
          g.title.selected = n;
          g.title.choose();
        };
        node.addEventListener('click', pick);
        node.addEventListener('pointerup', pick);
      })(items[i], i);
    }
    var orig = g.title.choose.bind(g.title);
    g.title.choose = function () {
      if (this.selected === 0) {
        this.game.scene.index = resumeIndex(this.game);
        this.game.scene.paused = false;
        this.game.state = 'play';
        fromStart = false;
        return;
      }
      orig();
    };
    var close = el('close-dialog');
    if (close) close.addEventListener('click', function () {
      var d = el('dialog');
      if (d) d.hidden = true;
    });
    var fs = el('from-start');
    if (fs) fs.addEventListener('click', function () {
      fromStart = true;
      g.title.selected = 0;
      g.title.choose();
    });
  }

  function goBack() {
    var g = root.ONOFF_GAME;
    if (!g) return false;
    if (g.state === 'play' || g.state === 'controls' || g.state === 'edit') {
      if (g.state === 'edit') {
        try { saveEdit(JSON.parse(JSON.stringify(g.editor))); } catch (e) {}
      }
      g.state = 'title';
      return true;
    }
    return false;
  }

  function watch() {
    setInterval(function () {
      var g = root.ONOFF_GAME;
      if (!g || !g.scene) return;
      if (g.state === 'play') saveBest((g.scene.index || 0) + 1);
    }, 800);
  }

  function start() {
    paint();
    wireMenu();
    watch();
    if (api && api.onBack) api.onBack(goBack);
    var d = prefs();
    if (!d) return;
    Promise.all([
      d.get('best').catch(function () { return null; }),
      d.get('edit').catch(function () { return null; })
    ]).then(function (rows) {
      var row = rows[0];
      if (row && row.level) best = row.level;
      paint();
      var edit = rows[1];
      var g = root.ONOFF_GAME;
      if (edit && edit.level && g && g.editor) {
        try {
          g.editor.levels = [edit.level];
          g.editor.level = 0;
        } catch (e) {}
      }
    }).catch(function () { paint(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
