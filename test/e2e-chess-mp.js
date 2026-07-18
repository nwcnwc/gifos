// End-to-end: Chess Grandmaster "Play a friend" (multiplayer).
// Two browser contexts join the same session over the local relay. They take
// the two seats, play Fool's mate to a decisive result, and we verify:
//  - both peers seat (White/Black) once two players are present,
//  - moves made on one board appear on the other (shared, host-authoritative db),
//  - shared Stockfish commentary syncs and reacts after a move,
//  - winner-stays rotation reseats both players into a fresh game.
//
// Needs: static server on 8099 and the local relay on 8790 (test/relay-local.js).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { readFileSync } = require('fs');
const path = require('path');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8790';

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GIF_B64 = readFileSync(path.join(__dirname, '..', 'apps', 'chess-grandmaster.gif')).toString('base64');

async function enterFriend(page) {
  // 30s (was 12s): the JOINER mounts the WASM chess app only after the app-mesh
  // join + P2P handshake completes, which now runs on top of S4's async identity
  // mint — legitimately slower than the old synchronous client-set-id path. The
  // engine-ready wait below is already 45s; the iframe appears before that.
  await page.waitForSelector('iframe', { timeout: 30000 });
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
async function clickMove(frame, orient, uci) {
  const f = 'abcdefgh'; const fx = f.indexOf(uci[0]), fy = 8 - +uci[1], tx = f.indexOf(uci[2]), ty = 8 - +uci[3];
  const F = frame.locator || null; // frame is a Frame; use frameLocator via page
  await frame.click('#fBoard .sq >> nth=' + idx(orient, fx, fy));
  await sleep(120);
  await frame.click('#fBoard .sq >> nth=' + idx(orient, tx, ty));
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
  const aFrame = await enterFriend(aRun);
  await aFrame.locator('#fStatus', { hasText: /Waiting for another/i }).waitFor({ timeout: 5000 }).catch(() => {});
  check('host sees "waiting for another player"', /Waiting for another/i.test(await aFrame.evaluate(() => document.getElementById('fStatus').textContent)));

  // Invite with forever + keep-alive (resilient), grab the link
  await aRun.locator('#host').click();
  await aRun.locator('#inv-go, .perm-modal').first().waitFor({ timeout: 6000 });
  await aRun.locator('input[name=lt][value="forever"]').check().catch(() => {});
  await aRun.locator('input[name=res][value="keep"]').check().catch(() => {});
  await aRun.locator('#inv-go').click();
  await aRun.waitForFunction(() => { const el = document.getElementById('lm-url'); return el && el.value; }, null, { timeout: 8000 });
  const shareUrl = await aRun.locator('#lm-url').inputValue();
  await aRun.locator('#lm-close').click().catch(() => {}); // dismiss the link modal so host controls stay clickable

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

  // Fool's mate: 1. f3 e5 2. g4 Qh4#  (Black wins)
  const line = [['w', 'f2f3'], ['b', 'e7e5'], ['w', 'g2g4'], ['b', 'd8h4']];
  for (const [side, uci] of line) {
    const peer = side === 'w' ? whitePeer : blackPeer;
    const before = (await matchState(aFrame)).moves;
    await clickMove(peer, side, uci);
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

  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
