// Password lifecycle e2e — the CLIENT flow end-to-end through the relay
// (relay-owned.js pins the relay's signed-setpw gate; this covers the page):
//   * anyone in an OPEN room sets the password; the relay door locks;
//   * a joiner with NO password hits the password prompt (R6 / courtesy gate),
//     a WRONG password bounces straight back to it, the RIGHT one admits;
//   * changing the password re-keys live: present members learn it over the
//     sealed pwinfo channel with no prompt;
//   * the OLD password stops working at the door (a stale stored password
//     re-prompts) while the NEW one admits — §LOCK, "derive, don't send" — and
//     the password that was just PROVEN WRONG is forgotten, so the trap does
//     not re-arm itself on the next visit;
//   * THE SILENT SPLIT (bug ledger #1, 2026-08-06): a guest who walks into an
//     OPEN room carrying a password remembered under that room's NAME from
//     some other meeting used to share the relay session with everyone and be
//     unable to open a single frame — both sides stuck at 1 participant
//     forever, the guest told "This room is locked" (it is not) and the host
//     told nothing at all. She must now land in the room, on the open key,
//     with the phantom password forgotten;
//   * a remembered password EXPIRES: an entry older than the store's TTL is
//     never offered, so a room NAME cannot stay locked by a password typed
//     into it weeks ago on another build;
//   * ADMIN room: only the admin can manage the lock (guest button disabled);
//     the admin's SIGNED setpw locks the door and guests join with that
//     password exactly like an open room's.
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
  const setup = (name, extra) => ({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0');" + (extra || '') + '}catch(e){}' });
  const newUser = async (name, extra) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript(setup(name, extra));
    return ctx;
  };
  const open = async (ctx, label, hash) => {
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => console.log('  [' + label + ' pageerror]', e.message));
    await pg.goto(BASE + '/run.html#' + hash);
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
  for (const pg of [a, b]) await pg.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 40000 });
  check('the RIGHT password admits (mesh link up)', (await b.evaluate(() => window.__gifosVideo.roomPw())) === 'pw-one');

  // Ada CHANGES the password: Ben (present) learns it silently over pwinfo.
  // SETTLE the pair first (the codified young-pair law: recently-formed pairs
  // may honestly drop/rebuild for their first seconds, and the pwinfo grant is
  // deliberately one-shot — §8 hard exclusion). A pw change between SETTLED
  // members is the scenario's intent; the one-shot-vs-rebuild sharp edge is a
  // recorded design question, not this suite's subject.
  await sleep(9000);
  await Promise.all([a, b].map((pg) => pg.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 20000 })));
  await a.locator('#pwbtn').click();
  await a.locator('#pw-new').fill('pw-two');
  await a.locator('#pw-save').click();
  await b.waitForFunction(() => window.__gifosVideo.roomPw() === 'pw-two', null, { timeout: 25000 });
  check('a password CHANGE reaches present members sealed (no prompt)', !(await pwModalShown(b)));

  // Cyd arrives holding the STALE password — it must NOT work; the new one must
  const C = await newUser('Cyd', "localStorage.setItem('gifos_vpw_" + room + "','pw-one');");
  const c = await open(C, 'c', 'v=' + room);
  check('the OLD password stops working at the door (stale holder re-prompted)', await waitModal(c, true, 40000));
  // …and it is FORGOTTEN. A password the door has refused (and whose room the
  // open key cannot read either) is proven wrong; keeping it re-runs the whole
  // refusal on the next visit, which is exactly how one room name stayed
  // locked against its own guests "forever".
  check('a password the room PROVED wrong is forgotten, not re-armed',
    (await c.evaluate(() => window.__gifosVideo.pwState().stored)) === '');
  await enterPw(c, 'pw-two');
  await c.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 40000 });
  check('the NEW password admits the late joiner', (await c.evaluate(() => window.__gifosVideo.roomPw())) === 'pw-two');
  // Converge = EVENTUALLY: Cyd's arrival reaches Ada over gossip in beats,
  // and the old instant read raced it under gate-tier load (g7: RED TWICE
  // in-gate, 2/2 green standalone on the same box/commit). The assertion is
  // unchanged; only the wait is honest now.
  let three = false;
  const tCv = Date.now();
  while (Date.now() - tCv < 20000 && !three) {
    three = (await a.evaluate(() => window.__gifosVideo.participants())) >= 3;
    if (!three) await sleep(500);
  }
  check('all three converge in the re-keyed room', three);
  await a.close(); await b.close(); await c.close();

  // ================ THE SILENT SPLIT (bug ledger #1) ==================
  // An OPEN room, and a guest carrying a password she once typed into this
  // room NAME for a completely different meeting. sid/tok are password-free
  // and the room key is password-BOUND, so she used to share the relay session
  // with the host and be unable to open one frame of his: two people in one
  // room, each seeing "1 participant", forever, in silence.
  const splitRoom = 'pwsplit' + Math.floor(Math.random() * 1e9).toString(36);
  const H = await newUser('Hank'); const h = await open(H, 'h', 'v=' + splitRoom);
  await h.waitForFunction(() => window.__gifosVideo.relayUp(), null, { timeout: 20000 });
  const G = await newUser('Gwen', "localStorage.setItem('gifos_vpw_" + splitRoom + "','ghost-of-another-meeting');"
    + "localStorage.setItem('gifos_vpwat_" + splitRoom + "',String(Date.now()));");
  const g = await open(G, 'g', 'v=' + splitRoom);
  let joined = false;
  const tSp = Date.now();
  while (Date.now() - tSp < 60000 && !joined) {
    joined = (await g.evaluate(() => window.__gifosVideo.liveDataLinks() >= 1))
      && (await h.evaluate(() => window.__gifosVideo.liveDataLinks() >= 1));
    if (!joined) await sleep(500);
  }
  check('a phantom saved password does NOT split an open room (both sides linked)', joined);
  check('…the guest lands on the room\'s OWN (open) key',
    (await g.evaluate(() => window.__gifosVideo.roomPw())) === '');
  check('…the host is not left alone with a guest he cannot open',
    (await h.evaluate(() => window.__gifosVideo.participants())) >= 2);
  // The phantom is forgotten once the room proves itself open and populated —
  // otherwise every future visit repeats the divergence dance.
  let forgot = false;
  const tFg = Date.now();
  while (Date.now() - tFg < 20000 && !forgot) {
    forgot = (await g.evaluate(() => window.__gifosVideo.pwState().stored)) === '';
    if (!forgot) await sleep(500);
  }
  check('…and the phantom password is forgotten', forgot);
  await g.close(); await h.close();

  // ==================== A REMEMBERED PASSWORD EXPIRES ====================
  // Same trap, one step earlier: the entry is old enough that it must never be
  // offered at all. gifos_vpw_ is per-ORIGIN and shared with every /versions/
  // snapshot, so without this an unlucky room NAME is locked by a password
  // typed on another build, weeks ago, with nothing on screen to say so.
  const oldRoom = 'pwold' + Math.floor(Math.random() * 1e9).toString(36);
  const I = await newUser('Iris', "localStorage.setItem('gifos_vpw_" + oldRoom + "','ancient-history');"
    + "localStorage.setItem('gifos_vpwat_" + oldRoom + "',String(Date.now() - 400*24*3600*1000));");
  const i = await open(I, 'i', 'v=' + oldRoom);
  await i.waitForFunction(() => window.__gifosVideo.relayUp(), null, { timeout: 20000 });
  const iSt = await i.evaluate(() => window.__gifosVideo.pwState());
  check('an EXPIRED saved password is never offered (the room opens unlocked)', iSt.pw === '' && !iSt.fromStore);
  check('…and the expired entry is dropped from storage', iSt.stored === '');
  await i.close();

  // ============== A REMEMBERED LOCK IS VISIBLE TO THE HOST ==============
  // The host side of this trap is silent by construction: her page works, her
  // room is locked by a password she typed into this room NAME once, and every
  // guest is turned away at a door she cannot see. Say it while she is alone —
  // exactly when she is waiting for the guest being refused.
  const soloRoom = 'pwsolo' + Math.floor(Math.random() * 1e9).toString(36);
  const J = await newUser('Jo', "localStorage.setItem('gifos_vpw_" + soloRoom + "','kept-key');"
    + "localStorage.setItem('gifos_vpwat_" + soloRoom + "',String(Date.now()));");
  const j = await open(J, 'j', 'v=' + soloRoom);
  let told = false;
  const tTd = Date.now();
  while (Date.now() - tTd < 25000 && !told) {
    told = /locked with a password you saved earlier/.test(await j.evaluate(() => (document.getElementById('status') || {}).textContent || ''));
    if (!told) await sleep(500);
  }
  check('a lock you did not set THIS session is visible while you are alone', told,
    await j.evaluate(() => (document.getElementById('status') || {}).textContent || ''));
  await j.close();

  // ============================ ADMIN ROOM ============================
  const admRoom = 'pwadm' + Math.floor(Math.random() * 1e9).toString(36);
  const D = await newUser('Dana'); const d = await D.newPage();
  d.on('pageerror', () => {});
  await d.goto(BASE + '/run.html');
  const av = await d.evaluate(async (roomId) => {
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode('adm-secret-9'), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode('gifos-admin:' + roomId), iterations: 310000 }, km, 256);
    const K = Array.from(new Uint8Array(bits)).map((x) => x.toString(16).padStart(2, '0')).join('');
    const V = (await GifOS.net.edKeysFromSeedHex(K)).verifier;
    localStorage.setItem('gifos_vadm_' + roomId + '.' + V, K);
    return V;
  }, admRoom);
  await d.goto(BASE + '/run.html#v=' + admRoom + '&av=' + av);
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
  for (const pg of [d, e]) await pg.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 40000 });
  check('admin room: the password admits the guest', (await e.evaluate(() => window.__gifosVideo.roomPw())) === 'adm-room-key');
  check('admin room: the guest\'s Password button is disabled (admin-managed lock)',
    await e.evaluate(() => document.getElementById('pwbtn').disabled));

  // AN ADMIN'S OWN PASSWORD IS NOT A CANDIDATE. The room empties, a
  // passwordless member re-founds it (admin rooms always open lockless at the
  // door), and the returning admin finds a greeter pool she cannot read — R6,
  // fired at the one person whose stored password IS the room's authority.
  // Treating it as a guess and dropping it to probe the open key leaves
  // `roomPw` empty exactly when her signed re-assert reads it: the door never
  // re-locks and a passwordless stray walks into a room its admin believes is
  // shut. Caught for real by e2e-video's returning-admin leg while this fix
  // was being written; pinned here where it runs in two minutes, not fifteen.
  await d.close(); await e.close();
  await sleep(1500); // the room empties
  const F = await newUser('Fay'); const f = await open(F, 'f', 'v=' + admRoom + '&av=' + av);
  await f.waitForFunction(() => window.__gifosVideo.relayUp(), null, { timeout: 20000 });
  const d2 = await open(D, 'd2', 'v=' + admRoom + '&av=' + av);       // same context: her admin key AND her stored password
  await d2.waitForFunction(() => window.__gifosVideo.amAdmin(), null, { timeout: 30000 });
  check('admin room: the returning admin keeps her password (it is authority, not a guess)',
    (await d2.evaluate(() => window.__gifosVideo.roomPw())) === 'adm-room-key');
  await sleep(2500); // her signed setpw re-assert propagates
  const S = await newUser('Sam'); const s = await open(S, 's', 'v=' + admRoom + '&av=' + av);
  check('admin room: …so the door re-locks and a passwordless stray is challenged',
    await waitModal(s, true, 25000));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
