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

  // fetch() of a data: URI is blocked by the sandbox's connect-src 'none' even
  // though it touches no wire. Upstream's msgbox.js loads the error-ding
  // (audio/chord.wav, a data URL from vendor/assets.js) with exactly such a
  // fetch, at script parse time — so it rejected at boot, and then EVERY
  // "Internal application error" dialog re-awaited the same dead promise,
  // whose new unhandled rejection opened ANOTHER dialog: a self-sustaining
  // error storm that froze boot (1400+ dialogs in seconds). Serve data: URIs
  // in-process — decode the bytes ourselves, no connectivity gained — and pass
  // everything else through untouched so a real network fetch still fails
  // loudly.
  (function () {
    var origFetch = typeof root.fetch === 'function' ? root.fetch.bind(root) : null;
    root.fetch = function (input, init) {
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if (/^data:/i.test(url)) {
        try {
          var comma = url.indexOf(',');
          if (comma < 0) throw new Error('malformed data: URI');
          var header = url.slice(5, comma);
          var body = url.slice(comma + 1);
          var mime = header.split(';')[0] || 'application/octet-stream';
          var bytes = /(^|;)base64$/i.test(header)
            ? Uint8Array.from(atob(body), function (c) { return c.charCodeAt(0); })
            : new TextEncoder().encode(decodeURIComponent(body));
          return Promise.resolve(new Response(new Blob([bytes], { type: mime }), { status: 200 }));
        } catch (e) {
          return Promise.reject(new TypeError('Failed to fetch (bad data: URI)'));
        }
      }
      if (!origFetch) return Promise.reject(new TypeError('Failed to fetch'));
      return origFetch(input, init);
    };
  })();
})(typeof window !== 'undefined' ? window : globalThis);
