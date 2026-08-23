// Pack apps/fortune-sheet/ into the finished, downloadable
// site/apps/fortune-sheet/fortune-sheet.gif (see apps/README.md).
// Uses the SAME codec the GifOS desktop and MCP server use (site/js/gifos-gif.js).
//
// Offline and deterministic: everything it reads is committed. The one step
// that needs the network is vendor.mjs, which rebuilds vendor/fortune-sheet.js
// from the pinned npm packages and is run only when the pin moves.
//
// Run:  node apps/fortune-sheet/build.mjs
import '../../site/js/gifos-gif.js'; // attaches globalThis.GifOS.gif
import { fortuneSheetIcon } from './icon.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const gif = globalThis.GifOS.gif;
const read = (p) => readFileSync(join(dir, p), 'utf8');

const manifest = JSON.parse(read('manifest.json'));

if (!existsSync(join(dir, 'vendor', 'fortune-sheet.js'))) {
  throw new Error('vendor/fortune-sheet.js is missing — run node apps/fortune-sheet/vendor.mjs first (it needs the network).');
}

const vendorJs = read('vendor/fortune-sheet.js');
const vendorCss = read('vendor/fortune-sheet.css');
for (const [n, s] of [['fortune-sheet.js', vendorJs], ['fortune-sheet.css', vendorCss]]) {
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script — cannot inline safely; escape it in vendor.mjs.');
}
if (/^\s*export\s|export\{|import\.meta/m.test(vendorJs)) {
  throw new Error('fortune-sheet.js uses ESM syntax — the classic-script inline path cannot carry it.');
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'app.js': read('app.js'),
  'vendor/fortune-sheet.js': vendorJs,
  'vendor/fortune-sheet.css': vendorCss,
  'COPYING-fortune-sheet.txt': read('vendor/COPYING-fortune-sheet.txt'),
  'COPYING-react.txt': read('vendor/COPYING-react.txt'),
};

{
  const help = read('help.md').trim();
  if (help.length < 400) throw new Error('help.md is too short (' + help.length + ')');
  files['help.md'] = help;
}

const html = files['index.html'];
for (const s of ['vendor/fortune-sheet.js', 'app.js']) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="vendor/fortune-sheet.css"')) throw new Error('index.html does not load vendor/fortune-sheet.css');
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');

const bytes = await gif.encode(files, { preview: fortuneSheetIcon(), accent: manifest.accent });
const outDir = join(dir, '..', '..', 'site', 'apps', 'fortune-sheet');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'fortune-sheet.gif');
writeFileSync(out, bytes);

const listing = JSON.parse(read('listing.json'));
const rec = {
  catalog: '1.0',
  slug: 'fortune-sheet',
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
  cover: '/apps/fortune-sheet/cover.jpg',
  screenshots: [],
  gif: '/apps/fortune-sheet/fortune-sheet.gif',
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

console.log('wrote site/apps/fortune-sheet/fortune-sheet.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
