// e2e-launch-args.js — A LINK MAY SAY WHAT TO OPEN AN APP ON.
//
// go.<key>=<value> on the opening link reaches the app as gifos.launch(). That
// is a URL that makes an app DO something on a stranger's first click, so the
// three rules that make it safe are the three things this suite exists to hold:
//
//   1. AN APP ONLY HEARS WHAT IT DECLARED. Keys outside the manifest's "launch"
//      block are dropped — a link cannot reach a knob the app never published.
//   2. NOTHING ARRIVES UNTIL SOMEONE SAYS YES. The consent sheet is the only
//      thing that can open the gate; "Just open it" and a dismissal both mean
//      no, and no is null, not "nothing happens and the app hangs waiting".
//   3. NO CHROME = NO DELIVERY. A mount with no permission sheet must FAIL
//      SHUT. This is the one that would rot silently: a page that forgot to
//      wire __gifosPermissions would otherwise grant a stranger's instruction
//      with nobody asked, and everything else here would still be green.
//
// Then the whole thing end to end, on the app it was built for: the real
// /?run=anyroad&go.at=…&go.fly=1 link, the real packed GIF, the real sheet —
// somebody who has never opened gifos.app clicks once, accepts once, and is
// flying. The world is served from the shared fixtures (test/lib/anyroad-
// fixtures.js), because a gate must not re-query donated map servers.
//
// Needs: static server on 8099 (python3 -m http.server 8099 -d site).
const { chromium, CHROME } = require('../lib/pw');
const { HOP, routeWorld } = require('../lib/anyroad-fixtures');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}

// A minimal app that does exactly one thing: report what its link said. It
// declares `msg` and nothing else, so `boom` is the undeclared key rule 1 is
// about. No capabilities and no network either — an app with nothing to
// acknowledge still has to get the sheet when a link is asking for something.
const FIXTURE = {
  manifest: {
    gifos: '1.0', appId: 'launchtest', name: 'LaunchTest', entry: 'index.html',
    capabilities: {},
    launch: { msg: { label: 'Show a message the link chose', detail: 'Only text on a page.' } },
  },
  html: '<!doctype html><meta charset="utf-8"><pre id="out">waiting</pre>' +
    '<script>gifos.launch().then(function(a){' +
    '  document.getElementById("out").textContent = "LAUNCH:" + JSON.stringify(a);' +
    '}, function(e){ document.getElementById("out").textContent = "ERR:" + e.message; });<\/script>',
};

// Install the fixture app on the desktop and return its fileId.
async function installFixture(page) {
  return page.evaluate(async (f) => {
    const bytes = await GifOS.gif.encode({
      'manifest.json': JSON.stringify(f.manifest),
      'index.html': f.html,
    });
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'LaunchTest.gif', bytes, kind: 'gif', isApp: true,
      appId: f.manifest.appId, mime: 'image/gif' });
    return fid;
  }, FIXTURE);
}

// Follow a link the way a person does — from somewhere else. Straight to the
// same URL twice is a SAME-DOCUMENT hash navigation: nothing reboots, the sheet
// never reopens, and the suite waits 20s for a mount that already happened.
async function follow(page, url) {
  await page.goto('about:blank');
  await page.goto(url);
}

// What the app ended up with, once it has answered.
async function launchResult(page) {
  const fr = page.frameLocator('iframe');
  await fr.locator('#out').waitFor({ timeout: 15000 });
  for (let i = 0; i < 60; i++) {
    const t = await fr.locator('#out').textContent();
    if (t && t !== 'waiting') return t;
    await sleep(250);
  }
  return await fr.locator('#out').textContent();
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });

  // ---- rules 1 and 2: declared-only, and only after a yes -------------------
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
    await page.goto(BASE + '/index.html');
    await page.waitForSelector('.icon', { timeout: 45000 });
    const fid = await installFixture(page);

    // A link that asks for one declared thing and one thing the app never
    // offered. The sheet must show the first and never mention the second.
    const link = BASE + '/run.html#id=' + fid + '&go.msg=hello%20there&go.boom=rm%20-rf';
    await follow(page, link);
    await page.waitForSelector('.perm-modal', { timeout: 20000 });
    const sheet = await page.locator('.perm-box').innerText();
    check('the sheet opens for a link-borne ask, on an app with no other abilities',
      /link you followed/i.test(sheet), sheet.split('\n')[0]);
    check('it says what the app declared, in the app\'s words',
      /Show a message the link chose/.test(sheet));
    check('it quotes the value the link chose', /hello there/.test(sheet));
    check('an undeclared key is never shown', !/boom|rm -rf/.test(sheet));
    check('there is a way to open the app WITHOUT doing what the link says',
      await page.locator('#perm-plain').count() === 1);

    // Decline. The app still runs; it just gets nothing.
    await page.locator('#perm-plain').click();
    check('declining resolves launch() as null, it does not hang',
      (await launchResult(page)) === 'LAUNCH:null');

    // Same link again, accepted this time.
    await follow(page, link);
    await page.waitForSelector('.perm-modal', { timeout: 20000 });
    await page.locator('#perm-go').click();
    const got = await launchResult(page);
    check('accepting delivers the declared argument', got === 'LAUNCH:{"msg":"hello there"}', got);
    check('the undeclared key never reaches the app', !/boom/.test(got), got);

    // A sheet that was answered once must ask again next time: the words are
    // different every time, so a stored acknowledgement cannot cover them.
    await follow(page, BASE + '/run.html#id=' + fid + '&go.msg=second%20link');
    await page.waitForSelector('.perm-modal', { timeout: 20000 });
    check('a second link asks again rather than riding the first yes',
      /second link/.test(await page.locator('.perm-box').innerText()));
    await page.locator('#perm-go').click();

    // …and an ordinary open — no go.* at all — must not show a sheet at all,
    // nor leave the app waiting on one.
    await follow(page, BASE + '/run.html#id=' + fid);
    check('an ordinary open resolves null with nothing asked',
      (await launchResult(page)) === 'LAUNCH:null');
    check('…and shows no sheet', await page.locator('.perm-modal').count() === 0);
    await context.close();
  }

  // ---- rule 3: no chrome to ask with = no delivery --------------------------
  {
    const context = await browser.newContext();
    // Make the permission hook permanently unavailable, the way a page that
    // never wired one up would look to the runtime. Non-configurable so the
    // real attach() cannot install over it.
    await context.addInitScript(() => {
      try {
        Object.defineProperty(window, '__gifosPermissions',
          { get: () => undefined, set: () => {}, configurable: false });
      } catch (e) {}
    });
    const page = await context.newPage();
    await page.goto(BASE + '/index.html');
    await page.waitForSelector('.icon', { timeout: 45000 });
    const fid = await installFixture(page);
    await follow(page, BASE + '/run.html#id=' + fid + '&go.msg=nobody%20asked');
    const got = await launchResult(page);
    check('with no sheet to ask with, the gate FAILS SHUT (null, not the value)',
      got === 'LAUNCH:null', got);
    await context.close();
  }

  // ---- the whole point: one link, one yes, and you are flying ---------------
  {
    const context = await browser.newContext();
    await routeWorld(context);
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

    // THE LINK A STRANGER CLICKS. A catalog slug (not a 60-character URL to a
    // GIF), the place, and the wings — nothing else, and no prior visit: this
    // browser has never seen gifos.app before this line.
    const AT = HOP.lat.toFixed(4) + ',' + HOP.lon.toFixed(4);
    await page.goto(BASE + '/index.html?run=anyroad&go.at=' + AT + '&go.fly=1');

    await page.waitForURL(/run\.html#id=/, { timeout: 60000 });
    check('the run-link resolves a catalog slug and lands in the runtime',
      /go\.at=/.test(page.url()) && /go\.fly=1/.test(page.url()), page.url());

    await page.waitForSelector('.perm-modal', { timeout: 30000 });
    const sheet = await page.locator('.perm-box').innerText();
    check('the sheet leads with what the link asked, in Anyroad\'s own words',
      /Open at a place the link picked/.test(sheet) && /aeroplane/i.test(sheet), sheet.slice(0, 120));
    check('…and still says what the app itself can reach', /overpass|internet/i.test(sheet));
    await page.locator('#perm-go').click();

    const fr = page.frameLocator('iframe');
    // Straight to the HUD: the landing sheet ("where do you want to go?") is
    // exactly what the link answered, so seeing it here would mean the ask was
    // dropped somewhere between the address bar and the app.
    await fr.locator('#hud').waitFor({ state: 'visible', timeout: 60000 });
    check('the pick-a-place sheet never had to be answered by hand',
      await fr.locator('#landing').isHidden());
    // The link hopped us: no preset was clicked, no search was typed.
    let hopped = false;
    for (let i = 0; i < 60 && !hopped; i++) {
      await sleep(500);
      hopped = await fr.locator('body').evaluate(() => !!(window.App && window.App.hasHopped()));
    }
    check('the link alone put a first-time visitor in the world', hopped);
    check('…at the place the link named',
      await fr.locator('body').evaluate(() => {
        const f = window.App && window.App.world && window.App.world.frame;
        return f ? f.lat0.toFixed(3) + ',' + f.lon0.toFixed(3) : '';
      }) === HOP.lat.toFixed(3) + ',' + HOP.lon.toFixed(3));

    // …and took off by itself, once the arrival finished dropping.
    let flying = false;
    for (let i = 0; i < 60 && !flying; i++) {
      await sleep(500);
      flying = await fr.locator('body').evaluate(() => !!(window.App && window.App.car() && window.App.car().flying));
    }
    check('the link alone put them IN THE AIR', flying);

    // The link is spent: a refresh must not re-install and re-fly.
    check('run= is stripped from the address bar', !/[?&]run=/.test(page.url()), page.url());

    // ---- and the app can MINT one: "Copy a link to here" -------------------
    // The round trip is the point. A share button whose output the app itself
    // will not accept is the most plausible way this rots, and it would rot
    // silently — the button would keep saying "Copied."
    await fr.locator('#btn-menu').click();
    await fr.locator('#share-field').waitFor({ state: 'visible', timeout: 10000 });
    const minted = await fr.locator('#share-url').inputValue();
    check('the button mints a link to where you actually are',
      minted.indexOf('?run=anyroad') > 0 && minted.indexOf('go.at=' + HOP.lat.toFixed(5) + ',' + HOP.lon.toFixed(5)) > 0,
      minted);
    check('…and carries the flying, because that is part of "here"', /go\.fly=1/.test(minted), minted);
    await context.close();

    // Follow what it minted — against this server, since the app always mints
    // the public gifos.app address (a sandbox has an opaque origin and cannot
    // know where it is running).
    const ctx2 = await browser.newContext();
    await routeWorld(ctx2);
    const p2 = await ctx2.newPage();
    await p2.goto(minted.replace('https://gifos.app/', BASE + '/'));
    await p2.waitForURL(/run\.html#id=/, { timeout: 60000 });
    await p2.waitForSelector('.perm-modal', { timeout: 30000 });
    await p2.locator('#perm-go').click();
    const fr2 = p2.frameLocator('iframe');
    await fr2.locator('#hud').waitFor({ state: 'visible', timeout: 60000 });
    let same = '';
    for (let i = 0; i < 60; i++) {
      await sleep(500);
      same = await fr2.locator('body').evaluate(() => {
        const f = window.App && window.App.world && window.App.world.frame;
        return window.App && window.App.hasHopped() && f ? f.lat0.toFixed(3) + ',' + f.lon0.toFixed(3) : '';
      });
      if (same) break;
    }
    check('a second person following that link arrives in the same place',
      same === HOP.lat.toFixed(3) + ',' + HOP.lon.toFixed(3), same);
    await ctx2.close();
  }

  // ---- the other half of the ask: a link that makes the computer TALK -------
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
    const MSG = 'Your lift is here.';
    await page.goto(BASE + '/index.html?run=offline-tts&go.say=' + encodeURIComponent(MSG));
    await page.waitForURL(/run\.html#id=/, { timeout: 60000 });
    await page.waitForSelector('.perm-modal', { timeout: 30000 });
    check('the sheet quotes the message before anything is spoken',
      (await page.locator('.perm-box').innerText()).includes(MSG));

    // THE MECHANISM, not the outcome: autoplay is delegated to this mount, so
    // the tap that answered the sheet is the gesture and no second tap is
    // needed. Asserting "did sound come out" would be asserting the box's
    // audio stack; asserting the policy is asserting ours.
    check('a link-carrying mount is allowed to make a sound without a second tap',
      /autoplay/.test(await page.locator('iframe').getAttribute('allow') || ''));
    await page.locator('#perm-go').click();

    const fr = page.frameLocator('iframe');
    await fr.locator('#linkcard').waitFor({ state: 'visible', timeout: 30000 });
    check('the app shows what it was asked to say',
      (await fr.locator('#linkmsg').textContent()).includes(MSG));
    let status = '';
    for (let i = 0; i < 80; i++) {
      status = (await fr.locator('#linkstatus').textContent()) || '';
      if (/Speaking|Ready to speak|⚠/.test(status)) break;
      await sleep(250);
    }
    // Either it is playing, or it is synthesised and one labelled tap away.
    // Both are the feature working; a warning is the engine having failed.
    check('the message is synthesised on the device, offline', /Speaking|Ready to speak/.test(status), status);
    check('…and the Try box is left holding it, to hear again or change',
      (await fr.locator('#text').inputValue()).includes(MSG));
    await context.close();
  }

  // ---- the SECOND tts provider takes the same link --------------------------
  // The neural one (KittenTTS Nano) speaks far better and cannot be made to
  // speak here: its voice is a 24 MB hash-pinned download, and a gate that
  // fetches model weights is a gate that fails when a model host has a bad day.
  // So this asserts the part that is ours — the ask reaches the app and the app
  // says what it was asked to say, BEFORE any synthesis is attempted — and
  // deliberately asserts nothing about the audio. It also keeps the 12 MB GIF
  // honest: an app that stopped mounting would fail right here.
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    const MSG = 'Dinner is ready.';
    await page.goto(BASE + '/index.html?run=offline-tts-neural&go.say=' + encodeURIComponent(MSG));
    await page.waitForURL(/run\.html#id=/, { timeout: 120000 });
    await page.waitForSelector('.perm-modal', { timeout: 60000 });
    check('the neural provider\'s sheet quotes the message too',
      (await page.locator('.perm-box').innerText()).includes(MSG));
    await page.locator('#perm-go').click();
    const fr = page.frameLocator('iframe');
    await fr.locator('#linkcard').waitFor({ state: 'visible', timeout: 60000 });
    check('the neural provider shows what the link asked it to say',
      (await fr.locator('#linkmsg').textContent()).includes(MSG));
    await context.close();
  }

  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILED' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL — suite crashed: ' + (e && e.stack || e)); process.exit(1); });
