// Video-call e2e: three "machines" (separate contexts, fake cameras) meet in a
// P2P mesh. The relay carries ONLY signaling; media flows browser-to-browser.
// Verifies: system-app routing (icon → meet.html), mesh connect, adaptive
// quality stepping down as participants join, and peer-leave cleanup.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
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
  // gifos_meet_bar='0' keeps the controls bar expanded (it defaults collapsed to
  // give video the space) so the test can reach Password/Hand/Chat/Record.
  const setup = (name) => ({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}" });
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
    desk.locator('.icon', { hasText: 'Meeting.gif' }).dblclick(),   // root icon, top-right
  ]);
  aPage.on('console', (m) => { if (m.type() === 'error') console.log('  [ada]', m.text()); });
  await aPage.waitForURL(/meet\.html/, { timeout: 8000 });
  check('Meeting icon routes to the trusted system page', /meet\.html/.test(aPage.url()));

  // A cold open lands on the lobby now — start an open meeting to get a room.
  await aPage.locator('#lob-open').click();
  await aPage.waitForFunction(() => {
    const el = document.getElementById('share-url');
    return el && el.value && /#v=.*&k=.*&relay=/.test(el.value);
  }, null, { timeout: 10000 });
  const link = await aPage.locator('#share-url').inputValue();
  check('creator produced a meeting invite link', /#v=.*&k=.*&relay=/.test(link));
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
  // Everyone joins muted, camera off, AND Max blur. Mic/camera are red-with-X
  // icons (the .off class); blur is a 3-way slider with Max selected.
  check('you join muted with camera off (quiet by default)',
    await bPage.evaluate(() => window.__gifosVideo.micMuted() && window.__gifosVideo.camOff()
      && document.getElementById('mic').classList.contains('off')
      && document.getElementById('cam').classList.contains('off')
      && document.querySelector('.tile.me').classList.contains('cam-off')));
  check('you join at Max blur (hidden by default)',
    await bPage.evaluate(() => window.__gifosVideo.myBlur() === 2 && document.getElementById('blur-max').classList.contains('sel')));
  await aPage.locator('.tile:not(.me)', { hasText: 'Bob' }).locator('.chips span', { hasText: 'camera off' }).waitFor({ timeout: 10000 });
  check('everyone sees Bob\'s muted/camera-off status on his tile', true);

  // Bob turns his camera on → still Max-blurred on Ada's screen (join default).
  await bPage.locator('#cam').click();
  await aPage.waitForFunction(() => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes('Bob'));
    return t && !t.classList.contains('cam-off') && t.querySelector('video').classList.contains('blur2');
  }, null, { timeout: 10000 });
  check('camera on, but everyone still sees Bob at Max blur (blur2)', true);
  // SENDER-SIDE: Bob's browser broadcasts the blur canvas, not the raw camera —
  // so no clear pixels ever leave his device (a DOM edit can't unblur him).
  check('Bob broadcasts blurred pixels at the source (not the raw camera)',
    (await bPage.evaluate(() => window.__gifosVideo.outboundKind())) === 'blurred');

  // Bob picks Min on the slider → plain blur. Ada sees blur1 now.
  await bPage.evaluate(() => document.getElementById('blur-min').click());
  check('picking Min on the slider steps blur down to plain',
    (await bPage.evaluate(() => window.__gifosVideo.myBlur())) === 1);
  await aPage.waitForFunction(() => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes('Bob'));
    return t && t.querySelector('video').classList.contains('blur1');
  }, null, { timeout: 10000 });
  check('plain blur shows as blur1 on every other screen', true);
  // Everyone needs their CAMERA ON to be "ready" for clear video (consent =
  // camera on + blur None). Bob's is already on; turn Ada's and Cai's on.
  await aPage.locator('#cam').click();
  await cPage.locator('#cam').click();
  // A PASSWORD IS THE KEY TO CLEAR VIDEO. The slider always lets you PICK None,
  // but with no password the room rule keeps you blurred and says why.
  await bPage.evaluate(() => document.getElementById('blur-none').click());
  check('you can select None, but with no password the status explains the block',
    await bPage.evaluate(() => window.__gifosVideo.myBlur() === 0
      && /Password must be set for unblurred video/.test(document.getElementById('status').textContent)));
  await sleep(400);
  check('and with no password the tile stays blurred everywhere', await aPage.evaluate(() => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes('Bob'));
    return t && t.querySelector('video').classList.contains('blur1');
  }));
  check('…and Bob still BROADCASTS blurred pixels (rule is sender-enforced)',
    (await bPage.evaluate(() => window.__gifosVideo.outboundKind())) === 'blurred');
  // Bob sets a room password (plain room: anyone inside may). Bob already chose
  // None, so once a password exists a plain room still needs EVERYONE ready.
  await bPage.locator('#pwbtn').click();
  await bPage.locator('#pw-new').fill('clubhouse');
  await bPage.locator('#pw-save').click();
  await aPage.waitForFunction(() => window.__gifosVideo.roomPw() === 'clubhouse', null, { timeout: 8000 });
  await cPage.waitForFunction(() => window.__gifosVideo.roomPw() === 'clubhouse', null, { timeout: 8000 });
  check('a room password propagates to everyone', true);
  await sleep(800); // let gossip settle
  check('one person ready is not enough — Bob still shows blurred on every screen', await aPage.evaluate(() => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes('Bob'));
    return t && t.querySelector('video').classList.contains('blur1');
  }));
  check('…and Bob still BROADCASTS blurred pixels', (await bPage.evaluate(() => window.__gifosVideo.outboundKind())) === 'blurred');
  // Ada and Cai pick None too — now EVERYONE is ready (camera on, blur None).
  await aPage.evaluate(() => document.getElementById('blur-none').click());
  await cPage.evaluate(() => document.getElementById('blur-none').click());
  await bPage.waitForFunction(() => window.__gifosVideo.consensus() === true, null, { timeout: 10000 });
  await aPage.waitForFunction(() => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes('Bob'));
    return t && !t.querySelector('video').classList.contains('blur1') && !t.querySelector('video').classList.contains('blur2');
  }, null, { timeout: 10000 });
  check('with a password AND everyone ready, the whole room goes clear', true);
  await bPage.waitForFunction(() => window.__gifosVideo.outboundKind() === 'raw', null, { timeout: 10000 });
  check('…and Bob broadcasts raw now', true);

  // ========== THE ALL-OR-NONE INVARIANT, CHECKED EVERYWHERE ==========
  // Plain rooms are binary: after unanimity, EVERY page must see EVERY tile
  // clear AND broadcast raw. (The live bug: phones disagreed about consensus —
  // one showed all-blurred, another a mix of clear and blurry senders.)
  const allClearEverywhere = async () => {
    for (const [nm, pg] of [['Ada', aPage], ['Bob', bPage], ['Cai', cPage]]) {
      const ok = await pg.evaluate(() => window.__gifosVideo.consensus() === true
        && window.__gifosVideo.outboundKind() === 'raw'
        && Array.from(document.querySelectorAll('.tile video')).every((v) => !v.classList.contains('blur1') && !v.classList.contains('blur2')));
      if (!ok) return nm;
    }
    return null;
  };
  check('ALL-OR-NONE: every page agrees, every tile clear, every sender raw', (await allClearEverywhere()) === null);

  // ========== A LOST STATUS MESSAGE HEALS (heartbeat) ==========
  // Simulate the exact live failure: one phone misses another's status
  // broadcast. Its view of consensus collapses (room re-blurs locally) — and
  // the periodic heartbeat must repair it WITHOUT anyone touching anything.
  const bobPidOnAda = await aPage.evaluate(() => window.__gifosVideo.peerIds().find((id) => true));
  check('a lost status splits the room (the pre-heartbeat disease, simulated)',
    (await aPage.evaluate((pid) => { window.__gifosVideo._corruptStatus(pid); return window.__gifosVideo.consensus(); }, bobPidOnAda)) === false);
  await aPage.waitForFunction(() => window.__gifosVideo.consensus() === true, null, { timeout: 12000 });
  check('…and the status heartbeat heals the split within seconds, hands-free', (await allClearEverywhere()) === null);

  // ========== STREAM IDENTITY: every tile provably shows its OWN person ======
  // (The live bug: a tile showed a DIFFERENT participant's camera.) A tile's
  // stream id must equal the sid its peer announced — on every page, every tile.
  const identityOk = async (pg) => pg.evaluate(() => window.__gifosVideo.peerIds().every((id) => {
    const shown = window.__gifosVideo.tileSid(id);
    return !shown || shown === window.__gifosVideo.announcedSid(id);
  }));
  check('STREAM IDENTITY: every tile on every page shows the announced stream — no guessing',
    (await identityOk(aPage)) && (await identityOk(bPage)) && (await identityOk(cPage)));
  // Even when a peer's announcement is LOST, the tile must never fall back to
  // guessing — and the heartbeat re-announces the sid, restoring the claim.
  await aPage.evaluate((pid) => window.__gifosVideo._corruptSid(pid), bobPidOnAda);
  await aPage.waitForFunction((pid) => window.__gifosVideo.announcedSid(pid)
    && window.__gifosVideo.tileSid(pid) === window.__gifosVideo.announcedSid(pid), bobPidOnAda, { timeout: 12000 });
  check('a lost sid announcement re-proves itself via the heartbeat (no misattribution window)', true);

  // ========== AWAY ≠ FIREWALL ==========
  // A phone that backgrounds tells the room it stepped away; its tile says so
  // and must NEVER earn the 'firewall' label. (The live bug: switching apps
  // showed 'a firewall here blocks peer-to-peer video'.)
  await cPage.evaluate(() => {
    Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await aPage.waitForFunction(() => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes('Cai'));
    return t && /stepped away/.test(t.textContent) && !/firewall/.test(t.textContent);
  }, null, { timeout: 10000 });
  check('a backgrounded phone shows "stepped away" — never the firewall warning', true);
  await cPage.evaluate(() => {
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await aPage.waitForFunction(() => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes('Cai'));
    return t && !/stepped away/.test(t.textContent);
  }, null, { timeout: 10000 });
  check('coming back clears the away label everywhere', true);

  // MODERATOR BLOCK: a per-tile blur overrides the owner's None on EVERY
  // screen, and lifting it returns the tile to clear immediately (the owner
  // still consents) — no re-consent dance.
  const bobTileOnAda = aPage.locator('.tile:not(.me)', { hasText: 'Bob' });
  await bobTileOnAda.hover();
  await bobTileOnAda.locator('button[data-mod="blur"]').click(); // Ada blurs Bob for everyone
  await cPage.waitForFunction(() => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes('Bob'));
    const v = t && t.querySelector('video');
    return v && (v.classList.contains('blur1') || v.classList.contains('blur2'));
  }, null, { timeout: 10000 });
  check('a moderator block blurs the tile on everyone else\'s screen', true);
  check('…and Bob broadcasts blurred pixels while blocked (sender-enforced)',
    (await bPage.evaluate(() => window.__gifosVideo.outboundKind())) === 'blurred');
  await bobTileOnAda.hover();
  await bobTileOnAda.locator('button[data-mod="blur"]').click(); // Ada lifts it
  await cPage.waitForFunction(() => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes('Bob'));
    return t && !t.querySelector('video').classList.contains('blur1') && !t.querySelector('video').classList.contains('blur2');
  }, null, { timeout: 10000 });
  check('lifting the block returns the consenting tile to clear immediately', true);

  // Removing the password instantly re-blurs the room — everyone was
  // clear (blur None); with no password there is no clear video for anyone.
  await bPage.locator('#pwbtn').click();
  await bPage.locator('#pw-new').fill('');
  await bPage.locator('#pw-save').click();
  await bPage.waitForFunction(() => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes('Ada'));
    return t && t.querySelector('video').classList.contains('blur1');
  }, null, { timeout: 8000 });
  check('removing the password re-blurs everyone at once (no clear video without it)', true);

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
  // FILES NEED A ROOM PASSWORD. With none set, the panel shows a lock note and
  // an attach is refused (an open room must not leak shared files).
  check('with no room password, the file panel shows the locked note',
    /Set a room password/.test(await aPage.locator('#cfilelist').textContent()));
  await aPage.setInputFiles('#cfile-in', { name: 'nope.txt', mimeType: 'text/plain', buffer: Buffer.from('should not pin') });
  await sleep(400);
  check('a file cannot be pinned without a room password',
    (await aPage.evaluate(() => window.__gifosVideo.pinnedFiles().length)) === 0);
  // Ada sets a password → files are now allowed.
  await aPage.locator('#pwbtn').click();
  await aPage.locator('#pw-new').fill('vault');
  await aPage.locator('#pw-save').click();
  await bPage.waitForFunction(() => window.__gifosVideo.roomPw() === 'vault', null, { timeout: 8000 });
  await aPage.setInputFiles('#cfile-in', { name: 'pinned.txt', mimeType: 'text/plain', buffer: Buffer.from('bytes pinned to the call') });
  await bPage.waitForFunction(() => {
    const fs = window.__gifosVideo.pinnedFiles();
    return fs.length === 1 && fs[0].name === 'pinned.txt' && fs[0].have;
  }, null, { timeout: 15000 });
  check('with a password set, a pinned file replicates to every participant, bytes and all', true);

  // ---------- recording: on-device, loudly attributed ----------
  await aPage.locator('#recbtn').click();
  await bPage.waitForFunction(() => Array.from(document.querySelectorAll('.tile'))
    .some((t) => t.textContent.includes('Ada') && /recording this meeting/.test(t.textContent)), null, { timeout: 10000 });
  check('everyone sees WHO is recording (chip on the recorder\'s tile)', true);
  await sleep(3500);
  const [recDl] = await Promise.all([
    aPage.waitForEvent('download'),
    aPage.locator('#recbtn').click(),
  ]);
  const recPath = await recDl.path();
  check('stopping saves a real .webm on the recorder\'s device only',
    /\.webm$/.test(recDl.suggestedFilename()) && fs.statSync(recPath).size > 20000);
  await bPage.waitForFunction(() => !Array.from(document.querySelectorAll('.tile'))
    .some((t) => /recording this meeting/.test(t.textContent)), null, { timeout: 10000 });
  check('the recording chip clears everywhere on stop', true);

  // ---------- transcription: per-speaker lines merge P2P ----------
  await aPage.evaluate(() => window.__gifosVideo.addTranscript('hello transcript world'));
  await bPage.waitForFunction(() => window.__gifosVideo.transcriptTexts()
    .some((l) => l === 'Ada: hello transcript world'), null, { timeout: 15000 });
  check('transcript lines reach every phone, attributed to the speaker', true);
  check('the line shows as a live caption on the speaker\'s tile', await bPage.evaluate(() => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes('Ada'));
    const c = t && t.querySelector('.cap');
    return !!(c && c.classList.contains('show') && /hello transcript world/.test(c.textContent));
  }));
  // Once captions are in play, a Transcript button surfaces in the TOP BAR —
  // it must not hide behind Chat. It opens the panel straight to the transcript.
  await bPage.locator('#trbtn').waitFor({ state: 'visible', timeout: 8000 });
  await bPage.locator('#trbtn').click();
  await bPage.locator('.trline', { hasText: 'hello transcript world' }).waitFor({ timeout: 5000 });
  check('a top-bar Transcript button appears and opens straight to the transcript', true);
  // The panel remembers its view: reopening via Chat lands back on the
  // transcript, and the header tab still toggles between the two.
  await bPage.locator('#chatclose').click();
  await bPage.locator('#chatbtn').click();
  await bPage.locator('.trline', { hasText: 'hello transcript world' }).waitFor({ timeout: 5000 });
  const [trDl] = await Promise.all([
    bPage.waitForEvent('download'),
    bPage.locator('#trdl').click(),
  ]);
  check('the merged transcript downloads as text', /transcript\.txt$/.test(trDl.suggestedFilename()));
  await bPage.locator('#chatclose').click();

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
  // the room now carries a password → the late joiner is prompted for it
  await dPage.locator('#pw-modal').waitFor({ state: 'visible', timeout: 15000 });
  await dPage.locator('#pw-new').fill('vault');
  await dPage.locator('#pw-save').click();
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

  // Clearing the room password DELETES shared files — with a warning first.
  await dPage.setInputFiles('#cfile-in', { name: 'secret.txt', mimeType: 'text/plain', buffer: Buffer.from('for members only') });
  await bPage.waitForFunction(() => window.__gifosVideo.pinnedFiles().some((f) => f.name === 'secret.txt' && f.have), null, { timeout: 15000 });
  let clearWarned = false;
  bPage.once('dialog', (d) => { clearWarned = /delete/i.test(d.message()) && /1 file/.test(d.message()); d.accept(); });
  await bPage.locator('#pwbtn').click();
  await bPage.locator('#pw-new').fill('');
  await bPage.locator('#pw-save').click();
  check('clearing the password warns it will delete the shared files first', clearWarned);
  await dPage.waitForFunction(() => window.__gifosVideo.pinnedFiles().length === 0 && !window.__gifosVideo.roomPw(), null, { timeout: 15000 });
  check('clearing the password deletes the shared files for everyone', true);

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
    return t && /no direct path/.test(t.textContent) && t.classList.contains('noroute') && parseInt(t.style.order || '0', 10) >= 100000;
  }, null, { timeout: 30000 });
  check('with NO possible route or relayer, the tile sinks to the bottom, labeled', true);

  // ---------- islands: A reaches B and C, but B↔C can't connect ----------
  // B's ICE to/from C specifically is swallowed (two different firewalls).
  // Expect: C sinks to the bottom of B's grid, labeled — and chat/files still
  // reach B↔C by hopping through A (gossip over the working DataChannels).
  const hubCtx = await newUser('Hub');
  const hubPage = await hubCtx.newPage();
  hubPage.on('console', (m) => { if (m.type() === 'error') console.log('  [hub]', m.text()); });
  await hubPage.goto(BASE + '/meet.html');
  await hubPage.locator('#lob-open').click(); // cold open → lobby → start an open meeting
  await hubPage.waitForFunction(() => document.getElementById('share-url') && document.getElementById('share-url').value, null, { timeout: 15000 });
  const islandLink = await hubPage.locator('#share-url').inputValue();
  const cIsleCtx = await newUser('RightIsle');
  const cIslePage = await cIsleCtx.newPage();
  await cIslePage.goto(islandLink);
  await cIslePage.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.liveLinks() >= 1, null, { timeout: 25000 });
  const cPeerId = await cIslePage.evaluate(() => sessionStorage.getItem('gifos_vpeer_' + window.__gifosVideo.room()));
  const bIsleCtx = await newUser('LeftIsle');
  await bIsleCtx.addInitScript({ content: `
    const BLOCK = ${JSON.stringify(cPeerId)};
    const OW = window.WebSocket;
    window.WebSocket = function (u, p) {
      const ws = p ? new OW(u, p) : new OW(u);
      const send0 = ws.send.bind(ws);
      ws.send = (d) => { if (typeof d === 'string' && d.includes('"kind":"ice"') && d.includes(BLOCK)) return; return send0(d); };
      let userOnMsg = null;
      Object.defineProperty(ws, 'onmessage', { set (f) { userOnMsg = f; }, get () { return userOnMsg; } });
      ws.addEventListener('message', (e) => { if (typeof e.data === 'string' && e.data.includes('"kind":"ice"') && e.data.includes(BLOCK)) return; if (userOnMsg) userOnMsg(e); });
      return ws;
    };
    window.WebSocket.prototype = OW.prototype;
  ` });
  const bIslePage = await bIsleCtx.newPage();
  bIslePage.on('console', (m) => { if (m.type() === 'error') console.log('  [leftisle]', m.text()); });
  await bIslePage.goto(islandLink);
  await bIslePage.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.liveLinks() >= 1, null, { timeout: 25000 });
  await hubPage.waitForFunction(() => window.__gifosVideo.liveLinks() >= 2, null, { timeout: 25000 });
  // PEER RELAY: the Hub notices it reaches both islands and forwards media —
  // the blocked pair SEE each other, labeled "via Hub", tiles in normal spots.
  await bIslePage.waitForFunction(() => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes('RightIsle'));
    const v = t && t.querySelector('video');
    return t && /via Hub/.test(t.textContent) && !t.classList.contains('noroute') && v && v.srcObject && v.videoWidth > 0;
  }, null, { timeout: 45000 });
  check('a mutual friend relays live media between a blocked pair (video frames flow)', true);
  await cIslePage.waitForFunction(() => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes('LeftIsle'));
    const v = t && t.querySelector('video');
    return t && /via Hub/.test(t.textContent) && v && v.srcObject && v.videoWidth > 0;
  }, null, { timeout: 45000 });
  check('…in both directions, each side labeled "via Hub"', true);
  // chat hops LeftIsle → Hub → RightIsle
  await bIslePage.locator('#chatbtn').click();
  await bIslePage.locator('#chat-in').fill('across the water');
  await bIslePage.locator('#chatform button[type=submit]').click();
  await cIslePage.waitForFunction(() => window.__gifosVideo.chatTexts().includes('across the water'), null, { timeout: 15000 });
  check('chat between unreachable peers hops through a mutual friend', true);
  // …and a pinned file makes the same journey, bytes included (files need a
  // password — LeftIsle sets one; it reaches all islands over the relay).
  await bIslePage.locator('#pwbtn').click();
  await bIslePage.locator('#pw-new').fill('bottle');
  await bIslePage.locator('#pw-save').click();
  await cIslePage.waitForFunction(() => window.__gifosVideo.roomPw() === 'bottle', null, { timeout: 15000 });
  await bIslePage.setInputFiles('#cfile-in', { name: 'message-in-a-bottle.txt', mimeType: 'text/plain', buffer: Buffer.from('gossip-carried bytes') });
  await cIslePage.waitForFunction(() => {
    const fs = window.__gifosVideo.pinnedFiles();
    return fs.length === 1 && fs[0].name === 'message-in-a-bottle.txt' && fs[0].have;
  }, null, { timeout: 20000 });
  check('pinned files reach unreachable peers through the mutual friend too', true);

  // ========== MID-CALL LINK DEATH → RELAY TAKEOVER, IDENTITY INTACT ==========
  // The live glitch: a direct link died mid-call, a friend-relay took over, and
  // the tile ended up showing the HUB's face under the dead peer's name. Here:
  // three phones fully meshed; Sam↔Tia's transport is killed AND their ICE is
  // blocked from then on (a network change that never heals). The hub must take
  // over — and Sam's tile for Tia must show TIA's forwarded stream, provably.
  const dynBlock = `
    window.__iceBlock = [];
    const OW = window.WebSocket;
    window.WebSocket = function (u, p) {
      const ws = p ? new OW(u, p) : new OW(u);
      const send0 = ws.send.bind(ws);
      const blocked = (d) => typeof d === 'string' && d.includes('"kind":"ice"') && window.__iceBlock.some((b) => d.includes(b));
      ws.send = (d) => { if (blocked(d)) return; return send0(d); };
      let userOnMsg = null;
      Object.defineProperty(ws, 'onmessage', { set (f) { userOnMsg = f; }, get () { return userOnMsg; } });
      ws.addEventListener('message', (e) => { if (blocked(e.data)) return; if (userOnMsg) userOnMsg(e); });
      return ws;
    };
    window.WebSocket.prototype = OW.prototype;
  `;
  const rexCtx = await newUser('Rex');
  const rexPage = await rexCtx.newPage();
  rexPage.on('console', (m) => { if (m.type() === 'error') console.log('  [rex]', m.text()); });
  await rexPage.goto(BASE + '/meet.html');
  await rexPage.locator('#lob-open').click(); // cold open → lobby → start an open meeting
  await rexPage.waitForFunction(() => document.getElementById('share-url') && document.getElementById('share-url').value, null, { timeout: 15000 });
  const meshLink = await rexPage.locator('#share-url').inputValue();
  const samCtx = await newUser('Sam'); await samCtx.addInitScript({ content: dynBlock });
  const tiaCtx = await newUser('Tia'); await tiaCtx.addInitScript({ content: dynBlock });
  const samPage = await samCtx.newPage();
  samPage.on('console', (m) => { if (m.type() === 'error') console.log('  [sam]', m.text()); });
  await samPage.goto(meshLink);
  const tiaPage = await tiaCtx.newPage();
  tiaPage.on('console', (m) => { if (m.type() === 'error') console.log('  [tia]', m.text()); });
  await tiaPage.goto(meshLink);
  for (const pg of [rexPage, samPage, tiaPage]) {
    await pg.waitForFunction(() => window.__gifosVideo.liveLinks() >= 2, null, { timeout: 30000 });
  }
  check('three phones fully meshed (before the mid-call failure)', true);
  const samPid = await samPage.evaluate(() => sessionStorage.getItem('gifos_vpeer_' + window.__gifosVideo.room()));
  const tiaPid = await tiaPage.evaluate(() => sessionStorage.getItem('gifos_vpeer_' + window.__gifosVideo.room()));
  // the network breaks between Sam and Tia, permanently, mid-call
  await samPage.evaluate((pid) => { window.__iceBlock.push(pid); window.__gifosVideo._failPeer(pid); }, tiaPid);
  await tiaPage.evaluate((pid) => { window.__iceBlock.push(pid); window.__gifosVideo._failPeer(pid); }, samPid);
  await samPage.waitForFunction((pid) => {
    const via = window.__gifosVideo.relayedVia(pid);
    const shown = window.__gifosVideo.tileSid(pid);
    const mapped = window.__gifosVideo.relayMapSid(pid);
    return via && shown && mapped && shown === mapped;
  }, tiaPid, { timeout: 60000 });
  check('a friend-relay takes over the dead link, hands-free', true);
  // wait for the forwarded stream to actually paint, then prove identity
  await samPage.waitForFunction((pid) => {
    const t = Array.from(document.querySelectorAll('.tile')).find((x) => x.dataset.peer === pid);
    const v = t && t.querySelector('video');
    return !!(v && v.videoWidth > 0);
  }, tiaPid, { timeout: 30000 });
  const idProof = await samPage.evaluate((pid) => {
    const via = window.__gifosVideo.relayedVia(pid);
    return {
      shownIsMapped: window.__gifosVideo.tileSid(pid) === window.__gifosVideo.relayMapSid(pid),
      notHubsOwn: window.__gifosVideo.tileSid(pid) !== window.__gifosVideo.announcedSid(via),
    };
  }, tiaPid);
  check('the takeover tile PROVABLY shows the dead peer\'s forwarded stream — never the hub\'s camera',
    idProof.shownIsMapped && idProof.notHubsOwn);
  await rexPage.close(); await samPage.close(); await tiaPage.close();
  await rexCtx.close(); await samCtx.close(); await tiaCtx.close();

  // ================= admin rooms: identity-based, consent-by-address ==========
  // /meet/<room> is anarchic FOREVER; /meet/<room>/<verifier> is a DIFFERENT
  // room whose address itself declares an authority — joining is consent.
  // Adam mints the admin room from a plain one; Beth joins its full link.
  // Only Adam (who knows the password) can globally moderate; Beth's
  // privileged actions are refused; Adam bans Beth's DEVICE (socket + P2P
  // cut, rejoin rejected), then unbans her; after everyone leaves, Adam
  // alone re-seeds the ban list from his own device.
  const admRoom = 'admroom' + Math.floor(Math.random() * 1e6).toString(36);
  const openRoom = async (ctx, label, hash) => {
    const pg = await ctx.newPage();
    pg.on('console', (m) => { if (m.type() === 'error') console.log('  [' + label + ']', m.text()); });
    pg.on('pageerror', (e) => console.log('  [' + label + ' pageerror]', e.message));
    await pg.goto(BASE + '/meet.html#' + hash);
    await pg.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.room(), null, { timeout: 10000 });
    return pg;
  };
  const plainHash = 'v=' + admRoom + '&k=' + admRoom;
  const adamCtx = await newUser('Adam');
  const bethCtx = await newUser('Beth');
  const adam = await openRoom(adamCtx, 'adam', plainHash);
  check('the running call page carries no SYSTEM badge (the desktop icon signals it)',
    (await adam.locator('#syschip').count()) === 0);
  check('a plain room has no admin and can never have one',
    !(await adam.evaluate(() => window.__gifosVideo.hasAdmin())));
  check('a plain room hides the Admin button (nothing for it to do)',
    !(await adam.locator('#admbtn').isVisible()));
  // Mint the admin room from INVITE now (not a separate Admin button). An admin
  // room is ALWAYS a different room (its verifier is a password fingerprint), so
  // you name it whatever you want — the move is handled by the chat follow-me
  // link. Alone here, so no chat hop-link is offered.
  const chosenRoom = 'club' + Math.floor(Math.random() * 1e6).toString(36);
  await adam.locator('#invite').click();
  await adam.locator('#inv-mkadm').click();
  await adam.locator('#inv-adm-room').fill(chosenRoom);
  await adam.locator('#inv-adm-pass').fill('sesame-topsecret');
  await adam.locator('#inv-adm-go').click();
  await adam.waitForURL(new RegExp('v=' + chosenRoom + '&k=' + chosenRoom + '&av=[a-f0-9]{24}'), { timeout: 30000 });
  await adam.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.amAdmin(), null, { timeout: 15000 });
  check('creating an admin room with any chosen name lands its creator in it AS admin',
    (await adam.evaluate(() => window.__gifosVideo.room())) === chosenRoom);
  const admV = await adam.evaluate(() => window.__gifosVideo.verifier());
  const admHash = 'v=' + chosenRoom + '&k=' + chosenRoom + '&av=' + admV;
  check('the room link carries only the verifier — never the password',
    /^[a-f0-9]{24}$/.test(admV) && !(await adam.evaluate(() => location.href)).includes('sesame'));
  // The whole point: (name, password) reconstruct the SAME room from scratch.
  const rederived = await adam.evaluate(async ({ r, p }) => {
    const enc = new TextEncoder();
    const km = await crypto.subtle.importKey('raw', enc.encode(p), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('gifos-admin:' + r), iterations: 310000 }, km, 256);
    const K = Array.from(new Uint8Array(bits)).map((b) => b.toString(16).padStart(2, '0')).join('');
    const vb = await crypto.subtle.digest('SHA-256', enc.encode(K));
    return Array.from(new Uint8Array(vb)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24); // 24-hex truncated verifier
  }, { r: chosenRoom, p: 'sesame-topsecret' });
  check('the same name + password re-derive the same room, from nothing', rederived === admV);

  const beth = await openRoom(bethCtx, 'beth', admHash);
  await beth.waitForFunction(() => window.__gifosVideo.hasAdmin(), null, { timeout: 8000 });
  check('joiners see the room is admin-managed (and are not admins)',
    !(await beth.evaluate(() => window.__gifosVideo.amAdmin())));
  // A wrong password is rejected LOCALLY (the verifier is the room's address).
  await beth.locator('#admbtn').click();
  await beth.locator('#adm-pass').fill('wrong-guess');
  await beth.locator('#adm-enable').click();
  await beth.waitForFunction(() => /Wrong admin password/.test(document.getElementById('status').textContent), null, { timeout: 30000 });
  await beth.locator('#adm-close').click();
  check('a wrong admin password is rejected', !(await beth.evaluate(() => window.__gifosVideo.amAdmin())));
  check('non-admin loses the password button', await beth.locator('#pwbtn').isDisabled());
  await beth.waitForSelector('.tile:not(.me)', { timeout: 10000 });
  check('non-admin loses the group-moderation bar (CSS gate)',
    (await beth.evaluate(() => getComputedStyle(document.querySelector('.tile:not(.me) .modbar')).display)) === 'none');
  // even bypassing the UI, the relay refuses a non-admin's privileged action
  await beth.evaluate(() => { document.getElementById('pwbtn').disabled = false; });
  await beth.locator('#pwbtn').click();
  await beth.locator('#pw-new').fill('hax');
  await beth.locator('#pw-save').click();
  await beth.waitForFunction(() => /admins only/i.test(document.getElementById('status').textContent), null, { timeout: 6000 });
  check('relay refuses a non-admin setpw (admins only)', true);

  // ADMIN ROOMS: with an admin PRESENT, each tile is clear iff its OWN owner
  // consents (camera on + None) — no unanimity, no room-wide guest blur.
  await adam.waitForFunction(() => window.__gifosVideo.participants() >= 2, null, { timeout: 10000 });
  // Clear video needs a password even in an admin room — the admin sets it.
  await adam.locator('#pwbtn').click();
  await adam.locator('#pw-new').fill('vip');
  await adam.locator('#pw-save').click();
  await beth.waitForFunction(() => window.__gifosVideo.roomPw() === 'vip', null, { timeout: 8000 });
  check('an admin sets the room password (the key to clear video)', true);
  await beth.locator('#cam').click(); // camera on
  await beth.evaluate(() => document.getElementById('blur-none').click()); // Beth consents
  // Admin present + Beth consents + password → Beth clears on adam's screen,
  // even though adam himself hasn't consented (no unanimity needed).
  await adam.waitForFunction(() => {
    const t = document.querySelector('.tile:not(.me)');
    return t && !t.querySelector('video').classList.contains('blur1') && !t.querySelector('video').classList.contains('blur2');
  }, null, { timeout: 12000 });
  check('with an admin present, a consenting guest goes clear on her own — no unanimity', true);
  await beth.waitForFunction(() => window.__gifosVideo.outboundKind() === 'raw', null, { timeout: 8000 });
  check('…and she broadcasts raw', true);
  check('vote-off is HIDDEN in admin rooms (admins ban instead)',
    (await adam.evaluate(() => getComputedStyle(document.querySelector('.tile:not(.me) .votebtn')).display)) === 'none');
  // The admin BLOCKS Beth per-tile → she blurs on every screen and broadcasts
  // blurred, regardless of her own None.
  const bethTileOnAdam = adam.locator('.tile:not(.me)').first();
  await bethTileOnAdam.hover();
  await bethTileOnAdam.locator('button[data-mod="blur"]').click();
  await beth.waitForFunction(() => window.__gifosVideo.outboundKind() === 'blurred', null, { timeout: 10000 });
  check('an admin block overrides the guest\'s None — she broadcasts blurred', true);
  await beth.waitForFunction(() => window.__gifosVideo.blurClassOf('me') >= 1, null, { timeout: 8000 });
  check('…and shows blurred on her own screen too', true);
  // Admin lifts the block → Beth (still consenting) returns to clear at once.
  await bethTileOnAdam.hover();
  await bethTileOnAdam.locator('button[data-mod="blur"]').click();
  await beth.waitForFunction(() => window.__gifosVideo.outboundKind() === 'raw' && window.__gifosVideo.blurClassOf('me') === 0, null, { timeout: 10000 });
  check('lifting the admin block returns the consenting guest to clear immediately', true);

  // "BLUR GUESTS" SHORTCUT: one click blocks every guest (same modTable.blur as
  // blocking each by hand); the button flips to Unblur; clicking again clears.
  await adam.locator('#blurall').click();
  await beth.waitForFunction(() => window.__gifosVideo.outboundKind() === 'blurred' && window.__gifosVideo.blurClassOf('me') >= 1, null, { timeout: 10000 });
  check('admin "Blur guests" blocks every guest at once (guest broadcasts blurred)', true);
  await adam.waitForFunction(() => /Unblur guests/.test(document.getElementById('blurall').textContent), null, { timeout: 5000 });
  check('the Blur-guests button flips to "Unblur guests"', true);
  await adam.locator('#blurall').click();
  await beth.waitForFunction(() => window.__gifosVideo.outboundKind() === 'raw' && window.__gifosVideo.blurClassOf('me') === 0, null, { timeout: 10000 });
  check('clicking again unblurs every guest — the consenting guest returns to clear', true);

  // "VIDEO OFF" — the harder hammer: admin kills every guest's camera room-wide.
  await adam.locator('#camall').click();
  await beth.waitForFunction(() => window.__gifosVideo.modOn('me', 'cam') && window.__gifosVideo.camOff(), null, { timeout: 10000 });
  check('admin "Video off" kills every guest camera room-wide (guest stops transmitting)', true);
  await adam.waitForFunction(() => /Video on/.test(document.getElementById('camall').textContent), null, { timeout: 5000 });
  await beth.locator('#cam').click(); // guest tries to turn video back on
  await beth.waitForFunction(() => /admin turned your video off/i.test(document.getElementById('status').textContent), null, { timeout: 6000 });
  check('a guest cannot re-enable video while an admin holds it off', true);
  await adam.locator('#camall').click(); // release
  await beth.waitForFunction(() => !window.__gifosVideo.modOn('me', 'cam'), null, { timeout: 8000 });
  check('admin releases video-off; guests may turn their camera back on', true);

  // admin globally mutes Beth — stamped path, enforced on Beth's own device
  const bethTile = adam.locator('.tile:not(.me)').first();
  await bethTile.click();
  await bethTile.locator('[data-mod="mute"]').click();
  await beth.waitForFunction(() => window.__gifosVideo.modOn('me', 'mute'), null, { timeout: 8000 });
  check('admin\'s global mute lands on the target (stamped, receiver-enforced)', true);

  // ban Beth's device: socket cut, rejoin refused
  const bethDev = await beth.evaluate(() => window.__gifosVideo.deviceId());
  await bethTile.locator('.banbtn').evaluate((b) => b.click()); // fire directly — no menu visibility race
  await beth.waitForFunction(() => window.__gifosVideo.bannedOut(), null, { timeout: 12000 });
  check('banned device is cut and its rejoin is refused', true);
  await adam.waitForFunction(() => window.__gifosVideo.banList().length === 1, null, { timeout: 8000 });
  check('admin sees the device on the ban list',
    (await adam.evaluate(() => window.__gifosVideo.banList()))[0].d === bethDev);
  const bethReload = await openRoom(bethCtx, 'beth2', admHash);
  await bethReload.waitForFunction(() => window.__gifosVideo.bannedOut(), null, { timeout: 10000 });
  check('banned device stays out across reloads', true);
  await bethReload.close();

  // unban → Beth walks back in (mistakes are undoable)
  await adam.locator('#admbtn').click();
  await adam.locator('#adm-banned .brow button').click();
  await adam.waitForFunction(() => window.__gifosVideo.banList().length === 0, null, { timeout: 8000 });
  await adam.locator('#adm-close').click();
  const bethBack = await openRoom(bethCtx, 'beth3', admHash);
  await bethBack.waitForFunction(() => window.__gifosVideo.participants() >= 2, null, { timeout: 12000 });
  check('unbanned device joins again (mistakes are undoable)', true);

  // re-seed: ban again, empty the room, admin returns alone → ban list survives
  await adam.waitForFunction(() => window.__gifosVideo.participants() >= 2, null, { timeout: 10000 });
  const tile2 = adam.locator('.tile:not(.me)').first();
  await adam.evaluate(() => { window.__banDebug = 1; });
  await tile2.locator('.banbtn').evaluate((b) => b.click()); // fire directly — no hover/menu visibility race
  try {
    await adam.waitForFunction(() => window.__gifosVideo.banList().length === 1, null, { timeout: 8000 });
  } catch (e) {
    console.log('  [debug] adam ban state:', await adam.evaluate(() => JSON.stringify({
      ban: window.__gifosVideo.banList(), amAdmin: window.__gifosVideo.amAdmin(),
      parts: window.__gifosVideo.participants(),
      tiles: Array.from(document.querySelectorAll('.tile')).map((t) => t.dataset.peer + ':' + t.className),
      status: document.getElementById('status').textContent,
    })));
    throw e;
  }
  await bethBack.close();
  await beth.close();
  await adam.close();
  await sleep(600); // room fully empties — the relay forgets everything
  const adam2 = await openRoom(adamCtx, 'adam2', admHash); // his stored admin key signs him back in
  await adam2.waitForFunction(() => window.__gifosVideo.amAdmin() && window.__gifosVideo.banList().length === 1, null, { timeout: 10000 });
  check('admin returning to an emptied room re-seeds the ban list from his device', true);
  const bethAgain = await openRoom(bethCtx, 'beth4', admHash);
  await bethAgain.waitForFunction(() => window.__gifosVideo.bannedOut(), null, { timeout: 10000 });
  check('ban survives a fully-emptied room via the admin\'s copy', true);
  await adam2.close(); await bethAgain.close();

  // ================= admin-absence auto-close (host must be present) ==========
  // A bio-link room lives only while its host is present: host gone → 10s grace,
  // then a visible 5-minute countdown, then the room evacuates. Host back cancels.
  const hostCtx = await newUser('Host');
  const fanCtx = await newUser('Fan');
  const hostRoom = 'live' + Math.floor(Math.random() * 1e6).toString(36);
  const host = await openRoom(hostCtx, 'host', 'v=' + hostRoom + '&k=' + hostRoom);
  await host.locator('#invite').click();
  await host.locator('#inv-mkadm').click();
  await host.locator('#inv-adm-pass').fill('greenroom-topsecret');
  await host.locator('#inv-adm-go').click();
  await host.waitForFunction(() => window.__gifosVideo && window.__gifosVideo.amAdmin(), null, { timeout: 20000 });
  const hostV = await host.evaluate(() => window.__gifosVideo.verifier());
  const hostHash = 'v=' + hostRoom + '&k=' + hostRoom + '&av=' + hostV;
  const fan = await openRoom(fanCtx, 'fan', hostHash);
  await fan.waitForFunction(() => window.__gifosVideo.adminsHere().length > 0, null, { timeout: 12000 });
  check('with the host present, a guest sees no closing countdown',
    !(await fan.evaluate(() => window.__gifosVideo.countdownShown())));
  await host.close(); // host leaves
  await fan.waitForFunction(() => window.__gifosVideo.countdownShown(), null, { timeout: 25000 });
  check('host leaves → after the 10s grace the guest sees a closing countdown', true);
  const hostBack = await openRoom(hostCtx, 'hostback', hostHash); // stored key signs him back in
  await hostBack.waitForFunction(() => window.__gifosVideo.amAdmin(), null, { timeout: 15000 });
  await fan.waitForFunction(() => !window.__gifosVideo.countdownShown(), null, { timeout: 15000 });
  check('host returns → the countdown vanishes and the room lives on', true);
  await hostBack.close(); await fan.close();

  // ================= vote off the island (personal, GLOBAL vote-offs) =========
  // No admin exists to remove a bad actor — and there is NO ban list to forge
  // or DOM-inject. Each person carries ONE personal vote-off list (device ids)
  // across ALL calls in their own browser; the relay only ever tallies a live
  // MAJORITY of the connected devices (min 2). Three people; two vote off the
  // third (majority of 3 = 2).
  const voteRoom = 'vote' + Math.floor(Math.random() * 1e6).toString(36);
  const vHash = 'v=' + voteRoom + '&k=' + voteRoom;
  const patCtx = await newUser('Pat'), quinnCtx = await newUser('Quinn'), vicCtx = await newUser('Vic');
  const pat = await openRoom(patCtx, 'pat', vHash);
  const quinn = await openRoom(quinnCtx, 'quinn', vHash);
  const vic = await openRoom(vicCtx, 'vic', vHash);
  const vicDev = await vic.evaluate(() => window.__gifosVideo.deviceId());
  await pat.waitForFunction(() => window.__gifosVideo.participants() >= 3, null, { timeout: 12000 });
  check('vote-off buttons show in a non-admin room',
    (await pat.evaluate(() => getComputedStyle(document.querySelector('.tile:not(.me) .votebtn')).display)) !== 'none');
  // Pat votes Vic off — one vote, not enough (majority of 3 is 2); progress shows.
  const vicTileOnPat = pat.locator('.tile:not(.me)', { hasText: 'Vic' });
  await vicTileOnPat.locator('.votebtn').click();
  await pat.waitForFunction(() => window.__gifosVideo.voteNeed() >= 2, null, { timeout: 6000 });
  check('one vote is not enough to remove someone', !(await vic.evaluate(() => window.__gifosVideo.bannedOut())));
  // Quinn also votes Vic off → majority reached → Vic is kicked.
  const vicTileOnQuinn = quinn.locator('.tile:not(.me)', { hasText: 'Vic' });
  await vicTileOnQuinn.locator('.votebtn').click();
  await vic.waitForFunction(() => window.__gifosVideo.bannedOut(), null, { timeout: 12000 });
  check('a majority voting someone off removes them', true);
  const vicRejoin = await openRoom(vicCtx, 'vic2', vHash);
  await vicRejoin.waitForFunction(() => window.__gifosVideo.bannedOut(), null, { timeout: 10000 });
  check('the standing majority keeps that device out on rejoin', true);
  await vicRejoin.close(); await vic.close();

  // ================= votes are GLOBAL: they follow the person =================
  // Pat and Quinn each already carry a vote against Vic's device. Meet Vic in
  // a DIFFERENT plain room and the vote is already there — nothing stored on
  // any server, no list handed around, just each person's own memory.
  const room2 = 'vote' + Math.floor(Math.random() * 1e6).toString(36);
  const v2Hash = 'v=' + room2 + '&k=' + room2;
  const pat2 = await openRoom(patCtx, 'pat-b', v2Hash);   // carries the vote
  const vicB = await openRoom(vicCtx, 'vic-b', v2Hash);
  await pat2.waitForFunction(() => window.__gifosVideo.participants() >= 2, null, { timeout: 12000 });
  await pat2.waitForFunction((d) => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes('Vic'));
    return t && /1\/2 to remove/.test(t.textContent);
  }, vicDev, { timeout: 8000 });
  check('a person you voted off already carries your vote into a brand-new room', true);
  check('one standing vote alone does not remove them', !(await vicB.evaluate(() => window.__gifosVideo.bannedOut())));
  const quinn2 = await openRoom(quinnCtx, 'quinn-b', v2Hash); // also carries the vote
  await vicB.waitForFunction(() => window.__gifosVideo.bannedOut(), null, { timeout: 12000 });
  check('two people who voted Vic off before boot him the moment they share a room', true);
  await vicB.close();
  // …and now that a majority present has him on their list, the door won't open.
  const vicDenied = await openRoom(vicCtx, 'vic-c', v2Hash);
  await vicDenied.waitForFunction(() => window.__gifosVideo.bannedOut(), null, { timeout: 10000 });
  check('a device a present majority has voted off is denied entry outright', true);
  await vicDenied.close(); await quinn.close(); await quinn2.close();

  // ================= nobody is anonymous (IP transparency) ====================
  // P2P means everyone can already learn everyone's address — GifOS shows it:
  // the status pill opens the room's who-is-here list, downloadable as a
  // record you can hand to the authorities if someone truly crosses the line.
  await pat2.locator('#status').click();
  await pat2.waitForSelector('#who-modal', { state: 'visible', timeout: 6000 });
  const whoText = await pat2.locator('#who-list').textContent();
  check('the status pill opens "who is on this meeting" — names with network addresses',
    /Pat \(you\)/.test(whoText) && /127\.0\.0\.1|address unknown/.test(whoText));
  check('every row carries a real address (the local relay reports 127.0.0.1)', /127\.0\.0\.1/.test(whoText));
  const [dl] = await Promise.all([
    pat2.waitForEvent('download', { timeout: 8000 }),
    pat2.locator('#who-dl').click(),
  ]);
  check('the list downloads as a file you can hand to the authorities',
    /^gifos-meeting-.*\.txt$/.test(dl.suggestedFilename()));
  await pat2.close(); await pat.close();

  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
