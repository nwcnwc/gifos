// Hand-queue e2e — the room-wide raised-hand line (docs/meeting.md, "The hand
// queue"): raise/lower through the real button; every client derives the SAME
// order (raise time, then id — including a forced same-millisecond tie); the
// one-line banner (first 8 names + overflow) repaints on change only; a hand
// AUTO-LOWERS the moment its owner enters stageIds() (open-room self step-up
// AND admin call-up); ADMIN rooms: a signed-in admin taps a queued name to
// issue the existing signed stage/app grant (§SIG) — the grantee steps onto
// the Stage by itself and its hand lowers; a non-admin's tap does nothing and
// a FORGED grant is refused by every receiver (only the signed table merges);
// a grant that predates the raise is standing rights, never a call-up.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = process.env.MEET_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
// PHASE=open|admin|all (default all) — lets a starved box run the halves
// separately; SKIP_OVERFLOW=1 skips the 10-client overflow leg.
const PHASE = process.env.PHASE || 'all';
const SKIP_OVERFLOW = !!process.env.SKIP_OVERFLOW;

let failures = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--disable-gpu', '--mute-audio', '--disable-dev-shm-usage',
      '--process-per-site'], // all pages are one origin ⇒ one shared renderer — the 10-client overflow leg fits a small box
  });
  const setup = (name) => ({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
  const newUser = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'], viewport: { width: 360, height: 640 } });
    await ctx.addInitScript(setup(name));
    return ctx;
  };
  const open = async (ctx, label, hash) => {
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => console.log('  [' + label + ' pageerror]', e.message));
    // a loaded box can take a while to boot a page — patient, in two stages
    await pg.goto(BASE + '/meet.html#' + hash, { timeout: 90000, waitUntil: 'domcontentloaded' });
    await pg.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 60000 });
    return pg;
  };
  const myIdOf = (pg) => pg.evaluate(() => window.__gifosVideo.debugDump().me.peer);
  const qNames = (pg) => pg.evaluate(() => window.__gifosVideo.handQueue().map((e) => e.name));
  const qIds = (pg) => pg.evaluate(() => window.__gifosVideo.handQueue().map((e) => e.id));
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  // Tap a queued name in the banner (the .hq span) from this page. The banner
  // paints on the 2s beat, so wait for the span before clicking.
  const bannerTap = async (pg, id) => {
    await pg.waitForFunction((pid) => !!document.querySelector('#handq .hq[data-id="' + pid + '"]'), id, { timeout: 15000 });
    return pg.evaluate((pid) => { document.querySelector('#handq .hq[data-id="' + pid + '"]').click(); return true; }, id);
  };

  // ============================ OPEN ROOM ============================
  if (PHASE !== 'admin') {
  const room = 'hq' + Math.floor(Math.random() * 1e9).toString(36);
  const A = await newUser('Ada'); const a = await open(A, 'a', 'v=' + room);
  const B = await newUser('Ben'); const b = await open(B, 'b', 'v=' + room);
  const C = await newUser('Cal'); const c = await open(C, 'c', 'v=' + room);
  for (const pg of [a, b, c]) await pg.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 40000 });
  const [aId, bId] = [await myIdOf(a), await myIdOf(b)];
  check('open room: three peers meshed', !!aId && !!bId);

  // ---- raise via the button, staggered; everyone derives the same order ----
  await b.locator('#hand').click();
  check('the Hand button flips to "Lower hand" for the raiser',
    (await b.locator('#hand').textContent()) === 'Lower hand'
    && (await b.evaluate(() => window.__gifosVideo.handRaised())));
  await a.waitForFunction(() => window.__gifosVideo.handQueue().length === 1, null, { timeout: 15000 });
  await sleep(400); // stagger: Ben strictly first, then Ada
  await a.locator('#hand').click();
  for (const pg of [a, b, c]) await pg.waitForFunction(() => window.__gifosVideo.handQueue().length === 2, null, { timeout: 15000 });
  const [na, nb, nc] = [await qNames(a), await qNames(b), await qNames(c)];
  check('staggered raises: every client derives the SAME order (raise time)',
    same(na, ['Ben', 'Ada']) && same(nb, na) && same(nc, na));
  // The banner paints on the 2s beat — the DOM converges a beat after the queue.
  await c.waitForFunction(() => /✋ 2 waiting: Ben, Ada/.test(window.__gifosVideo.handqText()), null, { timeout: 15000 });
  check('the banner is shown and names the queue in order (head in bold)',
    (await c.evaluate(() => window.__gifosVideo.handqShown()))
    && (await c.evaluate(() => document.querySelector('#handq b').textContent)) === 'Ben');

  // ---- lower via the button ----
  await b.locator('#hand').click(); // Ben lowers
  for (const pg of [a, b, c]) await pg.waitForFunction(() => window.__gifosVideo.handQueue().length === 1, null, { timeout: 15000 });
  check('lowering removes only that hand; the queue re-derives everywhere',
    same(await qNames(c), ['Ada']));

  // ---- the deterministic tie-break: same millisecond ⇒ id order ----
  await a.evaluate(() => window.__gifosVideo.raiseHand(false));
  for (const pg of [a, b, c]) await pg.waitForFunction(() => window.__gifosVideo.handQueue().length === 0, null, { timeout: 15000 });
  await c.waitForFunction(() => !window.__gifosVideo.handqShown(), null, { timeout: 15000 });
  check('all hands down ⇒ the banner hides (next beat)', true);
  const T = Date.now();
  await a.evaluate((t) => window.__gifosVideo.raiseHandAtForTest(t), T);
  await b.evaluate((t) => window.__gifosVideo.raiseHandAtForTest(t), T);
  for (const pg of [a, b, c]) await pg.waitForFunction(() => window.__gifosVideo.handQueue().length === 2, null, { timeout: 15000 });
  const tieExpect = [aId, bId].sort();
  check('a same-millisecond tie breaks on id, identically everywhere',
    same(await qIds(a), tieExpect) && same(await qIds(b), tieExpect) && same(await qIds(c), tieExpect));
  for (const pg of [a, b]) await pg.evaluate(() => window.__gifosVideo.raiseHand(false));

  // ---- AUTO-LOWER: open-room self step-up clears my own hand ----
  await a.locator('#hand').click();
  await c.waitForFunction(() => window.__gifosVideo.handQueue().length === 1, null, { timeout: 15000 });
  await a.locator('#stagebtn').click();
  await c.waitForFunction((id) => window.__gifosVideo.stageIds().includes(id), aId, { timeout: 15000 });
  check('self step-up seats her on every receiver\'s stage', true);
  check('…and HER OWN client lowered her hand at the step-up (self-owned)',
    !(await a.evaluate(() => window.__gifosVideo.handRaised()))
    && (await a.locator('#hand').textContent()) === 'Hand');
  await c.waitForFunction(() => window.__gifosVideo.handQueue().length === 0, null, { timeout: 15000 });
  await c.waitForFunction(() => !window.__gifosVideo.handqShown(), null, { timeout: 15000 });
  check('the answered hand left the queue (and banner) on every client', true);
  await a.evaluate(() => window.__gifosVideo.setStageForTest(false));

  // ---- banner overflow: 10 raised hands ⇒ first 8 names + "+2" ----
  if (!SKIP_OVERFLOW) {
  const extras = [];
  for (let i = 0; i < 7; i++) {
    const ctx = await newUser('Guest' + i);
    try { extras.push({ ctx, pg: await open(ctx, 'g' + i, 'v=' + room) }); }
    catch (err) { console.log('  [overflow] guest ' + i + ' failed to OPEN (starved box) — proceeding'); await ctx.close().catch(() => {}); }
    await sleep(300); // ramp — be kind to the walk on a loaded box
  }
  // A thrashing CI box can strand one straggler mid-join — proceed once ≥6 of
  // the 7 meshed (≥9 raised hands still overflows the 8-name banner).
  const meshed = [];
  const deadline = Date.now() + 180000;
  for (const { pg } of extras) {
    try {
      await pg.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: Math.max(5000, deadline - Date.now()) });
      meshed.push(pg);
    } catch (err) { console.log('  [overflow] a guest failed to mesh in time — proceeding without it'); }
  }
  check('overflow leg: enough clients meshed (' + (3 + meshed.length) + '/10, need 9)', meshed.length >= 6);
  const raisers = [a, b, c, ...meshed];
  const NR = raisers.length;
  // Every raiser must be KNOWN to the observers first, or early queues are partial.
  for (const pg of [a, b]) await pg.waitForFunction((n) => window.__gifosVideo.totalCount() >= n, NR, { timeout: 120000 });
  for (const pg of raisers) { await pg.evaluate(() => window.__gifosVideo.raiseHand(true)); await sleep(200); }
  for (const pg of [a, b]) await pg.waitForFunction((n) => window.__gifosVideo.handQueue().length >= n, Math.min(NR, 9), { timeout: 60000 });
  // Under heavy load the mesh churns mid-assert (roster flux ⇒ transient queue
  // divergence between observers) — wait for the two to AGREE, then assert.
  let oa = [], ob = [];
  const agreeBy = Date.now() + 60000;
  for (;;) {
    [oa, ob] = [await qIds(a), await qIds(b)];
    if ((oa.length >= 9 && same(oa, ob)) || Date.now() > agreeBy) break;
    await sleep(1000);
  }
  if (!same(oa, ob)) console.log('  [overflow] observer queues diverged:\n   a: ' + oa.join(',') + '\n   b: ' + ob.join(','));
  check(NR + ' raised hands: two observers converge on the IDENTICAL ordered queue (saw ' + oa.length + ')',
    oa.length >= 9 && same(oa, ob));
  // The banner mirrors the derived queue: first 8 names + a '+K' overflow.
  await a.waitForFunction(() => {
    const q = window.__gifosVideo.handQueue(), t = window.__gifosVideo.handqText();
    return q.length > 8 && new RegExp('✋ ' + q.length + ' waiting:.*, \\+' + (q.length - 8) + '$').test(t);
  }, null, { timeout: 30000 });
  check('the banner shows the first 8 + overflow (+K)',
    (await a.evaluate(() => document.querySelectorAll('#handq .hq').length)) === 8);
  for (const { ctx } of extras) await ctx.close();
  } // SKIP_OVERFLOW
  await a.close(); await b.close(); await c.close();
  await A.close(); await B.close(); await C.close();
  } // PHASE open

  if (PHASE !== 'open') {

  // ============================ ADMIN ROOM ============================
  const admRoom = 'hqadm' + Math.floor(Math.random() * 1e9).toString(36);
  const ADMIN_PW = 'hunter2!';
  const D = await newUser('Dana'); const d = await D.newPage();
  d.on('pageerror', () => {});
  await d.goto(BASE + '/meet.html');
  const av = await d.evaluate(async ([roomId, pw]) => {
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode('gifos-admin:' + roomId), iterations: 310000 }, km, 256);
    const K = Array.from(new Uint8Array(bits)).map((x) => x.toString(16).padStart(2, '0')).join('');
    const V = (await GifOS.net.edKeysFromSeedHex(K)).verifier;
    localStorage.setItem('gifos_vadm_' + roomId + '.' + V, K);
    return V;
  }, [admRoom, ADMIN_PW]);
  await d.goto(BASE + '/meet.html#v=' + admRoom + '&av=' + av);
  await d.reload(); // hash-only navigation doesn't re-boot the page
  await d.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.amAdmin(), null, { timeout: 90000 });
  const E = await newUser('Eve'); const e = await open(E, 'e', 'v=' + admRoom + '&av=' + av);
  const F = await newUser('Finn'); const f = await open(F, 'f', 'v=' + admRoom + '&av=' + av);
  for (const pg of [d, e, f]) await pg.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 60000 });
  for (const pg of [e, f]) await pg.waitForFunction(() => window.__gifosVideo.adminsHere().length >= 1, null, { timeout: 60000 });
  const eId = await myIdOf(e), fId = await myIdOf(f);
  check('admin room up: Dana signed in, Eve + Finn seated', await d.evaluate(() => window.__gifosVideo.amAdmin()));

  // ---- Eve then Finn raise; the admin's banner is actionable, a guest's is not ----
  await e.locator('#hand').click();
  await d.waitForFunction(() => window.__gifosVideo.handQueue().length === 1, null, { timeout: 15000 });
  await sleep(400);
  await f.locator('#hand').click();
  for (const pg of [d, e, f]) await pg.waitForFunction(() => window.__gifosVideo.handQueue().length === 2, null, { timeout: 15000 });
  check('admin sees the queue in raise order', same(await qNames(d), ['Eve', 'Finn']));
  for (const pg of [d, f]) await pg.waitForFunction(() => !!document.querySelector('#handq .hq'), null, { timeout: 15000 });
  check('queued names are tappable for the ADMIN only (cursor affordance)',
    (await d.evaluate(() => getComputedStyle(document.querySelector('#handq .hq')).cursor)) === 'pointer'
    && (await f.evaluate(() => getComputedStyle(document.querySelector('#handq .hq')).cursor)) !== 'pointer');

  // ---- a NON-ADMIN tap does nothing ----
  check('non-admin banner tap dispatched', await bannerTap(f, eId));
  await sleep(2500);
  check('…and changed nothing: Eve has no stage right, no stage seat anywhere',
    !(await e.evaluate(() => window.__gifosVideo.canStageNow()))
    && !(await d.evaluate((id) => window.__gifosVideo.stageIds().includes(id), eId)));

  // ---- a FORGED grant (past the local guard) is refused by every receiver ----
  await f.evaluate((id) => window.__gifosVideo.forgeModForTest(id, 'app'), eId);
  await sleep(2500);
  check('a guest\'s forged app grant is refused at every receiver (§SIG)',
    !(await e.evaluate(() => window.__gifosVideo.canStageNow()))
    && !(await e.evaluate(() => window.__gifosVideo.modOn('me', 'app')))
    && !(await d.evaluate((id) => { const m = window.__gifosVideo; return m.stageIds().includes(id); }, eId)));

  // ---- the ADMIN taps Eve in the queue: signed grant → call-up → auto-lower ----
  check('admin banner tap dispatched', await bannerTap(d, eId));
  await e.waitForFunction(() => window.__gifosVideo.canStageNow(), null, { timeout: 15000 });
  check('the tap issued the signed stage/app grant end-to-end', true);
  for (const pg of [d, e, f]) await pg.waitForFunction((id) => window.__gifosVideo.stageIds().includes(id), eId, { timeout: 15000 });
  check('the called-up grantee stepped onto the Stage on EVERY client', true);
  await e.waitForFunction(() => !window.__gifosVideo.handRaised(), null, { timeout: 15000 });
  check('…and her own client auto-lowered her hand', true);
  for (const pg of [d, e, f]) await pg.waitForFunction(() => window.__gifosVideo.handQueue().length === 1, null, { timeout: 15000 });
  check('the queue re-derives to just Finn everywhere', same(await qNames(d), ['Finn']));

  // ---- a grant that PREDATES the raise is standing rights, never a call-up ----
  await f.locator('#hand').click(); // Finn lowers
  for (const pg of [d, f]) await pg.waitForFunction(() => window.__gifosVideo.handQueue().length === 0, null, { timeout: 15000 });
  await d.evaluate((id) => window.__gifosVideo.grantApp(id, true), fId); // standing grant, hand DOWN
  await f.waitForFunction(() => window.__gifosVideo.canStageNow(), null, { timeout: 15000 });
  await sleep(2500); // let the beat consume the grant timestamp
  await f.locator('#hand').click(); // NOW he raises
  await d.waitForFunction(() => window.__gifosVideo.handQueue().length === 1, null, { timeout: 15000 });
  await sleep(3000); // two beats: must NOT auto-step
  check('a pre-existing grant does not yank a later-raised hand onto the Stage',
    !(await f.evaluate(() => window.__gifosVideo.onStage()))
    && (await f.evaluate(() => window.__gifosVideo.handRaised())));
  // …but a FRESH tap on his queued name calls him up (re-grant = new timestamp)
  await bannerTap(d, fId);
  // one window covers grant → async signature re-mint (2s beat) → heartbeat
  // gossip → grantee's self step-up → stg gossip back: be generous
  await f.waitForFunction(() => window.__gifosVideo.onStage(), null, { timeout: 30000 });
  for (const pg of [d, e]) await pg.waitForFunction((id) => window.__gifosVideo.stageIds().includes(id), fId, { timeout: 30000 });
  await f.waitForFunction(() => !window.__gifosVideo.handRaised(), null, { timeout: 15000 });
  check('a fresh admin tap on the queued name calls him up and lowers the hand', true);
  } // PHASE admin

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
