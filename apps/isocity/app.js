// Boot IsoCity: private save, New city, and the room hooks.
//
// Solo writes the city into gifos.db('save'). Share/compare never touch that
// row — a meeting must not overwrite the city you were in the middle of.
(function (root) {
  'use strict';

  var saveDb = null;
  var saved = null;
  var timer = 0;
  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  var $ = function (id) { return document.getElementById(id); };

  function persist() {
    if (!saveDb || (root.IsoCity && root.IsoCity.mp)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = 0;
      if (!root.IsoCity || !root.IsoCity.pack) return;
      var cells = root.IsoCity.pack();
      saved = cells;
      saveDb.put({ id: 'city', cells: cells, at: Date.now() }).catch(function () {});
    }, 250);
  }

  function applySaved(cells) {
    if (!cells || !root.IsoCity || !root.IsoCity.replaceMap) return;
    root.IsoCity.replaceMap(cells);
  }

  root.IsoCity = root.IsoCity || {};

  root.IsoCity.onPlace = function (x, y, a, b) {
    if (root.IsoCity.Mp && root.IsoCity.Mp.isOn()) {
      return root.IsoCity.Mp.onPlace(x, y, a, b);
    }
    return true;
  };

  root.IsoCity.onChanged = function () {
    if (root.IsoCity.mp) return;
    persist();
  };

  root.IsoCity.flushSave = function () {
    if (timer) { clearTimeout(timer); timer = 0; }
    if (!saveDb || !root.IsoCity || !root.IsoCity.pack) return;
    var cells = root.IsoCity.pack();
    saved = cells;
    saveDb.put({ id: 'city', cells: cells, at: Date.now() }).catch(function () {});
  };

  root.IsoCity.restoreSave = function () {
    if (saved) applySaved(saved);
    else if (root.IsoCity.emptyMap) root.IsoCity.emptyMap();
  };

  root.IsoCity.onReady = function () {
    if (saved) applySaved(saved);
  };

  function load() {
    if (!saveDb) return Promise.resolve();
    return saveDb.getAll().then(function (rows) {
      (rows || []).forEach(function (r) {
        if (r && r.id === 'city' && r.cells && r.cells.length) saved = r.cells;
      });
      if (saved && root.IsoCity.replaceMap) applySaved(saved);
    }).catch(function () {});
  }

  $('newBtn').addEventListener('click', function (e) {
    e.preventDefault();
    if (root.IsoCity.Mp && root.IsoCity.Mp.isOn()) {
      root.IsoCity.Mp.wipe();
      return;
    }
    if (root.IsoCity.emptyMap) root.IsoCity.emptyMap();
    saved = root.IsoCity.pack ? root.IsoCity.pack() : null;
    persist();
  });

  if (root.gifos && root.gifos.onBack) {
    root.gifos.onBack(function () {
      if (root.IsoCity.Mp && root.IsoCity.Mp.isOn()) root.IsoCity.Mp.leave();
    });
  }

  root.addEventListener('pagehide', function () {
    if (timer) { clearTimeout(timer); timer = 0; }
    persist();
  });

  load();
})(window);
