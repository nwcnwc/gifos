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

  // And Bob (not Ada!) can lift it — anyone moderates, always attributed.
  const caiTileOnBob = bPage.locator('.tile:not(.me)', { hasText: 'Cai' });
  await caiTileOnBob.hover();
  await caiTileOnBob.locator('button[data-mod="mute"]').click();
  await aPage.waitForFunction(() => {
    const t = Array.from(document.querySelectorAll('.tile:not(.me)')).find((x) => x.textContent.includes('Cai'));
    return t && !t.querySelector('video').muted;
  }, null, { timeout: 10000 });
  check('anyone can lift a group-mute (and it clears everywhere)', true);

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

  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
