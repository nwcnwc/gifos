// Pack apps/breaklock/ into site/apps/breaklock/breaklock.gif.
// Uses the SAME codec the GifOS desktop uses (site/js/gifos-gif.js).
//
// Run:  node apps/breaklock/build.mjs
import { breaklockIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

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
await import('../../site/js/gifos-gif.js');

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

const VENDOR = [
  'vendor/pattern.js',
  'vendor/pattern-svg.js',
  'vendor/dom.js',
  'vendor/color.js',
  'vendor/lock.js',
  'vendor/quotes.js',
  'vendor/COPYING-breaklock.txt',
];
for (const need of VENDOR) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('breaklock has no network path');
if (manifest.appId !== 'breaklock') throw new Error('appId must be breaklock');
if (!manifest.data || manifest.data.prefs.visibility !== 'private') {
  throw new Error('manifest.data.prefs must be private');
}
if (!manifest.data.match || manifest.data.match.visibility !== 'read-write') {
  throw new Error('manifest.data.match must be read-write');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('manifest.data.players must be read-write');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false');
}
if (listing.basedOn.name !== 'BreakLock' ||
    listing.basedOn.url !== 'https://github.com/maxwellito/breaklock') {
  throw new Error('listing.basedOn must name maxwellito/breaklock');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || listing.author.name !== 'maxwellito' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is maxwellito, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Games') {
  throw new Error('listing.categories must start with Games');
}
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/breaklock') {
  throw new Error('listing.homepage must be the gifos tree');
}
if (listing.tagline.length > 120) throw new Error('tagline is over 120 chars');
if (/Send the Invite in the bar above(?! the app)/.test(listing.description)) {
  throw new Error('listing must say Invite is in the bar above the app, not the store chrome');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const SCRIPTS = [
  'vendor/dom.js', 'vendor/color.js', 'vendor/pattern.js',
  'vendor/pattern-svg.js', 'vendor/lock.js', 'vendor/quotes.js',
  'net.js', 'boot.js'
];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/dom.js': read('vendor/dom.js'),
  'vendor/color.js': read('vendor/color.js'),
  'vendor/pattern.js': read('vendor/pattern.js'),
  'vendor/pattern-svg.js': read('vendor/pattern-svg.js'),
  'vendor/lock.js': read('vendor/lock.js'),
  'vendor/quotes.js': read('vendor/quotes.js'),
  'net.js': read('net.js'),
  'boot.js': read('boot.js'),
  'COPYING-breaklock.txt': read('vendor/COPYING-breaklock.txt'),
};

if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');
files['help.md'] = read('help.md');
if (files['help.md'].trim().length < 400) throw new Error('help.md is too short');

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type\s*=\s*["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — classic scripts only');
}
if (/(?:src|href)\s*=\s*["']https?:/i.test(html)) {
  throw new Error('index.html loads a remote URL');
}
if (/href\s*=\s*["']#/.test(html)) {
  throw new Error('index.html has href="#"');
}
if (html.includes('id="invite"')) throw new Error('Invite is OS chrome');

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — classic scripts only');
  }
}
for (const n of ['boot.js', 'net.js', 'vendor/lock.js', 'vendor/pattern.js']) {
  const s = files[n];
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
  if (s.includes('location.hash') || s.includes('location.replace') || s.includes('location.href')) {
    throw new Error(n + ' must not navigate');
  }
}
if (!files['boot.js'].includes('prefs') || !files['net.js'].includes('players')) {
  throw new Error('must persist prefs and publish players');
}
if (!files['COPYING-breaklock.txt'].includes('maxwellito')) {
  throw new Error('COPYING-breaklock.txt is not maxwellito\'s MIT notice');
}

{
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(files['vendor/pattern.js'], ctx);
  const P = ctx.BreakLockPattern;
  if (!P) throw new Error('pattern.js must export BreakLockPattern');
  const secret = P.fromSuite([0, 1, 2, 5]);
  const exact = secret.compare(P.fromSuite([0, 1, 2, 5]));
  if (exact[0] !== 4 || exact[1] !== 0 || exact[2] !== 0) {
    throw new Error('exact compare must be [4,0,0], got ' + JSON.stringify(exact));
  }
  const shuffled = secret.compare(P.fromSuite([5, 2, 1, 0]));
  if (shuffled[0] !== 0 || shuffled[1] !== 4) {
    throw new Error('all-present wrong-order must be [0,4,*], got ' + JSON.stringify(shuffled));
  }
  const miss = secret.compare(P.fromSuite([0, 3, 6, 7]));
  if (miss[0] !== 1) throw new Error('one good position expected, got ' + JSON.stringify(miss));
  const p = new P(4);
  p.addDot(0); p.addDot(2);
  if (p.suite[0] !== 0 || p.suite[1] !== 1 || p.suite[2] !== 2) {
    throw new Error('median insertion 0→2 must add 1, got ' + JSON.stringify(p.suite));
  }
  const rnd = new P(6);
  rnd.fillRandomly();
  if (rnd.suite.length !== 6) throw new Error('fillRandomly length');
  if (new Set(rnd.suite).size !== 6) throw new Error('fillRandomly unique dots');
  vm.runInContext(files['vendor/color.js'], ctx);
  const g = ctx.BreakLockColor.greydient('66', 'FF', 1);
  if (g.length !== 3) throw new Error('greydient steps');
  vm.runInContext(files['vendor/quotes.js'], ctx);
  const q = ctx.BreakLockQuotes.getQuote(true, 1);
  if (!/Lock found in 1 attempt/.test(q)) throw new Error('success quote');
  const f = ctx.BreakLockQuotes.getQuote(false, 10);
  if (!/didn.t make it/.test(f)) throw new Error('fail quote');
}

{
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(files['net.js'], ctx);
  const vsNext = ctx.window.BreakLockNet && ctx.window.BreakLockNet.vsNext;
  if (typeof vsNext !== 'function') throw new Error('net.js must export vsNext');
  const HANA = 'hana', CLEO = 'cleo';
  const over = { state: 'over', setterId: HANA, round: 1, secret: [0, 1, 2, 5], winnerId: CLEO };
  const cleoSuccess = { screen: 'summary', role: 'crack', ended: true, secret: [0, 1, 2, 5], round: 1 };
  const hanaSuccess = { screen: 'summary', role: 'watch', ended: true, secret: [0, 1, 2, 5], round: 1 };
  if (vsNext(over, CLEO, cleoSuccess) !== null) throw new Error('cracker on Success stays until YOUR TURN_');
  if (vsNext(over, HANA, hanaSuccess) !== null) throw new Error('setter on Success stays until YOUR TURN_');
  const passed = { state: 'setting', setterId: CLEO, round: 2, secret: [], difficulty: 4 };
  if (vsNext(passed, CLEO, cleoSuccess) !== 'set') {
    throw new Error('YOUR TURN_ must take the cracker off Success to draw, got ' + vsNext(passed, CLEO, cleoSuccess));
  }
  if (vsNext(passed, HANA, hanaSuccess) !== 'wait') {
    throw new Error('setter after YOUR TURN_ waits, got ' + vsNext(passed, HANA, hanaSuccess));
  }
  const hanaWaiting = { screen: 'game', role: 'crack', ended: false, secret: null, round: 2 };
  if (vsNext(passed, HANA, hanaWaiting) !== null) throw new Error('already waiting is a no-op');
  const cleoDrawing = { screen: 'game', role: 'set', ended: false, secret: null, round: 2 };
  if (vsNext(passed, CLEO, cleoDrawing) !== null) throw new Error('already drawing is a no-op');
  const playing = { state: 'playing', setterId: CLEO, round: 2, secret: [0, 3, 6, 7] };
  if (vsNext(playing, HANA, hanaWaiting) !== 'crack') throw new Error('waiter must crack once the secret is set');
  if (vsNext(playing, CLEO, cleoDrawing) !== 'watch') throw new Error('setter watches once the secret is set');
  if (files['boot.js'].includes("G.screen !== 'summary'")) {
    throw new Error('summary must not block vsNext — that was the stuck-Success bug');
  }
  if (!files['boot.js'].includes('enterWait') || !files['boot.js'].includes('vsNext')) {
    throw new Error('boot.js must drive screens from vsNext / enterWait');
  }
}

const help = files['help.md'];
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'localStorage']) {
  if (help.includes(bad)) throw new Error('help.md mentions ' + bad);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
if (shot.length < 1000) throw new Error('screenshot png looks empty');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: breaklockIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'breaklock', 'breaklock.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/breaklock/breaklock.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('wrote apps/breaklock/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
