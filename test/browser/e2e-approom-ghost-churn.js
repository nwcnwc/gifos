// e2e-approom-ghost-churn.js — A GUEST KILLED MID-PLACEMENT MUST NOT POISON
// THE ROOM FOR THE NEXT ONE.
//
// This is the DETERMINISTIC form of the intermittent failure in
// e2e-approom-serial-guests.js. That suite fails 1-4 guests in 8 at random;
// this one fails every time, because it targets the exact window that causes it.
//
// THE WINDOW. A healthy join is, measured: seat at ~800ms (occ=2, links=1 —
// the newcomer and the owner see each other immediately), app mounted at ~1.7s.
// Kill the tab at ~700ms and the guest has CLAIMED A SEAT but nobody ever
// linked to it. Nothing then notices it is gone: D5 transport-death needs a
// transport, and this peer never had one to anybody.
//
// WHAT IT DOES TO THE ROOM (measured 2026-08-02, six ghosts at kill@700ms):
//
//   host after 6 ghosts:  occ=1 links=0     <- the owner never learned of ANY
//   real1 STUCK seat=0/1.2 occ=1 links=0    <- placed in ROW 1, alone
//   real2 STUCK seat=0/1.3 occ=1 links=0    <- row 1, alone
//   real3 STUCK seat=0/0.1 occ=2 links=1    <- linked correctly, STILL no app
//   RESULT real guests mounted 0/3
//
// So the phantoms fill Section 1 row 0, and real guests arriving afterwards are
// placed into a row with nobody in it — an isolated fragment that cannot pull
// snap or app from anyone. The third case is worse and separate: a guest that
// DID link to the owner still never received the app.
//
// This is mesh SEATING/membership, not the app-bytes path (which is now
// retained and peer-served, and mounts in ~1.8s whenever the guest is actually
// in the room). "Close the tab and reopen" is the single most common thing a
// phone user does, so a room that degrades under it degrades in normal use.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const KILL = parseInt(process.env.KILL_MS || '700', 10);   // between seated and linked
const GHOSTS = parseInt(process.env.GHOSTS || '6', 10);
const REAL = parseInt(process.env.REAL || '3', 10);
const BUDGET = parseInt(process.env.MOUNT_BUDGET || '15000', 10);

let failures = 0;
const check = (n, c, x) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (x !== undefined ? '  ' + JSON.stringify(x) : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME,
    args: ['--no-sandbox', '--disable-features=WebRtcHideLocalIpsWithMdns',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required'] });
  const mk = async (n) => {
    const c = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await c.addInitScript((o) => { try {
      localStorage.setItem('gifos_relay', o.r); localStorage.setItem('gifos_name', o.n);
      localStorage.setItem('gifos_meet_bar', '0'); } catch (e) {} }, { r: RELAY, n });
    return c;
  };

  const hc = await mk('Owner'); const host = await hc.newPage();
  host.on('pageerror', (e) => console.log('  [owner pageerror] ' + String(e).slice(0, 140)));
  await host.goto(BASE + '/index.html');
  await host.waitForSelector('.icon', { timeout: 30000 });
  const cid = await host.evaluate(async () => { const it = (await GifOS.store.allItems()).find((x) => /^Chat\.gif/i.test(x.name || '')); return it ? it.fileId : null; });
  check('owner seeded the Chat app', !!cid, cid);
  if (!cid) { await browser.close(); process.exit(1); }
  await host.goto(BASE + '/run.html#id=' + encodeURIComponent(cid));
  await host.waitForSelector('iframe', { timeout: 30000 });
  await host.locator('.perm-modal .done').click({ timeout: 6000 }).catch(() => {});
  await host.waitForSelector('.perm-modal', { state: 'detached', timeout: 6000 }).catch(() => {});
  await host.evaluate(() => document.getElementById('appinvite').click());
  await host.waitForSelector('#inv-go', { timeout: 15000 });
  await host.evaluate(() => document.getElementById('inv-go').click());
  await host.waitForFunction(() => document.getElementById('share-url').value, null, { timeout: 30000 });
  const link = await host.locator('#share-url').inputValue();
  check('owner minted an owned invite link', /#s=|#j=/.test(link || ''));

  const view = (pg) => pg.evaluate(() => {
    let d = null; try { d = window.__gifosVideo.debugDump(); } catch (e) {}
    return d && d.me ? { seat: d.me.coord, occ: d.me.occ, links: d.me.links, state: d.me.state, parts: d.participants } : null;
  }).catch(() => null);

  // ---- the churn: guests that seat, then die before anyone links to them ----
  for (let i = 1; i <= GHOSTS; i++) {
    const c = await mk('Ghost' + i); const p = await c.newPage();
    await p.goto(link).catch(() => {});
    await sleep(KILL);
    await c.close().catch(() => {});   // abrupt, exactly like a killed tab
  }
  console.log('  host after ' + GHOSTS + ' ghosts (kill@' + KILL + 'ms): ' + JSON.stringify(await view(host)));

  // ---- and now somebody real tries to join -----------------------------------
  let ok = 0; const times = [];
  for (let i = 1; i <= REAL; i++) {
    const c = await mk('Real' + i); const p = await c.newPage();
    await p.goto(BASE + '/index.html').catch(() => {});
    await p.waitForSelector('.icon', { timeout: 30000 }).catch(() => {});
    const t0 = Date.now();
    await p.goto(link).catch(() => {});
    const got = await p.waitForSelector('iframe', { timeout: BUDGET }).then(() => true).catch(() => false);
    times.push(got ? Date.now() - t0 : -1); if (got) ok++;
    if (!got) console.log('    real' + i + ' STUCK ' + JSON.stringify(await view(p)) + ' | host ' + JSON.stringify(await view(host)));
    await c.close().catch(() => {});
  }

  check('a real guest still joins after ' + GHOSTS + ' guests died mid-placement',
    ok === REAL, { mounted: ok + '/' + REAL, ms: times });

  await browser.close().catch(() => {});
  console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED');
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.log('FAIL — suite threw: ' + String(e).slice(0, 200)); process.exit(1); });
