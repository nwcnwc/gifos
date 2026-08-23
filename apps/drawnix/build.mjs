// Pack apps/drawnix/ into the finished, downloadable
// site/apps/drawnix/drawnix.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/drawnix.js from
// the pinned upstream and is run only when the pin moves.
//
// Run:  node apps/drawnix/build.mjs
import { drawnixIcon } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Node 18's CompressionStream rejects 'deflate-raw' (the format gifos-gif.js
// uses). Node 20+ is fine. Same polyfill as dante/excalidraw/build.mjs.
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

if (!existsSync(join(dir, 'vendor', 'drawnix.js'))) {
  throw new Error('vendor/drawnix.js is missing — run node apps/drawnix/vendor.mjs first (it needs the network).');
}

const SCRIPTS = ['boot.js', 'vendor/drawnix.js'];

const vendorJs = read('vendor/drawnix.js');
if (/^\s*export\s|export\{|import\.meta/m.test(vendorJs)) {
  throw new Error('vendor/drawnix.js uses ESM syntax — the classic-script inline path cannot carry it.');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'boot.js': read('boot.js'),
  'vendor/drawnix.js': vendorJs,
  'vendor/drawnix.css': read('vendor/drawnix.css'),
  'COPYING-drawnix.txt': read('vendor/COPYING-drawnix.txt'),
};
if (existsSync(join(dir, 'vendor', 'COPYING-react.txt'))) {
  files['COPYING-react.txt'] = read('vendor/COPYING-react.txt');
}
{
  const helpMd = read('help.md');
  if (helpMd.trim().length < 400) throw new Error('help.md is too short — OS Help needs a real guide');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="vendor/drawnix.css"')) throw new Error('index.html does not load vendor/drawnix.css');
if (/<\/script/i.test(files['vendor/drawnix.js'])) {
  throw new Error('vendor/drawnix.js contains </script — cannot inline safely.');
}

const bytes = await gif.encode(files, { preview: drawnixIcon(), accent: manifest.accent });
const outDir = join(dir, '..', '..', 'site', 'apps', 'drawnix');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'drawnix.gif'), bytes);

const listing = JSON.parse(read('listing.json'));
const rec = {
  catalog: '1.0',
  slug: 'drawnix',
  appId: manifest.appId,
  name: manifest.name,
  shortName: manifest.shortName,
  version: manifest.version,
  minBuild: manifest.minBuild,
  tagline: listing.tagline,
  description: listing.description,
  author: listing.author,
  releaseDate: listing.releaseDate,
  updated: listing.updated || listing.releaseDate,
  categories: listing.categories,
  tags: listing.tags || [],
  license: listing.license,
  homepage: listing.homepage || '',
  accent: manifest.accent || null,
  capabilities: manifest.capabilities || {},
  cover: '/apps/drawnix/cover.jpg',
  screenshots: [],
  gif: '/apps/drawnix/drawnix.gif',
  bytes: bytes.length,
  download: 0,
  provides: null,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  signature: null,
  porter: listing.porter,
  basedOn: listing.basedOn,
};
writeFileSync(join(outDir, 'app.json'), JSON.stringify(rec, null, 2) + '\n');

const coverSrc = join(dir, listing.cover || 'screenshot.png');
const coverOut = join(outDir, 'cover.jpg');
if (!existsSync(coverSrc)) throw new Error('cover art missing at ' + (listing.cover || 'screenshot.png'));
if (!existsSync(coverOut) || statSync(coverSrc).mtimeMs > statSync(coverOut).mtimeMs) {
  const sharp = (await import('sharp')).default;
  const jpg = await sharp(coverSrc)
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toBuffer();
  writeFileSync(coverOut, jpg);
}

console.log('wrote site/apps/drawnix/drawnix.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
