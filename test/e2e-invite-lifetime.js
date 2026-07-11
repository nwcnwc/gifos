// Invite-link lifetime e2e. Verifies the privacy model added on top of the
// share flow:
//   * the Invite modal warns and offers close / 1h / 24h / forever,
//   * an ephemeral ("close") link does NOT mirror state to guests, so no guest
//     can Take Over — the session really ends when the host leaves,
//   * "New link" revokes the old link: guests on it are told, and a fresh
//     joiner on the new URL still gets in.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
function check(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openModal(page) {
  // Invite opens the create window. If a link-ready modal is already up (after
  // a previous create), its "New link" button is what re-opens the window.
  if (await page.locator('#link-modal').count()) await page.locator('#lm-new').click();
  else await page.locator('#host').click();
  await page.locator('#invite-modal').waitFor({ state: 'visible', timeout: 6000 });
}
async function pick(page, value, prev, resilient) {
  await page.locator('#invite-modal input[name=lt][value="' + value + '"]').check();
  if (resilient) await page.locator('#invite-modal input[name=res][value="keep"]').check();
  await page.locator('#inv-go').click();
  // The minted link lands in the link-ready modal (#lm-url), not a header bar.
  await page.waitForFunction((old) => {
    const el = document.getElementById('lm-url');
    return el && el.value && el.value.length > 0 && el.value !== old;
  }, prev || '', { timeout: 8000 });
  return page.locator('#lm-url').inputValue();
}

async function openGuestbook(ctx) {
  const desk = await ctx.newPage();
  await desk.goto(BASE + '/index.html');
  await desk.waitForSelector('.icon');
  await desk.locator('.icon', { hasText: 'Social' }).dblclick();
  await desk.waitForTimeout(250);
  const [run] = await Promise.all([
    ctx.waitForEvent('page'),
    desk.locator('.icon', { hasText: 'Guestbook.gif' }).dblclick(),
  ]);
  await run.waitForSelector('iframe');
  await run.frameLocator('iframe').locator('#msg').waitFor({ timeout: 8000 });
  return run;
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns'],
  });
  const setup = (name) => ({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "')}catch(e){}" });

  // ============ 1) the warning modal offers real lifetime choices ============
  const hostCtx = await browser.newContext();
  await hostCtx.addInitScript(setup('Host'));
  const hostRun = await openGuestbook(hostCtx);

  await openModal(hostRun);
  const warnTxt = await hostRun.locator('#invite-modal .warn').textContent();
  check('modal warns the link copies the whole app dataset', /download a full copy/i.test(warnTxt));
  for (const v of ['close', '1h', '24h', 'forever']) {
    const n = await hostRun.locator('#invite-modal input[value="' + v + '"]').count();
    if (n !== 1) { check('lifetime option present: ' + v, false); }
  }
  check('all four lifetime options are offered', true);

  // Pick the ephemeral default. A fresh short code, share panel shows lifetime.
  const ephUrl = await pick(hostRun, 'close');
  check('ephemeral link is a valid owned URL (verifier + link secret)', /#s=[a-z0-9-]+\.[a-f0-9]{24}&k=[a-z2-9]{10}&relay=/.test(ephUrl));
  check('link modal states the link is open-only and ends if you drop',
    /while this app is open/i.test(await hostRun.locator('#link-modal .linkexp').textContent()));

  // ============ 2) ephemeral link → no mirror → no Take Over ============
  const adaCtx = await browser.newContext();
  await adaCtx.addInitScript(setup('Ada'));
  const ada = await adaCtx.newPage();
  await ada.goto(ephUrl);
  await ada.waitForSelector('iframe', { timeout: 10000 });
  await ada.frameLocator('iframe').locator('#list', { timeout: 10000 }).first().waitFor();
  check('guest joined the ephemeral session', true);

  // The host leaves. On a self-healing link a guest would be offered Take Over
  // after ~5s; an ephemeral link never mirrors, so the offer must never appear.
  await hostRun.close();
  await sleep(8000);
  const takeoverShown = await ada.locator('#become-host').isVisible();
  check('ephemeral guest is NOT offered Take Over (no mirror, session ends)', !takeoverShown);

  await adaCtx.close();

  // ============ 2b) lifetime and resilience are INDEPENDENT ============
  // A bounded (1h) link marked resilient DOES mirror state, so a guest can keep
  // it going if the host drops — expiry only shuts the door to new joiners.
  const rhCtx = await browser.newContext();
  await rhCtx.addInitScript(setup('RHost'));
  const rhost = await openGuestbook(rhCtx);
  await openModal(rhost);
  // The resilience dial is locked off for "while the app is open" (a link that
  // dies on close can't be kept alive by someone else) and free for timed ones.
  await rhost.locator('#invite-modal input[name=lt][value="close"]').check();
  const lockedOnClose = await rhost.locator('#invite-modal input[name=res][value="keep"]').isDisabled();
  await rhost.locator('#invite-modal input[name=lt][value="1h"]').check();
  const freeOnTimed = !(await rhost.locator('#invite-modal input[name=res][value="keep"]').isDisabled());
  check('resilience is locked for "while open" but free for a timed link (decoupled)', lockedOnClose && freeOnTimed);
  const rUrl = await pick(rhost, '1h', null, true);

  const evaCtx = await browser.newContext();
  await evaCtx.addInitScript(setup('Eva'));
  const eva = await evaCtx.newPage();
  await eva.goto(rUrl);
  await eva.waitForSelector('iframe', { timeout: 10000 });
  await eva.frameLocator('iframe').locator('#list', { timeout: 10000 }).first().waitFor();
  await rhost.close();
  await sleep(8000);
  const evaCanTakeOver = await eva.locator('#become-host').isVisible();
  check('a resilient 1h link SURVIVES host drop (guest offered Take Over)', evaCanTakeOver);
  await rhCtx.close();
  await evaCtx.close();

  // ============ 3) "New link" revokes the old one ============
  const host2Ctx = await browser.newContext();
  await host2Ctx.addInitScript(setup('Host2'));
  const host2 = await openGuestbook(host2Ctx);
  await openModal(host2);
  const url1 = await pick(host2, 'forever');

  const bobCtx = await browser.newContext();
  await bobCtx.addInitScript(setup('Bob'));
  const bob = await bobCtx.newPage();
  await bob.goto(url1);
  await bob.waitForSelector('iframe', { timeout: 10000 });
  await bob.frameLocator('iframe').locator('#list', { timeout: 10000 }).first().waitFor();
  check('Bob joined the first link', true);

  // Host mints a new link — this revokes url1. "New link" lives in the
  // link-ready modal now; openModal clicks it and waits for the create window.
  await openModal(host2);
  const url2 = await pick(host2, 'forever', url1);
  check('rotating produced a different link', url2 && url2 !== url1);

  await sleep(1500);
  const bobStatus = await bob.locator('#status').textContent();
  check('guest on the revoked link is told it was replaced', /replaced/i.test(bobStatus));

  // A fresh joiner on the NEW url still gets in.
  const camCtx = await browser.newContext();
  await camCtx.addInitScript(setup('Cam'));
  const cam = await camCtx.newPage();
  await cam.goto(url2);
  await cam.waitForSelector('iframe', { timeout: 10000 });
  await cam.frameLocator('iframe').locator('#list', { timeout: 10000 }).first().waitFor();
  check('a fresh joiner on the new link connects fine', true);

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
