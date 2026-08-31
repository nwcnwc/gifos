// Pack apps/hexgl/ into site/apps/hexgl/hexgl.gif
import { hexglIcon, screenshotPng } from './icon.mjs';
import { creditsJson, CREDITS_PATH } from '../../scripts/app-credits.mjs';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, posix } from 'node:path';

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
const readBin = (p) => readFileSync(join(dir, p));

const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));

const SCRIPTS = [
  'vendor/three.js',
  'vendor/ShaderExtras.js',
  'vendor/postprocessing/EffectComposer.js',
  'vendor/postprocessing/RenderPass.js',
  'vendor/postprocessing/BloomPass.js',
  'vendor/postprocessing/ShaderPass.js',
  'vendor/postprocessing/MaskPass.js',
  'vendor/Timer.js',
  'vendor/ImageData.js',
  'vendor/Utils.js',
  'vendor/RenderManager.js',
  'vendor/Shaders.js',
  'vendor/Particles.js',
  'vendor/Loader.js',
  'vendor/Audio.js',
  'vendor/HUD.js',
  'vendor/RaceData.js',
  'vendor/ShipControls.js',
  'vendor/ShipEffects.js',
  'vendor/CameraChase.js',
  'vendor/Gameplay.js',
  'vendor/Cityscape.js',
  'vendor/HexGL.js',
  'assets-index.js',
  'patch.js',
  'net.js',
  'touch.js',
  'boot.js',
];

for (const need of [
  'vendor/three.js', 'vendor/HexGL.js', 'vendor/COPYING-hexgl.txt',
  'vendor/COPYING-three.txt', 'vendor/COPYING-audio.txt', 'vendor/UPSTREAM.txt',
  'vendor/ASSET-LIST.txt', 'boot.js', 'patch.js', 'net.js', 'touch.js', 'help.md',
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing — run node apps/hexgl/vendor.mjs first');
}

const assetList = read('vendor/ASSET-LIST.txt').trim().split('\n').filter(Boolean);
const assetFiles = {};
const assetIndex = {};
for (const rel of assetList) {
  const buf = readBin(join('vendor', 'assets', rel));
  assetFiles['.assets/' + rel] = buf;
  assetIndex[rel] = buf.length;
}

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'COPYING-hexgl.txt': read('vendor/COPYING-hexgl.txt'),
  'COPYING-three.txt': read('vendor/COPYING-three.txt'),
  'COPYING-audio.txt': read('vendor/COPYING-audio.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
for (const s of SCRIPTS) {
  if (s === 'assets-index.js') continue;
  files[s] = read(s);
}
files['assets-index.js'] = 'window.HEXGL_ASSET_INDEX = JSON.parse(' +
  JSON.stringify(JSON.stringify(assetIndex).replace(/</g, '\\u003c')) + ');\n';
{
  const help = read('help.md').trim();
  if (help.length < 400) throw new Error('help.md is too short');
  files['help.md'] = help;
}
files[CREDITS_PATH] = creditsJson('hexgl');
for (const [n, b] of Object.entries(assetFiles)) files[n] = b;

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('style.css');
if (!html.includes('id="touch"')) throw new Error('touch overlay');
if (!html.includes('id="t-steer"')) throw new Error('steer pad');
if (!html.includes('id="t-go"')) throw new Error('GO');
if (/type=["']module["']/.test(html)) throw new Error('no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('external URL in html');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html) || /id=["']invite/i.test(html)) throw new Error('Invite is OS chrome');

if (manifest.minBuild !== 1314) throw new Error('minBuild must be 1314 — capabilities.fullscreen (assets already need 1206)');
if (manifest.appId !== 'hexgl') throw new Error('appId');
if (!manifest.capabilities || manifest.capabilities.db !== true || manifest.capabilities.multiplayer !== true) {
  throw new Error('db + multiplayer required');
}
if (manifest.capabilities.network) throw new Error('no network');
if (manifest.data.prefs.visibility !== 'private') throw new Error('prefs private');
if (manifest.data.players.visibility !== 'read-write') throw new Error('players read-write');

const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'CDN', 'Three.js', 'WebGL']) {
  if (listingBlob.includes(bad)) throw new Error('listing.json mentions ' + bad);
}
if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('blessed false');
if (listing.basedOn.name !== 'HexGL') throw new Error('basedOn.name');
if (listing.basedOn.url !== 'https://github.com/BKcore/HexGL') throw new Error('basedOn.url');
if (!listing.author || listing.author.name !== 'Thibaut Despoulain' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is Thibaut Despoulain');
}
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter');
if (listing.license !== 'MIT') throw new Error('license');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/hexgl') throw new Error('homepage');
if (!/offline/i.test(listing.tagline) && !/GIF/i.test(listing.tagline)) {
  throw new Error('tagline must sell the GifOS reason');
}

if (!files['boot.js'].includes("db('prefs')")) throw new Error('prefs save');
if (!files['net.js'].includes('Invite')) throw new Error('net mentions Invite');
if (!files['patch.js'].includes('HEXGL_URLS')) throw new Error('loader patch');
if (!files['vendor/three.js'].includes('REVISION:"50dev"') && !files['vendor/three.js'].includes("REVISION:'50dev'")) {
  throw new Error('Three.js pin must be r50dev');
}
if (!files['COPYING-hexgl.txt'].includes('Thibaut Despoulain')) throw new Error('COPYING-hexgl');

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
}

let srcdocBytes = 0;
for (const [n, s] of Object.entries(files)) {
  if (n.startsWith('.assets/')) continue;
  srcdocBytes += typeof s === 'string' ? Buffer.byteLength(s) : s.length;
}
if (srcdocBytes > 4 * 1024 * 1024) {
  throw new Error('app document too heavy: ' + srcdocBytes + ' bytes — textures must ride .assets/');
}
const assetBytes = Object.values(assetFiles).reduce((s, b) => s + b.length, 0);
console.log('app document', (srcdocBytes / 1048576).toFixed(2), 'MB; .assets/',
  Object.keys(assetFiles).length, 'files,', (assetBytes / 1048576).toFixed(1), 'MB');

const shot = screenshotPng();
if (shot[0] !== 0x89 || shot[1] !== 0x50) throw new Error('screenshot is not a PNG');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: hexglIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'hexgl', 'hexgl.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/hexgl/hexgl.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
