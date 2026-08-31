// Pack apps/alphatab/ into site/apps/alphatab/alphatab.gif.
import { alphatabIcon, screenshotPng } from './icon.mjs';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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
const bin = (p) => readFileSync(join(dir, p));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const JS_SHA = '2d0335501b875453d52359de23cd9cebfcf71aed3d5739f1cf95117acfd52bec';
const FONT_SHA = '181e0e7c4889f9ad57dde0a11988fa61b941617aa499ecdb9dfd4713896c2b19';
const SF_SHA = 'd39beb7cd349278455b44e7689e35e3c1f5ed9ef80118485846537929df8f7c0';

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

for (const need of [
  'vendor/alphaTab.min.js', 'vendor/Bravura.woff2', 'vendor/sonivox.sf3',
  'vendor/COPYING-alphatab.txt', 'vendor/COPYING-bravura.txt',
  'vendor/COPYING-sonivox.txt', 'vendor/UPSTREAM.txt', 'sample.tex'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing — node apps/alphatab/vendor.mjs');
}

const jsBuf = bin('vendor/alphaTab.min.js');
if (sha256(jsBuf) !== JS_SHA) throw new Error('alphaTab.min.js sha256 drifted');
if (sha256(bin('vendor/Bravura.woff2')) !== FONT_SHA) throw new Error('Bravura.woff2 sha256 drifted');
if (sha256(bin('vendor/sonivox.sf3')) !== SF_SHA) throw new Error('sonivox.sf3 sha256 drifted');
if (/<\/script/i.test(jsBuf.toString('utf8'))) throw new Error('</script in alphaTab.min.js');

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'alphatab') throw new Error('appId must be alphatab');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('capabilities.db');
if (!manifest.capabilities.multiplayer) throw new Error('capabilities.multiplayer');
if (!manifest.capabilities.wasm) throw new Error('capabilities.wasm — blob workers');
if (manifest.capabilities.network) throw new Error('alphatab has no network path');
if (manifest.data.save.visibility !== 'private') throw new Error('save must be private');
if (manifest.data.song.visibility !== 'read-only') throw new Error('song must be read-only');
if (manifest.data.follow.visibility !== 'read-write') throw new Error('follow must be read-write');
if (!manifest.lead || manifest.lead[0].id !== 'cursor') throw new Error('lead must name the playhead');

if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.name !== 'alphaTab') throw new Error('basedOn.name must be alphaTab');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter must be GifOS');
if (!listing.author || /gifos/i.test(listing.author.name)) throw new Error('author is Daniel Kuschny, never GifOS');
if (listing.license !== 'MPL-2.0') throw new Error('listing.license must be MPL-2.0');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/alphatab') {
  throw new Error('listing.homepage must be the gifos tree');
}
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'CDN']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const sample = read('sample.tex');
if (!sample.includes('Greensleeves')) throw new Error('sample.tex must be Greensleeves');
if (!sample.includes('Public Domain')) throw new Error('sample.tex must say Public Domain');
if (sample.includes('\\tc')) throw new Error('sample.tex: \\tc is not alphaTex — use chords as (fret.string)');
if (sample.trim().length < 200) throw new Error('sample.tex is too short');

const SCRIPTS = ['vendor/alphaTab.min.js', 'net.js', 'touch.js', 'boot.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/alphaTab.min.js': jsBuf,
  'vendor/Bravura.woff2': bin('vendor/Bravura.woff2'),
  'vendor/sonivox.sf3': bin('vendor/sonivox.sf3'),
  'sample.tex': sample,
  'net.js': read('net.js'),
  'touch.js': read('touch.js'),
  'boot.js': read('boot.js'),
  'COPYING-alphatab.txt': read('vendor/COPYING-alphatab.txt'),
  'COPYING-bravura.txt': read('vendor/COPYING-bravura.txt'),
  'COPYING-sonivox.txt': read('vendor/COPYING-sonivox.txt'),
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
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('index.html has an external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /<button\b[^>]*id=["'][^"']*invite/i.test(html)) {
  throw new Error('do not draw an Invite button — that is OS chrome');
}
if (!html.includes('id="at-src"') || !html.includes('href="vendor/alphaTab.min.js"')) {
  throw new Error('hidden at-src must point at the UMD for the blob worker');
}
if (!html.includes('href="vendor/sonivox.sf3"') || !html.includes('href="vendor/Bravura.woff2"')) {
  throw new Error('font and soundfont must be packed hrefs');
}
if (!html.includes('id="play"')) throw new Error('phone play control missing');
if (!files['boot.js'].includes('Invite') && !html.includes('Invite')) {
  throw new Error('tell the person to press Invite');
}
if (!files['boot.js'].includes('onBack')) throw new Error('boot.js must register gifos.onBack');
if (!files['boot.js'].includes('WebAudioScriptProcessor')) {
  throw new Error('boot.js must use ScriptProcessor playback');
}
if (!files['boot.js'].includes('initializeMain')) throw new Error('boot.js must mint blob workers');
if (!files['net.js'].includes("db('save')") || !files['net.js'].includes("id: 'last'")) {
  throw new Error('net.js must save the last song privately');
}
if (!files['COPYING-alphatab.txt'].includes('Mozilla Public License')) {
  throw new Error('COPYING-alphatab.txt is not the MPL-2.0 notice');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s) && n !== 'vendor/alphaTab.min.js') {
    throw new Error(n + ' contains </script — cannot inline safely');
  }
  if (n === 'vendor/alphaTab.min.js') continue;
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — the classic-script inline path cannot carry it.');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: alphatabIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'alphatab', 'alphatab.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/alphatab/alphatab.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
