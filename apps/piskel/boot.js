/*
 * GifOS: KEEP IN-PAGE LINKS IN THIS PAGE.
 *
 * A GifOS app is a `srcdoc` iframe, and before build 1495 a srcdoc document
 * INHERITED ITS BASE URL FROM THE OS PAGE. A bare `#` anchor is a RELATIVE
 * navigation, so it resolved against run.html and a single click walked this
 * frame clean out of the app and onto the OS — the meeting lobby on edge, the
 * Home Screen on an archived release. Build 1495 pins <base href="about:srcdoc">
 * and closes it at the platform; this keeps the app right on every older build
 * it still claims to run on (manifest.minBuild).
 *
 * CAPTURE phase, preventDefault ONLY, propagation untouched: the app's own
 * handlers still run, and still run AFTER the fragment is set — which matters,
 * because some of them read location.hash to decide what was clicked. All this
 * removes is the browser's default navigation.
 */
(function () {
  if (!document.addEventListener) return;
  document.addEventListener('click', function (e) {
    var t = e.target;
    var a = t && t.closest ? t.closest('a[href^="#"]') : null;
    if (!a) return;
    e.preventDefault();                       // the navigation, and nothing else
    var id = (a.getAttribute('href') || '').slice(1);
    if (!id) return;                          // href="#" is a button in disguise
    var el = null;
    try {
      el = document.getElementById(id) ||
           document.querySelector('[name="' + id.replace(/["\\]/g, '\\$&') + '"]');
    } catch (err) { /* not a usable selector — scrolling is best-effort */ }
    if (el && el.scrollIntoView) el.scrollIntoView();
    // Set it BEFORE the app's own handler runs: this is the fragment the app
    // reads back (bip39 picks its wordlist language out of location.hash).
    try { location.hash = id; } catch (err) {}
  }, true);
})();

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

  // window.prompt does NOTHING in an app frame: the sandbox carries no
  // allow-modals, so it returns NULL without asking, and the one place
  // piskel's layer-opacity control uses it was unreachable. prompt() cannot be shimmed the way the
  // runtime shims alert() and confirm() — its contract is a STRING returned
  // synchronously, and there is no honest way to invent one. So ask properly
  // and take the answer late: gifosAsk(label, initial) resolves to the typed
  // string, or null if it was dismissed.
  root.gifosAsk = function (label, initial) {
    return new Promise(function (resolve) {
      var wrap = document.createElement('div');
      wrap.setAttribute('role', 'dialog');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:flex;'
        + 'align-items:center;justify-content:center;background:rgba(0,0,0,.5);padding:16px';
      var card = document.createElement('div');
      card.style.cssText = 'background:#1b1b1f;color:#f4f4f5;border:1px solid #3f3f46;'
        + 'border-radius:12px;padding:16px;max-width:24rem;width:100%;'
        + 'font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;'
        + 'box-shadow:0 12px 40px rgba(0,0,0,.5)';
      var p = document.createElement('p');
      p.textContent = label;
      p.style.cssText = 'margin:0 0 10px';
      var input = document.createElement('input');
      input.type = 'text';
      input.value = initial == null ? '' : String(initial);
      input.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin:0 0 12px;'
        + 'padding:8px 10px;border-radius:8px;border:1px solid #3f3f46;background:#101014;'
        + 'color:inherit;font:inherit';
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancel';
      var ok = document.createElement('button');
      ok.type = 'button';
      ok.textContent = 'OK';
      var btn = 'padding:7px 14px;border-radius:8px;border:1px solid #3f3f46;'
        + 'background:#26262b;color:inherit;font:inherit;cursor:pointer';
      cancel.style.cssText = btn;
      ok.style.cssText = btn + ';background:#3b82f6;border-color:#3b82f6;color:#fff';
      function done(v) { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); resolve(v); }
      cancel.addEventListener('click', function () { done(null); });
      ok.addEventListener('click', function () { done(input.value); });
      wrap.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); done(null); }
        else if (e.key === 'Enter') { e.preventDefault(); done(input.value); }
      });
      row.appendChild(cancel); row.appendChild(ok);
      card.appendChild(p); card.appendChild(input); card.appendChild(row);
      wrap.appendChild(card);
      (document.body || document.documentElement).appendChild(wrap);
      input.focus(); input.select();
    });
  };
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
