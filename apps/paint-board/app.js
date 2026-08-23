// Boot Paint Board: private save, New picture, and the room hooks.
//
// Solo writes the strokes into gifos.db('save'). Draw-together never touches
// that row — a meeting must not overwrite the picture you were in the middle of.
(function (root) {
  'use strict';

  var saveDb = null;
  var saved = null;
  var timer = 0;
  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  var $ = function (id) { return document.getElementById(id); };

  function persist() {
    if (!saveDb || (root.PaintBoard && root.PaintBoard.mp)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = 0;
      if (!root.PaintBoard || !root.PaintBoard.pack) return;
      var strokes = root.PaintBoard.pack();
      saved = strokes;
      saveDb.put({ id: 'canvas', strokes: strokes, at: Date.now() }).catch(function () {});
    }, 250);
  }

  function applySaved(strokes) {
    if (!strokes || !root.PaintBoard || !root.PaintBoard.replace) return;
    root.PaintBoard.replace(strokes);
  }

  root.PaintBoard = root.PaintBoard || {};

  root.PaintBoard.onChanged = function (strokes) {
    if (root.PaintBoard.Mp && root.PaintBoard.Mp.isOn()) return;
    persist();
  };

  root.PaintBoard.onStroke = function (stroke) {
    if (root.PaintBoard.Mp && root.PaintBoard.Mp.isOn()) {
      root.PaintBoard.Mp.onStroke(stroke);
    }
  };

  root.PaintBoard.flushSave = function () {
    if (timer) { clearTimeout(timer); timer = 0; }
    if (!saveDb || !root.PaintBoard || !root.PaintBoard.pack) return;
    var strokes = root.PaintBoard.pack();
    saved = strokes;
    saveDb.put({ id: 'canvas', strokes: strokes, at: Date.now() }).catch(function () {});
  };

  root.PaintBoard.restoreSave = function () {
    if (saved) applySaved(saved);
    else if (root.PaintBoard.empty) root.PaintBoard.empty();
  };

  function load() {
    if (!saveDb) return Promise.resolve();
    return saveDb.getAll().then(function (rows) {
      (rows || []).forEach(function (r) {
        if (r && r.id === 'canvas' && r.strokes && r.strokes.length) saved = r.strokes;
      });
      if (saved && root.PaintBoard.replace) applySaved(saved);
    }).catch(function () {});
  }

  $('newBtn').addEventListener('click', function (e) {
    e.preventDefault();
    if (root.PaintBoard.Mp && root.PaintBoard.Mp.isOn()) {
      root.PaintBoard.Mp.wipe();
      return;
    }
    if (root.PaintBoard.empty) root.PaintBoard.empty();
    saved = root.PaintBoard.pack ? root.PaintBoard.pack() : null;
    persist();
  });

  if (root.gifos && root.gifos.onBack) {
    root.gifos.onBack(function () {
      if (root.PaintBoard.Mp && root.PaintBoard.Mp.isOn()) root.PaintBoard.Mp.leave();
    });
  }

  root.addEventListener('pagehide', function () {
    if (timer) { clearTimeout(timer); timer = 0; }
    persist();
  });

  load();
})(window);
