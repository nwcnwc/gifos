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
  await desk.locator('.icon', { hasText: 'Social' }).dblclick();
  await desk.waitForTimeout(250);
  const [aPage] = await Promise.all([
    aCtx.waitForEvent('page'),
    desk.locator('.icon', { hasText: 'Video Call.gif' }).dblclick(),
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

  // ---------- a participant leaves → tiles + quality recover ----------
  await cPage.close(); await cCtx.close();
  await aPage.waitForFunction(() => window.__gifosVideo.participants() === 2, null, { timeout: 15000 });
  const q2 = await aPage.evaluate(() => window.__gifosVideo.quality());
  check('peer-leave shrinks the mesh and quality steps back up', q2 === '720p');

  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
