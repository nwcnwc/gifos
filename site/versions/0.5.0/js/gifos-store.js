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
 * Attaches to `GifOS.store`.
 */
(function (root) {
  const GifOS = (root.GifOS = root.GifOS || {});
  const DB_NAME = 'gifos';
  const DB_VERSION = 1;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      // Open WITHOUT pinning a version: this frozen build shares the origin
      // database with the latest build. Demanding an exact (older) version
      // would VersionError once the live build bumps the schema, so we open
      // version-agnostically and ignore any stores we don't know about.
      const req = indexedDB.open(DB_NAME);
      req.onupgradeneeded = (e) => {
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

  const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

  // random id without Date/Math.random dependence issues in tooling; browser has crypto
  function uid(prefix) {
    const a = new Uint8Array(8);
    (root.crypto || {}).getRandomValues ? root.crypto.getRandomValues(a) : a.forEach((_, i) => (a[i] = i));
    let s = '';
    for (let i = 0; i < a.length; i++) s += a[i].toString(16).padStart(2, '0');
    return (prefix || 'id') + '_' + s;
  }

  const store = {
    uid,
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
    clearAll: () => open().then((db) => Promise.all(['files', 'items', 'appstate'].map((s) =>
      tx(s, 'readwrite', (os) => reqP(os.clear()))))),
  };

  // A stable-enough timestamp for the browser (Date is available here, unlike tooling).
  function nowISO() {
    try { return new Date().toISOString(); } catch (e) { return ''; }
  }
  store.nowISO = nowISO;

  GifOS.store = store;
})(typeof window !== 'undefined' ? window : globalThis);
