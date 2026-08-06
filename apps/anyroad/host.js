// Anyroad — the host layer.
//
// Everything the app needs from the outside world goes through here, so the
// rest of the code never branches on "are we inside GifOS?". Two hosts:
//
//   GifOS   — window.gifos exists. Network rides the manifest-gated bridge,
//             state lives in gifos.db (persisted inside the app's own GIF).
//   Dev     — the source served straight from a static server, for iterating
//             without repacking a GIF every time. Plain fetch, in-memory db.
//
// The dev host is NOT a fallback for a broken GifOS — inside the sandbox a bare
// fetch() is dead on arrival (connect-src 'none'), so if window.gifos is missing
// we are genuinely outside and there is nothing to degrade to but dev mode.
(function (root) {
  'use strict';

  var inGifOS = !!(root.gifos && root.gifos.fetch);

  // ---- network -------------------------------------------------------------
  // One shape either way: { ok, status, json(), text(), arrayBuffer(), blob() }.
  // The GifOS bridge hands binary back byte-exact, so tile PNGs and JSON share
  // one path. `proxy` is only meaningful inside GifOS.
  function hostFetch(url, opts) {
    opts = opts || {};
    if (inGifOS) return root.gifos.fetch(url, opts);
    return root.fetch(url, { method: opts.method || 'GET', headers: opts.headers || undefined });
  }

  // ---- state ---------------------------------------------------------------
  // gifos.db is async and collection-scoped. The dev stand-in keeps the same
  // surface over a Map so app code is identical in both hosts.
  //
  // The dev store persists to localStorage, which matters for one specific
  // reason: the road cache. Without it every reload during development re-asks
  // Overpass for tiles it already had, and Overpass is donated infrastructure
  // with a per-IP budget. Inside GifOS this code never runs (localStorage is
  // disabled in the sandbox and gifos.db is the real store).
  function devLoad(name) {
    try {
      var raw = root.localStorage.getItem('anyroad.dev.' + name);
      var m = new Map();
      if (raw) JSON.parse(raw).forEach(function (v) { m.set(v.id, v); });
      return m;
    } catch (e) { return new Map(); }
  }
  function devSave(name, store) {
    try {
      var arr = []; store.forEach(function (v) { arr.push(v); });
      root.localStorage.setItem('anyroad.dev.' + name, JSON.stringify(arr));
    } catch (e) { /* quota or private mode: dev convenience only */ }
  }

  function devCollection(store, name) {
    var subs = [];
    function all() { var out = []; store.forEach(function (v) { out.push(v); }); return out; }
    function fire() { var snap = all(); subs.forEach(function (cb) { try { cb(snap); } catch (e) {} }); }
    return {
      put: function (item) { store.set(item.id, item); devSave(name, store); fire(); return Promise.resolve(item); },
      get: function (id) { return Promise.resolve(store.get(id) || null); },
      getAll: function () { return Promise.resolve(all()); },
      delete: function (id) { store.delete(id); devSave(name, store); fire(); return Promise.resolve(true); },
      setVisibility: function () { return Promise.resolve(true); },
      subscribe: function (cb) { subs.push(cb); Promise.resolve().then(function () { cb(all()); }); },
    };
  }
  var devStores = {};
  function db(name) {
    if (inGifOS) return root.gifos.db(name);
    if (!devStores[name]) devStores[name] = devCollection(devLoad(name), name);
    return devStores[name];
  }

  // ---- identity ------------------------------------------------------------
  var devMe = { id: 'dev_' + Math.random().toString(36).slice(2, 10), name: 'Driver' };
  function me() { return inGifOS ? root.gifos.me() : Promise.resolve(devMe); }

  // ---- keyed third-party API (the optional satellite drape) ----------------
  // gifos.api attaches the user's own key from Settings and pins it to that
  // API's host; the app never sees the credential. Outside GifOS there is no
  // key store, so imagery simply stays off.
  function apiReady(name) {
    if (!inGifOS || !root.gifos.apiReady) return Promise.resolve(false);
    return root.gifos.apiReady(name).catch(function () { return false; });
  }
  function api(name, req) {
    if (!inGifOS) return Promise.reject(new Error('no API host'));
    return root.gifos.api(name, req);
  }
  function apiSetup(name, hint) {
    if (inGifOS && root.gifos.apiSetup) { try { root.gifos.apiSetup(name, hint); } catch (e) {} }
  }

  // ---- back button ---------------------------------------------------------
  // The GifOS shell swallows Back by default; registering makes it mean
  // "close the panel that is open" instead of nothing.
  function onBack(cb) { if (inGifOS && root.gifos.onBack) root.gifos.onBack(cb); }

  root.Host = {
    inGifOS: inGifOS,
    fetch: hostFetch,
    db: db,
    me: me,
    api: api,
    apiReady: apiReady,
    apiSetup: apiSetup,
    onBack: onBack,
  };
})(window);
