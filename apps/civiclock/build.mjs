// Pack apps/civiclock/ into site/apps/civiclock/civiclock.gif
// First-party engine, original pack. Nothing is fetched.
// Run:  node apps/civiclock/build.mjs
import { civiclockIcon } from './icon.mjs';
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
const SCRIPTS = ['sim.js', 'render.js', 'app.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'sim.js': read('sim.js'),
  'render.js': read('render.js'),
  'app.js': read('app.js'),
};
{
  const help = read('help.md').trim();
  if (help.length < 400) throw new Error('help.md is missing or shorter than 400 chars');
  if (!help.startsWith('# Civiclock')) throw new Error('help.md must start with # Civiclock');
  files['help.md'] = help;
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — the runtime drops that, so the app would never boot.');
}
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.wasm) throw new Error('do not declare wasm');
if (manifest.capabilities.network) throw new Error('civiclock has no network path');
if (!Number.isInteger(manifest.minBuild) || manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947');
}
if (manifest.appId !== 'civiclock') throw new Error('appId must be civiclock');
if (manifest.name !== 'Civiclock') throw new Error('name must be Civiclock');
if (!manifest.data || !manifest.data.prefs || manifest.data.prefs.visibility !== 'private') {
  throw new Error('manifest.data.prefs must be private');
}
if (!manifest.data.city || manifest.data.city.visibility !== 'read-write') {
  throw new Error('manifest.data.city must be read-write — co-mayors share the land');
}
if (!manifest.data.edits || manifest.data.edits.visibility !== 'read-write') {
  throw new Error('manifest.data.edits must be read-write');
}
if (!manifest.data.cursors || manifest.data.cursors.visibility !== 'read-write') {
  throw new Error('manifest.data.cursors must be read-write');
}
if (html.includes('id="invite"') || />\s*Invite\s*</.test(html)) {
  throw new Error('Invite is OS chrome — this app must not draw a share button');
}

if (!listing.author || listing.author.name !== 'GifOS') {
  throw new Error('listing.author must be GifOS');
}
if (listing.basedOn) throw new Error('listing must not have basedOn — this is first-party');
if (listing.porter) throw new Error('listing must not have porter — this is first-party');
if (!listing.inspiredBy || listing.inspiredBy.name !== 'SimCity' || listing.inspiredBy.by !== 'Maxis / Electronic Arts') {
  throw new Error('listing.inspiredBy must name SimCity by Maxis / Electronic Arts');
}
if (listing.inspiredBy.url !== 'https://www.ea.com/games/simcity') {
  throw new Error('listing.inspiredBy.url must be the EA SimCity page');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Games') {
  throw new Error('listing.categories must include Games first');
}
for (const tag of ['city', 'simulation', 'multiplayer', 'offline']) {
  if (!listing.tags || listing.tags.indexOf(tag) < 0) throw new Error('listing.tags must include ' + tag);
}
if (listing.releaseDate !== '2026-08-23') throw new Error('listing.releaseDate must be 2026-08-23');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/civiclock') {
  throw new Error('listing.homepage must be the gifos tree');
}
if (listing.cover !== 'screenshot.png') throw new Error('listing.cover must be screenshot.png');
if (listing.tagline.length > 120) throw new Error('tagline is over 120 chars');
if (!/plane|offline|file|invite|account/i.test(listing.tagline + listing.description)) {
  throw new Error('listing must lead with the GifOS reason (file / invite / offline / no account)');
}

if (/\b(micropolis|opencity|lincity)\b/i.test(JSON.stringify(listing) + files['sim.js'])) {
  throw new Error('do not vendor or name Micropolis/OpenCity/Lincity — this is not a port');
}
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'gifos.fetch', 'CORS', 'COOP', 'Argon2', 'CDN', 'Node']) {
  if (JSON.stringify(listing).includes(bad)) {
    throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
  }
}

if (!html.includes('Drop a village') || !html.includes('Budget') || !html.includes('id="map"')) {
  throw new Error('HUD / village / map missing from index.html');
}
if (!files['app.js'].includes('coverShot') || !files['app.js'].includes('gifos.onBack')) {
  throw new Error('coverShot + gifos.onBack missing');
}
if (!files['app.js'].includes("gifos.db('city')") || !files['app.js'].includes("gifos.db('prefs')")) {
  throw new Error('app.js must use city + prefs collections');
}
if (files['app.js'].includes('id="invite"')) {
  throw new Error('Invite is OS chrome');
}

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/\btype\s*=\s*["']module["']/.test(s) || /^\s*import\s/m.test(s) || /export\s+\{/.test(s) || /export default/.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad + ' — nothing leaves this tab.');
  }
}
if (/https?:\/\//.test(html) || html.includes('cdn.')) {
  throw new Error('index.html must not load anything from the network');
}

{
  const ctx = { console };
  vm.runInNewContext(
    files['sim.js'] + '\n' +
    'self = this; result = (function () {\n' +
    '  var C = Civiclock;\n' +
    '  if (!C || C.N !== 24) throw new Error("map size");\n' +
    '  var b = C.blank(7);\n' +
    '  if (b.tiles.length !== 24*24) throw new Error("tiles");\n' +
    '  if (b.money < 1000) throw new Error("starting money");\n' +
    '  var water = 0, i;\n' +
    '  for (i = 0; i < b.tiles.length; i++) if (b.tiles[i].t === C.T.WATER) water++;\n' +
    '  if (water < 16) throw new Error("need a river");\n' +
    '  var v = C.village(7);\n' +
    '  var plants = 0, pumps = 0, homes = 0, roads = 0;\n' +
    '  for (i = 0; i < v.tiles.length; i++) {\n' +
    '    if (v.tiles[i].t === C.T.PLANT) plants++;\n' +
    '    if (v.tiles[i].t === C.T.PUMP) pumps++;\n' +
    '    if (v.tiles[i].t === C.T.HOME) homes++;\n' +
    '    if (v.tiles[i].t === C.T.ROAD) roads++;\n' +
    '  }\n' +
    '  if (!plants || !pumps || homes < 8 || roads < 20) throw new Error("village too thin");\n' +
    '  var w = v, m;\n' +
    '  for (m = 0; m < 36; m++) w = C.tick(w);\n' +
    '  if (w.pop < 40) throw new Error("village did not grow, pop " + w.pop);\n' +
    '  if (w.powerCap < 80) throw new Error("plant should supply power");\n' +
    '  if (w.waterCap < 40) throw new Error("pump should supply water, cap " + w.waterCap);\n' +
    '  if (w.jobs < 10) throw new Error("no jobs after growth");\n' +
    '  var grown = 0;\n' +
    '  for (i = 0; i < w.tiles.length; i++) if (C.isZone(w.tiles[i].t) && w.tiles[i].s >= 1) grown++;\n' +
    '  if (grown < 8) throw new Error("zones did not develop");\n' +
    '  var ppl = C.people(w, 0.45);\n' +
    '  if (!ppl.length) throw new Error("no people at day");\n' +
    '  var night = C.people(w, 0.05);\n' +
    '  if (!night.length) throw new Error("no people at night (should be home)");\n' +
    '  var dead = C.cloneWorld(w);\n' +
    '  for (i = 0; i < dead.tiles.length; i++) if (dead.tiles[i].t === C.T.PLANT) {\n' +
    '    dead.tiles[i] = { t: C.T.GRASS, s: 0, a: 0, age: 0, p: 0, u: 0, k: 0, v: 30 };\n' +
    '  }\n' +
    '  var pop0 = dead.pop;\n' +
    '  for (m = 0; m < 14; m++) dead = C.tick(dead);\n' +
    '  if (dead.pop >= pop0) throw new Error("killing the plant should empty the city, " + pop0 + " -> " + dead.pop);\n' +
    '  if (dead.powerCap !== 0) throw new Error("no plant means no cap");\n' +
    '  var taxed = C.grownVillage(24);\n' +
    '  taxed = C.cloneWorld(taxed); taxed.tax = 20;\n' +
    '  var p1 = taxed.pop;\n' +
    '  for (m = 0; m < 18; m++) taxed = C.tick(taxed);\n' +
    '  if (taxed.pop > p1) throw new Error("20% tax should not grow the city");\n' +
    '  var dry = C.village(7);\n' +
    '  for (i = 0; i < dry.tiles.length; i++) if (dry.tiles[i].t === C.T.PUMP) dry.tiles[i].t = C.T.GRASS;\n' +
    '  for (m = 0; m < 28; m++) dry = C.tick(dry);\n' +
    '  var tall = 0;\n' +
    '  for (i = 0; i < dry.tiles.length; i++) if (dry.tiles[i].s >= 3) tall++;\n' +
    '  if (tall > 2) throw new Error("no water should block towers");\n' +
    '  var r = C.paint(C.blank(1), 0, 10, "road");\n' +
    '  if (r.ok) throw new Error("must not pave the river");\n' +
    '  r = C.paint(C.blank(1), 5, 10, "road");\n' +
    '  if (!r.ok) throw new Error("road on grass: " + r.reason);\n' +
    '  if (r.world.money >= C.blank(1).money) throw new Error("road must cost money");\n' +
    '  r = C.paint(C.blank(1), 8, 8, "pump");\n' +
    '  if (r.ok) throw new Error("pump inland should fail");\n' +
    '  var info = C.inspect(w, 5, 6);\n' +
    '  if (!info || !info.why || !info.why.length) throw new Error("inspect must explain a lot");\n' +
    '  if (JSON.stringify(C).toLowerCase().indexOf("simcity") >= 0) throw new Error("engine must not say SimCity");\n' +
    '  return w.pop;\n' +
    '})();',
    ctx
  );
  if (!(ctx.result > 40)) throw new Error('sim self-test returned ' + ctx.result);
}

const shotPath = join(dir, 'screenshot.png');
if (!existsSync(shotPath)) {
  console.log('no screenshot.png yet — pack the GIF, then node apps/civiclock/tools/shoot.js');
} else {
  console.log('keeping apps/civiclock/screenshot.png (Playwright master)');
}

const bytes = await gif.encode(files, { preview: civiclockIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'civiclock', 'civiclock.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/civiclock/civiclock.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (original sim, no network)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
