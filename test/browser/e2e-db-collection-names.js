/*
 * A COLLECTION NAME IS THE ONE APP-CHOSEN STRING THAT INDEXES A TRUSTED MAP.
 *
 * Every consumer of an app's state does `collections[name] || (collections[name]
 * = …)`. For a name that is an Object.prototype member that idiom hands back the
 * INHERITED member as "the collection": `gifos.db('constructor').put({})` stored
 * a row that made assemble() throw, so store.getState() — and with it
 * allStates(), i.e. the whole-computer backup — rejected forever on one bad row;
 * and `gifos.db('__proto__').put({})` bumped `seq` on Object.prototype in the
 * trusted page. The bridge now refuses such names (store.badCollectionName), the
 * readers skip such rows, and a synchronous throw inside an op becomes a reply
 * instead of a hung promise.
 *
 * Needs: the static site on 8099 (python3 -m http.server 8099 -d site).
 */
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail !== undefined && !cond ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext();
  const desk = await context.newPage();
  await desk.goto(BASE + '/index.html');
  await desk.waitForSelector('.icon');

  // The app tries each name and reports the outcome; then it writes a normal
  // collection so the "good path still works" half is in the same run.
  const script =
    'var names = ["constructor", "__proto__", "toString", "hasOwnProperty", "", 7];' +
    'var out = [];' +
    'names.reduce(function(p, n){ return p.then(function(){ return gifos.db(n).put({ x: 1 }).then(function(){ out.push(String(n) + ":ok"); }, function(e){ out.push(String(n) + ":" + e.message); }); }); }, Promise.resolve())' +
    '.then(function(){ return gifos.db("notes").put({ text: "hi" }); })' +
    '.then(function(r){ out.push("notes:" + (r && r.id ? "ok" : "no-id")); return gifos.db("notes").getAll(); })' +
    '.then(function(all){ out.push("count:" + all.length); document.getElementById("out").textContent = out.join("|"); })' +
    '.catch(function(e){ document.getElementById("out").textContent = "ERR:" + e.message; });';
  await desk.evaluate(async (a) => {
    const bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify({ gifos: '1.0', appId: 'colltest', name: 'CollTest', entry: 'index.html' }),
      'index.html': '<!doctype html><div id="out">idle</div><script>' + a.script + '</scr' + 'ipt>',
    });
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'CollTest.gif', bytes, kind: 'gif', isApp: true, appId: 'colltest', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'CollTest.gif', parent: null, x: 400, y: 200, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, { script });
  await desk.locator('.icon', { hasText: 'CollTest.gif' }).first().waitFor();
  await sleep(200);
  const [app] = await Promise.all([context.waitForEvent('page'), desk.locator('.icon', { hasText: 'CollTest.gif' }).first().dblclick()]);
  await app.waitForSelector('#appmount iframe');
  await sleep(2500);
  const text = await app.frameLocator('#appmount iframe').locator('#out').textContent();
  const parts = String(text).split('|');
  check('every prototype-member name is refused with a reply, not a hang', parts.filter((p) => /^(constructor|__proto__|toString|hasOwnProperty):bad collection name$/.test(p)).length === 4, text);
  check('an empty or non-string name is refused too', parts.includes(':bad collection name') && parts.includes('7:bad collection name'), text);
  check('an ordinary collection still writes and reads', parts.includes('notes:ok') && parts.includes('count:1'), text);

  // The trusted page's prototypes are untouched, and the backup path that
  // assembles every app's state still resolves.
  const shell = await app.evaluate(async () => {
    const polluted = ('seq' in Object.prototype) || ('items' in Object.prototype);
    let states = null;
    try { states = await GifOS.store.allStates(); } catch (e) { return { polluted, err: String(e && e.message || e) }; }
    return { polluted, n: states.length };
  });
  check('Object.prototype in the trusted page is untouched', shell.polluted === false, JSON.stringify(shell));
  check('store.allStates() (whole-computer backup) still resolves', typeof shell.n === 'number', JSON.stringify(shell));

  // A row written before the gate existed (planted straight into IndexedDB)
  // must not brick the app's state or the backup either.
  const legacy = await app.evaluate(async () => {
    const files = await GifOS.store.allFiles();
    const f = files.find((x) => x.appId === 'colltest');
    const dbp = await new Promise((res, rej) => { const r = indexedDB.open('gifos'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    await new Promise((res, rej) => {
      const tx = dbp.transaction('apprecords', 'readwrite');
      tx.objectStore('apprecords').put({ fileId: f.id, collection: 'constructor', id: 'legacy_1', rec: { id: 'legacy_1', evil: true } });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    dbp.close();
    try {
      const st = await GifOS.store.getState(f.id);
      const all = await GifOS.store.allStates();
      return { ok: true, keys: Object.keys(st.collections), n: all.length };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
  check('a legacy row with a prototype-member collection is skipped, not fatal', legacy.ok === true && !legacy.keys.includes('constructor') && legacy.keys.includes('notes'), JSON.stringify(legacy));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
