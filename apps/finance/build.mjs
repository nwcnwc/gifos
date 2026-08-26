// Pack apps/finance/ into site/apps/finance/finance.gif.
// Same codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed, so one commit
// can only produce one GIF.
//
// Run:  node apps/finance/build.mjs
import { financeIcon, iconInk } from './icon.mjs';
import { creditsJson, CREDITS_PATH } from '../../scripts/app-credits.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

// Node 18's CompressionStream rejects 'deflate-raw'. Node 20+ is fine.
{
  const Orig = globalThis.CompressionStream;
  globalThis.CompressionStream = class CompressionStream {
    constructor(format) {
      if (format !== 'deflate-raw') {
        if (Orig) return new Orig(format);
        throw new TypeError('unsupported format ' + format);
      }
      const chunks = [];
      const ts = new TransformStream({
        transform(chunk) { chunks.push(Buffer.from(chunk)); },
        flush(controller) { controller.enqueue(new Uint8Array(deflateRawSync(Buffer.concat(chunks)))); }
      });
      this.readable = ts.readable;
      this.writable = ts.writable;
    }
  };
}
await import('../../site/js/gifos-gif.js'); // attaches globalThis.GifOS.gif

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

// ---- the manifest is a promise to the store ---------------------------------

if (manifest.appId !== 'finance') throw new Error('appId must be finance');
// The handoff build. This app's whole point is handing the plan to the
// Retirement Calculator, and gifos.handoff does not exist before this.
if (manifest.minBuild !== 2087) {
  throw new Error('minBuild must be 2087 — the build gifos.handoff shipped in (docs/app-handoff.md)');
}
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db — the accounts ARE the app');
}
if (!Array.isArray(manifest.capabilities.api) || manifest.capabilities.api[0] !== 'simplefin') {
  throw new Error('manifest must declare capabilities.api ["simplefin"]');
}
/* THE PRIVACY CLAIM IS MECHANICAL. The listing says nothing is uploaded, and
 * the only thing that makes that true is the absence of every other way out.
 * capabilities.api is the ONE exception and it is not a hole: the runtime pins
 * a keyed API to its own configured host and never lets the app see the key.
 * A `network` host would be a hole, and this is the file that must refuse it. */
for (const forbidden of ['network', 'pool', 'ai', 'camera', 'microphone', 'motion', 'wasm', 'gpu', 'agent']) {
  if (manifest.capabilities[forbidden]) {
    throw new Error('finance declares no ' + forbidden + ' — "nothing is uploaded" must stay true, and a '
      + forbidden + ' declaration on an app holding someone\'s whole financial life is not a thing to add quietly');
  }
}
for (const coll of ['accounts', 'ledger', 'snapshots', 'prefs']) {
  if (!manifest.data || !manifest.data[coll] || manifest.data[coll].visibility !== 'private') {
    throw new Error(coll + ' must be private — an invite link must never carry somebody\'s balances');
  }
}
if (manifest.capabilities.multiplayer) {
  throw new Error('finance is deliberately NOT multiplayer: there is no version of "share my accounts live" that is a good default');
}
if (!manifest.handoff || (manifest.handoff.offers || []).indexOf('finance.plan') < 0) {
  throw new Error('manifest must declare handoff.offers ["finance.plan"]');
}
if (manifest.handoff.takes) throw new Error('finance produces the plan; it does not consume one');

// ---- the listing is a promise to the reader ---------------------------------

if (listing.author.name !== 'GifOS') throw new Error('author must be GifOS — this is original work');
if (listing.basedOn) throw new Error('finance is not a port; remove basedOn');
if (listing.releaseDate !== '2026-08-25') throw new Error('listing.releaseDate must be 2026-08-25');
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (listing.categories[0] !== 'Productivity') throw new Error('categories must lead with Productivity');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/finance') {
  throw new Error('listing.homepage must be the gifos tree');
}
if (listing.tagline.length > 80) throw new Error('tagline must fit a card: <= 80 chars');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'JSON', 'IndexedDB', 'API key']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}
// The two sentences a reader of a FINANCE app is most likely to assume and be
// wrong about. Both must keep being said.
if (!/does not ask for a password/i.test(listing.description)) {
  throw new Error('the listing must say it does not ask for a bank password — every reader arrives assuming a Mint replacement does');
}
if (!/Nothing is uploaded/i.test(listing.description)) {
  throw new Error('the listing must state the privacy claim plainly');
}

// ---- the files ---------------------------------------------------------------

const SCRIPTS = ['csv.js', 'model.js', 'simplefin.js', 'chart.js', 'app.js'];
for (const need of SCRIPTS.concat(['index.html', 'style.css', 'help.md'])) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'help.md': read('help.md')
};
for (const s of SCRIPTS) files[s] = read(s);
if (files['help.md'].trim().length < 900) throw new Error('help.md is too thin');

// Credits under the seal, so who-made-this survives a Save and a stolen copy.
files[CREDITS_PATH] = creditsJson(listing, 'finance');

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — every byte this app runs is inside the GIF');
}
for (const [n, src] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(src)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*export\s|export\s*\{|import\.meta|^\s*import\s/m.test(src)) {
    throw new Error(n + ' uses ESM syntax — the classic-script inline path cannot carry it.');
  }
  // The app reaches the network through gifos.api and NOTHING else. Every one
  // of these would be a second route out of a sandbox holding bank data.
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon',
    'eval(', 'new Function(', 'localStorage', 'sessionStorage', 'document.cookie']) {
    if (src.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
// Account names, descriptions and institution names are all user text, and a
// CSV is the most obvious place for somebody else's markup to arrive.
if (/innerHTML\s*=\s*[^;]*\+/.test(files['app.js'])) {
  throw new Error('app.js builds innerHTML by concatenation — imported text is untrusted, use textContent');
}

// ---- THE SNIFFER HAS TO READ REAL BANKS -------------------------------------
//
// Every fixture below is the SHAPE of a real export: the title block above the
// header, the DEBIT/CREDIT indicator column, the separate debit and credit
// columns, the day-first dates, the decimal comma, the credit card that writes
// a purchase as a positive number. This is the part of the app that is a guess,
// so this is the part with a bar under it — a sniffer regression is silent
// otherwise, and shows up months later as a wrong year of spending.

const sandbox = { console, Math, JSON, Object, Array, Number, String, Boolean, Date, isFinite, parseFloat, parseInt, Infinity };
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const s of ['csv.js', 'model.js']) vm.runInContext(files[s], sandbox, { filename: s });
const C = sandbox.FinCSV, MOD = sandbox.FinModel;

function readFixture(name, text, expect) {
  const p = C.parse(text);
  const sn = C.sniff(p.rows);
  if (!sn.ok) throw new Error(name + ': the sniffer found no date + amount at all');
  const out = C.toTx(sn, Object.assign({}, sn, { flip: expect.flip }));
  const got = out.tx;
  if (got.length !== expect.n) throw new Error(name + ': expected ' + expect.n + ' rows, got ' + got.length);
  if (expect.delim && p.delim !== expect.delim) throw new Error(name + ': delimiter came out ' + JSON.stringify(p.delim));
  if (expect.headerRow !== undefined && sn.headerRow !== expect.headerRow) {
    throw new Error(name + ': header found on line ' + sn.headerRow + ', expected ' + expect.headerRow);
  }
  if (expect.order && sn.dateOrder !== expect.order) {
    throw new Error(name + ': dates read as ' + sn.dateOrder + ', expected ' + expect.order);
  }
  if (expect.ambiguous !== undefined && sn.dateAmbiguous !== expect.ambiguous) {
    throw new Error(name + ': ambiguity reported as ' + sn.dateAmbiguous + ', expected ' + expect.ambiguous);
  }
  expect.rows.forEach(([i, date, amount, descPart]) => {
    const t = got[i];
    if (t.date !== date) throw new Error(name + ' row ' + i + ': date ' + t.date + ', expected ' + date);
    if (Math.abs(t.amount - amount) > 0.005) throw new Error(name + ' row ' + i + ': amount ' + t.amount + ', expected ' + amount);
    if (descPart && t.desc.indexOf(descPart) < 0) throw new Error(name + ' row ' + i + ': description "' + t.desc + '" is missing "' + descPart + '"');
  });
  console.log('  ✓', name, '—', got.length, 'rows,', sn.dateOrder, sn.dateAmbiguous ? '(ambiguous)' : '');
  return { sn, got };
}

console.log('CSV dialects:');

// A title block above the header, quoted thousands, a running balance.
readFixture('title block above the header',
  'Description,,Summary Amt.\nBeginning balance as of 07/01/2026,,"1,234.56"\n\n' +
  'Date,Description,Amount,Running Bal.\n' +
  '07/02/2026,"CHECKCARD 0701 WHOLE FOODS #123",-84.21,"1,150.35"\n' +
  '07/05/2026,"PAYROLL DES:DIRECT DEP",\"3,200.00\",\"4,350.35\"\n',
  { n: 2, headerRow: 3, order: 'mdy', ambiguous: true,
    rows: [[0, '2026-07-02', -84.21, 'WHOLE FOODS'], [1, '2026-07-05', 3200, 'PAYROLL']] });

// An Amount column of magnitudes whose sign lives in a DEBIT/CREDIT column.
readFixture('sign in a separate type column',
  'Details,Posting Date,Description,Amount,Type,Balance\n' +
  'DEBIT,07/14/2026,SHELL OIL 574,58.02,DEBIT,2412.88\n' +
  'CREDIT,07/15/2026,ACME CORP PAYROLL,2810.44,CREDIT,5223.32\n',
  // 07/14 and 07/15 have a second part over 12, which PROVES month-first —
  // so there is nothing to report here, and reporting it would be noise.
  { n: 2, order: 'mdy', ambiguous: false,
    rows: [[0, '2026-07-14', -58.02, 'SHELL'], [1, '2026-07-15', 2810.44, 'PAYROLL']] });

// Separate Debit and Credit columns, both positive, one filled per row.
readFixture('separate debit and credit columns',
  'Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit\n' +
  '2026-07-02,2026-07-03,1234,TRADER JOES,Groceries,64.18,\n' +
  '2026-07-09,2026-07-09,1234,PAYMENT THANK YOU,Payment,,500.00\n',
  { n: 2, order: 'iso', ambiguous: false,
    rows: [[0, '2026-07-02', -64.18, 'TRADER'], [1, '2026-07-09', 500, 'PAYMENT']] });

// Day-first dates, PROVEN by a day over 12 — no ambiguity to report.
readFixture('day-first dates, proven by the data',
  'Date,Description,Amount,Balance\n' +
  '23/07/2026,TESCO STORES 3421,-42.60,880.10\n' +
  '25/07/2026,SALARY,2100.00,2980.10\n',
  { n: 2, order: 'dmy', ambiguous: false,
    rows: [[0, '2026-07-23', -42.6, 'TESCO'], [1, '2026-07-25', 2100, 'SALARY']] });

// Semicolons and a decimal comma. Read as commas this is 1 thousand 234.
readFixture('semicolons and a decimal comma',
  'Buchungstag;Verwendungszweck;Betrag\n' +
  '15.07.2026;REWE MARKT;-1.234,56\n' +
  '31.07.2026;GEHALT;3.000,00\n',
  { n: 2, delim: ';', order: 'dmy', ambiguous: false,
    rows: [[0, '2026-07-15', -1234.56, 'REWE'], [1, '2026-07-31', 3000, 'GEHALT']] });

// A card written from the card's point of view: a purchase is POSITIVE.
{
  const { got } = readFixture('a card written backwards',
    'Date,Description,Amount\n' +
    '07/02/2026,UNITED AIRLINES,412.30\n' +
    '07/03/2026,WHOLE FOODS MKT,88.12\n' +
    '07/04/2026,SHELL OIL,51.90\n' +
    '07/06/2026,STARBUCKS,6.45\n' +
    '07/06/2026,AMAZON MKTPLACE,23.99\n' +
    '07/07/2026,AUTOPAY PAYMENT,-418.75\n',
    { n: 6, rows: [[0, '2026-07-02', 412.3, 'UNITED']] });
  if (!C.looksInverted(got)) throw new Error('looksInverted must catch a card written backwards — it is what raises the warning');
  const flipped = C.toTx(C.sniff(C.parse('Date,Description,Amount\n07/02/2026,UNITED AIRLINES,412.30\n').rows), { flip: true, cols: { date: 0, desc: 1, amount: 2 }, dateOrder: 'mdy', decimal: '.' });
  if (flipped.tx[0].amount !== -412.3) throw new Error('the flip control must turn the sign over');
}

// Parentheses for negative, a currency symbol, a trailing minus.
if (C.parseMoney('($1,234.56)', '.') !== -1234.56) throw new Error('parentheses must mean negative');
if (C.parseMoney('1234.56-', '.') !== -1234.56) throw new Error('a trailing minus must mean negative');
if (C.parseMoney('€ 1.234,56', ',') !== 1234.56) throw new Error('decimal comma with a symbol must parse');
if (C.parseMoney('', '.') !== null) throw new Error('an empty cell is not zero');
if (C.parseMoney('0.00', '.') !== 0) throw new Error('zero is zero');

// A file that stitches both date orders together is unreadable, and must SAY so
// rather than pick one.
{
  const sn = C.sniff(C.parse('Date,Description,Amount\n23/07/2026,A,-1\n07/23/2026,B,-1\n').rows);
  if (!sn.dateConflict) throw new Error('a file with both date orders in it must be reported as a conflict');
}

// ---- and the model has to be right about transfers --------------------------

console.log('Model:');
{
  const accts = [
    { id: 'a', kind: 'checking', balance: 5000 },
    { id: 'b', kind: 'brokerage', balance: 180000 },
    { id: 'h', kind: 'property', balance: 400000 },
    { id: 'm', kind: 'mortgage', balance: 250000 },
    { id: 'c', kind: 'card', balance: 2000 },
  ];
  const nw = MOD.netWorth(accts);
  if (nw.total !== 333000) throw new Error('net worth came out ' + nw.total + ', expected 333000');
  // A house is not something a retirement plan can spend. If this ever passes
  // with 585000 in it, the app is telling somebody they can retire on a house.
  if (nw.pot !== 185000) throw new Error('spendable pot came out ' + nw.pot + ', expected 185000 (cash + brokerage only)');
  if (nw.illiquid !== 400000) throw new Error('illiquid came out ' + nw.illiquid);

  const tx = [];
  // Twelve clean months: 6000 in, 2500 rent out, and 1000 moved to the
  // brokerage each month — which is NOT income and NOT spending.
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    tx.push({ id: 'p' + m, account: 'a', date: '2026-' + mm + '-01', desc: 'PAYROLL', amount: 6000 });
    tx.push({ id: 'r' + m, account: 'a', date: '2026-' + mm + '-15', desc: 'RENT', amount: -2500 });
    tx.push({ id: 'o' + m, account: 'a', date: '2026-' + mm + '-20', desc: 'ONLINE TRANSFER', amount: -1000 });
    tx.push({ id: 'i' + m, account: 'b', date: '2026-' + mm + '-21', desc: 'DEPOSIT', amount: 1000 });
  }
  const xf = MOD.findTransfers(tx);
  if (xf.pairs.length !== 12) throw new Error('expected 12 transfer pairs, found ' + xf.pairs.length);
  const plan = MOD.derivePlan(accts, tx, { age: 45 });
  // 6000 - 2500 = 3500 a month kept. Count the transfer as spending and this
  // reads 42000 spent and 30000 saved: both wrong, in opposite directions.
  if (plan.annualSpend !== 30000) throw new Error('annual spend came out ' + plan.annualSpend + ', expected 30000 — a transfer is being counted as spending');
  if (plan.annualSavings !== 42000) throw new Error('annual savings came out ' + plan.annualSavings + ', expected 42000');
  // ELEVEN, not twelve. The ledger's last row is 21 December, so December is a
  // part month and is excluded — which is the guard working, not a fault. The
  // yearly figures are unchanged because every month here is identical.
  if (plan.basis.months !== 11) throw new Error('basis months came out ' + plan.basis.months + ', expected 11 (December is a part month)');
  console.log('  ✓ 11 complete months, 12 transfers excluded → spend', plan.annualSpend, 'saved', plan.annualSavings);

  // Under three complete months it must REFUSE rather than extrapolate.
  const thin = MOD.derivePlan(accts, tx.slice(0, 8), { age: 45 });
  if (thin.annualSpend !== null || thin.annualSavings !== null) {
    throw new Error('a yearly figure was produced from two months of data');
  }
  if (thin.netWorth !== 333000) throw new Error('the balance sheet is a fact and must still be given');
  console.log('  ✓ refuses a yearly figure under three complete months');

  // Re-importing an overlapping export must add nothing.
  const first = MOD.keyed('a', [
    { date: '2026-07-02', desc: 'COFFEE', amount: -3.5 },
    { date: '2026-07-02', desc: 'COFFEE', amount: -3.5 },
    { date: '2026-07-03', desc: 'RENT', amount: -2500 },
  ]);
  if (first.length !== 3) throw new Error('two identical coffees on one day are two transactions');
  if (first[0].id === first[1].id) throw new Error('two identical rows must get distinct keys');
  const again = MOD.keyed('a', [
    { date: '2026-07-02', desc: 'COFFEE', amount: -3.5 },
    { date: '2026-07-02', desc: 'COFFEE', amount: -3.5 },
    { date: '2026-07-03', desc: 'RENT', amount: -2500 },
  ]);
  const fresh = MOD.newOnly(first.map((t) => t.id), again);
  if (fresh.length !== 0) throw new Error('re-importing the same file added ' + fresh.length + ' rows');
  console.log('  ✓ the same file imported twice adds nothing, and keeps both coffees');
}

/* THE ICON HAS TO HAVE SOMETHING IN IT, IN EVERY FRAME — the rule the
 * Retirement Calculator's icon paid for. See icon.mjs. */
{
  const ink = iconInk();
  if (ink.worst < 0.24) {
    throw new Error('the icon is nearly empty in at least one frame (' + (ink.worst * 100).toFixed(1) + '% ink) — it must never fall below 24%');
  }
  if (ink.best > 0.75) throw new Error('the icon is a solid block (' + (ink.best * 100).toFixed(1) + '% ink)');
  console.log('icon ink ' + (ink.worst * 100).toFixed(1) + '-' + (ink.best * 100).toFixed(1) + '% over ' + ink.frames + ' frames');
}

const bytes = await gif.encode(files, { preview: financeIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'finance', 'finance.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/finance/finance.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
