// Pack apps/webamp/ into site/apps/webamp/webamp.gif.
// Offline and deterministic: everything it reads is committed.
// Cover is a real first-boot photograph (shot.mjs, needs Chromium).
//
// Run:  node apps/webamp/build.mjs
import { webampIcon } from './icon.mjs';
import { captureCover } from './shot.mjs';
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

if (!existsSync(join(dir, 'vendor', 'webamp.bundle.min.js'))) {
  throw new Error('vendor/webamp.bundle.min.js is missing — run node apps/webamp/vendor.mjs');
}
if (!existsSync(join(dir, 'vendor', 'COPYING-webamp.txt'))) {
  throw new Error('vendor/COPYING-webamp.txt is missing — the MIT notice must ride inside the GIF');
}

if (manifest.minBuild !== 2154) throw new Error('minBuild must be 2154 — capabilities.links');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('webamp has no network path');
if (!manifest.data || manifest.data.library.visibility !== 'private') {
  throw new Error('library must be private — MP3s stay in the file, not on the invite');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('room must be read-write — shared playlist + EQ');
}
if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false');
}
if (listing.author.name === 'GifOS') throw new Error('author is Jordan Eldredge, never GifOS');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter must be GifOS');
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'CDN']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const help = read('help.md').replace(/^\uFEFF/, '');
if (help.trim().length < 400) throw new Error('help.md is too short');
if (!/^#\s+Webamp/.test(help.trim())) throw new Error('help.md must start with # Webamp');

const SCRIPTS = ['vendor/webamp.bundle.min.js', 'net.js', 'touch.js', 'demo.js', 'boot.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/webamp.bundle.min.js': read('vendor/webamp.bundle.min.js'),
  'net.js': read('net.js'),
  'touch.js': read('touch.js'),
  'demo.js': read('demo.js'),
  'boot.js': read('boot.js'),
  'COPYING-webamp.txt': read('vendor/COPYING-webamp.txt'),
  'help.md': help,
};

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) {
  throw new Error('index.html has an external URL');
}
if (/<button[^>]*>\s*Invite/i.test(html) || /id=["']invite/i.test(html)) {
  throw new Error('invite is OS chrome');
}
if (!files['vendor/webamp.bundle.min.js'].includes('.Webamp=')) {
  throw new Error('bundle is not the Webamp UMD');
}
for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
}
for (const n of ['boot.js', 'net.js', 'touch.js', 'demo.js']) {
  if (/jsdelivr|unpkg\.com|cdn\./i.test(files[n])) throw new Error(n + ' mentions a CDN');
}
if (!files['boot.js'].includes("eq: eq") || !files['boot.js'].includes("id: 'prefs'")) {
  throw new Error('boot.js must persist eq on the prefs row');
}
if (!files['net.js'].includes('p.id === me.id')) {
  throw new Error('net.js must exclude self from the live roster');
}
if (!files['demo.js'].includes('Intro') || !files['demo.js'].includes('Green LED') || !files['demo.js'].includes('On a Plane')) {
  throw new Error('demo.js must name the three first-boot tracks');
}

const shot = await captureCover();
const shotBuf = readFileSync(shot.path);
if (shotBuf[0] !== 0x89 || shotBuf[1] !== 0x50) throw new Error('screenshot is not a PNG');
if (shotBuf.length < 8000) throw new Error('screenshot.png looks empty');

const bytes = await gif.encode(files, { preview: webampIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'webamp', 'webamp.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/webamp/webamp.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('wrote apps/webamp/screenshot.png —', (shotBuf.length / 1024).toFixed(0), 'KB', shot.clip);
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
