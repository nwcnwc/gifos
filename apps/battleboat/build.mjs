// Pack apps/battleboat/ into the finished, downloadable
// site/apps/battleboat/battleboat.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Run:  node apps/battleboat/build.mjs
import { battleboatIcon, screenshotPng } from './icon.mjs';
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

const SCRIPTS = ['game.js', 'net.js', 'app.js'];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'game.js': read('game.js'),
  'net.js': read('net.js'),
  'app.js': read('app.js'),
  'COPYING-battleboat.txt': read('vendor/COPYING-battleboat.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
if (!existsSync(join(dir, 'help.md'))) throw new Error('help.md is missing');
{
  const helpMd = read('help.md');
  if (helpMd.trim().length < 400) throw new Error('help.md is too short');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('index.html uses type=module — classic scripts only');
if (/serviceWorker|sw\.js/.test(html)) throw new Error('index.html registers a service worker — drop it');
if (/google-analytics|fonts\.googleapis|fonts\.gstatic/i.test(html + files['app.js'] + files['game.js'] + files['net.js'])) {
  throw new Error('still pulls analytics or a webfont');
}
if (/\blocalStorage\b/.test(files['app.js'] + files['game.js'] + files['net.js'] + html)) {
  throw new Error('do not use localStorage — gifos.db is the store');
}
if (manifest.capabilities && manifest.capabilities.network) {
  throw new Error('battleboat has no network path');
}
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare db + multiplayer');
}
if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — unofficial port');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || listing.author.name !== 'billmei') {
  throw new Error('listing.author must be billmei');
}
if (listing.basedOn.name !== 'Battleboat' || listing.basedOn.url !== 'https://github.com/billmei/battleboat') {
  throw new Error('listing.basedOn must name Battleboat at github.com/billmei/battleboat');
}
if (listing.cover !== 'screenshot.png') throw new Error('listing.cover must be screenshot.png');
if (listing.tagline.length > 120) throw new Error('tagline is over 120 chars');
{
  const listingBlob = JSON.stringify(listing);
  for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'gifos.fetch', 'CORS', 'COOP', 'Argon2', 'CDN', 'Node', 'relay']) {
    if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad + ' — keep it non-technical');
  }
  const lead = (listing.tagline + '\n' + listing.description).toLowerCase();
  if (!/fleet/.test(lead) || !/link|invite/.test(lead)) {
    throw new Error('listing must lead with the fleet and the link');
  }
  if (!/unofficial/.test(lead) || !/bill mei/.test(lead)) {
    throw new Error('listing must credit Bill Mei as unofficial');
  }
  if (/\bbattleship\b/i.test(listing.tagline + listing.description + listing.name)) {
    throw new Error('do not say Battleship in store copy — the store name is Battleboat');
  }
}
if (!files['app.js'].includes('coverShot')) {
  throw new Error('app.js must expose coverShot for the store cover');
}
if (!html.includes('id="huntBar"')) throw new Error('index.html must include the hunt remaining-ship bar');
if (!files['app.js'].includes('setPhase')) {
  throw new Error('app.js must set body.place / body.hunting for the phone grid');
}
for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/^\s*export\s|export\{|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM — classic-script inline path cannot carry it');
  }
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
}

const shotPath = join(dir, 'screenshot.png');
if (!existsSync(shotPath)) writeFileSync(shotPath, screenshotPng());
const shot = readFileSync(shotPath);
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot.png is not a PNG');

const bytes = await gif.encode(files, { preview: battleboatIcon(), accent: manifest.accent });
const outDir = join(dir, '..', '..', 'site', 'apps', 'battleboat');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'battleboat.gif'), bytes);
console.log('wrote site/apps/battleboat/battleboat.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('kept apps/battleboat/screenshot.png —', (shot.length / 1024).toFixed(0), 'KB (retake with tools/shoot.js)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
