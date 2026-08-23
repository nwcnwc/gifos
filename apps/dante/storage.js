/*
 * Dante — save shim.
 *
 * Upstream wrote progress to localStorage["Dante-22"]. A sandboxed GifOS
 * frame has none, so this file (loaded first) hangs a Storage-shaped
 * object on window and hydrates it from gifos.db('prefs') before the
 * vendored loadGame runs.
 */
(function (root) {
  'use strict';

  var KEY = 'Dante-22';
  var mem = {};
  var settled = false;
  var readyResolve;
  var ready = new Promise(function (r) { readyResolve = r; });

  function done() {
    if (settled) return;
    settled = true;
    readyResolve();
  }

  function persist() {
    if (!root.gifos || !root.gifos.db) return;
    try {
      root.gifos.db('prefs').put({ id: 'save', v: mem[KEY] || '' }).catch(function () {});
    } catch (e) {}
  }

  var store = {
    getItem: function (k) {
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
    },
    setItem: function (k, v) {
      mem[k] = String(v);
      if (k === KEY) persist();
    },
    removeItem: function (k) {
      delete mem[k];
      if (k === KEY) persist();
    },
    clear: function () { mem = {}; persist(); },
    key: function (i) { return Object.keys(mem)[i] || null; }
  };
  Object.defineProperty(store, 'length', {
    get: function () { return Object.keys(mem).length; }
  });
  Object.defineProperty(store, KEY, {
    configurable: true,
    enumerable: true,
    get: function () { return mem[KEY]; },
    set: function (v) {
      mem[KEY] = v == null ? '' : String(v);
      persist();
    }
  });

  try {
    Object.defineProperty(root, 'localStorage', { configurable: true, value: store });
  } catch (e) {
    try { root.localStorage = store; } catch (e2) {}
  }

  function hydrate() {
    if (!root.gifos || !root.gifos.db) { done(); return; }
    try {
      root.gifos.db('prefs').get('save').then(function (row) {
        if (row && row.v) mem[KEY] = row.v;
        done();
      }).catch(function () { done(); });
    } catch (e) { done(); }
  }

  root.DanteSave = { ready: ready };

  if (root.gifos) hydrate();
  else {
    var n = 0;
    var t = setInterval(function () {
      n++;
      if (root.gifos || n > 80) {
        clearInterval(t);
        hydrate();
      }
    }, 25);
  }
  setTimeout(done, 2500);
})(window);
