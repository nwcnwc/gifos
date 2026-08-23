// Pack apps/math-race/ into site/apps/math-race/math-race.gif.
// Uses the SAME codec the GifOS desktop uses (site/js/gifos-gif.js).
//
// Node 18: CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/math-race/build.mjs
import { mathRaceIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

// Node 18's CompressionStream rejects 'deflate-raw' (the format gifos-gif.js
// uses). Node 20+ is fine. Buffer the payload and deflateRaw at flush — the
// encoder is not a streaming compressor anyway.
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

for (const need of ['vendor/COPYING-math-race.txt', 'race.js', 'app.js', 'style.css', 'index.html']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('math-race has no network path');
if (manifest.capabilities.wasm) throw new Error('do not declare wasm — the generator is plain JS');
if (manifest.capabilities.pointer) throw new Error('do not declare pointer');
if (manifest.appId !== 'math-race') throw new Error('appId must be math-race');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private');
}
if (!manifest.data.match || manifest.data.match.visibility !== 'read-write') {
  throw new Error('manifest.data.match must be read-write — the shared round has to sync');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('manifest.data.players must be read-write — live rows have to sync');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — this is an unofficial port');
}
if (listing.basedOn.name !== 'math-race' || listing.basedOn.url !== 'https://github.com/iloire/math-race') {
  throw new Error('listing.basedOn must name iloire/math-race');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || listing.author.name !== 'iloire' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is iloire, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Games' || listing.categories[1] !== 'Learning') {
  throw new Error('listing.categories must be Games + Learning');
}
if (listing.releaseDate !== '2026-08-23') throw new Error('listing.releaseDate must be 2026-08-23');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/math-race') {
  throw new Error('listing.homepage must be the gifos tree');
}
if (listing.tagline.length > 120) throw new Error('tagline is over 120 chars');
if (listing.cover !== 'screenshot.png') throw new Error('listing.cover must be screenshot.png');

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'gifos.fetch', 'CORS', 'COOP', 'Argon2', 'CDN', 'Node', 'socket.io', 'Knockout', 'React', 'localStorage']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'race.js': read('race.js'),
  'app.js': read('app.js'),
  'COPYING-math-race.txt': read('vendor/COPYING-math-race.txt'),
};

const html = files['index.html'];
if (!html.includes('src="race.js"')) throw new Error('index.html does not load race.js');
if (!html.includes('src="app.js"')) throw new Error('index.html does not load app.js');
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type\s*=\s*["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — the runtime drops that, so the app would never boot.');
}
if (/(?:src|href)\s*=\s*["']https?:/i.test(html)) {
  throw new Error('index.html loads a remote URL — nothing may be fetched.');
}
if (html.includes('id="invite"')) throw new Error('Invite is OS chrome — do not draw a share button');
if (!html.includes('Invite')) throw new Error('tell the player to press Invite');

for (const n of ['race.js', 'app.js']) {
  const s = files[n];
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
}
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
  if (files['race.js'].includes(bad) || files['app.js'].includes(bad)) {
    throw new Error('packed JS uses ' + bad + ' — nothing leaves this tab.');
  }
}
if (files['app.js'].includes('cdn.') || files['index.html'].includes('http://') || /https:\/\//.test(files['index.html'])) {
  throw new Error('do not load anything from the network — vendor everything');
}
if (files['app.js'].includes('localStorage')) {
  throw new Error('no localStorage — gifos.db only');
}
if (!files['app.js'].includes('Invite') || files['app.js'].includes('id="invite"')) {
  throw new Error('Invite is OS chrome — tell the player to press it, do not draw a share button');
}
if (!files['COPYING-math-race.txt'].includes('Iván Loire') && !files['COPYING-math-race.txt'].includes('Ivan Loire')) {
  throw new Error('COPYING-math-race.txt is not iloire\'s MIT notice');
}

// Sanity: equation generator + scoring. Easy is the original 0–20 ±.
{
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(files['race.js'], ctx);
  const MR = ctx.MathRace;
  if (!MR) throw new Error('race.js must export MathRace on the global');
  const rng = MR.seedFrom(1);
  const easy = [];
  for (let i = 0; i < 40; i++) easy.push(MR.make('easy', rng));
  if (!easy.every((e) => e.op === '+' || e.op === '-')) throw new Error('easy must be +/− only');
  if (!easy.every((e) => e.a >= 0 && e.a <= 20 && e.b >= 0 && e.b <= 20)) {
    throw new Error('easy operands must be 0–20 (original Operation())');
  }
  if (!easy.every((e) => e.solution === MR.apply(e.a, e.op, e.b))) throw new Error('easy solution drifted');
  if (!easy.some((e) => e.op === '+') || !easy.some((e) => e.op === '-')) throw new Error('easy should mix + and −');

  const medRng = MR.seedFrom(2);
  const med = [];
  for (let i = 0; i < 20; i++) med.push(MR.make('medium', medRng));
  if (!med.every((e) => e.op === '×' || e.op === '*')) throw new Error('medium must be ×');
  if (!med.every((e) => e.solution === e.a * e.b)) throw new Error('medium product is wrong');

  const hardRng = MR.seedFrom(3);
  const hard = [];
  for (let i = 0; i < 60; i++) hard.push(MR.make('hard', hardRng));
  const hops = {};
  hard.forEach((e) => { hops[e.op] = 1; });
  if (!hops['+'] || !hops['-'] || !hops['×']) throw new Error('hard must mix +, −, ×');

  if (MR.parseAnswer('13') !== 13) throw new Error('parse 13');
  if (MR.parseAnswer('−4') !== -4 && MR.parseAnswer('-4') !== -4) throw new Error('parse minus');
  if (MR.parseAnswer('') != null) throw new Error('parse empty');
  const sample = MR.make('easy', MR.seedFrom(9));
  if (!MR.isCorrect(sample, sample.solution)) throw new Error('isCorrect true');
  if (MR.isCorrect(sample, sample.solution + 1)) throw new Error('isCorrect false');

  const w = MR.pickWinner([
    { id: 'b', at: 20 },
    { id: 'a', at: 10 },
    { id: 'c', at: 10 },
  ]);
  if (!w || w.id !== 'a') throw new Error('first correct is earliest at, then lowest id');
}

// Never clobber a real Playwright cover with the procedural fallback.
const shotPath = join(dir, 'screenshot.png');
if (!existsSync(shotPath)) {
  const shot = screenshotPng();
  if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
  if (shot.length < 1000) throw new Error('screenshot png looks empty');
  writeFileSync(shotPath, shot);
  console.log('wrote apps/math-race/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
} else {
  const keep = readFileSync(shotPath);
  if (keep[0] !== 0x89 || keep[1] !== 0x50) throw new Error('screenshot.png is not a PNG');
  if (keep.length < 1000) throw new Error('screenshot.png looks empty');
  console.log('keeping existing screenshot.png —', (keep.length / 1024).toFixed(0), 'KB');
}

const bytes = await gif.encode(files, { preview: mathRaceIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'math-race', 'math-race.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/math-race/math-race.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (generator in-GIF, no network)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
