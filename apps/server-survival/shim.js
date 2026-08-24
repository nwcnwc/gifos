// Opaque-origin sandbox has no localStorage / sessionStorage — reading either
// throws. The game still touches them for the last run, campaign stars,
// trophies, sound prefs, language, tutorial, and toolbar tab. This in-memory
// stub dies with the tab; what comes back next launch is the row gifos.db
// kept (app.js).
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
  window.__ssReady = saveDb && saveDb.get
    ? saveDb.get('last').catch(function () { return null; })
    : Promise.resolve(null);
})();
