// Pack apps/carbon/ into site/apps/carbon/carbon.gif.
import { carbonIcon, screenshotPng } from './icon.mjs';
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
        throw new Error('unsupported format ' + format);
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

for (const need of [
  'vendor/themes.js', 'vendor/syntax.js',
  'vendor/COPYING-carbon.txt', 'vendor/UPSTREAM.txt',
  'vendor/fonts/hack-regular.woff2', 'vendor/fonts/hack-italic.woff2',
  'vendor/fonts/COPYING-hack.txt',
  'COPYING-carbon.txt', 'help.md', 'app.js', 'net.js', 'style.css', 'index.html'
]) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}

function fontDataUrl(rel) {
  const buf = bin(rel);
  if (buf[0] !== 0x77 || buf[1] !== 0x4f || buf[2] !== 0x46 || buf[3] !== 0x32) {
    throw new Error(rel + ' is not woff2');
  }
  return 'url("data:font/woff2;base64,' + buf.toString('base64') + '")';
}

if (manifest.minBuild !== 947 || manifest.appId !== 'carbon') throw new Error('manifest');
if (!manifest.capabilities.db || !manifest.capabilities.multiplayer) throw new Error('caps');
if (manifest.capabilities.network) throw new Error('no network');
if (!manifest.data.save || manifest.data.save.visibility !== 'private') throw new Error('save private');
if (!manifest.data.recents || manifest.data.recents.visibility !== 'private') throw new Error('recents private');
if (!manifest.data.room || manifest.data.room.visibility !== 'read-write') throw new Error('room read-write');
if (listing.basedOn.blessed !== false || listing.basedOn.name !== 'Carbon') throw new Error('basedOn');
if (listing.basedOn.url !== 'https://github.com/carbon-app/carbon') throw new Error('basedOn.url');
if (listing.author.name !== 'Carbon' || listing.porter.name !== 'GifOS') throw new Error('author');
if (listing.license !== 'MIT') throw new Error('license');
if (!listing.homepage.includes('/apps/carbon')) throw new Error('homepage');
if (!listing.description.toLowerCase().includes('no account')) throw new Error('listing must lead with no account');
if (!listing.description.includes('Invite')) throw new Error('listing invite');
if (!listing.description.toLowerCase().includes('unofficial')) throw new Error('unofficial');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'CDN']) {
  if (listingBlob.includes(bad)) throw new Error('listing ' + bad);
}

const themes = read('vendor/themes.js');
if (!themes.includes("id: 'seti'") || !themes.includes('pluckDeep')) throw new Error('themes missing seti/default');
const syntax = read('vendor/syntax.js');
if (!syntax.includes('tokenize') || !syntax.includes('javascript')) throw new Error('syntax');
const app = read('app.js');
if (!app.includes("db('save')") || !app.includes('drawExport')) throw new Error('save/export');
if (/ui-monospace|Liberation Mono|Menlo/.test(app)) throw new Error('PNG must draw Hack, not system mono');
if (!app.includes("var FONT = 'Hack'")) throw new Error('canvas font is Hack');
if (!app.includes("px ' + FONT") && !app.includes('px Hack')) throw new Error('drawExport must use FONT');
const net = read('net.js');
if (!net.includes("db('room')") || !net.includes('Invite')) throw new Error('net');
if (!net.includes('if (owner) publish()')) throw new Error('guest join must not overwrite the host snippet');
if (/<button\b[^>]*>\s*Invite\s*</i.test(read('index.html'))) throw new Error('Invite is OS chrome');
const htmlSrc = read('index.html');
if ((htmlSrc.match(/id="chrome"/g) || []).length !== 1) throw new Error('id=chrome must be the window bar only');
if (!htmlSrc.includes('id="winChrome"')) throw new Error('window-controls checkbox is winChrome');

let css = read('style.css');
if (!css.includes('font-family: Hack')) throw new Error('window must use Hack');
if (/ui-monospace|Liberation Mono|Menlo/.test(css)) throw new Error('CSS still names a system mono');
if (!css.includes('url("vendor/fonts/hack-regular.woff2")')) throw new Error('regular Hack face');
if (!css.includes('url("vendor/fonts/hack-italic.woff2")')) throw new Error('italic Hack face');
css = css.replace(/url\("vendor\/fonts\/([^"]+)"\)/g, (_, n) => fontDataUrl('vendor/fonts/' + n));
if (css.includes('vendor/fonts/')) throw new Error('CSS still has a relative font url');
if (!css.includes('data:font/woff2;base64,')) throw new Error('Hack must be a data URL (CSP font-src data:)');

const hackNotice = read('vendor/fonts/COPYING-hack.txt');
if (!hackNotice.includes('Source Foundry Authors')) throw new Error('COPYING-hack missing Source Foundry');
if (!hackNotice.includes('BITSTREAM VERA LICENSE')) throw new Error('COPYING-hack missing Bitstream Vera');

const SCRIPTS = ['vendor/themes.js', 'vendor/syntax.js', 'net.js', 'app.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': htmlSrc,
  'style.css': css,
  'vendor/themes.js': themes,
  'vendor/syntax.js': syntax,
  'net.js': net,
  'app.js': app,
  'COPYING-carbon.txt': read('COPYING-carbon.txt'),
  'COPYING-hack.txt': hackNotice,
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
  'vendor/fonts/hack-regular.woff2': bin('vendor/fonts/hack-regular.woff2'),
  'vendor/fonts/hack-italic.woff2': bin('vendor/fonts/hack-italic.woff2'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short');
  if (/gifos\.db|sandbox|connect-src|localStorage/i.test(helpMd)) throw new Error('help internals');
  files['help.md'] = helpMd;
}
const html = files['index.html'];
for (const s of SCRIPTS) if (!html.includes('src="' + s + '"')) throw new Error('missing ' + s);
if (!html.includes('href="style.css"')) throw new Error('style');
if (/type=["']module["']/.test(html)) throw new Error('no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('external URL');
if (!html.includes('btnExport') || !html.includes('swatches')) throw new Error('toolbar');

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' </script');
  if (/^\s*import\s|export\{|import\.meta/m.test(s)) throw new Error(n + ' ESM');
  if (n.startsWith('vendor/')) continue;
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
  for (const bad of ['googleapis', 'gstatic', 'cdnjs', 'jsdelivr', 'font-hack']) {
    if (s.includes(bad)) throw new Error(n + ' CDN ' + bad);
  }
}
if (/googleapis|gstatic|cdnjs|jsdelivr|font-hack/.test(css + html)) {
  throw new Error('webfont CDN');
}
if (!files['COPYING-carbon.txt'].includes('Copyright (c) 2022 Carbon')) throw new Error('COPYING');

const shot = screenshotPng();
if (shot[0] !== 0x89) throw new Error('screenshot');
writeFileSync(join(dir, 'screenshot.png'), shot);

const bytes = await gif.encode(files, { preview: carbonIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'carbon', 'carbon.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/carbon/carbon.gif —', (bytes.length / 1024).toFixed(0), 'KB, from',
            Object.keys(files).length, 'files');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
