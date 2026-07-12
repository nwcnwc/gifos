// Repro: share My Media, mark a video "visible to guests", does the guest see
// AND load it? Drives the REAL seeded My Media app (its media/blobs private
// collections) across a two-party invite. Needs RELAY + BASE.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  async function makeUser(name) {
    const ctx = await browser.newContext();
    await ctx.addInitScript((o) => { try { localStorage.setItem('gifos_relay', o.relay); localStorage.setItem('gifos_name', o.name); localStorage.setItem('gifos_meet_bar', '0'); } catch (e) {} }, { name, relay: RELAY });
    return ctx;
  }
  const dismissName = async (p) => { try { await p.locator('.name-modal #nmok').click({ timeout: 1500 }); } catch (e) {} };
  const ackPerms = async (p) => { await p.waitForSelector('.perm-modal', { timeout: 15000 }).catch(() => {}); await p.locator('.perm-modal .done').click({ timeout: 4000 }).catch(() => {}); await p.waitForSelector('.perm-modal', { state: 'detached', timeout: 4000 }).catch(() => {}); };
  const mmId = (p) => p.evaluate(async () => { const it = (await GifOS.store.allItems()).find((x) => /^My Media\.gif/i.test(x.name || '')); return it ? it.fileId : null; });

  // ---- host: open My Media, store a video, mark it visible ----
  const hostCtx = await makeUser('Ada');
  const hostPage = await hostCtx.newPage();
  hostPage.on('pageerror', (e) => console.log('  [host pageerror] ' + e.message));
  await hostPage.goto(BASE + '/index.html'); await hostPage.waitForSelector('.icon', { timeout: 20000 });
  const fid = await mmId(hostPage);
  check('My Media seeded', !!fid, fid);
  await hostPage.goto(BASE + '/run.html#id=' + fid);
  await hostPage.waitForSelector('iframe', { timeout: 15000 });
  await ackPerms(hostPage);
  const hostFr = hostPage.frameLocator('iframe');
  await hostFr.locator('#grid, #empty').first().waitFor({ timeout: 8000 }).catch(() => {});
  // Store one "video" (real bytes) and mark visible — exactly what the app does.
  const stored = await hostFr.locator('body').evaluate(async () => {
    const bytes = new Uint8Array([9, 8, 7, 6, 5, 250, 251, 252, 253, 254]);
    await window.gifos.db('blobs').put({ id: 'vid1', bytes });
    await window.gifos.db('media').put({ id: 'vid1', name: 'clip', type: 'video', mime: 'video/webm', size: bytes.length, at: Date.now(), thumb: '' });
    await window.gifos.db('media').setVisibility('vid1', 'read-only');
    await window.gifos.db('blobs').setVisibility('vid1', 'read-only');
    const m = await window.gifos.db('media').getAll();
    const b = await window.gifos.db('blobs').get('vid1');
    return { media: m.map((r) => ({ id: r.id, vis: r._vis })), blobHasBytes: !!(b && b.bytes), blobLen: b && b.bytes && b.bytes.length };
  });
  check('host stored + marked the video read-only', JSON.stringify(stored.media) === '[{"id":"vid1","vis":"read-only"}]', JSON.stringify(stored));

  // ---- host mints invite ----
  await hostPage.locator('#host').click();
  await hostPage.waitForSelector('#inv-go', { timeout: 6000 });
  await hostPage.locator('#inv-go').click();
  await hostPage.waitForSelector('#lm-url', { timeout: 15000 }).catch(() => {});
  const link = await hostPage.locator('#lm-url').inputValue().catch(() => '');
  check('minted invite', /#s=|#j=/.test(link || ''), (link || '').slice(0, 36));
  await hostPage.evaluate(() => { const m = document.getElementById('link-modal'); if (m) m.remove(); });

  // ---- guest joins → My Media mounts ----
  const guestCtx = await makeUser('Ben');
  const guestPage = await guestCtx.newPage();
  guestPage.on('pageerror', (e) => console.log('  [guest pageerror] ' + e.message));
  await guestPage.goto(BASE + '/index.html'); await guestPage.waitForSelector('.icon', { timeout: 20000 });
  await guestPage.goto(link); await dismissName(guestPage);
  await ackPerms(guestPage);
  await guestPage.waitForSelector('iframe', { timeout: 15000 });
  const guestFr = guestPage.frameLocator('iframe');
  await sleep(1500); // first mirror + subscribe

  // THE POINT: does the guest see the visible video, and can it load the bytes?
  const g = await guestFr.locator('body').evaluate(async () => {
    const m = await window.gifos.db('media').getAll();
    const b = await window.gifos.db('blobs').get('vid1').catch((e) => ({ err: String(e && e.message || e) }));
    return {
      mediaIds: (m || []).map((r) => r.id),
      cardShows: (m || []).some((r) => r.id === 'vid1'),
      blobHasBytes: !!(b && b.bytes),
      blobIsU8: !!(b && b.bytes instanceof Uint8Array),
      blobLen: b && b.bytes && b.bytes.length,
      blobErr: b && b.err,
    };
  });
  check('GUEST sees the visible media item in the library', g.cardShows, JSON.stringify(g.mediaIds));
  check('GUEST can load the shared video bytes (real Uint8Array)', g.blobHasBytes && g.blobIsU8 && g.blobLen === 10, JSON.stringify(g));

  await hostCtx.close(); await guestCtx.close();
  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAIL') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e && e.message || e); process.exit(2); });
