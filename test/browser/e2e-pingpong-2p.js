// End-to-end: seeded Ping Pong, two people, one invite link, no game server.
//
// The host runs the physics and the guest joins through the link in the GifOS
// bar. Every check here guards a defect that shipped:
//  - themName() read the GUEST's own record on both ends, so a guest was told
//    its opponent was itself.
//  - drawScores took WORLD y and p() mirrors the world for the guest, so the
//    opponent's score was painted on the guest's own half of the table.
//  - the guest's paddle reached the host ~250 ms late and the ball reached the
//    guest ~250 ms late, so the guest lost every point. Both ends now measure
//    the round trip and aim at where the other player IS.
//  - a guest that watched a match end stayed stuck on the result after the
//    host started a new one, because match-over was a latched local flag
//    instead of a reading of the shared score.
//
// Needs: static server on 8099 AND the local relay on 8790
// (node test/servers/relay-local.js).
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function appFrame(run) {
  await run.waitForSelector('iframe', { timeout: 90000 });
  await run.locator('.perm-box .done', { hasText: 'Confirm' }).click({ timeout: 5000 }).catch(() =>
    run.locator('.perm-modal .done').click({ timeout: 3000 }).catch(() => {}));
  const fr = run.frames().find((f) => f !== run.mainFrame());
  await fr.waitForSelector('canvas#game', { timeout: 40000 });
  await fr.waitForFunction(() => typeof game === 'object' && typeof fly === 'function', { timeout: 20000 });
  return fr;
}

// Both sides are played the way a person plays them: the paddle is put where
// the ball is going, in both axes, by moving a real pointer.
function drive(frame, secs) {
  return frame.evaluate(async (SECS) => {
    const mine = owner ? 'host' : 'guest';
    let maxRally = 0;
    const t0 = Date.now();
    const bot = setInterval(function () {
      if ((game.rally || 0) > maxRally) maxRally = game.rally;
      if (game.serving === mine) {
        if (Date.now() < freezeUntil) return;
        if (owner) doServe('host', 0.55 + Math.random() * 0.25, (Math.random() - 0.5) * 50, -30);
        else sendSwing(0.55 + Math.random() * 0.25, (Math.random() - 0.5) * 50, -30);
        return;
      }
      const toward = owner ? game.vy < 0 : game.vy > 0;
      if (!toward) return;
      const here = owner ? game.hostY : gst.y;
      const r = fly(here, false);
      const land = fly(null, true);
      const depth = land.bounced ? clamp((owner ? land.y : TL - land.y) * 0.5 - 1.2, HOST_MIN, STEP_IN) : 0;
      if (owner) { game.hostX = clampX(r.x); game.hostY = clampY(depth, true); }
      else { gst.x = clampX(r.x); gst.y = clampY(TL - depth, false); }
    }, 16);
    await new Promise((r) => setTimeout(r, SECS * 1000));
    clearInterval(bot);
    return { maxRally, hs: game.hostScore, gs: game.guestScore, secs: (Date.now() - t0) / 1000 };
  }, secs);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns'],
  });
  const setup = (name) => ({
    content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "')}catch(e){}",
  });

  // ---- Alice opens Ping Pong and presses Invite ----------------------------
  const aCtx = await browser.newContext({ viewport: { width: 1000, height: 760 } });
  await aCtx.addInitScript(setup('Alice'));
  const aDesk = await aCtx.newPage();
  aDesk.on('pageerror', (e) => console.log('  [Alice desk]', e.message));
  await aDesk.goto(BASE + '/index.html');
  await aDesk.waitForSelector('.icon', { timeout: 20000 });
  await sleep(400);
  await aDesk.locator('.icon.folder').filter({ hasText: /^Games$/ }).dblclick();
  await sleep(400);
  let [aRun] = await Promise.all([
    aCtx.waitForEvent('page'),
    aDesk.locator('.icon', { hasText: 'Ping Pong' }).first().dblclick(),
  ]);
  aRun.on('pageerror', (e) => console.log('  [Alice app]', e.message));
  let aFrame = await appFrame(aRun);
  check('the host opens the game', !!aFrame);

  await aRun.evaluate(() => document.getElementById('appinvite').click());
  await aRun.waitForSelector('input[name="rmcls"]', { timeout: 20000 }).catch(() => {});
  await aRun.evaluate(() => {
    const r = document.querySelector('input[name="rmcls"][value="heal"]');
    if (r) r.checked = true;
    document.getElementById('inv-go').click();
  });
  await aRun.waitForFunction(() => {
    const el = document.getElementById('share-url');
    return el && el.value;
  }, null, { timeout: 60000 });
  const url = await aRun.evaluate(() => document.getElementById('share-url').value);
  await aRun.evaluate(() => { const m = document.getElementById('inv-modal'); if (m) m.style.display = 'none'; });
  aFrame = await appFrame(aRun);
  check('Invite produces a link to share', /#j=/.test(url), url.slice(0, 48) + '…');

  const waiting = await aFrame.evaluate(() => ({
    status: document.getElementById('status').textContent,
    cpu: isCpu(),
  }));
  check('before anyone joins the host is honestly alone',
    /invite|friend|serve/i.test(waiting.status), JSON.stringify(waiting));

  // ---- Bob joins from a phone ---------------------------------------------
  const bCtx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  await bCtx.addInitScript(setup('Bob'));
  const bRun = await bCtx.newPage();
  bRun.on('pageerror', (e) => console.log('  [Bob app]', e.message));
  await bRun.goto(url);
  const bFrame = await appFrame(bRun);
  await sleep(2500);

  const roles = {
    a: await aFrame.evaluate(() => ({ owner, name: me.name, them: themName() })),
    b: await bFrame.evaluate(() => ({ owner, name: me.name, them: themName() })),
  };
  check('one host, one guest', roles.a.owner === true && roles.b.owner === false, JSON.stringify(roles));
  check('the host is told it is playing Bob', roles.a.them === 'Bob', JSON.stringify(roles.a));
  check('the guest is told it is playing Alice, not itself',
    roles.b.them === 'Alice', JSON.stringify(roles.b));
  check('the host stops pretending a computer is there', (await aFrame.evaluate(() => isCpu())) === false);

  // ---- each player's own score is on their own half ------------------------
  const halves = async (fr) => fr.evaluate(() => {
    const mineY = p(0, vy2world(TL * 0.30), 0.03).y;   // where drawScores puts YOUR number
    const theirY = p(0, vy2world(TL * 0.66), 0.03).y;  // and theirs
    const nearPaddle = p(0, owner ? game.hostY : gst.y, 0).y;
    const farPaddle = p(0, owner ? game.guestY : game.hostY, 0).y;
    return { mineY, theirY, nearPaddle, farPaddle };
  });
  const ha = await halves(aFrame), hb = await halves(bFrame);
  check('on the host screen its own score is nearer than the opponent’s',
    ha.mineY > ha.theirY, JSON.stringify(ha));
  check('on the guest screen its own score is nearer than the opponent’s',
    hb.mineY > hb.theirY, JSON.stringify(hb));
  check('each player sees their own paddle at the near end',
    ha.nearPaddle > ha.farPaddle && hb.nearPaddle > hb.farPaddle,
    JSON.stringify({ ha, hb }));

  // ---- they play ----------------------------------------------------------
  const [ra, rb] = await Promise.all([drive(aFrame, 40), drive(bFrame, 40)]);
  check('the two clients agree on the score',
    ra.hs === rb.hs && ra.gs === rb.gs, JSON.stringify({ ra, rb }));
  check('they rally — at least six shots crossed the net',
    Math.max(ra.maxRally, rb.maxRally) >= 6, JSON.stringify({ a: ra.maxRally, b: rb.maxRally }));
  check('the guest wins points too (it is a game, not a demonstration)',
    ra.gs >= 2, 'host ' + ra.hs + ' — guest ' + ra.gs);
  check('the host wins points too', ra.hs >= 2, 'host ' + ra.hs + ' — guest ' + ra.gs);

  // ---- latency is measured, and compensated -------------------------------
  const lag = await bFrame.evaluate(() => ({ rtt: Math.round(rtt) }));
  check('the guest measures the round trip instead of assuming it',
    lag.rtt > 0 && lag.rtt < 4000, 'rtt ' + lag.rtt + 'ms');
  const follow = await (async () => {
    await bFrame.evaluate(() => { gst.x = -5.5; });
    const t0 = Date.now();
    for (let i = 0; i < 120; i++) {
      const gx = await aFrame.evaluate(() => game.guestX);
      if (Math.abs(gx + 5.5) < 1.6) return Date.now() - t0;
      await sleep(25);
    }
    return -1;
  })();
  check('a guest paddle move reaches the host within a third of a second',
    follow >= 0 && follow < 350, follow + 'ms');

  const drift = await (async () => {
    const [a, b] = await Promise.all([
      aFrame.evaluate(() => ({ y: game.by, t: Date.now() })),
      bFrame.evaluate(() => ({ y: game.by, t: Date.now() })),
    ]);
    return Math.abs(a.y - b.y);
  })();
  check('the ball is in roughly the same place on both screens',
    drift < 4.5, drift.toFixed(2) + ' dm apart (table is ' + 27.4 + ' dm long)');

  // ---- the guest drops out ------------------------------------------------
  await bCtx.setOffline(true);
  await sleep(5000);
  const away = await aFrame.evaluate(() => ({
    paused: game.paused,
    status: document.getElementById('status').textContent,
    overlay: document.getElementById('overlay').classList.contains('on'),
    title: document.getElementById('ot').textContent,
  }));
  check('the host notices the guest is gone and holds the ball',
    away.paused === true, JSON.stringify(away));
  check('and says who, rather than blaming the network',
    /Bob/.test(away.title + away.status), JSON.stringify(away));
  const guestSeesIt = await bFrame.evaluate(() => ({
    overlay: document.getElementById('overlay').classList.contains('on'),
    title: document.getElementById('ot').textContent,
  }));
  check('the guest is told the game is paused, not left guessing',
    guestSeesIt.overlay === true, JSON.stringify(guestSeesIt));

  await bCtx.setOffline(false);
  await sleep(6000);
  const back = await aFrame.evaluate(() => ({ paused: game.paused, cpu: isCpu() }));
  check('play resumes when the guest comes back', back.paused === false, JSON.stringify(back));
  check('and the computer never quietly took their place', back.cpu === false, JSON.stringify(back));

  // ---- the match ends, and starts again -----------------------------------
  await aFrame.evaluate(() => {
    game.hostScore = 11; game.guestScore = 4; game.pt = (game.pt || 0) + 1;
    game.msgWho = 'host'; game.why = 'miss';
    pushGame();
  });
  await sleep(2500);
  const over = {
    a: await aFrame.evaluate(() => ({
      on: document.getElementById('overlay').classList.contains('on'),
      title: document.getElementById('ot').textContent,
      btn: document.getElementById('readyBtn').textContent,
      shown: getComputedStyle(document.getElementById('readyBtn')).display !== 'none',
    })),
    b: await bFrame.evaluate(() => ({
      on: document.getElementById('overlay').classList.contains('on'),
      title: document.getElementById('ot').textContent,
      shown: getComputedStyle(document.getElementById('readyBtn')).display !== 'none',
    })),
  };
  check('both screens show the result', over.a.on && over.b.on, JSON.stringify(over));
  check('the winner is the winner on both screens',
    /win/i.test(over.a.title) && /win/i.test(over.b.title), JSON.stringify(over));
  check('only the host is offered Play again', over.a.shown === true && over.b.shown === false,
    JSON.stringify(over));

  await aRun.frameLocator('iframe').locator('#readyBtn').click();
  await sleep(2500);
  const fresh = {
    a: await aFrame.evaluate(() => ({ hs: game.hostScore, gs: game.guestScore, on: document.getElementById('overlay').classList.contains('on') })),
    b: await bFrame.evaluate(() => ({ hs: game.hostScore, gs: game.guestScore, on: document.getElementById('overlay').classList.contains('on') })),
  };
  check('Play again clears the result on the GUEST’s screen too',
    fresh.b.on === false && fresh.b.hs === 0 && fresh.b.gs === 0, JSON.stringify(fresh));
  check('and on the host’s', fresh.a.on === false && fresh.a.hs === 0, JSON.stringify(fresh));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
