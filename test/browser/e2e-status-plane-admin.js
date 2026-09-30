// e2e-status-plane-admin.js — AN ADMIN ROOM PAST ONE SECTION, in real browsers.
//
// The status plane (docs/status-plane-migration.md) scopes every heartbeat to
// its sender's section — an admin's too. What the room needs from an admin is
// the SIGNED proof that one is present, its table when it changes, and its
// grants honoured on the far side of the tree. Ten browsers at C=2 span four
// sections; the admin is the LAST to arrive, so it sits deep, holds no greeter
// roster, and every one of these has to cross the tree:
//
//   1. every seat sees the admin present, and keeps seeing it (no flap over
//      45 s: presence rides a room-wide beat every ~8 s inside a 30 s window)
//   2. an admin's room-wide mod change reaches every seat (G6: on change)
//   3. a guest's forged grant is refused everywhere (the signature rule holds
//      across the fold exactly as it does across a link)
//   4. the admin's grant lets a guest in ANOTHER section take the Stage, and
//      every seat's Stage shows it (canStage applied to the fold's candidates)
//   5. BAN needs a device tag the RELAY vouched for: a tag a peer merely
//      asserts in its own status may be someone else's, so Ban on an
//      unattested peer bans nobody.
//
// Run: site on 8099 + relay on 8790 (test/servers/dev.sh), then
//   node test/browser/e2e-status-plane-admin.js
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const N = 10, ADMIN_PW = 'plane-admin!';
let failures = 0;
const check = (name, cond, extra) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cstr = (c) => (c ? c.pc + '/' + c.r + '.' + c.i : '?');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const room = 'padm' + Math.random().toString(36).slice(2, 8);
  const errs = [];
  const ctxFor = async (i) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript({ content: `try{localStorage.setItem('gifos_relay','${RELAY}');localStorage.setItem('gifos_name','P${i}');localStorage.setItem('gifos_meet_bar','0')}catch(e){}; window.GIFOS_SCALE={C:2};` });
    return ctx;
  };
  // The admin's key + the room's verifier, derived exactly as the lobby does.
  const actx = await ctxFor(N - 1);
  const boot = await actx.newPage();
  await boot.goto(BASE + '/run.html');
  const av = await boot.evaluate(async ([roomId, pw]) => {
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode('gifos-admin:' + roomId), iterations: 310000 }, km, 256);
    const K = Array.from(new Uint8Array(bits)).map((x) => x.toString(16).padStart(2, '0')).join('');
    const V = (await GifOS.net.edKeysFromSeedHex(K)).verifier;
    localStorage.setItem('gifos_vadm_' + roomId + '.' + V, K);
    return V;
  }, [room, ADMIN_PW]);
  await boot.close();

  const pages = [];
  const sp = (pg) => pg.evaluate(() => window.__gifosVideo.statusPlane()).catch(() => null);
  for (let i = 0; i < N; i++) {
    const ctx = i === N - 1 ? actx : await ctxFor(i);
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => { errs.push('P' + i + ': ' + String(e).slice(0, 160)); console.log(`  [P${i}] PAGEERROR`, String(e).slice(0, 160)); });
    await pg.goto(BASE + '/run.html#v=' + room + '&av=' + av);
    pages.push(pg);
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) { const s = await sp(pg); if (s && s.coord) break; await sleep(1000); }
    await sleep(1200);
  }
  const A = pages[N - 1];
  const all = () => Promise.all(pages.map(sp));
  let st = await all();
  check('all ' + N + ' seated at C=2, past one section', st.every((s) => s && s.coord) && st.some((s) => s.coord.pc !== 0), st.map((s) => s && cstr(s.coord)));
  if (!st.every((s) => s && s.coord)) { await browser.close(); console.log('\n' + (failures || 1) + ' FAILED'); process.exit(1); }
  check('the last arrival is the signed-in admin, seated DEEP', (await A.evaluate(() => window.__gifosVideo.amAdmin())) && st[N - 1].coord.pc !== 0, cstr(st[N - 1].coord));
  const pids = st.map((s) => s.id);
  const until = async (read, ok, ms) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await read(); if (ok(v)) return { ok: true, v, secs: Math.round((Date.now() - t0) / 1000) }; await sleep(1000); } return { ok: false, v, secs: Math.round(ms / 1000) }; };
  const counted = await until(all, (v) => v.every((s) => s && s.past && s.display === N), 90000);
  check('every seat reads ' + N + ' in the meeting', counted.ok, counted.v.map((s) => s && s.display));

  // ---- 1. presence, everywhere, without a flap --------------------------------
  const here = () => Promise.all(pages.map((pg) => pg.evaluate(() => window.__gifosVideo.adminsHere().length).catch(() => -1)));
  const seen = await until(here, (v) => v.every((n) => n >= 1), 60000);
  check('every seat sees the admin present', seen.ok, { secs: seen.secs, v: seen.v });
  st = await all();
  const hearsAdmin = st.map((s, i) => (i !== N - 1 && s.fresh.includes(pids[N - 1]) ? 'P' + i : null)).filter(Boolean);
  check('…most of them WITHOUT hearing its status first-hand (the beat crossed the tree)', hearsAdmin.length <= 5, { hearsAdmin });
  let dips = 0, polls = 0; const t1 = Date.now();
  while (Date.now() - t1 < 45000) { const v = await here(); polls++; if (!v.every((n) => n >= 1)) dips++; await sleep(3000); }
  check('presence holds for 45 s at every seat (no flap)', dips === 0, { polls, dips });

  // ---- 2. an admin mod change reaches the room ---------------------------------
  await A.evaluate(() => window.__gifosVideo.chatOffForTest(true));
  const chat = await until(() => Promise.all(pages.map((pg) => pg.evaluate(() => window.__gifosVideo.chatOff()).catch(() => null))), (v) => v.every(Boolean), 30000);
  check('the admin turning chat off reaches every seat', chat.ok, { secs: chat.secs, v: chat.v });
  await A.evaluate(() => window.__gifosVideo.chatOffForTest(false));

  // ---- 3. a guest's forged grant is refused everywhere ---------------------------
  const far = st.map((s, i) => ({ i, pc: s.coord.pc })).filter((x) => x.i !== N - 1 && x.pc !== st[N - 1].coord.pc).sort((a, b) => b.pc - a.pc)[0].i;
  await pages[far].evaluate((id) => window.__gifosVideo.forgeModForTest(id, 'app'), pids[far]);
  await sleep(9000);
  const forged = await Promise.all(pages.map((pg, i) => (i === far ? false : pg.evaluate((id) => window.__gifosVideo.modOn(id, 'app'), pids[far]).catch(() => null))));
  check('a guest granting ITSELF the Stage is refused at every other seat', forged.every((x) => x === false), forged);
  const denied = await pages[far].evaluate(() => window.__gifosVideo.stageIds().length);
  check('…and nobody is on the Stage', denied === 0, denied);
  await pages[far].reload(); // drop the forger's local table; it re-seats as an ordinary guest
  await until(() => sp(pages[far]), (s) => !!(s && s.coord), 90000);
  await sleep(4000);

  // ---- 4. the admin's grant crosses the tree -------------------------------------
  const st2 = await all();
  const g = st2.map((s, i) => ({ i, s })).filter((x) => x.i !== N - 1 && x.i !== far && x.s && x.s.coord && x.s.coord.pc !== st2[N - 1].coord.pc && !st2[N - 1].fresh.includes(x.s.id))[0];
  check('a guest in another section, unheard by the admin first-hand, exists', !!g, g && cstr(g.s.coord));
  if (g) {
    await A.evaluate((id) => window.__gifosVideo.forgeModForTest(id, 'app'), g.s.id); // from the ADMIN this is a real, signed grant
    const granted = await until(() => pages[g.i].evaluate((id) => window.__gifosVideo.modOn('me', 'app') || window.__gifosVideo.modOn(id, 'app'), g.s.id).catch(() => false), (v) => v === true, 30000);
    check('the grant reaches the guest', granted.ok, { secs: granted.secs });
    const up = await pages[g.i].evaluate(() => window.__gifosVideo.stageForTest(true));
    check('the granted guest may take the Stage', up === true, up);
    const onStage = await until(() => Promise.all(pages.map((pg) => pg.evaluate(() => window.__gifosVideo.stageIds()).catch(() => []))), (v) => v.every((x) => x.includes(g.s.id)), 45000);
    const diag = onStage.ok ? undefined : await Promise.all(pages.map((pg) => pg.evaluate((id) => { const V = window.__gifosVideo, sp = V.statusPlane(); return { c: sp.coord && (sp.coord.pc + '/' + sp.coord.r + '.' + sp.coord.i), grant: V.modOn(id, 'app'), dstage: sp.stage.map((x) => x.slice(0, 6)), n: sp.n, age: sp.age, g: V.gossipStats() }; }, g.s.id).catch((e) => String(e).slice(0, 60))));
    check('every seat\'s Stage shows the granted guest', onStage.ok, { secs: onStage.secs, missing: onStage.v.map((x, i) => (x.includes(g.s.id) ? null : 'P' + i)).filter(Boolean), diag });
    await pages[g.i].evaluate(() => window.__gifosVideo.stageForTest(false));
  }

  // ---- 5. Ban needs a tag the relay vouched for ------------------------------------
  // Whether the deep admin's neighbours happen to be door-attested depends on
  // who was a greeter when; so take a neighbour with a Ban button and make its
  // tag one the admin knows only by the peer's own word.
  const di = await A.evaluate(() => window.__gifosVideo.devInfo());
  const tiled = await A.evaluate((ids) => ids.filter((id) => !!document.querySelector('.tile[data-peer="' + id + '"] .modbar button[data-adm="ban"]')), Object.keys(di.devOf));
  if (tiled.length) await A.evaluate((id) => window.__gifosVideo._unattestForTest(id), tiled[0]);
  const di2 = await A.evaluate(() => window.__gifosVideo.devInfo());
  check('the admin holds a neighbour\'s tag the door has not vouched for', tiled.length > 0 && !!di2.devOf[tiled[0]] && di2.attested.indexOf(tiled[0]) < 0, { tiled: tiled.length, attested: di2.attested.length });
  if (tiled.length) {
    const before = (await A.evaluate(() => window.__gifosVideo.banList())).length;
    await A.evaluate((id) => document.querySelector('.tile[data-peer="' + id + '"] .modbar button[data-adm="ban"]').click(), tiled[0]);
    await sleep(3000);
    const after = (await A.evaluate(() => window.__gifosVideo.banList())).length;
    const said = await A.evaluate(() => document.getElementById('status').textContent);
    check('Ban on an unattested tag bans nobody', after === before, { before, after });
    check('…and says why', /has not vouched/.test(said), said.slice(0, 120));
    const still = await sp(pages[pids.indexOf(tiled[0])]);
    check('the neighbour is still seated', !!(still && still.coord));
  }

  check('no page errors', errs.length === 0, errs.slice(0, 5));
  await browser.close();
  console.log('\n' + (failures ? failures + ' FAILED' : 'ALL PASS'));
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL — crashed: ' + (e && e.stack || e)); process.exit(1); });
