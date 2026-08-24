/* GifOS shims for Orca: require() is a no-op (UDP/OSC are Electron),
 * localStorage is an in-memory object (the sandbox has none). boot.js
 * copies the grid and prefs into gifos.db. */
(function (root) {
  'use strict';
  root.require = function (name) {
    console.warn('Failed to require ' + name);
  };

  var mem = {};
  var api = {
    getItem: function (k) {
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
    },
    setItem: function (k, v) {
      mem[k] = String(v);
    },
    removeItem: function (k) {
      delete mem[k];
    },
    clear: function () {
      mem = {};
    },
    key: function (i) {
      return Object.keys(mem)[i] || null;
    }
  };
  var ls = new Proxy(api, {
    get: function (t, p) {
      if (p in t) return t[p];
      if (p === 'length') return Object.keys(mem).length;
      return t.getItem(p);
    },
    set: function (t, p, v) {
      t.setItem(p, v);
      return true;
    }
  });
  try { root.localStorage = ls; } catch (e) {}
  try { Object.defineProperty(root, 'localStorage', { value: ls, configurable: true }); } catch (e2) {}
  root.__orcaStore = mem;
})(typeof window !== 'undefined' ? window : this);
