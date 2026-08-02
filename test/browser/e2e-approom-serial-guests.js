// e2e-approom-serial-guests.js — GUESTS ARRIVING ONE AFTER ANOTHER MUST ALL GET
// THE APP.
//
// The bug, measured 2026-08-02 across THREE MACHINES (host on raspberrypi,
// guests on pi-16gb, site+relay on penguin — see test/README.md "ONE BOX CANNOT
// ANSWER..."): fourteen guests joined one owned app room in sequence and only
// TEN ever saw the app.
//
//   run 1-6  ok      7 FAIL   8 FAIL   9 ok   10 FAIL   11 ok  12 ok
//   13 FAIL  14 ok (28.9s)                    => 10/14, ~29% never mounted
//
// The owner is NOT the one refusing. Its ledger over that run
// (window.__appOwnerStats, printed by test/tools/approom-host.js) read
// asks=45 sends=29 deferred=32 sendErrors=0 — every request arrived and the
// owner kept broadcasting the app frame throughout, with no errors. So the
// request reaches the owner over the guest's DC, the owner sends, and the frame
// does not reach THAT guest. The failure is in delivery/fan-out of the
// owner-signed 'app' broadcast to a newly-arrived subscriber.
//
// Why it hid for so long: with ONE guest it is a coin flip nobody chases, and
// the suite that did hit it (e2e-perms-share) was simply given a bigger timeout
// — its "~40% flaky" was this bug all along. It only becomes obvious when
// guests arrive in SEQUENCE, which is exactly what a real room does.
//
// This suite is deliberately sequential and single-file: at most two browsers
// are alive at once (the owner plus the current guest), so it cannot be
// dismissed as a loaded box.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const GUESTS = parseInt(process.env.GUESTS || '8', 10);
// Healthy is milliseconds on one box and 1.6-6.1s across real machines. 15s is
// far past both and still well inside the failure mode, which blows past 30s.
const BUDGET = parseInt(process.env.MOUNT_BUDGET || '15000', 10);

let failures = 0;
const check = (name, cond, extra) => {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : ''));
  if (!cond) failures++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-features=WebRtcHideLocalIpsWithMdns',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required'],
  });

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

  // ---- the owner opens an app room and mints an OWNED invite ---------------
  const hostCtx = await mkCtx('Owner');
  const host = await hostCtx.newPage();
  host.on('pageerror', (e) => console.log('  [owner pageerror] ' + String(e).slice(0, 140)));
  await host.goto(BASE + '/index.html');
  await host.waitForSelector('.icon', { timeout: 30000 });
  const cid = await host.evaluate(async () => {
    const it = (await GifOS.store.allItems()).find((x) => /^Chat\.gif/i.test(x.name || ''));
    return it ? it.fileId : null;
  });
  check('owner seeded the Chat app', !!cid, cid);
  if (!cid) { await browser.close(); process.exit(1); }

  await host.goto(BASE + '/meet.html#id=' + encodeURIComponent(cid));
  await host.waitForSelector('iframe', { timeout: 30000 });
  await host.locator('.perm-modal .done').click({ timeout: 6000 }).catch(() => {});
  await host.waitForSelector('.perm-modal', { state: 'detached', timeout: 6000 }).catch(() => {});
  await host.evaluate(() => document.getElementById('appinvite').click());
  await host.waitForSelector('#inv-go', { timeout: 15000 });
  await host.evaluate(() => document.getElementById('inv-go').click());
  await host.waitForFunction(() => document.getElementById('share-url').value, null, { timeout: 30000 });
  const link = await host.locator('#share-url').inputValue();
  check('owner minted an owned invite link', /#s=|#j=/.test(link || ''), (link || '').slice(0, 46));

  // ---- guests, ONE AT A TIME -----------------------------------------------
  const times = [];
  for (let g = 1; g <= GUESTS; g++) {
    const ctx = await mkCtx('Guest' + g);
    const page = await ctx.newPage();
    // Seed this guest's own store first — the desktop DB must exist before an
    // app can be written into it (same order as e2e-perms-share).
    await page.goto(BASE + '/index.html').catch(() => {});
    await page.waitForSelector('.icon', { timeout: 30000 }).catch(() => {});
    const t0 = Date.now();
    await page.goto(link).catch(() => {});
    const ok = await page.waitForSelector('iframe', { timeout: BUDGET }).then(() => true).catch(() => false);
    const ms = ok ? Date.now() - t0 : -1;
    times.push(ms);
    if (!ok) {
      // WHOSE fault? Print the guest's own join timeline and the owner's ledger.
      const tr = await page.evaluate(() => window.__appJoinTrace || []).catch(() => []);
      console.log('    guest' + g + ' TRACE ' + (tr.length ? tr.map((e) => e.ev + '@' + e.ms).join(' ') : '(none)'));
      const own = await host.evaluate(() => window.__appOwnerStats || null).catch(() => null);
      console.log('    owner ledger ' + JSON.stringify(own));
    }
    await ctx.close().catch(() => {});
    await sleep(500);
  }

  const mounted = times.filter((t) => t >= 0).length;
  check('EVERY sequential guest received the app within ' + (BUDGET / 1000) + 's',
    mounted === GUESTS, { mounted: mounted + '/' + GUESTS, ms: times });

  // A guest that mounts only after a long stall is the same defect, half-hidden
  // — on a phone a 15s blank room is a closed tab.
  const slow = times.filter((t) => t > 8000).length;
  check('no guest waited more than 8s for the app', slow === 0, { slow, ms: times });

  await browser.close().catch(() => {});
  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.log('FAIL — suite threw: ' + String(e).slice(0, 200)); process.exit(1); });
