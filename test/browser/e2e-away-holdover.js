// e2e-away-holdover.js — POCKETED PHONES MUST NOT DEGRADE THE ROOM (G1).
//
// A phone whose owner locks the screen and walks away says one honest
// `away: true` (visibilitychange fires before the freeze) and then its pulses
// stretch to 25-60s — long past the 15s freshness rule. Before G1 that meant:
// the whole password room re-blurred and FLAPPED on every late pulse, and the
// vote-majority `need` still counted the pocketed phones while their votes
// couldn't, deadlocking governance once half the room pocketed.
//
// Measured here with FIVE browsers in a password room (Ann, Ben, Cyd + Dee
// and Eve who pocket their phones — away pulse, then silence):
//   1. a fully consented password room reads consent=true everywhere
//   2. two pocketed phones: consent HOLDS (prior deliberate consent stands —
//      Nathan's call 2026-07-25) and holds STEADILY through the stale window
//   3. the roster never blinks — Dee and Eve stay participants (holdover)
//   4. vote need drops to a majority of the ENGAGED room: Ann+Cyd (2 of the
//      3 engaged) put Ben on stage — with the old need of 3 this cannot pass
//   5. a returning phone (Dee) re-engages cleanly, consent still true
//   6. the holdover EXPIRES: a phone silent past 60s (Eve) stops consenting —
//      the privacy backstop for hard-frozen phones — and re-consents on return
//   7. the heartbeat clock runs on a Worker (hbVia) and no page errors ever
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
const check = (n, c, d) => { console.log((c ? 'PASS' : 'FAIL') + ' — ' + n + (d !== undefined ? '  (' + JSON.stringify(d) + ')' : '')); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: [
    '--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const room = 'hold' + Math.floor(Math.random() * 1e9).toString(36);
  const PW = 'hold-pw';
  const errs = [];
  const mk = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => { errs.push(name + ': ' + e.message); console.log('  [' + name + '] pageerror: ' + e.message); });
    await pg.goto(BASE + '/meet.html#v=' + room);
    return pg;
  };
  const pwModalShown = (pg) => pg.evaluate(() => { const m = document.getElementById('pw-modal'); return !!m && getComputedStyle(m).display !== 'none'; });
  // Staggered, confirmed joins: on a loaded box the pw modal can lag well past
  // a one-shot fill — keep offering the password until THIS page is actually in.
  const joinWithPw = async (name, expectN) => {
    const pg = await mk(name);
    const t0 = Date.now();
    let iter = 0;
    while (Date.now() - t0 < 180000) {
      iter++;
      if (await pwModalShown(pg)) {
        try { await pg.locator('#pw-new').fill(PW); await pg.locator('#pw-save').click(); } catch (e) {}
      }
      const n = await pg.evaluate(() => { try { return window.__gifosVideo.participants(); } catch (e) { return 0; } });
      if (n >= expectN) { await sleep(2000); return pg; } // settle before the next arrival
      if (iter % 15 === 0) console.log('  … ' + name + ' joining: participants=' + n + ' modal=' + (await pwModalShown(pg))
        + ' relay=' + (await pg.evaluate(() => { try { return window.__gifosVideo.relayUpNow(); } catch (e) { return '?'; } })) + ' t=' + Math.round((Date.now() - t0) / 1000) + 's');
      await sleep(1200);
    }
    console.log('JOIN FAIL: ' + name + ' never reached ' + expectN);
    process.exit(1);
  };
  const dump = (pg) => pg.evaluate(() => window.__gifosVideo.debugDump());
  const setAway = (pg, hidden) => pg.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { get: () => h, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => (h ? 'hidden' : 'visible'), configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  const halt = (pg, on) => pg.evaluate((v) => window.__gifosVideo.haltPulseForTest(v), on);

  // ---- setup: Ann founds + locks; Ben..Eve join with the password -----------
  const A = await mk('Ann');
  await sleep(2500);
  await A.locator('#pwbtn').click();
  await A.locator('#pw-new').fill(PW);
  await A.locator('#pw-save').click();
  await A.waitForFunction(() => window.__gifosVideo.roomPw && window.__gifosVideo.roomPw() === 'hold-pw', null, { timeout: 10000 });
  const B = await joinWithPw('Ben', 2);
  const C = await joinWithPw('Cyd', 3);
  const D = await joinWithPw('Dee', 4);
  const E = await joinWithPw('Eve', 5);
  const ALL = [['A', A], ['B', B], ['C', C], ['D', D], ['E', E]];
  for (let i = 0; i < 40; i++) {
    const st = [];
    for (const [n, pg] of ALL) st.push(n + '=' + await pg.evaluate(() => { try { return window.__gifosVideo.participants(); } catch (e) { return '?'; } }));
    if (st.every((x) => /=5/.test(x))) break;
    if (i === 39) { console.log('JOIN STALL:', st.join(' ')); process.exit(1); }
    await sleep(2000);
  }
  // everyone consents: camera on + no blur (consent = deliberate clear)
  for (const [, pg] of ALL) { await pg.locator('#cam').click(); await pg.evaluate(() => window.__gifosVideo.setBlur(0)); }
  await A.waitForFunction(() => window.__gifosVideo.debugDump().consent === true, null, { timeout: 25000 });
  check('a fully consented password room reads consent=true', (await dump(C)).consent === true);
  check('the heartbeat clock is the Worker', (await dump(A)).hbVia === 'worker', (await dump(A)).hbVia);

  // ---- Dee and Eve pocket their phones: honest away, then silence ----------
  await setAway(D, true); await setAway(E, true);
  await sleep(1200); // the away pulse gossips out
  await halt(D, true); await halt(E, true);
  const haltAt = Date.now();

  // ---- through the stale window: consent + roster must hold STEADILY -------
  let consentDips = 0, rosterDips = 0, polls = 0;
  while (Date.now() - haltAt < 24000) {
    const d = await dump(A); polls++;
    if (d.consent !== true) consentDips++;
    if (d.roster.length !== 4) rosterDips++;
    await sleep(2000);
  }
  check('consent holds through 24s of pulse silence (no re-blur, no flap)', consentDips === 0, { polls, consentDips });
  check('the roster never blinks — pocketed phones stay participants', rosterDips === 0, { polls, rosterDips });
  const dA = await dump(A);
  check('the pocketed phones read away=true in the roster', dA.roster.filter((r) => r.away).length === 2);

  // ---- vote under away: need = majority of the ENGAGED room ----------------
  const needNow = await A.evaluate(() => window.__gifosVideo.stageVoteNeed());
  check('need dropped to the engaged majority (2, not 3)', needNow === 2, needNow);
  const arm = async (pg, mode) => { await pg.locator('#votebtn').click(); await pg.locator('#vote-modal [data-vm="' + mode + '"]').click(); };
  const benOn = (pg) => pg.locator('.tile:not(.me)', { hasText: 'Ben' });
  await arm(A, 'up'); await benOn(A).locator('.votedot').click();
  await arm(C, 'up'); await benOn(C).locator('.votedot').click();
  await B.waitForFunction(() => window.__gifosVideo.stageIds().length === 1, null, { timeout: 20000 });
  check('2 engaged votes of 3 put Ben on stage while 2 phones are pocketed', true);

  // ---- Dee comes back: clean re-engage, consent unchanged ------------------
  await halt(D, false); await setAway(D, false);
  await A.waitForFunction(() => { const r = window.__gifosVideo.debugDump().roster; const dee = r.find((x) => x.name === 'Dee'); return !!dee && dee.away === false && dee.stAge <= 6; }, null, { timeout: 15000 });
  check('a returning phone re-engages (fresh pulses, away cleared)', true);
  check('consent still true after the return', (await dump(A)).consent === true);

  // ---- the holdover EXPIRES: Eve silent past 60s stops consenting ----------
  const untilExpiry = 66000 - (Date.now() - haltAt);
  if (untilExpiry > 0) await sleep(untilExpiry);
  check('a phone silent past the 60s holdover no longer consents (backstop)',
    (await dump(A)).consent === false);
  await halt(E, false); await setAway(E, false);
  await A.waitForFunction(() => window.__gifosVideo.debugDump().consent === true, null, { timeout: 20000 });
  check('…and re-consents the moment it returns', true);

  check('zero page errors across the whole scenario', errs.length === 0, errs);
  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
