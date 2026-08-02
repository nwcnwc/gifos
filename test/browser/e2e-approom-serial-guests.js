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
// TWO BUGS LIVED HERE. The first is FIXED; the second is what keeps this red.
//
// 1. FIXED — the star. App bytes were broadcast only in reply to a client's
//    'need-app', so every joiner dialled the owner for the file. They are now
//    retained on every node and pulled peer-to-peer (meet.html sga-appreq /
//    sga-app). The blocker had been the verifier's monotonic n: a RETAINED
//    frame always carries its mint-time n, so a retained app read as 'stale'
//    forever — 'app' is now exempt from ordering as immutable content.
//    Sequential guests went 5/8 (1.7-9.9s, 20-36s stalls) -> flat ~1.8s.
//
// 2. STILL OPEN — mesh membership, NOT the bytes path. A guest seats at a real
//    coord and then sees NOTHING for ~23s:
//        guest1 SEAT {"coord":{"pc":0,"r":0,"i":1},"peers":0,"dcs":0}
//        times  -1, 23664, 24060, 2713, 22644, 1659, 1756, 1719
//    debugDump().participants is EMPTY — the guest does not know the owner
//    exists, so it has no sga target to pull snap OR app from, and no amount of
//    retrying in the app layer can help. The ~23-24s clustering looks like a
//    fixed retry somewhere in roster/greeter propagation. Once the room is warm
//    later guests are 1.7s. THAT is the next bug, and this suite is its test.
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
      // Seated at all? A guest with no mesh coord has no sga targets, so it can
      // neither pull the snap nor the app — that is a SEATING failure, a
      // different bug from the bytes path.
      const st = await page.evaluate(() => {
        const V = window.__gifosVideo;
        let coord = null, dcs = 0, peers = 0;
        try { coord = V && V.meshCoord ? V.meshCoord() : null; } catch (e) {}
        try {
          const d = V && V.debugDump ? V.debugDump() : null;
          const ps = d && d.participants;   // debugDump's real key
          if (Array.isArray(ps)) { peers = ps.length; dcs = ps.filter((x) => x && x.conn).length; }
        } catch (e) {}
        return { coord, peers, dcs };
      }).catch(() => null);
      console.log('    guest' + g + ' SEAT ' + JSON.stringify(st));
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
