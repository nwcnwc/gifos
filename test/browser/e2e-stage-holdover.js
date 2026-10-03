// e2e-stage-holdover.js — A SLOW PULSE MUST NOT TEAR DOWN THE STAGE OR DROP
// A HAND (the G1 holdover, applied to the stage set, the hand queue and the
// vote tallies).
//
// A hidden tab beats every 12 s against a 15 s freshness window: one lost or
// late beat and a stager vanished from every phone's stage strip (teardown
// and rebuild for the whole room), a raised hand dropped out of the queue and
// re-entered at the back, and a standing vote blinked out of the tally. The
// roster and consent had already moved to stHold — fresh within 15 s, or held
// for HOLDOVER_MS while the peer honestly said away or transport still vouches
// for it — but stageIds(), handQueue() and stageVoteTallies() still read a
// bare 15 s compare, so a peer the roster kept was pulled off the stage.
//
// Measured here with three browsers — Ben steps up, Cyd raises a hand (a
// stager's own hand lowers itself on the beat, so the two roles are two
// people), then both pocket their phones: one away pulse, then silence:
//   1. Ann sees Ben on stage and Cyd in the hand queue
//   2. through 24 s of silence Ben never leaves Ann's stage set and Cyd never
//      leaves Ann's hand queue
//   3. the holdover EXPIRES: silent past 60 s, both are off (the backstop)
//   4. returning, Ben is back on stage and Cyd back in the queue
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + JSON.stringify(d) + ')' : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: [
    '--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const room = 'sthold' + Math.floor(Math.random() * 1e9).toString(36);
  const errs = [];
  const mk = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => { errs.push(name + ': ' + e.message); console.log('  [' + name + '] pageerror: ' + e.message); });
    await pg.goto(BASE + '/run.html#v=' + room);
    return pg;
  };
  const setAway = (pg, hidden) => pg.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { get: () => h, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => (h ? 'hidden' : 'visible'), configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  const halt = (pg, on) => pg.evaluate((v) => window.__gifosVideo.haltPulseForTest(v), on);

  const A = await mk('Ann'); await sleep(1500);
  const B = await mk('Ben'); await sleep(1500);
  const C = await mk('Cyd');
  const ALL = [['A', A], ['B', B], ['C', C]];
  for (let i = 0; i < 30; i++) {
    const st = [];
    for (const [n, pg] of ALL) st.push(n + '=' + await pg.evaluate(() => { try { return window.__gifosVideo.participants(); } catch (e) { return '?'; } }));
    if (st.every((x) => /=3/.test(x))) break;
    if (i === 29) { console.log('JOIN STALL:', st.join(' ')); process.exit(1); }
    await sleep(2000);
  }
  await sleep(2000);
  const benId = await B.evaluate(() => window.__gifosVideo.debugDump().me.peer);
  const cydId = await C.evaluate(() => window.__gifosVideo.debugDump().me.peer);
  const view = (pg) => pg.evaluate(([b, c]) => ({
    staged: window.__gifosVideo.stageIds().includes(b),
    hand: window.__gifosVideo.handQueue().some((e) => e.id === c),
  }), [benId, cydId]);

  // ---- 1: Ben steps up, Cyd raises a hand -----------------------------------
  await B.evaluate(() => window.__gifosVideo.setStageForTest(true));
  await A.waitForFunction((id) => window.__gifosVideo.stageIds().includes(id), benId, { timeout: 15000 });
  await C.evaluate(() => window.__gifosVideo.raiseHand(true));
  await A.waitForFunction((id) => window.__gifosVideo.handQueue().some((e) => e.id === id), cydId, { timeout: 15000 });
  check('Ann sees Ben on stage and Cyd in the hand queue', true);

  // ---- 2: both pocket their phones: honest away, then silence ---------------
  await setAway(B, true); await setAway(C, true);
  await sleep(1200); // the away pulses gossip out
  await halt(B, true); await halt(C, true);
  const haltAt = Date.now();
  let stageDips = 0, handDips = 0, polls = 0;
  while (Date.now() - haltAt < 24000) {
    const v = await view(A); polls++;
    if (!v.staged) stageDips++;
    if (!v.hand) handDips++;
    await sleep(1000);
  }
  check('Ben stays on Ann\'s stage through 24s of pulse silence (no strip teardown)', stageDips === 0, { polls, stageDips });
  check('Cyd\'s hand stays in Ann\'s queue through 24s of pulse silence', handDips === 0, { polls, handDips });

  // ---- 3: the holdover expires past 60s — the backstop ----------------------
  const untilExpiry = 66000 - (Date.now() - haltAt);
  if (untilExpiry > 0) await sleep(untilExpiry);
  const v3 = await view(A);
  check('silent past the 60s holdover, Ben is off the stage and Cyd out of the queue (backstop)', !v3.staged && !v3.hand, v3);

  // ---- 4: both return -------------------------------------------------------
  await halt(B, false); await setAway(B, false);
  await halt(C, false); await setAway(C, false);
  const back = await A.waitForFunction(([b, c]) => window.__gifosVideo.stageIds().includes(b) && window.__gifosVideo.handQueue().some((e) => e.id === c), [benId, cydId], { timeout: 20000 }).then(() => true).catch(() => false);
  check('returning, Ben is back on stage and Cyd back in the queue', back, await view(A));

  check('zero page errors', errs.length === 0, errs);
  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
