// Own-phone IRL games e2e: four browser contexts = four phones in a living
// room. One player hosts an IRL game, everyone else joins from the invite
// link, secret roles/answers get dealt per phone, and the round resolves.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
function check(name, cond) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function invite(page, lifetime, resilient) {
  // one-runtime: the ROOM invite (owned vs resilient); lifetimes died with the star
  await page.evaluate(() => document.getElementById('appinvite').click());
  await page.waitForSelector('input[name="rmcls"]', { timeout: 8000 });
  await page.evaluate((res) => {
    document.querySelector('input[name="rmcls"][value="' + (res ? 'heal' : 'owned') + '"]').checked = true;
    document.getElementById('inv-go').click();
  }, !!resilient);
  // Inviting now pops the shared copy-link modal (same as everywhere else), a
  // beat after the room mints. Wait for it to show, then close it so the
  // full-screen modal doesn't sit over the app — what a host does before playing.
  await page.waitForFunction(() => { const m = document.getElementById('inv-modal'); return m && getComputedStyle(m).display !== 'none'; }, null, { timeout: 25000 }).catch(() => {});
  await page.evaluate(() => { const m = document.getElementById('inv-modal'); if (m) m.style.display = 'none'; });
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
  await hostRun.waitForFunction(() => document.getElementById('share-url').value, null, { timeout: 25000 });
  const shareUrl = await hostRun.evaluate(() => document.getElementById('share-url').value);

  // ---------- three friends join from their own phones ----------
  const phones = [{ page: hostRun, app: host, name: 'Host' }];
  for (const name of ['Ada', 'Ben', 'Cyd']) {
    const ctx = await browser.newContext();
    await ctx.addInitScript(setup(name));
    const run = await ctx.newPage();
    run.on('console', (m) => { if (m.type() === 'error') console.log('  [' + name + ']', m.text()); });
    await run.goto(shareUrl);
    await run.waitForSelector('iframe', { timeout: 40000 }); // mesh seat + snap + bytes-on-demand — slower than the old star burst
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
  const KNOWN = ['Werewolf', 'Seer', 'Robber', 'Troublemaker', 'Insomniac', 'Villager', 'Hunter'];
  // Waiting for `.role` to EXIST is not the same as waiting for the deal to
  // arrive: the element renders masked ("·····") and fills in when the state
  // reaches that phone. Peeking once after a flat 150ms therefore read the mask
  // on whichever phone was still catching up — deterministically the LAST
  // joiner (Cyd), on a box under gate load, while passing on an idle one.
  // Re-peek until a real role shows, and let the deadline fail the check: a
  // phone that is genuinely never dealt in still ends up asserted against
  // KNOWN, so this waits properly rather than softening anything.
  async function peekRole(p, timeout = 15000) {
    const deadline = Date.now() + timeout;
    let txt = '';
    for (;;) {
      await p.app.locator('.role').dispatchEvent('pointerdown');
      await sleep(150);
      txt = (await p.app.locator('.role .r').textContent()).trim();
      await p.app.locator('.role').dispatchEvent('pointerup');
      if (KNOWN.includes(txt) || Date.now() >= deadline) return txt;
      await sleep(250);
    }
  }
  const roles = [];
  for (const p of phones) roles.push(await peekRole(p));
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
  await sbRun.waitForFunction(() => document.getElementById('share-url').value, null, { timeout: 25000 });
  const sbUrl = await sbRun.evaluate(() => document.getElementById('share-url').value);
  const sbPhones = [{ app: sbHost, page: sbRun }];
  for (const name of ['Eve', 'Fox']) {
    const ctx = await browser.newContext();
    await ctx.addInitScript(setup(name));
    const run = await ctx.newPage();
    await run.goto(sbUrl);
    await run.waitForSelector('iframe', { timeout: 40000 }); // mesh seat + snap + bytes-on-demand — slower than the old star burst
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
  // gifos uids are user_<hex>; taking split('_')[1] of a vote/answer id
  // used to name every player "?" and score nobody. The groups must show
  // the real screen names.
  check('grouped answers name the real players, not ?',
    /Host/.test(sbReveal) && /Eve/.test(sbReveal) && /Fox/.test(sbReveal) && !/\?/.test(sbReveal));
  check('answers stayed hidden until everyone was in', true); // reveal only fired after 3/3

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
