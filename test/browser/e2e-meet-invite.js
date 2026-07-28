// Meeting Invite redesign: all link-minting lives in the Invite button now.
//  * a plain room HIDES the Admin button (nothing for it to do there),
//  * Invite in a plain room offers "create a room you control",
//  * creating an admin room is a MOVE to a different room — done SOLO it just
//    switches you; done with people present it first drops a follow-me link into
//    the OLD room's chat so nobody is stranded (the footgun this fixes),
//  * an admin room's Invite just shares the (safe) link and shows the Admin
//    button for sign-in / bans.
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
  const newUser = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript(setup(name));
    return ctx;
  };
  const room = 'inv' + Math.floor(Math.random() * 1e6).toString(36);
  const plainHash = 'v=' + room;
  const open = async (ctx, label, hash) => {
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => console.log('  [' + label + ' pageerror]', e.message));
    await pg.goto(BASE + '/meet.html#' + hash);
    await pg.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 12000 });
    return pg;
  };

  // ---- Ada alone in a plain room ------------------------------------------------
  const adaCtx = await newUser('Ada');
  const ada = await open(adaCtx, 'ada', plainHash);
  check('a plain room hides the Admin button', !(await ada.locator('#admbtn').isVisible()));

  await ada.locator('#invite').click();
  check('Invite in a plain room offers "create a room you control"', await ada.locator('#inv-mkadm').isVisible());
  await ada.locator('#inv-mkadm').click();
  check('alone, there is NO "post to chat" option (no one to strand)',
    (await ada.locator('#inv-adm-post').count()) === 0);
  // close the modal without creating (click the backdrop)
  await ada.locator('#inv-done').click();

  // ---- Ben joins the same plain room -------------------------------------------
  const benCtx = await newUser('Ben');
  const ben = await open(benCtx, 'ben', plainHash);
  // OPEN DataChannels, not ICE-only liveLinks (the 21cb24f audit class this
  // suite missed) — the follow-me chat below is ONE frame over this very
  // pair, and Ada leaves 600ms after posting it. Then the young-pair settle
  // (codified law, e011881): a pair in its first seconds may honestly
  // drop/rebuild once, and a frame posted into the rebuild window is lost
  // with its author gone — the recorded sharp edge, not this suite's
  // subject (warm-box runs landed in that window 7/7; any perturbation
  // moved it out).
  await ada.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 40000 });
  await ben.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 40000 });
  check('Ada and Ben are meshed in the plain room', true);
  await sleep(9000);
  await ada.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 20000 });

  // ---- Ada turns it into an admin room WITH people present ----------------------
  // An admin room is ALWAYS a different room (its verifier is a password
  // fingerprint), so the name is free — encouraged. Ada picks a fresh one.
  const adminName = 'club' + Math.floor(Math.random() * 1e6).toString(36);
  await ada.locator('#invite').click();
  await ada.locator('#inv-mkadm').click();
  check('the room-name field is prefilled with the current room but editable',
    (await ada.locator('#inv-adm-room').inputValue()) === room);
  check('with people present, Invite offers to post the link to chat', await ada.locator('#inv-adm-post').isVisible());
  check('the post-to-chat box is ticked by default', await ada.locator('#inv-adm-post').isChecked());
  await ada.locator('#inv-adm-room').fill(adminName);
  await ada.locator('#inv-adm-pass').fill('backstage-topsecret');
  await ada.locator('#inv-adm-go').click();

  // Ada lands in the admin room she NAMED, verifier welded on, as admin.
  await ada.waitForURL(new RegExp('v=' + adminName + '&av=[a-f0-9]{24}'), { timeout: 30000 });
  await ada.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.amAdmin(), null, { timeout: 15000 });
  check('creator switches into the new admin room under the name she chose, as admin',
    (await ada.evaluate(() => window.__gifosVideo.room())) === adminName && (await ada.evaluate(() => window.__gifosVideo.hasAdmin())));

  // Ben stayed in the OLD plain room and received a follow-me link to the new room.
  await ben.waitForFunction(() => window.__gifosVideo.chatLinks().length >= 1, null, { timeout: 15000 });
  const benLink = (await ben.evaluate(() => window.__gifosVideo.chatLinks()))[0];
  check('the person left behind gets a follow-me link to the chosen admin room',
    (benLink || '').includes(adminName) && /[a-f0-9]{24}/.test(benLink || ''));
  check('the left-behind person is still in the ORIGINAL (plain) room',
    (await ben.evaluate(() => window.__gifosVideo.room())) === room && !(await ben.evaluate(() => window.__gifosVideo.hasAdmin())));
  check('the follow-me chat message reads as an invitation to move',
    (await ben.evaluate(() => window.__gifosVideo.chatTexts())).some((t) => /follow me/i.test(t)));

  // ---- Ada's Invite in the admin room: share only, no re-create; Admin visible --
  await ada.locator('#invite').click();
  check('an admin room\'s Invite shows the link (no re-create option)',
    (await ada.locator('#inv-url').isVisible()) && (await ada.locator('#inv-mkadm').count()) === 0);
  await ada.locator('#inv-done').click();
  check('the Admin button IS visible inside an admin room (sign-in + bans)', await ada.locator('#admbtn').isVisible());

  // ---- Act 2: the RELAY-ENVELOPE COPY — the link survives a pair DOWN at post
  // time. The recorded sharp edge this guards: the mover leaves 600ms after ONE
  // chat frame, and a pair rebuilding at that instant used to lose the link
  // FOREVER (chat is an event — nothing re-mints it, and its minter is gone).
  // The mover now also sends every rostered member a sealed targeted copy over
  // the relay ({t:'peer'} → onRemote), which needs no pair. Manufacture the
  // window deterministically: rebuild from the NON-initiator side (no fresh
  // offer flows, so the pair stays down across the derive + post — the same
  // hook as e2e-pw-heal, aimed the other way), then move immediately.
  const room2 = 'inv' + Math.floor(Math.random() * 1e6).toString(36);
  const hash2 = 'v=' + room2 + '&DEBUG=on';
  const dee = await open(await newUser('Dee'), 'dee', hash2);
  const eli = await open(await newUser('Eli'), 'eli', hash2);
  await dee.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 40000 });
  await eli.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 40000 });
  await sleep(9000); // young-pair settle (e011881) — the down-window must be OURS
  await dee.waitForFunction(() => window.__gifosVideo.liveDataLinks() >= 1, null, { timeout: 20000 });
  const deeId = await dee.evaluate(() => window.__gifosVideo.debugDump().me.peer);
  const eliId = await eli.evaluate(() => window.__gifosVideo.debugDump().me.peer);
  const reb2 = deeId < eliId ? await dee.evaluate((pid) => window.__gifosVideo.rebuildPair(pid), eliId)
    : await eli.evaluate((pid) => window.__gifosVideo.rebuildPair(pid), deeId);
  check('act 2: pair force-rebuilt from the non-initiator (down across the post window)', !!(reb2 && reb2.ok));
  const adminName2 = 'club' + Math.floor(Math.random() * 1e6).toString(36);
  await dee.locator('#invite').click();
  await dee.locator('#inv-mkadm').click();
  await dee.locator('#inv-adm-room').fill(adminName2);
  await dee.locator('#inv-adm-pass').fill('backstage-two');
  await dee.locator('#inv-adm-go').click();
  await dee.waitForURL(new RegExp('v=' + adminName2 + '&av=[a-f0-9]{24}'), { timeout: 30000 });
  // Poll, don't die raw: a miss here is the REGRESSION this act exists to
  // catch (verified red without the relay copy) — it must land as a FAIL
  // with the state visible, not a TimeoutError stack.
  let eliLink = '';
  const tRC = Date.now();
  while (Date.now() - tRC < 20000 && !eliLink) {
    eliLink = (await eli.evaluate(() => window.__gifosVideo.chatLinks()).catch(() => []))[0] || '';
    if (!eliLink) await sleep(500);
  }
  check('RELAY COPY: the follow-me link lands though the pair was DOWN at post time',
    eliLink.includes(adminName2) && /[a-f0-9]{24}/.test(eliLink));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
