// Boot Pixel Paint: private save, New picture, and the room hooks.
//
// Solo writes the 32×32 into gifos.db('save'). Draw-together never touches
// that row — a meeting must not overwrite the sprite you were in the middle of.
(function (root) {
  'use strict';

  var saveDb = null;
  var saved = null;
  var timer = 0;
  var ready = false;
  try { if (root.gifos && root.gifos.db) saveDb = root.gifos.db('save'); } catch (e) {}

  var $ = function (id) { return document.getElementById(id); };

  function persist() {
    if (!saveDb || (root.PixelPaint && root.PixelPaint.mp)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = 0;
      if (!root.PixelPaint || !root.PixelPaint.pack) return;
      var pixels = root.PixelPaint.pack();
      saved = pixels;
      saveDb.put({ id: 'canvas', pixels: pixels, at: Date.now() }).catch(function () {});
    }, 250);
  }

  function applySaved(pixels) {
    if (!pixels || !root.PixelPaint || !root.PixelPaint.replace) return;
    root.PixelPaint.replace(pixels);
  }

  root.PixelPaint = root.PixelPaint || {};

  root.PixelPaint.onChanged = function (pixels) {
    if (root.PixelPaint.Mp && root.PixelPaint.Mp.isOn()) {
      root.PixelPaint.Mp.onChanged(pixels);
      return;
    }
    persist();
  };

  root.PixelPaint.flushSave = function () {
    if (timer) { clearTimeout(timer); timer = 0; }
    if (!saveDb || !root.PixelPaint || !root.PixelPaint.pack) return;
    var pixels = root.PixelPaint.pack();
    saved = pixels;
    saveDb.put({ id: 'canvas', pixels: pixels, at: Date.now() }).catch(function () {});
  };

  root.PixelPaint.restoreSave = function () {
    if (saved) applySaved(saved);
    else if (root.PixelPaint.empty) root.PixelPaint.empty();
  };

  root.PixelPaint.onReady = function () {
    ready = true;
    if (saved) applySaved(saved);
  };
  if (root.PixelPaint.pack) ready = true;

  function load() {
    if (!saveDb) return Promise.resolve();
    return saveDb.getAll().then(function (rows) {
      (rows || []).forEach(function (r) {
        if (r && r.id === 'canvas' && r.pixels && r.pixels.length) saved = r.pixels;
      });
      if (saved && root.PixelPaint.replace) applySaved(saved);
    }).catch(function () {});
  }

  $('newBtn').addEventListener('click', function (e) {
    e.preventDefault();
    if (root.PixelPaint.Mp && root.PixelPaint.Mp.isOn()) {
      root.PixelPaint.Mp.wipe();
      return;
    }
    if (root.PixelPaint.empty) root.PixelPaint.empty();
    if (typeof Save_Canvas_State === 'function') Save_Canvas_State();
    saved = root.PixelPaint.pack ? root.PixelPaint.pack() : null;
    persist();
  });

  if (root.gifos && root.gifos.onBack) {
    root.gifos.onBack(function () {
      if (root.PixelPaint.Mp && root.PixelPaint.Mp.isOn()) root.PixelPaint.Mp.leave();
    });
  }

  root.addEventListener('pagehide', function () {
    if (timer) { clearTimeout(timer); timer = 0; }
    persist();
  });

  load();
})(window);
