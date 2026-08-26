// Pack apps/tip-creators/ into site/apps/tip-creators/tip-creators.gif.
// Same codec the GifOS desktop uses (site/js/gifos-gif.js), same doctrine as
// apps/retirement/build.mjs: every promise the listing makes is checked here,
// mechanically, before a byte is written.
//
// Run:  node apps/tip-creators/build.mjs
import { tipIcon, iconInk } from './icon.mjs';
import { creditsJson, CREDITS_PATH } from '../../scripts/app-credits.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

if (manifest.appId !== 'tip-creators') throw new Error('appId must be tip-creators');
if (!manifest.capabilities || manifest.capabilities.pay !== true) {
  throw new Error('manifest must declare capabilities.pay — asking for money is the whole app');
}
// "It remembers nothing about you" rests on these being absent. If a future
// edit adds one, the listing became false and this build must stop.
for (const forbidden of ['network', 'pool', 'api', 'ai', 'camera', 'microphone', 'wasm', 'gpu', 'db', 'multiplayer']) {
  if (manifest.capabilities[forbidden]) {
    throw new Error('tip-creators declares no ' + forbidden + ' — "it remembers nothing" must stay true');
  }
}
// The FIAT payee is DERIVED from the signing identity (payments@gifos.app
// once signed — THE PAYEE RULE, docs/payments.md) and needs no field. The
// CHAIN payee is a field, and for the tip jar it must be the GifOS treasury
// and nothing else — a different address here is someone pointing the tips
// somewhere else, and this build must stop.
const TREASURY = '0x1111111111111111111111111111111111111111'; // Base Sepolia TEST treasury — replace at the mainnet flag day
if (!manifest.pay || manifest.pay.to !== TREASURY) {
  throw new Error('tip-creators manifest.pay.to must be the GifOS treasury (' + TREASURY + ')');
}

// ---- the listing is a promise to the reader ---------------------------------

if (listing.author.name !== 'GifOS') throw new Error('author must be GifOS');
if (listing.basedOn) throw new Error('tip-creators is not a port; remove basedOn');
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (listing.tagline.length > 80) throw new Error('tagline must fit a card: <= 80 chars');
if (!/remembers nothing|no history/i.test(listing.description + ' ' + read('help.md'))) {
  throw new Error('the no-history claim must be stated');
}
if (!/three dollars or more|\$3/i.test(listing.description)) {
  throw new Error('the listing must state the $3 minimum plainly');
}

// ---- the files ---------------------------------------------------------------

for (const need of ['index.html', 'style.css', 'app.js', 'help.md']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'app.js': read('app.js'),
  'help.md': read('help.md'),
};
if (files['help.md'].trim().length < 800) throw new Error('help.md is too thin');
files[CREDITS_PATH] = creditsJson(listing, 'tip-creators');

const html = files['index.html'];
if (!html.includes('src="app.js"')) throw new Error('index.html does not load app.js');
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — this app fetches nothing itself');
}

// The app must never touch money directly, remember anything, or reach out.
// gifos.charge() through the broker is its ONLY power.
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon',
  'eval(', 'new Function(', 'localStorage', 'sessionStorage', 'document.cookie',
  'gifos.db', 'indexedDB']) {
  if (files['app.js'].includes(bad)) throw new Error('app.js uses ' + bad);
}
if (!files['app.js'].includes('gifos.charge(')) throw new Error('app.js never calls gifos.charge — that is the app');
if (!files['app.js'].includes('DECLINED_BY_USER')) {
  throw new Error('app.js must handle a decline as a normal outcome, by name');
}
// The $3 floor the listing promises.
if (!/MIN_USD\s*=\s*3/.test(files['app.js'])) throw new Error('the $3 minimum is a listed promise — keep MIN_USD = 3');

// ---- the icon has to have something in it, in every frame --------------------
{
  const ink = iconInk();
  if (ink.worst < 0.24) {
    throw new Error('the icon is nearly empty in at least one frame ('
      + (ink.worst * 100).toFixed(1) + '% ink) — it must never fall below 24%');
  }
  if (ink.best > 0.75) {
    throw new Error('the icon is a solid block (' + (ink.best * 100).toFixed(1) + '% ink)');
  }
  console.log('icon ink ' + (ink.worst * 100).toFixed(1) + '-' + (ink.best * 100).toFixed(1)
    + '% over ' + ink.frames + ' frames');
}

const bytes = await gif.encode(files, { preview: tipIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'tip-creators', 'tip-creators.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/tip-creators/tip-creators.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
