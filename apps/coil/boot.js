(function (root) {
  'use strict';
  var api = root.gifos || null;
  var best = 0;
  var fxOff = false;
  var dbErr = '';
  var bestEl = document.getElementById('best');
  var errEl = document.getElementById('db-err');

  function paint() {
    if (bestEl) {
      bestEl.textContent = best ? ('best ' + best) : '';
    }
    if (errEl) {
      errEl.hidden = !dbErr;
      if (dbErr) errEl.textContent = dbErr;
    }
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

  function save() {
    var d = prefs();
    if (!d) return;
    d.put({ id: 'best', score: best, fxOff: fxOff }).catch(function (e) {
      dbErr = (e && e.message) ? e.message : 'Could not save in this file.';
      paint();
    });
  }

  root.CoilOnStop = function (score) {
    if (score > best) { best = score; save(); paint(); }
  };

  function applyFx() {
    var A = root.CoilAPI;
    if (fxOff && A && A.disableEffects) A.disableEffects();
  }

  function goBack() {
    var A = root.CoilAPI;
    if (A && A.isPlaying && A.isPlaying() && A.stop) {
      A.stop();
      return true;
    }
    return false;
  }

  function start() {
    paint();
    if (api && api.onBack) api.onBack(goBack);
    var lag = document.querySelector('#lag-warning a');
    if (lag) {
      lag.addEventListener('click', function () {
        fxOff = true;
        save();
      });
    }
    var d = prefs();
    if (!d) { applyFx(); return; }
    d.get('best').then(function (row) {
      if (row && typeof row.score === 'number' && row.score > 0) best = row.score;
      if (row && row.fxOff) fxOff = true;
      paint();
      applyFx();
    }).catch(function () { paint(); applyFx(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window);
