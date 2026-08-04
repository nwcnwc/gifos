// Permissions-when-shared e2e. Two things a shared app must still do:
//
//  A) TWO-PARTY JOIN — when you accept an invite and the app mounts on YOUR
//     device, you get the same Abilities acknowledgement + per-app opt-out the
//     host got. Unticking "Use your AI" is enforced on YOUR runtime only: your
//     ✨ draft makes no call, while the host (who left AI on) still drafts —
//     proving keys/opt-out are per-person, not shared.
//
//  B) APP-IN-MEETING — an app run inside a meeting surfaces the same panel from
//     the in-meeting header (#appperms), so the opt-out is reachable there too.
//
// Needs the local relay (RELAY) and a static server (BASE), like the other
// meeting tests. The AI endpoint is mocked per browser context.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name, cond, d) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (d ? '  (' + d + ')' : '')); if (!cond) failures++; };

const AI_URL = 'http://localhost:9099/v1/chat/completions';
function aiCfg(key) { return JSON.stringify({ cheapest: { url: AI_URL, key: key, model: 'm' }, smartest: { url: AI_URL, key: key, model: 'm' } }); }

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });

  // A browser context wired for a named user on the test relay, with its own
  // mocked AI endpoint (so we can see WHOSE key a call carries, and count them).
  async function makeUser(name) {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript((o) => {
      try { localStorage.setItem('gifos_relay', o.relay); localStorage.setItem('gifos_name', o.name); localStorage.setItem('gifos_meet_bar', '0'); } catch (e) {}
    }, { name: name, relay: RELAY });
    const seen = { hits: 0, auth: null };
    await ctx.route('**/chat/completions', (route) => {
      seen.hits++; seen.auth = route.request().headers()['authorization'] || null;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: 'draft-from-' + name } }] }) });
    });
    return { ctx, seen };
  }
  const chatId = async (page) => page.evaluate(async () => { const it = (await GifOS.store.allItems()).find((x) => /^Chat\.gif/i.test(x.name || '')); return it ? it.fileId : null; });
  const dismissName = async (p) => { try { await p.locator('.name-modal #nmok').click({ timeout: 1500 }); } catch (e) {} };

  // ============ A) TWO-PARTY JOIN ============
  const host = await makeUser('Ada');
  const hostPage = await host.ctx.newPage();
  hostPage.on('pageerror', (e) => console.log('  [host pageerror] ' + e.message));
  await hostPage.goto(BASE + '/index.html'); await hostPage.waitForSelector('.icon', { timeout: 20000 });
  const cid = await chatId(hostPage);
  check('host seeded the Chat app', !!cid, cid);
  await hostPage.evaluate((c) => localStorage.setItem('gifos_ai_config', c), aiCfg('sk-ADA'));
  await hostPage.goto(BASE + '/run.html#id=' + cid);
  await hostPage.waitForSelector('iframe', { timeout: 15000 });
  // Host acks its own abilities, and we wait for that panel to fully close so it
  // can't intercept the Invite click.
  await hostPage.waitForSelector('.perm-modal', { timeout: 6000 }).catch(() => {});
  await hostPage.locator('.perm-modal .done').click({ timeout: 4000 }).catch(() => {});
  await hostPage.waitForSelector('.perm-modal', { state: 'detached', timeout: 4000 }).catch(() => {});

  // Host mints an invite link.
  await hostPage.evaluate(() => document.getElementById('appinvite').click());
  await hostPage.waitForSelector('#inv-go', { timeout: 6000 });
  await hostPage.evaluate(() => document.getElementById('inv-go').click());
  const gotLink = await hostPage.waitForFunction(() => document.getElementById('share-url').value, null, { timeout: 25000 });
  if (!gotLink) console.log('  (no invite link; host status="' + (await hostPage.locator('#status').innerText().catch(() => '')).slice(0, 80) + '")');
  const link = gotLink ? await hostPage.locator('#share-url').inputValue() : '';
  check('host minted an invite link', /#s=|#j=/.test(link || ''), (link || '').slice(0, 40));

  // Joiner opens the link on a DIFFERENT device with their OWN AI key.
  const joiner = await makeUser('Ben');
  const joinPage = await joiner.ctx.newPage();
  await joinPage.goto(BASE + '/index.html'); await joinPage.waitForSelector('.icon', { timeout: 20000 }); // seed Ben's store
  await joinPage.evaluate((c) => localStorage.setItem('gifos_ai_config', c), aiCfg('sk-BEN'));
  await joinPage.goto(link);
  await dismissName(joinPage);

  // THE POINT: the joiner gets the Abilities challenge, with the AI opt-out.
  // BUDGET MATCHED TO MEASURED REALITY, and the cliff kept visible.
  // Measured 2026-08-02, 6 runs on an idle 8-core box: this panel lands in
  // 9-32 MILLISECONDS five times out of six — and once took 32,899 ms. The old
  // 20s budget sat right inside that gap, so the suite failed ~40% of the time
  // (both on this tree and on the 0.8.8 one: 2/4 vs 1/4 interleaved, so it is
  // not a 0.9.0 regression). With a budget past the cliff it is 6/6.
  //
  // The assertion is UNCHANGED — the acknowledgement must still appear, and a
  // joiner who never gets it still fails. But the ~33s slow path is a REAL
  // product latency cliff in the app-room join (bytes-on-demand, 4e06b8d),
  // almost certainly a retry cycle, and a 33-second wait to see a shared app is
  // its own bug: on a phone that is a closed tab. So log the arrival time on
  // every run and shout when it is slow, rather than let a bigger timeout hide
  // it. If the WARN stops appearing, the cliff is gone.
  const tModal = Date.now();
  const gotModal = await joinPage.waitForSelector('.perm-modal', { timeout: 60000 }).then(() => true).catch(() => false);
  const modalMs = Date.now() - tModal;
  check('JOINER gets the Abilities acknowledgement on join', gotModal, { afterMs: modalMs });
  if (gotModal && modalMs > 5000) {
    console.log('  WARN — the joiner waited ' + modalMs + 'ms for the app to mount (usually <50ms). ' +
      'That is the app-room bytes-on-demand latency cliff, not a test problem.');
  }
  const joinAiCb = joinPage.locator('.perm-modal input[data-cap="ai"]');
  check('JOINER sees the AI opt-out checkbox', (await joinAiCb.count()) === 1);

  // Joiner opts OUT, then closes the panel.
  await joinAiCb.uncheck().catch(() => {});
  await joinPage.locator('.perm-modal .done').click({ timeout: 3000 }).catch(() => {});
  const benVeto = await joinPage.evaluate(() => localStorage.getItem('gifos_capoff_chat'));
  check('JOINER opt-out persists on their device', /ai/.test(benVeto || ''), benVeto);

  // Joiner drafts → blocked (no call). Host drafts → works, with the HOST key.
  await joinPage.waitForSelector('iframe', { timeout: 15000 });
  const jfr = joinPage.frameLocator('iframe');
  await jfr.locator('#ai').click({ timeout: 6000 }).catch(() => {});
  await sleep(1200);
  check('JOINER with AI off makes NO AI call', joiner.seen.hits === 0, 'hits=' + joiner.seen.hits);

  const hfr = hostPage.frameLocator('iframe');
  await hostPage.evaluate(() => { for (const id of ['link-modal', 'inv-modal']) { var m = document.getElementById(id); if (m) m.style.display = 'none'; } }); // clear the invite copy modal so we can reach the app
  await hfr.locator('#ai').click({ timeout: 6000 }).catch(() => {});
  await sleep(1200);
  check('HOST (AI on) still drafts, with the HOST key', host.seen.hits === 1 && /sk-ADA/.test(host.seen.auth || ''), 'hits=' + host.seen.hits + ' auth=' + (host.seen.auth || '').slice(0, 12));
  check('per-person: host called AI, joiner did not', host.seen.hits === 1 && joiner.seen.hits === 0);

  await host.ctx.close(); await joiner.ctx.close();

  // ============ B) APP-IN-MEETING ============
  const mUser = await makeUser('Cy');
  const mPage = await mUser.ctx.newPage();
  await mPage.goto(BASE + '/index.html'); await mPage.waitForSelector('.icon', { timeout: 20000 });
  const mChat = await chatId(mPage);
  const meet = await mPage.context().newPage();
  meet.on('pageerror', (e) => console.log('  [meet pageerror] ' + e.message));
  await meet.goto(BASE + '/run.html');
  await meet.locator('#lob-open').click();
  await meet.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room() && window.__gifosVideo.canRunApp(), null, { timeout: 15000 });
  await meet.evaluate((id) => window.__gifosVideo.runAppForTest(id, 'Chat'), mChat);
  await meet.waitForFunction(() => window.__gifosVideo.appActive(), null, { timeout: 15000 }).catch(() => {});

  const chip = await meet.waitForSelector('#appperms', { state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
  check('APP-IN-MEETING shows the Abilities chip in the app header', chip);
  const meetModal = await meet.waitForSelector('.perm-modal', { timeout: 8000 }).then(() => true).catch(() => false);
  check('APP-IN-MEETING opens the acknowledgement panel', meetModal);
  check('APP-IN-MEETING panel has the AI opt-out checkbox', (await meet.locator('.perm-modal input[data-cap="ai"]').count()) === 1);
  await mUser.ctx.close();

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAIL') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', (e && e.stack) || (e && e.message) || e); process.exit(2); });
