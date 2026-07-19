// App-in-meeting GOVERNANCE e2e. The room principle under test:
//   anarchy is unavoidable in OPEN rooms (anyone runs/stops, deterministic
//   latest-wins so the room never splits, everything attributed, personal
//   Hide always available), and complete control in ADMIN rooms (admins run,
//   admins stop, admins may grant the 'app' right to a guest).
// Plus the LED-RECORDS fence: an app's manifest-declared record ids are
// writable only by the sharer while they lead — enforced in the sharer's own
// runtime, so no remote client can route around it.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
function check(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A minimal app whose 'ctl' collection is shared (read-write) and whose 'nav'
// record is LEADABLE — the sharer's Leading toggle flips it read-only, so only
// the leader may write it. Two buttons: one writes the leadable record, one a
// free record; #res reports the fate.
const LED_APP = {
  'manifest.json': JSON.stringify({
    gifos: '1.0', appId: 'ledtest', name: 'LedTest', entry: 'index.html',
    capabilities: { db: true, multiplayer: true },
    data: { ctl: { visibility: 'read-write' } },
    lead: [{ collection: 'ctl', id: 'nav' }],
  }),
  'index.html': '<!doctype html><meta charset="utf-8"><body>'
    + '<div id="nav">-</div><div id="res">-</div>'
    + '<button id="setnav">nav</button><button id="setfree">free</button>'
    + '<script>'
    + "const db = gifos.db('ctl');"
    + "db.subscribe(items => { const n = items.find(x => x.id === 'nav'); document.getElementById('nav').textContent = n ? n.v : '-'; });"
    + "const res = (t) => { document.getElementById('res').textContent = t; };"
    + "document.getElementById('setnav').onclick = () => Promise.resolve(db.put({ id: 'nav', v: 'v' + Math.floor(Math.random() * 1e6) })).then(() => res('ok-nav'), () => res('err-nav'));"
    + "document.getElementById('setfree').onclick = () => Promise.resolve(db.put({ id: 'free', v: 'f' })).then(() => res('ok-free'), () => res('err-free'));"
    + '</scr' + 'ipt>',
};

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const setup = (name) => ({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
  const newUser = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript(setup(name));
    return ctx;
  };
  const seedApp = (page) => page.evaluate(async (files) => {
    const bytes = await GifOS.gif.encode(files, {});
    const fileId = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fileId, name: 'LedTest.gif', bytes, kind: 'gif', isApp: true, appId: 'ledtest', mime: 'image/gif' });
    return fileId;
  }, LED_APP);
  const appFrame = (page) => page.frameLocator('#appmount iframe');
  const winner = (page) => page.evaluate(() => window.__gifosVideo.appWinner());
  // The app iframe is an opaque origin (sandbox) — the page can't reach its
  // document, but Playwright can. Poll #res through the frame locator.
  const waitRes = async (pg, want, ms = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const v = await appFrame(pg).locator('#res').textContent().catch(() => '-');
      if (v === want) return v;
      await sleep(300);
    }
    return appFrame(pg).locator('#res').textContent().catch(() => '-');
  };

  // ========================= OPEN ROOM: ANARCHY, ORDERED =========================
  const room = 'gov' + Math.floor(Math.random() * 1e9).toString(36);
  const A = await newUser('Ada'); const aPage = await (A).newPage();
  aPage.on('pageerror', (e) => console.log('  [a pageerror]', e.message));
  await aPage.goto(BASE + '/meet.html#v=' + room);
  await aPage.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 45000 }); // meeting boot is CPU-heavy under a saturated box
  const B = await newUser('Ben'); const bPage = await B.newPage();
  bPage.on('pageerror', (e) => console.log('  [b pageerror]', e.message));
  await bPage.goto(BASE + '/meet.html#v=' + room);
  const C = await newUser('Cyd'); const cPage = await C.newPage();
  cPage.on('pageerror', (e) => console.log('  [c pageerror]', e.message));
  await cPage.goto(BASE + '/meet.html#v=' + room);
  for (const pg of [aPage, bPage, cPage]) await pg.waitForFunction(() => window.__gifosVideo.participants() >= 3, null, { timeout: 40000 });

  // A shares; everyone mounts
  const aFile = await seedApp(aPage);
  await aPage.evaluate((id) => window.__gifosVideo.runAppForTest(id, 'LedTest'), aFile);
  for (const pg of [aPage, bPage, cPage]) await pg.waitForFunction(() => window.__gifosVideo.appActive(), null, { timeout: 20000 });
  const sidA = await winner(aPage);
  check('open room: anyone can share; everyone mounts it', !!sidA);

  // B shares later — LATEST WINS deterministically, everywhere, no split
  await sleep(50); // strictly newer ts
  const bFile = await seedApp(bPage);
  await bPage.evaluate((id) => window.__gifosVideo.runAppForTest(id, 'LedTest'), bFile);
  await bPage.waitForFunction(() => window.__gifosVideo.appIsHost(), null, { timeout: 20000 });
  const sidB = await winner(bPage);
  for (const pg of [aPage, bPage, cPage]) {
    await pg.waitForFunction((sid) => window.__gifosVideo.appWinner() === sid, sidB, { timeout: 20000 });
  }
  check('open room: a newer share wins EVERYWHERE (deterministic, no split)', sidB && sidB !== sidA);
  await aPage.waitForFunction(() => !window.__gifosVideo.appIsHost(), null, { timeout: 20000 });
  check('the outbid sharer withdrew cleanly (now a client of the winner)', true);

  // C (not the sharer) stops the app for the whole room — attributed anarchy
  await cPage.evaluate(() => window.__gifosVideo.stopRoomAppForTest());
  for (const pg of [aPage, bPage, cPage]) await pg.waitForFunction(() => !window.__gifosVideo.appActive(), null, { timeout: 20000 });
  check('open room: ANYONE can stop the shared app for everyone', true);

  // ...and it is reversible: the sharer re-shares and walks back in
  await bPage.evaluate((id) => window.__gifosVideo.runAppForTest(id, 'LedTest'), bFile);
  for (const pg of [aPage, bPage, cPage]) await pg.waitForFunction(() => window.__gifosVideo.appActive(), null, { timeout: 20000 });
  check('a stop is reversible — the sharer re-shares past the tombstone', true);

  // C hides it personally; the rest keep it; Show brings it back
  await cPage.locator('#apphide').click();
  await cPage.waitForFunction(() => !window.__gifosVideo.appActive(), null, { timeout: 10000 });
  check('Hide clears the app on MY screen only', await bPage.evaluate(() => window.__gifosVideo.appActive()));
  check('the Run-app button turns into "Show app" while hidden', (await cPage.locator('#appbtn').textContent()) === 'Show app');
  await cPage.locator('#appbtn').click();
  await cPage.waitForFunction(() => window.__gifosVideo.appActive(), null, { timeout: 10000 });
  check('Show app un-hides it', true);

  // ---- LED RECORDS: communal by default in an open room ----
  await appFrame(cPage).locator('#setnav').click();
  check('open room defaults COMMUNAL — a guest can turn the page', (await waitRes(cPage, 'ok-nav')) === 'ok-nav');

  // Sharer flips to LEADING: the guest's led write is refused by the HOST runtime
  await bPage.locator('#applead').click();
  check('the sharer sees the Leading state', await bPage.evaluate(() => window.__gifosVideo.appLeading()));
  await sleep(300);
  await appFrame(cPage).locator('#setnav').click();
  check('LEADING: a guest\'s write to the led record is refused', (await waitRes(cPage, 'err-nav')) === 'err-nav');
  await appFrame(cPage).locator('#setfree').click();
  check('…but non-led records stay writable (only the cursor is fenced)', (await waitRes(cPage, 'ok-free')) === 'ok-free');
  await bPage.locator('#applead').click(); // back to communal
  await sleep(300);
  await appFrame(cPage).locator('#setnav').click();
  check('back to communal — the guest drives again', (await waitRes(cPage, 'ok-nav')) === 'ok-nav');

  await aPage.close(); await bPage.close(); await cPage.close();

  // ========================= ADMIN ROOM: FULL CONTROL =========================
  const admRoom = 'govadm' + Math.floor(Math.random() * 1e9).toString(36);
  const D = await newUser('Dana'); const dPage = await D.newPage();
  dPage.on('pageerror', (e) => console.log('  [d pageerror]', e.message));
  await dPage.goto(BASE + '/meet.html');
  // derive the admin key + verifier exactly like the lobby does, and stash the
  // key so Dana arrives as the signed-in admin
  const av = await dPage.evaluate(async (roomId) => {
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode('hunter2!'), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode('gifos-admin:' + roomId), iterations: 310000 }, km, 256);
    const K = Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, '0')).join('');
    // V commits to the PUBLIC key K seeds (meet-security §SIG), NOT to K
    // itself — derive it exactly as the lobby's createAdminRoom does, or
    // adoptAdmKey rejects the key and amAdmin never arms.
    const V = (await window.GifOS.net.edKeysFromSeedHex(K)).verifier;
    localStorage.setItem('gifos_vadm_' + roomId + '.' + V, K);
    return V;
  }, admRoom);
  await dPage.goto(BASE + '/meet.html#v=' + admRoom + '&av=' + av);
  await dPage.reload(); // hash-only navigation doesn't re-boot the page
  // 45s: admin boot = meeting boot + a 310k-round PBKDF2 + Ed25519 key
  // adoption, CPU-heavy and slow on a saturated shared box.
  await dPage.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.amAdmin(), null, { timeout: 45000 });
  check('admin room up; Dana is its admin', true);

  const E = await newUser('Eve'); const ePage = await E.newPage();
  ePage.on('pageerror', (e) => console.log('  [e pageerror]', e.message));
  await ePage.goto(BASE + '/meet.html#v=' + admRoom + '&av=' + av);
  for (const pg of [dPage, ePage]) await pg.waitForFunction(() => window.__gifosVideo.participants() >= 2, null, { timeout: 40000 });

  // Guest may NOT run an app
  check('guest cannot run apps in an admin room', !(await ePage.evaluate(() => window.__gifosVideo.canRunApp())));
  const eFile = await seedApp(ePage);
  await ePage.evaluate((id) => window.__gifosVideo.runAppForTest(id, 'LedTest'), eFile);
  await sleep(2500);
  check('a guest share attempt puts nothing on anyone\'s stage', !(await dPage.evaluate(() => window.__gifosVideo.appActive())) && !(await ePage.evaluate(() => window.__gifosVideo.appActive())));

  // Admin shares — and LEADS by default in an admin room
  const dFile = await seedApp(dPage);
  await dPage.evaluate((id) => window.__gifosVideo.runAppForTest(id, 'LedTest'), dFile);
  for (const pg of [dPage, ePage]) await pg.waitForFunction(() => window.__gifosVideo.appActive(), null, { timeout: 20000 });
  check('an admin\'s app mounts for everyone', true);
  check('admin rooms default to the sharer LEADING', await dPage.evaluate(() => window.__gifosVideo.appLeading()));
  await sleep(500);
  await appFrame(ePage).locator('#setnav').click();
  check('guest cannot move the led record under an admin leader', (await waitRes(ePage, 'err-nav')) === 'err-nav');

  // GRANT: the admin gives Eve the app right → Eve can now share (and wins as newest)
  const ePid = await ePage.evaluate(() => sessionStorage.getItem('gifos_vpeer_' + window.__gifosVideo.room() + '.' + window.__gifosVideo.verifier()));
  await dPage.evaluate((pid) => window.__gifosVideo.grantApp(pid, true), ePid);
  await ePage.waitForFunction(() => window.__gifosVideo.canRunApp(), null, { timeout: 15000 });
  check('an admin grant lets the guest run apps', true);
  await sleep(50);
  await ePage.evaluate((id) => window.__gifosVideo.runAppForTest(id, 'LedTest'), eFile);
  await ePage.waitForFunction(() => window.__gifosVideo.appIsHost(), null, { timeout: 20000 });
  const eSid = await winner(ePage);
  await dPage.waitForFunction((sid) => window.__gifosVideo.appWinner() === sid, eSid, { timeout: 20000 });
  check('the granted guest\'s share is honored room-wide', true);

  // Admin stops the guest's app for the room
  await dPage.evaluate(() => window.__gifosVideo.stopRoomAppForTest());
  for (const pg of [dPage, ePage]) await pg.waitForFunction(() => !window.__gifosVideo.appActive(), null, { timeout: 20000 });
  check('an admin stops any app for the whole room', true);

  // REVOKE: grant off → the guest's fresh share is ignored by everyone
  await dPage.evaluate((pid) => window.__gifosVideo.grantApp(pid, false), ePid);
  await ePage.waitForFunction(() => !window.__gifosVideo.canRunApp(), null, { timeout: 15000 });
  await ePage.evaluate((id) => window.__gifosVideo.runAppForTest(id, 'LedTest'), eFile);
  await sleep(2500);
  check('a revoked guest cannot share again', !(await dPage.evaluate(() => window.__gifosVideo.appActive())));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
