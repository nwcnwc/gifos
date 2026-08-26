/*
 * Drive the app in a real browser and photograph it.
 *
 *   python3 -m http.server 8077 -d apps/finance
 *   node apps/finance/tools/shot.js                # desktop, dark
 *   node apps/finance/tools/shot.js --phone
 *   node apps/finance/tools/shot.js --cover        # the store master
 *
 * The app is SEEDED through window.FinanceApp with a plausible set of
 * accounts and a year of transactions, then painted by the real code. Nothing
 * here composes an image: every number in the picture was worked out by
 * model.js from the rows below, which is why the picture cannot drift away
 * from what the app actually does.
 *
 * Anything the page logs, throws or fails to fetch is printed — a silent
 * screenshot of a broken app is the failure this exists to prevent.
 */
const { chromium } = require('../../../test/lib/pw');
const path = require('path');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const PHONE = has('--phone');
const COVER = has('--cover');
const APP = process.env.APP_BASE || 'http://127.0.0.1:8077';
const VIEW = val('--view', COVER ? 'accounts' : 'accounts');
const OUT = path.resolve(val('--out', COVER
  ? path.join(__dirname, '..', 'screenshot.png')
  : path.join('/tmp', 'finance' + (PHONE ? '-phone' : '') + '.png')));

/* THE COVER IS SHOT CLOSE, AND LIGHT.
 *
 * The store card is 248px wide, so what decides whether anything reads is the
 * ratio of CSS pixels to card pixels — deviceScaleFactor only adds sharpness
 * to something still too small. A full 1400px desktop shot is a 5.6x reduction
 * and the card is mush.
 *
 * So the cover is 760 wide and clipped to the part of this app that is worth
 * leading with: the big net worth figure, the coloured bar that says what it
 * is made of, and the first few account rows with real institution names. That
 * is the whole pitch — one page that knows where all of it is — and it is
 * legible at a 3x reduction because the number is 34px and the bar is four
 * flat saturated masses.
 *
 * Light, because the store's own cards sit on a light page and a dark cover
 * reads as a hole in the grid.
 */
const SEED = {
  accounts: [
    { id: 'a1', name: 'Adv Plus Banking', institution: 'Bank of America', kind: 'checking', balance: 8420, balanceDate: '2026-08-24', url: 'https://www.bankofamerica.com' },
    { id: 'a2', name: 'Online Savings', institution: 'Ally', kind: 'savings', balance: 32100, balanceDate: '2026-08-24' },
    { id: 'a3', name: 'Brokerage', institution: 'Fidelity', kind: 'brokerage', balance: 214860, balanceDate: '2026-08-25' },
    { id: 'a4', name: '401(k)', institution: 'Vanguard', kind: 'retirement', balance: 386400, balanceDate: '2026-08-25' },
    { id: 'a5', name: 'The house', institution: '', kind: 'property', balance: 615000, balanceDate: '2026-07-01' },
    { id: 'a6', name: 'Outback', institution: '', kind: 'vehicle', balance: 18500, balanceDate: '2026-07-01' },
    { id: 'a7', name: 'Sapphire Preferred', institution: 'Chase', kind: 'card', balance: 2380, balanceDate: '2026-08-25' },
    { id: 'a8', name: 'The mortgage', institution: 'Rocket', kind: 'mortgage', balance: 341200, balanceDate: '2026-08-01' },
  ],
  tx: [],
  snaps: [],
};
// A year of it: salary in, rent and living out, a monthly move to the
// brokerage that must NOT read as spending.
for (let m = 0; m < 14; m++) {
  const d = new Date(Date.UTC(2025, 6 + m, 1));
  const mm = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  SEED.tx.push({ id: 'p' + m, account: 'a1', date: mm + '-01', desc: 'ACME CORP DES:PAYROLL', amount: 9120 });
  SEED.tx.push({ id: 'r' + m, account: 'a1', date: mm + '-03', desc: 'MORTGAGE PAYMENT', amount: -2810 });
  SEED.tx.push({ id: 'g' + m, account: 'a1', date: mm + '-11', desc: 'WHOLE FOODS MKT #123', amount: -742 - (m % 3) * 40 });
  SEED.tx.push({ id: 'u' + m, account: 'a1', date: mm + '-14', desc: 'PG&E WEB ONLINE', amount: -186 });
  SEED.tx.push({ id: 'c' + m, account: 'a7', date: mm + '-18', desc: 'CARD PURCHASES', amount: -1240 - (m % 4) * 90 });
  SEED.tx.push({ id: 'x' + m, account: 'a1', date: mm + '-20', desc: 'ONLINE TRANSFER', amount: -2000 });
  SEED.tx.push({ id: 'y' + m, account: 'a3', date: mm + '-21', desc: 'DEPOSIT', amount: 2000 });
  SEED.snaps.push({ id: 'nw_' + mm, date: mm + '-25', total: 780000 + m * 12400 + (m % 3) * 5200, assets: 1120000 + m * 13000, debts: 344000 - m * 900, pot: 520000 + m * 11000, illiquid: 633500, byGroup: {} });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: PHONE ? { width: 390, height: 844 } : { width: COVER ? 700 : 1240, height: COVER ? 560 : 900 },
    deviceScaleFactor: 2,
  });
  const bad = [];
  page.on('console', (m) => { if (m.type() === 'error') bad.push('console: ' + m.text()); });
  page.on('pageerror', (e) => bad.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => bad.push('failed: ' + r.url()));

  await page.goto(APP + '/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.FinanceApp);
  await page.evaluate(([seed, view, light]) => {
    const A = window.FinanceApp;
    A.state.accounts = seed.accounts;
    A.state.months = {};
    seed.tx.forEach((t) => {
      const k = 'tx_' + t.date.slice(0, 7);
      (A.state.months[k] = A.state.months[k] || []).push(t);
    });
    A.state.tx = seed.tx.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    A.state.snaps = seed.snaps;
    A.state.prefs = { age: 45 };
    A.state.sfReady = true;
    if (light) { A.state.theme = 'light'; A.applyTheme(); }
    A.paintAll();
    A.show(view);
  }, [SEED, VIEW, COVER]);
  await page.waitForTimeout(400);

  if (COVER) {
    // Clip to the pitch: the figure, the bar, and the first accounts.
    await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: 700, height: 437 } });
  } else {
    await page.screenshot({ path: OUT, fullPage: false });
  }
  await browser.close();

  if (bad.length) {
    console.error('THE PAGE WAS NOT HEALTHY:');
    bad.forEach((b) => console.error('  ' + b));
    process.exit(1);
  }
  console.log('wrote ' + OUT);
})();
