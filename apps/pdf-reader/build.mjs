// Pack apps/pdf-reader/ into site/apps/pdf-reader/pdf-reader.gif.
// pdf.js 2.16 legacy rides IN the GIF. The worker source becomes
// window.PDF_WORKER_SRC (app mints a blob: Worker). Sample PDF becomes
// window.SAMPLE_PDF_B64. Same CompressionStream polyfill as asteroids.
import { pdfReaderIcon, screenshotPng } from './icon.mjs';
import { samplePdfBytes } from './sample.mjs';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
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

const PDF_SHA = '6c339beabbb74a9705608284b97155113bbefe1ce0011dc0bf3d25b8dc6b32ee';
const WORKER_SHA = '19bf7ed5cdfdbe980a68e5096bb20ab9862be8e65d9ae4f82ac18d2bcfacbb40';

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

for (const need of [
  'vendor/pdf.min.js', 'vendor/pdf.worker.min.js',
  'vendor/COPYING-pdfjs.txt', 'vendor/UPSTREAM.txt'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

const pdfLib = read('vendor/pdf.min.js');
const pdfWorker = read('vendor/pdf.worker.min.js');
if (sha256(bin('vendor/pdf.min.js')) !== PDF_SHA) {
  throw new Error('vendor/pdf.min.js sha256 drifted from UPSTREAM.txt');
}
if (sha256(bin('vendor/pdf.worker.min.js')) !== WORKER_SHA) {
  throw new Error('vendor/pdf.worker.min.js sha256 drifted from UPSTREAM.txt');
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'pdf-reader') throw new Error('appId must be pdf-reader');
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db');
}
if (!manifest.capabilities.multiplayer) throw new Error('manifest must declare capabilities.multiplayer');
if (!manifest.capabilities.wasm) throw new Error('manifest must declare capabilities.wasm — blob worker');
if (manifest.capabilities.network) throw new Error('pdf-reader has no network path');
if (!manifest.data || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private');
}
if (manifest.data.doc.visibility !== 'read-only') throw new Error('doc must be read-only (host publishes the file)');
if (manifest.data.follow.visibility !== 'read-write') throw new Error('follow must be read-write');
if (!manifest.lead || manifest.lead[0].id !== 'cursor') throw new Error('lead must name the follow cursor');

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false');
}
if (listing.basedOn.name !== 'PDF.js') throw new Error('basedOn.name must be PDF.js');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('listing.porter must be GifOS');
if (!listing.author || /gifos/i.test(listing.author.name)) {
  throw new Error('author is Mozilla, never GifOS');
}
if (listing.license !== 'Apache-2.0') throw new Error('listing.license must be Apache-2.0');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/pdf-reader') {
  throw new Error('listing.homepage must be the gifos tree');
}
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}
if (/\bDrop\b/.test(listing.tagline) || /\bDrop\b/.test(listing.description)) {
  throw new Error('listing copy: say Open, not Drop');
}

const sample = samplePdfBytes();
if (sample.subarray(0, 5).toString() !== '%PDF-') throw new Error('sample PDF is not a PDF');
if (sample.length < 800) throw new Error('sample PDF is too small');
{
  const latin = sample.toString('latin1');
  for (const needle of ['Paper Planes', 'Folding a dart', 'Why it glides', '%%EOF']) {
    if (!latin.includes(needle)) throw new Error('sample PDF missing “' + needle + '”');
  }
}
writeFileSync(join(dir, 'sample.pdf'), sample);

const workerJs = ('window.PDF_WORKER_SRC=' + JSON.stringify(pdfWorker) + ';').split('</').join('<\\/');
const sampleJs = 'window.SAMPLE_PDF_B64=' + JSON.stringify(sample.toString('base64')) + ';';

const SCRIPTS = ['vendor/pdf.min.js', 'pdf-worker.js', 'sample.js', 'viewer.js', 'net.js', 'touch.js', 'boot.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/pdf.min.js': pdfLib,
  'pdf-worker.js': workerJs,
  'sample.js': sampleJs,
  'viewer.js': read('viewer.js'),
  'net.js': read('net.js'),
  'touch.js': read('touch.js'),
  'boot.js': read('boot.js'),
  'COPYING-pdfjs.txt': read('vendor/COPYING-pdfjs.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
  'sample.pdf': sample,
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
if (!files['viewer.js'].includes('isEvalSupported: false')) {
  throw new Error('viewer.js must disable pdf.js eval');
}
if (!files['viewer.js'].includes('workerPort')) {
  throw new Error('viewer.js must mint a blob worker and set workerPort');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s) && n !== 'pdf-worker.js') {
    throw new Error(n + ' contains </script — cannot inline safely');
  }
  if (n === 'vendor/pdf.min.js' || n === 'pdf-worker.js' || n === 'sample.js') continue;
  if (/^\s*export\s|export\{|import\.meta/m.test(s) || /^\s*import\s/m.test(s)) {
    throw new Error(n + ' uses ESM syntax — the classic-script inline path cannot carry it.');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING-pdfjs.txt'].includes('Apache License')) {
  throw new Error('COPYING-pdfjs.txt is not the Apache-2.0 notice');
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: pdfReaderIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'pdf-reader', 'pdf-reader.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/pdf-reader/pdf-reader.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
