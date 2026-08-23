// GifOS shell around the vendored Piskel editor.
// Classic script (the runtime inlines <script src> and drops type=module).
//
// 1. localStorage is a SecurityError in the opaque-origin sandbox. Piskel
//    stores settings, palettes and a few flags there. We present a
//    Storage-shaped object backed by memory, flushed into gifos.db('prefs').
// 2. IndexedDB is the same: PiskelDatabase / BackupDatabase are patched in
//    vendor.mjs to talk to gifos.db directly. This file does not shim IDB.
// 3. pskl.app.init() must wait until prefs have been read, because UserSettings
//    reads localStorage on first get() during boot.
(function (root) {
  'use strict';

  var mem = Object.create(null);
  var loaded = false;
  var loadP = null;
  var pending = Object.create(null);
  var timer = null;
  var prefsDb = null;
  try {
    if (root.gifos && root.gifos.db) prefsDb = root.gifos.db('prefs');
  } catch (e) {}

  function load() {
    if (loaded) return Promise.resolve();
    if (loadP) return loadP;
    if (!prefsDb) { loaded = true; return Promise.resolve(); }
    loadP = prefsDb.getAll().then(function (rows) {
      (rows || []).forEach(function (r) {
        if (r && r.id) mem[r.id] = r.value;
      });
      loaded = true;
    }).catch(function () { loaded = true; });
    return loadP;
  }

  function flush() {
    timer = null;
    if (!prefsDb) return;
    Object.keys(pending).forEach(function (key) {
      var value = pending[key];
      delete pending[key];
      if (value === null) prefsDb.delete(key).catch(function () {});
      else prefsDb.put({ id: key, value: value }).catch(function () {});
    });
  }

  function schedule(key, value) {
    pending[key] = value;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 400);
  }

  root.addEventListener('pagehide', function () {
    flush();
    try {
      if (root.pskl && pskl.app && pskl.app.backupService) pskl.app.backupService.backup();
    } catch (e) {}
  });
  root.addEventListener('visibilitychange', function () {
    if (root.document && root.document.visibilityState === 'hidden') {
      flush();
      try {
        if (root.pskl && pskl.app && pskl.app.backupService) pskl.app.backupService.backup();
      } catch (e2) {}
    }
  });

  var proto = {
    getItem: function (k) {
      k = String(k);
      return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
    },
    setItem: function (k, v) {
      k = String(k);
      v = String(v);
      mem[k] = v;
      schedule(k, v);
    },
    removeItem: function (k) {
      k = String(k);
      delete mem[k];
      schedule(k, null);
    },
    clear: function () {
      mem = Object.create(null);
      pending = Object.create(null);
      schedule('__clear', null);
    },
    key: function (i) {
      return Object.keys(mem)[i] || null;
    }
  };

  var storage;
  try {
    storage = new Proxy(proto, {
      get: function (t, p) {
        if (p === 'length') return Object.keys(mem).length;
        if (p in t) return t[p];
        if (typeof p === 'string' && Object.prototype.hasOwnProperty.call(mem, p)) return mem[p];
        return undefined;
      },
      set: function (t, p, v) {
        if (p === 'length') return true;
        if (typeof t[p] === 'function') return true;
        t.setItem(p, v);
        return true;
      },
      deleteProperty: function (t, p) {
        t.removeItem(p);
        return true;
      },
      ownKeys: function () { return Object.keys(mem); },
      getOwnPropertyDescriptor: function (t, p) {
        if (Object.prototype.hasOwnProperty.call(mem, p)) {
          return { enumerable: true, configurable: true, writable: true, value: mem[p] };
        }
      },
      has: function (t, p) { return p in t || Object.prototype.hasOwnProperty.call(mem, p); }
    });
  } catch (e) {
    storage = proto;
  }

  try {
    Object.defineProperty(root, 'localStorage', { value: storage, configurable: true });
  } catch (e) {
    try { root.localStorage = storage; } catch (e2) {}
  }
  try {
    Object.defineProperty(root, 'sessionStorage', { value: storage, configurable: true });
  } catch (e3) {}

  root.__gifosReady = load();

  root.__gifosStartPiskel = function () {
    if (!root.pskl || !pskl.app) return;
    var mask = document.getElementById('loading-mask');
    if (mask) {
      mask.style.opacity = 0;
      window.setTimeout(function () {
        if (mask.parentNode) mask.parentNode.removeChild(mask);
      }, 600);
    }
    pskl.app.init();
    pskl._releaseVersion = '0.15.2';
    if (root.piskelReadyCallbacks) {
      for (var i = 0; i < root.piskelReadyCallbacks.length; i++) {
        try { root.piskelReadyCallbacks[i](); } catch (e4) {}
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
