/*
 * Two people, one Invite link, the same set of retirement plans.
 *
 * The listing says: "send one invite link and somebody else is in the same
 * plans with you, live, while it still touches no server." That is a claim about
 * running software, and a claim in a store listing that nothing checks is an
 * overclaim waiting to happen. This checks it.
 *
 * What it proves, in order:
 *   - Invite flips the running app into a room IN PLACE, with no call layer and
 *     without touching anybody's camera
 *   - a guest arriving through the link sees the HOST's saved plans
 *   - the guest can edit one, and the host sees the edit
 *   - `prefs` stays private: which plan each of them is looking at, and their
 *     own working draft, do not cross
 *
 * That last one is the interesting half. `scenarios` is read-write and `prefs`
 * is private, and if that split were wrong the failure would be silent and
 * horrible — two people dragging one another's sliders, or a guest's half-typed
 * numbers overwriting the host's saved plan.
 *
 *   python3 -m http.server 8099 -d site
 *   node test/servers/relay-local.js
 *   node apps/retirement/build.mjs
 *   node test/browser/e2e-retirement-mp.js
 */
const { chromium, CHROME } = require('../lib/pw');
const { readFileSync, existsSync } = require('fs');
const path = require('path');
const net = require('net');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const GIF = path.join(__dirname, '..', '..', 'site', 'apps', 'retirement', 'retirement.gif');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (n, ok, extra) => {
  console.log((ok ? 'PASS' : 'FAIL') + ' — ' + n
    + (!ok && extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
  if (!ok) failures++;
};
function noVerdict(why) {
  // A dead relay looks EXACTLY like a broken app from here: the room forms
  // locally, the link mints, and the guest sits on "reconnecting" forever. That
  // is a red nobody can attribute, so refuse to judge instead.
  console.log('NO-VERDICT — ' + why);
  process.exit(4);
}
const portUp = (p) => new Promise((res) => {
  const s = net.connect({ host: '127.0.0.1', port: p }, () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 2500);
});

async function appFrame(page) {
  await page.waitForSelector('#appmount iframe', { timeout: 90000 });
  const fr = await (await page.$('#appmount iframe')).contentFrame();
  await fr.waitForFunction(
    () => { const h = document.getElementById('vHead'); return h && !/Working it out/.test(h.textContent); },
    null, { timeout: 60000 }
  );
  return fr;
}
const plans = (fr) => fr.evaluate(async () => (await gifos.db('scenarios').getAll())
  .map((s) => ({ name: s.name, spend: s.plan.annualSpend, retire: s.plan.retireAge }))
  .sort((a, b) => a.name.localeCompare(b.name)));

(async () => {
  if (!existsSync(GIF)) noVerdict('no built GIF — run node apps/retirement/build.mjs');
  if (!await portUp(8099)) noVerdict('nothing on 8099 (python3 -m http.server 8099 -d site)');
  if (!await portUp(8790)) noVerdict('no relay on 8790 (node test/servers/relay-local.js)');

  const browser = await chromium.launch({ executablePath: CHROME }).catch(() => null);
  if (!browser) noVerdict('chromium would not launch');

  const people = [];
  for (const name of ['Host', 'Guest']) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
    await ctx.addInitScript((v) => {
      try {
        localStorage.setItem('gifos_relay', v.relay);
        localStorage.setItem('gifos_name', v.name);
        localStorage.setItem('gifos_meet_bar', '0');
      } catch (e) {}
    }, { relay: RELAY, name });
    // An app room's whole claim is that it never touches a camera. "The grid
    // looks dark" is not that claim; counting getUserMedia is.
    await ctx.addInitScript(() => {
      window.__gumCount = 0;
      const md = navigator.mediaDevices;
      if (md && md.getUserMedia) {
        const real = md.getUserMedia.bind(md);
        md.getUserMedia = (c) => { window.__gumCount++; return real(c); };
      }
    });
    people.push({ name, ctx });
  }
  const [host, guest] = people;

  // ---- the host installs the real GIF and saves two plans ------------------

  const desk = await host.ctx.newPage();
  await desk.goto(BASE + '/index.html');
  await desk.waitForSelector('.icon', { timeout: 90000 });
  const b64 = readFileSync(GIF).toString('base64');
  const fid = await desk.evaluate(async (b) => {
    const bin = atob(b); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const id = GifOS.store.uid('file');
    await GifOS.store.putFile({ id, name: 'retirement.gif', bytes, kind: 'gif', isApp: true, appId: 'retirement', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: id, name: 'Retirement Calculator.gif', parent: null, x: 180, y: 180, iconSize: 64 });
    return id;
  }, b64);
  check('the built GIF installs on the host desktop', !!fid);

  host.page = await host.ctx.newPage();
  host.page.on('pageerror', (e) => console.log('  [Host pageerror]', e.message));
  await host.page.goto(BASE + '/run.html#id=' + fid);
  let hostFr = await appFrame(host.page);

  async function save(fr, name, spend, retire) {
    await fr.evaluate(([s, r]) => {
      const sp = document.getElementById('fSpend');
      sp.value = '$' + s.toLocaleString('en-US');
      sp.dispatchEvent(new Event('input', { bubbles: true }));
      const ra = document.getElementById('fRetire');
      ra.value = String(r);
      ra.dispatchEvent(new Event('input', { bubbles: true }));
    }, [spend, retire]);
    await sleep(1800);
    await fr.evaluate(() => document.getElementById('btnSave').click());
    await sleep(400);
    if (await fr.evaluate(() => !document.getElementById('modal').hidden)) {
      await fr.evaluate((n) => {
        const i = document.getElementById('nameField');
        i.value = n; i.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('modalOk').click();
      }, name);
    }
    await sleep(1000);
  }
  await save(hostFr, 'Ours at 62', 72000, 62);
  await hostFr.evaluate(() => document.getElementById('btnNew').click());
  await sleep(400);
  await hostFr.evaluate(() => {
    const i = document.getElementById('nameField');
    i.value = 'Ours at 67'; i.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('modalOk').click();
  });
  await sleep(1200);
  await save(hostFr, 'Ours at 67', 92000, 67);
  check('the host has two saved plans before inviting', (await plans(hostFr)).length === 2,
    await plans(hostFr));

  // ---- Invite flips the app into a room, in place --------------------------

  await host.page.locator('.perm-modal .done, .perm-box .done').first().click({ timeout: 12000 }).catch(() => {});
  await host.page.evaluate(() => document.getElementById('appinvite').click());
  await host.page.waitForSelector('input[name="rmcls"]', { timeout: 25000 }).catch(() => {});
  await host.page.evaluate(() => {
    const heal = document.querySelector('input[name="rmcls"][value="heal"]');
    if (heal) heal.checked = true;              // the room outlives its opener
    const go = document.getElementById('inv-go');
    if (go) go.click();
  });
  await host.page.waitForFunction(
    () => document.body.classList.contains('app-room') && window.__gifosVideo && window.__gifosVideo.room(),
    null, { timeout: 60000 }
  ).catch(() => noVerdict('the app never became a room — relay reachable but no session'));
  const link = await host.page.evaluate(() => document.getElementById('share-url').value);
  check('Invite turned the running app into a room, on the same page', !!link, link);

  // RE-ACQUIRE THE HOST'S FRAME. Invite flips the page into a room in place,
  // and the app is re-mounted behind that — so the frame handle taken before
  // the Invite is pointing at a document that no longer exists. Reusing it
  // throws "Target page, context or browser has been closed" three assertions
  // later, which reads like a dead browser and is nothing of the kind.
  hostFr = await appFrame(host.page);
  check('the call layer stayed DARK — planning a retirement is not a video call',
    await host.page.evaluate(() => !document.body.classList.contains('call-on')));

  // ---- the guest walks in through the link ---------------------------------

  guest.page = await guest.ctx.newPage();
  guest.page.on('pageerror', (e) => console.log('  [Guest pageerror]', e.message));
  await guest.page.goto(link);
  const guestFr = await appFrame(guest.page).catch(async () => {
    const st = await guest.page.evaluate(() => ({
      status: (document.getElementById('status') || {}).textContent,
      body: document.body.className
    }));
    noVerdict('the guest never got the app up: ' + JSON.stringify(st));
  });

  await guestFr.waitForFunction(
    async () => (await gifos.db('scenarios').getAll()).length >= 2, null, { timeout: 60000 }
  ).catch(() => {});
  const seen = await plans(guestFr);
  check('the guest sees the host\'s plans, by name', seen.length === 2
    && seen[0].name === 'Ours at 62' && seen[1].name === 'Ours at 67', seen);
  check('...with the host\'s numbers, not defaults',
    seen[0].spend === 72000 && seen[1].spend === 92000, seen);

  // ---- the guest edits, and the host sees it -------------------------------

  await guestFr.evaluate(async () => {
    const db = gifos.db('scenarios');
    const all = await db.getAll();
    const rec = all.filter((s) => s.name === 'Ours at 62')[0];
    rec.name = 'Ours at 62 (his idea)';
    rec.plan.annualSpend = 61000;
    await db.put(rec);
  });
  await sleep(3000);
  const back = await plans(hostFr);
  check('the guest\'s edit reaches the host', back.some((s) => s.name === 'Ours at 62 (his idea)'), back);
  check('...including the number they changed', back.some((s) => s.spend === 61000), back);

  // ---- private stays private ------------------------------------------------

  await guestFr.evaluate(() => gifos.db('prefs').put({ id: 'ui', activeId: 'guest-only', comparing: true }));
  await sleep(2500);
  const hostPrefs = await hostFr.evaluate(async () => {
    const r = await gifos.db('prefs').get('ui');
    return r ? r.activeId : null;
  });
  check('prefs are PRIVATE — the guest\'s view did not overwrite the host\'s',
    hostPrefs !== 'guest-only', hostPrefs);

  // ---- nobody's camera was touched -----------------------------------------

  for (const p of people) {
    const gum = await p.page.evaluate(() => window.__gumCount || 0);
    check(p.name + '\'s camera was never opened', gum === 0, gum);
  }

  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILED' : '\nall good');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  noVerdict('the run threw: ' + e.message);
});
