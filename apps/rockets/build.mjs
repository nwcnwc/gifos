// Pack apps/rockets/ into site/apps/rockets/rockets.gif
// (see apps/README.md). Uses the SAME codec the GifOS desktop and MCP
// server use (site/js/gifos-gif.js).
//
// A rewrite of lauthieb's Rocket Universe (MIT) as classic scripts — no
// Express, no socket.io, no Node sky. Offline and deterministic.
//
// Run:  node apps/rockets/build.mjs
import { rocketsIcon, screenshotPng } from './icon.mjs';
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

if (!existsSync(join(dir, 'vendor', 'COPYING-rocket-universe.txt'))) {
  throw new Error('vendor/COPYING-rocket-universe.txt is missing — the MIT notice has to ride inside the GIF');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'gifos.fetch', 'Express', 'socket.io', 'Node']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}
if (!listing.author || listing.author.name !== 'lauthieb') {
  throw new Error('listing.author must be lauthieb');
}
if (!listing.basedOn || listing.basedOn.name !== 'Rocket Universe' || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn must name Rocket Universe, unofficial');
}
if (listing.releaseDate !== '2026-08-23') {
  throw new Error('listing.releaseDate must be 2026-08-23');
}
if (listing.cover !== 'screenshot.png') {
  throw new Error('listing.cover must be screenshot.png');
}
if (listing.license !== 'MIT') {
  throw new Error('listing.license must be MIT');
}

const SCRIPTS = ['sim.js', 'net.js', 'app.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'sim.js': read('sim.js'),
  'net.js': read('net.js'),
  'app.js': read('app.js'),
  'COPYING-rocket-universe.txt': read('vendor/COPYING-rocket-universe.txt'),
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — the runtime drops that, so the app would never boot.');
}
if (html.includes('id="invite"') || files['app.js'].includes('id="invite"')) {
  throw new Error('Invite is OS chrome — do not draw a share button');
}
if (!files['app.js'].includes('Invite')) {
  throw new Error('tell the player to press Invite — that button is OS chrome');
}
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.wasm) {
  throw new Error('do not declare wasm');
}
if (manifest.capabilities.network) {
  throw new Error('rockets has no network path — the original Node sky stays behind');
}
if (manifest.capabilities.pointer) {
  throw new Error('do not declare pointer-lock — this is a stick / WASD game');
}
if (!Number.isInteger(manifest.minBuild) || manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947');
}
if (!manifest.data || !manifest.data.prefs || manifest.data.prefs.visibility !== 'private') {
  throw new Error('manifest.data.prefs must be private');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('manifest.data.players must be read-write');
}
if (!manifest.data.sky || manifest.data.sky.visibility !== 'read-only') {
  throw new Error('manifest.data.sky must be read-only — only the host writes the starfield');
}
for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/\btype\s*=\s*["']module["']/.test(s) || /^\s*import\s/m.test(s) || /export\s+\{/.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — nothing leaves this tab.');
  }
}
if (!files['COPYING-rocket-universe.txt'].includes('Laurent Thiebault')) {
  throw new Error('COPYING-rocket-universe.txt is not lauthieb\'s MIT notice');
}

// vm tests: collect, score, no double-take, host-only spawn.
{
  const ctx = { console };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.runInNewContext(
    files['sim.js'] + '\n' +
    'self = this; result = (function () {\n' +
    '  var R = Rockets;\n' +
    '  if (!R || !R.tryCollect) throw new Error("Rockets sim missing");\n' +
    '  var sky = R.freshSky(7, 0);\n' +
    '  if (!sky.stars.length) throw new Error("fresh sky has no stars");\n' +
    '  var s = sky.stars[0];\n' +
    '  var a = R.spawnRocket("p1", s.x, s.y);\n' +
    '  var r1 = R.tryCollect(sky, a);\n' +
    '  if (!r1.collected) throw new Error("a rocket at a star should collect it");\n' +
    '  if (a.score < 1) throw new Error("score should increment");\n' +
    '  if (a.score !== r1.points) throw new Error("score should equal points of that star");\n' +
    '  var b = R.spawnRocket("p2", s.x, s.y);\n' +
    '  var r2 = R.tryCollect(sky, b);\n' +
    '  if (r2.collected) throw new Error("two players cannot occupy the same star twice");\n' +
    '  if (b.score !== 0) throw new Error("loser must not score the taken star");\n' +
    '  var sky2 = R.freshSky(9, 0);\n' +
    '  var st = sky2.stars[0];\n' +
    '  var out = R.applyClaims(sky2, [\n' +
    '    { playerId: "a", starId: st.id, t: 10 },\n' +
    '    { playerId: "b", starId: st.id, t: 10 }\n' +
    '  ]);\n' +
    '  var n = 0;\n' +
    '  if (out.awarded.a) n++;\n' +
    '  if (out.awarded.b) n++;\n' +
    '  if (n !== 1) throw new Error("exactly one claimer wins a star, got " + n);\n' +
    '  var empty = { seed: 1, seq: 0, stars: [] };\n' +
    '  R.refillStars(empty, false);\n' +
    '  if (empty.stars.length !== 0) throw new Error("guest must not spawn stars");\n' +
    '  var host = { seed: 1, seq: 0, stars: [] };\n' +
    '  R.refillStars(host, true);\n' +
    '  if (host.stars.length !== R.STAR_N) throw new Error("host should fill the sky");\n' +
    '  var before = sky.stars.length;\n' +
    '  R.spawnStar(sky, { host: false });\n' +
    '  if (sky.stars.length !== before) throw new Error("spawnStar is host-only");\n' +
    '  R.spawnStar(sky, { host: true });\n' +
    '  if (sky.stars.length !== before + 1) throw new Error("host spawnStar should add a star");\n' +
    '  return a.score;\n' +
    '})();',
    ctx
  );
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: rocketsIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'rockets', 'rockets.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/rockets/rockets.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (no Express, no socket.io, no Node sky)');
console.log('wrote apps/rockets/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
