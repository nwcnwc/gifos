import { mermaidIcon, screenshotPng } from './icon.mjs';
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
const JS_SHA = '8d607d7ef1d077a8aa202e18e62212bfa992c68bfeabc5cf45d51a128fe6675d';

for (const need of ['vendor/mermaid.min.js', 'vendor/COPYING-mermaid.txt', 'vendor/UPSTREAM.txt']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
const mermaidBuf = readFileSync(join(dir, 'vendor/mermaid.min.js'));
{
  const hex = createHash('sha256').update(mermaidBuf).digest('hex');
  if (hex !== JS_SHA) throw new Error('mermaid.min.js sha256 ' + hex + ' ≠ pin');
}
if (/<\/script/i.test(mermaidBuf.toString('utf8'))) throw new Error('</script in mermaid.min.js');
if (!mermaidBuf.toString('utf8').includes('ZM.mermaid=Dg()')) throw new Error('mermaid UMD global missing');

if (manifest.minBuild !== 947 || manifest.appId !== 'mermaid') throw new Error('manifest');
if (!manifest.capabilities.db || !manifest.capabilities.multiplayer) throw new Error('caps');
if (manifest.capabilities.network) throw new Error('no network');
if (listing.basedOn.blessed !== false || listing.basedOn.name !== 'mermaid') throw new Error('basedOn');
if (listing.basedOn.url !== 'https://github.com/mermaid-js/mermaid') throw new Error('basedOn.url is the engine, not the live editor');
if (listing.author.name !== 'mermaid-js' || listing.porter.name !== 'GifOS') throw new Error('author');
if (listing.license !== 'MIT' || listing.categories[0] !== 'Productivity') throw new Error('meta');
if (listing.releaseDate !== '2026-08-24') throw new Error('date');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/mermaid') throw new Error('homepage');
if (!listing.description.includes('unofficial wrap')) throw new Error('listing must say unofficial wrap');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebGL', 'CDN', 'SvelteKit', 'IIFE']) {
  if (listingBlob.includes(bad)) throw new Error('listing ' + bad);
}

const SCRIPTS = ['vendor/mermaid.min.js', 'app.js', 'mp.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/mermaid.min.js': mermaidBuf.toString('utf8'),
  'app.js': read('app.js'),
  'mp.js': read('mp.js'),
  'COPYING-mermaid.txt': read('vendor/COPYING-mermaid.txt'),
  'UPSTREAM.txt': read('vendor/UPSTREAM.txt'),
};
{
  const helpMd = read('help.md').trim();
  if (helpMd.length < 400) throw new Error('help.md too short');
  files['help.md'] = helpMd;
}
const html = files['index.html'];
for (const s of SCRIPTS) if (!html.includes('src="' + s + '"')) throw new Error('missing ' + s);
if (/type=["']module["']/.test(html)) throw new Error('no type=module');
if (/https?:\/\//i.test(html.replace(/<!--[\s\S]*?-->/g, ''))) throw new Error('external URL');
if (/<button\b[^>]*>\s*Invite\s*</i.test(html)) throw new Error('Invite is OS chrome');
if (!files['mp.js'].includes('Invite') || !files['app.js'].includes("db('save')")) throw new Error('Invite/save');
if (!files['COPYING-mermaid.txt'].includes('Knut Sveidqvist')) throw new Error('COPYING');
if (!files['app.js'].includes('htmlLabels: false')) throw new Error('htmlLabels must be off');

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' </script');
  if (n.startsWith('vendor/')) continue;
  if (/^\s*import\s|export\{|import\.meta/m.test(s)) throw new Error(n + ' ESM');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}

const shot = screenshotPng();
if (shot[0] !== 0x89) throw new Error('screenshot');
writeFileSync(join(dir, 'screenshot.png'), shot);
const bytes = await gif.encode(files, { preview: mermaidIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'mermaid', 'mermaid.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/mermaid/mermaid.gif —', (bytes.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
