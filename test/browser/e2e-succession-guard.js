/*
 * SUCCESSION MUST NOT SEIZE A PRESENT HOST — and must still seize a dead one.
 *
 * The bug this guards was measured on a real phone joined to a real host
 * (2026-08-17): the guest's STATUS view of the host went stale (its direct
 * mesh edge never formed), the host's app ad therefore vanished from
 * findSharedApp(), and ownerAway() ran deterministic succession 45 seconds
 * into a live deathmatch — "🧩 The host left — you are keeping FPS Simple
 * going from your copy" — while the meeting's own presence plane read
 * "2 in the meeting" on BOTH screens. The guest seized a present host's app,
 * and its competing ad then churned the true host's mount as well.
 *
 * The doctrine (docs/one-runtime.md, Ownership and succession): succession
 * fires when the owner's seat is CONFIRMED GONE — "the mesh's own departure
 * detection + a grace period" — never on one quiet channel. healing-laws D
 * says the same about death verdicts generally: only a peer unreachable on
 * every path for the settled window is confirmed dead. A stale status path
 * while presence still vouches is evidence of a sick STATUS PATH, not an
 * absent host: freeze (honest), hold, re-probe — seize only when presence
 * agrees, or after the deliberate 3-minute contradiction escape.
 *
 * Both directions are asserted, because a guard that only forbids the false
 * seize would pass if succession never fired at all — and resilience IS the
 * feature:
 *   1. Host present, status path stalled (haltPulseForTest — the same
 *      throttled-phone hook the G1 drill uses): NO succession; the guest
 *      freezes, logs the contradiction, and THAWS when pulses resume, with
 *      zero remounts on either side.
 *   2. Host genuinely gone (context closed): succession fires and the guest
 *      re-hosts from its copy, promptly.
 *
 * Needs: site on 8099 and relay-local on 8790 (the standard browser-tier
 * fixture pair). One box is enough: every assertion is about state.
 */
const { chromium, CHROME } = require('../lib/pw');
const need = require('../lib/need');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tl = (m) => console.log('  [' + ((Date.now() - T0) / 1000).toFixed(1) + 's] ' + m);
const T0 = Date.now();

// Poll a predicate through evaluate (waitForFunction dies once busy apps run).
async function until(page, fn, ms, arg) {
  const dl = Date.now() + ms;
  for (;;) {
    if (await page.evaluate(fn, arg).catch(() => false)) return true;
    if (Date.now() >= dl) return false;
    await sleep(500);
  }
}

const EVENTS = () => (window.__appRemounts || []).map((e) => e.ev);

(async () => {
  await need({ 8099: 'a static server on 8099', 8790: 'relay-local (node test/servers/relay-local.js)' },
    new URL(BASE).hostname);

  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-features=WebRtcHideLocalIpsWithMdns',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required'],
  });
  try {
    const mkCtx = async (name) => {
      const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
      await ctx.addInitScript((o) => {
        try {
          localStorage.setItem('gifos_relay', o.relay);
          localStorage.setItem('gifos_name', o.name);
          localStorage.setItem('gifos_meet_bar', '0');
        } catch (e) {}
      }, { relay: RELAY, name });
      return ctx;
    };

    /* ---- the host runs a seeded app and mints a RESILIENT room ---------- */
    const hostCtx = await mkCtx('Hostess');
    const host = await hostCtx.newPage();
    host.on('pageerror', (e) => console.log('  [host pageerror] ' + String(e).slice(0, 140)));
    await host.goto(BASE + '/index.html');
    await host.waitForSelector('.icon', { timeout: 30000 });
    const cid = await host.evaluate(async () => {
      const it = (await GifOS.store.allItems()).find((x) => /^Chat\.gif/i.test(x.name || ''));
      return it ? it.fileId : null;
    });
    check('the host has a seeded app to share', !!cid);
    if (!cid) throw new Error('no seeded app');
    await host.goto(BASE + '/run.html#id=' + encodeURIComponent(cid));
    await host.waitForSelector('iframe', { timeout: 30000 });
    await host.locator('.perm-modal .done').click({ timeout: 6000 }).catch(() => {});
    await host.evaluate(() => document.getElementById('appinvite').click());
    await host.waitForSelector('#inv-go', { timeout: 15000 });
    // RESILIENT class on purpose: succession only exists there. An owned room
    // freezes forever and this guard would assert nothing.
    await host.evaluate(() => {
      const r = document.querySelector('input[name="rmcls"][value="heal"]');
      if (r) r.checked = true;
      document.getElementById('inv-go').click();
    });
    await host.waitForFunction(() => document.getElementById('share-url').value, null, { timeout: 30000 });
    const link = await host.locator('#share-url').inputValue();
    check('a resilient room link was minted', /#j=/.test(link || ''), (link || '').slice(0, 46));
    await host.evaluate(() => { const d = document.getElementById('inv-done'); if (d) d.click(); });
    await host.locator('.perm-modal .done').click({ timeout: 6000 }).catch(() => {});

    /* ---- the guest joins and mounts the shared app ---------------------- */
    const guestCtx = await mkCtx('Guest');
    const guest = await guestCtx.newPage();
    guest.on('pageerror', (e) => console.log('  [guest pageerror] ' + String(e).slice(0, 140)));
    await guest.goto(BASE + '/index.html');
    await guest.waitForSelector('.icon', { timeout: 30000 });
    await guest.goto(link);
    const mounted = await until(guest, () => (window.__appRemounts || []).some((e) => e.ev === 'client-mount'), 60000);
    check('the guest mounts the shared app as a client', mounted,
      await guest.evaluate(EVENTS).catch(() => '?'));
    // Let the room settle so a late perm-ack remount cannot masquerade as the
    // churn asserted below; then take the baselines the later checks diff.
    await guest.locator('.perm-modal .done').click({ timeout: 6000 }).catch(() => {});
    await sleep(8000);
    const guestEvBase = (await guest.evaluate(EVENTS)).length;
    const hostEvBase = (await host.evaluate(EVENTS)).length;

    /* ================ 1. STALLED STATUS PATH, PRESENT HOST =============== */
    // The same hook the G1 throttled-phone drill uses: the host's outgoing
    // status pulses stop dead while its transport, relay socket and page all
    // stay alive — exactly the phone's sick-status-path shape.
    await host.evaluate(() => window.__gifosVideo.haltPulseForTest(true));
    tl('host pulses halted — waiting for the guest to lose the ad (stHold 15s + holdover)');
    const froze = await until(guest, () => (window.__appRemounts || []).some((e) => e.ev === 'owner-away-freeze'), 120000);
    check('the ad vanishing freezes the guest (writes stop, honestly)', froze);
    const sawContradiction = await until(guest, () => (window.__appRemounts || []).some((e) => e.ev === 'owner-away-contradiction'), 15000);
    check('...and the guest KNOWS this is a contradiction: the host is still seated', sawContradiction);

    // The old code seized 6 seconds after the freeze. Watch five times that.
    await sleep(30000);
    const guestEvs = await guest.evaluate(EVENTS);
    check('NO succession fires while presence still vouches for the host',
      !guestEvs.includes('succession'), guestEvs.slice(guestEvBase));
    check('the guest never tells anyone the host left',
      !/keeping .* going from your copy/i.test(await guest.evaluate(() => (document.getElementById('status') || {}).textContent || '')));
    const hostEvs = await host.evaluate(EVENTS);
    check('the true host\'s own mount is untouched by the stall',
      hostEvs.length === hostEvBase && !hostEvs.includes('succession'), hostEvs.slice(hostEvBase));

    /* ---- the status path heals: the room must simply resume ------------- */
    await host.evaluate(() => window.__gifosVideo.haltPulseForTest(false));
    tl('host pulses resumed');
    const thawed = await until(guest, () => {
      const t = (document.getElementById('appwho') || {}).textContent || '';
      return !/paused/.test(t);
    }, 60000);
    check('when pulses resume the guest THAWS instead of remounting', thawed,
      await guest.evaluate(() => (document.getElementById('appwho') || {}).textContent || ''));
    const guestEvsAfter = await guest.evaluate(EVENTS);
    check('...with zero remounts through the whole stall-and-heal cycle',
      !guestEvsAfter.slice(guestEvBase).some((e) => e === 'client-mount' || e === 'runApp' || e === 'succession'),
      guestEvsAfter.slice(guestEvBase));

    /* ================ 2. THE HOST GENUINELY DIES ========================= */
    // Resilience is the feature: with the host's context torn down (page,
    // transport, relay socket — everything), the mesh confirms the departure
    // (the statusOf entry is DELETED, not merely stale) and the guest MUST
    // seize, promptly. If this half rots, succession never fires and the
    // no-false-seize half above is passing for the wrong reason.
    tl('closing the host for real');
    await hostCtx.close();
    const seized = await until(guest, () => (window.__appRemounts || []).some((e) => e.ev === 'succession'), 120000);
    check('a CONFIRMED departure still hands the app to the guest', seized,
      await guest.evaluate(EVENTS).catch(() => '?'));
    check('...and says so in the words the room shows',
      /keeping .* going from your copy/i.test(await guest.evaluate(() => (document.getElementById('status') || {}).textContent || '')));

    await guestCtx.close();
  } finally {
    await browser.close().catch(() => {});
  }
  console.log(failures ? '\nFAILURES: ' + failures : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
