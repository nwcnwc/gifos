// Opaque-origin sandbox has no localStorage / sessionStorage — reading either
// throws. The game still touches them for the last run, campaign stars,
// trophies, sound prefs, language, tutorial, and toolbar tab. This in-memory
// stub dies with the tab. Keys from gifos.db are written in HERE, before
// vendor/game.js parses, so i18n/achievements/Continue see the real save —
// not after the game has already read an empty store (app.js only persists).
(function () {
  'use strict';
  function memoryStore() {
    var mem = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; },
      clear: function () { mem = {}; },
      key: function (i) { return Object.keys(mem)[i] || null; },
      get length() { return Object.keys(mem).length; }
    };
  }
  function install(name) {
    try { void window[name].getItem; }
    catch (e) {
      try { Object.defineProperty(window, name, { value: memoryStore(), configurable: true }); }
      catch (e2) { try { window[name] = memoryStore(); } catch (e3) {} }
    }
  }
  install('localStorage');
  install('sessionStorage');

  var saveDb = null;
  try { if (window.gifos && window.gifos.db) saveDb = window.gifos.db('save'); } catch (e) {}
  window.__ssSaveDb = saveDb;

  function applyKeys(keys) {
    if (!keys) return;
    var k;
    for (k in keys) {
      if (Object.prototype.hasOwnProperty.call(keys, k) && keys[k] != null) {
        try { localStorage.setItem(k, keys[k]); } catch (e) {}
      }
    }
  }

  window.__ssReady = saveDb && saveDb.get
    ? saveDb.get('last').then(function (row) {
        if (row && row.keys) applyKeys(row.keys);
        return row;
      }).catch(function () { return null; })
    : Promise.resolve(null);
})();
