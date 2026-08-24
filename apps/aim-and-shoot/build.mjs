// Pack apps/aim-and-shoot/ into site/apps/aim-and-shoot/aim-and-shoot.gif.
import { aimIcon, screenshotPng } from './icon.mjs';
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
const bin = (p) => readFileSync(join(dir, p));

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

const PINS = {
  'Player.js': 'b010c7324463d4e6b56d5d3831427105b40b568ecac111de2d43585ada2eb9a2',
  'Bullet.js': 'eb3e451f55573e261fa3a17c7f1d1888c73aa4c01e9a5a736021b520902df61b',
  'Matrix.js': 'e7eea4cdf5858be52cde0147525f5d5d617ae238a8c3ad125890cfbb54cdc04c',
  'Dejavu.js': '5193c1cce4633619b24ae27321ecd8df5bd84b90dfddf5c8f59cd3a4d10aa071',
  'Genetics.js': 'c91036b02430099c173b569c44035c744f6d4361ba38aa1fb4ed84ced4423bef',
  'GuiControls.js': '6c51a5e7f3845b18b474ed51e309883bc59f6fb935833ad88c4a077419e95e4f',
  'artwork.png': 'c757762e78bac918a1de3e3ec94352e481ee3d21c49dabb8343b4c425c6f07f8',
  'shoot.mp3': 'd7afb9a1abd8e35598c14442f16f033ca874c01d7a7c594863d8f663b344666a',
};
for (const [name, pin] of Object.entries(PINS)) {
  const buf = bin('vendor/' + name);
  const hex = createHash('sha256').update(buf).digest('hex');
  if (hex !== pin) throw new Error('vendor/' + name + ' sha256 ' + hex + ' ≠ pin ' + pin);
}

if (manifest.minBuild !== 947) throw new Error('minBuild must be 947');
if (manifest.appId !== 'aim-and-shoot') throw new Error('appId');
if (!manifest.capabilities.db || !manifest.capabilities.multiplayer) throw new Error('db+multiplayer');
if (manifest.capabilities.network) throw new Error('no network');
if (listing.basedOn.blessed !== false) throw new Error('unofficial');
if (listing.basedOn.url !== 'https://github.com/victorqribeiro/aimAndShoot') throw new Error('basedOn.url');
if (listing.porter.name !== 'GifOS') throw new Error('porter');
if (/gifos/i.test(listing.author.name)) throw new Error('author is Victor Ribeiro');
if (listing.license !== 'MIT' || listing.categories[0] !== 'Games') throw new Error('listing');
if (listing.releaseDate !== '2026-08-24') throw new Error('releaseDate');
if (listing.tagline.length > 120) throw new Error('tagline');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage']) {
  if (listingBlob.includes(bad)) throw new Error('listing mentions ' + bad);
}

const art = bin('vendor/artwork.png');
const shot = bin('vendor/shoot.mp3');
const assetsJs = 'window.AAS=window.AAS||{};\n'
  + 'AAS.artwork="data:image/png;base64,' + art.toString('base64') + '";\n'
  + 'AAS.shot="data:audio/mpeg;base64,' + shot.toString('base64') + '";\n';
writeFileSync(join(dir, 'vendor', 'assets.js'), assetsJs);

const SCRIPTS = [
  'vendor/assets.js', 'vendor/Player.js', 'vendor/Bullet.js', 'vendor/Matrix.js',
  'vendor/Dejavu.js', 'vendor/Genetics.js', 'vendor/GuiControls.js', 'vendor/main.js', 'boot.js'
];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/assets.js': assetsJs,
  'vendor/Player.js': read('vendor/Player.js'),
  'vendor/Bullet.js': read('vendor/Bullet.js'),
  'vendor/Matrix.js': read('vendor/Matrix.js'),
  'vendor/Dejavu.js': read('vendor/Dejavu.js'),
  'vendor/Genetics.js': read('vendor/Genetics.js'),
  'vendor/GuiControls.js': read('vendor/GuiControls.js'),
  'vendor/main.js': read('vendor/main.js'),
  'boot.js': read('boot.js'),
  'COPYING-aim-and-shoot.txt': read('vendor/COPYING-aim-and-shoot.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short');
  files['help.md'] = helpMd;
}

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (/type=["']module["']/.test(html)) throw new Error('no type=module');
if (html.includes('id="invite"')) throw new Error('Invite is OS chrome');
if (!files['vendor/main.js'].includes('AAS.artwork') || !files['vendor/main.js'].includes('AASShowPad')) {
  throw new Error('main.js patches missing');
}
if (!files['boot.js'].includes("db('save')")) throw new Error('boot must save');

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
  if (n.startsWith('vendor/')) continue;
  if (/^\s*import\s|export\s+\{|import\.meta/m.test(s)) throw new Error(n + ' ESM');
}

const cover = screenshotPng();
if (cover[0] !== 0x89) throw new Error('screenshot not png');
writeFileSync(join(dir, 'screenshot.png'), cover);

const bytes = await gif.encode(files, { preview: aimIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'aim-and-shoot', 'aim-and-shoot.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/aim-and-shoot/aim-and-shoot.gif —', bytes.length, 'bytes,',
            (bytes.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
