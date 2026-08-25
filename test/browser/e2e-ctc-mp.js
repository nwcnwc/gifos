/*
 * End-to-end: two people, one series.
 *
 * The listing says the room keeps score. That is a claim about a RUNNING
 * system — the relay, the app room, a host-owned collection and a guest
 * writing one row into it — and neither of the other two suites touches it.
 * test/unit/catch-the-cat.js runs both clients in one process against a fake
 * collection; e2e-ctc-race.js stubs gifos.db in one page. Only this one puts a
 * real guest on a real invite link and asks whether the two screens agree.
 *
 * What that adds, specifically: a guest's row is a WRITE THAT LEAVES THE TAB.
 * It forwards to the host, lands in the host's state, and comes back to every
 * other client in a snapshot. Every field the series is made of — wins, best,
 * streak, the round number — rides that path, and a self-scored leaderboard is
 * worth nothing if the row that arrives is not the row that was sent.
 *
 * Rounds are ended by calling CTCNet.report() in the app frame — the same call
 * boot.js makes off the game's own ctc-win/ctc-lose events. Solving an 11x11
 * honeycomb twice in two browsers is not what is under test here; e2e-ctc-race
 * drives the real game events, and e2e-ctc-pinch proves a finger still plays.
 *
 * Needs: static server on 8099, and a relay on ws://127.0.0.1:8790
 *   python3 -m http.server 8099 -d site
 *   node test/servers/relay-local.js
 */
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');
const { readFileSync } = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail !== undefined ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}

// Evaluate in a page's CURRENT app frame. Invite re-mounts the app on the room
// lane, so a frame handle taken at boot goes stale under you.
function ev(page) {
  return async function (fn, arg) {
    for (let i = 0; i < 20; i++) {
      const f = page.frames().find((x) => x !== page.mainFrame());
      if (f) {
        try { return await f.evaluate(fn, arg); } catch (e) {
          if (!/closed|destroyed|detached|Execution context/i.test(String(e.message))) throw e;
        }
      }
      await sleep(400);
    }
    throw new Error('no live app frame');
  };
}

async function ready(page, ms) {
  const t0 = Date.now();
  const one = ev(page);
  while (Date.now() - t0 < (ms || 60000)) {
    const ok = await one(() => !!(window.CTCNet && window.CTCNet.round().id)).catch(() => false);
    if (ok) return true;
    await sleep(300);
  }
  return false;
}

async function until(fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 40000)) {
    let v = false;
    try { v = await fn(); } catch (e) { v = false; }
    if (v) return true;
    await sleep(400);
  }
  return false;
}

// One player's line in a page's standings, by id.
const SEAT = (id) => window.CTCNet.roster().filter((p) => p.id === id)[0] || null;

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });

  const mkCtx = async (name) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript("try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "');localStorage.setItem('gifos_meet_bar','0')}catch(e){}");
    ctx.setDefaultTimeout(60000);
    return ctx;
  };

  // ---- the host installs the app and opens it -------------------------------
  const hCtx = await mkCtx('Hana');
  const d = await hCtx.newPage();
  await d.goto(BASE + '/index.html');
  await d.waitForSelector('.icon', { timeout: 60000 });
  const fid = await d.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const id = GifOS.store.uid('file');
    await GifOS.store.putFile({ id, name: 'Catch the Cat.gif', bytes, kind: 'gif', isApp: true, appId: 'catch-the-cat', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: id, name: 'Catch the Cat.gif', parent: null, x: 200, y: 200, iconSize: 64 });
    return id;
  }, readFileSync(appGif('catch-the-cat')).toString('base64'));
  await d.close();

  const h = await hCtx.newPage();
  h.on('pageerror', (e) => console.log('  [host] ' + e.message));
  await h.goto(BASE + '/run.html#id=' + fid);
  await h.waitForSelector('#appmount iframe', { timeout: 60000 });
  await h.locator('.perm-modal .done, .perm-box .done').first().click({ timeout: 8000 }).catch(() => {});
  const hUp = await ready(h);
  check('the app boots on the host', hUp);
  if (!hUp) { console.log('NO-VERDICT: the host app never became ready'); process.exit(4); }
  const hEval = ev(h);

  // ---- Invite --------------------------------------------------------------
  await h.evaluate(() => document.getElementById('appinvite').click());
  await h.waitForSelector('input[name="rmcls"]', { timeout: 15000 });
  await h.evaluate(() => {
    const r = document.querySelector('input[name="rmcls"][value="heal"]');
    if (r) r.checked = true;
    document.getElementById('inv-go').click();
  });
  await h.waitForFunction(() => document.body.classList.contains('app-room'), null, { timeout: 30000 });
  const link = await h.evaluate(() => document.getElementById('share-url').value);
  check('Invite mints a room link for the app', /#j=|\/join\//.test(link), link);
  check('the app comes back up on the room lane', await ready(h));

  const board = await hEval(() => window.CTCNet.round());
  const hostId = await hEval(() => window.CTCNet.me().id);

  // ---- the guest opens the link --------------------------------------------
  const cCtx = await mkCtx('Cleo');
  const c = await cCtx.newPage();
  c.on('pageerror', (e) => console.log('  [guest] ' + e.message));
  await c.goto(link);
  await c.waitForSelector('#appmount iframe', { timeout: 60000 });
  const cUp = await ready(c, 90000);
  check('the guest gets the same app from the room, with no install', cUp);
  if (!cUp) { console.log('NO-VERDICT: the guest app never became ready'); process.exit(4); }
  const cEval = ev(c);
  const guestId = await cEval(() => window.CTCNet.me().id);

  const same = await until(async () => {
    const r = await cEval(() => window.CTCNet.round());
    return r.seed === board.seed && r.n === board.n;
  }, 60000);
  const gRound = await cEval(() => window.CTCNet.round());
  check('the guest lands on the host\'s board', same, JSON.stringify({ host: board.seed, guest: gRound.seed }));
  check('...and on the same round number', gRound.n === board.n, JSON.stringify({ host: board.n, guest: gRound.n }));

  // A guest's row is a write that leaves the tab: it must reach the host.
  const arrived = await until(async () => hEval(SEAT, guestId).then((s) => !!s), 60000);
  check('the guest\'s row reaches the host', arrived);
  check('...and the host counts two players',
    (await hEval(() => window.CTCNet.roster().length)) === 2,
    await hEval(() => window.CTCNet.roster().map((p) => p.name).join(', ')));

  // ---- round 1: the host pens it in first ----------------------------------
  await cEval(() => window.CTCNet.report(19, 'win'));
  await sleep(1500);
  await hEval(() => window.CTCNet.report(12, 'win'));

  const scored = await until(async () => {
    const a = await hEval(SEAT, hostId);
    const b = await cEval(SEAT, hostId);
    return a && b && a.wins === 1 && b.wins === 1;
  }, 60000);
  const hSeat = await hEval(SEAT, hostId);
  const cSeat = await cEval(SEAT, hostId);
  check('fewest taps takes the round, and BOTH screens say so', scored,
    JSON.stringify({ onHost: hSeat && hSeat.wins, onGuest: cSeat && cSeat.wins }));
  const hGuest = await hEval(SEAT, guestId);
  const cGuest = await cEval(SEAT, guestId);
  check('...and the runner-up scores nothing on either screen',
    hGuest.wins === 0 && cGuest.wins === 0, JSON.stringify({ onHost: hGuest.wins, onGuest: cGuest.wins }));
  check('...while their own best board survives the trip',
    hGuest.best === 19 && cGuest.best === 19, JSON.stringify({ onHost: hGuest.best, onGuest: cGuest.best }));
  check('the winner is crowned in the guest\'s standings',
    (await cEval(() => window.CTCNet.roster()[0].id)) === hostId);
  check('...and the guest was told the result',
    await cEval(() => /wins round 1/i.test(document.getElementById('status').textContent)),
    await cEval(() => document.getElementById('status').textContent));

  // ---- round 2: the GUEST deals it -----------------------------------------
  await cEval(() => document.getElementById('again').click());
  const dealt = await until(async () => {
    const r = await hEval(() => window.CTCNet.round());
    return r.n === 2 && r.seed !== board.seed;
  }, 60000);
  const r2 = await hEval(() => window.CTCNet.round());
  check('a guest can deal the next round for the whole room', dealt, JSON.stringify(r2));
  check('...and the series carries over the new board',
    (await hEval(SEAT, hostId)).wins === 1 && (await cEval(SEAT, hostId)).wins === 1);
  check('...while this board starts blank on both screens',
    (await hEval(SEAT, hostId)).clicks === 0 && (await cEval(SEAT, guestId)).clicks === 0);

  // ---- round 2: the guest takes it, and the streak breaks -------------------
  await hEval(() => window.CTCNet.report(21, 'lose'));
  await sleep(1500);
  await cEval(() => window.CTCNet.report(15, 'win'));
  const evened = await until(async () => {
    const g = await hEval(SEAT, guestId);
    const w = await hEval(SEAT, hostId);
    return g && w && g.wins === 1 && w.wins === 1 && w.streak === 0;
  }, 60000);
  const tally = await hEval(() => window.CTCNet.roster().map((p) => p.name + ':' + p.wins + '/' + p.streak).join(' '));
  check('an escaped cat scores nothing and breaks the streak', evened, tally);
  check('...and the two screens hold the same table', tally ===
    (await cEval(() => window.CTCNet.roster().map((p) => p.name + ':' + p.wins + '/' + p.streak).join(' '))), tally);

  await hCtx.close();
  await cCtx.close();
  await browser.close();
  console.log(failures ? '\n' + failures + ' FAILED' : '\nall green');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
