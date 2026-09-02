// THE FILE INDEX: metadata questions never deserialise every app.
//
// IndexedDB has no projection — getAll() on 'files' hands back every byte of
// every app to answer "which of these is a default app with this appId". The
// reseed, two migrations, the meeting's app picker and My Media's lookup all
// asked exactly that, on desktops of hundreds of megabytes. gifos-store.js now
// keeps a 'meta' store in the '<db>::art' sibling database — one row per file,
// the record minus its bytes — written by putFile/deleteFile and read by
// allFileMeta(), which self-heals when its count disagrees with 'files'.
//
// Needs: static server on 8099.
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');
const { readFileSync } = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}

(async () => {
  const gifB64 = readFileSync(appGif('anyroad')).toString('base64');
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext();
  context.setDefaultTimeout(60000);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 60000 });

  // 1. A seeded desktop: every file has a meta row, and no row carries bytes.
  const seeded = await page.evaluate(async () => {
    const files = await GifOS.store.allFiles();
    const metas = await GifOS.store.allFileMeta();
    const byId = {}; for (const m of metas) byId[m.id] = m;
    let agree = true, bytesLeak = false;
    for (const f of files) {
      const m = byId[f.id];
      if (!m || m.name !== f.name || m.kind !== f.kind || !!m.isApp !== !!f.isApp || (m.appId || null) !== (f.appId || null) || !!m.isDefault !== !!f.isDefault) agree = false;
      if (m && ('bytes' in m)) bytesLeak = true;
      if (m && m.size !== (f.bytes ? f.bytes.length : 0)) agree = false;
    }
    return { n: files.length, m: metas.length, agree, bytesLeak };
  });
  check('every seeded file has a meta row (' + seeded.n + ' files)', seeded.n > 0 && seeded.m === seeded.n, JSON.stringify(seeded));
  check('a meta row carries the record\'s fields and size, never its bytes', seeded.agree && !seeded.bytesLeak, JSON.stringify(seeded));

  // 2. putFile writes the row, deleteFile removes it.
  const rw = await page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const id = GifOS.store.uid('file');
    await GifOS.store.putFile({ id, name: 'Meta Probe.gif', bytes, kind: 'gif', isApp: true, appId: 'anyroad', mime: 'image/gif' });
    const after = (await GifOS.store.allFileMeta()).find((m) => m.id === id);
    await GifOS.store.deleteFile(id);
    const gone = (await GifOS.store.allFileMeta()).find((m) => m.id === id);
    return { after: after && { name: after.name, appId: after.appId, size: after.size, hasBytes: 'bytes' in after }, gone: !!gone, len: bytes.length };
  }, gifB64);
  check('putFile writes the meta row (name, appId, size — no bytes)', rw.after && rw.after.name === 'Meta Probe.gif' && rw.after.appId === 'anyroad' && rw.after.size === rw.len && !rw.after.hasBytes, JSON.stringify(rw.after));
  check('deleteFile removes it', !rw.gone);

  // 3. Self-heal: a database written before the index existed (or a lost second
  //    transaction) has fewer rows than files — one read rebuilds it.
  const healed = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open(GifOS.store.dbName + '::art', 2); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    await new Promise((res, rej) => { const t = db.transaction('meta', 'readwrite'); t.objectStore('meta').clear(); t.oncomplete = res; t.onerror = () => rej(t.error); });
    db.close();
    const n = (await GifOS.store.allFiles()).length;
    const metas = await GifOS.store.allFileMeta();
    const again = await new Promise((res, rej) => {
      const r = indexedDB.open(GifOS.store.dbName + '::art', 2);
      r.onsuccess = () => { const d = r.result; const t = d.transaction('meta', 'readonly'); const q = t.objectStore('meta').count(); q.onsuccess = () => { d.close(); res(q.result); }; q.onerror = () => rej(q.error); };
      r.onerror = () => rej(r.error);
    });
    return { n, m: metas.length, stored: again };
  });
  check('an emptied index is rebuilt from the files on the next read', healed.m === healed.n && healed.stored === healed.n, JSON.stringify(healed));

  // 4. The callers that only wanted flags no longer read bytes: the metadata
  //    read must not open the 'files' store's getAll.
  const reads = await page.evaluate(async () => {
    const orig = IDBObjectStore.prototype.getAll; let filesGetAll = 0;
    IDBObjectStore.prototype.getAll = function () { if (this.name === 'files') filesGetAll++; return orig.apply(this, arguments); };
    try { await GifOS.store.allFileMeta(); } finally { IDBObjectStore.prototype.getAll = orig; }
    return filesGetAll;
  });
  check('a healthy index answers allFileMeta() without files.getAll()', reads === 0, String(reads));

  await browser.close();
  console.log(failures ? failures + ' FAILED' : 'ALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
