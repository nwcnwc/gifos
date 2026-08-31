// Pack apps/hextris/ into the finished, downloadable
// site/apps/hextris/hextris.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed.
//
// Run:  node apps/hextris/build.mjs
import { hextrisIcon, screenshotPng } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
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
const VENDOR_JS = [
  'vendor/save-state.js',
  'vendor/view.js',
  'vendor/wavegen.js',
  'vendor/math.js',
  'vendor/Block.js',
  'vendor/Hex.js',
  'vendor/Text.js',
  'vendor/comboTimer.js',
  'vendor/checking.js',
  'vendor/update.js',
  'vendor/render.js',
  'vendor/input.js',
  'vendor/main.js',
  'vendor/initialization.js',
];
const SCRIPTS = ['jq.js', ...VENDOR_JS, 'net.js', 'touch.js', 'boot.js'];
const IMAGES = readdirSync(join(dir, 'images')).filter((n) => n.endsWith('.svg'));

for (const s of VENDOR_JS) {
  if (!existsSync(join(dir, s))) throw new Error(s + ' is missing');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'jq.js': read('jq.js'),
  'net.js': read('net.js'),
  'touch.js': read('touch.js'),
  'boot.js': read('boot.js'),
  'COPYING.txt': read('COPYING.txt'),
  'COPYING-hextris.txt': read('vendor/COPYING-hextris.txt'),
};
{
  const llms = join(dir, '..', '..', 'site', 'llms.txt');
  if (existsSync(llms)) files['llms.txt'] = readFileSync(llms, 'utf8');
}
for (const s of VENDOR_JS) files[s] = read(s);
for (const n of IMAGES) files['images/' + n] = read('images/' + n);

{
  const help = read('help.md').trim();
  if (help.length < 400) throw new Error('help.md is too short (' + help.length + ')');
  files['help.md'] = help;
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (manifest.name !== 'Hextris') throw new Error('manifest.name must be Hextris');
if (!manifest.capabilities || manifest.capabilities.db !== true) {
  throw new Error('manifest must declare capabilities.db');
}
if (!manifest.capabilities.multiplayer) {
  throw new Error('manifest must declare capabilities.multiplayer');
}
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private');
}
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') {
  throw new Error('manifest.data.room must be read-write');
}
if (manifest.minBuild !== 947) {
  throw new Error('minBuild must be 947 — this app needs nothing newer than the store');
}
if (manifest.capabilities.network) throw new Error('hextris has no network path');

const listing = JSON.parse(read('listing.json'));
if (listing.basedOn?.name !== 'Hextris') throw new Error('listing.basedOn.name must be Hextris');
if (listing.license !== 'GPL-3.0-or-later') throw new Error('listing.license must be GPL-3.0-or-later');
if (!listing.porter) throw new Error('listing.porter is required for a port');

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/\btype\s*=\s*["']module["']/.test(s) || /^\s*import\s/m.test(s) || /export\s+\{/.test(s)) {
    throw new Error(n + ' uses ESM — the runtime drops type=module.');
  }
  if (/google-analytics|pagead2\.googlesyndication|fonts\.googleapis|54\.183\.184\.126|hextris\.io\/a\.js/i.test(s)) {
    throw new Error(n + ' still phones home or loads a CDN');
  }
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: hextrisIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'hextris', 'hextris.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/hextris/hextris.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
