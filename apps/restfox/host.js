// Restfox — the host layer.
//
// Network and state go through here so the rest of the app never branches on
// "are we inside GifOS?". Two hosts:
//
//   GifOS  — window.gifos exists. Requests ride gifos.fetch (manifest-gated,
//            https only). Collections live in gifos.db.
//   Dev    — the source served from a static server. Plain fetch, a Map that
//            persists to localStorage so a reload during development does not
//            wipe the collection.
//
// Inside the sandbox a bare fetch() is dead (connect-src 'none'). If window.gifos
// is missing we are genuinely outside, not "GifOS is broken".
(function (root) {
  'use strict';

  var inGifOS = !!(root.gifos && root.gifos.fetch);

  function hostFetch(url, opts) {
    opts = opts || {};
    if (inGifOS) return root.gifos.fetch(url, opts);
    var init = {
      method: opts.method || 'GET',
      headers: opts.headers || undefined,
      body: opts.body || undefined,
      credentials: 'omit',
    };
    return root.fetch(url, init).then(function (r) {
      return r.arrayBuffer().then(function (bytes) {
        var headers = {};
        try { r.headers.forEach(function (v, k) { headers[k] = v; }); } catch (e) {}
        var txt = null;
        function asText() {
          if (txt === null) txt = new TextDecoder().decode(new Uint8Array(bytes));
          return txt;
        }
        var mime = headers['content-type'] || '';
        return {
          status: r.status, headers: headers, ok: r.status >= 200 && r.status < 300,
          json: function () { return Promise.resolve(JSON.parse(asText())); },
          text: function () { return Promise.resolve(asText()); },
          arrayBuffer: function () { return Promise.resolve(bytes); },
          blob: function () { return Promise.resolve(new Blob([bytes], { type: mime })); },
        };
      });
    });
  }

  function devLoad(name) {
    try {
      var raw = root.localStorage.getItem('restfox.dev.' + name);
      var m = new Map();
      if (raw) JSON.parse(raw).forEach(function (v) { m.set(v.id, v); });
      return m;
    } catch (e) { return new Map(); }
  }
  function devSave(name, store) {
    try {
      var arr = []; store.forEach(function (v) { arr.push(v); });
      root.localStorage.setItem('restfox.dev.' + name, JSON.stringify(arr));
    } catch (e) { /* quota / private mode: convenience only */ }
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

  function onBack(cb) { if (inGifOS && root.gifos.onBack) root.gifos.onBack(cb); }

  root.Host = { inGifOS: inGifOS, fetch: hostFetch, db: db, onBack: onBack };
})(window);
