// GifOS persistence for the vendored JS Paint.
//
// Upstream uses localStorage (settings, the canvas backup) and would fetch the
// open web. A sandboxed GifOS frame is an opaque origin: localStorage throws,
// connect-src is 'none'. boot.js runs first, hangs a Storage-shaped object on
// window, and a localStore-shaped cache that storage.js reads. Records live in
// gifos.db ('prefs' for keys, 'canvas' for the picture), private, inside the
// app's icon. There is no cloud.
(function (root) {
  'use strict';

  var mem = Object.create(null);
  var loaded = false;
  var loadP = null;
  var pendingPrefs = Object.create(null);
  var pendingCanvas = null;
  var timer = null;
  var prefsDb = null;
  var canvasDb = null;
  try {
    if (root.gifos && root.gifos.db) {
      prefsDb = root.gifos.db('prefs');
      canvasDb = root.gifos.db('canvas');
    }
  } catch (e) {}

  function load() {
    if (loaded) return Promise.resolve();
    if (loadP) return loadP;
    if (!prefsDb && !canvasDb) { loaded = true; return Promise.resolve(); }
    var jobs = [];
    if (prefsDb) {
      jobs.push(prefsDb.getAll().then(function (rows) {
        (rows || []).forEach(function (r) {
          if (r && r.id && r.value !== '' && r.value != null) mem[r.id] = r.value;
        });
      }).catch(function () {}));
    }
    if (canvasDb) {
      jobs.push(canvasDb.get('current').then(function (row) {
        if (row && row.value) mem['image#gifos'] = row.value;
      }).catch(function () {}));
    }
    loadP = Promise.all(jobs).then(function () { loaded = true; });
    return loadP;
  }

  function flush() {
    timer = null;
    var key;
    if (prefsDb) {
      for (key in pendingPrefs) {
        if (!Object.prototype.hasOwnProperty.call(pendingPrefs, key)) continue;
        var value = pendingPrefs[key];
        delete pendingPrefs[key];
        if (value === '') prefsDb.delete(key).catch(function () {});
        else prefsDb.put({ id: key, value: value }).catch(function () {});
      }
    }
    if (canvasDb && pendingCanvas !== null) {
      var pic = pendingCanvas;
      pendingCanvas = null;
      if (pic === '') canvasDb.delete('current').catch(function () {});
      else canvasDb.put({ id: 'current', value: pic }).catch(function () {});
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 400);
  }

  function persistKey(key, value) {
    if (key.indexOf('image#') === 0) {
      pendingCanvas = value;
    } else {
      pendingPrefs[key] = value;
    }
    schedule();
  }

  root.addEventListener('pagehide', flush);
  root.addEventListener('visibilitychange', function () {
    if (root.document && root.document.visibilityState === 'hidden') flush();
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
      persistKey(k, v);
    },
    removeItem: function (k) {
      k = String(k);
      delete mem[k];
      persistKey(k, '');
    },
    clear: function () {
      mem = Object.create(null);
      pendingPrefs = Object.create(null);
      pendingCanvas = '';
      schedule();
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

  root.__GIFOS_MEM = mem;
  root.__gifosReady = load();
  root.__gifosPersist = persistKey;
  root.__gifosFlush = flush;
})(typeof window !== 'undefined' ? window : globalThis);
