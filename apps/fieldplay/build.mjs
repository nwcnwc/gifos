// Pack apps/fieldplay/ into site/apps/fieldplay/fieldplay.gif
import { fieldPlayIcon, screenshotPng } from './icon.mjs';
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

const ENGINE_SHA = 'c22aa20e86b9fbe2455e8aff82177460809366be049bcc4d674e521477f60aa9';
const PRESET_SHA = 'b3e5e32ce6ce7fa956b4cdcafcc99f1aab3aad8f4b03b985cf612de86b62f59f';

for (const need of [
  'vendor/fieldplay.js', 'vendor/presets.js',
  'vendor/COPYING-fieldplay.txt', 'vendor/COPYING-webgl-wind.txt', 'vendor/UPSTREAM.txt'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

function pin(rel, want) {
  const buf = readFileSync(join(dir, rel));
  const hex = createHash('sha256').update(buf).digest('hex');
  if (hex !== want) throw new Error(rel + ' sha256 ' + hex + ' ≠ pin ' + want);
  return buf;
}
const engineBuf = pin('vendor/fieldplay.js', ENGINE_SHA);
const presetBuf = pin('vendor/presets.js', PRESET_SHA);

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'fieldplay') throw new Error('appId must be fieldplay');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('fieldplay has no network path');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('room must be read-write');
}
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.name !== 'Field Play') throw new Error('basedOn.name must be Field Play');
if (listing.basedOn.url !== 'https://github.com/anvaka/fieldplay') throw new Error('basedOn.url');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter must be GifOS');
if (!listing.author || listing.author.name !== 'anvaka' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is anvaka, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Creativity') throw new Error('category Creativity');
if (listing.releaseDate !== '2026-08-24') throw new Error('releaseDate must be 2026-08-24');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/fieldplay') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebGL', 'requestAnimationFrame', 'GLSL', 'CDN']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = ['vendor/fieldplay.js', 'vendor/presets.js', 'app.js', 'mp.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/fieldplay.js': engineBuf.toString('utf8'),
  'vendor/presets.js': presetBuf.toString('utf8'),
  'app.js': read('app.js'),
  'mp.js': read('mp.js'),
  'COPYING-fieldplay.txt': read('vendor/COPYING-fieldplay.txt'),
  'COPYING-webgl-wind.txt': read('vendor/COPYING-webgl-wind.txt'),
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
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only — no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL — nothing is fetched');
}
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /<button\b[^>]*id=["'][^"']*invite/i.test(html)) {
  throw new Error('do not draw an Invite button — that is OS chrome');
}
if (!files['mp.js'].includes('Invite') || !files['app.js'].includes("db('save')")) {
  throw new Error('tell the player to press Invite; save the last field');
}
if (!files['vendor/fieldplay.js'].includes('dropAt') || !files['vendor/fieldplay.js'].includes('pinch0')) {
  throw new Error('engine must pour on tap and pinch-zoom');
}
if (!files['app.js'].includes('follow-finger') || !files['app.js'].includes('gifos.onBack')) {
  throw new Error('finger-follow field and Back-closes-sheet required');
}
if (!manifest.launch || !manifest.launch.field) throw new Error('launch.field required');
if (!files['COPYING-fieldplay.txt'].includes('Andrei Kashcha')) {
  throw new Error('COPYING-fieldplay.txt is not Andrei Kashcha\'s MIT notice');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — the classic-script inline path cannot carry it.');
  }
  if (n.startsWith('vendor/')) continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}

{
  const ctx = { window: {}, console, Math, Uint8Array, Float32Array, Int32Array };
  ctx.window = ctx;
  ctx.this = ctx;
  vm.runInNewContext(
    files['vendor/fieldplay.js'] + '\n' + files['vendor/presets.js'] + '\n' +
    'result = (function () {\n' +
    '  if (!FPPresets || FPPresets.length < 8) throw new Error("presets " + (FPPresets && FPPresets.length));\n' +
    '  for (var i = 0; i < FPPresets.length; i++) {\n' +
    '    if (!FPPresets[i].code || FPPresets[i].code.indexOf("get_velocity") < 0) throw new Error("preset " + i);\n' +
    '    if (FPPresets[i].code.indexOf("texture2D") >= 0) throw new Error("texture preset " + FPPresets[i].id);\n' +
    '  }\n' +
    '  var out = new Uint8Array(4);\n' +
    '  FieldPlay.encodeFloatRGBA(1.5, out, 0);\n' +
    '  var z = new Uint8Array(4);\n' +
    '  FieldPlay.encodeFloatRGBA(0, z, 0);\n' +
    '  if (z[0] !== 0 || z[3] !== 0) throw new Error("zero encode");\n' +
    '  if (out[0] === 0 && out[1] === 0 && out[2] === 0 && out[3] === 0) throw new Error("1.5 encoded as zero");\n' +
    '  return FPPresets.length;\n' +
    '})();',
    ctx
  );
  console.log('Field Play encode + presets ok —', ctx.result, 'fields');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: fieldPlayIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'fieldplay', 'fieldplay.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/fieldplay/fieldplay.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
