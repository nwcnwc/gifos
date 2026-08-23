// Opaque-origin sandbox has no localStorage / sessionStorage — reading either
// throws. Excalidraw still touches them for theme, recent colours, and a
// library cache. This in-memory stub dies with the tab; the drawing that
// comes back next launch is the one gifos.db kept (app.js).
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
})();
