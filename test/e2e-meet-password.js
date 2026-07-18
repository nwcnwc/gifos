// Password lifecycle e2e — the CLIENT flow end-to-end through the relay
// (relay-owned.js pins the relay's signed-setpw gate; this covers the page):
//   * anyone in an OPEN room sets the password; the relay door locks;
//   * a joiner with NO password hits the password prompt (R6 / courtesy gate),
//     a WRONG password bounces straight back to it, the RIGHT one admits;
//   * changing the password re-keys live: present members learn it over the
//     sealed pwinfo channel with no prompt;
//   * the OLD password stops working at the door (a stale stored password
//     re-prompts) while the NEW one admits — §LOCK, "derive, don't send";
//   * ADMIN room: only the admin can manage the lock (guest button disabled);
//     the admin's SIGNED setpw locks the door and guests join with that
//     password exactly like an open room's.
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
  const setup = (name, extra) => ({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0');" + (extra || '') + '}catch(e){}' });
  const newUser = async (name, extra) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript(setup(name, extra));
    return ctx;
  };
  const open = async (ctx, label, hash) => {
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => console.log('  [' + label + ' pageerror]', e.message));
    await pg.goto(BASE + '/meet.html#' + hash);
    await pg.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 30000 });
    return pg;
  };
  const pwModalShown = (pg) => pg.evaluate(() => {
    const m = document.getElementById('pw-modal');
    return m.style.display !== 'none' && m.dataset.mode === 'join';
  });
  const waitModal = async (pg, want, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 20000)) { if ((await pwModalShown(pg)) === want) return true; await sleep(300); }
    return (await pwModalShown(pg)) === want;
  };
  const enterPw = async (pg, pw) => { await pg.locator('#pw-new').fill(pw); await pg.locator('#pw-save').click(); };

  // ============================ OPEN ROOM ============================
  const room = 'pw' + Math.floor(Math.random() * 1e9).toString(36);
  const A = await newUser('Ada'); const a = await open(A, 'a', 'v=' + room);
  // Ada locks the room (anyone may, in an open room)
  await a.locator('#pwbtn').click();
  await a.locator('#pw-new').fill('pw-one');
  await a.locator('#pw-save').click();
  await a.waitForFunction(() => window.__gifosVideo.roomPw() === 'pw-one', null, { timeout: 10000 });
  check('open room: anyone sets the password', true);

  // Ben arrives with no password → prompted; wrong → bounced; right → in
  const B = await newUser('Ben'); const b = await open(B, 'b', 'v=' + room);
  check('a joiner without the password is prompted for it', await waitModal(b, true, 25000));
  await enterPw(b, 'wrong-pass');
  await waitModal(b, false, 5000); // the modal hides while it tries…
  check('…a WRONG password bounces back to the prompt', await waitModal(b, true, 25000));
  await enterPw(b, 'pw-one');
  for (const pg of [a, b]) await pg.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 40000 });
  check('the RIGHT password admits (mesh link up)', (await b.evaluate(() => window.__gifosVideo.roomPw())) === 'pw-one');

  // Ada CHANGES the password: Ben (present) learns it silently over pwinfo
  await a.locator('#pwbtn').click();
  await a.locator('#pw-new').fill('pw-two');
  await a.locator('#pw-save').click();
  await b.waitForFunction(() => window.__gifosVideo.roomPw() === 'pw-two', null, { timeout: 25000 });
  check('a password CHANGE reaches present members sealed (no prompt)', !(await pwModalShown(b)));

  // Cyd arrives holding the STALE password — it must NOT work; the new one must
  const C = await newUser('Cyd', "localStorage.setItem('gifos_vpw_" + room + "','pw-one');");
  const c = await open(C, 'c', 'v=' + room);
  check('the OLD password stops working at the door (stale holder re-prompted)', await waitModal(c, true, 30000));
  await enterPw(c, 'pw-two');
  await c.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 40000 });
  check('the NEW password admits the late joiner', (await c.evaluate(() => window.__gifosVideo.roomPw())) === 'pw-two');
  check('all three converge in the re-keyed room',
    (await a.evaluate(() => window.__gifosVideo.participants())) >= 3);
  await a.close(); await b.close(); await c.close();

  // ============================ ADMIN ROOM ============================
  const admRoom = 'pwadm' + Math.floor(Math.random() * 1e9).toString(36);
  const D = await newUser('Dana'); const d = await D.newPage();
  d.on('pageerror', () => {});
  await d.goto(BASE + '/meet.html');
  const av = await d.evaluate(async (roomId) => {
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode('adm-secret-9'), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode('gifos-admin:' + roomId), iterations: 310000 }, km, 256);
    const K = Array.from(new Uint8Array(bits)).map((x) => x.toString(16).padStart(2, '0')).join('');
    const V = (await GifOS.net.edKeysFromSeedHex(K)).verifier;
    localStorage.setItem('gifos_vadm_' + roomId + '.' + V, K);
    return V;
  }, admRoom);
  await d.goto(BASE + '/meet.html#v=' + admRoom + '&av=' + av);
  await d.reload();
  await d.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.amAdmin(), null, { timeout: 30000 });

  // The admin locks the room — a SIGNED setpw the relay verifies (§SIG)
  await d.locator('#pwbtn').click();
  await d.locator('#pw-new').fill('adm-room-key');
  await d.locator('#pw-save').click();
  await d.waitForFunction(() => window.__gifosVideo.roomPw() === 'adm-room-key', null, { timeout: 10000 });
  check('admin room: the admin locks the room (signed setpw)', true);

  // A guest joins: prompted, admitted with the room password, and CANNOT manage it
  const E = await newUser('Eve'); const e = await open(E, 'e', 'v=' + admRoom + '&av=' + av);
  check('admin room: a guest without the password is prompted', await waitModal(e, true, 25000));
  await enterPw(e, 'adm-room-key');
  for (const pg of [d, e]) await pg.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 40000 });
  check('admin room: the password admits the guest', (await e.evaluate(() => window.__gifosVideo.roomPw())) === 'adm-room-key');
  check('admin room: the guest\'s Password button is disabled (admin-managed lock)',
    await e.evaluate(() => document.getElementById('pwbtn').disabled));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
