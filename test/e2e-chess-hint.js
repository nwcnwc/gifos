// End-to-end: the AI "Hint" button on the DEFAULT Chess Tournament app.
// - The seeded chess app now declares capabilities.ai:["smartest"].
// - On the player's turn, "💡 Hint" feeds the runtime's Smartest model a clean
//   FEN + the EXACT legal-move list (from the app's own generator), and the
//   suggested move is highlighted on the board — the key never enters the app.
//
// Needs: static server on 8099 and test/fake-ai.js on 8791 (Smartest model).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const AI = 'http://127.0.0.1:8791';

let failures = 0;
function check(name, cond, detail) { console.log((cond ? 'PASS' : 'FAIL') + ' — ' + name + (detail ? '  (' + detail + ')' : '')); if (!cond) failures++; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const AI_CFG = JSON.stringify({ smartest: { url: AI, key: 'k', model: 'x' } });

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const context = await browser.newContext();
  await context.addInitScript((c) => { try { localStorage.setItem('gifos_ai_config', c); } catch (e) {} }, AI_CFG);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(BASE + '/index.html');
  await page.waitForSelector('.icon', { timeout: 10000 });
  await sleep(500);

  // open Games → Chess Tournament
  await page.locator('.icon.folder').filter({ hasText: /^Games$/ }).dblclick();
  await sleep(500);
  const [app] = await Promise.all([context.waitForEvent('page'), page.locator('.icon', { hasText: 'Chess' }).first().dblclick()]);
  app.on('pageerror', (e) => console.log('  [app pageerror]', e.message));
  await app.waitForSelector('iframe', { timeout: 8000 });
  // the abilities acknowledgement now lists the AI ability
  const ackTxt = await app.locator('.perm-box', { hasText: 'would like to' }).textContent().catch(() => '');
  check('the abilities sheet lists the AI ability', /Use your AI|Smartest/i.test(ackTxt), ackTxt.slice(0, 60));
  await app.locator('.perm-box .done', { hasText: 'Confirm' }).click().catch(() => app.locator('.perm-modal .done').click().catch(() => {}));

  const frame = app.frames().find((f) => f !== app.mainFrame());
  await frame.waitForSelector('#view', { timeout: 6000 });

  // Seed a started tournament with me (White) to move, then open the board.
  const meId = await frame.evaluate(async () => (await gifos.me()).id);
  await frame.evaluate(async (meId) => {
    const START = 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR';
    const m = { id: 'm1', a: { id: meId, name: 'You' }, b: { id: 'bot', name: 'Bot' }, board: START, turn: 'w', winner: null, clock: null };
    const T = { id: 't', players: [{ id: meId, name: 'You' }, { id: 'bot', name: 'Bot' }], started: true, rounds: [[m]], round: 0, settings: { clock: 'none', shuffle: false } };
    await gifos.db('chess').put(T);
  }, meId);

  await frame.waitForSelector('.match', { timeout: 6000 });
  await frame.click('.match');
  await frame.waitForSelector('.board', { timeout: 6000 });
  check('the Hint button is present on the player’s turn', (await frame.locator('.hintbar button').count()) === 1);

  await frame.click('.hintbar button');
  // the suggestion resolves and highlights a from/to on the board
  await frame.waitForSelector('.sq.hintt', { timeout: 8000 }).catch(() => {});
  const hintedFrom = await frame.locator('.sq.hintf').count();
  const hintedTo = await frame.locator('.sq.hintt').count();
  check('the hinted move is highlighted on the board', hintedFrom === 1 && hintedTo === 1, 'from=' + hintedFrom + ' to=' + hintedTo);
  const why = await frame.locator('.hintbar .why').textContent().catch(() => '');
  check('the hint shows the move and a reason', /Suggested:/.test(why) && /principled|option|move|—/i.test(why), why);

  await app.close();
  await browser.close();
  console.log(failures ? ('\n' + failures + ' FAILURE(S)') : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
