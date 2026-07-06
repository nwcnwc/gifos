// Video-call e2e: three "machines" (separate contexts, fake cameras) meet in a
// P2P mesh. The relay carries ONLY signaling; media flows browser-to-browser.
// Verifies: system-app routing (icon → video.html), mesh connect, adaptive
// quality stepping down as participants join, and peer-leave cleanup.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
function check(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: [
      '--disable-features=WebRtcHideLocalIpsWithMdns',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  });
  const setup = (name) => ({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "')}catch(e){}" });
  const newUser = async (name) => {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript(setup(name));
    return ctx;
  };

  // ---------- creator: desktop icon routes to the system video page ----------
  const aCtx = await newUser('Ada');
  const desk = await aCtx.newPage();
  desk.on('console', (m) => { if (m.type() === 'error') console.log('  [desk]', m.text()); });
  await desk.goto(BASE + '/index.html');
  await desk.waitForSelector('.icon');
  const [aPage] = await Promise.all([
    aCtx.waitForEvent('page'),
    desk.locator('.icon', { hasText: 'Video Call.gif' }).dblclick(),   // root icon, top-right
  ]);
  aPage.on('console', (m) => { if (m.type() === 'error') console.log('  [ada]', m.text()); });
  await aPage.waitForURL(/video\.html/, { timeout: 8000 });
  check('Video Call icon routes to the trusted system page', /video\.html/.test(aPage.url()));

  await aPage.waitForFunction(() => {
    const el = document.getElementById('share-url');
    return el && el.value && /#v=.*&k=.*&relay=/.test(el.value);
  }, null, { timeout: 10000 });
  const link = await aPage.locator('#share-url').inputValue();
  check('creator produced a call invite link', /#v=.*&k=.*&relay=/.test(link));
  const q1 = await aPage.evaluate(() => window.__gifosVideo.quality());
  check('alone → top quality rung (720p)', q1 === '720p');

  // ---------- second participant joins over the invite link ----------
  const bCtx = await newUser('Bob');
  const bPage = await bCtx.newPage();
  bPage.on('console', (m) => { if (m.type() === 'error') console.log('  [bob]', m.text()); });
  await bPage.goto(link);
  await aPage.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 20000 });
  await bPage.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 20000 });
  check('creator ↔ joiner P2P media link is live on both ends', true);

  // remote video actually renders frames (media flows P2P, not via relay)
  await bPage.waitForFunction(() => {
    const v = document.querySelector('.tile:not(.me) video');
    return v && v.videoWidth > 0 && !v.paused;
  }, null, { timeout: 15000 });
  check('joiner renders live remote video frames', true);

  // ---------- third participant → mesh grows, quality steps down ----------
  const cCtx = await newUser('Cai');
  const cPage = await cCtx.newPage();
  cPage.on('console', (m) => { if (m.type() === 'error') console.log('  [cai]', m.text()); });
  await cPage.goto(link);
  await cPage.waitForFunction(() => window.__gifosVideo.liveLinks() >= 2, null, { timeout: 25000 });
  await aPage.waitForFunction(() => window.__gifosVideo.liveLinks() >= 2, null, { timeout: 25000 });
  await bPage.waitForFunction(() => window.__gifosVideo.liveLinks() >= 2, null, { timeout: 25000 });
  check('3-way mesh: every participant holds 2 live P2P links', true);
  const q3 = await aPage.evaluate(() => window.__gifosVideo.quality());
  check('3 participants → quality stepped down to 480p', q3 === '480p');
  const tilesOnC = await cPage.locator('.tile').count();
  check('late joiner sees all 3 tiles (me + 2 peers)', tilesOnC === 3);

  // ---------- quiet joins, status overlays, blur, group moderation ----------
  // Everyone joins muted with camera off, and the overlays say so everywhere.
  check('you join muted with camera off (quiet by default)',
    await bPage.evaluate(() => document.getElementById('mic').textContent === 'Unmute'
      && document.getElementById('cam').textContent === 'Camera on'
      && document.querySelector('.tile.me').classList.contains('cam-off')));
  await aPage.locator('.tile:not(.me)', { hasText: 'Bob' }).locator('.chips span', { hasText: 'camera off' }).waitFor({ timeout: 10000 });
  check('everyone sees Bob\'s muted/camera-off status on his tile', true);

  // Bob turns his camera on → the chip clears on Ada's screen.
  await bPage.locator('#cam').click();
  await aPage.waitForFunction(() => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes('Bob'));
    return t && !t.classList.contains('cam-off');
  }, null, { timeout: 10000 });
  check('turning the camera on updates everyone\'s overlay live', true);

  // Bob blurs himself → his video is blurred on Ada's screen, with a chip.
  await bPage.locator('#blur').click();
  await aPage.waitForFunction(() => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes('Bob'));
    return t && t.querySelector('video').classList.contains('blurred') && /blurred/.test(t.textContent);
  }, null, { timeout: 10000 });
  check('self-blur completely blurs your video on every other screen', true);

  // Ada mutes Cai FOR EVERYONE — enforced on each receiver, attributed to Ada.
  const caiTileOnAda = aPage.locator('.tile:not(.me)', { hasText: 'Cai' });
  await caiTileOnAda.hover();
  await caiTileOnAda.locator('button[data-mod="mute"]').click();
  await bPage.waitForFunction(() => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes('Cai'));
    return t && t.querySelector('video').muted && /muted for everyone by Ada/.test(t.textContent);
  }, null, { timeout: 10000 });
  check('group-mute silences the target on OTHER phones too, attributed to who did it', true);
  await cPage.waitForFunction(() => /muted for everyone by Ada/.test(document.querySelector('.tile.me').textContent), null, { timeout: 10000 });
  check('the muted person sees who muted them', true);

  // The target cannot lift it themselves: their Unmute button refuses.
  await cPage.locator('#mic').click();
  await sleep(300);
  check('a group-muted person cannot reopen their own mic',
    (await cPage.evaluate(() => window.__gifosVideo.micEnabled())) === false
    && /another participant has to lift it/.test(await cPage.locator('#status').textContent()));

  // And Bob (not Ada!) can lift it — anyone moderates, always attributed.
  const caiTileOnBob = bPage.locator('.tile:not(.me)', { hasText: 'Cai' });
  await caiTileOnBob.hover();
  await caiTileOnBob.locator('button[data-mod="mute"]').click();
  await aPage.waitForFunction(() => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes('Cai'));
    return t && !t.querySelector('video').muted;
  }, null, { timeout: 10000 });
  check('anyone can lift a group-mute (and it clears everywhere)', true);

  // ---------- hand raise: raised hands float to the top, in raise order ----------
  await cPage.locator('#hand').click();
  await sleep(400);
  await bPage.locator('#hand').click();
  await aPage.waitForFunction(() => {
    const o = {};
    document.querySelectorAll('.tile').forEach((t) => { o[t.querySelector('.name').textContent] = parseInt(t.style.order || '0', 10); });
    return o['Cai'] < o['Bob'] && o['Bob'] < o['Ada (you)'];
  }, null, { timeout: 10000 });
  check('raised hands float to the top of everyone\'s grid, in raise order', true);
  check('the hand shows as a chip on the tile', /hand raised/.test(await aPage.locator('.tile', { hasText: 'Cai' }).textContent()));
  await cPage.locator('#hand').click(); await bPage.locator('#hand').click(); // hands down

  // ---------- maximize: any feed becomes YOUR focus feed ----------
  const bobTile = aPage.locator('.tile:not(.me)', { hasText: 'Bob' });
  await bobTile.locator('.maxbtn').click();
  check('maximize makes that feed the focus feed at the top', await bobTile.evaluate((t) => t.classList.contains('focus') && parseInt(t.style.order, 10) < -50000));
  await bobTile.locator('.maxbtn').click();
  check('maximize toggles back to the grid', await bobTile.evaluate((t) => !t.classList.contains('focus')));

  // ---------- speaking: live audio lights the tile border ----------
  await bPage.locator('#mic').click(); // unmute — the fake device emits a tone
  const spoke = await bPage.waitForFunction(() => document.querySelector('.tile.me').classList.contains('speaking'), null, { timeout: 15000 }).then(() => true, () => false);
  check('audio coming through lights a border around the feed', spoke);
  await bPage.locator('#mic').click(); // back to muted

  // ---------- chat + pinned files: P2P DataChannels, no server ----------
  await aPage.locator('#chatbtn').click();
  await aPage.locator('#chat-in').fill('hello room');
  await aPage.locator('#chatform button[type=submit]').click();
  await bPage.waitForFunction(() => window.__gifosVideo.chatTexts().includes('hello room'), null, { timeout: 15000 });
  check('chat reaches everyone over DataChannels', true);
  check('unread messages badge the chat button', /\(1\)/.test(await bPage.locator('#chatbtn').textContent()));
  await aPage.setInputFiles('#cfile-in', { name: 'pinned.txt', mimeType: 'text/plain', buffer: Buffer.from('bytes pinned to the call') });
  await bPage.waitForFunction(() => {
    const fs = window.__gifosVideo.pinnedFiles();
    return fs.length === 1 && fs[0].name === 'pinned.txt' && fs[0].have;
  }, null, { timeout: 15000 });
  check('a pinned file replicates to every participant, bytes and all', true);

  // ---------- a participant leaves → tiles + quality recover ----------
  await cPage.close(); await cCtx.close();
  await aPage.waitForFunction(() => window.__gifosVideo.participants() === 2, null, { timeout: 25000 });
  const q2 = await aPage.evaluate(() => window.__gifosVideo.quality());
  check('peer-leave shrinks the mesh and quality steps back up', q2 === '720p');

  // ---------- the room is PERMANENT: it outlives its creator ----------
  check('creator URL carries the room (reload-safe)', await aPage.evaluate(() => /v=/.test(location.hash)));
  await aPage.close(); await aCtx.close(); // the creator is GONE
  const dCtx = await newUser('Dee');
  const dPage = await dCtx.newPage();
  dPage.on('console', (m) => { if (m.type() === 'error') console.log('  [dee]', m.text()); });
  await dPage.goto(link);
  await dPage.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.liveLinks() >= 1, null, { timeout: 25000 });
  await bPage.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1 && window.__gifosVideo.participants() === 2, null, { timeout: 25000 });
  check('room survives its creator — a new joiner still connects (no host)', true);

  // The late joiner MERGES the room's chat + files from whoever is still
  // there (Ada wrote them and left; Bob carried them; Dee gets them).
  await dPage.waitForFunction(() => window.__gifosVideo.chatTexts().includes('hello room')
    && window.__gifosVideo.pinnedFiles().some((f) => f.name === 'pinned.txt' && f.have), null, { timeout: 20000 });
  check('a late joiner merges the chat history + pinned files P2P (original author long gone)', true);
  // …and an unpin propagates as a tombstone
  await dPage.locator('#chatbtn').click();
  await dPage.locator('.cfile button[data-del]').click();
  await bPage.waitForFunction(() => window.__gifosVideo.pinnedFiles().length === 0, null, { timeout: 15000 });
  check('unpinning a file removes it for everyone (tombstone wins the merge)', true);

  // ---------- everyone leaves; the same URL still works later ----------
  await bPage.close(); await bCtx.close();
  await dPage.close(); await dCtx.close();
  await sleep(1200); // the room sits empty
  const eCtx = await newUser('Eve');
  const ePage = await eCtx.newPage();
  ePage.on('console', (m) => { if (m.type() === 'error') console.log('  [eve]', m.text()); });
  await ePage.goto(link);
  await ePage.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 15000 });
  const fCtx = await newUser('Fox');
  const fPage = await fCtx.newPage();
  fPage.on('console', (m) => { if (m.type() === 'error') console.log('  [fox]', m.text()); });
  await fPage.goto(link);
  await ePage.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 25000 });
  await fPage.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 25000 });
  check('an emptied room is still joinable later — the URL works forever', true);

  // ---------- a reload drops back into the SAME room and re-links ----------
  await fPage.reload();
  await fPage.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.liveLinks() >= 1, null, { timeout: 25000 });
  await ePage.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1 && window.__gifosVideo.participants() === 2, null, { timeout: 25000 });
  check('a reload rejoins the same room and the call re-establishes', true);

  // ---------- room password: set by one, propagated to all, demanded of joiners ----------
  await fPage.locator('#pwbtn').click();
  await fPage.locator('#pw-new').fill('sesame');
  await fPage.locator('#pw-save').click();
  // Eve was already in the room → the new password reaches her session live
  await ePage.waitForFunction(() => window.__gifosVideo.roomPw() === 'sesame', null, { timeout: 10000 });
  check('a password set by one participant propagates to every attached session', true);
  // …and her "Show current password" reveals it
  await ePage.locator('#pwbtn').click();
  await ePage.locator('#pw-show').click();
  check('Show current password reveals the live password',
    (await ePage.locator('#pw-cur').inputValue()) === 'sesame'
    && (await ePage.locator('#pw-cur').getAttribute('type')) === 'text');
  await ePage.locator('#pw-cancel').click();
  // a newcomer without the password is stopped at the door
  const gCtx = await newUser('Gil');
  const gPage = await gCtx.newPage();
  gPage.on('console', (m) => { if (m.type() === 'error') console.log('  [gil]', m.text()); });
  await gPage.goto(link);
  await gPage.waitForSelector('#pw-modal', { state: 'visible', timeout: 15000 });
  check('a locked room prompts new joiners for the password', /locked/i.test(await gPage.locator('#pw-title').textContent()));
  // wrong password → bounced straight back to the prompt
  await gPage.locator('#pw-new').fill('wrong-guess');
  await gPage.locator('#pw-save').click();
  await gPage.waitForSelector('#pw-modal', { state: 'visible', timeout: 15000 });
  check('a wrong password bounces back to the prompt', true);
  // right password → in, talking to everyone
  await gPage.locator('#pw-new').fill('sesame');
  await gPage.locator('#pw-save').click();
  await gPage.waitForFunction(() => window.__gifosVideo.liveLinks() >= 2, null, { timeout: 25000 });
  check('the correct password admits the joiner into the call', true);

  // ---------- no server persistence: occupancy re-establishes the lock ----------
  // Everyone leaves; the relay remembers NOTHING. Eve returns first — her
  // session still carries the password, so her arrival re-locks the room.
  await fPage.close(); await gPage.close(); await gCtx.close(); await ePage.close();
  await sleep(1200);
  const e2Page = await eCtx.newPage(); // Eve's browser kept the password locally
  e2Page.on('console', (m) => { if (m.type() === 'error') console.log('  [eve2]', m.text()); });
  await e2Page.goto(link);
  await e2Page.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 15000 });
  await sleep(600);
  const hCtx = await newUser('Hal');
  const hPage = await hCtx.newPage();
  await hPage.goto(link);
  await hPage.waitForSelector('#pw-modal', { state: 'visible', timeout: 15000 });
  check('first returning occupant re-locks the empty room from their own session (no server storage)', true);
  await hPage.locator('#pw-new').fill('sesame');
  await hPage.locator('#pw-save').click();
  await hPage.waitForFunction(() => window.__gifosVideo.liveLinks() >= 1, null, { timeout: 25000 });
  check('…and the password still admits people, exactly as before', true);

  // ---------- honest tiles: a peer no P2P route can reach gets SAID, not silence ----------
  // Simulate a corporate-firewall peer: their ICE candidates never leave (or
  // arrive), so no media pair can ever form — exactly a UDP-blocked network.
  const fwCtx = await newUser('Cubicle');
  await fwCtx.addInitScript({ content: `
    const OW = window.WebSocket;
    window.WebSocket = function (u, p) {
      const ws = p ? new OW(u, p) : new OW(u);
      const send0 = ws.send.bind(ws);
      ws.send = (d) => { if (typeof d === 'string' && d.includes('"kind":"ice"')) return; return send0(d); };
      let userOnMsg = null;
      Object.defineProperty(ws, 'onmessage', { set (f) { userOnMsg = f; }, get () { return userOnMsg; } });
      ws.addEventListener('message', (e) => { if (typeof e.data === 'string' && e.data.includes('"kind":"ice"')) return; if (userOnMsg) userOnMsg(e); });
      return ws;
    };
    window.WebSocket.prototype = OW.prototype;
  ` });
  const fwPage = await fwCtx.newPage();
  await fwPage.goto(link);
  await fwPage.waitForSelector('#pw-modal', { state: 'visible', timeout: 15000 });
  await fwPage.locator('#pw-new').fill('sesame');
  await fwPage.locator('#pw-save').click();
  // presence still works (signaling flows) — everyone sees the tile…
  await hPage.waitForFunction(() => window.__gifosVideo.participants() >= 3, null, { timeout: 20000 });
  // …and after the grace period the tile SAYS why there's no video.
  await hPage.waitForFunction(() => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes('Cubicle'));
    return t && /no direct path/.test(t.textContent);
  }, null, { timeout: 30000 });
  check('a blocked pair shows "no direct path — firewall blocks P2P" instead of silent black', true);

  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
