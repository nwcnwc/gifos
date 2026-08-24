/*
 * Tiny Yurts reads localStorage at boot. The sandbox has none, so this
 * file must run BEFORE vendor/game.js. Persisting to gifos.db is boot.js.
 */
(function (root) {
  'use strict';
  var mem = {};
  var store = {
    getItem: function (k) {
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
    },
    setItem: function (k, v) {
      mem[k] = String(v);
      if (typeof root.TYOnSave === 'function') root.TYOnSave(k, mem[k]);
    },
    removeItem: function (k) { delete mem[k]; },
    clear: function () { mem = {}; },
    key: function (i) { return Object.keys(mem)[i] || null; }
  };
  Object.defineProperty(store, 'length', { get: function () { return Object.keys(mem).length; } });
  try {
    Object.defineProperty(root, 'localStorage', { value: store, configurable: true });
  } catch (e) {
    root.localStorage = store;
  }
  root._tyMem = mem;
})(window);
