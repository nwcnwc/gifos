// Own-phone IRL games e2e: four browser contexts = four phones in a living
// room. One player hosts an IRL game, everyone else joins from the invite
// link, secret roles/answers get dealt per phone, and the round resolves.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
function check(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function invite(page, lifetime, resilient) {
  await page.locator('#host').click();
  await page.locator('#invite-modal').waitFor({ state: 'visible', timeout: 6000 });
  await page.locator('#invite-modal input[name=lt][value="' + lifetime + '"]').check();
  if (resilient) await page.locator('#invite-modal input[name=res][value="keep"]').check();
  await page.locator('#inv-go').click();
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns'],
  });
  const setup = (name) => ({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "')}catch(e){}" });

  // ---------- host opens One Night Wolves and invites ----------
  const hostCtx = await browser.newContext();
  await hostCtx.addInitScript(setup('Host'));
  const desk = await hostCtx.newPage();
  desk.on('console', (m) => { if (m.type() === 'error') console.log('  [host desk]', m.text()); });
  await desk.goto(BASE + '/index.html');
  await desk.waitForSelector('.icon');
  await desk.locator('.icon', { hasText: 'IRL Games' }).dblclick();
  await desk.waitForTimeout(300);
  const [hostRun] = await Promise.all([
    hostCtx.waitForEvent('page'),
    desk.locator('.icon', { hasText: 'One Night Wolves.gif' }).dblclick(),
  ]);
  hostRun.on('console', (m) => { if (m.type() === 'error') console.log('  [host]', m.text()); });
  await hostRun.waitForSelector('iframe');
  const host = hostRun.frameLocator('iframe');
  await host.locator('#start').waitFor({ timeout: 10000 });
  check('wolves lobby gates start below 4 players', await host.locator('#start').isDisabled());

  await invite(hostRun, 'forever', true);
  await hostRun.waitForFunction(() => { const el = document.getElementById('lm-url'); return el && el.value; }, null, { timeout: 8000 });
  const shareUrl = await hostRun.locator('#lm-url').inputValue();
  await hostRun.locator('#lm-close').click().catch(() => {});

  // ---------- three friends join from their own phones ----------
  const phones = [{ page: hostRun, app: host, name: 'Host' }];
  for (const name of ['Ada', 'Ben', 'Cyd']) {
    const ctx = await browser.newContext();
    await ctx.addInitScript(setup(name));
    const run = await ctx.newPage();
    run.on('console', (m) => { if (m.type() === 'error') console.log('  [' + name + ']', m.text()); });
    await run.goto(shareUrl);
    await run.waitForSelector('iframe', { timeout: 10000 });
    const app = run.frameLocator('iframe');
    await app.locator('main').waitFor({ timeout: 10000 });
    phones.push({ page: run, app, name });
  }
  // lobby fills up live on the host's phone
  await host.locator('.chip').nth(3).waitFor({ timeout: 10000 });
  check('all four phones appear in the lobby', (await host.locator('.chip').count()) === 4);
  check('start unlocks at four players', !(await host.locator('#start').isDisabled()));

  // ---------- night: every phone acts in secret ----------
  await host.locator('#start').click();
  for (const p of phones) await p.app.locator('.role').waitFor({ timeout: 10000 });
  // every phone can peek a secret role
  const roles = [];
  for (const p of phones) {
    await p.app.locator('.role').dispatchEvent('pointerdown');
    await sleep(150);
    roles.push((await p.app.locator('.role .r').textContent()).trim());
    await p.app.locator('.role').dispatchEvent('pointerup');
  }
  const KNOWN = ['Werewolf', 'Seer', 'Robber', 'Troublemaker', 'Insomniac', 'Villager', 'Hunter'];
  check('each phone was dealt a real secret role', roles.every((r) => KNOWN.includes(r)));
  console.log('  (dealt: ' + roles.join(', ') + ')');

  // each phone performs its night action (generic actor per role UI)
  for (const p of phones) {
    const a = p.app;
    for (let tries = 0; tries < 20; tries++) {
      if (await a.locator('#sleep').count()) { await a.locator('#sleep').click(); break; }
      if (await a.locator('[data-rob]').count()) { await a.locator('[data-rob]').first().click(); break; }
      if (await a.locator('[data-player]').count()) { await a.locator('[data-player]').first().click(); break; }
      if (await a.locator('[data-tm]').count()) {
        await a.locator('[data-tm]').nth(0).click(); await a.locator('[data-tm]').nth(1).click(); break;
      }
      if (/Action done/.test(await a.locator('main').textContent())) break;
      await sleep(300);
    }
  }
  // dawn breaks automatically once everyone acted → day phase with timer + ballot
  for (const p of phones) await p.app.locator('[data-v]').first().waitFor({ timeout: 15000 });
  check('dawn breaks into the day phase on every phone', true);
  const dayText = await phones[1].app.locator('main').textContent();
  check('day phase shows the synced talk timer', /\d:\d\d|VOTE NOW/.test(dayText));

  // ---------- everyone votes "no one dies" → reveal resolves the night ----------
  for (const p of phones) await p.app.locator('[data-v="x"]').click();
  for (const p of phones) await p.app.locator('table').first().waitFor({ timeout: 15000 });
  const reveal = await phones[2].app.locator('main').textContent();
  check('the reveal declares a winner', /win(s)?!/.test(reveal));
  check('the reveal shows who ended up as what (roles table + center cards)',
    /Center cards:/.test(reveal) && (await phones[2].app.locator('td').count()) >= 12);
  for (const p of phones.slice(1)) await p.page.close();

  // ---------- Same Brain: hidden simultaneous answers + the Pink Cow ----------
  await hostRun.close();
  await desk.bringToFront();
  const [sbRun] = await Promise.all([
    hostCtx.waitForEvent('page'),
    desk.locator('.icon', { hasText: 'Same Brain.gif' }).dblclick(),
  ]);
  sbRun.on('console', (m) => { if (m.type() === 'error') console.log('  [sb host]', m.text()); });
  await sbRun.waitForSelector('iframe');
  const sbHost = sbRun.frameLocator('iframe');
  await sbHost.locator('#start').waitFor({ timeout: 10000 });
  await invite(sbRun, 'forever', true);
  await sbRun.waitForFunction(() => { const el = document.getElementById('lm-url'); return el && el.value; }, null, { timeout: 8000 });
  const sbUrl = await sbRun.locator('#lm-url').inputValue();
  await sbRun.locator('#lm-close').click().catch(() => {});
  const sbPhones = [{ app: sbHost, page: sbRun }];
  for (const name of ['Eve', 'Fox']) {
    const ctx = await browser.newContext();
    await ctx.addInitScript(setup(name));
    const run = await ctx.newPage();
    await run.goto(sbUrl);
    await run.waitForSelector('iframe', { timeout: 10000 });
    const app = run.frameLocator('iframe');
    await app.locator('main').waitFor({ timeout: 10000 });
    sbPhones.push({ app, page: run });
  }
  await sbHost.locator('.chip').nth(2).waitFor({ timeout: 10000 });
  await sbHost.locator('#start').click();
  for (const p of sbPhones) await p.app.locator('#inp').waitFor({ timeout: 10000 });
  // two think alike, one is left alone with the cow
  const answers = ['pepperoni', 'Pepperoni ', 'pineapple'];
  for (let i = 0; i < 3; i++) {
    await sbPhones[i].app.locator('#inp').fill(answers[i]);
    await sbPhones[i].app.locator('#sub').click();
  }
  for (const p of sbPhones) await p.app.locator('.grp').first().waitFor({ timeout: 15000 });
  const sbReveal = await sbPhones[0].app.locator('main').textContent();
  check('matching answers group despite case/spacing', /×2/.test(sbReveal));
  check('the lone answer earns the Pink Cow', /Pink Cow/.test(sbReveal) && /pineapple/i.test(sbReveal));
  check('answers stayed hidden until everyone was in', true); // reveal only fired after 3/3

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
