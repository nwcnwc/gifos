// The durable mirror (run.html, docs/roadmap.md §24b): a room's NON-SECRET
// admin state — banlist, banned names, password generation — is mirrored into
// one GifOS.store state record per administered room ('meet::<room>.<V>'), so
// the whole-computer backup GIF (which packs IndexedDB and nothing else)
// carries the rooms you run, and a restored computer re-seeds its banlist
// before the knock. Proves:
//   1. the admin's ban lands in the record (and in allStates — what a backup packs);
//   2. the record holds no secret (no admin key, no guest password);
//   3. a guest never writes a record for a room they do not run;
//   4. a FRESH context holding only the record (a restore) + a retyped admin
//      key hydrates localStorage from it before joining — the banlist is back.
const { chromium, CHROME } = require('../lib/pw');
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
let failures = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  });
  const setup = (name, extra) => ({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0');" + (extra || '') + "}catch(e){}" });
  const newUser = async (name, extra) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript(setup(name, extra));
    return ctx;
  };
  const openRoom = async (ctx, hash) => {
    const pg = await ctx.newPage(); pg.on('pageerror', () => {});
    await pg.goto(BASE + '/run.html#' + hash);
    await pg.reload(); // hash-only navigation doesn't re-boot the page
    await pg.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 30000 });
    return pg;
  };
  try {
    const room = 'bak' + Math.floor(Math.random() * 1e9).toString(36);
    const ADMIN_PW = 'hunter2!';
    // ---- Dana: derive K + V exactly like the lobby and arrive signed in ----
    const D = await newUser('Dana'); const d0 = await D.newPage(); d0.on('pageerror', () => {});
    await d0.goto(BASE + '/run.html');
    const { K, V } = await d0.evaluate(async ([roomId, pw]) => {
      const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode('gifos-admin:' + roomId), iterations: 310000 }, km, 256);
      const K = Array.from(new Uint8Array(bits)).map((x) => x.toString(16).padStart(2, '0')).join('');
      const V = (await GifOS.net.edKeysFromSeedHex(K)).verifier;
      localStorage.setItem('gifos_vadm_' + roomId + '.' + V, K);
      return { K, V };
    }, [room, ADMIN_PW]);
    await d0.close();
    const base = room + '.' + V, key = 'meet::' + base;
    const d = await openRoom(D, 'v=' + room + '&av=' + V);
    await d.waitForFunction(() => window.__gifosVideo.amAdmin(), null, { timeout: 30000 });
    check('admin room up; Dana is its signed-in admin', true);

    // ---- Eve joins, Dana bans her ----
    const E = await newUser('Eve'); const e = await openRoom(E, 'v=' + room + '&av=' + V);
    for (const pg of [d, e]) await pg.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 40000 });
    await d.waitForFunction(() => window.__gifosVideo.adminsHere().length >= 1, null, { timeout: 20000 });
    const eveDev = await e.evaluate(() => window.__gifosVideo.devHash());
    const eId = await d.evaluate(() => window.__gifosVideo.peerIds()[0]);
    await d.waitForFunction((id) => !!document.querySelector('.tile[data-peer="' + id + '"] .modbar .banbtn'), eId, { timeout: 20000 });
    await d.evaluate((id) => document.querySelector('.tile[data-peer="' + id + '"] .modbar .banbtn').click(), eId);
    await e.waitForFunction(() => window.__gifosVideo.bannedOut(), null, { timeout: 30000 });
    check('Eve is banned out', true);
    await d.waitForFunction((dev) => window.__gifosVideo.banList().some((b) => b && b.d === dev), eveDev, { timeout: 20000 });
    check("Dana's live banlist carries Eve's device tag", true);

    // ---- 1 + 2: the record ----
    await d.waitForFunction((k) => GifOS.store.getState(k).then((r) => !!(r && Array.isArray(r.bans) && r.bans.length)), key, { timeout: 15000 });
    const rec = await d.evaluate((k) => GifOS.store.getState(k), key);
    const hasDev = (l) => Array.isArray(l) && l.some((b) => b && b.d === eveDev);
    check('the record carries the ban', !!rec && hasDev(rec.bans));
    check('the record names the room and its verifier', !!rec && rec.room === room && rec.av === V && rec.v === 1);
    const dump = JSON.stringify(rec);
    check('the record holds NO secret (admin key absent, no password field)', dump.indexOf(K) < 0 && !('k' in rec) && !('pw' in rec) && !('adm' in rec));
    check('the record is what a computer backup packs (allStates)',
      await d.evaluate((k) => GifOS.store.allStates().then((all) => all.some((s) => s.fileId === k && s.state && s.state.bans)), key));
    check('localStorage carries the same list (hot path unchanged)',
      hasDev(await d.evaluate((b) => (JSON.parse(localStorage.getItem('gifos_vban_' + b) || '[]')), base)));

    // ---- 3: a guest writes nothing ----
    check('the guest holds no record for a room she does not run',
      (await e.evaluate((k) => GifOS.store.getState(k), key)) === null);

    // ---- 4: a restore on a fresh device ----
    // A fresh context = a new device: empty localStorage, empty IndexedDB.
    // "Restore from backup" = the record lands in IndexedDB (restoreDesktop
    // does exactly store.setState per packed state); "retype the password"
    // = the admin key lands in localStorage. Nothing else. The banlist must
    // come back from the record before the knock.
    const F = await newUser('Dana', "localStorage.setItem('gifos_vadm_" + base + "','" + K + "');");
    const f0 = await F.newPage(); f0.on('pageerror', () => {});
    await f0.goto(BASE + '/run.html');
    await f0.evaluate(([k, r]) => GifOS.store.setState(k, r), [key, rec]);
    check('fresh device: localStorage has no banlist before the join',
      await f0.evaluate((b) => localStorage.getItem('gifos_vban_' + b) === null, base));
    await f0.close();
    const f = await openRoom(F, 'v=' + room + '&av=' + V);
    await f.waitForFunction(() => window.__gifosVideo.amAdmin(), null, { timeout: 30000 });
    const hydrated = await f.evaluate((b) => JSON.parse(localStorage.getItem('gifos_vban_' + b) || '[]'), base);
    check('restored device: the banlist was hydrated from the record before the knock', hasDev(hydrated));
    check('restored device: the mirror stamp was taken (no re-hydration loop)',
      await f.evaluate((b) => !!localStorage.getItem('gifos_vmirror_' + b), base));
    // and Eve stays out of the room the restored admin now holds
    await e.reload();
    await e.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.bannedOut(), null, { timeout: 30000 }).then(() => check('Eve is still refused', true), () => check('Eve is still refused', false));

    await sleep(500);
  } catch (err) {
    console.error('ERROR', err && err.stack || err); failures++;
  } finally {
    await browser.close();
  }
  console.log(failures ? 'FAILURES: ' + failures : 'ALL PASS');
  process.exit(failures ? 1 : 0);
})();
