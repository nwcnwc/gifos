// Pack apps/metronome/ into site/apps/metronome/metronome.gif
import { metronomeIcon, screenshotPng } from './icon.mjs';
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

for (const need of [
  'vendor/metronome.js', 'vendor/metronomeworker.js',
  'vendor/COPYING-metronome.txt', 'vendor/UPSTREAM.txt'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

const PIN_JS = 'cc5d3ef430b709ade60f6b34ebc5bc38cf1a969bc452e9f232a9cbba2fa2583f';
const PIN_WK = '9e5895b24ecdf56b4a55ffced5f5d39bdf415e1611b20fea796188d1fa267630';
const jsBuf = readFileSync(join(dir, 'vendor', 'metronome.js'));
const wkBuf = readFileSync(join(dir, 'vendor', 'metronomeworker.js'));
if (createHash('sha256').update(jsBuf).digest('hex') !== PIN_JS) {
  throw new Error('vendor/metronome.js sha256 drifted');
}
if (createHash('sha256').update(wkBuf).digest('hex') !== PIN_WK) {
  throw new Error('vendor/metronomeworker.js sha256 drifted');
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'metronome') throw new Error('appId must be metronome');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('metronome has no network path');
if (manifest.capabilities.microphone) throw new Error('metronome has no microphone');
if (!manifest.data.save || manifest.data.save.visibility !== 'private') throw new Error('save must be private');
if (!manifest.data.room || manifest.data.room.visibility !== 'read-only') throw new Error('room must be read-only');

if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.name !== 'metronome') throw new Error('basedOn.name must be metronome');
if (listing.basedOn.url !== 'https://github.com/cwilso/metronome') throw new Error('basedOn.url');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('listing.porter must be GifOS');
if (!listing.author || listing.author.name !== 'cwilso' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is cwilso, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Creativity') throw new Error('listing.categories must include Creativity');
if (listing.releaseDate !== '2026-08-24') throw new Error('listing.releaseDate must be 2026-08-24');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/metronome') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const SCRIPTS = ['mp.js', 'app.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'mp.js': read('mp.js'),
  'app.js': read('app.js'),
  'vendor/metronome.js': jsBuf.toString('utf8'),
  'vendor/metronomeworker.js': wkBuf.toString('utf8'),
  'COPYING-metronome.txt': read('vendor/COPYING-metronome.txt'),
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
if (html.includes('vendor/metronome.js')) {
  throw new Error('do not auto-run upstream metronome.js — it inits a relative Worker');
}
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('index.html has an external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('do not draw an Invite button');
if (!files['mp.js'].includes('Invite') || !files['app.js'].includes('Invite')) {
  throw new Error('tell the player to press Invite');
}
if (!files['app.js'].includes("db('save')") || !files['app.js'].includes("id: 'last'")) {
  throw new Error('app.js must save tempo privately');
}
if (/mediaDevices|getUserMedia|recordAudio/.test(files['app.js'])) {
  throw new Error('metronome must not touch the microphone');
}
if (!files['app.js'].includes('createOscillator') || !files['app.js'].includes('SCHEDULE_AHEAD')) {
  throw new Error('app.js must use the Web Audio lookahead scheduler');
}
if (!files['app.js'].includes('onBack')) throw new Error('app.js must register gifos.onBack to stop');
if (!files['app.js'].includes('notesInQueue') && !files['app.js'].includes('queue.push')) {
  throw new Error('app.js must queue notes and paint when they play, not when they schedule');
}
if (!files['mp.js'].includes('subdiv')) throw new Error('room snapshot must carry subdiv');
if (/vol:/.test(files['mp.js'])) throw new Error('volume is local — do not sync it in the room snapshot');

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (!n.startsWith('vendor/') && (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s))) {
    throw new Error(n + ' uses ESM syntax');
  }
  if (n.startsWith('vendor/')) continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING-metronome.txt'].includes('Chris Wilson')) {
  throw new Error('COPYING-metronome.txt is not the upstream MIT notice');
}

{
  const ctx = { console, Math, Object, Array, JSON, Date, String, Number, Boolean };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  ctx.document = { getElementById: function () { return null; } };
  vm.runInNewContext(files['app.js'] + '\n' +
    'result = (function () {\n' +
    '  var M = MetronomeApp;\n' +
    '  if (M.beatsOf("4/4") !== 4) throw new Error("4/4");\n' +
    '  if (M.beatsOf("3/4") !== 3) throw new Error("3/4");\n' +
    '  if (M.beatsOf("6/8") !== 6) throw new Error("6/8");\n' +
    '  var q = M.nextSeconds(120, "4/4");\n' +
    '  if (Math.abs(q - 0.5) > 1e-9) throw new Error("120 4/4 " + q);\n' +
    '  var e = M.nextSeconds(120, "6/8");\n' +
    '  if (Math.abs(e - 0.25) > 1e-9) throw new Error("120 6/8 " + e);\n' +
    '  var s8 = M.secondsPerClick(120, "4/4", "8th");\n' +
    '  if (Math.abs(s8 - 0.25) > 1e-9) throw new Error("120 8th " + s8);\n' +
    '  var bar = M.scheduleBar(120, "4/4", "beat", 0);\n' +
    '  if (bar.length !== 4) throw new Error("bar " + bar.length);\n' +
    '  if (!bar[0].accent || bar[1].accent) throw new Error("accent");\n' +
    '  if (M.tapBpm([0, 500, 1000]) !== 120) throw new Error("tap");\n' +
    '  return { q: q, e: e };\n' +
    '})();',
    ctx
  );
  console.log('metronome scheduler checks ok —', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: metronomeIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'metronome', 'metronome.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/metronome/metronome.gif —', bytes.length, 'bytes,', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
