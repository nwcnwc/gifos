/* Grid Garden — GifOS shell.
 * Progress lives in gifos.db so the file is the save. Invite shares the plot.
 */
(function (root) {
  'use strict';

  var saveDb = null;
  var saveTimer = 0;
  var loaded = false;

  function persist(state) {
    if (!saveDb || !state) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveDb.put({
        id: 'save',
        level: state.level | 0,
        answers: state.answers || {},
        solved: state.solved || []
      }).catch(function () {});
    }, 220);
  }

  function loadSave() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve(null);
    try { saveDb = root.gifos.db('save'); } catch (e) { return Promise.resolve(null); }
    return saveDb.get('save').catch(function () { return null; });
  }

  function closeMenus() {
    var w = document.getElementById('levelsWrapper');
    if (w && w.style.display === 'block') {
      w.style.display = 'none';
      return true;
    }
    var tips = document.querySelectorAll('#instructions .tooltip');
    if (tips.length) {
      for (var i = 0; i < tips.length; i++) tips[i].parentNode.removeChild(tips[i]);
      return true;
    }
    return false;
  }

  function applyLaunch(arg) {
    if (!arg || arg.level == null || !root.game) return;
    var n = parseInt(arg.level, 10);
    if (!n) return;
    var max = (root.levels && root.levels.length) ? root.levels.length : 28;
    if (n < 1) n = 1;
    if (n > max) n = max;
    root.game.goTo(n - 1);
  }

  function boot(row) {
    var g = root.game;
    if (row) {
      if (typeof row.level === 'number') {
        var max = (root.levels && root.levels.length) ? root.levels.length - 1 : 27;
        g.level = Math.max(0, Math.min(max, row.level | 0));
      }
      if (row.answers && typeof row.answers === 'object') g.answers = row.answers;
      if (Array.isArray(row.solved)) g.solved = row.solved;
    }
    g.onPersist = persist;
    g.onCode = function () {
      if (root.GardenNet) root.GardenNet.onLocalCode();
    };
    g.onLevel = function () {
      if (root.GardenNet) root.GardenNet.onLocalLevel();
    };
    g.start();
    loaded = true;

    if (root.gifos && root.gifos.onBack) {
      root.gifos.onBack(function () {
        if (closeMenus()) return;
        if (g.level > 0) { g.saveAnswer(); g.prev(); }
      });
    }

    var netP = root.GardenNet ? root.GardenNet.init() : Promise.resolve();
    var launchP = (root.gifos && root.gifos.launch)
      ? root.gifos.launch().catch(function () { return null; })
      : Promise.resolve(null);
    netP.then(function () { return launchP; }).then(applyLaunch).catch(function () {});
  }

  function go() {
    loadSave().then(boot).catch(function () { boot(null); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
  else go();
})(window);
