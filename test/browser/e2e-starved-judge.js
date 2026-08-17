/*
 * A JUDGE THAT WAS ASLEEP MUST NOT COUNT ITS NAP AS THE PEER'S SILENCE.
 *
 * Measured on a real phone (2026-08-17, pi-watch trace): fps-simple's shader
 * warm-up blocked the page's event loop in multi-second bursts; every receive
 * stamp (meshRx, status.at) is written by JS handlers that could not run, so
 * the mesh-starve sweeper read 12 seconds of "receive silence" on a healthy
 * host/prflx pair, fired 'starve-dead' on it, and rebuilt it — cyclically,
 * every warm-up burst. The statuses' staleness horizon (stHold) starved the
 * same way, the host's app ad vanished, and the room began eating itself.
 *
 * The doctrine was already there: healing-laws D confirms death only for a
 * peer "unreachable on every path for the settled window" — which PRESUMES
 * the observer was awake for the window. run.html now enforces the
 * presumption: a 250ms sentinel accumulates provable event-loop blockage
 * (starveDebtSince), and every local receive-silence judgment — the starve
 * sweeper's gates, stHold, the far-peer status sweep — subtracts the
 * blockage that fell inside its window. Self-knowledge only: no peer is
 * asked for grace, and the mesh's first-hand departure edges are untouched.
 *
 * Both directions, because a debt that shielded everything forever would
 * just be a dead liveness system:
 *   1. Guest blocks its own loop 20s (a synchronous busy-loop — the same
 *      shape as a shader compile burst): NO starve-kick, the host never
 *      reads stale, no owner-away, and the pair recovers to open.
 *   2. The host GENUINELY dies while the guest is blocked: once awake, the
 *      guest still confirms the departure on ordinary horizons — the debt
 *      pauses the judge's clock, not reality.
 *
 * Needs: site on 8099, relay-local on 8790. One box is enough.
 */
const { chromium, CHROME } = require('../lib/pw');
const need = require('../lib/need');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + (typeof d === 'string' ? d : JSON.stringify(d)) + ')' : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T0 = Date.now();
const tl = (m) => console.log('  [' + ((Date.now() - T0) / 1000).toFixed(1) + 's] ' + m);

async function until(page, fn, ms, arg) {
  const dl = Date.now() + ms;
  for (;;) {
    if (await page.evaluate(fn, arg).catch(() => false)) return true;
    if (Date.now() >= dl) return false;
    await sleep(500);
  }
}

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

    /* ---- a two-member app room, the shape the phone bug lived in -------- */
    const hostCtx = await mkCtx('Hostess');
    const host = await hostCtx.newPage();
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
    await host.evaluate(() => {
      const r = document.querySelector('input[name="rmcls"][value="heal"]');
      if (r) r.checked = true;
      document.getElementById('inv-go').click();
    });
    await host.waitForFunction(() => document.getElementById('share-url').value, null, { timeout: 30000 });
    const link = await host.locator('#share-url').inputValue();
    await host.evaluate(() => { const d = document.getElementById('inv-done'); if (d) d.click(); });
    await host.locator('.perm-modal .done').click({ timeout: 6000 }).catch(() => {});

    const guestCtx = await mkCtx('Guest');
    const guest = await guestCtx.newPage();
    guest.on('console', (m) => { const t = m.text(); if (/translost|gone |starve|probe/i.test(t)) tl('GuestCon: ' + t.slice(0, 120)); });
    await guest.goto(BASE + '/index.html');
    await guest.waitForSelector('.icon', { timeout: 30000 });
    await guest.evaluate(() => { try { sessionStorage.setItem('gifos_debug', '1'); } catch (e) {} });
    await guest.goto(link);
    const paired = await until(guest, () => {
      const V = window.__gifosVideo;
      if (!V || !V.peerIds || !V.peerIds().length) return false;
      const a = V.statusAgeOf(V.peerIds()[0]);
      return a.held && a.dcOpen && a.connected;
    }, 90000);
    check('the pair forms: host held, DC open, transport connected', paired);
    const hostPid = await guest.evaluate(() => window.__gifosVideo.peerIds()[0]);
    await guest.locator('.perm-modal .done').click({ timeout: 6000 }).catch(() => {});
    await sleep(6000); // settle, so late mounts don't blur the baselines
    const base = await guest.evaluate(() => ({
      kicked: window.__gifosVideo.starveKicked(),
      ev: (window.__appRemounts || []).length,
    }));

    /* ================ 1. THE JUDGE BLOCKS ITS OWN LOOP =================== */
    tl('blocking the guest\'s event loop for 20s (synchronous busy-loop)');
    await guest.evaluate(() => { const t = Date.now(); while (Date.now() - t < 20000) { /* a shader compile, effectively */ } });
    const after = await guest.evaluate(() => {
      const V = window.__gifosVideo;
      const id = V.peerIds()[0];
      const a = id ? V.statusAgeOf(id) : null;
      return {
        debt: V.starveDebt(),
        kicked: V.starveKicked(),
        held: a ? a.held : null,
        gone: a ? a.gone : null,
        stEntry: a ? a.at !== null : false,
      };
    });
    check('the sentinel measured the block as starvation debt', after.debt >= 15000, after.debt + 'ms');
    check('NO starve-kick fired on the blocked judge\'s own healthy pair',
      after.kicked === base.kicked, 'kicked ' + base.kicked + ' -> ' + after.kicked);
    // The instant after wake may legitimately show a transport blip: the HOST
    // judged our 20s of silence honestly and may have kicked/rebuilt the pair
    // from its side (its judge gets the same debt fix only for its OWN
    // blocks). What the starved judge must never do is turn that instant into
    // a verdict — no tombstone, and no succession below.
    const hostView = await guest.evaluate((id) => window.__gifosVideo.statusAgeOf(id), hostPid);
    check('the blocked judge never tombstoned the host', hostView.gone !== true, hostView);

    // Recovery: within a normal horizon the pair is fully live again (the
    // HOST's judge saw honest silence and may rebuild toward us — tolerating
    // that is the peers' side of the contract; it must land, not linger).
    const recovered = await until(guest, () => {
      const V = window.__gifosVideo;
      const id = V.peerIds()[0];
      if (!id) return false;
      const a = V.statusAgeOf(id);
      return a.held && a.dcOpen && a.connected && a.at !== null && a.at < 10000;
    }, 45000);
    check('the room recovers to a live pair after the block', recovered);
    const evAfter = await guest.evaluate(() => (window.__appRemounts || []).slice((window.__lzBase = window.__lzBase || 0)).map((e) => e.ev));
    // A transient honest FREEZE is allowed (the ad can blink through the
    // host-side rebuild); a SEIZE is the disease and must never happen.
    check('no succession was ever run across the whole block-and-heal',
      !(await guest.evaluate((n) => (window.__appRemounts || []).slice(n).some((e) => /succession|runApp/.test(e.ev)), base.ev)),
      await guest.evaluate((n) => (window.__appRemounts || []).slice(n).map((e) => e.ev + (e.door ? ':' + e.door : '')), base.ev));

    /* ============ 2. A REAL DEATH WHILE THE JUDGE IS BLOCKED ============= */
    tl('closing the host, then immediately blocking the guest 15s');
    await hostCtx.close();
    await guest.evaluate(() => { const t = Date.now(); while (Date.now() - t < 15000) { /* asleep through the death */ } });
    const confirmed = await until(guest, () => {
      const V = window.__gifosVideo;
      const ids = V.peerIds();
      if (!ids.length) return true;                    // peer record dropped entirely
      const a = V.statusAgeOf(ids[0]);
      return a.at === null || a.gone === true;         // statusOf deleted, or tombstoned
    }, 90000);
    check('a GENUINE departure is still confirmed once the judge wakes', confirmed);

    await guestCtx.close();
  } finally {
    await browser.close().catch(() => {});
  }
  console.log(failures ? '\nFAILURES: ' + failures : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
