// End-to-end: per-record store invariants, run against the real GifOS.store in
// Chromium (IndexedDB only exists in a browser). The point is orphan safety —
// deleting or replacing an app must never leave stray apprecords rows behind,
// and no record may exist for a fileId that has no appstate skeleton.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
function check(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; }

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await (await browser.newContext()).newPage();
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon');

  const result = await page.evaluate(async () => {
    const store = GifOS.store;
    // Raw count of apprecords rows for one fileId (the orphan probe).
    const countRecs = (fileId) => new Promise((res, rej) => {
      const rq = indexedDB.open(store.dbName);
      rq.onsuccess = () => {
        const db = rq.result;
        const os = db.transaction('apprecords', 'readonly').objectStore('apprecords');
        const c = os.count(IDBKeyRange.bound([fileId], [fileId, []]));
        c.onsuccess = () => res(c.result); c.onerror = () => rej(c.error);
      };
      rq.onerror = () => rej(rq.error);
    });
    // Every fileId that owns apprecords rows must also own an appstate skeleton.
    const orphanFileIds = () => new Promise((res, rej) => {
      const rq = indexedDB.open(store.dbName);
      rq.onsuccess = () => {
        const db = rq.result;
        const tx = db.transaction(['apprecords', 'appstate'], 'readonly');
        const recKeys = tx.objectStore('apprecords').getAllKeys();
        const skelKeys = tx.objectStore('appstate').getAllKeys();
        tx.oncomplete = () => {
          const skel = new Set(skelKeys.result || []);
          const orphans = new Set();
          for (const k of (recKeys.result || [])) if (!skel.has(k[0])) orphans.add(k[0]);
          res(Array.from(orphans));
        };
        tx.onerror = () => rej(tx.error);
      };
      rq.onerror = () => rej(rq.error);
    });

    const fid = store.uid('file');
    const out = {};

    // 1. write a collection with 3 records, read it back
    await store.setState(fid, { collections: { notes: { seq: 4, items: {
      a: { id: 'a', t: 'one' }, b: { id: 'b', t: 'two' }, c: { id: 'c', t: 'three' } } } } });
    const s1 = await store.getState(fid);
    out.assembledCount = Object.keys(s1.collections.notes.items).length;
    out.recCount = await countRecs(fid);

    // 2. replace with a smaller set — prior rows must be cleared (one canonical set)
    await store.setState(fid, { collections: { notes: { seq: 5, items: { z: { id: 'z', t: 'solo' } } } } });
    out.afterReplace = await countRecs(fid);
    const s2 = await store.getState(fid);
    out.afterReplaceAssembled = Object.keys(s2.collections.notes.items).length;

    // 3. delete the app — zero rows, no skeleton
    await store.deleteState(fid);
    out.afterDelete = await countRecs(fid);
    out.afterDeleteState = await store.getState(fid);

    // 4. global invariant: no apprecords row belongs to a fileId without a skeleton
    out.orphans = await orphanFileIds();
    return out;
  });

  check('setState stores each record as its own row (3 records → 3 rows)', result.recCount === 3 && result.assembledCount === 3);
  check('replacing an app clears prior rows (one canonical set)', result.afterReplace === 1 && result.afterReplaceAssembled === 1);
  check('deleting an app leaves zero orphaned records', result.afterDelete === 0 && result.afterDeleteState === null);
  check('no apprecords row exists for a fileId without a skeleton', Array.isArray(result.orphans) && result.orphans.length === 0);

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
