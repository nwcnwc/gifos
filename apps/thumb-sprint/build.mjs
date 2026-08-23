// Pack apps/thumb-sprint/ into site/apps/thumb-sprint/thumb-sprint.gif.
// Uses the SAME codec the GifOS desktop uses (site/js/gifos-gif.js).
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/thumb-sprint/build.mjs
import { thumbSprintIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('thumb-sprint has no network path');
if (manifest.capabilities.wasm) throw new Error('do not declare wasm');
if (manifest.capabilities['pointer-lock'] || manifest.capabilities.pointerLock) {
  throw new Error('do not declare pointer-lock');
}
if (manifest.appId !== 'thumb-sprint') throw new Error('appId must be thumb-sprint');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private');
}
if (!manifest.data.race || manifest.data.race.visibility !== 'read-only') {
  throw new Error('manifest.data.race must be read-only — only the host writes the race row');
}
if (!manifest.data.lanes || manifest.data.lanes.visibility !== 'read-write') {
  throw new Error('manifest.data.lanes must be read-write — each racer writes their own row');
}

if (listing.basedOn) throw new Error('listing must not have basedOn — this is an original');
if (listing.porter) throw new Error('listing must not have porter — this is an original');
if (!listing.author || listing.author.name !== 'GifOS') {
  throw new Error('author must be GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Games') {
  throw new Error('listing.categories must start with Games');
}
if (listing.releaseDate !== '2026-08-23') throw new Error('listing.releaseDate must be 2026-08-23');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/thumb-sprint') {
  throw new Error('listing.homepage must be the gifos tree');
}
if (listing.cover !== 'screenshot.png') throw new Error('listing.cover must be screenshot.png');
if (listing.tagline.length > 120) throw new Error('tagline is over 120 chars');
for (const tag of ['race', 'party', 'multiplayer', 'touch', 'offline']) {
  if (!listing.tags || !listing.tags.includes(tag)) throw new Error('listing.tags must include ' + tag);
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'gifos.fetch', 'websocket', 'WebSocket', 'localStorage']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}
if (/\bIO\b/.test(listingBlob)) throw new Error('listing.json mentions IO — keep it non-technical');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'race.js': read('race.js'),
  'app.js': read('app.js'),
};

const html = files['index.html'];
if (!html.includes('src="race.js"')) throw new Error('index.html does not load race.js');
if (!html.includes('src="app.js"')) throw new Error('index.html does not load app.js');
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type\s*=\s*["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — GifOS drops that attribute. Classic scripts only.');
}
if (/(?:src|href)\s*=\s*["']https?:/i.test(html)) {
  throw new Error('index.html loads a remote URL — nothing may be fetched.');
}
if (html.includes('id="invite"')) throw new Error('Invite is OS chrome — do not draw a share button');

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — classic scripts only (runtime drops type=module).');
  }
}
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(', 'pointerLock', 'requestPointerLock']) {
  if (files['app.js'].includes(bad) || files['race.js'].includes(bad)) {
    throw new Error('packed JS uses ' + bad + ' — nothing leaves this tab.');
  }
}
if (files['app.js'].includes('id="invite"')) {
  throw new Error('Invite is OS chrome — do not draw a share button');
}
if (!files['app.js'].includes('lanes') || !files['app.js'].includes('writeRace') && !files['race.js'].includes('writeRace')) {
  throw new Error('must keep host-only race writes and per-lane rows');
}
if (!files['style.css'].includes('#0a0a0f')) throw new Error('dark background must be #0a0a0f');

{
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(files['race.js'], ctx);
  const R = ctx.ThumbSprint;
  if (!R) throw new Error('race.js must export ThumbSprint on the global');
  if (R.finishDistance !== 100) throw new Error('finishDistance must be 100');

  // false-start before startAt is flagged; runner goes back.
  const race = R.freshRace({ host: 'a', startAt: 5000, seed: 7 });
  const lane0 = R.freshLane('a', 'You');
  const fs = R.tap(lane0, race, 4000);
  if (!fs.falseStart) throw new Error('false-start before startAt must be flagged');
  if (fs.position !== 0) throw new Error('false-start must go back to 0');
  if (fs.taps !== 0) throw new Error('false-start must not count the tap');

  // position increases with taps (after go).
  const go = R.freshRace({ host: 'a', startAt: 0, seed: 7 });
  const a1 = R.tap(R.freshLane('a', 'You'), go, 10);
  if (!(a1.position > 0) || a1.taps !== 1) throw new Error('first tap must increase position');
  const a2 = R.tap(a1, go, 20);
  if (!(a2.position > a1.position) || a2.taps !== 2) throw new Error('position must increase with taps');
  if (a1.falseStart || a2.falseStart) throw new Error('taps after startAt are not false starts');

  // first to finishDistance wins.
  const late = { id: 'a', position: 100, finishedAt: 1200 };
  const early = { id: 'b', position: 100, finishedAt: 1100 };
  const short = { id: 'c', position: 80, finishedAt: 0 };
  if (R.winnerOf([late, early, short], R.finishDistance) !== 'b') {
    throw new Error('first to finishDistance (earliest finishedAt) must win');
  }
  if (R.finishOrder([late, early], R.finishDistance)[0] !== 'b') {
    throw new Error('finishOrder must put the nose first');
  }

  // a second racer's row cannot write the race row.
  const hijack = R.writeRace(race, 'b', {
    startAt: 0, seed: 99, host: 'b', finishOrder: ['b'], falseStarts: {}
  });
  if (hijack !== race) throw new Error('guest writeRace must return the same race object');
  if (hijack.startAt !== 5000 || hijack.seed !== 7 || hijack.host !== 'a') {
    throw new Error('a second racer must not mutate the race row');
  }
  if ((hijack.finishOrder || []).length) throw new Error('guest must not set finish order');
  const compiled = R.compile(race, 'b', [{ id: 'b', position: 100, finishedAt: 1, falseStart: true }]);
  if (compiled !== race) throw new Error('guest compile must be refused');
  const ok = R.writeRace(race, 'a', { startAt: 9000 });
  if (ok === race || ok.startAt !== 9000) throw new Error('host must be able to write the race row');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
if (shot.length < 1000) throw new Error('screenshot png looks empty');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: thumbSprintIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'thumb-sprint', 'thumb-sprint.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/thumb-sprint/thumb-sprint.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (frames in-GIF, no network)');
console.log('wrote apps/thumb-sprint/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
