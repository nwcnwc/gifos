// Pack apps/cron-speak/ into site/apps/cron-speak/cron-speak.gif
import { cronSpeakIcon, screenshotPng } from './icon.mjs';
import { createHash } from 'node:crypto';
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

for (const need of ['vendor/cronstrue.js', 'vendor/COPYING-cronstrue.txt', 'vendor/UPSTREAM.txt']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

const PIN = 'eea8fee17bec8fbe61445d51853590fa819cab4525b18354b2b9984f370c25d8';
const buf = readFileSync(join(dir, 'vendor', 'cronstrue.js'));
const hex = createHash('sha256').update(buf).digest('hex');
if (hex !== PIN) throw new Error('vendor/cronstrue.js sha256 ' + hex + ' ≠ pin ' + PIN);

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'cron-speak') throw new Error('appId must be cron-speak');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('cron-speak has no network path');
if (!manifest.data.save || manifest.data.save.visibility !== 'private') throw new Error('save must be private');
if (!manifest.data.room || manifest.data.room.visibility !== 'read-only') throw new Error('room must be read-only');

if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.name !== 'cRonstrue') throw new Error('basedOn.name must be cRonstrue');
if (listing.basedOn.url !== 'https://github.com/bradymholt/cRonstrue') throw new Error('basedOn.url');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('listing.porter must be GifOS');
if (!listing.author || listing.author.name !== 'bradymholt' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is bradymholt, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Developer') throw new Error('listing.categories must include Developer');
if (listing.releaseDate !== '2026-08-24') throw new Error('listing.releaseDate must be 2026-08-24');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/cron-speak') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

if (!manifest.launch || !manifest.launch.expr) throw new Error('manifest must declare launch.expr');

const SCRIPTS = ['vendor/cronstrue.js', 'cron.js', 'mp.js', 'app.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/cronstrue.js': buf.toString('utf8'),
  'cron.js': read('cron.js'),
  'mp.js': read('mp.js'),
  'app.js': read('app.js'),
  'COPYING-cronstrue.txt': read('vendor/COPYING-cronstrue.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md is missing or too short (' + helpMd.length + ')');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('index.html has an external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('do not draw an Invite button');
if (!files['mp.js'].includes('Invite') || !files['app.js'].includes('Invite')) {
  throw new Error('tell the player to press Invite');
}
if (!files['app.js'].includes("db('save')") || !files['app.js'].includes("id: 'last'")) {
  throw new Error('app.js must save the last expression privately');
}
if (!files['cron.js'].includes('nextTimes') || !files['app.js'].includes('CronTalk')) {
  throw new Error('translator UI must use CronTalk (fields + next times)');
}
if (!files['index.html'].includes('id="fields"') || !files['index.html'].includes('id="next"')) {
  throw new Error('translator UI must show fields and next times');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (n !== 'vendor/cronstrue.js' && (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s))) {
    throw new Error(n + ' uses ESM syntax');
  }
  if (n === 'vendor/cronstrue.js') continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING-cronstrue.txt'].includes('Brady Holt')) {
  throw new Error('COPYING-cronstrue.txt is not the upstream MIT notice');
}

{
  const ctx = { console };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx; ctx.global = ctx;
  vm.runInNewContext(
    files['vendor/cronstrue.js'] + '\n' + files['cron.js'] + '\n' + files['app.js'] + '\n' +
    'result = (function () {\n' +
    '  var s = CronSpeak.speak;\n' +
    '  var a = s("0 0 * * *", {});\n' +
    '  if (!/12:00 AM|midnight/i.test(a)) throw new Error("midnight " + a);\n' +
    '  var b = s("*/5 * * * *", {});\n' +
    '  if (!/every 5 minutes/i.test(b)) throw new Error("five " + b);\n' +
    '  var c = s("0 9 * * 1-5", { h24: true });\n' +
    '  if (!/09:00|9:00/.test(c) && !/9:00/.test(c)) throw new Error("weekday " + c);\n' +
    '  var bad;\n' +
    '  try { s("99 * * * *", {}); } catch (e) { bad = String(e && e.message || e); }\n' +
    '  if (!bad) throw new Error("invalid cron must throw");\n' +
    '  var n = CronTalk.nextTimes("0 9 * * 1-5", new Date(2026, 7, 24, 8, 0, 0, 0), 3);\n' +
    '  if (!n.times || n.times.length !== 3) throw new Error("next times");\n' +
    '  if (n.times[0].getHours() !== 9 || n.times[0].getDate() !== 24) throw new Error("next monday 9");\n' +
    '  return { midnight: a, five: b, weekday: c, err: bad };\n' +
    '})();',
    ctx
  );
  console.log('cRonstrue checks ok —', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: cronSpeakIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'cron-speak', 'cron-speak.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/cron-speak/cron-speak.gif —', bytes.length, 'bytes,', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
