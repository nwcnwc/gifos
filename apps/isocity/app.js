// Boot IsoCity: private save, New city, phone tool strip, and the room hooks.
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
    updateHint();
  }

  function filled(cells) {
    var n = 0;
    for (var i = 0; i < (cells || []).length; i++) if (cells[i]) n++;
    return n;
  }

  function updateHint() {
    var el = $('hint');
    if (!el) return;
    if (root.IsoCity && root.IsoCity.mp) { el.hidden = true; return; }
    var n = 0;
    if (root.IsoCity && root.IsoCity.pack) n = filled(root.IsoCity.pack());
    else if (saved) n = filled(saved);
    el.hidden = n > 0;
  }

  function compactTools() {
    var tools = $('tools');
    if (!tools) return;
    var narrow = window.innerWidth <= 640;
    var scale = narrow ? 56 / 130 : 1;
    var kids = tools.children;
    for (var n = 0; n < kids.length; n++) {
      var div = kids[n];
      var i = Math.floor(n / 12), j = n % 12;
      if (narrow) {
        div.style.backgroundSize = (1560 * scale) + 'px ' + (1380 * scale) + 'px';
        div.style.backgroundPosition = (-j * 130 * scale) + 'px ' + (-i * 230 * scale) + 'px';
        div.style.width = Math.round(130 * scale) + 'px';
        div.style.height = Math.round(230 * scale) + 'px';
        div.style.flex = '0 0 ' + Math.round(130 * scale) + 'px';
      } else {
        div.style.backgroundSize = '';
        div.style.backgroundPosition = '-' + (j * 130) + 'px -' + (i * 230) + 'px';
        div.style.width = '';
        div.style.height = '';
        div.style.flex = '';
      }
    }
  }

  function centerMap() {
    var area = $('area'), stage = $('stage');
    if (!area || !stage) return;
    var x = Math.max(0, (stage.offsetWidth - area.clientWidth) / 2);
    var y = Math.max(0, (stage.offsetHeight - area.clientHeight) / 2);
    area.scrollLeft = x;
    area.scrollTop = y;
  }

  function pickDefaultTool() {
    var el = $('tool_6');
    if (el) {
      el.click();
      if (el.scrollIntoView) el.scrollIntoView({ inline: 'center', block: 'nearest' });
    } else if (root.IsoCity && root.IsoCity.setTool) root.IsoCity.setTool([0, 6]);
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
    updateHint();
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
    updateHint();
  };

  root.IsoCity.onReady = function () {
    compactTools();
    pickDefaultTool();
    if (saved) applySaved(saved);
    if (root.IsoCity.replaceMap) {
      var orig = root.IsoCity.replaceMap;
      root.IsoCity.replaceMap = function (cells) {
        orig(cells);
        updateHint();
      };
    }
    updateHint();
    centerMap();
    setTimeout(centerMap, 50);
  };

  function load() {
    if (!saveDb) return Promise.resolve();
    return saveDb.getAll().then(function (rows) {
      (rows || []).forEach(function (r) {
        if (r && r.id === 'city' && r.cells && r.cells.length) saved = r.cells;
      });
      if (saved && root.IsoCity.replaceMap) applySaved(saved);
      updateHint();
    }).catch(function () {});
  }

  $('newBtn').addEventListener('click', function (e) {
    e.preventDefault();
    if (root.IsoCity.Mp && root.IsoCity.Mp.isOn()) {
      root.IsoCity.Mp.wipe();
      updateHint();
      return;
    }
    if (root.IsoCity.emptyMap) root.IsoCity.emptyMap();
    saved = root.IsoCity.pack ? root.IsoCity.pack() : null;
    persist();
    updateHint();
  });

  root.addEventListener('resize', function () {
    compactTools();
    centerMap();
  });
  root.IsoCity.centerMap = centerMap;

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
