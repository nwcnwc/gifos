// e2e-stage-cap-race.js — A STEP-UP THE CAP EXCLUDES MUST NOT STAY ARMED.
//
// The Stage is derived bookkeeping: every phone sorts the gossiped stg claims
// and keeps the C earliest (stageIds). The step-up button's "stage is full"
// check is LOCAL and racy — two people tapping in the same moment both pass
// it, and the later claim is sliced off on every phone, including its owner's.
// Before the fix nothing cleared that loser's flag: the button read 'Stage'
// (nothing painted) while myStatus.stg stayed set, the next tap silently
// stepped DOWN instead of up, and minutes later — when any stager stepped
// down — the stale claim's earlier timestamp put the loser's camera on stage
// for the whole room with no act of theirs.
//
// Measured here at GIFOS_SCALE C=2 (a two-seat stage) with three browsers
// that all step up within ~200 ms:
//   1. every phone agrees on the same two stagers
//   2. the excluded phone's flag clears by itself (two beats of steady
//      exclusion) and the status line says the stage was full
//   3. when a stager steps down the excluded phone does NOT enter unbidden
//   4. a deliberate tap now steps it up (the button was never half-armed)
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + JSON.stringify(d) + ')' : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: [
    '--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const room = 'caprace' + Math.floor(Math.random() * 1e9).toString(36);
  const errs = [];
  const mk = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}; window.GIFOS_SCALE={C:2};" });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => { errs.push(name + ': ' + e.message); console.log('  [' + name + '] pageerror: ' + e.message); });
    await pg.goto(BASE + '/run.html#v=' + room);
    return pg;
  };
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
  const ids = {};
  for (const [n, pg] of ALL) ids[n] = await pg.evaluate(() => window.__gifosVideo.debugDump().me.peer);
  const stageOf = (pg) => pg.evaluate(() => window.__gifosVideo.stageIds());
  const flagOf = (pg) => pg.evaluate(() => window.__gifosVideo.stageFlagForTest());
  const labelOf = (pg) => pg.evaluate(() => document.getElementById('status').textContent);

  // ---- the race: three step-ups inside one beat, two seats -----------------
  await Promise.all(ALL.map(([, pg]) => pg.evaluate(() => window.__gifosVideo.setStageForTest(true))));
  await sleep(6000); // every claim has gossiped; every phone has sliced
  const sets = {};
  for (const [n, pg] of ALL) sets[n] = (await stageOf(pg)).slice().sort().join(',');
  const agreed = sets.A === sets.B && sets.B === sets.C && sets.A.split(',').length === 2;
  check('every phone agrees on the same two stagers (C=2)', agreed, sets);
  if (!agreed) { await browser.close(); process.exit(1); }
  const staged = sets.A.split(',');
  const loser = ALL.find(([n]) => !staged.includes(ids[n]));
  const winner = ALL.find(([n]) => staged.includes(ids[n]));
  console.log('  excluded: ' + loser[0] + '  a stager: ' + winner[0]);

  // ---- 2: the excluded claim clears itself ----------------------------------
  let cleared = false, label = '';
  const t0 = Date.now();
  while (Date.now() - t0 < 20000) {
    if ((await flagOf(loser[1])) === 0) { cleared = true; break; }
    await sleep(500);
  }
  label = await labelOf(loser[1]);
  check('the excluded phone\'s stage flag clears by itself (within 20s)', cleared, { flag: await flagOf(loser[1]), after: Date.now() - t0 });
  check('…and the status line says the stage was full', /full/i.test(label), label);

  // ---- 3: a stager steps down — the stale claim must not walk in -------------
  await winner[1].evaluate(() => window.__gifosVideo.setStageForTest(false));
  await sleep(8000);
  const after = {};
  for (const [n, pg] of ALL) after[n] = await stageOf(pg);
  const loserIn = Object.values(after).some((s) => s.includes(ids[loser[0]]));
  check('the excluded phone does NOT enter the stage when a seat frees', !loserIn, after);
  check('the stage now holds exactly the one remaining stager, everywhere',
    Object.values(after).every((s) => s.length === 1 && !s.includes(ids[winner[0]])), after);

  // ---- 4: a deliberate tap steps up cleanly ---------------------------------
  await loser[1].locator('#stagebtn').click();
  await A.waitForFunction((id) => window.__gifosVideo.stageIds().includes(id), ids[loser[0]], { timeout: 15000 }).then(() => true).catch(() => false);
  check('a deliberate tap on the freed seat steps the phone up (the button was not half-armed)',
    (await stageOf(A)).includes(ids[loser[0]]) && (await flagOf(loser[1])) > 0);

  check('zero page errors', errs.length === 0, errs);
  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
