(function (root) {
  'use strict';
  var api = root.gifos || null;
  var best = 0;
  var bestEl = document.getElementById('best');

  function paint() {
    if (bestEl && best) bestEl.textContent = 'best ' + best;
  }
  function save() {
    var d = api && api.db && api.db('prefs');
    if (d) d.put({ id: 'best', score: best }).catch(function () {});
  }

  root.CoilOnStop = function (score) {
    if (score > best) { best = score; save(); paint(); }
  };

  function start() {
    var d = api && api.db && api.db('prefs');
    if (!d) { paint(); return; }
    d.get('best').then(function (row) {
      if (row && row.score) best = row.score;
      paint();
    }).catch(function () { paint(); });
  }
  start();
})(window);
