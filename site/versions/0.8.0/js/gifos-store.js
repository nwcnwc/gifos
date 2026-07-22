/*
 * gifos-store.js — Local-first persistence for the GifOS desktop.
 *
 * Everything the user owns lives here, in this browser (IndexedDB). No account,
 * no server sync — consistent with "nothing lives on our server."
 *
 *   files      : raw bytes of every dropped file      (keyed by id)
 *   items      : desktop icons + folders (layout)     (keyed by id)
 *   appstate   : per-icon blob: app skeletons + prefs (keyed by fileId)
 *   apprecords : one row per app record               (keyed by [fileId,collection,id])
 *
 * NAMESPACES — a store is a whole computer. The default desktop lives in the
 * 'gifos' database; a BOOTED COMPUTER IMAGE (a desktop-backup GIF opened with
 * boot.html) runs against its own 'gifos_vm_<fileId>' database, so a computer
 * can run inside a computer without either touching the other. Set
 * window.GIFOS_DB_NAME before this script loads to bind the default store to
 * a different namespace; use GifOS.store.namespace(name) to open another one.
 *
 * Attaches to `GifOS.store`.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  const DB_VERSION = 2;

  const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  // random id without Date/Math.random dependence issues in tooling; browser has crypto
  function uid(prefix) {
    const a = new Uint8Array(8);
    (root.crypto || {}).getRandomValues ? root.crypto.getRandomValues(a) : a.forEach((_, i) => (a[i] = i));
    let s = '';
    for (let i = 0; i < a.length; i++) s += a[i].toString(16).padStart(2, '0');
    return (prefix || 'id') + '_' + s;
  }

  // A stable-enough timestamp for the browser (Date is available here, unlike tooling).
  function nowISO() {
    try { return new Date().toISOString(); } catch (e) { return ''; }
  }

  // ---- binary-safe JSON (shared wire/GIF format) ----------------------------
  // A Uint8Array/ArrayBuffer inside a db value (e.g. My Media's stored photo or
  // video bytes) can't survive a plain JSON round-trip: it becomes a giant
  // {"0":..,"1":..} object — mangled on read, and for a video-sized blob big
  // enough to crash the serializer. We tag it { $bin: base64 } on the way out
  // and restore a Uint8Array on the way in. This ONE format is used everywhere
  // state is serialized: the mesh (gifos-net seal/open), a stolen/snapshotted
  // app GIF, and a whole-computer backup — so media bytes travel intact.
  function b64ofBin(v) {
    const u = v instanceof Uint8Array ? v : new Uint8Array(v);
    let s = '';
    for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
    return (root.btoa || btoa)(s);
  }
  function binOfB64(b) {
    const s = (root.atob || atob)(b); const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function binReplacer(k, v) {
    if (v instanceof Uint8Array || v instanceof ArrayBuffer) return { $bin: b64ofBin(v) };
    return v;
  }
  function binReviver(k, v) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.$bin === 'string') return binOfB64(v.$bin);
    return v;
  }
  const packJSON = (obj) => JSON.stringify(obj, binReplacer);
  const unpackJSON = (str) => JSON.parse(str, binReviver);

  function makeStore(dbName) {
    let dbp = null;

    function open() {
      if (dbp) return dbp;
      dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open(dbName, DB_VERSION);
        req.onupgradeneeded = (e) => {
          // Migrations are ADDITIVE ONLY: create stores, never drop/rename them,
          // and read old rows defensively with defaults rather than requiring new
          // fields. Bump DB_VERSION when you add a store or index.
          const db = e.target.result;
          if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
          // appstate: one blob per icon — app skeletons (collection list + seq
          // counters) and non-collection blobs (prefs, session tokens).
          if (!db.objectStoreNames.contains('appstate')) db.createObjectStore('appstate', { keyPath: 'fileId' });
          // apprecords: one row per app record, so a put writes a single record
          // instead of rewriting the whole app state. The composite key sorts
          // records by (app, collection, id) for O(range) reads — see appRange().
          if (!db.objectStoreNames.contains('apprecords')) db.createObjectStore('apprecords', { keyPath: ['fileId', 'collection', 'id'] });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return dbp;
    }

    function tx(store, mode, fn) {
      return open().then((db) => new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const os = t.objectStore(store);
        let result;
        Promise.resolve(fn(os)).then((r) => { result = r; }, reject);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }));
    }

    // Same as tx() but spanning several stores in ONE transaction. fn receives a
    // { storeName: objectStore } map. Multi-store reads/writes here are atomic
    // and isolated by IndexedDB itself — two tabs writing the same app take
    // turns, so a seq counter can be read-modify-written without any extra lock.
    function txMulti(stores, mode, fn) {
      return open().then((db) => new Promise((resolve, reject) => {
        const t = db.transaction(stores, mode);
        const map = {};
        for (const s of stores) map[s] = t.objectStore(s);
        let result;
        Promise.resolve(fn(map)).then((r) => { result = r; }, reject);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }));
    }

    // PER-RECORD APP STATE (Expert review #5): a large app's collections used to
    // be one JSON blob in 'appstate', rewritten in full on every put. Now each
    // record is its own row in the 'apprecords' store, keyed by the composite
    // [fileId, collection, id], so a put writes ONE record. The matching skeleton
    // in 'appstate' (key = fileId) holds only the collection list + seq counters
    // and a { _perRecord:true } marker. getState/setState/allStates transparently
    // ASSEMBLE / EXPLODE the classic { collections:{ name:{ items, seq } } } shape,
    // so snapshots, backup/restore, boot images and multiplayer dumps are
    // byte-for-byte unchanged.
    //
    // Composite keys sort element-by-element, and an array sorts AFTER any string,
    // so [fileId, coll, []] is an exclusive upper bound for every id in a
    // collection, and [fileId, []] for every record in an app.
    const isCollState = (s) => !!(s && typeof s === 'object' && s.collections && typeof s.collections === 'object');
    const appRange = (fileId) => IDBKeyRange.bound([fileId], [fileId, []]);
    const collRange = (fileId, coll) => IDBKeyRange.bound([fileId, coll], [fileId, coll, []]);

    // Assemble a full { collections } object for a per-record app from its rows.
    function assemble(recOS, fileId, skel) {
      const collections = {};
      const sc = (skel && skel.collections) || {};
      for (const name in sc) collections[name] = { items: {}, seq: (sc[name] || {}).seq || 1 };
      return reqP(recOS.getAll(appRange(fileId))).then((rows) => {
        for (const row of rows || []) {
          const c = collections[row.collection] || (collections[row.collection] = { items: {}, seq: 1 });
          c.items[row.id] = row.rec;
        }
        return { collections };
      });
    }
    // Explode a full { collections } state into a skeleton + per-record rows,
    // clearing any prior rows for this app first (so a restore stays consistent).
    function explode(skelOS, recOS, fileId, state) {
      return reqP(recOS.getAllKeys(appRange(fileId))).then((keys) => {
        for (const k of keys || []) recOS.delete(k);
        const skel = { _perRecord: true, collections: {} };
        for (const name in state.collections) {
          const c = state.collections[name] || {};
          skel.collections[name] = { seq: c.seq || 1 };
          const items = c.items || {};
          for (const id in items) recOS.put({ fileId, collection: name, id, rec: items[id] });
        }
        skelOS.put({ fileId, state: skel, updatedAt: nowISO() });
        return true;
      });
    }

    const store = {
      uid,
      dbName,
      // ---- files ----
      putFile: (rec) => tx('files', 'readwrite', (os) => reqP(os.put(rec))).then(() => rec),
      getFile: (id) => tx('files', 'readonly', (os) => reqP(os.get(id))),
      deleteFile: (id) => tx('files', 'readwrite', (os) => reqP(os.delete(id))),
      // ---- desktop items ----
      putItem: (rec) => tx('items', 'readwrite', (os) => reqP(os.put(rec))).then(() => rec),
      getItem: (id) => tx('items', 'readonly', (os) => reqP(os.get(id))),
      allItems: () => tx('items', 'readonly', (os) => reqP(os.getAll())),
      deleteItem: (id) => tx('items', 'readwrite', (os) => reqP(os.delete(id))),
      // ---- app state (lives with the icon) — assembled/exploded views ----
      getState: (fileId) => txMulti(['appstate', 'apprecords'], 'readonly', (s) => reqP(s.appstate.get(fileId)).then((r) => {
        if (!r) return null;
        if (r.state && r.state._perRecord) return assemble(s.apprecords, fileId, r.state);
        return r.state; // a non-collection blob (prefs / session tokens)
      })),
      setState: (fileId, state) => {
        // Collection state is stored per-record; everything else (prefs, session
        // tokens, snapshots-of-non-apps) stays a single blob.
        if (isCollState(state)) return txMulti(['appstate', 'apprecords'], 'readwrite', (s) => explode(s.appstate, s.apprecords, fileId, state));
        return tx('appstate', 'readwrite', (os) => reqP(os.put({ fileId, state, updatedAt: nowISO() })));
      },
      deleteState: (fileId) => txMulti(['appstate', 'apprecords'], 'readwrite', (s) =>
        reqP(s.apprecords.getAllKeys(appRange(fileId))).then((keys) => {
          for (const k of keys || []) s.apprecords.delete(k);
          s.appstate.delete(fileId);
          return true;
        })),
      allStates: () => txMulti(['appstate', 'apprecords'], 'readonly', (s) => reqP(s.appstate.getAll()).then((rows) =>
        // Return one ASSEMBLED full state per icon, so whole-computer
        // backup/restore keeps its historical { fileId, state } shape.
        Promise.all((rows || []).map((r) => (r.state && r.state._perRecord)
          ? assemble(s.apprecords, r.fileId, r.state).then((full) => ({ fileId: r.fileId, state: full }))
          : Promise.resolve({ fileId: r.fileId, state: r.state }))))),
      // ---- fast per-record ops (used by the runtime's makeLocalDb) ----
      appGet: (fileId, coll, id) => tx('apprecords', 'readonly', (os) => reqP(os.get([fileId, coll, id])).then((r) => (r ? r.rec : null))),
      appGetAll: (fileId, coll) => tx('apprecords', 'readonly', (os) => reqP(os.getAll(collRange(fileId, coll))).then((rows) => (rows || []).map((r) => r.rec))),
      // Insert/update one record. Auto-allocates an id from the collection's seq
      // counter (in the skeleton) when the record has none — the skeleton read,
      // seq bump and record write all happen in ONE transaction, so concurrent
      // tabs never reuse an id.
      appAdd: (fileId, coll, rec) => txMulti(['appstate', 'apprecords'], 'readwrite', (s) =>
        reqP(s.appstate.get(fileId)).then((r) => {
          const skel = (r && r.state && r.state._perRecord) ? r.state : { _perRecord: true, collections: {} };
          const c = skel.collections[coll] || (skel.collections[coll] = { seq: 1 });
          if (rec.id == null) rec.id = coll + '_' + (c.seq++);
          s.apprecords.put({ fileId, collection: coll, id: rec.id, rec });
          s.appstate.put({ fileId, state: skel, updatedAt: nowISO() });
          return rec;
        })),
      appDelete: (fileId, coll, id) => tx('apprecords', 'readwrite', (os) => reqP(os.delete([fileId, coll, id]))),
      allFiles: () => tx('files', 'readonly', (os) => reqP(os.getAll())),
      // ---- misc ----
      clearAll: () => open().then(() => Promise.all(['files', 'items', 'appstate', 'apprecords'].map((s) =>
        tx(s, 'readwrite', (os) => reqP(os.clear()))))),
    };

    store.nowISO = nowISO;
    store.packJSON = packJSON;     // binary-safe JSON.stringify (keeps media blobs intact)
    store.unpackJSON = unpackJSON; // binary-safe JSON.parse (restores Uint8Array)

    // Cross-tab channel names. The default namespace keeps the historical,
    // un-suffixed names so archived /versions builds stay in sync with the
    // latest one; VM namespaces get their own channels so a booted computer
    // never repaints (or leaks app state into) the host desktop.
    store.syncChannel = dbName === 'gifos' ? 'gifos-desktop-sync' : 'gifos-desktop-sync::' + dbName;
    store.appChannel = (fileId) => 'gifos-app-' + (dbName === 'gifos' ? '' : dbName + '::') + fileId;

    // Per-browser identity, shared by every app on this origin (this "computer").
    // Deliberately NOT namespaced: a booted image is still being driven by you.
    store.identity = function () {
      let id = '', name = '';
      try {
        id = localStorage.getItem('gifos_uid') || '';
        if (!id) { id = uid('user'); localStorage.setItem('gifos_uid', id); }
        name = localStorage.getItem('gifos_name') || '';
      } catch (e) { if (!id) id = 'user_anon'; }
      return { id, name };
    };
    store.setName = function (name) {
      const n = String(name || '').trim().slice(0, 40);
      try { if (n) localStorage.setItem('gifos_name', n); else localStorage.removeItem('gifos_name'); } catch (e) {}
      return store.identity();
    };

    store.namespace = makeStore;
    return store;
  }

  GifOS.store = makeStore(root.GIFOS_DB_NAME || 'gifos');
})(typeof window !== 'undefined' ? window : globalThis);
