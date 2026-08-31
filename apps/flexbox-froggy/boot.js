/*
 * Flexbox Froggy — GifOS shell.
 * Progress lives in gifos.db. Invite is OS chrome; this file never
 * draws that button. The pond is the same one a friend hops into.
 */
(function (root) {
  'use strict';

  var saveTimer = 0;

  function saveDb() {
    if (!root.gifos || !root.gifos.db) return;
    var snap = root.Froggy.snapshot();
    root.gifos.db('save').put({
      id: 'save',
      level: snap.level,
      answers: snap.answers,
      solved: snap.solved,
      colorblind: snap.colorblind,
      difficulty: snap.difficulty
    }).catch(function () {});
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDb, 250);
  }

  function loadSave() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve();
    return root.gifos.db('save').get('save').then(function (row) {
      if (row) root.Froggy.restorePrefs(row);
    }).catch(function () {});
  }

  function boot() {
    root.Froggy.onChange = function (why) {
      scheduleSave();
      if (root.Pond && root.Pond.live()) root.Pond.bump(why);
    };
    root.Froggy.start();

    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (root.Froggy.anyOverlay()) {
          root.Froggy.closeOverlays();
          return true;
        }
        if (root.Froggy.level > 0) {
          root.Froggy.prev();
          return true;
        }
        return false;
      });
    }

    var roomP = root.Pond ? root.Pond.init() : Promise.resolve({ owner: true, others: 0 });
    roomP.catch(function () {});
  }

  function go() {
    loadSave().then(boot).catch(boot);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else go();
})(window);
