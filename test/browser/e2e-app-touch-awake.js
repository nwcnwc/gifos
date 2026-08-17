// e2e-app-touch-awake.js — PLAYING AN APP IS NOT PUTTING THE PHONE DOWN.
//
// run.html parks a phone that has gone three minutes with no touch and no
// speech: it releases the screen wake lock and floors the send quality, on the
// reasoning that nobody is holding it. The two listeners that feed that clock
// are on run.html's OWN document — and DOM events do not cross a document
// boundary, so every touch on a running app lands inside the app's iframe and
// none of it ever reaches them.
//
// So somebody playing a game on their phone was judged to have put it down.
// Measured 2026-08-17, mid-deathmatch on a real phone, with a person's thumb
// on the glass: "😴 Phone looks parked — letting the screen rest."
//
// The signal already existed and nobody was listening. runtime.js's shim pings
// the container as `uiactive` on interaction (it is how the Back trap arms
// under fresh activation); it fired ONCE per mount and only the back trap read
// it. It now repeats, throttled at the source, and run.html counts it as
// activity for exactly this clock.
//
// THE PRECONDITION IS ASSERTED FIRST, twice over, because this suite has two
// ways to pass while proving nothing: on a machine that does not look like a
// phone the park never arms at all, and if the backdated clock never parks
// the page there is no state for a touch to clear. Both are checked, and both
// fail loudly rather than skipping.
//
// One box is enough — every question here is "what state is this page in".
// Needs: static server on 8099, local relay on 8790.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
// run.html re-reads the clock every 10s, so every wait here is several ticks.
const SETTLE_MS = 25000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + d + ')' : '')); if (!c) failures++; };

// A phone, as the page decides one: IS_MOBILE reads userAgentData.mobile or
// the UA string. Playwright's isMobile is a viewport/touch thing and says
// nothing about either, so the UA is what has to be set.
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; moto g24) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36';

// The smallest app that can be touched. Nothing here is under test but the
// container's clock, so the app is one div: an app with its own machinery
// would just be somewhere else for a failure to hide.
const APP_HTML = '<!doctype html><meta charset="utf-8">'
  + '<div id="pad" style="width:100%;height:100%;background:#246">tap me</div>';
const MANIFEST = JSON.stringify({ gifos: '1.0', appId: 'touch-awake', name: 'Touch Awake',
  entry: 'index.html', capabilities: { db: true } });

const idleOf = (page) => page.evaluate(() => {
  const V = window.__gifosVideo; if (!V || !V.powTier) return null;
  const t = V.powTier(); return { idle: t.idle, mobile: t.mobile };
}).catch(() => null);

const waitIdle = async (page, want, ms) => {
  const dl = Date.now() + ms;
  while (Date.now() < dl) {
    const t = await idleOf(page);
    if (t && (t.idle === 3) === want) return true;
    await sleep(2000);
  }
  return false;
};

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream',
           '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'], userAgent: PHONE_UA });
    await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');"
      + "localStorage.setItem('gifos_name','Mo')}catch(e){}" });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('  [page] ' + e.message.slice(0, 160)));

    await page.goto(BASE + '/run.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.GifOS && window.GifOS.runtime && window.GifOS.store,
      null, { timeout: 60000 });
    const fid = await page.evaluate(async (a) => {
      const bytes = await GifOS.gif.encode({ 'manifest.json': a.manifest, 'index.html': a.html });
      const id = GifOS.store.uid('file');
      await GifOS.store.putFile({ id: id, name: 'Touch Awake.gif', bytes, kind: 'gif',
        isApp: true, appId: 'touch-awake', mime: 'image/gif' });
      return id;
    }, { manifest: MANIFEST, html: APP_HTML });

    // THE ROOM, not a solo run: the parked-phone clock lives with the media
    // plane, and this is the shape the failure was measured in — a phone in a
    // room with an app on the screen.
    await page.locator('#lob-open').click();
    await page.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 45000 });
    await page.evaluate((id) => window.__gifosVideo.runAppForTest(id, 'Touch Awake'), fid);
    await page.waitForFunction(() => !!document.querySelector('#appmount iframe'), null, { timeout: 60000 });
    // The shim has to be alive inside the frame, or the ping this whole suite
    // is about could never be sent and every result below would be about a
    // frame that never loaded.
    const appFrame = await (async () => {
      const dl = Date.now() + 60000;
      while (Date.now() < dl) {
        for (const f of page.frames()) {
          if (f === page.mainFrame()) continue;
          if (await f.evaluate(() => !!(window.gifos && document.getElementById('pad'))).catch(() => false)) return f;
        }
        await sleep(1000);
      }
      return null;
    })();
    check('the app is mounted and its shim is alive', !!appFrame);
    if (!appFrame) throw new Error('no app frame — nothing below could mean anything');

    const first = await idleOf(page);
    check('this page believes it is a phone — the park is armed at all',
      !!first && first.mobile === 2, JSON.stringify(first));

    /* ---- the damage: a clock that says nobody has touched this in minutes ---- */
    await page.evaluate(() => window.__gifosVideo.idleForTest(200000));
    const parked = await waitIdle(page, true, SETTLE_MS);
    check('a phone nobody has touched parks itself', parked, JSON.stringify(await idleOf(page)));

    /* ---- the repair: a touch INSIDE the app is a person ---- */
    // Dispatched on the app's own document, which is the only place a player's
    // thumb ever lands. It must reach the container by the shim's ping alone —
    // there is no other path, which is the entire point.
    await appFrame.evaluate(() => {
      document.getElementById('pad').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    const woke = await waitIdle(page, false, SETTLE_MS);
    check('...and a touch INSIDE the app tells the page somebody is holding it',
      woke, JSON.stringify(await idleOf(page)));

    // A ping the container merely heard is not the claim; the claim is that the
    // room went back to full quality for it.
    const after = await idleOf(page);
    check('...so the phone is out of its parked tier again',
      !!after && after.idle === 0, JSON.stringify(after));
  } finally {
    await browser.close();
  }
  console.log(failures ? '\nFAILURES: ' + failures : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
