/*
 * GifOS persistence for the vendored Radius Raid.
 *
 * Upstream uses localStorage for mute / autofire / career stats. A sandboxed
 * GifOS frame is an opaque origin: localStorage throws. This file runs first,
 * hangs a Storage-shaped object on window, and flushes the radiusraid blob
 * into gifos.db('prefs') — private, inside the icon. There is no cloud.
 */
(function (root) {
  'use strict';

  var mem = Object.create(null);
  var persistTimer = null;

  function persist() {
    persistTimer = null;
    if (!root.gifos || !root.gifos.db) return;
    try {
      var raw = mem.radiusraid;
      if (raw == null) return;
      root.gifos.db('prefs').put({ id: 'radiusraid', value: raw }).catch(function () {});
    } catch (e) {}
  }

  function schedule() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(persist, 250);
  }

  var ls = {
    getItem: function (k) {
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
    },
    setItem: function (k, v) {
      mem[k] = String(v);
      schedule();
    },
    removeItem: function (k) {
      delete mem[k];
      schedule();
    },
    clear: function () {
      for (var k in mem) delete mem[k];
      schedule();
    },
    key: function (i) {
      return Object.keys(mem)[i] || null;
    },
    get length() { return Object.keys(mem).length; }
  };

  var nativeOk = false;
  try {
    var probe = root.localStorage;
    probe.setItem('__gifos_probe', '1');
    probe.removeItem('__gifos_probe');
    nativeOk = true;
  } catch (e) {
    nativeOk = false;
  }
  if (!nativeOk) {
    try {
      Object.defineProperty(root, 'localStorage', { value: ls, configurable: true });
    } catch (e2) {
      root.localStorage = ls;
    }
  }

  function load() {
    if (!root.gifos || !root.gifos.db) return Promise.resolve();
    return root.gifos.db('prefs').get('radiusraid').then(function (row) {
      if (!row || row.value == null || row.value === '') return;
      var v = row.value;
      mem.radiusraid = typeof v === 'string' ? v : JSON.stringify(v);
    }).catch(function () {});
  }

  root.Boot = { load: load, persist: persist, nativeOk: nativeOk };
})(window);
