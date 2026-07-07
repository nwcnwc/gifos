/*
 * gifos-store.js — Local-first persistence for the GifOS desktop.
 *
 * Everything the user owns lives here, in this browser (IndexedDB). No account,
 * no server sync — consistent with "nothing lives on our server."
 *
 *   files    : raw bytes of every dropped file        (keyed by id)
 *   items    : desktop icons + folders (layout)       (keyed by id)
 *   appstate : saved state per app icon               (keyed by fileId)
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
  const DB_VERSION = 1;

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

  function makeStore(dbName) {
    let dbp = null;

    function open() {
      if (dbp) return dbp;
      dbp = new Promise((resolve, reject) => {
        // Open WITHOUT pinning a version: this is a frozen build sharing the
        // origin database with whatever the latest build has migrated it to.
        // Demanding an exact (older) version would VersionError once the live
        // build bumps the schema; opening version-agnostically means we adopt
        // the current version and simply ignore any stores we don't know about.
        const req = indexedDB.open(dbName);
        req.onupgradeneeded = (e) => {
          // Only runs when THIS build first creates the database. Additive only.
          const db = e.target.result;
          if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('appstate')) db.createObjectStore('appstate', { keyPath: 'fileId' });
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
        Promise.resolve(fn(os)).then((r) => { result = r; });
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }));
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
      // ---- app state (lives with the icon) ----
      getState: (fileId) => tx('appstate', 'readonly', (os) => reqP(os.get(fileId))).then((r) => (r ? r.state : null)),
      setState: (fileId, state) => tx('appstate', 'readwrite', (os) => reqP(os.put({ fileId, state, updatedAt: nowISO() }))),
      deleteState: (fileId) => tx('appstate', 'readwrite', (os) => reqP(os.delete(fileId))),
      allStates: () => tx('appstate', 'readonly', (os) => reqP(os.getAll())),
      allFiles: () => tx('files', 'readonly', (os) => reqP(os.getAll())),
      // ---- misc ----
      clearAll: () => open().then(() => Promise.all(['files', 'items', 'appstate'].map((s) =>
        tx(s, 'readwrite', (os) => reqP(os.clear()))))),
    };

    store.nowISO = nowISO;

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
