/* Memory facade so vendor backends do not throw. Named maps dump into gifos.db. */
(function (root) {
  'use strict';
  var mem = {};
  var persistFn = null;
  var timer = 0;
  function dump() {
    var out = {};
    Object.keys(mem).forEach(function (k) { out[k] = mem[k]; });
    return out;
  }
  function kick() {
    if (!persistFn) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = 0; persistFn(dump()); }, 200);
  }
  var ls = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); kick(); },
    removeItem: function (k) { delete mem[k]; kick(); },
    clear: function () { mem = {}; kick(); },
    key: function (i) { return Object.keys(mem)[i] || null; },
    _hydrate: function (obj) {
      mem = {};
      if (!obj) return;
      Object.keys(obj).forEach(function (k) { mem[k] = String(obj[k]); });
    },
    _dump: dump,
    _onPersist: function (fn) { persistFn = fn; },
    _flush: function () {
      if (timer) { clearTimeout(timer); timer = 0; }
      if (persistFn) persistFn(dump());
    }
  };
  try { Object.defineProperty(ls, 'length', { get: function () { return Object.keys(mem).length; } }); } catch (e) {}
  try { root.localStorage = ls; } catch (e1) {
    try { root.Object.defineProperty(root, 'localStorage', { value: ls, configurable: true }); } catch (e2) {}
  }
  root.MMLocal = ls;
})(typeof window !== 'undefined' ? window : this);
