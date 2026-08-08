// Thin persistence wrapper over gifos.db, with an in-memory stand-in so the
// page still works opened outside GifOS (nothing persists there, and the app
// says so). Collections: prefs, words, recordings (audio blobs, one record
// per clip - fetched individually, never subscribed), recmeta (the listing
// the studio shows, kept blob-free so reading progress is cheap), ttscache.
(function () {
  const SIO = (window.SIO = window.SIO || {});

  const inGifOS = () => typeof window.gifos !== 'undefined' && !!window.gifos;

  // in-memory fallback
  const mem = {};
  function memDb(name) {
    const coll = (mem[name] = mem[name] || new Map());
    return {
      put: async (item) => { coll.set(item.id, JSON.parse(JSON.stringify(item))); return item; },
      get: async (id) => (coll.has(id) ? JSON.parse(JSON.stringify(coll.get(id))) : null),
      getAll: async () => [...coll.values()].map((v) => JSON.parse(JSON.stringify(v))),
      delete: async (id) => { coll.delete(id); },
      subscribe: (cb) => { cb([...coll.values()]); },
    };
  }

  function db(name) {
    return inGifOS() ? window.gifos.db(name) : memDb(name);
  }

  SIO.store = { db, inGifOS };
})();
