// Boot IsoCity: private save, New city, undo, phone tool strip, room hooks.
//
// Solo writes the city into gifos.db('save'). Share/compare never touch that
// row — a meeting must not overwrite the city you were in the middle of.
// An old 7×7 save nests in the middle of the 16×16 map.
(function (root) {
  'use strict';

  var saveDb = null;
  var saved = null;
  var timer = 0;
  var undo = [];
  var stroke = null;
  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  var $ = function (id) { return document.getElementById(id); };

  // Kenney isometric landscape/city sheet, 12×6, left-to-right then down.
  var TOOL_NAMES = [
    'Empty', 'Block', 'Road', 'Road', 'Crossing', 'Crossing', 'Trees', 'Trees', 'Plaza', 'Plaza', 'Road', 'Road',
    'Rails', 'Rails', 'Rails', 'Rails', 'Road', 'Road', 'Road', 'Road', 'Road', 'Road', 'Road', 'Road',
    'Curve', 'Curve', 'Curve', 'Curve', 'Road', 'Road', 'Road', 'Road', 'Road', 'Road', 'Curve', 'Curve',
    'Road', 'Curve', 'Curve', 'Curve', 'Curve', 'Plaza', 'Wall', 'Wall', 'Wall', 'Plaza', 'Offices', 'Shop',
    'Water', 'Water', 'Water', 'Pool', 'Canal', 'Water', 'Shop', 'Hotel', 'Shop', 'Tower', 'Offices', 'Brick',
    'Townhouse', 'Hotel', 'House', 'Tower', 'Brick', 'Hotel', 'Store', 'Cottage', 'House', 'Store', 'House', 'Cottage'
  ];

  function size() {
    return (root.IsoCity && root.IsoCity.ntiles) ? root.IsoCity.ntiles() : 16;
  }

  function persist() {
    if (!saveDb || (root.IsoCity && root.IsoCity.mp)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = 0;
      if (!root.IsoCity || !root.IsoCity.pack) return;
      var cells = root.IsoCity.pack();
      saved = cells;
      saveDb.put({ id: 'city', cells: cells, size: size(), at: Date.now() }).catch(function () {});
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

  function updateUndoBtn() {
    var b = $('undoBtn');
    if (b) b.disabled = !undo.length;
  }

  function peeking() {
    var b = $('mineBtn');
    return !!(b && !b.hidden);
  }
  function beginStroke() {
    if (peeking()) { stroke = null; return; }
    stroke = [];
  }
  function endStroke() {
    if (stroke && stroke.length) undo.push(stroke);
    if (undo.length > 80) undo = undo.slice(-40);
    stroke = null;
    updateUndoBtn();
  }
  function recordUndo(x, y) {
    var m = root.IsoCity && root.IsoCity.map && root.IsoCity.map();
    if (!m || !m[x] || !m[x][y]) return;
    if (!stroke) stroke = [];
    stroke.push({ x: x, y: y, a: m[x][y][0], b: m[x][y][1] });
  }
  function undoLast() {
    if (peeking()) return;
    var s = undo.pop();
    updateUndoBtn();
    if (!s || !s.length || !root.IsoCity) return;
    stroke = null;
    for (var i = s.length - 1; i >= 0; i--) {
      var st = s[i];
      if (root.IsoCity.Mp && root.IsoCity.Mp.isOn()) {
        if (root.IsoCity.Mp.onPlace(st.x, st.y, st.a, st.b) === false) continue;
      }
      if (root.IsoCity.setCell) root.IsoCity.setCell(st.x, st.y, st.a, st.b);
    }
    if (root.IsoCity.drawMap) root.IsoCity.drawMap();
    persist();
    updateHint();
  }

  function toolName(i) {
    return TOOL_NAMES[i] || 'Tile';
  }
  function updateToolName() {
    var el = $('toolName');
    if (!el) return;
    var t = root.IsoCity && root.IsoCity.tool ? root.IsoCity.tool() : null;
    var tw = (root.IsoCity && root.IsoCity.texWidth) ? root.IsoCity.texWidth() : 12;
    var idx = t ? (t[0] * tw + t[1]) : 6;
    el.textContent = toolName(idx);
  }

  function compactTools() {
    var tools = $('tools');
    if (!tools) return;
    var narrow = window.innerWidth <= 640;
    var sc = narrow ? 56 / 130 : 1;
    var kids = tools.children;
    for (var n = 0; n < kids.length; n++) {
      var div = kids[n];
      var i = Math.floor(n / 12), j = n % 12;
      if (narrow) {
        div.style.backgroundSize = (1560 * sc) + 'px ' + (1380 * sc) + 'px';
        div.style.backgroundPosition = (-j * 130 * sc) + 'px ' + (-i * 230 * sc) + 'px';
        div.style.width = Math.round(130 * sc) + 'px';
        div.style.height = Math.round(230 * sc) + 'px';
        div.style.flex = '0 0 ' + Math.round(130 * sc) + 'px';
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
    if (root.IsoCity && root.IsoCity.fitView) root.IsoCity.fitView();
    else {
      var area = $('area'), stage = $('stage');
      if (!area || !stage) return;
      var x = Math.max(0, (stage.offsetWidth - area.clientWidth) / 2);
      var y = Math.max(0, (stage.offsetHeight - area.clientHeight) / 2);
      area.scrollLeft = x;
      area.scrollTop = y;
    }
  }

  function pickDefaultTool() {
    var el = $('tool_6');
    if (el) {
      el.click();
      if (el.scrollIntoView) el.scrollIntoView({ inline: 'center', block: 'nearest' });
    } else if (root.IsoCity && root.IsoCity.setTool) root.IsoCity.setTool([0, 6]);
    updateToolName();
  }

  function hideConfirm() {
    var c = $('confirm-new');
    if (c) c.hidden = true;
  }
  function showConfirm() {
    var c = $('confirm-new');
    if (c) c.hidden = false;
  }
  function doWipe() {
    hideConfirm();
    undo = [];
    stroke = null;
    updateUndoBtn();
    if (root.IsoCity.Mp && root.IsoCity.Mp.isOn()) {
      root.IsoCity.Mp.wipe();
      updateHint();
      return;
    }
    if (root.IsoCity.emptyMap) root.IsoCity.emptyMap();
    saved = root.IsoCity.pack ? root.IsoCity.pack() : null;
    persist();
    updateHint();
  }

  root.IsoCity = root.IsoCity || {};

  root.IsoCity.onPlace = function (x, y, a, b) {
    if (root.IsoCity.Mp && root.IsoCity.Mp.isOn()) {
      var ok = root.IsoCity.Mp.onPlace(x, y, a, b);
      if (ok !== false) recordUndo(x, y);
      return ok;
    }
    recordUndo(x, y);
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
    saveDb.put({ id: 'city', cells: cells, size: size(), at: Date.now() }).catch(function () {});
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
    updateUndoBtn();
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
    showConfirm();
  });
  $('undoBtn').addEventListener('click', function (e) {
    e.preventDefault();
    undoLast();
  });
  $('confirm-yes').addEventListener('click', function (e) {
    e.preventDefault();
    doWipe();
  });
  $('confirm-no').addEventListener('click', function (e) {
    e.preventDefault();
    hideConfirm();
  });
  $('confirm-new').addEventListener('click', function (e) {
    if (e.target === $('confirm-new')) hideConfirm();
  });

  var toolsEl = $('tools');
  if (toolsEl) toolsEl.addEventListener('click', function () { setTimeout(updateToolName, 0); });

  var fg = $('fg');
  if (fg) {
    fg.addEventListener('mousedown', beginStroke);
    fg.addEventListener('mouseup', endStroke);
  }

  root.addEventListener('resize', function () {
    compactTools();
    if (root.IsoCity && root.IsoCity.layoutView) root.IsoCity.layoutView();
  });
  root.IsoCity.centerMap = centerMap;

  if (root.gifos && root.gifos.onBack) {
    root.gifos.onBack(function () {
      if ($('confirm-new') && !$('confirm-new').hidden) { hideConfirm(); return; }
      if (root.IsoCity.Mp && root.IsoCity.Mp.isOn()) root.IsoCity.Mp.leave();
    });
  }

  root.addEventListener('pagehide', function () {
    if (timer) { clearTimeout(timer); timer = 0; }
    persist();
  });

  load();
})(window);
