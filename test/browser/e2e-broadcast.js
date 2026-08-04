// Broadcast e2e — the Broadcast skin of meet.html (#bc=1 on an admin room):
//   the host boots as admin, auto-steps onto the Stage; the stage stays
//   BLURRED until the host LOCKS the room (the meeting password rule applies
//   unchanged — the room password is the broadcast's ticket: a pre-lock
//   viewer learns it by sealed pwinfo, a late one is prompted at the door);
//   a viewer joins with NO camera/mic permission granted and getUserMedia is
//   NEVER called (no prompt to watch), the row grid + stadium are hidden and
//   the media controls gone; chat flows both ways; the host's chat-off locks
//   every viewer's composer (admin announcements still land) and chat-on
//   releases it; a signed per-message delete removes the line everywhere;
//   the host's stage grant hands a viewer the mic/cam controls back; and a
//   client that STRIPS &bc=1 lands in the plain meeting skin of the same
//   room — the skin is a skin, never the security boundary.
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
  const setup = (name) => ({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
  const newUser = async (name, perms) => {
    const ctx = await browser.newContext(perms ? { permissions: perms } : {});
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
  const hidden = (pg, sel) => pg.evaluate((s) => { const el = document.querySelector(s); return !el || getComputedStyle(el).display === 'none'; }, sel);
  const otherId = (pg) => pg.evaluate(() => window.__gifosVideo.peerIds()[0]);

  // ---- the host: an admin room worn as a broadcast --------------------------
  const room = 'cast' + Math.floor(Math.random() * 1e9).toString(36);
  const PW = 'onair-77!';
  const H = await newUser('Hana', ['camera', 'microphone']);
  let h = await H.newPage();
  h.on('pageerror', () => {});
  await h.goto(BASE + '/meet.html');
  // derive K + V exactly like the lobby and stash the key (host arrives signed in)
  const av = await h.evaluate(async ([roomId, pw]) => {
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode('gifos-admin:' + roomId), iterations: 310000 }, km, 256);
    const K = Array.from(new Uint8Array(bits)).map((x) => x.toString(16).padStart(2, '0')).join('');
    const V = (await GifOS.net.edKeysFromSeedHex(K)).verifier;
    localStorage.setItem('gifos_vadm_' + roomId + '.' + V, K);
    return V;
  }, [room, PW]);
  await h.goto(BASE + '/meet.html#v=' + room + '&av=' + av + '&bc=1');
  await h.reload(); // hash-only navigation doesn't re-boot the page
  await h.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.amAdmin(), null, { timeout: 30000 });
  check('broadcast room up; creator arrives as its signed-in host (admin)', true);
  check('the page knows it is a broadcast (flag + body class)',
    (await h.evaluate(() => window.__gifosVideo.broadcast()))
    && (await h.evaluate(() => document.body.classList.contains('broadcast'))));
  await h.waitForFunction(() => window.__gifosVideo.stageIds().length === 1 && window.__gifosVideo.onStage(), null, { timeout: 20000 });
  check('the host auto-steps onto the Stage at boot', true);
  check('…but the camera still starts OFF (going live stays a deliberate tap)',
    await h.evaluate(() => window.__gifosVideo.camOff()));

  // ---- a viewer: NO permissions granted, and none ever asked for ------------
  const V1 = await newUser('Vera', null); // NO camera/mic permission — watching must not need any
  const v = await open(V1, 'viewer', 'v=' + room + '&av=' + av + '&bc=1');
  for (const pg of [h, v]) await pg.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 40000 });
  check('viewer meshed with the host (data link up)', true);
  check('viewer NEVER called getUserMedia (no stream, no boot error, no prompt)',
    !(await v.evaluate(() => window.__gifosVideo.localStreamActive()))
    && (await v.evaluate(() => typeof window.__gumBootErr === 'undefined')));
  check('viewer wears the broadcast skin as a guest (broadcast + notadmin)',
    await v.evaluate(() => document.body.classList.contains('broadcast') && document.body.classList.contains('notadmin')));
  check('row grid and stadium never render for a viewer', (await hidden(v, '#grid')) && (await hidden(v, '#stadium')));
  check('viewer has no mic/cam/blur controls (they bring no media)',
    (await hidden(v, '#mic')) && (await hidden(v, '#cam')) && (await hidden(v, '.blurctl')));
  check('viewer keeps Chat and Hand (the back-channel and the call-up request)',
    !(await hidden(v, '#chatbtn')) && !(await hidden(v, '#hand')));
  check('nobody mixes and the host has no row-tier hammers (Mix / Blur guests / Video off gone)',
    (await hidden(h, '#mixbtn')) && (await hidden(h, '#blurall')) && (await hidden(h, '#camall')) && (await hidden(v, '#mixbtn')));
  check('Help speaks BROADCAST, not the meeting explainer',
    (await h.evaluate(() => document.querySelector('#help-modal h3').textContent)) === 'How this broadcast works'
    && (await v.evaluate(() => /viewer password/i.test(document.querySelector('#help-modal .help-scroll').textContent))));

  // ---- the skin is a skin: strip &bc=1 and it is the same room, meeting UI --
  // (joined BEFORE the lock below — a stripped client after it would meet the
  // ticket booth like any late arrival, which the tail of this suite covers.)
  const S = await newUser('Sami', ['camera', 'microphone']);
  const s = await open(S, 'stripped', 'v=' + room + '&av=' + av);
  await s.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 40000 });
  check('a stripped-URL client joins the SAME room in the plain meeting skin',
    !(await s.evaluate(() => window.__gifosVideo.broadcast()))
    && !(await s.evaluate(() => document.body.classList.contains('broadcast')))
    && (await s.evaluate(() => window.__gifosVideo.hasAdmin())));
  await s.close();

  // ---- the show: BLURRED until the host LOCKS the room ----------------------
  // The meeting rule applies unchanged (Nathan's call, 2026-08-03): an admin
  // room is born unlocked, and the host setting the room password after
  // arriving IS the deliberate "this room may show clear video" act. §LOCK
  // keeps sid/token password-free, so viewers still route to a locked room —
  // the password is the ticket, prompted for at the door.
  await h.locator('#cam').click();
  await h.waitForFunction(() => !window.__gifosVideo.camOff(), null, { timeout: 20000 });
  await h.evaluate(() => window.__gifosVideo.setBlur(0));
  await sleep(2500);
  check('an UNLOCKED broadcast stays blurred — the password rule is not skinned away',
    (await h.evaluate(() => window.__gifosVideo.blurClassOf('me'))) >= 1);
  const TICKET = 'showkey1';
  await h.locator('#pwbtn').click();
  await h.locator('#pw-new').fill(TICKET);
  await h.locator('#pw-save').click();
  await h.waitForFunction(() => window.__gifosVideo.blurClassOf('me') === 0, null, { timeout: 25000 });
  check('the host locking the room clears their stage feed', true);
  await v.waitForFunction((pw) => window.__gifosVideo.roomPw() === pw, TICKET, { timeout: 25000 });
  check('the ticket reaches the pre-lock viewer by itself (sealed pwinfo)', true);
  await v.waitForFunction(() => {
    const el = document.querySelector('#stagefeed video');
    return !!(el && el.srcObject && el.readyState >= 2);
  }, null, { timeout: 40000 });
  check('the viewer sees the live stage feed', true);

  // ---- chat: both ways ------------------------------------------------------
  for (const pg of [h, v]) await pg.locator('#chatbtn').click();
  await v.locator('#chat-in').fill('hi from viewer');
  await v.locator('#chatform button[type="submit"]').click();
  await h.waitForFunction(() => window.__gifosVideo.chatTexts().includes('hi from viewer'), null, { timeout: 15000 });
  check('viewer chat reaches the host', true);
  await h.locator('#chat-in').fill('welcome to the show');
  await h.locator('#chatform button[type="submit"]').click();
  await v.waitForFunction(() => window.__gifosVideo.chatTexts().includes('welcome to the show'), null, { timeout: 15000 });
  check('host chat reaches the viewer', true);

  // ---- the host turns chat OFF ---------------------------------------------
  check('the chat-off toggle exists for the host only',
    !(await hidden(h, '#chatmod')) && (await hidden(v, '#chatmod')));
  await h.locator('#chatmod').click();
  await v.waitForFunction(() => window.__gifosVideo.chatOff(), null, { timeout: 20000 });
  check('chat-off reaches the viewer (signed mod table on the heartbeat)', true);
  await v.waitForFunction(() => document.getElementById('chat-in').disabled, null, { timeout: 10000 });
  check('the viewer\'s composer locks', true);
  // a forced submit (DOM-hacked past the disabled input) is refused by the guard
  await v.evaluate(() => {
    const inp = document.getElementById('chat-in');
    inp.disabled = false; inp.value = 'sneaky line';
    document.getElementById('chatform').dispatchEvent(new Event('submit', { cancelable: true }));
  });
  await sleep(1500);
  check('a viewer\'s send while chat is off never leaves the device',
    !(await h.evaluate(() => window.__gifosVideo.chatTexts().includes('sneaky line'))));
  // the host still posts: announcements flow while the room is quiet
  await h.locator('#chat-in').fill('host announcement');
  await h.locator('#chatform button[type="submit"]').click();
  await v.waitForFunction(() => window.__gifosVideo.chatTexts().includes('host announcement'), null, { timeout: 15000 });
  check('the host\'s messages still land while chat is off', true);
  // and back ON
  await h.locator('#chatmod').click();
  await v.waitForFunction(() => !window.__gifosVideo.chatOff(), null, { timeout: 20000 });
  await v.waitForFunction(() => !document.getElementById('chat-in').disabled, null, { timeout: 10000 });
  await v.locator('#chat-in').fill('back again');
  await v.locator('#chatform button[type="submit"]').click();
  await h.waitForFunction(() => window.__gifosVideo.chatTexts().includes('back again'), null, { timeout: 15000 });
  check('chat-on releases the room (undo path, end to end)', true);

  // ---- per-message moderation: a signed delete ------------------------------
  await h.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#chatlog .cmsg'));
    const row = rows.find((r) => r.textContent.includes('hi from viewer'));
    const btn = row && row.querySelector('[data-cdel]');
    if (btn) btn.click();
  });
  await v.waitForFunction(() => !window.__gifosVideo.chatTexts().includes('hi from viewer'), null, { timeout: 15000 });
  check('the host\'s signed delete removes the message on every device', true);
  check('…and on the host\'s own device', !(await h.evaluate(() => window.__gifosVideo.chatTexts().includes('hi from viewer'))));

  // ---- the call-up: a stage grant hands the viewer their controls back ------
  const vId = await otherId(h);
  check('viewer cannot take the stage uninvited', !(await v.evaluate(() => window.__gifosVideo.canStageNow())));
  await h.evaluate((id) => window.__gifosVideo.grantApp(id, true), vId);
  await v.waitForFunction(() => window.__gifosVideo.canStageNow(), null, { timeout: 15000 });
  await v.waitForFunction(() => document.body.classList.contains('stage-granted'), null, { timeout: 10000 });
  check('the stage grant returns the mic/cam controls to the granted viewer', !(await hidden(v, '#mic')));
  await h.evaluate((id) => window.__gifosVideo.grantApp(id, false), vId);
  await v.waitForFunction(() => !document.body.classList.contains('stage-granted'), null, { timeout: 15000 });
  check('revoking the grant takes them away again', await hidden(v, '#mic'));

  // ---- a LATE viewer at a locked broadcast: the ticket booth ----------------
  // The door's courtesy gate refuses their empty proof, the R6 prompt asks
  // for the room password, and typing the ticket admits them to the show.
  const T = await newUser('Tara', null);
  const t = await open(T, 'late', 'v=' + room + '&av=' + av + '&bc=1');
  await t.waitForFunction(() => document.getElementById('pw-modal').style.display === 'flex'
    && /locked/i.test(document.getElementById('pw-title').textContent), null, { timeout: 30000 });
  check('a late viewer without the ticket meets the "room is locked" prompt', true);
  await t.locator('#pw-new').fill(TICKET);
  await t.locator('#pw-save').click();
  await t.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 60000 });
  await t.waitForFunction(() => {
    const el = document.querySelector('#stagefeed video');
    return !!(el && el.srcObject && el.readyState >= 2);
  }, null, { timeout: 40000 });
  check('typing the ticket admits them and the show is on their screen', true);

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
