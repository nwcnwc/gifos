import { lrcMakerIcon, screenshotPng } from './icon.mjs';
import { createHash } from 'node:crypto';
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
const manifest = JSON.parse(read('manifest.json'));
const listing = JSON.parse(read('listing.json'));
const JS_SHA = '81238094b41d0c42a6ab46d2d7c1873ba365714197f460de9ba1ae0cc379fbb5';

for (const need of ['vendor/lrc-parser.js', 'vendor/COPYING-lrc-parser.txt', 'vendor/COPYING-lrc-maker.txt', 'vendor/UPSTREAM.txt']) {
  if (!existsSync(join(dir, need))) throw new Error(need + ' is missing');
}
{
  const buf = readFileSync(join(dir, 'vendor/lrc-parser.js'));
  const hex = createHash('sha256').update(buf).digest('hex');
  if (hex !== JS_SHA) throw new Error('lrc-parser.js sha256 ' + hex + ' ≠ pin');
}
if (manifest.minBuild !== 947 || manifest.appId !== 'lrc-maker') throw new Error('manifest');
if (!manifest.capabilities.db || !manifest.capabilities.multiplayer) throw new Error('caps');
if (manifest.capabilities.network) throw new Error('no network');
if (listing.basedOn.blessed !== false || listing.basedOn.name !== 'lrc-maker') throw new Error('basedOn');
if (listing.author.name !== 'magic-akari' || listing.porter.name !== 'GifOS') throw new Error('author');
if (listing.license !== 'MIT' || listing.categories[0] !== 'Creativity') throw new Error('meta');
if (listing.releaseDate !== '2026-08-24') throw new Error('date');
if (listing.homepage !== 'https://github.com/nwcnwc/gifos/tree/main/apps/lrc-maker') throw new Error('homepage');
const listingBlob = JSON.stringify(listing);
for (const bad of ['gifos.db', 'WASM', 'sandbox', 'connect-src', 'localStorage', 'WebGL', 'CDN', 'React']) {
  if (listingBlob.includes(bad)) throw new Error('listing ' + bad);
}

const SCRIPTS = ['vendor/lrc-parser.js', 'app.js', 'mp.js'];
const files = {
  'manifest.json': JSON.stringify(manifest),
  'index.html': read('index.html'),
  'style.css': read('style.css'),
  'vendor/lrc-parser.js': read('vendor/lrc-parser.js'),
  'app.js': read('app.js'),
  'mp.js': read('mp.js'),
  'COPYING-lrc-parser.txt': read('vendor/COPYING-lrc-parser.txt'),
  'COPYING-lrc-maker.txt': read('vendor/COPYING-lrc-maker.txt'),
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
if (!files['COPYING-lrc-maker.txt'].includes('阿卡琳')) throw new Error('COPYING');

for (const [n, s] of Object.entries(files)) {
  if (typeof s !== 'string' || !n.endsWith('.js')) continue;
  if (/<\/script/i.test(s)) throw new Error(n + ' </script');
  if (n.startsWith('vendor/')) continue;
  if (/^\s*import\s|export\{|import\.meta/m.test(s)) throw new Error(n + ' ESM');
  for (const bad of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'navigator.sendBeacon', 'eval(', 'new Function(']) {
    if (s.includes(bad)) throw new Error(n + ' uses ' + bad);
  }
}

{
  const ctx = { console, Math, Map, Number, Intl, isFinite };
  ctx.globalThis = ctx;
  vm.runInNewContext(files['vendor/lrc-parser.js'] + '\n' +
    'result = (function () {\n' +
    '  var P = lrcParser;\n' +
    '  var st = P.parser("[00:01.00]Hello\\nWorld");\n' +
    '  if (st.lyric.length !== 2) throw new Error("parse " + st.lyric.length);\n' +
    '  if (st.lyric[0].time !== 1) throw new Error("time " + st.lyric[0].time);\n' +
    '  var out = P.stringify({ info: new Map(), lyric: st.lyric }, { spaceStart: 0, spaceEnd: 0, fixed: 2, endOfLine: "\\n" });\n' +
    '  if (out.indexOf("[00:01.00]Hello") < 0) throw new Error("stringify " + out);\n' +
    '  var tag = P.convertTimeToTag(65.5, 2, true);\n' +
    '  if (tag.indexOf("[01:05.50]") < 0) throw new Error("tag " + tag);\n' +
    '  return tag;\n' +
    '})();', ctx);
  console.log('LRC parser roundtrip ok —', ctx.result);
}

const shot = screenshotPng();
if (shot[0] !== 0x89) throw new Error('screenshot');
writeFileSync(join(dir, 'screenshot.png'), shot);
const bytes = await gif.encode(files, { preview: lrcMakerIcon(), accent: manifest.accent });
const out = join(dir, '..', '..', 'site', 'apps', 'lrc-maker', 'lrc-maker.gif');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, bytes);
console.log('wrote site/apps/lrc-maker/lrc-maker.gif —', (bytes.length / 1024).toFixed(0), 'KB');
console.log('catalog is owned elsewhere — do not run build-app-catalog.mjs from this tree');
