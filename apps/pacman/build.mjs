// Pack apps/pacman/ into site/apps/pacman/pacman.gif.
// Node 18: CompressionStream polyfill BEFORE importing gifos-gif.js.
//
// Run:  node apps/pacman/build.mjs
import { pacmanIcon, screenshotPng } from './icon.mjs';
import { createHash } from 'node:crypto';
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

for (const need of [
  'vendor/game.js', 'vendor/index.js',
  'vendor/COPYING-pacman.txt', 'vendor/UPSTREAM.txt'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

const GAME_SHA256 = '35f9211114dce72d814f6a3af33072db97a2a0da3c79f099eadab196d568b3f5';
const gameBuf = readFileSync(join(dir, 'vendor', 'game.js'));
const gameHex = createHash('sha256').update(gameBuf).digest('hex');
if (gameHex !== GAME_SHA256) {
  throw new Error('vendor/game.js sha256 ' + gameHex + ' ≠ pin ' + GAME_SHA256);
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'pacman') throw new Error('appId must be pacman');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('manifest must declare capabilities.db and capabilities.multiplayer');
}
if (manifest.capabilities.network) throw new Error('pacman has no network path');
if (!manifest.data || !manifest.data.save || manifest.data.save.visibility !== 'private') {
  throw new Error('save must be private');
}
if (!manifest.data.players || manifest.data.players.visibility !== 'read-write') {
  throw new Error('players must be read-write');
}

if (!listing.basedOn || listing.basedOn.blessed !== false) {
  throw new Error('basedOn.blessed must be false');
}
if (listing.basedOn.url !== 'https://github.com/mumuy/pacman') {
  throw new Error('basedOn.url must be mumuy/pacman');
}
if (!listing.porter || listing.porter.name !== 'GifOS') {
  throw new Error('listing.porter must be GifOS');
}
if (!listing.author || /gifos/i.test(listing.author.name)) {
  throw new Error('author is Haole Zheng / mumuy, never GifOS');
}
if (listing.license !== 'MIT') throw new Error('listing.license must be MIT');
if (!listing.categories || listing.categories[0] !== 'Games') {
  throw new Error('listing.categories must start with Games');
}
if (listing.releaseDate !== '2026-08-24') throw new Error('listing.releaseDate must be 2026-08-24');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/pacman') {
  throw new Error('listing.homepage must be the gifos tree');
}
if (listing.tagline.length > 120) throw new Error('tagline is over 120 chars');

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}

const SCRIPTS = ['vendor/game.js', 'vendor/index.js', 'boot.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/game.js': gameBuf.toString('utf8'),
  'vendor/index.js': read('vendor/index.js'),
  'boot.js': read('boot.js'),
  'COPYING-pacman.txt': read('vendor/COPYING-pacman.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md is too short (' + helpMd.length + ')');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('index.html does not load style.css');
if (/type=["']module["']/.test(html)) throw new Error('classic scripts only');
if (/(?:src|href)\s*=\s*["']https?:/i.test(html)) throw new Error('index.html loads a remote URL');
if (/href\s*=\s*["']#/.test(html)) throw new Error('index.html has href="#"');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || html.includes('id="invite"')) {
  throw new Error('Invite is OS chrome');
}

const maps = (files['vendor/index.js'].match(/'map':/g) || []).length;
if (maps !== 12) throw new Error('expected 12 mazes, got ' + maps);
if (!files['vendor/index.js'].includes('window.Pacman')) {
  throw new Error('index.js must expose window.Pacman');
}
if (files['vendor/index.js'].includes('new FontFace') || files['vendor/index.js'].includes('window.open')) {
  throw new Error('index.js still has FontFace or window.open');
}
if (!files['boot.js'].includes('data-key') && !files['index.html'].includes('data-key')) {
  throw new Error('d-pad missing');
}
if (!files['boot.js'].includes("db('save')") || !files['boot.js'].includes("db('players')")) {
  throw new Error('boot.js must save hi-score and publish cabinet rows');
}
if (!files['boot.js'].includes('onBack')) throw new Error('onBack required');
if (!files['boot.js'].includes('bestLevel')) throw new Error('furthest maze must be saved');
if (!files['boot.js'].includes('phoneish') && !files['style.css'].includes('pointer: coarse')) {
  throw new Error('pad must show on a phone without waiting for first touch');
}
if (!files['vendor/index.js'].includes('steer:')) throw new Error('Pacman.steer required');
if (/Namco|NAMCO|Bandai/i.test(files['vendor/game.js'] + files['vendor/index.js'] + files['boot.js'] + files['index.html'])) {
  throw new Error('do not ship Namco/Bandai in the product');
}

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (n.startsWith('vendor/')) continue;
  if (/^\s*import\s|export\s+\{|export default|import\.meta/m.test(s)) {
    throw new Error(n + ' uses ESM syntax');
  }
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}
if (!files['COPYING-pacman.txt'].includes('Haole Zheng')) {
  throw new Error('COPYING-pacman.txt is not Haole Zheng\'s MIT notice');
}

if (!process.argv.includes('--keep-shot')) {
  const shot = screenshotPng();
  if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
  if (shot.length < 1000) throw new Error('screenshot png looks empty');
  writeFileSync(join(dir, 'screenshot.png'), shot);
}

const bytes = await gif.encode(files, { preview: pacmanIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'pacman', 'pacman.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/pacman/pacman.gif —', bytes.length, 'bytes,', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
