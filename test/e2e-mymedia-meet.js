// Repro: share My Media INSIDE A MEETING, mark a video visible — does the other
// participant see + load it? (The invite path works; the user hit this in a
// meeting.) Needs RELAY + BASE.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const setup = (name) => ({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
  const newUser = async (name) => { const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] }); await ctx.addInitScript(setup(name)); return ctx; };

  // ---- Host: desktop (to seed apps) → find My Media → open a meeting ----
  const aCtx = await newUser('Ada');
  const aDesk = await aCtx.newPage();
  aDesk.on('pageerror', (e) => console.log('  [a desk] ' + e.message));
  await aDesk.goto(BASE + '/index.html'); await aDesk.waitForSelector('.icon', { timeout: 20000 });
  const mmId = await aDesk.evaluate(async () => { const f = (await GifOS.store.allFiles()).find((x) => x.appId === 'mymedia'); return f ? f.id : null; });
  check('My Media seeded', !!mmId, mmId);

  const aMeet = await aCtx.newPage();
  aMeet.on('pageerror', (e) => console.log('  [a meet] ' + e.message));
  await aMeet.goto(BASE + '/meet.html');
  await aMeet.locator('#lob-open').click();
  await aMeet.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 15000 });
  const link = await aMeet.evaluate(() => document.getElementById('share-url').value);

  // Host shares My Media into the meeting, then stores a video — but leaves it
  // PRIVATE for now (mark-visible happens live, after the guest is watching).
  await aMeet.evaluate((id) => window.__gifosVideo.runAppForTest(id, 'My Media'), mmId);
  await aMeet.waitForSelector('#appmount iframe', { timeout: 15000 });
  await sleep(800);
  const aFr = aMeet.frameLocator('#appmount iframe');
  const VID_MB = Number(process.env.VID_MB || 1); // fast by default; set VID_MB=18 to exercise the transport cap (frag-size.js is the fast guard for that)
  const host = await aFr.locator('body').evaluate(async (el, mb) => {
    const info = await window.gifos.info();
    const n = Math.round(mb * 1024 * 1024);
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i += 7919) bytes[i] = (i * 31) & 255; // sparse fill, distinctive
    bytes[0] = 42; bytes[n - 1] = 99;
    await window.gifos.db('blobs').put({ id: 'vid1', bytes });
    await window.gifos.db('media').put({ id: 'vid1', name: 'clip', type: 'video', mime: 'video/webm', size: n, at: Date.now(), thumb: '' });
    const m = await window.gifos.db('media').getAll();
    return { owner: info && info.owner, media: m.map((r) => ({ id: r.id, vis: r._vis || 'private' })), n };
  }, VID_MB);
  check('host stored the ' + VID_MB + 'MB video (still private)', host.owner === true && host.media.length === 1 && host.media[0].vis === 'private', JSON.stringify(host.media) + ' bytes=' + host.n);

  // ---- Guest joins the meeting; My Media auto-mounts for them ----
  const bCtx = await newUser('Ben');
  const bMeet = await bCtx.newPage();
  bMeet.on('pageerror', (e) => console.log('  [b meet] ' + e.message));
  await bMeet.goto(link);
  await bMeet.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.liveLinks() >= 1, null, { timeout: 25000 });
  const mounted = await bMeet.waitForSelector('#appmount iframe', { timeout: 25000 }).then(() => true).catch(() => false);
  check('guest auto-mounted the shared My Media', mounted);
  await sleep(1800); // mesh + subscribe settle
  const bFr = bMeet.frameLocator('#appmount iframe');

  const readGuest = () => bFr.locator('body').evaluate(async () => {
    const m = await window.gifos.db('media').getAll().catch((e) => ({ err: String(e && e.message || e) }));
    const b = await window.gifos.db('blobs').get('vid1').catch((e) => ({ err: String(e && e.message || e) }));
    return { ids: Array.isArray(m) ? m.map((r) => r.id) : ('ERR:' + (m && m.err)), shows: Array.isArray(m) && m.some((r) => r.id === 'vid1'),
      blobIsU8: !!(b && b.bytes instanceof Uint8Array), blobLen: b && b.bytes && b.bytes.length, blobErr: b && b.err };
  });

  // Private video: the guest must NOT see it yet.
  const before = await readGuest();
  check('guest does NOT see the still-private video', !before.shows, JSON.stringify(before));

  // NOW the host marks it visible while the guest is watching (the real flow).
  await aFr.locator('body').evaluate(async () => {
    await window.gifos.db('media').setVisibility('vid1', 'read-only');
    await window.gifos.db('blobs').setVisibility('vid1', 'read-only');
  });
  await sleep(2000); // db-change should reach the guest and refresh its library

  const g = await readGuest();
  check('GUEST (meeting) sees the video once marked visible LIVE', g.shows, JSON.stringify({ ids: g.ids, shows: g.shows }));
  check('GUEST (meeting) can load the whole ' + VID_MB + 'MB video over the mesh', g.blobIsU8 && g.blobLen === host.n, 'len=' + g.blobLen + ' want=' + host.n + (g.blobErr ? ' err=' + g.blobErr : ''));

  await aCtx.close(); await bCtx.close();
  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAIL') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e && e.message || e); process.exit(2); });
