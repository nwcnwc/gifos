// Pack apps/evolution-of-trust/ into site/apps/evolution-of-trust/evolution-of-trust.gif
import { trustIcon, screenshotPng } from './icon.mjs';
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

for (const need of [
  'vendor/LICENSE', 'vendor/UPSTREAM.txt', 'vendor/words.html',
  'vendor/js/main.js', 'vendor/js/lib/pixi.min.js', 'vendor/css/slides.css',
  'vendor/assets/sounds/bg_music.mp3', 'vendor/assets/sounds/button1.wav',
  'boot.js', 'net.js', 'fetch-hook.js', 'help.md', 'COPYING.txt',
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' missing');
}

function walk(rel, acc) {
  const abs = join(dir, rel);
  for (const name of readdirSync(abs)) {
    if (name === '.' || name === '..') continue;
    const p = posix.join(rel, name);
    const st = statSync(join(dir, p));
    if (st.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const assetFiles = {};
const assetIndex = {};
for (const p of walk('vendor/assets', [])) {
  const key = p.replace(/^vendor\//, '');
  const bin = readBin(p);
  assetFiles['.assets/' + key] = bin;
  assetIndex[key] = bin.length;
}
if (Object.keys(assetIndex).length < 40) throw new Error('too few assets ' + Object.keys(assetIndex).length);
if (!assetIndex['assets/sounds/bg_music.mp3']) throw new Error('missing bg_music');
if (!assetIndex['assets/sounds/button1.wav']) throw new Error('NC button samples must be replaced with wav');
if (assetIndex['assets/sounds/button1.mp3']) throw new Error('do not ship Owdeo CC BY-NC button1.mp3');
if (assetIndex['assets/sounds/machine_start.mp3']) throw new Error('do not ship CC Sampling+ machine_start.mp3');

const fontB64 = readBin('vendor/css/FuturaHandwritten.ttf').toString('base64');
const slidesCss = read('vendor/css/slides.css')
  .replace(/url\(['"]?FuturaHandwritten\.ttf['"]?\)/g,
    'url(data:font/ttf;base64,' + fontB64 + ')');
if (!slidesCss.includes('data:font/ttf')) throw new Error('font not inlined');

function notesBody() {
  const html = read('vendor/notes/index.html');
  const m = html.match(/<div id="notes">([\s\S]*?)<\/div>\s*<\/body>/i);
  let body = m ? m[1] : html;
  body = body.replace(/<link[\s\S]*?>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '');
  return body.trim();
}

function jsString(name, value) {
  return 'window.' + name + ' = ' + JSON.stringify(value) + ';\n';
}

const SCRIPTS = [
  'fetch-hook.js',
  'words-data.js',
  'notes-data.js',
  'assets-index.js',
  'vendor/js/lib/helpers.js',
  'vendor/js/lib/pegasus.js',
  'vendor/js/lib/minpubsub.src.js',
  'vendor/js/lib/q.js',
  'vendor/js/lib/pixi.min.js',
  'vendor/js/lib/howler.js',
  'vendor/js/lib/tweenjs-0.6.2.min.js',
  'vendor/js/core/Loader.js',
  'vendor/js/core/Slideshow.js',
  'vendor/js/core/SlideSelect.js',
  'vendor/js/core/Button.js',
  'vendor/js/core/TextBox.js',
  'vendor/js/core/Words.js',
  'vendor/js/core/IncDecNumber.js',
  'vendor/js/core/Slider.js',
  'vendor/js/core/Scratcher.js',
  'vendor/js/core/Background.js',
  'vendor/js/core/ImageBox.js',
  'vendor/js/core/PayoffsUI.js',
  'vendor/js/sims/Splash.js',
  'vendor/js/sims/PD.js',
  'vendor/js/sims/Iterated.js',
  'vendor/js/sims/Tournament.js',
  'vendor/js/sims/SandboxUI.js',
  'vendor/js/slides/0_Slides_Intro.js',
  'vendor/js/slides/1_Slides_OneOff.js',
  'vendor/js/slides/2_Slides_Iterated.js',
  'vendor/js/slides/3_Slides_Tournament.js',
  'vendor/js/slides/4_Slides_Evolution.js',
  'vendor/js/slides/5_Slides_Distrust.js',
  'vendor/js/slides/6_Slides_Noise.js',
  'vendor/js/slides/7_Slides_Sandbox.js',
  'vendor/js/slides/8_Slides_Conclusion.js',
  'vendor/js/slides/9_Slides_Credits.js',
  'vendor/js/main.js',
  'net.js',
  'boot.js',
];

const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/css/slides.css': slidesCss,
  'vendor/css/balloon.css': read('vendor/css/balloon.css'),
  'COPYING.txt': read('COPYING.txt'),
  'COPYING-cc0.txt': read('vendor/LICENSE'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
  'words-data.js': jsString('TRUST_WORDS_HTML', read('vendor/words.html')),
  'notes-data.js': jsString('TRUST_NOTES_HTML', notesBody()),
  'assets-index.js': jsString('TRUST_ASSET_INDEX', assetIndex),
};
for (const s of SCRIPTS) {
  if (s === 'words-data.js' || s === 'notes-data.js' || s === 'assets-index.js') continue;
  files[s] = read(s);
}
{
  const help = read('help.md').replace(/^\uFEFF/, '').trim();
  if (help.length < 400) throw new Error('help.md too short (' + help.length + ')');
  files['help.md'] = help;
}
files[CREDITS_PATH] = creditsJson(listing, 'evolution-of-trust');
for (const [n, b] of Object.entries(assetFiles)) files[n] = b;

const html = files['index.html'];
for (const s of SCRIPTS) {
  if (!html.includes('src="' + s + '"')) throw new Error('index.html does not load ' + s);
}
if (!html.includes('href="style.css"')) throw new Error('style.css');
if (!html.includes('href="vendor/css/slides.css"')) throw new Error('slides.css');
if (!html.includes('id="trust-boot"')) throw new Error('boot gauge');
if (!html.includes('id="notes-overlay"')) throw new Error('notes overlay');
if (!html.includes('id="watch-banner"')) throw new Error('watch banner');
if (/type=["']module["']/.test(html)) throw new Error('no type=module');
if (/<sharing\b/i.test(html)) throw new Error('sharing widget is OS Invite');
if (/>\s*Invite\s*</.test(html) || /id=["']invite/i.test(html)) throw new Error('Invite is OS chrome');
if (/js\/lib\/sharing\.js/.test(html)) throw new Error('do not load sharing.js');

if (manifest.minBuild !== 2154) throw new Error('minBuild 2154 — capabilities.links (assets already need 1206)');
if (manifest.appId !== 'evolution-of-trust') throw new Error('appId');
if (!manifest.capabilities || manifest.capabilities.db !== true) throw new Error('db');
if (!manifest.capabilities.multiplayer) throw new Error('multiplayer');
if (!manifest.capabilities.links) throw new Error('links — credits open ncase.me');
if (manifest.capabilities.network) throw new Error('no network');
if (!manifest.data.progress || manifest.data.progress.visibility !== 'private') throw new Error('progress private');
if (!manifest.data.play || manifest.data.play.visibility !== 'read-only') throw new Error('play read-only');
if (!manifest.data.watchers || manifest.data.watchers.visibility !== 'read-write') throw new Error('watchers');

if (!listing.basedOn || listing.basedOn.blessed !== false) throw new Error('blessed');
if (listing.basedOn.name !== 'The Evolution of Trust') throw new Error('basedOn.name');
if (listing.basedOn.url !== 'https://github.com/ncase/trust') throw new Error('basedOn.url');
if (!listing.author || listing.author.name !== 'Nicky Case' || /gifos/i.test(listing.author.name)) {
  throw new Error('author is Nicky Case');
}
if (!listing.porter || listing.porter.name !== 'GifOS') throw new Error('porter');
if (listing.license !== 'CC0-1.0') throw new Error('license');
if (listing.releaseDate !== '2026-08-30') throw new Error('date');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/evolution-of-trust') {
  throw new Error('homepage');
}
if (!listing.categories || listing.categories[0] !== 'Games') throw new Error('Games');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebRTC', 'PIXI']) {
  if (listingBlob.includes(bad)) throw new Error('listing mentions ' + bad);
}

if (!files['boot.js'].includes("db('progress')")) throw new Error('chapter save');
if (!files['boot.js'].includes('onBack')) throw new Error('onBack');
if (!files['boot.js'].includes('gifos.assets')) throw new Error('assets load');
if (!files['net.js'].includes("db('play')")) throw new Error('play collection');
if (!files['net.js'].includes('TRUST.seed')) throw new Error('shared seed');
if (!files['fetch-hook.js'].includes('TRUST.land')) throw new Error('fetch-hook land');
if (!files['vendor/js/core/Loader.js'].includes('mp3|wav')) throw new Error('Loader wav');
if (files['vendor/js/core/Button.js'].includes('button1.mp3')) throw new Error('button mp3 still referenced');

for (const [n, s] of Object.entries(files)) {
  if (!n.endsWith('.js')) continue;
  if (typeof s !== 'string') continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' contains </script');
}

let srcdocBytes = 0;
for (const [n, s] of Object.entries(files)) {
  if (n.startsWith('.assets/')) continue;
  srcdocBytes += typeof s === 'string' ? Buffer.byteLength(s) : s.length;
}
if (srcdocBytes > 3 * 1024 * 1024) {
  throw new Error('app document too heavy: ' + srcdocBytes + ' bytes — art must ride .assets/');
}

const shot = screenshotPng();
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: trustIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'evolution-of-trust', 'evolution-of-trust.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
const assetBytes = Object.values(assetFiles).reduce((s, b) => s + b.length, 0);
console.log('wrote site/apps/evolution-of-trust/evolution-of-trust.gif —',
  (bytes.length / 1024).toFixed(0), 'KB, from', Object.keys(files).length, 'files');
console.log('app document', (srcdocBytes / 1048576).toFixed(2), 'MB; .assets/',
  Object.keys(assetFiles).length, 'files,', (assetBytes / 1048576).toFixed(1), 'MB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
