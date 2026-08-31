/* Opaque-origin sandbox has no localStorage. Memory stub, seeded from gifos.db. */
(function () {
  'use strict';
  function memoryStore() {
    var mem = {};
    return {
      getItem: function (k) {
        return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
      },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; },
      clear: function () { mem = {}; },
      key: function (i) {
        var ks = Object.keys(mem);
        return i >= 0 && i < ks.length ? ks[i] : null;
      },
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
  window.__adrSaveDb = saveDb;

  window.__adrReady = saveDb && saveDb.get
    ? saveDb.get('game').then(function (row) {
        if (row && row.gameState) {
          try { localStorage.gameState = row.gameState; } catch (e) {}
        }
        return row;
      }).catch(function () { return null; })
    : Promise.resolve(null);
})();
