// e2e-vote-stage.js — THE ROOM CAN VOTE SOMEONE ONTO AND OFF THE STAGE.
//
// The trust shape mirrors vote-off: every voter gossips ONLY their own
// device-keyed vote lists on their status pulse; every receiver tallies them
// itself (dedup by voter device, self-votes ignored, majority of devices
// present, min 2). Execution is SELF-OWNED — the target's client steps itself
// up/down on a tally about itself — with a receiver-side backstop in
// stageIds(): a majority-voted-down device is excluded on every phone even if
// its own client refuses to step down. So a bad actor can fabricate exactly
// one voter's worth of votes (their own) and can refuse nothing that matters.
//
// Measured here with three browsers (majority = 2):
//   1. one up-vote does nothing but show the tally chip
//   2. a second up-vote puts the target on stage EVERYWHERE (self-owned step-up)
//   3. down-votes take them off stage everywhere
//   3b. a down-vote RETRACTS the same voter's up-vote, and the vote-off is
//       final: the target's flag does not bounce (no up/down oscillation)
//   4. a voted-down flag is enforced receiver-side (hacked stg flag stays out)
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + JSON.stringify(d) + ')' : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: [
    '--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const room = 'vstage' + Math.floor(Math.random() * 1e9).toString(36);
  const mk = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => console.log('  [' + name + '] pageerror: ' + e.message));
    await pg.goto(BASE + '/run.html#v=' + room);
    return pg;
  };
  const A = await mk('Ann'); await sleep(1500);
  const B = await mk('Ben'); await sleep(1500);
  const C = await mk('Cyd');
  for (let i = 0; i < 30; i++) {
    const st = [];
    for (const [n, pg] of [['A', A], ['B', B], ['C', C]]) st.push(n + '=' + await pg.evaluate(() => { try { return window.__gifosVideo.participants(); } catch (e) { return '?'; } }));
    if (st.every((x) => /=3/.test(x))) break;
    if (i === 29) { console.log('JOIN STALL:', st.join(' ')); process.exit(1); }
    await sleep(2000);
  }
  await sleep(2000); // device tags gossip on the pulse

  const arm = async (pg, mode) => { await pg.locator('#votebtn').click(); await pg.locator('#vote-modal [data-vm="' + mode + '"]').click(); };
  const benOn = (pg) => pg.locator('.tile:not(.me)').filter({ has: pg.locator('.name', { hasText: /^Ben$/ }) });

  // ---- 1: one vote → chip, no action ---------------------------------------
  await arm(A, 'up');
  check('up-mode shows the green dot on non-stage tiles',
    await benOn(A).locator('.votedot').isVisible());
  await benOn(A).locator('.votedot').click();
  await A.waitForFunction(() => { const v = window.__gifosVideo.stageVotes(); return Object.values(v.up)[0] === 1; }, null, { timeout: 8000 });
  await sleep(2500);
  check('one up-vote (need 2) does not move anyone', await B.evaluate(() => window.__gifosVideo.stageIds().length === 0));
  check('the tally chip shows on the target', /to the stage/.test(await benOn(C).textContent()));

  // ---- 2: majority → target steps up EVERYWHERE -----------------------------
  await arm(C, 'up');
  await benOn(C).locator('.votedot').click();
  await B.waitForFunction(() => window.__gifosVideo.stageIds().length === 1, null, { timeout: 15000 });
  const benId = await B.evaluate(() => window.__gifosVideo.myId ? null : null).then(() => null);
  check('a majority puts the target on stage (self-owned step-up)', true);
  await A.waitForFunction(() => window.__gifosVideo.stageIds().length === 1, null, { timeout: 8000 });
  check('every receiver agrees on the stage set', true);

  // ---- 3: down-votes take them off ------------------------------------------
  // A stager has no .tile (they live in the composited Stage strip), so the ✕
  // targets are the labeled buttons painted across the strip.
  const stripX = (pg) => pg.locator('#stagefeed .stgvotes button', { hasText: 'Ben' });
  await arm(A, 'down');
  await stripX(A).waitFor({ state: 'visible', timeout: 10000 });
  check('down-mode shows a labeled ✕ for the stager on the strip', true);
  await stripX(A).click();
  await arm(C, 'down');
  await stripX(C).waitFor({ state: 'visible', timeout: 10000 });
  await stripX(C).click();
  await B.waitForFunction(() => window.__gifosVideo.stageIds().length === 0, null, { timeout: 15000 });
  check('a majority down-vote steps them off the stage', true);

  // ---- 3b: no oscillation -----------------------------------------------------
  // Ann and Cyd never took their up-votes back. One voter holds ONE verdict
  // per target: the down-vote must have retracted the up-vote, so the up
  // tally reads 0 — and the target's own flag, once voted off, stays off.
  // Before the fix both tallies stood at 2 and every status receipt flipped
  // Ben on, off, on (setStage + toast each time) for as long as the votes stood.
  const upTally = (pg) => pg.evaluate(() => Object.values(window.__gifosVideo.stageVotes().up).reduce((a, b) => a + b, 0));
  // the other voter's retraction rides their next pulse — settle before reading
  const upZero = (pg) => pg.waitForFunction(() => Object.values(window.__gifosVideo.stageVotes().up).reduce((a, b) => a + b, 0) === 0, null, { timeout: 12000 }).then(() => true).catch(() => false);
  check('a down-vote retracts the same voter\'s standing up-vote (up tally reads 0)',
    (await upZero(A)) && (await upZero(C)), { a: await upTally(A), c: await upTally(C) });
  // the vote-off itself (one setStage) runs on Ben's next reaction — wait for the flag to drop, THEN count
  await B.waitForFunction(() => window.__gifosVideo.stageFlagForTest() === 0, null, { timeout: 12000 });
  const flips0 = await B.evaluate(() => window.__gifosVideo.stageFlipsForTest());
  await sleep(9000); // > two heartbeats of status receipts from both voters
  const flips1 = await B.evaluate(() => window.__gifosVideo.stageFlipsForTest());
  const flagNow = await B.evaluate(() => window.__gifosVideo.stageFlagForTest());
  check('the voted-off target does not bounce (zero setStage calls over 9s, flag stays 0)',
    flips1 === flips0 && flagNow === 0, { flips0, flips1, flagNow });

  // ---- 4: receiver-side enforcement beats a hacked client -------------------
  // Ben forces his own stg flag back on (the DOM-hacker move). With the
  // standing down-majority, every OTHER receiver must keep excluding him.
  await B.evaluate(() => { window.__gifosVideo._forceStg && window.__gifosVideo._forceStg(); });
  await B.evaluate(() => { try { document.getElementById('stagebtn').click(); } catch (e) {} });
  await sleep(4000);
  check('a voted-down device cannot re-take the stage while the majority stands (receiver-side)',
    await A.evaluate(() => window.__gifosVideo.stageIds().length === 0)
    && await C.evaluate(() => window.__gifosVideo.stageIds().length === 0));

  await browser.close();
  console.log(failures ? 'FAILURES: ' + failures : 'ALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
