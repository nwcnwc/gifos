// Pack apps/signature-pad/ into the finished, downloadable
// site/apps/signature-pad/signature-pad.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/ from the pinned
// signature_pad release and is run only when the pin moves.
//
// Node 18: hat-sh CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/signature-pad/build.mjs
import { signaturePadIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

for (const need of ['vendor/signature_pad.js', 'vendor/COPYING-signature_pad.txt']) {
  if (!existsSync(join(dir, need))) {
    throw new Error(need + ' is missing — run node apps/signature-pad/vendor.mjs first (it needs the network).');
  }
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947 — this app needs nothing newer than the store.');
if (manifest.appId !== 'signature-pad') throw new Error('appId must be signature-pad');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private — the solo signature does not leave this device.');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('manifest.data.room must be read-write — the sheet has to sync.');
}
if (manifest.capabilities.network) throw new Error('signature-pad has no network path');
if (manifest.capabilities.wasm) throw new Error('do not declare wasm — the original is plain JS');
if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — unofficial port');
}
if (listing.basedOn.name !== 'signature_pad' || listing.basedOn.url !== 'https://github.com/szimek/signature_pad') {
  throw new Error('listing.basedOn must name signature_pad at github.com/szimek/signature_pad');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || listing.author.name !== 'szimek') {
  throw new Error('listing.author must be szimek');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Utilities') throw new Error('category must be Utilities');
if (listing.releaseDate !== '2026-08-23') throw new Error('releaseDate must be 2026-08-23');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/signature-pad') {
  throw new Error('listing.homepage must be the gifos tree');
}

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
}

const SCRIPTS = ['vendor/signature_pad.js', 'mp.js', 'app.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/signature_pad.js': read('vendor/signature_pad.js'),
  'mp.js': read('mp.js'),
  'app.js': read('app.js'),
  'COPYING-signature_pad.txt': read('vendor/COPYING-signature_pad.txt'),
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
if (/<button[^>]*>\s*Invite/i.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('invite is OS chrome — do not add an invite button');
}
if (!html.includes('Pass the pad')) throw new Error('index.html is missing Pass the pad');
if (!html.includes('id="pad"')) throw new Error('index.html is missing the pad canvas');

if (!files['style.css'].includes('touch-action: none')) {
  throw new Error('style.css must set touch-action: none on the pad — a finger signs, the page must not scroll');
}
if (!files['COPYING-signature_pad.txt'].includes('Szymon Nowak')) {
  throw new Error('COPYING-signature_pad.txt is not Szymon Nowak\'s MIT notice');
}

const src = files['mp.js'] + files['app.js'];
for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
  if (src.includes(bad)) throw new Error('a script uses ' + bad);
}
if (!files['mp.js'].includes("db('room')") || !files['app.js'].includes("db('save')")) {
  throw new Error('app must use gifos.db save + room');
}
if (!files['mp.js'].includes('id: me.id')) {
  throw new Error('mp.js must publish on the player\'s own row');
}
if (files['mp.js'].includes("id: 'board'") || files['mp.js'].includes('putBoard')) {
  throw new Error('there is no shared board — each person signs their own row');
}
if (!files['mp.js'].includes('Invite')) {
  throw new Error('mp.js must tell the player to press Invite');
}
if (files['mp.js'].includes('id="invite"') || files['app.js'].includes('id="invite"')) {
  throw new Error('Invite is OS chrome — do not draw a share button');
}
if (!files['app.js'].includes('toDataURL') || !files['app.js'].includes('signature.png')) {
  throw new Error('app.js must save a PNG');
}
if (!files['mp.js'].includes('saveSheet') || !files['mp.js'].includes('signature-sheet.png')) {
  throw new Error('mp.js must save the whole sheet as a PNG');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (n === 'vendor/signature_pad.js') continue; // generated UMD, already checked in vendor.mjs
  if (/\btype\s*=\s*["']module["']/.test(s) || /^\s*import\s/m.test(s) || /export\s+\{/.test(s) || /import\.meta/.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
}

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: signaturePadIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'signature-pad', 'signature-pad.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/signature-pad/signature-pad.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (UMD pad, no network)');
console.log('wrote apps/signature-pad/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
