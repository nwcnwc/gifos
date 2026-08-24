/* Memory localStorage so upstream backends do not throw in the sandbox. */
(function (root) {
  'use strict';
  var mem = {};
  var ls = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; },
    clear: function () { mem = {}; },
    key: function (i) { return Object.keys(mem)[i] || null; }
  };
  try { Object.defineProperty(ls, 'length', { get: function () { return Object.keys(mem).length; } }); } catch (e) {}
  try { root.localStorage = ls; } catch (e1) {
    try { root.Object.defineProperty(root, 'localStorage', { value: ls, configurable: true }); } catch (e2) {}
  }
})(window);
