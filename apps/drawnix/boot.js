// GifOS persistence for the vendored Drawnix app.
//
// Upstream writes to localforage (IndexedDB). A sandboxed GifOS frame is an
// opaque origin, so that storage is gone. boot.js runs first: it stubs
// localStorage/sessionStorage so React/Slate/mermaid do not throw, and hangs a
// localforage-shaped store on window.__GIFOS_STORE. vendor.mjs rewires
// apps/web/src/app/app.tsx to use that store. Records live in gifos.db('board'),
// private, inside the app's icon. There is no cloud.
(function (root) {
  'use strict';

  function memoryStore() {
    var data = Object.create(null);
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; },
      clear: function () { data = Object.create(null); },
      key: function (i) { return Object.keys(data)[i] || null; },
      get length() { return Object.keys(data).length; }
    };
  }
  function installStorage(name) {
    try { void root[name].getItem; }
    catch (e) {
      var store = memoryStore();
      try { Object.defineProperty(root, name, { value: store, configurable: true }); }
      catch (e2) { try { root[name] = store; } catch (e3) {} }
    }
  }
  installStorage('localStorage');
  installStorage('sessionStorage');

  var mem = Object.create(null);
  var loaded = false;
  var loadP = null;
  var pending = Object.create(null);
  var timer = null;
  var db = null;
  try { if (root.gifos && root.gifos.db) db = root.gifos.db('board'); } catch (e) {}

  function load() {
    if (loaded) return Promise.resolve();
    if (loadP) return loadP;
    if (!db) { loaded = true; return Promise.resolve(); }
    loadP = db.getAll().then(function (rows) {
      (rows || []).forEach(function (r) {
        if (r && r.id) mem[r.id] = r.value;
      });
      loaded = true;
    }).catch(function () { loaded = true; });
    return loadP;
  }

  function flush() {
    timer = null;
    if (!db) return;
    Object.keys(pending).forEach(function (key) {
      var value = pending[key];
      delete pending[key];
      if (value === undefined) db.delete(key).catch(function () {});
      else db.put({ id: key, value: value }).catch(function () {});
    });
  }

  function schedule(key, value) {
    pending[key] = value;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 400);
  }

  root.addEventListener('pagehide', flush);
  root.addEventListener('visibilitychange', function () {
    if (root.document && root.document.visibilityState === 'hidden') flush();
  });

  root.__GIFOS_STORE = {
    getItem: function (key) {
      return load().then(function () {
        return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
      });
    },
    setItem: function (key, value) {
      mem[key] = value;
      schedule(key, value);
      return Promise.resolve(value);
    },
    removeItem: function (key) {
      delete mem[key];
      schedule(key, undefined);
      return Promise.resolve();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
