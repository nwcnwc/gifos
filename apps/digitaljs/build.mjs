// Pack apps/digitaljs/ into site/apps/digitaljs/digitaljs.gif
// Offline and deterministic. Run: node apps/digitaljs/build.mjs
import { digitaljsIcon, screenshotPng } from './icon.mjs';
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
const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));
const JS_SHA = '67f502498466e206c982eecaf7b58a1c3ae84b524cb26e3fe3decfaefbff31c8';

for (const need of [
  'vendor/digitaljs.js', 'vendor/digitaljs.css',
  'vendor/COPYING-digitaljs.txt', 'vendor/UPSTREAM.txt',
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
const vendorBuf = readFileSync(join(dir, 'vendor/digitaljs.js'));
{
  const hex = createHash('sha256').update(vendorBuf).digest('hex');
  if (hex !== JS_SHA) throw new Error('digitaljs.js sha256 ' + hex + ' ≠ pin');
}
if (/<\/script/i.test(vendorBuf.toString('utf8'))) throw new Error('</script in digitaljs.js');
{
  const v = vendorBuf.toString('utf8');
  if (!v.includes('digitaljs=') && !v.includes('window.digitaljs')) throw new Error('digitaljs global missing');
  if (!v.includes('Vector3vl')) throw new Error('Vector3vl global missing');
}

if (manifest.minBuild !== 947 || manifest.appId !== 'digitaljs') throw new Error('manifest');
if (!manifest.capabilities.db || !manifest.capabilities.multiplayer) throw new Error('caps');
if (manifest.capabilities.network) throw new Error('no network');
if (listing.basedOn.blessed !== false || listing.basedOn.name !== 'DigitalJS') throw new Error('basedOn');
if (listing.author.name !== 'Marek Materzok' || listing.porter.name !== 'GifOS') throw new Error('author');
if (listing.license !== 'BSD-2-Clause') throw new Error('license');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/digitaljs') throw new Error('homepage');
if (!listing.description.includes('unofficial port')) throw new Error('listing must say unofficial port');
if (!listing.tagline.toLowerCase().includes('gif')) throw new Error('tagline should sell the file');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebGL', 'CDN']) {
  if (listingBlob.includes(bad)) throw new Error('listing ' + bad);
}

const SCRIPTS = ['vendor/digitaljs.js', 'circuits.js', 'touch.js', 'net.js', 'boot.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/digitaljs.js': vendorBuf.toString('utf8'),
  'vendor/digitaljs.css': read('vendor/digitaljs.css'),
  'circuits.js': read('circuits.js'),
  'touch.js': read('touch.js'),
  'net.js': read('net.js'),
  'boot.js': read('boot.js'),
  'COPYING-digitaljs.txt': read('vendor/COPYING-digitaljs.txt'),
  'COPYING-jquery.txt': read('vendor/COPYING-jquery.txt'),
  'COPYING-jquery-ui.txt': read('vendor/COPYING-jquery-ui.txt'),
  'COPYING-joint.txt': read('vendor/COPYING-joint.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of SCRIPTS) if (!html.includes('src="' + s + '"')) throw new Error('missing ' + s);
if (!html.includes('href="style.css"')) throw new Error('missing style.css');
if (!html.includes('href="vendor/digitaljs.css"')) throw new Error('missing vendor css');
if (/type=["']module["']/.test(html)) throw new Error('no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('Invite is OS chrome');
if (!files['boot.js'].includes("layoutEngine: 'dagre'")) throw new Error('must use dagre layout');
if (!files['net.js'].includes("db('save')")) throw new Error('save missing');
if (!files['COPYING-digitaljs.txt'].includes('Marek Materzok')) throw new Error('COPYING');
if (!files['circuits.js'].includes('4-bit counter')) throw new Error('counter sample missing');
if (!files['circuits.js'].includes("a: '0101'") || !files['circuits.js'].includes("b: '0011'")) {
  throw new Error('ALU sample must seed A=5 B=3');
}
if (!files['boot.js'].includes('settleCombo')) throw new Error('combinational settle missing');
if (!files['touch.js'].includes('pointerdown')) throw new Error('pan/zoom missing');

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' </script');
  if (n.startsWith('vendor/')) continue;
  if (/^\s*import\s|export\{|import\.meta/m.test(s)) throw new Error(n + ' ESM');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}

const shot = screenshotPng();
if (shot[0] !== 0x89) throw new Error('screenshot');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: digitaljsIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'digitaljs', 'digitaljs.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/digitaljs/digitaljs.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
