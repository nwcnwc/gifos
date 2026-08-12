// End-to-end: Chess Grandmaster "Play a friend" (multiplayer).
// Two browser contexts join the same session over the local relay. They take
// the two seats, play Fool's mate to a decisive result, and we verify:
//  - both peers seat (White/Black) once two players are present,
//  - moves made on one board appear on the other (shared, host-authoritative db),
//  - shared Stockfish commentary syncs and reacts after a move,
//  - winner-stays rotation reseats both players into a fresh game.
//
// Needs: static server on 8099 and the local relay on 8790 (test/servers/relay-local.js).
const { chromium, CHROME } = require('../lib/pw');
const { appGif } = require('../lib/apps');
const { readFileSync } = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GIF_B64 = readFileSync(appGif('chess-grandmaster')).toString('base64');

async function enterFriend(page) {
  // 30s (was 12s): the JOINER mounts the WASM chess app only after the app-mesh
  // join + P2P handshake completes, which now runs on top of S4's async identity
  // mint — legitimately slower than the old synchronous client-set-id path. The
  // engine-ready wait below is already 45s; the iframe appears before that.
  await page.waitForSelector('iframe', { timeout: 120000 }); // 8MB app over the mesh lane: DC forms while the host's WASM engine churns a starved CI core, then ~15MB sealed transfer
  await page.locator('.perm-modal .done').click({ timeout: 3000 }).catch(() => {});
  const fr = page.frameLocator('iframe');
  await fr.locator('#engineChip', { hasText: 'ready' }).waitFor({ timeout: 45000 }).catch(() => {});
  await fr.locator('#friendBtn').click();
  await fr.locator('#friend').waitFor({ timeout: 6000 });
  return page.frames().find((f) => f !== page.mainFrame());
}
async function matchState(frame) {
  return frame.evaluate(async () => {
    const all = await gifos.db('cgm-mp').getAll(); const m = all.find((x) => x.id === 'm'); const me = await gifos.me();
    return m ? { w: m.seats.w, b: m.seats.b, me: me.id, moves: m.game.moves.length, winner: m.game.winner, commentary: m.commentary, comment: m.comment && m.comment.text } : { me: me.id };
  });
}
function idx(orient, x, y) { return orient === 'w' ? y * 8 + x : (7 - y) * 8 + (7 - x); }
// CLICK A SQUARE ON A BOARD THAT REBUILDS UNDER YOU.
//
// The app rebuilds #fBoard wholesale on its HB_MS=3000 presence beat — by
// design, ~2 rebuilds per 3s per peer — so every .sq node is replaced on a
// timer. Playwright's actionability gate requires an element to be STABLE (the
// same bounding box across two consecutive animation frames) before it will
// click, and on a busy box the rebuilds and the animation frames interleave
// such that the gate never opens: `frame.click` spends its whole 30s budget
// waiting and throws Timeout without ever dispatching a click.
//
// That is exactly how this suite red-ed the 0.9.7 gate (RED TWICE, both runs
// "frame.click: Timeout 30000ms exceeded" on the FIRST move, churn 195 and 650
// against a healthy ~130). It is NOT a regression: measured as an interleaved
// A/B on one box, HEAD and the shipped 0.9.6 tree behave identically — 2/2
// green each on an idle box, 3/3 red each under a synthetic full-core load.
// The suite is simply unable to click a periodically-rebuilt board once the
// box is busy.
//
// So the click tolerates the rebuild, and NOTHING about what is asserted
// changes: the move must still land, still sync to the peer, still produce
// checkmate and commentary. A forced click skips the stability wait only —
// the element must still exist and resolve — and if the square genuinely
// cannot be clicked, the move never registers and the assertions below fail
// exactly as they did before.
async function clickSq(frame, n) {
  const sel = '#fBoard .sq >> nth=' + n;
  try { await frame.click(sel, { timeout: 5000 }); return; }
  catch (e) {
    if (!/Timeout|not stable|detached/i.test(String(e && e.message))) throw e;
    // The app paints the board in place now, so this fallback should never be
    // needed. Say so when it is: a silent fallback is how the rebuild hid.
    console.log('  NOTE: square ' + n + ' was not stable — falling back to a forced click'
      + ' (the board should no longer be rebuilt; see the steady-state checks at the end)');
  }
  // Second attempt, no stability gate. Real mouse events at the square's
  // centre, so a rebuild between resolve and dispatch lands on the new node
  // occupying the same square.
  await frame.click(sel, { timeout: 5000, force: true });
}
async function clickMove(frame, orient, uci) {
  const f = 'abcdefgh'; const fx = f.indexOf(uci[0]), fy = 8 - +uci[1], tx = f.indexOf(uci[2]), ty = 8 - +uci[3];
  await clickSq(frame, idx(orient, fx, fy));
  await sleep(120);
  await clickSq(frame, idx(orient, tx, ty));
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const setup = (name) => ({ content: "try{localStorage.setItem('gifos_relay','" + RELAY + "');localStorage.setItem('gifos_name','" + name + "')}catch(e){}" });

  // ---- Alice hosts ----
  const aCtx = await browser.newContext(); await aCtx.addInitScript(setup('Alice'));
  const aDesk = await aCtx.newPage();
  aDesk.on('pageerror', (e) => console.log('  [Alice err]', e.message));
  await aDesk.goto(BASE + '/index.html'); await aDesk.waitForSelector('.icon', { timeout: 10000 }); await sleep(300);
  await aDesk.evaluate(async (b64) => {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const fid = GifOS.store.uid('file');
    await GifOS.store.putFile({ id: fid, name: 'Chess Grandmaster.gif', bytes, kind: 'gif', isApp: true, appId: 'chess-grandmaster', mime: 'image/gif' });
    await GifOS.store.putItem({ id: GifOS.store.uid('item'), kind: 'file', fileId: fid, name: 'Chess Grandmaster.gif', parent: null, x: 200, y: 200, iconSize: 64 });
    await GifOS.desktop.load(); await GifOS.desktop.render();
  }, GIF_B64);
  const [aRun] = await Promise.all([aCtx.waitForEvent('page'), aDesk.locator('.icon', { hasText: 'Chess Grandmaster.gif' }).dblclick()]);
  aRun.on('pageerror', (e) => console.log('  [Alice app err]', e.message));
  let aFrame = await enterFriend(aRun);
  await aFrame.locator('#fStatus', { hasText: /Waiting for another/i }).waitFor({ timeout: 5000 }).catch(() => {});
  check('host sees "waiting for another player"', /Waiting for another/i.test(await aFrame.evaluate(() => document.getElementById('fStatus').textContent)));

  // Invite as a RESILIENT room (the succession class), grab the room link
  await aRun.evaluate(() => document.getElementById('appinvite').click());
  await aRun.waitForSelector('input[name="rmcls"]', { timeout: 8000 });
  await aRun.evaluate(() => {
    document.querySelector('input[name="rmcls"][value="heal"]').checked = true;
    document.getElementById('inv-go').click();
  });
  await aRun.waitForFunction(() => document.getElementById('share-url').value, null, { timeout: 25000 });
  const shareUrl = await aRun.evaluate(() => document.getElementById('share-url').value);
  // Inviting now pops the shared copy-link modal (after runApp remounts, so a
  // beat AFTER share-url appears); wait for it, then close it so it doesn't sit
  // over the board — exactly what a host does before playing.
  await aRun.waitForFunction(() => { const m = document.getElementById('inv-modal'); return m && getComputedStyle(m).display !== 'none'; }, null, { timeout: 25000 }).catch(() => {});
  await aRun.evaluate(() => { const m = document.getElementById('inv-modal'); if (m) m.style.display = 'none'; });
  // Invite REBOOTS the app into hosted mode (runApp remounts the iframe) — the
  // pre-invite Frame handle is dead; re-enter friend mode on the fresh mount.
  aFrame = await enterFriend(aRun);

  // ---- Bob joins from the link ----
  const bCtx = await browser.newContext(); await bCtx.addInitScript(setup('Bob'));
  const bRun = await bCtx.newPage();
  bRun.on('pageerror', (e) => console.log('  [Bob app err]', e.message));
  await bRun.goto(shareUrl);
  const bFrame = await enterFriend(bRun);

  // both seated
  await aRun.frameLocator('iframe').locator('.seat .open').waitFor({ state: 'detached', timeout: 20000 }).catch(() => {});
  await sleep(1500);
  const ms = await matchState(aFrame);
  check('both players take the two seats', ms.w && ms.b && ms.w !== ms.b, 'w=' + ms.w + ' b=' + ms.b);
  const aId = (await matchState(aFrame)).me, bId = (await matchState(bFrame)).me;
  const whiteIsAlice = ms.w === aId;
  const whitePeer = whiteIsAlice ? aFrame : bFrame, blackPeer = whiteIsAlice ? bFrame : aFrame;

  // turn commentary on from one side; it should sync to the other
  await (whiteIsAlice ? aRun : bRun).frameLocator('iframe').locator('#fComment').check();
  await sleep(1500);
  check('commentary toggle syncs to both peers', (await matchState(bFrame)).commentary === true && (await matchState(aFrame)).commentary === true);

  // FORENSICS FOR THE GATE RED (2026-08-08, blocker 1): the first move click
  // loops "element detached" ONLY in gate/tier context (aged shared servers),
  // green standalone — so the one chance to see the mechanism is to dump the
  // state AT the failing click. Three suspects, three probes:
  //   - remount loop (reconcileApp/succession churn) -> __appRemounts (page)
  //     + __appJoinTrace restarting near ms=0;
  //   - dual-manager presence storm (app-side: diverged cgm-pres makes BOTH
  //     peers manager -> conflicting 'm' writes -> render storm) -> presence
  //     record ages + manager view from BOTH frames;
  //   - plain render churn rate -> a 3s MutationObserver count on #fBoard.
  const boardChurn = (frame) => frame.evaluate(() => new Promise((res) => {
    const bd = document.getElementById('fBoard'); if (!bd) { res(-1); return; }
    let n = 0; const mo = new MutationObserver((muts) => { n += muts.length; });
    mo.observe(bd, { childList: true });
    setTimeout(() => { mo.disconnect(); res(n); }, 3000);
  })).catch(() => 'frame-gone');
  const dumpApp = async (tag, page, frame) => {
    const pg = await page.evaluate(() => ({
      remounts: (window.__appRemounts || []).slice(-25),
      joinTrace: (window.__appJoinTrace || []).slice(-12),
      isHost: !!(window.__gifosVideo && __gifosVideo.appIsHost && __gifosVideo.appIsHost()),
    })).catch((e) => ({ err: String(e && e.message || e) }));
    const fr = await frame.evaluate(async () => {
      const now = Date.now();
      const pres = (await gifos.db('cgm-pres').getAll()).map((r) => ({ id: String(r.id).slice(0, 8), age: now - (r.ts || 0) }));
      const all = await gifos.db('cgm-mp').getAll(); const m = all.find((x) => x.id === 'm');
      const me = await gifos.me();
      return { me: String(me.id).slice(0, 8), pres, m: m ? { w: m.seats && String(m.seats.w).slice(0, 8), b: m.seats && String(m.seats.b).slice(0, 8), moves: m.game.moves.length, no: m.game.no } : null };
    }).catch((e) => ({ err: String(e && e.message || e) }));
    console.log('  FORENSICS[' + tag + '] page=' + JSON.stringify(pg));
    console.log('  FORENSICS[' + tag + '] frame=' + JSON.stringify(fr) + ' boardChurn3s=' + JSON.stringify(await boardChurn(frame)));
  };
  // NO pre-move baseline measurement: the first cut sampled 3s×2 of churn
  // right here and the tier run promptly went GREEN for the first time in
  // five tier-context runs — the added settle sits exactly on the suspected
  // startup-race window, so the probe was plausibly masking the bug. The
  // click path must stay timing-identical to the failing gates; churn is
  // measured only in the failure dump (and the healthy number is simply the
  // app's HB_MS=3000 presence beat, ~2 rebuilds per 3s per peer).

  // Fool's mate: 1. f3 e5 2. g4 Qh4#  (Black wins)
  const line = [['w', 'f2f3'], ['b', 'e7e5'], ['w', 'g2g4'], ['b', 'd8h4']];
  for (const [side, uci] of line) {
    const peer = side === 'w' ? whitePeer : blackPeer;
    const before = (await matchState(aFrame)).moves;
    try {
      await clickMove(peer, side, uci);
    } catch (e) {
      console.log('  MOVE CLICK FAILED (' + side + ' ' + uci + '): ' + String(e && e.message || e).split('\n')[0]);
      await dumpApp('alice', aRun, aFrame);
      await dumpApp('bob', bRun, bFrame);
      check('move click ' + uci + ' lands (element stayed attached)', false, 'see FORENSICS above');
      break;
    }
    await aFrame.evaluate((n) => new Promise((res) => { const t = setInterval(async () => { const all = await gifos.db('cgm-mp').getAll(); const m = all.find((x) => x.id === 'm'); if (m && m.game.moves.length > n) { clearInterval(t); res(); } }, 200); setTimeout(() => { clearInterval(t); res(); }, 10000); }), before);
  }
  const afterMate = await matchState(aFrame);
  check('moves sync across peers (4 half-moves played)', afterMate.moves >= 4, afterMate.moves + ' moves');
  check('checkmate detected, Black wins', afterMate.winner === 'b', 'winner=' + afterMate.winner);
  // commentary produced a reaction visible to both
  await sleep(500);
  const cA = await aFrame.evaluate(() => document.getElementById('fCommentBox').textContent);
  check('Stockfish commentary shown after a move', !!(cA && cA.trim()), JSON.stringify(cA));

  // winner-stays rotation → fresh game, both still seated (2 players re-pair)
  await aFrame.evaluate(() => new Promise((res) => { const t = setInterval(async () => { const all = await gifos.db('cgm-mp').getAll(); const m = all.find((x) => x.id === 'm'); if (m && m.game.winner === null && m.game.moves.length === 0 && m.game.no >= 2) { clearInterval(t); res(); } }, 300); setTimeout(() => { clearInterval(t); res(); }, 12000); }));
  const rot = await matchState(aFrame);
  check('winner-stays: a fresh game starts with both seats filled', rot.w && rot.b && rot.winner === null && rot.moves === 0, JSON.stringify(rot));

  // ---- THE BOARD MUST NOT BE REBUILT UNDER A FINGER ----------------------
  // Measured LAST, deliberately: sampling before the moves adds a settle that
  // sits on the startup-race window this suite once masked (see the note above
  // the move loop). By here every move has landed, so a 4-second window — one
  // full HB_MS=3000 beat and change — can only see the steady state.
  //
  // The app used to do `#fBoard.innerHTML = ''` plus 64 fresh divs on EVERY
  // render, and it renders on every presence beat, so every square was a
  // different DOM node about twice a second. On a loaded phone a finger that
  // goes down just before a rebuild lifts over a node that no longer exists and
  // the move is lost; Playwright's stability gate has the same problem, which is
  // how this suite spent its whole 30s click budget and red-ed the 0.9.7 gate
  // twice. The board is painted in place now.
  //
  // NOT VACUOUS: zero DOM churn is also what a dead app looks like, so the
  // renders must be counted in the same window and must ADVANCE.
  const steady = await aFrame.evaluate(() => new Promise((res) => {
    const bd = document.getElementById('fBoard');
    if (!bd) { res({ err: 'no #fBoard' }); return; }
    const first = bd.firstElementChild;
    const r0 = window.__cgmRenders || 0;
    let muts = 0;
    const mo = new MutationObserver((ms) => { for (const m of ms) muts += m.addedNodes.length + m.removedNodes.length; });
    mo.observe(bd, { childList: true, subtree: true });
    setTimeout(() => {
      mo.disconnect();
      res({ muts: muts, renders: (window.__cgmRenders || 0) - r0, kept: bd.firstElementChild === first, squares: bd.querySelectorAll('.sq').length });
    }, 4000);
  })).catch((e) => ({ err: String(e && e.message || e) }));
  check('the presence beat still renders the board (the window was not measuring a dead app)',
    steady.renders >= 2, JSON.stringify(steady));
  check('…and NOT ONE square node is replaced by it (a tap can never land on a node about to die)',
    steady.muts === 0 && steady.kept === true && steady.squares === 64, JSON.stringify(steady));

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
