// Pack apps/retirement/ into site/apps/retirement/retirement.gif.
// Same codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The market data
// is refreshed by hand with tools/fetch-market-data.py, never by this script —
// a build that reaches the network is a build that can produce two different
// GIFs from one commit.
//
// Run:  node apps/retirement/build.mjs
import { retirementIcon } from './icon.mjs';
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
        flush(controller) {
          controller.enqueue(new Uint8Array(deflateRawSync(Buffer.concat(chunks))));
        }
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

if (manifest.appId !== 'retirement') throw new Error('appId must be retirement');
if (manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947 — this app needs nothing newer than the store itself.');
}
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db — plans are saved');
}
if (manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.multiplayer — one Invite shares the plans');
}
// The whole privacy claim in the listing rests on these being absent. If a
// future edit adds a host, the claim becomes false and this build must stop.
for (const forbidden of ['network', 'pool', 'api', 'ai', 'camera', 'microphone', 'wasm', 'gpu']) {
  if (manifest.capabilities[forbidden]) {
    throw new Error('retirement declares no ' + forbidden + ' — "nothing leaves your computer" must stay true');
  }
}
if (!manifest.data || manifest.data.scenarios.visibility !== 'read-write') {
  throw new Error('scenarios must be read-write, or an Invite shares nothing');
}
if (manifest.data.prefs.visibility !== 'private') {
  throw new Error('prefs must be private — a guest keeps their own view');
}

// ---- the listing is a promise to the reader ---------------------------------

if (listing.author.name !== 'GifOS') throw new Error('author must be GifOS — this is original work');
if (listing.basedOn) throw new Error('retirement is not a port; remove basedOn');
if (listing.releaseDate !== '2026-08-25') throw new Error('listing.releaseDate must be 2026-08-25');
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (listing.categories[0] !== 'Productivity') throw new Error('categories must lead with Productivity');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/retirement') {
  throw new Error('listing.homepage must be the gifos tree');
}
if (listing.tagline.length > 80) throw new Error('tagline must fit a card: <= 80 chars');

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'JSON', 'IndexedDB']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}
// The listing says it does not do tax. It had better keep saying so: that is
// the single most likely thing for a reader to assume and be wrong about.
if (!/does not work out your tax/i.test(listing.description)) {
  throw new Error('the listing must say it does not do tax — every free tool in this category omits it, and readers assume otherwise');
}
if (!/nothing sent anywhere|leaves your computer/i.test(listing.description)) {
  throw new Error('the listing must state the privacy claim plainly');
}

// ---- the files ---------------------------------------------------------------

const SCRIPTS = ['data/market.js', 'data/mortality.js', 'sim.js', 'chart.js', 'advice.js', 'app.js'];

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

if (files['help.md'].trim().length < 800) throw new Error('help.md is too thin');

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — this app fetches nothing, ever');
}

// Nothing in the shipped code may reach the network or evaluate a string. This
// is the mechanical half of the privacy claim; the manifest check above is the
// other half.
for (const [n, src] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(src)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*export\s|export\s*\{|import\.meta|^\s*import\s/m.test(src)) {
    throw new Error(n + ' uses ESM syntax — the classic-script inline path cannot carry it.');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon',
    'eval(', 'new Function(', 'localStorage', 'sessionStorage', 'document.cookie']) {
    if (src.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}

// A scenario name is user text and must never be concatenated into markup.
if (/innerHTML\s*=\s*[^;]*\+/.test(files['app.js'])) {
  throw new Error('app.js builds innerHTML by concatenation — plan names are user text, use textContent');
}

// ---- the data has to be the real record --------------------------------------

const sandbox = { console, Math, JSON, Object, Array, Number, String, Boolean, Date, isFinite, parseFloat, parseInt, Float64Array, Uint8Array, Infinity };
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const s of ['data/market.js', 'data/mortality.js', 'sim.js', 'advice.js']) {
  vm.runInContext(files[s], sandbox, { filename: s });
}
const M = sandbox.MARKET, S = sandbox.RetireSim;

{
  // The published couple-survival figures. If these drift, the second-most
  // important sentence in the app has quietly become false.
  const L = sandbox.MORTALITY;
  if (!L || L.from !== 30) throw new Error('mortality table missing or re-based');
  const one = S.survival(65, 90, 'couple');
  if (Math.abs(one - 0.506) > 0.01) {
    throw new Error('a 65/65 couple reaching 90 came out ' + (one * 100).toFixed(1) + '%, published 50.6%');
  }
  const m90 = S.survival(65, 90, 'm');
  if (Math.abs(m90 - 0.241) > 0.01) {
    throw new Error('a 65-year-old man reaching 90 came out ' + (m90 * 100).toFixed(1) + '%, published 24.1%');
  }
}

if (M.start[0] !== 1871 || M.start[1] !== 1) throw new Error('market data must begin 1871-01');
if (M.months !== M.stock.length || M.months !== M.bond.length || M.months !== M.cpi.length) {
  throw new Error('market series lengths disagree');
}
if (M.months < 1860) throw new Error('market data is suspiciously short: ' + M.months + ' months');
{
  const yrs = (M.months - 1) / 12;
  const sCagr = Math.pow(M.stock[M.months - 1], 1 / yrs) - 1;
  const bCagr = Math.pow(M.bond[M.months - 1], 1 / yrs) - 1;
  // Real total return, 150+ years. If either of these drifts out of range the
  // data is not what it claims to be — most likely price-only instead of total
  // return, which would silently delete two thirds of the growth.
  if (sCagr < 0.06 || sCagr > 0.08) throw new Error('stock real CAGR ' + (sCagr * 100).toFixed(2) + '% is not plausible');
  if (bCagr < 0.015 || bCagr > 0.035) throw new Error('bond real CAGR ' + (bCagr * 100).toFixed(2) + '% is not plausible');
}

// The 4% rule, as the Trinity Study and Bengen define it. If a change to the
// engine moves this, it is the engine that is wrong.
{
  const plan = {
    currentAge: 65, retireAge: 65, endAge: 95, portfolio: 1000000,
    annualSavings: 0, annualSpend: 40000, stocks: 0.75, fees: 0,
    strategy: 'constant', percentRate: 0.04, incomes: [], events: [],
    mode: 'history', target: 0.95
  };
  const o = S.runAll(plan);
  if (o.cycles < 1400) throw new Error('expected 1400+ 30-year cycles, got ' + o.cycles);
  if (o.successRate < 0.94 || o.successRate > 1) {
    throw new Error('4% over 30 years at 75/25 came out ' + (o.successRate * 100).toFixed(1) + '% — the literature says mid-to-high 90s');
  }
  const worstRetired = S.monthName(o.worst.startIdx + o.worst.retireYear * 12);
  if (!/1965|1966|1967|1968|1969/.test(worstRetired)) {
    throw new Error('the worst 30-year cohort came out ' + worstRetired + ' — history says the mid-1960s');
  }
  console.log('4% / 30y / 75-25 →', (o.successRate * 100).toFixed(1) + '% over', o.cycles,
              'cycles; worst cohort', worstRetired);
}

const bytes = await gif.encode(files, { preview: retirementIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'retirement', 'retirement.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/retirement/retirement.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
