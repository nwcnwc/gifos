(function (root) {
  'use strict';
  var api = root.gifos || null;
  var best = 0;

  function paint() {
    var el = document.getElementById('best');
    if (el && best) el.textContent = 'best lvl ' + best;
  }
  function save(n) {
    if (n > best) {
      best = n;
      var d = api && api.db && api.db('prefs');
      if (d) d.put({ id: 'best', level: best }).catch(function () {});
      paint();
    }
  }

  function wireMenu() {
    var g = root.ONOFF_GAME;
    if (!g || !g.title) return;
    var items = document.querySelectorAll('#title .menu .item');
    for (var i = 0; i < items.length; i++) {
      (function (el, n) {
        el.addEventListener('click', function () {
          g.title.selected = n;
          g.title.choose();
        });
      })(items[i], i);
    }
    var close = document.getElementById('close-dialog');
    if (close) close.addEventListener('click', function () {
      var d = document.getElementById('dialog');
      if (d) d.hidden = true;
    });
  }

  function watch() {
    setInterval(function () {
      var g = root.ONOFF_GAME;
      if (!g || !g.scene) return;
      save((g.scene.index || 0) + 1);
    }, 800);
  }

  function start() {
    var bar = document.createElement('div');
    bar.id = 'best';
    document.body.appendChild(bar);
    wireMenu();
    watch();
    var d = api && api.db && api.db('prefs');
    if (!d) { paint(); return; }
    d.get('best').then(function (row) {
      if (row && row.level) best = row.level;
      paint();
    }).catch(function () { paint(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
