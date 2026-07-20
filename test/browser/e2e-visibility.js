// End-to-end for the DATA-VISIBILITY (sharing) model. Two real browsers — a
// host and an invited guest — exercise every rule the runtime enforces:
//
//   read-write — the guest SEES and WRITES it (collaboration).
//   read-only  — the guest SEES it, but only the host writes (broadcast).
//   private    — never leaves the owner's tab; each participant keeps their OWN
//                copy, and the host's private records are hidden from the guest.
//   setVisibility — the host (owner) can opt a single record in at runtime
//                ("make visible"); a guest is REFUSED (host is master).
//
// The whole point: enforcement is HOST-SIDE, so a guest can be refused but can
// never override. Needs the local relay (RELAY) and a static server (BASE).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, cond, d) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (d ? '  (' + d + ')' : '')); if (!cond) failures++; };

// The test app: four collections, one per visibility rule. 'lib' starts private
// so we can opt a record into read-only at runtime (the My Media "make visible"
// pattern). index.html is inert — the test drives gifos.db from the outside.
const MANIFEST = JSON.stringify({
  gifos: '1.0', appId: 'vistest', name: 'Vis Test', entry: 'index.html',
  capabilities: { db: true, multiplayer: true },
  data: { pub: { visibility: 'read-write' }, ro: { visibility: 'read-only' }, priv: { visibility: 'private' }, lib: { visibility: 'private' } },
});

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns'],
  });
  async function makeUser(name) {
    const ctx = await browser.newContext();
    await ctx.addInitScript((o) => {
      try { localStorage.setItem('gifos_relay', o.relay); localStorage.setItem('gifos_name', o.name); localStorage.setItem('gifos_meet_bar', '0'); } catch (e) {}
    }, { name, relay: RELAY });
    return ctx;
  }
  const dismissName = async (p) => { try { await p.locator('.name-modal #nmok').click({ timeout: 1500 }); } catch (e) {} };
  const ackPerms = async (p) => { await p.waitForSelector('.perm-modal', { timeout: 15000 }).catch(() => {}); await p.locator('.perm-modal .done').click({ timeout: 4000 }).catch(() => {}); await p.waitForSelector('.perm-modal', { state: 'detached', timeout: 4000 }).catch(() => {}); };
  // Drive gifos.db from inside an app iframe. Reads return the record ids seen;
  // writes/visibility return { ok } / { rejected } so we can assert refusals.
  const ids = (fr, coll) => fr.locator('body').evaluate((el, c) => window.gifos.db(c).getAll().then((rows) => (rows || []).map((r) => r.id).sort()), coll);
  const put = (fr, coll, rec) => fr.locator('body').evaluate((el, a) => window.gifos.db(a.c).put(a.rec).then(() => ({ ok: true }), (e) => ({ rejected: String(e && e.message || e) })), { c: coll, rec });
  const setVis = (fr, coll, id, lvl) => fr.locator('body').evaluate((el, a) => window.gifos.db(a.c).setVisibility(a.id, a.lvl).then(() => ({ ok: true }), (e) => ({ rejected: String(e && e.message || e) })), { c: coll, id, lvl });

  // ---- host: seed + open the app, plant one record per collection ----
  const hostCtx = await makeUser('Ada');
  const hostPage = await hostCtx.newPage();
  hostPage.on('pageerror', (e) => console.log('  [host pageerror] ' + e.message));
  await hostPage.goto(BASE + '/index.html'); await hostPage.waitForSelector('.icon', { timeout: 20000 });
  const fid = await hostPage.evaluate(async (manifest) => {
    const bytes = await GifOS.gif.encode({ 'manifest.json': manifest, 'index.html': '<!doctype html><body>vis test</body>' }, {});
    const id = 'file_vistest';
    await GifOS.store.putFile({ id, name: 'Vis Test.gif', bytes, kind: 'gif', isApp: true, appId: 'vistest', mime: 'image/gif' });
    await GifOS.store.putItem({ id: 'i_vistest', name: 'Vis Test.gif', kind: 'gif', fileId: id, x: 40, y: 40 });
    return id;
  }, MANIFEST);
  check('host seeded the Vis Test app', !!fid, fid);
  await hostPage.goto(BASE + '/run.html#id=' + fid);
  await hostPage.waitForSelector('iframe', { timeout: 15000 });
  await ackPerms(hostPage);
  const hostFr = hostPage.frameLocator('iframe');
  // One record in each collection. 'lib/d' starts private (opt-in later).
  await put(hostFr, 'pub', { id: 'a', v: 'shared' });
  await put(hostFr, 'ro', { id: 'b', v: 'broadcast' });
  await put(hostFr, 'priv', { id: 'c', v: 'secret' });
  await put(hostFr, 'lib', { id: 'd', v: 'my photo' });

  // ---- host mints an invite ----
  await hostPage.locator('#host').click();
  await hostPage.waitForSelector('#inv-go', { timeout: 6000 });
  await hostPage.locator('#inv-go').click();
  await hostPage.waitForSelector('#lm-url', { timeout: 15000 }).catch(() => {});
  const link = await hostPage.locator('#lm-url').inputValue().catch(() => '');
  check('host minted an invite link', /#s=|#j=/.test(link || ''), (link || '').slice(0, 40));
  await hostPage.evaluate(() => { const m = document.getElementById('link-modal'); if (m) m.remove(); });

  // ---- guest joins ----
  const guestCtx = await makeUser('Ben');
  const guestPage = await guestCtx.newPage();
  guestPage.on('pageerror', (e) => console.log('  [guest pageerror] ' + e.message));
  await guestPage.goto(BASE + '/index.html'); await guestPage.waitForSelector('.icon', { timeout: 20000 });
  await guestPage.goto(link); await dismissName(guestPage);
  await ackPerms(guestPage);
  await guestPage.waitForSelector('iframe', { timeout: 15000 });
  const guestFr = guestPage.frameLocator('iframe');
  await sleep(800); // let the first mirror settle

  // ============ READS: what the guest may see ============
  check('guest SEES read-write records', (await ids(guestFr, 'pub')).join() === 'a', JSON.stringify(await ids(guestFr, 'pub')));
  check('guest SEES read-only records', (await ids(guestFr, 'ro')).join() === 'b', JSON.stringify(await ids(guestFr, 'ro')));
  check('guest does NOT see the host\'s PRIVATE records', (await ids(guestFr, 'priv')).length === 0, JSON.stringify(await ids(guestFr, 'priv')));
  check('guest does NOT see a not-yet-opted-in private item', (await ids(guestFr, 'lib')).join() === '', JSON.stringify(await ids(guestFr, 'lib')));

  // ============ WRITES: what the guest may change ============
  const wPub = await put(guestFr, 'pub', { id: 'g', v: 'from guest' });
  check('guest CAN write a read-write collection', wPub.ok === true, JSON.stringify(wPub));
  const wRo = await put(guestFr, 'ro', { id: 'h', v: 'hacked' });
  check('guest write to a read-only collection is REFUSED', !!wRo.rejected, JSON.stringify(wRo));
  const wPriv = await put(guestFr, 'priv', { id: 'gp', v: 'guest own' });
  check('guest write to a private collection is accepted (kept LOCAL)', wPriv.ok === true, JSON.stringify(wPriv));
  await sleep(600);

  // The host's authoritative store is the source of truth — check what landed.
  const hostHas = async (coll) => hostPage.evaluate((a) => GifOS.store.getState(a.fid).then((s) => {
    const items = s && s.collections && s.collections[a.coll] && s.collections[a.coll].items; return items ? Object.keys(items).sort() : [];
  }), { fid, coll });
  check('the guest\'s read-write write REACHED the host', (await hostHas('pub')).includes('g'), JSON.stringify(await hostHas('pub')));
  check('the guest\'s read-only write NEVER reached the host', !(await hostHas('ro')).includes('h'), JSON.stringify(await hostHas('ro')));
  check('the guest\'s private write NEVER reached the host', !(await hostHas('priv')).includes('gp'), JSON.stringify(await hostHas('priv')));
  // ...but the guest keeps its OWN private copy in-tab (and still can't see the host's).
  check('guest keeps its OWN private record, still hidden from the host\'s', (await ids(guestFr, 'priv')).join() === 'gp', JSON.stringify(await ids(guestFr, 'priv')));

  // ============ BINARY over the mesh (the guest-can't-play-video fix) ============
  // A Uint8Array in a shared record must reach the guest as a real Uint8Array
  // (not a mangled {"0":..} object) — otherwise a shared photo/video won't load.
  // Construct the bytes INSIDE the host page (Playwright would mangle a typed
  // array passed as an arg), then read them back on the guest.
  await hostFr.locator('body').evaluate(() => window.gifos.db('pub').put({ id: 'blob1', bytes: new Uint8Array([1, 2, 3, 250, 251, 252]) }));
  await sleep(700);
  const gotBin = await guestFr.locator('body').evaluate(() => window.gifos.db('pub').getAll().then((rows) => {
    const r = (rows || []).find((x) => x.id === 'blob1');
    if (!r) return { found: false };
    const b = r.bytes, isU8 = b instanceof Uint8Array;
    return { found: true, isU8: isU8, vals: isU8 ? Array.from(b) : null };
  }));
  check('guest receives shared binary as a real Uint8Array (not a mangled object)', gotBin.found && gotBin.isU8 === true, JSON.stringify(gotBin));
  check('the binary bytes arrive intact over the mesh', !!gotBin.vals && gotBin.vals.join(',') === '1,2,3,250,251,252', JSON.stringify(gotBin.vals));

  // ============ setVisibility: host opts a record in; guest can't ============
  const gVis = await setVis(guestFr, 'pub', 'a', 'private');
  check('guest setVisibility is REFUSED (host is master)', !!gVis.rejected, JSON.stringify(gVis));
  check('guest could not hide a shared record from itself', (await ids(guestFr, 'pub')).includes('a'));

  const hVis = await setVis(hostFr, 'lib', 'd', 'read-only');
  check('host CAN opt a private item into read-only ("make visible")', hVis.ok === true, JSON.stringify(hVis));
  // Nudge the guest to re-read (a real db-change broadcast does this live).
  await sleep(1000);
  check('the opted-in item is now VISIBLE to the guest', (await ids(guestFr, 'lib')).includes('d'), JSON.stringify(await ids(guestFr, 'lib')));

  await hostCtx.close(); await guestCtx.close();
  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAIL') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e && e.message || e); process.exit(2); });
