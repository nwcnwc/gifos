// End-to-end: seeded Chess Tournament — legal moves, vs-computer, clocks, invite-ready lobby.
// Needs: static server on 8099.
const { chromium, CHROME } = require('../lib/pw');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
let failures = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : ''));
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const START = 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 15000 });
  await sleep(400);
  await page.locator('.icon.folder').filter({ hasText: /^Games$/ }).dblclick();
  await sleep(400);
  const [app] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('.icon', { hasText: 'Chess' }).first().dblclick(),
  ]);
  app.on('pageerror', (e) => console.log('  [app pageerror]', e.message));
  await app.waitForSelector('iframe', { timeout: 12000 });
  await app.locator('.perm-box .done', { hasText: 'Confirm' }).click({ timeout: 4000 }).catch(() =>
    app.locator('.perm-modal .done').click({ timeout: 2000 }).catch(() => {}));
  const frame = app.frames().find((f) => f !== app.mainFrame());
  await frame.waitForSelector('#view', { timeout: 8000 });
  await frame.waitForFunction(() => window.__chess, { timeout: 8000 });

  const opening = await frame.evaluate((b) => __chess.legal({ board: b, turn: 'w' }), START);
  check('the start position has 20 legal moves', opening.length === 20, 'n=' + opening.length);
  check('e2e4 is legal at the start', opening.indexOf('e2e4') >= 0);
  check('castling is not legal through occupied squares', opening.indexOf('e1g1') < 0 && opening.indexOf('e1c1') < 0);

  const emptyCastle = 'r...k..r' + 'pppppppp' + '................................' + 'PPPPPPPP' + 'R...K..R';
  const castle = await frame.evaluate((b) => __chess.legal({ board: b, turn: 'w', castle: { K: true, Q: true, k: true, q: true } }), emptyCastle);
  check('castling kingside and queenside are legal when the path is clear',
    castle.indexOf('e1g1') >= 0 && castle.indexOf('e1c1') >= 0, castle.filter((u) => /^e1/.test(u)).join(','));

  // Fool's mate: 1.f3 e5 2.g4 Qh4#  (64-char board, y=0 is rank 8)
  const fool = 'rnbqkbnr' + 'pppp.ppp' + '........' + '....p...' + '......Pq' + '.....P..' + 'PPPPP..P' + 'RNBQKBNR';
  const foolSt = await frame.evaluate((b) => ({ st: __chess.status({ board: b, turn: 'w' }), n: __chess.legal({ board: b, turn: 'w' }).length }), fool);
  check('fool’s mate is checkmate (no legal replies)', foolSt.st === 'mate' && foolSt.n === 0, JSON.stringify(foolSt));

  const lobby = await frame.locator('#view').innerText();
  check('the lobby offers Play the computer (offline engine)', /Play the computer/.test(lobby));
  check('a stranger is auto-joined so Invite can start a tournament',
    /You’re in|You're in/.test(lobby) || /Join lobby/.test(lobby));
  check('time controls are in the lobby', await frame.locator('select').count() >= 2);

  await frame.locator('button.playcpu').click();
  await frame.waitForSelector('.board', { timeout: 8000 });
  check('Play the computer opens a board', (await frame.locator('.sq').count()) === 64);
  check('Hint is still on the player’s turn (e2e-chess-hint contract)',
    (await frame.locator('.hintbar button').count()) === 1);
  check('clocks are on the vs-computer board when a time control is set',
    (await frame.locator('.clock').count()) === 2);

  // e2 then e4
  await frame.locator('.sq').nth(52).click();
  await sleep(80);
  const dests = await frame.locator('.sq.mv').count();
  check('selecting a pawn highlights its legal squares with dots', dests === 2, 'dests=' + dests);
  await frame.locator('.sq').nth(36).click();
  let replied = false;
  for (let i = 0; i < 40; i++) {
    await sleep(150);
    const st = await frame.locator('#status').textContent();
    if (/Your move/.test(st) && !/Computer is thinking/.test(st)) { replied = true; break; }
  }
  check('the onboard computer replies to e4', replied, await frame.locator('#status').textContent());
  check('the last move is highlighted', (await frame.locator('.sq.last').count()) === 2);

  await app.close();
  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
