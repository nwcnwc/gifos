// Pack apps/epub-reader/ into site/apps/epub-reader/epub-reader.gif.
// epub.js 0.3.93 + JSZip 3.10.1 ride IN the GIF. Sample EPUB becomes
// window.SAMPLE_EPUB_B64. Same CompressionStream polyfill as asteroids.
import { epubReaderIcon, screenshotPng } from './icon.mjs';
import { sampleEpubBytes } from './sample.mjs';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
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

const EPUB_SHA = '06eae15745107b4aa508c95538275251f69bfb9f1175621fc458d9f42ed082d4';
const ZIP_SHA = 'acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e';

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

for (const need of [
  'vendor/epub.min.js', 'vendor/jszip.min.js',
  'vendor/COPYING-epubjs.txt', 'vendor/COPYING-jszip.txt', 'vendor/UPSTREAM.txt'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

if (sha256(bin('vendor/epub.min.js')) !== EPUB_SHA) {
  throw new Error('vendor/epub.min.js sha256 drifted from UPSTREAM.txt');
}
if (sha256(bin('vendor/jszip.min.js')) !== ZIP_SHA) {
  throw new Error('vendor/jszip.min.js sha256 drifted from UPSTREAM.txt');
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'epub-reader') throw new Error('appId must be epub-reader');
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db');
}
if (!manifest.capabilities.multiplayer) throw new Error('manifest must declare capabilities.multiplayer');
if (manifest.capabilities.network) throw new Error('epub-reader has no network path');
if (manifest.capabilities.wasm) throw new Error('epub-reader does not need wasm');
if (!manifest.data || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private');
}
if (manifest.data.doc.visibility !== 'read-only') throw new Error('doc must be read-only (host publishes the file)');
if (manifest.data.follow.visibility !== 'read-write') throw new Error('follow must be read-write');
if (!manifest.lead || manifest.lead[0].id !== 'cursor') throw new Error('lead must name the follow cursor');

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false');
}
if (listing.basedOn.name !== 'epub.js') throw new Error('basedOn.name must be epub.js');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('listing.porter must be GifOS');
if (!listing.author || /gifos/i.test(listing.author.name)) {
  throw new Error('author is FuturePress, never GifOS');
}
if (listing.license !== 'BSD-2-Clause') throw new Error('listing.license must be BSD-2-Clause');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/epub-reader') {
  throw new Error('listing.homepage must be the gifos tree');
}
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}
if (/\bDrop\b/.test(listing.tagline) || /\bDrop\b/.test(listing.description)) {
  throw new Error('listing copy: say Open, not Drop');
}

const sample = await sampleEpubBytes();
if (sample.subarray(0, 2).toString() !== 'PK') throw new Error('sample EPUB is not a ZIP');
if (sample.length < 800) throw new Error('sample EPUB is too small');
if (!sample.toString('latin1').includes('application/epub+zip')) {
  throw new Error('sample EPUB missing the mimetype');
}
{
  const { createRequire } = await import('node:module');
  const req = createRequire(join(dir, 'sample.mjs'));
  const JSZip = req(join(dir, 'vendor', 'jszip.min.js'));
  const z = await JSZip.loadAsync(sample);
  const names = Object.keys(z.files);
  for (const need of ['mimetype', 'META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/c1.xhtml']) {
    if (!names.includes(need)) throw new Error('sample EPUB missing ' + need);
  }
  const title = await z.file('OEBPS/title.xhtml').async('string');
  if (!title.includes('Paper Boats')) throw new Error('sample EPUB missing “Paper Boats”');
  const c1 = await z.file('OEBPS/c1.xhtml').async('string');
  if (!c1.includes('Folding a boat')) throw new Error('sample EPUB missing “Folding a boat”');
}
writeFileSync(join(dir, 'sample.epub'), sample);

const sampleJs = 'window.SAMPLE_EPUB_B64=' + JSON.stringify(sample.toString('base64')) + ';';

const SCRIPTS = ['vendor/jszip.min.js', 'vendor/epub.min.js', 'sample.js', 'viewer.js', 'net.js', 'touch.js', 'boot.js'];

copyFileSync(join(dir, 'vendor', 'COPYING-epubjs.txt'), join(dir, 'COPYING-epubjs.txt'));
copyFileSync(join(dir, 'vendor', 'COPYING-jszip.txt'), join(dir, 'COPYING-jszip.txt'));

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/jszip.min.js': read('vendor/jszip.min.js'),
  'vendor/epub.min.js': read('vendor/epub.min.js'),
  'sample.js': sampleJs,
  'viewer.js': read('viewer.js'),
  'net.js': read('net.js'),
  'touch.js': read('touch.js'),
  'boot.js': read('boot.js'),
  'COPYING-epubjs.txt': read('vendor/COPYING-epubjs.txt'),
  'COPYING-jszip.txt': read('vendor/COPYING-jszip.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
  'sample.epub': sample
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
  throw new Error('index.html has an external URL');
}
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /<button\b[^>]*id=["'][^"']*invite/i.test(html)) {
  throw new Error('do not draw an Invite button — that is OS chrome');
}
if (!files['boot.js'].includes('Invite') && !files['index.html'].includes('Invite')) {
  throw new Error('tell the person to press Invite');
}
if (!files['index.html'].includes('id="point-toggle"')) {
  throw new Error('Point must be a toggle — it must not steal text selection');
}
if (!files['boot.js'].includes('onBack')) throw new Error('boot.js must register gifos.onBack');
if (!files['net.js'].includes("db('save')") || !files['net.js'].includes("id: 'last'")) {
  throw new Error('net.js must save the last file privately');
}
if (!files['viewer.js'].includes('ePub')) {
  throw new Error('viewer.js must use epub.js Book');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s) && n !== 'sample.js' && !n.startsWith('vendor/')) {
    throw new Error(n + ' contains </script — cannot inline safely');
  }
  if (n.startsWith('vendor/') || n === 'sample.js') continue;
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — the classic-script inline path cannot carry it.');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING-epubjs.txt'].includes('FuturePress')) {
  throw new Error('COPYING-epubjs.txt is not the BSD notice');
}
if (!files['COPYING-jszip.txt'].includes('MIT')) {
  throw new Error('COPYING-jszip.txt is not the MIT notice');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: epubReaderIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'epub-reader', 'epub-reader.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/epub-reader/epub-reader.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
