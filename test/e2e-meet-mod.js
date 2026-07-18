// Moderation e2e — OPEN room civility vs ADMIN room authority, with the UNDO
// paths (the halves no suite covered):
//   OPEN room: anyone blurs/mutes anyone for everyone (attributed), the same
//   author can UNBLUR/UNMUTE, the target's own controls stay locked while a
//   block stands, and the vote-off button exists.
//   ADMIN room: guests get no modbar/vote/password powers; a guest's forged
//   moderation is refused by every receiver; the admin's Blur-guests /
//   Video-off hammers apply AND release; stage entry is admin+grantee only
//   (the same 'app' grant), revocation pulls the stager down by arithmetic;
//   admin sign-in takes the password (wrong one refused); an admin room with
//   NO admin present never shows clear video (the blurred waiting room).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
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
  const setup = (name) => ({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
  const newUser = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript(setup(name));
    return ctx;
  };
  const open = async (ctx, label, hash) => {
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => console.log('  [' + label + ' pageerror]', e.message));
    await pg.goto(BASE + '/meet.html#' + hash);
    await pg.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 30000 });
    return pg;
  };
  // Click a moderation button on someone's tile from this page (the modbar may
  // be CSS-hidden until tap — dispatch the click directly; receivers enforce).
  const modClick = (pg, pid, field) => pg.evaluate(([id, f]) => {
    const b = document.querySelector('.tile[data-peer="' + id + '"] .modbar button[data-mod="' + f + '"]');
    if (b) b.click(); return !!b;
  }, [pid, field]);
  const otherId = (pg) => pg.evaluate(() => window.__gifosVideo.peerIds()[0]);

  // ============================ OPEN ROOM ============================
  const room = 'mod' + Math.floor(Math.random() * 1e9).toString(36);
  const A = await newUser('Ada'); const a = await open(A, 'a', 'v=' + room);
  const B = await newUser('Ben'); const b = await open(B, 'b', 'v=' + room);
  for (const pg of [a, b]) await pg.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 40000 });
  const aId = await otherId(b); // Ada's peer id, as Ben sees it
  check('open room: two peers meshed', !!aId);
  check('everyone joins Max-blurred, muted, camera off',
    (await a.evaluate(() => window.__gifosVideo.myBlur())) === 2
    && (await a.evaluate(() => window.__gifosVideo.micMuted()))
    && (await a.evaluate(() => window.__gifosVideo.camOff())));
  check('open room: the vote-off button exists on a tile (body.canvote)',
    await b.evaluate(() => document.body.classList.contains('canvote')));

  // ---- group BLUR + UNBLUR (undo), target lockout ----
  check('modbar reachable in an open room (anyone moderates anyone)', await modClick(b, aId, 'blur'));
  await a.waitForFunction(() => window.__gifosVideo.modOn('me', 'blur'), null, { timeout: 15000 });
  check('Ben blurred Ada for everyone — Ada\'s client enforces it', true);
  check('the block is attributed on Ada\'s own tile chips (by Ben)',
    await a.evaluate(() => /blurred for everyone by Ben/.test(document.querySelector('.tile.me .chips').textContent)));
  // the TARGET cannot lift it: her slider records a wish, the rule ignores it
  await a.evaluate(() => window.__gifosVideo.setBlur(0));
  await sleep(400);
  check('the target cannot unblur herself (moderator block outranks her slider)',
    (await a.evaluate(() => window.__gifosVideo.modOn('me', 'blur')))
    && (await a.evaluate(() => window.__gifosVideo.blurClassOf('me'))) >= 1);
  check('Ben\'s tile of Ada stays blurred too (receiver-side CSS)',
    (await b.evaluate((id) => window.__gifosVideo.blurClassOf(id), aId)) >= 1);
  // UNDO: the author (or anyone but the target) lifts it
  await modClick(b, aId, 'blur');
  await a.waitForFunction(() => !window.__gifosVideo.modOn('me', 'blur'), null, { timeout: 15000 });
  check('UNBLUR for everyone propagates back to the target', true);

  // ---- group MUTE + UNMUTE (undo) ----
  await modClick(b, aId, 'mute');
  await a.waitForFunction(() => window.__gifosVideo.modOn('me', 'mute'), null, { timeout: 15000 });
  check('mute-for-everyone reaches the target', true);
  await a.locator('#mic').click(); // her own mic button must refuse while muted-for-everyone
  await sleep(300);
  check('the target\'s own mic button cannot lift a group mute',
    await a.evaluate(() => window.__gifosVideo.micMuted()));
  await modClick(b, aId, 'mute');
  await a.waitForFunction(() => !window.__gifosVideo.modOn('me', 'mute'), null, { timeout: 15000 });
  await a.locator('#mic').click();
  await a.waitForFunction(() => !window.__gifosVideo.micMuted(), null, { timeout: 10000 });
  check('after UNMUTE-for-everyone the target unmutes herself', true);

  await a.close(); await b.close();

  // ============================ ADMIN ROOM ============================
  const admRoom = 'modadm' + Math.floor(Math.random() * 1e9).toString(36);
  const ADMIN_PW = 'hunter2!';
  const D = await newUser('Dana'); let d = await (await D.newPage());
  d.on('pageerror', () => {});
  await d.goto(BASE + '/meet.html');
  // derive K + V exactly like the lobby (V commits to the PUBLIC key K seeds,
  // meet-security §SIG) and stash the key so Dana arrives signed in.
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
  await d.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.amAdmin(), null, { timeout: 30000 });
  check('admin room up; creator arrives as its signed-in admin', true);

  const E = await newUser('Eve'); const e = await open(E, 'e', 'v=' + admRoom + '&av=' + av);
  for (const pg of [d, e]) await pg.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 40000 });
  await d.waitForFunction(() => window.__gifosVideo.adminsHere().length >= 1, null, { timeout: 20000 });
  const eId = await otherId(d); // Eve as Dana sees her
  const dId = await otherId(e); // Dana as Eve sees her

  // ---- what a GUEST sees / can do ----
  check('guest knows the room is administered but is not admin',
    (await e.evaluate(() => window.__gifosVideo.hasAdmin())) && !(await e.evaluate(() => window.__gifosVideo.amAdmin())));
  check('guest sees the admin present (signed heartbeats)',
    (await e.evaluate(() => window.__gifosVideo.adminsHere().length)) >= 1);
  check('guest\'s modbar is hidden (no group-moderation powers)',
    await e.evaluate(() => { const m = document.querySelector('.tile:not(.me) .modbar'); return !m || getComputedStyle(m).display === 'none'; }));
  check('no vote-off in an admin room (the admin bans instead)',
    !(await e.evaluate(() => document.body.classList.contains('canvote'))));
  check('guest\'s Password button is disabled (admin manages the lock)',
    await e.evaluate(() => document.getElementById('pwbtn').disabled));
  // a guest's forged moderation click is refused by receivers (signature rule)
  await modClick(e, dId, 'blur');
  await sleep(800);
  check('a guest cannot blur anyone for everyone (no signed authority)',
    !(await d.evaluate(() => window.__gifosVideo.modOn('me', 'blur'))));

  // ---- admin hammers: Blur guests / Video off — apply AND release ----
  await d.locator('#blurall').click();
  await e.waitForFunction(() => window.__gifosVideo.modOn('me', 'blur'), null, { timeout: 15000 });
  check('admin "Blur guests" blocks every guest', true);
  await d.locator('#blurall').click(); // now reads "Unblur guests"
  await e.waitForFunction(() => !window.__gifosVideo.modOn('me', 'blur'), null, { timeout: 15000 });
  check('admin "Unblur guests" releases the block (undo path)', true);

  await d.locator('#camall').click();
  await e.waitForFunction(() => window.__gifosVideo.modOn('me', 'cam'), null, { timeout: 15000 });
  check('admin "Video off" forces every guest\'s camera off', true);
  check('the guest\'s tile is cam-off on the ADMIN\'s screen (receiver-enforced)',
    await d.evaluate((id) => { const t = document.querySelector('.tile[data-peer="' + id + '"]'); return !!t && t.classList.contains('cam-off'); }, eId));
  await d.locator('#camall').click(); // "Video on"
  await e.waitForFunction(() => !window.__gifosVideo.modOn('me', 'cam'), null, { timeout: 15000 });
  check('admin "Video on" releases the camera ban (undo path)', true);

  // ---- STAGE: admin + grantees only; revocation pulls the stager down ----
  check('a guest cannot take the stage in an admin room',
    !(await e.evaluate(() => window.__gifosVideo.canStageNow())));
  check('the admin can', await d.evaluate(() => window.__gifosVideo.canStageNow()));
  await d.evaluate((id) => window.__gifosVideo.grantApp(id, true), eId);
  await e.waitForFunction(() => window.__gifosVideo.canStageNow(), null, { timeout: 15000 });
  check('the app/stage GRANT opens the stage to the guest', true);
  await e.evaluate(() => window.__gifosVideo.setStageForTest(true));
  await d.waitForFunction((id) => window.__gifosVideo.stageIds().includes(id), eId, { timeout: 15000 });
  check('the granted guest steps up and every receiver seats her', true);
  await d.evaluate((id) => window.__gifosVideo.grantApp(id, false), eId);
  await d.waitForFunction((id) => !window.__gifosVideo.stageIds().includes(id), eId, { timeout: 15000 });
  await e.waitForFunction(() => !window.__gifosVideo.canStageNow(), null, { timeout: 15000 });
  check('REVOKING the grant pulls her off stage everywhere, by arithmetic', true);

  // ---- admin sign-in: wrong password refused, right one grants ----
  await e.locator('#admbtn').click();
  await e.locator('#adm-pass').fill('not-the-password');
  await e.locator('#adm-enable').click();
  await e.waitForFunction(() => /Wrong admin password/.test(document.getElementById('status').textContent), null, { timeout: 30000 });
  check('a wrong admin password is refused (local verify against V)', !(await e.evaluate(() => window.__gifosVideo.amAdmin())));
  await e.locator('#adm-pass').fill(ADMIN_PW);
  await e.locator('#adm-enable').click();
  await e.waitForFunction(() => window.__gifosVideo.amAdmin(), null, { timeout: 30000 });
  check('the right admin password signs the guest in as a second admin', true);
  // step back down to a guest for the waiting-room test below: reload without the stored key
  await e.evaluate((roomId) => localStorage.removeItem('gifos_vadm_' + roomId), admRoom + '.' + av);
  await e.reload();
  await e.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room() && !window.__gifosVideo.amAdmin(), null, { timeout: 30000 });

  // ---- the BLURRED WAITING ROOM: no admin present ⇒ nothing clears ----
  // The admin locks the room (the key to clear video) and everyone consents.
  await d.locator('#pwbtn').click();
  await d.locator('#pw-new').fill('roomkey9');
  await d.locator('#pw-save').click();
  await e.waitForFunction(() => window.__gifosVideo.roomPw() === 'roomkey9', null, { timeout: 20000 });
  check('the admin\'s password reaches the guest (sealed pwinfo)', true);
  for (const pg of [d, e]) {
    await pg.locator('#cam').click(); // camera on
    await pg.waitForFunction(() => !window.__gifosVideo.camOff(), null, { timeout: 20000 });
    await pg.evaluate(() => window.__gifosVideo.setBlur(0)); // No blur
  }
  // with the admin PRESENT, a consenting guest's tile clears on the admin's screen
  await d.waitForFunction((id) => window.__gifosVideo.blurClassOf(id) === 0, eId, { timeout: 20000 });
  check('admin present + password + guest consent ⇒ that guest\'s tile is CLEAR', true);
  // the admin leaves — the guest must fall back to blurred, and see the countdown
  await d.close();
  await e.waitForFunction(() => window.__gifosVideo.adminsHere().length === 0, null, { timeout: 40000 });
  await e.waitForFunction((id) => { const b = window.__gifosVideo.blurClassOf(id); return b === null || b >= 1; }, dId, { timeout: 20000 });
  check('with NO admin present the room NEVER clears (blurred waiting room)', true);
  await e.waitForFunction(() => window.__gifosVideo.countdownShown(), null, { timeout: 30000 });
  check('the admin-absence countdown starts for the leftover guest', true);

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
