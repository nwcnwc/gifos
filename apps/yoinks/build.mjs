// Pack apps/yoinks/ into site/apps/yoinks/yoinks.gif.
// screenshot.png is made separately by screenshot.mjs (it needs a browser).
import { yoinksIcon } from './icon.mjs';
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
        flush(controller) { controller.enqueue(new Uint8Array(deflateRawSync(Buffer.concat(chunks)))); }
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

for (const need of ['vendor/COPYING-yoinks.txt', 'vendor/UPSTREAM.txt', 'screenshot.png']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
if (manifest.appId !== 'yoinks') throw new Error('appId must be yoinks');
if (manifest.minBuild !== 2154) throw new Error('minBuild must be 2154 (capabilities.links)');
const caps = manifest.capabilities || {};
if (caps.db !== true) throw new Error('must declare capabilities.db');
if (caps.links !== true) throw new Error('must declare capabilities.links — the download is a new-tab hand-off');
if (!Array.isArray(caps.network) || caps.network.length !== 1 || caps.network[0] !== '*') {
  throw new Error('network must be exactly ["*"] — the instance is a user-supplied URL');
}
if (!manifest.data || manifest.data.prefs.visibility !== 'private' || manifest.data.history.visibility !== 'private') {
  throw new Error('prefs and history must be private');
}
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('basedOn.blessed must be false');
if (listing.basedOn.url !== 'https://github.com/pablostanley/yoinks') throw new Error('basedOn.url');
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter must be GifOS');
if (!listing.author || /gifos/i.test(listing.author.name)) throw new Error('author is them, never GifOS');
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
const listingBlob = JSON.stringify(listing) + manifest.description;
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', '1,800', '1800', 'Threads']) {
  if (listingBlob.includes(bad)) throw new Error('listing/manifest mentions ' + bad);
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'app.js': read('app.js'),
  'COPYING-yoinks.txt': read('vendor/COPYING-yoinks.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short (' + helpMd.length + ')');
  if (/gifos\.db|WASM|sandbox/i.test(helpMd)) throw new Error('help.md names OS internals');
  files['help.md'] = helpMd;
}
const html = files['index.html'];
if (!html.includes('src="app.js"') || !html.includes('href="style.css"')) throw new Error('index.html does not load app.js and style.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('index.html has an external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('do not draw an Invite button');

const js = files['app.js'];
if (/<\/script/i.test(js)) throw new Error('app.js contains </script');
if (/^\s*export\s|export\{|import\.meta/m.test(js) || /^\s*import\s/m.test(js)) throw new Error('app.js uses ESM');
for (const bad of ['XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(', 'innerHTML']) {
  if (js.includes(bad)) throw new Error('app.js uses ' + bad);
}
// The only network primitive is the bridge: every fetch is gifos.fetch.
if ((js.match(/\bfetch\(/g) || []).length !== (js.match(/gifos\.fetch\(/g) || []).length) throw new Error('app.js fetches outside the bridge');
if (!js.includes("db('prefs')") || !js.includes("db('history')")) throw new Error('app.js must keep prefs and history in the file');
if (!js.includes('alwaysProxy: true')) throw new Error('every answer must be a tunnel (attachment disposition), or a redirect target opens inline');
if (!js.includes("target = '_blank'") || !js.includes("root.open(target, '_blank')")) throw new Error('the hand-off is a new tab');
if (!js.includes('error.api.auth.jwt.missing')) throw new Error('the Turnstile refusal must be explained');
if (!js.includes('YOINKS_DEMO')) throw new Error('screenshot.mjs needs the demo hook');
for (const s of ['yoink any video. paste. yoink. done.', 'Paste a link', '↵ yoink another', 'that doesn’t look like a link — paste a full url']) {
  if (!js.includes(s)) throw new Error('upstream copy missing: ' + s);
}

const bytes = await gif.encode(files, { preview: yoinksIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'yoinks', 'yoinks.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/yoinks/yoinks.gif —', (bytes.length / 1024).toFixed(0), 'KB, from', Object.keys(files).length, 'files');
console.log('next: sign it (scripts/sign-apps.mjs yoinks), then node scripts/build-app-catalog.mjs');
