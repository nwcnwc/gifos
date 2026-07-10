// The Meeting front door (lobby). A COLD open — the desktop icon → bare
// meet.html, no room and no app in the URL — no longer dumps you into a random
// room with the camera already on. It shows a lobby that asks your intent:
//   * Start a meeting (open, random id)   * Start a room you run (name+password)
//   * Join a link (paste a URL or id)     * Recent & saved (history + bookmarks)
// The camera starts only once you pick something. A real link (#v=) skips it.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; };

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  // One context so localStorage (history + bookmarks) is shared across pages.
  const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
  await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','Nia')}catch(e){}" });
  const coldOpen = async (label) => {
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => console.log('  [' + label + ' pageerror]', e.message));
    await pg.goto(BASE + '/meet.html');
    await pg.waitForSelector('#lobby.show', { timeout: 10000 });
    return pg;
  };

  // ---- 1. cold open shows the lobby, camera deferred ---------------------------
  const p1 = await coldOpen('p1');
  check('a cold open shows the lobby (not a room)', await p1.locator('#lobby.show').isVisible());
  check('no room is joined yet at the lobby', (await p1.evaluate(() => window.__gifosVideo.room())) === null);
  check('the camera has NOT started at the lobby (no tiles)',
    (await p1.evaluate(() => document.querySelectorAll('#grid .tile').length)) === 0);
  check('the lobby offers all four intents',
    (await p1.locator('#lob-open').isVisible()) && (await p1.locator('#lob-admin-btn').isVisible()) &&
    (await p1.locator('#lob-join-btn').isVisible()) && (await p1.locator('#lob-list').count()) === 1);

  // ---- 2. Start a meeting → a fresh OPEN room ----------------------------------
  await p1.locator('#lob-open').click();
  await p1.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 15000 });
  const openRoom = await p1.evaluate(() => window.__gifosVideo.room());
  check('"Start a meeting" drops you into a fresh open room', !!openRoom && !(await p1.evaluate(() => window.__gifosVideo.hasAdmin())));
  check('the open room now has a share link', /#v=|\/meet\//.test(await p1.locator('#share-url').inputValue()));

  // ---- 3. Start a room you run → an ADMIN room, named right there ---------------
  const p2 = await coldOpen('p2');
  const adminName = 'club' + Math.floor(Math.random() * 1e6).toString(36);
  await p2.locator('#lob-admin-btn').click();
  await p2.locator('#lob-admin-name').fill(adminName);
  await p2.locator('#lob-admin-pass').fill('greenroom-topsecret');
  await p2.locator('#lob-admin-go').click();
  await p2.waitForURL(new RegExp('v=' + adminName + '&k=' + adminName + '&av=[a-f0-9]{24}'), { timeout: 20000 });
  await p2.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.amAdmin(), null, { timeout: 15000 });
  check('"Start a room you run" mints a NAMED admin room, you as admin',
    (await p2.evaluate(() => window.__gifosVideo.room())) === adminName);

  // ---- 4. Recent & saved remembers both (started counts, not just joined) ------
  const p3 = await coldOpen('p3');
  check('both meetings I started show up in Recent',
    (await p3.locator('#lob-list .lob-item').count()) >= 2);
  check('the admin room I made is badged as admin in the list',
    await p3.locator('.lob-item', { hasText: adminName }).locator('.li-badge').isVisible());

  // ---- 5. Join a link accepts a bare id ----------------------------------------
  const typed = 'lobby' + Math.floor(Math.random() * 1e6).toString(36);
  await p3.locator('#lob-join-btn').click();
  await p3.locator('#lob-join-in').fill(typed);
  await p3.locator('#lob-join-go').click();
  await p3.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 15000 });
  check('"Join a link" accepts a bare meeting id and lands there',
    (await p3.evaluate(() => window.__gifosVideo.room())) === typed && !(await p3.evaluate(() => window.__gifosVideo.hasAdmin())));

  // ---- 6. Bookmarks persist ----------------------------------------------------
  const p4 = await coldOpen('p4');
  await p4.locator('.lob-item', { hasText: adminName }).locator('.lob-star').click();
  // after starring, a fresh cold open still shows it, now filled-in (★)
  const p5 = await coldOpen('p5');
  const star = await p5.locator('.lob-item', { hasText: adminName }).locator('.lob-star').textContent();
  check('a bookmarked meeting persists, shown starred (★), on the next visit', (star || '').includes('★'));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
