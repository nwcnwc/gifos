// Pack apps/grid-garden/ into site/apps/grid-garden/grid-garden.gif.
// Uses the SAME codec the GifOS desktop uses (site/js/gifos-gif.js).
//
// Run:  node apps/grid-garden/build.mjs
import { gardenIcon } from './icon.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

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

const IMAGES = [
  'carrots.svg', 'carrots-correct.svg', 'weeds.svg', 'weeds-correct.svg',
  'dirt.svg', 'water.svg', 'poison.svg', 'froggy.svg', 'carrots-win.png',
];
for (const name of IMAGES) {
  if (!existsSync(join(dir, 'vendor', 'images', name))) {
    throw new Error('vendor/images/' + name + ' is missing');
  }
}
for (const need of ['vendor/levels.js', 'vendor/docs.js', 'vendor/messages.js', 'vendor/game.js',
                    'COPYING.txt', 'COPYING-images.txt', 'help.md']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(read('vendor/levels.js'), sandbox);
if (!sandbox.levels || sandbox.levels.length !== 28) {
  throw new Error('expected 28 levels, got ' + (sandbox.levels && sandbox.levels.length));
}
if (!sandbox.levelWin || sandbox.levelWin.name !== 'win') {
  throw new Error('levelWin is missing');
}

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

if (manifest.appId !== 'grid-garden') throw new Error('appId must be grid-garden');
if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('grid-garden has no network path');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('manifest.data.save must be private');
}
if (!manifest.data.garden || manifest.data.garden.visibility !== 'read-write') {
  throw new Error('manifest.data.garden must be read-write — the shared plot has to sync');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('manifest.data.players must be read-write');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false');
}
if (listing.author && listing.author.name === 'GifOS') {
  throw new Error('author is Thomas Park, never GifOS');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('porter must be GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
{
  const tag = String(listing.tagline || '').toLowerCase();
  if (!/invite|offline|save/.test(tag)) {
    throw new Error('tagline must sell the GifOS reason');
  }
  const desc = String(listing.description || '');
  if (!/invite|file is the save|offline/i.test(desc.slice(0, 280))) {
    throw new Error('description must lead with why this version');
  }
  if (!/unofficial/i.test(desc)) throw new Error('description must say unofficial');
}

const helpMd = read('help.md');
if (helpMd.trim().length < 400) throw new Error('help.md is too short');

const SCRIPTS = ['vendor/levels.js', 'vendor/docs.js', 'vendor/messages.js',
                 'vendor/game.js', 'net.js', 'boot.js'];

let css = read('style.css');
css = css.replace(/url\(['"]?vendor\/images\/([^)'"]+)['"]?\)/g, (_, name) => {
  const buf = bin('vendor/images/' + name);
  const mime = name.endsWith('.png') ? 'image/png' : 'image/svg+xml';
  return 'url(data:' + mime + ';base64,' + buf.toString('base64') + ')';
});
if (/url\(['"]?vendor\//.test(css)) throw new Error('style.css still has a vendor image url');

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': css,
  'vendor/levels.js': read('vendor/levels.js'),
  'vendor/docs.js': read('vendor/docs.js'),
  'vendor/messages.js': read('vendor/messages.js'),
  'vendor/game.js': read('vendor/game.js'),
  'net.js': read('net.js'),
  'boot.js': read('boot.js'),
  'help.md': helpMd,
  'COPYING.txt': read('COPYING.txt'),
  'COPYING-images.txt': read('COPYING-images.txt'),
};
for (const name of IMAGES) {
  files['vendor/images/' + name] = bin('vendor/images/' + name);
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type\s*=\s*["']module["']/.test(html)) {
  throw new Error('index.html uses type=module — classic scripts only');
}
if (/src=["']https?:/i.test(html) || /fonts\.googleapis/i.test(html + css)) {
  throw new Error('remote script or webfont — nothing may be fetched');
}

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  const text = typeof s === 'string' ? s : s.toString('utf8');
  if (/<\/script/i.test(text)) throw new Error(n + ' contains </script — cannot inline safely');
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(text)) {
    throw new Error(n + ' uses ESM syntax — classic scripts only');
  }
  for (const bad of ['localStorage', 'fonts.googleapis', 'google-analytics', 'XMLHttpRequest']) {
    if (text.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['net.js'].includes('Invite') || !files['net.js'].includes('garden')) {
  throw new Error('net.js must share the garden and mention Invite');
}
{
  const rawCss = read('style.css');
  if (/\.plant \.bg[\s\S]{0,200}background-size:\s*100%\s*100%/.test(rawCss) ||
      /\.plot \{[\s\S]{0,280}background-size:\s*100%\s*100%/.test(rawCss)) {
    throw new Error('garden sheets must tile at one cell (--cell / 20cqw), not stretch 100%');
  }
  if (!rawCss.includes('--cell') || !rawCss.includes('background-repeat: repeat')) {
    throw new Error('style.css must size the carrot/weed/water/dirt sheet to one cell and repeat');
  }
}

const shotPath = join(dir, 'screenshot.png');
if (!existsSync(shotPath)) throw new Error('screenshot.png is missing — capture the real window at level 16');
const shot = readFileSync(shotPath);
if (shot.length < 40000 || shot[0] !== 0x89 || shot[1] !== 0x50) {
  throw new Error('screenshot.png must be a real PNG of the running garden at level 16, not a mockup');
}

const bytes = await gif.encode(files, { preview: gardenIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'grid-garden', 'grid-garden.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/grid-garden/grid-garden.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files (28 levels, English, no network)');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
