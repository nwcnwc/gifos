// THE HOUSE MUST ASSEMBLE, SPEAK, AND KEEP YOUR PLACE — IN THE REAL SANDBOX.
//
// Every check here is a regression guard for a measured, shipped failure:
//
//  - The intro deadline guards the two boot wedges of 2026-08-24: the vendor
//    CSS preloader's catastrophic regex over a data-URI-baked CSSOM (minutes
//    of 100% CPU with every timer dead), and the 24 MB of base64 art inlined
//    into the app document that fed it. Art now rides .assets/; if either
//    comes back, the intro misses the deadline.
//  - The sound checks guard the SM2 replacement: the vendored 2011 SM2 could
//    not createSound without Flash (null._createSound), thrown INSIDE the
//    held onready handlers — which also aborted the vendor boot chain. The
//    house was silent from the day the port landed, and a sound object that
//    exists is not enough: the clock must ADVANCE.
//  - The locked-door check guards the whole walk→arrive→action chain (and
//    documents that room 1's door is locked BY DESIGN — a playtester read it
//    as a dead end; the guard proves the "Locked!" feedback fires).
//  - The glow hit-test guards pointer-events on the 587×562 z-999 halo that
//    ate the items-tray click at the exact moment the game first shows it.
//  - The save round-trip is the port's reason to exist: the file is the save.
//
// Needs BASE only (no relay — solo app).
const { readFileSync } = require('fs');
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d ? '  (' + d + ')' : '')); if (!c) failures++; };

(async () => {
  const GIF_B64 = readFileSync(appGif('the-house')).toString('base64');
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext();

  const desk = await ctx.newPage();
  desk.on('pageerror', (e) => console.log('  [desk err] ' + e.message.slice(0, 160)));
  await desk.goto(BASE + '/index.html');
  await desk.waitForSelector('.icon', { timeout: 30000 });
  const fileId = await desk.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'The House.gif', bytes, kind: 'gif', isApp: true, appId: 'the-house', mime: 'image/gif' });
    return fid;
  }, GIF_B64);
  await desk.close();

  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [app err] ' + e.message.slice(0, 160)));
  const t0 = Date.now();
  await page.goto(BASE + '/run.html#id=' + fileId);
  const fl = page.frameLocator('#appmount iframe');
  await fl.locator('#intro').waitFor({ state: 'attached', timeout: 30000 });
  await fl.locator('#enter').waitFor({ timeout: 30000 });
  check('intro is up within 30 s of launch (the assembling wedges stay dead)', true, (Date.now() - t0) + 'ms');

  const cardGone = await fl.locator('body').evaluate(() =>
    !document.getElementById('house-boot') || document.getElementById('house-boot').classList.contains('gone'));
  check('the boot gauge leaves when the intro arrives', cardGone);

  let blackGone = false;
  for (let i = 0; i < 40 && !blackGone; i++) {
    await page.waitForTimeout(500);
    blackGone = await fl.locator('body').evaluate(() => !document.getElementById('black'));
  }
  check('the vendor preload curtain lifts (no CSSOM scrape, no stuck overlay)', blackGone);

  const snd = await fl.locator('body').evaluate(() => {
    const sm = window.soundManager;
    const s = sm && sm.getSoundById && sm.getSoundById('room');
    return { ok: !!(sm && sm.ok && sm.ok()), url: s ? String(s.url).slice(0, 5) : '' };
  });
  check('soundManager is the working HTML5 shim, room sound on a blob', snd.ok && snd.url === 'blob:', JSON.stringify(snd));

  await fl.locator('#enter').click();
  await fl.locator('#room #note').waitFor({ timeout: 30000 });
  check('Enter reaches the first room; the note hotspot exists', true);

  // let the walk-in scene fully release input: no lock, no cloud, no dialogue
  {
    let quiet = 0;
    const s0 = Date.now();
    while (quiet < 2000 && Date.now() - s0 < 45000) {
      const busy = await fl.locator('body').evaluate(() =>
        !!(document.getElementById('no_click') || document.querySelector('.text_cloud') || document.getElementById('dialogue_box'))).catch(() => true);
      if (busy) quiet = 0; else quiet += 400;
      await page.waitForTimeout(400);
    }
  }

  await page.waitForTimeout(1200);
  const playing = await fl.locator('body').evaluate(async () => {
    const s = window.soundManager.getSoundById('room');
    if (!s || !s._el) return null;
    const t1 = s._el.currentTime;
    await new Promise((r) => setTimeout(r, 600));
    return { paused: s._el.paused, moved: s._el.currentTime - t1 };
  });
  check('room ambience is audibly running (the clock advances)', !!(playing && !playing.paused && playing.moved > 0.2), JSON.stringify(playing));

  // locked door: walk arrives AND the refusal is announced
  await fl.locator('#door_exit').click();
  let cloud = '';
  const d0 = Date.now();
  while (Date.now() - d0 < 15000 && !/Locked/i.test(cloud)) {
    cloud = await fl.locator('body').evaluate(() => {
      const c = document.querySelector('.text_cloud');
      return c ? c.textContent : '';
    }).catch(() => '');
    if (!/Locked/i.test(cloud)) await page.waitForTimeout(300);
  }
  check('the locked door says "Locked!" (walk→arrive→action fires)', /Locked/i.test(cloud), JSON.stringify(cloud));

  // pick up the note, then the tray must be clickable — the glow may not eat it
  await fl.locator('#room #note').click().catch(() => {});
  await page.waitForTimeout(4000);
  await fl.locator('.close').first().click().catch(() => {});
  await page.waitForTimeout(500);
  const hit = await fl.locator('body').evaluate(() => {
    const b = document.getElementById('button');
    if (!b) return { no: 'button' };
    const r = b.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { hit: el ? (el.id || el.tagName) : 'none' };
  });
  check('the items button wins its own hit-test (the glow is click-transparent)', hit.hit === 'button' || hit.hit === 'items', JSON.stringify(hit));
  await fl.locator('#items #button').click().catch(() => {});
  await page.waitForTimeout(1200);
  const trayOpen = await fl.locator('body').evaluate(() => {
    const items = document.getElementById('items');
    return items ? getComputedStyle(items).top : null;
  });
  check('clicking the tray opens it', trayOpen === '0px', JSON.stringify(trayOpen));

  const inv = await fl.locator('body').evaluate(() => ({ collected: (window.collected || []).slice(), is_in: $.jStorage.get('is_in') }));
  check('the note is collected and the room is the saved place', inv.is_in === 'room' && inv.collected.indexOf('note') !== -1, JSON.stringify(inv));

  // the file is the save: a reload resumes IN the room, note in hand
  await page.waitForTimeout(1000); // let the debounced persist land
  await page.reload();
  const fl2 = page.frameLocator('#appmount iframe');
  await fl2.locator('#room').waitFor({ state: 'attached', timeout: 30000 });
  await page.waitForTimeout(1500);
  const resumed = await fl2.locator('body').evaluate(() => ({ is_in: $.jStorage.get('is_in'), n: (window.collected || []).length }));
  check('reopen resumes in the room with the note (the file is the save)', resumed.is_in === 'room' && resumed.n >= 1, JSON.stringify(resumed));

  await browser.close();
  if (failures) { console.log('\n' + failures + ' FAILURE(S)'); process.exit(1); }
  console.log('\nALL PASS');
})().catch((e) => { console.error(e); process.exit(1); });
