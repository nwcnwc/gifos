// Pack apps/bowling/ into the finished, downloadable
// site/apps/bowling/bowling.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed.
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/bowling/build.mjs
import { bowlingIcon, screenshotPng } from './icon.mjs';
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

for (const need of ['vendor/layout.js', 'vendor/COPYING-bowling.txt', 'vendor/UPSTREAM.txt']) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing');
  }
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (manifest.appId !== 'bowling') throw new Error('appId must be bowling');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('bowling has no network path');
if (manifest.capabilities.wasm) throw new Error('bowling is classic canvas — no wasm');
if (!manifest.data || !manifest.data.prefs || manifest.data.prefs.visibility !== 'private') {
  throw new Error('prefs must be private');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('players must be read-write — live scores have to sync');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false — this is an unofficial port');
}
if (listing.basedOn.name !== 'bowling') {
  throw new Error('basedOn.name must be bowling');
}
if (listing.basedOn.url !== 'https://github.com/tincoats/bowling') {
  throw new Error('basedOn.url must be tincoats/bowling');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || listing.author.name !== 'tincoats' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is tincoats, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Games') {
  throw new Error('listing.categories must include Games');
}
if (listing.releaseDate !== '2026-08-23') throw new Error('listing.releaseDate must be 2026-08-23');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/bowling') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'JSON', 'Babylon', 'Havok', 'WebGL']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = ['vendor/layout.js', 'game.js', 'mp.js', 'boot.js'];

const helpMd = read('help.md');
if (helpMd.trim().length < 400) throw new Error('help.md is too short');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/layout.js': read('vendor/layout.js'),
  'game.js': read('game.js'),
  'mp.js': read('mp.js'),
  'boot.js': read('boot.js'),
  'COPYING-bowling.txt': read('vendor/COPYING-bowling.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
  'help.md': helpMd,
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /<button\b[^>]*id=["'][^"']*invite/i.test(html)) {
  throw new Error('do not draw an Invite button — that is OS chrome');
}
if (!files['mp.js'].includes('Invite') || !files['boot.js'].includes('Invite')) {
  throw new Error('tell the player to press Invite — do not hide the room');
}
if (!files['mp.js'].includes('players') || !files['mp.js'].includes('Nobody writes')) {
  throw new Error('mp.js must score on own rows');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — the classic-script inline path cannot carry it.');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING-bowling.txt'].includes('scotty888')) {
  throw new Error('COPYING-bowling.txt is not the upstream MIT notice');
}
if (!files['vendor/layout.js'].includes('impulseOf')) {
  throw new Error('vendor/layout.js lost the throw formula');
}

{
  const ctx = { window: {}, console };
  ctx.window = ctx;
  vm.runInNewContext(
    files['vendor/layout.js'] + '\n' + files['game.js'] + '\n' +
    'self = this; result = (function () {\n' +
    '  var S = Bowl.Score;\n' +
    '  var perfect = [];\n' +
    '  for (var i = 0; i < 9; i++) perfect.push([10]);\n' +
    '  perfect.push([10, 10, 10]);\n' +
    '  if (S.total(perfect) !== 300) throw new Error("perfect is " + S.total(perfect));\n' +
    '  var nines = [];\n' +
    '  for (var j = 0; j < 10; j++) nines.push([9, 0]);\n' +
    '  if (S.total(nines) !== 90) throw new Error("all 9- is " + S.total(nines));\n' +
    '  var spares = [];\n' +
    '  for (var k = 0; k < 10; k++) spares.push([5, 5]);\n' +
    '  spares[9] = [5, 5, 5];\n' +
    '  if (S.total(spares) !== 150) throw new Error("all 5/ is " + S.total(spares));\n' +
    '  var g = new Bowl.Game();\n' +
    '  g.reset();\n' +
    '  if (!g.throwImpulse(BowlLayout.impulseOf(160), 0)) throw new Error("throw refused");\n' +
    '  var guard = 0;\n' +
    '  while (g.rolling && guard++ < 2000) g.step(1 / 60);\n' +
    '  if (g.rolling) throw new Error("throw never settled");\n' +
    '  var r = g.lastResult;\n' +
    '  if (!r || r.knocked < 1) throw new Error("centred throw knocked " + (r && r.knocked));\n' +
    '  return r.knocked;\n' +
    '})();',
    ctx
  );
  console.log('score + alley checks ok — centred throw knocked', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: bowlingIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'bowling', 'bowling.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/bowling/bowling.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
