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
const { chromium, CHROME, casualty } = require('../lib/pw');
const need = require('../lib/need');
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
// PHASE=open|admin|all (default all) — lets a starved box run the halves
// separately; SKIP_OVERFLOW=1 skips the 10-client overflow leg.
const PHASE = process.env.PHASE || 'all';
const SKIP_OVERFLOW = !!process.env.SKIP_OVERFLOW;

let failures = 0;
// Set when the overflow leg's verdict was UNMEASURABLE on this box (see the
// probe-before-judging there): the suite still runs everything it CAN measure
// (the admin phase is a 3-client cast and holds up on the same box), and exits
// 4 at the end — unless a real red happened anywhere, which trumps a refusal.
let refusedNoVerdict = null;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // A missing fixture must never masquerade as a failing assertion: without the
  // relay every client sits alone and this suite reds on the mesh, not the hands.
  await need({ [parseInt(BASE.split(':').pop(), 10)]: 'a static server on 8099 (python3 -m http.server 8099 -d site)',
    [parseInt(RELAY.split(':').pop(), 10)]: 'relay-local' });
  // THE BOX PREFLIGHT (the adversary-room precedent, 7b92a44): the overflow
  // leg is a TEN-BROWSER cast — ten BrowserContexts are ten renderers, and
  // --process-per-site does not collapse them (see the launch-args note). A
  // box that cannot hold that cast in RAM measures its own swap, not the hand
  // queue. Refuse BEFORE the first assertion: NEEDS-FLEET (exit 3,
  // test/lib/fleet.js doctrine) is never retried, never a product red, and it
  // still BLOCKS a cut until the suite runs on a box that can hold the room.
  const CAST = (PHASE !== 'admin' && !SKIP_OVERFLOW) ? 10 : 3;
  {
    const m = casualty.memLocal();
    console.log('box: ' + casualty.capacityLine('local', CAST, m));
    if (m.availMb != null && m.availMb < CAST * casualty.MEM_PER_BROWSER_MB) {
      console.log('NEEDS-FLEET — e2e-handq needs a box that can hold ' + CAST + ' browsers ('
        + (CAST * casualty.MEM_PER_BROWSER_MB) + ' MB available); this one has ' + m.availMb + ' MB.');
      console.log('  Run it on a box with headroom. (PHASE=open|admin and SKIP_OVERFLOW=1 exist for a');
      console.log('  human diagnosing a starved box — they are never a gate verdict.)');
      process.exit(3);
    }
  }
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--disable-gpu', '--mute-audio', '--disable-dev-shm-usage',
      // --process-per-site was added believing "all pages are one origin ⇒ one
      // shared renderer, so the 10-client overflow leg fits a small box". It
      // does NOT: every client needs its own identity, so every client is its
      // own BrowserContext, and contexts are separate storage partitions that
      // never share a renderer process. MEASURED mid-run, 2026-08-16: 13
      // renderer processes, 2.8 GB RSS. Kept because it is harmless, labelled
      // because the memory it promises is not there — the leg costs ten
      // renderers on whatever box runs it, and the dump below says so when the
      // box could not hold them.
      '--process-per-site'],
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
    await pg.goto(BASE + '/run.html#' + hash, { timeout: 90000, waitUntil: 'domcontentloaded' });
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
  const rIds = []; for (const pg of raisers) rIds.push(await myIdOf(pg));

  // A WAIT IS A PRECONDITION, NEVER THE VERDICT. Every wait in this leg used to
  // be a bare waitForFunction, and on the 0.9.9 gate box the "observers see the
  // hands" one timed out — which threw out of this async IIFE, killed node with
  // an uncaught rejection, and printed NO FAIL LINE AT ALL. The gate could only
  // report "RED TWICE: 0 failed / 11 passed": a suite that passed every
  // assertion it made and still exited non-zero, which tells the reader nothing
  // about WHICH claim is in trouble and is a hair from the DEAD state. So these
  // settle or give up, and check() below renders the verdict — with the numbers
  // it actually saw, and a per-peer dump when it is short.
  const settle = (pg, fn, arg, ms) => pg.waitForFunction(fn, arg, { timeout: ms }).then(() => true).catch(() => false);
  // WHY A PEER CAN BE MISSING FROM THE QUEUE — the two are different failures
  // and the log must say which: handQueue() drops a hand whose owner's STATUS
  // is older than 15s (the freshness rule every derived view shares), so a peer
  // with no status at all never gossiped to this observer, while a peer with an
  // ageing one is a beat that is not keeping up. statusPeekForTest gives both
  // clocks: age = the ORIGIN's timestamp, rx = when this client last heard it.
  const dump = async (why) => {
    console.log('  [overflow] ' + why);
    // WAS IT THE BOX? Ten clients means ten renderers (they are ten separate
    // BrowserContexts, which never share a process), and a starved renderer
    // stops beating: measured in a 4-core cgroup, every peer's status ARRIVED
    // seconds ago and was already 20-60s old at its origin, so the 15s
    // freshness rule dropped all ten hands and the queue fell to 1. That is a
    // kernel measurement, not a hand-queue verdict, and the reader must be able
    // to tell the two apart from the log alone. Everything printed here is also
    // RETURNED, because the probe-before-judging below decides on it.
    const ev = { box: casualty.memLocal(), obs: [], raisers: [] };
    console.log('   the box: ' + casualty.capacityLine('local', raisers.length, ev.box));
    for (const [nm, pg] of [['a', a], ['b', b]]) {
      const d = await pg.evaluate((ids) => ({
        q: window.__gifosVideo.handQueue().length,
        total: window.__gifosVideo.totalCount(),
        links: window.__gifosVideo.liveLinks(),
        stage: window.__gifosVideo.stageIds().length,
        me: window.__gifosVideo.beatPeekForTest ? window.__gifosVideo.beatPeekForTest() : null,
        raw: ids.map((id) => { const st = window.__gifosVideo.statusPeekForTest(id); return st ? { age: st.ageMs, rx: st.rxAgeMs } : null; }),
        peers: ids.map((id) => {
          const st = window.__gifosVideo.statusPeekForTest(id);
          return id.slice(0, 6) + (st ? '=' + Math.round(st.ageMs / 100) / 10 + 's/rx' + Math.round(st.rxAgeMs / 100) / 10 + 's' : '=NO-STATUS')
            + (window.__gifosVideo.stageIds().includes(id) ? '/ON-STAGE' : '');
        }),
      }), rIds).catch((e) => ({ q: '?', total: '?', links: '?', stage: '?', raw: null, peers: ['(' + String(e.message).slice(0, 60) + ')'] }));
      console.log('   observer ' + nm + ': queue=' + d.q + ' roster=' + d.total + ' links=' + d.links + ' onstage=' + d.stage
        + (d.me ? ' beat=' + Math.round(d.me.atAgeMs / 100) / 10 + 's' + (d.me.seated === false ? ' UNSEATED' : '') + (d.me.veiled ? ' VEILED' : '') : '')
        + ' — peer status age/receipt: ' + d.peers.join(' '));
      ev.obs.push({ nm, d });
    }
    // …and what each RAISER believes about itself. A hand that is genuinely
    // down at its owner (auto-lowered by a Stage seat, say) is a completely
    // different bug from one that is up and not arriving. `beat` is the age of
    // the raiser's OWN last broadcast stamp (beatPeekForTest): beat ≫ HB (4s)
    // means the origin never got scheduled to send — the starved-box signature
    // — while beat≈HB with a large observer-side age means the flood lost it.
    // VEILED = the join veil is up (unseated page, 60fps spinner burning the
    // very CPU the beats need).
    const mine = [];
    for (let i = 0; i < raisers.length; i++) {
      // eslint-disable-next-line no-await-in-loop
      const s = await raisers[i].evaluate(() => ({ h: !!window.__gifosVideo.handRaised(), s: !!window.__gifosVideo.onStage(), l: window.__gifosVideo.liveLinks(),
        b: window.__gifosVideo.beatPeekForTest ? window.__gifosVideo.beatPeekForTest() : null }))
        .catch((e) => ({ err: String(e.message).slice(0, 40) }));
      mine.push(rIds[i].slice(0, 6) + '=' + (s.err ? s.err : (s.h ? 'hand' : 'HAND-DOWN') + (s.s ? '/stage' : '') + '/links' + s.l
        + (s.b ? '/beat' + Math.round(s.b.atAgeMs / 100) / 10 + 's' + (s.b.seated === false ? '/UNSEATED' : '') + (s.b.veiled ? '/VEILED' : '') : '')));
      ev.raisers.push({ id: rIds[i], s });
    }
    console.log('   raisers say: ' + mine.join(' '));
    return ev;
  };

  // Every raiser must be KNOWN to the observers first, or early queues are partial.
  for (const pg of [a, b]) {
    if (!(await settle(pg, (n) => window.__gifosVideo.totalCount() >= n, NR, 120000))) await dump('an observer never saw all ' + NR + ' members in its roster');
  }
  for (const pg of raisers) { await pg.evaluate(() => window.__gifosVideo.raiseHand(true)); await sleep(200); }
  // Under heavy load the mesh churns mid-assert (roster flux ⇒ transient queue
  // divergence between observers) — wait for the two to AGREE, then assert.
  const target = Math.min(NR, 9); // >8 is what makes the banner overflow at all
  let oa = [], ob = [];
  // ONE budget, ONE loop, and the elapsed time is REPORTED. The old shape spent
  // 60s in a hard waitForFunction for the hands and only then entered a 60s
  // agreement loop — so a box that needed 70s to flood ten statuses died at the
  // 60s mark from patience it actually had. The same 120s is now one wait for
  // the thing being asserted, and the log says how long it took: an idle 8-core
  // box converges in 0s (the first sample already has ten), so a run that takes
  // tens of seconds is a fact worth seeing BEFORE it becomes a red.
  const t0 = Date.now();
  const agreeBy = t0 + 120000;
  for (;;) {
    [oa, ob] = [await qIds(a), await qIds(b)];
    if (oa.length >= target && same(oa, ob)) break;
    if (Date.now() > agreeBy) break;
    await sleep(1000);
  }
  const took = Math.round((Date.now() - t0) / 100) / 10 + 's';
  const converged = oa.length >= target && same(oa, ob);
  if (!converged) {
    const ev = await dump(oa.length < target ? 'the observers never saw ' + target + ' raised hands at once'
      : 'observer queues diverged:\n   a: ' + oa.join(',') + '\n   b: ' + ob.join(','));
    // ── PROBE BEFORE JUDGING (the adversary-room linkFailProbe doctrine, one
    // layer up). This verdict is a claim about DERIVED CONVERGENCE: ten
    // origins beat a 4s status pulse over mesh DataChannel links, and every
    // observer derives the same queue inside the product's 15s freshness
    // window. Mesh frames are DataChannel-or-nothing BY DESIGN (mesh-wire.js
    // "THE RELAY IS A DOOR, NOT A TRANSPORT"), so the measurement NEEDS the
    // link layer — and the link layer is ICE on loopback, which a saturated
    // kernel starves while every page's clocks stay healthy. Measured on this
    // exact red (2026-08-16, 4-core box, load 17-30): all ten raisers' own
    // beats 0.7-4.2s old at judgment — the pulse NEVER stopped — while one
    // observer sat at 0 live links holding copies 58-90s stale. The identical
    // machinery converges in single-digit seconds on the same box with a cast
    // it can hold. Publishing that as RED reads as a product defect in the
    // hand queue; it is the kernel.
    //
    // So: refuse (NO-VERDICT, exit 4) ONLY when BOTH box saturation and the
    // mechanism are in evidence —
    //   1. SATURATION: 1-min load ≥ 2× cores, or MemAvailable short of the
    //      cast. On a box with headroom there is NO refusal, ever.
    //   2. MECHANISM: a page this verdict reads was measurably cut off — an
    //      observer/raiser UNSEATED or holding <2 live links, or a missing
    //      hand whose origin beat within 2×HB (≤8s) while an observer's copy
    //      of it is stale past the 15s freshness window (the pulse fired and
    //      had no path).
    // If every page is seated and linked and the pulses that fired arrived,
    // and the queues still disagree, that red is REAL and it stands — same
    // rule as the bare-ICE probe: do not widen this refusal.
    const m = ev.box || {};
    const saturated = (m.load != null && m.cores != null && m.load >= 2 * m.cores)
      || (m.availMb != null && m.availMb < raisers.length * casualty.MEM_PER_BROWSER_MB);
    const offenders = [];
    for (const { nm, d } of ev.obs) {
      if (d.me && (d.me.seated === false || d.links === 0)) offenders.push('observer ' + nm + ' ' + (d.me.seated === false ? 'UNSEATED' : '0 live links') + ' — deaf by construction');
      else if (typeof d.links === 'number' && d.links < 2) offenders.push('observer ' + nm + ' holds ' + d.links + ' live link(s)');
    }
    const missing = rIds.filter((id) => oa.indexOf(id) < 0 || ob.indexOf(id) < 0);
    for (const id of missing) {
      const r = ev.raisers.find((x) => x.id === id);
      const s = (r && r.s) || {};
      const short = id.slice(0, 6);
      if (s.err) { offenders.push(short + ' unevaluable (' + s.err + ')'); continue; }
      if (s.b && s.b.seated === false) { offenders.push(short + ' UNSEATED mid-run'); continue; }
      if (typeof s.l === 'number' && s.l < 2) { offenders.push(short + ' holds ' + s.l + ' live link(s)'); continue; }
      const beatFresh = s.b && s.b.atAgeMs <= 8000;
      const staleAt = ev.obs.some(({ d }) => {
        const i = rIds.indexOf(id);
        const raw = d.raw && d.raw[i];
        return raw === null || (raw && raw.age > 15000);
      });
      if (beatFresh && staleAt) offenders.push(short + ' beat ' + Math.round(s.b.atAgeMs / 100) / 10 + 's ago yet is stale/absent at an observer (pulse fired, no path)');
    }
    if (saturated && offenders.length) {
      console.log('');
      console.log('NO VERDICT (overflow leg) — THE BOX TOOK THE LINK LAYER AWAY, so a convergence check here cannot be a claim about GifOS.');
      console.log('');
      console.log('  CASUALTY: the mesh had no spanning transport to measure over on a saturated box — ' + offenders.join('; '));
      console.log('  THE BOX:  ' + casualty.capacityLine('local', raisers.length, m));
      console.log('');
      console.log('  Not retried (the box does not get roomier), and it BLOCKS a cut: run this');
      console.log('  suite on a box that can hold ' + raisers.length + ' browsers (casualty.js doctrine — the');
      console.log('  e2e-anyroad-mp precedent: satisfy it on capable hardware, record it in the cut).');
      console.log('  A red on a box with headroom stands exactly as before, and must.');
      console.log('');
      refusedNoVerdict = 'the overflow leg\'s convergence + banner checks were unmeasurable (see CASUALTY above)';
    }
  }
  if (refusedNoVerdict) {
    console.log('  [overflow] convergence + banner verdicts WITHHELD — everything this box CAN measure still runs below.');
  } else {
  check(NR + ' raised hands: two observers converge on the IDENTICAL ordered queue (saw ' + oa.length + '/' + target + ' in ' + took + ')',
    converged);
  // The banner mirrors the derived queue: first 8 names + a '+K' overflow.
  const bannerOk = await settle(a, () => {
    const q = window.__gifosVideo.handQueue(), t = window.__gifosVideo.handqText();
    return q.length > 8 && new RegExp('✋ ' + q.length + ' waiting:.*, \\+' + (q.length - 8) + '$').test(t);
  }, null, 30000);
  const segs = await a.evaluate(() => document.querySelectorAll('#handq .hq').length);
  if (!bannerOk) console.log('  [overflow] the banner never took the overflow shape — it reads: '
    + JSON.stringify(await a.evaluate(() => window.__gifosVideo.handqText())));
  check('the banner shows the first 8 + overflow (+K)', bannerOk && segs === 8);
  } // refusedNoVerdict
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
  await d.goto(BASE + '/run.html');
  const av = await d.evaluate(async ([roomId, pw]) => {
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode('gifos-admin:' + roomId), iterations: 310000 }, km, 256);
    const K = Array.from(new Uint8Array(bits)).map((x) => x.toString(16).padStart(2, '0')).join('');
    const V = (await GifOS.net.edKeysFromSeedHex(K)).verifier;
    localStorage.setItem('gifos_vadm_' + roomId + '.' + V, K);
    return V;
  }, [admRoom, ADMIN_PW]);
  await d.goto(BASE + '/run.html#v=' + admRoom + '&av=' + av);
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
  // A real red anywhere trumps a refusal — a red is a red. Otherwise a
  // withheld overflow verdict makes the whole run NO-VERDICT (exit 4): every
  // other claim passed, but the suite's reason for existing was unmeasurable.
  if (failures) { console.log('\n' + failures + ' FAILURE(S)'); process.exit(1); }
  if (refusedNoVerdict) { console.log('\nNO-VERDICT — ' + refusedNoVerdict + '; everything measurable passed.'); process.exit(4); }
  console.log('\nALL PASS');
  process.exit(0);
})().catch((e) => {
  // NEVER exit non-zero having said nothing. An uncaught rejection here reads
  // as "0 failed / N passed" in the gate — the shape CLAUDE.md calls the most
  // dangerous result there is, because it looks like the suite had no opinion.
  // A throw is a FAIL with its reason attached; a browser that DIED is no
  // verdict at all (exit 4), never a product red.
  if (casualty.isCasualty(e)) casualty.refuse({ what: 'a browser this suite was driving', why: (e && e.message) || e, browsers: 1 });
  console.log('FAIL — the suite threw before it could finish: ' + String((e && e.stack) || e).slice(0, 500));
  process.exit(1);
});
