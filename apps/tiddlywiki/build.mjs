// Pack apps/tiddlywiki/ into the finished, downloadable
// site/apps/tiddlywiki/tiddlywiki.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/wiki.html.gz from
// the pinned TiddlyWiki5 tag and is run only when the pin moves.
//
// Run:  node apps/tiddlywiki/build.mjs
import { tiddlywikiIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync, gunzipSync } from 'node:zlib';
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

if (!existsSync(join(dir, 'vendor', 'wiki.html.gz'))) {
  throw new Error('vendor/wiki.html.gz is missing — run node apps/tiddlywiki/vendor.mjs first (it needs the network).');
}

const wiki = gunzipSync(readFileSync(join(dir, 'vendor', 'wiki.html.gz'))).toString('utf8');
if (!wiki.includes('tiddlywiki-tiddler-store')) {
  throw new Error('vendor/wiki.html.gz is not a TiddlyWiki store');
}
if (!wiki.includes('suppressBoot') || !wiki.includes('src="boot.js"')) {
  throw new Error('vendor wiki HTML is missing the GifOS boot hooks — rerun vendor.mjs');
}
if (!wiki.includes('__twfn') || wiki.includes('Function("return " + code')) {
  throw new Error('vendor wiki HTML is missing the CSP eval patch — rerun vendor.mjs');
}
if (wiki.includes('editTextWidgetFactory(FramedEngine,SimpleEngine)') ||
    !wiki.includes('editTextWidgetFactory(SimpleEngine,SimpleEngine)')) {
  throw new Error('vendor wiki HTML still uses the framed editor iframe — rerun vendor.mjs');
}
if (!wiki.includes('href="style.css"')) {
  throw new Error('vendor wiki HTML does not load style.css');
}

const boot = read('boot.js');
if (/<\/script/i.test(boot)) throw new Error('boot.js contains </script — cannot inline safely');
if (/^\s*export\s|import\.meta/m.test(boot)) {
  throw new Error('boot.js uses ESM syntax — the classic-script inline path cannot carry it');
}

if (manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947 — this app needs nothing newer than the store');
}
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('tiddlywiki has no network path');
if (!manifest.data || !manifest.data.tiddlers || manifest.data.tiddlers.visibility !== 'read-write') {
  throw new Error('manifest.data.tiddlers must be read-write — the shared wiki has to sync');
}
if (!manifest.data.prefs || manifest.data.prefs.visibility !== 'private') {
  throw new Error('manifest.data.prefs must be private — open tabs stay on this device');
}
if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('listing.basedOn.blessed must be false — unofficial port');
}
if (listing.license !== 'BSD-3-Clause') {
  throw new Error('listing.license must be BSD-3-Clause');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': wiki,
  'style.css': read('style.css'),
  'boot.js': boot,
  'COPYING.txt': read('COPYING.txt'),
};

{
  const help = read('help.md').replace(/^\uFEFF/, '').trim();
  if (help.length < 400) throw new Error('help.md trimmed length is ' + help.length + ' (need >= 400)');
  files['help.md'] = help + '\n';
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: tiddlywikiIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'tiddlywiki', 'tiddlywiki.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/tiddlywiki/tiddlywiki.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
